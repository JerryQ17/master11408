import { env } from 'cloudflare:workers';
import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { beforeAll } from 'vitest';
import type { Bindings } from '../../server/env';

beforeAll(async () => {
  const bindings = env as Bindings & { TEST_MIGRATIONS: D1Migration[] };
  await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS);
});

export async function signTestToken(token: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(token));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
  return encodeURIComponent(`${token}.${signature}`);
}

export async function createTestUserSession(db: D1Database, secret: string) {
  const userId = crypto.randomUUID();
  const token = crypto.randomUUID();
  const now = Date.now();
  await db.batch([
    db
      .prepare('INSERT INTO user (id, name, email) VALUES (?, ?, ?)')
      .bind(userId, 'Test User', `${userId}@test.com`),
    db
      .prepare(
        'INSERT INTO user_access (user_id, status, auth_epoch, updated_at) VALUES (?, "active", 0, ?)',
      )
      .bind(userId, now),
    db
      .prepare(
        'INSERT INTO session (id, user_id, token, expires_at, updated_at, auth_epoch) VALUES (?, ?, ?, ?, ?, 0)',
      )
      .bind(crypto.randomUUID(), userId, token, now + 86400000, now),
  ]);
  const signed = await signTestToken(token, secret);
  return {
    userId,
    sessionCookie: `better-auth.session_token=${signed}`,
  };
}
