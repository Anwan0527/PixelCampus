/** 作者声明、链接、许可与致谢：游戏里的「关于」面板、水印、照片水印、控制台署名都从这里取，改一处全都更新。 */
export const ABOUT = {
  title: '像素校园 · 河北工程大学新校区',
  author: 'EXIST-D',
  year: '2026',
  /** 作者的 GitHub 主页 */
  github: 'https://github.com/EXIST-D',
  /** 作者的个人主页（填上后自动出现在「关于」里；留空就不显示） */
  homepage: '',
  /** 项目仓库（公开，欢迎 fork 提 PR；合并由作者审核，上线由作者统一部署） */
  repo: 'https://github.com/EXIST-D/PixelCampus',
  /** 游戏线上地址 */
  site: 'https://exist.qd.je/pixel/',
  /** 许可简称（完整条款见仓库根目录 LICENSE，线上是 ./LICENSE.txt） */
  license: '保留所有权利 · 仅限个人学习的非商业使用',
  licenseFile: 'LICENSE.txt',
} as const;

/** 画面角落的小水印、照片底栏、页面版权行 */
export const copyrightLine = () => `© ${ABOUT.year} ${ABOUT.author} · ${ABOUT.title.split(' · ')[0]}`;

/** 致谢：用到的第三方内容及其许可。新增第三方素材/库时在这里加一行，并同步 docs/ASSETS_AND_LICENSES.md。 */
export interface Credit { name: string; by: string; license: string; url?: string; note?: string }
export const CREDITS: readonly Credit[] = [
  { name: 'Phaser 3', by: 'Photon Storm', license: 'MIT', url: 'https://phaser.io', note: '游戏引擎' },
  { name: 'Ark Pixel Font 12px', by: 'TakWolf', license: 'SIL OFL 1.1', url: 'https://github.com/TakWolf/ark-pixel-font', note: '中文像素字体' },
  { name: 'OpenStreetMap', by: 'OpenStreetMap contributors', license: 'ODbL', url: 'https://www.openstreetmap.org/copyright', note: '校园道路数据（© OpenStreetMap contributors）' },
  { name: '河北工程大学全景图（地图参考）', by: '维生酥鱼老师', license: '作者开源分享', url: 'https://mab.suyu.ink', note: '校园 VR 全景，为地图布局提供了大量参考' },
  { name: '50+ Monsters Pack 2D', by: 'isaiah658', license: 'CC0', url: 'https://opengameart.org/content/50-monsters-pack-2d', note: '精灵美术' },
  { name: 'Sensitive-lexicon', by: 'konsheng', license: 'MIT', url: 'https://github.com/konsheng/Sensitive-lexicon', note: '敏感词过滤词库（服务器端）' },
  { name: 'List of Dirty, Naughty, Obscene, and Otherwise Bad Words', by: 'LDNOOBW', license: 'CC BY 4.0', url: 'https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words', note: '脏话词库（服务器端）' },
  { name: 'ws · Vite · TypeScript', by: '各自的作者与贡献者', license: 'MIT / Apache-2.0', note: '联机服务器与构建工具' },
];

/** 一般性致谢（不是许可要求，是想说的话） */
export const THANKS = [
  '感谢所有来玩、提意见、留言反馈的同学和朋友。',
  '感谢维生酥鱼老师开源。',
  '感谢维生酥鱼老师为开屏页面动画图案所做的贡献。',
  '地图依据公开的卫星影像与 OpenStreetMap 量测复原；本项目是个人学习作品，与河北工程大学没有隶属或官方关系，校名、地名仅用于描述真实地点。',
] as const;
