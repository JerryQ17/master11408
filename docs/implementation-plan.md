# 11408 Study — 面向 Coding Agent 的完整实现计划

> 状态：完整 v1 细化规格；产品决策已确认，外部依赖须通过 Phase 0.5 验证
> 日期：2026-10-24
> 交付目标：可在 Cloudflare Workers 部署、使用 Passkey 登录、浏览知识点、按章节/标签练习、自动或手动判题、持久化答题记录和错题的单用户/少量用户复习平台。
> 2026-10-24 已获授权开始实现；先完成 CI，再推进功能。用户连接 Cloudflare 前仅本地开发，不部署。审查记录见 [implementation-plan-review.md](./implementation-plan-review.md)，进度见 [implementation-progress.md](./implementation-progress.md)。

### 已确认的交付决策（2026-10-24）

1. **交付完整 v1**：本文所有 v1 功能和端到端验收均必须完成；P0/P1 只表示开发先后，不表示可以省略 P1。
2. **手动复习独立保存**：手动标记的题答对后仍保留，直到主动取消；仅因最新答错进入待复习的题，后续做对后自动移出。
3. **更正自评重算统计**：误评为错误后更正为正确，不再因该次误评计入“曾经做错”；修改日志仍保留。其他真正错误的尝试继续计入。
4. **交付平台和原创样例**：真实复习资料由用户后续维护；首版不承担整理完整四科课程资料。样例必须足以运行全部验收场景。
5. **统计使用明确名称**：分别展示“最近结果正确率”和“历史作答正确率”，不单独显示含义模糊的“正确率”。
6. **内容按实体原子同步**：允许一次导入部分成功，每道题的版本及关联必须完整一致；失败可重跑，只有全部更新成功后才开始归档缺失内容。不引入整库发布版本。

## 0. Agent 工作指令（必须遵守）

1. 获得后续实现指令后，按本文 Phase 0→0.5→1→2→3→4→5→6 的顺序推进。每个 Phase 均应留下可运行代码、与该阶段风险相称的自动化测试和简短进度记录；不要只生成页面 mock。
2. 采用 **Vue 3 + TypeScript + Vite + Vue Router + Pinia + Tailwind CSS + shadcn-vue（按需）+ Hono + Drizzle ORM + Cloudflare Workers + D1 + Better Auth Passkey**。使用单仓库、单 Worker，同时托管前端 SPA 静态资源与后端 `/api/*`。
3. **认证采用 Passkey-only**：禁用密码登录、邮箱验证码登录与公开注册；无 scrypt。必须实现邀请码/一次性引导注册、登录、注销、多个 Passkey 管理、丢失全部 Passkey 时的管理员恢复路径。
4. **内容 Git-first，查询 D1-first**：知识点和题目在仓库的 Markdown + YAML Frontmatter 中维护，经离线导入 CLI 同步至 D1。客户端不得打包全部题目及答案，不得绕过 API 查询数据库。
5. API 不得在提交/揭示前泄露题目正确答案、解析或通过列表接口间接泄露。用户行为全由服务器授权与判定。
6. 使用 `pnpm`；开启 TypeScript strict、ESLint、Prettier；自动化测试采用 Vitest（Worker 集成使用 `@cloudflare/vitest-plugin`）与 Playwright。
7. 任何对外部依赖 API 的使用，以**安装版本对应的官方文档和类型定义**为准；若具体 API 改名，保持本规格定义的业务行为而非盲目照抄伪代码。不要自行实现 WebAuthn 密码学流程。
8. 部署、远程 D1 迁移、生产数据覆盖和删除是有风险的操作；提供脚本和文档，但未经授权不得实际执行生产部署或破坏性操作。不能以生产秘钥为测试数据。
9. 保持 MVP 简单：不引入 SSR、微服务、Redis、队列、搜索引擎、在线富文本编辑器、AI 自动判卷、复杂 RBAC、支付、学习推荐算法。

## 1. 产品范围和用户体验

### 1.1 范围

- 支持四个顶层科目：政治、英语一、数学一、408 计算机学科专业基础。408 下可含数据结构、计算机组成原理、操作系统、计算机网络；章节均可继续任意嵌套。
- 顶部横向固定两个主 Tab：`知识点`、`习题`；左侧树形导航：科目 / 章节 / 子章节，支持展开折叠、当前节点高亮、面包屑、保留上次展开状态。
- `知识点`模式：当前节点下按顺序展示所属节点（以及约定的子节点）的笔记内容；渲染 Markdown、LaTeX、代码块、图片、例题。父节点的展示规则明确：展示该节点直接关联笔记，另提供“包含子章节”开关（默认关闭），避免一次性渲染整本书。
- `习题`模式：根据当前节点选择题目范围（默认含后代知识点），**一屏一题**，有题号/进度、上一题/下一题、收藏、筛选和键盘操作；答题结果跨刷新、跨设备保留。
- 筛选：题型、难度、来源标签及其后代、年份、答题状态（全部/未做/曾做错/最近做错/待复习/收藏）。同一题可属于多个知识点及多个标签，结果去重。
- 选择题自动判分并立即展示解析；填空/计算/证明/简答等主观题先查看解析，再自评 `正确/部分正确/错误`，可选保存自己的文字答案。
- 练习会话：固定题目集合及顺序，刷新后继续；允许直接“练习本节”以及“创建自定义练习”。所有作答均归属于题组；从笔记直接练一道题时创建单题题组。“再练一次”创建新题组，原题组的已提交答案保持不变。
- 错题本：区分**曾经做错**、**最近一次做错**、**待复习**；不把同一题的每次尝试误当作多道错题。
- 账户：管理员创建少量用户；用户只看自己的进度和答题数据，题库内容可共享。

### 1.2 不在 v1 中实现

在线题库编辑、批量上传题目图片的后台、AI OCR/批改、复杂间隔重复算法、完整模拟考试计时器、离线 PWA、共同协作、公开分享题库、题目评论。目录和数据模型不阻止后续添加。

### 1.3 响应式布局

- 桌面：顶部 Header/双 Tab，左侧 240–300px 树形导航，中央内容区宽度可控。
- 手机：左侧导航改抽屉；顶部两个 Tab 不消失；题目选项有足够触控面积，数学公式横向溢出可滚动。
- URL 使用 `/study/:topicId?tab=notes|practice` 和 `/practice/:sessionId/:ordinal`；通过浏览器前进/后退还原节点和模式。`topicId` 为稳定 ID，标题或 slug 重命名不影响链接；题组 `ordinal` 从 1 开始。
- 保存题目提交时禁用重复点击；反馈 loading/error/retry；默认不允许作答后改变那一次已提交的答案，但可开启新的一次尝试。

## 2. 部署和工程结构

### 2.1 架构

浏览器 Vue SPA → 同源 `/api/*` Hono Worker → D1。可选 R2 用于大型图片；v1 少量图片放仓库并使用内容哈希文件名。题干/笔记图片可作为公开静态资源；解析专用图片按第 4.3 节通过鉴权路由提供，增加 R2 时由后端管理引用。

使用官方 Cloudflare Vue+Vite 模板初始化，保留 Cloudflare Vite plugin、`server/index.ts` 和 SPA 静态资源设置。`wrangler.jsonc` 配置 D1 binding `DB`、静态资源 binding `ASSETS`、`assets.not_found_handling = "single-page-application"`。将 `/api/*` 与内部解析资源前缀 `/_solutions/*` 配入 `assets.run_worker_first`；API 未匹配时返回 JSON 404，直接请求内部资源前缀一律拒绝。`/enroll` 是 SPA 页面，邀请的核验和凭证注册走 Worker API；不要使 API 请求被 SPA fallback 吞掉。该行为需覆盖带 `Sec-Fetch-Mode: navigate` 的请求和构建后预览。

建议文件结构：

```text
11408-study/
├── src/                     # Vue 前端
│   ├── app/                 # router、Pinia、api client
│   ├── components/          # SidebarTree、MarkdownView、QuestionRenderer...
│   ├── pages/               # Login、Enroll、Study、Practice、WrongBook、Settings
│   └── styles/
├── server/
│   ├── index.ts             # Hono 入口 / Better Auth 路由
│   ├── auth/                # Better Auth 初始化、邀请、用户会话
│   ├── db/                  # Drizzle schema、queries
│   ├── routes/              # topics、notes、questions、practice、attempts
│   ├── services/            # 判分、进度状态、题目查询
│   └── validators/          # Zod
├── shared/                  # 前后端共用 DTO、枚举、类型
├── content/                 # 人工审核后的 Markdown 内容源
│   ├── topics.yaml
│   ├── tags.yaml
│   ├── notes/
│   ├── questions/
│   └── assets/
├── scripts/                 # 内容验证/导入、管理员 CLI
├── migrations/              # 版本化 D1 SQL 迁移
├── tests/                   # 服务端集成、前端组件、E2E
├── docs/                    # 使用/部署/备份/内容格式说明
├── wrangler.jsonc
├── vite.config.ts
├── drizzle.config.ts
└── package.json
```

推荐命令：`pnpm dev`、`pnpm build`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:e2e`、`pnpm db:migrate:local`、`pnpm db:migrate:remote`、`pnpm content:validate`、`pnpm content:sync:local`、`pnpm content:sync:remote`、`pnpm deploy`。生产命令须显式提示环境并可要求人工确认。

## 3. 数据模型（D1 / SQLite / Drizzle）

### 3.1 内容表

所有业务 ID 使用**稳定的字符串 ID**，与展示名称分离。FK、UNIQUE 和必需索引必须在迁移中声明；`PRAGMA foreign_keys` 的具体使用遵照 D1 官方行为。业务时间统一为 UTC Unix 毫秒，展示时转换到用户时区；认证库生成的 Date/时间列遵循其 adapter 约定，在边界转换，不擅改生成的 schema。

| 表                   | 主要列 / 约束                                                                                                                                                           | 目的                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `topics`             | `id PK`, `parent_id FK nullable`, `slug`, `title`, `sort_order`, `active`                                                                                               | 任意深度章节树；顶层为四门科目                   |
| `notes`              | `id PK`, `topic_id FK`, `title`, `body_md`, `sort_order`, `content_hash`, `active`                                                                                      | 知识点内容；同章节多篇可排序                     |
| `questions`          | `id PK`, `type`, `difficulty`, `current_revision`, `source_kind`, `exam_year nullable`, `active`                                                                        | 题目稳定实体与筛选元数据                         |
| `question_revisions` | `(question_id, revision) PK`, `type`, `metadata_json`, `stem_md`, `options_json`, `answer_json`, `explanation_md`, `assets_manifest_json`, `content_hash`, `created_at` | 不可变的题型、题干、元数据、答案、解析与资源快照 |
| `question_topics`    | `(question_id, topic_id) PK`                                                                                                                                            | 题目与知识点多对多                               |
| `tags`               | `id PK`, `parent_id FK nullable`, `name`, `slug`, `sort_order`, `exam_year nullable`, `active`                                                                          | 标签树；年份用结构化字段校验                     |
| `question_tags`      | `(question_id, tag_id) PK`                                                                                                                                              | 标签多对多                                       |
| `content_sync_runs`  | `id PK`, `git_sha`, `source_hash`, `target_env`, `started_at`, `finished_at`, `status`, `summary_json`                                                                  | 导入溯源、部分成功和排错                         |
| `content_sync_lock`  | `id PK`, `owner_token`, `fencing_version`, `lease_expires_at`                                                                                                           | 每库单写入者；过期接管时递增 fencing version     |

- `topics` 和 `tags` 导入前检测循环、无效父节点、重复 ID；删除内容时优先 `active=false`，不得级联删除已有做题历史。
- `questions.type` 为 `single_choice | multiple_choice | fill_blank | written`。主观题可包含填写文本；`multiple_choice` 默认需完全匹配全部选项才算正确。选择题为 2–6 个有序选项，键为 A–F，不能重复；不是固定四个选项。
- `difficulty` 为 1–5 整数；`source_kind` 为 `original | exam | reference`。exam 必须填写结构化 exam_year；其他来源不填写 exam_year，避免把编写年份误作考试年份。
- `options_json` 是**有序数组**（`[{"key":"A","content":"..."}]`），而非无序对象；`answer_json` 根据题型校验形状。
- `exam_year` 对真题题源存结构化字段；标签树仍提供“统考真题/2011”这种用户直观筛选。年份标签自身包含 exam_year，不从展示名或 slug 猜测年份；题目关联年份标签时必须与题目字段一致，不允许同时关联多个冲突年份。
- 题型、题干、选项、答案、解析、引用资源或展示元数据（难度、题源、年份）改变时新建 revision；修正章节/标签关联可只更新关联。`questions.type` 是当前版本的筛选投影，历史渲染与判分必须读取 `question_revisions.type`。同步时在同一批次更新 revision、当前指针、筛选投影和关联。
- `practice_session_items`、`attempts` 用组合 FK 指向 `(question_id, revision)`；历史版本和资源不可覆盖。旧题组继续用原版本作答，即使当前版本已更新或题目已归档；归档题不再进入新题组。

### 3.2 用户与学习表

Better Auth + Passkey 自带的 `user/session/account/verification/passkey` 等认证表由**安装版本的官方 schema 生成器**产出，避免手写猜测。关闭不需要的认证方式。

| 表                          | 主要列 / 约束                                                                                                                                                                                                                                                      | 目的                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| `enrollment_invites`        | `id PK`, `token_hash UNIQUE`, `target_user_id FK`, `purpose`, `auth_epoch`, `expires_at`, `consumed_at`, `consumed_passkey_id`, `revoked_at`                                                                                                                       | 首次注册与恢复的高熵一次性邀请                |
| `user_access`               | `user_id PK/FK`, `status`, `auth_epoch`, `updated_at`                                                                                                                                                                                                              | 账户 active / recovery_pending 状态与恢复隔离 |
| `auth_audit_events`         | `id PK`, `target_user_id`, `action`, `actor`, `created_at`, `details_json`                                                                                                                                                                                         | 邀请、凭证变更、CLI 恢复审计；不存令牌        |
| `practice_sessions`         | `id PK`, `user_id FK`, `filter_json`, `creation_key`, `request_hash`, `current_ordinal`, `progress_version`, `created_at`, `updated_at`, `completed_at`                                                                                                            | 固定题组、创建幂等与跨设备位置                |
| `practice_session_items`    | `(session_id, ordinal) PK`, `question_id`, `revision`, `UNIQUE(session_id,question_id)`                                                                                                                                                                            | 固定题目顺序和题目版本                        |
| `attempts`                  | `id PK`, `user_id FK`, `question_id`, `revision`, `session_id`, `ordinal`, `selected_answer_json nullable`, `response_text nullable`, `state`, `result nullable`, `submitted_at`, `evaluated_at nullable`, `evaluation_version`, `idempotency_key`, `request_hash` | 每题组每题一次独立尝试                        |
| `attempt_evaluation_events` | `(attempt_id, evaluation_version) PK`, `previous_result nullable`, `new_result`, `changed_at`                                                                                                                                                                      | 首次自评与更正自评日志                        |
| `user_question_state`       | `(user_id,question_id) PK`, `last_attempt_id`, `latest_evaluated_attempt_id`, `attempt_count`, `evaluated_count`, `correct_count`, `wrong_count`, `last_result`, `manual_review`, `starred`, `state_version`, `updated_at`                                         | 可由尝试重建的聚合状态与独立手动标记          |
| `user_note_state`           | `(user_id,note_id) PK`, `read_status`, `updated_at`                                                                                                                                                                                                                | 可选：阅读进度                                |

尝试的 `state`：`revealed_pending_self_eval | evaluated`（客观题提交时直接 `evaluated`）。`result`：`correct | partial | incorrect | null`。不提交、不揭示不创建完成记录；用户揭示答案即创建待自评尝试。`idempotency_key` 对用户唯一，网络重试只回放同一尝试。

必要约束：`UNIQUE(user_id,idempotency_key)`、`UNIQUE(session_id,ordinal)`、`UNIQUE(user_id,creation_key)`；attempt 的条目、question ID/revision 和 user_id 必须通过组合 FK/对应 UNIQUE 约束关联到同一个题组及条目，不能只验证各列单独存在。题目 ID/版本以该条目为准，用户输入的版本只用于一致性检查。添加 CHECK：evaluated 必须有 result/evaluated_at，pending 则二者为 null。`last_attempt_id` 与 `latest_evaluated_attempt_id` 分开，待自评尝试不得覆盖最近已评价结果。

`attempt_count` 含揭示待自评记录，`evaluated_count` 仅计已评价尝试；`wrong_count` 计当前结果为 partial/incorrect 的尝试数，允许因更正自评减少。聚合可重建，但 `manual_review`、`starred` 不能被重建覆盖。查询时由聚合列计算 `needs_review = manual_review OR COALESCE(last_result IN ('partial','incorrect'), false)`，先以索引和查询计划验证性能，再决定是否增加受一致性约束的派生列。

**重点索引**：`topics(parent_id,sort_order)`、`tags(parent_id)`、`question_topics(topic_id,question_id)`、`question_tags(tag_id,question_id)`、`questions(type,exam_year,active)`、`attempts(user_id,question_id,submitted_at,id)`、`attempts(user_id,session_id)`、`user_question_state(user_id,manual_review)`、`user_question_state(user_id,last_result)`、`practice_sessions(user_id,updated_at,id)`。实际用查询计划调整。

## 4. 认证、安全与首次注册

### 4.1 Better Auth Passkey-only

- Better Auth 在 Hono Worker 中按请求使用 D1 Drizzle adapter（`@better-auth/drizzle-adapter`），并加载 `@better-auth/passkey` 插件和浏览器客户端插件。
- `emailAndPassword.enabled = false`；关闭公开注册及所有不需要的登录方法。用户名是**显示/管理标识**，不是秘密，也不是登录必输字段。允许 Discoverable Credentials / Passkey-first 登录。
- `rpID`、`origin`、`baseURL`、trusted origins 在 dev/staging/prod 各自明确配置。生产选择稳定自定义域名；不同 RP ID 下的 Passkey 不能随意移植。HTTPS 必需（localhost 本地开发例外）。
- 首次创建管理员使用维护 CLI 预置用户（若 Better Auth schema 需要邮箱，填入管理员控制的真实或内部唯一邮箱，但不启用邮件认证），再生成一次性高熵邀请链接。推荐至少注册两枚可独立恢复的 Passkey。
- 官方文档已确认 `registration.requireSession=false`、`resolveUser` 和 `createSession` 的注册能力，但尚未安装依赖、验证其数据库写入时序。`context` 必须通过服务端校验并绑定到预创建用户、邀请用途、有效期和 `auth_epoch`；发起挑战与提交凭证验证时都需核验。已登录时若同时携带邀请，拒绝含糊的跨账户绑定，要求退出后重新操作。
- **邀请原子性是 Phase 0.5 的验证门槛**：WebAuthn 验证由官方插件执行；验证后的“创建 passkey + 消耗邀请 + 认证审计”必须共用一次 D1 原子批次，不能仅在独立 after hook 中标记已使用。优先核实官方 adapter 是否暴露可组合写入点；若没有，验证请求作用域内装饰 adapter 的 passkey 创建操作能否安全加入条件写入。不得假定 Drizzle 普通事务或插件 hook 自动涵盖这些表。
- 原子写入须同时检查邀请仍有效、尚未消费、目标用户和 epoch 匹配；并发提交仅一个凭证能成功落库。数据库写入失败时凭证和消费记录都不留存；凭证已保存但响应/Session 创建失败时邀请仍保持已消费，用户使用刚注册的 Passkey 登录，不重复绑定新凭证。验收包含故障注入和两个并行 WebAuthn ceremony。无法证明该路径时暂停后续认证实现，记录具体 API 限制和可审查的替代方案。
- 正常已登录用户走需要 Session 的 Passkey 添加/删除管理；**不得允许最后一枚 Passkey 被普通删除操作移除**。保护必须覆盖 Better Auth 原生删除端点，并使用原子的条件删除或等效数据库约束；仅在 UI 禁用按钮或先查数量再单独删除均不合格。两个并发删除请求也必须至少留下一个凭证。
- 恢复以维护者的 Cloudflare/D1 管理权限作为独立信任根，不依赖丢失凭证的应用 Session。CLI 确认目标用户后将其设为 `recovery_pending`、递增 epoch、撤销既有 Session 和旧邀请，阻止旧凭证登录并生成短时 recovery 邀请；成功绑定新凭证时原子消费邀请、撤销旧凭证并恢复 active。中途失败保持恢复状态，可用 CLI 重发邀请；全程保留不含秘密的审计记录。日常用户没有恢复入口，也不能从公开注册端点进入该流程。
- Passkey 登录后使用 Better Auth HttpOnly + Secure + SameSite Cookie Session，注销撤销会话。敏感写接口校验来源/CSRF 保护；所有 API 都从 Session 读取 user ID，不信任客户端 userId。
- 注册、登录、邀请核验加限流，返回错误不泄露账号是否存在；WebAuthn 验证必须由成熟库完成（挑战有效期、Origin、RP ID、UV、签名计数等）。配置 discoverable credential、用户验证要求，并在目标设备验证；不得只依赖插件的宽松默认值。
- Better Auth 默认内存限流不作为多 Worker 实例的持久保证；优先验证其 D1/database 存储并生成相应认证表，必要时实现 D1 原子的 `customStorage.consume`。来自自建包装路由的 `auth.api` 调用要单独覆盖限流。生产 IP 来源只信任 Cloudflare 提供的连接信息，本地/E2E 显式开启限流并检查 429。

### 4.2 CPU 预算和部署验证

Workers Free HTTP 请求目前限制 10 ms CPU；WebAuthn 避免 scrypt，但**不能假设整个 Better Auth 工作流必然不超限**。在真实 Cloudflare Worker/staging 上压测 Passkey 注册、认证和正常 API 并观察 CPU/1102；若超限，优先优化或升级 Workers Paid，不要禁用必要安全校验。

### 4.3 其他安全规则

- 普通题目 GET 接口始终使用字段白名单，不输出 `answer_json`、`explanation_md` 或完整内容 hash；仅在成功提交/揭示，或读取本人的对应 attempt 时响应该版本解答。不能用旧版本的完成状态解锁新版本解析，也不能因为别的用户答过而解锁。笔记的受控题目引用只返回题干/练习链接；人工编写的教学例题可包含解答。
- 用户独立数据要求 SQL 同时包含 `user_id = session.user.id`；会话 ID、尝试 ID 不能只校验是否存在。
- 本人的题组/尝试不存在或属于他人时统一返回 404；缺少 Session 返回 401。每个受保护 API 还须检查 `user_access.status`，不能因为存在旧 Cookie 就绕过恢复状态。Better Auth handler 前维护基于安装版本核实的端点清单，只开放需要的认证/Session/Passkey 功能，关闭账号删除等未设计路径。
- **答案资源也需授权**：构建产物不得公开 Markdown/YAML 源、数据库 dump、含答案的客户端数据模块或服务端 sourcemap。解析图片置于 `/_solutions/<hash>`，外部直接访问该路径一律拒绝；`GET /api/v1/attempts/:id/assets/:assetId` 核实本人 attempt 和 revision 的资源清单后，才内部调用 `ASSETS.fetch`。题干不能引用受保护资源；同一图片同时被标为公开和解析专用时拒绝导入。历史版本引用的哈希资源持续保留，缺失资产不能被 SPA 的 index.html 冒充成功响应。
- 用户 API、答案和解析资源响应使用 `Cache-Control: private, no-store`。公共题干/笔记图片可以缓存；仅允许受控的本地资源，外部图片先纳入内容资产流程。v1 接受 PNG/JPEG/WebP，拒绝脚本型 SVG/HTML 资源。页面壳的 CSP/Referrer-Policy 需在静态资源路径同样生效。
- 使用 Zod 进行 API 输入校验；限制 Markdown 大小、选项数、练习最大题量、每页大小和请求 JSON 大小；参数化查询、防 SQL 注入。
- Markdown 禁止不安全原始 HTML，采用可靠解析器和 HTML sanitizer；KaTeX/代码高亮输出也统一走安全渲染路径。防 XSS、强 CSP、Referrer-Policy、X-Content-Type-Options。敏感日志不得记录 Passkey 凭据、Cookie、原始邀请令牌。

## 5. 内容仓库、格式与同步器

### 5.1 内容格式

`content/topics.yaml`、`content/tags.yaml` 定义树，ID 固定，父引用显式。正文为 Markdown + YAML Frontmatter；使用 `remark-math` / `rehype-katex` 或等效稳定链路展示 TeX 公式，代码块语法高亮；支持图片引用。内容中的外链显式标记，图片路径需校验。

题目示例（文件 `content/questions/math1/q-double-001.md`）：

```md
---
id: math1.double-integral.001
type: single_choice
difficulty: 2
topics:
  - math1.double-integral.definition
tags:
  - practice.sample
source_kind: original
options:
  - key: A
    content: '0'
  - key: B
    content: '1/2'
  - key: C
    content: '1'
  - key: D
    content: '2'
answer: C
---

## 题目

设 $D=[0,1]\times[0,1]$，求

$$\iint_D(x+y)\,dx\,dy$$

## 解析

交换为累次积分后可算得 $1$，故选 C。
```

笔记示例：Frontmatter 包含 `id/topic/title/order`，正文可以有 `:::question id=math1.double-integral.001` 这种受控的引用组件；导入器或渲染器转为“查看例题/开始练习”链接。笔记不能复制题库中题目的答案作为可反向查询的私有 API。

题目文档必须恰有一个顶级内容分区 `## 题目` 和一个 `## 解析`，其内部标题使用更低级别；导入器用 Markdown AST 识别分区，忽略代码块内的同名文本。缺失或重复分区拒绝导入。单选 `answer` 是一个有效选项键，多选为去重后的有效键数组，填空/主观题为非空参考答案 Markdown 字符串；主观题不自动匹配答案。版本 hash 覆盖规范化的题型、展示元数据、题干、选项、答案、解析及资源哈希，不能只 hash 正文而遗漏 Frontmatter。

### 5.2 CLI 需求

- `content:validate`：Frontmatter schema、题型选项与答案合法性、topic/tag 引用有效、树无环、ID 唯一、资源路径有效、年份标签与 `exam_year` 一致；报错含文件路径+行号/字段。
- `content:sync:local`：将内容规范化、计算 SHA-256 hash，以稳定 ID upsert 到本地 D1；按新增 revision 记录题目修改；无变更跳过。允许多次重复执行，结果一致。
- `content:sync:remote`：需显式指定目标环境，生成 dry-run 差异（新增/修改/归档），确认后执行；写入 `content_sync_runs`，失败可重试，不删除历史 attempts/revisions。
- 导入器在 Node CLI 运行，**不在 Worker 请求中读取文件系统**；严禁将题库 Markdown 全部注入客户端 bundle。
- 通过小批次参数化语句导入 D1，遵守 D1 语句和绑定参数限制；对每组相关写操作保证原子性，提前验证所有引用以降低半完成风险。
- 附种子数据：四门科目、几层章节、两篇数学一笔记；同一数学章节至少 10 道原创单选，另有多选、填空、written 和数据结构练习，至少一题关联多个知识点/标签。使用“原创样例→数学一”等父子标签；统考真题父子标签可保留为空，不把样例挂入真题分类。年份筛选/冲突校验用明确标为测试数据的夹具验证。真实资料由用户后续维护；不抓取或伪造历年真题。

### 5.3 同步失败、并发与资源发布

1. 扫描并验证**完整内容源**后生成 `source_hash` 和差异报告；远程执行绑定目标环境、数据库 ID、源 hash 和差异 hash，执行前再校验，避免批准一份差异后导入另一份内容。`git_sha` 不能代替工作区源 hash。
2. 同一数据库只允许一个内容同步写入者；使用带 owner token、过期时间和 fencing version 的 D1 租约，续租失败即停止。每个写入批次需在数据库内检查当前租约版本，不能只靠进程内锁或事先检查。导入器先补齐父章节/标签，再导入笔记和题目。
3. 每道题的 revision、当前指针、筛选元数据和关联是一批原子写入；失败不留下孤立版本或缺失关联。允许用户在导入期间看到部分已更新的题，已有题组仍持原快照。失败记录已处理实体与错误，退出码非 0；重跑按当前 hash 跳过成功实体。
4. 所有新增/修改成功后才能归档缺失内容。归档以软删除分批、幂等执行；若归档中途失败，记录已完成部分并在重跑时继续。保留历史题目关联与资产，不能因归档章节/标签破坏仍 active 的题目引用；完整源校验应拒绝此类悬挂关系。
5. 本地 CLI 通过 Wrangler 的 `getPlatformProxy({ remoteBindings: false, ... })` 连接与 `pnpm dev` 相同的 D1 persistence 目录，显式禁用远程绑定；配置自定义目录时核对代理与 Wrangler 的 v3 子目录差异，退出时 dispose。远程 CLI 通过 Cloudflare D1 REST API 发送带参数的查询批次，使用独立最小权限管理凭证，不暴露浏览器可调用的任意 SQL 端点。两种 transport 都必须先验证“第二条写入失败时第一条回滚”，不因同名 batch 就假定远程语义一致。
6. 上线内容资产时先发布新增的不可变哈希文件，再导入引用这些资产的题目 revision，最后在隔离环境 smoke test。旧 revision 引用资产不能随新部署清理；缺失资产拒绝同步。文本同步和资产发布的顺序写入运维文档，不把两者声称为跨服务事务。

初始限制：题组默认 10 题、最多 100；列表默认 20 条、最多 100；单篇内容规范化后最多 128 KiB、单次答题 JSON 最多 64 KiB、自填答案最多 20,000 字符；图片每张最多 1 MiB。单条 SQL 最多 100 个绑定参数，Free 每次 Worker 调用最多 50 次 D1 查询（上线前再核对）；100 题题组创建应采用 `INSERT ... SELECT` 或按绑定参数数目打包的多行 INSERT，不能逐题执行 100 条语句。题目/标签数量较大时不得将整个候选集搬到 Worker 中随机排序。上述值写入共享配置并对边界测试，调整不改变业务语义。

## 6. API 契约（JSON /api/v1）

### 6.1 通用协议

同源 Cookie Session；未登录 401、账户被限制等权限问题 403、JSON/查询参数格式错 400、业务输入非法 422、不存在或属于他人的对象 404、状态冲突 409、频率限制 429。列表统一 `limit/cursor`，游标编码排序字段与稳定 ID，禁止客户端任意拼接排序 SQL；统一 JSON 错误 `{ error: { code, message } }`。自建 `/api/v1` 的请求/响应以 Zod Schema 定义并共享给客户端；`/api/auth` 遵循 Better Auth 官方协议，由客户端适配错误，不假定原生认证接口也使用自建错误结构。禁止 `any`。

| Method | Path                                                     | 行为                                                               |
| ------ | -------------------------------------------------------- | ------------------------------------------------------------------ |
| GET    | `/api/v1/me`                                             | 当前用户与公开资料                                                 |
| GET    | `/api/v1/topics/tree`                                    | 科目/章节树，含节点题数可选                                        |
| GET    | `/api/v1/topics/:topicId/notes?includeDescendants=false` | 当前知识点笔记                                                     |
| GET    | `/api/v1/tags/tree`                                      | 标签层级                                                           |
| GET    | `/api/v1/questions`                                      | 题目列表/筛选摘要，不含答案或解析                                  |
| GET    | `/api/v1/questions/:id?revision=...`                     | 指定题干/选项，不含答案；已作答回顾另走受控接口                    |
| POST   | `/api/v1/practice-sessions`                              | 以条件创建固定、有序题组，返回 `sessionId,count`                   |
| GET    | `/api/v1/practice-sessions/:id`                          | 本用户题组、每题进度、当前索引                                     |
| GET    | `/api/v1/practice-sessions`                              | 本人的最近题组，支持未完成/已完成筛选与分页                        |
| PATCH  | `/api/v1/practice-sessions/:id/progress`                 | 带 `expectedVersion` 更新当前 ordinal；冲突后重新读取              |
| GET    | `/api/v1/practice-sessions/:id/items/:ordinal`           | 题组内一题（不含未公开答案）                                       |
| POST   | `/api/v1/attempts/submit`                                | 客观题提交 → 服务端判分 → 保存 → 返回结果+正确答案+解析            |
| POST   | `/api/v1/attempts/reveal`                                | 主观题揭示 → 保存 `revealed_pending_self_eval` → 返回参考答案+解析 |
| PATCH  | `/api/v1/attempts/:id/self-evaluation`                   | 本人主观题自评；只允许有效状态转移                                 |
| GET    | `/api/v1/attempts?questionId=...`                        | 本人作答历史与已揭示解析                                           |
| GET    | `/api/v1/attempts/:id/assets/:assetId`                   | 本人已提交/揭示版本的解析图片                                      |
| GET    | `/api/v1/wrong-book?mode=ever\|latest\|review`           | mode 为三选一；去重错题/待复习列表                                 |
| PATCH  | `/api/v1/question-state/:questionId`                     | 收藏、主动标记需复习等用户状态                                     |
| GET    | `/api/v1/statistics`                                     | 已做题数、两项明确命名的正确率、待自评/待复习题数                  |

认证由 `/api/auth/*` 的 Better Auth 官方 handler 管理；邀请创建/撤销通过管理员 CLI 或受保护内部命令，不需要对外公开管理员 API。若 `/api/auth/*` 也被 Worker 路由处理，注意 Workers Assets 路由配置。

### 6.2 判题与状态流

**单选/多选**：

1. `GET` 题干与选项，不带正确答案。
2. 用户选择后 `POST /attempts/submit`，参数 `{ practiceSessionId, ordinal, revision, selectedKeys: ["C"], idempotencyKey }`。
3. 服务器核实题组拥有者和条目，以条目确定 question ID/revision/type；拒绝版本不匹配、非法/重复选项、空提交，单选恰好选一项。读取快照中的真正答案判分，写入 `attempts` + 重算该用户该题聚合 + 更新题组完成状态（同一批次保证一致性）。
4. 返回 `{ attemptId, result, correctAnswer, explanationMd }`；UI 显示正误、正确选项、解析。下一题按钮跳转，刷新后可恢复已提交结果。

**填空/大题**：

1. 题干展示，自由输入答案为可选；按钮“查看解析”。
2. `POST /attempts/reveal`，参数 `{ practiceSessionId, ordinal, revision, responseText?, idempotencyKey }`，只接受条目快照类型为 fill_blank/written。保存一次揭示事件，返回正确答案及解析。
3. 用户选 `correct / partial / incorrect`，`PATCH /attempts/:id/self-evaluation`，提交 `{ result, expectedVersion }`，原子更新 attempt、插入评价日志、重算该题聚合与题组完成状态。首次评价的 expectedVersion 为 0；更正每次加 1。
4. 揭示后刷新但未自评时必须恢复到“待自评”而非强制变成正确。自评需要支持明确的“更正自评”操作（保留修改时间），避免误点永久锁死。

**错误判定**：`partial`、`incorrect` 均视作错误；`ever` 为存在当前有效结果错误的尝试，`latest` 为最近已评价尝试错误，`review = manual_review OR latest`。手动标记不被做对覆盖；取消手动标记时若最近仍答错，题目仍留在待复习，并提示原因。最新仍待自评时不覆盖此前已评价结果。更正自评按更正后的结果重算所有统计，评价日志不作为新的错误尝试。

**最近的定义**：按服务端 `submitted_at DESC, id DESC` 在已评价尝试中排序，不按自评更正时间排序。更正很早的一次自评不会把它变成最新尝试。题目跨 revision 的学习状态按稳定 question ID 汇总，历史判分仍使用各自快照；新版本发布不自动清空掌握/错题状态。

**幂等性与一致性**：

- 客户端在一次提交/揭示开始前生成并保存 idempotencyKey，结果不确定时复用；服务端对规范化的端点、题组、条目、revision、答案计算 request hash。同 user 同 key 同请求回放同一 attempt，同 key 不同请求返回 `409 IDEMPOTENCY_CONFLICT`，不能回放另一题的答案。
- 每题组每条目只有一次 attempt。两个设备即使使用不同 key 同时提交，也仅允许一个成功；另一请求返回 `409 ITEM_ALREADY_ATTEMPTED` 并引导读取该条目已有结果。再次练习通过创建新题组完成。
- attempt 插入与聚合重算使用严格唯一约束和同一 `DB.batch`；任一语句失败整批回滚。捕获明确的唯一约束冲突后再核对已有记录和 request hash；不得使用“INSERT OR IGNORE + 无条件计数加一”。自评更正同样原子完成，不做应用层读计数再覆盖。
- 自评按 evaluation_version 条件更新；同版本相同结果的紧邻重试只返回已有结果，不追加日志，冲突时返回 409 并重新读取。只有成功的条件更新才可写对应日志和衍生状态。收藏/手动复习也携带 state_version，避免旧设备覆盖新修改。
- 题组创建另用 creation_key + request hash 幂等，防止创建请求超时产生多个随机题组。对数据库暂时不可用仅做有上限的重试，不能对状态冲突悄悄改 key 后重试。

### 6.3 标签查询和题目去重

筛选父标签时使用 SQLite `WITH RECURSIVE` 获取所有后代 Tag ID；跨知识点或标签关联用 `EXISTS` 或 `DISTINCT` 去重。按需加合理缓存，但 v1 不依赖 KV。筛选规则：不同维度之间 AND，同维度多选 OR；topic 默认含后代，tag 包含所选父标签及后代；年份独立匹配结构化 exam_year。`unattempted` 指没有任何 attempt，揭示待自评已算尝试过，但不计入已做题数。

题组默认 10 题、上限 100，明确 `ordered | random`。ordered 使用选中章节子树的深度优先顺序、章节 sort_order 和稳定 ID；一题关联多个章节时按最先命中的章节定位。random 在数据库查询阶段限制返回数量，将顺序和 revision 一并快照保存。题组创建对当前指针与条目插入使用一致快照的批次，发布更新/筛选状态改变都不重新生成既有题组。候选不足时使用实际数量，0 题返回 `{ sessionId: null, count: 0 }` 并显示空态，不保存空题组。

### 6.4 恢复、完成与统计口径

- 条目 GET 返回无答案的题目 DTO，以及本人该条目的 attempt（若有）；仅存在本人 attempt 时返回对应版本 solution。刷新恢复以服务器为准。未提交的选项/文字仅在当前设备 `sessionStorage` 暂存；已提交结果、待自评状态和题组位置跨设备同步，v1 不承诺未提交草稿跨设备同步。
- current_ordinal 用 progress_version 条件更新；冲突重新读取，URL 中显式指定的合法 ordinal 仍可访问，不强制跳回远端位置。GET 本身不写浏览进度，前端显式 PATCH。
- 题组全部条目存在 evaluated attempt 时才完成；跳过和待自评都不算完成。列表展示“已评价 x/y、待自评 n”，支持重新进入未完成题组。
- **已做题数**：至少有一次已评价尝试的去重题数；**最近结果正确率**：最近已评价结果 correct 的题数 / 已做题数；**历史作答正确率**：当前结果 correct 的已评价 attempt 数 / 所有已评价 attempt 数。partial 不计 correct，待自评不进入分母，分母为 0 返回 null 并显示“—”。同时返回分子/分母，避免仅传舍入百分比。
- 待自评题数按 question ID 去重，题组/历史可列出同题的多条待自评尝试；待复习题数按 review 集合去重。旧 revision 的评价计入同题统计；统计和错题本保留已归档题，标记“已归档”并允许回看，但新题组不能选入归档题。内容归档不应默默改变历史正确率或抹掉错题。

## 7. 前端组件与页面

### 7.1 核心组件

- `AppShell`：顶部两个 Tab、登录用户菜单、响应式 Sidebar。
- `TopicTree`：递归树、选中节点、展开状态、章节计数；大章节按需加载/虚拟化为后续优化。
- `MarkdownRenderer`：数学公式、代码、图片、安全 HTML；支持长公式横向滚动。
- `NoteReader`：当前章节多篇知识点及引用例题。
- `PracticeFilters`：题型、标签（树）、难度、年份、复习状态、题量、顺序。
- `PracticeScreen`：单题呈现、题目进度、导航、收藏、状态反馈。
- `QuestionRenderer`：根据 `type` 切换 `ChoiceQuestion` / `SubjectiveQuestion`；选项内容可含数学公式与代码。
- `SolutionPanel`：仅提交或揭示后加载、可折叠解析。
- `WrongBook`：三种口径与章节筛选。
- `SettingsPage`：用户信息、管理多枚 Passkey（不允许删除最后一枚）、退出登录。

### 7.2 路由与交互

- `/login`：Passkey 登录；`/enroll#token=...`：初始邀请注册，前端读入内存后立即 `history.replaceState` 清理 fragment，再经请求体提交服务端；不写 localStorage、不加载第三方分析脚本。注册未完成刷新时提示重新打开原邀请；旧式 query token 链接不再生成。默认 enrollment 邀请 24 小时、recovery 邀请 15 分钟，可由维护 CLI 缩短。
- `/study/:topicId`：`?tab=notes|practice`；可在同一章节切换 Tab，不丢失选中导航节点。
- `/practice/:sessionId/:ordinal`：可直接恢复题组单题；提交前给出必要确认；上/下题支持键盘快捷键（避免在输入框内触发）。
- `/wrong-book`、`/settings`。
- 选项状态：`idle → selected → submitting → graded`；主观题：`idle → revealing → pending_self_eval → evaluated`。失败回到可重试状态，不误记已完成。
- 路由鉴权：未登录跳登录页，登录后恢复原目标；真实授权始终由后端完成。

## 8. 实施阶段及验收标准

### Phase 0 — 工程脚手架和本地运行

- 初始化 Cloudflare 官方 Vue Worker + Vite 项目，接入 Hono、TypeScript、Pinia、Router、Tailwind、shadcn-vue（按需）。
- 配好 D1 本地 binding、Drizzle schema/migrations、ESLint/Prettier、Vitest、Playwright、基础 GitHub Actions。
- `pnpm dev` 启动时 `/` 能展示 Vue，`/api/v1/health` 返回可读健康状态，`/study/demo` 可由 SPA 正确 fallback；本地 D1 migration 一键执行。
- **验收**：CI 通过 lint/typecheck/build/test；Worker 代码确实在 workerd 中运行。

### Phase 0.5 — 依赖与原子操作验证（进入完整功能前）

- 固定 Node/pnpm 版本、直接依赖版本和 lockfile，记录 Vue/Vite/Workers 测试插件及 Better Auth/Passkey/Drizzle adapter 的兼容矩阵。不在运行时或 CI 中临时使用 `@latest` 生成 schema。
- 最小认证切片：生成认证 schema，在 workerd + 本地 D1 里跑通邀请注册、Passkey 登录、注销。用浏览器虚拟认证器触发两个并行注册，验证注册凭证落库与邀请消费的原子边界；验证两个并发删除不会删光凭证。确认采用官方写入扩展点还是请求作用域 adapter 装饰，并记录代码位置和类型依据。
- 最小学习切片：在 D1 上验证严格唯一键冲突、批次中途失败、同题多请求下 attempt 和聚合一致；实现前先确定完整 SQL 操作序列，不用普通 SQLite 内存测试替代 workerd/D1 结果。
- 最小导入切片：验证本地 Node 代理的 persistence 路径和带参数 batch；远程 REST 回滚语义在后续获授权的隔离 staging D1 上验证。在完成远程验证前，远程同步命令只能生成 dry-run，不能标记为可上线。
- **验收**：输出 `docs/technical-spikes.md`，包括安装版本、验证命令、成功/失败证据、仍待远程验证项；邀请原子性或凭证删除保护若不能实现，先提出明确替代方案，不能通过 mock、开放注册或降低认证要求继续后续功能。

### Phase 1 — 认证（必须先完整可用）

- 完整 Better Auth Passkey + D1 schema，初始管理员/邀请 CLI，首次注册、登录、会话、注销、增加第二枚 Passkey、删除非最后一枚、恢复文档。
- 分 dev 和 prod origin/RP ID；写授权中间件。
- **验收**：无邀请不能注册；邀请失效/过期/并发重放被拒；新设备 Passkey 可以登录；无会话访问受保护 API 401；用户 A 无权访问 B；完全没有密码哈希和密码登录路径。恢复期间旧凭证/旧 Session 不可用，换绑成功后新凭证可登录；邀请和限流故障测试通过。

### Phase 2 — 内容导入和知识点阅读

- 完成内容 schema、验证、同步 CLI、种子数据；章节和标签递归查询 API。
- 完成 Sidebar、双 Tab、面包屑、Markdown+LaTeX、示例题引用、移动端抽屉。
- **验收**：修改一篇笔记并重新同步只更新该文章；重复同步幂等；失败重跑不重复新增 revision，归档只在所有更新成功后开始；重命名标题不损坏历史 ID；数学与代码均正确渲染；章节导航可深链。构建产物不含内容源/客户端答案，解析图片直接访问被拒；种子题数足以运行 10 题题组。

### Phase 3 — 题库筛选和选择题

- 题库 API、条件筛选、单题展示；题组创建与恢复；单选/多选自动判题、解析、答题历史、幂等写入。
- **验收**：同一题关联两个知识点不会重复；父标签可筛子标签；未答题请求绝不含答案；提交后写入正确且可刷新恢复；重复点击/网络重试不重复记分。相同 key 不同请求冲突；两个设备不同 key 提交同一条目只产生一条 attempt；旧版本题型/答案和归档后的原题组仍可正确判题。

### Phase 4 — 主观题、自评和错题本

- 填空/大题的“揭示-自评”状态机，历史记录、手动收藏、错题三种口径与相应筛选。
- **验收**：仅查看解析不等于答对；刷新后仍待评价；`partial` 会进入待复习；同一题重复做错只显示一条错题但保留全部尝试；用户间完全隔离。更正自评重算错题与两项正确率且日志只记一次，旧自评更正不改变尝试排序；手动复习题做对后保留，纯答错题做对后移出。

### Phase 5 — 体验完善和测试

- loading/skeleton、空态、错误重试、移动端体验、键盘操作、会话列表与恢复、基本统计（已做题数/最近结果正确率/历史作答正确率/待复习数/待自评题数），合理分页和 DB 索引。
- **验收**：电脑/手机浏览器操作顺畅；E2E 覆盖登录、章节选择、选择题提交、主观题自评、错题复练；接口不会发生意外 N+1 查询。

### Phase 6 — 上线准备

- 生产环境 D1 binding/migrations、Cloudflare secrets、固定 HTTPS 域名和 RP ID、CI deploy workflow、数据库备份/恢复指南、基本错误监控与日志、真实 Passkey 注册登录 smoke test。
- 监控 Worker CPU 耗时、1102 错误、D1 查询延迟；Free 套餐 CPU 预算不满足时升级 Paid 而不是关闭安全验证。
- **验收**：可重复部署；迁移不会误用本地 DB；隔离环境恢复演练成功；Passkey 在真实 HTTPS 域名可用；无秘钥进入仓库；远程 CLI 的原子批次故障验证完成。真实注册/登录 CPU 不能用本地耗时代替，Free 预算不满足时在部署前由维护者确定付费方案。

## 9. 测试矩阵（必须自动化）

1. **内容校验**：重复 ID、不存在的 topic/tag、循环 parent、选项答案不一致、解析分区缺失/重复、年份冲突、重复导入、题型/资源变化的版本递增、租约失效拒写、实体回滚、部分失败重跑、更新失败不开始归档、归档保历史。
2. **认证**：无邀请注册拒绝、过期/重复/并发邀请、凭证写入失败/Session 创建失败、Origin/RP ID 不匹配、失效 Session、他人 Session、原生端点绕过尝试、并发删除最后凭证、注销撤销、CLI 恢复及 epoch 失效；WebAuthn E2E 使用浏览器虚拟认证器，staging 再真实设备复测。
3. **题目 API**：响应字段白名单、题解资源权限、正确/错误单选、多选全匹配、非法选项、旧版本题型/答案、旧评价不解锁新版、同 key 同/异请求、不同 key 同条目并发、批次失败无副作用、越权 sessionId/attemptId。
4. **学习状态**：首次未做、一次错一次对、错对错、主观题揭示待自评、自评更正/重复重试/并发冲突、更正旧尝试不改变最近排序、manual_review 独立性、`partial`、同题多会话、空分母和两种正确率。
5. **UI**：切换 Tab 保留章节、上一题下一题、题组列表、刷新恢复、两设备位置冲突、快捷键、移动端导航、LaTeX/长代码、网络失败沿用幂等 key 重试。
6. **部署**：静态资源与 `/api/*` 路由不冲突（含 navigate header）、内部资源前缀无法直取、缺失资产返回正确错误、D1 migration 按迁移历史重复运行无副作用、真实 Worker runtime 检查 CPU 和配置，禁止测试跑到生产 DB。

## 10. CI/CD、备份及运维

- GitHub Actions：PR 执行 `pnpm install --frozen-lockfile`、lint、typecheck、单元/Worker 集成测试、构建、`content:validate`；E2E 可在独立 job 运行。锁定依赖版本并提交 lockfile。
- 仅 main 分支在审批/显式配置后允许 staging 或 production 发布；使用最小权限 Cloudflare API token。生产 migrations 在 deploy 前明确执行，并记录版本。导入任务与 schema migration 分离。
- D1 生产数据定期导出 SQL / 使用 D1 Time Travel；隔离恢复演练使用受控 SQL 导出导入到隔离数据库，不能假定 Time Travel 能直接克隆新库。Git 保存内容源，但 Git **不是**答题记录备份。当前 Time Travel 保留期 Free 7 天、Paid 30 天，上线前重新核对并明确导出周期、保留位置和恢复步骤；生产 Time Travel 恢复不能作为常规自动化测试执行。
- 用户数据恢复和 Passkey 恢复独立；不可把生产 Passkey 凭证或 Session dump 当作公共测试资料。
- `.dev.vars`、密钥和临时 SQL dump 不进 Git；文档包含环境变量示例（不含真实值）、域名切换注意事项、首次管理员启动步骤。

## 11. 具体端到端验收场景（Definition of Done）

1. 管理员用 CLI 创建账户和一次性邀请；访客使用该邀请绑定第一枚 Passkey，然后注册第二枚 Passkey；退出并重新登录成功。
2. 进入数学一 → 二重积分 → 定义，`知识点` Tab 显示对应 Markdown、公式和至少一道例题。
3. 切到 `习题`，筛选“原创样例（含后代） + 单选 + 10 道”，生成固定顺序题组；一屏一题；回答后后端立即返回判分和解析。空的统考真题分类正确显示空态，年份筛选由测试夹具验证。
4. 在另一个浏览器/设备用同一个账号登录，能恢复题组位置、已做题结果以及错题记录。
5. 做一道主观题，点击查看答案但不自评，退出再进仍提示待评价；自评错误后进入待复习，复练做对后“最近做错”消失但“曾做错”保留。
6. 修改 Git 中的一道题解析并同步，题目 revision 增加；旧 attempt 继续引用旧 revision，其他用户答题记录不丢失。
7. 未登录、越权访问、未答题直接请求解析、重复并发提交、非法邀请码全部被正确拒绝或幂等处理。
8. `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm content:validate` 通过；提供测试说明、部署说明和截图；不留下占位按钮、无效接口或硬编码假数据路径。
9. 手动把题目标为待复习后做对，仍保留；取消手动标记后，若最近已答对则移出。误点自评错误后更正正确，该误评不再计入错题，但评价日志可追溯。
10. 一题先错 9 次、后对 1 次时，“最近结果正确率”为 1/1，“历史作答正确率”为 1/10；更正旧自评后统计相应改变，待自评记录不进入分母。
11. 同步中途失败不破坏任何单题版本/关联且不开始归档，重跑完成剩余内容；并发提交不产生重复 attempt，日志/聚合与真实记录一致。
12. Playwright E2E 独立执行并通过；真实设备/staging、远程回滚、CPU 和备份还原的验收证据单独列出，不能用单元测试全绿代替尚未执行的上线验证。

## 12. 实施优先级与 Agent 汇报约定

**交付约束**：P0 和 P1 全部属于完整 v1，不允许把 P1 留空而宣称 v1 完成；P0/P1 表示开发先后，实际依赖以 Phase 和数据一致性为准。  
**P0（优先建立）**：认证、内容导入、树导航、知识点、单选题、主观题自评、持久化记录、错题本、授权测试、部署说明。  
**P1（同版必须完成）**：多选、题目筛选、练习会话、跨设备恢复、响应式、版本快照、基础统计；题组/版本表必须在第一次建立学习模型时就落库，不能等 Phase 5 补救。  
**P2（后续）**：R2 图库、搜索、复习算法、题目管理后台、模拟考试、PWA。

每个 Phase 完成后，Agent 应在 `docs/implementation-progress.md` 更新：已实现功能、核心文件、迁移、运行命令、测试结果、已知限制、下一步。遇到外部版本不兼容时，优先尝试同一技术栈内的最小兼容方案，并记录修改理由；不得为了绕过问题牺牲用户数据隔离、安全认证、答案不提前泄露及记录幂等性。

## 13. 官方参考（实现时核对安装版本）

- Cloudflare Vue/Workers：<https://developers.cloudflare.com/workers/framework-guides/web-apps/vue/>
- Cloudflare Vite Plugin：<https://developers.cloudflare.com/workers/local-development/vite-plugin/>
- Cloudflare Static Assets 路由：<https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/>
- Cloudflare Assets binding：<https://developers.cloudflare.com/workers/static-assets/binding/>
- Cloudflare Workers Limits：<https://developers.cloudflare.com/workers/platform/limits/>
- Cloudflare D1 Limits：<https://developers.cloudflare.com/d1/platform/limits/>
- Cloudflare D1 Migrations：<https://developers.cloudflare.com/d1/reference/migrations/>
- Cloudflare D1 batch：<https://developers.cloudflare.com/d1/worker-api/d1-database/#batch>
- Cloudflare D1 REST 参数查询：<https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/>
- Cloudflare Wrangler Node API：<https://developers.cloudflare.com/workers/wrangler/api/>
- Cloudflare D1 Time Travel：<https://developers.cloudflare.com/d1/reference/time-travel/>
- Better Auth Passkey：<https://better-auth.com/docs/plugins/passkey>
- Better Auth Drizzle Adapter：<https://better-auth.com/docs/adapters/drizzle>
- Better Auth Hooks：<https://better-auth.com/docs/concepts/hooks>
- Better Auth Rate Limit：<https://better-auth.com/docs/concepts/rate-limit>
- Hono Workers + Vite：<https://hono.dev/docs/getting-started/cloudflare-workers-vite>
- Workers Vitest：<https://developers.cloudflare.com/workers/testing/vitest-integration/>
