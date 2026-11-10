/** 世界流式构建：地面块、摆件、建筑翼体（按页按需加载图集）、文字牌、路灯光晕；建筑淡出、昼夜叠色；大地图上的建筑名。 */
import Phaser from 'phaser';
import type { WorldFile } from '@/shared/world-format';
import { TILE } from '@/core/const';
import { WD } from '@/core/paths';
import { type Destroyable } from '@/world/Streamer';
import { PLAZA_BUILDINGS } from '@/shared/plaza';
import type { WorldScene } from '../WorldScene';

export function tickStream(sc: WorldScene) {
  const c = sc.cameras.main, p = sc.player;
  // 骑得快时往前"预读"：把加载范围向行进方向挪（最多 0.8 秒的路程），地面块来得及加载，不会骑进空白里
  const ax = p ? Phaser.Math.Clamp(p.vx * 0.8, -640, 640) : 0, ay = p ? Phaser.Math.Clamp(p.vy * 0.8, -640, 640) : 0;
  sc.stream.update(c.midPoint.x + ax, c.midPoint.y + ay, c.width / c.zoom, c.height / c.zoom);
}

/** 把整个世界登记成"按视野创建/销毁"的条目：地面块、摆件、建筑翼体、文字牌、路灯光晕、旗帜 */
export function buildStream(sc: WorldScene) {
  const { px } = sc.wf.chunk;
  const waterSet = new Set(sc.wf.water.chunks);
  const keys = sc.wf.chunks ?? Array.from({ length: sc.wf.chunk.cols * sc.wf.chunk.rows }, (_, i) => `${i % sc.wf.chunk.cols}_${Math.floor(i / sc.wf.chunk.cols)}`);
  for (const k of keys) { const [cx, cy] = k.split('_').map(Number); sc.stream.add({ x: cx * px, y: cy * px, w: px, h: px, make: () => makeChunk(sc, k, cx * px, cy * px, waterSet.has(k)) }); }

  for (const o of sc.wf.objects) {
    const fr = sc.textures.getFrame('props', o.k);
    sc.stream.add({ x: o.x - o.ax, y: o.y - o.ay, w: fr.width, h: fr.height, make: () => sc.add.image(o.x, o.y, sc.propsKey, o.k).setOrigin(o.ax / fr.width, o.ay / fr.height).setDepth(o.y) });
  }
  for (const a of sc.wf.anims ?? []) {
    const fr = sc.textures.getFrame('props', a.frames[0]);
    sc.stream.add({ x: a.x, y: a.y, w: fr.width, h: fr.height, make: () => {
      const im = sc.add.image(a.x, a.y, sc.propsKey, a.frames[0]).setOrigin(0).setDepth(a.depth); let i = 0;
      const ev = sc.time.addEvent({ delay: a.ms, loop: true, callback: () => { i = (i + 1) % a.frames.length; im.setFrame(a.frames[i]); } });
      return { destroy: () => { ev.remove(); im.destroy(); } };
    } });
  }
  for (const b of sc.wf.buildings) {
    const st = { alpha: 1, rects: [] as { l: number; r: number; t: number; base: number }[], imgs: new Set<Phaser.GameObjects.Image>() };
    sc.bld.set(b.id, st);
    b.wings.forEach((w, i) => {
      const pg = w.pg ?? 0, tex = `buildings${pg}`;
      // 精灵尺寸优先取 world.json 里记的（这样图集页不用先下载）；老编译产物没有，才从已加载的图集里量
      const fw = w.w ?? sc.textures.getFrame(tex, w.k).width, fh = w.h ?? sc.textures.getFrame(tex, w.k).height;
      st.rects.push({ l: w.x, r: w.x + fw, t: w.y, base: w.base });
      sc.stream.add({ x: w.x, y: w.y, w: fw, h: fh, make: () => {
        let im: Phaser.GameObjects.Image | undefined, dead = false;
        withBuildingPage(sc, pg, () => {
          if (dead) return;
          im = sc.add.image(w.x, w.y, tex, w.k).setOrigin(0).setDepth(w.base + i * 0.01).setAlpha(st.alpha); st.imgs.add(im);
        });
        return { destroy: () => { dead = true; if (im) { st.imgs.delete(im); im.destroy(); } } };
      } });
    });
  }
  for (const l of sc.wf.labels ?? []) {
    sc.stream.add({ x: l.x * TILE - 120, y: l.y * TILE - 20, w: 240, h: 40, make: () => makeLabel(sc, l) });
  }
  for (const [x, y, h] of sc.wf.lamps) {
    sc.stream.add({ x: x * TILE - 48, y: y * TILE - (h ?? 26) - 48, w: 96, h: 96, make: () => {
      const gl = sc.add.image(x * TILE, y * TILE - (h ?? 26), 'glow').setDepth(1e6 + 1).setBlendMode(Phaser.BlendModes.ADD).setScale(1.5).setAlpha(sc.clock.nightness * 0.9);
      sc.glowActive.add(gl);
      return { destroy: () => { sc.glowActive.delete(gl); gl.destroy(); } };
    } });
  }
  // 水面动画：只翻当前存在的水块
  sc.time.addEvent({ delay: 340, loop: true, callback: () => {
    sc.waterFrame = (sc.waterFrame + 1) % sc.wf.water.frames;
    for (const arr of sc.waterActive.values()) arr.forEach((img, i) => img.setVisible(sc.waterFrame === i + 1));
  } });
}

/** 建筑图集按页按需加载：页已在内存就立刻执行，否则加载这一页，到了再执行（同一页的请求合并，失败了下次再试） */
export function withBuildingPage(sc: WorldScene, pg: number, cb: () => void) {
  const key = `buildings${pg}`;
  if (sc.textures.exists(key)) { cb(); return; }
  const waiting = sc.bldWait.get(pg);
  if (waiting) { waiting.push(cb); return; }
  sc.bldWait.set(pg, [cb]);
  sc.load.once(`filecomplete-atlasjson-${key}`, () => { const l = sc.bldWait.get(pg) ?? []; sc.bldWait.delete(pg); l.forEach((f) => f()); });
  sc.load.on('loaderror', (f: Phaser.Loader.File) => { if (f.key === key) sc.bldWait.delete(pg); });   // 失败：清掉登记，下次视野再覆盖到时重试
  sc.load.atlas(key, `${WD}/atlas-buildings-${pg}.webp`, `${WD}/atlas-buildings-${pg}.json`);
  if (!sc.load.isLoading()) sc.load.start();
}

/** 地面块：纹理不在内存就异步加载，销毁时释放纹理 */
export function makeChunk(sc: WorldScene, key: string, x: number, y: number, water: boolean): Destroyable {
  const texs = [`ground_${key}`, ...(water ? Array.from({ length: sc.wf.water.frames - 1 }, (_, i) => `water${i + 1}_${key}`) : [])];
  const parts: Phaser.GameObjects.Image[] = []; let dead = false;
  const build = () => {
    if (dead) { texs.forEach((t) => sc.textures.exists(t) && sc.textures.remove(t)); return; }
    parts.push(sc.add.image(x, y, texs[0]).setOrigin(0).setDepth(-100000));
    if (water) { const arr = texs.slice(1).map((t) => sc.add.image(x, y, t).setOrigin(0).setDepth(-99999).setVisible(false)); parts.push(...arr); sc.waterActive.set(key, arr); }
  };
  const need = texs.filter((t) => !sc.textures.exists(t));
  if (!need.length) build();
  else {
    let left = need.length;
    for (const t of need) {
      const url = t.startsWith('ground_') ? `${WD}/ground/${sc.season}/c_${key}.webp` : `${WD}/ground/w${t.charAt(5)}_${key}.webp`;
      sc.load.once(`filecomplete-image-${t}`, () => { if (--left === 0) build(); });
      sc.load.image(t, url);
    }
    if (!sc.load.isLoading()) sc.load.start();
  }
  return { destroy: () => { dead = true; parts.forEach((p) => p.destroy()); sc.waterActive.delete(key); texs.forEach((t) => sc.textures.exists(t) && sc.textures.remove(t)); } };
}

/** 世界内文字牌（校名/大门/门头招牌） */
export function makeLabel(sc: WorldScene, l: NonNullable<WorldFile['labels']>[number]): Destroyable {
  const objs: Phaser.GameObjects.GameObject[] = [];
  const ia = l.id ? sc.wf.interacts?.find((i) => i.id === l.id) : undefined;
  const st = l.id ? (sc.egg.get(l.id) ?? sc.egg.set(l.id, { step: 0 }).get(l.id)!) : undefined;
  const t = sc.add.text(l.x * TILE, l.y * TILE, st && ia && st.step > 0 ? ia.texts[st.step - 1] : l.text, { fontFamily: 'ArkPixel', fontSize: `${l.size}px`, color: l.color ?? '#f4efd8', stroke: l.stroke ?? '#0e2230', strokeThickness: l.plate ? 0 : 2 })
    .setOrigin(0.5).setDepth(l.y * TILE + 61 + (l.ds ?? 0));
  objs.push(t);
  if (st) st.text = t;
  if (l.plate) {
    const w = Math.round(t.width) + 8, h = Math.round(t.height) + 4;
    objs.push(sc.add.rectangle(Math.round(l.x * TILE), Math.round(l.y * TILE), w + 2, h + 2, 0xe4e0ca).setDepth(l.y * TILE + 59 + (l.ds ?? 0)));
    objs.push(sc.add.rectangle(Math.round(l.x * TILE), Math.round(l.y * TILE), w, h, 0x2f4f66).setDepth(l.y * TILE + 60 + (l.ds ?? 0)));
  }
  return { destroy: () => { objs.forEach((o) => o.destroy()); if (st) st.text = undefined; } };
}

/** 玩家脚点落在某翼体精灵范围内、且位于其南缘之北（被楼挡住）→ 整栋楼淡出 */
export function updateBuildingFade(sc: WorldScene) {
  const px = sc.player.x, py = sc.player.y;
  for (const f of sc.bld.values()) {
    if (f.imgs.size === 0) continue;
    let behind = false;
    for (const r of f.rects) if (px >= r.l && px <= r.r && py >= r.t + 10 && py < r.base - 1) { behind = true; break; }
    const target = behind ? 0.32 : 1;
    if (Math.abs(f.alpha - target) < 0.01) { f.alpha = target; continue; }
    f.alpha += (target - f.alpha) * 0.22;
    for (const im of f.imgs) im.setAlpha(f.alpha);
  }
}

export function buildLighting(sc: WorldScene) {
  // 昼夜：整张世界的 MULTIPLY 叠色
  sc.tintRect = sc.add.rectangle(0, 0, sc.world.pxW, sc.world.pxH, 0xffffff).setOrigin(0).setDepth(1e6).setBlendMode(Phaser.BlendModes.MULTIPLY);
  // 路灯光晕贴图
  const tex = sc.textures.createCanvas('glow', 64, 64)!;
  const g = tex.getContext().createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,236,170,0.95)'); g.addColorStop(0.45, 'rgba(255,214,120,0.35)'); g.addColorStop(1, 'rgba(255,200,100,0)');
  tex.getContext().fillStyle = g; tex.getContext().fillRect(0, 0, 64, 64); tex.refresh();
}

/** 大地图上的建筑名：除了宿舍楼（有"一社区"等整片地名）、门卫室这类小东西之外，每栋有名字的楼都标；同名的只留最大的一栋；校园商店/校园墙也标上 */
export function mapLabels(sc: WorldScene) {
  const skip = /(社区[A-Z]楼|门卫室|门岗|立柱|岗亭|配套用房|平台|看台|值班室)$/;
  const best = new Map<string, { name: string; x: number; y: number; area: number }>();
  for (const b of sc.wf.buildings) {
    if (!b.name || skip.test(b.name)) continue;
    const area = b.bbox.w * b.bbox.h, cur = best.get(b.name);
    if (!cur || area > cur.area) best.set(b.name, { name: b.name, x: b.bbox.x + b.bbox.w / 2, y: b.bbox.y + b.bbox.h / 2, area });
  }
  for (const b of PLAZA_BUILDINGS) best.set(b.name, { name: b.name, x: b.x, y: b.y - b.d / 2, area: b.w * b.d });
  return [...best.values()];
}
