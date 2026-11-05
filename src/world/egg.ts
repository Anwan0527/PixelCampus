/**
 * 校名石彩蛋的状态机：step 0 = 原名，1..n = 第 n 句彩蛋文字。每按一次前进一步，轮完回到原名。
 * index 是 texts 里的下标（回到原名时为 -1）；final=true 表示这次回到了原名（"发现了真正的校名"）。
 */
export function eggAdvance(step: number, count: number) {
  const next = (step + 1) % (count + 1);
  return { step: next, index: next - 1, final: next === 0 };
}
export const EGG_FOUND_MSG = '你发现了真正的河北工程大学';
