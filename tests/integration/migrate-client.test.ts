// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const claim = vi.fn();
vi.mock('@/net/migrate', async (orig) => ({ ...(await orig<typeof import('@/net/migrate')>()), claimMigration: (...a: unknown[]) => claim(...a) }));

import { receiveMigration } from '@/core/migrateBoot';
import { loadProfile, peekToken, setToken, saveProfile, clearProfile } from '@/core/profileStore';
import { makeMigrationTicket } from '@/net/migrate';
import { migrateUrl } from '@/shared/migrate';
import { validateProfile, type Profile } from '@/shared/profile';

const prof = (name: string): Profile => { const r = validateProfile({ gender: 'f', look: 1, name, college: '机电学院', major: '机械设计', year: 2024 }); if (!r.ok) throw new Error(r.error); return r.profile; };
const TICKET = 'A'.repeat(32), OLD_TOKEN = 'a'.repeat(48), NEW_TOKEN = 'b'.repeat(48);

let loc: { hash: string; pathname: string; search: string; replace: ReturnType<typeof vi.fn> };
let replaceState: ReturnType<typeof vi.fn>;
beforeEach(() => {
  claim.mockReset(); localStorage.clear(); clearProfile();
  loc = { hash: '', pathname: '/pixel/', search: '', replace: vi.fn() }; replaceState = vi.fn();
  vi.stubGlobal('location', loc); vi.stubGlobal('history', { replaceState });
  document.body.innerHTML = '<div id="loading-text">加载中…</div>';
  vi.useFakeTimers();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const run = async () => { const p = receiveMigration(); await vi.runAllTimersAsync(); return p; };

describe('新域名启动：接收搬家券', () => {
  it('地址里没有券：什么都不做', async () => {
    expect(await run()).toBe('none'); expect(claim).not.toHaveBeenCalled(); expect(replaceState).not.toHaveBeenCalled();
  });
  it('新浏览器 + 券有效：抹掉地址栏里的券、存下老 token 和资料、刷新（网址不带券）', async () => {
    loc.hash = `#m=${TICKET}`; claim.mockResolvedValue({ ok: true, token: OLD_TOKEN, profile: prof('老玩家') });
    expect(await run()).toBe('reloading');
    expect(replaceState).toHaveBeenCalledWith(null, '', '/pixel/'); // 券第一时间就抹掉
    expect(claim).toHaveBeenCalledWith(TICKET);
    expect(peekToken()).toBe(OLD_TOKEN); expect(loadProfile()?.name).toBe('老玩家');
    expect(loc.replace).toHaveBeenCalledWith('/pixel/');
  });
  it('券失效：提示原因、不动本机身份、继续正常启动', async () => {
    loc.hash = `#m=${TICKET}`; claim.mockResolvedValue({ ok: false, msg: '搬家券已失效，请回到旧网址重新点一次' });
    const before = peekToken(); // （模块里有内存兜底的 token，前面的用例会留下，所以比较前后是否不变）
    expect(await run()).toBe('failed');
    expect(peekToken()).toBe(before); expect(loadProfile()).toBeNull(); expect(loc.replace).not.toHaveBeenCalled();
    expect(document.getElementById('loading-text')!.textContent).toContain('搬家券已失效');
  });
  it('格式不对的券不会去问服务器，也不会改身份', async () => {
    loc.hash = '#m=short'; expect(await run()).toBe('none'); expect(claim).not.toHaveBeenCalled();
  });
  it('这个浏览器在新域名已有另一个角色：玩家取消 → 保持现状；确认 → 才替换', async () => {
    setToken(NEW_TOKEN); saveProfile(prof('新角色'));
    loc.hash = `#m=${TICKET}`; claim.mockResolvedValue({ ok: true, token: OLD_TOKEN, profile: prof('老玩家') });
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true); vi.stubGlobal('confirm', confirm);
    expect(await run()).toBe('cancelled');
    expect(peekToken()).toBe(NEW_TOKEN); expect(loadProfile()?.name).toBe('新角色'); expect(loc.replace).not.toHaveBeenCalled();
    expect(String(confirm.mock.calls[0][0])).toContain('新角色');
    loc.hash = `#m=${TICKET}`;
    expect(await run()).toBe('reloading');
    expect(peekToken()).toBe(OLD_TOKEN); expect(loadProfile()?.name).toBe('老玩家');
  });
  it('已经就是同一个身份（比如重复点了链接）：不再弹确认，直接刷新', async () => {
    setToken(OLD_TOKEN); saveProfile(prof('老玩家'));
    loc.hash = `#m=${TICKET}`; claim.mockResolvedValue({ ok: true, token: OLD_TOKEN, profile: prof('老玩家') });
    const confirm = vi.fn(); vi.stubGlobal('confirm', confirm);
    expect(await run()).toBe('reloading'); expect(confirm).not.toHaveBeenCalled();
  });
});

describe('搬家网络层（假 WebSocket）', () => {
  const real = () => vi.importActual<typeof import('@/net/migrate')>('@/net/migrate');
  class FakeWS {
    static last: FakeWS; sent: string[] = []; onopen: (() => void) | null = null; onmessage: ((e: { data: string }) => void) | null = null; onerror: (() => void) | null = null; onclose: (() => void) | null = null;
    constructor(public url: string) { FakeWS.last = this; queueMicrotask(() => this.onopen?.()); }
    send(s: string) { this.sent.push(s); } close() { /* ignore */ }
    reply(m: object) { this.onmessage?.({ data: JSON.stringify(m) }); }
  }
  beforeEach(() => { vi.stubGlobal('WebSocket', FakeWS); });
  it('发券：发出 migrate_make（带 token），收到 ticket 就成功', async () => {
    const p = makeMigrationTicket(OLD_TOKEN, 'ws://x/ws'); await vi.advanceTimersByTimeAsync(0);
    expect(JSON.parse(FakeWS.last.sent[0])).toEqual({ t: 'migrate_make', token: OLD_TOKEN });
    FakeWS.last.reply({ t: 'migrate_ticket', ok: true, ticket: TICKET, ms: 180000 });
    expect(await p).toEqual({ ok: true, ticket: TICKET });
  });
  it('服务器说不行 / 连接超时：都回一句话原因', async () => {
    const p = makeMigrationTicket(OLD_TOKEN, 'ws://x/ws'); await vi.advanceTimersByTimeAsync(0);
    FakeWS.last.reply({ t: 'migrate_ticket', ok: false, msg: '尝试次数太多，请过几分钟再试' });
    expect(await p).toEqual({ ok: false, msg: '尝试次数太多，请过几分钟再试' });
    const q = makeMigrationTicket(OLD_TOKEN, 'ws://x/ws', 1000); await vi.advanceTimersByTimeAsync(1100);
    const r = await q; expect(r.ok).toBe(false); if (!r.ok) expect(r.msg).toContain('超时');
  });
  it('认领：发出 migrate_claim（只带券，不带 token），收到 token 与资料', async () => {
    const p = (await real()).claimMigration(TICKET, 'ws://x/ws'); await vi.advanceTimersByTimeAsync(0);
    expect(JSON.parse(FakeWS.last.sent[0])).toEqual({ t: 'migrate_claim', ticket: TICKET });
    FakeWS.last.reply({ t: 'migrate_claimed', ok: true, token: OLD_TOKEN, profile: prof('老玩家') });
    const r = await p; expect(r.ok).toBe(true); if (r.ok) { expect(r.token).toBe(OLD_TOKEN); expect(r.profile.name).toBe('老玩家'); }
  });
  it('搬家地址里只有券，没有 token', () => { expect(migrateUrl(TICKET)).not.toContain(OLD_TOKEN); expect(migrateUrl(TICKET)).toBe(`https://huepixel.top/pixel/#m=${TICKET}`); });
});
