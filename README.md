# ctrl-alt-elite-backend
Ctrl Alt Elite Backend

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

`npm test` runs every `tests/**/*.test.ts` file with the Node.js test runner.
These tests mock the database, so they do not start a server or connect to
PostgreSQL.

## Basket API (KAN-28)

Prices and names come from the `Product` table, never from the client. Seed the
catalogue (the same products as the frontend's sample data) after migrating:

```sh
npm run db:deploy
npm run db:seed   # idempotent; safe to run repeatedly
```

| Method | Path | Body | Success |
| --- | --- | --- | --- |
| `POST` | `/api/baskets` | none | `201` empty basket |
| `GET` | `/api/baskets/:basketId` | none | `200` basket |
| `POST` | `/api/baskets/:basketId/items` | `{ "productId": "sample-lamp" }` | `201` new line, `200` quantity +1 |
| `PATCH` | `/api/baskets/:basketId/items/:productId` | `{ "quantity": 3 }` or `{ "change": -1 }` | `200` basket |
| `DELETE` | `/api/baskets/:basketId/items/:productId` | none | `204` |

Every basket response has this shape (`items[].id` is the product id, matching
the frontend's `BasketLine`; all money is whole pence):

```json
{
  "id": "6f1c2f0e-6a8e-4c43-9a51-3f3c9b8f4b11",
  "items": [
    { "id": "sample-lamp", "name": "Desk Lamp", "unitPricePence": 2499, "quantity": 2, "lineTotalPence": 4998 }
  ],
  "itemCount": 2,
  "totalPence": 4998,
  "maxQuantity": 99
}
```

Business rules: items are added with quantity 1, adding again increases the
quantity by 1, and quantities must be whole numbers from 1 to 99. A `change`
(as sent by the frontend's +/− buttons) is applied atomically and clamped to
1–99, so rapid clicks are never lost. Lines are returned in the order they were
first added.

| Status | When |
| --- | --- |
| `400` | Invalid basket id, quantity or change, or an unknown product: `{ message, errors: [{ field, message }] }` |
| `404` | Basket, or basket line, not found |
| `409` | Adding a product already at the maximum quantity of 99 |
| `415` | `POST`/`PATCH` body is not `application/json` |

If a stored basket id returns `404`, the frontend should create a new basket.

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
