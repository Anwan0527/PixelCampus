# 素材与许可

| 内容 | 来源 | 许可/备注 |
|---|---|---|
| 地面、建筑、树、小品、人物、UI 框 | 本项目程序化生成（`tools/art/`） | 自有，无第三方素材 |
| 中文像素字体 Ark Pixel 12px | [TakWolf/ark-pixel-font](https://github.com/TakWolf/ark-pixel-font) | SIL OFL 1.1，随附 `public/fonts/OFL.txt` |
| 卫星正射图（仅描图参考） | Esri World Imagery | 不入库、不分发（`.cache/` 已忽略）；仅用于量测几何 |
| 环路/车道坐标 | OpenStreetMap contributors | ODbL；`data/campus/osm-roads.json` 为衍生数据，发布时需署名 © OpenStreetMap contributors |
| 河北工程大学全景图（地图参考） | 维生酥鱼老师开源分享：[VR 全景](https://vr.douhuiai.com/v/96t4da9wazv5fa-1788138756.html) | 仅作地图布局的参考，不复制、不分发其图像；游戏「关于」面板里有致谢 |
| 校园布局/建筑名 | 用户提供的鸟瞰图与公开资料 | 仅作参考，不复制其图像 |
| 精灵美术：50+ Monsters Pack 2D（56 只，正/背 64×64，含备用配色） | [OpenGameArt · isaiah658](https://opengameart.org/content/50-monsters-pack-2d)，2026-11-04 下载，存于 `data/mons/art/zoonami-50-monsters-2d/`（含 `Credits.txt`、`SOURCE.md`） | **CC0**，不要求署名；Zoonami 模组的媒体是 CC-BY-SA-4.0，**不要拷**；详见该目录的 `SOURCE.md` |

**人物素材调研**（未采用）：Lil Guy Base（CC BY 4.0，16×32 四向，需署名）、Memao Sprite Sheet Creator / 2DPIXX Modern School（付费）、
Tiny Towners（付费，16×24）。若你想换成其中某一套，请自行下载/购买后告诉我路径，我来对接精灵表。

> **本项目自身的许可**：见仓库根目录 `LICENSE`（版权所有 © 2026 EXIST-D，保留所有权利；仅限个人学习的非商业使用）。游戏里「关于」面板的致谢名单来自 `src/shared/about.ts` 的 `CREDITS`，**新增第三方素材/库时这里和 `CREDITS` 两处都要加**。

> **使用范围**：本项目仅作个人学习，不商用、不发布。因此参考/借用素材的许可约束较宽松；若将来要公开发布，需重新核对上表（尤其 OSM 署名、卫星图仅作参考不得分发）。

## 敏感词库
词库与过滤引擎只在主人的服务器上使用，不随本仓库分发；其来源与许可（MIT / CC BY 4.0 的公开词库）由主人私下保管，游戏里的「关于」面板已列出致谢。
