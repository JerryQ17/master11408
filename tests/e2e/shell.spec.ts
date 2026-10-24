import { test, expect } from '@playwright/test';

test('serves the app at deep links and keeps API routing separate', async ({ page, request }) => {
  await page.goto('/study/demo');
  await expect(page.getByRole('heading', { name: '日日有进。' })).toBeVisible();
  const response = await request.get('/api/v1/health');
  expect(response.ok()).toBeTruthy();
  expect(await response.json()).toMatchObject({ status: 'ok' });
  expect((await request.get('/api/not-a-route')).status()).toBe(404);
});
