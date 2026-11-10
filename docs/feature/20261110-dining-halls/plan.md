# 室内扩展：三个餐厅 / 图书馆 / 教学楼 / 超市 · 实施计划

| 项 | 内容 |
|---|---|
| 状态 | 已完成（2026-11-10，本地提交，未部署） |
| 对应 spec | [spec.md](spec.md)（v3） |

## 1. 方案
- **多层**：一间室内仍是一个文件，用 `floor` / `building` / `stairs` 把同一栋楼的各层串起来；一层有南墙门洞（出口），二层以上没有（`exit` 变可选），只能走楼梯。楼梯是画在地板上的 3×2 格踏步（不挡路），走上去按 E 换层，`scene.start('Interior', { id, from })` 重新进入，人落在通向来处的那个楼梯口南面。
- **座位**：数据里的椅子 / 沙发（`SEAT_KEYS`）按占地自动推座位（和宿舍同一算法），**编译时**写进 `interiors.json` 的 `seats`，客户端不查家具表；被堵死的椅子去掉座位并警告。
- **传送直达某层**：不改协议。`TELEPORTS[].floors` 列出各层，面板里点某层 = 照常 `tpGo(建筑 id)` + 记下目标层；服务器回「传到了」后客户端 `enterFloor` 直接进那一层。
- **建筑 → 室内**：新文件 `data/campus/interior-links.json`，编译时在地图手动层 / baked 层之后套用（不手改 `baked.json`）。
- **内容**：`tools/world/gen-halls.ts` 起稿 22 间室内（覆盖 `data/interiors/*.json`，之后由主人用 `/interior` 改，改过就别再跑它）。
- **美术**：新增 `tools/art/furniture-hall.ts`（窗口招牌、货架、冷柜、售货机、饮水机、公告栏）+ 4 个新主题（canteen2 / canteen3 / mall / hall）。

## 2. 任务与提交
1. 家具素材（furniture-hall、主题）
2. 引擎：楼层 / 楼梯 / 座位 / 传送直达（`shared/interior.ts`、`InteriorScene`、`interiors.ts`、传送面板）
3. 内容：生成脚本 + 数据 + 建筑对应 + 超市更名 + 测试
4. 文档同步（FEATURES / CHANGELOG / HANDOFF / CLAUDE / MAP_EDITOR）

## 3. 协议与数据变更
- **无新协议、无存档字段变化。** 改了 `src/shared/teleport.ts`（加 `floors`，服务端按 id 校验不变）和 `src/shared/interior.ts`（客户端 / 编译用）；服务端代码不需要改，但按约定共享文件变了：**部署时前后端一起打包即可**。
- 室内底图 / 家具图集 / `interiors.json` 变大：`interiors.json` 约 240 KB（gzip 约 13 KB），26 张室内底图（每张 1~3 KB WebP）随首屏预载，新增约 60 KB。

## 4. 测试
- `tests/interior.test.ts` 新增：整批室内一致性（楼梯成对、层号、楼层连续）、餐厅 3 层 / 教学楼 5 层、楼梯落点、座位可达、传送层指向存在的室内、`interior-links.json` 指向开放的一层、生成物检查。
- 浏览器验证：进每类房间、走楼梯换层、坐下 / 起身、传送面板直达某层（离线用 `tpResult` 回调模拟）。

## 5. 上线与回滚
- 上线：`npm run assets`（要重新生成地图和室内）→ 部署；**只在主人说「部署」时做**。
- 回滚：回退这几个提交即可；老存档不受影响。

## 6. 风险与未验证
- 手机真机体验（室内的摇杆 / 互动键 / 坐下）**未验证**（在电脑浏览器里验证）。
- 室内只有自己可见（沿用）。
- 窗口名、台词、布局全是占位，**未核实**，见 [SOURCES.md](SOURCES.md)。
