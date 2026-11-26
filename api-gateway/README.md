# CHOSEN API gateway

CHOSEN is published through the BC Gov API Services Portal (APS) on gateway **`gw-a88e8`**
("CHOSEN"), on the production APS instance (`api.gov.bc.ca`).

## What's here

| File | What it holds | Who applies it |
|---|---|---|
| `gateway-setup.yaml` | The authorization profile (client credentials, Gold shared IdP), the directory listing and the product | A gateway owner, by hand, with `gwa apply` |
| `scripts/check-client-credentials.mjs` | A one-off check that APS issues and rotates client credentials as CHOSEN expects | A developer, by hand, with the credential-issuing service account |
| `templates/routes.yaml` | Kong routes and plugins, with `${...}` placeholders | Generated per environment; see below |
| `config/<environment>.env` | The values for each environment: `local`, `pr`, `test`, `prod` | |
| `scripts/generate-routes.mjs` | Fills in the template and writes `generated/` (git-ignored) | CI, Docker Compose, or you |

## Routes

| Route | Paths | Checked by Kong |
|---|---|---|
| `service-api` | `/api/v1/topics`, `subscriptions`, `contacts`, `suppressions`, `audit-events`, `recipients`, `inbound` | A client-credentials token from SSO's `apigw` realm, with the gateway audience. Rate-limited per client. |
| `user-api` | `/api/v1/credentials`, `/api/v1/admin` | A sign-in token from SSO's `standard` realm, for `chosen-6820`. CORS for CHOSEN's frontend. |
| `public` | `/api/v1/public` | Nothing; rate-limited per IP address. CORS for CHOSEN's frontend. |
| `health-and-docs` | `GET /api/health`, `GET /api/docs` | Nothing |

Kong is the only way to the backend, for CHOSEN's own UI too: the browser calls the API at the
gateway's URL, which is why the UI and public routes answer CORS, for `FRONTEND_ORIGINS` only.
Kong is the first check, not the only one: the backend verifies every token again. When a new
endpoint is added under a path that isn't listed, add the path to the right route.

## Generating and publishing

```bash
cd api-gateway && npm ci
npm run check                                   # every environment, into a temporary folder
node scripts/generate-routes.mjs local          # generated/kong-local.yaml, for local Kong
node scripts/generate-routes.mjs pr --prs 12,15 # generated/gw-dev.yaml, every open PR
node scripts/generate-routes.mjs test           # generated/gw-test.yaml
```

- **PR environments** share the dev hostname, each under a `/pr-<number>` prefix that Kong
  removes before the request reaches the backend. Publishing with `--qualifier dev` replaces
  everything under dev, so the dev file always lists every open PR.
- **`LICENSE_PLATE`** in `config/pr.env`, `test.env` and `prod.env` is blank until the
  OpenShift namespaces exist. Generating those environments fails until it's set, rather than
  producing routes that point nowhere.
- **The `API Gateway` workflow** checks the config on every PR that touches `api-gateway/`.
  Publishing is a manual run of the same workflow for now, and needs the `GWA_ACCT` secret.
  Once the namespaces exist, the deploy workflows will publish after each deploy.
- **Locally**, stock Kong has no `jwt-keycloak` plugin, so the local config leaves it out and
  only the backend checks tokens. Rate-limiting uses Kong's local counter instead of Redis.

## Applying the setup

```bash
gwa login
gwa config set gateway gw-a88e8
gwa apply -i api-gateway/gateway-setup.yaml
gwa get products --json      # the dev environment's appId becomes APS_ENVIRONMENT_APP_ID
```

## IDs

| What | ID | Used as |
|---|---|---|
| Gateway | `gw-a88e8` | `APS_GATEWAY_ID`, and part of the token audience |
| Product "CHOSEN API" | `1D60C86DC7FA` | |
| Product environment: dev | `D5C97345` | `APS_ENVIRONMENT_APP_ID` in DEV and PR deployments |

None of these are secret.

## Client credentials check (2026-11-26)

`scripts/check-client-credentials.mjs` was run against the dev environment, and every check
passed:

| Check | Result |
|---|---|
| Issuing returns a client ID, secret and token URL | Yes. `flow: client-credentials`, no `issuer` field. Works while the environment is inactive. |
| Client ID format | `<environment appId>-<application appId>`, e.g. `D5C97345-09B0D41A315` |
| Token URL returned | `https://dev.loginproxy.gov.bc.ca/auth/realms/apigw/protocol/openid-connect/token` |
| Token `iss` | `https://dev.loginproxy.gov.bc.ca/auth/realms/apigw` |
| Token `aud` | `ap-gw-a88e8-default-dev` |
| Token `azp` | The issued client ID, so CHOSEN can find the tenant from it |
| Token lifetime | 300 seconds |
| Regenerating | Keeps the client ID and returns a new secret; the old secret is refused at once and the new one works |

Still open: APS has no API to delete a consumer.

## Environments

| Environment | Hostname | Token issuer | Token audience |
|---|---|---|---|
| dev | `chosen.dev.api.gov.bc.ca` | `https://dev.loginproxy.gov.bc.ca/auth/realms/apigw` | `ap-gw-a88e8-default-dev` |
| test | `chosen.test.api.gov.bc.ca` | `https://test.loginproxy.gov.bc.ca/auth/realms/apigw` | `ap-gw-a88e8-default-test` |
| prod | `chosen.api.gov.bc.ca` | `https://loginproxy.gov.bc.ca/auth/realms/apigw` | `ap-gw-a88e8-default-prod` |

Only dev is in the product so far. It was applied on 2026-11-26 and is inactive until routes are published.

## Service accounts

| Account | Scope | Used by | Stored in |
|---|---|---|---|
| Credential issuing | `CredentialIssuer.Generate` | CHOSEN's backend, to issue and rotate tenants' credentials | The `chosen-aps` OpenShift secret, one per namespace, with its own account in each |
| CI publishing | `GatewayConfig.Publish` | GitHub Actions, to publish routes and plugins | The GitHub secret `GWA_ACCT` |

The resources in `gateway-setup.yaml` need wider permissions than either account has,
which is why a gateway owner applies them by hand.
