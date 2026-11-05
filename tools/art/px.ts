/**
 * Node 侧的像素工具入口：内核在 src/art/px-core.ts（浏览器也用），这里只补上用 sharp 写 PNG 的实现。
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Img } from '../../src/art/px-core.ts';

export * from '../../src/art/px-core.ts';

Img.io = {
  async save(img, path) {
    await mkdir(dirname(path), { recursive: true });
    await sharp(Buffer.from(img.data.buffer), { raw: { width: img.w, height: img.h, channels: 4 } }).png({ compressionLevel: 9 }).toFile(path);
  },
  async preview(img, path, scale, bg) {
    await mkdir(dirname(path), { recursive: true });
    let s = sharp(Buffer.from(img.data.buffer), { raw: { width: img.w, height: img.h, channels: 4 } }).resize(img.w * scale, img.h * scale, { kernel: 'nearest' });
    if (bg) s = s.flatten({ background: bg });
    await s.png().toFile(path);
  },
};
