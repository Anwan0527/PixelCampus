# 多人协作流程

> 一句话：**仓库公开，任何人都可以 fork、改、提 Pull Request；`main` 受保护——必须走 PR、CI 通过、并且经仓库主人批准才能合并；上线部署永远由主人自己手动执行，合并不会自动上线。**

## 1. 角色与权限
| 谁 | 能做什么 | 不能做什么 |
|---|---|---|
| 主人 | 审核并合并 PR、管理仓库、上线部署 | — |
| 任何人（公开仓库） | 克隆代码、fork、在自己的 fork 里开分支、向主仓库提 PR、评论 | 直接推送主仓库、合并 PR、改仓库设置、上线部署 |
- **不需要被邀请**：直接 fork 就行；主仓库没有别的有写权限的人，所以**只有主人的批准算数**。
- `main` 的保护规则：必须通过 PR 合并；至少 1 次批准（`.github/CODEOWNERS` 指定主人为代码负责人，必须由主人批准）；CI（生成资源 + 类型检查 + 测试 + 构建）必须通过；不允许强推和删除；来自 fork 的 PR 第一次跑 CI 需要主人点 **Approve and run**。
- 协作者**不需要也不会拿到**服务器、口令等任何运维信息；联机服务器和部署不在这个仓库里。
- 代码是主人的作品，使用范围见仓库根目录 `LICENSE`（保留所有权利，仅限个人学习的非商业使用；协作者提交的贡献授权给作者）。

## 2. 协作者怎么改（写给对方的一页纸）
1. 在 GitHub 上点 **Fork**，把主仓库 fork 到自己账号下，再克隆**自己的 fork**：`git clone https://github.com/<你的用户名>/<仓库名>.git`，进目录后 `npm ci`
2. 第一次必须生成资源（地面块、图集不入库）：`npm run assets`（约 2 分钟，之后有缓存）
3. 新建一个自己的分支（名字用 `feature/简短英文名`，修 bug 用 `fix/简短英文名`），不要直接在 main 上改
4. 开发：`npm run dev`，浏览器打开 `http://127.0.0.1:5173/?offline`（单机模式；联机服务器不在仓库里，联机相关的东西在本地看不到）
5. **新功能 / 较大调整先写文档**：复制 `docs/feature/spec.md`、`plan.md` 到 `docs/feature/<日期-名称>/`，写需求和计划，主人确认后再开发；涉及服务端 / 存档字段见 [SERVER_COLLABORATION.md](SERVER_COLLABORATION.md)
6. 提交前：`npm test`、`npm run build` 都要过；**同步改 `docs/FEATURES.md` 和 `docs/CHANGELOG.md`**；一个改动一个提交，提交信息用中文
6. 推送到自己的 fork（`git push -u origin 分支名`），在 GitHub 上向主仓库的 `main` 开 Pull Request（模板里有自查清单）
7. 改动前先读 `docs/HANDOFF.md`、`CLAUDE.md`（约定）；别提交 `public/assets/generated*`、`data/server/`、任何口令/令牌（已在 `.gitignore`）
8. 定期把主仓库的最新 `main` 同步到自己的 fork（GitHub 页面上的 **Sync fork**，或 `git remote add upstream <主仓库地址>` 后 `git pull upstream main`），免得 PR 冲突。
- 小心共享文件：`src/shared/*`（客户端和服务端共用，改了服务端要同步）、`src/scenes/WorldScene.ts` 是大家都会碰的地方，PR 尽量小、尽量快合，减少冲突。

### 想做的功能要服务端配合怎么办
服务端不在仓库里，所以这类功能分两半：
- **你做的一半**：客户端界面与交互、`src/shared/` 里的规则/数据/协议类型（新增消息写进 `src/shared/protocol.ts`，设计写进 `docs/design/MULTIPLAYER.md`）、测试（共享规则的纯函数测试）。
- **主人做的一半**：服务端收发与校验。PR 说明里请写清：新增/改动了哪些消息、字段含义、校验规则（比如数值上限、冷却、距离）、哪些数据需要持久化。
- 先在 Issue 里说一下设计再动手，尤其是价格、协议、玩家档案字段这类会影响线上数据的东西。

## 3. 主人怎么审、怎么同意
1. 收到 PR 通知后（CODEOWNERS 会自动请求你 review），看 **Files changed**（逐行评论）和 **Checks**（CI 绿勾 = 生成资源 + 类型检查 + 全部公开测试 + 构建都过了；红叉先别合）。来自 fork 的 PR，CI 第一次要主人在页面上点 **Approve and run** 才会跑（防止别人的代码在不知情时跑工作流）。
2. 想亲眼看效果：`gh pr checkout <编号>` → `npm run assets`（如果改了美术/地图）→ `npm run dev`。
3. 觉得可以：点 **Approve**，再点 **Squash and merge**。**批准就是"同意"**——没有你的批准，按钮点不了；合并之前任何代码都不会上线。
4. 有问题：在 PR 里评论让对方改，或 **Request changes**；不要的直接 Close。

## 4. 合并之后
上线部署只由主人在自己电脑上手动执行，不会因为合并而自动上线（自动部署需要把服务器密钥交给 GitHub，风险大于收益）。涉及协议/档案字段/数据文件的改动，主人会先备份线上数据再部署。部署后主人会把 FEATURES / CHANGELOG 里的「未部署」改成「已部署」。

## 5. 约定小结
- 一个 PR 做一件事；大功能先在 Issue 里说一下设计。
- 改玩家档案字段、协议（`src/shared/protocol.ts`）、数据文件：在 PR 的「部署注意」里写清楚，主人部署前备份。
- 美术/地图类改动在 PR 里附截图（预览图在 `.cache/preview/`，或浏览器截图）。
- 玩家数据、玩家留言永远不进仓库。
