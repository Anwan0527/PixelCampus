import Phaser from 'phaser';
import { ABOUT } from '@/shared/about';
import { BootScene } from '@/scenes/BootScene';
import { WorldScene } from '@/scenes/WorldScene';
import { InteriorScene } from '@/scenes/InteriorScene';

function start() {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#1f3a24',
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    scene: [BootScene, WorldScene, InteriorScene],
    render: { powerPreference: 'high-performance' },
    input: { keyboard: { capture: [Phaser.Input.Keyboard.KeyCodes.SPACE, Phaser.Input.Keyboard.KeyCodes.UP, Phaser.Input.Keyboard.KeyCodes.DOWN] } },
  });
  // 在输入框里打字（聊天、创建角色）时关掉游戏键盘：否则 WASD/空格会被游戏截获，打不出字
  const editable = (t: EventTarget | null) => t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
  document.addEventListener('focusin', (e) => { if (editable(e.target)) game.input.keyboard!.enabled = false; });
  document.addEventListener('focusout', (e) => { if (editable(e.target)) game.input.keyboard!.enabled = true; });
}

/** 页面在后台/隐藏标签里加载时 innerWidth 可能为 0，会让 WebGL 帧缓冲创建失败；等到有尺寸再启动。 */
function whenSized(cb: () => void) {
  if (window.innerWidth > 0 && window.innerHeight > 0) { cb(); return; }
  const onResize = () => {
    if (window.innerWidth > 0 && window.innerHeight > 0) { window.removeEventListener('resize', onResize); cb(); }
  };
  window.addEventListener('resize', onResize);
}
try { console.info(`%c${ABOUT.title}%c\n© ${ABOUT.year} ${ABOUT.author} · ${ABOUT.github}\n项目：${ABOUT.repo}（欢迎提 PR）\n${ABOUT.license}`, 'font-weight:bold;font-size:14px', ''); } catch { /* 没有控制台也不影响 */ }
whenSized(start);
