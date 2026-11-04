# Order service implementation plan

## Goal and scope

Add a backend endpoint that receives an order from the frontend, checks product
availability, and either:

- Saves the whole order and reduces each product's stock.
- Rejects the whole order with a clear message, saving no order or order items
  and leaving stock unchanged.

Stock reduction on success was confirmed. This document is a plan only; no
application code or database changes have been made.

## 1. Proposed request and response contract

Use `POST /api/orders` with `Content-Type: application/json` and a valid login
token in the Authorization header.

The request body contains an `items` array. Each item contains:

| Field | Meaning |
|---|---|
| `productId` | ID of an existing product |
| `quantity` | Positive whole number of units requested |

Derive the customer ID from the verified login token, not from the request body.
Read prices from the database and calculate the total on the server. Do not
accept a client-supplied total, price, stock value, customer ID, or order status.

Proposed validation policy:

- Require a non-empty array of items.
- Require valid product IDs and positive safe-integer quantities.
- Reject duplicate product IDs with a validation message. This avoids separate
  lines bypassing stock checks and matches the order-item composite primary key.
- Reject unexpected fields rather than trusting frontend-only validation.

Proposed responses:

| Situation | HTTP status | Response |
|---|---|---|
| Order saved and stock reduced | `201` | `{ order: ... }` |
| Invalid input or duplicate products | `400` | `{ message: ... }` |
| Missing or invalid authentication | `401` | `{ message: "Authentication required." }` |
| Product does not exist | `404` | `{ message: "One or more products were not found." }` |
| Insufficient stock | `409` | `{ message: "Insufficient stock for one or more products." }` |
| Wrong content type | `415` | `{ message: "Content-Type must be application/json." }` |
| Database unavailable | `503` | Existing database-unavailable response |
| Unexpected failure | `500` | Existing generic error response |

For success, return only the new order ID, authenticated customer ID, total,
status, creation time, and ordered product IDs and quantities. Never return the
customer's password hash or full customer record.

The validation policies, authenticated-user access policy, and initial status
`PENDING` are proposals to confirm before implementation. This plan covers order
placement, not payment processing, cancellation, refunds, or stock restoration.

## 2. File-by-file work

| File | Planned responsibility |
|---|---|
| [src/models/order_model.ts](src/models/order_model.ts) | Extend the existing file with the request validation schema, validated input type, safe response selection, resulting order type, and database types needed by the repository. |
| [src/errors/order_errors.ts](src/errors/order_errors.ts) (new) | Define specific validation, missing-product, and insufficient-stock errors using the existing error-class style. |
| [src/repo/order_repository.ts](src/repo/order_repository.ts) | Implement the currently empty repository: transaction handling, product reads, guarded stock reductions, and order/item insertion. |
| [src/service/order_service.ts](src/service/order_service.ts) (new) | Validate input, coordinate order placement, apply the initial-status rule, and map validated quantities to the existing database field names. Keep HTTP objects out of this layer. |
| [src/controllers/order_controller.ts](src/controllers/order_controller.ts) (new) | Check content type, read the body and verified user ID, call the service, and send `201` only after the transaction commits. |
| [src/routes/order_routes.ts](src/routes/order_routes.ts) (new) | Wire the repository, service, and controller using the catalog factory pattern; register the protected POST route. |
| [src/middleware/authorization_middleware.ts](src/middleware/authorization_middleware.ts) | Extract reusable signed-in-user verification from the existing admin-only middleware. Preserve every existing admin check and response. Expose a general authentication middleware for orders. |
| [src/middleware/error_handler_middleware.ts](src/middleware/error_handler_middleware.ts) | Map order errors to the statuses above without changing existing endpoint behavior. Preserve explicit logging and safe messages for unexpected failures. |
| [src/app.ts](src/app.ts) | Mount the order router under `/api` before the final error handler and pass the existing database/authentication dependencies. |
| [tests/orders.test.ts](tests/orders.test.ts) (new) | Add request-validation, service, repository, and HTTP behavior tests using `node:test` and the existing mock patterns. |
| [tests/orders.integration.test.ts](tests/orders.integration.test.ts) (new) | Verify real PostgreSQL transactions, rollback, and simultaneous stock claims against a dedicated test database. |
| [tests/authorization.test.ts](tests/authorization.test.ts) | Add regression coverage for general authentication while preserving admin authorization behavior. |
| [tests/errorHandler.test.ts](tests/errorHandler.test.ts) | Cover the new order error responses and existing fallback behavior. |
| [package.json](package.json) | Include the new unit-test file in the explicit test list. Add a separate opt-in command for database integration tests. |
| [README.md](README.md) | Document the endpoint, authentication, request fields, success response, rejection messages, and integration-test setup. |

The existing order model uses `include` for `id`, but `id` is a scalar field.
Use `select` for scalar fields and nested selections for relations. Replace the
full customer inclusion with a safe response shape as part of this order work.

Leave the catalog reading methods in place. Order placement is an additional
flow, not a replacement for browsing products.

## 3. Use the existing database schema

The current [Prisma schema](prisma/schema.prisma) already has the required tables:

- `Product`: product ID, price, and stock.
- `order`: customer ID, order total, status, and creation time.
- `order_products`: order ID, product ID, and `amount`.

Map request `quantity` to `order_products.amount`. Use the relation names and
lowercase model names actually generated from this schema.

No schema migration is required for this core feature. Regenerate the Prisma
client only if it is out of sync with the intended schema; do not overwrite
unrelated schema work.

The existing price and total columns use `Float`. Define and test a consistent
currency-rounding rule before implementation; do not trust a frontend total or
quietly change database column types. Historical unit-price snapshots and a
future Decimal/minor-unit migration are separate enhancements, not prerequisites
for this stock-validation feature.

## 4. Transaction algorithm

A transaction groups database operations so they either all succeed or all roll
back. The repository must keep every database operation below inside the same
Prisma interactive transaction, using its transaction client.

1. Load every requested product, selecting only the fields needed for ordering.
2. Verify that every product exists.
3. Compare each quantity with its product's stock. If any product is short,
   throw an insufficient-stock error before proceeding.
4. Calculate the order total from the prices read inside the transaction.
5. Process products in a consistent product-ID order to reduce deadlock risk.
6. For each product, perform a guarded atomic stock decrement:
   - Match both its ID and `stock >= requested quantity`.
   - Decrement stock by the requested quantity in that database operation.
   - Verify that exactly one row was updated.
   - If no row was updated, throw an insufficient-stock error.
7. Insert the order and its order-item rows, preferably using a nested create.
8. Select the safe response fields and let the transaction commit.
9. Return the committed result to the controller.

If anything throws, let the transaction roll back and propagate the error to the
existing error-handling flow. Do not catch a failure inside the transaction and
return a success-shaped value.

### Why the guarded decrement matters

Reading stock and later inserting an order is not enough. Two requests can both
read the same stock before either finishes.

Example: stock is 3 and two customers each request 2. The database-side
`stock >= quantity` condition allows only one of those decrements to succeed.
The losing request must roll back its entire transaction and receive a stock
conflict response.

An initial stock read improves validation, but the guarded decrement is the
final authority. A failure on the second item must also undo any decrement
already performed for the first item.

Keep transactions short: no frontend calls, payment calls, or other network
requests inside them. Recognized transaction deadlock/write-conflict failures
must also roll back and return an explicit retryable failure, for example `503`
with "Order could not be completed. Please try again." Unexpected errors must
remain logged errors, not be relabeled as insufficient stock.

## 5. Acceptance tests

### Validation and HTTP behavior

- Valid authenticated input reaches order placement and returns `201`.
- The request body cannot override customer ID, price, total, or status.
- Missing/empty items, malformed IDs, zero/negative/fractional/unsafe quantities,
  duplicate products, and unexpected fields return `400` without database writes.
- Missing, expired, or invalid tokens return `401` without writes.
- A token for a deleted user is rejected.
- Incorrect content type returns `415`; malformed JSON follows existing `400`
  handling.
- Responses exclude customer credentials and unnecessary product/image data.

### Stock and persistence

- Quantity below stock succeeds and reduces stock by the exact amount.
- Quantity equal to stock succeeds and leaves stock at zero.
- Quantity above stock returns `409` and creates no order or item rows.
- A missing product returns `404` with no persistent changes.
- In a multi-product order, one unavailable item rejects the entire order.
- Failure after one stock decrement rolls that decrement back.
- Failure inserting the order or its items rolls all stock changes back.
- The stored total comes from database prices using the agreed rounding rule.
- Stored item amounts match requested quantities.

### Real database concurrency

- Start with stock 3 and submit two simultaneous requests for 2 units of the
  same product. Exactly one succeeds, the other reports insufficient stock,
  final stock is 1, and exactly one order with its items exists.
- Run concurrent multi-product orders to exercise consistent update ordering
  and rollback on conflicts.
- Verify persisted database rows after both requests finish. Mock-only tests
  cannot demonstrate real rollback or concurrency safety.

Use a dedicated test database and clean up only the test records created by
these tests. Do not reset a shared development database.

## 6. Suggested implementation order

1. Confirm the proposed API policies and currency-rounding rule.
2. Define request/response types, validation, errors, and failing tests.
3. Implement and test the transactional repository.
4. Add the service and its business-rule tests.
5. Add reusable authentication while retaining admin regression tests.
6. Connect the controller, route, application wiring, and error mapping.
7. Run targeted unit tests and real-database rollback/concurrency tests.
8. Update the documented endpoint and test commands, then run typecheck and lint.

Completion means the endpoint is wired end to end, successful orders decrement
stock exactly once, rejected orders leave no persistent changes, concurrency
tests pass, and existing catalog/admin behavior is preserved.

Frontend double-submission and network retries can create separate valid orders.
Disable repeated submits in the UI for usability. If guaranteed retry deduplication
is required, agree on an idempotency-key design and persistence constraint as a
separate requirement before implementing that guarantee.
