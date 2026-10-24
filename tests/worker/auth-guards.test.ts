import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { Bindings } from '../../server/env';

const db = (env as Bindings).DB;
async function seed() {
  const id = crypto.randomUUID();
  const invite = crypto.randomUUID();
  await db.batch([
    db
      .prepare('INSERT INTO user (id,name,email) VALUES (?,?,?)')
      .bind(id, 'Test', `${id}@example.test`),
    db.prepare('INSERT INTO user_access (user_id,updated_at) VALUES (?,?)').bind(id, Date.now()),
    db
      .prepare(
        `INSERT INTO enrollment_invites (id,token_hash,target_user_id,purpose,auth_epoch,expires_at)
      VALUES (?,?,?,'enrollment',0,?)`,
      )
      .bind(invite, crypto.randomUUID(), id, Date.now() + 60000),
  ]);
  return { id, invite };
}
async function authorize(user: string, credential: string, invite: string | null) {
  return db
    .prepare(
      `INSERT INTO registration_authorizations
    (credential_id,user_id,invite_id,auth_epoch,expires_at) VALUES (?,?,?,0,?)`,
    )
    .bind(credential, user, invite, Date.now() + 60000)
    .run();
}
function insert(user: string, credential: string) {
  return db
    .prepare(
      `INSERT INTO passkey (id,public_key,user_id,credential_id,counter,device_type,backed_up)
    VALUES (?,'unit-test-public-key',?,?,0,'singleDevice',0)`,
    )
    .bind(crypto.randomUUID(), user, credential)
    .run();
}
describe('Database authentication invariants', () => {
  it('rejects credential insertion without a verified authorization', async () => {
    const user = await seed();
    await expect(insert(user.id, crypto.randomUUID())).rejects.toThrow(
      'PASSKEY_AUTHORIZATION_INVALID',
    );
  });
  it('consumes a single invitation exactly once under concurrent credential insertions', async () => {
    const user = await seed();
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    await authorize(user.id, a, user.invite);
    await authorize(user.id, b, user.invite);
    const results = await Promise.allSettled([insert(user.id, a), insert(user.id, b)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(
      await db
        .prepare('SELECT count(*) FROM passkey WHERE user_id=?')
        .bind(user.id)
        .first('count(*)'),
    ).toBe(1);
    expect(
      await db
        .prepare('SELECT consumed_at FROM enrollment_invites WHERE id=?')
        .bind(user.invite)
        .first('consumed_at'),
    ).not.toBeNull();
    expect(
      await db
        .prepare('SELECT count(*) FROM auth_audit_events WHERE target_user_id=?')
        .bind(user.id)
        .first('count(*)'),
    ).toBe(1);
  });
  it('rolls back credential creation and invite consumption if the audit write fails', async () => {
    const user = await seed();
    const credential = crypto.randomUUID();
    await authorize(user.id, credential, user.invite);
    await db
      .prepare(
        "CREATE TRIGGER injected_audit_failure BEFORE INSERT ON auth_audit_events BEGIN SELECT RAISE(ABORT,'injected_failure'); END",
      )
      .run();
    try {
      await expect(insert(user.id, credential)).rejects.toThrow('injected_failure');
      expect(
        await db
          .prepare('SELECT consumed_at FROM enrollment_invites WHERE id=?')
          .bind(user.invite)
          .first('consumed_at'),
      ).toBeNull();
      expect(
        await db
          .prepare('SELECT count(*) FROM passkey WHERE user_id=?')
          .bind(user.id)
          .first('count(*)'),
      ).toBe(0);
    } finally {
      await db.prepare('DROP TRIGGER injected_audit_failure').run();
    }
    await insert(user.id, credential);
  });
  it('keeps one credential when two deletion requests race', async () => {
    const user = await seed();
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    await authorize(user.id, a, user.invite);
    await insert(user.id, a);
    await authorize(user.id, b, null);
    await insert(user.id, b);
    const results = await Promise.allSettled(
      [a, b].map((key) => db.prepare('DELETE FROM passkey WHERE credential_id=?').bind(key).run()),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(
      await db
        .prepare('SELECT count(*) FROM passkey WHERE user_id=?')
        .bind(user.id)
        .first('count(*)'),
    ).toBe(1);
  });
  it('rejects creation of a Session for an obsolete recovery epoch', async () => {
    const user = await seed();
    await db.prepare('UPDATE user_access SET auth_epoch=1 WHERE user_id=?').bind(user.id).run();
    await expect(
      db
        .prepare(
          `INSERT INTO session (id,expires_at,token,updated_at,user_id,auth_epoch)
      VALUES (?,?,?,?,?,0)`,
        )
        .bind(crypto.randomUUID(), Date.now() + 60000, crypto.randomUUID(), Date.now(), user.id)
        .run(),
    ).rejects.toThrow('SESSION_EPOCH_INVALID');
  });
});
