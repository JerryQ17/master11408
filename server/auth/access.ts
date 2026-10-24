import { APIError } from 'better-auth/api';

export interface Access {
  user_id: string;
  status: 'active' | 'recovery_pending';
  auth_epoch: number;
}
export interface Invite extends Access {
  id: string;
  name: string;
  email: string;
}
export async function sha256(value: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
export function forbidden(): never {
  throw new APIError('FORBIDDEN', { code: 'ENROLLMENT_DENIED', message: '邀请无效或账户不可用' });
}
export async function readAccess(db: D1Database, userId: string): Promise<Access> {
  const access = await db
    .prepare('SELECT * FROM user_access WHERE user_id = ?')
    .bind(userId)
    .first<Access>();
  if (!access) forbidden();
  return access;
}
export async function readInvite(
  db: D1Database,
  token: string | null | undefined,
): Promise<Invite> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) forbidden();
  const invite = await db
    .prepare(
      `
    SELECT i.id, a.user_id, a.status, a.auth_epoch, u.name, u.email
    FROM enrollment_invites i JOIN user_access a ON a.user_id = i.target_user_id
    JOIN user u ON u.id = a.user_id
    WHERE i.token_hash = ? AND i.consumed_at IS NULL AND i.revoked_at IS NULL
      AND i.expires_at > ? AND i.auth_epoch = a.auth_epoch
      AND ((i.purpose = 'enrollment' AND a.status = 'active') OR (i.purpose = 'recovery' AND a.status = 'recovery_pending'))
  `,
    )
    .bind(await sha256(token), Date.now())
    .first<Invite>();
  if (!invite) forbidden();
  return invite;
}
export async function consumeLimit(
  db: D1Database,
  key: string,
  rule: { window: number; max: number },
) {
  const now = Date.now();
  const cutoff = now - rule.window * 1000;
  const row = await db
    .prepare(
      `
    INSERT INTO rate_limit (id, key, count, last_request) VALUES (?, ?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN last_request <= ? THEN 1 ELSE count + 1 END,
      last_request = CASE WHEN last_request <= ? THEN excluded.last_request ELSE last_request END
    RETURNING count, last_request
  `,
    )
    .bind(crypto.randomUUID(), key, now, cutoff, cutoff)
    .first<{ count: number; last_request: number }>();
  if (!row) throw new Error('Rate limit write failed');
  return {
    allowed: row.count <= rule.max,
    retryAfter:
      row.count > rule.max
        ? Math.max(1, Math.ceil((row.last_request + rule.window * 1000 - now) / 1000))
        : null,
  };
}
