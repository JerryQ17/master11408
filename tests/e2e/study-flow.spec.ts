import { test, expect } from '@playwright/test';
import { createE2EAuthenticatedSession, createE2EInvite } from './e2e-auth';

test.describe('11408 Study — End-to-End User Journeys', () => {
  test('1. Unauthenticated users are redirected to login and protected APIs return 401', async ({
    page,
    request,
  }) => {
    // 访问受保护页面自动重定向到 /login
    await page.goto('/study/math1.double-integral.definition');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: '日日有进。' })).toBeVisible();
    await expect(page.getByRole('button', { name: /使用 Passkey 登录/ })).toBeVisible();

    // 未授权请求受保护 API 返回 401
    const meRes = await request.get('/api/v1/me');
    expect(meRes.status()).toBe(401);

    const practiceRes = await request.get('/api/v1/practice-sessions');
    expect(practiceRes.status()).toBe(401);
  });

  test('2. Passkey registration via enrollment invite and virtual authenticator', async ({
    page,
    context,
  }) => {
    // 准备一个一次性高熵邀请码
    const { token } = await createE2EInvite();

    // 通过 Chrome DevTools Protocol 注入虚拟 WebAuthn 认证器
    const cdpSession = await context.newCDPSession(page);
    await cdpSession.send('WebAuthn.enable');
    await cdpSession.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
      },
    });

    // 打开一次性邀请注册页面
    await page.goto(`/enroll#token=${token}`);
    await expect(page.getByRole('heading', { name: '开始你的学习旅程' })).toBeVisible();

    // 输入设备名称并点击创建 Passkey
    const deviceInput = page.getByLabel('设备名称');
    await deviceInput.fill('我的主力工作站');
    await page.getByRole('button', { name: /创建 Passkey 并进入/ }).click();

    // 成功完成注册后自动跳转至主空间
    await expect(page).toHaveURL(/\/(study)?/);
    await expect(page.getByText('E2E 考生')).toBeVisible();

    // 进入设置页面核验 Passkey 列表
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: '账户与偏好' })).toBeVisible();
    await expect(page.getByText('我的主力工作站')).toBeVisible();

    // 点击退出登录
    await page.getByRole('button', { name: '退出' }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('3. Knowledge point reading with KaTeX math and example references', async ({
    page,
    context,
  }) => {
    // 注入已登录会话
    const { sessionCookieValue } = await createE2EAuthenticatedSession();
    await context.addCookies([
      {
        name: 'better-auth.session_token',
        value: sessionCookieValue,
        domain: 'localhost',
        path: '/',
      },
    ]);

    // 进入数学一二重积分知识点笔记页面
    await page.goto('/study/math1.double-integral.definition?tab=notes');

    // 验证左侧知识点目录加载
    await expect(page.getByText('复习导航')).toBeVisible();
    await expect(page.getByText('数学一', { exact: true })).toBeVisible();

    // 验证笔记标题与正文渲染
    await expect(
      page.getByRole('heading', { name: '二重积分的定义与几何意义' }).first(),
    ).toBeVisible();

    // 验证 KaTeX 数学公式渲染成功
    const katexElements = page.locator('.katex');
    await expect(katexElements.first()).toBeVisible();

    // 验证笔记中练习相关操作可用
    await expect(page.getByRole('button', { name: '练习本节习题 ↗' })).toBeVisible();
    await expect(page.getByText('前往练习该题 →')).toBeVisible();
  });

  test('4. Practice generation, single-choice question submission and instant feedback', async ({
    page,
    context,
  }) => {
    const { sessionCookieValue } = await createE2EAuthenticatedSession();
    await context.addCookies([
      {
        name: 'better-auth.session_token',
        value: sessionCookieValue,
        domain: 'localhost',
        path: '/',
      },
    ]);

    // 进入习题演练 Tab
    await page.goto('/study/math1.double-integral.definition?tab=practice');
    await expect(page.getByRole('heading', { name: '自由练习' })).toBeVisible();

    // 点击开始练习，创建固定顺序题组
    await page.getByRole('button', { name: '开始练习 →' }).click();

    // 进入练习界面，一屏一题
    await expect(page.getByText(/题号 1 \//)).toBeVisible();
    await expect(page.getByText('单选题')).toBeVisible();

    // 选中选项 A
    const optionA = page.locator('.option-card').first();
    await optionA.click();
    await expect(optionA).toHaveClass(/border-ctp-mauve/);

    // 提交作答
    await page.getByRole('button', { name: /提交答案/ }).click();

    // 提交后即时返回判题结果和解析
    await expect(page.getByText(/✓ 正确|✕ 错误/)).toBeVisible();
    await expect(page.getByText(/参考答案：/)).toBeVisible();
    await expect(page.getByRole('heading', { name: '解析详情' })).toBeVisible();

    // 刷新页面测试跨刷新保持已作答状态与解析
    await page.reload();
    await expect(page.getByText(/题号 1 \//)).toBeVisible();
    await expect(page.getByText(/✓ 正确|✕ 错误/)).toBeVisible();
    await expect(page.getByRole('heading', { name: '解析详情' })).toBeVisible();
  });

  test('5. Subjective question reveal, self-evaluation, and correction flow', async ({
    page,
    context,
  }) => {
    const { sessionCookieValue } = await createE2EAuthenticatedSession();
    await context.addCookies([
      {
        name: 'better-auth.session_token',
        value: sessionCookieValue,
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page.goto('/study/math1.double-integral.definition?tab=notes');

    // 在已登录的页面上下文创建主观题单题题组
    const { sessionId } = await page.evaluate<{ sessionId: string }>(async () => {
      const res = await fetch('/api/v1/practice-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creationKey: `e2e-subj-${Date.now()}`,
          types: ['written'],
          count: 1,
        }),
      });
      return await res.json();
    });
    expect(sessionId).toBeTruthy();

    // 直达该题组作答页面
    await page.goto(`/practice/${sessionId}/1`);
    await expect(page.getByText('解答证明题')).toBeVisible();

    // 初始状态下不呈现解析与答案
    await expect(page.getByText('参考答案：')).not.toBeVisible();
    await expect(page.getByRole('heading', { name: '解析详情' })).not.toBeVisible();

    // 点击“查看解析并自评 →”
    await page.getByRole('button', { name: /查看解析并自评/ }).click();

    // 揭示后展示解析与三个自评按钮
    await expect(page.getByText('等待自评')).toBeVisible();
    await expect(page.getByRole('heading', { name: '解析详情' })).toBeVisible();
    await expect(page.getByRole('button', { name: /✕ 错误（思路偏差或未掌握）/ })).toBeVisible();

    // 自评为“错误”
    await page.getByRole('button', { name: /✕ 错误（思路偏差或未掌握）/ }).click();
    await expect(page.getByRole('button', { name: /更正自评结果/ })).toBeVisible();

    // 更正自评为“正确”
    await page.getByRole('button', { name: /更正自评结果/ }).click();
    await page.getByRole('button', { name: /✓ 正确（完全符合）/ }).click();
    await expect(page.getByText('✓ 正确')).toBeVisible();
  });

  test('6. Wrong book and Statistics calculation verification', async ({ page, context }) => {
    const { sessionCookieValue } = await createE2EAuthenticatedSession();
    await context.addCookies([
      {
        name: 'better-auth.session_token',
        value: sessionCookieValue,
        domain: 'localhost',
        path: '/',
      },
    ]);

    // 访问错题本页面，切换三个口径分类
    await page.goto('/wrong-book');
    await expect(page.getByRole('heading', { name: '错题与复习本' })).toBeVisible();
    await expect(page.getByRole('button', { name: /待复习/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /最近做错/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /曾经做错/ })).toBeVisible();

    await page.getByRole('button', { name: /最近做错/ }).click();
    await expect(page.getByRole('button', { name: /最近做错/ })).toHaveClass(/bg-ctp-mauve/);

    // 访问学习统计页面，验证 5 大指标卡片展示
    await page.goto('/statistics');
    await expect(page.getByRole('heading', { name: '学习数据统计' })).toBeVisible();
    await expect(page.getByText('已做题数')).toBeVisible();
    await expect(page.getByText('最近结果正确率')).toBeVisible();
    await expect(page.getByText('历史作答正确率')).toBeVisible();
    await expect(page.getByText('待自评题数')).toBeVisible();
    await expect(page.getByText('待复习题数')).toBeVisible();
  });

  test('7. Catppuccin 4 themes dropdown selector switches data-theme attribute and persists', async ({
    page,
  }) => {
    await page.goto('/login');
    const selector = page.getByRole('combobox', { name: '选择 Catppuccin 主题' });
    await expect(selector).toBeVisible();

    // 切换到 Latte 浅色
    await selector.selectOption('latte');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'latte');
    await expect(page.locator('html')).not.toHaveClass(/dark/);

    // 切换到 Frappé 柔暗
    await selector.selectOption('frappe');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'frappe');
    await expect(page.locator('html')).toHaveClass(/dark/);

    // 切换到 Macchiato 经典
    await selector.selectOption('macchiato');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'macchiato');

    // 切换到 Mocha 纯黑
    await selector.selectOption('mocha');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'mocha');

    // 刷新页面，验证持久化
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'mocha');
  });

  test('8. Option KaTeX math rendering and keyboard shortcuts (A-D selection, Enter submit and next)', async ({
    page,
    context,
  }) => {
    const { sessionCookieValue } = await createE2EAuthenticatedSession();
    await context.addCookies([
      {
        name: 'better-auth.session_token',
        value: sessionCookieValue,
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page.goto('/study/math1.double-integral.definition?tab=practice');

    // 固定第 3、4 题，首题包含 \pi 和 2\pi 选项。
    const { sessionId } = await page.evaluate<{ sessionId: string }>(async () => {
      const res = await fetch('/api/v1/practice-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creationKey: `e2e-katex-opt-${Date.now()}`,
          questionIds: ['math1.double-integral.003', 'math1.double-integral.004'],
          types: ['single_choice'],
          count: 2,
        }),
      });
      return await res.json();
    });

    await page.goto(`/practice/${sessionId}/1`);
    await expect(page.getByText('单选题')).toBeVisible();

    // 验证选项内 KaTeX 数学公式正常渲染（如 \pi, 2\pi）
    const optionKatex = page.locator('.option-card .katex');
    await expect(optionKatex.first()).toBeVisible();

    // 键盘按下 'a' 键快速选中选项 A
    await page.keyboard.press('a');
    const optionA = page.locator('.option-card').first();
    await expect(optionA).toHaveClass(/border-ctp-mauve/);

    // 键盘按下 'Enter' 键提交作答
    await page.keyboard.press('Enter');

    // 验证答案提交并展示结果
    await expect(page.getByText(/✓ 正确|✕ 错误/)).toBeVisible();

    // 判分完成后，再次按下 'Enter' 键自动切换到下一题
    await page.keyboard.press('Enter');
    await expect(page.getByText(/题号 2 \//)).toBeVisible();
  });
});
