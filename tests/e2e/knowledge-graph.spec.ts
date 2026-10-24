import { test, expect, type BrowserContext } from '@playwright/test';
import { createE2EAuthenticatedSession } from './e2e-auth';
import type { KnowledgeGraphDto } from '../../shared/types';

async function login(context: BrowserContext) {
  const { sessionCookieValue } = await createE2EAuthenticatedSession();
  await context.addCookies([
    {
      name: 'better-auth.session_token',
      value: sessionCookieValue,
      domain: 'localhost',
      path: '/',
    },
  ]);
}

test('subject graph defaults to notes, expands questions, searches and switches subjects', async ({
  page,
  context,
}, testInfo) => {
  await login(context);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const initial = page.waitForResponse(
    (r) => r.url().includes('/api/v1/graph?subjectId=math1') && !r.url().includes('expandNoteId'),
  );
  await page.goto('/graph/math1');
  const data = (await (await initial).json()) as KnowledgeGraphDto;
  expect(data.nodes.length).toBeGreaterThan(0);
  expect(data.nodes.every((n) => n.kind === 'note')).toBe(true);
  await expect(page.getByRole('heading', { name: '数学一知识图谱' })).toBeVisible();
  await page.getByText('以列表浏览图谱', { exact: true }).click();
  await page
    .getByRole('button', { name: '选择笔记：二重积分的定义与几何意义', exact: true })
    .click();
  const expanded = page.waitForResponse((r) => r.url().includes('expandNoteId='));
  await page.getByRole('button', { name: '展开关联习题', exact: true }).click();
  expect(
    ((await (await expanded).json()) as KnowledgeGraphDto).nodes.some((n) => n.kind === 'question'),
  ).toBe(true);
  await expect(page.getByRole('button', { name: '收起关联习题' })).toBeVisible();
  await expect(page.locator('canvas').first()).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('subject-graph.png'), fullPage: true });
  await page.getByRole('searchbox', { name: '搜索图谱' }).fill('交换积分次序');
  await expect(
    page.getByRole('button', { name: '选择笔记：交换积分次序', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '选择笔记：二重积分的定义与几何意义', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('combobox', { name: '选择科目' }).selectOption('cs408');
  await expect(page).toHaveURL('/graph/cs408');
  await expect(page.getByText('当前范围暂无笔记。', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('note references have backlinks and related questions launch the exact question', async ({
  page,
  context,
}) => {
  await login(context);
  await page.goto('/notes/note.math1.double-integral.calc');
  await page.getByRole('button', { name: '二重积分的定义与几何意义', exact: true }).click();
  await expect(page).toHaveURL('/notes/note.math1.double-integral.def');
  await expect(page.getByRole('button', { name: 'X型与Y型积分区域', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '练习 math1.double-integral.001 →', exact: true }).click();
  await expect(page).toHaveURL(/\/practice\/[^/]+\/1$/);
  await expect(page.getByText('题号 1 / 1', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: '二重积分的定义与几何意义', exact: true }),
  ).toBeVisible();
});

test('drawer preserves selected answer and progress, traps focus and suspends practice shortcuts', async ({
  page,
  context,
}, testInfo) => {
  await login(context);
  const response = await page.request.post('/api/v1/practice-sessions', {
    headers: { Origin: 'http://localhost:5173' },
    data: {
      questionIds: ['math1.double-integral.001', 'math1.double-integral.002'],
      count: 2,
      creationKey: crypto.randomUUID(),
    },
  });
  expect(response.ok()).toBe(true);
  const { sessionId } = await response.json();
  await page.goto(`/practice/${sessionId}/1`);
  const optionB = page.locator('.option-card').nth(1);
  await optionB.click();
  const opener = page.getByRole('button', { name: '二重积分的定义与几何意义', exact: true });
  await opener.click();
  const drawer = page.getByRole('dialog', { name: '考点笔记', exact: true });
  await expect(drawer).toBeVisible();
  await expect(
    drawer.getByRole('heading', { name: '二重积分的定义与几何意义', exact: true }).first(),
  ).toBeVisible();
  await page.keyboard.press('a');
  await page.keyboard.press('ArrowRight');
  // Enter is left to the focused modal control; it must never submit the practice behind it.
  await drawer
    .getByRole('heading', { name: '二重积分的定义与几何意义', exact: true })
    .first()
    .click();
  await page.keyboard.press('Enter');
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('practice-drawer.png') });
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();
  await expect(opener).toBeFocused();
  await expect(optionB).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('题号 1 / 2', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '解析详情' })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.option-card').nth(1)).toHaveAttribute('aria-pressed', 'true');
});

test('mobile drawer supports reference navigation and keeps a subjective draft', async ({
  page,
  context,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(context);
  const response = await page.request.post('/api/v1/practice-sessions', {
    headers: { Origin: 'http://localhost:5173' },
    data: { types: ['written'], count: 1, creationKey: crypto.randomUUID() },
  });
  expect(response.ok()).toBe(true);
  const { sessionId } = await response.json();
  await page.goto(`/practice/${sessionId}/1`);
  await page.getByRole('textbox').fill('先画积分区域，再交换积分次序。');
  await page.getByRole('button', { name: 'X型与Y型积分区域', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: '考点笔记', exact: true });
  await drawer.getByRole('button', { name: '二重积分的定义与几何意义', exact: true }).click();
  await expect(
    drawer.getByRole('heading', { name: '二重积分的定义与几何意义', exact: true }).first(),
  ).toBeVisible();
  await drawer.getByRole('button', { name: '← 上一篇', exact: true }).click();
  await expect(
    drawer.getByRole('heading', { name: 'X型与Y型积分区域', exact: true }).first(),
  ).toBeVisible();
  expect((await drawer.boundingBox())?.width).toBe(390);
  await page.screenshot({ path: testInfo.outputPath('mobile-drawer.png') });
  await drawer.getByRole('button', { name: '关闭考点笔记' }).click();
  await expect(page.getByRole('textbox')).toHaveValue('先画积分区域，再交换积分次序。');
  await expect(page.getByRole('textbox')).toBeEnabled();
  await expect(page.getByRole('heading', { name: '解析详情' })).toHaveCount(0);
});
