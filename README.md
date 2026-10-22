# ctrl-alt-elite-backend
Ctrl Alt Elite Backend

## Connecting the product frontend

Run the backend on port `3001` and the frontend on port `8080`.
Copy [.env.example](.env.example) to `.env` if needed, replace the local database
password and set the matching `DATABASE_URL`. The backend settings are:

```ini
PORT=3001
FRONTEND_ORIGIN=http://localhost:8080
```

In the frontend's `.env`, set:

```ini
PORT=8080
BACKEND_ORIGIN=http://localhost:3001
```

Prepare the backend database and start the API:

```sh
npm run db:up
npm run db:deploy
npm run db:generate
npm run db:seed
npm run dev
```

The seed command upserts three placeholder products with bundled 640 x 480 SVG
illustrations from [prisma/images](prisma/images); it does not delete other
products. Re-run `npm run db:seed` to replace the old single-pixel seed images.
The illustrations are stored in PostgreSQL, so no external image host is needed.
Start the frontend with `npm run dev` in its own repository, then open
`http://localhost:8080/products`. The frontend server fetches the real backend;
both processes must be running.

`GET http://localhost:3001/api/products` returns `{ "products": [...] }`.
Each product has `id`, `name`, `category`, `description`, numeric `price`, `stock`,
and an `image` string. Images stored in the database must be PNG bytes or SVG
documents beginning with `<svg`. The API returns a base64 data URL with the
matching `image/png` or `image/svg+xml` media type for HTML image elements.
Unsupported image data is logged and returns HTTP 500 rather than a broken URL.
The single-product endpoint, `GET /api/products/:id`, uses the same product shape
inside `{ "product": ... }`. Existing products receive category `Uncategorised`
and an empty description during migration; populate these fields with your own
catalogue content. Database failures return HTTP 500, allowing the frontend to
show its temporary-unavailable message.

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

`npm test` runs registration, error-handler and product API tests.
Product tests start a temporary HTTP server with a mocked database; none of
these tests connect to PostgreSQL.

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
