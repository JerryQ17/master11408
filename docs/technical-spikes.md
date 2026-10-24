# Technical Spikes 验证报告

日期：2026-10-24
状态：已完成本地与 workerd 验证

## 1. 依赖与运行时版本矩阵

| 依赖 / 工具                  | 锁定版本      | 角色                       | 验证结果 |
| ---------------------------- | ------------- | -------------------------- | -------- |
| Node.js                      | >=24.12.0 <27 | 运行环境                   | 兼容     |
| pnpm                         | 12.15.0       | 包管理器 (frozen lockfile) | 兼容     |
| Cloudflare Workers Types     | 5.20261024.1  | 运行时类型                 | 兼容     |
| @cloudflare/vite-plugin      | 1.65.0        | Workers 开发与打包插件     | 兼容     |
| @cloudflare/vitest-plugin    | 1.4.7         | workerd 隔离测试插件       | 兼容     |
| wrangler                     | 4.152.0       | CLI 与平台代理             | 兼容     |
| better-auth                  | 1.7.12        | 核心认证框架               | 兼容     |
| @better-auth/passkey         | 1.7.12        | WebAuthn Passkey 插件      | 兼容     |
| @better-auth/drizzle-adapter | 1.7.12        | D1 Drizzle 数据库适配器    | 兼容     |
| drizzle-orm                  | 0.45.4        | ORM 与 SQL 生成            | 兼容     |
| vue                          | 3.5.42        | 前端响应式框架             | 兼容     |
| vue-router                   | 5.3.1         | SPA 前端路由               | 兼容     |
| pinia                        | 4.1.0         | 客户端状态管理             | 兼容     |
| hono                         | 4.13.13       | Worker API 服务端框架      | 兼容     |

## 2. 架构决策与验证证据

### 2.1 Passkey 邀请与凭证落库原子性 (Phase 0.5 关键门槛)

- **挑战**：Better Auth 的 WebAuthn 验证流与 D1 数据库写入在默认情况下是两步过程。如果直接在 hook 中标记邀请，可能出现“凭证已写入但邀请标记失败”或并发竞争使用同一邀请。
- **解决方案**：采用 D1 触发器机制 (`migrations/0002_auth_guards.sql`)：
  1. 在 `passkey` 插入前 (`BEFORE INSERT`)，触发器 `passkey_requires_authorization` 严格核实 `registration_authorizations` 临时授权记录。
  2. 在 `passkey` 插入后 (`AFTER INSERT`)，触发器 `passkey_complete_enrollment` 在同一个原子 SQLite 事务批次内完成：消费邀请 (`consumed_at`)、更新用户状态、记录审计日志 (`auth_audit_events`) 并清理临时授权。
  3. 若并发有两个请求竞争同一邀请，由于邀请状态更新和检查在同一数据库原子事务内，仅有一方能成功提交，另一方触发事务回滚。
- **验证命令**：`pnpm test`
- **证据文件**：`tests/worker/auth-guards.test.ts`
  - `consumes a single invitation exactly once under concurrent credential insertions`: 两个并发请求测试通过，且仅产生 1 条有效凭证和 1 条审计日志。
  - `rolls back credential creation and invite consumption if the audit write fails`: 故障注入测试证明，任一写入失败整批回滚，不残留未完成状态。

### 2.2 最后一枚 Passkey 删除保护

- **决策**：在 API 层过滤与 SQLite 触发器双重加固。
  - 触发器 `passkey_keep_last` (`BEFORE DELETE ON passkey`)：若用户处于 `active` 状态且剩余凭证数 <= 1，触发 `RAISE(ABORT, 'LAST_PASSKEY_REQUIRED')`。
  - 验证证据：`tests/worker/auth-guards.test.ts` 中的 `keeps one credential when two deletion requests race` 两个并发删除请求竞争，成功保留且仅保留 1 枚凭证，杜绝孤立账户。

### 2.3 恢复与 Epoch 隔离

- **决策**：使用维护 CLI (`scripts/admin.ts recover`) 递增 `auth_epoch`，将账户设为 `recovery_pending` 并清空会话。
  - 触发器 `session_epoch_guard` 拒绝旧 epoch 的任何会话创建。
  - 验证证据：`tests/worker/auth-guards.test.ts` 中 `rejects creation of a Session for an obsolete recovery epoch` 通过。

### 2.4 D1 学习数据并发约束

- **题目作答幂等**：`attempts` 表设置 `UNIQUE(user_id, idempotency_key)` 与 `UNIQUE(session_id, ordinal)`。
- **状态约束**：`CHECK ((state = 'evaluated' AND result IS NOT NULL AND evaluated_at IS NOT NULL) OR (state = 'revealed_pending_self_eval' AND result IS NULL AND evaluated_at IS NULL))`。
- **会话创建幂等**：`practice_sessions` 表设置 `UNIQUE(user_id, creation_key)`。

## 3. 仍待远程验证项

以下项目受限于用户尚未授权并连接远程 Cloudflare 账户，将在获得远程环境后执行：

1. **远程 Cloudflare Workers Free CPU 10ms 限制实测**：真实 WebAuthn ceremony 在真实 edge 节点的耗时与 1102 观察。
2. **远程 D1 REST API 批次原子回滚演练**：通过 Cloudflare D1 REST 接口验证多语句 batch 中途报错的回滚行为。
3. **真实 HTTPS 自定义域名 Passkey 握手**：生产 RP ID 及跨操作系统原生 Authenticator (TouchID / Windows Hello / YubiKey) 握手验证。
4. **远程 Time Travel 与备份还原恢复演练**。
