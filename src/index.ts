import 'dotenv/config';
import { createApp } from './app';
import { createDatabase } from './database';

if (!process.env.PORT) {
  throw new Error('PORT environment variable is not set');
}

const HOST = '0.0.0.0';
const PORT = Number(process.env.PORT);

if (!Number.isInteger(PORT) || PORT < 0 || PORT > 65535) {
  throw new Error(`Invalid PORT: ${process.env.PORT}`);
}

if (!process.env.FRONTEND_ORIGIN) {
  throw new Error('FRONTEND_ORIGIN environment variable is not set');
}
const database = createDatabase();
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set');
}
const app = createApp(
  database,
  process.env.FRONTEND_ORIGIN,
  process.env.JWT_SECRET,
);
await database.$connect();
const server = app.listen(PORT, HOST, () => {
  console.log(`Listening on http://${HOST}:${PORT}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      database.$disconnect().then(
        () => process.exit(0),
        (error: unknown) => {
          console.error('Database shutdown failed', error);
          process.exit(1);
        },
      );
    });
  });
}
