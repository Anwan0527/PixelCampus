import { CHANNELS, type ChannelId } from '@/shared/channels';
import type { NetClient } from '@/net/client';
import type { ChatPanel } from './ChatPanel';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const DESC: Record<ChannelId, string> = {
  world: '当前世界里所有人说的话（公共世界 = 所有人；个人世界 = 只有自己；好友世界 = 你们几个）',
  near: '只有能看见你的人才听得到，适合当面说话',
  party: '队友之间说话，组队后自动出现、队伍解散就消失',
  sys: '系统提示、好友上线通知等（不能在这里发言）',
};

/**
 * 频道管理（「设置」面板的「聊天」页）：每个频道两个开关——
 *  - 开启：关闭后服务器不再给你发这个频道的话，你也不能在里面发言；
 *  - 静音：还收，但不弹小条、不冒气泡，只在标签上留个灰色的未读数。
 * 改动马上生效并存进档案（换设备也在）；没连上服务器时只在本次有效。
 */
export class ChannelSection {
  readonly view = el('div', 'set-sec');
  private body = el('div', 'chans-body');
  /** 设置面板在显示这一页时才需要刷新 */
  visible: () => boolean = () => false;

  constructor(private net: NetClient, private chat: ChatPanel) {
    this.view.append(el('div', 'create-sub', '关闭 = 不再收到这个频道的话，也不能在里面发言；静音 = 照常收，但不提示、不冒气泡。'), this.body);
    net.onChannels(() => { if (this.visible()) this.render(); });
    this.render();
  }

  render() {
    this.body.replaceChildren();
    for (const c of this.chat.state.channels) {
      const meta = CHANNELS[c.id];
      const row = el('div', 'chans-row' + (c.on ? '' : ' off'));
      const name = el('div', 'chans-name'); name.append(el('span', 'chans-ico', meta.icon), el('b', undefined, meta.name));
      if (c.n !== undefined) name.append(el('span', 'adm-uid', ` ${c.n} 人`));
      const toggle = (label: string, checked: boolean, on: (v: boolean) => void) => {
        const l = el('label', 'chans-sw'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = checked;
        cb.addEventListener('change', () => on(cb.checked)); l.append(cb, document.createTextNode(` ${label}`)); return l;
      };
      const sw = el('div', 'chans-sws');
      sw.append(
        toggle('开启', c.on, (v) => { this.chat.patchChannel(c.id, { on: v }); this.net.chSet(c.id, { on: v }); this.render(); }),
        toggle('静音', c.mute, (v) => { this.chat.patchChannel(c.id, { mute: v }); this.net.chSet(c.id, { mute: v }); this.render(); }),
      );
      row.append(name, el('div', 'chans-desc', DESC[c.id]), sw);
      this.body.append(row);
    }
    if (!this.chat.state.has('party')) this.body.append(el('div', 'create-sub', '👥 队伍频道：和好友组队后自动出现。'));
    if (this.net.status !== 'online') this.body.append(el('div', 'create-sub', '现在没连上服务器：这里的设置只在本次有效。'));
  }
}
