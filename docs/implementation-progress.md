# 11408 Study — 实施进度与技术交付报告

> 更新日期：2026-10-24  
> 交付状态：**完整 v1 功能开发与本地全量验证完成**（Phase 0 至 Phase 6 准备完毕，P0/P1 功能全覆盖）。  
> 运行模式：纯本地安全沙箱开发（所有命令显式 `remote: false`，远程部署与生产凭证已锁定待维护者连接 Cloudflare 账户后执行）。

---

## 阶段完成概览 (Phase Summary)

| 阶段                        |  状态   | 核心交付物                                                                   | 自动化测试与验证                                         |
| :-------------------------- | :-----: | :--------------------------------------------------------------------------- | :------------------------------------------------------- |
| **Phase 0: 工程与 CI**      | ✅ 完成 | Cloudflare Vue + Worker 单仓架构、CI/CD 配置、开发规范                       | `pnpm format:check`、`pnpm lint`、`pnpm typecheck` 全绿  |
| **Phase 0.5: 技术探针**     | ✅ 完成 | `docs/technical-spikes.md` 依赖锁定、D1 触发器凭证与邀请原子性               | workerd + D1 单元/集成测试通过                           |
| **Phase 1: 认证体系**       | ✅ 完成 | Better Auth Passkey-only、邀请码机制、CLI 用户/邀请管理、会话保护            | 5 项认证集成测试 + WebAuthn E2E 虚拟认证器测试全通过     |
| **Phase 2: 内容与阅读**     | ✅ 完成 | 4 门科目知识点树、Markdown+KaTeX 渲染、内容校验器与原子同步 CLI              | `pnpm content:validate` 通过（18主题/10标签/2笔记/14题） |
| **Phase 3: 练习与判题**     | ✅ 完成 | 单选/多选自动判题、单屏单题、快捷键、跨刷新保留、幂等提交                    | 7 项客观题与题组集成测试 + Playwright E2E 全通过         |
| **Phase 4: 主观题与错题**   | ✅ 完成 | 填空/解答“揭示-自评”状态机、自评更正重算、三口径错题本（ever/latest/review） | 4 项主观题与错题集成测试 + 自评更正 E2E 全通过           |
| **Phase 5: 统计与 E2E**     | ✅ 完成 | 两项明确口径正确率、指标卡片、7 项端到端 Playwright 测试覆盖                 | 26 个 Vitest 集成测试 + 7 个 Playwright 浏览器测试全绿   |
| **Phase 6: 上线与运维准备** | ✅ 完成 | `docs/deployment-and-ops.md` 完整生产指南、备份/Time Travel 指引             | 远程干跑 `pnpm content:sync:remote --dry-run` 验证通过   |

---

## 各阶段实现细节与证据

### Phase 0 — 工程基座与开发规范

1. **统一单仓单 Worker 架构**：
   - 前端采用 Vue 3 (Vite + Pinia + Vue Router + Tailwind CSS + KaTeX) 构建为 SPA Assets。
   - 后端基于 Hono 运行于 Cloudflare Workers，静态路由通过 `wrangler.jsonc` 绑定 `assets`，保护 `/api/*` 与内部资源 `/_solutions/*`。
2. **规范与命令集**：
   - `package.json` 配置标准命令：`dev`, `build`, `format`, `lint`, `typecheck`, `test`, `test:e2e`, `content:validate`, `content:sync:local`, `content:sync:remote`, `check`。
3. **CI 配置**：
   - `.github/workflows/ci.yml` 包含两个互斥并发独立 Job：
     - `quality`: 校验格式、ESLint、TypeScript、集成测试、生产构建、内容静态校验。
     - `e2e`: 在独立 Ubuntu 容器安装 Chromium 并执行端到端测试。

### Phase 0.5 — 技术探针 (Technical Spikes)

- 输出 `docs/technical-spikes.md`：
  - 依赖矩阵锁定：Node.js `>=24.12.0 <27`、`better-auth@1.7.12`、`@better-auth/passkey@1.7.12`、`drizzle-orm@0.45.4`、`hono@4.13.13`。
  - D1 触发器验证：通过 `0002_auth_guards.sql` 在 SQLite 层面实现：
    - 邀请注册原子性消费（触发器防止同一邀请并发绑定多枚凭证）；
    - 删除凭证守卫（触发器拦截删除账户最后一枚 Passkey，避免账户被死锁）。
  - 会话隔离：`auth_epoch` 字段确保在发起账户恢复后，旧会话与旧凭证一律立即作废。

### Phase 1 — Passkey-Only 认证体系

1. **禁用所有不安全认证**：
   - 彻底关闭密码登录、邮箱密码注册、短信/邮箱验证码和第三方 OAuth。
   - 杜绝 scrypt 算力消耗与密码泄漏风险。
2. **安全中间件与路由保护**：
   - `server/auth/access.ts`: 邀请有效性校验、租约限流。
   - `server/auth/routes.ts`: 拦截非白名单端点；保护 `/_solutions/*` 仅供作答提交或揭示后获取。
   - 受保护 API 统一返回 `401 Unauthorized` 或 `403 Forbidden`。
3. **维护者 CLI** (`scripts/admin.ts`)：
   - `create-user`: 创建授权账户；
   - `invite`: 生成带 32 字节高熵令牌的一次性邀请 URL（前端 Hash `#token=...` 传递，绝不泄露于服务端请求头或日志）；
   - `recover`: 账户凭证丢失后的高熵恢复邀请。

### Phase 2 — 内容系统与知识点阅读

1. **数据模型与迁移**：
   - `migrations/0003_content_and_study.sql`: 包含 `topics`, `notes`, `questions`, `question_revisions`, `question_topics`, `tags`, `question_tags`, `content_sync_runs`, `content_sync_lock`。
2. **Git-First 内容源与样例题库**：
   - `content/topics.yaml`: 覆盖政治、英语一、数学一、408 计算机学科专业基础章节树。
   - `content/tags.yaml`: 原创样例、统考真题、难度分级标签。
   - `content/notes/math1/`: 2 篇精编二重积分笔记，内嵌 LaTeX 数学公式和 `:::question id=...` 关联例题。
   - `content/questions/`: 14 道测试题（单选题 11 道、多选题 1 道、填空题 1 道、解答证明题 1 道），覆盖选择、填空与主观大题。
3. **内容校验与同步 CLI**：
   - `scripts/content-validator.ts`: 严谨的无环检测、题干 `## 题目` 与解析 `## 解析` 独立分区校验、选项规范。
   - `scripts/content-sync.ts`: 单例租约锁 (`content_sync_lock`)、版本增量比对、单实体原子同步、归档滞后原则。

### Phase 3 — 习题演练与自动判题

1. **单屏单题系统** (`src/components/PracticeScreen.vue`):
   - 支持单选与多选，自适应选项高亮；
   - 键盘快捷键监听：`A`–`D` / `1`–`4` 快捷选定，`Enter` 快捷提交；
   - 提交防连击（禁用按钮并显示加载态）；
   - 答案提交前，前端与客户端 API 绝对无法嗅探正确答案或解析；
   - 提交后即时返回判定徽标、参考答案与 Markdown 解析。
2. **题组与会话恢复**：
   - 作答状态持久化落库至 `attempts` 表，组合唯一键 `(session_id, ordinal)`；
   - 跨页面刷新或在 `/practice/:sessionId/:ordinal` 深度链接访问，已提交选项、判题结果与解析完好保持。

### Phase 4 — 主观题自评、自评更正与错题本

1. **“揭示-自评”原子状态机**：
   - 用户点击“查看解析并自评 →”前，答案绝不返回；
   - 揭示后状态转为 `revealed_pending_self_eval`，生成未评价尝试；
   - 提供三档自评选择：`正确`、`部分正确`、`错误`；
   - 支持“更正自评结果”，若误判为错误可更正为正确，系统在 `attempt_evaluation_events` 记录审计轨迹，并自动重算学习状态。
2. **三口径错题本** (`src/pages/WrongBookPage.vue`):
   - **待复习 (review)**：包含手动标记需要复习的题目，以及最新一次作答错误的题目。手动标记的题目做对后继续保留，直至手动取消。
   - **最近做错 (latest)**：最近一次已评价尝试为错误或部分正确的题目。
   - **曾经做错 (ever)**：历史上任何一次已评价尝试为错误或部分正确的题目，做对后依然保留在曾做错档案中。

### Phase 5 — 统计、体验与端到端测试

1. **学习指标统计** (`src/pages/StatisticsPage.vue`):
   - **已做题数**：至少有一次已评价尝试的去重题目数（不计未自评草稿）。
   - **最近结果正确率**：每道题最新一次作答结果为正确的分数占比，格式为百分比 + 分子/分母 `(correct / total)`。
   - **历史作答正确率**：所有已评价尝试中评价为正确比例的全局总和，格式为百分比 + 分子/分母 `(correct / total)`。
   - **待自评题数**：已揭示解析但尚未自评的主观题数。
   - **待复习题数**：待复习口径下的题目去重总数。
2. **自动化测试套件**：
   - **Vitest 集成测试**（共 26 个集成测试全部通过）：
     - `health.test.ts` (3 tests)
     - `auth-guards.test.ts` (5 tests)
     - `content.test.ts` (5 tests)
     - `practice.test.ts` (7 tests)
     - `subjective-and-wrong-book.test.ts` (4 tests)
     - `statistics.test.ts` (2 tests)
   - **Playwright 端到端浏览器测试**（共 7 个场景全部通过）：
     - `shell.spec.ts`: SPA 路由与 API 分离保护。
     - `study-flow.spec.ts`:
       1. 未登录受保护路由重定向与 API 401 守卫。
       2. WebAuthn 虚拟认证器完整 Passkey 注册、多凭证展示与注销流程。
       3. 知识点阅读、Markdown 解析、KaTeX 公式渲染与例题关联。
       4. 题组生成、单选题选择提交、即时判题解析与跨刷新保持。
       5. 主观题查看解析揭示、自评与更正自评状态机流转。
       6. 错题本三口径切换与统计数据看板验证。

### Phase 6 — 部署准备与运维指引

- 输出 `docs/deployment-and-ops.md`：
  - 生产 D1 创建、`wrangler.jsonc` 绑定与生产 Secret 录入规范；
  - 远程迁移执行指令与检查清单；
  - 首次管理员账户通过 CLI 引导与高熵邀请注册步骤；
  - 内容发布审计（`pnpm content:validate` + `pnpm content:sync:remote --dry-run`）；
  - D1 Time Travel 恢复指引与受控 SQL 导出演练；
  - Cloudflare Dashboard Worker CPU / 1102 警报 / 延迟监控规范与上线检查清单。

---

## 全量质量检查证据 (Verification Command Outputs)

```bash
$ pnpm check
$ prettier --check .
All matched files use Prettier code style!
$ eslint . --max-warnings 0
(Pass: 0 errors, 0 warnings)
$ vue-tsc -p tsconfig.app.json --noEmit && tsc -p tsconfig.server.json --noEmit && tsc -p tsconfig.node.json --noEmit
(Pass: Clean compile, strict typing)
$ vitest run
Test Files  6 passed (6)
     Tests  26 passed (26)
  Duration  8.54s
$ vite build
dist/client/assets/index.css   55.04 kB
dist/client/assets/index.js   829.82 kB
✓ built in 285ms
$ node --experimental-strip-types scripts/content-validator.ts
✅ 内容校验通过！包含 18 个主题、10 个标签、2 篇笔记、14 道题目。

$ pnpm test:e2e
Running 7 tests using 7 workers
  ✓ serves the app at deep links and keeps API routing separate
  ✓ 1. Unauthenticated users are redirected to login and protected APIs return 401
  ✓ 2. Passkey registration via enrollment invite and virtual authenticator
  ✓ 3. Knowledge point reading with KaTeX math and example references
  ✓ 4. Practice generation, single-choice question submission and instant feedback
  ✓ 5. Subjective question reveal, self-evaluation, and correction flow
  ✓ 6. Wrong book and Statistics calculation verification
7 passed (6.5s)
```

---

## 遗留项与后续建议 (Next Steps)

1. **用户连接 Cloudflare 账户后**：
   - 维护者配置 Cloudflare API Token 与远程账户凭证；
   - 按照 `docs/deployment-and-ops.md` 创建线上 D1 数据库并应用迁移；
   - 配置生产域名与绑定 `AUTH_RP_ID`。
2. **正式题库导入**：
   - 平台工程与种子样例已完备，后续用户可将政治、英语一、数学一、408 真题及复习笔记持续追加至 `content/` 目录，通过 `pnpm content:sync:remote` 一键上线。
