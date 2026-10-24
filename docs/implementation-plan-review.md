# 11408 Study — 实现前计划审查

日期：2026-10-24。当前仓库只有 README、LICENSE 和未提交的计划/忽略规则，尚无应用、依赖锁文件或数据库迁移。本轮只修改计划文档；没有安装依赖、创建云资源或执行部署。

主规格：[implementation-plan.md](./implementation-plan.md)。本文件记录审查理由和已确认决策，实施时以主规格中的最新规则为准。

## 1. 访谈决策

下列六项均由用户在本轮明确选择，已经合并进主规格。

| 决策 | 用户选择 | 对计划的影响 |
| --- | --- | --- |
| 第一版边界 | 完整 v1，全部现有验收通过 | P0/P1 是顺序；题组、版本、跨设备恢复等不可延后到 v2 |
| 手动待复习 | 做对仍保留，直到手动取消 | 单独保存 manual_review，review 为手动标记与最新错误的并集 |
| 更正自评 | 按更正结果统计，保留日志 | wrong_count 可以减少；日志不算新尝试；原子重算统计 |
| 内容交付 | 完整平台与足量原创样例，真题后续自行维护 | 提供至少 10 道同章节原创单选和其他题型；不依赖真实真题完成验收 |
| 正确率 | 两项明确命名的指标 | 分别定义最近结果正确率与历史作答正确率、分母和待自评处理 |
| 同步失败 | 按题完整一致，允许部分成功，可重跑 | 每实体原子批次；所有更新成功后才归档；不做整库发布版本 |

## 2. 发现的问题与修订

| 原计划的缺口 | 具体失效场景 | 已写入的规则 |
| --- | --- | --- |
| P1 与完整验收冲突 | 省略题组/版本后仍要求跨设备恢复、旧答案判题 | 明确完整交付范围和建表时机 |
| 注册 hook 与 D1 原子性未经验证 | 两个注册都读到未消费邀请；或邀请烧毁但未存凭证 | 新增 Phase 0.5，要求插件验证后凭证落库和邀请消费共用原子写入 |
| 最后一枚凭证仅描述业务要求 | 两个设备各删一枚；直接调原生端点绕过 UI | 数据库条件删除、原生端点覆盖和并发验收 |
| 管理员恢复未定义信任根 | 唯一管理员也丢失所有 Passkey | 维护 CLI 使用独立 Cloudflare/D1 权限，账户恢复状态、epoch、Session 撤销与审计 |
| 题目版本缺少题型/资源 | 单选改多选或原图片覆盖后，旧记录变化 | revision 保存题型、展示元数据、不可变资源清单；历史判题不用 questions.type |
| 幂等键未绑定请求内容 | 同一个 key 提交另一题或换答案，错误回放 | 规范化 request hash；同 key 异请求 409 |
| 不同 key 的并发提交未限制 | 双设备产生两条 attempt 和两次计分 | 所有练习归属题组；每条目最多一次 attempt；重做创建新题组 |
| 跨设备恢复只描述结果 | 无题组列表或更新位置接口，无法找回会话 | 增加题组列表、带版本的位置更新、题组完成定义 |
| 待自评覆盖最近正确结果 | 先答对，后揭示但未评价，被误记错误/未做 | 最新尝试与最新已评价尝试分开，明确所有分母 |
| 自评更正只有时间字段 | 更正旧题使其变成“最近一次”，或重复请求重复计数 | attempt 提交时间排序，评价版本 CAS，独立评价事件，原子重算 |
| 手动复习与自动复习共用布尔值 | 一次答对抹掉用户主动提醒 | manual_review 独立；取消手动提醒不掩盖最新错误 |
| 只保护 JSON 答案字段 | 静态解析图片、Markdown 源或缓存可直接取解答 | 字段白名单、解析资源鉴权、构建产物检查、敏感响应 no-store |
| 部分同步/并发写入语义不明 | 当前版本与关联不一致，失败却归档仍需保留内容 | 实体原子、全量预校验、单写入租约与 fencing、失败报告和幂等重跑 |
| Node CLI 如何访问 D1 未选定 | 把 Worker binding 当普通 Node 数据库使用，或拼 SQL 导入 | 本地 Wrangler 代理；远程带参数 REST batch；两端各验证回滚 |
| 初始题量不足，来源分类冲突 | 只有少量样例却要求筛出 10 道真题 | 原创样例足量，空真题分类验空态，年份用测试夹具 |
| API 和路由命名不统一 | mode/tab、index/ordinal 混用 | 稳定 topic ID，统一 tab 和从 1 开始的 ordinal |
| 只列限制未落实查询预算 | 100 题逐条 INSERT 超出 Free 每请求查询上限 | 明确 INSERT SELECT/多行 INSERT、绑定参数上限与输入大小 |

## 3. 官方资料核实

以下是 2026-10-24 的文档核实结果，**不是已安装版本或真实 Worker 的运行验证**。主规格中的业务约束是本次设计决定，不能当作第三方库已经提供的保证。

- Better Auth 文档支持 `registration.requireSession=false`、`resolveUser`、注册时传 context 与 `createSession`。它说明了免会话注册入口，但没有为本项目的邀请消费提供跨表事务保证；最后凭证删除保护也必须自行接入业务约束。[Passkey 官方文档](https://better-auth.com/docs/plugins/passkey)
- Drizzle adapter 文档提供 SQLite 配置和 schema 生成流程。实施时应先生成认证 schema，再用项目迁移工具应用，不能凭表名猜测或让运行时请求执行迁移。[Drizzle adapter 官方文档](https://better-auth.com/docs/adapters/drizzle)
- D1 binding 的 `batch()` 顺序执行 SQL，语句失败会回滚整批。这不涵盖批次外的“先查再写”，也不自动解决两个不同请求的幂等问题；因此需要唯一约束和条件写入。[D1 batch 官方文档](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)
- D1 REST query 文档支持携带 params 的查询和 batch 请求；本次未连接远程数据库，因此将远程失败回滚验证列为上线前门槛。[D1 REST query 官方文档](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/)
- Cloudflare 提供 Wrangler Node API，供本地工具获取模拟 binding；实施时仍需核实所选版本及与 Vite 的 persistence 路径一致性。[Wrangler Node API](https://developers.cloudflare.com/workers/wrangler/api/)
- Workers 的 SPA 路由支持按路径设置 run_worker_first；Assets binding 允许 Worker 内部读取资产。本次采用 API 与内部解析图片前缀走 Worker，图片对外鉴权后内部读取的方案，必须在实际构建及 staging 验证。[SPA 路由](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)、[Assets binding](https://developers.cloudflare.com/workers/static-assets/binding/)
- Better Auth 默认将限流数据放在内存，服务端 auth.api 调用不受客户端请求限流覆盖。选用 D1 存储或原子 customStorage.consume，并单独保护包装路由，不能仅写“开启限流”而不指定存储和覆盖路径。[Rate Limit 官方文档](https://better-auth.com/docs/concepts/rate-limit)
- Workers Free HTTP CPU 预算仍为 10 ms；D1 单查询最多 100 个绑定参数，Free 每次 Worker 调用最多 50 次查询。这些是设计约束，不能证明 Better Auth 在本项目中满足预算。[Workers limits](https://developers.cloudflare.com/workers/platform/limits/)、[D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- Workers 测试文档目前推荐 `@cloudflare/vitest-plugin`；原计划的包名无需改回旧 pool 包，所选 Vitest/Vite 版本仍需一起验证。[Workers Vitest](https://developers.cloudflare.com/workers/testing/vitest-integration/)
- Time Travel 保留期为 Free 7 天/Paid 30 天，当前不提供直接克隆新数据库的能力；隔离恢复演练使用 SQL 导出/导入流程。[Time Travel 官方文档](https://developers.cloudflare.com/d1/reference/time-travel/)

## 4. 实施顺序与验证门槛

1. **Phase 0：工程运行。** 初始化固定版本的单 Worker 项目，验证 Vue、API、SPA fallback、D1 和 workerd 测试环境。
2. **Phase 0.5：先验证难点。** 用最小可运行切片证明邀请与凭证原子落库、并发删除保护、学习记录批次原子性、本地导入 transport；记录准确版本与写入扩展点。未经验证不能将认证设计宣称为已可实现。
3. **Phase 1：闭合账户生命周期。** 注册、登录、凭证管理、限流、CLI 恢复、授权隔离。
4. **Phase 2：内容完整进入 D1。** 校验、版本、实体原子导入、归档和资产策略；阅读界面使用真实 API 数据。
5. **Phase 3–4：学习闭环。** 固定题组、自动判题、主观揭示/自评、更正审计、复习状态，所有写入先完成一致性约束再接 UI。
6. **Phase 5：体验和完整 E2E。** 两项正确率、题组恢复、响应式、错误重试；覆盖真实数据库链路。
7. **Phase 6：上线准备与获授权后的实测。** 固定域名、远程迁移/同步、真实设备注册登录、CPU、资产访问及备份恢复；远程操作按已有授权范围执行。

## 5. 尚待实测或上线前确定的事项

这些事项不再是未回答的产品规则，本轮不会为验证它们创建资源或开始实现。

| 事项 | 完成时间 | 通过条件 |
| --- | --- | --- |
| Better Auth/Drizzle 的凭证创建扩展点与原子批次组合 | Phase 0.5 | 锁定安装版本，两个并发 ceremony 和写入失败测试通过 |
| 最后凭证保护、恢复状态与原生 handler 协作 | Phase 0.5–1 | 原生路由无法绕过，旧 epoch 失效，Session 创建失败可重新登录 |
| 本地 D1 persistence 与远程 REST 事务行为 | 本地 Phase 0.5；远程 Phase 6 前 | 两端故障注入回滚通过，重跑结果一致 |
| 正式域名、RP ID、主要使用设备 | 首次正式注册前 | 维护者确定稳定域名，目标浏览器/设备通过真实 Passkey 测试 |
| Free 计算预算是否足够 | 获授权的 staging 实测时 | 记录 CPU/1102；若超限，明确付费或同栈优化方案再上线 |
| 解析资产前缀路由与旧资源保留 | Phase 2 与上线前 | 无 Cookie、其他用户、直接路径和编码路径不能绕过；旧题组资源可读 |
| 备份频率、位置和恢复耗时 | Phase 6 | 维护者确定存储与周期，隔离导出/导入演练有记录 |

本次仅进行了文档与官方资料审查。上述功能测试、WebAuthn ceremony、D1 回滚、CPU 和恢复演练均尚未执行，不以计划文字代替验证结果。
