import { Hono } from 'hono';
import { z } from 'zod';
import { createAuth } from './index';
import { consumeLimit, readAccess, readInvite } from './access';
import type { AppEnv } from '../context';
import { topicsRoute } from '../routes/topics';
import { tagsRoute } from '../routes/tags';
import { questionsRoute } from '../routes/questions';
import { practiceRoute } from '../routes/practice';
import { attemptsRoute } from '../routes/attempts';
import { wrongBookRoute } from '../routes/wrong-book';
import { statisticsRoute } from '../routes/statistics';

export const publicAuth = new Hono<AppEnv>();
publicAuth.post('/api/v1/enrollment/options', async (c) => {
  if (c.req.header('origin') !== c.env.AUTH_BASE_URL)
    return c.json({ error: { code: 'INVALID_ORIGIN', message: '请求来源无效' } }, 403);
  const body = z.object({ token: z.string().length(64) }).parse(await c.req.json());
  const limit = await consumeLimit(
    c.env.DB,
    `enroll:${c.req.header('cf-connecting-ip') ?? 'local'}`,
    { window: 60, max: 15 },
  );
  if (!limit.allowed)
    return c.json({ error: { code: 'RATE_LIMITED', message: '请稍后再试' } }, 429);
  await readInvite(c.env.DB, body.token);
  const auth = createAuth(c.env);
  if (await auth.api.getSession({ headers: c.req.raw.headers }))
    return c.json({ error: { code: 'SIGN_OUT_FIRST', message: '请退出当前账户后使用邀请' } }, 409);
  const internal = new URL('/api/auth/passkey/generate-register-options', c.env.AUTH_BASE_URL);
  internal.searchParams.set('context', body.token);
  return auth.handler(new Request(internal, { headers: c.req.raw.headers }));
});

const allowed = new Set([
  'GET /get-session',
  'POST /sign-out',
  'GET /passkey/generate-register-options',
  'GET /passkey/generate-authenticate-options',
  'POST /passkey/verify-registration',
  'POST /passkey/verify-authentication',
  'GET /passkey/list-user-passkeys',
  'POST /passkey/update-passkey',
  'POST /passkey/delete-passkey',
]);
publicAuth.all('/api/auth/*', async (c) => {
  const path = c.req.path.slice('/api/auth'.length);
  if (!allowed.has(`${c.req.method} ${path}`))
    return c.json({ error: { code: 'AUTH_METHOD_DISABLED', message: '此认证方式未启用' } }, 404);
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (session) {
    const access = await readAccess(c.env.DB, session.user.id);
    if (access.status !== 'active' || session.session.authEpoch !== access.auth_epoch)
      return c.json({ error: { code: 'SESSION_REVOKED', message: '请重新登录' } }, 401);
  }
  if (path === '/passkey/generate-register-options' && !session)
    return c.json({ error: { code: 'INVITE_REQUIRED', message: '请使用一次性邀请' } }, 403);
  if (path === '/passkey/delete-passkey') {
    if (!session) return c.json({ error: { code: 'UNAUTHORIZED', message: '请先登录' } }, 401);
    if (c.req.header('origin') !== c.env.AUTH_BASE_URL)
      return c.json({ error: { code: 'INVALID_ORIGIN', message: '请求来源无效' } }, 403);
    const { id } = z.object({ id: z.string().min(1).max(128) }).parse(await c.req.json());
    const removed = await c.env.DB.prepare(
      `DELETE FROM passkey WHERE id=? AND user_id=?
      AND (SELECT count(*) FROM passkey WHERE user_id=?) > 1 RETURNING id`,
    )
      .bind(id, session.user.id, session.user.id)
      .first();
    if (!removed)
      return c.json(
        { error: { code: 'LAST_PASSKEY_REQUIRED', message: '至少保留一枚 Passkey' } },
        409,
      );
    await c.env.DB.prepare(
      'INSERT INTO auth_audit_events (id,target_user_id,action,actor,created_at,details_json) VALUES (?,?,?,?,?,?)',
    )
      .bind(
        crypto.randomUUID(),
        session.user.id,
        'passkey_deleted',
        session.user.id,
        Date.now(),
        JSON.stringify({ passkeyId: id }),
      )
      .run();
    return c.json({ status: true });
  }
  return auth.handler(c.req.raw);
});

export const protectedApi = new Hono<AppEnv>();
protectedApi.use('*', async (c, next) => {
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: { code: 'UNAUTHORIZED', message: '请先登录' } }, 401);
  const access = await readAccess(c.env.DB, session.user.id);
  if (access.status !== 'active' || session.session.authEpoch !== access.auth_epoch)
    return c.json({ error: { code: 'SESSION_REVOKED', message: '会话已失效' } }, 401);
  if (!['GET', 'HEAD'].includes(c.req.method) && c.req.header('origin') !== c.env.AUTH_BASE_URL)
    return c.json({ error: { code: 'INVALID_ORIGIN', message: '请求来源无效' } }, 403);
  c.set('user', session.user);
  c.set('session', session.session);
  await next();
});
protectedApi.get('/me', (c) =>
  c.json({ id: c.var.user.id, name: c.var.user.name, email: c.var.user.email }),
);
protectedApi.route('/topics', topicsRoute);
protectedApi.route('/tags', tagsRoute);
protectedApi.route('/questions', questionsRoute);
protectedApi.route('/', practiceRoute);
protectedApi.route('/attempts', attemptsRoute);
protectedApi.route('/', wrongBookRoute);
protectedApi.route('/statistics', statisticsRoute);
