#!/bin/sh
set -eu

if [ "${INITIALIZE_DATABASE:-true}" = "true" ]; then
  attempt=1
  maximum_attempts=30

  until ./node_modules/.bin/prisma migrate deploy; do
    if [ "$attempt" -ge "$maximum_attempts" ]; then
      echo "Database migration failed after $maximum_attempts attempts; check the errors above." >&2
      exit 1
    fi

    echo "Migration failed; retrying ($attempt/$maximum_attempts)..."
    attempt=$((attempt + 1))
    sleep 2
  done

  node dist/seed.js
fi

exec node dist/index.js