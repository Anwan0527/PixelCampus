"""
道路吸附：把蓝图里带 "snap": true 的 stroke 折线，沿法线 ±2 格范围内吸附到卫星图中最像"路面"的位置。
路面像素 = 低饱和灰色 且 不是植被/深阴影 且 不在建筑覆盖范围内；经高斯平滑后取脊线。
结果直接写回 JSON（pts 更新、snap→snapped:true，附 snapScore）。吸附前后应用 overlay/road_gap 目测复核。
依赖: numpy, opencv-python-headless。 用法: python3 tools/analysis/snap_roads.py [--dry]
"""
import json, os, sys, glob
import numpy as np, cv2

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
geo = json.load(open(os.path.join(ROOT, 'data/campus/geo.json')))
mpp = geo['satellite']['metersPerPixel']; tile_m = geo['world']['tileMeters']
ox, oy = geo['world']['originSatPx']; TW, TH = geo['world']['widthTiles'], geo['world']['heightTiles']
S = 8
sat = cv2.imread(os.path.join(ROOT, '.cache/satellite_z18.png'))
per = tile_m / mpp
img = cv2.resize(sat[int(oy):int(oy + TH * per), int(ox):int(ox + TW * per)], (TW * S, TH * S), interpolation=cv2.INTER_AREA)
cov = cv2.imread(os.path.join(ROOT, '.cache/coverage.png'), cv2.IMREAD_UNCHANGED)
bld = (cv2.resize(cov, (TW * S, TH * S), interpolation=cv2.INTER_NEAREST)[..., 2] == 255) & (cv2.resize(cov, (TW * S, TH * S), interpolation=cv2.INTER_NEAREST)[..., 0] == 0)
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
b, g, r = [img[..., i].astype(np.int16) for i in range(3)]
road = (hsv[..., 1] < 60) & (hsv[..., 2] > 72) & (hsv[..., 2] < 225) & ~((g > r + 6) & (g > b + 10))
road &= ~cv2.dilate(bld.astype(np.uint8), np.ones((S + 1, S + 1), np.uint8)).astype(bool)
M = road.astype(np.float32)

def sample(R, x, y):  # tile coords -> bilinear
    px, py = x * S, y * S
    if px < 1 or py < 1 or px >= R.shape[1] - 2 or py >= R.shape[0] - 2: return 0.0
    x0, y0 = int(px), int(py); fx, fy = px - x0, py - y0
    return (R[y0, x0] * (1 - fx) * (1 - fy) + R[y0, x0 + 1] * fx * (1 - fy) + R[y0 + 1, x0] * (1 - fx) * fy + R[y0 + 1, x0 + 1] * fx * fy)

def densify(pts, step=1.0):
    out = [pts[0]]
    for a, b2 in zip(pts[:-1], pts[1:]):
        d = np.hypot(b2[0] - a[0], b2[1] - a[1]); n = max(1, int(round(d / step)))
        for k in range(1, n + 1): out.append((a[0] + (b2[0] - a[0]) * k / n, a[1] + (b2[1] - a[1]) * k / n))
    return out

def rdp(pts, eps):
    if len(pts) < 3: return pts
    a, b2 = np.array(pts[0]), np.array(pts[-1]); ab = b2 - a; L = np.hypot(*ab)
    d = [abs(ab[0] * (p[1] - a[1]) - ab[1] * (p[0] - a[0])) / L if L > 1e-9 else np.hypot(*(np.array(p) - a)) for p in pts[1:-1]]
    i = int(np.argmax(d)) + 1
    if d[i - 1] > eps: return rdp(pts[:i + 1], eps)[:-1] + rdp(pts[i:], eps)
    return [pts[0], pts[-1]]

def smooth(v, k):
    p = k // 2; vv = np.pad(v, p, mode='edge'); return np.convolve(vv, np.ones(k) / k, mode='valid')

dry = '--dry' in sys.argv
changed = 0
for f in sorted(glob.glob(os.path.join(ROOT, 'data/campus/terrain/*.json'))):
    d = json.load(open(f)); dirty = False
    for sh in d['shapes']:
        if sh.get('kind') != 'stroke' or not sh.get('snap'): continue
        R = cv2.GaussianBlur(M, (0, 0), max(2.0, sh['w'] * S / 3.0))
        pts = densify([tuple(p) for p in sh['pts']], 1.0)
        n = len(pts)
        P = np.array(pts)
        T = np.gradient(P, axis=0); T /= (np.linalg.norm(T, axis=1, keepdims=True) + 1e-9)
        N = np.stack([-T[:, 1], T[:, 0]], 1)
        offs = np.arange(-2.0, 2.01, 0.25)
        best = np.zeros(n); score = np.zeros(n)
        for i in range(n):
            vals = np.array([sample(R, *(P[i] + N[i] * o)) - 0.015 * abs(o) for o in offs])
            j = int(np.argmax(vals)); best[i] = offs[j]; score[i] = vals[j]
        if n > 5:
            w = 4 if n > 25 else 3
            best = np.array([np.median(best[max(0, i - w):i + w + 1]) for i in range(n)])
            best = smooth(best, 9 if n > 25 else 5)
        q = P + N * best[:, None]
        mean_score = float(score.mean())
        out = [[round(float(x), 1), round(float(y), 1)] for x, y in rdp([tuple(p) for p in q], 0.5)]
        print(f"{sh.get('note','?'):<28} 点数 {len(sh['pts'])}->{len(out)}  路面得分 {mean_score:.2f}  最大偏移 {abs(best).max():.2f}")
        if mean_score < 0.30:
            print('   ↳ 得分过低（可能被阴影/树冠遮挡或位置差太远），保持原样'); continue
        if not dry: sh['pts'] = out; sh['snapped'] = True; sh.pop('snap'); dirty = True; changed += 1
    if dirty and not dry: json.dump(d, open(f, 'w'), ensure_ascii=False, indent=1)
print('已吸附', changed, '条' if not dry else '（dry-run）')
