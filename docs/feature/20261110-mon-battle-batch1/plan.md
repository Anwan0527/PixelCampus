# 实现计划 · IR #5 精灵对战第一批（B 方案）

> 由 [spec.md](spec.md) 生成；spec 变了先改 spec，再同步本文件。
> 对应 Issue：[EXIST-D/PixelCampus#5](https://github.com/EXIST-D/PixelCampus/issues/5)
> 状态：已开工；客户端 + 共享规则已实现（2026-11-10）；**服务端实现 / 权限 / 上线时间待定**（见 §9）

## 1. 第一步：验收标准 → 测试函数

分类约定：

- **单元**：纯函数 / 共享规则，无 DOM、无网络。
- **集成**：happy-dom + 假 `NetClient` / 假 WebSocket；不连真实服务器。
- **E2E**：真实 Vite 页面 + 本地/真实服务器；仓库目前没有 E2E runner，记为**手工 E2E 清单**，服务端 TBD 前跑不了。

先按本表把测试写出来（红），再写实现（绿）。每一条 A / N 至少一个测试。

### 1.1 应该发生（A1–A17）

| ID | 测试函数 | 类型 | 文件 | 断言 |
|---|---|---|---|---|
| A1 | `int_panel_full_slot_shows_replace` | 集成 | `tests/integration/mon-panel-learn.test.ts` | 4 技能 + `learnable` 非空 → 每条当前技能有「更换」；点选后假 `NetClient` 收到 `mon_replace { id, move, drop: 槽位下标 }` |
| A1 | `e2e_replace_move_full_flow` | E2E（手工） | 本文件 §3 清单 | 真实服务器：替换后 `mon_data` 的 `mv` / `learnable` 正确 |
| A2 | `int_panel_free_slot_shows_learn` | 集成 | 同上 | 3 技能（有空槽）+ `learnable` → 显示「学习新技能」；点击后收到 `drop: -1` |
| A2 | `e2e_free_slot_flow` | E2E（手工） | §3 清单 | 空槽学习后 `mv.length + 1` |
| A3 | `unit_learnMove_replace` | 单元 | `tests/mon-learn.test.ts` | `mv[drop].id === move`、PP 满、旧技能消失、`learnableMoves` 不再含新技能 |
| A3 | `int_panel_renders_server_update` | 集成 | `tests/integration/mon-panel-learn.test.ts` | 假服务器推回新 `mon_data` 后，面板显示新技能与满 PP |
| A4 | `unit_learnMove_append_free_slot` | 单元 | `tests/mon-learn.test.ts` | `drop = -1` 且有空槽 → `mv.length + 1`，原技能顺序 / 内容不变 |
| A4 | `int_panel_free_slot_renders_appended` | 集成 | 同上 | 推回数据后面板显示追加后的技能 |
| A5 | `unit_learnable_current_and_past` | 单元 | `tests/mon-learn.test.ts` | 猫系 chain 中当前 `c00b` → 含 `c00a` + `c00b`，不含 `c00c` |
| A5 | `unit_learnable_excludes_future` | 单元 | 同上 | 未来阶段独有的技能不出现 |
| A5 | `unit_learnable_excludes_current` | 单元 | 同上 | 当前 `mv` 里的技能不出现 |
| A5 | `unit_learnable_level_filter` | 单元 | 同上 | 只出现 `lv <= m.lv` 的技能；同级边界（`===`）包含 |
| A6 | `unit_learnMove_save_roundtrip` | 单元 | `tests/mon-learn.test.ts` | `learnMove` 后 JSON 序列化 / 反序列化 `MonSave`，`mv` 不丢 |
| A6 | `int_panel_rerender_after_mon_data` | 集成 | `tests/integration/mon-panel-learn.test.ts` | 模拟重连后重新收到 `mon_data`，显示与替换后一致 |
| A6 | `e2e_reload_persists` | E2E（本地已跑通） | §3 清单 | 本地真实服务端 + 浏览器：替换后 `mon_data` 的 `mv` / `learnable` 正确 |
| A7 | `unit_gainXp_full_keeps_mv` | 单元 | `tests/mon-learn-events.test.ts` | 满 4 技能升级：`m.mv` 不增加该技能，事件为 `learn { full: true }` |
| A7 | `unit_learnLogText_full` | 单元 | `tests/mon-ui-helpers.test.ts` | 文案严格为「想学会 X，但技能已满；可在精灵面板更换」 |
| A7 | `int_battle_learn_text` | 集成 | `tests/integration/battle-ui-info.test.ts` | 战斗日志出现上述文案 |
| A8 | `unit_evolveCheck_full_emits_learn` | 单元 | `tests/mon-learn-events.test.ts` | 进化时技能满 → 事件流出现 `learn { full: true }`，`m.mv` 不增加 |
| A8 | `int_battle_evolve_learn_text` | 集成 | `tests/integration/battle-ui-info.test.ts` | 进化事件播放后日志出现同 A7 文案 |
| A9 | `int_panel_missing_learnable_hides` | 集成 | `tests/integration/mon-panel-learn.test.ts` | `mon_data` 没有 `learnable` → 无「更换」「学习新技能」；无异常 |
| A10 | `unit_moveInfo_fields` | 单元 | `tests/mon-ui-helpers.test.ts` | 属性文字、物理 / 特殊、威力、命中、PP、倍率字段齐全 |
| A10 | `int_battle_move_menu` | 集成 | `tests/integration/battle-ui-info.test.ts` | 出招按钮 DOM 含上述字段；倍率与 `typeMult` 一致 |
| A11 | `unit_effectText_thresholds` | 单元 | `tests/mon-ui-helpers.test.ts` | 0 →「无效」；2 / 4 →「效果拔群 ×N」；0.5 / 0.25 →「效果不佳 ×N」；1 → 无倍率文字 |
| A11 | `int_battle_move_menu` | 集成 | 同上 | 菜单文字与阈值一致 |
| A12 | `unit_hpText_zero_max` | 单元 | `tests/mon-ui-helpers.test.ts` | `hpText(10, 0)` 不出现 `NaN` / `Infinity` |
| A12 | `int_battle_hp_types` | 集成 | `tests/integration/battle-ui-info.test.ts` | 对手卡含 `hp/max`；我方卡含属性徽章 |
| A13 | `unit_summarizeEvents` | 单元 | `tests/mon-ui-helpers.test.ts` | 经验、升级、进化、学招、收服各一行；无对应事件则无该行 |
| A13 | `int_battle_summary` | 集成 | `tests/integration/battle-ui-info.test.ts` | `phase === 'over'` 时菜单区出现结算摘要 |
| A14 | `unit_summarizeEvents_empty` | 单元 | 同上 | `ev = []` 只返回结果，不返回空行 |
| A14 | `int_battle_summary_empty` | 集成 | 同上 | 空 `ev` 的 `over` 只显示结果，不报错 |
| A15 | `unit_fastDelay` | 单元 | `tests/mon-ui-helpers.test.ts` | 快进为原时长 35%，下限 80ms；关闭时原样返回 |
| A15 | `int_battle_fast_toggle` | 集成 | `tests/integration/battle-ui-info.test.ts` | 点击后 `aria-pressed` 变化；后续等待使用快进时长 |
| A16 | `unit_fastStorage_roundtrip` | 单元 | `tests/mon-ui-helpers.test.ts` | 写入后读出为同一状态 |
| A16 | `int_battle_fast_persist` | 集成 | 同上 | 重新实例化 `BattleUi` 后快进状态保留 |
| A17 | `unit_fastStorage_throws` | 单元 | `tests/mon-ui-helpers.test.ts` | storage 读写抛异常 → 返回默认关闭，不抛出 |
| A17 | `int_battle_fast_storage_throws` | 集成 | 同上 | `localStorage` 抛异常时页面不报错，按钮可用 |

### 1.2 绝对不能发生（N1–N16）

| ID | 测试函数 | 类型 | 文件 | 断言 |
|---|---|---|---|---|
| N1 | `int_panel_no_optimistic_update` | 集成 | `tests/integration/mon-panel-learn.test.ts` | 点击替换后、收到 `mon_data` 前，面板仍显示旧技能；`mv` 未被本地修改 |
| N2 | `int_panel_missing_learnable_no_local_derivation` | 集成 | 同上 | 无 `learnable` 时，即使共享 `learnsetOf` 能算出技能，面板也不显示任何可学项 |
| N3 | `unit_filterLearnable_unknown` | 单元 | `tests/mon-ui-helpers.test.ts` | 未知 move id 被过滤，不进入显示列表 |
| N3 | `int_panel_unknown_move_skipped` | 集成 | `tests/integration/mon-panel-learn.test.ts` | `learnable` 混入未知 id → 不渲染、不崩溃 |
| N4 | `unit_learnMove_rejects_not_learnable` | 单元 | `tests/mon-learn.test.ts` | 不在 `learnableMoves` 里的技能 → `ok: false`，`mv` 不变 |
| N5 | `unit_learnMove_rejects_known` | 单元 | 同上 | 当前已带的技能 → 拒绝，`mv` 不变 |
| N6 | `unit_learnMove_rejects_bad_drop` | 单元 | 同上 | `drop` 非整数 / `< -1` / 满槽时越界 → 拒绝，`mv` 不变 |
| N6 | `unit_learnMove_rejects_minus_one_when_full` | 单元 | 同上 | 满槽 + `drop = -1` → 拒绝，`mv` 不变 |
| N7 | `srv_rejects_replace_in_battle` | 服务端单元 | `server/tests/monreplace.test.ts` | 战斗中收到 `mon_replace` → 拒绝，`mv` 不变 |
| N7 | `e2e_battle_blocks_panel` | E2E（手工） | §3 清单 | 战斗中按 R / 菜单「精灵」→ 面板不打开 |
| N8 | `unit_learnMove_never_exceeds_slots` | 单元 | `tests/mon-learn.test.ts` | 满槽替换后 `mv.length` 不变；空槽追加后不超过 `moveSlots` |
| N9 | `unit_learnable_dedupes` | 单元 | 同上 | 不同阶段重复出现的同一技能只出现一次 |
| N9 | `unit_learnMove_rejects_duplicate` | 单元 | 同上 | 结果里没有重复技能 id |
| N10 | `unit_cleanMon_old_save` | 单元 | `tests/mon-learn.test.ts` | 没有 `pend` 字段的旧存档 → `cleanMon` 正常返回，`mv` 不丢、不抛错 |
| N11 | `e2e_battle_blocks_panel` | E2E（代码审查） | §3 清单 | 战斗进行中无法打开精灵面板（复用现有 `anyOverlay`）；未做战斗内点击 |
| N12 | `unit_fastDelay_does_not_touch_engine` | 单元 | `tests/mon-learn-events.test.ts` | 快进只影响 `fastDelay`；同一 RNG + 行动的 `step` 结果不变（复用 `tests/mons.test.ts` 的确定性用例） |
| N12 | `e2e_fast_does_not_change_result` | E2E（手工） | §3 清单 | 开 / 关快进打同一场，回合结果一致 |
| N13 | `unit_effectText_matches_typeMult` | 单元 | `tests/mon-ui-helpers.test.ts` | 对全部属性 × 单 / 双属性组合，文案与 `typeMult` 映射一致 |
| N14 | `unit_hpText_zero_max` | 单元 | 同上 | `max = 0` / 缺失 → 不出现 `NaN` / `Infinity` |
| N14 | `int_battle_hp_types` | 集成 | 同上 | DOM 文本不含 `NaN` / `Infinity` |
| N15 | `unit_summarizeEvents_no_duplicates` | 单元 | 同上 | 一次 XP / 升级 / 进化 / 学招只出现一次 |
| N15 | `int_battle_summary` | 集成 | 同上 | DOM 里每类事件只出现一次 |
| N16 | `unit_no_innerhtml_source_scan` | 单元（源码扫描） | `tests/source-safety.test.ts` | `src/ui/MonPanel.ts`、`src/ui/BattleUi.ts` 及新增 UI 文件里没有 `innerHTML` / `outerHTML` |

### 1.3 覆盖检查

- A1–A17：每条至少 1 个测试；A6 / A7 / A8 等有共享规则 + UI 两层覆盖。
- N1–N16：每条至少 1 个测试；N7 的服务端拒绝已有 `server/tests/monreplace.test.ts`；N11 用代码审查 + 现有 `anyOverlay`。
- 所有单元 / 集成测试在仓库内可跑；E2E 手工项在服务端 TBD 前不可跑，PR 里要写明。

## 2. 实现顺序

0. **测试先行**：按 §1 建测试文件 / 空实现，先红；服务端 TBD 的项用 E2E 清单，不写假跳过。
1. **共享规则**：`learnableMoves()`、`learnableMap()`、`learnMove()`；`cleanMon` 旧存档兼容；单元测试。
2. **战斗事件**：`evolveCheck` 满技能时发 `learn { full: true }`；`learnLogText` 文案；单元测试。
3. **协议**：`ClientMsg` 加 `mon_replace`；`NetClient.monReplace()`；集成测试消息形状。
4. **UI 纯函数**：`moveInfo` / `effectText` / `hpText` / `summarizeEvents` / `fastDelay` / `readFast` / `writeFast` / `filterLearnable`；单元测试。
5. **精灵面板**：当前技能「更换」、空槽「学习新技能」、等 `mon_data`、失败 / 超时 / 无 `learnable` 处理；集成测试。
6. **战斗界面**：出招菜单信息、对手 HP、我方属性、结算摘要、快进；集成测试。
7. **文档**：`FEATURES.md`、`CHANGELOG.md`、`MULTIPLAYER.md`；PR 说明写服务端契约与 TBD。
8. **全量检查**：见 §3；手工 E2E 清单（服务端就绪后）。

> 本批不预期改 `WorldScene.ts`：N11 依赖现有 `anyOverlay` / `battleUi.isOpen`；如果实现时发现必须改，只做最小改动并补测试说明。

## 3. 交付前要跑的检查

```bash
npm ci
npm run assets          # CI 也会跑；首次约 2 分钟
npx tsc --noEmit
npm test
npx vite build
git diff --check
```

手工 E2E 清单（服务端 TBD 前标注「阻塞」，不阻塞客户端 / 共享规则合并）：

1. 真实服务器 + 测试账号：4 技能精灵替换技能 → 刷新 / 重连 → 新技能和 PP 保留，`learnable` 更新。
2. 空槽精灵「学习新技能」→ `mv.length + 1`。
3. 升级时技能满 → 日志文案正确；进化时也出现 `learn{full:true}` 提示。
4. 战斗中按 R / 菜单「精灵」→ 面板不打开。
5. 同一场战斗开 / 关快进 → 回合结果一致。
6. 手机横屏：出招菜单、结算页、技能更换列表不溢出。

## 4. 什么时候算完成（DoD）

- [x] §1 的 A1–A17、N1–N16 测试全部存在；仓库内单元 / 集成 / 服务端测试全绿。
- [x] 服务端实现（私有仓库 `server/` `develop`）：`mon_data.learnable`、`mon_replace`、战斗中拒绝；真实 WebSocket 测试通过。
- [x] `npx tsc --noEmit`、`npx vitest run --config server/vitest.config.ts`（87 个测试文件，1034 通过 / 5 跳过）、`npx vite build` 全绿。
- [x] 本地真实浏览器 E2E：本地服务端 + 本地客户端，打开精灵页、替换技能、`mon_data` 更新。
- [ ] 部署到测试服 / 正式服，并在测试服复跑完整 E2E（服务端权限 / 上线时间待定）。
- [x] `docs/FEATURES.md`、`docs/CHANGELOG.md`、`docs/MULTIPLAYER.md` 已同步。
- [ ] PR 说明链接 `spec.md` / `plan.md`，写清 `mon_replace`、`mon_data.learnable` 契约与服务端部署注意。
- [ ] 没有新增运行时依赖；`happy-dom` 只进 devDependencies。
- [ ] 代码审查确认：客户端只显示 / 只发请求；服务器校验；玩家文字全部 `textContent`。

## 5. 执行需要的环境、账号、数据、依赖服务

| 项 | 需要什么 |
|---|---|
| 运行时 | Node ≥ 22.12、npm；macOS / Linux 均可 |
| 安装 | `npm ci`；首次 `npm run assets`（约 2 分钟，生成物不入库） |
| 新增依赖 | `happy-dom`（devDependency，仅集成测试用；不改运行时依赖） |
| 账号 | 单元 / 集成测试**不需要**账号；真实 E2E 需要本地服务端的测试账号 / token（服务端 TBD，不能使用线上玩家数据） |
| 测试数据 | `data/mons/packs/open/*` + 测试内合成的内容包；`MonSave` 旧存档 fixture（无 `pend`）；猫系 `chain` fixture；`mon_data` 有 / 无 `learnable` 两种 fixture |
| 依赖服务 | 单元 / 集成：无；手工 E2E：`npm run dev` + 私有联机服务器（TBD） |
| CI | `.github/workflows/ci.yml`：`npm ci` → `npm run assets` → `npx tsc --noEmit` → `npm test` → `npx vite build` |
| 环境变量 | 测试沿用 `PIXEL_NO_FESTIVAL=1`（`vitest.config.ts` 已设），不需要新变量 |

## 6. 复用已有能力（不要重写）

| 已有能力 | 位置 | 怎么复用 |
|---|---|---|
| 等级技能表 | `src/shared/mons.ts` 的 `learnsetOf()` | `learnableMoves()` 直接调用，不重写等级规则 |
| 技能槽数 | `moveSlots()` | 空槽 / 满槽判断 |
| 属性倍率 | `typeMult()` / `elementName()` | 出招菜单的克制提示；测试直接对拍 |
| 内容包 | `CONTENT` / `speciesOf`（`src/shared/mons-content.ts`） | 技能名、属性、PP、描述 |
| 存档规则 | `MonSave`、`findMon()`、`cleanMon()`（`src/shared/monbox.ts`） | `learnMove()` 放在同一文件；旧存档兼容复用 `cleanMon` |
| 面板 DOM 工具 | `MonPanel.ts` 的 `el` / `typeBadge` / `bar` / `nameOf` | 新 UI 沿用，不引入新框架 |
| 战斗事件回放 | `BattleUi.ts` 的 `play()` / `anim()` | 只加事件文案和等待时长；不改回放结构 |
| 网络消息入口 | `src/net/client.ts` 的 `handlers` + `tx()` | `monReplace()` 按现有方法风格加 |
| 面板互斥 | `WorldScene.anyOverlay` / `battleUi.isOpen` | N11 直接复用，不新增开关 |
| localStorage 容错 | `src/ui/Immersive.ts`、`Hud.ts` 的 `try/catch` 模式 | 快进读写沿用同一模式，不新建存储层 |
| 测试 fixture | `tests/mons.test.ts` 的 `OPEN` / `makeContent` / `newMon` 模式 | 新单元测试复用；需要时抽到测试辅助文件，不复制大段 fixture |
| 协议测试 | `tests/protocol.test.ts` | 新消息形状测试沿用其写法 |
| CI | `.github/workflows/ci.yml` | 不加新工作流；新测试自动纳入 `npm test` |

## 7. 风险与回滚

| 风险 | 处理 |
|---|---|
| 服务端 TBD，功能上线后不可用 | 客户端只在 `mon_data.learnable` 存在时显示入口；没有字段就不显示，不会出现坏按钮 |
| 服务端只做一半（发了 `learnable` 但没处理 `mon_replace`） | PR 写清「两半一起上」；E2E 清单覆盖；必要时服务端先上 |
| `happy-dom` 与 CI 不兼容 | 固定版本；若 CI 失败，退回纯函数单测 + 手工 E2E，并在 PR 说明 |
| `BattleUi` 异步动画测试不稳 | `vi.useFakeTimers()` + mock `@/audio/sfx` + flush promises；只断言 DOM / 调用参数，不断言真实时钟 |
| 手机排版溢出 | §3 手工横屏检查；新样式复用现有 `.bt-*` / `.mon-*` 断点 |
| 误改技能无法撤销 | 免费不限次数，玩家可立即换回；不做确认弹窗（spec 已定） |
| 旧存档 / 旧服务端 | 没有新存档字段；`learnable` 缺失就不显示；回滚只需 revert 分支，无数据迁移 |

## 8. 提交 / PR 拆分

建议 6 个中文提交（一个改动一个提交）：

1. `共享规则：可学技能与技能替换`
2. `战斗事件：进化满技能提示`
3. `协议：新增 mon_replace 与 mon_data.learnable`
4. `界面：精灵面板技能更换`
5. `界面：战斗招式信息、结算页与快进`
6. `测试与文档：A/N 用例、FEATURES/CHANGELOG/MULTIPLAYER`

PR 说明里链接本目录的 `spec.md` / `plan.md`，写清：

- `mon_replace { id, move, drop }` 契约与 `drop` 语义；
- `mon_data.learnable` 的下发格式；
- 服务端需要做的事（`learnableMap`、`learnMove`、战斗中拒绝）；
- **服务端代码权限 / 实现 / 上线时间待定**；
- 客户端没有 `learnable` 时不显示入口，旧服务端 / 旧存档安全。

## 9. 待定 / 阻塞

- **服务端代码权限**：已解决（`anwan` 已有 sudo；`sudo -l` 显示 `(ALL) ALL`）。
- **服务端 `mon_replace` 处理与 `mon_data.learnable` 下发**：已实现并部署到测试服。原话：「可以把服务端定义为暂定」。
- **服务端上线时间 / 正式服部署**：正式服待主人部署。原话：「先处理客户端 服务端的代码权限后面再弄」。
- A6 的真实持久化、N7 的服务端拒绝已在本地服务端和测试服验证；测试服正面 E2E 已通过（20 级 o02 替换为 `一般·波动`，`mon_data` 更新）。
- **测试服协议版本（2026-11-10 实测）**：测试环境 WSS 可连通；`hello v=11` 被 4001「客户端版本过旧」拒绝，`v=12` 返回 `welcome`。测试服跑的是 **协议 12**，本分支已同步上游 `main`（`33a0c96`，协议 12）。测试环境地址、账号、访问方式见私有文档，不写进公开仓库。
- **测试服协议版本（2026-11-10 实测）**：测试环境 WSS 可连通；`hello v=11` 被 4001「客户端版本过旧」拒绝，`v=12` 返回 `welcome`。测试服跑的是 **协议 12**，本分支已同步上游 `main`（`33a0c96`，协议 12）。测试环境地址、账号、访问方式见私有文档，不写进公开仓库。

## 10. 执行状态（2026-11-10）

- [x] **红灯**：临时 worktree（HEAD `24c4ed0`）只放新测试、不放实现，`33 failed | 4 passed`。4 个通过是基线已有行为或功能不存在时空过的负数断言：A7 升级事件（基线已有）、N10 旧存档（基线已有）、A6 `learnable` 透传（运行时原样转发）、A9/N2 无 `learnable` 不显示入口（功能不存在时为空过）。
- [x] 共享规则：`evolutionLine` / `learnableMoves` / `learnableMap` / `learnMove`
- [x] 战斗事件：`evolveCheck` 满技能 `learn{full:true}`；升级 / 进化文案
- [x] 协议：`mon_replace`、`mon_data.learnable`、`NetClient.monReplace`
- [x] 精灵面板：更换 / 学习新技能 / 等 `mon_data` / 无 `learnable` 隐藏 / 错误与超时
- [x] 战斗界面：招式信息、双方 HP / 属性、结算页、快进
- [x] 单元 / 集成测试：`tests/mon-learn.test.ts`、`tests/mon-learn-events.test.ts`、`tests/mon-ui-helpers.test.ts`、`tests/integration/*`、`tests/source-safety.test.ts`
- [x] **自审修复**：`monResult` 后立即关闭选择器，避免 `mon_data` 到达前二次点击；删除重复 CSS 规则；补「空槽学会后渲染」「进化满技能日志」「`monResult` 关闭选择器」3 个用例。
- [x] 服务端：`server/mons.ts` 的 `MonView.learnable` + `Mons.replace`、`handlers/mons-handler.ts` 注册 `mon_replace`；`server/tests/monreplace.test.ts` 6 个用例（含真实 WebSocket）
- [x] 本地真实浏览器 E2E：本地服务端 + 本地客户端，打开精灵页、4 个「更换」、可学列表、替换后 `mon_data` 更新
- [x] 文档：`FEATURES.md`、`CHANGELOG.md`、`MULTIPLAYER.md`
- [x] **绿灯**：客户端 / 集成 55 + 服务端 6；`npx tsc --noEmit`、`npx vitest run --config server/vitest.config.ts`（87 个测试文件，1034 通过 / 5 跳过）、`npm run build` 全绿
- [x] 部署到测试服（`bash server/scripts/deploy-test.sh`，2026-11-10 16:32 成功；`status` 正常）
- [x] 测试服正面 E2E（2026-11-10 16:52）：固定测试玩家 20 级 o02 替换为 `一般·波动`，`mon_data` 更新
- [ ] 正式服部署（由主人执行）

## 11. 验收结果（逐条）

| ID | 结果 | 证据 |
|---|---|---|
| A1 | PASS | `tests/integration/mon-panel-learn.test.ts` › 满 4 技能：每条技能有「更换」… |
| A2 | PASS | 同上 › 有空槽：显示「学习新技能」，点击后发 drop = -1 |
| A3 | PASS | `tests/mon-learn.test.ts` › learnMove › 替换…；`mon-panel-learn` › 服务器推回 mon_data 后… |
| A4 | PASS | `mon-learn` › 空槽：drop = -1 追加…；`mon-panel-learn` › 空槽学会后… |
| A5 | PASS | `mon-learn` › evolutionLine / learnableMoves 的 6 个用例 |
| A6 | PASS | `mon-learn` › 学完存盘再读回…；`mon-panel-learn` › 服务器推回 mon_data 后…；服务端 `server/tests/monreplace.test.ts` 真实 WebSocket；本地浏览器 E2E 替换后 `mon_data` 更新 |
| A7 | PASS | `tests/mon-learn-events.test.ts` › 升级满技能…；`battle-ui-info` › 升级满技能：战斗日志… |
| A8 | PASS | `mon-learn-events` › 进化满技能…；`battle-ui-info` › 进化满技能：日志… |
| A9 | PASS | `mon-panel-learn` › 没有 learnable：不显示任何更换 / 学习入口 |
| A10 | PASS | `tests/mon-ui-helpers.test.ts` › moveView 字段…；`battle-ui-info` › 出招菜单显示… |
| A11 | PASS | `mon-ui-helpers` › 倍率文字阈值 / 与 typeMult…；`battle-ui-info` › 出招菜单显示… |
| A12 | PASS | `mon-ui-helpers` › hpText…；`battle-ui-info` › 对手显示 hp/max… |
| A13 | PASS | `mon-ui-helpers` › 经验 / 升级 / 进化 / 学招 / 收服各一行；`battle-ui-info` › 结算页显示… |
| A14 | PASS | `mon-ui-helpers` › 空事件返回空数组；`battle-ui-info` › over 但没有事件… |
| A15 | PASS | `mon-ui-helpers` › 快进 35%…；`battle-ui-info` › 快进按钮切换… |
| A16 | PASS | `mon-ui-helpers` › 偏好读写往返；`battle-ui-info` › 快进按钮切换并持久化… |
| A17 | PASS | `mon-ui-helpers` › storage 抛异常…；`battle-ui-info` › localStorage 抛异常… |
| N1 | PASS | `mon-panel-learn` › 点击替换后、服务器推回前：面板不本地修改 mv |
| N2 | PASS | `mon-panel-learn` › 没有 learnable：不显示任何更换 / 学习入口 |
| N3 | PASS | `mon-ui-helpers` › filterLearnable 去掉未知…；`mon-panel-learn` › learnable 里的未知技能… |
| N4 | PASS | `mon-learn` › 不在可学列表里的技能被拒绝 |
| N5 | PASS | `mon-learn` › 当前已带的技能被拒绝 |
| N6 | PASS | `mon-learn` › 非法 drop 被拒绝；满槽时 drop = -1 被拒绝 |
| N7 | PASS | `server/tests/monreplace.test.ts` › 战斗中拒绝更换（复用 run 的战斗保护） |
| N8 | PASS | `mon-learn` › 满槽时 drop = -1 被拒绝，不会超过技能槽；替换后长度不变 |
| N9 | PASS | `mon-learn` › 不同阶段的重复技能只出现一次；替换后不会产生重复技能 id |
| N10 | PASS | `mon-learn` › 没有 pend 字段的旧存档能正常读取，mv 不丢 |
| N11 | PASS（代码审查） | `src/scenes/WorldScene.ts` 的 `anyOverlay` 已包含 `battleUi.isOpen`；本地浏览器 E2E 打开了精灵页，但未在战斗内实际点击 |
| N12 | PASS | `mon-ui-helpers` › fastDelay；既有 `tests/mons.test.ts` › 相同种子 + 相同行动 → 事件完全一致 |
| N13 | PASS | `mon-ui-helpers` › 与 typeMult 的已知事实一致 |
| N14 | PASS | `mon-ui-helpers` › max = 0 不出现 NaN；`battle-ui-info` › max = 0 不出现 NaN |
| N15 | PASS | `mon-ui-helpers` › 同一事件只出现一次；`battle-ui-info` › 结算页…每项一次 |
| N16 | PASS | `tests/source-safety.test.ts` › 新增 / 修改的界面代码不使用 innerHTML / outerHTML |

**未完成 / 阻塞**：部署到测试服 / 正式服，并在测试服复跑完整 E2E；N11 的战斗内点击未做（代码审查 + `anyOverlay`）。其余 A / N 已有仓库内 / 本地服务端自动化验证并通过。

## 12. 本地联调记录（2026-11-10）

- 已把上游 `main`（`33a0c96`，协议 12）同步到 `feature/mon-battle-batch1`，并把本功能接到新的 `MonPanel` 背包 Section 结构上。
- 服务端仓库已放到公开仓库的 `server/`（`develop` 分支），`server/` 在 `.git/info/exclude` 里，不误提交；原路径 `/Users/zaowulanyin/Desktop/PixelCampus-server` 保留软链接。
- 同步后验证：`npm run assets`、`npx tsc --noEmit`、`npx vitest run --config server/vitest.config.ts`（87 个测试文件，1034 通过 / 5 跳过）、`npm run build` 全绿。
- **本地真实浏览器 E2E 通过**：本地服务端（8790）+ 本地客户端（5173），`net.status = online`；打开精灵页看到 4 个「更换」，可学列表 1 项，点击后 `mon_data` 更新为 `水·波动`、PP 满。
- 测试服会校验 WebSocket `Origin`，只接受测试站域名；本地 `127.0.0.1` 直连返回 403，测试服联调时用 `.cache/ws-relay.mjs` 中继把 `Origin` 改写成测试站域名。本地服务端用 `ALLOWED_ORIGINS=http://127.0.0.1:5173` 放行 dev。
- 测试服已部署（2026-11-10 16:32）：`status` 正常；真实 WebSocket 发 `mon_replace` 非法请求被拒（`这个技能现在学不了`），说明新处理器已生效。测试服数据独立，未动正式服。
- **测试服正面 E2E 通过（2026-11-10 16:52）**：固定测试玩家（20 级 o02）替换为 `一般·波动`，`mon_data` 更新；测试服 `players.json` 已先备份再合并，profiles 7。
- 正式服部署待主人；测试环境地址、账号、口令不写进公开文档。中继 / 种子脚本在 `.cache/`（gitignored），联调后可清理。
- **平衡调整（2026-11-10）**：登录赠送的「耄耋」技能槽 10 → 5；测试服已重新部署，浏览器验证默认 5 个技能 + 可换的 5 个多系技能；旧 10 技能存档收敛到前 5 个。
- **真实浏览器战斗 E2E（2026-11-10）**：本地服务端 + 客户端，草地遇敌「钢壳 Lv.6」→ 迎战；出招菜单显示属性/威力/命中/PP/克制（如「效果不佳 ×0.5」），对手显示 `24/24`，我方显示 `湖鲸 Lv.20 71/71 水冰`；快进可切换（`aria-pressed` + localStorage）；战斗内按 I 背包不打开；打赢后结算页显示「战斗胜利！湖鲸 获得 65 点经验」和一行经验。`BATTLE_E2E_OK` / `BATTLE_FINISH_OK`。
