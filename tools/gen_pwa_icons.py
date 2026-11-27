"""สร้างไอคอน PWA (PNG + SVG) จากตัวละครน้องหมอพิกเซล — รัน: python3 tools/gen_pwa_icons.py"""
import pathlib, struct, zlib

PAL = {
    'K': (0x2b, 0x2b, 0x3a),
    'S': (0xf4, 0xc9, 0xa0),
    'H': (0x5a, 0x3a, 0x2a),
    'W': (0xff, 0xff, 0xff),
    'B': (0x4a, 0x7b, 0xd0),
    'R': (0xe0, 0x52, 0x5a),
    'P': (0xf7, 0xa8, 0xb8),
    'E': (0x1a, 0x1a, 0x1a),
    'C': (0xcf, 0xe8, 0xff),  # sky top
    'c': (0xee, 0xf7, 0xff),  # sky bottom
    'G': (0x8f, 0xd1, 0x8f),  # grass
    'g': (0x5f, 0xae, 0x6a),  # grass edge
    'D': (0x8a, 0x5a, 0x2a),  # dirt
    'Y': (0xf6, 0xc9, 0x45),  # star/gold
}

DOC = [
    "....HHHH....",
    "...HHHHHH...",
    "..HHSSSSHH..",
    "..HSSSSSSH..",
    "..SSESSESS..",
    "..SSSSSSSS..",
    "...SSPSPS...",
    "....SSSS....",
    "..WWWBBWWW..",
    ".WWWWBBWRWW.",
    ".SWWWBBRRRS.",
    ".SWWWWWWRWS.",
    "..WWWWWWWW..",
    "..BBB..BBB..",
    "..BBB..BBB..",
    "..KKK..KKK..",
]

# สร้างกริด 24x24 (safe zone เหมาะทั้ง icon ปกติและ maskable)
GRID = []
for y in range(24):
    if y < 9:
        row = ['C'] * 24
    elif y < 19:
        row = ['c'] * 24
    elif y == 19:
        row = ['g'] * 24
    elif y < 22:
        row = ['G'] * 24
    else:
        row = ['D'] * 24
    GRID.append(row)

# ก้อนเมฆและดาวเล็กๆ
for (x, y) in [(3, 4), (4, 4), (2, 5), (3, 5), (4, 5), (5, 5), (18, 6), (19, 6), (17, 7), (18, 7), (19, 7), (20, 7)]:
    GRID[y][x] = 'W'
for (x, y) in [(19, 3), (4, 8)]:
    GRID[y][x] = 'Y'

# วางน้องหมอตรงกลาง (x=6..17, y=4..19)
for dy, line in enumerate(DOC):
    for dx, ch in enumerate(line):
        if ch != '.':
            GRID[4 + dy][6 + dx] = ch

# กรอบพิกเซลเข้มรอบนอก 1px
for i in range(24):
    GRID[0][i] = 'K'
    GRID[23][i] = 'K'
    GRID[i][0] = 'K'
    GRID[i][23] = 'K'

def make_png(size: int) -> bytes:
    raw = bytearray()
    for py in range(size):
        raw.append(0)  # filter type 0
        gy = min(23, py * 24 // size)
        row = GRID[gy]
        for px in range(size):
            gx = min(23, px * 24 // size)
            r, g, b = PAL[row[gx]]
            raw.extend((r, g, b))
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b'')

def make_svg() -> str:
    rects = []
    for y, row in enumerate(GRID):
        x = 0
        while x < 24:
            ch = row[x]
            n = 1
            while x + n < 24 and row[x + n] == ch:
                n += 1
            r, g, b = PAL[ch]
            rects.append(f'<rect x="{x}" y="{y}" width="{n}" height="1" fill="#{r:02x}{g:02x}{b:02x}"/>')
            x += n
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" shape-rendering="crispEdges">' + ''.join(rects) + '</svg>\n'

assets = pathlib.Path(__file__).resolve().parent.parent / 'assets'
(assets / 'icon.svg').write_text(make_svg(), encoding='utf-8')
for name, sz in [('apple-touch-icon.png', 180), ('icon-192.png', 192), ('icon-512.png', 512)]:
    (assets / name).write_bytes(make_png(sz))
    print('wrote', assets / name)
print('wrote', assets / 'icon.svg')
