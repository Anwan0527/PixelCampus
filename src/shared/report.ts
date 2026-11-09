/** 举报：能举报什么、理由、限制。客户端、服务器共用。 */
import { cleanText } from './profile';
import type { ChannelId } from './channels';

/** 能举报的东西：公屏消息 / 私聊消息 / 留言板留言 / 校园墙帖子或评论 / 地点留言或评论 / 玩家本人（昵称、签名不合适） */
export const REPORT_KINDS = ['chat', 'dm', 'board', 'wall', 'place', 'user'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export const REPORT_KIND_NAMES: Record<ReportKind, string> = { chat: '公屏', dm: '私聊', board: '留言板', wall: '校园墙', place: '地点留言', user: '玩家资料' };
export const REPORT_REASONS = ['辱骂 / 攻击', '广告 / 刷屏', '色情低俗', '违法 / 敏感内容', '骚扰 / 威胁', '其他'] as const;
export const REPORT_NOTE_MAX = 40;        // 补充说明最多几个字
export const REPORT_COOLDOWN_MS = 3000;   // 同一个人两次举报的最短间隔
export const REPORT_DAILY = 20;           // 同一个人 24 小时内最多举报几次（防止拿举报刷管理员）
export const REPORT_CTX_MAX = 6;          // 留存的上下文条数（被举报的那条在内）

export const validReportKind = (k: unknown): k is ReportKind => typeof k === 'string' && (REPORT_KINDS as readonly string[]).includes(k);
export const validReportReason = (r: unknown): r is number => Number.isInteger(r) && (r as number) >= 0 && (r as number) < REPORT_REASONS.length;
export const cleanReportNote = (s: unknown) => (typeof s === 'string' ? cleanText(s, REPORT_NOTE_MAX) : '');

/** 举报时留存的一行证据（原文；之后内容被撤回/删除了，管理员还能看到当时说了什么） */
export interface ReportLine { from: string; text: string; ts: number; /** 是被举报的那一条 */ hit?: boolean }
/** 管理员看到的一条举报 */
export interface ReportEntry {
  id: number; ts: number; kind: ReportKind;
  /** kind = chat 时被举报的话所在的频道（world 不写） */ ch?: ChannelId;
  /** 举报人 */ by: number; byName: string;
  /** 被举报的人（校园号；找不到是 0）和他当时的名字 */ target: number; targetName: string;
  /** 被举报内容的编号：公屏 = mid，私聊 = 私聊消息 id，留言板 = 留言 id，校园墙 = 帖子 id（评论 = 帖子 id + cid），玩家 = 校园号 */ ref: number; cid?: number;
  reason: number; note?: string;
  /** 被举报的内容原文 + 上下文（私聊只留这一小段，不是整段聊天） */ lines: ReportLine[];
  /** 发生在哪个世界（公共世界不写） */ w?: string;
  /** 处理情况：没有 = 还没处理 */
  done?: { ts: number; by: string; verdict: 'done' | 'dismiss'; action?: string };
  /** 同一条内容被多少人举报过（含这次） */ same: number;
}
