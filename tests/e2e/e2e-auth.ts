import { randomBytes } from 'node:crypto';
import { getPlatformProxy } from 'wrangler';
import { sha256 } from '../../server/auth/access';
import type { Bindings } from '../../server/env';

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

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 8): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (
        attempt >= maxAttempts ||
        !(
          err instanceof Error &&
          (err.message.includes('SQLITE_BUSY') || err.message.includes('database is locked'))
        )
      ) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 50 * attempt + Math.random() * 50));
    }
  }
}

export async function createE2EInvite() {
  process.env.XDG_CONFIG_HOME ??= `${process.cwd()}/.wrangler`;
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  const platform = await getPlatformProxy<Bindings>({ remoteBindings: false });
  const db = platform.env.DB;
  const userId = `e2e-user-${crypto.randomUUID()}`;
  const token = randomBytes(32).toString('hex');
  const inviteId = crypto.randomUUID();
  const now = Date.now();
  const tokenHash = await sha256(token);

  await withRetry(() =>
    db.batch([
      db
        .prepare('INSERT INTO user (id, name, email) VALUES (?, ?, ?)')
        .bind(userId, 'E2E 考生', `${userId}@test.com`),
      db
        .prepare(
          'INSERT INTO user_access (user_id, status, auth_epoch, updated_at) VALUES (?, ?, ?, ?)',
        )
        .bind(userId, 'active', 0, now),
      db
        .prepare(
          'INSERT INTO enrollment_invites (id, token_hash, target_user_id, purpose, auth_epoch, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .bind(inviteId, tokenHash, userId, 'enrollment', 0, now + 86400000),
    ]),
  );

  await platform.dispose();
  return { userId, token };
}

export async function createE2EAuthenticatedSession() {
  process.env.XDG_CONFIG_HOME ??= `${process.cwd()}/.wrangler`;
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  const platform = await getPlatformProxy<Bindings>({ remoteBindings: false });
  const db = platform.env.DB;
  const userId = `e2e-user-${crypto.randomUUID()}`;
  const token = crypto.randomUUID();
  const now = Date.now();

  await withRetry(() =>
    db.batch([
      db
        .prepare('INSERT INTO user (id, name, email) VALUES (?, ?, ?)')
        .bind(userId, 'E2E 备考同学', `${userId}@test.com`),
      db
        .prepare(
          'INSERT INTO user_access (user_id, status, auth_epoch, updated_at) VALUES (?, ?, ?, ?)',
        )
        .bind(userId, 'active', 0, now),
      db
        .prepare(
          'INSERT INTO session (id, user_id, token, expires_at, updated_at, auth_epoch) VALUES (?, ?, ?, ?, ?, 0)',
        )
        .bind(crypto.randomUUID(), userId, token, now + 86400000, now),
    ]),
  );

  const secret =
    process.env.BETTER_AUTH_SECRET ||
    'd7f07fdccc9046f847672af48ab526398397d00aa946b8c5bc4d903ec97221b2';
  const signed = await signTestToken(token, secret);
  await platform.dispose();
  return { userId, sessionCookieValue: signed };
}
