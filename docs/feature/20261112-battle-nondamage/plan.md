# 实现计划 · 2A-3 非伤害招式

> 由 [spec.md](spec.md) 生成；spec 变了先改 spec，再同步本文件。
> 对应 Issue：[EXIST-D/PixelCampus#6](https://github.com/EXIST-D/PixelCampus/issues/6)
> 状态：待开工（2026-11-12）

## 1. 第一步：验收标准 → 测试函数

| ID | 测试函数 | 类型 | 文件 | 断言 |
|---|---|---|---|---|
| P1 | `unit_acc_eva_hit_rate` | 单元 | `tests/battle-moves.test.ts` | 命中 / 闪避等级改变命中率 |
| P2 | `unit_acc_clamped` | 单元 | 同上 | 夹在 5%–100%；必中不受影响 |
| P3 | `unit_sleep_heal` | 单元 | 同上 | 回满 + 自睡 2 回合 |
| P4 | `unit_heal_variants` | 单元 | 同上 | 睡觉 / 自我再生 / 小回复 / 吸取的回复量 |
| P5 | `unit_heal_full_hp_uses_pp` | 单元 | 同上 | 满血提示并扣 PP |
| P6 | `unit_stat_moves` | 单元 | 同上 | 剑舞 / 铁壁 / 高速移动 / 影分身 / 瞪眼 / 烟雾 |
| P7 | `unit_guard_blocks` | 单元 | 同上 | 伤害 0、对方扣 PP、状态被挡 |
| P8 | `unit_guard_chain` | 单元 | 同上 | 连续成功率的衰减与下限 25% |
| P9 | `unit_guard_chain_reset` | 单元 | 同上 | 换人 / 用其他招式中断 |
| P10 | `int_menu_move_desc` | 集成 | `tests/integration/battle-ui-moves.test.ts` | 「威力 —」+ 效果说明 |
| P11 | `int_blocked_disables_moves` | 集成 | 同上 | 睡 / 冻 / 麻痹时禁用 |
| N1 | `unit_acc_clamped` | 单元 | 同上 | 上下限 |
| N2 | `unit_guard_does_not_block_own_status` | 单元 | 同上 | 只挡对方攻击 |
| N3 | `unit_guard_chain` | 单元 | 同上 | 最低 25% |
| N4 | `unit_heal_capped` | 单元 | 同上 | 不超过上限 |
| N5 | `unit_sleep_keeps_dot` | 单元 | 同上 | 不清除毒 / 灼伤 |
| N6 | `unit_cannot_use_when_blocked` | 单元 | 同上 | 睡 / 冻 / 麻痹时不能用 |
| N7 | `unit_no_protocol_change` | 源码扫描 | 同上 | `protocol.ts` 无新消息 |
| N8 | `unit_moves_not_in_save` | 单元 | 同上 | `Mon.mv` 仍是 id + PP |
| N9 | `unit_deterministic_moves` | 单元 | 同上 | 相同种子一致 |
| N10 | `unit_old_content_no_fields` | 单元 | 同上 | 旧招式不报错 |
| N11 | `unit_no_innerhtml` | 源码扫描 | 同上 | 不含 `innerHTML` |
| N12 | `unit_acc_display_matches_engine` | 单元 | 同上 | UI 显示规则与结算共用同一函数 |

## 2. 实现顺序

1. `mons.ts`：`Move.heal` / `Move.guard` / 效果描述；命中率计算函数。
2. `battle.ts`：命中判定接入、保护链、回复、睡觉、变化招式（复用 `stat`）。
3. 内容包：开放包 / 猫系 / 野生精灵的 `learnset` 加招式。
4. `monBattleHelpers.ts`：效果说明文案。
5. `BattleUi.ts`：菜单「威力 —」+ 说明、满血提示、守住日志。
6. 测试 + 文档。

## 3. 文件改动清单

| 文件 | 改动 |
|---|---|
| `src/shared/mons.ts` | `Move.heal` / `Move.guard`、`hitRate()` |
| `src/shared/battle.ts` | 命中判定、保护链、回复、睡觉、变化 |
| `src/shared/cat-mons.ts`；`data/mons/packs/open/species.json` 或 `mons-content.ts` | 新招式与 `learnset` |
| `src/ui/monBattleHelpers.ts` | `moveEffectText()` |
| `src/ui/BattleUi.ts` | 菜单说明、满血提示、日志 |
| `tests/battle-moves.test.ts`（新） | P1–P9、N1–N6、N8–N10、N12 |
| `tests/integration/battle-ui-moves.test.ts`（新） | P10–P11 |
| `docs/FEATURES.md` / `CHANGELOG.md` | 同步 |

## 4. 详细设计

### 4.1 类型

```ts
export interface Move {
  ...;
  /** 回复：比例（0–1）；selfSleep = 回满后自睡几回合（睡觉招） */
  heal?: { ratio: number; selfSleep?: number };
  /** 保护：本回合免伤（连续使用衰减） */
  guard?: true;
  /** 吸取：按造成伤害的比例回血 */
  drain?: number;
}
/** 命中率：基础命中 × 命中/闪避倍率，夹在 5%–100% */
export function hitRate(acc: number, stageDiff: number): number;
```

- 变化招式仍用 `Move.stat`（2A-1 已有），`d` 可以是 +2 / −1 等。
- 非伤害招式 `power = 0`。

### 4.2 战斗流程

- 命中判定：`rnd()*100 >= hitRate(m.acc, 命中等级 − 闪避等级)`。
- 保护：结算攻击前检查对方是否守住；守住则伤害 0、附带状态跳过；记录连续次数。
- 回复：`heal.ratio` 回血、上限截断；睡觉时 `selfSleep = 2`。
- 吸取：攻击后按 `drain × dmg` 回血。
- 保护链：按精灵记 `guardChain`；用其他招式或换人重置。

### 4.3 UI

- `moveEffectText(move)`：`回复 1/2 生命`、`回满并睡 2 回合`、`本回合免伤`、`攻击 +2` 等。
- 满血提示：复用日志 `say('生命已满')`。
- 保护日志：`守住了！` / `保护失败了……`。

## 5. 测试计划

- `tests/battle-moves.test.ts`：固定内容包 + 固定 RNG。
- `tests/integration/battle-ui-moves.test.ts`：happy-dom + 假 NetClient。
- 全量：`npm test`、`tsc`、`vite build`。

## 6. 复用已有能力

- `Move.stat` / `bumpStage`（变化招式）
- `applyStatus`（睡觉）
- `stagedStats` / `stageMul`（伤害）
- 2A-2 的 `.bt-blocked` 和禁用逻辑
- 现有测试夹具

## 7. 环境 / 账号 / 数据 / 依赖

- 单元 / 集成：Node ≥ 22.12、`npm ci`、`happy-dom`（已有）。
- 无新依赖、无账号、无服务端联调；服务端只需同步 `src/shared/`。

## 8. 风险与回滚

| 风险 | 处理 |
|---|---|
| 命中判定改动影响所有战斗 | 0 级时 `hitRate = acc`，行为不变；既有测试兜底 |
| 保护链/回复拖慢战斗 | 守住 ×0.5 下限 25%；睡觉自睡 2 回合；PP 限制 |
| 命名增多导致内容分散 | 机制和数值统一，名字只是数据 |
| 确定性 | 随机调用顺序固定 |
| 回滚 | 纯 `src/shared/` + UI，revert 分支 |

## 9. 完成定义（DoD）

- [ ] P1–P11、N1–N12 测试存在 / 通过。
- [ ] `npm test`、`tsc`、`vite build` 全绿。
- [ ] 旧存档 / 旧内容包兼容。
- [ ] FEATURES / CHANGELOG / feature spec+plan 同步。
- [ ] 不改协议 / 存档。

## 10. 提交 / PR 拆分

1. `引擎：命中/闪避接入、回复、保护、变化招式`
2. `内容：开放包 / 猫系 / 野生精灵的非伤害招式`
3. `界面：非伤害招式说明与日志`
4. `文档：FEATURES / CHANGELOG / feature spec+plan`
