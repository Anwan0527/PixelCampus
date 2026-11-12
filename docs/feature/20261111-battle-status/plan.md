# 实现计划 · 2A-2 状态异常

> 由 [spec.md](spec.md) 生成；spec 变了先改 spec，再同步本文件。
> 对应 Issue：[EXIST-D/PixelCampus#6](https://github.com/EXIST-D/PixelCampus/issues/6)
> 状态：待开工（2026-11-11）

## 1. 第一步：验收标准 → 测试函数

| ID | 测试函数 | 类型 | 文件 | 断言 |
|---|---|---|---|---|
| P1 | `unit_status_applied` | 单元 | `tests/battle-status.test.ts` | 命中后目标获得状态，`status` 事件正确 |
| P2 | `unit_poison_tick` | 单元 | 同上 | 回合结束掉 1/8 |
| P3 | `unit_burn_tick_and_halve` | 单元 | 同上 | 掉 1/16；物理伤害约一半 |
| P4 | `unit_paralysis` | 单元 | 同上 | 速度减半；25% `blocked` |
| P5 | `unit_sleep_ticks` | 单元 | 同上 | 1–3 回合；计数 −1；醒来 `statusend` |
| P6 | `unit_freeze_thaw` | 单元 | 同上 | 20% 解冻；未解冻 `blocked` |
| P7 | `unit_dot_can_kill` | 单元 | 同上 | 毒/灼伤击杀 → 胜利 + 经验 |
| P8 | `unit_status_follows_mon` | 单元 | 同上 | 换人保留 |
| P9 | `unit_no_stack` / `unit_sleep_freeze_exclusive` | 单元 | 同上 | 不叠加、不刷新；互斥 |
| P10 | `unit_catch_bonus` | 单元 | 同上 | 睡眠/冰冻 ×2；其他不加 |
| P11 | `int_status_badge_and_log` | 集成 | `tests/integration/battle-ui-status.test.ts` | 标签与日志 |
| P12 | `int_blocked_disables_menu` | 集成 | 同上 | 按钮禁用 + 提示 |
| N1 | `unit_sleep_freeze_exclusive` | 单元 | 同上 | 互斥 |
| N2 | `unit_no_stack` | 单元 | 同上 | 不叠加 / 不刷新 |
| N3 | `unit_no_status_in_save` | 单元 | 同上 | 存档无状态字段 |
| N4 | `unit_no_protocol_change` | 源码扫描 | `tests/source-safety.test.ts`（追加） | `protocol.ts` 无状态消息 |
| N5 | `unit_hit_unaffected` | 单元 | 同上 | 命中判定不变 |
| N6 | `unit_dot_not_below_zero` | 单元 | 同上 | 血量不为负 |
| N7 | `unit_no_event_after_faint` | 单元 | 同上 | 倒下后不再触发 |
| N8 | `unit_no_status_move_no_event` | 单元 | 同上 | 无状态招式不产生事件 |
| N9 | `unit_status_cleared` | 单元 | 同上 | 解除后不再掉血 |
| N10 | `unit_deterministic_status` | 单元 | 同上 | 相同种子一致 |
| N11 | `unit_old_content` | 单元 | 同上 | 旧内容包不报错 |
| N12 | `int_status_badge_and_log` | 集成 | 同上 | 文字 + 颜色 |
| N13 | `unit_catch_clamped` | 单元 | 同上 | 倍率后仍在 5%–95% |

## 2. 实现顺序

1. `mons.ts`：`StatusKind` / `StatusState` / `Move.status` / `catchChance` 倍率参数。
2. `battle.ts`：`Battle.status`、回合开始的状态判定、攻击后施加、回合结束掉血、解除、击杀。
3. 内容包：给部分招式加状态概率。
4. `monBattleHelpers.ts`：状态文字 / 日志。
5. `BattleUi.ts`：状态标签、日志、不能行动禁用。
6. 测试 + 文档。

## 3. 文件改动清单

| 文件 | 改动 |
|---|---|
| `src/shared/mons.ts` | `StatusKind`、`StatusState`、`Move.status`、`catchChance` 倍率 |
| `src/shared/battle.ts` | `Battle.status`、状态判定、施加、回合伤害、解除、击杀 |
| `src/shared/cat-mons.ts` | 部分招式加状态概率 |
| `src/ui/monBattleHelpers.ts` | `statusText` / `statusLog` |
| `src/ui/BattleUi.ts` | 状态标签、日志、不能行动禁用 |
| `src/ui/styles/10-mons-battle.css` | 状态标签样式 |
| `tests/battle-status.test.ts`（新） | P1–P10、N1–N3、N5–N11、N13 |
| `tests/integration/battle-ui-status.test.ts`（新） | P11–P12、N12 |
| `docs/FEATURES.md` / `CHANGELOG.md` | 同步 |

## 4. 详细设计

### 4.1 类型

```ts
export type StatusKind = 'poison' | 'burn' | 'paralysis' | 'sleep' | 'freeze';
export interface StatusState { k: StatusKind; /** 睡眠剩余回合 */ n?: number }
export interface MoveStatus { s: StatusKind; chance: number }
export interface Move { ...; status?: MoveStatus }
```

### 4.2 回合流程

1. 回合开始：当前精灵若有睡眠/冰冻，判定是否解除 / 能否行动。
2. 能行动 → 正常结算；不能行动 → 推 `blocked`，跳过该方行动。
3. 攻击命中后：如果招式带 `status` 且目标没有状态，按概率施加。
4. 回合结束：毒 / 灼伤掉血；睡眠计数 −1。
5. 判定倒下：毒/灼伤打死野生精灵 = 胜利。

### 4.3 捕捉

- `catchChance(sp, hp, maxHp, ballMul, statusMul = 1)`；服务端在 `mon_bt` 结算时按目标状态传 2 或 1。

### 4.4 UI

- `statusText(k)`、`statusLog(name, k, kind)`。
- 卡片：`.bt-status` 标签。
- 不能行动：`renderMenu()` 禁用按钮 + 顶部 `.bt-blocked` 提示。

## 5. 测试计划

- `tests/battle-status.test.ts`：固定内容包 + 固定 RNG，覆盖逐条。
- `tests/integration/battle-ui-status.test.ts`：happy-dom + 假 NetClient。
- 全量：`npm test`、`tsc`、`vite build`。

## 6. 复用已有能力

- `calcDamage`（灼伤物理减半在传入 stats 上乘 0.5）
- 能力等级的事件 / 卡片渲染方式
- `catchChance` / `mon_bt` 的捕捉流程
- 现有测试夹具

## 7. 环境 / 账号 / 数据 / 依赖

- 单元 / 集成：Node ≥ 22.12、`npm ci`、`happy-dom`（已有）。
- 无新依赖、无账号、无服务端联调。
- 服务端只需同步 `src/shared/`。

## 8. 风险与回滚

| 风险 | 处理 |
|---|---|
| 改回合流程引入回归 | 状态为空时行为不变；既有 1102 个测试兜底 |
| 毒/灼伤击杀漏结算 | 单独用例 P7 |
| 睡眠/冰冻死锁 | 睡眠最多 3 回合、冰冻每回合 20%；P12 禁用按钮 + 提示 |
| 确定性 | 随机调用顺序固定 |
| 回滚 | 纯 `src/shared/` + UI，revert 分支 |

## 9. 完成定义（DoD）

- [ ] P1–P12、N1–N13 测试存在 / 通过。
- [ ] `npm test`、`tsc`、`vite build` 全绿。
- [ ] 旧存档 / 旧内容包兼容。
- [ ] FEATURES / CHANGELOG / feature spec+plan 同步。
- [ ] 不改协议 / 存档。

## 10. 提交 / PR 拆分

1. `引擎：状态异常（五种状态、回合结算、捕捉倍率）`
2. `界面：状态标签、日志、不能行动提示`
3. `文档：FEATURES / CHANGELOG / feature spec+plan`
