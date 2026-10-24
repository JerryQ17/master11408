import { betterAuth } from 'better-auth';
import { passkey } from '@better-auth/passkey';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { drizzle } from 'drizzle-orm/d1';
import { sessionFields } from '../shared/auth-config';

// Schema-only configuration. Never used to serve requests or access a database.
export const auth = betterAuth({
  secret: 'schema-generation-only-never-use-in-runtime',
  baseURL: 'http://localhost:5173',
  database: drizzleAdapter(drizzle({} as D1Database), { provider: 'sqlite', transaction: false }),
  emailAndPassword: { enabled: false },
  session: { additionalFields: sessionFields },
  rateLimit: { enabled: true, storage: 'database' },
  plugins: [passkey()],
});
