# CHOSEN API gateway

CHOSEN is published through the BC Gov API Services Portal (APS) on gateway **`gw-a88e8`**
("CHOSEN"), on the production APS instance (`api.gov.bc.ca`).

## What's here

| File | What it holds | Who applies it |
|---|---|---|
| `gateway-setup.yaml` | The authorization profile (client credentials, Gold shared IdP), the directory listing and the product | A gateway owner, by hand, with `gwa apply` |
| `scripts/check-client-credentials.mjs` | A one-off check that APS issues and rotates client credentials as CHOSEN expects | A developer, by hand, with the credential-issuing service account |

Kong routes and plugins will be generated per environment and published by CI once the
OpenShift namespaces exist.

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
