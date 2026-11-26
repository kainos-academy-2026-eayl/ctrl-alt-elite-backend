#!/bin/sh
set -eu

if [ "${INITIALIZE_DATABASE:-true}" = "true" ]; then
  attempt=1
  maximum_attempts=30

  until ./node_modules/.bin/prisma migrate deploy; do
    if [ "$attempt" -ge "$maximum_attempts" ]; then
      echo "Database did not become ready after $maximum_attempts attempts." >&2
      exit 1
    fi

    echo "Database is not ready; retrying migration ($attempt/$maximum_attempts)..."
    attempt=$((attempt + 1))
    sleep 2
  done

  node dist/seed.js
fi

exec node dist/index.js