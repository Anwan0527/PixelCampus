# 项目交接 / 现状（2026-11-05 整理）

> 给新开的对话、新协作者用：先读这一份和 `CLAUDE.md`，再按需读专题文档（§8 索引）。
> 本文只写**现在是什么样**；做过什么看 [CHANGELOG.md](CHANGELOG.md)，有什么功能看 [FEATURES.md](FEATURES.md)，接下来做什么看 [ROADMAP.md](ROADMAP.md)。

## 1. 一句话
**像素校园 · 河北工程大学新校区**：星露谷风格的俯视角 2D 网页游戏。校园地图按卫星图 + OSM 路网还原，**多人在线**，电脑和手机都能玩。**不商用，仅个人学习。** 项目主人是中文用户，**一律用中文沟通**。

- 线上：**https://exist.qd.je/pixel/**
- 技术栈：Phaser 3.90 + TypeScript 5.9 + Vite 7（客户端）；美术全部程序化生成（`tools/art` + `src/art` + sharp）；vitest。
- **这个仓库只包含客户端、共享规则、地图/美术数据与生成工具、文档。** 联机服务器、部署、敏感词库等运维相关的东西由主人在自己的电脑上维护，**不在本仓库里**，协作者不需要也看不到。
  - 协作者用 `?offline`（单机模式）开发和预览客户端；单机模式下没有联机功能，但地图、角色、钓鱼、精灵战斗等客户端内容都能玩。
  - 需要服务端配合的功能（新协议、新规则落地）：在 PR 里写清需求和协议改动（改 `src/shared/protocol.ts`、`src/shared/*` 里的规则，并更新 [MULTIPLAYER.md](MULTIPLAYER.md)），服务端那一半由主人来做。
- 协作与部署流程见 [COLLABORATION.md](COLLABORATION.md)：**别人只提 PR，主人同意并合并；上线部署永远由主人手动执行。**

## 2. 目录地图
```
PixelGame/
├─ data/campus/       **manual.json（手动层：主人用地图编辑器改的，编译时最后处理）**；蓝图 JSON：terrain/*.json（按文件名顺序叠图层）、buildings/*.json、pois.json、geo.json（卫星配准+视差+放大倍数）、osm-roads.json
├─ data/interiors/    室内数据（试点：只开放 42 号楼 214 室）
├─ data/mons/         精灵内容包
├─ tools/
│  ├─ editor/           地图编辑器（`npm run editor`，本地 5174；server.ts + index.html + main.ts），见 MAP_EDITOR.md
│  ├─ world/            compile.ts（蓝图→地面块/图集/碰撞/world.json/小地图，含自动景观与清理 pass）、scale.ts、terrain.ts、seasons.ts（四季配色）
│  ├─ art/              程序化像素美术：buildings/props/nature/plaza（商店+校园墙）/items/cats/cat-rig/char-rig… preview-*.ts 是看图用的预览脚本
│  └─ reference/ analysis/  卫星图对照、OSM 取数、Python 路网分析（改地图时用）
├─ src/
│  ├─ scenes/           BootScene（加载）、WorldScene（主场景，所有面板的总装）、InteriorScene（室内）
│  ├─ entities/         Player(Character) / Npc / RemotePlayer / Cat
│  ├─ art/              人物 Rig 渲染（char-rig、skins、held 手持物）
│  ├─ ui/               各种面板（DOM 叠层）；actions.ts 是入口注册表；style.css（含手机横屏样式）
│  ├─ systems/ audio/ world/ net/ core/   天气与时钟 / WebAudio 合成 / 流式加载与碰撞 / NetClient / 常量与本地档案
│  └─ shared/           **客户端和（私有的）服务端共用**：协议、规则、价格、目录
├─ tests/               客户端与共享规则的测试；generated-world 测试要先 npm run assets
├─ .github/             CI（PR 自动跑 生成资源 + 类型检查 + 测试 + 构建）+ PR 模板
└─ docs/
```

## 3. 核心设计要点
**地图**（2026-11-04 起部分区域参考了校园 GLB 模型，见 [GLB_REFERENCE.md](GLB_REFERENCE.md)：模型只当参考，**几何仍以卫星图为准**）：几何真值 = Esri z18 卫星正射图（`.cache/`，不入库）+ OSM 环路；蓝图用"5 m/格"原始坐标，`geo.json` 的 `world.scale=2` 把世界放大成 704×544 格（1 格 = 2.5 m），几何放大、像素设计的东西不放大。卫星是斜视角，蓝图填的是"屋顶坐标"，编译时按层数换算成脚印（视差）。地面按块流式加载（四季各一套），建筑图集分页，摆件 ~1.1 万个同屏只活跃几百个。详见 [MAP_PIPELINE.md](MAP_PIPELINE.md)、[SCALE.md](SCALE.md)。
**图书馆广场**（x 325–399, y 361–423 格）已清空，西侧校园商店、东侧校园墙（常量在 `src/shared/plaza.ts`）；南门→图书馆中轴是主人最满意的一段，**别随意改**。
**联机（客户端视角）**：身份 = 浏览器里的随机 token，没有账号体系；服务器分配稳定的校园号（uid）；好友、私聊只认 uid；客户端通过 `src/net/client.ts` 收发 `src/shared/protocol.ts` 里的消息。世界分公共 / 个人 / 好友三种（`src/ui/WorldPanel.ts`）。详见 [MULTIPLAYER.md](MULTIPLAYER.md)。
**经济**：校园币只由服务器入账，客户端只显示；价格与规则在 `src/shared/economy.ts` 等共享文件里，设计见 [ECONOMY.md](ECONOMY.md)。
**安全约定**：玩家写的文字一律 `textContent` 渲染（不用 `innerHTML`）；校验逻辑放 `src/shared/`；客户端发来的东西服务器一律不信任，所以客户端只做展示与请求。
**美术**：全部程序化、确定性；人物/小猫走 Rig 管线（外观可自定义，手持物），设计与取舍见 [ART_CHARACTER_CAT_DESIGN.md](ART_CHARACTER_CAT_DESIGN.md)；老猫的毛色与编号已冻结（别改，会影响玩家的好感记录）。

## 4. 关键决策与主人偏好
- **优先级**：先外部平面与道路与真实一致，再景观；**室内试点**（2026-11-03 起只开放 42 号楼 214 室，其余关闭，扩范围要主人点头）；人物要好看；非商用。
- 姓名/学院/专业不要求真实；不做账号密码。
- **公开内容要主人点头**：往公开站点发布的内容（公告正文等）由主人自己发。
- **部署只由主人手动做**；每次更新同步改 FEATURES.md 与 CHANGELOG.md；提交信息中文、一个改动一个提交。

## 5. 已知偏差与待办（地图与内容）
- 建筑名称是按位置对应的，主人还没逐栋核对（2026-11-04 起一批名称来自模型，来源不明：留学生公寓、体育与健康学院、一社区北浴室、删除了马克思主义学院，需要主人确认）；个别设计是推测（体育场广场喷泉、围栏位置、东门校训石无字）。视差在放大后约 ±1.4 格。
- 室内：试点开放 42 号楼 214 室（`data/interiors/mathmodel-214.json`，`"open": true`）；图书馆/教室/食堂仍关闭。室内目前只有自己可见。编辑用 `/interior`（见 MAP_EDITOR.md「室内编辑器」）。
- 蓝图里 `ground:true` 的楼（模型脚印）不再做视差修正，与旧的"量自屋顶"条目并存；编辑器里改的是脚印，两种来源的楼编辑体验一致。
- Vite 构建 chunk > 1.4 MB（Phaser）；`WorldScene.ts`（~1100 行）偏大，多人协作容易冲突，适合按功能拆（小猫/钓鱼/商店/校园墙各一个模块）。
- 手机真机体验（摇杆手感、键盘弹出、首屏加载慢、面板排版）还没有系统测过。
- 价格/平衡（ECONOMY.md §6）是推演值，上线后要看真实数据再调。

## 6. 开发与调试手册
**URL 参数**：`?offline`（关联机，传送调试用）、`?touch`（电脑上强制手机界面；把窗口调矮就是横屏布局）、`?world=generated-s1`（5 m/格对照版，需先 `npm run assets:s1`）。开发模式下有 `window.__game = { scene, tp(tx,ty), setTime(h), setWeather(kind), setSeason(name) }`（用 `?offline`）。
**对照地图**：`npx tsx tools/reference/compare.ts <x> <y> <w> <h> [每格像素] [输出名]`（坐标是原 5 m/格）。**美术预览**：`npx tsx tools/art/preview-*.ts` → `.cache/preview/`。
**踩过的坑**
- 内置预览浏览器 rAF 被限速、`navigate` 后要等十几秒才能 `javascript_exec`；首次加载约 30–40 秒。
- 项目路径含中文：脚本里用 `tools/paths.ts`；macOS `sed -i ''`；复杂替换用 python。
- 改了 `tools/world/compile.ts`、`data/campus/*`、美术 → 重新 `npm run assets`（或 `assets:art`/`assets:world`）；改了 `src/shared/*` → 服务端要同步（提 PR 时在说明里写明）。
- 拉取了别人的美术/地图改动后要重新 `npm run assets`，否则本地看到的是旧地图。

## 7. 开场建议
1. 读本文件和 `CLAUDE.md`，`npm ci && npm run assets && npm test` 确认全绿。
2. 看 [ROADMAP.md](ROADMAP.md) 的"下一步"和主人的新需求。
3. `npm run dev`，浏览器打开 `http://127.0.0.1:5173/?offline`。

## 8. 文档索引
| 文档 | 内容 |
|---|---|
| [README.md](../README.md) | 快速开始与操作 |
| [ROADMAP.md](ROADMAP.md) | **开发路线**：已完成里程碑、下一步、长期方向 |
| [FEATURES.md](FEATURES.md) | 现在有什么功能（分类清单，每次更新同步） |
| [CHANGELOG.md](CHANGELOG.md) | 每次更新了什么（按日期倒序） |
| [COLLABORATION.md](COLLABORATION.md) | **多人协作流程**：怎么 fork、提 PR，主人怎么审、怎么上线 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 代码与数据流架构 |
| [MULTIPLAYER.md](MULTIPLAYER.md) | 联机需求、协议、各批功能设计 |
| [ECONOMY.md](ECONOMY.md) | 货币、商店、校园墙的设计 |
| [WORLDS_PLAN.md](WORLDS_PLAN.md) | 个人 / 公共 / 好友世界的设计 |
| [CHAT_CHANNELS_PLAN.md](CHAT_CHANNELS_PLAN.md) | 聊天频道系统方案（世界/附近/队伍/群聊/系统，开关静音，管理）：设计稿，已拍板（先 P1 再 P2），待开工 |
| [CHAT_P1_TASKS.md](CHAT_P1_TASKS.md) | 聊天频道 **P1 任务拆分**：协议契约、共享 / 客户端 / 服务端任务、联调验收清单 |
| [MAP_EDITOR.md](MAP_EDITOR.md) | **地图编辑器**：主人手动微调地图的小工具、手动层格式 |
| [MAP_PIPELINE.md](MAP_PIPELINE.md) / [SCALE.md](SCALE.md) | 地图数据来源与校验、**已知偏差**；比例约定 |
| [ART_STYLE.md](ART_STYLE.md) / [ART_CHARACTER_CAT_DESIGN.md](ART_CHARACTER_CAT_DESIGN.md) / [ASSETS_AND_LICENSES.md](ASSETS_AND_LICENSES.md) | 美术风格；人物小猫 Rig 设计；素材许可 |
| [GLB_REFERENCE.md](GLB_REFERENCE.md) | 校园 GLB 模型：是什么、能信多少、用在了哪些区域 |
| [CREATURES_PLAN.md](CREATURES_PLAN.md) | 校园精灵（宝可梦式玩法，原创）的设计稿 |
