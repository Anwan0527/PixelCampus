import Phaser from 'phaser';
import type { WorldFile, BuildingOut } from '@/shared/world-format';
import { WorldMap } from '@/world/WorldMap';
import { Player } from '@/entities/Player';
import { Npc } from '@/entities/Npc';
import { GameClock } from '@/systems/clock';
import { FISHING_BLOCK_MSG, fishingBlocksInteract, fishingBlocksUi, fishingPrefersCast, fishingRodOut, type FishLockState } from '@/systems/fishlock';
import { Hud } from '@/ui/Hud';
import { TILE, ZOOMS, DEFAULT_ZOOM_INDEX } from '@/core/const';
import { WD } from '@/core/paths';
import { Streamer, type Destroyable } from '@/world/Streamer';
import { hueOf, type Profile } from '@/shared/profile';
import { saveProfile, getToken } from '@/core/profileStore';
import { NetClient, defaultWsUrl } from '@/net/client';
import { NET, packFlags, type PublicProfile } from '@/shared/protocol';
import { RemotePlayer } from '@/entities/RemotePlayer';
import { eggAdvance, EGG_FOUND_MSG } from '@/world/egg';
import { ProfilePanel } from '@/ui/ProfilePanel';
import { ChatPanel } from '@/ui/ChatPanel';
import { ReportDialog } from '@/ui/ReportDialog';
import { TouchControls, isTouchDevice } from '@/ui/TouchControls';
import { mountOrientation } from '@/ui/Orientation';
import { mountImmersive } from '@/ui/Immersive';
import { BoardPanel } from '@/ui/BoardPanel';
import { ShopPanel } from '@/ui/ShopPanel';
import { WallPanel } from '@/ui/WallPanel';
import { marketDay, pickBait, pickRod, resolveGear } from '@/shared/economy';
import { inPlaza, PLAZA_BUILDINGS } from '@/shared/plaza';
import { NoticePanel } from '@/ui/NoticePanel';
import { SocialUi } from '@/ui/SocialUi';
import { mountSideButtons, ui } from '@/ui/actions';
import { CreateCharacter } from '@/ui/CreateCharacter';
import { Cat } from '@/entities/Cat';
import { LakeBird, LakeBirds } from '@/entities/LakeBird';
import { BIRD_FEED_ITEM } from '@/shared/waterfowl';
import { BackpackPanel } from '@/ui/BackpackPanel';
import { MonPanel } from '@/ui/MonPanel';
import { BattleUi } from '@/ui/BattleUi';
import { TeleportPanel } from '@/ui/TeleportPanel';
import { setDormDefs } from '@/ui/DormPeek';
import { dormInteriorId } from '@/shared/dorm';
import { DormPanel } from '@/ui/DormPanel';
import { WorldPanel } from '@/ui/WorldPanel';
import { HandUi } from '@/ui/HandUi';
import { HAND, glide, handOffset } from '@/shared/hand';
import { CatPanel } from '@/ui/CatPanel';
import { BackupPanel } from '@/ui/BackupPanel';
import { AchievementPanel } from '@/ui/AchievementPanel';
import { TitlePanel } from '@/ui/TitlePanel';
import { EmotePanel } from '@/ui/EmotePanel';
import { PhotoMode, savePhoto } from '@/ui/PhotoMode';
import { emoteBlocked, emoteDef } from '@/shared/emotes';
import { nearestSeat, seatSpots, SIT_REACH, type Seat } from '@/shared/seats';
import { Character } from '@/entities/Player';
import { SettingsPanel } from '@/ui/SettingsPanel';
import { mountWatermark } from '@/ui/AboutPanel';
import { QuestPanel } from '@/ui/QuestPanel';
import { commClaimable } from '@/ui/commissionsView';
import { CalendarPanel } from '@/ui/CalendarPanel';
import { FestivalFx } from '@/systems/festival';
import { festData } from '@/ui/festivalData';
import { escStack, installEscStack, type EscTarget } from '@/ui/escstack';
import { festivalByCode } from '@/shared/calendar';
import { RunPanel } from '@/ui/RunPanel';
import { AdminPanel } from '@/ui/AdminPanel';
import { PartyPanel } from '@/ui/PartyPanel';
import { CodexPanel } from '@/ui/CodexPanel';
import { HallPanel } from '@/ui/HallPanel';
import { PlacePanel, closeLightbox, lightboxOpen } from '@/ui/PlacePanel';
import { buildPlaces, placeAt, type PlaceDef } from '@/shared/place';
import { placeBtnState } from '@/ui/placebtn';
import { TradePanel } from '@/ui/TradePanel';
import { nearestBin } from '@/shared/trash';
import { FishFightUi } from '@/ui/FishFightUi';
import { FishCard } from '@/ui/FishCard';
import { BoxPanel } from '@/ui/BoxPanel';
import { fishData } from '@/ui/fishData';
/** 钓具老板的人物外观编号（preset look，取余） */
const KEEPER_LOOK = 5;
import { PAX_NEAR, PAX_REACH } from '@/shared/party';
import { GATES, RUN, inStartZone } from '@/shared/run';
import { castTarget, fishDef, fmtKg, isFish, sizeTier, FISH, FISHING, REAL_FISH, RARITY_ORDER } from '@/shared/fishing';
import type { ServerMsg } from '@/shared/protocol';
import { lakeMask, type WaterMask } from '@/shared/water';
import { questDef } from '@/shared/quests';
import { audio } from '@/audio/engine';
import { music } from '@/audio/music';
import { sfx } from '@/audio/sfx';
import { ambient } from '@/audio/ambient';
import { titleDef } from '@/shared/titles';
import { ACH_TOTAL, achDef } from '@/shared/achievements';
import { CAT_REACH, allCats, dormCatCap, type CatInfo } from '@/shared/cats';
import { defaultLay } from '@/shared/decor';
import type { CatBridge, DormCatFx } from '@/systems/dormcats';
import { HELD_MAX, heldDef } from '@/shared/held';
import { gateBikes } from '@/shared/bikes';
import { itemDef } from '@/shared/items';
import { SEASON_NAME, seasonAt, weatherAt, type Season, type WeatherState } from '@/shared/season';
import { isNightAt } from '@/shared/clock';
import { WeatherFx } from '@/systems/weather';
import { whereIs } from '@/shared/where';

type Keys = Record<'l' | 'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd' | 'shift' | 'e' | 'space' | 'esc' | 'v' | 'm' | 'c' | 'b' | 'n' | 'f' | 'i' | 'j' | 'k' | 'q' | 't' | 'x' | 'p' | 'h' | 'g' | 'r' | 'y' | 'u' | 'o' | 'enter' | 'plus' | 'minus' | 'plus2' | 'minus2', Phaser.Input.Keyboard.Key>;

export class WorldScene extends Phaser.Scene {
  private world!: WorldMap;
  private wf!: WorldFile;
  private player!: Player;
  private hud!: Hud;
  private clock = new GameClock();
  /** 当前季节（决定用哪一套地面块/树木图集）和天气画面 */
  private season: Season = 'spring';
  private propsKey = 'props';
  private seasonChanging = false;
  private seasonLocked = false; // 开发调试：锁定季节（不跟随服务器时间）
  private weather!: WeatherFx; private festFx!: FestivalFx; private lastFest = '';
  private lastWx = ''; private lastBow = false;
  private wxPlaceT = 0; private placeText = '';
  private keys!: Keys;
  private tintRect!: Phaser.GameObjects.Rectangle;
  private stream = new Streamer(700, 1500);
  private waterActive = new Map<string, Phaser.GameObjects.Image[]>();
  private waterFrame = 0;
  private zoomIndex = DEFAULT_ZOOM_INDEX;
  private lastPlace = '';
  private nearBuilding: BuildingOut | null = null;
  /** 地点留言板：地点表、玩家现在所在的地点、入口按钮 */
  private placeUi!: PlacePanel; private places: PlaceDef[] = []; private curPlace: PlaceDef | null = null; private placeBtn?: HTMLButtonElement; private placeChkAt = 0; private placeKey?: Phaser.Input.Keyboard.Key;
  private npcs: Npc[] = [];
  /** 精工湖钓具摊旁的固定 NPC「钓具老板」+ 名字牌 + 头顶的「！」（有委托奖励可以领时） */
  private keeper: Npc | null = null; private keeperTag: Phaser.GameObjects.Text | null = null; private keeperMark: Phaser.GameObjects.Text | null = null;
  private entering = false;
  private enterPos: { x: number; y: number } | null = null;
  private rand = Math.random;
  private profileUi!: ProfilePanel;
  private chatUi!: ChatPanel;
  private chatUnread = 0;
  private reportUi!: ReportDialog;
  private boardUi!: BoardPanel;
  private shopUi!: ShopPanel;
  private wallUi!: WallPanel;
  /** 送过猫窝的小猫编号（只有我自己看得到那些窝） */
  private catBeds = new Set<number>();
  private catRo?: ResizeObserver;
  /** 刚发了「接回宿舍 / 送回校园」，在等服务器的结果文字（显示在小猫面板里） */
  private dormCatAwait = false;
  private noticeUi!: NoticePanel;
  private socialUi!: SocialUi;
  private backpackUi!: BackpackPanel;
  private catUi!: CatPanel;
  private backupUi!: BackupPanel;
  private achUi!: AchievementPanel;
  private titleUi!: TitlePanel;
  private emoteUi!: EmotePanel;
  private settingsUi!: SettingsPanel;
  private questUi!: QuestPanel;
  private calUi!: CalendarPanel;
  private runUi!: RunPanel;
  private adminUi!: AdminPanel;
  private partyUi!: PartyPanel;
  private codexUi!: CodexPanel;
  private hallUi!: HallPanel;
  private monUi!: MonPanel;
  private battleUi!: BattleUi;
  private tpUi!: TeleportPanel;
  private dormUi!: DormPanel;
  private worldUi!: WorldPanel;
  private handUi!: HandUi;
  /** 手拉手：我被谁牵着（牵手的人的玩家编号，0 = 没有）；全部牵着手的一对；连线的画布 */
  private holdPid = 0; private holdSide: 1 | -1 = 1;
  private handPairs: { l: number; f: number }[] = [];
  private handG!: Phaser.GameObjects.Graphics;
  private tradeUi!: TradePanel;
  /** 垃圾桶（脚点，像素坐标；编号 = 世界文件里垃圾桶的顺序，和服务器一致） */
  private bins: { x: number; y: number }[] = [];
  /** 骑车撞墙：上次上报的时间；凌晨四点：这次登录有没有报过 */
  private crashAt = 0; private dawnSent = false; private dawnNext = 0;
  /** 校园币余额（服务器推送；交易面板要用） */
  private coinBal = 0;
  /** 今天还能翻几次垃圾桶（-1 = 还没翻过，不知道） */
  private binLeft = -1;
  private fightUi!: FishFightUi;
  private boxUi!: BoxPanel;
  private fishCard!: FishCard;
  /** 浮漂落点（世界像素）：钓上来的鱼从这里飞出水面 */
  private bobber: { x: number; y: number } | null = null;
  /** 正坐在谁的车后座（车主的玩家编号，0 = 没坐车）：位置每帧跟着车主走 */
  private paxPid = 0;
  private runMark?: Phaser.GameObjects.Graphics;
  private stepT = 0; private moodT = 0;
  private photo!: PhotoMode;
  /** 可以坐的长椅座位（和服务器按同一份数据、同一个算法算出来） */
  private seats: Seat[] = [];
  /** 钓鱼：精工湖的水面格；当前的钓鱼阶段（和服务器保持一致，由 fish_state 驱动） */
  private water: WaterMask | null = null;
  private fishPhase: 'idle' | 'wait' | 'bite' | 'fight' = 'idle';
  private cats: Cat[] = [];
  /** 精工湖的鸭子和天鹅（没有湖的世界里是 undefined） */
  private lakeBirds?: LakeBirds;
  /** 各只小猫对我的好感度（服务器推送；猫编号 → 点数） */
  private catAff: Record<string, number> = {};
  /** 我给各只小猫取的专属名字（猫编号 → 名字）；谁带着哪只猫（猫编号 → 玩家编号） */
  private catNick: Record<string, string> = {};
  /** 服务器给的每只猫"今天的状态" / 今天和累计收到的回礼数 */
  private catInfo: Record<string, CatInfo> = {};
  private catGifts = { today: 0, total: 0 };
  private catWith = new Map<number, number>();
  /** 摆着共享单车的停车点（像素坐标）：走到旁边按 E 扫码骑行 */
  private bikeSpots: { x: number; y: number }[] = [];
  /** 别人（或自己）下车后留在原地的单车：编号 → 位置与图 */
  private droppedBikes = new Map<number, { x: number; y: number; img: Phaser.GameObjects.Image }>();
  /** 这一帧玩家是不是在奔跑（小猫据此决定要不要躲） */
  private runNow = false;
  private net!: NetClient;
  private remotes = new Map<number, RemotePlayer>();
  private lastSent = { x: -1, y: -1, flags: -1 };
  private sendAcc = 0;
  private editing = false;
  private touchUi?: TouchControls;
  /** 触屏的"互动"/点提示/点对话框：置位后由下一帧的 update 当作按了 E 处理 */
  private touchPress = false;
  /** 可改字的文字牌（校名石彩蛋）：id → 当前显示第几句（0 = 原文）与场景里正在显示的文字对象 */
  private egg = new Map<string, { step: number; busy?: boolean; text?: Phaser.GameObjects.Text }>();

  constructor() { super('World'); }

  create() {
    this.hud = this.registry.get('hud') as Hud;
    this.wf = this.cache.json.get('world') as WorldFile;
    this.world = new WorldMap(this.wf);
    this.season = (this.registry.get('season') as Season | undefined) ?? seasonAt(Date.now());
    this.buildLighting();
    this.weather = new WeatherFx(this); this.festFx = new FestivalFx(this);
    this.buildStream();

    const sp = this.wf.spawn;
    const profile = this.registry.get('profile') as Profile;
    this.player = new Player(this, sp.x * TILE, sp.y * TILE, profile.look, profile.app);
    this.player.setNameTag(profile.name, '#ffe9a0');
    this.setupSocial(profile);
    this.setupTouch();
    this.registry.set('touchUi', () => this.touchUi);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.world.pxW, this.world.pxH);
    cam.startFollow(this.player.sprite, true, 0.14, 0.14);
    cam.roundPixels = true;
    this.applyZoom();
    this.scale.on('resize', () => this.applyZoom());
    cam.centerOn(this.player.x, this.player.y);
    this.tickStream();
    this.time.addEvent({ delay: 120, loop: true, callback: () => this.tickStream() });

    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = kb.addKeys({
      up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT, w: K.W, a: K.A, s: K.S, d: K.D, shift: K.SHIFT, e: K.E, space: K.SPACE,
      esc: K.ESC, v: K.V, m: K.M, c: K.C, b: K.B, n: K.N, f: K.F, i: K.I, j: K.J, k: K.K, q: K.Q, t: K.T, x: K.X, p: K.P, h: K.H, g: K.G, r: K.R, y: K.Y, u: K.U, o: K.O, l: K.L, enter: K.ENTER, plus: K.PLUS, minus: K.MINUS, plus2: K.NUMPAD_ADD, minus2: K.NUMPAD_SUBTRACT,
    }) as Keys;
    // 主键盘 =/- 的 keyCode
    this.placeKey = kb.addKey(190); // 句号键 .：打开地点留言板（字母键都被占满了）
    kb.addKey(187).on('down', () => this.changeZoom(1));
    kb.addKey(189).on('down', () => this.changeZoom(-1));
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => { if (!this.hud.dialogOpen) this.changeZoom(dy < 0 ? 1 : -1); });

    this.water = lakeMask(this.wf.waterRuns, this.wf.width, this.wf.height, this.wf.pois);
    this.places = buildPlaces(this.wf.buildings, this.wf.pois); // 地点留言板：有名字的建筑 + 地标
    this.seats = seatSpots(this.wf.objects.filter((o) => o.k === 'bench'), this.world);
    this.bins = this.wf.objects.filter((o) => o.k === 'bin').map((o) => ({ x: o.x, y: o.y }));
    RemotePlayer.findSeat = (x, y) => { const s = nearestSeat(this.seats, x, y, 30); return s && { bx: s.bx, by: s.by }; };
    this.buildTrackMarks();
    this.spawnNpcs();
    this.spawnCats();
    if (this.water) this.lakeBirds = new LakeBirds(this, this.water);
    this.spawnKeeper();
    this.buildBikes();
    this.registry.set('tickClock', (dt: number) => this.updateClock(dt)); // 进了宿舍 / 室内：校园场景在睡觉，由室内场景每帧代为推进时钟（时间显示、天气播报才不会停）
    this.events.on('wake', () => {
      this.entering = false; this.touchPress = false; this.registry.set('touchPress', false); // 室内里按过的互动键别带回外面（否则一出来又"进入"了）
      if (this.registry.get('dormForced')) this.registry.set('dormForced', false); // 在宿舍里被传走：位置已经是服务器给的新位置，别再放回门口
      else if (this.enterPos) { this.player.x = this.enterPos.x; this.player.y = this.enterPos.y; this.player.facing = 'down'; }
      this.cameras.main.fadeIn(260, 20, 14, 10);
      this.cameras.main.centerOn(this.player.x, this.player.y);
    });
    this.hud.setupMinimap(this.world.w, this.world.h, this.wf.pois, this.mapLabels());
    this.hud.hideLoading();
    this.hud.banner('河北工程大学', '新校区 · 从南门出发');
    if (import.meta.env.DEV) (window as any).__game = { scene: this, audio, music, sfx, tp: (tx: number, ty: number) => { this.player.x = tx * TILE; this.player.y = ty * TILE; }, setTime: (h: number) => this.clock.devSetHour(h),
      setWeather: (kind?: WeatherState['kind'], power = 1) => { this.weather.forced = kind ? { kind, power, name: kind, icon: '' } : undefined; },
      setSeason: (s: Season) => { this.seasonLocked = true; this.loadSeason(s, true); } };
  }

  /** 个人信息、公屏聊天、修改资料。联机后：LocalChat 换成 WebSocket 实现，界面不变。 */
  private setupSocial(profile: Profile) {
    this.backupUi = new BackupPanel();
    this.profileUi = new ProfilePanel(this.textures, profile, () => this.editProfile(), () => this.backupUi.open('show'), () => this.achUi.open(), () => this.titleUi.open(), () => this.settingsUi.open('about'));
    this.profileUi.setAch(0, ACH_TOTAL);
    this.net = new NetClient(defaultWsUrl(), getToken(), () => this.profileUi.profile);
    this.reportUi = new ReportDialog(this.net); // 举报弹窗：公屏 / 私聊 / 留言板 / 校园墙 / 玩家资料共用
    this.chatUi = new ChatPanel(this.net);
    this.chatUi.onUnread = (n) => { this.chatUnread = n; this.touchUi?.setChatBadge(n); }; // 手机底部「聊天」按钮的未读角标（只算没静音的频道）
    this.chatUi.onFocus = () => this.input.keyboard!.resetKeys();
    this.boardUi = new BoardPanel(this.net, (uid, ctx) => this.adminUi.openUserMenu(uid, ctx));
    this.wallUi = new WallPanel(this.net);
    this.placeUi = new PlacePanel(this.net);
    this.setupPlaceBtn();
    this.noticeUi = new NoticePanel(this.net, (title) => { this.hud.banner('📢 新公告', title); this.net.system(`📢 新公告：${title}（点「公告」查看）`); });
    setDormDefs(() => this.cache.json.get('interiors'));
    this.socialUi = new SocialUi(this.net, this.textures, (t) => { if (!t.startsWith('💬')) this.hud.banner('👥 好友', t); this.net.system(t); sfx('notify'); });
    this.chatUi.onNameClick = (uid, ctx) => { if (this.net.isAdmin) this.adminUi.openUserMenu(uid, ctx); else this.socialUi.showPlayer(uid); }; // 管理员点名字：禁言/撤回/封禁菜单；普通玩家：资料卡
    this.chatUi.admin = () => this.net.isAdmin;
    this.partyUi = new PartyPanel(this.net, {
      friends: () => this.socialUi.friendList,
      note: (title, text) => { this.hud.banner(title, text); this.net.system(`${title}：${text}`); },
      beep: () => sfx('notify'),
    });
    this.runUi = new RunPanel(this.net, {
      friends: () => this.socialUi.friendList as never,
      beep: (k) => sfx(k === 'count' ? 'count' : k === 'go' ? 'go' : k === 'finish' ? 'finish' : 'notify'),
      note: (title, text) => { this.hud.banner(title, text); this.net.system(`${title}：${text}`); },
    });
    fishData.attach(this.net); // 钓鱼图鉴记录 / 装备图鉴：几个面板共用
    fishData.env = () => { const t = Date.now() + this.clock.offset; return { night: isNightAt(t), rain: weatherAt(t).kind === 'rain', season: seasonAt(t) }; };
    this.backpackUi = new BackpackPanel(this.net, this.textures, (gains) => {
      const text = gains.map((g) => `${itemDef(g.id)?.name ?? g.id} ×${g.n}`).join('、');
      this.hud.banner('🎒 获得物品', text); this.net.system(`🎒 获得：${text}`); sfx('pickup');
    }, () => this.codexUi.open('fish'));
    this.boxUi = new BoxPanel(this.net, this.textures, () => this.backpackUi.inv);
    this.backpackUi.onOpenBox = (id, n) => this.boxUi.open(id, n);
    this.backpackUi.openLevel = () => { this.backpackUi.close(); this.codexUi.openFishSub('level'); };
    this.net.handlers.releaseResult = (m) => { this.hud.banner(m.ok ? '🌊 放生' : '放生失败', m.msg); this.net.system(m.ok ? `🌊 ${m.msg}` : m.msg); if (m.ok) sfx('pickup'); };
    // 钓鱼升级：横幅 + 系统消息；升到 5 / 10 级提示去选路线
    fishData.onLevelUp = (m) => {
      const up = m.up!, text = `Lv.${up.from} → Lv.${up.to}：${up.coins} 校园币${up.items.map((g) => `、${itemDef(g.id)?.name ?? g.id} ×${g.n}`).join('')}`;
      this.hud.banner('🎣 钓鱼升级！', text); this.net.system(`🎣 钓鱼升到 Lv.${up.to}（${text}）`); sfx('achieve');
      if ((up.from < 5 && up.to >= 5) || (up.from < 10 && up.to >= 10)) window.setTimeout(() => { this.hud.banner('🎣 解锁了新的路线槽', '在图鉴的「等级」页选择：渔夫（卖鱼价 +10%）或寻宝（盲盒 ×1.3）'); }, 3200);
    };
    this.shopUi = new ShopPanel(this.net, this.textures, () => marketDay(Date.now() + this.clock.offset), { openQuests: (tab) => this.questUi.open(tab) }); // 钓具摊的「📋 钓鱼委托」：打开任务面板的钓鱼页
    this.fightUi = new FishFightUi();
    this.fishCard = new FishCard(this.textures);
    this.fishCard.onRelease = (id) => this.net.fishRelease(id);
    this.monUi = new MonPanel(this.net);
    this.backpackUi.attachMons(this.monUi); // 精灵并入背包的「精灵」页（按 R 直达）
    this.battleUi = new BattleUi(this.net);
    this.handUi = new HandUi(this.net);
    this.handUi.onNote = (title, text) => { this.hud.banner(title, text); this.net.system(`${title}：${text}`); };
    this.handUi.onRole = (role, pid, side) => { const was = this.holdPid; this.holdPid = role === 'follow' ? pid : 0; this.holdSide = side; this.player.led = role === 'follow'; if (role !== 'none' && !(was && was === this.holdPid)) sfx('pickup'); };
    this.net.handlers.handPairs = (list) => { this.handPairs = list; };
    this.handG = this.add.graphics().setDepth(100000);
    this.tpUi = new TeleportPanel(this.net, () => { this.hud.banner('📍 传送', '到啦'); sfx('go'); });
    this.worldUi = new WorldPanel(this.net, { friends: () => this.socialUi.friendList, locOf: (u) => this.socialUi.locOf(u) });
    this.socialUi.onWorld = (uid) => this.worldUi.openFor(uid); this.socialUi.onLocs = () => this.worldUi.refresh();
    this.worldUi.onChange = (kind) => { // 换了世界：旧世界里的人物、公屏都不是这个世界的了（服务器会补发这个世界的单车/小猫/牵手/公屏记录）
      for (const r of this.remotes.values()) r.destroy(); this.remotes.clear(); this.paxPid = 0; this.holdPid = 0;
      this.chatUi.clear();
      this.hud.banner(kind === 'solo' ? '🏠 个人世界' : kind === 'group' ? '👥 好友世界' : '🌍 公共世界', kind === 'solo' ? '这里只有你一个人' : kind === 'group' ? '只有你们几位好友' : '回到了大家中间'); sfx('go');
    };
    this.dormUi = new DormPanel(this.net);
    { const h = this.net.handlers, pd = h.dormData, pr = h.dormResult; // 接回 / 送回宿舍后：小猫面板的按钮状态和结果文字也要跟着刷新
      h.dormData = (m) => { pd?.(m); this.refreshCatPanel(); };
      h.dormResult = (ok, msg, wake) => { pr?.(ok, msg, wake); if (this.dormCatAwait) { this.dormCatAwait = false; if (this.catUi?.isOpen) this.catUi.say(msg, ok); } };
    }
    this.net.handlers.dormIn = (x, y) => { this.registry.set('dormVisit', null); this.enterDorm(x, y); };
    this.net.handlers.dormVisit = (m) => { this.registry.set('dormVisit', m); this.enterDorm(this.player.x, this.player.y); }; // 去好友的宿舍做客：出来时回到现在站的地方
    this.registry.set('net', this.net); this.registry.set('dormUi', this.dormUi); this.registry.set('chat', this.chatUi); this.registry.set('editProfile', () => this.editProfile(true)); this.registry.set('tpUi', this.tpUi); // 宿舍（室内场景）要用
    this.battleUi.onOpen = () => this.closeCat(); // 对战开始：收起和小猫互动的小面板
    this.monUi.onData = () => { this.refreshCatPanel(); this.backpackUi.refreshTabs(); };
    { const prev = this.net.handlers.monResult; this.net.handlers.monResult = (ok, msg) => { prev?.(ok, msg); if (this.catUi?.isOpen) this.catUi.say(msg, ok); }; }
    this.hallUi = new HallPanel(this.net, { showPlayer: (uid) => this.socialUi.showPlayer(uid), selfUid: () => this.net.selfUid });
    this.tradeUi = new TradePanel(this.net, this.textures, {
      inv: () => this.backpackUi.inv, coins: () => this.coinBal,
      note: (title, text) => { this.hud.banner(title, text); this.net.system(`${title}：${text}`); },
      beep: (k) => sfx(k === 'done' ? 'achieve' : 'notify'),
    });
    this.socialUi.onTrade = (uid) => this.tradeUi.invite(uid);
    this.socialUi.onHand = (uid) => this.net.handInvite(uid);
    this.socialUi.onDorm = (uid, kind) => (kind === 'invite' ? this.net.dormInvite(uid) : this.net.dormKnock(uid));
    this.codexUi = new CodexPanel(this.net, this.textures, { cats: () => ({ defs: allCats(this.wf.npcSpawns), aff: this.catAff, nicks: this.catNick, info: this.catInfo }), inv: () => this.backpackUi.inv, gear: () => { const g = resolveGear(this.backpackUi.inv, this.backpackUi.equip, fishData.env()); return { rod: g.rod?.id ?? '', bait: g.bait?.id ?? '' }; } });
    this.achUi = new AchievementPanel(this.net, {
      onNew: (ids) => { for (const id of ids) { const a = achDef(id); if (!a) continue; this.hud.banner('🏆 成就达成', a.name); this.net.system(`🏆 成就达成：${a.name}`); sfx('achieve'); } },
      onCount: (n) => this.profileUi.setAch(n, ACH_TOTAL),
    });
    this.questUi = new QuestPanel(this.net, {
      onDone: (ids) => { for (const id of ids) { const q = questDef(id); if (q) { this.hud.banner('📋 任务完成', q.name); this.net.system(`📋 任务完成：${q.name}`); sfx('catch'); } } },
    });
    this.calUi = new CalendarPanel({ now: () => Date.now() + this.clock.offset, wear: (c) => { if (this.net.status === 'online') this.net.fzSet(c); else this.hud.banner('离线中', '连上服务器才能换节日装扮'); } });
    this.adminUi = new AdminPanel(this.net, this.textures, { openMap: () => { if (!this.hud.mapOpen) this.hud.toggleMap(); }, showCard: (uid) => this.socialUi.showPlayer(uid), openPlaceThread: (id) => this.placeUi.openThread(id), placeOpen: () => this.placeUi.isOpen || lightboxOpen() });
    // 管理员：大地图上点哪里就传送到哪里（服务器会再检查是不是管理员，并把落点挪到能站的地方）
    this.net.onAdmin((ok) => this.hud.setMapPicker(ok ? (tx, ty) => { this.net.adm({ op: 'tp', x: tx * TILE, y: ty * TILE }); if (this.hud.mapOpen) this.hud.toggleMap(); } : null));
    this.settingsUi = new SettingsPanel(this.net, this.chatUi, { // 声音 / 聊天频道 / 沉浸模式 / 全屏 / 小地图 / 账号与备份 / 关于 都在「设置」里
      miniMap: { on: () => this.hud.miniMapOn, set: (on) => this.hud.setMiniMap(on) },
      card: () => this.profileUi.open(), editProfile: () => this.editProfile(), backup: () => this.backupUi.open('show'), achievements: () => this.achUi.open(), titles: () => this.titleUi.open(),
    });
    mountWatermark();
    this.setupAudio();
    this.emoteUi = new EmotePanel((id) => this.doEmote(id));
    this.registry.set('emoteUi', this.emoteUi); // 宿舍（室内场景）里按 X 也能打开
    this.photo = new PhotoMode({
      enter: () => { this.input.keyboard!.resetKeys(); this.cameras.main.stopFollow(); },
      exit: () => { this.cameras.main.startFollow(this.player.sprite, true, 0.14, 0.14); Character.hideTags = false; },
      shoot: () => this.takePhoto(),
      zoom: (d) => this.changeZoom(d),
      tags: (hidden) => { Character.hideTags = hidden; },
    });
    this.titleUi = new TitlePanel(this.net);
    this.codexUi.attach('ach', '成就', this.achUi); this.codexUi.attach('titles', '称号', this.titleUi); // 成就、称号并入图鉴（J 直达成就页）
    this.net.onAdmin((ok) => this.titleUi.setAdmin(ok));
    this.catUi = new CatPanel({
      pet: () => this.catAction('pet'), feed: (item, fishId) => this.catAction('feed', item, fishId), close: () => this.closeCat(),
      follow: (on) => { const c = this.catUi.current; if (c) this.net.catFollowCmd(c.id, on); },
      nick: (name) => { const c = this.catUi.current; if (c) this.net.catNick(c.id, name); },
      hug: () => { const c = this.catUi.current; if (c) this.net.catHug(c.id); },
      tame: () => { const c = this.catUi.current; if (c) this.net.catTame(c.id); },
      duel: () => { const c = this.catUi.current; if (c) this.net.catBattle(c.id); },
      dorm: (on) => { const c = this.catUi.current; if (c) { this.dormCatAwait = true; this.net.dormCat(c.id, on); } },
    }, this.textures);
    { // 养在宿舍的小猫：宿舍场景用这座"桥"拿猫的资料 / 好感度、打开同一个小猫面板（宿舍里的猫是另一只 Cat 实体，数据都在这里）
      const bridge: CatBridge = {
        def: (id) => this.cats[id]?.def, aff: (id) => this.catAff[id] ?? 0, nick: (id) => this.catNick[id],
        open: (id) => { const c = this.cats[id]; if (!c) return; this.catUi.open(c.def); this.hud.hint(null); this.refreshCatPanel(); },
        panel: () => ({ isOpen: this.catUi.isOpen, id: this.catUi.current?.id }),
      };
      this.registry.set('catBridge', bridge);
    }
    this.net.handlers.chatHistory = (items) => this.chatUi.addHistory(items);
    this.net.handlers.chatRecall = (mids) => { this.chatUi.recall(mids); this.adminUi?.onRecall(); };
    // 点场景里的玩家 → 资料卡（加好友 / 私聊）。点在界面上的不会到这里
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => { if (!this.anyOverlay()) this.pickPlayerAt(ptr.worldX, ptr.worldY); });
    // 手机菜单里的地图 / 学生证（电脑上用 M / C 键和左上角头像）
    ui.add({ id: 'held', label: '手持物', key: 'V', desktop: false, run: () => this.cycleHeld() });
    ui.add({ id: 'map', label: '地图', desktop: false, run: () => this.hud.toggleMap() });
    ui.add({ id: 'card', label: '学生证', desktop: false, run: () => this.profileUi.toggle() });
    ui.guard = (a) => (fishingBlocksUi(this.fishLockState(), a.id) ? FISHING_BLOCK_MSG : null); // 钓鱼中：会打断钓鱼的菜单入口不响应（背包、地图、声音等仍可用）
    ui.onBlocked = () => this.fishBlocked();
    mountSideButtons();
    mountImmersive(); // 沉浸模式：藏起所有界面，只剩画面（菜单「沉浸模式」/ Z / 右上角 ⤢）
    this.registerEsc();
    this.net.onMessage((m) => {
      if (m.kind !== 'chat') return;
      const style = this.chatUi.bubbleOf(m); if (!style) return; // 静音 / 关闭的频道不冒气泡
      (this.registry.get('roomSay') as ((pid: number, text: string) => void) | null | undefined)?.(m.pid as number, m.text); // 人在宿舍里时，话冒泡在宿舍里的人头上
      if (m.pid !== undefined && m.pid === this.net.selfId) this.player.say(m.text, undefined, style);
      else if (m.pid !== undefined) this.remotes.get(m.pid)?.say(m.text, undefined, style);
      else if (m.from === this.profileUi.profile.name) this.player.say(m.text, undefined, style); // 离线回显
    });
    const h = this.net.handlers;
    h.welcome = (_id, x, y) => {
      this.monUi.refresh();   // 连上（或重连）后取一次精灵数据，菜单上的红点要靠它
      if (this.heldId) this.net.held(this.heldId);   // 重连后把手里的东西再告诉服务器
      this.player.setRiding(false); this.player.setSitting(false); this.player.setFishing(false); this.fishPhase = 'idle'; this.fightUi.close(); this.paxPid = 0; this.player.setPassenger(false); this.holdPid = 0; this.player.led = false; this.handPairs = []; // 新会话从"没骑车、没坐着"开始（服务器也是这么认为的）
      this.profileUi.setUid(this.net.selfUid); this.player.x = x; this.player.y = y; this.lastSent = { x: -1, y: -1, flags: -1 }; this.cameras.main.centerOn(x, y);
      try { if (!localStorage.getItem('pixelcampus.backupHint')) { localStorage.setItem('pixelcampus.backupHint', '1'); this.net.system('💾 建议备份身份：点左上角头像 →「身份备份」，抄下备份码。清了浏览器数据或换设备，也能找回好友和背包。'); } } catch { /* 存储不可用：不提示 */ }
    };
    h.profileFix = (p) => { // 服务器说资料里有不适合的内容：换上服务器给的资料（昵称/学院/专业/签名）
      saveProfile(p); this.registry.set('profile', p); this.profileUi.set(p); this.player.setLook(p.look, p.app); this.player.setNameTag(p.name, '#ffe9a0');
    };
    h.friendOn = (_uid, name) => this.net.system(`🟢 您的好友 ${name} 上线了`); // 只有互为好友的才收到，不是公屏广播
    h.spawn = (id, uid, x, y, flags, p, ttl, held, fz, pose) => this.upsertRemote(id, uid, x, y, flags, p, ttl, held, fz, pose);
    h.held = (pid, hv) => this.remotes.get(pid)?.setHeld(hv);
    h.fz = (pid, c) => this.remotes.get(pid)?.setFz(c);
    h.fzState = (own, on, news, gift) => { // 自己的节日装扮：获得了哪些 / 戴着哪个
      festData.set(own, on); this.player.setFz(on);
      for (const c of news ?? []) { const f = festivalByCode(c); if (f) { this.hud.banner(`${f.icon} 获得节日装扮`, `${f.costume.name}（日历 · 节日里可以穿上）`); sfx('achieve'); } }
      for (const g of gift ?? []) this.net.system(`🎁 节日礼物：${itemDef(g.id)?.name ?? g.id} ×${g.n}`);
    };
    h.titles = (own, sel, fresh) => {
      this.titleUi.set(own, sel); this.profileUi.setTitle(sel);
      const t = titleDef(sel); this.player.setTitle(t ? { name: t.name, color: t.color } : undefined);
      for (const id of fresh ?? []) { const d = titleDef(id); if (d) { this.hud.banner('🎖 获得称号', d.name); this.net.system(`🎖 获得称号：${d.name}（学生证 →「称号」可以佩戴）`); sfx('title'); } }
    };
    h.despawn = (id) => { this.remotes.get(id)?.destroy(); this.remotes.delete(id); };
    h.snapshot = (entries, now) => { for (const e of entries) this.remotes.get(e.id)?.push(e.x, e.y, e.flags, now); };
    h.correct = (x, y) => { const far = Math.hypot(this.player.x - x, this.player.y - y) > 240; this.player.x = x; this.player.y = y; this.player.halt(); this.lastSent = { x: -1, y: -1, flags: -1 }; if (far) this.cameras.main.centerOn(x, y); }; // 被服务器"传送"（比如校园跑接受邀请）：离得远就直接把镜头拉过去
    h.sitResult = (ok, msg) => { if (!ok) { this.player.setSitting(false); this.hud.banner('🪑 长椅', msg ?? '现在不能坐下'); } };
    h.emote = (pid, e) => { const d = emoteDef(e); if (!d) return; if (pid === this.net.selfId) { this.player.emote(d); sfx('emote'); } else this.remotes.get(pid)?.emote(d); };
    h.emoteEnd = (pid) => { if (pid === this.net.selfId) this.player.endPose(); else this.remotes.get(pid)?.endPose(); };
    h.rideResult = (ok, msg) => { if (!ok) { this.player.setRiding(false); this.hud.banner('🚲 共享单车', msg ?? '现在不能骑车'); } };
    h.cats = (aff, beds, info, gifts) => {
      this.catAff = aff; if (beds) { this.catBeds = new Set(beds); for (const c of this.cats) c.setBed(this.catBeds.has(c.def.id)); }
      this.catInfo = info ?? {}; if (gifts) this.catGifts = gifts;
      this.refreshCatPanel(); this.codexUi.refresh();
    };
    h.wallPending = (n) => { this.hud.banner('📝 校园墙', `有新帖等待审核（共 ${n} 条）`); sfx('notify'); };
    h.coins = (n, gain) => {
      this.coinBal = n; this.hud.setCoins(n); this.shopUi.setCoins(n);
      if (gain) { this.hud.banner('🪙 校园币', `+${gain}`); sfx('pickup'); }
    };
    h.binResult = (m) => {
      if (!m.ok) { this.hud.banner('🗑 垃圾桶', m.msg); sfx('lock'); return; }
      if (m.treasure) { this.hud.banner('🗑 垃圾桶里居然有宝贝！', m.msg); this.net.system(`🗑 ${m.msg}`); sfx('achieve'); }
      else { this.hud.banner('🗑 翻垃圾桶', `${m.msg}${m.left !== undefined ? `（今天还能翻 ${m.left} 次）` : ''}`); sfx('pickup'); }
      if (m.left !== undefined) this.binLeft = m.left;
    };
    h.catNicks = (nicks) => { this.catNick = nicks; for (const c of this.cats) c.nick = nicks[c.def.id]; this.refreshCatPanel(); this.codexUi.refresh(); };
    h.catFollows = (map) => { this.catWith = new Map(Object.entries(map).map(([k, v]) => [Number(k), v])); this.refreshCatPanel(); };
    h.catFollow = (id, pid) => { if (pid) this.catWith.set(id, pid); else this.catWith.delete(id); this.refreshCatPanel(); };
    h.birdResult = (m) => { if (m.ok) { this.lakeBirds?.byId(m.id)?.feed(); sfx('feed'); } this.hud.banner(m.ok ? '🦆 喂水禽' : '🦆 水禽', m.msg); };
    h.catMsg = (ok, msg) => { if (this.catUi.isOpen) this.catUi.say(msg, ok); else this.hud.banner('🐱 小猫', msg); };
    h.catResult = (id, kind, r) => {
      this.catUi.result(id, kind, r);                                  // 记进这只猫的操作记录（当前这只猫同时更新 msg 区）
      if (this.catUi.current?.id === id && r.ok) this.catUi.started(kind);
      if (!r.ok) return;
      const c = this.cats[id];
      if (kind === 'pet') { c?.pet(); sfx('pet'); }
      else if (kind === 'hug') { c?.hug(this.player.x, this.player.y); sfx('pet'); }
      else { c?.eat(); sfx('feed'); }
      if (r.loved) { c?.loved(); sfx('catch'); }                       // 喂到最爱：一串爱心
      if (r.leveled) { c?.leveledUp(); sfx('achieve'); }               // 升档：更多爱心
      if (r.gift) c?.giftMeow();                                       // 有回礼：喵一声（物品由背包的"获得物品"横幅提示）
      (this.registry.get('dormCatFx') as DormCatFx | undefined)?.(id, kind, r); // 在宿舍里互动的话，宿舍里那只猫也要有反应
    };
    const onInv = h.inv; h.inv = (items, gain) => { onInv?.(items, gain); this.shopUi.setInv(items); this.refreshCatPanel(); };
    h.disconnected = () => { for (const r of this.remotes.values()) r.destroy(); this.remotes.clear(); this.player.setFishing(false); this.fishPhase = 'idle'; this.fightUi.close(); this.clearDropped(); };
    h.fishState = (m) => this.onFishState(m);
    h.time = (now) => this.clock.sync(now); // 校准到服务器时间：全服的时间、昼夜都一样
    h.paxResult = (ok, pid, msg) => {
      if (ok && pid > 0) { this.paxPid = pid; this.player.setPassenger(true); this.hud.banner('🚲 坐上了队友的车', '按 E 下车'); sfx('bell'); }
      else { this.paxPid = 0; this.player.setPassenger(false); if (msg) this.hud.banner('🚲 同骑单车', msg); if (ok) sfx('lock'); }
    };
    h.bikeDrops = (list) => { this.clearDropped(); for (const b of list) this.addDropped(b); };
    h.bikeDrop = (b) => this.addDropped(b);
    h.bikeGone = (id) => { const d = this.droppedBikes.get(id); if (d) { d.img.destroy(); this.droppedBikes.delete(id); } };
    h.catNames = (names) => { for (const [id, n] of Object.entries(names)) { const c = this.cats[Number(id)]; if (c) c.def.name = n; } this.refreshCatPanel(); }; // 管理员给小猫改了名
    if (isTouchDevice()) {
      this.net.system('欢迎来到河北工程大学！左半屏按住拖动 = 走路（推到边缘奔跑），点右下角「互动」「聊天」「证」「地图」。');
    } else {
      this.net.system('欢迎来到河北工程大学！按 Enter 说话，Esc 退出输入。');
      this.net.system('WASD 移动 · Shift 奔跑 · E 互动 · I 背包 · R 精灵 · Y 传送 · Q 任务 · X 表情 · V 手持物 · P 拍照 · Z 沉浸 · C 学生证 · M 地图 · +/- 缩放');
    }
    // ?offline 可关掉联机（开发调试：传送等操作会被服务器校验拉回）
    if (!new URLSearchParams(location.search).has('offline')) this.net.connect();
    else this.net.system('离线调试模式（?offline）：没有连接服务器。');
  }

  /**
   * 全局 Esc：把所有会"调出来"的面板登记进 escStack，Esc 一次关最上面（最后打开）的一个（见 ui/escstack.ts）。
   * 新面板怎么接入：有 isOpen（getter）和 close() 就 `reg(面板)`；Esc 要特殊处理（先关子页 / 取消）就再给它一个 escape()。
   * 不在这里的（对话框、拉鱼取消、装修模式、战斗、建角色）由各自原有的 Esc 逻辑处理。
   */
  private registerEsc() {
    const reg = (t: EscTarget) => escStack.register(t);
    for (const p of [this.profileUi, this.boardUi, this.shopUi, this.wallUi, this.placeUi, this.noticeUi, this.socialUi, this.backpackUi, this.boxUi, this.codexUi, this.backupUi, this.questUi, this.calUi, this.runUi, this.partyUi, this.adminUi, this.settingsUi, this.photo, this.hallUi, this.tpUi, this.worldUi, this.emoteUi, this.reportUi, this.dormUi]) reg(p as EscTarget);
    const hud = this.hud, adm = this.adminUi, trade = this.tradeUi, cat = this.catUi, card = this.fishCard;
    reg({ get isOpen() { return lightboxOpen(); }, close: () => { closeLightbox(); } });                      // 留言图片的大图（灯箱）
    reg({ get isOpen() { return hud.mapOpen; }, close: () => { if (hud.mapOpen) hud.toggleMap(); } });         // 大地图
    reg({ get isOpen() { return adm.userMenuOpen; }, close: () => adm.closeUserMenu() });                    // 管理员点人弹出的小菜单
    reg({ get isOpen() { return trade.isOpen; }, close: () => trade.escape() });                             // 交易：Esc = 取消
    reg({ get isOpen() { return cat.isOpen; }, close: () => this.closeCat() });                              // 小猫面板：要走 closeCat（猫恢复自由、人站起来）
    reg({ get isOpen() { return card.isOpen && this.fishPhase !== 'fight'; }, close: () => card.hide() });    // 钓到鱼的小卡片（拉鱼时 Esc 仍是放弃，不被它抢走）
    installEscStack();
  }

  /** 有没有面板/弹窗盖在游戏上（有的话点击不该穿透到场景） */
  private anyOverlay() { return this.profileUi.isOpen || this.editing || this.boardUi.isOpen || this.shopUi.isOpen || this.wallUi.isOpen || this.placeUi.isOpen || this.noticeUi.isOpen || this.socialUi.isOpen || this.backpackUi.isOpen || this.boxUi.isOpen || this.codexUi.isOpen || this.achUi.isOpen || this.backupUi.isOpen || this.catUi.isOpen || this.titleUi.isOpen || this.questUi.isOpen || this.calUi.isOpen || this.runUi.isOpen || this.partyUi.isOpen || this.adminUi.isOpen || this.settingsUi.isOpen || this.photo.isOpen || this.hallUi.isOpen || this.monUi.isOpen || this.tpUi.isOpen || this.worldUi.isOpen || this.dormUi.anyOpen || this.battleUi.isOpen || this.tradeUi.isOpen || this.hud.dialogOpen; }

  /** 点中的位置（世界坐标）有没有别的玩家：有就弹出资料卡；多个重叠时取最靠前（y 最大）的 */
  private pickPlayerAt(wx: number, wy: number) {
    let hit: RemotePlayer | null = null;
    for (const r of this.remotes.values()) if (Math.abs(wx - r.x) <= 14 && wy >= r.y - 44 && wy <= r.y + 4 && (!hit || r.y > hit.y)) hit = r;
    if (hit) this.socialUi.showPlayer(hit.uid, hit.info);
  }

  /** 我现在拿的手持物（0 = 没拿）：V 键 / 菜单「手持物」依次切换，联机时同步给看得见我的人 */
  private heldId = 0;
  private cycleHeld() {
    this.heldId = (this.heldId + 1) % (HELD_MAX + 1);
    this.player.setHeld(this.heldId);
    if (this.net.status === 'online') this.net.held(this.heldId);
    const d = heldDef(this.heldId);
    this.hud.banner(d ? `${d.icon} 手里拿着：${d.name}` : '🖐 放下了手里的东西', '再按 V 换下一样');
  }
  private upsertRemote(id: number, uid: number, x: number, y: number, flags: number, p: PublicProfile, ttl?: string, held?: number, fz?: number, pose?: number) {
    let r = this.remotes.get(id);
    if (r) r.applyInfo(p);
    else { r = new RemotePlayer(this, id, uid, p, x, y, flags); this.remotes.set(id, r); }
    r.applyTitle(ttl); r.setHeld(held ?? 0); r.setFz(fz ?? 0); r.setHeldPose(emoteDef(pose));   // 重新进视野的人还躺着 / 坐着，就直接是那个姿势
  }

  /** 每帧：上报自己的位置（变化才发，最高 15 Hz），并让远程玩家按插值移动 */
  private updateNet(dt: number, run: boolean) {
    const hz = this.player.riding ? 30 : NET.REPORT_HZ; // 骑车时上报更密：两次上报之间走得不远，服务器的穿墙检查才不会误判
    this.sendAcc += dt;
    if (this.paxPid || this.holdPid) this.sendAcc = 0; // 坐在队友车上 / 被好友牵着：位置由服务器定，不上报
    else if (this.sendAcc >= 1 / hz) {
      const flags = packFlags(this.player.facing, this.player.moving, run, this.player.riding, this.player.sitting);
      const p = this.player, s = this.lastSent;
      if (Math.abs(p.x - s.x) > 0.01 || Math.abs(p.y - s.y) > 0.01 || flags !== s.flags) {
        this.net.sendPos(p.x, p.y, flags); this.lastSent = { x: p.x, y: p.y, flags }; this.sendAcc = 0;
      } else this.sendAcc = 1 / hz;
    }
    const now = performance.now();
    for (const r of this.remotes.values()) r.tick(now);
  }

  /** 大地图上的建筑名：除了宿舍楼（有"一社区"等整片地名）、门卫室这类小东西之外，每栋有名字的楼都标；同名的只留最大的一栋；校园商店/校园墙也标上 */
  private mapLabels() {
    const skip = /(社区[A-Z]楼|门卫室|门岗|立柱|岗亭|配套用房|平台|看台|值班室)$/;
    const best = new Map<string, { name: string; x: number; y: number; area: number }>();
    for (const b of this.wf.buildings) {
      if (!b.name || skip.test(b.name)) continue;
      const area = b.bbox.w * b.bbox.h, cur = best.get(b.name);
      if (!cur || area > cur.area) best.set(b.name, { name: b.name, x: b.bbox.x + b.bbox.w / 2, y: b.bbox.y + b.bbox.h / 2, area });
    }
    for (const b of PLAZA_BUILDINGS) best.set(b.name, { name: b.name, x: b.x, y: b.y - b.d / 2, area: b.w * b.d });
    return [...best.values()];
  }

  /** 手机：虚拟摇杆 + 按钮。触屏设备一开始就启用；其他设备第一次触屏时再启用（平板的桌面模式等）。 */
  private setupTouch() {
    const on = () => {
      if (this.touchUi) return;
      this.touchUi = new TouchControls({
        act: () => this.pressTouch(),
        chat: () => this.chatUi.toggle(),
        zoom: (d) => this.changeZoom(d),
        tap: (cx, cy) => { if (this.anyOverlay()) return; const r = this.game.canvas.getBoundingClientRect(); const w = this.cameras.main.getWorldPoint(cx - r.left, cy - r.top); this.pickPlayerAt(w.x, w.y); },
      });
      mountOrientation();
      this.touchUi.setChatBadge(this.chatUnread);
      const tap = () => this.pressTouch();
      document.getElementById('hint')?.addEventListener('pointerdown', tap);   // 点提示 = 按 E
      document.getElementById('dialog')?.addEventListener('pointerdown', tap); // 点对话框 = 翻页/关闭
    };
    if (isTouchDevice()) on();
    else window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') on(); });
  }
  /** 触屏的"互动"/点提示/点对话框：本场景当作按了 E；同时记在 registry 里，室内场景（InteriorScene）也读它——室内没有自己的触控，摇杆和互动键是同一套 DOM 控件 */
  private pressTouch() { this.touchPress = true; this.registry.set('touchPress', true); }

  private editProfile(wardrobe = false) {
    this.editing = true; this.registry.set('editorOpen', true);
    this.input.keyboard!.resetKeys();
    new CreateCharacter(this.textures, {
      initial: this.profileUi.profile, wardrobe,
      onCancel: () => { this.editing = false; this.registry.set('editorOpen', false); },
      onDone: (p) => {
        this.editing = false; this.registry.set('editorOpen', false);
        saveProfile(p);
        this.registry.set('profile', p);
        this.profileUi.set(p);
        this.net.updateProfile(p);
        this.player.setLook(p.look, p.app);
        this.player.setNameTag(p.name, '#ffe9a0');
      },
    }).open();
  }

  // ------------------------------------------------------------ 流式构建
  private glowActive = new Set<Phaser.GameObjects.Image>();
  private bld = new Map<string, { alpha: number; rects: { l: number; r: number; t: number; base: number }[]; imgs: Set<Phaser.GameObjects.Image> }>();

  private tickStream() {
    const c = this.cameras.main, p = this.player;
    // 骑得快时往前"预读"：把加载范围向行进方向挪（最多 0.8 秒的路程），地面块来得及加载，不会骑进空白里
    const ax = p ? Phaser.Math.Clamp(p.vx * 0.8, -640, 640) : 0, ay = p ? Phaser.Math.Clamp(p.vy * 0.8, -640, 640) : 0;
    this.stream.update(c.midPoint.x + ax, c.midPoint.y + ay, c.width / c.zoom, c.height / c.zoom);
  }

  /** 把整个世界登记成"按视野创建/销毁"的条目：地面块、摆件、建筑翼体、文字牌、路灯光晕、旗帜 */
  private buildStream() {
    const { px } = this.wf.chunk;
    const waterSet = new Set(this.wf.water.chunks);
    const keys = this.wf.chunks ?? Array.from({ length: this.wf.chunk.cols * this.wf.chunk.rows }, (_, i) => `${i % this.wf.chunk.cols}_${Math.floor(i / this.wf.chunk.cols)}`);
    for (const k of keys) { const [cx, cy] = k.split('_').map(Number); this.stream.add({ x: cx * px, y: cy * px, w: px, h: px, make: () => this.makeChunk(k, cx * px, cy * px, waterSet.has(k)) }); }

    for (const o of this.wf.objects) {
      const fr = this.textures.getFrame('props', o.k);
      this.stream.add({ x: o.x - o.ax, y: o.y - o.ay, w: fr.width, h: fr.height, make: () => this.add.image(o.x, o.y, this.propsKey, o.k).setOrigin(o.ax / fr.width, o.ay / fr.height).setDepth(o.y) });
    }
    for (const a of this.wf.anims ?? []) {
      const fr = this.textures.getFrame('props', a.frames[0]);
      this.stream.add({ x: a.x, y: a.y, w: fr.width, h: fr.height, make: () => {
        const im = this.add.image(a.x, a.y, this.propsKey, a.frames[0]).setOrigin(0).setDepth(a.depth); let i = 0;
        const ev = this.time.addEvent({ delay: a.ms, loop: true, callback: () => { i = (i + 1) % a.frames.length; im.setFrame(a.frames[i]); } });
        return { destroy: () => { ev.remove(); im.destroy(); } };
      } });
    }
    for (const b of this.wf.buildings) {
      const st = { alpha: 1, rects: [] as { l: number; r: number; t: number; base: number }[], imgs: new Set<Phaser.GameObjects.Image>() };
      this.bld.set(b.id, st);
      b.wings.forEach((w, i) => {
        const pg = w.pg ?? 0, tex = `buildings${pg}`;
        // 精灵尺寸优先取 world.json 里记的（这样图集页不用先下载）；老编译产物没有，才从已加载的图集里量
        const fw = w.w ?? this.textures.getFrame(tex, w.k).width, fh = w.h ?? this.textures.getFrame(tex, w.k).height;
        st.rects.push({ l: w.x, r: w.x + fw, t: w.y, base: w.base });
        this.stream.add({ x: w.x, y: w.y, w: fw, h: fh, make: () => {
          let im: Phaser.GameObjects.Image | undefined, dead = false;
          this.withBuildingPage(pg, () => {
            if (dead) return;
            im = this.add.image(w.x, w.y, tex, w.k).setOrigin(0).setDepth(w.base + i * 0.01).setAlpha(st.alpha); st.imgs.add(im);
          });
          return { destroy: () => { dead = true; if (im) { st.imgs.delete(im); im.destroy(); } } };
        } });
      });
    }
    for (const l of this.wf.labels ?? []) {
      this.stream.add({ x: l.x * TILE - 120, y: l.y * TILE - 20, w: 240, h: 40, make: () => this.makeLabel(l) });
    }
    for (const [x, y, h] of this.wf.lamps) {
      this.stream.add({ x: x * TILE - 48, y: y * TILE - (h ?? 26) - 48, w: 96, h: 96, make: () => {
        const gl = this.add.image(x * TILE, y * TILE - (h ?? 26), 'glow').setDepth(1e6 + 1).setBlendMode(Phaser.BlendModes.ADD).setScale(1.5).setAlpha(this.clock.nightness * 0.9);
        this.glowActive.add(gl);
        return { destroy: () => { this.glowActive.delete(gl); gl.destroy(); } };
      } });
    }
    // 水面动画：只翻当前存在的水块
    this.time.addEvent({ delay: 340, loop: true, callback: () => {
      this.waterFrame = (this.waterFrame + 1) % this.wf.water.frames;
      for (const arr of this.waterActive.values()) arr.forEach((img, i) => img.setVisible(this.waterFrame === i + 1));
    } });
  }

  private bldWait = new Map<number, (() => void)[]>();
  /** 建筑图集按页按需加载：页已在内存就立刻执行，否则加载这一页，到了再执行（同一页的请求合并，失败了下次再试） */
  private withBuildingPage(pg: number, cb: () => void) {
    const key = `buildings${pg}`;
    if (this.textures.exists(key)) { cb(); return; }
    const waiting = this.bldWait.get(pg);
    if (waiting) { waiting.push(cb); return; }
    this.bldWait.set(pg, [cb]);
    this.load.once(`filecomplete-atlasjson-${key}`, () => { const l = this.bldWait.get(pg) ?? []; this.bldWait.delete(pg); l.forEach((f) => f()); });
    this.load.on('loaderror', (f: Phaser.Loader.File) => { if (f.key === key) this.bldWait.delete(pg); });   // 失败：清掉登记，下次视野再覆盖到时重试
    this.load.atlas(key, `${WD}/atlas-buildings-${pg}.webp`, `${WD}/atlas-buildings-${pg}.json`);
    if (!this.load.isLoading()) this.load.start();
  }

  /** 地面块：纹理不在内存就异步加载，销毁时释放纹理 */
  private makeChunk(key: string, x: number, y: number, water: boolean): Destroyable {
    const texs = [`ground_${key}`, ...(water ? Array.from({ length: this.wf.water.frames - 1 }, (_, i) => `water${i + 1}_${key}`) : [])];
    const parts: Phaser.GameObjects.Image[] = []; let dead = false;
    const build = () => {
      if (dead) { texs.forEach((t) => this.textures.exists(t) && this.textures.remove(t)); return; }
      parts.push(this.add.image(x, y, texs[0]).setOrigin(0).setDepth(-100000));
      if (water) { const arr = texs.slice(1).map((t) => this.add.image(x, y, t).setOrigin(0).setDepth(-99999).setVisible(false)); parts.push(...arr); this.waterActive.set(key, arr); }
    };
    const need = texs.filter((t) => !this.textures.exists(t));
    if (!need.length) build();
    else {
      let left = need.length;
      for (const t of need) {
        const url = t.startsWith('ground_') ? `${WD}/ground/${this.season}/c_${key}.webp` : `${WD}/ground/w${t.charAt(5)}_${key}.webp`;
        this.load.once(`filecomplete-image-${t}`, () => { if (--left === 0) build(); });
        this.load.image(t, url);
      }
      if (!this.load.isLoading()) this.load.start();
    }
    return { destroy: () => { dead = true; parts.forEach((p) => p.destroy()); this.waterActive.delete(key); texs.forEach((t) => this.textures.exists(t) && this.textures.remove(t)); } };
  }

  /** 世界内文字牌（校名/大门/门头招牌） */
  private makeLabel(l: NonNullable<WorldFile['labels']>[number]): Destroyable {
    const objs: Phaser.GameObjects.GameObject[] = [];
    const ia = l.id ? this.wf.interacts?.find((i) => i.id === l.id) : undefined;
    const st = l.id ? (this.egg.get(l.id) ?? this.egg.set(l.id, { step: 0 }).get(l.id)!) : undefined;
    const t = this.add.text(l.x * TILE, l.y * TILE, st && ia && st.step > 0 ? ia.texts[st.step - 1] : l.text, { fontFamily: 'ArkPixel', fontSize: `${l.size}px`, color: l.color ?? '#f4efd8', stroke: l.stroke ?? '#0e2230', strokeThickness: l.plate ? 0 : 2 })
      .setOrigin(0.5).setDepth(l.y * TILE + 61 + (l.ds ?? 0));
    objs.push(t);
    if (st) st.text = t;
    if (l.plate) {
      const w = Math.round(t.width) + 8, h = Math.round(t.height) + 4;
      objs.push(this.add.rectangle(Math.round(l.x * TILE), Math.round(l.y * TILE), w + 2, h + 2, 0xe4e0ca).setDepth(l.y * TILE + 59 + (l.ds ?? 0)));
      objs.push(this.add.rectangle(Math.round(l.x * TILE), Math.round(l.y * TILE), w, h, 0x2f4f66).setDepth(l.y * TILE + 60 + (l.ds ?? 0)));
    }
    return { destroy: () => { objs.forEach((o) => o.destroy()); if (st) st.text = undefined; } };
  }

  /** 玩家脚点落在某翼体精灵范围内、且位于其南缘之北（被楼挡住）→ 整栋楼淡出 */
  private updateBuildingFade() {
    const px = this.player.x, py = this.player.y;
    for (const f of this.bld.values()) {
      if (f.imgs.size === 0) continue;
      let behind = false;
      for (const r of f.rects) if (px >= r.l && px <= r.r && py >= r.t + 10 && py < r.base - 1) { behind = true; break; }
      const target = behind ? 0.32 : 1;
      if (Math.abs(f.alpha - target) < 0.01) { f.alpha = target; continue; }
      f.alpha += (target - f.alpha) * 0.22;
      for (const im of f.imgs) im.setAlpha(f.alpha);
    }
  }

  private buildLighting() {
    // 昼夜：整张世界的 MULTIPLY 叠色
    this.tintRect = this.add.rectangle(0, 0, this.world.pxW, this.world.pxH, 0xffffff).setOrigin(0).setDepth(1e6).setBlendMode(Phaser.BlendModes.MULTIPLY);
    // 路灯光晕贴图
    const tex = this.textures.createCanvas('glow', 64, 64)!;
    const g = tex.getContext().createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,236,170,0.95)'); g.addColorStop(0.45, 'rgba(255,214,120,0.35)'); g.addColorStop(1, 'rgba(255,200,100,0)');
    tex.getContext().fillStyle = g; tex.getContext().fillRect(0, 0, 64, 64); tex.refresh();
  }

  /** 默认档位：让横向大约看到 26~30 格；用户用 +/- 在此基础上调整 */
  private autoZoomIndex() {
    const target = this.scale.width / (28 * TILE);
    let best = 0;
    ZOOMS.forEach((z, i) => { if (Math.abs(z - target) < Math.abs(ZOOMS[best] - target)) best = i; });
    return best;
  }
  private userZoomOffset = 0;
  private applyZoom() {
    this.zoomIndex = Phaser.Math.Clamp(this.autoZoomIndex() + this.userZoomOffset, 0, ZOOMS.length - 1);
    this.cameras.main.setZoom(ZOOMS[this.zoomIndex]);
  }
  private changeZoom(d: number) {
    const n = Phaser.Math.Clamp(this.zoomIndex + d, 0, ZOOMS.length - 1);
    if (n !== this.zoomIndex) { this.userZoomOffset += d; this.applyZoom(); }
  }

  private static readonly CHAT = [
    '早八真的太难了……', '去图书馆怎么走？沿着中轴线一直往北就是。', '精工湖边的垂柳春天最好看。', '食堂的红烧肉去晚就没了。',
    '今天的作业你写完了吗？', '听说东边的田径场晚上有人夜跑。', '南门的校石是新生合影的必去打卡点。', '银杏黄了的时候，中轴广场特别好看。',
    '我在找一教，是往西北边走吗？', '下课啦！先回宿舍还是去吃饭？',
  ];
  private spawnNpcs() {
    const pts = this.wf.npcSpawns.filter(([tx, ty]) => !inPlaza(tx, ty, 2)); // 图书馆广场留给商店和校园墙，不放行人
    const n = Math.min(Math.round(40 * Math.sqrt(pts.length / 160)) + ((this.wf.scale ?? 1) > 1 ? 60 : 0), pts.length);
    for (let i = 0; i < n; i++) {
      const [tx, ty] = pts[Math.floor(this.rand() * pts.length)];
      const look = Math.floor(this.rand() * (this.cache.json.get('charsMeta') as { count: number }).count);
      const l1 = WorldScene.CHAT[Math.floor(this.rand() * WorldScene.CHAT.length)];
      const l2 = WorldScene.CHAT[Math.floor(this.rand() * WorldScene.CHAT.length)];
      this.npcs.push(new Npc(this, tx * TILE, ty * TILE, look, '同学', [l1, l2], true, 'down'));
    }
  }
  /** 钓具老板：站在摊子右边（摊子是地图里的 fishStall 道具），不游走；没有摊子的世界不生成 */
  private spawnKeeper() {
    const o = this.wf.objects.find((x) => x.k === 'fishStall'); if (!o) return;
    const count = (this.cache.json.get('charsMeta') as { count: number }).count;
    const n = new Npc(this, o.x + 62, o.y - 3, KEEPER_LOOK % count, '钓具老板', ['来啦？钓鱼的人，装备和耐心一样要紧。'], false, 'down');
    this.keeper = n;
    const st = { fontFamily: 'ArkPixel, monospace', fontSize: '12px', color: '#ffe9a0', stroke: '#2e1a10', strokeThickness: 3 };
    this.keeperTag = this.add.text(n.x, n.y - 44, '钓具老板', st).setOrigin(0.5, 1).setDepth(n.y + 2000);
    this.keeperMark = this.add.text(n.x, n.y - 58, '！', { ...st, fontSize: '18px', color: '#ffd35a' }).setOrigin(0.5, 1).setDepth(n.y + 2001).setVisible(false);
  }
  /** 每帧：钓具老板静止 / 头顶的「！」在有可领的委托奖励时上下跳（奖励在「任务」面板的钓鱼页领） */
  private updateKeeper(dt: number, now: number) {
    const k = this.keeper; if (!k) return;
    k.update(dt, this.world, this.rand);
    const can = commClaimable(fishData.wq); // 有可领的委托奖励：头顶冒「！」（去「任务」面板的钓鱼页领）
    this.keeperMark?.setVisible(can).setY(k.y - 58 + Math.sin(now / 220) * 2);
  }
  /** 校园小猫：家和毛色、名字由 shared/cats 按固定种子从行人出生点里挑（服务器和所有玩家一致） */
  private spawnCats() {
    for (const d of allCats(this.wf.npcSpawns)) this.cats.push(new Cat(this, d));
    Cat.peers = this.cats;
  }

  /** 车架旁停几辆共享单车（按车架坐标确定，所有玩家看到的一样）；这些位置也是上车点 */
  private buildBikes() {
    const m = this.cache.json.get('bikesMeta') as { ax: number; ay: number };
    const fr = this.textures.getFrame('bikes', 'bike_parked_r');
    for (const o of this.wf.objects) {
      if (o.k !== 'bikeRack') continue;
      const h = Math.abs(Math.imul(Math.round(o.x), 73856093) ^ Math.imul(Math.round(o.y), 19349663)) % 10;
      const n = h < 4 ? 0 : h < 8 ? 1 : 2;
      for (let i = 0; i < n; i++) {
        const bx = o.x + (n === 2 ? (i ? 9 : -9) : 0), by = o.y + 7, flip = (h + i) % 2 === 1;
        this.bikeSpots.push({ x: bx, y: by });
        this.stream.add({ x: bx - m.ax, y: by - m.ay, w: fr.width, h: fr.height, make: () => this.add.image(bx, by, 'bikes', flip ? 'bike_parked_l' : 'bike_parked_r').setOrigin(m.ax / fr.width, m.ay / fr.height).setDepth(by) });
      }
    }
    for (const g of gateBikes()) { // 南门里侧整齐停放的 20 辆
      this.bikeSpots.push({ x: g.x, y: g.y });
      this.stream.add({ x: g.x - m.ax, y: g.y - m.ay, w: fr.width, h: fr.height, make: () => this.add.image(g.x, g.y, 'bikes', g.flip ? 'bike_parked_l' : 'bike_parked_r').setOrigin(m.ax / fr.width, m.ay / fr.height).setDepth(g.y) });
    }
  }

  /** 留在原地的单车：和停车架旁的车一样的画法，但由服务器按编号增删 */
  private addDropped(b: { id: number; x: number; y: number; flip: boolean }) {
    if (this.droppedBikes.has(b.id)) return;
    const m = this.cache.json.get('bikesMeta') as { ax: number; ay: number }, fr = this.textures.getFrame('bikes', 'bike_parked_r');
    const img = this.add.image(b.x, b.y, 'bikes', b.flip ? 'bike_parked_l' : 'bike_parked_r').setOrigin(m.ax / fr.width, m.ay / fr.height).setDepth(b.y);
    this.droppedBikes.set(b.id, { x: b.x, y: b.y, img });
  }
  private clearDropped() { for (const d of this.droppedBikes.values()) d.img.destroy(); this.droppedBikes.clear(); }

  private mount() {
    this.player.setRiding(true); this.net.ride(true); sfx('bell');
    this.hud.banner('🚲 共享单车', '扫码成功！方向键骑行，按 E 锁车');
  }
  private dismount() {
    this.player.setRiding(false); this.net.ride(false); sfx('lock');
    this.hud.banner('🚲 已锁车', '骑行结束，感谢使用');
  }

  // ------------------------------------------------------------ 小猫互动
  private openCat(c: Cat) {
    c.hold(true, this.player.x);
    { const dx = c.x - this.player.x, dy = c.y - this.player.y; if (!this.player.riding && !this.player.sitting) { this.player.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'); this.player.setCrouch(true); } }   // 面朝小猫蹲下
    this.catUi.open(c.def);
    this.hud.hint(null);
    this.refreshCatPanel();
    this.time.delayedCall(0, () => this.reframeForCatPanel());
    const root = document.querySelector('.cat-panel');
    if (root && !this.catRo) { this.catRo = new ResizeObserver(() => { if (this.catUi.isOpen) this.reframeForCatPanel(); }); this.catRo.observe(root); } // 换页签面板变高 / 变矮：镜头跟着重新取景
  }
  /** 猫面板打开时把镜头往面板另一侧挪一点，别让面板盖住人和猫（竖屏：面板在下方，画面往上挪；手机横屏面板靠右停靠，画面往左挪） */
  private reframeForCatPanel() {
    const cam = this.cameras.main, root = document.querySelector('.cat-panel') as HTMLElement | null;
    if (!this.catUi.isOpen || !root) { cam.setFollowOffset(0, 0); return; }
    const r = root.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight, z = cam.zoom || 1;
    if (r.left > vw * 0.4 && r.width < vw * 0.6) cam.setFollowOffset(-(r.width / 2) / z, 0);      // 靠右停靠
    else cam.setFollowOffset(0, -Math.max(0, vh / 2 + 60 - r.top) / z);                         // 在下方：把人推到面板上沿之上（再留 60 像素，猫在人的南边也看得到）
  }
  private closeCat() {
    const id = this.catUi.current?.id;
    this.catUi.close();
    this.cameras.main.setFollowOffset(0, 0);
    this.player.setCrouch(false);
    if (id !== undefined) this.cats[id]?.hold(false);
  }
  private refreshCatPanel() {
    const cat = this.catUi?.current; if (!cat) return;
    const inv = this.backpackUi.inv;
    const pid = this.catWith.get(cat.id);
    this.catUi.update(this.catAff[cat.id] ?? 0, inv.cat_food ?? 0, inv.cat_treat ?? 0, this.fishCount(), this.net.status === 'online', { info: this.catInfo[cat.id], fish: this.fishList(), bed: inv.cat_bed ?? 0, hasBed: this.catBeds.has(cat.id), following: pid === this.net.selfId && pid !== undefined, withOther: pid !== undefined && pid !== this.net.selfId, nick: this.catNick[cat.id], tamed: this.monUi.tamed.includes(cat.id), hasCatSpirit: this.monUi.hasCatSpirit, dorm: this.dormCatState(cat.id, pid === this.net.selfId && pid !== undefined) });
  }
  /** 这只猫和"养在宿舍"的关系：已经住着 / 能不能接回来（不能时给原因，面板里显示在按钮的提示上） */
  private dormCatState(id: number, following: boolean): { inDorm: boolean; why?: string } {
    const d = this.dormUi?.data, dc = d?.dc ?? [];
    if (dc.includes(id)) return { inDorm: true };
    if (!d?.b) return { inDorm: false, why: '还没选宿舍楼：先在「宿舍」里选你住的楼栋' };
    if (following) return { inDorm: false, why: '它正跟着你：先让它回家，再接回宿舍' };
    const cap = dormCatCap(d.rm ?? 0), beds = (d.lay ?? defaultLay(d.rm ?? 0)).filter((p) => p.d === 'dc_catbed').length;
    if (dc.length >= cap) return { inDorm: false, why: `这间宿舍最多养 ${cap} 只猫（扩建后能养更多）` };
    if (beds <= dc.length) return { inDorm: false, why: `宿舍里要先摆一个空着的「宿舍猫窝」（现在 ${beds} 个，已经住了 ${dc.length} 只）：商店买、装修里摆进去` };
    return { inDorm: false };
  }
  /** 背包里能喂猫的鱼（真鱼，不含杂物）总数 */
  private fishCount() { return Object.entries(this.backpackUi.inv).reduce((n, [id, c]) => n + (isFish(id) ? c : 0), 0); }
  /** 喂鱼时先拿最常见的（稀有的留着）：FISH 目录按常见到稀有排好 */
  private pickFish(): string | undefined { return FISH.find((f) => isFish(f.id) && (this.backpackUi.inv[f.id] ?? 0) > 0)?.id; }
  /** 背包里的真鱼（喂鱼选择列表用），按稀有度从常见到稀有排 */
  private fishList(): { id: string; name: string; n: number; rarity: string }[] {
    const inv = this.backpackUi.inv, ord = (r: string) => { const i = (RARITY_ORDER as readonly string[]).indexOf(r); return i < 0 ? 99 : i; };
    return REAL_FISH.filter((f) => (inv[f.id] ?? 0) > 0).map((f) => ({ id: f.id, name: f.name, n: inv[f.id], rarity: f.rarity })).sort((a, b) => ord(a.rarity) - ord(b.rarity));
  }
  private catAction(kind: 'pet' | 'feed', which?: 'cat_food' | 'cat_treat' | 'fish' | 'cat_bed', fishId?: string) {
    const item = which === 'fish' ? (fishId && isFish(fishId) && (this.backpackUi.inv[fishId] ?? 0) > 0 ? fishId : this.pickFish()) : which;
    const cat = this.catUi.current; if (!cat) return;
    if (this.net.status !== 'online') { // 单人模式：摸摸只有动画，不记好感，也不能喂
      if (kind === 'pet') { this.cats[cat.id]?.pet(); this.catUi.say('摸了摸（单机模式，好感度不会记录）', true); }
      return;
    }
    if (kind === 'pet') this.net.catPet(cat.id); else if (item) this.net.catFeed(cat.id, item); else this.catUi.say('背包里没有鱼了', false);
  }

  // ------------------------------------------------------------ 地点留言板入口
  /** 屏幕上的浮动按钮「📝 留言板·地点名」：站在建筑 / 地标附近才出现，不改变按 E 的原有行为 */
  private setupPlaceBtn() {
    const b = document.createElement('button'); b.type = 'button'; b.id = 'place-btn'; b.className = 'btn place-fab hidden';
    b.addEventListener('click', () => this.openPlaceBoard());
    (document.getElementById('hud') ?? document.body).append(b); this.placeBtn = b;
    this.events.on('shutdown', () => { b.remove(); this.placeBtn = undefined; });
    this.events.on('sleep', () => b.classList.add('hidden')); // 进室内 / 宿舍：校园场景睡觉，按钮收起来
  }
  private openPlaceBoard() {
    const d = this.curPlace; if (!d) return;
    if (this.net.status !== 'online') { this.hud.banner('📝 留言板', '连上服务器后才能留言（单机模式用不了）'); return; }
    if (this.placeUi.isOpen || this.hud.dialogOpen) return;
    this.hud.hint(null); this.placeUi.open({ key: d.key, name: d.name });
  }
  /** 每 200ms 看一眼玩家站在哪个地点，更新入口按钮 */
  private updateBoardEntry() {
    const b = this.placeBtn; if (!b || this.time.now < this.placeChkAt) return;
    this.placeChkAt = this.time.now + 200;
    this.curPlace = placeAt(this.places, this.player.x / TILE, this.player.y / TILE);
    const st = placeBtnState({ place: this.curPlace?.name ?? null, online: this.net.status === 'online', fishing: this.fishPhase !== 'idle', riding: this.player.riding, entering: this.entering, blocked: this.anyOverlay() });
    b.classList.toggle('hidden', !st.show);
    if (st.show) { const t = `📝 留言板·${st.label}${document.body.classList.contains('touch') ? '' : ' [.]'}`; if (b.textContent !== t) b.textContent = t; }
  }

  private enterInterior(b: BuildingOut) {
    if (this.entering || !b.interior) return;
    this.entering = true;
    this.hud.hint(null);
    const d = b.doors[0];
    this.enterPos = { x: (d.x + d.w / 2) * TILE, y: (d.y + 1.0) * TILE };
    const cam = this.cameras.main;
    cam.fadeOut(220, 20, 14, 10);
    cam.once('camerafadeoutcomplete', () => { this.scene.sleep(); this.scene.launch('Interior', { id: b.interior }); });
  }

  /** 服务器说可以回宿舍了（x,y = 宿舍楼门口）：淡出进入「我的宿舍」；出来时人站在这个位置 */
  private enterDorm(x: number, y: number) {
    if (this.entering || !this.scene.isActive()) return; // 已经在进门，或者人已经在宿舍里
    this.entering = true; this.hud.hint(null);
    this.player.setRiding(false); this.player.setSitting(false);
    this.dormUi.close(); this.tpUi.close();
    this.enterPos = { x, y };
    const cam = this.cameras.main;
    cam.fadeOut(220, 20, 14, 10);
    cam.once('camerafadeoutcomplete', () => { this.scene.sleep(); const v = this.registry.get('dormVisit') as { rm?: number } | null | undefined; this.scene.launch('Interior', { id: dormInteriorId(v ? v.rm ?? 0 : this.dormUi.data?.rm ?? 0) }); });
  }

  // ------------------------------------------------------------ 每帧
  override update(_t: number, delta: number) {
    const dt = Math.min(delta, 50) / 1000;
    const k = this.keys;
    const joy = this.touchUi?.state;
    this.runNow = this.player.moving && !this.player.riding && (k.shift.isDown || (joy?.run ?? false));
    this.updateKeeper(dt, _t);
    { const c = this.cameras.main, rx = c.width / c.zoom / 2 + 900, ry = c.height / c.zoom / 2 + 900; // 远处的行人、小猫不更新
      for (const n of this.npcs) { if (Math.abs(n.x - c.midPoint.x) > rx || Math.abs(n.y - c.midPoint.y) > ry) continue; n.update(dt, this.world, this.rand); }
      const visitor = { x: this.player.x, y: this.player.y, fast: this.player.riding || this.runNow, still: !this.player.moving && !this.player.riding, sitting: this.player.sitting, fishing: this.fishPhase !== 'idle' };
      const home = this.dormUi?.data?.dc;
      for (const cat of this.cats) {
        if (home?.includes(cat.def.id)) { cat.setAway(true); continue; } // 我把它接回宿舍养了：校园里这只猫对我来说"回家了"（对别的同学照常在原地）
        const pid = this.catWith.get(cat.def.id);
        if (pid) { // 正被某个玩家带着走：跟着他（自己，或视野里的别的玩家）；他不在视野里就先藏起来
          const who = pid === this.net.selfId ? this.player : this.remotes.get(pid);
          if (who) cat.update(dt, this.world, visitor, this.catAff[cat.def.id] ?? 0, { x: who.x, y: who.y }); else cat.setAway(true);
          continue;
        }
        if (Math.abs(cat.x - c.midPoint.x) > rx || Math.abs(cat.y - c.midPoint.y) > ry) continue;
        cat.update(dt, this.world, visitor, this.catAff[cat.def.id] ?? 0, null);
      } }
    { const c = this.cameras.main; this.lakeBirds?.update(dt, { x: this.player.x, y: this.player.y, fast: this.player.riding || this.runNow, fishing: this.fishPhase !== 'idle' }, { x: c.midPoint.x, y: c.midPoint.y, rx: c.width / c.zoom / 2 + 700, ry: c.height / c.zoom / 2 + 700 }); } // 精工湖的水禽
    { const l = this.player.riding ? 0.24 : 0.14; this.cameras.main.setLerp(l, l); } // 骑车时镜头跟得更紧
    // 注意顺序：anyOverlay() 里也包含对话框，所以对话框必须先判断，否则下面"翻页/关闭"的分支永远走不到（手机上与 NPC 对话后点屏幕没反应、卡死就是这个原因）
    if (!this.hud.dialogOpen && this.anyOverlay()) {
      this.player.update(dt, 0, 0, false, this.world);
      if (this.photo.isOpen) this.photoPan(dt, joy);
      if (this.photo.isOpen && Phaser.Input.Keyboard.JustDown(k.p)) this.photo.close();
      if (this.profileUi.isOpen && Phaser.Input.Keyboard.JustDown(k.c)) this.profileUi.close();
      if (this.boardUi.isOpen && Phaser.Input.Keyboard.JustDown(k.b)) this.boardUi.close();
      if (this.noticeUi.isOpen && Phaser.Input.Keyboard.JustDown(k.n)) this.noticeUi.close();
      if (this.socialUi.isOpen && Phaser.Input.Keyboard.JustDown(k.f)) this.socialUi.close();
      if (this.backpackUi.isOpen && Phaser.Input.Keyboard.JustDown(k.i)) this.backpackUi.close();
      if (this.backpackUi.isOpen && Phaser.Input.Keyboard.JustDown(k.g)) { this.backpackUi.close(); this.codexUi.open('fish'); }
      if (this.codexUi.isOpen && Phaser.Input.Keyboard.JustDown(k.h)) this.codexUi.close();
      if (this.achUi.isOpen && Phaser.Input.Keyboard.JustDown(k.j)) this.achUi.close();
      if (this.hallUi.isOpen && Phaser.Input.Keyboard.JustDown(k.l)) this.hallUi.close();
      if (this.placeUi.isOpen && this.placeKey && Phaser.Input.Keyboard.JustDown(this.placeKey)) this.placeUi.close();
      if (this.questUi.isOpen && Phaser.Input.Keyboard.JustDown(k.q)) this.questUi.close();
      if (this.partyUi.isOpen && Phaser.Input.Keyboard.JustDown(k.t)) this.partyUi.close();
      if (this.monUi.isOpen && Phaser.Input.Keyboard.JustDown(k.r)) this.monUi.close();
      if (this.tpUi.isOpen && Phaser.Input.Keyboard.JustDown(k.y)) this.tpUi.close();
      if (this.worldUi.isOpen && Phaser.Input.Keyboard.JustDown(k.o)) this.worldUi.close();
      if (this.dormUi.anyOpen && Phaser.Input.Keyboard.JustDown(k.u)) { this.dormUi.close(); this.dormUi.closeChest(); }
      if (this.adminUi.isOpen && Phaser.Input.Keyboard.JustDown(k.k)) this.adminUi.close();
    } else if (this.hud.dialogOpen) {
      if (Phaser.Input.Keyboard.JustDown(k.esc)) this.hud.closeDialog();
      else if (Phaser.Input.Keyboard.JustDown(k.e) || Phaser.Input.Keyboard.JustDown(k.space) || this.touchPress) this.hud.advanceDialog();
      this.player.update(dt, 0, 0, false, this.world);
    } else if (this.entering) {
      this.player.update(dt, 0, 0, false, this.world);
    } else if (this.fishPhase === 'fight') { // 拉鱼小游戏：人站着不动，空格 / 按钮控制绿条，Esc 放弃
      this.player.update(dt, 0, 0, false, this.world);
      if (this.touchPress) this.fightUi.tap();
      this.fightUi.updateWith(dt, k.space.isDown);
      if (Phaser.Input.Keyboard.JustDown(k.esc)) { this.net.fishCancel(); this.stopFishing(); sfx('lock'); }
      this.hud.hint(null);
    } else {
      const kx = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
      const ky = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
      const ix = kx || (joy?.x ?? 0), iy = ky || (joy?.y ?? 0); // 键盘优先，没按键时用摇杆
      const fl = fishingRodOut(this.fishLockState()); // 钓鱼沉浸：会打断钓鱼的界面快捷键先不响应（背包 I、地图 M、钓鱼图鉴 G、聊天 Enter、缩放照常）
      if (this.player.sitting && (ix !== 0 || iy !== 0)) this.standUp(); // 坐着时一推方向就起身
      if ((this.fishPhase === 'wait' || this.fishPhase === 'bite') && (ix !== 0 || iy !== 0)) { this.net.fishCancel(); this.stopFishing(); } // 钓鱼时一走动就收线
      this.player.update(dt, ix, iy, k.shift.isDown || (joy?.run ?? false), this.world);
      if (Phaser.Input.Keyboard.JustDown(k.x)) { if (fl) this.fishBlocked(); else this.emoteUi.toggle(); }
      if (Phaser.Input.Keyboard.JustDown(k.p)) { if (fl) this.fishBlocked(); else this.photo.open(); }
      if (Phaser.Input.Keyboard.JustDown(k.m)) this.hud.toggleMap();
      if (Phaser.Input.Keyboard.JustDown(k.c)) { if (fl) this.fishBlocked(); else this.profileUi.open(); }
      if (Phaser.Input.Keyboard.JustDown(k.b)) { if (fl) this.fishBlocked(); else this.boardUi.open(); }
      if (Phaser.Input.Keyboard.JustDown(k.n)) { if (fl) this.fishBlocked(); else this.noticeUi.open(); }
      if (Phaser.Input.Keyboard.JustDown(k.f)) { if (fl) this.fishBlocked(); else this.socialUi.open(); }
      if (Phaser.Input.Keyboard.JustDown(k.i)) this.backpackUi.open();
      if (Phaser.Input.Keyboard.JustDown(k.h)) { if (fl) this.fishBlocked(); else this.codexUi.open(); }
      if (Phaser.Input.Keyboard.JustDown(k.v)) { if (fl) this.fishBlocked(); else this.cycleHeld(); }
      if (Phaser.Input.Keyboard.JustDown(k.g)) this.codexUi.open('fish');
      if (Phaser.Input.Keyboard.JustDown(k.j)) { if (fl) this.fishBlocked(); else this.achUi.open(); }
      if (Phaser.Input.Keyboard.JustDown(k.l)) { if (fl) this.fishBlocked(); else this.hallUi.open(); }
      if (this.placeKey && Phaser.Input.Keyboard.JustDown(this.placeKey)) { if (fl) this.fishBlocked(); else this.openPlaceBoard(); }
      if (Phaser.Input.Keyboard.JustDown(k.q)) { if (fl) this.fishBlocked(); else this.questUi.open(); }
      if (Phaser.Input.Keyboard.JustDown(k.t)) { if (fl) this.fishBlocked(); else this.partyUi.open(); }
      if (Phaser.Input.Keyboard.JustDown(k.r)) { if (fl) this.fishBlocked(); else this.monUi.open(); }
      if (Phaser.Input.Keyboard.JustDown(k.y)) { if (fl) this.fishBlocked(); else this.tpUi.open(); }
      if (Phaser.Input.Keyboard.JustDown(k.u)) { if (fl) this.fishBlocked(); else this.dormUi.goHome(); }
      if (Phaser.Input.Keyboard.JustDown(k.o)) { if (fl) this.fishBlocked(); else this.worldUi.open(); }
      if (Phaser.Input.Keyboard.JustDown(k.k) && this.net.isAdmin) { if (fl) this.fishBlocked(); else this.adminUi.open(); }
      if (Phaser.Input.Keyboard.JustDown(k.enter)) this.chatUi.focus();
      if (Phaser.Input.Keyboard.JustDown(k.plus) || Phaser.Input.Keyboard.JustDown(k.plus2)) this.changeZoom(1);
      if (Phaser.Input.Keyboard.JustDown(k.minus) || Phaser.Input.Keyboard.JustDown(k.minus2)) this.changeZoom(-1);
      this.updateInteraction();
    }
    if (this.player.takeCrash()) this.onBikeCrash(); // 骑车撞墙：镜头抖一下，并告诉服务器（成就「墙是实心的」）
    this.checkDawn();
    if (this.paxPid) { const d = this.remotes.get(this.paxPid); if (d) { this.player.x = d.x; this.player.y = d.y; this.player.facing = d.facing; } } // 后座：跟着车主走
    if (this.holdPid) { const d = this.remotes.get(this.holdPid); if (d) { const [ox, oy] = handOffset(d.facing, this.holdSide), [gx, gy] = glide(this.player.x, this.player.y, d.x + ox, d.y + oy, HAND.GLIDE_PXS * dt); this.player.followMove(gx, gy, d.facing, d.moving || Math.hypot(gx - d.x - ox, gy - d.y - oy) > 1, d.running); } } // 被牵着：站在牵手的人身边、跟着走
    this.drawHandLinks();
    this.updateNet(dt, k.shift.isDown || (joy?.run ?? false));
    this.updateBuildingFade();
    this.updateClock(dt);
    this.updateAudio(dt);
    this.runUi.tick(); this.drawRunMark();
    this.updatePlace();
    this.updateBoardEntry();
    this.hud.setPlayerOnMap(this.player.x / TILE, this.player.y / TILE);
    this.touchPress = false;
  }

  /** 手拉手：每一对牵着手的人之间画「手牵手」——两条胳膊（肤色、带描边）从身体伸向中间，中间是握在一起的手，手上飘一颗小爱心；两个人离得远一点时胳膊会自然下垂 */
  private drawHandLinks() {
    const g = this.handG; g.clear();
    const t = this.time.now / 1000, SKIN = 0xf4c9a0, SKIN_D = 0xdca37a, INK = 0x3a2418;
    const HEART = ['01010', '11111', '01110', '00100'];
    for (const { l, f } of this.handPairs) {
      const ent = (pid: number) => (pid === this.net.selfId ? this.player : this.remotes.get(pid));
      const a = ent(l), b = ent(f); if (!a || !b) continue;
      const ay = a.y - 11, by = b.y - 11, d = Math.hypot(b.x - a.x, by - ay); if (d < 1.5) continue;
      const mx = (a.x + b.x) / 2, my = (ay + by) / 2, sag = Math.min(7, Math.max(0, (d - 15) * 0.18)); // 离远了胳膊下垂
      const pts: [number, number][] = [];
      for (let i = 0; i <= 8; i++) { const u = i / 8, w0 = (1 - u) * (1 - u), w1 = 2 * (1 - u) * u, w2 = u * u; pts.push([w0 * a.x + w1 * mx + w2 * b.x, w0 * ay + w1 * (my + sag * 1.6) + w2 * by]); }
      const line = (w: number, c: number) => { g.lineStyle(w, c, 1); g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const [x, y] of pts.slice(1)) g.lineTo(x, y); g.strokePath(); };
      line(4, INK); line(2, SKIN); // 胳膊：深色描边 + 肤色
      const hx = Math.round(mx), hy = Math.round(my + sag * 0.8);
      g.fillStyle(INK, 1); g.fillRect(hx - 3, hy - 3, 6, 6); g.fillStyle(SKIN, 1); g.fillRect(hx - 2, hy - 2, 4, 4); g.fillStyle(SKIN_D, 1); g.fillRect(hx - 2, hy + 1, 4, 1); g.fillStyle(0xffffff, 0.55); g.fillRect(hx - 2, hy - 2, 1, 1); // 握在一起的手
      const by0 = hy - 10 + Math.round(Math.sin(t * 3 + l) * 1); // 小爱心轻轻上下浮
      HEART.forEach((row, ry) => { for (let rx = 0; rx < 5; rx++) if (row[rx] === '1') { g.fillStyle(ry === 1 && rx === 1 ? 0xffb0c0 : 0xff5a7a, 1); g.fillRect(hx - 2 + rx, by0 + ry, 1, 1); } });
    }
  }

  private updateClock(dt: number) {
    this.clock.update(dt);
    const now = Date.now() + this.clock.offset;
    this.weather.update(dt, now); this.festFx.update(dt, now);
    Character.umbrella = this.weather.umbrella;
    Cat.env = { night: this.clock.nightness > 0.6, rain: this.weather.rain > 0.3, snow: this.weather.snow > 0.3 };
    LakeBird.env = { night: this.clock.nightness > 0.6, rain: this.weather.rain > 0.3 };
    const t = this.clock.tint(), wm = this.weather.tint, ft = this.festFx.tint;
    this.tintRect.setFillStyle(Phaser.Display.Color.GetColor(t.r * wm[0] * ft[0], t.g * wm[1] * ft[1], t.b * wm[2] * ft[2]));
    const n = Math.min(1, this.clock.nightness + (this.weather.cloud + this.weather.rain) * 0.12); // 阴雨天路灯亮得早一点
    for (const g of this.glowActive) g.setAlpha(n * 0.9);
    const h = this.clock.minuteOfDay / 60;
    const phase = h < 5.5 ? '深夜' : h < 7 ? '黎明' : h < 11 ? '上午' : h < 13.5 ? '正午' : h < 17 ? '下午' : h < 19.5 ? '黄昏' : h < 21 ? '傍晚' : '夜晚';
    this.wxPlaceT -= dt;
    if (this.wxPlaceT <= 0) { // 所在地点：每 0.3 秒算一次就够了
      this.wxPlaceT = 0.3;
      this.placeText = whereIs(this.player.x, this.player.y, { pois: this.wf.pois, buildings: this.wf.buildings, w: this.wf.width, h: this.wf.height });
      this.checkSeason(now);
    }
    const w = this.weather.state, sk = this.weather.sky;
    this.hud.setClock(this.clock.day, this.clock.hhmm, phase, { season: SEASON_NAME[this.season], weather: `${sk.icon} ${sk.name} ${sk.tempC}°`.trim(), place: this.placeText, fest: this.festFx.current ? `${this.festFx.current.icon} ${this.festFx.current.name}` : '' });
    { const ff = this.festFx.current; const fid = ff?.id ?? ''; if (fid !== this.lastFest) { if (ff) { this.hud.banner(`${ff.icon} ${ff.name}开始啦`, ff.buff.text); this.net.system(`${ff.icon} ${ff.name}：${ff.blurb}（节日福利：${ff.buff.text}）`); } else if (this.lastFest) this.net.system('节日结束了，下个节日在日历里看看吧'); this.lastFest = fid; } }
    const key = sk.storm ? '雷暴' : sk.fog > 0.3 ? '大雾' : w.name;
    if (key !== this.lastWx) { // 天气变了：聊天栏里说一声（刚进游戏那一次不说）
      if (this.lastWx) {
        const msg = sk.storm ? `⛈️ 雷暴来了，大家都撑起了伞` : sk.fog > 0.3 ? `🌫️ 起雾了，清晨的校园白蒙蒙的` : w.kind === 'rain' ? `${w.icon} 下起了${w.name}，大家都撑起了伞` : w.kind === 'snow' ? `${w.icon} 下起了${w.name}` : w.kind === 'sunny' ? `${w.icon} 天晴了` : `${w.icon} 天阴了`;
        this.net.system(msg);
      }
      this.lastWx = key;
    }
    const bow = sk.rainbow > 0.3; // 雨后出彩虹：说一声（只在刚出现时）
    if (bow && !this.lastBow && this.lastWx) this.net.system('🌈 雨停了，天边出了彩虹');
    this.lastBow = bow;
  }

  /** 季节跨过边界了就换一套地面和树木 */
  private checkSeason(serverNow: number) {
    if (this.seasonLocked) return;
    const want = seasonAt(serverNow);
    if (want !== this.season) this.loadSeason(want);
  }
  private loadSeason(s: Season, quiet = false) {
    if (this.seasonChanging || s === this.season) return;
    this.seasonChanging = true;
    const key = `props_${s}`;
    const apply = () => {
      this.season = s; this.propsKey = key;
      this.stream.reset(); // 销毁所有已创建的对象（地面块一并释放纹理），下一次 tickStream 按新季节重建
      this.seasonChanging = false; this.tickStream();
      if (!quiet) { this.hud.banner('季节更替', `${SEASON_NAME[s]}天来了`); this.net.system(`🍃 季节更替：${SEASON_NAME[s]}天来了`); }
    };
    if (this.textures.exists(key)) { apply(); return; }
    this.load.atlas(key, `${WD}/atlas-props-${s}.webp`, `${WD}/atlas-props.json`);
    this.load.once('complete', apply);
    if (!this.load.isLoading()) this.load.start();
  }

  /** 彩蛋特效：碑面闪白 → 文字向上一跳 → 到最高点换字并迸出火花 → 弹跳落回。回到原名时多一轮金色大火花和提示。 */
  private playEgg(st: { busy?: boolean; text?: Phaser.GameObjects.Text }, next: string, final: boolean) {
    const t = st.text;
    if (!t) return;
    st.busy = true;
    this.ensureSparkTextures();
    const cx = t.x, cy = t.y, baseY = t.y, depth = t.depth + 2;
    const color0 = t.style.color as string, stroke0 = t.style.stroke as string;
    // 碑面闪白
    const flash = this.add.rectangle(cx, cy, 172, 34, 0xffffff, 0.75).setDepth(depth - 1).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: flash, alpha: 0, duration: 380, onComplete: () => flash.destroy() });
    this.sparkBurst(cx, cy, depth, final ? 10 : 6, false);
    // 文字上跳 → 换字 → 弹回
    this.tweens.add({ targets: t, y: baseY - 15, scaleX: 1.12, scaleY: 1.12, duration: 130, ease: 'Quad.easeOut', onComplete: () => {
      t.setText(next).setColor('#ffb000').setStroke('#7a2a20', 3);
      this.sparkBurst(cx, cy - 6, depth, final ? 34 : 22, final);
      this.tweens.add({ targets: t, y: baseY, scaleX: 1, scaleY: 1, duration: 380, ease: 'Bounce.easeOut', onComplete: () => {
        t.setColor(color0).setStroke(stroke0, 2); st.busy = false;
        if (final) { this.hud.banner(EGG_FOUND_MSG, '校名石轻轻闪了一下光'); this.net.system(`✨ ${EGG_FOUND_MSG}`); this.net.achEvent('egg_done'); } // 走完一轮：通知服务器（成就「真正的河北工程」，服务器会核对你是不是在校名石前）
      } });
    } });
  }

  /** 像素十字火花贴图（金/白、大/小）：只生成一次 */
  private ensureSparkTextures() {
    if (this.textures.exists('spark_l')) return;
    const mk = (key: string, n: number, arm: string, core: string) => { // 先画 3 格宽的深琥珀描边，再画 1 格宽的亮色十字：浅色碑面和绿草地上都看得清
      const c = this.textures.createCanvas(key, n, n)!, g = c.getContext(), m = (n - 1) / 2;
      g.fillStyle = '#8a4b00'; g.fillRect(m - 1, 0, 3, n); g.fillRect(0, m - 1, n, 3);
      g.fillStyle = arm; g.fillRect(m, 1, 1, n - 2); g.fillRect(1, m, n - 2, 1);
      g.fillStyle = core; g.fillRect(m - 1, m - 1, 3, 3); c.refresh();
    };
    mk('spark_l', 11, '#ffc400', '#fff6c8'); mk('spark_s', 5, '#ffd24a', '#ffffff'); mk('spark_w', 7, '#ffe27a', '#ffffff');
  }

  /** 从碑面随机点迸出 n 颗火花：向上偏的随机速度，变小、变透明后消失（用补间，不依赖粒子系统） */
  private sparkBurst(cx: number, cy: number, depth: number, n: number, big: boolean) {
    const keys = big ? ['spark_l', 'spark_l', 'spark_w', 'spark_s'] : ['spark_s', 'spark_w', 'spark_l'];
    for (let i = 0; i < n; i++) {
      const x = cx + (Math.random() - 0.5) * 164, y = cy + (Math.random() - 0.5) * 28;
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, sp = 14 + Math.random() * (big ? 46 : 32);
      const im = this.add.image(x, y, keys[Math.floor(Math.random() * keys.length)]).setDepth(depth).setAlpha(1);
      this.tweens.add({
        targets: im, x: x + Math.cos(ang) * sp, y: y + Math.sin(ang) * sp + 8, alpha: 0, scale: 0.4,
        duration: 420 + Math.random() * 380, delay: Math.random() * 140, ease: 'Quad.easeOut', onComplete: () => im.destroy(),
      });
    }
  }

  /** 声音：第一次点击/按键唤醒音频，之后背景音乐随昼夜切换，按钮有点击声，走路有轻轻的脚步声 */
  private setupAudio() {
    const wake = () => { audio.unlock(); music.start(); };
    for (const ev of ['pointerdown', 'keydown', 'touchend'] as const) window.addEventListener(ev, wake, { passive: true });
    document.getElementById('hud')?.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('button')) sfx('click'); });
  }
  private updateAudio(dt: number) {
    this.moodT -= dt;
    if (this.moodT <= 0) { this.moodT = 1; music.setMood(this.clock.nightness > 0.5 ? 'night' : 'day'); ambient.set(this.weather.rain, this.weather.snow); }
    const p = this.player;
    if (p.moving && !p.riding && !p.sitting) { this.stepT -= dt; if (this.stepT <= 0) { this.stepT = this.runNow ? 0.23 : 0.36; sfx('step'); } } else this.stepT = 0;
  }

  /** 坐下：把人放到座位上（服务器会再核对一次位置） */
  private sitDown(seat: Seat) {
    this.player.x = seat.x; this.player.y = seat.y; this.player.halt();
    this.player.setSitting(true, { bx: seat.bx, by: seat.by });
    this.net.sit(true); sfx('sit');
    this.lastSent = { x: -1, y: -1, flags: -1 };
  }
  private standUp() {
    this.player.setSitting(false); this.net.sit(false); sfx('stand');
    this.lastSent = { x: -1, y: -1, flags: -1 };
  }
  private doEmote(id: number) {
    const d = emoteDef(id); if (!d) return;
    const why = emoteBlocked(d, { riding: this.player.riding, sitting: this.player.sitting, pax: this.player.pax, fishing: this.player.fishing, led: this.player.led });
    if (why) { this.hud.banner('表情', why); return; }
    if (this.net.status === 'online') this.net.emote(id); else if (d.hold && this.player.holdingEmote === id) this.player.endPose(); else { this.player.emote(d); sfx('emote'); } // 联机时由服务器回传（带限频），离线直接演
  }

  /** 拍照模式里：方向键/摇杆平移镜头（速度随缩放调整，画面上看起来速度一致） */
  private photoPan(dt: number, joy?: { x: number; y: number }) {
    const k = this.keys, c = this.cameras.main;
    const kx = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    const ky = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    const ix = kx || (joy?.x ?? 0), iy = ky || (joy?.y ?? 0);
    const sp = (k.shift.isDown ? 420 : 210) / c.zoom * dt;
    c.scrollX += ix * sp; c.scrollY += iy * sp;
  }

  /** 截下当前画面，加水印后保存成 PNG */
  private takePhoto() {
    this.net.achEvent('photo'); sfx('shutter');
    this.game.renderer.snapshot((img) => { if (img instanceof HTMLImageElement) savePhoto(img, this.profileUi.profile.name, this.lastPlace); }, 'image/png');
  }

  /** 田径场起跑线（黑白格）与比赛时指示下一个检查点的光圈 */
  private buildTrackMarks() {
    const g = this.add.graphics().setDepth(GATES[0].y - 1000), a = GATES[0], w = 100, rows = 2, cell = 5;
    for (let r = 0; r < rows; r++) for (let c = 0; c < w / cell; c++) { g.fillStyle((r + c) % 2 ? 0x2a2a2a : 0xfaf6ea, 0.92).fillRect(Math.round(a.x - w / 2 + c * cell), Math.round(a.y - rows * cell / 2 + r * cell), cell, cell); }
    this.add.text(Math.round(a.x), Math.round(a.y - 14), '起点 / 终点', { fontFamily: 'ArkPixel', fontSize: '10px', color: '#fff6d8', stroke: '#3a1a10', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(GATES[0].y - 999);
    this.runMark = this.add.graphics().setDepth(1e5);
  }
  private drawRunMark() {
    const g = this.runMark; if (!g) return;
    const gate = this.runUi.nextGate;
    g.clear();
    if (gate < 0) return;
    const p = GATES[gate], k = (this.time.now % 900) / 900;
    g.lineStyle(3, 0xffd24a, 0.9 - 0.6 * k).strokeCircle(p.x, p.y, 14 + k * (RUN.GATE_R - 14));
    g.lineStyle(2, 0xff7a3a, 0.9).strokeCircle(p.x, p.y, 8);
    g.fillStyle(0xfff6c8, 0.9).fillCircle(p.x, p.y, 3);
  }

  /** 服务器告诉我钓鱼进行到哪一步了：等鱼 → 咬钩 → 拉鱼小游戏 → 钓到（鱼飞出水面 + 卡片） / 鱼跑了 */
  private onFishState(m: Extract<ServerMsg, { t: 'fish_state' }>) {
    const p = this.player;
    if (m.s === 'wait') { this.fishPhase = 'wait'; if (m.x !== undefined && m.y !== undefined) this.bobber = { x: m.x, y: m.y }; p.setFishing(true, this.bobber ?? undefined); sfx('cast'); return; }
    if (m.s === 'bite') { this.fishPhase = 'bite'; p.setFishing(true, this.bobber ?? undefined, true); sfx('bite'); this.hud.banner('🎣 咬钩了！', `${m.sonar === undefined ? '' : m.sonar === '?' ? '声呐：一条没见过的鱼　' : `声呐：${fishDef(m.sonar)?.name ?? '？'}　`}快按 E 提竿（${(FISHING.REEL_WINDOW_MS / 1000).toFixed(1)} 秒内）`); return; }
    if (m.s === 'fight' && m.seed !== undefined && m.diff !== undefined) {
      this.fishPhase = 'fight'; p.setFishing(true, this.bobber ?? undefined, true); sfx('reel');
      this.fightUi.start({ seed: m.seed, diff: m.diff, move: m.move ?? 'mixed', bar: m.bar, sink: m.sink, cling: m.cling, drop: m.drop, burst: m.burst }, (win, perfect) => { this.net.fishEnd(win, perfect); sfx(win ? 'reel' : 'fail'); }, !!m.crown);
      return;
    }
    const bobber = this.bobber;
    this.fightUi.close(); this.stopFishing();
    if (m.s === 'catch') this.catchUntil = this.time.now + 1400; // 鱼飞出水面 + 卡片弹出之前，也算钓鱼流程
    if (m.s === 'catch' && m.id) {
      const d = fishDef(m.id), name = d?.name ?? '东西', kg = m.kg ?? 0;
      this.playCatch(m.id, bobber, d?.rarity ?? 'common', !!m.junk, () => this.fishCard.show({ id: m.id!, cm: m.cm ?? 0, kg, isNew: m.isNew, record: m.record, junk: m.junk, perfect: m.perfect, msg: m.msg, twin: m.twin, box: m.box, pearl: m.pearl, first: m.first, xp: m.xp, lv: m.lv }));
      if (m.junk) { sfx('splash'); this.net.system(`🎣 钓上来一个${name}……`); }
      else {
        sfx(d?.rarity === 'legendary' || d?.rarity === 'epic' || d?.rarity === 'mythic' ? 'achieve' : 'catch');
        const tier = d ? sizeTier(d, m.cm ?? 0).name : '';
        const tags = [tier, m.perfect ? '完美拉鱼' : '', m.twin ? '双钓！' : '', m.isNew ? '图鉴新种类！' : '', m.record ? '新纪录！' : '', m.box ? `顺带钓到一个${itemDef(m.box)?.name ?? '盲盒'}` : ''].filter(Boolean).join(' ');
        this.net.system(`🎣 钓到一条${name}（${m.cm} cm${kg ? ` · ${fmtKg(kg)}` : ''}）${tags ? ` · ${tags}` : ''}`);
      }
    } else if (m.msg) { sfx(m.s === 'miss' ? 'fail' : 'lock'); this.hud.banner('🎣 钓鱼', m.msg); }
  }

  /** 钓到了：水花 + 鱼从浮漂处划着弧线飞到头顶、转着圈放大，停一下再淡出；飞完才弹出卡片（传说/史诗多一圈金光） */
  private playCatch(id: string, from: { x: number; y: number } | null, rarity: string, junk: boolean, done: () => void) {
    const frame = `item_${id}`, P = this.player, start = from ?? { x: P.x, y: P.y - 30 };
    if (!this.textures.get('items').has(frame)) { done(); return; }
    const big = rarity === 'legendary' || rarity === 'epic' || rarity === 'mythic';
    const depth = 900000, tint = big ? 0xffe27a : 0xbfe4ff;
    // 水花：一圈涟漪 + 向上溅起的水滴
    const ring = this.add.graphics().setDepth(depth);
    const rg = { r: 3, a: 0.9 };
    this.tweens.add({ targets: rg, r: big ? 26 : 16, a: 0, duration: 520, ease: 'Quad.easeOut', onUpdate: () => { ring.clear(); ring.lineStyle(2, big ? 0xffe27a : 0xffffff, rg.a).strokeEllipse(start.x, start.y, rg.r * 2, rg.r); }, onComplete: () => ring.destroy() });
    const n = big ? 16 : 9;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.0, v = 22 + Math.random() * 30;
      const dr = this.add.image(start.x, start.y, 'puff').setTint(tint).setDepth(depth).setScale(0.35 + Math.random() * 0.3);
      this.tweens.add({ targets: dr, x: start.x + Math.cos(a) * v, y: start.y + Math.sin(a) * v + 14, alpha: 0, duration: 520 + Math.random() * 240, ease: 'Quad.easeOut', onComplete: () => dr.destroy() });
    }
    // 鱼：从水里弹出，划弧飞向头顶
    const img = this.add.image(start.x, start.y, 'items', frame).setDepth(depth + 1).setScale(1.2).setAlpha(0.2);
    const k = { t: 0 }, tx = P.x, ty = P.y - 48;
    this.tweens.add({ targets: k, t: 1, duration: 640, ease: 'Sine.easeInOut',
      onUpdate: () => {
        const t = k.t;
        img.setPosition(start.x + (tx - start.x) * t, start.y + (ty - start.y) * t - Math.sin(Math.PI * t) * 38)
          .setRotation(t * Math.PI * (junk ? 2 : 3)).setScale(1.2 + 1.3 * Math.sin(Math.PI * Math.min(1, t * 1.1))).setAlpha(Math.min(1, 0.2 + t * 3));
      },
      onComplete: () => {
        img.setRotation(0).setScale(2.4);
        if (big) for (let i = 0; i < 10; i++) { // 举在头顶时迸出金色小光点
          const a = (i / 10) * Math.PI * 2, sp = this.add.image(img.x, img.y, 'puff').setTint(0xffd35a).setDepth(depth).setScale(0.5);
          this.tweens.add({ targets: sp, x: img.x + Math.cos(a) * 26, y: img.y + Math.sin(a) * 20, alpha: 0, duration: 520, onComplete: () => sp.destroy() });
        }
        done();
        this.tweens.add({ targets: img, scale: 3, duration: 200, yoyo: true, onComplete: () => this.tweens.add({ targets: img, alpha: 0, y: img.y - 12, duration: 420, delay: 500, onComplete: () => img.destroy() }) });
      } });
  }
  private stopFishing() { this.fishPhase = 'idle'; this.player.setFishing(false); }
  /** 钓鱼沉浸用的状态：阶段 + 结算卡片 / 鱼飞出水面 + 现在能不能抛竿 */
  private catchUntil = 0; private fishBlockAt = 0;
  private fishLockState(): FishLockState {
    return { phase: this.fishPhase, cardOpen: this.fishCard?.isOpen ?? false, catching: this.time.now < this.catchUntil };
  }
  /** 钓鱼中按了会打断画面的键 / 点了入口：提示一句（别刷屏） */
  private fishBlocked() { if (this.time.now - this.fishBlockAt < 1500) return; this.fishBlockAt = this.time.now; this.hud.banner('🎣 钓鱼中', FISHING_BLOCK_MSG); }

  /** 骑车撞墙：镜头抖一下、响一声；每 20 秒最多报一次（服务器会核对他在骑车且身边真有障碍） */
  private onBikeCrash() {
    this.cameras.main.shake(140, 0.004); sfx('lock');
    const now = this.time.now;
    if (now - this.crashAt > 20000) { this.crashAt = now; this.net.achEvent('bike_crash'); }
  }
  /** 凌晨四点（设备上的时间）还在线：每次登录最多报一次，带上设备的时区偏移，服务器按自己的时钟核对 */
  private checkDawn() {
    if (this.net.status !== 'online') { this.dawnSent = false; return; }
    if (this.time.now < this.dawnNext) return;
    this.dawnNext = this.time.now + 20000;
    const d = new Date();
    if (d.getHours() !== 4) { this.dawnSent = false; return; }
    if (!this.dawnSent) { this.dawnSent = true; this.net.achEvent('dawn4', d.getTimezoneOffset()); }
  }

  private updateInteraction() {
    if (this.paxPid) { // 坐在队友车后座：只能下车
      this.hud.hint('E  下车');
      if (Phaser.Input.Keyboard.JustDown(this.keys.e) || Phaser.Input.Keyboard.JustDown(this.keys.space) || this.touchPress) this.net.paxLeave();
      return;
    }
    if (this.runUi.active) { this.hud.hint('校园跑进行中：沿跑道按顺序跑（点屏幕上的「放弃」退出）'); return; }
    if (this.fishPhase === 'fight') return;
    if (this.fishPhase !== 'idle') { // 正在钓鱼：等鱼时按 E 收线放弃，咬钩时按 E 提竿
      const bite = this.fishPhase === 'bite';
      this.hud.hint(bite ? 'E  提竿！！' : 'E  收线（等鱼咬钩…）');
      if (Phaser.Input.Keyboard.JustDown(this.keys.e) || Phaser.Input.Keyboard.JustDown(this.keys.space) || this.touchPress) {
        if (bite) { this.net.fishReel(); sfx('reel'); } else { this.net.fishCancel(); this.stopFishing(); sfx('lock'); }
      }
      return;
    }
    if (this.player.sitting) { // 坐着：只能起身（或做表情）
      this.hud.hint('E  起身　X  表情');
      if (Phaser.Input.Keyboard.JustDown(this.keys.e) || Phaser.Input.Keyboard.JustDown(this.keys.space) || this.touchPress) this.standUp();
      return;
    }
    if (this.player.riding) { // 骑车时只有一件事可做：锁车下车（想进楼、找人聊天，先下车）
      const mm = this.partyUi.mates; let mateNear = false;
      for (const r of this.remotes.values()) if (r.riding && mm.has(r.uid) && Math.hypot(r.x - this.player.x, r.y - this.player.y) < PAX_REACH) mateNear = true;
      this.hud.hint(mateNear ? 'E  锁车下车（想坐队友的后座，要先下车）' : 'E  锁车下车');
      if (Phaser.Input.Keyboard.JustDown(this.keys.e) || Phaser.Input.Keyboard.JustDown(this.keys.space) || this.touchPress) this.dismount();
      return;
    }
    const tx = this.player.x / TILE, ty = this.player.y / TILE;
    let near: BuildingOut | null = null;
    for (const b of this.wf.buildings) for (const d of b.doors) {
      if (tx >= d.x - 0.5 && tx <= d.x + d.w + 0.5 && ty >= d.y - 0.3 && ty <= d.y + d.h) near = b;
    }
    this.nearBuilding = near;
    // 最近的行人
    let cat: Cat | null = null, cd = CAT_REACH;
    for (const c of this.cats) { if (!c.interactive) continue; const dd = c.distTo(this.player.x, this.player.y); if (dd < cd) { cd = dd; cat = c; } }   // 被别人带走、藏起来的猫选不中
    const seat = nearestSeat(this.seats, this.player.x, this.player.y, SIT_REACH);
    const bin = this.net.status === 'online' ? nearestBin(this.bins, this.player.x, this.player.y) : -1; // 站在垃圾桶旁：按 E 翻一翻
    const fishSpot = this.water && this.net.status === 'online' ? castTarget(this.water.at, this.player.x, this.player.y, this.player.facing) : null; // 站在岸边、面朝湖水
    const mates = this.partyUi.mates;
    let mateBike: RemotePlayer | null = null, mbd = PAX_REACH; // 正在骑车的队友（后座空着就能坐上去，满座由服务器拒绝）
    let mateFar: RemotePlayer | null = null, mfd = PAX_NEAR; // 队友的车就在附近但还够不着：提示再走近点
    for (const r of this.remotes.values()) { if (!r.riding || !mates.has(r.uid)) continue; const d = Math.hypot(r.x - this.player.x, r.y - this.player.y); if (d < mbd) { mbd = d; mateBike = r; } else if (d < mfd) { mfd = d; mateFar = r; } }
    const nearBike = (b: { x: number; y: number }) => Math.abs(b.x - this.player.x) <= 26 && Math.abs(b.y - this.player.y) <= 16;
    const bike = this.bikeSpots.find(nearBike) ?? [...this.droppedBikes.values()].find(nearBike);
    let npc: Npc | null = null, nd = 26;
    for (const n of this.npcs) { const dd = Math.hypot(n.x - this.player.x, n.y - this.player.y); if (dd < nd) { nd = dd; npc = n; } }
    const egg = (this.wf.interacts ?? []).find((i) => this.player.x >= i.x && this.player.x <= i.x + i.w && this.player.y >= i.y && this.player.y <= i.y + i.h);
    const press = Phaser.Input.Keyboard.JustDown(this.keys.e) || Phaser.Input.Keyboard.JustDown(this.keys.space) || this.touchPress;
    // 钓鱼沉浸：结算卡片 / 鱼飞出水面时，只剩"再抛一竿"；站在能抛竿的岸边（有竿有饵）时，抛竿优先于猫、单车、垃圾桶、长椅、NPC、校园跑起点
    const rodP = pickRod(this.backpackUi.inv, this.backpackUi.equip), baitP = pickBait(this.backpackUi.inv, this.backpackUi.equip);
    const lockSt: FishLockState = { ...this.fishLockState(), castable: !!fishSpot && !!rodP && !!baitP && !(baitP === 'bait_name' && !this.backpackUi.equip.target) };
    if (fishingBlocksInteract(lockSt)) { if (fishSpot) this.fishSpotHint(press); else this.hud.hint(null); return; }
    // 精工湖的水禽：游到岸边、够得着时，E 优先喂它（比抛竿、小猫优先；建筑门口和彩蛋区仍然优先）。钓鱼流程中上面已经返回了，所以不会打断钓鱼
    const bird = !near && !egg && !this.player.riding ? this.lakeBirds?.nearest(this.player.x, this.player.y) ?? null : null;
    if (bird) {
      const baitN = this.backpackUi.inv[BIRD_FEED_ITEM] ?? 0;
      if (this.net.status !== 'online') this.hud.hint(`「${bird.label}」游到了岸边（连上服务器才能喂）`);
      else if (baitN <= 0) this.hud.hint(`「${bird.label}」游到了岸边：鱼饵用完了（明天登录会送，商店也有卖）`);
      else { this.hud.hint(`E  喂「${bird.label}」（鱼饵 ×${baitN}）`); if (press) this.net.birdFeed(bird.def.id); }
      return;
    }
    if (fishingPrefersCast(lockSt) && !near && !egg) { this.fishSpotHint(press); return; }
    // 站在猫身边按 E 一定能和它玩：猫排在彩蛋区、队友单车前面；站在建筑门口时，猫够近（<0.75 个够得着的距离）才抢占提示
    if (cat && !this.player.riding && (!near || cd < CAT_REACH * 0.75)) {
      this.hud.hint(`E  和「${cat.label}」玩`);
      if (press) this.openCat(cat);
    } else if (near) {
      const home = near.name === this.dormUi.building && this.net.status === 'online'; // 自己绑定的宿舍楼：门口按 E 回宿舍
      this.hud.hint(home ? `E  回宿舍（${near.name}）` : `E  ${near.interior ? '进入' : '查看'}：${near.name}`);
      if (press) {
        if (home) this.net.dormEnter();
        else if (near.interior) this.enterInterior(near);
        else this.hud.openDialog(near.name, near.desc ?? `${near.name}。内部暂未开放。`);
      }
    } else if (egg) {
      this.hud.hint(egg.hint);
      if (press && egg.action === 'board') this.boardUi.open();
      else if (press && egg.action === 'shop') this.shopUi.open();
      else if (press && egg.action === 'fishshop') this.shopUi.open('stall');
      else if (press && egg.action === 'wall') this.wallUi.open();
      else if (press) {
        const st = this.egg.get(egg.id) ?? this.egg.set(egg.id, { step: 0 }).get(egg.id)!;
        if (!st.busy) { // 动画播放中不响应，避免文字状态和动画对不上
          const a = eggAdvance(st.step, egg.texts.length);
          st.step = a.step;
          const orig = this.wf.labels?.find((l) => l.id === egg.id)?.text ?? '';
          this.playEgg(st, a.index >= 0 ? egg.texts[a.index] : orig, a.final);
        }
      }
    } else if (mateBike) {
      this.hud.hint(`E  坐上 ${mateBike.info.name} 的车后座`);
      if (press) this.net.paxJoin(mateBike.uid);
    } else if (mateFar && !cat && !bike && !seat && !fishSpot) {
      this.hud.hint(`${mateFar.info.name} 在骑车：走近他的车，按 E 坐后座`);
    } else if (bike) {
      this.hud.hint('E  扫码骑行：共享单车');
      if (press) this.mount();
    } else if (bin >= 0) {
      this.hud.hint(`E  翻垃圾桶${this.binLeft >= 0 ? `（今天还能翻 ${this.binLeft} 次）` : ''}`);
      if (press) this.net.binSearch(bin);
    } else if (seat) {
      this.hud.hint('E  坐下');
      if (press) this.sitDown(seat);
    } else if (this.net.status === 'online' && inStartZone(this.player.x, this.player.y)) {
      this.hud.hint('E  校园跑：东区田径场');
      if (press) this.runUi.open();
    } else if (fishSpot) {
      this.fishSpotHint(press);
    } else if (npc) {
      this.hud.hint('E  和同学聊聊');
      if (press) {
        const dx = this.player.x - npc.x, dy = this.player.y - npc.y;
        npc.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        npc.sprite.setFrame(`c${npc.look}_${npc.facing}_0`);
        npc.pause(2.5);
        this.hud.openDialog(npc.name, npc.lines);
      }
    } else this.hud.hint(null);
  }

  /** 站在岸边面朝湖水：提示 / 按 E 抛竿（装备栏选的；没选就是最低级的，香饵不会在你不知情时被用掉） */
  private fishSpotHint(press: boolean) {
    const inv = this.backpackUi.inv, eq = this.backpackUi.equip, rod = pickRod(inv, eq), bait = pickBait(inv, eq);
    if (!rod) this.hud.hint('这里可以钓鱼（需要鱼竿：每天登录会送）');
    else if (!bait) this.hud.hint('鱼饵用完了（明天登录、做每日任务会送，商店也有卖）');
    else if (bait === 'bait_name' && !eq.target) this.hud.hint('指名饵要先在背包的装备栏里指定一种鱼');
    else { this.hud.hint(`E  抛竿钓鱼（${itemDef(rod.id)?.name}，${itemDef(bait)?.name} ×${inv[bait]}）`); if (press) this.net.fishCast(); }
  }

  private updatePlace() {
    const tx = this.player.x / TILE, ty = this.player.y / TILE;
    let name = '', sub = '';
    for (const p of this.wf.pois) {
      if (p.kind === 'spawn' || !p.r) continue;
      if ((p.x - tx) ** 2 + (p.y - ty) ** 2 < p.r * p.r) { name = p.name; sub = p.desc ?? ''; break; }
    }
    if (!name) {
      for (const b of this.wf.buildings) {
        const bb = b.bbox;
        if (tx > bb.x - 2 && tx < bb.x + bb.w + 2 && ty > bb.y - 2 && ty < bb.y + bb.h + 3) { name = b.name; break; }
      }
    }
    if (name && name !== this.lastPlace) this.hud.banner(name, sub);
    this.lastPlace = name;
  }
}
