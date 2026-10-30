# ctrl-alt-elite-backend
Ctrl Alt Elite Backend

## Connecting the product frontend

Run the backend on port `3001` and the frontend on port `8080`.
Copy [.env.example](.env.example) to `.env` if needed, replace the local database
password and set the matching `DATABASE_URL`. The backend settings are as follows:

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
and an `image` string. Images stored in the database can be PNG, JPEG or WebP
bytes, or SVG documents beginning with `<svg`. The API detects binary formats
from their file signatures, not filenames, and returns a base64 data URL with
the matching `image/png`, `image/jpeg`, `image/webp` or `image/svg+xml` media type
for HTML image elements. This is format detection, not full image validation.
Nunjucks templates can display the returned value using
`<img src="{{ product.image }}" alt="{{ product.name }}">`; no conversion or
`safe` filter is needed. Existing stored JPEG/WebP images need no migration or
re-seeding after this backend update.
Unsupported image data is logged and returns HTTP 500 rather than a broken URL.
The single-product endpoint, `GET /api/products/:id`, uses the same product shape
inside `{ "product": ... }`. Existing products receive category `Uncategorised`
and an empty description during migration; populate these fields with your own
catalogue content. Database failures return HTTP 500, allowing the frontend to
show its temporary-unavailable message.

`GET /api/products/popular?limit=6` feeds the homepage conveyor belt. It returns
`{ "products": [{ "id", "name", "price", "imageUrl" }] }`, where `price` is a
2 decimal place string such as `"24.99"`. Only in-stock products are included,
ranked by total units ordered. If too few products have been ordered, the
remaining slots are filled with the newest in-stock products. `limit` defaults
to 6 and is capped at 20; a missing or invalid value uses the default. The
layers live in the `popular_products_*` files alongside the catalogue layers.

## Catalogue architecture

The catalogue uses separate layers so database access and product preparation
can be tested without starting an HTTP server:

- [Router](src/routes/catalog_routes.ts): creates the layers and maps URLs to handlers.
- [Controller](src/controllers/catalog_controller.ts): reads request parameters and sends
  HTTP status codes and JSON responses.
- [Service](src/service/catalog_service.ts): prepares products for the API, including
  converting PNG/JPEG/WebP/SVG image bytes into data URLs.
- [Repository](src/repo/catalog_repository.ts): runs Prisma queries, selecting the
  catalogue fields and ordering the product list by name.

The controller receives a service, and the service receives a repository.
Tests can supply lightweight replacements for those dependencies. Errors
propagate to the existing shared error handler; missing products still return
404, and database or unsupported-image failures still return 500.
## Customer API (admin)

Customer validation limits, pagination defaults, sort options and messages are
defined in [customer resources](src/resources/customer_resources.ts).

Customer APIs require a valid login token and the current database role `ADMIN`
or `CUSTOMER_SERVICE`. Both `/api/admin/customers` and the existing
`/api/customers` URLs are protected, including their `/{id}` endpoints.
`CUSTOMER_SERVICE` can only read customers; `PUT` endpoints are `ADMIN` only.

Staff roles and the admin namespace:

| Endpoint | `ADMIN` | `CUSTOMER_SERVICE` |
| --- | --- | --- |
| `/api/admin/profile`, `/api/admin/change-password` | yes | yes |
| `GET /api/admin/customers[/:id]` | yes | yes |
| `PUT /api/admin/customers/:id[/password]` | yes | 403 |
| `/api/admin/support/tickets/**` | yes | yes |
| Any other `/api/admin/**` endpoint | yes | 403 |

Staff-accessible routes are listed explicitly in `src/app.ts` with `requireStaff`;
everything else under `/api/admin` falls through to an `ADMIN`-only guard, so new
admin endpoints are denied to other roles by default. To add a role (for example
Finance), add it to the `Role` enum and `supportedRoles`, then add it to the
relevant `requireRole` lists in the authorization middleware.

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
  "firstName": "Ada",
  "lastName": "Lovelace",
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
- Authenticated user whose role is not permitted (including missing/unsupported
  roles): `403` with `{ "message": "Access denied. ... privileges required." }`.
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

## Support Tickets

Apply the migrations and regenerate the Prisma client before running the API:

```sh
npm run db:deploy
npm run db:generate
```

Identity comes only from the verified `Authorization: Bearer <jwt>` token;
client-supplied ownership, status, timestamps and other extra fields are ignored.

### Customer endpoints (roles `CUSTOMER` and `ADMIN`)

Admins can also create tickets; like customers, they only see their own tickets here.

| Method | Path | Success |
| --- | --- | --- |
| `POST` | `/api/support/tickets` | `201`, `{ "ticket": { ... } }`, plus `Location` header |
| `GET` | `/api/support/tickets` | `200`, `{ "tickets": [ ... ] }`, newest first |
| `GET` | `/api/support/tickets/:id` | `200`, `{ "ticket": { ... } }` |
| `GET` | `/api/support/tickets/:id/comments` | `200`, `{ "comments": [ ... ] }`, oldest first |
| `POST` | `/api/support/tickets/:id/comments` | `201`, `{ "comment": { ... } }` |

### Admin endpoints (role `ADMIN`)

| Method | Path | Success |
| --- | --- | --- |
| `GET` | `/api/admin/support/tickets` | `200`, `{ "tickets": [ ... ] }`, newest first |
| `GET` | `/api/admin/support/tickets/:id` | `200`, `{ "ticket": { ... } }` |
| `PATCH` | `/api/admin/support/tickets/:id/status` | `200`, `{ "ticket": { ... } }`; body `{ "status": "OPEN" \| "IN_PROGRESS" \| "RESOLVED" \| "CLOSED" }` |
| `GET` | `/api/admin/support/tickets/:id/comments` | `200`, `{ "comments": [ ... ] }` on any ticket |
| `POST` | `/api/admin/support/tickets/:id/comments` | `201`, `{ "comment": { ... } }` on any ticket |

Admin tickets also include `customer` (`id`, `firstName`, `lastName`, `email`)
and the flat `customerId`, `customerName` and `customerEmail` fields.

Create a ticket with `Content-Type: application/json`:

```json
{
  "category": "DELIVERY_ISSUE",
  "subject": "Missing parcel",
  "description": "My parcel has not arrived."
}
```

- `category`: `ACCOUNT_ISSUE`, `ORDER_ISSUE`, `DELIVERY_ISSUE`, `RETURNS_REFUNDS`,
  `PRODUCT_ENQUIRY` or `OTHER`.
- `subject`: trimmed, 1-150 characters. `description`: trimmed, 1-2000 characters.
- New tickets have status `OPEN`. Ticket IDs are short and sequential
  (`T-1001`, `T-1002`, ...), generated by the database, and must match
  `^[A-Za-z0-9-]{1,64}$`.

```json
{
  "ticket": {
    "id": "T-1001",
    "subject": "Missing parcel",
    "category": "DELIVERY_ISSUE",
    "description": "My parcel has not arrived.",
    "status": "OPEN",
    "createdAt": "2026-10-27T10:00:00.000Z",
    "updatedAt": "2026-10-27T11:00:00.000Z"
  }
}
```

### Comments

`POST` takes `{ "body": "..." }` (trimmed, 1-2000 characters, plain text). The author
and role come from the token and the database, never the request body. Comments
return:

```json
{
  "comment": {
    "id": "2ce12fa1-7741-4d0b-a97e-75802d936d13",
    "body": "We have refunded your order.",
    "createdAt": "2026-10-27T15:00:00.000Z",
    "authorName": "Grace Hopper",
    "authorRole": "ADMIN"
  }
}
```

Posting to a `CLOSED` ticket returns `409` with `"This ticket is closed."`; the
check and insert run in one transaction, so a concurrent close cannot be bypassed.
Ticket and comment `GET`s send `Cache-Control: no-store` because the frontend
polls them. Inserting a comment advances the ticket's `updatedAt` via a database
trigger; comments are indexed by ticket and creation time.

Errors use the `{ "message": "..." }` format:

- `400`: invalid/missing fields (including empty or over-long comments), malformed JSON or invalid ticket ID; field
  validation includes an `errors` array containing `field` and `message`.
- `401`: missing, invalid or expired token, or deleted account.
- `403`: unsupported role, or a customer calling an admin endpoint.
- `404`: ticket does not exist, or (customer endpoints) belongs to another customer.
- `409`: comment on a closed ticket.
- `413`: body exceeds 16 KB; `415`: body is not JSON.
- `503`: database unavailable; `500`: unexpected failure, without internal details.

Run the ticket API tests with:

```sh
node --import tsx --test tests/supportTickets.test.ts
```

These tests use signed tokens and mocked Prisma queries, so they don't need
PostgreSQL. They also run through `npm test`.

## Linting

Biome checks code formatting, recommended lint rules, and import ordering. The
shared style is two-space indentation, single quotes in JavaScript/TypeScript,
and semicolons only where needed.

Use Node.js 22 (see [.nvmrc](.nvmrc)), then install dependencies:

```sh
npm ci
npm run db:generate
```

Set `DATABASE_URL` in your local `.env` before generating the Prisma client.
The `src/generated/` directory is ignored by Git; generate it after installation
and whenever the Prisma schema changes. CI generates the client before building
using a placeholder database URL; generation does not connect to PostgreSQL.

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

The generated Prisma client is Git-ignored, so CI runs `npm run db:generate`
before building. This step supplies a placeholder `DATABASE_URL` because
[prisma.config.ts](prisma.config.ts) requires it when loading the config.
Client generation does not connect to a database or apply migrations, so this
step needs neither a running PostgreSQL server nor database secrets.

`npm test` runs every `tests/**/*.test.ts` file with the Node.js test runner.
Product and basket API tests start a temporary HTTP server with a mocked
database; none of these tests connect to PostgreSQL.

Run `npm run test:customers:unit` for isolated customer validation and service
tests in [customers.test.ts](tests/customers.test.ts). These call public functions
directly with a mocked Prisma client, without Express, HTTP requests or JWTs.
Password hashing checks use the real Argon2 library.

Admin account unit tests are grouped by behavior under [tests/admin](tests/admin):
[profile tests](tests/admin/profile.test.ts) and
[password tests](tests/admin/password.test.ts). Run `npm run test:admin:unit`
to test public admin validation and service functions with mocked database calls,
without starting a server. These also run through `npm test`.

Authorization middleware unit tests in
[authorization.test.ts](tests/authorization.test.ts) call the middleware directly
with mocked requests, responses and database calls. They run through `npm test`
without starting a server. They cover token and role checks, not route wiring
or end-to-end login flows.

## Basket API (KAN-28)

Prices and names come from the `Product` table, never from the client. Product
prices are stored in pounds and converted to whole pence (rounded) for basket
responses. Seed the catalogue after migrating:

```sh
npm run db:deploy
npm run db:seed   # idempotent; safe to run repeatedly
```

| Method | Path | Body | Success |
| --- | --- | --- | --- |
| `POST` | `/api/baskets` | none | `201` empty basket |
| `GET` | `/api/baskets/:basketId` | none | `200` basket |
| `POST` | `/api/baskets/:basketId/items` | `{ "productId": "<product id>" }` | `201` new line, `200` quantity +1 |
| `PATCH` | `/api/baskets/:basketId/items/:productId` | `{ "quantity": 3 }` or `{ "change": -1 }` | `200` basket |
| `DELETE` | `/api/baskets/:basketId/items/:productId` | none | `204` |

Every basket response has this shape (`items[].id` is the product id, matching
the frontend's `BasketLine`; all money is whole pence):

```json
{
  "id": "6f1c2f0e-6a8e-4c43-9a51-3f3c9b8f4b11",
  "items": [
    { "id": "99a89432-b64d-4c54-b6af-71591fdb0a01", "name": "Swaggy Jeans", "unitPricePence": 2499, "quantity": 2, "lineTotalPence": 4998 }
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
