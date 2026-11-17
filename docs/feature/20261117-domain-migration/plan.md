# 老域名 → 备案新域名：玩家一键搬家 实施计划

| 项 | 内容 |
|---|---|
| 状态 | 已确认，开发中（2026-11-17） |
| 对应需求 | [spec.md](spec.md) |

## 1. 方案概述
服务器发一次性搬家券（内存、3 分钟、一次性、限频），老域名带券跳新域名，新域名凭券换回 token 与资料后刷新进游戏。复用现有「临时连接 + 限频」的备份码恢复模式（`restoreIdentity` / `onRestore`）。

## 2. 任务拆分
| 任务 | 内容 | 主要文件 | 验收 |
|---|---|---|---|
| T1 | 协议 + 券格式校验（纯函数） | `src/shared/protocol.ts`、`src/shared/migrate.ts`、`tests/migrate.test.ts` | 单测 |
| T2 | 服务端：`migrate_make` / `migrate_claim`（内存券表、TTL、一次性、限频、不进日志） | 服务端 `migrate.ts`、`game.ts` 接线、`tests/migrate.test.ts`（服务端） | 服务端测试：A3 / A4 / A7 |
| T3 | 客户端网络层：`makeMigrationTicket()` / `claimMigration()`（临时连接，复用 `restore.ts` 的写法） | `src/net/migrate.ts` | 单测（假 WebSocket） |
| T4 | 新域名启动处理：读 `#m=` → 抹地址栏 → 认领 → 确认（R6）→ `setToken` / `saveProfile` → 刷新 | `src/main.ts` 启动流程、`src/core/profileStore.ts` | 浏览器实测 A2 / A5 |
| T5 | 老域名入口：加载页 / 游戏内一条可关闭提示 + 菜单「搬到新网址」；域名判断常量（`NEW_HOST`）；第二阶段拦截页开关（R8） | `src/ui/MigrateBanner.ts`、`src/ui/actions.ts` 登记、样式 | 浏览器实测 A1 |
| T6 | 备份面板里加一句提示（R7）；文档：FEATURES / CHANGELOG / PROTOCOL；私有 DEPLOY 里写迁移手册与第二阶段怎么切 | 文档 | — |
| T7 | 联调：本地起两个来源（`localhost:5173` 当老域名、`127.0.0.1:5173` 当新域名）+ 本地服务端，走 A1 ~ A6 | — | 实测 |

## 3. 协议与数据变更
见 spec §6：4 条新消息，additive；存档字段无变化。

## 4. 测试计划
- 单元：券格式；`makeMigrationTicket` / `claimMigration`（假 WS）。
- 服务端集成：make 发券、claim 成功、二次 claim 失败、过期（注入时钟）失败、不存在 token 不发券、限频、券表上限、日志不含 token。
- 浏览器：两个来源模拟跨域名（localStorage 不共享）走通 A1 ~ A6。
- 全量 `npx vitest run`（含服务端）+ `tsc` + `vite build`。

## 5. 上线计划
- 公开 + 服务端**一起合并、一起部署**（服务端要认识新消息；老客户端不发这两条消息，兼容）。
- 部署后先在 `huepixel.top` / `exist.qd.je` 各开一次真机走通。
- 回滚：入口由客户端常量控制；服务端新消息没有客户端调用就无副作用，回滚即回到上一版。

## 6. 风险与应对
| 风险 | 影响 | 应对 |
|---|---|---|
| 新域名已有新角色被覆盖 | 玩家丢新角色 | R6 确认弹窗；文案提示备份码 |
| 券被别人抢先用 | 身份被拿走 | 3 分钟、一次性、限频、`#` 不进日志；提醒别转发链接 |
| 手机内置浏览器（微信等）跳转后丢 hash | 迁移失败 | 失败时提示改用备份码；入口文案建议用系统浏览器 |
| 服务器重启时券丢失 | 玩家重点一次 | 无影响（3 分钟窗口） |

## 7. 进度记录
| 日期 | 做了什么 | 备注 |
|---|---|---|
| 2026-11-17 | spec / plan 草稿；ICP 备案号页脚 | 等主人确认取舍 |
| 2026-11-17 | 主人确认（一键搬家 + 可关闭提示 + 菜单常驻 + 已有角色弹确认）；T1~T7 全部完成：协议 / 共享模块 / 服务端 `migrate.ts` / 客户端网络层、启动接收、老域名提示与菜单入口；两个本地来源模拟新老域名走通（同 token、同校园号 10001、同币 436） | 未部署；本地开发开关 `?oldhost` / `?newurl=` 仅 dev 构建有 |
