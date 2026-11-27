"""เขียนเฉลยแบบทีละช้อยส์ลง data/<id>-exams.json

ใช้: python3 tools/apply_why.py <id> <ไฟล์เฉลย.txt>

ไฟล์เฉลย (ข้อความล้วน):
    @@ 79/117
    แก่นของข้อ 1 บรรทัด
    ✓ A: ทำไมถูก
    ✗ B: ทำไมผิด
      บรรทัดที่ขึ้นต้นด้วยช่องว่าง = ประโยคต่อของช้อยส์ก่อนหน้า
    ▶ ฟังอาจารย์เฉลย [t=4:00]

ตรวจให้ว่า: ✓ ตรงกับ answer · ทุกช้อยส์มีคำอธิบายครบ 1 ครั้ง · เวลาในคลิป [t=..] เดิมไม่หาย
ไม่แตะ answer / options / doubt
"""
import json, re, sys

CH = re.compile(r'^\s*([✓✗])\s*([A-H])\s*[:：]')

def parse(path):
    out, cur = {}, None
    for line in open(path, encoding='utf-8').read().replace('\r', '').split('\n'):
        if line.startswith('@@ '):
            cur = line[3:].strip(); out[cur] = []; continue
        if cur is None: continue
        out[cur].append(line.rstrip())
    return {k: '\n'.join(v).strip('\n') for k, v in out.items()}

def validate(qid, q, why):
    errs = []
    marks = [(m.group(1), m.group(2)) for m in (CH.match(l) for l in why.split('\n')) if m]
    letters = [l for _, l in marks]
    opts = list(q.get('options', {}))
    if sorted(letters) != sorted(opts): errs.append(f'ช้อยส์ไม่ครบ/ซ้ำ: มี {letters} ต้องมี {opts}')
    ok = [l for s, l in marks if s == '✓']
    if ok != [q['answer']]: errs.append(f'✓ = {ok} แต่ answer = {q["answer"]}')
    old_t = set(re.findall(r'\[t=[\d:]+\]', q.get('why', '')))
    new_t = set(re.findall(r'\[t=[\d:]+\]', why))
    if old_t - new_t: errs.append(f'เวลาในคลิปหาย: {old_t - new_t}')
    return errs

def main():
    cid, src = sys.argv[1], sys.argv[2]
    p = f'data/{cid}-exams.json'
    data = json.load(open(p, encoding='utf-8'))
    new = parse(src); bad = 0
    for qid, why in new.items():
        if qid not in data['exams']: print('ไม่พบข้อ', qid); bad += 1; continue
        e = validate(qid, data['exams'][qid], why)
        if e: print(qid, '·', ' / '.join(e)); bad += 1; continue
        data['exams'][qid]['why'] = why
        # ข้อซ้ำ (โจทย์ ช้อยส์ คำตอบเหมือนกันทุกตัว แต่คนละเลขข้อ) ใช้เฉลยเดียวกัน
        q0 = data['exams'][qid]
        for k, q in data['exams'].items():
            if k not in new and (q['stem'], q.get('options'), q['answer']) == (q0['stem'], q0.get('options'), q0['answer']) and not validate(k, q, why):
                q['why'] = why
    if bad: print(f'ผิด {bad} ข้อ ยังไม่บันทึก'); sys.exit(1)
    json.dump(data, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    left = [k for k, q in data['exams'].items() if '\n' not in q.get('why', '') or validate(k, q, q['why'])]
    print(f'บันทึก {len(new)} ข้อ · ยังไม่เป็นแบบทีละช้อยส์ {len(left)} ข้อ')

if __name__ == '__main__': main()
