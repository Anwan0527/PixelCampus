# 实施计划 · 野生 / 校园猫对战 AI

> 由 [spec.md](spec.md) 生成；spec 变了先改 spec，再同步本文件。
> 对应 Issue：[EXIST-D/PixelCampus#11](https://github.com/EXIST-D/PixelCampus/issues/11)
> 状态：已完成（2026-11-17；客户端与共享规则已提交，服务端猫战参数随服务端仓库提交）

## 1. 方案

现在的 `src/shared/battle.ts` 里，野生/校园猫出招是：

```ts
const wildMove = () => { const list = foe.mv; return moveOf(ct, list[Math.floor(rnd() * list.length)].id); };
```

改法（全部在 `src/shared/`，不改协议、不改存档）：

1. **新增纯函数 `pickFoeMove(ct, state, self, target, mvs, smart, rnd)`**：返回招式下标。
   - 先筛掉 PP 为 0 的；只剩一个可用招直接返回（不再掷骰）。
   - 以 `smart` 概率“认真挑”，否则在可用招里随机。
   - 评分：伤害招 = `威力 × 属性倍率 × 命中率`（倍率 0 排除）；回复招在血量 ≤40% 时加权、血满排除；
     状态招在目标已有该状态时排除；变化 / 保护给低分。
2. **`Battle` 增加可选 `foeSmart?: number`**（只活在战斗里，不进存档）；`startBattle` 增加可选参数。
   - 缺省 = 野生 0.35；校园猫由服务端传 0.55；训练家维持现有 `aiChooseMove` 0.60 不动。
3. `wildMove()` 改为调用 `pickFoeMove`，目标取我方当前上场精灵。
4. 服务端 `startCatBattle` 传 `FOE_SMART.cat`（一行）。

## 2. 任务拆分

| # | 任务 | 文件 | 验收 |
|---|---|---|---|
| T1 | 共享规则：`FOE_SMART`、`scoreMove`、`pickFoeMove`；`Battle.foeSmart`；`wildMove` 接入 | `src/shared/battle.ts` | 单测 A1–A4 |
| T2 | 服务端：校园猫用 0.55 | `server/mons.ts`（私有仓库） | 实测猫战会选克制招 |
| T3 | 测试：`tests/wild-ai.test.ts` | 新增 | 全绿 |
| T4 | 文档：FEATURES / CHANGELOG | `docs/` | — |

## 3. 协议 / 数据

- 无新消息、无存档字段。
- `Battle.foeSmart` 只是内存字段，服务端重启/重连不影响（战斗本来就不持久化）。

## 4. 测试计划

- A1：对手带 2 倍克制招，`smart = 1`、固定种子 → 每次都选克制招。
- A2：0 倍招式不出（有其他可选项时）。
- A3：目标已有该状态 → 不选重复施加的招。
- A4：相同种子两次结果一致；PP 为 0 的招不选。
- A5：训练家战行为不变（现有 `tests/trainer-battle.test.ts` 等仍绿）。
- 全量 `npm test` / `tsc` / `vite build`。

## 5. 上线与回滚

- 纯客户端 / 共享规则改动，服务端只需同步代码（无数据迁移）。
- 回滚：还原 `src/shared/battle.ts` 与 `server/mons.ts` 的对应提交即可。

## 6. 风险

| 风险 | 处理 |
|---|---|
| 野生变强影响新手 | 默认 0.35，可在 `FOE_SMART` 一处调；先上测试环境看手感 |
| 评分过拟合（总是同一招） | 同分随机挑；保留 `smart` 之外的随机回合 |
| 训练家行为被带偏 | 不改 `aiChooseMove`，现有测试兜底 |
