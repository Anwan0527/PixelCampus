# 实现计划 · 技能数据库扩充

> 由 [spec.md](spec.md) 生成；spec 变了先改 spec，再同步本文件。
> 对应 Issue：[EXIST-D/PixelCampus#23](https://github.com/EXIST-D/PixelCampus/issues/23)
> 状态：待开工（2026-11-12）

## 1. 第一步：验收标准 → 测试函数

| ID | 测试函数 | 类型 | 文件 | 断言 |
|---|---|---|---|---|
| P1 | `unit_move_library_size` | 单元 | `tests/move-library.test.ts` | 18 属性 × 6 = 108 个通用招；`desc` 全部非空 |
| P2 | `unit_starter_signature` | 单元 | 同上 | 初始三只 `learnset` 包含专属招 |
| P3 | `unit_move_roles` | 单元 | 同上 | 每属性覆盖 6 种定位 |
| P4 | `unit_high_risk_side_effect` | 单元 | 同上 | 高风险招的反伤 / 降能力生效 |
| P5 | `unit_control_status` | 单元 | 同上 | 控制招状态概率为 100%，受互斥约束 |
| P6 | `int_move_desc_in_menu` | 集成 | `tests/integration/battle-ui-moves.test.ts`（追加） | 新招式 desc 正常显示 |
| P7 | `unit_genmoves_fallback` | 单元 | `tests/move-library.test.ts` | 没写 learnset 的物种正常生成 |
| N1 | `unit_move_id_unique` | 单元 | 同上 | 招式 id 无重复 |
| N2 | `unit_unknown_move_id` | 单元 | 同上 | 引用不存在的 id 时跳过、不崩溃 |
| N3 | `unit_old_save_unknown_move` | 单元 | 同上 | 旧存档未知招式 id 正常读取 |
| N4 | `unit_only_existing_mechanics` | 单元 | 同上 | 新招式只用到 `stat` / `status` / `heal` / `guard` / `drain` |
| N5 | `unit_type_chart_unchanged` | 单元 | 同上 | 属性相克表未变 |
| N6 | `unit_no_innerhtml` | 源码扫描 | 同上 | 不含 `innerHTML` |

## 2. 实现顺序

1. 设计 108 个通用招式（按属性 × 定位），写入 `data/mons/packs/open/moves.json`。
2. 设计 3 个初始精灵专属招。
3. `mons-content.ts` 读取 `moves.json` 并合并。
4. 物种 `learnset` 引用新招式 id。
5. 测试 + 文档。

## 3. 文件改动清单

| 文件 | 改动 |
|---|---|
| `data/mons/packs/open/moves.json`（新） | 108 个通用招式 + 3 个专属招式 |
| `src/shared/mons-content.ts` | 读取并合并 `moves.json` |
| `data/mons/packs/open/species.json` | 初始三只加专属招式到 `learnset` |
| `src/shared/mons.ts` | 若需要，加 `Move` 校验 / 辅助函数（不新增机制） |
| `tests/move-library.test.ts`（新） | P1–P5、P7、N1–N5 |
| `tests/integration/battle-ui-moves.test.ts` | P6 |
| `docs/FEATURES.md` / `CHANGELOG.md` | 同步 |

## 4. 详细设计

### 4.1 招式 id 规则

- 通用招式：`mv:<属性拼音或英文>:<序号>`，例如 `mv:fire:1`、`mv:water:3`。
- 专属招式：`sig:<物种 id>`，例如 `sig:o01`。
- 非伤害招式沿用 `nd:` / `catnd:`。

### 4.2 `moves.json` 格式

```json
[
  { "id": "mv:fire:1", "name": "火花", "type": "火", "cat": "special", "power": 40, "acc": 100, "pp": 25, "desc": "10% 灼伤" },
  { "id": "mv:fire:4", "name": "烈焰冲锋", "type": "火", "cat": "physical", "power": 120, "acc": 85, "pp": 5, "recoil": 0.33, "desc": "自身受到 1/3 反伤" }
]
```

- `recoil` 是本批新增的字段（反伤比例），属于现有机制的自然扩展，不引入新战斗机制。
- 学习等级按定位分层：1 / 8 / 12 / 15 / 20 / 28；高风险招 28 级。
- 其他效果沿用 `status` / `stat` / `heal` / `guard` / `drain`。

### 4.2.1 学习等级

| 定位 | 等级 |
|---|---|
| 稳定 A | 1 |
| 稳定 B | 8 |
| 控制 | 12 |
| 辅助 | 15 |
| 爆发 | 20 |
| 高风险 | 28 |

### 4.3 各属性 6 个招式的定位

统一模板（属性 = X，状态 = S，能力强项 = A）：

1. `X:1` 稳定 A：威力 40，命中 100，PP 25，无附加
2. `X:2` 稳定 B：威力 65，命中 95，PP 20，10% S（或 10% A 变化）
3. `X:3` 爆发：威力 90，命中 100，PP 15，10% S
4. `X:4` 高风险：威力 120，命中 85，PP 5，反伤 1/3（或降自身能力）
5. `X:5` 控制：威力 0，命中 90，PP 10，100% S
6. `X:6` 辅助：威力 0，命中 100，PP 15，自身 A +1 / 对方 A −1

### 4.4 初始精灵专属招

- 焰尾：尾焰回旋（70 / 100 / 15，20% 灼伤）
- 湖鲸：潮汐咏唱（0 / 100 / 10，回复 1/4 + 特防 +1）
- 葱头：葱油喷溅（75 / 95 / 10，30% 中毒）

### 4.5 兼容

- `genMoves()` 保留，作为没写 `learnset` 的物种兜底。
- 旧存档 `Mon.mv` 只存 id + PP，新招式 id 不影响旧数据。

## 5. 测试计划

- `tests/move-library.test.ts`：数据完整性、定位覆盖、专属招、副作用、兼容、唯一性。
- `tests/integration/battle-ui-moves.test.ts`：新招式 desc 显示。
- 全量：`npm test`、`tsc`、`vite build`。

## 6. 复用已有能力

- `Move` 现有的 `stat` / `status` / `heal` / `guard` / `drain` / `desc`
- `genMoves()` 兜底
- `learnsetOf()` / `movesAtLevel()` 的等级学习
- 精灵面板的「更换技能」
- 现有测试夹具

## 7. 环境 / 账号 / 数据 / 依赖

- 单元 / 集成：Node ≥ 22.12、`npm ci`、`happy-dom`（已有）。
- 无新依赖、无账号、无服务端联调；服务端只需同步 `src/shared/` 和 `data/mons/`。

## 8. 风险与回滚

| 风险 | 处理 |
|---|---|
| 108 个招式平衡难做 | 统一模板 + 每属性只调状态 / 能力；单测覆盖定位 |
| 数据量大、手写易错 | 用脚本生成初稿再人工调整；`moves.json` 加 id 唯一性测试 |
| 旧存档兼容 | 只增不改 id；`genMoves()` 兜底 |
| 回滚 | 纯数据 + 少量共享代码，revert 分支即可 |

## 9. 完成定义（DoD）

- [ ] 108 个通用招式 + 3 个专属招式；`desc` 非空。
- [ ] P1–P7、N1–N6 测试存在 / 通过。
- [ ] `npm test`、`tsc`、`vite build` 全绿。
- [ ] 旧存档 / 旧内容包兼容。
- [ ] FEATURES / CHANGELOG / feature spec+plan 同步。

## 10. 提交 / PR 拆分

1. `技能库：108 个通用招式数据（moves.json）`
2. `技能库：初始三只专属招式与 learnset`
3. `技能库：内容包读取与兜底`
4. `文档：FEATURES / CHANGELOG / feature spec+plan`
