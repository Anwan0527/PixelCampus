# 架构

## 1. 数据流
```
data/campus/*.json ──► tools/world/compile.ts ──► public/assets/generated/        （生成物，不入库，npm run assets 重建）
  (蓝图，唯一数据源)     │ 材质缓冲(1px/像素)         ground/<季节>/c_x_y.png   64×64 格的地面块，春夏秋冬各一套
                        │ 建筑翼体渲染(斜投影)        ground/w{1..3}_*.png      水面动画叠层
                        │ 树/小品放置 + 清理 pass     atlas-buildings-N / atlas-props-<季节> / atlas-items / atlas-chars / atlas-cats …
                        │ 碰撞格 + 行人出生点         world.json（碰撞/建筑/对象/POI/互动区/文字牌）、minimap.png
tools/art/*  ──────────►│ 图集（人物、小猫、道具、物品图标）
                        ▼
                    src/（Phaser 客户端） ◄── WebSocket ──► 联机服务器（私有，不在本仓库）  ──► 数据目录里的 json(l) 文件
                        └────────── src/shared/（协议、规则、价格、目录：两边共用）──────────┘
```
- **地面**不是 Tiled 瓦片，而是矢量→像素材质缓冲→按优先级自动生成边缘后切块。缓存键 = 块内容 + 渲染源码哈希，改一处只重绘受影响的块；四季各生成一套（`tools/world/seasons.ts` 只改色板）。
- **碰撞**：1 格 + 玩家 10×6 px 脚底盒，轴向分离滑动。建筑、水、围栏、座椅等阻挡；树/灯/灌木/花坛/公告牌不挡（`compile.ts` 的 `WALK_THROUGH`）。服务器读同一份 `world.json`。
- **深度**：所有精灵 `depth = 脚点 y`；旋转建筑切成竖条各自基线；文字牌 `ds` 可抬高图层。
- **自动景观与清理 pass**（`compile.ts`）：门前绿篱/招牌/自行车架/广场灯椅树池/廊架，之后清理灌木、稀疏路灯、清空路中间摆件、**清空图书馆广场**（范围见 `src/shared/plaza.ts`）。
- **扩展点**：新建筑 = `data/campus/buildings/*.json` 加一项；新道路 = `terrain/*.json` 加 `stroke`；新地标/互动区 = `pois.json` / 蓝图里的 `interact`（`action: board | shop | wall`）；新大型小品 = `tools/art/plaza.ts` 式的 Sprite + `PropKind`。

## 2. 客户端（`src/`）
- **场景**：`BootScene`（加载，按当前季节取图集）→ `WorldScene`（主场景骨架；功能模块在 `scenes/world/`）；`InteriorScene` 暂停。HUD 是 DOM 叠层（中文像素字体更清晰），`ui/actions.ts` 是入口注册表（电脑侧边按钮 / 手机菜单）。
- **流式加载**：`world/Streamer`——所有条目登记包围盒 + `make()`，每 120 ms 按镜头位置创建/销毁；地面块异步加载、销毁时释放纹理。
- **实体**：`Character`（Player.ts：脚点坐标、四向动画、骑车/坐/钓鱼/雨伞/手持物、昵称牌）→ `Player`/`Npc`/`RemotePlayer`；`Cat`（家 + 游走 + 状态机）。
- **人物/小猫美术**：`src/art/`（char-rig、skins、held）是运行时 Rig 合成；`tools/art/cat-rig`、`char-rig` 是构建期预览与图集；外观数据与校验在 `shared/appearance.ts`。
- **系统**：`systems/clock`（服务器时间校准的昼夜）、`systems/weather`（雨雪画面、雨伞贴图）、`audio/`（WebAudio 合成的音乐/音效/环境声）。
- **网络**：`net/client.ts`（`NetClient`：WebSocket、重连、所有消息收发，面板通过 `handlers` 订阅）。

## 3. 服务器（`server/`）
- `index.ts`：HTTP（静态页 + `/healthz`）+ WS 入口，组装各存储；`game.ts`：核心（加入/移动校验/视野过滤/聊天/钓鱼/小猫/骑行/商店/校园墙消息分发）。
- 持久化都是 `data/server/`下的文件：`store.ts`（玩家档案 JSON，防抖 + 原子写）、`board`/`wall`（追加写 JSONL，删除/审核也是事件行，启动时重放）、`notices`、`social`（好友 JSON + 私聊 JSONL）、`chatlog`、`config`。
- 规则分层：`progress.ts`（背包/好感/每日任务/币/商店/猫窝，和网络解耦便于测试）、`run.ts`（校园跑房间）、`party.ts`（组队）、`bikes.ts`（留车）、`admin.ts`（口令/令牌/限流）。
- **信任模型**：客户端只上报位置和"想做什么"；价格、掉落、判定、限频、距离检查都在服务器；`src/shared` 里放可共用的纯函数规则，客户端用来显示、服务器用来裁决。

## 4. 测试与 CI
- `tests/`：蓝图/保真度/生成世界（需先 `npm run assets`）、服务器集成（真起服务器 + ws 客户端）、进度/经济/外观/社交等纯逻辑。
- `.github/workflows/ci.yml`：PR 与 main 推送时 生成资源 → 类型检查 → 测试 → 构建；部署只由主人手动执行（见 COLLABORATION.md）。

## 5. 世界放大与流式加载（v0.4）
- `tools/world/scale.ts`：蓝图仍以 5 m/格记录，编译时几何 ×S（默认 2）；按像素设计的东西（精灵、间距、密度、门宽、标线）不变；`fixed` 建筑只移动中心；`minS/maxS` 控制放大专属条目。
- 建筑图集分页（`atlas-buildings-N`），翼体带 `pg`；`world.json` 带 `scale` 与 `chunks`（实际存在的地面块）。
- 对照工具 `compare.ts / overlay.ts / road_gap.py` 的参数始终是**原 5 m/格坐标**，内部按 `world.scale` 换算。
