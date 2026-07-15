---
"@getflute/sdk": patch
---

Fix incorrect default API hosts for both environments.

The `sandbox` and `production` environment defaults pointed at legacy
`*.arise.risewithaurora.com` hosts instead of the documented `flute.com`
endpoints. In particular, `sandbox` pointed at a **decommissioned UAT** host,
so `new Flute({ environment: 'sandbox' })` failed with
`FluteAuthenticationError: HTTP 401` on the first request, during the OAuth
token exchange (`POST ${oauth}/oauth2/token`).

Both environments now default to the official `flute.com` hosts:

- **Sandbox** — `https://sandbox.api.flute.com`,
  `https://sandbox.api.flute.com/pay-int-api`,
  OAuth `https://sandbox.oauth.api.flute.com`
- **Production** — `https://api.flute.com`,
  `https://api.flute.com/pay-int-api`,
  OAuth `https://oauth.api.flute.com`

⚠️ **This also changes the default _production_ endpoints.** If you depended on
the previous `*.arise.risewithaurora.com` production defaults, review before
upgrading. You can always pin any host explicitly via `FluteConfig.baseUrls`.
