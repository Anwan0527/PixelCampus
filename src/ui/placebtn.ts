/** 地点留言板入口按钮：什么时候显示、写什么（纯函数，方便测试）。 */
export interface PlaceBtnIn { place: string | null; online: boolean; fishing: boolean; riding: boolean; entering: boolean; /** 有面板 / 对话框盖在游戏上 */ blocked: boolean }
/** 站在某个地点附近、联机、没在钓鱼 / 骑车 / 进门、没有别的面板盖着，才显示 */
export function placeBtnState(i: PlaceBtnIn): { show: boolean; label: string } {
  const show = !!i.place && i.online && !i.fishing && !i.riding && !i.entering && !i.blocked;
  const name = i.place ?? '';
  return { show, label: Array.from(name).length > 10 ? `${Array.from(name).slice(0, 9).join('')}…` : name };
}
