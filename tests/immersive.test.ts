import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

// 样式已按功能分成 src/ui/styles/NN-*.css（style.css 只是入口清单）：断言针对全部分片拼起来的内容
const stylesDir = new URL('../src/ui/styles/', import.meta.url);
const css = readdirSync(stylesDir).filter((f) => f.endsWith('.css')).sort().map((f) => readFileSync(new URL(f, stylesDir), 'utf8')).join('');
/** 取出所有以 body.immersive 开头的规则里写的选择器（只看 display:none 的那几条） */
const hidden = (() => {
  const out = new Set<string>();
  for (const m of css.matchAll(/(body\.immersive[^{}]*)\{[^}]*display:\s*none[^}]*\}/g)) for (const sel of m[1].split(',')) out.add(sel.trim());
  return out;
})();

describe('沉浸模式的样式规则', () => {
  it('藏起所有常驻界面：头像、时钟、金币、世界标签、右侧入口、菜单按钮、小地图（大地图除外）、操作说明、横幅、聊天框（说话时除外）、手机的 + − 聊天 ☰', () => {
    for (const sel of ['#profile-chip', '#clock', '#coin-pill', '.world-chip', '#side-btns', '#menu-btn', '#menu-pop', '#controls', '#banner']) expect(hidden.has(`body.immersive ${sel}`), sel).toBe(true);
    expect(hidden.has('body.immersive #minimap:not(.big)')).toBe(true);   // 按 M 打开的大地图要能显示
    expect(hidden.has('body.immersive #chat:not(.pop):not(.open)')).toBe(true); // 说话时（.pop）聊天框临时出现
    expect(hidden.has('body.immersive.touch .tb-wrap')).toBe(true);        // 手机：只留互动键
  });
  it('不能藏的：互动提示、NPC 对话框、「互动」大按钮、摇杆、作者水印、各种弹出的面板', () => {
    for (const sel of ['#hint', '#dialog', '.tb-act', '#touch-zone', '#wm', '.screen', '#party-toasts', '#run-toasts', '#trade-toasts']) {
      expect([...hidden].some((h) => h === `body.immersive ${sel}` || h.endsWith(` ${sel}`)), sel).toBe(false);
    }
  });
  it('有退出按钮和提示条的样式；退出按钮只在沉浸模式下显示', () => {
    expect(css).toMatch(/#imm-exit\s*\{[^}]*display:\s*none/); expect(css).toMatch(/body\.immersive #imm-exit\s*\{[^}]*display:\s*block/); expect(css).toContain('#imm-toast');
  });
  it('手机聊天不再有浮现小条（#chat-peek）', () => { expect(css).not.toContain('chat-peek'); });
  it('手机竖屏紧凑布局：窄屏竖屏的媒体查询里缩小头像 / 时钟 / 小地图，并把小地图放到时钟下面', () => {
    const m = /@media \(orientation: portrait\) and \(max-width: 480px\) \{([\s\S]*?)\n\}\n/.exec(css); expect(m).toBeTruthy();
    for (const k of ['#profile-chip', '#coin-pill', '.world-chip', '#clock', '#minimap:not(.big)', '.tb-act']) expect(m![1], k).toContain(k);
  });
});
