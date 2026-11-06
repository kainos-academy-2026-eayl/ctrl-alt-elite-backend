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

`GET http://localhost:3001/api/products` returns
`{ "products": [...], "facets": {...}, "appliedFilters": {...} }` (see
[Filtering and sorting products](#filtering-and-sorting-products)).
Each product has `id`, `name`, `category`, `description`, numeric `price`, `stock`,
`createdAt` and an `image` string. Images stored in the database can be PNG, JPEG or WebP
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
to 6 and is capped at 20; a missing or invalid value uses the default. It is
served by the catalogue controller, service and repository.

### Filtering and sorting products

`GET /api/products` and `GET /api/products/search?q=...` both accept these
optional query parameters, which can be combined
([src/models/product_filter_model.ts](src/models/product_filter_model.ts)):

| Parameter | Example | Meaning |
| --- | --- | --- |
| `stock` | `stock=in`, `stock=out` | In-stock and/or out-of-stock products. Both, or neither, shows everything. |
| `category` | `category=Bags&category=Footwear` | Products in any of these categories (repeat for several). |
| `minPrice`, `maxPrice` | `minPrice=10&maxPrice=25` | Price range in pounds, inclusive. A reversed range is swapped. |
| `sort` | `sort=price-asc` | `recommended` (default), `price-asc`, `price-desc`, `newest`, `oldest`, `most-bought`, `name-asc` or `name-desc`. |

Bad values are ignored rather than rejected, like the search term.
`recommended` keeps the existing order (name order, or search relevance) with
in-stock products first. `most-bought` ranks by total units ordered, then name.

Both responses also include:

- `facets`: the options for the products that matched before filtering:
  `total`, `categories` (`[{ "name", "count" }]`), `stock` (`{ "in", "out" }`)
  and `priceRange` (`{ "min", "max" }` in pounds, or `null`). Each count
  respects the other active filters but not its own, so it shows what ticking
  that option would add.
- `appliedFilters`: the filters that were actually used, after cleaning:
  `{ "stock", "categories", "minPrice", "maxPrice", "sort" }`.

Search results also include each product's `category`.

### Product translations

The `ProductTranslation` table stores a product's name and description in Welsh (`cy`), Irish (`ga`) or French (`fr`). English stays on the `Product` row.

- `GET /api/product-translations?lang=fr` returns `{ "locale": "fr", "translations": { "<productId>": { "name", "description" } } }`. An unsupported `lang` returns 400.
- `GET /api/search?q=...&lang=fr` matches the English and French names.

`npm run db:seed` loads the translations from [prisma/product_translations.ts](prisma/product_translations.ts). Products without a translation are shown in English.

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

| Endpoint | `ADMIN` | `CUSTOMER_SERVICE` | `INVENTORY_MANAGEMENT` |
| --- | --- | --- | --- |
| `/api/admin/profile`, `/api/admin/change-password` | yes | yes | yes |
| `GET /api/admin/customers[/:id]` | yes | yes | 403 |
| `PUT /api/admin/customers/:id[/password]` | yes | 403 | 403 |
| `/api/admin/support/tickets/**` | yes | yes | 403 |
| `GET /api/admin/orders[/:id]` | yes | yes | 403 |
| `GET /api/admin/reports/**` | yes | 403 | 403 |
| `/api/admin/inventory/**` | yes | 403 | yes |
| Any other `/api/admin/**` endpoint | yes | 403 | 403 |

Inventory endpoints (`requireInventory`, `ADMIN` or `INVENTORY_MANAGEMENT`):

- `GET /api/admin/inventory/dashboard`: summary counts and the low-stock list.
- `GET /api/admin/inventory` and `GET /api/admin/inventory/low-stock`: products
  with `stock`, `lowStockThreshold`, `outOfStock`, `lowStock` and `status`
  (`IN_STOCK`, `LOW_STOCK`, `OUT_OF_STOCK`).
- `PATCH /api/admin/inventory/:id/stock` with `{ "stock": 12, "lowStockThreshold": 5 }`
  (`lowStockThreshold` optional; each product has its own, default 10).
- `PATCH /api/admin/inventory/:id/out-of-stock` with `{ "outOfStock": true }`. A
  product with this flag cannot be added to a basket (409) and is reported as not
  in stock by search, even if its stock is above zero. Updating stock does not
  clear the flag.

A product is low stock when `stock <= lowStockThreshold` or it is out of stock.

Staff-accessible routes are listed explicitly in `src/app.ts` (`requireStaff` for
customer service, `requireAnyStaff` for shared profile routes, `requireInventory`
for inventory); everything else under `/api/admin` falls through to an
`ADMIN`-only guard, so new admin endpoints are denied to other roles by default.
To add a role (for example Finance), add it to the `Role` enum and
`supportedRoles`, then add it to the relevant `requireRole` lists in the
authorization middleware.

## Admin orders and sales reports

All three endpoints send `Cache-Control: no-store`, return `401` for a missing
or invalid token and `403` for the wrong role, and report validation problems as
`400` with `{ "message": "..." }`. Money is always integer pence
(`order.order_total` is stored in pounds and converted with
`Math.round(order_total * 100)`; line prices come from
`order_products.unit_price_pence`). Responses never include password hashes or
other user fields.

| Endpoint | Roles |
| --- | --- |
| `GET /api/admin/orders`, `GET /api/admin/orders/:id` | `ADMIN`, `CUSTOMER_SERVICE` |
| `GET /api/admin/reports/sales` | `ADMIN` only |

### `GET /api/admin/orders`

Optional query parameters (anything invalid returns `400`):

| Parameter | Values | Default |
| --- | --- | --- |
| `search` | up to 200 characters. Case-insensitive match on the customer's first name, last name, "first last", or email (the order's checkout details or the account), or the start of the order id. Dashes in the id are ignored, so the 8 characters shown in the UI (for example `6C0D342D`) work. | none |
| `status` | `PENDING`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELLED` | all |
| `sort` | `newest`, `oldest`, `totalDesc`, `totalAsc` (ties broken by id so paging is stable) | `newest` |
| `page` | integer >= 1 | `1` |
| `pageSize` | integer 1 to 100 | `10` |

```json
{
  "orders": [
    {
      "id": "6c0d342d-3f30-475d-8a13-2742cf09c105",
      "customerName": "Sam Jones",
      "customerEmail": "sam@example.com",
      "status": "PENDING",
      "totalPence": 6047,
      "itemCount": 3,
      "createdAt": "2026-11-04T10:00:00.000Z"
    }
  ],
  "page": 1,
  "pageSize": 10,
  "total": 1,
  "totalPages": 1
}
```

`itemCount` is the sum of the line quantities. `total` is the count after
filters and `totalPages` is `ceil(total / pageSize)` (`0` when there are no
matches). A page past the end returns an empty `orders` array with `total` and
`totalPages` still correct.

### `GET /api/admin/orders/:id`

Returns `400` if `:id` is not a UUID and `404` if the order does not exist.

```json
{
  "order": {
    "id": "6c0d342d-3f30-475d-8a13-2742cf09c105",
    "status": "PENDING",
    "createdAt": "2026-11-04T10:00:00.000Z",
    "totalPence": 6047,
    "customer": {
      "id": "…",
      "name": "Sam Jones",
      "email": "sam@example.com",
      "phone": "07700900123"
    },
    "delivery": {
      "option": "Express delivery",
      "pricePence": 499,
      "addressLine1": "1 High Street",
      "addressLine2": null,
      "town": "Belfast",
      "postcode": "BT1 1AA"
    },
    "items": [
      { "productId": "…", "name": "Desk Lamp", "quantity": 2, "unitPricePence": 2499 }
    ]
  }
}
```

The customer name, email and phone come from the order's own checkout details
when present, otherwise from the account (`phone` can then be `null`).
`delivery.option` is the readable delivery option name, falling back to the
stored value, or `null`. Orders placed before checkout existed have `null`
address fields.

### `GET /api/admin/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD`

Both dates are required, must be real calendar dates with `from <= to`, and
may span at most 366 days (inclusive). The range is inclusive and in UTC, from
`from` 00:00:00Z to the end of the `to` day.

```json
{
  "range": { "from": "2026-11-01", "to": "2026-11-05" },
  "summary": {
    "totalOrders": 3,
    "totalRevenuePence": 6000,
    "averageOrderValuePence": 2000,
    "unitsSold": 7
  },
  "ordersByStatus": [{ "status": "PENDING", "count": 2 }],
  "dailySales": [{ "date": "2026-11-02", "orders": 1, "revenuePence": 2500 }],
  "topProducts": [
    { "productId": "…", "name": "Desk Lamp", "unitsSold": 4, "revenuePence": 4000 }
  ]
}
```

- `CANCELLED` orders are excluded from `totalOrders`, revenue, `unitsSold`,
  `dailySales` and `topProducts`, but are counted in `ordersByStatus`.
- `ordersByStatus` only lists statuses that have orders, in lifecycle order.
- `dailySales` has one row per UTC day that has orders, ascending by date.
- `topProducts` is the top 10 by `revenuePence`, highest first.
- `averageOrderValuePence` is `0` when there are no orders; otherwise it is
  rounded to whole pence.
- Figures are computed in the database (`groupBy` and SQL aggregation), not by
  loading orders into memory. `order` has indexes on `(createdAt, id)` and
  `(order_status, createdAt)` to support these queries.

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

## Customer profiles

The authenticated `GET /api/profile` returns `id`, `username`, `firstName`,
`lastName`, `email`, `addressLine1`, `addressLine2`, `town`, `postcode`, `phoneNumber` and
`hasPhoto`. Identity comes only from the verified backend login token.

`PATCH /api/profile` accepts any subset of the editable fields. Names are trimmed,
nonempty and at most 100 characters. Optional username (30 characters), address
lines (200 each), town/city (`town`, 60), postcode (20), and phone number (30) accept null or blank strings
to clear them; omitted values remain unchanged. Phone numbers are strings and
allow digits, spaces, a leading plus, brackets, dots and hyphens.
Usernames are unique and case-sensitive, for display only. Login remains email
and password. Email is returned read-only: attempts to update it through this API
are rejected, as are unknown fields such as roles, passwords and user IDs.

The `add_profile_town` migration adds a nullable `User.town` column without
changing existing accounts or orders. Existing profiles return `town: null`
until a town/city is saved. The frontend can fill checkout's editable town/city
from this profile value. Checkout still submits ordinary customer and address
details to `POST /api/orders`: choosing or editing saved details does not update
the profile. Order addresses remain snapshots, independent of later profile
changes. No additional checkout endpoint or details-source flag is required.

`PUT /api/profile/photo` accepts raw JPG, PNG or WebP bytes up to 20 MiB and
16 megapixels. The server decodes the image, corrects orientation, strips metadata
and stores a WebP thumbnail no larger than 512 by 512. `GET /api/profile/photo`
returns the current user's picture (`404` if absent); `DELETE /api/profile/photo`
removes it. All profile responses use `Cache-Control: no-store`.

Validation errors return `400`, username conflicts `409`, oversized uploads `413`,
unsupported upload content types `415`, and rejected authentication `401`.
Run `npm run db:deploy` and `npm run db:generate` for the additional nullable contact
columns. Existing accounts are preserved; their unset contact fields start null.

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

## Order API

### Place an order

`POST /api/orders`

Requires a valid login token for an account whose current database role is
`CUSTOMER`. Administrator and customer-service accounts receive `403`.

Send these headers:

```http
Authorization: Bearer <login-token>
Content-Type: application/json
```

Example request body:

```json
{
  "items": [
    {
      "productId": "11111111-1111-4111-8111-111111111111",
      "quantity": 2
    }
  ]
}
```

Replace the example product ID with an existing product UUID.

Validation rules:

- `items` must be a non-empty array.
- Each product ID must be a valid UUID.
- Each quantity must be a positive safe integer.
- A product may appear only once.
- Unexpected fields are rejected, including client-supplied prices,
  totals, customer IDs and order statuses.

The server derives the customer ID from the verified login token and reads
product prices from the database.

### Success response

Returns `201 Created`:

```json
{
  "order": {
    "id": "22222222-2222-4222-8222-222222222222",
    "customerId": "33333333-3333-4333-8333-333333333333",
    "products": [
      {
        "product_id": "11111111-1111-4111-8111-111111111111",
        "amount": 2
      }
    ]
  }
}
```

The response uses `amount` for the stored quantity. The current response does
not include the order total, status or creation time.

### Error responses

| Status | Meaning |
| --- | --- |
| 400 | Invalid order input or malformed JSON |
| 401 | Missing, invalid or expired token, or deleted user |
| 403 | Authenticated account is not a customer |
| 404 | One or more products were not found |
| 409 | Insufficient stock for one or more products |
| 413 | Request body exceeds the configured size limit |
| 415 | Content-Type is not application/json |
| 503 | Recognized database-unavailable failure |
| 500 | Unexpected failure |

Order validation failures include a `message` and a field-level `errors` array.
Other listed errors return a `message`. Database-unavailable failures return
`"Service temporarily unavailable."`; unexpected failures return
`"Unable to complete the request."` without exposing internal details.

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

Run the order, authorization and shared error-handler tests together with:

```sh
node --import tsx --test tests/order.test.ts tests/authorization.test.ts tests/errorHandler.test.ts
```

These unit tests use mocks rather than PostgreSQL and also run through
`npm test`. They do not prove real transaction rollback or concurrency safety;
those checks require separate integration tests against a dedicated test
database, never a shared development database.

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

## Checkout API

Customers pay for orders from the credit balance on their account. Every
account starts with £500.00 (`User.creditBalancePence`, default `50000`), and the
database will not let a balance go below zero. Apply the migration with
`npm run db:deploy` (or `npm run db:migrate` locally).

| Method | Path | Login | Success |
| --- | --- | --- | --- |
| `GET` | `/api/delivery-options` | no | `200`, `{ "deliveryOptions": [...] }` |
| `GET` | `/api/account` | yes | `200`, `{ "account": { firstName, lastName, email, creditBalancePence } }` |
| `POST` | `/api/orders` | yes | `201`, `{ "order": { ... }, "creditBalancePence": 45101 }`, plus `Location` header |
| `GET` | `/api/orders` | yes | `200`, `{ "orders": [...] }`, containing only the signed-in user's orders, newest first |
| `GET` | `/api/orders/:orderId` | yes | `200`, same shape as `POST`, for the customer's own order only |

"Login" means `Authorization: Bearer <token>` from `POST /api/auth/login`, for
any role. The customer always comes from the token, never from the body.
Responses from these endpoints, except the delivery options, are sent with
`Cache-Control: no-store`.

Delivery options and their prices are fixed by the backend
([src/models/order_model.ts](src/models/order_model.ts)):

| `id` | Name | Description | Price |
| --- | --- | --- | --- |
| `standard` | Standard delivery | 3–5 working days | £0.00 |
| `express` | Express delivery | 1–2 working days | £4.99 |
| `collection-1` | Collection point | 0.5 miles away | £0.00 |
| `collection-2` | Collection point | 1.2 miles away | £0.00 |
| `collection-3` | Collection point | 2.4 miles away | £0.00 |

`POST /api/orders` body (unknown fields are rejected):

```json
{
  "items": [{ "productId": "99a89432-b64d-4c54-b6af-71591fdb0a22", "quantity": 2 }],
  "customer": { "firstName": "Sam", "lastName": "Jones", "email": "sam@example.com", "phone": "07700 900123" },
  "address": { "line1": "1 High Street", "line2": "", "town": "Belfast", "postcode": "bt11aa" },
  "deliveryOption": "express"
}
```

Phone numbers must be UK numbers made of digits, with only spaces, `+`,
brackets, dots and dashes allowed between them. They are stored in national
form, so `+44 (0)7700 900-123` is stored as `07700900123`. Postcodes are stored
in the standard form, for example `BT1 1AA`. In a single transaction the order service:

1. Reads each product's price and stock from the database.
2. Reduces each product's stock with a guarded update (`stock >= quantity`), in
   product id order, so two orders can never sell the same last item.
3. Charges the items plus the delivery price to the customer's credit with a
   guarded update (`creditBalancePence >= total`).
4. Saves the order (status `PENDING`), its contact, address and delivery
   details, and the unit price paid for each product.

If any step fails, nothing is saved and no stock or credit changes. The order
total is worked out in whole pence and stored in pounds in `order_total`.

| Status | When |
| --- | --- |
| `400` | Invalid details, duplicate products or an unknown delivery option: `{ message, errors: [{ field, message }] }` |
| `401` | Missing or invalid login token |
| `404` | A product, or the order, does not exist (other customers' orders also return `404`) |
| `409` | Not enough stock, or not enough credit, for example `Your credit balance of £10.00 is not enough to pay £60.47.` |
| `415` | `POST` body is not `application/json` |
| `503` | The database was unavailable, or a transaction conflict means the customer should try again |

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
