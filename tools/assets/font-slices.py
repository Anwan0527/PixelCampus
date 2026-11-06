#!/usr/bin/env python3
"""
把 Ark Pixel 中文像素字体（完整 553 KB）切成三片，浏览器按"页面上实际出现的字"只下载需要的那片（unicode-range）。
  a  ASCII/标点 + 仓库文本（src/ data/ server/ index.html）里出现过的字 + 玩家最常用的字 → 约 80 KB，首屏只要这一片
  b  GB2312 一二级汉字里 a 没有的（玩家昵称/聊天常见字）                                     → 约 106 KB，有人用到才下载
  c  字体里剩下的所有字（生僻字、日文汉字等）                                               → 约 449 KB，几乎用不到
输出：public/fonts/ark-pixel-12-zh-{a,b,c}.woff2 和 src/ui/fonts.css（@font-face 规则，style.css 引入）。
用法（需要 fonttools；只在改了游戏文案、想让新字进入首屏那片时才需要重新跑）：
  python3 -m venv /tmp/fv && /tmp/fv/bin/pip install fonttools brotli && /tmp/fv/bin/python tools/assets/font-slices.py
"""
import os, sys
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'tools/assets/fonts/ark-pixel-12-zh.woff2')
OUT = os.path.join(ROOT, 'public/fonts')
CSS = os.path.join(ROOT, 'src/ui/fonts.css')

cmap = set(TTFont(SRC).getBestCmap().keys())
punct = {c for c in cmap if c < 0x250 or 0x2000 <= c <= 0x206F or 0x3000 <= c <= 0x303F or 0xFF00 <= c <= 0xFFEF or 0x2190 <= c <= 0x21FF or 0x25A0 <= c <= 0x26FF}

used = set()
for base in ['src', 'data', 'server', 'tools', 'public/assets/generated', 'index.html']:   # 生成的 json（发型名、地点名等）和 tools/art 里的名称表也算
    p = os.path.join(ROOT, base)
    if not os.path.exists(p): continue   # 公开仓库没有 server/
    files = [p] if os.path.isfile(p) else [os.path.join(d, x) for d, _, fs in os.walk(p) for x in fs if x.endswith(('.ts', '.json', '.css', '.html', '.mjs')) and not x.endswith('.generated.css')]
    for fp in files:
        if any(k in fp for k in ('node_modules', 'wordfilter', 'fonts.css')): continue
        try: text = open(fp, encoding='utf8').read()
        except Exception: continue
        used.update(ord(c) for c in text if ord(c) > 127)

gb = set()
for hi in range(0xB0, 0xF8):
    for lo in range(0xA1, 0xFF):
        try: gb.add(ord(bytes([hi, lo]).decode('gb2312')))
        except Exception: pass

A = punct | (used & cmap)
B = (gb & cmap) - A
C = cmap - A - B

def ranges(s):
    s = sorted(s); out = []; i = 0
    while i < len(s):
        j = i
        while j + 1 < len(s) and s[j + 1] == s[j] + 1: j += 1
        out.append(f'U+{s[i]:X}' if i == j else f'U+{s[i]:X}-{s[j]:X}'); i = j + 1
    return ','.join(out)

def coarse(s, holes, tol=16):
    """c 片的范围可以粗一些：缺口 ≤tol 的并成一段（a、b 声明在后面，重叠处它们优先）。精确列出要 6.7 万字节的 CSS，粗合并后不到 1 万。
    holes = 游戏里用到、但字体里没有的字（如“斜”，一直走系统字体）：从范围里挖掉，否则渲染它们会白白触发 c 片的下载"""
    s = sorted(s); segs = []; lo = hi = s[0]
    for c in s[1:]:
        if c - hi <= tol + 1: hi = c
        else: segs.append((lo, hi)); lo = hi = c
    segs.append((lo, hi))
    out = []
    for a, b in segs:
        cur = a
        for h in sorted(x for x in holes if a <= x <= b):
            if h > cur: out.append((cur, h - 1))
            cur = h + 1
        if cur <= b: out.append((cur, b))
    return ','.join(f'U+{a:X}' if a == b else f'U+{a:X}-{b:X}' for a, b in out)

os.makedirs(OUT, exist_ok=True)
rules = ['/* 由 tools/assets/font-slices.py 生成，别手改。三片的 unicode-range 都写明（c 片较粗，和 a、b 重叠处 a、b 优先）（不留“全部字符”的兜底，否则一个 emoji 就会触发下载大片） */']
for name, chars, rng in (('c', C, coarse(C, used - cmap)), ('b', B, ranges(B)), ('a', A, ranges(A))):
    opt = subset.Options(); opt.flavor = 'woff2'; opt.layout_features = ['*']; opt.notdef_outline = True; opt.name_IDs = ['*']; opt.glyph_names = False
    f = TTFont(SRC); sub = subset.Subsetter(opt); sub.populate(unicodes=chars); sub.subset(f)
    f.flavor = 'woff2'; path = os.path.join(OUT, f'ark-pixel-12-zh-{name}.woff2'); f.save(path)
    print(f'{name}: {len(chars)} 字，{os.path.getsize(path) // 1024} KB')
    rules.append("@font-face { font-family: 'ArkPixel'; src: url('/fonts/ark-pixel-12-zh-%s.woff2') format('woff2'); font-display: swap;%s }" % (name, f' unicode-range: {rng};' if rng else ''))
open(CSS, 'w', encoding='utf8').write('\n'.join(rules) + '\n')
print('已写入', os.path.relpath(CSS, ROOT))
