# 实现计划 · 2A-1 能力等级

> 由 [spec.md](spec.md) 生成；spec 变了先改 spec，再同步本文件。
> 对应 Issue：[EXIST-D/PixelCampus#6](https://github.com/EXIST-D/PixelCampus/issues/6)
> 状态：待开工（2026-11-11）

## 1. 第一步：验收标准 → 测试函数

| ID | 测试函数 | 类型 | 文件 | 断言 |
|---|---|---|---|---|
| P1 | `unit_stage_applies_on_stat_move` | 单元 | `tests/battle-stages.test.ts` | 带 `stat` 的招式命中后 `stage` 事件与等级正确 |
| P2 | `unit_atk_stage_doubles_damage` | 单元 | 同上 | 攻 +2 的物理伤害约为 0 级的 2 倍 |
| P3 | `unit_def_stage_halves_damage` | 单元 | 同上 | 防 +2 受到物理伤害约一半 |
| P4 | `unit_spa_spd_stages` | 单元 | 同上 | 特攻 / 特防对特殊技能同理 |
| P5 | `unit_spe_stage_affects_order` | 单元 | 同上 | 速度倍率影响先手 |
| P6 | `unit_stage_clamps_pm6` | 单元 | 同上 | 超过 +6 / 低于 −6 截断 |
| P7 | `unit_stage_persists_on_switch` | 单元 | 同上 | 换下再上场沿用自身等级 |
| P8 | `unit_stage_reset_on_faint` | 单元 | 同上 | 倒下清零 |
| P9 | `int_battle_shows_stages` | 集成 | `tests/integration/battle-ui-stages.test.ts` | 卡片下方显示升降标记 |
| P10 | `int_battle_stage_log` | 集成 | 同上 | 日志出现「提升了 / 降低了」 |
| P11 | `unit_stage_discarded_after_battle` | 单元 | `tests/battle-stages.test.ts` | 战斗结束不残留到新 `Battle` |
| N1 | `unit_stage_clamps_pm6` | 单元 | 同上 | 上下界 |
| N2 | `unit_no_stage_in_save` | 单元 | 同上 | `cleanMon` 前后无能力等级字段 |
| N3 | `unit_no_protocol_change` | 源码扫描 | `tests/mondex-source-safety.test.ts` 或新文件 | `protocol.ts` 无 stage 相关消息 |
| N4 | `unit_hit_rate_unaffected_by_acc_eva` | 单元 | `tests/battle-stages.test.ts` | 命中/闪避等级不改变命中掷骰 |
| N5 | `unit_no_stat_no_stage_event` | 单元 | 同上 | 无 `stat` 的招式不产生事件 |
| N6 | `unit_stat_chance_miss_no_change` | 单元 | 同上 | `chance` 未命中时等级不变 |
| N7 | `unit_stage_persists_on_switch` | 单元 | 同上 | 换人不重置 |
| N8 | `unit_stage_reset_on_faint` | 单元 | 同上 | 倒下清零 |
| N9 | `unit_deterministic_with_stages` | 单元 | 同上 | 相同种子结果一致 |
| N10 | `unit_old_content_no_stat` | 单元 | 同上 | 无 `stat` 内容包正常 |
| N11 | `unit_no_innerhtml` | 源码扫描 | 同上 | 战斗 UI / 模型不含 `innerHTML` |
| N12 | `int_battle_shows_stages` | 集成 | `tests/integration/battle-ui-stages.test.ts` | 文字 + 箭头，不只靠颜色 |

## 2. 实现顺序

1. `src/shared/mons.ts`：`Move.stat` 类型 + 分档表 `stageMul`。
2. `src/shared/battle.ts`：`Battle.stages`（按精灵 id）、`BEvent.stage`、`calcDamage` 接入倍率、先手用速度倍率、触发 `stat`。
3. 内容包：给现有几个招式加 `stat`（老吴咆哮降攻等）。
4. `src/ui/monBattleHelpers.ts`：能力等级文字 / 日志文案。
5. `src/ui/BattleUi.ts`：卡片下方显示升降；日志。
6. 测试：单元 + 集成。
7. 文档：FEATURES / CHANGELOG / feature。

## 3. 文件改动清单

| 文件 | 改动 |
|---|---|
| `src/shared/mons.ts` | `Move.stat`；`stageMul` / `stageName`；`StatKey` 扩展可选 `acc` / `eva` |
| `src/shared/battle.ts` | `Battle.stages: Map<string, Stages>`；`BEvent` 加 `stage`；`attack()` 用倍率；先手用速度倍率；命中后按 `stat` 改等级 |
| `src/shared/cat-mons.ts` / 内容包 | 给若干招式加 `stat` |
| `src/ui/monBattleHelpers.ts` | `stageText` / `stageLog` |
| `src/ui/BattleUi.ts` | 卡片下方 `.bt-stages`；日志 |
| `src/ui/styles/10-mons-battle.css` | `.bt-stages` 样式 |
| `tests/battle-stages.test.ts`（新） | P1–P8、P11、N1–N2、N4–N10 |
| `tests/integration/battle-ui-stages.test.ts`（新） | P9–P10、N12 |
| `docs/FEATURES.md` / `docs/CHANGELOG.md` | 同步 |

## 4. 详细设计

### 4.1 `mons.ts`

```ts
export type StageKey = StatKey | 'acc' | 'eva';
export interface MoveStat { k: StageKey; d: number; target: 'self' | 'foe'; chance?: number }
export interface Move { ...; stat?: MoveStat }

export const STAGE_MAX = 6;
/** 分档倍率：+1..+6 = 1.5,2,2.5,3,3.5,4；-1..-6 = 2/3,1/2,2/5,1/3,2/7,1/4 */
export function stageMul(n: number): number { ... }
```

- 命中/闪避倍率表：`[3,3]`、`[3,4]` … `[3,9]`（本批只用于显示，不接入判定）。

### 4.2 `battle.ts`

```ts
export interface Stages { atk: number; def: number; spa: number; spd: number; spe: number; acc: number; eva: number }
export interface Battle { ...; /** 精灵 id → 能力等级 */ stages: Map<string, Stages> }
export type BEvent = ... | { t: 'stage'; side: Side; k: StageKey; d: number; v: number };
```

- `startBattle` 初始化空 Map。
- `stagesOf(b, side)`：取当前场上精灵的等级（没有就建 0）。
- `bump(b, side, k, d)`：截断到 ±6，返回实际变化。
- `attack()`：`calcDamage` 使用 `monStats × stageMul(atk/def/spa/spd)`。
- 先手：比较 `spe × stageMul(spe)`。
- 命中后：如果 `mv.stat` 且 `rnd()*100 < chance`，调用 `bump` 并推 `stage` 事件。
- 倒下：`b.stages.delete(mon.id)`。

### 4.3 UI

- `monBattleHelpers.ts`：`stageLabel(k)`、`stageText(stages)`、`stageLog(name, k, d)`。
- `BattleUi.renderStage()`：卡片下方 `.bt-stages`。
- `play()`：处理 `stage` 事件 → 日志。

## 5. 测试计划

- `tests/battle-stages.test.ts`：用固定内容包和固定 RNG，覆盖 P1–P8、P11、N1–N2、N4–N10。
- `tests/integration/battle-ui-stages.test.ts`：happy-dom + 假 NetClient，覆盖 P9–P10、N12。
- 全量：`npm test`、`npx tsc --noEmit`、`npx vite build`。

## 6. 复用已有能力

| 能力 | 位置 | 用法 |
|---|---|---|
| 伤害公式 | `calcDamage` | 在传入的 `stats` 上乘倍率，不改公式结构 |
| 六维 | `monStats` / `STAT_KEYS` / `STAT_NAMES` | 复用命名 |
| 事件回放 | `BattleUi.play()` | 加一个 `case 'stage'` |
| 卡片 | `renderStage()` | 加一行升降 |
| 测试夹具 | `tests/mons.test.ts` 的 `FIX` / `mon()` | 复用 |

## 7. 环境 / 账号 / 数据 / 依赖

- 单元 / 集成：Node ≥ 22.12、`npm ci`、`happy-dom`（已有）。
- 无新依赖、无账号、无服务端联调（引擎在 `src/shared/`）。
- 服务端只需在合并后同步 `src/shared/`（同一份代码），不需要改 handler。

## 8. 风险与回滚

| 风险 | 处理 |
|---|---|
| 改伤害公式引入回归 | 倍率只乘在传入的 `stats` 上，0 级时倍率 = 1，行为不变；既有 `tests/mons.test.ts` 会兜底 |
| UI 卡片空间 | 只在有变化时显示，最多 7 项；手机横屏换行 |
| 确定性 | 所有随机只在 `chance` 判定处消耗，顺序固定 |
| 回滚 | 纯 `src/shared/` + UI，revert 分支即可 |

## 9. 完成定义（DoD）

- [ ] P1–P11、N1–N12 测试存在 / 通过。
- [ ] `npm test`、`npx tsc --noEmit`、`npx vite build` 全绿。
- [ ] 旧存档 / 旧内容包兼容。
- [ ] `docs/FEATURES.md`、`docs/CHANGELOG.md`、feature spec/plan 同步。
- [ ] PR 说明链接 spec/plan；不改协议 / 存档。

## 10. 提交 / PR 拆分

1. `引擎：能力等级（Move.stat / Battle.stages / 伤害与先手倍率）`
2. `界面：战斗卡片显示能力等级升降`
3. `文档：FEATURES / CHANGELOG / feature spec+plan`
