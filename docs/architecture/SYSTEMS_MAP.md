# 系统地图：功能 → 代码在哪

> 2026-11-17 整理。想改某个功能，先在这里找到它的「共享规则 / 服务端 / 客户端 / 数据 / 测试」，不用到处搜。
> 路径都是相对仓库根；`server/` 是**独立私有仓库**（`PixelCampus-server`）的克隆，公开仓库里没有（见 [ADR 0012](../adr/0012-server-private-repo.md)）。
> 表里没写的通用模块：协议 `src/shared/protocol.ts`（C→S / S→C 消息，索引见 [PROTOCOL.md](PROTOCOL.md)）、客户端网络 `src/net/client.ts`、面板注册表 `src/ui/actions.ts`、服务端分发 `server/handlers/dispatch.ts`（每个 handler 在自己的 `register()` 里登记消息类型）。

## 一、怎么读这张表
1. **共享规则**（`src/shared/*.ts`）：纯函数 + 常量，客户端和服务端共用，**规则只写在这里**；改了它，服务端要一起合并、一起部署。
2. **服务端**（`server/*.ts`、`server/handlers/*-handler.ts`）：校验位置 / 好友 / 背包 / 限频，落盘。handler 很薄：取档案 → 调规则 → 落盘 → 回消息。
3. **客户端**：`src/ui/*`（DOM 面板）、`src/scenes/world/*`（主场景按功能拆出的模块）、`src/scenes/InteriorScene.ts`（室内 / 宿舍 / 农场）。
4. **数据**：`data/*`（蓝图、室内、精灵内容包）；**生成物**在 `public/assets/generated/`（不入库，`npm run assets`）。

## 二、世界、地图与室内
| 功能 | 共享规则 | 服务端 | 客户端 | 数据 / 工具 | 测试 |
|---|---|---|---|---|---|
| 校园地图（地面、建筑、碰撞、小地图） | `src/shared/world-format.ts`、`blueprint.ts`、`manual.ts` | `server/worlds.ts`（世界分区）、`server/static.ts` | `src/world/*`（流式加载、碰撞）、`src/scenes/WorldScene.ts`、`src/scenes/world/stream.ts` | `data/campus/*`（含 `manual.json` 手动层、`interior-links.json`）、`tools/world/compile.ts`、`tools/editor/*`（地图编辑器） | `tests/generated-world.test.ts`、`blueprint.test.ts`、`worldmap.test.ts`、`manual.test.ts` |
| 室内（214 室、餐厅、教学楼、图书馆、超市；多层、楼梯、可坐） | `src/shared/interior.ts`、`seats.ts` | —（客户端场景，服务端只管传送位置） | `src/scenes/InteriorScene.ts`、`src/scenes/world/transitions.ts` | `data/interiors/*.json`、`tools/world/interiors.ts`、`tools/world/gen-halls.ts`（起稿脚本，改过的别再跑）、`tools/art/interior-bg.ts` | `tests/interior.test.ts` |
| 传送（含按层直达、NPC 挑战、农场、BOSS 入口） | `src/shared/teleport.ts` | `server/handlers/teleport-handler.ts` | `src/ui/TeleportPanel.ts`、室内里由 `InteriorScene.teleportOut` 接力 | — | `server/tests/teleport.test.ts` |
| 时钟、天气、季节、节日 | `src/shared/clock.ts`、`season.ts`、`calendar.ts` | `server/handlers/festival-handler.ts` | `src/systems/clock.ts`、`weather.ts`、`festival.ts`、`src/ui/CalendarPanel.ts` | — | `tests/season.test.ts`、`weather-calendar.test.ts` |
| 校园环线摆渡 / 共享单车 / 水禽 | `src/shared/bikes.ts`、`water.ts`、`waterfowl.ts` | `server/bikes.ts`、`server/handlers/actions-handler.ts` | `src/scenes/world/*`、`src/entities/LakeBird.ts` | — | `server/tests/birdfeed.test.ts` |

## 三、人物、社交、聊天
| 功能 | 共享规则 | 服务端 | 客户端 | 测试 |
|---|---|---|---|---|
| 身份（浏览器 token → 校园号）、档案 | `src/shared/profile.ts`、`appearance.ts`、`backup.ts` | `server/store.ts`（快照 + 增量日志 + 冻结）、`server/game.ts` | `src/core/*`（本地档案）、`src/ui/CreateCharacter.ts`、`BackupPanel.ts` | `server/tests/store-freeze.test.ts`、`store-log.test.ts`、`store-compact.test.ts` |
| 人物外观 / 染色 / 节日头饰 | `src/shared/appearance.ts`、`dye.ts` | — | `src/art/*`（Rig 运行时合成）、`src/entities/Player.ts`、`RemotePlayer.ts` | `tests/appearance.test.ts`、`dye.test.ts` |
| 聊天（世界 / 附近 / 队伍 / 系统频道） | `src/shared/chat.ts`、`channels.ts` | `server/handlers/chat-handler.ts`、`server/chatlog.ts`、`server/wordfilter.ts`、`filter-engine.ts` | `src/ui/ChatPanel.ts`、`chatState.ts`、`ChannelPanel.ts` | `tests/chat-state.test.ts`、`channels.test.ts`、`server/tests/channels-server.test.ts` |
| 好友、私聊、资料卡、举报 | `src/shared/social.ts`、`report.ts` | `server/social.ts`、`server/handlers/social-handler.ts`、`report-handler.ts`、`server/reports.ts` | `src/ui/SocialUi.ts`、`StudentCard.ts`、`ReportDialog.ts` | `server/tests/social.test.ts` |
| 组队、牵手 | `src/shared/party.ts`、`hand.ts` | `server/party.ts`、`server/handlers/party-handler.ts`、`hand-handler.ts` | `src/ui/PartyPanel.ts`、`HandUi.ts` | `server/tests/friendhand.test.ts` |
| 管理员 / 协管员 / 封禁 / 审计 | `src/shared/admin.ts` | `server/admin.ts`、`server/handlers/admin-handler.ts`、`server/audit.ts` | `src/ui/AdminPanel.ts`、`AdminUserMenu.ts` | `server/tests/adminroles.test.ts`、`adminlogs.test.ts` |
| 留言板、校园墙、地点留言板、公告、致谢 | `src/shared/board.ts`、`wall.ts`、`place.ts`、`notice.ts`、`about.ts` | `server/board.ts`、`wall.ts`、`place.ts`、`notices.ts`、`about.ts` | `src/ui/BoardPanel.ts`、`WallPanel.ts`、`PlacePanel.ts`、`NoticePanel.ts`、`AboutPanel.ts` | `server/tests/place-board.test.ts`、`wall-board.test.ts` |

## 四、经济与玩法
| 功能 | 共享规则 | 服务端 | 客户端 | 数据 / 工具 | 测试 |
|---|---|---|---|---|---|
| 背包、物品、商店、校园币、交易、翻垃圾桶 | `src/shared/items.ts`、`economy.ts`、`trade.ts`、`trash.ts` | `server/progress.ts`、`server/handlers/shop-handler.ts`、`trade-handler.ts`、`server/trade.ts` | `src/ui/BackpackPanel.ts`、`ShopPanel.ts`、`shopModel.ts`、`TradePanel.ts` | `tools/art/items.ts`（图标） | `tests/shop-model.test.ts`、`server/tests/economy.test.ts`、`progress.test.ts` |
| 钓鱼（抛竿 / 小游戏 / 图鉴 / 竿饵 / 等级 / 委托 / 神话鱼 / 盲盒 / 合成 / 全服播报） | `src/shared/fishing.ts`、`fishfight.ts`、`fishdex.ts`、`gear.ts`、`fishlevel.ts`、`commissions.ts`、`mythic.ts`、`boxes.ts`、`craft.ts`、`release.ts` | `server/handlers/fishing-handler.ts`、`server/progress.ts` | `src/scenes/world/fishing.ts`、`src/ui/FishFightUi.ts`、`FishCard.ts`、`CodexPanel.ts`、`BoxPanel.ts` | `docs/guide/FISHING_GUIDE.md`（`npm run guide` 生成） | `tests/fishing2.test.ts`、`fishlevel.test.ts`、`fishing-myth.test.ts`、`fishing-broadcast.test.ts`、`server/tests/server.test.ts` |
| **校园耕作**（16 块私田、好友帮浇 / 偷摘、农场管理员） | `src/shared/farming.ts` | `server/handlers/farm-handler.ts`（`nearFarm` 也被 `shop-handler.ts` 用）、存档字段 `fm`（`server/store.ts`） | `src/ui/FarmPanel.ts`、`src/scenes/InteriorScene.ts`（农场室内、大树洞入口） | `data/interiors/farm.json`、`data/art/farm-scene/*`（AI 美术，见 SOURCE.md）、`tools/art/farm-*.ts` | `tests/farming.test.ts`、`server/tests/farm.test.ts` |
| 每日任务、成就、称号 | `src/shared/quests.ts`、`achievements.ts`、`titles.ts` | `server/progress.ts`、`server/handlers/quests-handler.ts` | `src/ui/QuestPanel.ts`、`AchievementPanel.ts`、`TitlePanel.ts` | — | `server/tests/progress.test.ts`、`server/tests/features-2026-11-03.test.ts` |
| 校园跑 | `src/shared/run.ts` | `server/run.ts` | `src/ui/RunPanel.ts` | — | `server/tests/server.test.ts`（校园跑用例） |
| 名人堂 | `src/shared/hall.ts` | `server/hall.ts` | `src/ui/HallPanel.ts` | — | — |

## 五、小猫与宿舍
| 功能 | 共享规则 | 服务端 | 客户端 | 测试 |
|---|---|---|---|---|
| 校猫（好感度 / 回礼 / 抱抱 / 面板） | `src/shared/cats.ts`、`campus-cats.ts`、`cat-lore.ts` | `server/handlers/cats-handler.ts`、`server/progress.ts` | `src/entities/Cat.ts`、`src/ui/CatPanel.ts`、`src/scenes/world/cats.ts` | `tests/campus-cats.test.ts`、`server/tests/catbond.test.ts` |
| 宿舍（四栋楼、装修、家具、染色、浴缸、点赞、养猫） | `src/shared/dorm.ts`、`decor.ts`、`dormskin.ts` | `server/dorm.ts`、`server/handlers/dorm-handler.ts` | `src/scenes/InteriorScene.ts`、`src/ui/DormPanel.ts`、`DormPeek.ts`、`src/systems/decoredit.ts`、`decorview.ts`、`dormcats.ts`、`bathfx.ts` | `server/tests/dorm.test.ts`、`dormvisit.test.ts`、`tests/decor.test.ts`、`dorm-reset.test.ts` |

## 六、精灵战斗（校园精灵）
战斗引擎只有一套：`src/shared/battle.ts`（回合结算、能力等级、状态异常、非伤害招式、保护），所有玩法都在它或它的同类函数上搭。

| 玩法 | 共享规则 | 服务端 | 客户端 |
|---|---|---|---|
| 精灵内容（物种 / 招式库 / 属性克制 / 野外区域） | `src/shared/mons.ts`、`mons-content.ts`、`cat-mons.ts`、`nondamage-moves.ts`、`monbox.ts`（存档与队伍整理）、`wild.ts` | `server/mons.ts` | `src/ui/MonPanel.ts`、`CodexPanel.ts`、`mondexModel.ts` |
| 野外遭遇 / 捕捉 | `src/shared/wild.ts`、`battle.ts` | `server/mons.ts`（会话、PP、经验、遭遇冷却）、`server/handlers/mons-handler.ts` | `src/ui/BattleUi.ts`、`monBattleHelpers.ts` |
| 训练家 NPC | `src/shared/trainers.ts` | `server/mons.ts`（`startTrainerBattle`、AI、首次奖励） | `src/scenes/world/entities.ts`（生成）、`interaction.ts`（E 切磋） |
| 玩家对战（PvP，1 对 1） | `src/shared/pvp.ts` | `server/pvp.ts`、`server/handlers/pvp-handler.ts` | `src/ui/PvpUi.ts`、资料卡「对战」 |
| 世界 BOSS（组队 PVE） | `src/shared/boss.ts` | `server/boss.ts`、`server/handlers/boss-handler.ts`、存档 `MonSave.boss` | `src/ui/BossUi.ts`、湖心岛入口（`interaction.ts`） |

数据：`data/mons/`（`packs/open/` 内容包 + `moves.json` 招式库、`zones.json` 野外区域、`typechart-18.json`）。测试：`tests/battle-*.test.ts`、`tests/pvp.test.ts`、`tests/boss.test.ts`、`tests/trainer-battle.test.ts`、`tests/integration/battle-ui-*.test.ts`、`server/tests/monwild.test.ts`、`monbox.test.ts`、`monreplace.test.ts`、`server/tests/trainer.test.ts`、`server/tests/boss.test.ts`。

三条互斥规则（服务端）：**同一玩家同时只能在一场战斗里**——野外战斗（`mons.inBattle`）、PvP（`pvp.inBattle`）、BOSS（`boss.inBattle`）互相检查；战斗中不能传送。

## 七、工具与构建
| 做什么 | 命令 | 位置 |
|---|---|---|
| 生成地图 / 美术 / 图集 / WebP | `npm run assets`（分步：`assets:world` / `assets:art` / `assets:interiors` / `assets:webp`） | `tools/build-assets.ts`、`tools/world/*`、`tools/art/*`、`tools/assets/*` |
| 地图编辑器（主人手动微调） | `npm run editor` | `tools/editor/*`，结果 `data/campus/manual.json` |
| 联机协议索引 / 钓鱼攻略 | `npm run protocol:doc` / `npm run guide` | `tools/docs/*`（测试会检查是否最新） |
| 测试 / 类型 / 构建 | `npm test` / `npm run typecheck` / `npm run build` | CI：`.github/workflows/ci.yml`（**只跑公开仓库**，不含 `server/tests`） |
| 部署（只有主人或授权协作者） | `npm run deploy` / `npm run deploy:test` | `deploy/*`（私有备份库跟踪；说明见 `docs/private/DEPLOY.md`） |

## 八、已知结构性事项
- **公开 CI 看不到服务端测试**：改了 `src/shared/*` 后，务必在有 `server/` 的机器上跑一次全量 `npx vitest run`（2026-11 多次靠这个发现问题：传送点数量、初始精灵没有招式、农场播种 id）。
- 大文件：`src/scenes/InteriorScene.ts`（约 750 行，宿舍 / 多层 / 农场都在里面，下一个拆分候选）、`src/net/client.ts`（约 640 行，消息收发，随协议增长）、`tools/editor/main.ts`（约 1100 行，开发工具）、`server/progress.ts`、`server/game.ts`（各约 700 行）。
- 没有任何自动化的前端渲染测试：场景（Phaser）只能靠浏览器实测，面板有少量 happy-dom 集成测试（`tests/integration/`）。
