import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { sha256 } from '../server/auth/access.ts';
import { createD1Adapter } from './d1-adapter.ts';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    name: { type: 'string' },
    email: { type: 'string' },
    user: { type: 'string' },
    json: { type: 'boolean' },
    remote: { type: 'boolean' },
    env: { type: 'string' },
  },
});
const action = positionals[0];
if (!['create-user', 'invite', 'recover', 'list-users'].includes(action ?? '')) {
  throw new Error(
    'Usage: pnpm admin create-user --name NAME --email EMAIL [--remote] [--env ENV] | invite/recover --user ID | list-users',
  );
}
const isRemote = values.remote ?? false;
const targetEnv = values.env;

const db = createD1Adapter({ isRemote, env: targetEnv });

try {
  let userId = values.user;
  if (action === 'list-users') {
    console.log(
      JSON.stringify(
        (
          await db
            .prepare(
              'SELECT id,name,email,status FROM user JOIN user_access ON user.id=user_access.user_id ORDER BY user.created_at',
            )
            .all()
        ).results,
      ),
    );
  } else {
    if (action === 'create-user') {
      if (!values.name || !values.email || !values.email.includes('@'))
        throw new Error('--name and a valid --email are required');
      userId = crypto.randomUUID();
      await db.batch([
        db
          .prepare('INSERT INTO user (id,name,email) VALUES (?,?,?)')
          .bind(userId, values.name, values.email),
        db
          .prepare('INSERT INTO user_access (user_id,updated_at) VALUES (?,?)')
          .bind(userId, Date.now()),
      ]);
    }
    if (!userId) throw new Error('--user is required');
    const user = await db
      .prepare('SELECT * FROM user_access WHERE user_id=?')
      .bind(userId)
      .first<{ auth_epoch: number; status: string }>();
    if (!user) throw new Error('User not found');
    if (action !== 'recover' && user.status !== 'active')
      throw new Error('Use recover for an account in recovery');
    if (
      action === 'invite' &&
      (await db.prepare('SELECT id FROM passkey WHERE user_id=? LIMIT 1').bind(userId).first())
    )
      throw new Error(
        'Existing users add credentials while signed in; use recover only when needed',
      );
    const currentEpoch = Number(user.auth_epoch) || 0;
    const epoch = currentEpoch + (action === 'recover' ? 1 : 0);
    const token = randomBytes(32).toString('hex');
    const inviteId = crypto.randomUUID();
    const operations = [
      db
        .prepare(
          'UPDATE enrollment_invites SET revoked_at=? WHERE target_user_id=? AND consumed_at IS NULL',
        )
        .bind(Date.now(), userId),
    ];
    if (action === 'recover')
      operations.push(
        db
          .prepare(
            "UPDATE user_access SET status='recovery_pending',auth_epoch=?,updated_at=? WHERE user_id=?",
          )
          .bind(epoch, Date.now(), userId),
        db.prepare('DELETE FROM session WHERE user_id=?').bind(userId),
      );
    operations.push(
      db
        .prepare(
          `INSERT INTO enrollment_invites (id,token_hash,target_user_id,purpose,auth_epoch,expires_at) VALUES (?,?,?,?,?,?)`,
        )
        .bind(
          inviteId,
          await sha256(token),
          userId,
          action === 'recover' ? 'recovery' : 'enrollment',
          epoch,
          Date.now() + (action === 'recover' ? 900000 : 86400000),
        ),
      db
        .prepare(
          'INSERT INTO auth_audit_events (id,target_user_id,action,actor,created_at) VALUES (?,?,?,?,?)',
        )
        .bind(
          crypto.randomUUID(),
          userId,
          action === 'recover' ? 'recovery_started' : 'invite_created',
          'maintenance-cli',
          Date.now(),
        ),
    );
    await db.batch(operations);
    const baseUrl = isRemote
      ? 'https://master11408.1397200108.workers.dev'
      : 'http://localhost:5173';
    const url = `${baseUrl}/enroll#token=${token}`;
    console.log(
      values.json
        ? JSON.stringify({ userId, inviteId, url })
        : `${isRemote ? '远程生产账户' : '本地账户'} ${userId}\n一次性邀请（请私下保存）：${url}`,
    );
  }
} catch (error) {
  console.error('❌ 操作失败:', error);
  process.exit(1);
}
