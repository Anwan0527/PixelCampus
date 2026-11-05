# 像素校园 · 河北工程大学新校区

星露谷风格的俯视角 2D 网页游戏（Phaser + TypeScript + Vite），多人在线。线上：https://exist.qd.je/pixel/ 。**不商用，仅个人学习。**

**先读 `docs/HANDOFF.md`**：项目现状、目录地图、约定、已知偏差与待办、调试手册都在里面。这个仓库只含客户端、共享规则、地图/美术数据与工具、文档；联机服务器和部署由主人在自己电脑上维护，不在仓库里。

## 工作约定
- **用中文**回复；需要主人决定的事先问；公开可见的内容（公告正文等）由主人自己发。
- 优先级：先保证平面地图/道路与真实一致，再做景观；**室内：试点中**（只开放 42 号楼 214 室，其余仍关闭，主人点头再扩）；南门→图书馆那一段主人最满意，别随意改。
- 玩家写的文字一律 `textContent` 渲染（不用 `innerHTML`）；校验逻辑放 `src/shared/`；客户端只做展示和请求，不替服务器做决定；不做账号密码，身份是浏览器 token。
- **每次更新（新功能/调整/修复）都要同步改 `docs/FEATURES.md`（现有功能清单）并在 `docs/CHANGELOG.md` 顶部按日期加一节。**
- 提交信息用中文，每个改动单独提交；别提交 `public/assets/generated*`、`data/server/`、任何口令/令牌（已在 `.gitignore`）。
- **上线部署只由主人手动执行**，别人合并的代码不会自动上线。多人协作流程见 `docs/COLLABORATION.md`。

## 常用命令
`npm ci` · `npm run assets`（生成地图/美术资源，首次约 2 分钟，生成物不入库）· `npm run dev`（5173，浏览器开 `/?offline` 单机预览）· `npm test` · `npm run build` · `npm run editor`（**地图编辑器**，主人手动微调地图，结果在 `data/campus/manual.json`，流程见 `docs/MAP_EDITOR.md`）。

## 注意
- 改了 `src/shared/*`（协议、规则、价格）：服务端要同步改，在 PR 说明里写清楚改了什么。
- 改了 `tools/world/compile.ts`、`data/campus/*`、美术：重新 `npm run assets`（现在会为四个季节各生成一套地面块，首次约 2 分钟，之后有缓存）。
- 主人在地图编辑器里改完会说"编辑器改好了"：按 `docs/MAP_EDITOR.md` 的流程（看 `git diff data/campus/manual.json` → 生成 → 测试 → 提交），别手工覆盖手动层；`data/campus/baked.json` 是由部署流程生成的，别手改。
