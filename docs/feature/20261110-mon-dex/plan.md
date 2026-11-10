# 实现计划 · IR #8 精灵图鉴页（3A）

> 由 [spec.md](spec.md) 生成；spec 变了先改 spec，再同步本文件。
> 对应 Issue：[EXIST-D/PixelCampus#8](https://github.com/EXIST-D/PixelCampus/issues/8)
> 状态：**实现完成（2026-11-10）**；测试 / 本地 E2E / 测试服 #5+#8 集成验收通过；样式已统一；PR [#14](https://github.com/EXIST-D/PixelCampus/pull/14) 已合并；样式 PR [#15](https://github.com/EXIST-D/PixelCampus/pull/15) 待合并

## 0. 已确认的设计（本轮问答）

| 项 | 结论 |
|---|---|
| 范围 | 开放包 10 只 + 猫系 72 阶（24 毛色 × 3 阶段） + 登录赠送「耄耋」全部进图鉴 |
| 未见过 | 只显示剪影 + No. +「？？？」；属性 / 描述 / 栖息地 / 进化链都不显示 |
| 筛选范围 | 类型 / 区域 / 只看收服只作用于见过的精灵；未见过只出现在「全部」 |
| 分组 | 开放包 / 猫系 / 登录赠送；组内按 No.；每组显示进度 |
| 我的记录 | 只显示见过次数 / 收服次数；不加时间字段、不改协议 |
| 详情 | No.、属性、描述、进化链、栖息地、我的记录；不显示六维 / 技能表 |
| 未见过详情 | 可以点开；剪影 + No. +「？？？」+「还没遇到」 |
| 区域筛选 | 三个野外区域 +「校园猫」+「登录赠送」；未见过不参与 |
| 进化链 | 没有 `chain` / `evo` 隐藏整块；猫系显示完整链 + 进化等级（Lv.16 / Lv.32）；未见过阶段「？？？」 |
| 筛选重置 | 关闭图鉴重置为「全部」；同一次打开里切 tab 保留 |
| 默认 | 手机横屏 4 列；不做搜索框；顶部文字 + 进度条；纯客户端 |

## 1. 第一步：验收标准 → 测试函数

| ID | 测试函数 | 类型 | 文件 | 断言 |
|---|---|---|---|---|
| P1 | `unit_mondex_groups_sorted` | 单元 | `tests/mondex.test.ts` | 开放包 / 猫系 / 登录赠送分组；组内按 No. 升序；总数 83 |
| P1 | `int_codex_mon_loading` | 集成 | `tests/integration/codex-mon.test.ts` | 没有 `mon_data` 时显示「读取中…」；收到后刷新 |
| P2 | `unit_mondex_group_progress` | 单元 | `tests/mondex.test.ts` | 每组 `seen / total`、`caught / total` 正确 |
| P3 | `unit_mondex_seen_count` | 单元 | 同上 | 见过未收服显示 `seen` 次数；名字 / 属性正常 |
| P4 | `unit_mondex_caught_count` | 单元 | 同上 | 已收服显示 `caught` 次数，与 `dex.c` 一致 |
| P5 | `unit_mondex_unseen_hidden` | 单元 | 同上 | 未见过：`name='？？？'`、`types=[]`、`art=null`、`desc=''`、`habitat=''`、`chain=[]` |
| P5 | `int_codex_mon_unseen_detail` | 集成 | `tests/integration/codex-mon.test.ts` | 点未见过卡片：只有剪影 + No. +「？？？」+「还没遇到」 |
| P6 | `unit_mondex_filter_type_seen_only` | 单元 | `tests/mondex.test.ts` | 属性筛选只留见过且含该属性的行；未见过不参与 |
| P7 | `unit_mondex_filter_caught` | 单元 | 同上 | 只看收服只留 `c > 0` |
| P8 | `unit_mondex_filter_zone_options` | 单元 | 同上 | 区域选项 = 三野外 + 校园猫 + 登录赠送；选区域只留见过的对应行 |
| P9 | `unit_mondex_detail_fields` | 单元 | 同上 | 详情行含 No.、属性、描述、栖息地、记录；**不含六维 / 技能** |
| P9 | `int_codex_mon_detail` | 集成 | `tests/integration/codex-mon.test.ts` | 点见过精灵：DOM 显示 No.、属性、描述、栖息地、记录 |
| P10 | `e2e_mondex_mobile` | E2E（手工） | §3 清单 | 手机横屏 4 列、详情不横向溢出 |
| P11 | `int_codex_mon_filter_reset` | 集成 | `tests/integration/codex-mon.test.ts` | 关闭再打开筛选恢复「全部」；同次切 tab 保留 |
| N1 | `unit_mondex_unseen_no_leak` | 单元 | `tests/mondex.test.ts` | 模型 `art=null`；UI 用 `monArt` + `brightness(0)` 剪影；名字 / 描述 / 属性 / 栖息地 / 进化链为空 |
| N2 | `unit_mondex_filters_exclude_unseen` | 单元 | 同上 | 任一筛选开启时未见过行被排除 |
| N3 | `unit_mondex_unknown_species` | 单元 | 同上 | 不认识的物种 id 跳过，不抛错 |
| N4 | `unit_mondex_missing_entry` | 单元 | 同上 | `dex` 缺条目按未见过处理 |
| N5 | `unit_mondex_reads_dex_only` | 单元 | 同上 | seen/caught 只由传入 `dex` 决定，和等级 / 持有无关 |
| N6 | `unit_mondex_no_protocol_change` | 单元（源码扫描） | `tests/mondex-source-safety.test.ts` | 本页不改 `protocol.ts` / 不发新消息 |
| N7 | `unit_mondex_no_innerhtml` | 单元（源码扫描） | 同上 | `CodexPanel.ts` / `mondexModel.ts` 不含 `innerHTML` / `outerHTML` |
| N8 | `int_codex_mon_empty` | 集成 | `tests/integration/codex-mon.test.ts` | 筛选为空显示「没有符合条件的精灵」，不空白 |
| N9 | `unit_mondex_filters_intersect` | 单元 | `tests/mondex.test.ts` | 多条件取交集；清空恢复全部 |
| N10 | `unit_mondex_habitat_fallback` | 单元 | 同上 | 猫系 / 耄耋显示「校园猫」/「登录赠送」，不出现 `undefined` |
| N11 | `unit_mondex_no_chain_block` | 单元 | 同上 | 没有 `chain` / `evo` 的物种 `chain=[]`，UI 不渲染进化链标题 |
| N12 | `unit_mondex_old_data` | 单元 | 同上 | `dex={}` 时 0 / 总数，不崩溃 |
| N12 | `int_codex_mon_unseen_detail` | 集成 | 同上 | 未见过详情不泄露信息 |

**覆盖检查**：P1–P11、N1–N12 每条至少一个测试；P10 手机横屏是手工 E2E，其余仓库内可跑。

## 2. 实现顺序

1. `src/ui/mondexModel.ts` 纯模型 + `tests/mondex.test.ts`（先红）。
2. `MonPanel` 暴露只读 `monData` getter。
3. `CodexPanel` 增加「精灵图鉴」tab、筛选、分组网格、详情；`WorldScene` 注入 `mons` 数据源并让 `monUi.onData` 刷新图鉴。
4. 样式：复用 `cx-*`，新增 `mon-dex-*`（剪影、卡片、详情、筛选、手机横屏）。
5. happy-dom 集成测试。
6. 本地真实浏览器 E2E。
7. 文档：FEATURES / CHANGELOG / feature spec+plan。

## 3. 文件改动清单

| 文件 | 改动 |
|---|---|
| `src/ui/mondexModel.ts`（新） | 分组 / 排序 / 过滤 / 剪影 / 栖息地 / 进化链（含 Lv.）/ 进度 |
| `src/ui/CodexPanel.ts` | `CodexTab` 加 `'mons'`；tab「精灵图鉴」；`renderMons` / `renderMonDetail`；筛选状态；`enter` 请求 `monGet`；关闭重置 |
| `src/ui/MonPanel.ts` | `get monData()` 只读 getter |
| `src/scenes/world/wire-panels.ts` | 注入 `mons: () => this.monUi.monData`；`monUi.onData` 里 `codexUi.refresh()` |
| `src/ui/styles/10-mons-battle.css`（或对应 `styles/` 文件） | `.mon-dex-silhouette`、卡片、详情、筛选、手机横屏 |
| `tests/mondex.test.ts`（新） | P1–P9、N1–N5、N8–N12 的单元用例 |
| `tests/integration/codex-mon.test.ts`（新） | P1 / P5 / P9 / P11 / N8 的 DOM 用例 |
| `tests/mondex-source-safety.test.ts`（新） | N6 / N7 源码扫描 |
| `docs/FEATURES.md` | 图鉴条目加「精灵图鉴」 |
| `docs/CHANGELOG.md` | 顶部加 2026.11.10 一节 |
| `docs/feature/20261110-mon-dex/` | spec / plan |

## 4. 详细设计

### 4.1 `src/ui/mondexModel.ts`（纯函数）

```ts
export interface MonDexRow {
  sp: Species;
  /** 图鉴 No.，用于排序 / 显示 */
  no: number;
  seen: boolean;
  caught: number;
  /** 没见过的物种：名字 / 描述 / 属性 / 图 / 栖息地 / 进化链都不返回 */
  name: string;
  desc: string;
  types: string[];
  art: string | null;
  habitat: string;
  chain: { id: string; name: string; seen: boolean; lv?: number }[];
}

export interface MonDexFilter { type?: string; caughtOnly?: boolean; zone?: string }
export interface MonDexGroup { id: 'open' | 'cat' | 'dm'; title: string; rows: MonDexRow[]; seen: number; total: number; caught: number }

export function monDexRows(ct: Content, dex: Record<string, DexEntry>, zones: readonly Zone[], filter?: MonDexFilter): MonDexRow[];
export function monDexGroups(...): MonDexGroup[];
export function monDexProgress(rows: MonDexRow[]): { seen: number; caught: number; total: number };
export function monDexZoneOptions(zones: readonly Zone[]): { id: string; name: string }[];
export function habitatOf(spId: string, zones: readonly Zone[]): string;
export function chainOf(sp: Species, ct: Content, dex: Record<string, DexEntry>): MonDexRow['chain'];
```

- 物种来源：`[...ct.species.values()]`，按 `no`、id 排序。
- 分组：`open`（id 以 `o` 开头）、`cat`（`isCatSpecies` 且不是 `dm`）、`dm`；组内按 No.。
- `seen = (dex[id]?.s ?? 0) > 0`；`caught = dex[id]?.c ?? 0`。
- 未见过：`name='？？？'`、`desc=''`、`types=[]`、`art=null`、`habitat=''`、`chain=[]`。
- 见过：`name=sp.name`、`desc=sp.desc ?? ''`、`types=[...sp.types]`、`art=monArt(sp.id,'front')`。
- 栖息地：`ZONES` 出没表反查区域名；猫系 →「校园猫」；`dm` →「登录赠送」；否则「—」。
- 进化链：`sp.chain`（猫系）逐阶段；未见过阶段 `name='？？？'`；`evo.lv` 作为 `lv`；没有 chain 返回 `[]`。
- 筛选：类型 / 收服 / 区域只作用于 `seen`；未见过只在「全部」出现；多条件取交集。
- 空结果：分组数组为空；UI 显示空提示。

### 4.2 `CodexPanel`

- `CodexTab = 'animals' | 'fish' | 'mons' | 'ach' | 'titles'`。
- `tabs` 加 `{ id: 'mons', label: '精灵图鉴', render: (b) => this.renderMons(b), enter: () => this.net.monGet() }`。
- `deps` 加 `mons: () => MonData | null`。
- `open()`：切到 mons 时请求 `monGet`（由 `enter` 负责）；收到 `mon_data` 后 `MonPanel.onData` 调 `codexUi.refresh()`。
- `renderMons(box)`：
  - 无数据 →「读取中…」。
  - 顶部：`已见 X / 总数 · 已收服 Y / 总数` + 进度条。
  - 筛选条：属性 / 区域用像素风下拉（按钮 + 面板，不用原生 `<select>` 弹层）；属性 18 个、区域 = 三野外 + 校园猫 + 登录赠送；「只看已收服」checkbox。
  - 分组标题 + `cx-grid`；卡片：未见过剪影 + No. +「？？？」；见过 `img` + 名字 + No. + 属性徽章 + `收服 ×N` / `见过 ×N`。
  - 点击设置 `monSel` 并重绘；详情 `renderMonDetail`。
  - 关闭时 `monFilter = {}`、`monSel = null`；同一次打开里切 tab 保留。
- 详情：
  - 未见过：剪影 + No. +「？？？」+「还没遇到」。
  - 见过：No.、属性、描述、进化链（带 Lv.）、栖息地、见过 / 收服次数。
  - 无 `chain` / `evo` 不渲染进化链标题。
- 所有玩家文字 `textContent`；不新增 `net.handlers.mon`（MonPanel 占用）。

### 4.3 `MonPanel` / `wire-panels`

- `MonPanel` 增加 `get monData() { return this.data; }`。
- `src/scenes/world/wire-panels.ts` 创建 `codexUi` 时传 `mons: () => sc.monUi?.monData ?? null`。
- 现有 `sc.monUi.onData` 追加 `sc.codexUi?.refresh();`。
- 面板互斥沿用 `anyOverlay`。

### 4.4 样式

- 复用 `.cx-tabs` / `.cx-filter` / `.cx-grid` / `.cx-cell` / `.cx-detail`。
- 新增 `.mon-dex-silhouette`（纯 CSS 剪影，不加载物种图）、`.mon-dex-card`、`.mon-dex-detail`、`.mon-dex-chain`、`.mon-dex-types`。
- 手机横屏 4 列；详情不横向溢出。

## 5. 测试计划

- `tests/mondex.test.ts`：P1–P9、N1–N5、N8–N12；固定内容包 + 合成 `dex` + `ZONES`。
- `tests/integration/codex-mon.test.ts`：happy-dom + 假 NetClient；P1 / P5 / P9 / P11 / N8。
- `tests/source-safety.test.ts`：N6 / N7。
- E2E 手工（§3 清单）：本地服务端 + 客户端，H → 精灵图鉴；进度、分组、筛选、未见过剪影、详情、手机横屏。
- 全量：`npm test`、`npx tsc --noEmit`、`npm run build`。

## 6. 复用已有能力

| 能力 | 位置 | 用法 |
|---|---|---|
| 图鉴 tab | `CodexPanel.tabs` | 加 `mons` tab |
| 网格 / 详情样式 | `src/ui/styles/*` `.cx-*` | 复用 |
| 物种表 | `CONTENT` / `speciesOf` | 分组、No.、名字、属性、描述、进化链 |
| 图鉴数据 | `mon_data.dex` / `DexEntry` | 只读 s/c |
| 精灵图 | `monArt()` | 见过才加载 |
| 区域 | `ZONES` / `data/mons/zones.json` | 栖息地、区域筛选 |
| 猫系 | `isCatSpecies()` | 分组 / 栖息地 fallback |
| 属性名 | `elementName()` | 徽章 |
| 宿主互斥 | `WorldScene.anyOverlay` | 打开图鉴时暂停探索 |

## 7. 环境 / 账号 / 数据 / 依赖

- 单元 / 集成：Node ≥ 22.12、`npm ci`、`happy-dom`（已有 devDependency）。
- 数据：`data/mons/packs/open/*`、`data/mons/zones.json`；测试用合成 `dex`。
- E2E：测试服 #5 数据 + #8 客户端（本地 `npm run dev` + 中继解决 Origin）；不需要新账号。
- 本页不依赖 #5 的改动，从 `main` 独立开发。注意本地 `server/` 是 #5 服务端分支，和 #8 的 `src/shared` 不兼容；本地类型检查用 `.cache/tsconfig.mondex.json` 排除 `server/`，CI 里 `server/` 不存在，根配置会通过。

## 8. 风险与回滚

| 风险 | 处理 |
|---|---|
| 未见过泄露名字 / 图 | 模型层返回 `name='？？？'`、`art=null`；UI 只显示 `brightness(0)` 剪影；测试 N1 锁住 |
| 筛选泄露属性 / 区域 | 未见过不参与筛选；测试 N2 |
| `mon_data` 未到 | 显示「读取中…」；不崩溃 |
| 猫系 72 阶（24 毛色 × 3 阶段）太多 | 分组 + 4 列网格 + 滚动 |
| 旧页面 / 未知物种 | 跳过未知 id；不抛错 |
| 无 chain 物种空标题 | 不渲染进化链块；测试 N11 |
| 回滚 | 纯客户端，revert 分支；无存档 / 协议变更 |

## 9. 完成定义（DoD）

- [x] P1–P11、N1–N12 测试存在 / 通过。
- [x] `npm test`（52 文件 498 通过 / 3 跳过）、`npx tsc --noEmit -p .cache/tsconfig.mondex.json`、`npx vite build` 全绿。
- [x] 本地真实浏览器 E2E：精灵图鉴、筛选、未见过剪影、详情、手机横屏。
- [x] `docs/FEATURES.md`、`docs/CHANGELOG.md`、feature spec/plan 同步。
- [x] PR [#14](https://github.com/EXIST-D/PixelCampus/pull/14) 说明链接 spec/plan；纯客户端，不要求服务端改动。

## 10. 提交 / PR 拆分

建议 3 个中文提交：

1. `精灵图鉴：纯模型与单元测试`
2. `精灵图鉴：CodexPanel 页面与筛选`
3. `文档：FEATURES / CHANGELOG / feature spec+plan`

分支 `feature/mon-dex` 从 `main` 开；PR 说明写「纯客户端，无协议 / 服务端改动」。

## 11. 执行状态（2026-11-10）

- **红灯**：`tests/mondex.test.ts`、`tests/integration/codex-mon.test.ts`、`tests/mondex-source-safety.test.ts` 先跑，`7 failed | 1 passed`（模型 / 页面未实现；通过的 1 个是「协议没有 mon_dex」的空断言）。
- **绿灯**：单元 14 + 集成 6 + 源码扫描 2 全过；公开全量 **52 个测试文件，498 通过 / 3 跳过**；`npx vite build` 绿。
- **类型检查**：本地 `server/` 是 #5 服务端分支，与 #8 共享规则不兼容；用 `.cache/tsconfig.mondex.json` 排除 `server/` 后绿。CI 检出公开仓库时没有 `server/`，根配置会通过。
- **真实 E2E**：测试服 #5 数据 + #8 客户端（本地 dev + Origin 中继）。`已见 1 / 83`、`已收服 1 / 83`、83 个图鉴位、82 个剪影；耄耋详情显示 No.099 / 一般 / 描述 / 栖息地「登录赠送」/ 记录；未见过详情只有「？？？ No.001 还没遇到」；属性筛选「一般」剩 1 个；844×390 横屏无横向滚动。`MON_DEX_E2E_OK`。
- **自审**：无协议 / 服务端改动；未见过不返回名字 / 描述 / 属性 / 图；无 `innerHTML`；关闭重置筛选；空状态 / 加载态正常。
- **PR**：[#14](https://github.com/EXIST-D/PixelCampus/pull/14) 已提；测试服已部署 #5+#8 集成验收；正式服待主人手动部署（#8 基于 main，待 #5 合并后 rebase / 部署）。


## 12. 样式统一（2026-11-10）

- **反馈**：精灵图鉴和现有动物 / 钓鱼图鉴风格不一致。
- **调整**：
  - 改为和动物 / 钓鱼图鉴同一套 5 列卡片（手机 3 列），36px 像素图。
  - 卡片只保留「图 + 名字 + No. · 见过 / 收服次数」，属性徽章收进详情，和现有图鉴一样紧凑。
  - 未见过用物种图 `brightness(0)` 做灰度剪影（和现有 canvas 剪影一致），不再用深色圆块。
  - 分组标题按来源上色（开放包绿 / 猫系红 / 登录赠送紫），详情沿用现有 `cx-detail` 虚线卡片。
  - 属性 / 区域筛选从原生 `<select>` 改成像素风下拉（按钮 + 面板），和游戏内其他面板一致。
- **验证**：`npm test` 59 文件 553 通过 / 3 跳过；`npx vitest run --config server/vitest.config.ts` 90 文件 1056 通过 / 5 跳过；`npx vite build` 绿。测试服 E2E：5 列（94.59px）、83 个图鉴位、82 个剪影、详情 / 筛选 / 844×390 横屏正常。
- **状态**：测试服已部署；样式 PR [#15](https://github.com/EXIST-D/PixelCampus/pull/15) 待合并。
