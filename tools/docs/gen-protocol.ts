/**
 * 协议索引生成器：从 src/shared/protocol.ts 的 ClientMsg / ServerMsg 联合类型里取出每种消息的类型名、方向、
 * 紧挨着它上面的注释，按前缀分组生成 docs/architecture/PROTOCOL.md。
 * 用法：npm run protocol:doc；测试 tests/protocol-doc.test.ts 会检查 docs/architecture/PROTOCOL.md 是不是最新的（加了消息没重新生成会失败）。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const GROUPS: Record<string, string> = {
  hello: '连接与身份', welcome: '连接与身份', restore: '连接与身份', kick: '连接与身份', error: '连接与身份', correct: '连接与身份', online: '连接与身份', profile: '连接与身份', whois: '连接与身份', presence: '连接与身份',
  chat: '聊天与频道', ch: '聊天与频道', dm: '私聊', friend: '好友', social: '好友', block: '好友', unblock: '好友', loc: '好友',
  inv: '背包', cats: '小猫', cat: '小猫', ride: '骑行', bike: '骑行', pax: '骑行', sit: '坐下与表情', emote: '坐下与表情', held: '手持物', fz: '节日',
  ach: '成就与称号', title: '成就与称号', quest: '任务', wq: '任务',
  fish: '钓鱼', fishdex: '钓鱼', geardex: '钓鱼', equip: '钓鱼', box: '钓鱼', craft: '钓鱼', bundle: '钓鱼', bird: '水禽', fx: '钓鱼',
  coins: '商店与经济', shop: '商店与经济', bin: '商店与经济', trade: '交易', hall: '名人堂',
  wall: '校园墙', board: '留言板（全局）', place: '地点留言板', notice: '公告', about: '关于页', report: '举报', rep: '举报',
  mon: '精灵', dorm: '宿舍', room: '宿舍与房间', hand: '牵手', party: '组队', run: '校园跑', tp: '传送', world: '世界（公共 / 个人 / 好友）',
  adm: '管理员', admin: '管理员', ball: '其他', swap: '其他', fz_state: '节日', bin_result: '商店与经济',
};
const groupOf = (t: string) => GROUPS[t] ?? GROUPS[t.split('_')[0]] ?? '其他';

function members(src: string, name: string): { t: string; note: string }[] {
  const start = src.indexOf(`export type ${name} =`);
  if (start < 0) throw new Error(`protocol.ts 里找不到 ${name}`);
  const rest = src.slice(start).split('\n');
  const out: { t: string; note: string }[] = [];
  let note: string[] = [];
  for (let i = 1; i < rest.length; i++) {
    const l = rest[i];
    if (/^(export|\/\*\*)\s/.test(l) && !l.startsWith('  ')) break; // 下一个顶层声明
    const c = /^\s{2}\/\*\*\s*(.*?)\s*(\*\/)?\s*$/.exec(l);
    if (c) { note.push(c[1]); if (!c[2]) { while (++i < rest.length && !rest[i].includes('*/')) note.push(rest[i].replace(/^\s*\*?\s?/, '')); } continue; }
    const m = /^\s{2}\| \{ t: '([a-z_0-9]+)'/.exec(l);
    if (m) { out.push({ t: m[1], note: note.join(' ').replace(/\s+/g, ' ').trim() }); note = []; continue; }
    if (/^\s*;?\s*$/.test(l) && out.length) { if (!rest[i + 1]?.trim().startsWith('|') && !rest[i + 1]?.trim().startsWith('/**')) break; }
  }
  return out;
}

export function buildProtocolDoc(root: string): string {
  const src = readFileSync(join(root, 'src/shared/protocol.ts'), 'utf8');
  const c = members(src, 'ClientMsg'), s = members(src, 'ServerMsg');
  const all = [...c.map((x) => ({ ...x, dir: '→ 服务器' })), ...s.map((x) => ({ ...x, dir: '→ 客户端' }))];
  const groups = new Map<string, typeof all>();
  for (const m of all) { const g = groupOf(m.t); (groups.get(g) ?? groups.set(g, []).get(g)!).push(m); }
  const esc = (x: string) => x.replace(/\|/g, '\\|');
  const out: string[] = [
    '<!-- 本文件由 npm run protocol:doc 根据 src/shared/protocol.ts 生成，不要手改（改了协议后重新生成） -->',
    '# 联机协议索引', '',
    `> 共 ${c.length} 种客户端消息、${s.length} 种服务器消息（另有位置上报 / 快照两种二进制帧，见 protocol.ts 的 encodePos / decodeSnapshot）。`,
    '> 字段定义以 [`src/shared/protocol.ts`](../../src/shared/protocol.ts) 为准；规则细节在 `src/shared/` 对应文件；每批功能的设计背景见 [MULTIPLAYER.md](../design/MULTIPLAYER.md) 与 [CHANGELOG.md](../CHANGELOG.md)。',
    '> 新增消息：在 protocol.ts 的联合类型里加一行并写注释 → `npm run protocol:doc` → 服务端在对应 handler 里登记。', '',
  ];
  for (const [g, list] of [...groups].sort((a, b) => a[0].localeCompare(b[0], 'zh'))) {
    out.push(`## ${g}（${list.length}）`, '', '| 消息 | 方向 | 说明 |', '|---|---|---|');
    for (const m of list) out.push(`| \`${m.t}\` | ${m.dir} | ${esc(m.note) || '—'} |`);
    out.push('');
  }
  return out.join('\n');
}

if (process.argv[1] && /gen-protocol\.ts$/.test(process.argv[1])) {
  const root = join(import.meta.dirname, '..', '..');
  writeFileSync(join(root, 'docs/architecture/PROTOCOL.md'), buildProtocolDoc(root));
  console.log('✓ 协议索引 → docs/architecture/PROTOCOL.md');
}
