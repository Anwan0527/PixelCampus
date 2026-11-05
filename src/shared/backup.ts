/**
 * 身份备份码：把浏览器里的身份 token 编成一串好抄好认的字符，换浏览器/清了数据之后输进去就能找回身份
 * （校园号、好友、私聊、背包、小猫好感度都跟着身份存在服务器上，所以备份的只是"钥匙"）。
 *
 * 格式：`PX-` + Crockford Base32（去掉了容易看混的 I L O U），每 5 个字符一组，末尾带 16 位校验，抄错一两个字符能被发现。
 * - 版本 1：token 是 48 位十六进制（现在所有客户端生成的都是这种）→ 24 字节，码长约 60 字符
 * - 版本 2：其他合法 token（16–64 位字母数字/横线/下划线）→ 原样按字节编码，码会更长
 * 备份码 = 钥匙：谁拿到谁就能用这个身份。界面上要提醒玩家别随便发给别人。
 */
import { validToken } from './protocol';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const PREFIX = 'PX';

function crc16(bytes: readonly number[]): number {
  let crc = 0xffff;
  for (const b of bytes) { crc ^= b << 8; for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff; }
  return crc;
}

function toBase32(bytes: readonly number[]): string {
  let bits = 0, acc = 0, out = '';
  for (const b of bytes) { acc = (acc << 8) | b; bits += 8; while (bits >= 5) { out += ALPHABET[(acc >> (bits - 5)) & 31]; bits -= 5; } acc &= (1 << bits) - 1; }
  if (bits > 0) out += ALPHABET[(acc << (5 - bits)) & 31];
  return out;
}
function fromBase32(s: string): number[] | null {
  let bits = 0, acc = 0; const out: number[] = [];
  for (const ch of s) {
    const v = ALPHABET.indexOf(ch); if (v < 0) return null;
    acc = (acc << 5) | v; bits += 5;
    if (bits >= 8) { out.push((acc >> (bits - 8)) & 255); bits -= 8; acc &= (1 << bits) - 1; }
  }
  return out;
}

/** 把 token 编成备份码；token 不合法返回 null */
export function encodeBackup(token: string): string | null {
  if (!validToken(token)) return null;
  const body: number[] = /^[0-9a-f]{48}$/.test(token)
    ? [1, ...Array.from({ length: 24 }, (_, i) => parseInt(token.slice(i * 2, i * 2 + 2), 16))]
    : [2, token.length, ...Array.from(token, (c) => c.charCodeAt(0))];
  const c = crc16(body);
  const text = toBase32([...body, c >> 8, c & 255]);
  return `${PREFIX}-${text.match(/.{1,5}/g)!.join('-')}`;
}

/** 容错整理：大小写、空格/连字符/其他分隔符都忽略；O→0、I/L→1（Crockford 约定） */
function normalize(s: string): string {
  return s.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/[^0-9A-Z]/g, '');
}

function decodeBody(text: string): string | null {
  const bytes = fromBase32(text);
  if (!bytes || bytes.length < 4) return null;
  const ver = bytes[0];
  let len: number;
  if (ver === 1) len = 25; else if (ver === 2) len = bytes[1] === undefined ? -1 : 2 + bytes[1]; else return null;
  if (len < 0 || bytes.length < len + 2) return null;
  const body = bytes.slice(0, len), c = crc16(body);
  if (bytes[len] !== c >> 8 || bytes[len + 1] !== (c & 255)) return null;
  // 多余的字节只能是编码末尾补的 0 位凑出来的（最多 1 字节且为 0）
  for (let i = len + 2; i < bytes.length; i++) if (bytes[i] !== 0) return null;
  const token = ver === 1 ? body.slice(1).map((b) => b.toString(16).padStart(2, '0')).join('') : String.fromCharCode(...body.slice(2));
  return validToken(token) ? token : null;
}

/** 从玩家输入的备份码还原 token；码不对（抄错/不完整/不是备份码）返回 null */
export function decodeBackup(input: string): string | null {
  const n = normalize(input);
  if (!n) return null;
  return decodeBody(n) ?? (n.startsWith(PREFIX) ? decodeBody(n.slice(PREFIX.length)) : null);
}
