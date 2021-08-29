## SvelteKit Adapter for Cloudfare Workers with Auth0

### Installation and SvelteKit Configuration

Install the adapter:

```bash
npm i svelte-kit-adapter-cloudflare-workers-auth0
```

Configure the adapter in `svelte.config.js`, supplying an array
of routes that should be protected by Auth0 authorization.

Each entry in `protectedRoutes` should be in the form of a regular expression.
Each entry is used to generate a `RegExp` and matched against the `pathname` of the request.

```js
import preprocess from 'svelte-preprocess';
import adapter from 'svelte-kit-adapter-cloudflare-workers-auth0';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://github.com/sveltejs/svelte-preprocess
  // for more information about preprocessors
  preprocess: preprocess(),

  kit: {
    // hydrate the <div id="svelte"> element in src/app.html
    target: '#svelte',
    adapter: adapter({
      protectedRoutes: ['/admin(.*)'],
    }),
  },
};

export default config;
```

### Cloudflare configuration

Create a Cloudflare Workers site:

```bash
wrangler init --site my-site-name
```

Entries in the `wrangler.toml` file are required for `[site.bucket]` and `[site.entry-point]`.

`[site.bucket]` should be set to `./build` for the default SvelteKit build process.

This adapter will create your Cloudflare Worker script at publish time, and output
the results in `[site.entry-point]` (defaults to `workers-site`).

_Note:_ Do not place any custom code in `[site.entry-point]` as it will be overwritten at publish time.

Required environment variables:

- `AUTH0_DOMAIN` - Domain for your Auth0 application (must include scheme, e.g. `https`)
- `AUTH0_CLIENT_ID` - Client ID for your Auth0 application
- `AUTH0_CLIENT_SECRET` - Client secret for your Auth0 application (encrypt or use `wrangler secret`)
- `AUTH0_CALLBACK_URL` - Callback URL for your Auth0 application. Must be your worker's base URL with `/auth` as the path.
- `AUTH0_LOGOUT_URL` - Logout URL for your Auth0 application. Must be your worker's base URL with `/logout` as the path.
- `SALT` - A secret string used to encrypt user sub values
  import adapter from 'svelte-kit-adapter-cloudflare-workers-auth0';

#### Cloudflare KV configuration

Create a Cloudflare KV store with the name `AUTH_STORE`.

```
wrangler kv:namespace create AUTH_STORE
```

Copy the output of this command into your `wrangler.toml` file.

Full example with different environments:

```toml
type = "javascript"
account_id = '<ACCOUNT_ID>'
usage_model = ''
compatibility_flags = []

[site]
bucket = './build'
entry-point = './workers-site'

[build]
command = "npm install && npm run build"

[build.upload]
format = "service-worker"

[env.dev]
workers_dev = true
name = '<NAME_OF_DEV_ENV_WORKERS>'
route = 'https://<DEV_ROUTE>.<WORKERS_SUBDOMAIN>.workers.dev/*'
kv-namespaces = [
  { binding = "AUTH_STORE", id = "<OUTPUT_FROM_KV_NAMESPACE_CREATE>" }
]

[env.production]
zone_id = '<OPTIONAL_ZONE_ID>'
name = '<NAME_OF_PROD_ENV_WORKERS>'
route = '<PROD_HOSTNAME>/*'
kv-namespaces = [
  { binding = "AUTH_STORE", id = "<OUTPUT_FROM_KV_NAMESPACE_CREATE>" }
]

# [secrets]
# AUTH0_DOMAIN
# AUTH0_CLIENT_ID
# AUTH0_CLIENT_SECRET
# AUTH0_CALLBACK_URL
# AUTH0_LOGOUT_URL
# SALT
```

See the [Cloudflare documentation](https://developers.cloudflare.com/workers/platform/sites/start-from-existing) for additional information on configuring Cloudflare Workers

### Resources

This adapter is largely a direct copy of [@sveltejs/adapter-cloudflare-workers](https://github.com/sveltejs/kit/tree/master/packages/adapter-cloudflare-workers), with support for authentication and basic authorization on the 'server'-side.

Auth0 support was based on the official [Cloudflare Workers Auth0 tutorial](https://developers.cloudflare.com/workers/tutorials/authorize-users-with-auth0).
