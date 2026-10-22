# ctrl-alt-elite-backend
Ctrl Alt Elite Backend

## Customer API (admin)

Authentication and authorisation are not implemented yet; these endpoints are
unprotected.

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

`npm test` runs only the registration, customer and error-handler unit tests.
These tests do not start a server or connect to PostgreSQL.

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
