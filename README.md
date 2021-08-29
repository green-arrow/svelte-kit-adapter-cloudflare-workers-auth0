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

See the [Cloudflare documentation](https://developers.cloudflare.com/workers/platform/sites/start-from-existing) for additional information on configuring Cloudflare Workers

### Auth State Hydration

Opt in by adding a script to your root HTML page with the ID `edge_auth_state`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="/favicon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />

    %svelte.head%
  </head>
  <body>
    <div id="svelte">%svelte.body%</div>
  </body>

  <!-- OPTIONAL - Adapter is configured to insert user authorization info in a script with this ID -->
  <script id="edge_auth_state" type="application/json">
    {}
  </script>
</html>
```

### Resources

This adapter is largely a direct copy of [@sveltejs/adapter-cloudflare-workers](https://github.com/sveltejs/kit/tree/master/packages/adapter-cloudflare-workers), with support for authentication and basic authorization on the 'server'-side.

Auth0 support was based on the official [Cloudflare Workers Auth0 tutorial](https://developers.cloudflare.com/workers/tutorials/authorize-users-with-auth0).

Full documentation to come soon if folks are interestd in this :smile:
