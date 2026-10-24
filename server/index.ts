import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { APIError } from 'better-auth/api';
import { publicAuth, protectedApi } from './auth/routes';
import type { Bindings } from './env';

const app = new Hono<{ Bindings: Bindings }>();
app.use('*', secureHeaders());
app.use('/api/*', bodyLimit({ maxSize: 65536 }));
app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'private, no-store');
  await next();
});
app.get('/api/v1/health', async (c) => {
  await c.env.DB.prepare('SELECT 1').first();
  return c.json({ status: 'ok', service: '11408-study' });
});
app.route('/', publicAuth);
app.route('/api/v1', protectedApi);
app.all('/_solutions/*', (c) =>
  c.json({ error: { code: 'NOT_FOUND', message: '资源不存在' } }, 404),
);
app.all('/api/*', (c) => c.json({ error: { code: 'NOT_FOUND', message: '接口不存在' } }, 404));
app.notFound((c) => c.env.ASSETS.fetch(c.req.raw));
app.onError((error, c) => {
  if (error instanceof z.ZodError || error instanceof SyntaxError)
    return c.json({ error: { code: 'INVALID_INPUT', message: '输入格式不正确' } }, 422);
  if (error instanceof APIError)
    return c.json(
      { error: { code: 'AUTHORIZATION_DENIED', message: '邀请无效或账户不可用' } },
      403,
    );
  return c.json({ error: { code: 'INTERNAL_ERROR', message: '请求失败，请稍后重试' } }, 500);
});
export default app;
