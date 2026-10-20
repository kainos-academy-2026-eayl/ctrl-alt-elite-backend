# ctrl-alt-elite-backend

Express + TypeScript registration API using Prisma 7 and PostgreSQL.
The browser sends registration details to this API; only the backend accesses the database.

## Local setup

Requires Node.js 22.12+ and Docker Desktop running.

1. Copy `.env.example` to `.env`. Choose a local database password and use it in
   both `POSTGRES_PASSWORD` and `DATABASE_URL` (URL-encode special characters in the URL).
   `.env` is ignored by Git. Never commit real credentials.
2. Install dependencies and start the database:
   ```sh
   npm install
   npm run db:up
   npm run db:generate
   npm run db:deploy
   ```
3. Start the backend:
   ```sh
   npm run dev
   ```

The API listens at `http://localhost:3001`; `GET /health` reports its status.
PostgreSQL is available only locally at `localhost:5433`. Docker keeps data in a
named volume across restarts. `npm run db:down` stops it without deleting data.
For schema changes, run `npm run db:migrate -- --name describe_your_change`,
then `npm run db:generate`. Commit the generated migration.

## Registration

`POST http://localhost:3001/api/auth/register` with `Content-Type: application/json`:

```json
{
  "firstName": "Alex",
  "lastName": "Example",
  "email": "alex@example.com",
  "password": "Example123@",
  "confirmPassword": "Example123@"
}
```

Returns `201` with `{ "user": { "id", "firstName", "lastName", "email", "createdAt" } }`
(the listed fields have their actual values). Passwords are hashed with Argon2id;
neither passwords nor hashes are returned. Confirmation is validated, not stored.
Emails are trimmed and lowercased, with a unique database constraint.

Names must be nonblank and at most 100 characters. Emails must be valid and at
most 254 characters. Passwords must be 8-128 characters and include a digit and
one of the special characters accepted by the frontend registration form.

Errors have a `{ "message": "..." }` body:
- `400`: invalid fields, mismatched passwords, or malformed JSON.
- `409`: email already registered.
- `413`: request larger than 16 KB.
- `415`: request is not JSON.
- `500`: unexpected server/database error.

This creates an account only. Login, sessions, email verification, and production
deployment are not implemented. Before public deployment, add request rate
limiting, HTTPS, and an appropriate account-verification flow.

## Connect the separate frontend

The form was checked on the frontend repository's `accout_register` branch.
Its submit handler currently validates fields but does not make an API request.
No changes to that separate repository are included here.

Serve the page over HTTP rather than opening it with `file://`. Set
`FRONTEND_ORIGIN` in `.env` to the exact frontend origin (scheme, hostname, port),
for example `http://localhost:5500` or `http://127.0.0.1:5500`, then restart the API.

In the existing registration JavaScript, make the submit callback `async` and
replace its final `passwordMessage.textContent = "All fields are valid.";` with:

```js
const button = registrationForm.querySelector('button[type="submit"]');
button.disabled = true;
try {
    const response = await fetch("http://localhost:3001/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            firstName: document.querySelector("#firstName").value,
            lastName: document.querySelector("#lastName").value,
            email: emailInput.value,
            password: passwordInput.value,
            confirmPassword: confirmPasswordInput.value,
        }),
    });
    const result = await response.json();
    if (!response.ok) {
        passwordMessage.textContent = result.message;
        return;
    }
    passwordMessage.textContent = "Account created successfully.";
    registrationForm.reset();
} catch (error) {
    console.error("Registration request failed", error);
    passwordMessage.textContent = "Unable to reach the server. Please try again.";
} finally {
    button.disabled = false;
}
```

## Checks

```sh
npm test
RUN_DB_TESTS=1 npm test
npm run build
```

The database integration test requires the local database and migrations.
It verifies persistence, password hashing, duplicate emails, validation,
JSON errors, body limits, and CORS, and removes its own test user afterward.
