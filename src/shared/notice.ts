/** 公告栏：格式与清洗。客户端、服务器共用。公告可以多行（更新日志），玩家端一律用 textContent 渲染。 */
export interface Notice { id: number; title: string; body: string; ts: number }
export const NOTICE_TITLE_MAX = 40;
export const NOTICE_BODY_MAX = 1500;
export const NOTICE_KEEP = 30; // 最多保留多少条历史公告

/** 多行文本清洗：去控制/零宽字符（保留换行）、统一换行、行尾去空白、连续空行最多一行、按"字"截断 */
export function cleanMultiline(s: unknown, max: number): string {
  if (typeof s !== 'string') return '';
  const t = s.replace(/\r\n?/g, '\n').replace(/\t/g, '  ')
    .replace(/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/gu, (c) => (c === '\n' ? c : ' '))
    .split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return Array.from(t).slice(0, max).join('');
}
export const cleanNoticeTitle = (s: unknown) => cleanMultiline(s, NOTICE_TITLE_MAX).replace(/\n+/g, ' ');
export const cleanNoticeBody = (s: unknown) => cleanMultiline(s, NOTICE_BODY_MAX);
