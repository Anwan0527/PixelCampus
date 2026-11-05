import { REPORT_KIND_NAMES, REPORT_NOTE_MAX, REPORT_REASONS, type ReportKind } from '@/shared/report';
import type { NetClient } from '@/net/client';
import type { ChannelId } from '@/shared/channels';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export interface ReportTarget {
  kind: ReportKind;
  /** 内容编号（公屏 = mid，私聊 = 私聊消息 id，留言板 = 留言 id，校园墙 = 帖子 id，玩家 = 校园号） */
  ref: number;
  /** 校园墙的评论编号 */
  cid?: number;
  /** 聊天举报：被举报的话所在的频道（不写 = 世界） */
  ch?: ChannelId;
  /** 弹窗里给举报人看的内容摘要（谁说了什么） */
  preview: string;
}

/**
 * 举报弹窗：选理由（可再补一句说明）→ 发给服务器 → 管理员在「举报」页处理。
 * 所有能举报的地方（公屏、私聊、留言板、校园墙、玩家资料）都调用 askReport()，不用各自接线。
 * 内容摘要只用 textContent 显示；真正的限制（频率、重复、能不能举报这条）都在服务器。
 */
export class ReportDialog {
  private root = el('div', 'screen hidden');
  private quote = el('div', 'adm-quote');
  private reasons = el('div', 'seg-row');
  private note = el('input');
  private msg = el('div', 'tp-msg');
  private send = el('button', 'btn primary', '提交举报');
  private reason = 0;
  private target: ReportTarget | null = null;
  private closeTimer = 0;

  constructor(private net: NetClient) {
    const panel = el('div', 'box tp report');
    const head = el('div', 'board-head');
    const close = el('button', 'btn', '✕'); close.type = 'button'; close.setAttribute('aria-label', '关闭举报'); close.addEventListener('click', () => this.close());
    head.append(el('div', 'board-title', '⚑ 举报'), close);
    REPORT_REASONS.forEach((name, i) => {
      const b = el('button', 'seg' + (i === 0 ? ' on' : ''), name); b.type = 'button';
      b.addEventListener('click', () => { this.reason = i; [...this.reasons.children].forEach((c, j) => c.classList.toggle('on', j === i)); });
      this.reasons.append(b);
    });
    this.note.type = 'text'; this.note.maxLength = REPORT_NOTE_MAX; this.note.placeholder = `补充说明（可不填，最多 ${REPORT_NOTE_MAX} 字）`; this.note.autocomplete = 'off'; this.note.spellcheck = false; this.note.style.width = '100%';
    this.note.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); this.submit(); } else if (e.key === 'Escape') this.close(); });
    this.send.type = 'button'; this.send.addEventListener('click', () => this.submit());
    const cancel = el('button', 'btn', '取消'); cancel.type = 'button'; cancel.addEventListener('click', () => this.close());
    const row = el('div', 'adm-actions'); row.append(this.send, cancel);
    panel.append(head, el('div', 'create-sub', '请选一个最接近的理由。管理员会查看并处理；恶意举报同样会被处理。'), this.quote, this.reasons, this.note, this.msg, row);
    this.root.append(panel);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.close(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.close(); });
    (document.getElementById('hud') ?? document.body).append(this.root);
    net.handlers.reportResult = (ok, text) => {
      if (!this.isOpen) return;
      this.msg.textContent = text; this.msg.className = `tp-msg ${ok ? 'ok' : 'bad'}`; this.send.disabled = false;
      if (ok) { this.send.disabled = true; window.clearTimeout(this.closeTimer); this.closeTimer = window.setTimeout(() => this.close(), 1400); }
    };
    current = this;
  }
  get isOpen() { return !this.root.classList.contains('hidden'); }
  open(t: ReportTarget) {
    window.clearTimeout(this.closeTimer);
    this.target = t; this.reason = 0; this.note.value = ''; this.msg.textContent = ''; this.send.disabled = false;
    [...this.reasons.children].forEach((c, j) => c.classList.toggle('on', j === 0));
    this.quote.textContent = `${REPORT_KIND_NAMES[t.kind]}：${t.preview.length > 120 ? `${t.preview.slice(0, 120)}…` : t.preview}`;
    this.root.classList.remove('hidden');
  }
  close() { window.clearTimeout(this.closeTimer); this.note.blur(); this.root.classList.add('hidden'); this.target = null; }
  private submit() {
    const t = this.target; if (!t) return;
    if (this.net.status !== 'online') { this.msg.textContent = '没连上服务器，现在没法举报'; this.msg.className = 'tp-msg bad'; return; }
    this.send.disabled = true; this.msg.textContent = '提交中…'; this.msg.className = 'tp-msg ok';
    this.net.report(t.kind, t.ref, this.reason, this.note.value.trim(), t.cid, t.ch);
    window.setTimeout(() => { if (this.isOpen && !this.closeTimer) this.send.disabled = false; }, 4000); // 兜底：没收到回执也别一直卡着
  }
}

let current: ReportDialog | null = null;
/** 弹出举报窗口（没有初始化过就什么都不做） */
export function askReport(t: ReportTarget) { current?.open(t); }
