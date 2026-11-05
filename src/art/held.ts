/**
 * 手持物的像素图（书、奶茶、咖啡、手机、篮球、相机）：每件 3 个视角——down（面朝镜头）、right（侧面，朝左由游戏翻转）、up（背面）。
 * 小图 + 彩色柔和描边；构建时打进 atlas-held，游戏里按人物朝向挂在手的位置（Character.syncHeld）。
 * 拿法：chest = 捧在胸前（带两只小手），hand = 提在身侧（图底就是手的位置）。
 */
import { Img, hex, type RGBA } from './px-core.ts';

interface Art { pal: Record<string, string>; down: string[]; right: string[]; up: string[] }
const SKIN = '#f0bf94';
export const HELD_ART: Record<string, Art> = {
  book: {
    pal: { B: '#3f78c0', b: '#2f5c9a', w: '#f6f0dc', p: '#e8dcc0', h: SKIN },
    down: ['hBBBBBBBh', 'hBbwwwbBh', 'hBBBBBBBh', 'hBbwwBBBh', 'hBBBBBBBh', '.ppppppp.'],
    right: ['hBBp', 'hBBp', 'hBBp', 'hBBp', 'hBBp'],
    up: ['hBBBBBBBh', 'hBBBBBBBh', 'hBBBBBBBh', 'hBBBBBBBh', 'hBBBBBBBh', '.ppppppp.'],
  },
  tea: {
    pal: { L: '#f4f0e8', c: '#dfeaf2', T: '#b88a5a', P: '#4a3022', s: '#e87aa0', h: SKIN },
    down: ['...s.', '.LLLs', '.LLL.', 'cTTTc', 'cTTTc', 'cPPPc', 'cPPPc', '.cPc.', '..h..'],
    right: ['..s', '.LL', '.LL', 'cTc', 'cTc', 'cPc', 'cPc', '.cP', '.h.'],
    up: ['...s.', '.LLLs', '.LLL.', 'cTTTc', 'cTTTc', 'cPPPc', 'cPPPc', '.cPc.', '..h..'],
  },
  coffee: {
    pal: { w: '#f4f0e8', c: '#e8dcc0', S: '#8a5a3a', h: SKIN },
    down: ['.www.', 'wwwww', 'ccccc', 'cSSSc', 'cSSSc', '.ccc.', '..h..'],
    right: ['.ww', 'www', 'ccc', 'cSc', 'cSc', '.cc', '.h.'],
    up: ['.www.', 'wwwww', 'ccccc', 'cSSSc', 'cSSSc', '.ccc.', '..h..'],
  },
  phone: {
    pal: { d: '#2a2a34', s: '#9fd0f0', S: '#d8f0ff', h: SKIN },
    down: ['hddddh', 'hdSssh', 'hdsssh', 'hdsssh', 'hdsssh', 'hddddh'],
    right: ['hdd', 'hdd', 'hdd', 'hdd', 'hdd'],
    up: ['hddddh', 'hddddh', 'hddddh', 'hddddh', 'hddddh', 'hddddh'],
  },
  ball: {
    pal: { o: '#e8803a', L: '#7a3a18', O: '#f0a060', h: SKIN },
    down: ['..ooo..', '.oOoLo.', 'ooooLoo', 'oLLLLLo', 'ooooLoo', '.oLooo.', '..ooo..'],
    right: ['..ooo..', '.oOoLo.', 'oooLooo', 'oLLLLLo', 'oooLooo', '.oLooo.', '..ooo..'],
    up: ['..ooo..', '.oooLo.', 'ooooLoo', 'oLLLLLo', 'ooooLoo', '.oLooo.', '..ooo..'],
  },
  camera: {
    pal: { g: '#8a8a96', G: '#b4b4c0', D: '#34343e', L: '#5a6a9a', W: '#dce8ff', r: '#d6405c', h: SKIN },
    down: ['h.rG....h', 'hGGGGGGGh', 'hgDDLLDgh', 'hgDLWLDgh', 'hgDDLLDgh', 'hgggggggh'],
    right: ['gGgg', 'gDDg', 'gDWg', 'gDDg', 'gggg'],
    up: ['h.rG....h', 'hGGGGGGGh', 'hgggggggh', 'hgggggggh', 'hgggggggh', 'hgggggggh'],
  },
};

const draw = (art: Art, rows: string[]): Img => {
  const w = Math.max(...rows.map((r) => r.length)), im = new Img(w, rows.length);
  rows.forEach((r, y) => [...r].forEach((ch, x) => { const c = art.pal[ch]; if (c) im.set(x, y, hex(c) as RGBA); }));
  return im.outlinedSoft(0.42, [40, 28, 64, 255]);
};
/** 全部手持物帧：key = `held_${物品}_${视角}` */
export function buildHeld(): Record<string, Img> {
  const out: Record<string, Img> = {};
  for (const [k, a] of Object.entries(HELD_ART)) for (const v of ['down', 'right', 'up'] as const) out[`held_${k}_${v}`] = draw(a, a[v]);
  return out;
}
