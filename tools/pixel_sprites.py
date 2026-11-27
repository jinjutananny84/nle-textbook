"""สร้าง assets/pixel.css: ธีมพิกเซล (ตัวละครวาดเอง ไม่ใช่ asset ของเกมใด) — รัน: python3 tools/pixel_sprites.py"""
import math, urllib.parse, pathlib

PAL = {
    'K': '#2b2b3a', 'S': '#f4c9a0', 'H': '#5a3a2a', 'W': '#ffffff',
    'B': '#4a7bd0', 'R': '#e0525a', 'P': '#f7a8b8', 'E': '#1a1a1a', 'G': '#cfd6e0'
}

DOC1 = """....HHHH....
...HHHHHH...
..HHSSSSHH..
..HSSSSSSH..
..SSESSESS..
..SSSSSSSS..
...SSPSPS...
....SSSS....
..WWWBBWWW..
.WWWWBBWRWW.
.SWWWBBRRRS.
.SWWWWWWRWS.
..WWWWWWWW..
..BBB..BBB..
..BBB..BBB..
..KKK..KKK..""".split('\n')

DOC2 = DOC1[:13] + """...BBBBBB...
..BBB...BB..
.KKK....KKK.""".split('\n')

FLAG = """K.......
KRRRR...
KRRRRRR.
KRRRR...
K.......
K.......
K.......
K.......
K.......
K.......
K.......
K.......
K.......
KK......""".split('\n')

# เมฆพิกเซล 3 โทน (T=ยอดเมฆม่วงชมพู, M=กลางเมฆพีช, H=ขอบล่างรับแสงอาทิตย์สีครีมทอง)
CLOUD1 = """......TTT.........
....TTTTTTT..TT...
..TTMMMMMMTTTTMM..
.TMMMMMMMMMMMMMMM.
.MMHHHHHHHHHHMMMM.
..HHHHHHHHHHHHHH..
....HHHH...HHH....""".split('\n')

CLOUD2 = """....TTTT......
..TTMMMMTT.TT.
.TMMMMMMMMMMM.
.MMHHHHHHHHMM.
..HHHHHHHHHH..
...HHH..HHH...""".split('\n')

def rects(g, ox=0, pal=PAL):
    # รวมสีเดียวกันเป็น path เดียวเพื่อลดขนาดไฟล์
    by_col = {}
    for y, r in enumerate(g):
        x = 0
        while x < len(r):
            c = r[x]
            if c in pal:
                n = 1
                while x + n < len(r) and r[x + n] == c:
                    n += 1
                by_col.setdefault(pal[c], []).append(f'M{x + ox} {y}h{n}v1h-{n}z')
                x += n
            else:
                x += 1
    return ''.join(f'<path fill="{col}" d="{"".join(ds)}"/>' for col, ds in by_col.items())

def svg(w, h, body):
    s = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" shape-rendering="crispEdges">{body}</svg>'
    return 'url("data:image/svg+xml,' + urllib.parse.quote(s, safe=' =:/;,') + '")'

def step_poly(xs_ys, bottom_y):
    """สร้าง SVG path แบบขั้นบันไดพิกเซลจากลิสต์ (x, y)"""
    pts = [f'M{xs_ys[0][0]} {bottom_y}']
    cur_y = None
    for x, y in xs_ys:
        if y != cur_y:
            pts.append(f'L{x} {y}')
            cur_y = y
        pts.append(f'L{x + 1} {y}')
    pts.append(f'L{xs_ys[-1][0] + 1} {bottom_y}Z')
    return ''.join(pts)

def mountain(w, h, peaks, c_base, c_shadow, c_rim, sun_side='right'):
    """ภูเขาพิกเซลแบบขั้นบันได (ไร้สีเขียว) พร้อมเงาด้านมืดและขอบแสงตะวันด้านรับแสง"""
    ys = []
    for x in range(w):
        best = h
        for cx, top_y, sl, sr in peaks:
            d = (cx - x) * sl if x < cx else (x - cx) * sr
            crag = 1 if (x + cx) % 7 == 0 and d > 2 else 0
            y = int(round(top_y + d)) + crag
            if y < best:
                best = y
        ys.append(min(h, max(0, best)))
    main_cx = min(peaks, key=lambda p: p[1])[0]
    sun_pts, sh_pts, rim_d = [], [], []
    for x, y in enumerate(ys):
        if y >= h:
            continue
        is_sun = (x >= main_cx) if sun_side == 'right' else (x <= main_cx)
        (sun_pts if is_sun else sh_pts).append((x, y))
        if is_sun and y < h - 2:
            rh = 2 if abs(x - main_cx) < w * 0.28 else 1
            rim_d.append(f'M{x} {y}h1v{rh}h-1z')
    body = []
    if sh_pts:
        body.append(f'<path fill="{c_shadow}" d="{step_poly(sh_pts, h)}"/>')
    if sun_pts:
        body.append(f'<path fill="{c_base}" d="{step_poly(sun_pts, h)}"/>')
    if rim_d:
        body.append(f'<path fill="{c_rim}" d="{"".join(rim_d)}"/>')
    return svg(w, h, ''.join(body))

def cloud_bank(w, h, pal):
    """แถบเมฆพิกเซลด้านล่างแบบ repeat-x ไร้รอยต่อ (แทนเนินหญ้าสีเขียว) — ใช้ path กระชับ"""
    tau = 2 * math.pi
    yb = [max(2, min(h - 3, int(round(8.8 - 2.6 * math.sin(tau * x / w * 2 + 0.4) - 1.9 * math.sin(tau * x / w * 5 - 0.8) - 1.1 * math.cos(tau * x / w * 9 + 0.3))))) for x in range(w)]
    yf = [max(5, min(h - 1, int(round(11.4 - 2.1 * math.sin(tau * x / w * 3 - 1.1) - 1.5 * math.cos(tau * x / w * 6 + 0.6) - 0.9 * math.sin(tau * x / w * 11))))) for x in range(w)]
    yb2 = [min(h, y + 2) for y in yb]
    yf1 = [min(h, y + 1) for y in yf]
    yf4 = [min(h, y + 4) for y in yf]
    body = [
        f'<path fill="{pal["hi"]}" d="{step_poly(list(enumerate(yb)), h)}"/>',
        f'<path fill="{pal["mid"]}" d="{step_poly(list(enumerate(yb2)), h)}"/>',
        f'<path fill="{pal["mid"]}" d="{step_poly(list(enumerate(yf)), h)}"/>',
        f'<path fill="{pal["rose"]}" d="{step_poly(list(enumerate(yf1)), h)}"/>',
        f'<path fill="{pal["sh"]}" d="{step_poly(list(enumerate(yf4)), h)}"/>',
    ]
    return svg(w, h, ''.join(body))

doc_sheet = svg(24, 16, rects(DOC1) + rects(DOC2, 12))
doc_still = svg(12, 16, rects(DOC1))
flag = svg(8, 14, rects(FLAG))

# พาเลตเมฆรับแสงเย็นตามภาพอ้างอิง (Light = พาสเทลอุ่น, Dark = ทไวไลท์ม่วง-ชมพู-ส้มทอง)
CL_PAL_L = {'T': '#d99bb8', 'M': '#fbc0b2', 'H': '#fff2cc'}
CL_PAL_D = {'T': '#8b5383', 'M': '#e07b8f', 'H': '#ffd199'}
cloud1_l = svg(18, 7, rects(CLOUD1, pal=CL_PAL_L))
cloud2_l = svg(14, 6, rects(CLOUD2, pal=CL_PAL_L))
cloud1_d = svg(18, 7, rects(CLOUD1, pal=CL_PAL_D))
cloud2_d = svg(14, 6, rects(CLOUD2, pal=CL_PAL_D))

# ภูเขา 3 ลูก (ซ้าย กลาง-ไกล ขวา) — ไม่มีสีเขียวเลย
mtn1_l = mountain(56, 22, [(24, 3, 0.9, 0.85), (39, 9, 0.95, 0.9)], '#9a71a3', '#7a5587', '#e59fb5', 'right')
mtn2_l = mountain(64, 24, [(34, 2, 0.8, 0.9), (18, 10, 0.9, 0.95)], '#8d6599', '#6e4c7c', '#efa9b3', 'left')
mtn3_l = mountain(46, 16, [(22, 3, 0.75, 0.78)], '#b389b5', '#98709e', '#f4baa8', 'right')

mtn1_d = mountain(56, 22, [(24, 3, 0.9, 0.85), (39, 9, 0.95, 0.9)], '#4c346e', '#2d1f4d', '#cf6d8f', 'right')
mtn2_d = mountain(64, 24, [(34, 2, 0.8, 0.9), (18, 10, 0.9, 0.95)], '#422c63', '#261a42', '#e07b8e', 'left')
mtn3_d = mountain(46, 16, [(22, 3, 0.75, 0.78)], '#634380', '#482f66', '#e68f88', 'right')

# แถบเมฆฟูด้านล่างแทนเนินหญ้า
cb_l = cloud_bank(160, 16, {'hi': '#fff0c4', 'mid': '#f8b7ab', 'rose': '#e38ca6', 'sh': '#c97196'})
cb_d = cloud_bank(160, 16, {'hi': '#ffd59e', 'mid': '#e8838e', 'rose': '#b3557e', 'sh': '#7c3c6b'})

css = pathlib.Path(__file__).with_name('pixel_theme.css').read_text(encoding='utf-8')
tokens = dict(
    DOC_SHEET=doc_sheet, DOC_STILL=doc_still, FLAG=flag,
    CLOUD1_L=cloud1_l, CLOUD2_L=cloud2_l, CLOUD1_D=cloud1_d, CLOUD2_D=cloud2_d,
    MTN1_L=mtn1_l, MTN2_L=mtn2_l, MTN3_L=mtn3_l,
    MTN1_D=mtn1_d, MTN2_D=mtn2_d, MTN3_D=mtn3_d,
    CBANK_L=cb_l, CBANK_D=cb_d,
)
for k, v in tokens.items():
    css = css.replace('{{' + k + '}}', v)

out = pathlib.Path(__file__).resolve().parent.parent / 'assets' / 'pixel.css'
out.write_text('/* สร้างจาก tools/pixel_theme.css ด้วย tools/pixel_sprites.py — แก้ที่ต้นฉบับแล้วรันใหม่ */\n' + css, encoding='utf-8')
print(out, len(css))
