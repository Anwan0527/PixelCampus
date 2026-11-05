import { validateProfile, type Profile } from '@/shared/profile';

/** 浏览器记住你：档案存 localStorage（"昵称 + 浏览器记住你"的登录方式）。隐私窗口/禁用存储时退回内存，只在本次有效。 */
const KEY = 'pixelcampus.profile.v1';
let memory: Profile | null = null;

export function loadProfile(): Profile | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) {
      const r = validateProfile(JSON.parse(raw));
      if (r.ok) return r.profile;
    }
  } catch { /* 存储不可用或数据损坏：当作没有档案 */ }
  return memory;
}

export function saveProfile(p: Profile) {
  memory = p;
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(p)); } catch { /* 仅内存 */ }
}

export function clearProfile() {
  memory = null;
  try { globalThis.localStorage?.removeItem(KEY); } catch { /* ignore */ }
}

/** 联机身份：随机 token，只存在本浏览器里（"浏览器记住你"）。服务器只保存它的哈希。 */
const TOKEN_KEY = 'pixelcampus.token';
let memToken: string | null = null;
export function getToken(): string {
  try { const t = globalThis.localStorage?.getItem(TOKEN_KEY); if (t && /^[A-Za-z0-9_-]{16,64}$/.test(t)) return t; } catch { /* 存储不可用 */ }
  if (memToken) return memToken;
  const b = new Uint8Array(24); crypto.getRandomValues(b); // 非安全上下文（局域网 http）也可用，crypto.randomUUID 则不行
  const t = Array.from(b, (v) => v.toString(16).padStart(2, '0')).join('');
  memToken = t;
  try { globalThis.localStorage?.setItem(TOKEN_KEY, t); } catch { /* 仅内存 */ }
  return t;
}

/** 用备份码恢复身份：把还原出来的 token 存进本机（之后 getToken 返回它）。存储不可用时仅本次有效。 */
export function setToken(t: string) {
  memToken = t;
  try { globalThis.localStorage?.setItem(TOKEN_KEY, t); } catch { /* 仅内存 */ }
}
