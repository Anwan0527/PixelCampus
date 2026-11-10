/** 时钟、天气、节日、季节切换，以及凌晨四点成就的上报。 */
import Phaser from 'phaser';
import { WD } from '@/core/paths';
import { Cat } from '@/entities/Cat';
import { LakeBird } from '@/entities/LakeBird';
import { Character } from '@/entities/Player';
import { SEASON_NAME, seasonAt, type Season } from '@/shared/season';
import { whereIs } from '@/shared/where';
import { tickStream } from './stream';
import type { WorldScene } from '../WorldScene';

export function updateClock(sc: WorldScene, dt: number) {
  sc.clock.update(dt);
  const now = Date.now() + sc.clock.offset;
  sc.weather.update(dt, now); sc.festFx.update(dt, now);
  Character.umbrella = sc.weather.umbrella;
  Cat.env = { night: sc.clock.nightness > 0.6, rain: sc.weather.rain > 0.3, snow: sc.weather.snow > 0.3 };
  LakeBird.env = { night: sc.clock.nightness > 0.6, rain: sc.weather.rain > 0.3 };
  const t = sc.clock.tint(), wm = sc.weather.tint, ft = sc.festFx.tint;
  sc.tintRect.setFillStyle(Phaser.Display.Color.GetColor(t.r * wm[0] * ft[0], t.g * wm[1] * ft[1], t.b * wm[2] * ft[2]));
  const n = Math.min(1, sc.clock.nightness + (sc.weather.cloud + sc.weather.rain) * 0.12); // 阴雨天路灯亮得早一点
  for (const g of sc.glowActive) g.setAlpha(n * 0.9);
  const h = sc.clock.minuteOfDay / 60;
  const phase = h < 5.5 ? '深夜' : h < 7 ? '黎明' : h < 11 ? '上午' : h < 13.5 ? '正午' : h < 17 ? '下午' : h < 19.5 ? '黄昏' : h < 21 ? '傍晚' : '夜晚';
  sc.wxPlaceT -= dt;
  if (sc.wxPlaceT <= 0) { // 所在地点：每 0.3 秒算一次就够了
    sc.wxPlaceT = 0.3;
    sc.placeText = whereIs(sc.player.x, sc.player.y, { pois: sc.wf.pois, buildings: sc.wf.buildings, w: sc.wf.width, h: sc.wf.height });
    checkSeason(sc, now);
  }
  const w = sc.weather.state, sk = sc.weather.sky;
  sc.hud.setClock(sc.clock.day, sc.clock.hhmm, phase, { season: SEASON_NAME[sc.season], weather: `${sk.icon} ${sk.name} ${sk.tempC}°`.trim(), place: sc.placeText, fest: sc.festFx.current ? `${sc.festFx.current.icon} ${sc.festFx.current.name}` : '' });
  { const ff = sc.festFx.current; const fid = ff?.id ?? ''; if (fid !== sc.lastFest) { if (ff) { sc.hud.banner(`${ff.icon} ${ff.name}开始啦`, ff.buff.text); sc.net.system(`${ff.icon} ${ff.name}：${ff.blurb}（节日福利：${ff.buff.text}）`); } else if (sc.lastFest) sc.net.system('节日结束了，下个节日在日历里看看吧'); sc.lastFest = fid; } }
  const key = sk.storm ? '雷暴' : sk.fog > 0.3 ? '大雾' : w.name;
  if (key !== sc.lastWx) { // 天气变了：聊天栏里说一声（刚进游戏那一次不说）
    if (sc.lastWx) {
      const msg = sk.storm ? `⛈️ 雷暴来了，大家都撑起了伞` : sk.fog > 0.3 ? `🌫️ 起雾了，清晨的校园白蒙蒙的` : w.kind === 'rain' ? `${w.icon} 下起了${w.name}，大家都撑起了伞` : w.kind === 'snow' ? `${w.icon} 下起了${w.name}` : w.kind === 'sunny' ? `${w.icon} 天晴了` : `${w.icon} 天阴了`;
      sc.net.system(msg);
    }
    sc.lastWx = key;
  }
  const bow = sk.rainbow > 0.3; // 雨后出彩虹：说一声（只在刚出现时）
  if (bow && !sc.lastBow && sc.lastWx) sc.net.system('🌈 雨停了，天边出了彩虹');
  sc.lastBow = bow;
}

/** 季节跨过边界了就换一套地面和树木 */
export function checkSeason(sc: WorldScene, serverNow: number) {
  if (sc.seasonLocked) return;
  const want = seasonAt(serverNow);
  if (want !== sc.season) loadSeason(sc, want);
}

export function loadSeason(sc: WorldScene, s: Season, quiet = false) {
  if (sc.seasonChanging || s === sc.season) return;
  sc.seasonChanging = true;
  const key = `props_${s}`;
  const apply = () => {
    sc.season = s; sc.propsKey = key;
    sc.stream.reset(); // 销毁所有已创建的对象（地面块一并释放纹理），下一次 tickStream 按新季节重建
    sc.seasonChanging = false; tickStream(sc);
    if (!quiet) { sc.hud.banner('季节更替', `${SEASON_NAME[s]}天来了`); sc.net.system(`🍃 季节更替：${SEASON_NAME[s]}天来了`); }
  };
  if (sc.textures.exists(key)) { apply(); return; }
  sc.load.atlas(key, `${WD}/atlas-props-${s}.webp`, `${WD}/atlas-props.json`);
  sc.load.once('complete', apply);
  if (!sc.load.isLoading()) sc.load.start();
}

/** 凌晨四点（设备上的时间）还在线：每次登录最多报一次，带上设备的时区偏移，服务器按自己的时钟核对 */
export function checkDawn(sc: WorldScene) {
  if (sc.net.status !== 'online') { sc.dawnSent = false; return; }
  if (sc.time.now < sc.dawnNext) return;
  sc.dawnNext = sc.time.now + 20000;
  const d = new Date();
  if (d.getHours() !== 4) { sc.dawnSent = false; return; }
  if (!sc.dawnSent) { sc.dawnSent = true; sc.net.achEvent('dawn4', d.getTimezoneOffset()); }
}
