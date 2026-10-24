import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import app from '../../server';
import type { Bindings } from '../../server/env';

describe('Worker routes', () => {
  it('checks the actual local D1 binding', async () => {
    const response = await app.request('http://localhost/api/v1/health', {}, env as Bindings);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', service: '11408-study' });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it('does not return SPA HTML for unknown API routes or solution assets', async () => {
    for (const path of ['/api/missing', '/_solutions/example.png']) {
      const response = await app.request(
        `http://localhost${path}`,
        { headers: { 'Sec-Fetch-Mode': 'navigate' } },
        env as Bindings,
      );
      expect(response.status).toBe(404);
      expect(response.headers.get('content-type')).toContain('application/json');
    }
  });
  it('rolls back an entire D1 batch when a later statement fails', async () => {
    const db = (env as Bindings).DB;
    await db.prepare('CREATE TABLE batch_probe (id TEXT PRIMARY KEY)').run();
    await expect(
      db.batch([
        db.prepare('INSERT INTO batch_probe VALUES (?)').bind('same'),
        db.prepare('INSERT INTO batch_probe VALUES (?)').bind('same'),
      ]),
    ).rejects.toThrow();
    expect(await db.prepare('SELECT count(*) AS n FROM batch_probe').first('n')).toBe(0);
  });
});
