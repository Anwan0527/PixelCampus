import Phaser from 'phaser';

/**
 * 节日的程序画贴图（BootScene 里调用一次）：
 *  - 四件限定头饰 fz_1..fz_4（樱花发饰 / 荷花灯笼 / 玉兔发箍 / 毛线围巾帽），挂在人物头顶；
 *  - 节日氛围粒子的可平铺贴图：飘落的花瓣、桂花、萤火虫、彩灯（和雨雪一样是贴着镜头的平铺层）。
 * 全部像素风、带深色描边，和人物同一个画风。
 */
type Ctx = CanvasRenderingContext2D;
const OUT = [38, 26, 30];

function canvas(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: Ctx) => void, outline = false) {
  const tex = scene.textures;
  if (tex.exists(key)) return;
  const c = tex.createCanvas(key, w, h)!, g = c.getContext(); g.imageSmoothingEnabled = false; draw(g);
  if (outline) { // 描边：所有"空白但挨着有色像素"的格子画成深色
    const d = g.getImageData(0, 0, w, h), a = d.data, out = new Uint8ClampedArray(a);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (a[(y * w + x) * 4 + 3] > 0) continue;
      if ([[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([nx, ny]) => nx >= 0 && ny >= 0 && nx < w && ny < h && a[(ny * w + nx) * 4 + 3] > 0)) { const o = (y * w + x) * 4; out[o] = OUT[0]; out[o + 1] = OUT[1]; out[o + 2] = OUT[2]; out[o + 3] = 255; }
    }
    d.data.set(out); g.putImageData(d, 0, 0);
  }
  c.refresh();
}
const rect = (g: Ctx, c: string, x: number, y: number, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const rnd = (seed: number) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

/** 头饰的贴图尺寸（Player 据此把它摆在头顶：底边中点对着头顶） */
export const FZ_SIZE: Record<number, { w: number; h: number }> = { 1: { w: 17, h: 12 }, 2: { w: 14, h: 12 }, 3: { w: 16, h: 20 }, 4: { w: 16, h: 14 } };

export function makeFestivalTextures(scene: Phaser.Scene) {
  // 1 樱花发饰：发夹上三朵樱花
  canvas(scene, 'fz_1', 17, 12, (g) => {
    const flower = (cx: number, cy: number) => { for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) rect(g, '#f7a8c4', cx + dx, cy + dy); rect(g, '#fde0ea', cx - 1, cy - 1); rect(g, '#fff2a0', cx, cy); };
    flower(3, 7); flower(8, 3); flower(13, 7);
    rect(g, '#e07a9c', 5, 9, 7, 1); rect(g, '#f7a8c4', 6, 8, 5, 1); // 发夹
  }, true);
  // 2 荷花灯笼：一朵发光的粉荷花
  canvas(scene, 'fz_2', 14, 12, (g) => {
    rect(g, '#ffd0e0', 6, 1, 2, 1); rect(g, '#ffd0e0', 5, 2, 4, 1); rect(g, '#ffe6ee', 6, 2, 2, 1);
    rect(g, '#f6a0c0', 2, 3, 3, 2); rect(g, '#f6a0c0', 9, 3, 3, 2); rect(g, '#ffd0e0', 5, 3, 4, 3);
    rect(g, '#ee80a8', 1, 5, 4, 2); rect(g, '#ee80a8', 9, 5, 4, 2); rect(g, '#f6a0c0', 4, 5, 6, 2);
    rect(g, '#d8608c', 3, 7, 8, 2); rect(g, '#8ac060', 5, 9, 4, 1);
    rect(g, '#fff0a0', 6, 4, 2, 2); // 灯芯
  }, true);
  // 3 玉兔发箍：两只长耳朵 + 发箍
  canvas(scene, 'fz_3', 16, 20, (g) => {
    for (const x0 of [2, 10]) {
      rect(g, '#fafafa', x0, 1, 4, 14); rect(g, '#fafafa', x0 + 1, 0, 2, 1);
      rect(g, '#f6b8c8', x0 + 1, 3, 2, 10);
    }
    rect(g, '#d8d0d8', 2, 15, 12, 2); rect(g, '#f6b8c8', 4, 15, 8, 1); rect(g, '#ff9ab8', 7, 14, 2, 3);
  }, true);
  // 4 毛线围巾帽：红色毛线帽 + 白绒球
  canvas(scene, 'fz_4', 16, 14, (g) => {
    rect(g, '#f4f0e8', 6, 0, 4, 4); rect(g, '#ffffff', 7, 1, 2, 2); // 绒球
    rect(g, '#d8444c', 3, 4, 10, 3); rect(g, '#e85a62', 2, 7, 12, 1); rect(g, '#d8444c', 2, 8, 12, 2);
    rect(g, '#f4f0e8', 1, 10, 14, 3); for (let x = 2; x < 15; x += 2) rect(g, '#d8d0c4', x, 11, 1, 2); // 白色翻边的毛线纹
    rect(g, '#b8343c', 4, 5, 1, 2); rect(g, '#b8343c', 8, 5, 1, 2); rect(g, '#b8343c', 11, 5, 1, 2);
  }, true);

  // ---- 氛围粒子的平铺贴图（环绕画，才能无缝平铺）
  const scatter = (key: string, size: number, n: number, seed: number, one: (g: Ctx, x: number, y: number, r: () => number) => void) => canvas(scene, key, size, size, (g) => {
    const r = rnd(seed);
    for (let i = 0; i < n; i++) { const x = Math.floor(r() * size), y = Math.floor(r() * size); for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) one(g, x + ox, y + oy, r); }
  });
  scatter('fx_petal', 128, 16, 41, (g, x, y) => { rect(g, '#f9b8cc', x, y, 3, 2); rect(g, '#fde0ea', x, y, 1, 1); rect(g, '#e888a8', x + 2, y + 1, 1, 1); });
  scatter('fx_leaf', 128, 24, 53, (g, x, y, r) => { rect(g, r() < 0.5 ? '#f0c850' : '#e0a82a', x, y, 2, 2); });
  scatter('fx_firefly', 128, 14, 67, (g, x, y) => { rect(g, 'rgba(240,255,120,0.28)', x - 1, y - 1, 4, 4); rect(g, '#f8ffa0', x, y, 2, 2); });
  scatter('fx_lights', 128, 16, 79, (g, x, y, r) => { const c = ['#ff6a6a', '#ffd84a', '#6ae06a', '#6ab4ff'][Math.floor(r() * 4)]; rect(g, 'rgba(255,255,255,0.22)', x - 1, y - 1, 4, 4); rect(g, c, x, y, 2, 2); });
}
