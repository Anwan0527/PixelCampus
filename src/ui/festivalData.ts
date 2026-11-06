/**
 * 节日装扮的客户端状态（服务器说了算）：已获得哪些、戴着哪个。日历面板和场景共用，变了通知订阅者。
 */
class FestivalData {
  own: number[] = [];
  on = 0;
  private subs = new Set<() => void>();
  set(own: number[], on: number) { this.own = own; this.on = on; for (const f of this.subs) f(); }
  subscribe(fn: () => void) { this.subs.add(fn); return () => this.subs.delete(fn); }
}
export const festData = new FestivalData();
