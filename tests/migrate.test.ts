import { describe, it, expect } from 'vitest';
import { MIGRATE_TTL_MS, NEW_HOST, migrateUrl, shouldOfferMigration, ticketFromHash, validTicket } from '../src/shared/migrate';

const T = 'A'.repeat(32), T2 = 'abcDEF0123456789_-abcDEF01234567';

describe('搬家券格式', () => {
  it('32 位 base64url 才合法', () => {
    expect(validTicket(T)).toBe(true); expect(validTicket(T2)).toBe(true);
    for (const bad of ['', 'short', 'A'.repeat(31), 'A'.repeat(33), 'A'.repeat(31) + '+', 'A'.repeat(31) + '/', 'A'.repeat(31) + '=', null, 5, undefined]) expect(validTicket(bad), String(bad)).toBe(false);
  });
  it('有效期 3 分钟', () => { expect(MIGRATE_TTL_MS).toBe(180000); });
});

describe('搬家网址与 hash 解析', () => {
  it('网址在新域名、券在 # 后面（不会发给服务器）', () => {
    const u = new URL(migrateUrl(T));
    expect(u.hostname).toBe(NEW_HOST); expect(u.pathname).toBe('/pixel/'); expect(u.search).toBe(''); expect(u.hash).toBe(`#m=${T}`);
  });
  it('从 hash 取券：只认合法的券，别的参数不影响', () => {
    expect(ticketFromHash(`#m=${T}`)).toBe(T);
    expect(ticketFromHash(`#x=1&m=${T2}&y=2`)).toBe(T2);
    expect(ticketFromHash('')).toBeNull(); expect(ticketFromHash('#')).toBeNull(); expect(ticketFromHash('#m=')).toBeNull();
    expect(ticketFromHash('#m=short')).toBeNull(); expect(ticketFromHash(`#m=${T}x`)).toBeNull(); expect(ticketFromHash(`#om=${T}`)).toBeNull();
    expect(ticketFromHash(`#m=${T}+evil`)).toBeNull();
  });
});

describe('什么时候提供「搬到新网址」', () => {
  const at = (hostname: string, pathname = '/pixel/') => shouldOfferMigration({ hostname, pathname });
  it('正式环境的老域名：提供', () => { expect(at('exist.qd.je')).toBe(true); expect(at('EXIST.QD.JE')).toBe(true); });
  it('新域名（含 www）：不提供', () => { expect(at('huepixel.top')).toBe(false); expect(at('www.huepixel.top')).toBe(false); });
  it('名字像新域名的别家域名：照常提供（只认真正的 huepixel.top 及其子域）', () => { expect(at('evilhuepixel.top')).toBe(true); expect(at('huepixel.top.evil.com')).toBe(true); });
  it('本机开发 / 局域网 / IPv6：不提供', () => { for (const h of ['localhost', 'app.localhost', '127.0.0.1', '192.168.1.8', '[::1]', '::1']) expect(at(h), h).toBe(false); });
  it('测试环境（路径带 pixel-test）：不提供', () => { expect(at('exist.qd.je', '/pixel-test-2fea41b87c65/')).toBe(false); });
});
