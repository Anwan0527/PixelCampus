"""
道路缺口检查：卫星图里的灰色路面像素 − 蓝图已覆盖（路面/建筑）= 疑似漏掉的路（红色）。
依赖：numpy, opencv-python-headless, pillow（仅分析用，不影响游戏运行）。
用法： python3 tools/analysis/road_gap.py           输出 .cache/road_gap.png
先运行 `npm run assets:world` 生成 .cache/coverage.png。
"""
import sys, json, os
import numpy as np, cv2

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
geo = json.load(open(os.path.join(ROOT, 'data/campus/geo.json')))
mpp = geo['satellite']['metersPerPixel']; tile_m = geo['world']['tileMeters']
ox, oy = geo['world']['originSatPx']; TW, TH = geo['world']['widthTiles'], geo['world']['heightTiles']
S = 4  # px / tile
sat = cv2.imread(os.path.join(ROOT, '.cache/satellite_z18.png'))
per = tile_m / mpp
crop = sat[int(oy):int(oy + TH * per), int(ox):int(ox + TW * per)]
img = cv2.resize(crop, (TW * S, TH * S), interpolation=cv2.INTER_AREA)
cov = cv2.imread(os.path.join(ROOT, '.cache/coverage.png'), cv2.IMREAD_UNCHANGED)
covered = (cov[..., 3] > 0)
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
b, g, r = [img[..., i].astype(np.int16) for i in range(3)]
sat_ch = hsv[..., 1].astype(np.int16); val = hsv[..., 2].astype(np.int16)
gray = (sat_ch < 55) & (val > 70) & (val < 215) & ~((g > r + 6) & (g > b + 10))
gray &= ~cv2.dilate(covered.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
m = gray.astype(np.uint8) * 255
m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
n, lab, stats, _ = cv2.connectedComponentsWithStats(m, 8)
keep = np.zeros_like(m)
for i in range(1, n):
    x, y, w, h, area = stats[i]
    if area >= 40 and max(w, h) >= 14: keep[lab == i] = 255
out = img.copy()
out[keep > 0] = (0.35 * out[keep > 0] + 0.65 * np.array([40, 40, 255])).astype(np.uint8)
out[covered & (cov[..., 2] == 255) & (cov[..., 0] == 0)] = (0.7 * out[covered & (cov[..., 2] == 255) & (cov[..., 0] == 0)] + 0.3 * np.array([255, 200, 0])).astype(np.uint8)
# 格线 每 10 tile
for t in range(0, TW, 10):
    cv2.line(out, (t * S, 0), (t * S, TH * S), (0, 230, 255), 1)
    if t % 20 == 0: cv2.putText(out, str(t), (t * S + 2, 10), cv2.FONT_HERSHEY_SIMPLEX, 0.32, (255, 255, 255), 1)
for t in range(0, TH, 10):
    cv2.line(out, (0, t * S), (TW * S, t * S), (0, 230, 255), 1)
    if t % 20 == 0: cv2.putText(out, str(t), (2, t * S - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.32, (255, 255, 255), 1)
dst = os.path.join(ROOT, '.cache/road_gap.png')
cv2.imwrite(dst, out)
# 分块输出（每块 100x76 tile，放大到 9px/tile）便于细看
for r_i, y0 in enumerate([0, 66, 132, 196]):
    for c_i, x0 in enumerate([0, 84, 168, 252]):
        part = out[y0 * S:(y0 + 76) * S, x0 * S:(x0 + 100) * S]
        part = cv2.resize(part, None, fx=2.25, fy=2.25, interpolation=cv2.INTER_NEAREST)
        cv2.imwrite(os.path.join(ROOT, f'.cache/gap_r{r_i}c{c_i}.png'), part)
print('ok', dst)
