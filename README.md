# ctrl-alt-elite-backend
Ctrl Alt Elite Backend

## Customer API (admin)

Customer APIs require a valid login token and the current database role `ADMIN`.
Both `/api/admin/customers` and the existing `/api/customers` URLs are protected,
including their `/{id}` endpoints. The entire `/api/admin` namespace is protected
for all methods, so new endpoints mounted there inherit the authorization check.
Orders and product endpoints are not implemented by this change.

### Authentication and authorization

Set `JWT_SECRET` in the server environment before starting the application.
Use a cryptographically random secret of at least 32 bytes, for example generated
with `openssl rand -hex 32`. Keep it private, out of source control, and stable
across server instances. Missing or short secrets prevent startup. Rotating the
secret invalidates existing tokens. Use HTTPS outside local development.

`POST /api/auth/login` with JSON email and password returns:

```json
{
  "userId": "d397293a-53f9-4c51-aa7a-91f69eb53a75",
  "email": "admin@example.com",
  "role": "ADMIN",
  "token": "<signed-jwt>"
}
```

The frontend must send `Authorization: Bearer <token>` on each customer/admin
request. Tokens expire after one hour; log in again to obtain a new token.
They contain the user's identity, not an authoritative role. The server verifies
the signature, algorithm, issuer, audience and expiry, then reads the current
database role on every protected request. Role changes take effect immediately.
Client-supplied role headers or request fields do not grant access.

- Missing, invalid or expired token, or deleted user: `401` with
  `{ "message": "Authentication required." }`.
- Authenticated user without `ADMIN` (including missing/unsupported roles):
  `403` with
  `{ "message": "Access denied. Administrator privileges required." }`.
- Database unavailable: logged `503`; other unexpected failures: logged `500`.

Denied access attempts are logged without credentials or tokens. Health, login,
and registration remain public. Invalid login credentials still return `401`.

`GET /api/customers` accepts optional query parameters:

| Parameter  | Description                                                                 | Default  |
| ---------- | --------------------------------------------------------------------------- | -------- |
| `search`   | Case-insensitive name search; every word must match a first or last name    | none     |
| `email`    | Case-insensitive partial email match                                        | none     |
| `sort`     | `nameAsc`, `nameDesc`, `newest` or `oldest`                                 | `newest` |
| `page`     | Positive whole number                                                       | `1`      |
| `pageSize` | Whole number from 1 to 100                                                  | `10`     |

```json
{
  "customers": [
    {
      "id": "d397293a-53f9-4c51-aa7a-91f69eb53a75",
      "firstName": "John",
      "lastName": "Smith",
      "email": "john@email.com",
      "registrationDate": "2026-10-20"
    }
  ],
  "page": 1,
  "pageSize": 10,
  "total": 1,
  "totalPages": 1
}
```

No matches returns an empty `customers` array. `GET /api/customers/{id}`
returns `{ "customer": { ... } }` in the same shape. Errors: `400` for invalid
query parameters, `404` for an unknown customer ID, `503` (logged) when the
database is unreachable, and `500` (logged) for other failures. `id` is the
existing UUID and `registrationDate` is the UTC date of the user's `createdAt`.

## Linting

Biome checks code formatting, recommended lint rules, and import ordering. The
shared style is two-space indentation, single quotes in JavaScript/TypeScript,
and semicolons only where needed.

Use Node.js 22 (see [.nvmrc](.nvmrc)), then install dependencies:

```sh
npm ci
```

Installation runs `prepare` to configure Husky's Git hooks. If dependencies are
already installed, run `npm run prepare` once to activate the hooks.

```sh
npm run lint      # Check without changing files; warnings and errors fail
npm run lint:fix  # Apply safe fixes, then report any remaining issues
```

Review automatic changes and fix remaining issues manually. Unsafe fixes are
not enabled.

The [pre-push hook](.husky/pre-push) runs `npm run lint` on the whole project
before every push and blocks the push if it fails. It does not modify files.
The existing [CI workflow](.github/workflows/ci.yml) also runs the same command.
Local hooks can be bypassed, so require a passing CI check in GitHub branch
protection for server-side enforcement.

## Continuous integration

The [CI workflow](.github/workflows/ci.yml) runs `npm ci`, generates the Prisma
client, then runs `npm run build`, `npm run lint`, and `npm test` on pull
requests opened, updated, or reopened against any branch, and on pushes to
`main` or `master` (including merges).
It uses the Node.js version from [.nvmrc](.nvmrc). Any failed command fails the
job; failures are not ignored.

`npm test` runs registration, login, customer, authorization and error-handler
unit tests, plus HTTP integration tests using a temporary local server and a
stubbed database. No PostgreSQL connection is required. Integration tests cover
both protected URL forms, JWT validation, denied access, role changes and server
failures.

### Block merges when CI fails

A workflow file alone does not block merges. A repository administrator must
configure GitHub after pushing this workflow and letting it run at least once:

1. Open **Settings > Branches > Add branch protection rule**.
2. Set the branch name pattern to `main`.
3. Enable **Require a pull request before merging**.
4. Enable **Require status checks to pass before merging** and select
   **Build, lint and test** from GitHub Actions.
5. Enable **Require branches to be up to date before merging**.
6. Enable **Do not allow bypassing the above settings** so administrators cannot
   bypass failed checks, then save.
7. Repeat for `master` if that branch is used.

These settings are not applied by this local change. Verify enforcement with a
failing pull request: the required check should fail and merging should be
blocked. After fixing the failure and rerunning CI successfully, the check
should pass.

Only the backend workflow is changed here. The frontend repository needs its
own workflow, working build/lint/test scripts, and the same branch protection
settings.

## Applying the same policy to the frontend

Only this backend repository is configured by this change. In the frontend's
Git repository:

1. Install the same versions:
   `npm install --save-dev --save-exact @biomejs/biome@2.5.15 husky@9.1.7`.
2. Copy [biome.json](biome.json) to the frontend root. Keep the same rules and
   style settings; add any generated frontend output directories to
   `files.includes` exclusions if they are not already Git-ignored.
3. Add the same `lint`, `lint:fix`, and `prepare` scripts from
   [package.json](package.json), preserving any existing prepare tasks.
4. Copy [.husky/pre-push](.husky/pre-push) and run `npm run prepare`.
5. Run `npm run lint:fix`, review the changes, then run `npm run lint`.
6. Run `npm ci` and `npm run lint` in frontend CI as well, and commit the
   configuration, hook, and updated package manifest and lockfile.

References: [Biome CLI](https://biomejs.dev/reference/cli/) and
[Husky](https://typicode.github.io/husky/).
