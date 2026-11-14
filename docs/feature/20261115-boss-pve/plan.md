# 实现计划 · 组队 PVE：世界 BOSS

> 由 [spec.md](spec.md) 生成；spec 变了先改 spec，再同步本文件。
> 对应 Issue：[EXIST-D/PixelCampus#20](https://github.com/EXIST-D/PixelCampus/issues/20)
> 状态：待开工（2026-11-15）
> 前置：PvP（PR #28），复用「多玩家共享一场战斗」的骨架

## 1. 第一步：验收标准 → 测试函数

| ID | 测试函数 | 类型 | 文件 | 断言 |
|---|---|---|---|---|
| P1 | `srv_boss_challenge` | 服务端 | `server/tests/boss.test.ts` | 队长发起、队员确认后全员进入 |
| P2 | `int_boss_ui` | 集成 | `tests/integration/boss-ui.test.ts` | 界面显示 BOSS、血条、队友列表 |
| P3 | `unit_boss_shared_hp` | 单元 | `tests/boss.test.ts` | 多人伤害累计到同一个血条 |
| P4 | `unit_boss_phase2` | 单元 | 同上 | 70% 触发阶段 2，只触发一次 |
| P5 | `unit_boss_phase3` | 单元 | 同上 | 40% 触发阶段 3 |
| P6 | `srv_boss_player_down` | 服务端 | `server/tests/boss.test.ts` | 单人全倒 → 退出但队伍继续 |
| P7 | `srv_boss_all_down` | 服务端 | 同上 | 全员倒下 → 失败 |
| P8 | `srv_boss_win_reward` | 服务端 | 同上 | 胜利 → 参与者各得奖励 |
| P9 | `srv_boss_repeat_reward` | 服务端 | 同上 | 重复击杀按人数平分 |
| P10 | `srv_boss_timeout_skip` | 服务端 | 同上 | 超时自动跳过 |
| P11 | `srv_boss_reconnect` | 服务端 | 同上 | 30 秒重连 |
| P12 | `srv_boss_disconnect_exit` | 服务端 | 同上 | 超时退出、队伍继续 |
| N1 | `unit_client_no_settle` | 源码扫描 | `tests/boss-source-safety.test.ts` | 客户端不结算 |
| N2 | `srv_boss_guard` | 服务端 | `server/tests/boss.test.ts` | 不在队伍 / 不在入口 / 非公共世界拒绝 |
| N3 | `srv_boss_single` | 服务端 | 同上 | 同队不能开两场 |
| N4 | `srv_boss_vs_pvp` | 服务端 | 同上 | PvE 与 PvP 互斥 |
| N5 | `unit_boss_hp_clamp` | 单元 | `tests/boss.test.ts` | 血量夹在 0..max |
| N6 | `unit_boss_phase_once` | 单元 | 同上 | 阶段不重复触发 |
| N7 | `srv_boss_left_no_reward` | 服务端 | `server/tests/boss.test.ts` | 退出者无奖励 |
| N8 | `srv_boss_timeout_no_stuck` | 服务端 | 同上 | 超时不卡死 |
| N9 | `srv_boss_reconnect_no_extra` | 服务端 | 同上 | 重连不重复结算 |
| N10 | `srv_boss_reward_once` | 服务端 | 同上 | 奖励只发一次 |
| N11 | `srv_boss_all_gone_reset` | 服务端 | 同上 | 全员断线 → BOSS 回满 |
| N12 | `unit_no_innerhtml` | 源码扫描 | `tests/boss-source-safety.test.ts` | 不含 `innerHTML` |
| N13 | `srv_boss_no_save_hp` | 服务端 | `server/tests/boss.test.ts` | 不改玩家存档血量 |

## 2. 实现顺序

1. `src/shared/boss.ts`：BOSS 定义、阶段、血量缩放、奖励
2. `src/shared/boss-battle.ts`：多人共享战斗的纯逻辑（复用 pvpStep 的思路）
3. 协议 7 条消息 + `monbox` 的 `boss` 字段
4. `server/boss.ts` + handler
5. `src/ui/BossUi.ts`
6. 测试 + 文档

## 3. 文件改动清单

| 文件 | 改动 |
|---|---|
| `src/shared/boss.ts`（新） | BOSS 定义、阶段、缩放、奖励 |
| `src/shared/boss-battle.ts`（新） | 多人共享战斗结算 |
| `src/shared/monbox.ts` | `boss?: { first: boolean; kills: number }` |
| `src/shared/protocol.ts` | 7 条消息 |
| `src/net/client.ts` | 新方法 |
| `server/boss.ts`（新） + `server/handlers/boss-handler.ts`（新） | 会话、阶段、超时、断线、奖励 |
| `src/ui/BossUi.ts`（新） | 邀请条 + 战斗界面 + 队友列表 |
| `src/scenes/world/*` | 入口交互、接线 |
| `tests/boss.test.ts`、`tests/integration/boss-ui.test.ts`、`tests/boss-source-safety.test.ts` | 单元 / 集成 / 源码扫描 |
| `server/tests/boss.test.ts` | 服务端 |
| `docs/` | FEATURES / CHANGELOG / MULTIPLAYER / feature |

## 4. 详细设计

### 4.1 `src/shared/boss.ts`

```ts
export interface BossStage { at: number; atkMul: number; moves?: string[] }
export interface BossDef {
  id: string; name: string; sp: string; lv: number;
  /** 血量倍数（1–4 人） */
  hpMul: readonly [number, number, number, number];
  stages: readonly BossStage[];
  reward: { coins: number; items?: { id: string; n: number }[] };
  /** 重复击杀：每人平分 */
  repeatCoins: number;
}
```

- 占位数值：`hpMul = [8, 12, 16, 20]`；阶段 70% ×1.2、40% ×1.5；首杀 2000 币、重复 200 币平分。
- 数值集中在这一个文件，之后按实测调。

### 4.2 `src/shared/boss-battle.ts`

```ts
export interface BossBattle {
  bid: string; turn: number; phase: 'choose' | 'over';
  boss: Mon; bossMax: number; stage: number;
  players: BossPlayer[];  // uid / name / squad / lead / act / ready / down
  result?: { winner: 'players' | 'boss'; reason: 'faint' | 'timeout' | 'left' };
}
```

- `bossStep(ct, bb, rnd)`：所有 ready 的玩家依次出招，然后 BOSS 反击一次（打随机存活玩家）。
- 复用 `calcDamage` / `hitRate` / `bumpStage` / `applyStatus`。
- 阶段：血条跨过阈值时切换，记录已触发的阶段，避免重复。

### 4.3 服务端

- `server/boss.ts`：挑战校验（队伍 / 位置 / 世界）、邀请确认、会话、45 秒超时、断线、奖励。
- 复用 PvP 的 `Pvp` 结构思路，但支持 N 方。

### 4.4 客户端

- `BossUi`：邀请条、BOSS 卡片、队友列表（名字 + 血量 + 倒下标记）、阶段提示、出招菜单。
- 入口：精工湖中心小岛的交互点（POI）。

## 5. 测试计划

- 单元：`tests/boss.test.ts`（共享血条、阶段、缩放、胜负、边界）
- 集成：`tests/integration/boss-ui.test.ts`（界面、队友列表、阶段提示）
- 服务端：`server/tests/boss.test.ts`（邀请、超时、断线、奖励、互斥）
- 源码扫描：`tests/boss-source-safety.test.ts`
- 全量：`npm test` / `tsc` / `vite build` / 服务端配置

## 6. 复用已有能力

| 能力 | 位置 | 用法 |
|---|---|---|
| 伤害 / 状态 / 能力等级 | `src/shared/battle.ts` | `bossStep` 复用 |
| 多人共享战斗思路 | `src/shared/pvp.ts` | 参考结构，扩成 N 方 |
| 组队 | `src/shared/party.ts` / `server/party.ts` | 挑战资格 |
| 邀请条样式 | `src/ui/PvpUi.ts` | 复用 |
| 战斗卡片样式 | `src/ui/BattleUi.ts` | 复用 |
| 奖励发放 | `server/progress.ts` | `addCoins` / `grant` |

## 7. 环境 / 账号 / 数据 / 依赖

- 本地：`npm run server` + `npm run dev`，需要 **2–4 个浏览器会话**做多人 E2E。
- 测试服：多个测试 token。
- 无新依赖。

## 8. 风险与回滚

| 风险 | 处理 |
|---|---|
| 4 人同步复杂 | 复用 PvP 的「全员 ready 才结算」；超时跳过 |
| 阶段重复触发 | 记录已触发阶段 |
| 奖励重复 | `boss.kills` 与 `first` 标记；同一次击杀只发一次 |
| 和 PvP / PvE 冲突 | 同一时间只能一场 |
| 数值需调 | 全部集中在 `src/shared/boss.ts` |
| 回滚 | 新增文件为主，不影响现有战斗 |

## 9. 完成定义（DoD）

- [ ] P1–P12、N1–N13 测试存在 / 通过
- [ ] `npm test`、`tsc`、`vite build`、服务端测试全绿
- [ ] 测试服多人 E2E（至少 2 人）
- [ ] 超时 / 断线 / 全员断线都有处理
- [ ] 不写存档血量
- [ ] FEATURES / CHANGELOG / MULTIPLAYER / feature 同步

## 10. 提交 / PR 拆分

1. `共享：BOSS 定义与多人共享战斗`
2. `协议：BOSS 消息与存档字段`
3. `服务端：BOSS 会话、阶段、超时与奖励`
4. `客户端：BOSS 界面与入口`
5. `测试与文档`
