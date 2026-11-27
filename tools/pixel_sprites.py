"""สร้าง assets/pixel.css: ธีมพิกเซล (ตัวละครวาดเอง ไม่ใช่ asset ของเกมใด) — รัน: python3 tools/pixel_sprites.py"""
import urllib.parse, pathlib
PAL={'K':'#2b2b3a','S':'#f4c9a0','H':'#5a3a2a','W':'#ffffff','B':'#4a7bd0','R':'#e0525a','P':'#f7a8b8','E':'#1a1a1a','G':'#cfd6e0'}
DOC1="""....HHHH....
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
DOC2=DOC1[:13]+"""...BBBBBB...
..BBB...BB..
.KKK....KKK.""".split('\n')
FLAG="""K.......
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
CLOUD="""...WWWW.....
..WWWWWW.WW.
.WWWWWWWWWWW
WWWWWWWWWWWW
.WWWWWWWWWW.""".split('\n')
def rects(g,ox=0,pal=PAL):
    out=[]
    for y,r in enumerate(g):
        x=0
        while x<len(r):
            c=r[x]
            if c in pal:
                n=1
                while x+n<len(r) and r[x+n]==c:n+=1
                out.append(f'<rect x="{x+ox}" y="{y}" width="{n}" height="1" fill="{pal[c]}"/>');x+=n
            else:x+=1
    return ''.join(out)
def svg(w,h,body):
    s=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" shape-rendering="crispEdges">{body}</svg>'
    return 'url("data:image/svg+xml,'+urllib.parse.quote(s,safe=' =:/;,')+'")'
doc_sheet=svg(24,16,rects(DOC1)+rects(DOC2,12))
doc_still=svg(12,16,rects(DOC1))
flag=svg(8,14,rects(FLAG))
cloud=svg(12,5,rects(CLOUD))
cloudN=svg(12,5,rects(CLOUD,pal={'W':'#3a4a80'}))
def hills(c1,c2,dirt,dirt2):
    import math
    W=200;H=22;b=[]
    ys=[7+round(4*math.sin(i/9)+2*math.sin(i/4)+1) for i in range(W)]
    i=0
    while i<W:
        n=1
        while i+n<W and ys[i+n]==ys[i]:n+=1
        b.append(f'<rect x="{i}" y="{ys[i]}" width="{n}" height="{H-ys[i]}" fill="{c1}"/>');i+=n
    b.append(f'<path d="M0 {H-4}h{W}" stroke="{c2}" stroke-dasharray="1 2"/>')
    b.append(f'<rect x="0" y="{H-3}" width="{W}" height="3" fill="{dirt}"/>')
    b.append(f'<path d="M0 {H-1.5}h{W}" stroke="{dirt2}" stroke-width="3" stroke-dasharray="1 3"/>')
    return svg(W,H,''.join(b))
# รอบ sin ต้องต่อกันตอน repeat-x → ใช้ความกว้างที่ลงตัวพอประมาณ ยอมให้มีรอยต่อเล็กน้อย
hl=hills('#8fd18f','#5fae6a','#8a5a2a','#6b4420')
hd=hills('#2f7a45','#256238','#5a3a1a','#432a12')
css=pathlib.Path(__file__).with_name('pixel_theme.css').read_text(encoding='utf-8')
for k,v in dict(DOC_SHEET=doc_sheet,DOC_STILL=doc_still,FLAG=flag,CLOUD=cloud,CLOUD_N=cloudN,HILLS_L=hl,HILLS_D=hd).items():
    css=css.replace('{{'+k+'}}',v)
out=pathlib.Path(__file__).resolve().parent.parent/'assets'/'pixel.css'
out.write_text('/* สร้างจาก tools/pixel_theme.css ด้วย tools/pixel_sprites.py — แก้ที่ต้นฉบับแล้วรันใหม่ */\n'+css,encoding='utf-8')
print(out,len(css))
