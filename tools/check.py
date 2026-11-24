#!/usr/bin/env python3
"""ตรวจไฟล์บทก่อน push: python3 tools/check.py [id ...]  (ไม่ใส่ id = ตรวจทุกบทที่ ready)"""
import json, re, sys, os
D = os.path.join(os.path.dirname(__file__), '..', 'data')
err, warn = [], []
def E(m): err.append(m)
def W(m): warn.append(m)
def load(p):
    try: return json.load(open(os.path.join(D, p), encoding='utf-8'))
    except FileNotFoundError: return None
    except Exception as e: E(f'{p}: JSON เสีย ({e})'); return None
idx = load('chapters.json')['chapters']
ids = sys.argv[1:] or [c['id'] for c in idx if c.get('ready')]
for cid in ids:
    if not any(c['id'] == cid for c in idx): E(f'{cid}: ไม่มีใน chapters.json')
    md = open(os.path.join(D, f'{cid}.md'), encoding='utf-8').read()
    lines = md.split('\n')
    boxes = [int(m.group(1)) for m in re.finditer(r'^## (\d+) \|', md, re.M)]
    if boxes != list(range(1, len(boxes) + 1)): E(f'{cid}.md: เลขกล่องไม่เรียง 1..n → {boxes}')
    bs = set(boxes)
    for m in re.finditer(r'\[\[(\d+)\]\]', md):
        if int(m.group(1)) not in bs: E(f'{cid}.md: ลิงก์ [[{m.group(1)}]] ไม่มีกล่องนี้')
    # ตาราง: จำนวนช่องต้องเท่าหัวตาราง
    i = 0
    while i < len(lines):
        if lines[i].startswith('|') and i + 1 < len(lines) and re.match(r'^\|[\s:|-]+\|$', lines[i + 1]):
            n = lines[i].strip().strip('|').count('|') + 1; j = i + 2
            while j < len(lines) and lines[j].startswith('|'):
                c = re.sub(r'`[^`]*`', '', lines[j]).strip().strip('|').count('|') + 1
                if c != n: E(f'{cid}.md บรรทัด {j+1}: ตารางมี {c} ช่อง แต่หัวมี {n}')
                j += 1
            i = j
        else: i += 1
    for k in ('**', '=='):
        for no, l in enumerate(lines, 1):
            if l.count(k) % 2 and not l.startswith('<'): W(f'{cid}.md บรรทัด {no}: {k} ไม่ครบคู่')
    if md.count('::: fig') != len(re.findall(r'^:::\s*$', md, re.M)): E(f'{cid}.md: ::: fig กับ ::: ปิดไม่ครบคู่')
    ex = load(f'{cid}-exams.json')
    if ex is None: W(f'{cid}-exams.json: ไม่มีไฟล์')
    else:
        ex = ex.get('exams', ex)
        for q, v in ex.items():
            if int(v.get('box', 0)) not in bs: E(f'{cid}-exams {q}: box {v.get("box")} ไม่มีจริง')
            if v.get('answer') and v['answer'] not in v.get('options', {}): E(f'{cid}-exams {q}: answer {v["answer"]} ไม่อยู่ใน options')
        covered = {int(v['box']) for v in ex.values() if v.get('box')}
        if bs - covered: W(f'{cid}: กล่องที่ไม่มีข้อสอบ {sorted(bs - covered)}')
    nu = load(f'{cid}-numbers.json')
    if nu is None: W(f'{cid}-numbers.json: ไม่มีไฟล์ (หน้า Numbers จะไม่มีบทนี้)')
    else:
        for x in nu.get('items', []):
            if x.get('t') not in ('cut', 'f'): E(f'{cid}-numbers: t ต้องเป็น cut/f → {x.get("name")}')
            if x.get('box') not in bs: E(f'{cid}-numbers: box {x.get("box")} ไม่มีจริง → {x.get("name")}')
            for k in ('cat', 'name', 'v'):
                if not x.get(k): E(f'{cid}-numbers: ขาด {k} → {x}')
    heads = re.findall(r'^\| *([^|]+?) *\|', md, re.M)
    if not any(re.match(r'^(ยา|เชื้อ|drug|organism)', h, re.I) for h in heads): W(f'{cid}.md: ไม่มีตารางหัว "ยา"/"เชื้อ" (หน้า Drug & Bug จะไม่มีบทนี้)')
    load(f'{cid}-abbr.json')
load('abbr.json')
for w in warn: print('⚠ ', w)
for e in err: print('✗ ', e)
print(f'{"ผ่าน" if not err else "ไม่ผ่าน"}: {len(err)} error · {len(warn)} warning')
sys.exit(1 if err else 0)
