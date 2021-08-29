// TODO hardcoding the relative location makes this brittle
import { init, render } from '../output/server/app.js';
import { getAssetFromKV, NotFoundError } from '@cloudflare/kv-asset-handler';
import { authorize, logout, handleRedirect } from './auth0';
import { protectedRoutes } from './runtime';

init();

addEventListener('fetch', (event) => {
  event.respondWith(handle(event));
});

async function handle(event) {
  let request = event.request;
  let response = new Response(null);
  const requestUrl = new URL(request.url);

  try {
    // Determine auth status for the given request
    const [authorized, { authorization, logoutUrl, redirectUrl }] =
      await authorize(event);

    if (authorized && authorization.accessToken) {
      request = new Request(request, {
        headers: {
          Authorization: `Bearer ${authorization.accessToken}`,
        },
      });
    }

    // When Auth0 redirects, it lands at the path <url>/auth
    // TODO: make the path configurable?
    if (requestUrl.pathname === '/auth') {
      const authorizedResponse = await handleRedirect(event);

      if (!authorizedResponse) {
        return new Response('Unauthorized', { status: 401 });
      }

      return new Response(response.body, {
        response,
        ...authorizedResponse,
      });
    }

    // Determine if this is a protected route
    let isProtected = false;

    if (protectedRoutes) {
      isProtected = protectedRoutes.some((routeRegex) => {
        const regexp = new RegExp(routeRegex, 'gi');
        const matches = regexp.exec(requestUrl.pathname);

        return !!matches;
      });
    }

    // If not authorized and attempting to acces a protected route, redirect to Auth0 login
    if (!authorized && isProtected) {
      return Response.redirect(redirectUrl);
    }

    // At this point, we are either authorized or trying to access a non-protected route
    // Start with static assets first
    response = await tryStatic(event);

    // If no static asset exists, fallback to app routes (ssr pages, endpoints)
    if (!response) {
      response = await generateAppResponse(event);
    }

    // If we're authorized and attempting to logout, logout from the app and
    // redirect to Auth0's logout. If not authorized, we let the request
    // pass through so the consuming app can render a `/logout` page.
    // TODO: make the path configurable?
    if (authorized && requestUrl.pathname === '/logout') {
      const { headers } = await logout(event);

      if (headers) {
        const redirect = Response.redirect(logoutUrl);
        response = new Response(response.body, {
          ...redirect,
          headers: {
            ...headers,
            ...Object.fromEntries(redirect.headers),
          },
        });
      }
    }

    return response;
  } catch (e) {
    console.error(
      `Error rendering route: ${JSON.stringify({
        message: e.message || e.toString(),
        stack: e.stack,
      })}`
    );
    return new Response(
      'Error rendering route:' + (e.message || e.toString()),
      { status: 500 }
    );
  }
}

async function tryStatic(event) {
  if (event.request.method == 'GET') {
    try {
      // TODO rather than attempting to get an asset,
      // use the asset manifest to see if it exists
      return await getAssetFromKV(event);
    } catch (e) {
      if (!(e instanceof NotFoundError)) {
        return new Response(
          'Error loading static asset:' + (e.message || e.toString()),
          {
            status: 500,
          }
        );
      }
    }
  }

  return null;
}

async function generateAppResponse(event) {
  const request = event.request;
  const requestUrl = new URL(request.url);

  try {
    const rendered = await render({
      host: requestUrl.host,
      path: requestUrl.pathname,
      query: requestUrl.searchParams,
      rawBody: await read(request),
      headers: Object.fromEntries(request.headers),
      method: request.method,
    });

    if (rendered) {
      return new Response(rendered.body, {
        status: rendered.status,
        headers: rendered.headers,
      });
    }
  } catch (e) {
    return new Response(
      'Error rendering route:' + (e.message || e.toString()),
      { status: 500 }
    );
  }

  return new Response({
    status: 404,
    statusText: 'Not Found',
  });
}

/** @param {Request} request */
async function read(request) {
  return new Uint8Array(await request.arrayBuffer());
}
