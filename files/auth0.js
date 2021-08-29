import cookie from 'cookie';

// TODO: Figure out how to define this only on the initial publish
// https://developers.cloudflare.com/workers/tutorials/authorize-users-with-auth0#secrets
// let AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_CALLBACK_URL, SALT

const auth0 = {
  domain: AUTH0_DOMAIN,
  clientId: AUTH0_CLIENT_ID,
  clientSecret: AUTH0_CLIENT_SECRET,
  callbackUrl: AUTH0_CALLBACK_URL,
  logoutUrl: AUTH0_LOGOUT_URL,
};
const cookieKey = 'AUTH0-AUTH';
const generateRedirectUrl = (state) =>
  `${auth0.domain}/authorize?response_type=code&client_id=${
    auth0.clientId
  }&redirect_uri=${
    auth0.callbackUrl
  }&scope=openid%20profile%20email&state=${encodeURIComponent(state)}`;
const logoutUrl = `${auth0.domain}/v2/logout?client_id=${auth0.clientId}&returnTo=${auth0.logoutUrl}`;

/**
 * Public API:
 * - authorize: authorizes a given request and returns authorization status
 * - handleRedirect: handles redirects from Auth0 with CSRF protection
 * - logout: removes auth cookie and auth state from the AUTH_STORE Worker KV
 */

// Returns an array with the format
//   [authorized, context]
export const authorize = async (event) => {
  const authorization = await verify(event);

  if (authorization.accessToken) {
    return [true, { authorization, logoutUrl }];
  } else {
    const state = await generateStateParam(event);
    return [false, { redirectUrl: generateRedirectUrl(state) }];
  }
};

export const handleRedirect = async (event) => {
  const url = new URL(event.request.url);
  const state = url.searchParams.get('state');

  if (!state) {
    return null;
  }

  // Protect against CSRF by ensuring the request originated from our app
  const stateData = await AUTH_STORE.get(`state-${state}`);

  if (!stateData) {
    return null;
  }

  const storedState = JSON.parse(stateData);
  const code = url.searchParams.get('code');
  const originalPath = storedState.originalPath;

  if (code) {
    return exchangeCodeAndRedirect(code, originalPath);
  }

  return {};
};

export const logout = async (event) => {
  const sub = getAuthCookieValue(event);

  if (sub) {
    await AUTH_STORE.delete(sub);

    return {
      headers: {
        'Set-cookie': `${cookieKey}=""; SameSite=Lax; Secure;`,
      },
    };
  }

  return {};
};

const verify = async (event) => {
  const sub = getAuthCookieValue(event);

  if (sub) {
    const kvData = await AUTH_STORE.get(sub);

    if (!kvData) {
      throw new Error('Unable to find authorization data');
    }

    let kvStored;
    try {
      kvStored = JSON.parse(kvData);
    } catch (err) {
      throw new Error('Unable to parse auth information from Workers KV');
    }

    const { access_token: accessToken, id_token: idToken } = kvStored;
    const userInfo = JSON.parse(decodeJWT(idToken));

    return { accessToken, idToken, userInfo };
  }

  return {};
};

const getAuthCookieValue = (event) => {
  const cookieHeader = event.request.headers.get('Cookie');
  let sub;

  if (cookieHeader && cookieHeader.includes(cookieKey)) {
    const cookies = cookie.parse(cookieHeader);
    sub = cookies[cookieKey];
  }

  return sub;
};

const exchangeCodeAndRedirect = async (code, redirectPath) => {
  const body = JSON.stringify({
    grant_type: 'authorization_code',
    client_id: auth0.clientId,
    client_secret: auth0.clientSecret,
    code,
    redirect_uri: auth0.callbackUrl,
  });

  const response = await fetch(auth0.domain + '/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
  const tokenBody = await response.json();

  if (tokenBody.error) {
    throw new Error(body.error);
  }

  return persistAuth(tokenBody, redirectPath);
};

const persistAuth = async (tokenBody, redirectPath = '/') => {
  const decoded = JSON.parse(decodeJWT(tokenBody.id_token));
  const validToken = validateToken(decoded);

  if (!validToken) {
    return { status: 401 };
  }

  const text = new TextEncoder().encode(`${SALT}-${decoded.sub}`);
  const digest = await crypto.subtle.digest({ name: 'SHA-256' }, text);
  const digestArray = new Uint8Array(digest);
  const id = btoa(String.fromCharCode.apply(null, digestArray));
  const date = new Date();
  date.setDate(date.getDate() + 1);

  await AUTH_STORE.put(id, JSON.stringify(tokenBody), {
    expiration: date.getTime() / 1000,
  });

  const headers = {
    Location: redirectPath,
    'Set-cookie': `${cookieKey}=${id}; Secure; HttpOnly; SameSite=Lax; Expires=${date.toUTCString()}`,
  };

  return { headers, status: 302 };
};

// https://github.com/pose/webcrypto-jwt/blob/master/workers-site/index.js
const decodeJWT = function (token) {
  var output = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');

  switch (output.length % 4) {
    case 0:
      break;
    case 2:
      output += '==';
      break;
    case 3:
      output += '=';
      break;
    default:
      throw 'Illegal base64url string!';
  }

  const result = atob(output);

  try {
    return decodeURIComponent(escape(result));
  } catch (err) {
    console.log(err);
    return result;
  }
};

const validateToken = (token) => {
  try {
    const dateInSecs = (d) => Math.ceil(Number(d) / 1000);
    const date = new Date();

    let iss = token.iss;

    // ISS can include a trailing slash but should otherwise be identical to
    // the AUTH0_DOMAIN, so we should remove the trailing slash if it exists
    iss = iss.endsWith('/') ? iss.slice(0, -1) : iss;

    if (iss !== auth0.domain) {
      throw new Error(
        `Token iss value (${iss}) doesn’t match AUTH0_DOMAIN (${auth0.domain})`
      );
    }

    if (token.aud !== auth0.clientId) {
      throw new Error(
        `Token aud value (${token.aud}) doesn’t match AUTH0_CLIENT_ID (${auth0.clientId})`
      );
    }

    if (token.exp < dateInSecs(date)) {
      throw new Error(`Token exp value is before current time`);
    }

    // Token should have been issued within the last day
    date.setDate(date.getDate() - 1);
    if (token.iat < dateInSecs(date)) {
      throw new Error(`Token was issued before one day ago and is now invalid`);
    }

    return true;
  } catch (err) {
    console.log(err.message);
    return false;
  }
};

const generateStateParam = async (event) => {
  const resp = await fetch('https://csprng.xyz/v1/api');
  const { Data: state } = await resp.json();
  const url = new URL(event.request.url);

  await AUTH_STORE.put(
    `state-${state}`,
    JSON.stringify({ originalPath: url.pathname }),
    { expirationTtl: 86400 }
  );

  return state;
};
