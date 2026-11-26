# AGENTS.md: Common Hosted Subscription for Event Notifications (CHOSEN)

Repository facts and conventions for automated coding assistants and the developers reviewing their output. Teams may edit or remove this file.

> **Precedence.** Where this file conflicts with the code, **the code wins**. Say so, and fix this file in the same PR. A stale rule is worse than none, because it gets followed.

## What this is

CHOSEN is a headless, multi-tenant BC Government common service. It manages who is subscribed to which topics, on which channel, and whether they can be contacted. It sends through [Notify](https://github.com/bcgov/common-notify) but is not part of it. The two are built by the same team on the same stack, so follow Notify's patterns where this file doesn't say otherwise.

| Caller | What it does |
|---|---|
| Tenant apps (server-to-server) | Manage topics, subscribe and unsubscribe people, read history |
| Notify | Queries recipients when sending; forwards inbound SMS and delivery events as webhooks |
| The public, through links CHOSEN sends | Confirm, unsubscribe, manage subscriptions on CHOSEN's hosted pages |

Design docs, which are the source of truth until code exists:
- [docs/data-model.md](docs/data-model.md): data model and the decisions behind it
- [docs/openapi.yaml](docs/openapi.yaml): API contract (OpenAPI 3.1)
- [README.md](README.md): opt-out and unsubscribe flows

Status: design phase. The backend still holds the quickstart template's sample `users` module and Flyway schema; both get replaced by the CHOSEN model.

## Layout
- `backend/` (NestJS, TypeORM), `frontend/` (Vite, React, TanStack Router, Caddy), `migrations/` (Flyway SQL in `migrations/sql/`)
- OpenShift templates (not Helm): `common/openshift.init.yml`, `common/openshift.database.yml`, `common/openshift.backup.yml`, `backend/openshift.deploy.yml`, `frontend/openshift.deploy.yml`
- Workflows: `.github/workflows/` (PR deploys via `reusable-deploy.yml`, tests via `reusable-tests.yml`); integration and load tests in `common/tests/`
- HTTP requests: Prefer native `fetch` over Axios for new HTTP requests; use Axios only when native fetch is insufficient (e.g. upload progress tracking, complex interceptors).

## Build, test, run
- Full stack locally: `docker compose up` (optional profiles: `schemaspy`, `caddy`)
- Backend (`cd backend`): `npm ci`, `npm run build`, `npm run lint`, `npm test`, `npm run test:cov`
- Frontend (`cd frontend`): `npm ci`, `npm run build`, `npm run lint`, `npm run test:unit`; e2e: `npx playwright install --with-deps chromium`, then `npx playwright test --project="chromium"`
- Deploys to OpenShift run from GitHub Actions (PR open, merge), not from a workstation

Verification traps:
- **`npm test` is not what CI runs.** It is `vitest --dir src`, so it skips `test/`. CI runs `npm run test:cov`, which covers `src/` and `test/`. A change that breaks the Nest module graph passes `npm test` and fails CI. `test/app.e2e-spec.ts` boots the whole `AppModule` and needs Postgres reachable (`POSTGRES_HOST`/`POSTGRES_PORT`, default `localhost:5432`, user `postgres`, password `default`).
- **`npm run build` is the backend typecheck.** `nest build` runs `tsc` with type checking.
- **Generate lockfiles with CI's npm.** CI uses Node 24 (`node_version` in `analysis.yml`), which ships npm 11. Different npm majors resolve lockfiles differently, and `npm ci` in CI rejects a lockfile it considers out of sync. If one was written by the wrong npm, restore it and rerun `npx npm@11 install --package-lock-only`.

## Shared actions
- Uses bcgov shared actions and workflows (`bcgov/action-*`, `bcgov/actions/*`, `bcgov/actions-openshift/*`, `bcgov/quickstart-openshift-helpers`). Use them as provided; don't copy or fork them.
- Never pin `@main`. Pin bcgov shared actions to a published release SHA with a `# vX.Y.Z` comment.
- Vanity Route TLS (`bcgov/actions-openshift/cert-keeper`) is strictly managed via the standalone workflow `.github/workflows/cert-keeper.yml` (daily schedule and `workflow_dispatch`, runs only when `vars.ROUTE_HOST` is set, uses the `prod` environment). Never embed `cert-keeper` into `pr-open.yml`, `merge.yml`, `release.yml`, or continuous deployment pipelines.

## Settings
- Automated agents must not change repository or organization settings. Settings changes are made by a person on the team with the setup scripts in `scripts/`; agents may run them only without `--apply`, which previews.
- After a repository is created from the template, suggest running `scripts/setup.sh`.

## Runtime: assume many pods

TEST and PROD run the backend as several autoscaled replicas (`HorizontalPodAutoscaler` in `backend/openshift.deploy.yml`). PR environments may run one pod, so a per-pod bug can show up only after merge.

**State that outlives a request does not belong in a process.** A module-level `Map`, a counter, a `setInterval`, an in-memory cache or an "already processed" flag is per-pod and is lost on a rolling deploy. Durable or shared state goes in Postgres. Webhook idempotency (`inbound_message.notify_event_id`) and the pending-subscription expiry are database concerns, not timers.

## Data layer

- **Postgres schema:** CHOSEN objects go in the `chosen` schema. The template's `users` schema is to be removed.
- **Flyway owns the schema.** TypeORM runs with `synchronize: false`; never let it create or alter tables.
- **Migrations:** `migrations/sql/V#.#.#__snake_case_description.sql`, following the existing files.
  - **Forward-only.** Never edit a migration that has been applied anywhere; add a new one.
  - Wrap DDL and seed data in `BEGIN; ... COMMIT;`. Make seeds idempotent (`ON CONFLICT ... DO NOTHING`).
  - **Numbering hazard:** Flyway runs with `outOfOrder=false`. Once a higher version is applied to a long-lived environment, a lower one is rejected forever. When two PRs add migrations at once, whichever merges second renumbers.
- **Conventions (as in Notify):** `snake_case` tables and columns, UUID primary keys, `created_at`/`created_by`/`updated_at`/`updated_by` on mutable tables, and lookup tables (`*_code`) seeded by migrations instead of Postgres enums.
- **Entities** live beside their module (`src/<module>/entities/<name>.entity.ts`) and are registered in `src/database.module.ts`. TypeORM can't infer a column type from a TypeScript enum, so give enum-typed columns an explicit `type: 'varchar'`.
- **Tenant scoping:** every tenant-owned query filters by the caller's tenant. Another tenant's ID returns `404`, never `403`. The only cross-tenant table is `suppression` (rows with `tenant_id` empty).

## Personal data

CHOSEN's whole purpose is holding citizens' contact details, so these rules apply everywhere:

- **Encrypted columns:** addresses, external subject IDs and inbound message bodies are encrypted in the application (AES-256-GCM), with an HMAC-SHA256 lookup hash of the normalised value. See [docs/data-model.md#encryption](docs/data-model.md#encryption). Query by the hash; never add a plain-text copy, a `LIKE` search on addresses, or an index on decrypted values.
- **Normalise before hashing:** E.164 for phone numbers, trimmed and lower-cased for email. A hash of an un-normalised value silently fails to match.
- **Never log addresses or message bodies.** Mask them (`+1250***0123`, `p***n@example.com`) or log IDs and counts.
- **Never commit real recipient data**, including in test fixtures or seed migrations. Use `example.com` addresses and `555` phone numbers.
- **Keys** come from OpenShift secrets or Vault, never from the repo or the database.

## API

- **[docs/openapi.yaml](docs/openapi.yaml) is the contract.** Implement against it, and change it in the same PR as any behaviour change. Swagger decorators in the code must describe the same contract.
- **Every endpoint is exposed.** Tenant apps, Notify, mail clients and the public all call CHOSEN from outside this repo, so a renamed field, a tightened validation rule or a changed status code breaks someone. Prefer additive changes, and never repurpose an existing field.
- **Request bodies are DTO classes with class-validator decorators**, validated by a global `ValidationPipe` with `whitelist` and `forbidNonWhitelisted`, so an undeclared property is a `400`. This isn't wired up yet; add it with the first real endpoint.
- **No endpoint is unprotected by omission.** `ExplicitAuthGuard` (`src/common/guards/`) is registered globally as `APP_GUARD` and rejects, with `401`, any route that is neither `@Public()` nor guarded by at least one guard marked `@AuthenticatesCaller()` (`src/common/decorators/authenticates-caller.decorator.ts`). It checks nothing about the caller; the route's own guards do that. Mark a guard `@AuthenticatesCaller()` only if it verifies a token, API key or signature and rejects when it can't. A feature-flag guard or a rate-limit guard on its own leaves the route rejected. Only `/public/*`, health, metrics and the root are public. The template's `users` sample is also marked `@Public()` until it's removed.
- **Roles** are declared with `@Roles()` (`src/common/decorators/roles.decorator.ts`), as in Notify: `SsoRole` for Keycloak client roles that aren't tied to a tenant, and `CstarRole` for a user's roles in one tenant. `@Roles()` only records metadata, so it must sit beside a `@UseGuards()` guard that enforces it.
- **`ChosenAdminGuard`** enforces SSO roles for CHOSEN-wide routes, such as `/admin/*`. It verifies the BC Gov SSO token (`KeycloakJwtStrategy` in `src/auth/`: signature, expiry, `KEYCLOAK_ISSUER`, `KEYCLOAK_CLIENT_ID`), checks `azp`, then requires one of the `SsoRole`s in `@Roles()`. A route using it with no `SsoRole` refuses everyone. The tenant-scoped guard, which checks CSTAR membership and `CstarRole`s, isn't built yet.
- **Public endpoints:** a `GET` never changes state, because mail scanners open links. Responses must not reveal whether an address is subscribed.
- **Errors** use `application/problem+json` (RFC 9457) with messages that say what went wrong and how to fix it.
- **Document each operation properly:** summary and description, every response status including failures, a realistic example on every property (never `"string"`), and what the endpoint does not do. Keep internals (role names, table names) out of the published spec.

### Integration and auth

The README's "Integration and authentication" section explains the design. These are the rules the code must follow:
- **Services authenticate with OAuth2 client credentials, through Kong.** Tokens come from SSO's `apigw` realm. Kong checks them (`jwt-keycloak`), and **the backend checks them again**: signature, expiry, issuer and audience. Then it looks up the token's `azp` in `api_client`, ignoring revoked rows. An unknown or revoked client ID is `401`, even though Kong let it through.
- **The tenant comes from the `api_client` row, never from the request.** Don't read a tenant ID from the body, query or headers for tenant endpoints. Tenant staff in the UI are the exception: they pick a tenant with `X-Tenant-Id`, and their CSTAR membership of it is checked.
- **Notify is a system client** (`system_role = NOTIFY`). It's the only caller allowed to name a tenant in a request (`/recipients/query`). Tenant clients must never reach Notify-only endpoints, and Notify's client must never reach tenant endpoints.
- **Client secrets are never stored, logged or returned twice.** They come back from the API Services Portal and go straight into the issue or rotate response. Revoking is immediate in CHOSEN; removing the consumer in the portal is manual until APS adds a delete API.
- **Webhooks (`/inbound/*`) need both** Notify's token and a valid HMAC signature over the raw body. Compare signatures in constant time, and reject the request before parsing the body if the signature is wrong.
- **Only Kong and the public-links route can reach the backend.** The network policy admits nothing else. Don't loosen it, and don't add another way in.
- **`/public/*` takes no credentials.** The signed token in the link is the permission, and the route is rate-limited.
- **CHOSEN calls Notify as an ordinary Notify client**, with its own Notify credential held in a secret.
- **People sign in with IDIR** through SSO's `standard` realm (`chosen-6820`). Operators need the `CHOSEN_ADMIN` SSO role (`adminAuth`). Tenant staff need a CSTAR role for the tenant (`tenantUserAuth`); managing credentials needs `CHOSEN_OPERATIONS_ADMIN`.

### Impact on existing callers: always state it

**Every response that makes or reviews a change must say whether it affects existing callers**, under an **Impact on existing callers** heading near the top, even when there is none. If nothing changes, say so and say how you checked. Callers are tenant apps, Notify (recipient queries, webhooks), and links already sent in emails and texts. A changed unsubscribe or confirm URL format breaks links sitting in people's inboxes.

What counts: requests newly rejected or accepted; new required fields; changed defaults; response shape, field names or status codes; who `get_recipients` returns; webhook handling; URL or token formats; auth; migrations that rewrite existing rows.

## Configuration

**Define every new backend environment variable in OpenShift, in every environment** (DEV, which PR environments share, TEST and PROD), in the change that introduces it. A code default is a safety net for local runs and tests, not the production setting. Secrets go in that namespace's secret; non-sensitive tunables are set explicitly too. Secrets aren't in the repo, so list each variable and its value per environment in the PR description. Add local values to `docker-compose.yml` if the local stack needs them.

## Programming standards

- **No new `any`.** Type every parameter, return value, DTO and response. Use `unknown` plus narrowing for genuinely dynamic values. The backend uses regular imports for classes, not `import type`, because Nest dependency injection needs runtime class references.
- **No `console.log` in `src/`.** Use Nest's `Logger`. `console.error`/`console.warn` only in genuine error paths.
- **Cognitive Complexity of 15 or less per function** (SonarCloud rule S3776, checked only in CI). Nesting drives the score: return early, use a `switch` or lookup map instead of `if`/`else if` chains, and pull loop bodies into named helpers. **Moving code makes it new code** to Sonar, so fix a complex function's score when you move it.
- **Comments say why, not what**, and describe the code as it is. History ("changed from", "used to") belongs in the commit message. Keep them to a line or two, longer only for a genuine trap.
- **Reusable services over duplicated logic**; reusable React components over one-off markup.
- **Frontend (hosted pages):** WCAG 2.1 AA is part of done, not a follow-up. Use `@bcgov/design-system-react-components` before hand-rolled controls, and SCSS variables for styling.

### Naming

| Thing | Convention |
|---|---|
| Backend files | `kebab-case.type.ts`, e.g. `subscription.service.ts`, `topic.entity.ts` |
| DTOs | `dto/verb-noun.dto.ts` |
| Frontend files | `PascalCase.tsx` for components and pages, `camelCase.ts` for utilities |
| Migrations | `V#.#.#__snake_case_description.sql` |
| Tests | `*.spec.ts(x)` beside the code; whole-app tests in `backend/test/` |

## Testing

- **Test behaviour, not implementation.** Frontend: query by role, label and text, never a CSS class.
- **Mock at the boundary:** TypeORM repositories (`getRepositoryToken(Entity)`), the Notify client, HTTP. Never mock the unit under test.
- **Cover failure paths:** validation errors, another tenant's ID (`404`), suppressed recipients, expired and reused tokens, repeated webhooks.
- **Recipient matching needs a real database test.** Filter matching, suppression and tenant scoping are SQL; a mocked repository can't prove them.

## Recipes

### Add an endpoint
1. Add or update the operation in `docs/openapi.yaml` first.
2. DTO in `src/<module>/dto/` with class-validator and `@ApiProperty` decorators.
3. Controller method with the right guard; logic in the service, not the controller.
4. Tests: happy path, validation failure, authorization failure, another tenant's data.

### Add a database change
1. Next free Flyway version (check open PRs for the numbering hazard).
2. `BEGIN; ... COMMIT;`, idempotent seeds, forward-only.
3. Add or update the TypeORM entity and any DTO exposing the field; update `docs/data-model.md`.
4. Run the migrations locally and check with a query.

## Definition of done

1. Tests pass. You **ran** them (`npm run test:cov` for the backend), and pasted real output if anything failed. If you believe a test is wrong, say so rather than quietly editing it.
2. Lint and build pass for every app you touched.
3. New behaviour has tests, including failure paths.
4. No new `any`, no `console.log`, no logged personal data.
5. `docs/openapi.yaml` and `docs/data-model.md` updated if the contract or schema changed; a migration added if the schema changed.
6. New environment variables defined in OpenShift for every environment and listed in the PR.
7. Impact on existing callers stated, even when there is none.
8. Nothing committed or pushed unless you were asked to.

## Working style

- **Read before you edit.** Match the surrounding naming, comment density and idiom.
- **Verify, don't assert.** "Should work" is not a result. Say which parts you couldn't verify.
- **Don't widen scope.** Fix what was asked; flag adjacent problems instead of silently refactoring them.
- **Prefer deleting to adding.** Remove dead code and stale docs rather than working around them.
- **Report honestly.** If tests fail, show the output. If you skipped part of a task, say which part and why.
