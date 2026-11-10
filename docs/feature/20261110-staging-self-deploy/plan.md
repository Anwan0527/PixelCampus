# 协作者自助部署到测试环境 实施计划

| 项 | 内容 |
|---|---|
| 状态 | 已完成并上线（2026-11-10）；T7（GitHub Actions）未做 |
| 对应需求 | [spec.md](spec.md)（R1~R8） |
| 负责 | 我（脚本、文档、验证），主人（批准、提供协作者公钥、在服务器上执行一次性安装） |
| 预计工作量 | 约 1 天（R1~R7）；R8（GitHub Actions）另算半天 |

## 1. 方案概述
**核心思路**：服务器上新增一个**只能执行固定命令**的受限账号；协作者用自己的 SSH 密钥登录它，通过它把构建产物推给测试环境。协作者永远拿不到 root、shell 或正式环境。

```
协作者电脑                           正式服务器（只新增）
npm run deploy:test  ──ssh──►  受限账号 pcdeploy（authorized_keys 里每个人一行）
 (本机构建出 dist + server.mjs)      restrict,command="pc-test-gate"  ← 强制命令，忽略对方想执行的任何命令
 tar 流式上传                          └─ 白名单：deploy / status / logs / reset / rollback / set-admin-hash
                                         └─ 解包到收件箱（校验大小 / 路径）
                                            └─ sudo pc-test-install（root 所有、固定内容、无参数）
                                                 ├─ flock 加锁，只允许一个部署
                                                 ├─ 保留最近 3 个版本，切换 current 链接
                                                 └─ systemctl restart pixelcampus-test（只能这一个服务）
```
- **为什么这样**：比给 root / sudo 安全得多；比自建部署服务简单；每人一把密钥，撤销只删一行；和现有 `deploy:test` 复用同一套构建。
- **不选**：直接给 root SSH（越权）；共享一个密钥（无法单独撤销）；把代码推到服务器上构建（服务器内存小、且要放源码）。
- **GitHub Actions（R8）**：同一个受限账号，只是把「协作者的机器」换成 CI（密钥存 GitHub Secrets）。正式环境部署用 GitHub `production` 环境 + 必须主人批准。放到第二批。

## 2. 沙箱加固（R5，必须先做）
给 `pixelcampus-test.service` 增加：
- `IPAddressDeny=any` + `IPAddressAllow=127.0.0.0/8 ::1`：测试进程**不能访问外网**（只允许本机回环，nginx 反代走回环）；
- 隐藏敏感路径：`InaccessiblePaths=` / `TemporaryFileSystem=` 覆盖正式数据目录、`/etc/nginx`（含其他服务的令牌）、其他服务的数据目录与网站目录（具体清单上线前在服务器上逐项核对）；
- 保留已有的内存 200MB / 任务数 / `ProtectSystem=strict` / `ProtectHome` / `NoNewPrivileges`；
- 验收：在测试进程里尝试读这些路径、连外网，都应失败。

## 3. 任务拆分
| 任务 | 内容 | 主要文件 | 依赖 | 验收 | 状态 |
|---|---|---|---|---|---|
| T1 | 沙箱加固（R5）：更新测试服务单元并在服务器上验证 | `deploy/pixelcampus-test.service`（私有） | — | A3 | ✅ |
| T2 | 服务器脚本：`pc-test-gate`（强制命令，白名单分发）、`pc-test-install`（root 脚本：解包校验、加锁、版本切换、重启）、sudo 规则、受限账号与收件箱 | `deploy/pcdeploy/*`（私有）、服务器 | T1 | A1 A2 A4 | ✅ |
| T3 | 受限模式的 `deploy:test`：本机构建 → `tar \| ssh pcdeploy@host deploy`；`test-env` 子命令（status / logs / reset / rollback / set-admin-hash） | `deploy/deploy.sh`、`deploy/test-env.sh`、`package.json` | T2 | 协作者机器上一条命令部署成功 | ✅ |
| T4 | 操作日志（R4）与撤销流程（R7）文档：加 / 删公钥、轮换隐藏路径 | `docs/private/DEPLOY.md`、公开协作指南 | T2 | A5 A6 | ✅ |
| T5 | 验证：用一把临时测试密钥走完 A1~A7（含越权尝试），正式环境对比 `healthz` | — | T1~T4 | A1~A7 | ✅ |
| T6 | 文档：协作指南第四节更新、ADR 0011、FEATURES / CHANGELOG | `docs/` | T5 | | ✅ |
| T7（可选） | GitHub Actions：`staging/*` 自动部署；`production` 环境需主人批准 | 私有服务端仓库 | 服务端仓库独立 | | ☐ |

## 4. 协议与数据变更
- 无协议 / 存档变化。服务器新增：受限账号、`pc-test-gate` / `pc-test-install`（root 所有）、一条 sudo 规则（只允许执行 `pc-test-install`）、`/opt/pixelcampus-test/releases/`（版本目录）、操作日志文件。**不改任何已有配置。**

## 5. 测试计划
- 越权尝试：用受限密钥执行任意命令 / 开 shell / 端口转发 / 读正式目录 / 重启其他服务 → 全部失败；
- 并发：两个部署同时发起 → 第二个被拒；
- 沙箱：测试进程内读正式数据、`/etc/nginx`、外网请求 → 失败；
- 回滚：部署一个坏版本 → `rollback` 恢复；
- 隔离：全程对比正式环境 `healthz`（档案数、进程）不变。

## 6. 上线计划
- 先写脚本和单元；在服务器上**只新增**账号、脚本、sudo 规则、版本目录；先用临时密钥验证，通过后再给第一位协作者开通；
- 回滚：删除 `authorized_keys` 里的条目 / 禁用账号即可，不影响测试环境与正式环境。

## 7. 风险与应对
| 风险 | 影响 | 应对 |
|---|---|---|
| 协作者部署的代码读取同机敏感文件（如 nginx 里其他服务的令牌） | 泄露他人服务的凭据 | 沙箱隐藏路径 + 出站断网（T1），上线前逐项验证；仍只给**受信任**的人 |
| 强制命令 / sudo 脚本有缺陷导致越权 | 提权 | 脚本极简、无参数、路径写死、root 所有；严格校验 tar 内容（拒绝绝对路径 / `..` / 链接）；越权测试 |
| 误部署导致测试环境不可用 | 只影响测试 | `rollback` / `reset` |
| 隐藏路径外泄 | 外人访问测试环境 | 轮换路径；测试环境无真实数据且有资源上限 |

## 8. 进度记录
| 日期 | 做了什么 / 提交 | 备注 |
|---|---|---|
| 2026-11-10 | 写 spec / plan 草稿 | |
| 2026-11-10 | 主人给出第一位协作者的公钥 → 实现并上线：受限账号 + 强制命令（deploy code/full、status、logs、rollback、reset、sethash）+ sudo 固定参数 + 沙箱加固（出站断网、隐藏敏感路径）；用临时密钥走完 A1~A7（越权、恶意包、压缩炸弹、并发、坏版本自动回滚、手动回滚、沙箱 12 项）后撤销临时密钥，加入协作者公钥 | 没验证：协作者那把 RSA 公钥的真实登录（只核对了格式和指纹）；发现并修了 macOS tar 管道输出带尾部填充导致 `gzip -l` 失灵的问题，并把默认部署改为只传代码（full 才传 145MB 资源） |
