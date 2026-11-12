# 钓鱼全服播报 — 实施计划

| 项 | 内容 |
|---|---|
| 状态 | 已确认（2026-11-12） |
| 对应需求 | [spec.md](spec.md) |
| 负责 | Tiantian-17（客户端 + 共享规则）+ 作者（服务端，私有库） |
| 预计工作量 | 小（客户端部分 < 半天；服务端由作者在私有库补齐） |

## 1. 方案概述

钓到「神话鱼」或「破个人纪录」时，服务器向**世界频道**广播一条系统消息（带钓鱼者昵称 + 鱼名 + 稀有度），客户端在世界频道收到后既进聊天记录、又闪一条**金色顶部横幅 + 音效**。

**为什么这样做**：

- 复用现有 `chat` / 频道机制（`src/shared/chat.ts` + `channels.ts`），**不新造广播系统**；消息有历史、可被玩家关/静音、可被管理员撤回/举报，符合现有管理模型。
- 规则收敛成一个纯函数 `shouldBroadcastCatch()` 放 `src/shared/fishing.ts`，客户端与服务端共用；将来放宽门槛只改这一处 + 测试。
- 识别方式用**显式 `kind` 标记**（作者已拍板），不用 `pid===0 && uid===0` 这种脆弱约定。

**对现有结构的影响**：

- `src/shared/chat.ts`：`ChatMessage.kind` 增加 `'broadcast'` 取值，`ChatMessage` 增加可选的 `tone?`（稀有度）字段用于横幅配色。
- `src/shared/fishing.ts`：新增 `shouldBroadcastCatch()` 纯函数。
- `src/shared/protocol.ts`：`chat` 消息的 `from` 语义不变，广播仍走 `chat` 消息（`pid:0/uid:0` + `kind` 由文本标记识别由服务端下发）；协议类型 `ChatMessage` 引用处跟进。
- `src/net/client.ts`：处理广播消息（`chat` 带广播标记）时触发横幅。
- `src/ui/Hud.ts`：`banner()` 增加一个「播报」样式（金色、稍长停留）。
- 不拆任何文件，不改存档，无迁移。

## 2. 任务拆分

| 任务 | 内容 | 主要文件 | 依赖 | 验收 | 状态 |
|---|---|---|---|---|---|
| T1 | 共享规则 + 消息类型：`shouldBroadcastCatch` 纯函数 + `ChatMessage.kind` 加 `'broadcast'` + `tone` 字段 | `src/shared/fishing.ts`、`src/shared/chat.ts`、`src/shared/protocol.ts` | — | 单测通过 | ☐ |
| T2 | 客户端：识别广播消息，触发金色横幅 + 音效；`Hud.banner` 增加播报样式 | `src/net/client.ts`、`src/ui/Hud.ts`、`src/scenes/WorldScene.ts`（如需接线） | T1 | 浏览器验证 | ☐ |
| T3 | 测试：`shouldBroadcastCatch` 规则测试 + chatState 对 broadcast 归类的测试 | `tests/fishing-broadcast.test.ts` | T1 | 单测通过 | ☐ |
| T4 | 文档收尾：FEATURES / CHANGELOG / protocol:doc | `docs/FEATURES.md`、`docs/CHANGELOG.md` | 全部 | — | ☐ |

> T2（服务端广播逻辑）在**私有库**，由作者补齐，不在公开库本批内。公开库只需保证协议与共享规则就位、客户端能正确渲染服务端将来下发的广播消息。

## 3. 协议与数据变更

- 消息类型：`ChatMessage.kind` 由 `'chat' | 'system'` 扩展为 `'chat' | 'system' | 'broadcast'`；`ChatMessage` 新增 `tone?: 'epic' | 'legendary' | 'mythic' | 'record'`（横幅配色用，可选）。
  - 注意：`channelOf()` 当前把 `kind === 'system'` 归入 `sys` 频道；`broadcast` 需归入 `world` 频道（服务端下发时 `ch='world'`），要同步改 `chatState.ts` 的归类逻辑。
- 存档字段：无。
- HTTP 路由 / nginx：无。
- 改完运行 `npm run protocol:doc`（`docs/architecture/PROTOCOL.md`）。

## 4. 测试计划

- **规则测试** `tests/fishing-broadcast.test.ts`：
  - `shouldBroadcastCatch(mythic, record=false)` → true
  - `shouldBroadcastCatch(epic, record=true)` → true
  - `shouldBroadcastCatch(legendary, record=false)` → false
  - `shouldBroadcastCatch(common, record=false)` → false
  - `shouldBroadcastCatch(junk, record=false)` → false
- **聊天归类测试**（如现有 `chat-state.test.ts` 模式）：`kind==='broadcast'` 的消息进 `world` 频道、不冒气泡（或按需冒）。
- **浏览器验证**：`?offline` 下本地无法触发服务端广播，改为在 `client.ts` 里临时注入一条广播消息验证横幅渲染（或依赖私有测试服联机验证，由作者配合）。
- 全套 `npx vitest run` 与 `npx tsc --noEmit` 必须通过。

## 5. 上线计划

- 需要**同时部署服务端**（改了 `src/shared/*`：`fishing.ts` + `chat.ts` + `protocol.ts`）。
- 服务端广播逻辑由作者在私有库实现，部署前作者需同步本批共享文件。
- 回滚：纯增量（新增 `kind` 取值 + 一个纯函数），老客户端忽略未知 `kind` 也能正常运行，风险低。

## 6. 风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| `kind` 扩展后老客户端不认识 `broadcast` | 老版本收到广播消息可能渲染异常 | 广播消息仍走 `chat` 结构（`text` 完整），老客户端按普通聊天显示，只是没横幅 |
| 刷屏 | 神话鱼/破纪录频率低，风险小 | 门槛锁死 mythic/record，服务端可再加限频 |
| 横幅样式与现有 `banner()` 冲突 | 视觉覆盖 | 用独立 class，不改 `banner()` 默认行为 |

## 7. 进度记录

| 日期 | 做了什么 / 提交 | 备注 |
|---|---|---|
| 2026-11-12 | spec 已确认 | 作者拍板门槛/形式/暴露/识别方式 |
