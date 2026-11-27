/* nannie compre website — โครงเว็บ (ไม่ต้องแก้ไฟล์นี้เวลาเพิ่มบท: เพิ่มแค่ data/<id>.md + data/<id>-exams.json แล้วใส่ชื่อใน data/chapters.json) */
(function () {
  'use strict';
  const KEY = 'nle-tb-v1';
  const $ = (s, el = document) => el.querySelector(s);
  const view = $('#view');
  const sidebar = $('#sidebar');

  /* ---------- storage ---------- */
  let S = {};
  try { S = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { S = {}; }
  function ensureS() {
    S.done = S.done || {}; S.lvl = S.lvl || {}; for (const k in S.done) { if (!S.lvl[k]) S.lvl[k] = 4; } S.done = {};
    S.wrong = S.wrong || {}; S.known = S.known || {}; S.stats = S.stats || {}; S.notes = S.notes || {};
    S.hl = S.hl || {}; S.kw = S.kw || []; S.srs = S.srs || {}; S.figw = S.figw || {}; S.ans = S.ans || {};
  }
  ensureS();
  if (S.focus) document.body.classList.add('focus');
  if (S.hlOff) document.documentElement.classList.add('no-hl');
  function saveLocalOnly() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} updateWrongCount(); }
  function save() {
    S._updatedAt = Date.now(); S._dirty = true;
    saveLocalOnly();
    if (window.NLE_SYNC) window.NLE_SYNC.schedulePush();
  }

  /* ---------- data ---------- */
  let INDEX = null;
  const CH = {};
  async function loadIndex() {
    if (INDEX) return INDEX;
    const r = await fetch('data/chapters.json', { cache: 'no-cache' });
    INDEX = (await r.json()).chapters;
    INDEX.sort((a, b) => chNum(a.id) - chNum(b.id) || a.id.localeCompare(b.id));   // เรียงตามเลขบท B3 < B4 < … < B10 อัตโนมัติ
    return INDEX;
  }
  function chNum(id) { const m = /\d+/.exec(id || ''); return m ? Number(m[0]) : Infinity; }
  // บทที่โหลดแล้ว เรียงตามลำดับใน INDEX (ไม่ขึ้นกับว่าไฟล์ไหนโหลดเสร็จก่อน)
  function loadedCH() { return (INDEX || []).map(c => CH[c.id]).filter(Boolean); }
  async function loadChapter(id) {
    if (CH[id]) return CH[id];
    const meta = INDEX.find(c => c.id === id);
    if (!meta || !meta.ready) return null;
    const j = u => fetch(u, { cache: 'no-cache' }).then(r => r.ok ? r.json() : {}).catch(() => ({}));
    const [md, ex, ga, ca, nu, fl] = await Promise.all([
      fetch(`data/${id}.md`, { cache: 'no-cache' }).then(r => r.text()),
      j(`data/${id}-exams.json`), j('data/abbr.json'), j(`data/${id}-abbr.json`), j(`data/${id}-numbers.json`), j(`data/${id}-flows.json`)
    ]);
    const ch = parseChapter(md, meta);
    ch.abbr = Object.assign({}, ga, ca);
    ch.numbers = nu.items || [];
    ch.flows = fl.flows || [];
    // flowchart ในกล่อง: วางตรง "::: flow <id>" ถ้าไม่มีจุดวางก็ต่อท้ายกล่อง
    for (const s of ch.sections) {
      for (const f of ch.flows.filter(x => +x.box === s.no)) {
        const html = flowHTML(f, `${id}/${s.no}|flow:${f.id}`, `<a class="fl-all" href="#/flows?ch=${id}">ดูทุก flowchart ›</a>`);
        const slot = `<div class="flow-slot" data-f="${f.id}"></div>`;
        s.html = s.html.includes(slot) ? s.html.replace(slot, html) : s.html + html;
      }
      s.html = s.html.replace(/<div class="flow-slot" data-f="[^"]*"><\/div>/g, '');
    }
    ch.exams = ex.exams || ex;
    for (const s of ch.sections) s.examIds = [];
    for (const [qid, q] of Object.entries(ch.exams)) {
      const s = ch.sections.find(x => x.no === Number(q.box));
      if (s) s.examIds.push(qid);
    }
    for (const s of ch.sections) s.examIds.sort(byYearDesc);
    CH[id] = ch;
    return ch;
  }
  async function loadAll() { await loadIndex(); return Promise.all(INDEX.filter(c => c.ready).map(c => loadChapter(c.id))); }
  function yearNum(id) { const y = parseFloat(id.split('/')[0]); return isNaN(y) ? 0 : y; }
  function byYearDesc(a, b) { return yearNum(b) - yearNum(a) || parseInt(a.split('/')[1]) - parseInt(b.split('/')[1]); }

  /* ---------- tiny markdown for chapter files ---------- */
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function inline(s) {
    return s
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/==(.+?)==/g, '<mark>$1</mark>')
      .replace(/`(.+?)`/g, '<span class="flow">$1</span>')
      .replace(/\{E\}/g, '<span class="tag e">ออกสอบ</span>')
      .replace(/\{S\}/g, '<span class="tag s">เสริม</span>')
      .replace(/\{X\}/g, '<span class="tag x">ข้ามบท</span>')
      .replace(/\[\[([a-z][\w-]*):(\d+)\]\]/g, (m, c, n) => `<a href="#/${c}/${n}">${esc(chTitle(c))} กล่อง ${n}</a>`)   // ลิงก์ข้ามบท [[b7:12]]
      .replace(/\[\[(\d+)\]\]/g, '<a href="#" data-box="$1">กล่อง $1</a>')
      .replace(/\[t=(\d{1,2}(?::\d{2}){1,2})\]/g, (m, t) => CLIP ? `<a class="clip-t" href="${CLIP}${/drive\.google/.test(CLIP) ? (CLIP.includes('?') ? '&' : '?') + 't=' + toSec(t) : '#t=' + toSec(t)}" target="_blank" rel="noopener">▶ ${t}</a>` : `<span class="clip-t">▶ ${t}</span>`);   // เวลาในคลิป [t=12:34]
  }
  let CLIP = '';   // ลิงก์คลิปของบทที่กำลังแสดง (frontmatter clip:)
  const toSec = t => t.split(':').reduce((a, x) => a * 60 + Number(x), 0);
  function chTitle(c) { const m = (INDEX || []).find(x => x.id === c); return m ? m.title.split(' ')[0] : c.toUpperCase(); }
  function parseChapter(md, meta) {
    const lines = md.replace(/\r/g, '').split('\n');
    const ch = { id: meta.id, title: meta.title, pages: [], sections: [], source: '' };
    let i = 0;
    if (lines[0] === '---') {
      i = 1;
      while (i < lines.length && lines[i] !== '---') {
        const m = lines[i].match(/^(\w+):\s*(.*)$/); if (m) ch[m[1]] = m[2]; i++;
      }
      i++;
    }
    CLIP = /^https:\/\//.test(ch.clip || '') ? ch.clip : '';
    let page = 0, sec = null, buf = [];
    const flush = () => { if (sec) { sec.html = renderBlocks(buf); sec.text = buf.join(' ').replace(/<[^>]+>/g, ' '); } buf = []; };
    for (; i < lines.length; i++) {
      const L = lines[i];
      let m;
      if ((m = L.match(/^# PAGE (\d+)\s*\|\s*(.*)$/))) { flush(); sec = null; page = +m[1]; ch.pages.push({ no: page, title: m[2] }); continue; }
      if ((m = L.match(/^## (\d+)\s*\|\s*(.*)$/))) {
        flush();
        sec = { no: +m[1], page, title: m[2], freq: '', stars: 0, kw: [], cards: [], lead: '' };
        ch.sections.push(sec);
        // header fields directly below
        while (i + 1 < lines.length && /^(freq|stars|kw|card|lead):/.test(lines[i + 1])) {
          i++; const f = lines[i].match(/^(\w+):\s*(.*)$/);
          if (f[1] === 'kw') sec.kw.push(...f[2].split('|').map(x => x.trim()).filter(Boolean));
          else if (f[1] === 'card') { const [a, b] = f[2].split('::'); sec.cards.push({ f: a.trim(), b: (b || '').trim() }); }
          else if (f[1] === 'stars') sec.stars = +f[2];
          else sec[f[1]] = f[2];
        }
        continue;
      }
      if (sec) buf.push(L);
    }
    flush();
    return ch;
  }
  // ประโยคที่อ้างข้อสอบเก่า (เช่น 79/117) หรือมีป้าย {E} = ไฮไลต์ "ออกสอบ" ให้อัตโนมัติ
  const EXAM_RE = /(^|[^\d.])(7\d(\.\d)?\/\d{1,3})(?!\d)|\{E\}/;
  function exCls(t) { return EXAM_RE.test(t) ? ' class="hl-exam"' : ''; }
  function renderBlocks(lines) {
    let out = '', i = 0;
    const para = [];
    const flushP = () => { if (para.length) { const t = para.join(' '); out += `<p${exCls(t)}>${inline(t)}</p>`; para.length = 0; } };
    while (i < lines.length) {
      const L = lines[i];
      if (!L.trim()) { flushP(); i++; continue; }
      if (L.startsWith('### ')) { flushP(); out += `<h3>${inline(L.slice(4))}</h3>`; i++; continue; }
      if (L.startsWith('#### ')) { flushP(); out += `<h2>${inline(L.slice(5))}</h2>`; i++; continue; }
      if (L.startsWith('?? ')) {
        flushP(); const [q, a] = L.slice(3).split('::');
        out += `<div class="card think"><div class="lbl">${ic('think')} หยุดคิดก่อน</div><p class="think-q">${inline(q.trim())}</p><button class="reveal-btn" data-reveal>Show answer</button><div class="think-a" hidden>${inline((a || '').trim())}</div></div>`;
        i++; continue;
      }
      if (L.startsWith('!! ') || L.startsWith('>> ') || L.startsWith('@@ ')) {
        flushP(); const tag = L.slice(0, 2); const kind = { '!!': 'trap', '>>': 'note', '@@': 'hint' }[tag]; const items = [];
        while (i < lines.length && lines[i].startsWith(tag + ' ')) { items.push(lines[i].slice(3)); i++; }
        const lbl = { trap: ic('warn') + ' กับดักข้อสอบ', note: ic('pin') + ' อาจารย์เน้น', hint: '🎯 อาจารย์บอกข้อสอบ' }[kind];
        out += `<div class="card ${kind}"><div class="lbl">${lbl}</div>` + (items.length > 1 ? `<ul>${items.map(x => `<li>${inline(x)}</li>`).join('')}</ul>` : `<p>${inline(items[0])}</p>`) + '</div>';
        continue;
      }
      if (L.startsWith('- ')) {
        flushP(); const items = [];
        while (i < lines.length && lines[i].startsWith('- ')) { items.push(lines[i].slice(2)); i++; }
        out += `<ul>${items.map(x => `<li${exCls(x)}>${inline(x)}</li>`).join('')}</ul>`; continue;
      }
      if (/^\d+\. /.test(L)) {
        flushP(); const items = [];
        while (i < lines.length && /^\d+\. /.test(lines[i])) { items.push(lines[i].replace(/^\d+\. /, '')); i++; }
        out += `<ol>${items.map(x => `<li>${inline(x)}</li>`).join('')}</ol>`; continue;
      }
      if (L.startsWith('|')) {
        flushP(); const rows = [];
        while (i < lines.length && lines[i].startsWith('|')) { rows.push(lines[i].replace(/^\||\|$/g, '').split('|').map(c => c.trim())); i++; }
        const body = rows.filter(r => !r.every(c => /^-+$/.test(c)));
        const [h, ...rest] = body;
        out += `<div class="tbl-wrap"><table class="t"><thead><tr>${h.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rest.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
        continue;
      }
      if (L.startsWith('::: flow ')) { flushP(); out += `<div class="flow-slot" data-f="${esc(L.slice(9).trim())}"></div>`; i++; continue; }
      if (L.startsWith('::: fig')) {
        flushP(); const cap = L.slice(7).trim(); const svg = []; i++;
        while (i < lines.length && lines[i] !== ':::') { svg.push(lines[i]); i++; }
        i++;
        out += `<figure class="fig">${svg.join('\n')}${cap ? `<figcaption>${inline(cap)}</figcaption>` : ''}</figure>`;
        continue;
      }
      if (L.startsWith('<')) { flushP(); out += L; i++; continue; }
      para.push(L); i++;
    }
    flushP();
    return out;
  }

  /* ---------- helpers ---------- */
  const secKey = (ch, no) => `${ch}/${no}`;
  // ระดับความเข้าใจ (4 = มั่นใจ, 5 = สีชมพู ใช้ความจำเยอะ) ที่ผู้ใช้เปลี่ยนได้ตลอด
  const LV = {
    4: { s: '★★★★', t: 'เข้าใจแล้ว มั่นใจมาก' },
    3: { s: '★★★', t: 'เข้าใจปานกลาง ถ้ามีเวลาให้กลับมาทวน' },
    2: { s: '★★', t: 'ไม่ค่อยเข้าใจ กลับมาทวน' },
    1: { s: '★', t: 'ไม่เข้าใจ ไม่แม่นเลย' },
    5: { s: '🧠 จำเยอะ', t: 'ใช้ความจำเยอะ ให้กลับมาจำหน่อย' }
  };
  const LV_ORD = [4, 3, 2, 1, 5];
  const lvOf = (c, no) => S.lvl[secKey(c, no)] || 0;
  // คะแนนข้อสอบของกล่อง (คำตอบล่าสุดแต่ละข้อ) แสดงเมื่อทำครบทุกข้อแล้ว
  function boxScore(c, s) {
    const ids = s.examIds || []; if (!ids.length) return '';
    let done = 0, ok = 0;
    for (const q of ids) { const k = `${c}|${q}`; if (S.stats[k]) { done++; if (!S.wrong[k]) ok++; } }
    if (done < ids.length) return '';
    return `<span class="bxs${ok === ids.length ? ' full' : ''}" title="ข้อสอบในกล่องนี้ ตอบถูก ${ok} จาก ${ids.length} ข้อ (ครั้งล่าสุด)">(${ok}/${ids.length})</span>`;
  }
  function chProgress(ch) {
    const n = ch.sections.length, c = { 4: 0, 3: 0, 2: 0, 1: 0, 5: 0 };
    ch.sections.forEach(s => { const l = lvOf(ch.id, s.no); if (l && c[l] != null) c[l]++; });
    const d = c[4] + c[3] + c[2] + c[1] + c[5];
    return { n, d, c, pct: n ? Math.round(c[4] * 100 / n) : 0 };
  }
  // แถบความคืบหน้าแบ่งสีตามดาว
  function lvBar(p, big) {
    const seg = l => p.c[l] ? `<i class="lv${l}" style="width:${p.c[l] * 100 / p.n}%" title="${LV[l].s} ${p.c[l]} หัวข้อ"></i>` : '';
    return `<div class="lvbar${big ? ' big' : ''}">${LV_ORD.map(seg).join('')}</div>`;
  }
  function lvLegend(p) {
    return `<div class="lvlegend">${LV_ORD.map(l => `<span><b class="dot lv${l}"></b>${LV[l].s} ${p.c[l]}</span>`).join('')}<span><b class="dot"></b>ยังไม่ประเมิน ${p.n - p.d}</span></div>`;
  }
  const stars = n => n ? '★'.repeat(n) : '';
  function freqBadge(s) {
    if (!s.freq) return '';
    const k = parseInt(s.freq); const cls = k >= 4 ? 'hot' : k >= 2 ? 'mid' : '';
    return `<span class="badge ${cls}">Tested ${esc(s.freq)} yrs ${stars(s.stars)}</span>`;
  }
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function updateWrongCount() { const n = Object.keys(S.wrong).length; const el = $('#wrongCount'); el.hidden = !n; el.textContent = n; const r = $('#reviewCount'); if (r) { const d = dueItems().length; r.hidden = !d; r.textContent = d; } }
  /* ---------- แผนทวนรายวัน (เว้นระยะ) ----------
     รายการ: กล่อง ★/★★/★★★ · ข้อสอบในกองข้อผิด · keyword ที่ยังไม่ติ๊ก
     S.srs[id] = { due: วันที่ครบกำหนด (นับเป็นวัน), iv: ระยะห่าง (วัน), n: จำนวนครั้งที่ทวน } */
  const today = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 6e4) / 864e5);
  const BASE = { 1: 1, 2: 2, 3: 4, 5: 2 };
  function dueItems() {
    const t = today(), out = [];
    const due = id => { const r = S.srs[id]; return !r || r.due <= t; };
    for (const k in S.lvl) { const l = S.lvl[k]; if (((l >= 1 && l <= 3) || l === 5) && due('b:' + k)) out.push({ type: 'box', id: 'b:' + k, k, l }); }
    for (const k in S.wrong) if (due('q:' + k)) out.push({ type: 'exam', id: 'q:' + k, w: S.wrong[k] });
    for (const x of S.kw) if (!x.ok && due('k:' + x.at)) out.push({ type: 'kw', id: 'k:' + x.at, x });
    return out;
  }
  // จำได้ → ระยะห่างยาวขึ้น · ยังไม่แม่น → กลับมาพรุ่งนี้
  function schedule(id, good, base) {
    const r = S.srs[id] || { iv: 0, n: 0 };
    r.iv = good ? Math.max(base || 1, Math.round((r.iv || base || 1) * 2.2)) : 1;
    r.n = (r.n || 0) + 1; r.due = today() + r.iv; r.last = Date.now();
    S.srs[id] = r; S.revDone = S.revDone && S.revDone.d === today() ? { d: today(), n: S.revDone.n + 1 } : { d: today(), n: 1 };
    save();
  }
  // บันทึกการอ่านรายวัน: S.read[วัน][กล่อง] = % ที่เลื่อนอ่านถึง (นับว่าอ่านจบเมื่อ ≥ 60%)
  let rdT;
  function trackRead() {
    const m = location.hash.match(/^#\/([^/]+)\/(\d+)$/); if (!m) return;
    const h = document.documentElement.scrollHeight - innerHeight;
    const pct = h <= 0 ? 100 : Math.min(100, Math.round(scrollY * 100 / h));
    S.read = S.read || {}; const d = today(); const day = S.read[d] = S.read[d] || {};
    const k = m[1] + '/' + m[2]; if (k in day && day[k] >= pct) return; day[k] = Math.min(100, pct);
    clearTimeout(rdT); rdT = setTimeout(() => { for (const x in S.read) if (x < d - 60) delete S.read[x]; save(); }, 800);
  }
  function readToday(chId) {
    const day = (S.read || {})[today()] || {}; let done = 0, seen = 0;
    for (const k in day) if (!chId || k.startsWith(chId + '/')) { seen++; if (day[k] >= 60) done++; }
    return { done, seen };
  }
  function streak() { let n = 0, d = today(); const R = S.read || {}; const has = x => R[x] && Object.values(R[x]).some(v => v >= 60); if (!has(d)) d--; while (has(d)) { n++; d--; } return n; }
  const ivText = id => { const r = S.srs[id]; return r ? `ทวนแล้ว ${r.n} ครั้ง · รอบถัดไปอีก ${r.iv} วัน` : 'ยังไม่เคยทวน'; };
  function closeNav() { document.body.classList.remove('nav-open'); }

  /* ---------- ปุ่มเลือกทั้งหมด / ไม่เลือกเลย (ใช้ร่วมกันทุกหน้าคัดกรอง) ---------- */
  const selActs = (id, allLbl = 'เลือกทั้งหมด', noneLbl = 'ไม่เลือกเลย') =>
    `<span class="sel-acts" data-sel-for="${id}"><button type="button" class="btn small" data-sel="all">${allLbl}</button><button type="button" class="btn small" data-sel="none">${noneLbl}</button></span>`;
  function bindSelActs(root, onAfter) {
    root.querySelectorAll('.sel-acts[data-sel-for]').forEach(bar => {
      const target = root.querySelector('#' + bar.dataset.selFor);
      if (!target) return;
      bar.querySelectorAll('button[data-sel]').forEach(btn => {
        btn.onclick = () => {
          const val = btn.dataset.sel === 'all';
          target.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = val; });
          if (onAfter) onAfter(bar.dataset.selFor, val);
        };
      });
    });
  }

  /* ---------- สลับสไตล์ธีม (Monument Valley / Pixel Classic — เปลี่ยนได้ตลอดไม่เสียข้อมูล) ---------- */
  const APP_VER = '70';
  const uiStyle = () => S.uiStyle === 'pixel' ? 'pixel' : 'monument';
  function refreshIcons() {
    const u = uiStyle();
    document.querySelectorAll('svg.ic[data-ic]').forEach(el => {
      const n = el.dataset.ic;
      if (!ICON[n]) return;
      const mv = u === 'monument' && ICON_MV[n];
      el.setAttribute('stroke-width', mv ? '1.55' : '1.8');
      el.setAttribute('stroke-linecap', mv ? 'square' : 'round');
      el.setAttribute('stroke-linejoin', mv ? 'miter' : 'round');
      el.innerHTML = mv || ICON[n];
    });
  }
  function applyUiStyle() {
    const u = uiStyle();
    document.documentElement.dataset.ui = u;
    const link = document.getElementById('themeCss');
    const want = `assets/${u === 'pixel' ? 'pixel' : 'monument'}.css?v=${APP_VER}`;
    if (link && !link.getAttribute('href').endsWith(want)) link.href = want;
    const logo = document.getElementById('brandLogo');
    if (logo) logo.src = u === 'pixel' ? 'assets/icon.svg' : 'assets/icon-mv.svg';
    const fav = document.querySelector('link[rel="icon"]');
    if (fav) fav.href = u === 'pixel' ? 'assets/icon.svg' : 'assets/icon-mv.svg';
    refreshIcons();
  }
  function setUiStyle(u) {
    S.uiStyle = u === 'pixel' ? 'pixel' : 'monument';
    save(); applyUiStyle(); rerender();
    toast(S.uiStyle === 'pixel' ? 'สลับกลับเป็นธีม Pixel Classic แล้ว' : 'เปิดใช้ธีม Monument Valley แล้ว');
  }

  /* ---------- ธีมเฉพาะของแต่ละบท (สี + รูปทรงหอคอย Monument Valley) ---------- */
  const MV_THEMES = {
    'b3':         { name: 'วิหารแห่งดวงดาว',        shape: 'zigzag', d: { sky: ['#0c122a','#212257','#5a3678'], wl: '#454e88', wr: '#252b58', top: '#9eb6eb', arch: '#111735', spire: '#2a2e63', win: '#ffe48c', trail: '#5eead4', gem: '#c084fc' }, l: { sky: ['#c9dcf5','#e3e8fb','#f2e0f7'], wl: '#a6a8db', wr: '#7f83bd', top: '#f8f6ff', arch: '#cad8f2', spire: '#9fb0d8', win: '#45396b', trail: '#2b7a78', gem: '#7c5cbf' } },
    'b4':         { name: 'หอคอยปะการัง',           shape: 'twin',   d: { sky: ['#1f1428','#4a2442','#8c475f'], wl: '#7c4864', wr: '#4a2940', top: '#f0b6c6', arch: '#241427', spire: '#522947', win: '#ffe194', trail: '#fda4af', gem: '#fbbf77' }, l: { sky: ['#d8efe8','#f6e6e8','#fde1d1'], wl: '#f0a6b3', wr: '#d27e90', top: '#fff5e6', arch: '#cbe4df', spire: '#c7a4ae', win: '#5a3444', trail: '#d9607c', gem: '#e59a4a' } },
    'b5':         { name: 'ปราการศิลาขาว',          shape: 'spiral', d: { sky: ['#0a0d14','#1b2130','#353f54'], wl: '#66718a', wr: '#394156', top: '#dce4f2', arch: '#0f131d', spire: '#272f42', win: '#ffe699', trail: '#fde68a', gem: '#7dd3fc' }, l: { sky: ['#dce4ec','#edf1f5','#f5ede0'], wl: '#b3becb', wr: '#8a97a8', top: '#ffffff', arch: '#d2dce6', spire: '#9eabb9', win: '#3d4758', trail: '#49688a', gem: '#d4943a' } },
    'b6':         { name: 'วิหารสายลมในหมอก',       shape: 'forest', d: { sky: ['#091c2b','#153a54','#2b6782'], wl: '#3f7696', wr: '#214863', top: '#b8e4f5', arch: '#0c2132', spire: '#1b4766', win: '#fff1a8', trail: '#67e8f9', gem: '#a5f3fc' }, l: { sky: ['#bce5ee','#dff2f6','#eef7fa'], wl: '#89c2d4', wr: '#5e9bb0', top: '#f7fdff', arch: '#bce0ea', spire: '#86b5c7', win: '#254a5c', trail: '#0e87a3', gem: '#38bdf8' } },
    'b7':         { name: 'ป้อมสนธยาทับทิม',        shape: 'twin',   d: { sky: ['#1d0e1c','#461830','#8a2f4b'], wl: '#7c3350', wr: '#4a1c32', top: '#f3a4bc', arch: '#210f1f', spire: '#541e38', win: '#ffe082', trail: '#fb7185', gem: '#ffd97d' }, l: { sky: ['#f3d6de','#fae6e8','#fde8d7'], wl: '#e58e9f', wr: '#c26579', top: '#fff5f7', arch: '#ebd0d8', spire: '#c98899', win: '#5c2335', trail: '#d13d5c', gem: '#e59a38' } },
    'b8':         { name: 'หอคอยโคมอำพัน',          shape: 'forest', d: { sky: ['#18120c','#3d2914','#7a4b1e'], wl: '#875c34', wr: '#52351b', top: '#f2d3a2', arch: '#1f150c', spire: '#4c3218', win: '#fff099', trail: '#fbbf24', gem: '#fb923c' }, l: { sky: ['#f4e4c7','#fbf0dc','#f8e2c4'], wl: '#e2b278', wr: '#be8a4f', top: '#fffaf0', arch: '#e8d7bc', spire: '#c9a67d', win: '#523415', trail: '#c77d19', gem: '#e06d3b' } },
    'b9':         { name: 'วิหารกลางมหาสมุทร',      shape: 'spiral', d: { sky: ['#071826','#0d384c','#186578'], wl: '#2e7d8c', wr: '#184b59', top: '#a6e9e8', arch: '#092030', spire: '#124659', win: '#ffe899', trail: '#2dd4bf', gem: '#38bdf8' }, l: { sky: ['#b6e6e4','#daf4f2','#e8f7f2'], wl: '#6ec2be', wr: '#479996', top: '#f2fffd', arch: '#b2e0dd', spire: '#78b5b2', win: '#1d4d4c', trail: '#17857f', gem: '#2c9cb0' } },
    'b10':        { name: 'ปราสาทแสงตะวัน',         shape: 'zigzag', d: { sky: ['#1a1638','#4b2c68','#b05a84'], wl: '#6e4c8a', wr: '#3e2959', top: '#f0c4dc', arch: '#1e173a', spire: '#492d66', win: '#ffe484', trail: '#f5d06e', gem: '#f472b6' }, l: { sky: ['#d5d4f4','#f2dce8','#fee3c3'], wl: '#d9a4c9', wr: '#b079a6', top: '#fff7ee', arch: '#d9cfe8', spire: '#b29cc7', win: '#4a2d5e', trail: '#b86e2d', gem: '#d65a96' } },
    'kt-embryo':  { name: 'หอคอยกำเนิดดารา',        shape: 'twin',   d: { sky: ['#111b36','#283e70','#5764a6'], wl: '#6972b3', wr: '#3d457d', top: '#d6d4fb', arch: '#162140', spire: '#304378', win: '#fff0a6', trail: '#c4b5fd', gem: '#7dd3fc' }, l: { sky: ['#cde0f7','#e6ecfb','#f2e6fa'], wl: '#b3b2e6', wr: '#8687c4', top: '#fafaff', arch: '#cfdcf2', spire: '#9aa8d4', win: '#3a3b6e', trail: '#6c5ce7', gem: '#38a3b8' } },
    'kt-repro':   { name: 'ปราสาทกล้วยไม้ราตรี',     shape: 'zigzag', d: { sky: ['#1b102c','#451e54','#853a7a'], wl: '#7c4685', wr: '#4a2657', top: '#f0c0ec', arch: '#1f1230', spire: '#4d225c', win: '#ffe494', trail: '#f472b6', gem: '#c084fc' }, l: { sky: ['#e5d6f5','#f5e4f3','#fde4ec'], wl: '#dca2d8', wr: '#b574b4', top: '#fff7fc', arch: '#e4d2ec', spire: '#be95c9', win: '#4f2454', trail: '#c24292', gem: '#8d5fd3' } },
    'kt-msk':     { name: 'หอคอยหยกโบราณ',          shape: 'spiral', d: { sky: ['#09171c','#17363b','#2b5c5c'], wl: '#4c857d', wr: '#2a524f', top: '#b8e3d8', arch: '#0c1f24', spire: '#1c4245', win: '#ffe38a', trail: '#6ee7b7', gem: '#fbbf24' }, l: { sky: ['#c8e8e0','#e2f3ee','#f2efe0'], wl: '#89c4b5', wr: '#5c998b', top: '#f7fffc', arch: '#c3e2da', spire: '#8ab3a8', win: '#234a42', trail: '#277d6b', gem: '#d69738' } },
    'kt-parasit': { name: 'วิหารป่ามรกต',           shape: 'forest', d: { sky: ['#061a21','#0c3842','#176158'], wl: '#4da876', wr: '#266b4e', top: '#c4f5a8', arch: '#082228', spire: '#0d3038', win: '#ff70a6', trail: '#4ade80', gem: '#f472b6' }, l: { sky: ['#bce8da','#dcf4e6','#eef8df'], wl: '#7cc994', wr: '#4d9c69', top: '#f5ffea', arch: '#b9e3d2', spire: '#6ea894', win: '#b82e67', trail: '#238a52', gem: '#d63f80' } },
    'kt-rs':      { name: 'หอคอยหมอกออโรรา',        shape: 'forest', d: { sky: ['#081426','#142e52','#1c5f6e'], wl: '#40749c', wr: '#214566', top: '#bce8f5', arch: '#0b1a30', spire: '#16395c', win: '#ffe596', trail: '#5eead4', gem: '#818cf8' }, l: { sky: ['#c4e4f4','#dff1fa','#e6f7f4'], wl: '#8ab8dc', wr: '#5e8db8', top: '#f6fcff', arch: '#c2dff0', spire: '#89adc9', win: '#254261', trail: '#1c8c8a', gem: '#5c6bc0' } }
  };
  const MV_FALLBACK_KEYS = Object.keys(MV_THEMES);
  function mvThemeOf(chId) {
    let base = MV_THEMES[chId];
    if (!base) {
      let h = 0; for (const c of String(chId || 'x')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      base = MV_THEMES[MV_FALLBACK_KEYS[h % MV_FALLBACK_KEYS.length]];
    }
    const pal = isDark() ? base.d : base.l;
    return { name: base.name, shape: base.shape, ...pal };
  }
  function applyChAccent(chId) {
    const r = document.documentElement.style;
    if (uiStyle() === 'monument' && chId) {
      const th = mvThemeOf(chId);
      r.setProperty('--mv-ch-trail', th.trail);
      r.setProperty('--mv-ch-gem', th.gem);
    } else {
      r.removeProperty('--mv-ch-trail');
      r.removeProperty('--mv-ch-gem');
    }
  }

  /* ---------- หอคอยโปรเกรสไอโซเมตริก Monument Valley สำหรับแถบด้านซ้าย (เฉพาะธีมของแต่ละบท) ---------- */
  const MV_SHAPES = {
    zigzag: {
      wp: [[42, 194], [192, 144], [68, 102], [178, 64], [130, 38]],
      beacon: [130, 21],
      arch: (th) => `
        <g fill="${th.spire}" opacity=".65">
          <path d="M18 226V138q0-10 9-17 9 7 9 17v88z"/>
          <path d="M222 226V124q0-10 10-18 10 8 10 18v102z"/>
        </g>
        <polygon points="116,42 130,35 144,42 144,96 116,96" fill="${th.wr}"/>
        <polygon points="116,42 130,49 130,96 116,96" fill="${th.wl}"/>
        <polygon points="178,64 130,38 130,68 178,94" fill="${th.wr}"/>
        <polygon points="68,102 178,64 178,96 68,134" fill="${th.wl}"/>
        <path d="M108 120v-18a8 8 0 0 1 16 0v18z" fill="${th.arch}"/>
        <path d="M142 108v-17a7 7 0 0 1 14 0v17z" fill="${th.arch}"/>
        <polygon points="54,104 68,97 82,104 82,168 54,168" fill="${th.wr}"/>
        <polygon points="54,104 68,111 68,168 54,168" fill="${th.wl}"/>
        <rect x="61" y="118" width="3.2" height="7" rx="1.6" fill="${th.win}"/>
        <polygon points="68,102 192,144 192,178 68,136" fill="${th.wr}"/>
        <path d="M102 154v-18a8 8 0 0 1 16 0v18z" fill="${th.arch}"/>
        <path d="M138 166v-18a8 8 0 0 1 16 0v18z" fill="${th.arch}"/>
        <polygon points="180,146 194,139 208,146 208,226 180,226" fill="${th.wr}"/>
        <polygon points="180,146 194,153 194,226 180,226" fill="${th.wl}"/>
        <rect x="199" y="160" width="3.5" height="8" rx="1.7" fill="${th.win}"/>
        <rect x="186" y="176" width="3.2" height="7" rx="1.6" fill="${th.gem}" opacity=".85"/>
        <polygon points="42,194 192,144 192,226 42,226" fill="${th.wl}"/>
        <path d="M76 226v-26a11 11 0 0 1 22 0v26z" fill="${th.arch}"/>
        <path d="M122 226v-32a11 11 0 0 1 22 0v32z" fill="${th.arch}"/>
        <polygon points="28,196 42,189 56,196 56,226 28,226" fill="${th.wr}"/>
        <polygon points="28,196 42,203 42,226 28,226" fill="${th.wl}"/>`
    },
    spiral: {
      wp: [[130, 202], [204, 160], [130, 122], [56, 86], [130, 40]],
      beacon: [130, 21],
      arch: (th) => `
        <!-- Sacred geometric platform & Escher diamond citadel -->
        <polygon points="130,174 230,214 130,248 30,214" fill="${th.spire}" opacity=".55"/>
        <polygon points="130,182 218,214 130,240 42,214" fill="none" stroke="${th.trail}" stroke-opacity=".28" stroke-width="1"/>
        <!-- Central inner core pillar -->
        <polygon points="116,42 130,35 144,42 144,200 116,200" fill="${th.wr}"/>
        <polygon points="116,42 130,49 130,200 116,200" fill="${th.wl}"/>
        <!-- Upper diamond arches -->
        <polygon points="56,86 130,40 130,74 56,120" fill="${th.wl}"/>
        <path d="M84 102v-16a7 7 0 0 1 14 0v16z" fill="${th.arch}"/>
        <polygon points="56,86 130,122 130,158 56,122" fill="${th.wr}"/>
        <rect x="64" y="102" width="3.5" height="8" rx="1.6" fill="${th.win}"/>
        <circle cx="88" cy="116" r="2.2" fill="${th.gem}"/>
        <!-- Left & Right cantilevered Escher pillars -->
        <polygon points="44,88 56,82 68,88 68,202 44,202" fill="${th.wr}"/>
        <polygon points="44,88 56,94 56,202 44,202" fill="${th.wl}"/>
        <polygon points="192,162 204,156 216,162 216,226 192,226" fill="${th.wr}"/>
        <polygon points="192,162 204,168 204,226 192,226" fill="${th.wl}"/>
        <rect x="208" y="176" width="3.2" height="8" rx="1.5" fill="${th.win}"/>
        <!-- Lower grand stepped pyramid pedestal -->
        <polygon points="130,122 204,160 204,192 130,154" fill="${th.wr}"/>
        <path d="M156 172v-16a7 7 0 0 1 14 0v16z" fill="${th.arch}"/>
        <polygon points="130,202 204,160 204,226 130,226" fill="${th.wl}"/>
        <path d="M154 226v-26a10 10 0 0 1 20 0v26z" fill="${th.arch}"/>
        <polygon points="110,202 130,192 150,202 150,226 110,226" fill="${th.wr}"/>
        <polygon points="110,202 130,212 130,226 110,226" fill="${th.wl}"/>
        <circle cx="130" cy="166" r="2.8" fill="${th.gem}"/>`
    },
    twin: {
      wp: [[44, 196], [108, 160], [198, 140], [156, 94], [64, 76], [130, 38]],
      beacon: [130, 20],
      arch: (th) => `
        <!-- Twin gothic watchtowers + sweeping sky-bridges -->
        <g fill="${th.spire}" opacity=".6">
          <path d="M14 226V146l8-14 8 14v80z"/>
          <path d="M228 226V138l9-16 9 16v88z"/>
        </g>
        <!-- Left tall spire tower -->
        <polygon points="48,54 64,45 80,54 80,226 48,226" fill="${th.wr}"/>
        <polygon points="48,54 64,63 64,226 48,226" fill="${th.wl}"/>
        <path d="M52 54q0-14 12-22 12 8 12 22z" fill="${th.gem}" opacity=".85"/>
        <rect x="68" y="64" width="3.2" height="8" rx="1.6" fill="${th.win}"/>
        <rect x="55" y="96" width="3.2" height="8" rx="1.6" fill="${th.win}"/>
        <!-- Right tall spire tower -->
        <polygon points="184,78 200,69 216,78 216,226 184,226" fill="${th.wr}"/>
        <polygon points="184,78 200,87 200,226 184,226" fill="${th.wl}"/>
        <path d="M188 78q0-14 12-22 12 8 12 22z" fill="${th.gem}" opacity=".85"/>
        <rect x="204" y="92" width="3.2" height="8" rx="1.6" fill="${th.win}"/>
        <rect x="191" y="156" width="3.2" height="8" rx="1.6" fill="${th.win}"/>
        <!-- Center crown pavilion -->
        <polygon points="116,42 130,35 144,42 144,98 116,98" fill="${th.wr}"/>
        <polygon points="116,42 130,49 130,98 116,98" fill="${th.wl}"/>
        <path d="M126 70v-9a4 4 0 0 1 8 0v9z" fill="${th.win}"/>
        <!-- High arched sky-bridge -->
        <polygon points="64,76 156,94 156,126 64,108" fill="${th.wl}"/>
        <path d="M96 122v-18a12 12 0 0 1 24 0v18z" fill="${th.arch}"/>
        <!-- Lower sweeping viaduct -->
        <polygon points="44,196 108,160 198,140 198,226 44,226" fill="${th.wl}"/>
        <path d="M84 226v-32a13 13 0 0 1 26 0v32z" fill="${th.arch}"/>
        <path d="M136 226v-38a14 14 0 0 1 28 0v38z" fill="${th.arch}"/>`
    },
    forest: {
      wp: [[78, 200], [180, 166], [84, 126], [174, 84], [130, 38]],
      beacon: [130, 20],
      arch: (th) => `
        <!-- Nocturnal forest silhouettes framing the luminous slender spire -->
        <g fill="${th.arch}" opacity=".85">
          <rect x="0" y="0" width="24" height="226"/>
          <rect x="236" y="0" width="24" height="226"/>
          <path d="M22 40l26 24-6 8-20-16zM22 110l30 22-5 7-25-14zM238 54l-28 24 6 8 22-16zM238 134l-26 20 5 7 21-12z"/>
        </g>
        <g fill="${th.spire}" opacity=".65">
          <rect x="24" y="0" width="12" height="226"/><rect x="224" y="0" width="12" height="226"/>
        </g>
        <!-- Slender Monument Valley forest citadel -->
        <polygon points="116,42 130,35 144,42 144,226 116,226" fill="${th.wr}"/>
        <polygon points="116,42 130,49 130,226 116,226" fill="${th.wl}"/>
        <!-- Side mini onion-dome turrets -->
        <polygon points="72,100 84,94 96,100 96,226 72,226" fill="${th.wr}"/>
        <polygon points="72,100 84,106 84,226 72,226" fill="${th.wl}"/>
        <path d="M75 100q0-12 9-18 9 6 9 18z" fill="${th.top}"/>
        <polygon points="164,84 176,78 188,84 188,226 164,226" fill="${th.wr}"/>
        <polygon points="164,84 176,90 176,226 164,226" fill="${th.wl}"/>
        <path d="M167 84q0-12 9-18 9 6 9 18z" fill="${th.top}"/>
        <!-- Cantilevered bridges & arches -->
        <polygon points="84,126 174,84 174,112 84,154" fill="${th.wl}"/>
        <path d="M116 142v-16a8 8 0 0 1 16 0v16z" fill="${th.arch}"/>
        <polygon points="78,200 180,166 180,226 78,226" fill="${th.wl}"/>
        <path d="M114 226v-26a12 12 0 0 1 24 0v26z" fill="${th.arch}"/>
        <!-- Glowing switches & warm windows -->
        <rect x="125" y="64" width="4" height="10" rx="2" fill="${th.win}"/>
        <ellipse cx="84" cy="126" rx="5" ry="2.8" fill="${th.gem}"/>
        <ellipse cx="174" cy="84" rx="5" ry="2.8" fill="${th.gem}"/>`
    }
  };

  function mvTowerHTML(ch, curNo) {
    if (uiStyle() !== 'monument' || !ch || !ch.sections || !ch.sections.length) return '';
    const secs = ch.sections, n = secs.length;
    const p = chProgress(ch);
    const pct = Math.round(p.d * 100 / Math.max(1, p.n));
    const hide = !!S.mvMapHide;
    const th = mvThemeOf(ch.id);
    const sh = MV_SHAPES[th.shape] || MV_SHAPES.zigzag;
    const WP = sh.wp, [bx, by] = sh.beacon;
    const segs = []; let totalLen = 0;
    for (let i = 0; i < WP.length - 1; i++) {
      const dx = WP[i + 1][0] - WP[i][0], dy = WP[i + 1][1] - WP[i][1];
      const len = Math.hypot(dx, dy);
      segs.push({ a: WP[i], b: WP[i + 1], len, s0: totalLen });
      totalLen += len;
    }
    const atDist = d => {
      const cl = Math.max(0, Math.min(totalLen, d));
      for (const sg of segs) {
        if (cl <= sg.s0 + sg.len + 1e-6) {
          const t = sg.len ? (cl - sg.s0) / sg.len : 0;
          return [sg.a[0] + (sg.b[0] - sg.a[0]) * t, sg.a[1] + (sg.b[1] - sg.a[1]) * t];
        }
      }
      return WP[WP.length - 1];
    };
    const pts = secs.map((s, i) => {
      const d = n === 1 ? totalLen : (totalLen * i / (n - 1));
      const [x, y] = atDist(d);
      return { s, i, x: +x.toFixed(1), y: +y.toFixed(1), d, lv: lvOf(ch.id, s.no) };
    });
    let actIdx = curNo ? pts.findIndex(q => q.s.no === curNo) : -1;
    if (actIdx < 0) {
      for (let i = pts.length - 1; i >= 0; i--) if (pts[i].lv) { actIdx = i; break; }
      if (actIdx < 0) actIdx = 0;
    }
    const act = pts[actIdx];
    const trailPts = [];
    for (const sg of segs) {
      if (act.d >= sg.s0) {
        if (!trailPts.length) trailPts.push(`${sg.a[0]},${sg.a[1]}`);
        if (act.d >= sg.s0 + sg.len) trailPts.push(`${sg.b[0]},${sg.b[1]}`);
        else { trailPts.push(`${act.x},${act.y}`); break; }
      }
    }
    const lvCol = { 4: '#5eead4', 3: '#ffd97d', 2: '#fb923c', 5: '#f472b6', 1: '#a78bfa' };
    const r = n > 28 ? 3.2 : n > 16 ? 4 : 4.8;
    const nodes = pts.map(q => {
      const fill = q.lv ? lvCol[q.lv] : (isDark() ? '#3c4a75' : '#cdd8df');
      const isOn = q.i === actIdx;
      return `<a class="mv-node" href="#/${ch.id}/${q.s.no}"><title>กล่อง ${q.s.no}: ${esc(q.s.title)}</title>
        ${isOn ? `<circle cx="${q.x}" cy="${q.y}" r="${r + 4}" fill="none" stroke="${th.trail}" stroke-width="1.2" opacity=".88" class="mv-pulse"/>` : ''}
        <polygon class="mv-tile" points="${q.x},${(q.y - r * 0.72).toFixed(1)} ${(q.x + r * 1.25).toFixed(1)},${q.y} ${q.x},${(q.y + r * 0.72).toFixed(1)} ${(q.x - r * 1.25).toFixed(1)},${q.y}" fill="${fill}" stroke="${isOn ? '#ffffff' : 'rgba(15,20,40,.45)'}" stroke-width="${isOn ? 1.1 : 0.6}"/></a>`;
    }).join('');
    const gid = 'mvg-' + ch.id.replace(/[^a-z0-9]/gi, '');
    const doneAll = p.n > 0 && p.d >= p.n;
    const wpStr = WP.map(p => p.join(',')).join(' ');
    const svg = `<svg class="mv-tower-svg" viewBox="0 0 260 226" aria-label="แผนที่โปรเกรสของบท">
      <defs>
        <linearGradient id="${gid}s" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${th.sky[0]}"/>
          <stop offset="56%" stop-color="${th.sky[1]}"/>
          <stop offset="100%" stop-color="${th.sky[2]}"/>
        </linearGradient>
        <radialGradient id="${gid}b" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="${doneAll ? '#ffe28a' : th.trail}" stop-opacity="${doneAll ? '.88' : '.5'}"/>
          <stop offset="100%" stop-color="${th.trail}" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="${gid}t" cx="50%" cy="65%" r="50%">
          <stop offset="0%" stop-color="${th.trail}" stop-opacity=".65"/>
          <stop offset="100%" stop-color="${th.trail}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="260" height="226" fill="url(#${gid}s)"/>
      <g fill="#eef2ff" opacity="${isDark() ? '.7' : '.45'}">
        <circle cx="22" cy="18" r=".8"/><circle cx="72" cy="14" r=".9"/><circle cx="198" cy="18" r=".9"/>
        <circle cx="234" cy="30" r=".8"/><circle cx="218" cy="54" r=".7"/><circle cx="28" cy="64" r=".7"/>
      </g>
      <path d="M34 20a8.5 8.5 0 1 0 9.6 11.4 6.8 6.8 0 1 1-9.6-11.4z" fill="${isDark() ? '#ffe799' : '#fff8d6'}" opacity=".92"/>
      <circle cx="${bx}" cy="${by}" r="${doneAll ? 22 : 16}" fill="url(#${gid}b)" class="mv-pulse"/>
      <circle cx="${bx}" cy="${by}" r="14" fill="none" stroke="${th.gem}" stroke-opacity=".4" stroke-width=".8"/>
      <circle cx="${bx}" cy="${by}" r="21" fill="none" stroke="${th.trail}" stroke-opacity=".28" stroke-width=".7" stroke-dasharray="2 3"/>
      ${sh.arch(th)}
      <polyline points="${wpStr}" fill="none" stroke="${th.top}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" opacity=".92"/>
      ${trailPts.length > 1 ? `<polyline points="${trailPts.join(' ')}" fill="none" stroke="${th.trail}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" opacity=".32"/>
      <polyline points="${trailPts.join(' ')}" fill="none" stroke="${th.trail}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
      <polygon points="${bx},${by - 10} ${bx + 6},${by} ${bx},${by + 10} ${bx - 6},${by}" fill="${doneAll ? '#fff5c2' : '#eefdfa'}"/>
      <polygon points="${bx},${by - 10} ${bx + 6},${by} ${bx},${by + 10}" fill="${doneAll ? '#ffd97d' : th.trail}" opacity=".78"/>
      ${nodes}
      <g class="mv-traveler" transform="translate(${act.x},${act.y - 2})" style="pointer-events:none">
        <circle cx="0" cy="-6" r="11" fill="url(#${gid}t)"/>
        <polygon points="0,-13 4.2,-1.5 -4.2,-1.5" fill="#ffffff"/>
        <circle cx="0" cy="-14.2" r="1.8" fill="#1e2745"/>
        <polygon points="0,-21 3.3,-14 -3.3,-14" fill="#ffffff"/>
      </g>
    </svg>`;
    return `<div class="mv-tower-card" style="--mv-ch-trail:${th.trail}">
      <div class="mv-tower-head"><b title="${esc(th.name)}">✦ ${esc(th.name)}</b><span>${curNo ? `กล่อง ${curNo}/${n}` : `${p.d}/${n}`} <button type="button" id="mvMapToggle" style="border:0;background:none;padding:0 2px;font-size:11px;color:var(--muted)" title="${hide ? 'แสดงแผนที่' : 'ย่อแผนที่'}">${hide ? '▾' : '▴'}</button></span></div>
      ${hide ? '' : svg}
      <div class="mv-tower-foot"><span>ประเมิน <b>${p.d}/${p.n}</b> · มั่นใจ <b>${p.c[4]}</b></span><span class="mv-pct" style="color:${th.trail}">${pct}%</span></div>
    </div>`;
  }

  /* ---------- ปราสาทใหญ่หน้าแรกสไตล์ Monument Valley Trilogy + วงแหวนหิน Progress รายบท + ตัวละครประจำบท ---------- */
  function mvShortLbl(c) {
    const id = c.id.toLowerCase();
    if (/^b\d+$/.test(id)) return id.toUpperCase();
    const map = { 'kt-embryo': 'EMB', 'kt-repro': 'REP', 'kt-msk': 'MSK', 'kt-parasit': 'PAR', 'kt-rs': 'RS' };
    return map[id] || c.id.replace(/^kt-/i, '').slice(0, 4).toUpperCase();
  }
  function mvCharSVG(idx, cloak, accent, isCur) {
    // 4 ทรงตัวละครสไตล์ Monument Valley (หมวกกรวยขาว / ผ้าคลุมแดง-คอรัล / หมวกทรงสูงสีม่วง / หมวกแหลมนักเดินทาง)
    const kind = idx % 4;
    const aura = isCur ? `<circle cx="0" cy="-9" r="12" fill="#5eead4" opacity=".32" class="mv-pulse"/>` : '';
    if (kind === 0) {
      // Cone-hat traveler (Ida style)
      return `${aura}<polygon points="0,-13 4.2,-1.5 -4.2,-1.5" fill="#ffffff"/>
        <polygon points="0,-13 4.2,-1.5 0,-1.5" fill="${cloak}" opacity=".4"/>
        <circle cx="0" cy="-14.4" r="1.7" fill="#1e2745"/>
        <polygon points="0,-21.5 3.4,-14.2 -3.4,-14.2" fill="#ffffff"/>`;
    }
    if (kind === 1) {
      // Coral/colored cloak traveler (Ro style)
      return `${aura}<polygon points="0,-13 4.4,-1.5 -4.4,-1.5" fill="${cloak}"/>
        <circle cx="0" cy="-14.6" r="2.1" fill="#fff3e6"/>
        <path d="M-2.2 -15.5a2.3 2.3 0 0 1 4.4 0l1.4-2.5h-7.2z" fill="${accent}"/>`;
    }
    if (kind === 2) {
      // Tall angled headdress sage (MV3 purple-hat style)
      return `${aura}<polygon points="0,-13.5 4.3,-1.5 -4.3,-1.5" fill="${cloak}"/>
        <circle cx="0" cy="-14.8" r="1.7" fill="#fff5ee"/>
        <polygon points="-1.2,-16 2,-16 4.2,-24 -0.4,-24.6" fill="${accent}"/>`;
    }
    // Pointed apprentice traveler (orange/gold hat style)
    return `${aura}<polygon points="0,-12.5 3.9,-1.5 -3.9,-1.5" fill="${cloak}"/>
      <circle cx="0" cy="-14.1" r="1.8" fill="#fff4e4"/>
      <polygon points="-2.6,-15.2 2.6,-15.2 -0.6,-21.6" fill="${accent}"/>`;
  }
  function mvGrandCitadelHTML(bkWarn) {
    const ready = INDEX.filter(c => c.ready && CH[c.id]).slice().sort((a, b) => {
      const ga = a.group ? 1 : 0, gb = b.group ? 1 : 0;
      if (ga !== gb) return ga - gb;
      return chNum(a.id) - chNum(b.id) || (a.id < b.id ? -1 : 1);
    });
    let totD = 0, totN = 0, tot4 = 0;
    const items = ready.map(c => {
      const p = chProgress(CH[c.id]);
      totD += p.d; totN += p.n; tot4 += p.c[4];
      return { c, p, lbl: mvShortLbl(c), pct: p.n ? Math.round(p.d * 100 / p.n) : 0, th: mvThemeOf(c.id) };
    });
    const allPct = totN ? Math.round(totD * 100 / totN) : 0;
    const dark = isDark();
    // วงแหวนหินทางเดินโอบรอบปราสาทใหญ่ (กระจายตามความยาวส่วนโค้งเท่ากันทุกก้อน)
    const cx = 470, cy = 216, rx = 408, ry = 126;
    const a0 = 204 * Math.PI / 180, a1 = -24 * Math.PI / 180;
    const NSTEP = 240, arcPts = []; let arcTot = 0;
    for (let i = 0; i <= NSTEP; i++) {
      const a = a0 + (a1 - a0) * (i / NSTEP);
      const x = cx + rx * Math.cos(a), y = cy + ry * Math.sin(a);
      if (i > 0) arcTot += Math.hypot(x - arcPts[i - 1].x, y - arcPts[i - 1].y);
      arcPts.push({ x, y, s: arcTot });
    }
    const sampleArc = t => {
      const target = Math.max(0, Math.min(arcTot, t * arcTot));
      for (let i = 1; i < arcPts.length; i++) {
        if (arcPts[i].s >= target) {
          const p0 = arcPts[i - 1], p1 = arcPts[i], f = (target - p0.s) / Math.max(1e-6, p1.s - p0.s);
          return [+(p0.x + (p1.x - p0.x) * f).toFixed(1), +(p0.y + (p1.y - p0.y) * f).toFixed(1)];
        }
      }
      return [arcPts[arcPts.length - 1].x, arcPts[arcPts.length - 1].y];
    };
    const pathD = arcPts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('');
    const lastCh = (S.lastRead && S.lastRead.h && S.lastRead.h.match(/^#\/([^/]+)/)) ? S.lastRead.h.match(/^#\/([^/]+)/)[1] : '';
    const lvCss = { 4: 'var(--lv4)', 3: 'var(--lv3)', 2: 'var(--lv2)', 1: dark ? '#8b93b8' : 'var(--lv1)', 5: 'var(--lv5)' };
    const domCol = p => {
      if (!p.d) return dark ? '#2a355e' : '#dbe6ea';
      let best = 4, bv = -1;
      for (const l of LV_ORD) if (p.c[l] > bv) { bv = p.c[l]; best = l; }
      return lvCss[best];
    };
    const R = 19.5, CIRC = 2 * Math.PI * R;
    const stones = items.map((it, idx) => {
      const t = items.length === 1 ? 0.5 : idx / (items.length - 1);
      const [x, y] = sampleArc(t);
      const isCur = it.c.id === lastCh;
      let off = 0, arcs = '';
      for (const l of LV_ORD) {
        const cnt = it.p.c[l] || 0;
        if (!cnt || !it.p.n) continue;
        const len = (cnt / it.p.n) * CIRC;
        arcs += `<circle cx="${x}" cy="${y}" r="${R}" fill="none" stroke="${lvCss[l]}" stroke-width="4.4" stroke-dasharray="${len.toFixed(2)} ${(CIRC - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${x} ${y})"/>`;
        off += len;
      }
      const tint = domCol(it.p);
      const stFill = dark ? '#16203a' : '#fcfdfe';
      const baseW = dark ? '#263058' : '#c6d6dc';
      const baseR = dark ? '#192040' : '#a9bec7';
      return `<a class="mv-stone" href="#/${it.c.id}"><title>${esc(it.c.title)} (${esc(it.th.name)}) · ประเมินแล้ว ${it.p.d}/${it.p.n} กล่อง (${it.pct}%) · มั่นใจ ${it.p.c[4]}</title>
        <g class="mv-st-g">
          <!-- Isometric carved stone plinth -->
          <polygon points="${x},${y - 16} ${x + 28},${y - 2} ${x},${y + 12} ${x - 28},${y - 2}" fill="${tint}" opacity="${it.p.d ? '.4' : '.22'}"/>
          <polygon points="${x - 26},${y + 4} ${x},${y + 18} ${x},${y + 27} ${x - 26},${y + 13}" fill="${baseW}"/>
          <polygon points="${x + 26},${y + 4} ${x},${y + 18} ${x},${y + 27} ${x + 26},${y + 13}" fill="${baseR}"/>
          <!-- Medallion + 5-color progress ring -->
          <circle cx="${x}" cy="${y}" r="${R + 2.4}" fill="${stFill}" stroke="${isCur ? '#5eead4' : (dark ? '#344575' : '#cbd9df')}" stroke-width="${isCur ? 1.8 : 1}"/>
          <circle cx="${x}" cy="${y}" r="${R}" fill="none" stroke="${dark ? '#253258' : '#e4eef0'}" stroke-width="4.4"/>
          ${arcs}
          <text x="${x}" y="${y - 0.5}" text-anchor="middle" font-family="Josefin Sans,sans-serif" font-weight="700" font-size="11.5" fill="${dark ? '#f0f4ff' : '#1b2736'}">${esc(it.lbl)}</text>
          <text x="${x}" y="${y + 10.5}" text-anchor="middle" font-family="Josefin Sans,sans-serif" font-weight="600" font-size="8.5" fill="${it.pct ? it.th.trail : (dark ? '#8b99bf' : '#6c7e90')}">${it.pct}%</text>
          <!-- Unique Monument Valley character standing on each chapter stone -->
          <g class="${isCur ? 'mv-traveler' : ''}" transform="translate(${x},${y - 19})">
            ${mvCharSVG(idx, it.th.trail, it.th.gem, isCur)}
          </g>
        </g></a>`;
    }).join('');
    const chevrons = items.slice(0, -1).map((_, idx) => {
      const t = (idx + 0.5) / Math.max(1, items.length - 1);
      const [x, y] = sampleArc(t);
      return `<circle cx="${x}" cy="${y}" r="2.2" fill="${dark ? '#5eead4' : '#2b7a78'}" opacity=".65"/>`;
    }).join('');
    // ฉากปราสาท 3 โลกสไตล์ Monument Valley: The Trilogy (ซ้ายม่วงตะวันแดง · กลางคราม-ฟ้ามิ้นต์ใต้จันทร์เสี้ยวยักษ์ · ขวาหอระฆังทอง-ปะการัง)
    const skyTop = dark ? '#121b4a' : '#8fd8d6';
    const skyMid = dark ? '#1e2763' : '#d2f0ed';
    const leftGrad1 = dark ? '#eb758b' : '#f7a5b4', leftGrad2 = dark ? '#4c2c70' : '#d2a2d4', leftGrad3 = dark ? '#1d1438' : '#b7c7e2';
    const rightGrad1 = dark ? '#785a9e' : '#d8f4ea', rightGrad2 = dark ? '#2a2252' : '#c2ece8';
    const svg = `<svg class="mv-citadel-svg" viewBox="0 0 940 378" aria-label="ปราสาท Monument Valley แสดงความคืบหน้าทุกบท">
      <defs>
        <linearGradient id="mvts" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${skyTop}"/>
          <stop offset="58%" stop-color="${skyMid}"/>
          <stop offset="100%" stop-color="${dark ? '#171535' : '#e6f3f2'}"/>
        </linearGradient>
        <linearGradient id="mvtl" x1="0" y1="0" x2=".3" y2="1">
          <stop offset="0%" stop-color="${leftGrad1}" stop-opacity="${dark ? '.88' : '.75'}"/>
          <stop offset="52%" stop-color="${leftGrad2}" stop-opacity="${dark ? '.92' : '.7'}"/>
          <stop offset="100%" stop-color="${leftGrad3}"/>
        </linearGradient>
        <linearGradient id="mvtr" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${rightGrad1}" stop-opacity="${dark ? '.45' : '.85'}"/>
          <stop offset="100%" stop-color="${rightGrad2}" stop-opacity="${dark ? '.9' : '.95'}"/>
        </linearGradient>
        <radialGradient id="mvtg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#5eead4" stop-opacity="${dark ? '.45' : '.35'}"/>
          <stop offset="100%" stop-color="#5eead4" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="mvtsun" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#ff8da1" stop-opacity=".95"/>
          <stop offset="100%" stop-color="#f26b8a" stop-opacity=".6"/>
        </radialGradient>
        <linearGradient id="mvtfog" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${dark ? '#171838' : '#e6f4f2'}" stop-opacity="0"/>
          <stop offset="100%" stop-color="${dark ? '#131830' : '#eef5f5'}" stop-opacity=".96"/>
        </linearGradient>
        <filter id="mvblur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="14"/>
        </filter>
        <filter id="mvblur2" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="8"/>
        </filter>
      </defs>
      <rect width="940" height="378" fill="url(#mvts)"/>
      <!-- Trilogy diagonal atmospheric planes -->
      <polygon points="0,92 470,224 470,378 0,378" fill="url(#mvtl)"/>
      <polygon points="940,108 470,224 470,378 940,378" fill="url(#mvtr)"/>
      <!-- Giant Coral Sunset Orb (left) -->
      <circle cx="332" cy="146" r="56" fill="url(#mvtsun)" opacity="${dark ? '.82' : '.65'}"/>
      <!-- Stars -->
      <g fill="#eef2ff" opacity="${dark ? '.8' : '.45'}">
        <circle cx="95" cy="30" r="1"/><circle cx="185" cy="48" r=".9"/><circle cx="268" cy="24" r="1.1"/>
        <circle cx="628" cy="34" r="1"/><circle cx="725" cy="52" r=".9"/><circle cx="835" cy="32" r="1.1"/>
        <circle cx="350" cy="40" r=".8"/><circle cx="780" cy="82" r=".8"/>
      </g>
      <!-- Distant mysterious onion-dome towers peeking out of the misty cloud sea -->
      <g opacity="${dark ? '.42' : '.52'}">
        <path d="M58 290V176q0-14 14-26 14 12 14 26v114z" fill="${dark ? '#2d4470' : '#8ec7cb'}"/>
        <path d="M126 300V148q0-18 18-32 18 14 18 32v152z" fill="${dark ? '#40346e' : '#96c9ba'}"/>
        <path d="M196 290V182q0-12 12-22 12 10 12 22v108z" fill="${dark ? '#5a366b' : '#b2b2da'}"/>
        <path d="M242 290V152q0-15 15-26 15 11 15 26v138z" fill="${dark ? '#2b3d69' : '#85bfd0'}"/>
        <path d="M674 290V146q0-16 16-28 16 12 16 28v144z" fill="${dark ? '#2f4570' : '#8cc8c2'}"/>
        <path d="M744 300V168q0-14 14-25 14 11 14 25v132z" fill="${dark ? '#4d3870' : '#d2a8cc'}"/>
        <path d="M812 290V142q0-17 17-30 17 13 17 30v148z" fill="${dark ? '#2d4f6e' : '#92c9b8'}"/>
        <path d="M876 290V178q0-12 12-22 12 10 12 22v112z" fill="${dark ? '#3c3b73' : '#9ac2db'}"/>
      </g>
      <!-- Back billowing dreamy mist clouds -->
      <g filter="url(#mvblur)" opacity="${dark ? '.46' : '.72'}">
        <ellipse cx="110" cy="184" rx="130" ry="34" fill="${dark ? '#4f5d96' : '#ffffff'}"/>
        <ellipse cx="260" cy="212" rx="145" ry="38" fill="${dark ? '#6e4c85' : '#ffffff'}"/>
        <ellipse cx="690" cy="196" rx="150" ry="36" fill="${dark ? '#44638c' : '#ffffff'}"/>
        <ellipse cx="845" cy="176" rx="125" ry="32" fill="${dark ? '#4e598c' : '#ffffff'}"/>
      </g>
      <!-- Giant Glowing Crescent Moon cradling Central Spire (Trilogy signature!) -->
      <circle cx="486" cy="84" r="76" fill="url(#mvtg)"/>
      <path d="M472 16a64 64 0 0 1 28 118 56 56 0 0 0-28-118z" fill="#fff8e0"/>
      <path d="M474 17a62 62 0 0 1 25 114 57 57 0 0 0-25-114z" fill="#ffffff" opacity=".85"/>

      <!-- === TRILOGY GRAND CASTLE (3-World Split Architecture) === -->
      <!-- RIGHT WING: Coral-Pink & Sunlit Gold Pagoda Bell Tower -->
      <g>
        <!-- Golden arched bridge connecting right pagoda to center -->
        <polygon points="518,144 584,174 584,218 518,188" fill="${dark ? '#f7b779' : '#ffe399'}"/>
        <path d="M538 214v-24a12 12 0 0 1 24 0v24z" fill="${dark ? '#2b2454' : '#c6ece8'}"/>
        <!-- Upper pagoda tower -->
        <polygon points="564,116 594,102 624,116 624,256 564,256" fill="${dark ? '#f0869e' : '#f5a5b0'}"/>
        <polygon points="564,116 594,130 594,256 564,256" fill="${dark ? '#f7b999' : '#ffd8a8'}"/>
        <!-- Coral pagoda roof -->
        <polygon points="558,118 594,88 630,118 594,132" fill="${dark ? '#8d4c7a' : '#e66c65'}"/>
        <polygon points="594,88 630,118 594,132" fill="${dark ? '#5f325a' : '#c95452'}"/>
        <line x1="594" y1="88" x2="594" y2="75" stroke="#ffd97d" stroke-width="1.6"/>
        <!-- Glowing golden bell inside pagoda arch -->
        <path d="M585 154v-14a9 9 0 0 1 18 0v14z" fill="${dark ? '#382147' : '#8a3e54'}"/>
        <path d="M590 150c0-5 2-8 4-8s4 3 4 8z" fill="#ffe27a"/>
        <!-- Lower warm yellow sunlit pavilion -->
        <polygon points="578,192 612,176 646,192 646,264 578,264" fill="${dark ? '#f6d479' : '#fff0a6'}"/>
        <polygon points="578,192 612,208 612,264 578,264" fill="${dark ? '#fce89e' : '#fff7c4'}"/>
        <polygon points="572,193 612,168 652,193 612,210" fill="${dark ? '#7c5385' : '#e87668'}"/>
        <rect x="622" y="214" width="5" height="11" rx="2.5" fill="${dark ? '#52294a' : '#c95f6a'}"/>
      </g>

      <!-- CENTER CROWN: Luminous Turquoise-Cyan & Emerald-Mint Citadel Spire -->
      <g>
        <!-- Tall central shaft (left shadowed indigo / right sunlit lavender-rose) -->
        <polygon points="434,116 476,96 518,116 518,266 434,266" fill="${dark ? '#7e63a8' : '#d4a6e3'}"/>
        <polygon points="434,116 476,136 476,266 434,266" fill="${dark ? '#45488a' : '#9c92d4'}"/>
        <polygon points="476,136 518,116 518,266 476,266" fill="${dark ? '#c993c8' : '#f2bdd4'}"/>
        <!-- Luminous Cyan-Mint upper temple & stairs -->
        <polygon points="444,54 466,44 488,54 488,128 444,128" fill="#3ab7cf"/>
        <polygon points="444,54 466,64 466,128 444,128" fill="#67e8f9"/>
        <!-- Belfry cupola dome -->
        <path d="M448 54q0-16 18-26 18 10 18 26z" fill="#6d64b8"/>
        <path d="M466 28q18 10 18 26h-18z" fill="#473f8f"/>
        <circle cx="466" cy="24" r="2.2" fill="#fff4b8"/>
        <path d="M459 84v-13a7 7 0 0 1 14 0v13z" fill="${dark ? '#172354' : '#2a6f82'}"/>
        <!-- Glowing Mint-Cyan Stepped Bridge Terrace across Center -->
        <polygon points="424,132 528,84 542,92 438,140" fill="#86f5c8"/>
        <polygon points="438,140 542,92 542,102 438,150" fill="#3cc9b4"/>
        <!-- Central white staircase & arches -->
        <polygon points="462,150 496,134 510,142 476,158" fill="#e8edff"/>
        <path d="M460 266v-44a16 16 0 0 1 32 0v44z" fill="${dark ? '#251e4f' : '#9bc2d4'}"/>
        <path d="M468 266v-30a8 8 0 0 1 16 0v30z" fill="#ffe28a" opacity=".88"/>
        <!-- Tiny white Ida-style guardian atop the cyan moon bridge -->
        <g class="mv-traveler" transform="translate(520,86)">
          <polygon points="0,-10 3.2,-1 -3.2,-1" fill="#ffffff"/>
          <polygon points="0,-16.5 2.5,-10 -2.5,-10" fill="#ffffff"/>
        </g>
      </g>

      <!-- LEFT WING: Deep Dusk Violet Viaduct & Onion Dome with Flowing Ribbon -->
      <g>
        <!-- Violet onion dome tower -->
        <polygon points="366,118 396,104 426,118 426,256 366,256" fill="${dark ? '#5a3a82' : '#9974b8'}"/>
        <polygon points="366,118 396,132 396,256 366,256" fill="${dark ? '#734b9c' : '#b28cd1'}"/>
        <circle cx="396" cy="100" r="19" fill="${dark ? '#52256b' : '#854c9e'}"/>
        <!-- Flowing dark ribbon banner over the coral sun -->
        <path d="M396 81c-14 8-30 14-56 17 20 1 38-3 56-12z" fill="${dark ? '#381e59' : '#63377d'}"/>
        <!-- Sweeping Violet Arched Viaduct descending left -->
        <polygon points="300,180 416,124 446,138 330,194" fill="${dark ? '#6a4796' : '#a985c7'}"/>
        <polygon points="300,180 330,194 330,264 300,264" fill="${dark ? '#4b3175' : '#8966ab'}"/>
        <polygon points="330,194 446,138 446,264 330,264" fill="${dark ? '#3c2663' : '#79579c'}"/>
        <path d="M342 264v-46a14 14 0 0 1 28 0v46z" fill="${dark ? '#231642' : '#b395cc'}"/>
        <path d="M382 264v-54a16 16 0 0 1 32 0v54z" fill="${dark ? '#231642' : '#b395cc'}"/>
        <!-- Glowing pink-gold viaduct rim -->
        <polyline points="300,180 416,124 446,138" fill="none" stroke="#f284b6" stroke-width="1.6" stroke-opacity=".8"/>
      </g>

      <!-- Soft Ethereal Billowing Mist Clouds weaving across the Castle Base -->
      <g filter="url(#mvblur2)" opacity="${dark ? '.5' : '.78'}">
        <ellipse cx="165" cy="252" rx="135" ry="26" fill="${dark ? '#5b528c' : '#ffffff'}"/>
        <ellipse cx="365" cy="242" rx="115" ry="22" fill="${dark ? '#694e87' : '#ffffff'}"/>
        <ellipse cx="575" cy="246" rx="125" ry="24" fill="${dark ? '#4c658f' : '#ffffff'}"/>
        <ellipse cx="780" cy="250" rx="140" ry="26" fill="${dark ? '#49588a' : '#ffffff'}"/>
        <ellipse cx="470" cy="268" rx="190" ry="28" fill="${dark ? '#465285' : '#ffffff'}"/>
      </g>
      <rect y="246" width="940" height="132" fill="url(#mvtfog)"/>

      <!-- ORBITAL STEPPING-STONE RING (B3 › B4 › B5 › ... + Character per Chapter!) -->
      <path d="${pathD}" fill="none" stroke="${dark ? '#b8c5ef' : '#ffffff'}" stroke-width="14" stroke-linecap="round" opacity="${dark ? '.2' : '.62'}"/>
      <path d="${pathD}" fill="none" stroke="${dark ? '#5eead4' : '#2b7a78'}" stroke-width="2.2" stroke-dasharray="4 6" opacity=".68"/>
      ${chevrons}
      ${stones}
    </svg>`;
    return `<div class="hero home-hero mv-citadel-hero">
      <div class="mv-citadel-top">
        <h1>nannie compre website</h1>
        <div class="mv-citadel-stat">
          <span>พิชิตแล้ว <b>${totD}/${totN}</b> กล่อง (<b>${allPct}%</b>)</span>
          <span>· มั่นใจ <b>${tot4}</b></span>
          ${bkWarn || ''}
        </div>
      </div>
      ${svg}
      <div class="mv-citadel-leg">
        <span>แตะตัวละครหรือก้อนหินแต่ละบทเพื่อเริ่มเดินทาง (วงแหวน = สัดส่วนระดับความเข้าใจ)</span>
        <div class="mv-citadel-dots">
          <span><i style="background:var(--lv4)"></i>มั่นใจ</span>
          <span><i style="background:var(--lv3)"></i>พอได้</span>
          <span><i style="background:var(--lv2)"></i>ยังไม่แม่น</span>
          <span><i style="background:var(--lv5)"></i>จำเยอะ</span>
          <span><i style="background:${dark ? '#8b93b8' : 'var(--lv1)'}"></i>ทวนใหม่</span>
        </div>
      </div>
    </div>`;
  }

  /* ---------- โลโก้ปราสาทประจำแต่ละบท + ตัว Monument เดินบนแถบด้านข้าง ---------- */
  function mvCastleLogoSVG(chId, size = 26) {
    const th = mvThemeOf(chId);
    const id = String(chId || '').toLowerCase();
    const dark = isDark();
    // องค์ประกอบสถาปัตยกรรมตามรูปทรงของบท (zigzag / twin / spiral / forest)
    let arch = '';
    if (th.shape === 'twin') {
      arch = `
        <polygon points="7,12 11,10 15,12 15,28 7,28" fill="${th.wr}"/>
        <polygon points="7,12 11,14 11,28 7,28" fill="${th.wl}"/>
        <path d="M8 12q0-4.5 3-7 3 2.5 3 7z" fill="${th.gem}"/>
        <polygon points="17,13 21,11 25,13 25,28 17,28" fill="${th.wr}"/>
        <polygon points="17,13 21,15 21,28 17,28" fill="${th.wl}"/>
        <path d="M18 13q0-4.5 3-7 3 2.5 3 7z" fill="${th.trail}"/>
        <polygon points="11,18 21,18 21,23 11,23" fill="${th.top}"/>
        <path d="M13.5 28v-5a2.5 2.5 0 0 1 5 0v5z" fill="${th.arch}"/>
        <rect x="9.8" y="16" width="1.6" height="3.2" rx=".8" fill="${th.win}"/>
        <rect x="20.6" y="17" width="1.6" height="3.2" rx=".8" fill="${th.win}"/>`;
    } else if (th.shape === 'spiral') {
      arch = `
        <polygon points="16,5 21,8 21,28 11,28 11,8" fill="${th.wr}"/>
        <polygon points="11,8 16,11 16,28 11,28" fill="${th.wl}"/>
        <polygon points="16,5 21,8 16,11 11,8" fill="${th.top}"/>
        <polygon points="6,19 16,14 26,19 26,28 6,28" fill="${th.wl}"/>
        <polygon points="16,14 26,19 26,28 16,28" fill="${th.wr}"/>
        <polyline points="8,24 16,19 24,24" fill="none" stroke="${th.trail}" stroke-width="1.4" stroke-linecap="round"/>
        <path d="M13.5 28v-5.5a2.5 2.5 0 0 1 5 0V28z" fill="${th.arch}"/>
        <polygon points="16,1.5 18.2,4.2 16,6.8 13.8,4.2" fill="${th.gem}"/>`;
    } else if (th.shape === 'forest') {
      arch = `
        <polygon points="13,9 16,7.5 19,9 19,28 13,28" fill="${th.wr}"/>
        <polygon points="13,9 16,10.5 16,28 13,28" fill="${th.wl}"/>
        <path d="M13.3 9q0-4.2 2.7-6.5 2.7 2.3 2.7 6.5z" fill="${th.top}"/>
        <polygon points="7,16 10,14.5 13,16 13,28 7,28" fill="${th.wl}"/>
        <path d="M7.5 16q0-3 2.5-4.8 2.5 1.8 2.5 4.8z" fill="${th.trail}"/>
        <polygon points="19,16 22,14.5 25,16 25,28 19,28" fill="${th.wr}"/>
        <path d="M19.5 16q0-3 2.5-4.8 2.5 1.8 2.5 4.8z" fill="${th.gem}"/>
        <path d="M14 28v-5a2 2 0 0 1 4 0v5z" fill="${th.arch}"/>
        <rect x="15.2" y="13.5" width="1.6" height="3.6" rx=".8" fill="${th.win}"/>`;
    } else {
      // zigzag citadel
      arch = `
        <polygon points="12,8 16,6 20,8 20,28 12,28" fill="${th.wr}"/>
        <polygon points="12,8 16,10 16,28 12,28" fill="${th.wl}"/>
        <path d="M13 8q0-4 3-6.2 3 2.2 3 6.2z" fill="${th.gem}"/>
        <polygon points="6,17 18,12 18,17 6,22" fill="${th.top}"/>
        <polygon points="6,22 25,16 25,28 6,28" fill="${th.wl}"/>
        <polygon points="16,19 25,16 25,28 16,28" fill="${th.wr}"/>
        <polyline points="7,21 17,16.5 24,20" fill="none" stroke="${th.trail}" stroke-width="1.35" stroke-linecap="round"/>
        <path d="M13.6 28v-4.8a2.4 2.4 0 0 1 4.8 0V28z" fill="${th.arch}"/>
        <rect x="15.2" y="11" width="1.6" height="3" rx=".8" fill="${th.win}"/>`;
    }
    // สัญลักษณ์พิเศษขนาดจิ๋วประจำแต่ละบท (ให้โลโก้ไม่ซ้ำกัน)
    let badge = '';
    if (id === 'b3') badge = `<path d="M6.5 4.5a3 3 0 1 0 3.4 3.8 2.3 2.3 0 1 1-3.4-3.8z" fill="#ffe89c"/>`;
    else if (id === 'b4') badge = `<circle cx="16" cy="5.5" r="1.5" fill="${th.win}"/>`;
    else if (id === 'b5') badge = `<circle cx="7" cy="7" r="1.1" fill="${th.trail}"/><circle cx="25" cy="7" r="1.1" fill="${th.gem}"/>`;
    else if (id === 'b6') badge = `<path d="M4 9.5q4-2 8 0M20 9.5q4-2 8 0" fill="none" stroke="${th.top}" stroke-width=".9" opacity=".75"/>`;
    else if (id === 'b7') badge = `<circle cx="16" cy="14" r="1.8" fill="${th.win}" opacity=".95"/>`;
    else if (id === 'b8') badge = `<circle cx="16" cy="5" r="2.2" fill="#ffe28a" opacity=".9"/>`;
    else if (id === 'b9') badge = `<path d="M5 27.5q5.5-2 11 0t11 0" fill="none" stroke="${th.trail}" stroke-width="1.2"/>`;
    else if (id === 'b10') badge = `<circle cx="25" cy="6.5" r="2.3" fill="#ffe28a" opacity=".92"/>`;
    else if (id === 'kt-embryo') badge = `<circle cx="11" cy="3.5" r="1.2" fill="#fff5b8"/><circle cx="21" cy="4.2" r="1.2" fill="#7dd3fc"/>`;
    else if (id === 'kt-repro') badge = `<polygon points="24,4 25.5,6.5 24,9 22.5,6.5" fill="${th.trail}"/>`;
    else if (id === 'kt-msk') badge = `<rect x="14.6" y="13" width="2.8" height="2.8" transform="rotate(45 16 14.4)" fill="${th.trail}"/>`;
    else if (id === 'kt-parasit') badge = `<circle cx="6.5" cy="8.5" r="1.3" fill="#4ade80"/><circle cx="25.5" cy="8.5" r="1.3" fill="#f472b6"/>`;
    else if (id === 'kt-rs') badge = `<path d="M5 7q11-5 22 0" fill="none" stroke="${th.trail}" stroke-width="1.1" opacity=".8"/>`;
    return `<svg class="mv-ch-logo" viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="8" fill="${th.sky[1]}" stroke="${th.trail}" stroke-opacity="${dark ? '.55' : '.42'}" stroke-width="1.1"/>
      <rect x="1.5" y="16" width="29" height="14.5" rx="6" fill="${th.sky[2]}" opacity=".55"/>
      ${badge}${arch}
    </svg>`;
  }

  // ตัวละครอีกา Monument Valley (Crow-person เงาดำตาขาวกลมแบบในเกม)
  function mvCrowSVG(dir = 1) {
    const flip = dir < 0 ? ' transform="scale(-1,1)"' : '';
    return `<g${flip}>
      <line x1="-1.4" y1="-5" x2="-2.2" y2="0" stroke="#141828" stroke-width="1.3" stroke-linecap="round"/>
      <line x1="1.3" y1="-5" x2="2.2" y2="0" stroke="#141828" stroke-width="1.3" stroke-linecap="round"/>
      <path d="M-4,-5 C-4.2,-11 -2.8,-15 0,-15.5 C2.8,-15 4,-11 4.2,-5 Z" fill="#181d30"/>
      <polygon points="1,-15.4 7.8,-13.8 1.5,-11.5" fill="#181d30"/>
      <circle cx=".8" cy="-13.4" r="1.9" fill="#ffffff"/>
      <circle cx="1.2" cy="-13.4" r=".9" fill="#141828"/>
    </g>`;
  }

  // ตัว Monument เดินบนแถบ progress ด้านข้าง
  function mvSideWalkerSVG(th, idx, active) {
    const aura = active ? `<ellipse cx="9" cy="17" rx="7.5" ry="4" fill="${th.trail}" opacity=".42"/>` : '';
    const cloakShade = idx % 3 === 1 ? th.gem : th.trail;
    return `<svg class="mv-walk-svg" viewBox="0 0 18 24" width="17" height="23" aria-hidden="true">
      ${aura}
      <line class="mv-leg-l" x1="7.8" y1="17.5" x2="6.6" y2="22.8" stroke="#dce8ff" stroke-width="1.35" stroke-linecap="round"/>
      <line class="mv-leg-r" x1="10.2" y1="17.5" x2="11.6" y2="22.8" stroke="#ffffff" stroke-width="1.35" stroke-linecap="round"/>
      <polygon points="9,9.2 13.6,18.6 4.4,18.6" fill="#ffffff"/>
      <polygon points="9,9.2 13.6,18.6 9,18.6" fill="${cloakShade}" opacity=".42"/>
      <circle cx="9" cy="8.2" r="1.8" fill="#1d2642"/>
      <polygon points="9,1.2 12.6,8.2 5.4,8.2" fill="#ffffff"/>
      <polygon points="9,1.2 12.6,8.2 9,8.2" fill="${cloakShade}" opacity=".32"/>
    </svg>`;
  }

  function mvSideBarHTML(p, chId, idx = 0) {
    if (uiStyle() !== 'monument') return `<div class="side-bar">${lvBar(p)}</div>`;
    const th = mvThemeOf(chId);
    const pct = p.n ? (p.d * 100 / p.n) : 0;
    const walkPos = Math.max(4, Math.min(93, pct));
    const doneAny = p.d > 0;
    const doneAll = p.n > 0 && p.d >= p.n;
    const goalSvg = `<svg class="mv-sb-beacon" viewBox="0 0 12 18" width="11" height="17" aria-hidden="true">
      <polygon points="6,1 10,6.5 6,12 2,6.5" fill="${doneAll ? '#ffe28a' : '#eefdfa'}" stroke="${doneAll ? '#fbbf24' : th.trail}" stroke-width=".8"/>
      <polygon points="6,1 10,6.5 6,12" fill="${doneAll ? '#f59e0b' : th.trail}" opacity=".65"/>
      <polygon points="3,13.5 9,13.5 8,17.5 4,17.5" fill="${th.wl}" opacity=".85"/>
    </svg>`;
    return `<div class="side-bar mv-sb-walk${doneAny ? ' is-moving' : ''}${doneAll ? ' is-done' : ''}" style="--mv-walk-col:${th.trail};--mv-walk-gem:${th.gem}">
      <span class="mv-sb-walker" style="left:${walkPos.toFixed(1)}%" title="ความคืบหน้า ${Math.round(pct)}%">${mvSideWalkerSVG(th, idx, doneAny)}</span>
      <span class="mv-sb-goal" aria-hidden="true">${goalSvg}</span>
      ${lvBar(p)}
    </div>`;
  }

  /* ---------- ปราสาทขั้นบันไดทางเดินสำหรับหน้ารวม สรุปบท A3 และ คลิปติวอาจารย์ ---------- */
  function mvCastleCrownSVG(isClip, dark) {
    if (isClip) {
      // ธีม Nocturnal Emerald Forest (เขียวดำมืด + หอคอยเขียวมะนาว-มรกตเรืองแสง ตามภาพเรฟ!)
      const p = dark
        ? { s1: '#030d11', s2: '#072429', s3: '#0b3c3c', glow: '#299c8f', t1: '#02080b', t2: '#05151a', w1: '#8ef58a', w2: '#399e6c', top: '#d8ffb8', dome: '#d8f6ff', ar: '#051418', sw: '#f472b6', moon: '#7dd3fc' }
        : { s1: '#bfe9dd', s2: '#d9f4eb', s3: '#eef8f2', glow: '#6cd4b8', t1: '#1a4a47', t2: '#2d6b63', w1: '#7ce391', w2: '#46ad78', top: '#f0ffdc', dome: '#ffffff', ar: '#1d4d48', sw: '#e65c8c', moon: '#ffffff' };
      return `<svg class="mv-realm-crown-svg" viewBox="0 0 920 176" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <defs>
          <linearGradient id="mvcSk1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${p.s1}"/><stop offset="62%" stop-color="${p.s2}"/><stop offset="100%" stop-color="${p.s3}" stop-opacity="0"/>
          </linearGradient>
          <radialGradient id="mvcEmG" cx="50%" cy="48%" r="42%">
            <stop offset="0%" stop-color="${p.glow}" stop-opacity="${dark ? '.55' : '.42'}"/>
            <stop offset="100%" stop-color="${p.s1}" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <rect width="920" height="176" fill="url(#mvcSk1)"/>
        <ellipse cx="460" cy="76" rx="280" ry="84" fill="url(#mvcEmG)"/>
        <!-- Subtle night stars -->
        <g fill="#d8fff0" opacity="${dark ? '.65' : '.45'}">
          <circle cx="268" cy="24" r="1"/><circle cx="332" cy="14" r=".9"/><circle cx="588" cy="18" r="1"/>
          <circle cx="642" cy="36" r=".8"/><circle cx="384" cy="42" r=".7"/><circle cx="534" cy="40" r=".8"/>
        </g>
        <!-- Slender teal crescent moon cradling the central emerald spire -->
        <path d="M460 6a16 16 0 1 1-14 23 13 13 0 1 0 14-23z" fill="${p.moon}" opacity=".9"/>
        <!-- Nocturnal Giant Forest Tree Silhouettes framing left & right -->
        <g fill="${p.t2}" opacity=".85">
          <rect x="64" y="0" width="46" height="176"/><rect x="138" y="0" width="32" height="176"/>
          <rect x="752" y="0" width="34" height="176"/><rect x="812" y="0" width="48" height="176"/>
          <path d="M108 32 L204 82 L196 92 L108 48 Z M168 106 L254 146 L246 156 L168 120 Z"/>
          <path d="M754 38 L664 86 L672 96 L754 54 Z M754 108 L674 148 L682 158 L754 122 Z"/>
        </g>
        <g fill="${p.t1}">
          <rect x="0" y="0" width="68" height="176"/><rect x="852" y="0" width="68" height="176"/>
          <path d="M64 16 L184 74 L176 86 L64 34 Z M64 96 L154 142 L146 154 L64 114 Z"/>
          <path d="M856 22 L736 78 L744 90 L856 40 Z M856 102 L764 146 L772 158 L856 120 Z"/>
          <!-- Leaf silhouettes -->
          <ellipse cx="186" cy="76" rx="10" ry="4" transform="rotate(-24 186 76)"/>
          <ellipse cx="206" cy="86" rx="9" ry="3.5" transform="rotate(18 206 86)"/>
          <ellipse cx="734" cy="80" rx="10" ry="4" transform="rotate(24 734 80)"/>
          <ellipse cx="668" cy="88" rx="9" ry="3.5" transform="rotate(-18 668 88)"/>
        </g>
        <!-- Central Luminous Lime-Emerald 3-Spire Forest Citadel -->
        <g>
          <!-- Left emerald spire -->
          <polygon points="368,66 382,58 396,66 396,176 368,176" fill="${p.w2}"/>
          <polygon points="368,66 382,74 382,176 368,176" fill="${p.w1}"/>
          <path d="M370 66q0-14 12-22 12 8 12 22z" fill="${p.dome}"/>
          <line x1="382" y1="44" x2="382" y2="35" stroke="${p.dome}" stroke-width="1.2"/>
          <path d="M376 92v-12a6 6 0 0 1 12 0v12z" fill="${p.ar}"/>
          <!-- Right emerald spire -->
          <polygon points="524,72 538,64 552,72 552,176 524,176" fill="${p.w2}"/>
          <polygon points="524,72 538,80 538,176 524,176" fill="${p.w1}"/>
          <path d="M526 72q0-14 12-22 12 8 12 22z" fill="${p.dome}"/>
          <line x1="538" y1="50" x2="538" y2="41" stroke="${p.dome}" stroke-width="1.2"/>
          <path d="M532 98v-12a6 6 0 0 1 12 0v12z" fill="${p.ar}"/>
          <!-- Tall Center Emerald Crown Spire -->
          <polygon points="436,52 460,40 484,52 484,176 436,176" fill="${p.w2}"/>
          <polygon points="436,52 460,64 460,176 436,176" fill="${p.w1}"/>
          <path d="M442 52q0-18 18-28 18 10 18 28z" fill="${p.dome}"/>
          <line x1="460" y1="24" x2="460" y2="14" stroke="${p.dome}" stroke-width="1.4"/>
          <path d="M452 94v-16a8 8 0 0 1 16 0v16z" fill="${p.ar}"/>
          <!-- Stepped emerald bridges connecting spires -->
          <polygon points="382,118 460,82 538,118 460,154" fill="${p.top}" opacity=".95"/>
          <polygon points="382,118 460,154 460,176 382,140" fill="${p.w1}"/>
          <polygon points="538,118 460,154 460,176 538,140" fill="${p.w2}"/>
          <path d="M448 176v-26a12 12 0 0 1 24 0v26z" fill="${p.ar}"/>
          <!-- Pink switch crystal -->
          <polygon points="460,104 468,108 460,112 452,108" fill="${p.sw}"/>
          <!-- Tiny white Ida at the forest citadel portal -->
          <g class="mv-traveler" transform="translate(460,144) scale(.92)">
            <polygon points="0,-12 4,-1 -4,-1" fill="#ffffff"/>
            <circle cx="0" cy="-13.4" r="1.7" fill="#1e2745"/>
            <polygon points="0,-20 3.2,-13.2 -3.2,-13.2" fill="#ffffff"/>
          </g>
        </g>
      </svg>`;
    }
    const p = dark
      ? { s1: '#0e1630', s2: '#1f2856', s3: '#463368', m: '#24315c', w1: '#c87e9e', w2: '#7a4b72', top: '#f5d2df', d1: '#67d8e8', d2: '#f284b6', st: '#5eead4', ar: '#161b3a', sw: '#ffe28a' }
      : { s1: '#c2e5e3', s2: '#dcefeb', s3: '#eef4ef', m: '#b1d3d6', w1: '#f5aeb9', w2: '#db8c9d', top: '#fff5e4', d1: '#7bb5d6', d2: '#eb8ba8', st: '#8ce3bc', ar: '#cbe5e4', sw: '#f0947a' };
    return `<svg class="mv-realm-crown-svg" viewBox="0 0 920 176" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id="mvcSk0" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${p.s1}"/><stop offset="60%" stop-color="${p.s2}"/><stop offset="100%" stop-color="${p.s3}" stop-opacity="0"/>
        </linearGradient>
        <radialGradient id="mvcMn0" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#ffe799" stop-opacity="${dark ? '.55' : '.45'}"/>
          <stop offset="100%" stop-color="#ffe799" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="920" height="176" fill="url(#mvcSk0)"/>
      <g fill="#eef2ff" opacity="${dark ? '.82' : '.48'}">
        <circle cx="44" cy="24" r="1.1"/><circle cx="92" cy="14" r=".9"/><circle cx="212" cy="28" r="1.2"/>
        <circle cx="276" cy="48" r=".8"/><circle cx="338" cy="20" r="1.1"/><circle cx="394" cy="42" r=".9"/>
        <circle cx="534" cy="22" r="1.2"/><circle cx="596" cy="46" r=".85"/><circle cx="696" cy="18" r="1"/>
        <circle cx="826" cy="26" r="1.1"/><circle cx="878" cy="48" r=".9"/>
      </g>
      <circle cx="298" cy="42" r="28" fill="url(#mvcMn0)"/>
      <path d="M299 27a13 13 0 1 0 14.5 17.5 10.2 10.2 0 1 1-14.5-17.5z" fill="${dark ? '#ffea9f' : '#fff7cf'}"/>
      <g fill="${p.m}" opacity="${dark ? '.55' : '.62'}">
        <path d="M52 176v-64q0-14 14-24 14 10 14 24v64z"/>
        <path d="M188 176v-78q0-16 16-28 16 12 16 28v78z"/>
        <path d="M708 176v-72q0-15 15-26 15 11 15 26v72z"/>
        <path d="M812 176v-56q0-14 14-24 14 10 14 24v56z"/>
      </g>
      <g>
        <path d="M98 62q0-18 14-30 14 12 14 30z" fill="${p.d1}"/>
        <path d="M112 32q14 12 14 30h-14z" fill="${p.w2}" opacity=".32"/>
        <rect x="100" y="62" width="3.2" height="72" fill="${p.w1}"/>
        <rect x="110.5" y="62" width="3" height="72" fill="${p.w2}"/>
        <rect x="121" y="62" width="3.2" height="72" fill="${p.w1}"/>
        <polygon points="96,134 126,118 146,128 116,144" fill="${p.top}"/>
        <polygon points="96,134 116,144 116,176 96,176" fill="${p.w1}"/>
        <path d="M138 66q0-18 14-30 14 12 14 30z" fill="${p.d2}"/>
        <path d="M152 36q14 12 14 30h-14z" fill="${p.w2}" opacity=".35"/>
        <rect x="140" y="66" width="3.2" height="76" fill="${p.w1}"/>
        <rect x="150.5" y="66" width="3" height="76" fill="${p.w2}"/>
        <rect x="161" y="66" width="3.2" height="76" fill="${p.w1}"/>
        <polygon points="136,142 166,126 166,176 136,176" fill="${p.w2}"/>
        <polygon points="136,142 152,150 152,176 136,176" fill="${p.w1}"/>
        <polygon points="152,134 268,176 238,176 138,140" fill="${p.top}"/>
        <polygon points="152,144 238,176 152,176" fill="${p.w2}"/>
        <g transform="translate(114,132) scale(.85)">${mvCrowSVG(1)}</g>
      </g>
      <g>
        <polygon points="642,8 662,0 682,8 682,176 642,176" fill="${p.w2}"/>
        <polygon points="642,8 662,16 662,176 642,176" fill="${p.w1}" opacity=".85"/>
        <polygon points="662,56 694,42 706,48 674,62" fill="${p.top}"/>
        <g transform="translate(684,48) scale(.85)">${mvCrowSVG(-1)}</g>
        <polygon points="738,10 762,0 786,10 786,176 738,176" fill="${p.w2}"/>
        <polygon points="738,10 762,20 762,176 738,176" fill="${p.w1}"/>
        <path d="M744 82V58a9 9 0 0 1 18 0v24z" fill="${p.ar}"/>
        <rect x="769" y="34" width="4" height="10" rx="2" fill="${p.sw}"/>
        <polygon points="742,82 762,92 678,134 658,124" fill="${p.top}"/>
        <polygon points="658,124 678,134 678,150 658,140" fill="${p.w2}"/>
        <path d="M736 85 L752 93 M724 91 L740 99 M712 97 L728 105 M700 103 L716 111 M688 109 L704 117 M676 115 L692 123" stroke="${p.w2}" stroke-width="1.3" opacity=".55" fill="none"/>
        <polygon points="658,124 720,154 700,164 638,134" fill="${p.top}"/>
        <polygon points="638,134 700,164 700,176 638,146" fill="${p.w1}"/>
        <g transform="translate(700,136) scale(.9)">${mvCrowSVG(-1)}</g>
      </g>
      <g>
        <circle cx="460" cy="48" r="34" fill="none" stroke="${p.st}" stroke-opacity=".28" stroke-width="1"/>
        <circle cx="460" cy="48" r="48" fill="none" stroke="${p.st}" stroke-opacity=".16" stroke-width="1" stroke-dasharray="3 4"/>
        <polygon points="434,116 460,103 486,116 486,176 434,176" fill="${p.w2}"/>
        <polygon points="434,116 460,129 460,176 434,176" fill="${p.w1}"/>
        <path d="M440 116q0-18 20-30 20 12 20 30z" fill="${p.d1}" opacity=".85"/>
        <path d="M460 86q20 12 20 30h-20z" fill="${p.w2}" opacity=".35"/>
        <path d="M450 176v-26a10 10 0 0 1 20 0v26z" fill="${p.ar}"/>
        <polygon points="460,134 488,148 460,162 432,148" fill="${p.top}" opacity=".9"/>
        <g class="mv-traveler" transform="translate(460,145) scale(.95)">
          <polygon points="0,-12 4,-1 -4,-1" fill="#ffffff"/>
          <circle cx="0" cy="-13.4" r="1.7" fill="#1e2745"/>
          <polygon points="0,-20 3.2,-13.2 -3.2,-13.2" fill="#ffffff"/>
        </g>
      </g>
    </svg>`;
  }

  function mvStairSpineSVG(idx, total, th, dark, isCur, doneAny) {
    const isL = idx % 2 === 0; // card on left if even, right if odd
    const hasNext = idx < total - 1;
    // จุดเชื่อมบน (มาจากชั้นก่อนหน้า) -> ชานพักกลาง (ชี้ไปหาการ์ดฝั่งซ้ายหรือขวา) -> บันไดลงชั้นถัดไป
    const topX = idx === 0 ? 90 : (isL ? 128 : 52);
    const midX = isL ? 54 : 126;
    const botX = isL ? 128 : 52;
    const walkFill = dark ? th.wl : th.top;
    const stepCol = doneAny ? th.trail : (dark ? '#5f70a8' : th.wr);
    const wallL = th.wl, wallR = th.wr;
    // วาดขั้นบันไดจาก (x0,y0) ไป (x1,y1) ให้เชื่อมรอยต่อระหว่างชั้นสนิท
    const drawSteps = (x0, y0, x1, y1, n = 7) => {
      let s = '';
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n;
        const ax = x0 + (x1 - x0) * t0, ay = y0 + (y1 - y0) * t0;
        const bx = x0 + (x1 - x0) * t1, by = y0 + (y1 - y0) * t1;
        s += `<polygon points="${ax - 16},${ay} ${ax + 16},${ay} ${bx + 16},${by} ${bx - 16},${by}" fill="${k % 2 ? walkFill : th.top}" opacity=".95"/>
              <polygon points="${bx - 16},${by} ${bx + 16},${by} ${bx + 16},${by + 8} ${bx - 16},${by + 8}" fill="${wallR}"/>`;
      }
      return s;
    };
    // ปุ่มสวิตช์หินสี่เหลี่ยมบนชานพักสไตล์ Monument Valley
    const swX = isL ? 54 : 126, swY = 108;
    const bridgePts = isL
      ? `-12,96 66,96 86,108 66,120 -12,120`
      : `192,96 114,96 94,108 114,120 192,120`;
    const bridgeSide = isL
      ? `-12,120 66,120 66,138 -12,138`
      : `114,120 192,120 192,138 114,138`;
    const charX = isL ? 84 : 96, charY = 108;
    const heroChar = isCur
      ? `<g class="mv-traveler" transform="translate(${charX},${charY})">
          <circle cx="0" cy="-9" r="13" fill="${th.trail}" opacity=".32" class="mv-pulse"/>
          <polygon points="0,-13 4.4,-1 -4.4,-1" fill="#ffffff"/>
          <circle cx="0" cy="-14.6" r="1.8" fill="#1e2745"/>
          <polygon points="0,-22 3.5,-14.4 -3.5,-14.4" fill="#ffffff"/>
        </g>`
      : (idx % 2 === 0
          ? `<g transform="translate(${charX},${charY})">${mvCrowSVG(isL ? -1 : 1)}</g>`
          : `<g transform="translate(${charX},${charY})">${mvCharSVG(idx + 1, th.trail, th.gem, false)}</g>`);
    return `<svg class="mv-spine-svg" viewBox="0 0 180 216" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <!-- Vertical castle core shaft behind stairs (overscan top/bottom for seamless join) -->
      <polygon points="74,-24 90,-16 106,-24 106,240 74,240" fill="${wallR}" opacity=".8"/>
      <polygon points="74,-24 90,-16 90,240 74,240" fill="${wallL}" opacity=".8"/>
      <rect x="${isL ? 94 : 80}" y="24" width="4" height="10" rx="2" fill="${th.win}" opacity=".9"/>
      <rect x="${isL ? 80 : 94}" y="172" width="4" height="10" rx="2" fill="${th.win}" opacity=".85"/>
      <!-- Upper staircase arriving seamlessly from previous terrace -->
      <polygon points="${topX - 16},-16 ${topX + 16},-16 ${midX + 16},96 ${midX - 16},96" fill="${wallL}" opacity=".68"/>
      ${drawSteps(topX, -14, midX, 92, 7)}
      <!-- Arched viaduct support under terrace -->
      <polygon points="${bridgeSide}" fill="${wallR}"/>
      <path d="M${isL ? 18 : 134} 138v-11a10 10 0 0 1 20 0v11z" fill="${th.arch}"/>
      <!-- Horizontal patterned terrace walkway joining the chapter card -->
      <polygon points="${bridgePts}" fill="${th.top}"/>
      <polyline points="${isL ? '-12,108 64,108' : '116,108 192,108'}" stroke="${stepCol}" stroke-width="2.4" stroke-dasharray="4 4" opacity=".85"/>
      <!-- Isometric central landing platform -->
      <polygon points="90,86 132,108 90,130 48,108" fill="${th.top}"/>
      <polygon points="48,108 90,130 90,148 48,126" fill="${wallL}"/>
      <polygon points="132,108 90,130 90,148 132,126" fill="${wallR}"/>
      <!-- Glowing path highlight on landing -->
      <polygon points="90,92 120,108 90,124 60,108" fill="none" stroke="${stepCol}" stroke-width="1.3" opacity=".8"/>
      <!-- Monument Valley square floor switch -->
      <polygon points="${swX},${swY - 7} ${swX + 11},${swY} ${swX},${swY + 7} ${swX - 11},${swY}" fill="${doneAny ? th.trail : th.wl}" stroke="${th.top}" stroke-width="1"/>
      <polygon points="${swX},${swY - 3.5} ${swX + 5.5},${swY} ${swX},${swY + 3.5} ${swX - 5.5},${swY}" fill="${doneAny ? '#ffffff' : th.gem}" opacity=".9"/>
      <!-- Lower staircase descending seamlessly toward next chapter -->
      ${hasNext ? `<polygon points="${midX - 16},128 ${midX + 16},128 ${botX + 16},232 ${botX - 16},232" fill="${wallL}" opacity=".65"/>${drawSteps(midX, 128, botX, 230, 7)}`
                : `<polygon points="74,130 106,130 106,240 74,240" fill="${wallR}"/><polygon points="74,130 90,138 90,240 74,240" fill="${wallL}"/><path d="M82 232v-34a8 8 0 0 1 16 0v34z" fill="${th.arch}"/>`}
      <!-- Monument Valley character standing on the stairs/landing -->
      ${heroChar}
    </svg>`;
  }

  function mvWingDecorSVG(idx, th, dark, p, pct, c) {
    const motif = idx % 4;
    let sc = '';
    if (motif === 0) {
      // Twin slender domed columns + ladder (echoing left side of reference image)
      sc = `
        <path d="M48 48q0-12 10-20 10 8 10 20z" fill="${th.trail}" opacity=".85"/>
        <rect x="50" y="48" width="2.5" height="58" fill="${th.wl}"/><rect x="63.5" y="48" width="2.5" height="58" fill="${th.wr}"/>
        <path d="M74 52q0-12 10-20 10 8 10 20z" fill="${th.gem}" opacity=".85"/>
        <rect x="76" y="52" width="2.5" height="54" fill="${th.wl}"/><rect x="89.5" y="52" width="2.5" height="54" fill="${th.wr}"/>
        <polygon points="44,106 98,92 120,102 66,116" fill="${th.top}"/>
        <polygon points="44,106 66,116 66,136 44,126" fill="${th.wl}"/>
        <polygon points="66,116 120,102 120,122 66,136" fill="${th.wr}"/>
        <g transform="translate(82,102) scale(.85)">${mvCrowSVG(-1)}</g>`;
    } else if (motif === 1) {
      // Patterned square Escher archway window (like the mint/green square arch in reference image)
      sc = `
        <polygon points="56,42 114,26 114,112 56,128" fill="${th.trail}" opacity="${dark ? '.45' : '.65'}"/>
        <polygon points="68,54 102,44 102,98 68,108" fill="${th.arch}"/>
        <polygon points="44,48 56,42 56,128 44,122" fill="${th.wl}"/>
        <polygon points="56,42 114,26 102,20 44,36" fill="${th.top}"/>
        <g transform="translate(86,98) scale(.85)">${mvCrowSVG(1)}</g>
        <rect x="49" y="64" width="3" height="8" rx="1.5" fill="${th.win}"/>`;
    } else if (motif === 2) {
      // Cantilevered arched viaduct bridge + floating crescent
      sc = `
        <path d="M126 26a10 10 0 1 0 11 13 8 8 0 1 1-11-13z" fill="${th.win}" opacity=".85"/>
        <polygon points="36,86 122,52 138,60 52,94" fill="${th.top}"/>
        <polygon points="52,94 138,60 138,118 52,134" fill="${th.wr}"/>
        <path d="M68 130v-26a11 11 0 0 1 22 0v26z" fill="${th.arch}"/>
        <path d="M102 124v-28a11 11 0 0 1 22 0v28z" fill="${th.arch}"/>
        <polyline points="36,86 122,52" stroke="${th.trail}" stroke-width="2" opacity=".85"/>
        <g transform="translate(94,68) scale(.85)">${mvCharSVG(idx, th.trail, th.gem, false)}</g>`;
    } else {
      // Floating misty onion-dome sanctuary + glowing diamond beacon
      sc = `
        <circle cx="88" cy="40" r="22" fill="none" stroke="${th.trail}" stroke-opacity=".28" stroke-width="1"/>
        <polygon points="88,24 94,34 88,44 82,34" fill="${th.gem}" opacity=".88"/>
        <polygon points="68,66 88,56 108,66 108,128 68,128" fill="${th.wr}"/>
        <polygon points="68,66 88,76 88,128 68,128" fill="${th.wl}"/>
        <path d="M72 66q0-14 16-22 16 8 16 22z" fill="${th.top}"/>
        <path d="M80 128v-20a8 8 0 0 1 16 0v20z" fill="${th.arch}"/>
        <rect x="75" y="84" width="3.5" height="9" rx="1.7" fill="${th.win}"/>`;
    }
    return `<a class="mv-wing" href="#/${c.id}" title="เปิด ${esc(c.title)} · ${esc(th.name)}">
      <svg class="mv-wing-svg" viewBox="0 0 176 142" aria-hidden="true">
        <path d="M18 142V92q0-12 12-20 12 8 12 20v50z" fill="${th.spire}" opacity=".35"/>
        <path d="M132 142V84q0-14 14-24 14 10 14 24v58z" fill="${th.spire}" opacity=".35"/>
        ${sc}
      </svg>
      <span class="mv-wing-tag" style="--mv-step-c:${th.trail}">✦ ${esc(th.name)} · <b>${pct}%</b></span>
    </a>`;
  }

  function mvMobStairSVG(th, idx, isCur) {
    return `<div class="mv-mob-stair" aria-hidden="true"><svg viewBox="0 0 260 44" width="260" height="44">
      <polygon points="24,18 106,18 154,32 236,32 236,38 150,38 102,24 24,24" fill="${th.wl}" opacity=".85"/>
      <polyline points="30,18 106,18 154,32 230,32" fill="none" stroke="${th.trail}" stroke-width="2.2" stroke-linecap="round"/>
      <polygon points="130,18 140,24 130,30 120,24" fill="${th.top}" stroke="${th.trail}" stroke-width="1"/>
      <g transform="translate(130,22) scale(.78)">${isCur ? `<polygon points="0,-12 4,-1 -4,-1" fill="#ffffff"/><polygon points="0,-19 3,-12 -3,-12" fill="#ffffff"/>` : (idx % 2 === 0 ? mvCrowSVG(1) : mvCharSVG(idx, th.trail, th.gem, false))}</g>
    </svg></div>`;
  }

  function mvCastleBaseSVG(isClip, dark) {
    const p = isClip
      ? (dark ? { w1: '#49b879', w2: '#236e50', top: '#d2ffb4', ar: '#041418', tr: '#6ee7b7', fog: '#0e1424' }
              : { w1: '#7ce092', w2: '#46a875', top: '#f0ffdc', ar: '#c3e8dc', tr: '#288f6c', fog: '#eef4f5' })
      : (dark ? { w1: '#7e527c', w2: '#46325e', top: '#e8c4d8', ar: '#11162e', tr: '#5eead4', fog: '#0e1424' }
              : { w1: '#f0a5b2', w2: '#d48296', top: '#fff4e4', ar: '#c8e4e3', tr: '#6fd8b2', fog: '#eef4f5' });
    return `<svg class="mv-realm-base-svg" viewBox="0 0 920 118" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
      <defs>
        <linearGradient id="mvbF${isClip ? 1 : 0}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${p.fog}" stop-opacity="0"/><stop offset="100%" stop-color="${p.fog}" stop-opacity=".98"/>
        </linearGradient>
      </defs>
      <polygon points="110,44 460,8 810,44 810,118 110,118" fill="${p.w2}" opacity=".82"/>
      <polygon points="110,44 460,8 460,118 110,118" fill="${p.w1}" opacity=".85"/>
      <polyline points="110,44 460,8 810,44" fill="none" stroke="${p.top}" stroke-width="4" opacity=".9"/>
      <polyline points="110,44 460,8 810,44" fill="none" stroke="${p.tr}" stroke-width="1.5" opacity=".75"/>
      <path d="M185 118V70a28 28 0 0 1 56 0v48z" fill="${p.ar}"/>
      <path d="M295 118V60a32 32 0 0 1 64 0v58z" fill="${p.ar}"/>
      <path d="M560 118V60a32 32 0 0 1 64 0v58z" fill="${p.ar}"/>
      <path d="M675 118V70a28 28 0 0 1 56 0v48z" fill="${p.ar}"/>
      <rect x="418" y="26" width="84" height="84" rx="4" fill="${p.tr}" opacity="${dark ? '.38' : '.62'}"/>
      <rect x="432" y="40" width="56" height="68" rx="3" fill="${p.ar}"/>
      <g transform="translate(446,96) scale(1.05)">${mvCrowSVG(1)}</g>
      <rect y="74" width="920" height="44" fill="url(#mvbF${isClip ? 1 : 0})"/>
    </svg>`;
  }

  function mvCastleGroupHTML(groupTitle, chList, isClip) {
    const dark = isDark();
    const lastCh = (S.lastRead && S.lastRead.h && S.lastRead.h.match(/^#\/([^/]+)/)) ? S.lastRead.h.match(/^#\/([^/]+)/)[1] : '';
    let totD = 0, totN = 0;
    const rows = chList.map((c, idx) => {
      const ch = CH[c.id];
      const th = mvThemeOf(c.id);
      const isL = idx % 2 === 0;
      const isCur = c.id === lastCh;
      if (!c.ready || !ch) {
        return `<div class="mv-stair-row ${isL ? 'mv-row-l' : 'mv-row-r'}">
          <div class="tile soon mv-step-card ${grpCls(c)}" style="--mv-step-c:${th.trail};--mv-step-g:${th.gem}">
            <div class="mv-step-top"><span class="mv-step-no">STEP ${String(idx + 1).padStart(2, '0')}</span><span class="mv-step-realm">${esc(th.name)}</span>${mvCastleLogoSVG(c.id, 24)}</div>
            <h3>${esc(c.title)}</h3><p>${esc(c.desc || 'เร็ว ๆ นี้')}</p>
          </div>
          <div class="mv-stair-spine">${mvStairSpineSVG(idx, chList.length, th, dark, false, false)}</div>
          <div class="mv-stair-wing"></div>
        </div>`;
      }
      const p = chProgress(ch);
      totD += p.d; totN += p.n;
      const pct = p.n ? Math.round(p.d * 100 / p.n) : 0;
      const rt = readToday(c.id);
      const lh = lastOf(c.id); const lm = lh && lh.match(/\/(\d+)$/);
      const todayLine = `<div class="today-line"><b>Today</b> ${rt.done} boxes read · ${Math.round(rt.done * 100 / p.n)}% of chapter${rt.seen > rt.done ? ` · ${rt.seen - rt.done} in progress` : ''}<i style="width:${Math.round(rt.done * 100 / p.n)}%"></i></div>`;
      const card = `<div class="tile mv-step-card ${grpCls(c)}${rt.done ? ' read-today' : ''}${isCur ? ' is-cur' : ''}" style="--mv-step-c:${th.trail};--mv-step-g:${th.gem};--mv-step-top:${th.top}">
        <div class="mv-step-top">
          <span class="mv-step-no">STEP ${String(idx + 1).padStart(2, '0')}</span>
          <span class="mv-step-realm">✦ ${esc(th.name)}</span>
          ${mvCastleLogoSVG(c.id, 26)}
        </div>
        <a class="tile-main" href="#/${c.id}">${ring(p)}<div class="tile-txt"><h3>${esc(c.title)}</h3><p>${esc(c.desc || '')}</p></div></a>
        <div class="tile-acts"><a class="btn small primary" href="${lh || '#/' + c.id + '/' + (ch.sections[0] ? ch.sections[0].no : 1)}">${lm ? `📖 อ่านต่อ กล่อง ${lm[1]}` : '📖 เริ่มอ่าน'}</a><a class="btn small" href="#/quiz?ch=${c.id}">📝 Quiz</a>${rt.done ? `<span class="tile-today">วันนี้ ${rt.done} กล่อง</span>` : ''}</div>
        <details class="tile-more"><summary>สถิติ</summary>${todayLine}${lvBar(p, true)}<div class="bar-label">ประเมินแล้ว ${p.d}/${p.n} หัวข้อ · มั่นใจ ${p.c[4]} หัวข้อ · ข้อสอบ ${Object.keys(ch.exams).length} ข้อ</div>${lvLegend(p)}</details>
      </div>`;
      const spine = `<div class="mv-stair-spine">${mvStairSpineSVG(idx, chList.length, th, dark, isCur, p.d > 0)}</div>`;
      const wing = `<div class="mv-stair-wing">${mvWingDecorSVG(idx, th, dark, p, pct, c)}</div>`;
      const mobConn = idx < chList.length - 1 ? mvMobStairSVG(th, idx, isCur) : '';
      return `<div class="mv-stair-row ${isL ? 'mv-row-l' : 'mv-row-r'}">${card}${spine}${wing}</div>${mobConn}`;
    }).join('');
    const grpPct = totN ? Math.round(totD * 100 / totN) : 0;
    return `<section class="mv-castle-realm ${isClip ? 'g-clip' : 'g-main'}">
      <div class="mv-realm-head">
        <div class="mv-realm-title">
          <h2>${esc(groupTitle)}</h2>
          <small>${chList.length} บทบนขั้นบันไดปราสาท · พิชิตแล้ว <b>${totD}/${totN}</b> กล่อง (<b>${grpPct}%</b>)</small>
        </div>
      </div>
      <div class="mv-realm-crown">${mvCastleCrownSVG(isClip, dark)}</div>
      <div class="mv-castle-stairs">${rows}</div>
      <div class="mv-realm-base">${mvCastleBaseSVG(isClip, dark)}</div>
    </section>`;
  }

  /* ---------- แถบกราฟิกปราสาทนีออนคั่นเนื้อหากับข้อสอบ + เกมส์กระโดดแบบ Chrome Dino Runner (ไร้กรอบ + ปุ่ม Play & โดด) ---------- */
  let mvGameCleanup = null;
  function stopExamBreakGame() {
    if (mvGameCleanup) { try { mvGameCleanup(); } catch (e) {} mvGameCleanup = null; }
  }
  function mvExamBreakHTML(chId) {
    const th = mvThemeOf(chId);
    return `<div class="mv-break-strip" id="mvBreakWrap" style="--mv-g-c:${th.trail};--mv-g-g:${th.gem}">
      <canvas id="mvBreakCanvas" class="mv-break-canvas" tabindex="0" aria-label="แถบปราสาท Monument Valley กระโดดคั่นข้อสอบ"></canvas>
      <div class="mv-toy-ctrl" aria-label="ควบคุมตัวละคร">
        <span class="mv-toy-pts" id="mvToyPts" hidden>000</span>
        <button type="button" class="mv-toy-play" id="mvToyPlay" title="เริ่มวิ่ง / หยุด">▶ Play</button>
        <button type="button" class="mv-toy-jump" id="mvToyJ" title="กระโดด (กดซ้ำกลางอากาศได้)">↑ โดด</button>
      </div>
    </div>`;
  }

  function initExamBreakGame(chId) {
    stopExamBreakGame();
    const wrap = $('#mvBreakWrap');
    const canvas = $('#mvBreakCanvas');
    const bPlay = $('#mvToyPlay');
    const bJ = $('#mvToyJ');
    const ptsEl = $('#mvToyPts');
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const th = mvThemeOf(chId);
    const H = 158;
    const GROUND_Y = 114;
    let W = 900, dpr = 1;
    let resize = () => {};

    let playing = false, crashed = false;
    let rafId = 0, lastTs = 0, animT = 0;
    let scroll = 0, speed = 285, score = 0, bonus = 0;
    let iy = GROUND_Y, vy = 0, jumps = 2, runT = 0;
    let spawnT = 0.7, orbT = 1.2;
    let obs = [], orbs = [], rings = [], parts = [], floats = [];

    const playerX = () => Math.min(180, Math.max(76, W * 0.16));

    const updatePts = () => {
      if (!ptsEl) return;
      const tot = Math.floor(score + bonus);
      ptsEl.hidden = !playing && tot === 0;
      ptsEl.textContent = crashed ? `✦ ${tot} · ชนแล้ว!` : `✦ ${String(tot).padStart(3, '0')}`;
    };

    const ensureLoop = () => {
      if (!rafId) {
        lastTs = performance.now();
        rafId = requestAnimationFrame(tick);
      }
    };

    const burst = (x, y, col, n = 10) => {
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i / n) + Math.random() * 0.4;
        const sp = 50 + Math.random() * 110;
        parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, life: 0.42 + Math.random() * 0.2, max: 0.62, r: 1.7 + Math.random() * 1.8, col });
      }
    };

    const startRun = () => {
      playing = true; crashed = false;
      score = 0; bonus = 0; speed = 290;
      iy = GROUND_Y; vy = 0; jumps = 2;
      obs = []; orbs = []; rings = []; parts = []; floats = [];
      spawnT = 0.65; orbT = 1.1;
      if (bPlay) { bPlay.textContent = '⏸ หยุด'; bPlay.classList.add('on'); }
      updatePts();
      ensureLoop();
    };

    const stopRun = () => {
      playing = false; crashed = false;
      obs = []; orbs = [];
      if (bPlay) { bPlay.textContent = '▶ Play'; bPlay.classList.remove('on'); }
      updatePts();
      draw();
    };

    const doJump = () => {
      if (crashed) {
        startRun();
        vy = -490; jumps = 1;
        rings.push({ x: playerX(), y: GROUND_Y, r: 4, maxR: 24, life: 0.36, col: '#5eead4' });
        return;
      }
      if (jumps > 0) {
        const dbl = jumps === 1;
        vy = dbl ? -440 : -505;
        jumps--;
        rings.push({ x: playerX(), y: iy, r: 4, maxR: dbl ? 30 : 22, life: 0.38, col: dbl ? '#ff5ea8' : '#5eead4' });
        if (dbl) burst(playerX(), iy - 4, '#5eead4', 7);
        ensureLoop();
      }
    };

    const togglePlay = () => {
      if (playing) stopRun();
      else startRun();
    };

    const spawnOb = () => {
      const r = Math.random();
      if (r < 0.48) obs.push({ type: 'crow', x: W + 30, w: 18, h: 22, ph: Math.random() * 6 });
      else if (r < 0.78) obs.push({ type: 'pillar', x: W + 30, w: 18, h: 28 + Math.round(Math.random() * 14), ph: 0 });
      else obs.push({ type: 'crow2', x: W + 30, w: 34, h: 22, ph: Math.random() * 6 });
    };

    const spawnOrb = () => {
      orbs.push({ x: W + 30, y: GROUND_Y - (42 + Math.random() * 38), ph: Math.random() * 6 });
    };

    const tick = (ts) => {
      if (!canvas.isConnected) { stopExamBreakGame(); return; }
      const dt = Math.min(0.05, Math.max(0.001, (ts - lastTs) / 1000));
      lastTs = ts;
      animT += dt;

      // ฟิสิกส์การกระโดด (ทำงานตลอดทั้งตอน idle และตอน Play)
      if (iy < GROUND_Y || vy < 0) {
        vy += 1480 * dt;
        iy += vy * dt;
        if (iy >= GROUND_Y) {
          iy = GROUND_Y; vy = 0; jumps = 2;
        }
      }

      if (playing && !crashed) {
        speed = Math.min(480, speed + dt * 7);
        scroll += speed * dt;
        score += dt * 12;
        if (iy >= GROUND_Y - 0.5) runT += dt * (speed / 24);
        updatePts();

        spawnT -= dt;
        if (spawnT <= 0) {
          spawnOb();
          const minGap = Math.max(0.68, 1.32 - (speed - 280) / 380);
          spawnT = minGap + Math.random() * 0.62;
        }
        orbT -= dt;
        if (orbT <= 0) {
          spawnOrb();
          orbT = 1.45 + Math.random() * 1.15;
        }

        const px = playerX();
        const px1 = px - 5.5, px2 = px + 5.5, py1 = iy - 25, py2 = iy - 2;
        for (let i = obs.length - 1; i >= 0; i--) {
          const ob = obs[i];
          ob.x -= speed * dt;
          ob.ph += dt * 7.5;
          if (ob.x < -50) { obs.splice(i, 1); continue; }
          const ox1 = ob.x - ob.w * 0.4, ox2 = ob.x + ob.w * 0.4;
          const oy1 = GROUND_Y - ob.h + 5, oy2 = GROUND_Y;
          if (px2 > ox1 && px1 < ox2 && py2 > oy1 && py1 < oy2) {
            crashed = true;
            burst(px, iy - 12, '#ff5ea8', 14);
            burst(px, iy - 12, '#5eead4', 10);
            if (bPlay) { bPlay.textContent = '↻ Play'; bPlay.classList.remove('on'); }
            updatePts();
            break;
          }
        }
        for (let i = orbs.length - 1; i >= 0; i--) {
          const o = orbs[i];
          o.x -= speed * dt;
          o.ph += dt * 4.5;
          if (o.x < -30) { orbs.splice(i, 1); continue; }
          const oy = o.y + Math.sin(o.ph) * 4;
          if (Math.hypot(px - o.x, (iy - 13) - oy) < 20) {
            bonus += 10;
            burst(o.x, oy, '#ffe28a', 9);
            floats.push({ x: o.x, y: oy - 8, txt: '+10', life: 0.7, col: '#5eead4' });
            updatePts();
            orbs.splice(i, 1);
          }
        }
      }

      for (let i = rings.length - 1; i >= 0; i--) {
        const rg = rings[i];
        rg.r += (rg.maxR - rg.r) * Math.min(1, dt * 11);
        rg.life -= dt;
        if (rg.life <= 0) rings.splice(i, 1);
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 240 * dt; p.life -= dt;
        if (p.life <= 0) parts.splice(i, 1);
      }
      for (let i = floats.length - 1; i >= 0; i--) {
        const f = floats[i];
        f.y -= 26 * dt; f.life -= dt;
        if (f.life <= 0) floats.splice(i, 1);
      }

      draw();
      const active = (playing && !crashed) || iy < GROUND_Y || vy !== 0 || rings.length || parts.length || floats.length;
      if (active) rafId = requestAnimationFrame(tick);
      else rafId = 0;
    };

    const drawCrow = (cx, cy, ph, scale = 1) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      const bob = Math.sin(ph) * 1.4;
      ctx.strokeStyle = '#0d101d'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-2, -6); ctx.lineTo(-3 - bob * 0.7, 0); ctx.moveTo(2, -6); ctx.lineTo(3 + bob * 0.7, 0); ctx.stroke();
      ctx.fillStyle = '#14192a';
      ctx.beginPath(); ctx.moveTo(-5.8, -5); ctx.quadraticCurveTo(-5.8, -17.5, 0, -20.5); ctx.quadraticCurveTo(5.8, -17.5, 5.8, -5); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-2, -20); ctx.lineTo(-12, -17.5); ctx.lineTo(-3, -14.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(-2.1, -17.2, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#121626'; ctx.beginPath(); ctx.arc(-2.6, -17.2, 1.1, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };

    const drawIda = (ix, iyPos) => {
      const air = iyPos < GROUND_Y - 1;
      // เงาที่พื้นหดลงตามความสูง
      const hRatio = Math.max(0.25, 1 - (GROUND_Y - iyPos) / 110);
      ctx.fillStyle = 'rgba(10,16,32,0.45)';
      ctx.beginPath(); ctx.ellipse(ix, GROUND_Y + 1, 9 * hRatio, 2.6 * hRatio, 0, 0, Math.PI * 2); ctx.fill();

      ctx.save();
      ctx.translate(ix, iyPos);
      if (air) ctx.rotate(Math.max(-0.2, Math.min(0.2, vy * 0.00042)));
      const ag = ctx.createRadialGradient(0, -14, 2, 0, -14, 22);
      ag.addColorStop(0, 'rgba(255,255,255,0.42)');
      ag.addColorStop(0.55, 'rgba(94,234,212,0.22)');
      ag.addColorStop(1, 'rgba(94,234,212,0)');
      ctx.fillStyle = ag;
      ctx.beginPath(); ctx.arc(0, -14, 22, 0, Math.PI * 2); ctx.fill();

      const step = air ? 4 : (playing && !crashed ? Math.sin(runT) * 4.5 : 0.8);
      ctx.strokeStyle = '#e8f1ff'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-2, -6); ctx.lineTo(-2 - step, 0); ctx.moveTo(2, -6); ctx.lineTo(2 + step, 0); ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(0, -18.5); ctx.lineTo(6.2, -5); ctx.lineTo(-6.2, -5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = th.trail; ctx.globalAlpha = 0.24;
      ctx.beginPath(); ctx.moveTo(0, -18.5); ctx.lineTo(6.2, -5); ctx.lineTo(0, -5); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#1b2442'; ctx.beginPath(); ctx.arc(0, -20.2, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(4.8, -20.2); ctx.lineTo(-4.8, -20.2); ctx.closePath(); ctx.fill();
      ctx.restore();
    };

    const drawCastleModule = (ox, dark) => {
      const wl = dark ? '#363f63' : '#e6a8b5', wr = dark ? '#212744' : '#c98597';
      const topC = dark ? '#707ca6' : '#fff3e2', archC = dark ? '#101528' : '#bce0de';
      const roofC = dark ? '#b8505a' : '#df6c77', neonC = dark ? '#5eead4' : '#2b7a78', neonP = '#ff5ea8';

      // หอคอยสูง + ธงริบบิ้นสีชมพู-ส้ม
      const tx = ox + 110, ty = GROUND_Y - 82;
      ctx.fillStyle = wr; ctx.fillRect(tx, ty, 24, 82);
      ctx.fillStyle = wl; ctx.fillRect(tx - 12, ty + 4, 12, 78);
      ctx.fillStyle = roofC;
      ctx.beginPath(); ctx.moveTo(tx - 15, ty + 4); ctx.lineTo(tx + 6, ty - 22); ctx.lineTo(tx + 27, ty); ctx.closePath(); ctx.fill();
      ctx.save();
      ctx.strokeStyle = '#ff7b89'; ctx.shadowColor = neonP; ctx.shadowBlur = dark ? 8 : 2; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(tx + 6, ty - 21);
      const wv = Math.sin(animT * 4 + ox * 0.02) * 3;
      ctx.bezierCurveTo(tx - 12, ty - 16 + wv, tx - 24, ty - 8 - wv, tx - 42, ty - 6 + wv);
      ctx.stroke(); ctx.restore();
      // ประตูซุ้มนีออนชมพู
      ctx.save();
      ctx.fillStyle = archC; ctx.beginPath(); ctx.arc(tx + 10, ty + 22, 5.5, Math.PI, 0); ctx.lineTo(tx + 15.5, ty + 34); ctx.lineTo(tx + 4.5, ty + 34); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = neonP; ctx.shadowColor = neonP; ctx.shadowBlur = dark ? 10 : 2; ctx.lineWidth = 1.6; ctx.stroke(); ctx.restore();

      // บันไดเฉียงขอบนีออนไซอัน
      const sx0 = tx - 12, sy0 = ty + 32, sx1 = tx - 72, sy1 = GROUND_Y - 4;
      ctx.fillStyle = wl;
      ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.lineTo(sx1, sy1); ctx.lineTo(sx1, GROUND_Y); ctx.lineTo(sx0, GROUND_Y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = topC;
      for (let k = 0; k < 8; k++) {
        const t = k / 8;
        const x0 = sx0 + (sx1 - sx0) * t, y0 = sy0 + (sy1 - sy0) * t;
        ctx.fillRect(x0 - 6, y0, 10, 2.5);
      }
      ctx.save(); ctx.strokeStyle = neonC; ctx.shadowColor = neonC; ctx.shadowBlur = dark ? 8 : 2; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx0 + 2, sy0); ctx.lineTo(sx1 + 2, sy1); ctx.stroke(); ctx.restore();

      // หอคอยฝั่งขวา + หน้าต่างชมพู
      const rx = ox + 266, ry = GROUND_Y - 68;
      ctx.fillStyle = wr; ctx.fillRect(rx, ry, 26, 68);
      ctx.fillStyle = wl; ctx.fillRect(rx - 12, ry + 5, 12, 63);
      ctx.fillStyle = dark ? '#4c3b6b' : '#b885c4';
      ctx.beginPath(); ctx.moveTo(rx - 14, ry + 5); ctx.lineTo(rx + 6, ry - 18); ctx.lineTo(rx + 28, ry); ctx.closePath(); ctx.fill();
      ctx.save(); ctx.fillStyle = neonP; ctx.shadowColor = neonP; ctx.shadowBlur = dark ? 8 : 2;
      ctx.fillRect(rx + 5, ry + 16, 4, 10); ctx.fillRect(rx + 15, ry + 18, 4, 9);
      ctx.restore();
    };

    const draw = () => {
      const dark = isDark();
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, W, H);

      // 1. ท้องฟ้ากลืนไร้ขอบบน-ล่าง
      const bgFade = dark ? '#0e1424' : '#eef4f5';
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, bgFade);
      sky.addColorStop(0.18, dark ? '#131a30' : '#c0e4e3');
      sky.addColorStop(0.7, dark ? '#1f2544' : '#e4eff2');
      sky.addColorStop(1, bgFade);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // ดาวพารัลแลกซ์
      ctx.fillStyle = dark ? 'rgba(238,242,255,0.72)' : 'rgba(255,255,255,0.75)';
      for (let i = 0; i < 20; i++) {
        const sx = ((i * 83 + 22) - scroll * 0.05) % (W + 40);
        const fx = sx < -10 ? sx + W + 40 : sx;
        const sy = 16 + (i * 29) % 52;
        ctx.beginPath(); ctx.arc(fx, sy, i % 3 ? 0.9 : 1.3, 0, Math.PI * 2); ctx.fill();
      }

      // จันทร์เสี้ยวในหมอก
      const mx = Math.min(118, W * 0.12), my = 36;
      const mg = ctx.createRadialGradient(mx, my, 2, mx, my, 30);
      mg.addColorStop(0, dark ? 'rgba(255,234,153,0.48)' : 'rgba(255,246,204,0.68)');
      mg.addColorStop(1, 'rgba(255,234,153,0)');
      ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, my, 30, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = dark ? '#ffea99' : '#fff6cc';
      ctx.beginPath(); ctx.arc(mx, my, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = dark ? '#161c34' : '#cbe8e8';
      ctx.beginPath(); ctx.arc(mx + 4.3, my - 1.5, 8.2, 0, Math.PI * 2); ctx.fill();

      // 2. ปราสาท Parallax เลื่อนตามเวลาวิ่ง (เหมือนฉากหลัง Dino Runner!)
      const modW = 380;
      const farOff = -(scroll * 0.35) % modW;
      for (let x = farOff - modW; x < W + modW; x += modW) {
        drawCastleModule(x, dark);
      }

      // 3. ซุ้มสะพานด้านล่าง + ก้อนลูกบาศก์นีออนชมพู 4 ก้อนเลื่อนตามพื้น
      ctx.fillStyle = dark ? '#1a213b' : '#b7cfd4';
      ctx.fillRect(0, GROUND_Y, W, 32);
      const midW = 240;
      const midOff = -(scroll * 0.72) % midW;
      for (let x = midOff - midW; x < W + midW; x += midW) {
        ctx.fillStyle = dark ? '#101528' : '#d5e9ea';
        ctx.beginPath(); ctx.arc(x + 68, GROUND_Y + 32, 20, Math.PI, 0); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 178, GROUND_Y + 32, 16, Math.PI, 0); ctx.fill();
        const cx = x + 124, cy = GROUND_Y + 15 + Math.sin(animT * 2.5 + x) * 1.4;
        ctx.save(); ctx.fillStyle = '#ff5ea8'; ctx.shadowColor = '#ff5ea8'; ctx.shadowBlur = dark ? 8 : 2;
        ctx.fillRect(cx - 7, cy - 2, 4, 4); ctx.fillRect(cx + 3, cy - 2, 4, 4);
        ctx.fillRect(cx - 2, cy - 7, 4, 4); ctx.fillRect(cx - 2, cy + 3, 4, 4);
        ctx.restore();
      }
      // จางขอบล่างให้กลืนกับพื้นหลังเว็บ
      const botFade = ctx.createLinearGradient(0, GROUND_Y + 18, 0, H);
      botFade.addColorStop(0, 'rgba(14,20,36,0)');
      botFade.addColorStop(1, bgFade);
      ctx.fillStyle = botFade; ctx.fillRect(0, GROUND_Y + 18, W, H - (GROUND_Y + 18));

      // 4. พื้นสะพานวิ่งเร็ว 1:1 + เส้นไฟนีออนไซอัน
      ctx.fillStyle = dark ? '#6e7aa3' : '#fff3e2';
      ctx.fillRect(0, GROUND_Y - 2, W, 5);
      const tileOff = -(scroll % 34);
      ctx.strokeStyle = dark ? 'rgba(20,26,48,0.45)' : 'rgba(180,130,140,0.3)';
      ctx.lineWidth = 1.2;
      for (let x = tileOff; x < W; x += 34) {
        ctx.beginPath(); ctx.moveTo(x, GROUND_Y - 2); ctx.lineTo(x - 5, GROUND_Y + 3); ctx.stroke();
      }
      ctx.save();
      ctx.strokeStyle = dark ? '#5eead4' : '#2b7a78';
      ctx.shadowColor = '#5eead4'; ctx.shadowBlur = dark ? 9 : 2; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, GROUND_Y - 2); ctx.lineTo(W, GROUND_Y - 2); ctx.stroke();
      ctx.restore();

      // 5. คริสตัล + อุปสรรค (อีกา / เสาหิน)
      for (const o of orbs) {
        const oy = o.y + Math.sin(o.ph) * 4;
        ctx.save(); ctx.translate(o.x, oy);
        ctx.fillStyle = '#fff6c8';
        ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5.5, 0); ctx.lineTo(0, 8); ctx.lineTo(-5.5, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#5eead4'; ctx.globalAlpha = 0.7;
        ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5.5, 0); ctx.lineTo(0, 8); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      if (!playing) {
        drawCrow(W * 0.56, GROUND_Y, 0, 0.96);
        drawCrow(W * 0.72, GROUND_Y, 1.8, 0.9);
      } else {
        for (const ob of obs) {
          if (ob.type === 'crow') drawCrow(ob.x, GROUND_Y, ob.ph, 1);
          else if (ob.type === 'crow2') { drawCrow(ob.x - 8, GROUND_Y, ob.ph, 0.92); drawCrow(ob.x + 8, GROUND_Y, ob.ph + 2, 0.9); }
          else {
            const bx = ob.x - ob.w / 2, by = GROUND_Y - ob.h;
            ctx.fillStyle = dark ? '#3a4268' : '#d695a6'; ctx.fillRect(bx, by, ob.w * 0.55, ob.h);
            ctx.fillStyle = dark ? '#242a48' : '#b77487'; ctx.fillRect(bx + ob.w * 0.55, by, ob.w * 0.45, ob.h);
            ctx.fillStyle = '#ff5ea8'; ctx.fillRect(ob.x - 1.5, by + 7, 3, 9);
          }
        }
      }

      // 6. วงแหวนกระโดด + ตัว Ida + อนุภาค
      for (const rg of rings) {
        ctx.save(); ctx.strokeStyle = rg.col; ctx.globalAlpha = Math.max(0, rg.life / 0.38); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(rg.x, rg.y, rg.r, rg.r * 0.4, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
      drawIda(playerX(), iy);

      for (const p of parts) {
        ctx.save(); ctx.fillStyle = p.col; ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      ctx.font = '700 12px "Josefin Sans","IBM Plex Sans Thai",sans-serif';
      ctx.textAlign = 'center';
      for (const f of floats) {
        ctx.save(); ctx.fillStyle = f.col; ctx.globalAlpha = Math.max(0, f.life / 0.7);
        ctx.fillText(f.txt, f.x, f.y); ctx.restore();
      }
      ctx.restore();
    };

    const onPointer = (e) => {
      e.preventDefault();
      canvas.focus({ preventScroll: true });
      doJump();
    };
    const onKey = (e) => {
      if (e.code !== 'Space' && e.code !== 'ArrowUp') return;
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable)) return;
      if (playing || ae === canvas || (ae && wrap.contains(ae))) {
        e.preventDefault();
        doJump();
      }
    };

    resize = () => {
      const rect = wrap.getBoundingClientRect();
      W = Math.max(300, Math.round(rect.width || 900));
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      draw();
    };

    canvas.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', resize);
    const ro = window.ResizeObserver ? new ResizeObserver(() => resize()) : null;
    if (ro) ro.observe(wrap);
    if (bPlay) bPlay.onclick = (e) => { e.stopPropagation(); canvas.focus({ preventScroll: true }); togglePlay(); };
    if (bJ) bJ.onclick = (e) => { e.stopPropagation(); canvas.focus({ preventScroll: true }); doJump(); };

    resize();

    mvGameCleanup = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      if (ro) ro.disconnect();
      canvas.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', resize);
    };
  }

  /* ---------- sidebar ---------- */
  const MV_MINI_HERO = `<svg class="mv-mini-hero" viewBox="0 0 14 20" aria-hidden="true"><polygon points="7,8 10.6,18 3.4,18" fill="#ffffff"/><circle cx="7" cy="6.8" r="1.5" fill="#1b2442"/><polygon points="7,1 9.8,6.8 4.2,6.8" fill="#ffffff"/></svg>`;
  // กราฟิกปราสาทจาง ๆ เฉพาะของแต่ละบท (13 บท 13 แบบไม่ซ้ำกันเลย)
  function mvSideCardBG(chId) {
    const th = mvThemeOf(chId);
    const id = String(chId || '').toLowerCase();
    let art = '';
    if (id === 'b3') {
      // วิหารแห่งดวงดาว: บันไดซิกแซกใต้จันทร์เสี้ยว
      art = `<path d="M138 14a5 5 0 1 0 5.6 6.8 4 4 0 1 1-5.6-6.8z" fill="#ffe89c" opacity=".85"/>
        <polygon points="184,64 184,16 196,10 208,16 208,64" fill="${th.wr}" opacity=".62"/>
        <polygon points="146,52 198,28 214,36 162,60" fill="${th.top}" opacity=".45"/>
        <polyline points="148,51 198,28" fill="none" stroke="${th.trail}" stroke-width="1.6" opacity=".85"/>
        <path d="M190 64v-12a6 6 0 0 1 12 0v12z" fill="${th.arch}" opacity=".7"/>`;
    } else if (id === 'b4') {
      // หอคอยปะการัง: หอคอยคู่โดมชมพู-ฟ้า + ริบบิ้น
      art = `<path d="M164 64V24q0-6 6-10 6 4 6 10v40zM198 64V18q0-6 6-10 6 4 6 10v46z" fill="${th.wl}" opacity=".55"/>
        <path d="M164 24q0-6 6-10 6 4 6 10z" fill="${th.trail}" opacity=".85"/>
        <path d="M198 18q0-6 6-10 6 4 6 10z" fill="${th.gem}" opacity=".85"/>
        <path d="M204 8c-10 4-18 8-30 9" fill="none" stroke="${th.trail}" stroke-width="1.3" opacity=".75"/>
        <polygon points="154,48 218,48 218,64 154,64" fill="${th.wr}" opacity=".52"/>`;
    } else if (id === 'b5') {
      // ปราการศิลาขาว: ซุ้มกรอบ Escher + กงล้อหมุน 4 แฉก
      art = `<polygon points="156,14 196,14 196,58 156,58" fill="none" stroke="${th.top}" stroke-width="6" opacity=".45"/>
        <polygon points="168,14 198,3 206,7 176,18" fill="${th.wl}" opacity=".6"/>
        <g transform="translate(206,36)" stroke="${th.trail}" stroke-width="2" opacity=".82">
          <line x1="-9" y1="0" x2="9" y2="0"/><line x1="0" y1="-9" x2="0" y2="9"/>
          <circle cx="0" cy="0" r="3" fill="${th.wr}"/>
        </g>`;
    } else if (id === 'b6') {
      // วิหารสายลมในหมอก: หอสูงกลางหมอก + สะพานโค้ง 2 ชั้น
      art = `<ellipse cx="176" cy="48" rx="46" ry="12" fill="${th.top}" opacity=".2"/>
        <polygon points="184,64 184,12 196,6 208,12 208,64" fill="${th.wl}" opacity=".55"/>
        <path d="M186 12q0-6 10-9 10 3 10 9z" fill="${th.trail}" opacity=".75"/>
        <path d="M144 64V40h54v24h-10v-12a7 7 0 0 0-14 0v12h-10v-12a7 7 0 0 0-14 0v12z" fill="${th.wr}" opacity=".58"/>`;
    } else if (id === 'b7') {
      // ป้อมสนธยาทับทิม: ป้อมปราการยอดแหลมคู่ + หน้าต่างไฟทอง
      art = `<polygon points="160,22 172,12 184,22 184,64 160,64" fill="${th.wl}" opacity=".58"/>
        <polygon points="196,16 208,6 220,16 220,64 196,64" fill="${th.wr}" opacity=".58"/>
        <polygon points="152,38 228,38 228,46 152,46" fill="${th.top}" opacity=".45"/>
        <rect x="170" y="25" width="3" height="7" rx="1.5" fill="${th.win}" opacity=".9"/>
        <rect x="206" y="20" width="3" height="7" rx="1.5" fill="${th.win}" opacity=".9"/>`;
    } else if (id === 'b8') {
      // หอคอยโคมอำพัน: ปราสาทน้ำตกเทอร์ควอยซ์ 3 ชั้น
      art = `<polygon points="152,24 218,24 218,64 152,64" fill="${th.wl}" opacity=".42"/>
        <polygon points="168,14 186,6 204,14 204,34 168,34" fill="${th.wr}" opacity=".58"/>
        <path d="M156 30h34v28h-7V36h-27z" fill="#5eead4" opacity=".48"/>
        <circle cx="176" cy="20" r="2.2" fill="${th.win}" opacity=".9"/>`;
    } else if (id === 'b9') {
      // วิหารกลางมหาสมุทร: วงแหวนลอย + ดอกบัว + คลื่นน้ำ
      art = `<circle cx="188" cy="28" r="14" fill="none" stroke="${th.top}" stroke-width="5" opacity=".45"/>
        <circle cx="188" cy="28" r="14" fill="none" stroke="${th.trail}" stroke-width="1.3" opacity=".8"/>
        <path d="M142 56q14-6 28 0t28 0 28 0" fill="none" stroke="${th.trail}" stroke-width="1.6" opacity=".65"/>
        <path d="M158 46q6-12 12 0q-6 4-12 0z" fill="${th.gem}" opacity=".65"/>`;
    } else if (id === 'b10') {
      // ปราสาทแสงตะวัน: ปราสาทม่วงเข้ม + บันไดส้มทองเรืองแสง
      art = `<polygon points="178,64 178,12 196,4 214,12 214,64" fill="${th.wr}" opacity=".62"/>
        <polygon points="146,60 192,18 202,24 156,64" fill="#fbbf24" opacity=".65"/>
        <polygon points="194,10 202,14 194,18 186,14" fill="#ffe28a" opacity=".9"/>`;
    } else if (id === 'kt-embryo') {
      // หอคอยกำเนิดดารา: วงแหวนดาวเคราะห์แฝด + หอคู่คริสตัล
      art = `<circle cx="188" cy="24" r="16" fill="none" stroke="${th.trail}" stroke-dasharray="2 3" stroke-width="1" opacity=".65"/>
        <polygon points="168,64 168,26 178,18 188,26 188,64" fill="${th.wl}" opacity=".55"/>
        <polygon points="194,64 194,20 204,12 214,20 214,64" fill="${th.wr}" opacity=".55"/>
        <circle cx="178" cy="12" r="2.2" fill="#fff4b8" opacity=".9"/>
        <circle cx="204" cy="7" r="2.2" fill="#7dd3fc" opacity=".9"/>`;
    } else if (id === 'kt-repro') {
      // ปราสาทกล้วยไม้ราตรี: ซุ้มประตูโค้งนีออนชมพู + ลูกบาศก์ลอย
      art = `<polygon points="160,64 160,18 214,18 214,64" fill="${th.wr}" opacity=".5"/>
        <path d="M174 64V34a13 13 0 0 1 26 0v30z" fill="${th.arch}" stroke="${th.trail}" stroke-width="1.4" opacity=".85"/>
        <rect x="182" y="38" width="5" height="5" fill="${th.trail}" opacity=".85"/>
        <rect x="190" y="45" width="4" height="4" fill="${th.gem}" opacity=".85"/>`;
    } else if (id === 'kt-msk') {
      // หอคอยหยกโบราณ: เจดีย์ขั้นบันไดหยก 3 ชั้น
      art = `<polygon points="158,64 158,48 218,48 218,64" fill="${th.wr}" opacity=".55"/>
        <polygon points="168,48 168,32 208,32 208,48" fill="${th.wl}" opacity=".58"/>
        <polygon points="178,32 178,16 198,16 198,32" fill="${th.top}" opacity=".45"/>
        <polygon points="188,6 194,12 188,18 182,12" fill="${th.trail}" opacity=".9"/>`;
    } else if (id === 'kt-parasit') {
      // วิหารป่ามรกต: ต้นไม้ป่ามืดซ้ายขวา + หอคอยมรกต
      art = `<rect x="148" y="0" width="8" height="64" fill="#041518" opacity=".65"/>
        <rect x="220" y="0" width="10" height="64" fill="#041518" opacity=".65"/>
        <path d="M156 16l22 14-4 5-18-11z" fill="#041518" opacity=".6"/>
        <polygon points="178,64 178,20 190,12 202,20 202,64" fill="${th.wl}" opacity=".62"/>
        <path d="M181 20q0-8 9-12 9 4 9 12z" fill="${th.top}" opacity=".75"/>`;
    } else {
      // kt-rs หอคอยหมอกออโรรา: แสงเหนือพาดผ่าน 3 ยอดโดม
      art = `<path d="M138 22q36-16 86 2" fill="none" stroke="${th.trail}" stroke-width="5" opacity=".32" stroke-linecap="round"/>
        <path d="M164 64V34q0-6 6-10 6 4 6 10v30zM186 64V20q0-7 7-12 7 5 7 12v44zM208 64V36q0-6 6-10 6 4 6 10v28z" fill="${th.wl}" opacity=".58"/>
        <rect x="191.5" y="28" width="2.5" height="6" rx="1.2" fill="${th.win}" opacity=".9"/>`;
    }
    const sid = 'sb' + id.replace(/[^a-z0-9]/gi, '');
    return `<svg class="mv-sb-bg" viewBox="0 0 240 64" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="${sid}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${th.sky[1]}" stop-opacity="0"/>
          <stop offset="44%" stop-color="${th.sky[1]}" stop-opacity=".46"/>
          <stop offset="100%" stop-color="${th.sky[2]}" stop-opacity=".82"/>
        </linearGradient>
      </defs>
      <rect width="240" height="64" fill="url(#${sid})"/>
      ${art}
    </svg>`;
  }
  function renderSidebar(curCh, curNo) {
    applyChAccent(curCh);
    const ready = INDEX.filter(c => c.ready);
    const curMeta = curCh ? ready.find(c => c.id === curCh && CH[c.id]) : null;
    const isMv = uiStyle() === 'monument';
    const chItem = (c, expanded, idx = 0) => {
      const ch = CH[c.id];
      const p = ch ? chProgress(ch) : null;
      const doneAny = !!(p && p.d > 0);
      const stepCls = isMv && !expanded ? (idx % 2 ? ' mz-r' : ' mz-l') : '';
      const logo = isMv ? mvCastleLogoSVG(c.id, expanded ? 28 : 26) : '';
      const sbBg = isMv ? mvSideCardBG(c.id) : '';
      let out = `<div class="side-ch ${grpCls(c)}${expanded ? ' side-cur' : ' side-ch-mz' + stepCls}${doneAny ? ' mz-lit' : ''}">${sbBg}<a href="#/${c.id}">${logo}<span class="sc-t">${esc(c.title)}</span>${!expanded && p ? `<small class="sc-p">${p.n ? Math.round(p.d * 100 / p.n) : 0}%</small>` : ''}</a>`;
      if (p) out += mvSideBarHTML(p, c.id, idx);
      if (expanded && ch) {
        out += mvTowerHTML(ch, curNo);
        const curPos = curNo ? ch.sections.findIndex(x => x.no === curNo) : -1;
        let gIdx = 0;
        for (const pg of ch.pages) {
          out += `<div class="side-pg">${isMv ? '<i class="mz-gate" aria-hidden="true"></i>' : ''}<span>หน้า ${pg.no} · ${esc(pg.title)}</span></div>`;
          const pgSecs = ch.sections.filter(x => x.page === pg.no);
          if (isMv) out += '<div class="mv-maze-list">';
          for (const s of pgSecs) {
            const l = lvOf(ch.id, s.no);
            const isOn = s.no === curNo;
            const lit = isOn || !!l || (curPos >= 0 && gIdx <= curPos);
            const zig = isMv ? (gIdx % 2 ? ' mz-r' : ' mz-l') : '';
            const node = isMv ? `<span class="mz-node${isOn ? ' on' : ''}${l ? ' lv' + l : ''}" aria-hidden="true">${isOn ? MV_MINI_HERO : '<i class="mz-gem"></i>'}</span>` : '';
            out += `<a class="side-sec${isOn ? ' on' : ''}${l ? ' lv' + l : ''}${zig}${lit ? ' mz-lit' : ''}" href="#/${ch.id}/${s.no}">${node}<span class="n">${s.no}</span><span class="t">${esc(s.title)}</span>${boxScore(ch.id, s)}${l ? `<span class="ck">${LV[l].s}</span>` : ''}</a>`;
            gIdx++;
          }
          if (isMv) out += '</div>';
        }
      }
      return out + '</div>';
    };
    const linksHtml = `<div class="side-links"><a href="#/">🏠 Home</a><a href="#/quiz">📝 Quiz</a><a href="#/wrong">📕 Mistakes</a><a href="#/cards">🃏 Flashcard</a><a href="#/stats">📊 Weak spots</a><a href="#/review">📅 Today's review</a><a href="#/db">💊 Drug & Bug</a><a href="#/numbers">🔢 Numbers</a><a href="#/flows${curCh ? '?ch=' + curCh : ''}">🩺 Diagnosis flowchart</a><a href="#/drill">🧠 Name drill</a>${curCh ? `<a href="#/map/${curCh}">🗺️ Chapter map</a><a href="#/db?view=table&ch=${curCh}">💊 Drug table</a>` : ''}<a href="#/notes">🗒️ My notes</a><a href="#/keywords">🔑 My keywords</a><a href="#/sync">☁️ Sync & App</a><a href="#/backup">💾 Backup</a><a href="#" id="hlToggle">🖍 Auto highlight: ${S.hlOff ? 'OFF' : 'ON'}</a><a href="#" id="uiToggle">🎨 ธีม: ${uiStyle() === 'pixel' ? 'Pixel Classic' : 'Monument Valley'}</a></div>`;
    let h = '';
    if (curMeta) {
      // ตอนอ่านบทใดบทหนึ่ง: โชว์เฉพาะหัวข้อย่อยของบทที่เลือก ส่วนบทอื่นย่อไว้เป็นแถบ กดถึงจะเปิดดู
      h += chItem(curMeta, true, 0);
      const others = ready.filter(c => c.id !== curMeta.id);
      if (others.length) {
        let oh = '', grp = '', oi = 0;
        for (const c of others) {
          if ((c.group || '') !== grp) { grp = c.group || ''; if (grp) oh += `<div class="side-grp">${esc(grp)}</div>`; }
          oh += chItem(c, false, oi++);
        }
        h += `<details class="side-others"><summary><span class="so-l">📚 บทอื่น ๆ</span><small>${others.length} บท</small></summary><div class="side-others-body${isMv ? ' mv-ch-maze' : ''}">${oh}</div></details>`;
      }
      h += `<details class="side-others"><summary><span class="so-l">🧰 เมนู &amp; เครื่องมือ</span></summary><div class="side-others-body">${linksHtml}</div></details>`;
    } else {
      let grp = '', ci = 0;
      if (isMv) h += '<div class="mv-ch-maze">';
      for (const c of ready) {
        if ((c.group || '') !== grp) { grp = c.group || ''; if (grp) h += `<div class="side-grp">${esc(grp)}</div>`; }
        h += chItem(c, false, ci++);
      }
      if (isMv) h += '</div>';
      h += linksHtml;
    }
    sidebar.innerHTML = h;
    const on = $('.side-sec.on', sidebar); if (on) on.scrollIntoView({ block: 'nearest' });
  }

  /* ---------- MCQ ---------- */
  function mcqExplainHTML(chId, qid, q, letter, extraNote = '', canRedo = false) {
    const ok = letter === q.answer;
    const redoBtn = canRedo ? '<button class="btn small mcq-redo" type="button" data-redo="1" title="ล้างคำตอบเพื่อทำข้อนี้ใหม่">↺ ทำใหม่</button>' : '';
    return `<div class="res ${ok ? 'ok' : 'no'}"><span>${ok ? `✓ ตอบ ${esc(letter)} ถูกแล้ว` : `✗ ตอบ ${esc(letter)} · เฉลย ${esc(q.answer)}`}</span>${redoBtn}</div><div class="why" data-hlk="${esc(qKey(chId, qid, 'why'))}">${whyHTML(q, letter)}</div>${q.doubt ? `<div class="warn">⚠ ${esc(q.doubt.replace(/^\s*⚠\s*/, ''))}</div>` : ''}${extraNote}`;
  }
  function mcqHTML(chId, qid, q, opts = {}) {
    const letters = Object.keys(q.options || {});
    const src = q.source ? `<span class="src">${esc(q.source)}</span>` : '';
    const k = `${chId}|${qid}`;
    const wasWrong = S.wrong[k] ? '<span class="src">· เคยตอบผิด</span>' : '';
    const saved = opts.showSaved ? S.ans[k] : '';
    const optHtml = letters.map(l => {
      let cls = 'opt';
      if (saved) {
        cls += ' off';
        if (l === q.answer) cls += ' right';
        else if (l === saved) cls += ' wrong';
      }
      return `<div class="${cls}" role="button"${saved ? '' : ' tabindex="0"'} data-l="${l}"><span class="l">${l}</span><span class="ot" data-hlk="${esc(qKey(chId, qid, l))}">${inline(esc(q.options[l]))}</span><button class="strike" type="button" aria-label="ตัดชอยส์นี้" title="ตัดชอยส์ (ยังไม่ใช่การตอบ)">✕</button></div>`;
    }).join('');
    return `<div class="mcq" data-ch="${chId}" data-q="${esc(qid)}"${saved ? ' data-done="1"' : ''}${opts.showSaved ? ' data-saved-mode="1"' : ''}>
      <div class="qid">ข้อ ${esc(qid)} ${src} ${wasWrong} ${opts.showBox ? `<a class="src" href="#/${chId}/${q.box}">กล่อง ${q.box}</a>` : ''}</div>
      <div class="stem" data-hlk="${esc(qKey(chId, qid, 'stem'))}">${inline(esc(q.stem))}</div>
      ${q.needs_image ? '<div class="warn">ข้อนี้ข้อสอบจริงมีรูปประกอบ</div>' : ''}
      <div class="opts">${optHtml}</div>
      <div class="explain"${saved ? '' : ' hidden'}>${saved ? mcqExplainHTML(chId, qid, q, saved, '', true) : ''}</div>
    </div>`;
  }
  /* เฉลย: 1 บรรทัด = 1 ประโยค/ช้อยส์ (ดู FORMAT.md)
     "✓ A: เหตุผล" / "✗ B: เหตุผล" = แถวช้อยส์ (โชว์ข้อความช้อยส์ให้เอง) · บรรทัดขึ้นต้นด้วยช่องว่าง = ประโยคต่อของแถวก่อนหน้า
     เฉลยเก่าที่ยังเป็นก้อนเดียว จะถูกตัดที่ " · " และ "; " ให้ขึ้นบรรทัดใหม่ */
  function whyHTML(q, picked) {
    let w = String(q.why || '').replace(/\r/g, '');
    if (!w.includes('\n')) w = w.split(/\s+·\s+|;\s+/).join('\n');
    const blocks = [];
    for (const raw of w.split('\n')) {
      if (!raw.trim()) continue;
      const m = raw.match(/^\s*([✓✗])\s*([A-H])\s*[:：.)\-–—]?\s*(.*)$/);
      if (m) { blocks.push({ k: m[1] === '✓' ? 'ok' : 'no', l: m[2], lines: m[3] ? [m[3]] : [] }); continue; }
      const prev = blocks[blocks.length - 1];
      if (/^\s/.test(raw) && prev) prev.lines.push(raw.trim());
      else blocks.push({ k: 'p', lines: [raw.trim()] });
    }
    return blocks.map(b => {
      const body = b.lines.map(t => `<div class="wl">${inline(esc(t))}</div>`).join('');
      if (b.k === 'p') return `<div class="wp">${body}</div>`;
      const ot = q.options && q.options[b.l] ? `<div class="wo">${inline(esc(q.options[b.l]))}</div>` : '';
      return `<div class="wc ${b.k}${b.l === picked && b.k === 'no' ? ' picked' : ''}"><span class="wb">${b.k === 'ok' ? '✓' : '✗'} ${b.l}</span><div class="wx">${ot}${body}</div></div>`;
    }).join('');
  }
  function answerMCQ(box, letter, onDone) {
    const chId = box.dataset.ch, qid = box.dataset.q, q = CH[chId].exams[qid];
    if (box.dataset.done) return;
    box.dataset.done = '1';
    const ok = letter === q.answer;
    box.querySelectorAll('.opt').forEach(b => {
      b.classList.add('off'); b.classList.remove('struck'); b.removeAttribute('tabindex');
      if (b.dataset.l === q.answer) b.classList.add('right');
      else if (b.dataset.l === letter) b.classList.add('wrong');
    });
    const k = `${chId}|${qid}`;
    S.ans[k] = letter;
    S.stats[k] = S.stats[k] || { r: 0, w: 0 };
    let note = '';
    if (ok) { S.stats[k].r++; if (S.wrong[k]) { delete S.wrong[k]; note = '<div class="warn">เอาออกจากกองข้อผิดแล้ว</div>'; } }
    else { S.stats[k].w++; S.wrong[k] = { ch: chId, id: qid, n: (S.wrong[k]?.n || 0) + 1, t: Date.now() }; note = '<div class="warn">เก็บเข้ากองข้อผิดแล้ว</div>'; }
    save();
    const ex = box.querySelector('.explain');
    ex.hidden = false;
    ex.innerHTML = mcqExplainHTML(chId, qid, q, letter, note, box.dataset.savedMode === '1');
    const rdAllBtn = $('#redoBoxExams'); if (rdAllBtn && box.dataset.savedMode === '1') rdAllBtn.hidden = false;
    applyAllHL(ex);
    if (onDone) onDone(ok);
    if (/^#\/[^/]+\/\d+/.test(location.hash)) { const m = location.hash.match(/^#\/([^/]+)\/(\d+)/); const y = sidebar.scrollTop; renderSidebar(m[1], +m[2]); sidebar.scrollTop = y; }
  }
  function resetMCQ(box) {
    const chId = box.dataset.ch, qid = box.dataset.q;
    delete S.ans[`${chId}|${qid}`];
    delete box.dataset.done;
    box.querySelectorAll('.opt').forEach(b => { b.classList.remove('off', 'right', 'wrong', 'struck'); b.setAttribute('tabindex', '0'); });
    const ex = box.querySelector('.explain');
    if (ex) { ex.hidden = true; ex.innerHTML = ''; }
    save();
  }
  view.addEventListener('click', e => {
    const rd = e.target.closest('[data-redo]');
    if (rd) { const box = rd.closest('.mcq'); if (box) resetMCQ(box); return; }
    const rdAll = e.target.closest('#redoBoxExams');
    if (rdAll) {
      view.querySelectorAll('.exam-sec .mcq[data-done]').forEach(b => resetMCQ(b));
      rdAll.hidden = true;
      toast('ล้างคำตอบในกล่องนี้แล้ว ทำใหม่ได้เลย');
      return;
    }
    const stk = e.target.closest('.strike');
    if (stk) { const o = stk.closest('.opt'); if (!o.classList.contains('off')) o.classList.toggle('struck'); return; }
    const opt = e.target.closest('.opt');
    if (opt && !opt.classList.contains('off')) { if (!getSelection().isCollapsed) return; const box = opt.closest('.mcq'); answerMCQ(box, opt.dataset.l, box._onDone); return; }
    const rv = e.target.closest('[data-reveal]');
    if (rv) { const a = rv.nextElementSibling; a.hidden = !a.hidden; rv.textContent = a.hidden ? 'Show answer' : 'Hide answer'; return; }
    const bx = e.target.closest('[data-box]');
    if (bx) { e.preventDefault(); const cur = location.hash.split('/')[1]; location.hash = `#/${cur}/${bx.dataset.box}`; }
  });

  /* ---------- ตัวย่อ: ครั้งแรกในแต่ละกล่องเติมชื่อเต็มในวงเล็บ ----------
     ชื่อเต็มอยู่ใน data/abbr.json (ใช้ทุกบท) และ data/<id>-abbr.json (เฉพาะบท ทับของกลาง)
     ใส่เป็น span ว่างที่แสดงผ่าน CSS จึงไม่กระทบตำแหน่งไฮไลต์ */
  const esRe = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function expandAbbr(root, dict) {
    const keys = Object.keys(dict || {}).sort((a, b) => b.length - a.length);
    if (!keys.length) return;
    const re = new RegExp(`(^|[^A-Za-z0-9])(${keys.map(esRe).join('|')})(?![A-Za-z0-9])`, 'g');
    const seen = new Set(), low = '';
    for (const n of textNodes(root)) if (!n.parentNode.closest('svg,code,.flow')) expandAbbrNode(n, re, seen, dict, low);
  }
  function expandAbbrNode(n, re, seen, dict, low) {
    while (n) {
      re.lastIndex = 0; let m, hit = null;
      while ((m = re.exec(n.nodeValue))) {
        const k = m[2]; if (seen.has(k)) continue; seen.add(k);
        const at = m.index + m[1].length, end = at + k.length, v = n.nodeValue;
        // ข้ามเฉพาะเมื่อวงเล็บถัดไปมีชื่อเต็มนั้นอยู่แล้ว
        const nx = v.slice(end).match(/^\s*\(([^)]*)\)/); if (nx && nx[1].toLowerCase().includes(dict[k].toLowerCase())) continue;
        hit = { end, f: dict[k] }; break;
      }
      if (!hit) return;
      const rest = n.splitText(hit.end);
      const sp = document.createElement('span'); sp.className = 'abx'; sp.dataset.f = hit.f;
      n.parentNode.insertBefore(sp, rest); n = rest;
    }
  }

  /* ---------- ชื่อแบคทีเรีย: เติม (G+ cocci) ฯลฯ หลังชื่อทุกครั้ง ทุกหน้า ----------
     กฎอยู่ใน data/bacteria.json · แสดงผ่าน CSS (span ว่าง) จึงไม่กระทบตำแหน่งไฮไลต์ · เฝ้า view ด้วย MutationObserver */
  let BACT = null;
  const loadBact = () => BACT ? Promise.resolve(BACT) : fetch('data/bacteria.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : {}).catch(() => ({}))
    .then(j => (BACT = (j.items || []).map(([p, g]) => { try { return [new RegExp(`(?<![A-Za-z])(?:${p})(?![A-Za-z])`, 'g'), g]; } catch (e) { return null; } }).filter(Boolean)));
  // ล้างแท็กเดิมทั้งหมดแล้วเติมใหม่ทุกครั้ง (กันวงเล็บซ้ำเมื่อไฮไลต์ห่อ/แกะ mark รอบชื่อเชื้อ)
  function gramTag(root) {
    if (!BACT || !BACT.length || !root) return;
    root.querySelectorAll('.gtag').forEach(x => x.remove());
    for (let n of textNodes(root)) {
      const pe = n.parentNode; if (!pe || pe.closest('svg,code,textarea,.db-cats,.hl-pop,.flow')) continue;
      let pos = 0;
      while (n) {
        const v = n.nodeValue; let best = null;
        for (const [re, g] of BACT) { re.lastIndex = pos; const m = re.exec(v); if (m && (!best || m.index < best.i || (m.index === best.i && m[0].length > best.len))) best = { i: m.index, len: m[0].length, g }; }
        if (!best) break;
        const end = best.i + best.len, after = v.slice(end);
        if (/^\s*\(\s*(G[+−-]|gram|AFB|spiro|no cell wall|obligate)/i.test(after)) { pos = end; continue; }
        const rest = after.length ? n.splitText(end) : null;
        const sp = document.createElement('span'); sp.className = 'gtag'; sp.dataset.g = best.g;
        n.parentNode.insertBefore(sp, rest || n.nextSibling); n = rest; pos = 0;
      }
    }
  }
  loadBact().then(() => {
    let gT; const opt = { childList: true, subtree: true };
    const mo = new MutationObserver(() => { clearTimeout(gT); gT = setTimeout(run, 40); });
    // หยุดเฝ้าระหว่างเติมแท็ก ไม่ให้การเติมของตัวเองไปปลุกรอบใหม่
    const run = () => { mo.disconnect(); try { gramTag(view); } finally { mo.takeRecords(); mo.observe(view, opt); } };
    run();
  });


  /* ---------- ไอคอนเส้นสีเดียวกับตัวอักษร (แทน emoji ทั้งเว็บ) ---------- */
  const ICON = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
    quiz: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9z"/><path d="m9 13.5 2 2 4-4"/>',
    wrong: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/><path d="m10 8 4 4m0-4-4 4"/>',
    cards: '<rect x="3" y="7" width="13" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-3"/>',
    stats: '<path d="M3 21h18"/><path d="M6 17v-6M11 17V5M16 17v-9M20 17v-3"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="m9 15.5 2 2 4-4"/>',
    note: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3M16 7l3 3M13.5 9.5l2 2"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    hl: '<path d="m14.5 4.5 5 5-8.5 8.5H6v-5z"/><path d="M3 21h9"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    book: '<path d="M2 5h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H2z"/><path d="M22 5h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z"/>',
    flame: '<path d="M12 3c.8 3 5 5.2 5 10a5 5 0 0 1-10 0c0-2.2 1.1-3.7 2.2-4.6.1 1.8.9 3 2 3.1-.2-2.9-.9-5.3.8-8.5z"/>',
    done: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16 9.5"/>',
    think: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.2a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.7"/><path d="M12 17h.01"/>',
    warn: '<path d="M10.3 4.2 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z"/><path d="M12 10v4M12 17.5h.01"/>',
    pin: '<path d="M9 3h6l-1 6 4 3v2H6v-2l4-3z"/><path d="M12 14v7"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    back: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
    hash: '<path d="M5 9h14M5 15h14M10 4L8 20M16 4l-2 16"/>',
    pill: '<rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M9.5 9.5l5 5"/>',
    brain: '<path d="M9 4a3 3 0 0 0-3 3v.2A3 3 0 0 0 4 10a3 3 0 0 0 1 2.2A3 3 0 0 0 6 17a3 3 0 0 0 3 3 3 3 0 0 0 3-3V7a3 3 0 0 0-3-3z"/><path d="M15 4a3 3 0 0 1 3 3v.2A3 3 0 0 1 20 10a3 3 0 0 1-1 2.2A3 3 0 0 1 18 17a3 3 0 0 1-3 3 3 3 0 0 1-3-3"/>',
    flow: '<rect x="8" y="3" width="8" height="5" rx="1.5"/><rect x="2" y="16" width="8" height="5" rx="1.5"/><rect x="14" y="16" width="8" height="5" rx="1.5"/><path d="M12 8v4M6 16v-4h12v4"/>',
    img: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    cloud: '<path d="M6.5 19h11a4 4 0 0 0 .9-7.9A5.5 5.5 0 0 0 7.7 9.3 4 4 0 0 0 6.5 19z"/>',
    spark: '<path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z"/>',
    clip: '<rect x="3" y="5" width="18" height="14" rx="2"/><polygon points="10,9 16,12 10,15"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
    clipb: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9zM9 11h6M9 15h4"/>',
    gear: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
    palette: '<circle cx="12" cy="12" r="9"/><circle cx="8.5" cy="10" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="7.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.5" cy="10" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="14.5" r="1.5"/>',
    phone: '<rect x="6" y="2.5" width="12" height="19" rx="2"/><path d="M12 7v7m-3-3 3 3 3-3"/>',
    dl: '<path d="M12 3v12m-5-4 5 5 5-5M4 20h16"/>',
    folder: '<path d="M3 6h6l2 2h10v11H3z"/>',
    stack: '<path d="M4 19V5h5v14zM10 19V5h5v14zM16 19V6l4-1v14z"/>',
    tools: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
    bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3 11.2V16h6v-1.8A6 6 0 0 0 12 3z"/>',
    edit: '<path d="M14 4l6 6-11 11H3v-6z"/>',
    radar: '<circle cx="12" cy="14" r="2"/><path d="M8.5 10.5a5 5 0 0 1 7 0M5.5 7.5a9.2 9.2 0 0 1 13 0M12 16v5"/>',
    temple: '<path d="M3 20h18M5 20V10M10 20V10M14 20V10M19 20V10M3 10l9-6 9 6z"/>',
    pixel: '<rect x="5" y="7" width="14" height="10"/><path d="M8 7V5M16 7V5M9 11h1M14 11h1M8 17v3M16 17v3"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    eye: '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.5"/>',
    sync: '<path d="M20 11a8 8 0 0 0-14-4.5L3 9M4 13a8 8 0 0 0 14 4.5L21 15"/><path d="M3 4v5h5M21 20v-5h-5"/>',
    sched: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    codex: '<path d="M5 4h13v16H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M8 4v16"/>',
    bug: '<circle cx="12" cy="12" r="5"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>'
  };
  /* ---------- ไอคอนสถาปัตยกรรมเรขาคณิตสไตล์ Monument Valley ---------- */
  const ICON_MV = {
    home: '<path d="M12 2.5 5 8.5V21h14V8.5Z" fill="currentColor" fill-opacity=".12"/><path d="M12 2.5 5 8.5V21h14V8.5Z"/><path d="M9.5 21v-5.5a2.5 2.5 0 0 1 5 0V21"/><circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none"/>',
    quiz: '<polygon points="12,2.5 20,7 20,17 12,21.5 4,17 4,7" fill="currentColor" fill-opacity=".12"/><polygon points="12,2.5 20,7 20,17 12,21.5 4,17 4,7"/><path d="m8.8 12.2 2.2 2.2 4.4-4.4"/>',
    wrong: '<polygon points="12,2.5 20.5,12 12,21.5 3.5,12" fill="currentColor" fill-opacity=".12"/><polygon points="12,2.5 20.5,12 12,21.5 3.5,12"/><path d="m9.5 9.5 5 5m0-5-5 5"/>',
    cards: '<polygon points="12,3 20.5,8 12,13 3.5,8" fill="currentColor" fill-opacity=".15"/><polygon points="12,3 20.5,8 12,13 3.5,8"/><polyline points="3.5,12.5 12,17.5 20.5,12.5"/><polyline points="3.5,16.5 12,21.5 20.5,16.5"/>',
    stats: '<path d="M3 20.5h18"/><path d="M5.5 20.5V13l2-1.5 2 1.5v7.5" fill="currentColor" fill-opacity=".12"/><path d="M10 20.5V7l2-2 2 2v13.5" fill="currentColor" fill-opacity=".18"/><path d="M14.5 20.5V10.5l2-1.5 2 1.5v10" fill="currentColor" fill-opacity=".12"/>',
    cal: '<path d="M4 7.5 12 3l8 4.5V20H4Z" fill="currentColor" fill-opacity=".1"/><path d="M4 7.5 12 3l8 4.5V20H4Z"/><path d="M4 10.5h16"/><circle cx="12" cy="15.2" r="2.2"/><circle cx="12" cy="7.2" r=".9" fill="currentColor" stroke="none"/>',
    note: '<polygon points="6,3 15.5,3 19,6.5 19,21 6,21" fill="currentColor" fill-opacity=".1"/><polygon points="6,3 15.5,3 19,6.5 19,21 6,21"/><path d="M15 3v4h4M9 11.5h6M9 15.5h4"/>',
    key: '<polygon points="7.5,11.5 12,16 7.5,20.5 3,16" fill="currentColor" fill-opacity=".15"/><polygon points="7.5,11.5 12,16 7.5,20.5 3,16"/><path d="m10.5 13 9.5-9.5M16 7.5l2.8 2.8M13.5 10l2 2"/>',
    map: '<polygon points="3,6.5 9,3.5 15,6.5 21,3.5 21,17.5 15,20.5 9,17.5 3,20.5" fill="currentColor" fill-opacity=".1"/><polygon points="3,6.5 9,3.5 15,6.5 21,3.5 21,17.5 15,20.5 9,17.5 3,20.5"/><path d="M9 3.5v14M15 6.5v14"/>',
    hl: '<polygon points="15.5,3.5 20.5,8.5 10,19 5,19 5,14" fill="currentColor" fill-opacity=".14"/><polygon points="15.5,3.5 20.5,8.5 10,19 5,19 5,14"/><path d="M3.5 21h10"/>',
    search: '<circle cx="10.8" cy="10.8" r="6.8" fill="currentColor" fill-opacity=".1"/><circle cx="10.8" cy="10.8" r="6.8"/><circle cx="10.8" cy="10.8" r="2.2"/><path d="m15.8 15.8 4.7 4.7"/>',
    book: '<path d="M3 6.5 12 3.5l9 3v13l-9-3-9 3Z" fill="currentColor" fill-opacity=".1"/><path d="M3 6.5 12 3.5l9 3v13l-9-3-9 3Z"/><path d="M12 3.5v13"/>',
    flame: '<polygon points="12,2.5 17.5,12 12,21 6.5,12" fill="currentColor" fill-opacity=".18"/><polygon points="12,2.5 17.5,12 12,21 6.5,12"/><polygon points="12,8 14.5,12.5 12,16.5 9.5,12.5" fill="currentColor" stroke="none"/>',
    done: '<polygon points="12,2.5 15,9 21.5,12 15,15 12,21.5 9,15 2.5,12 9,9" fill="currentColor" fill-opacity=".16"/><polygon points="12,2.5 15,9 21.5,12 15,15 12,21.5 9,15 2.5,12 9,9"/>',
    think: '<polygon points="12,2.5 21,12 12,21.5 3,12" fill="currentColor" fill-opacity=".1"/><polygon points="12,2.5 21,12 12,21.5 3,12"/><path d="M10 9.6a2.2 2.2 0 1 1 3.1 2c-.6.3-1.1.8-1.1 1.6v.5"/><circle cx="12" cy="16.8" r=".9" fill="currentColor" stroke="none"/>',
    warn: '<polygon points="12,3 21.5,19.5 2.5,19.5" fill="currentColor" fill-opacity=".13"/><polygon points="12,3 21.5,19.5 2.5,19.5"/><path d="M12 9.5v4.5"/><circle cx="12" cy="16.8" r=".9" fill="currentColor" stroke="none"/>',
    pin: '<polygon points="12,2.5 16,9.5 12,15 8,9.5" fill="currentColor" fill-opacity=".16"/><polygon points="12,2.5 16,9.5 12,15 8,9.5"/><path d="M12 15v6.5"/>',
    sun: '<circle cx="12" cy="12" r="4.2" fill="currentColor" fill-opacity=".18"/><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8"/>',
    moon: '<path d="M19.5 14.2A7.8 7.8 0 1 1 9.8 4.5a6.2 6.2 0 0 0 9.7 9.7z" fill="currentColor" fill-opacity=".18"/><path d="M19.5 14.2A7.8 7.8 0 1 1 9.8 4.5a6.2 6.2 0 0 0 9.7 9.7z"/><polygon points="17.5,4.2 18.4,6 20.2,6.9 18.4,7.8 17.5,9.6 16.6,7.8 14.8,6.9 16.6,6" fill="currentColor" stroke="none"/>',
    back: '<polyline points="9.5,14 4.5,9 9.5,4"/><path d="M4.5 9h10.5l4.5 4.5V19H12"/>',
    save: '<path d="M5 4h11l3 3v13H5Z" fill="currentColor" fill-opacity=".1"/><path d="M5 4h11l3 3v13H5Z"/><path d="M8.5 4v5h7V4"/><path d="M9 20v-4.5a3 3 0 0 1 6 0V20"/>',
    hash: '<polygon points="12,3 21,12 12,21 3,12" fill="currentColor" fill-opacity=".08"/><path d="M6 9.5h12M6 14.5h12M9.5 6v12M14.5 6v12"/>',
    pill: '<polygon points="14.5,3.5 20.5,9.5 9.5,20.5 3.5,14.5" fill="currentColor" fill-opacity=".14"/><polygon points="14.5,3.5 20.5,9.5 9.5,20.5 3.5,14.5"/><path d="m9 9 6 6"/>',
    brain: '<polygon points="12,3 19.5,7.5 19.5,16.5 12,21 4.5,16.5 4.5,7.5" fill="currentColor" fill-opacity=".1"/><polygon points="12,3 19.5,7.5 19.5,16.5 12,21 4.5,16.5 4.5,7.5"/><path d="M12 3v18M4.5 7.5 12 12l7.5-4.5M8.5 14l3.5 2 3.5-2"/>',
    flow: '<polygon points="12,2.5 16.5,5.5 12,8.5 7.5,5.5" fill="currentColor" fill-opacity=".18"/><polygon points="12,2.5 16.5,5.5 12,8.5 7.5,5.5"/><polygon points="6,15 10,18 6,21 2,18"/><polygon points="18,15 22,18 18,21 14,18"/><path d="M12 8.5V12H6v3M12 12h6v3"/>',
    img: '<rect x="3.5" y="4.5" width="17" height="15" fill="currentColor" fill-opacity=".08"/><rect x="3.5" y="4.5" width="17" height="15"/><polyline points="3.5,17 9.5,10.5 14,15 16.5,12.5 20.5,17"/><circle cx="15.5" cy="8.5" r="1.4" fill="currentColor" stroke="none"/>',
    cloud: '<path d="M5.5 18.5h13l2-3-2-3.5h-2.5L12 7.5 8 12H5.5l-2 3.5Z" fill="currentColor" fill-opacity=".14"/><path d="M5.5 18.5h13l2-3-2-3.5h-2.5L12 7.5 8 12H5.5l-2 3.5Z"/>',
    spark: '<polygon points="12,2.5 14.3,9.7 21.5,12 14.3,14.3 12,21.5 9.7,14.3 2.5,12 9.7,9.7" fill="currentColor" fill-opacity=".16"/><polygon points="12,2.5 14.3,9.7 21.5,12 14.3,14.3 12,21.5 9.7,14.3 2.5,12 9.7,9.7"/>',
    clip: '<path d="M3.5 6.5 12 3.5l8.5 3v11l-8.5 3-8.5-3Z" fill="currentColor" fill-opacity=".1"/><path d="M3.5 6.5 12 3.5l8.5 3v11l-8.5 3-8.5-3Z"/><polygon points="10,9 15.5,12 10,15" fill="currentColor" fill-opacity=".22"/>',
    target: '<polygon points="12,2.5 21.5,12 12,21.5 2.5,12" fill="currentColor" fill-opacity=".08"/><polygon points="12,2.5 21.5,12 12,21.5 2.5,12"/><polygon points="12,7 17,12 12,17 7,12"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
    clipb: '<polygon points="5,4.5 19,4.5 19,20.5 5,20.5" fill="currentColor" fill-opacity=".1"/><polygon points="5,4.5 19,4.5 19,20.5 5,20.5"/><path d="M9 2.5h6v3.5H9zM8.5 11h7M8.5 15h4.5"/>',
    gear: '<polygon points="12,3 18.4,5.6 21,12 18.4,18.4 12,21 5.6,18.4 3,12 5.6,5.6" fill="currentColor" fill-opacity=".1"/><polygon points="12,3 18.4,5.6 21,12 18.4,18.4 12,21 5.6,18.4 3,12 5.6,5.6"/><polygon points="12,8.5 15.5,12 12,15.5 8.5,12"/>',
    crop: '<path d="M6.5 2.5v15h15"/><path d="M17.5 21.5v-15h-15"/>',
    palette: '<polygon points="12,2.5 20.5,8.5 17.5,19.5 6.5,19.5 3.5,8.5" fill="currentColor" fill-opacity=".12"/><polygon points="12,2.5 20.5,8.5 17.5,19.5 6.5,19.5 3.5,8.5"/><circle cx="9" cy="10.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="8" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="10.5" r="1.2" fill="currentColor" stroke="none"/><polygon points="12,13 14,15 12,17 10,15"/>',
    phone: '<polygon points="6.5,2.5 17.5,2.5 17.5,21.5 6.5,21.5" fill="currentColor" fill-opacity=".1"/><polygon points="6.5,2.5 17.5,2.5 17.5,21.5 6.5,21.5"/><path d="M12 7.5v6.5m-2.5-2.5L12 14l2.5-2.5M10 18.5h4"/>',
    dl: '<path d="M12 3v12m-4.5-4.5L12 15l4.5-4.5"/><polygon points="4,18 12,21 20,18 20,20 12,22.5 4,20" fill="currentColor" fill-opacity=".18"/>',
    folder: '<polygon points="3,6 9.5,6 11.5,8.5 21,8.5 21,19.5 3,19.5" fill="currentColor" fill-opacity=".12"/><polygon points="3,6 9.5,6 11.5,8.5 21,8.5 21,19.5 3,19.5"/>',
    stack: '<polygon points="12,3 20.5,7.5 12,12 3.5,7.5" fill="currentColor" fill-opacity=".16"/><polygon points="12,3 20.5,7.5 12,12 3.5,7.5"/><polyline points="3.5,12 12,16.5 20.5,12"/><polyline points="3.5,16.5 12,21 20.5,16.5"/>',
    tools: '<polygon points="3.5,8 20.5,8 20.5,19.5 3.5,19.5" fill="currentColor" fill-opacity=".1"/><polygon points="3.5,8 20.5,8 20.5,19.5 3.5,19.5"/><path d="M8.5 8V5h7v3M3.5 13h17"/><polygon points="12,11 14,13 12,15 10,13" fill="currentColor" stroke="none"/>',
    bulb: '<polygon points="12,2.5 17.5,9.5 14.5,15.5 9.5,15.5 6.5,9.5" fill="currentColor" fill-opacity=".16"/><polygon points="12,2.5 17.5,9.5 14.5,15.5 9.5,15.5 6.5,9.5"/><path d="M9.5 18.5h5M10.5 21h3"/>',
    edit: '<polygon points="15.5,3.5 20.5,8.5 9.5,19.5 4.5,19.5 4.5,14.5" fill="currentColor" fill-opacity=".14"/><polygon points="15.5,3.5 20.5,8.5 9.5,19.5 4.5,19.5 4.5,14.5"/>',
    radar: '<polygon points="12,11.5 14.5,14 12,16.5 9.5,14" fill="currentColor" fill-opacity=".22"/><polygon points="12,11.5 14.5,14 12,16.5 9.5,14"/><path d="M8 10a5.6 5.6 0 0 1 8 0M4.8 6.8a10 10 0 0 1 14.4 0M12 16.5V21"/>',
    temple: '<path d="M12 2.5 6 7v14h12V7Z" fill="currentColor" fill-opacity=".12"/><path d="M12 2.5 6 7v14h12V7Z"/><path d="M9.5 21v-5.5a2.5 2.5 0 0 1 5 0V21M3 21h18M6 11h12"/>',
    pixel: '<polygon points="6,7 18,7 18,17 6,17" fill="currentColor" fill-opacity=".12"/><path d="M6 7h12v10H6zM9 4v3M15 4v3M9.5 11h1M13.5 11h1M8 17v3M16 17v3"/>',
    lock: '<polygon points="5,10.5 19,10.5 19,20.5 5,20.5" fill="currentColor" fill-opacity=".12"/><polygon points="5,10.5 19,10.5 19,20.5 5,20.5"/><path d="M8.5 10.5V7a3.5 3.5 0 0 1 7 0v3.5"/><polygon points="12,13.5 13.5,15.5 12,17.5 10.5,15.5" fill="currentColor" stroke="none"/>',
    eye: '<polygon points="2.5,12 12,5.5 21.5,12 12,18.5" fill="currentColor" fill-opacity=".1"/><polygon points="2.5,12 12,5.5 21.5,12 12,18.5"/><polygon points="12,9.2 14.8,12 12,14.8 9.2,12" fill="currentColor" fill-opacity=".28"/>',
    sync: '<polyline points="4,9 9,4 19,4 19,9"/><polyline points="20,15 15,20 5,20 5,15"/><polyline points="4,5 4,9 8,9"/><polyline points="20,19 20,15 16,15"/>',
    sched: '<path d="M4 7.5 12 3.5l8 4V20H4Z" fill="currentColor" fill-opacity=".1"/><path d="M4 7.5 12 3.5l8 4V20H4Z"/><path d="M4 10.5h16M9 14.5h6"/>',
    codex: '<polygon points="5,3.5 19,3.5 19,20.5 5,20.5" fill="currentColor" fill-opacity=".12"/><polygon points="5,3.5 19,3.5 19,20.5 5,20.5"/><path d="M8.5 3.5v17"/><polygon points="13.5,9 15.5,11 13.5,13 11.5,11" fill="currentColor" fill-opacity=".28"/>',
    bug: '<polygon points="12,6.5 16.5,9.5 16.5,14.5 12,17.5 7.5,14.5 7.5,9.5" fill="currentColor" fill-opacity=".16"/><polygon points="12,6.5 16.5,9.5 16.5,14.5 12,17.5 7.5,14.5 7.5,9.5"/><path d="M12 3v3.5M12 17.5V21M3.5 9.5 7.5 11M16.5 11l4-1.5M3.5 14.5 7.5 13M16.5 13l4 1.5"/>',
    user: '<polygon points="12,2.5 15,8.5 9,8.5" fill="currentColor" fill-opacity=".22"/><polygon points="12,2.5 15,8.5 9,8.5"/><polygon points="12,10.5 17.5,21 6.5,21" fill="currentColor" fill-opacity=".14"/><polygon points="12,10.5 17.5,21 6.5,21"/>'
  };
  const EMO = { '☁': 'cloud', '🩺': 'flow', '💾': 'save', '🔢': 'hash', '💊': 'pill', '🧠': 'brain', '🖼': 'img', '🏠': 'home', '📝': 'quiz', '📕': 'wrong', '🃏': 'cards', '📊': 'stats', '📅': 'cal', '🗒': 'note', '🔑': 'key', '🗺': 'map', '🖍': 'hl', '🔍': 'search', '📖': 'book', '🔥': 'flame', '🎉': 'done', '🤔': 'think', '⚠': 'warn', '📌': 'pin', '☀': 'sun', '🌙': 'moon', '↩': 'back', '✨': 'spark', '🎬': 'clip', '🎯': 'target', '📋': 'clipb', '⚙': 'gear', '✂': 'crop', '🎨': 'palette', '📲': 'phone', '📥': 'dl', '🗂': 'folder', '📚': 'stack', '🧰': 'tools', '💡': 'bulb', '✏': 'edit', '📡': 'radar', '🏛': 'temple', '👾': 'pixel', '🔐': 'lock', '👁': 'eye', '🔄': 'sync', '🗓': 'sched', '📘': 'codex', '🦠': 'bug', '👤': 'user' };
  const EMO_RE = new RegExp(`(${Object.keys(EMO).join('|')})\\ufe0f?`, 'gu');
  const ic = n => {
    const mv = uiStyle() === 'monument' && ICON_MV[n];
    return `<svg class="ic ic-${n}" data-ic="${n}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${mv ? '1.55' : '1.8'}" stroke-linecap="${mv ? 'square' : 'round'}" stroke-linejoin="${mv ? 'miter' : 'round'}" aria-hidden="true">${mv || ICON[n]}</svg>`;
  };
  // แปลง emoji ในข้อความของหน้าเว็บเป็นไอคอน (ไม่แตะเนื้อหาที่ไฮไลต์ได้ และช่องพิมพ์)
  function iconize(root) {
    if (!root || (root.nodeType !== 3 && !root.querySelectorAll)) return;
    const nodes = root.nodeType === 3 ? [root] : textNodes(root);
    for (const n of nodes) {
      if (!EMO_RE.test(n.nodeValue)) continue; EMO_RE.lastIndex = 0;
      const par = n.parentNode; if (!par || par.closest('[data-hlk],textarea,input,script,style')) continue;
      const span = document.createElement('span');
      span.innerHTML = esc(n.nodeValue).replace(EMO_RE, (m, e) => ic(EMO[e]));
      par.replaceChild(span, n); span.replaceWith(...span.childNodes);
    }
  }
  new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 || n.nodeType === 3) iconize(n); })
    .observe(document.body, { childList: true, subtree: true });
  /* ---------- ไฮไลต์ของผู้ใช้ ----------
     ทุกพื้นที่ที่ไฮไลต์ได้มี data-hlk = คีย์ใน S.hl
     เนื้อหา: "b6/3" · ข้อสอบ: "q:b6|79/117|stem" / "|why" / "|A" (ตัวเลือก) */
  const undoStack = [];
  const qKey = (ch, qid, part) => `q:${ch}|${qid}|${part}`;
  const zoneEl = k => [...view.querySelectorAll('[data-hlk]')].find(z => z.dataset.hlk === k);
  function syncUndo() { const b = document.getElementById('undoBtn'); if (!b) return; const ks = new Set([...view.querySelectorAll('[data-hlk]')].map(z => z.dataset.hlk)); b.hidden = !undoStack.some(u => ks.has(u.k)); }
  function rerender() { const y = scrollY; return route().then(() => scrollTo(0, y)); }
  function textNodes(root) { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const a = []; let n; while ((n = w.nextNode())) a.push(n); return a; }
  // ข้อความของพื้นที่นั้นเท่านั้น (ไม่รวมโน้ตที่ซ้อนอยู่ข้างใน ซึ่งเป็นพื้นที่ของตัวเอง)
  function zoneNodes(z) { return textNodes(z).filter(n => n.parentNode.closest('[data-hlk]') === z); }
  const ztext = z => zoneNodes(z).map(n => n.nodeValue).join('');
  function wrapRange(root, start, end, idx, c) {
    let pos = 0;
    for (const n of zoneNodes(root)) {
      const len = n.nodeValue.length, s = Math.max(start, pos), e = Math.min(end, pos + len);
      if (s < e && !n.parentNode.closest('svg')) {
        const r = document.createRange(); r.setStart(n, s - pos); r.setEnd(n, e - pos);
        const m = document.createElement('mark'); m.className = 'user-hl c-' + (c || 'g'); m.dataset.hl = idx; r.surroundContents(m);
      }
      pos += len;
    }
  }
  function hlPos(z, h) { const full = ztext(z); return full.substr(h.s, h.t.length) === h.t ? h.s : full.indexOf(h.t); }
  function applyHL(z) {
    (S.hl[z.dataset.hlk] || []).forEach((h, i) => { const s = hlPos(z, h); if (s >= 0) wrapRange(z, s, s + h.t.length, i, h.c); });
    drawNotes(z);
  }
  /* รูปที่แทรกเอง: ไฟล์เก็บใน IndexedDB (ไม่เต็ม localStorage) ย่อเหลือกว้างไม่เกิน 1400px */
  const IDB = (() => { let dbp; const db = () => dbp || (dbp = new Promise((ok, no) => { const r = indexedDB.open('nle-img', 1); r.onupgradeneeded = () => r.result.createObjectStore('img'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }));
    const tx = (m, f) => db().then(d => new Promise((ok, no) => { const t = d.transaction('img', m); const q = f(t.objectStore('img')); t.oncomplete = () => ok(q && q.result); t.onerror = () => no(t.error); }));
    return { put: (k, v) => tx('readwrite', s => s.put(v, k)), get: k => tx('readonly', s => s.get(k)), del: k => tx('readwrite', s => s.delete(k)),
      keys: () => tx('readonly', s => s.getAllKeys()) }; })();
  const imgURL = {};
  function shrink(file) {
    return new Promise((ok, no) => {
      const u = URL.createObjectURL(file), im = new Image();
      im.onload = () => { const sc = Math.min(1, 1400 / im.naturalWidth); const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * sc); c.height = Math.round(im.naturalHeight * sc);
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
        c.toBlob(b => b ? ok(b) : no(new Error('encode')), file.type === 'image/png' ? 'image/png' : 'image/jpeg', .85); };
      im.onerror = () => no(new Error('ไฟล์รูปเปิดไม่ได้')); im.src = u;
    });
  }
  const fileIn = document.createElement('input'); fileIn.type = 'file'; fileIn.accept = 'image/*'; fileIn.hidden = true; document.body.appendChild(fileIn);
  let onFile = null; fileIn.onchange = () => { const f = fileIn.files[0]; fileIn.value = ''; if (f && onFile) onFile(f); };
  function pickImage(cb) { onFile = cb; fileIn.click(); }
  function drawImg(fig, h) {
    const set = u => { fig.querySelector('img').src = u; };
    if (imgURL[h.img]) set(imgURL[h.img]);
    else IDB.get(h.img).then(b => { if (b) { imgURL[h.img] = URL.createObjectURL(b); set(imgURL[h.img]); } else fig.classList.add('missing'); }).catch(() => fig.classList.add('missing'));
  }
  // โน้ตสั้นใต้เนื้อหา: วางใต้ย่อหน้า/ข้อ/ช่องตารางที่มีไฮไลต์นั้น
  function drawNotes(z) {
    const arr = S.hl[z.dataset.hlk] || [];
    arr.forEach((h, i) => {
      if (!h.n && !h.img) return;
      const m = z.querySelector(`mark.user-hl[data-hl="${i}"]`); if (!m) return;
      if (h.img) {
        const fig = document.createElement('figure'); fig.className = `uimg al-${h.al || 'c'}`; fig.style.setProperty('--w', (h.w || 60) + '%');
        fig.dataset.hl = i; fig.dataset.k = z.dataset.hlk; fig.innerHTML = '<img alt="รูปที่แทรก">';
        // รูปวางใต้ย่อหน้านั้น (ในข้อ/ช่องตาราง วางท้ายช่องนั้น)
        const blk = m.closest('p,li,td,th,h2,h3,h4');
        if (blk && z.contains(blk) && blk !== z && /^(LI|TD|TH)$/.test(blk.tagName)) blk.appendChild(fig);
        else if (blk && z.contains(blk) && blk !== z) { let a = blk; while (a.nextElementSibling && a.nextElementSibling.matches('.uimg,.inote')) a = a.nextElementSibling; a.after(fig); }
        else { let a = m; while (a.parentNode !== z && /^(B|STRONG|I|EM|A|SPAN|MARK|CODE|SUB|SUP)$/.test(a.parentNode.tagName)) a = a.parentNode; a.after(fig); }
        drawImg(fig, h); cropImg(fig, h.cr); return;
      }
      if (!h.id) { h.id = Date.now().toString(36) + i; save(); }
      const d = document.createElement('span'); d.className = 'inote' + (h.ns ? ' sticky' : ''); d.dataset.hl = i;
      d.dataset.hlk = z.dataset.hlk + '~' + h.id; d.textContent = h.n; d.title = 'แตะเพื่อแก้โน้ต';
      // วางต่อจากข้อความที่จุดไว้ทันที (ออกจากตัวหนา/ลิงก์ก่อน เพื่อไม่ให้สีพื้นติดมา)
      const segs = z.querySelectorAll(`mark.user-hl[data-hl="${i}"]`); let at = segs[segs.length - 1];
      while (at.parentNode !== z && /^(B|STRONG|I|EM|A|SPAN|MARK|CODE|SUB|SUP)$/.test(at.parentNode.tagName)) at = at.parentNode;
      let after = at; while (after.nextSibling && after.nextSibling.nodeType === 1 && after.nextSibling.classList.contains('inote')) after = after.nextSibling;
      after.after(d); applyHL(d);
    });
  }
  // วาดไฮไลต์ใหม่เฉพาะพื้นที่นั้น ไม่ต้องโหลดหน้าใหม่ (ข้อสอบที่กำลังทำอยู่จึงไม่หาย)
  function refreshZone(z) {
    if (!z) return;
    z.querySelectorAll('.inote,.uimg').forEach(n => n.remove());
    z.querySelectorAll('mark.user-hl').forEach(m => m.replaceWith(...m.childNodes));
    z.normalize(); applyHL(z); syncUndo(); updHlCount();
  }
  function applyAllHL(root) { root.querySelectorAll('[data-hlk]').forEach(z => { if (!z.classList.contains('inote')) applyHL(z); }); syncUndo(); }
  function updHlCount() { const el = document.getElementById('myHlCount'); if (el) { const n = (S.hl[el.dataset.k] || []).length; el.textContent = n ? ` · ไฮไลต์ ${n} จุด` : ''; } }
  const pop = document.createElement('div'); pop.className = 'hl-pop'; pop.hidden = true; document.body.appendChild(pop);
  pop.addEventListener('mousedown', e => { if (!e.target.closest('textarea, .ai-body')) e.preventDefault(); });
  // เก็บสถานะก่อนแก้ไว้สำหรับปุ่มเลิกทำ
  function snap(k) { undoStack.push({ k, before: JSON.parse(JSON.stringify(S.hl[k] || [])) }); }
  function setHL(k, arr) { if (arr.length) S.hl[k] = arr; else delete S.hl[k]; save(); }
  // แถบสี: 6 สี (เหลือง เขียว ฟ้า ชมพู ม่วง แดง) + ยางลบ · วางตามตำแหน่งในหน้า จึงเลื่อนตามข้อความ ไม่หายตอนเลื่อน
  // คัดลอกข้อความ แล้วเปิด Google ค้นหาในแท็บใหม่
  let popText = '', popZone = '', popRange = null, popImg = null;
  let moveImg = null;
  // ย้ายรูปไปวางต่อจากข้อความใหม่ (ข้ามกล่อง/ข้อสอบได้)
  function placeMoved(ctx) {
    const { k, idx } = moveImg; moveImg = null; const old = (S.hl[k] || [])[idx]; if (!old || !old.img) return;
    const a1 = S.hl[k].slice(); if (old.c === 'i') a1.splice(idx, 1); else { a1[idx] = Object.assign({}, old); delete a1[idx].img; }
    snap(k); setHL(k, a1);
    const a2 = (S.hl[ctx.k] || []).slice(); a2.push({ s: ctx.s, t: ctx.t, c: 'i', img: old.img, w: old.w, al: old.al, cr: old.cr });
    snap(ctx.k); setHL(ctx.k, a2); getSelection().removeAllRanges();
    refreshZone(zoneEl(k)); if (ctx.k !== k) refreshZone(zoneEl(ctx.k)); toast('ย้ายรูปแล้ว');
  }
  async function insertImage(ctx, f) {
    if (!ctx) return;
    try {
      toast('กำลังใส่รูป…'); const b = await shrink(f); const id = 'img' + Date.now().toString(36);
      await IDB.put(id, b);
      if (window.NLE_SYNC) window.NLE_SYNC.syncImagePut(id, b);
      const z = zoneEl(ctx.k); const arr = (S.hl[ctx.k] || []).slice();
      if (ctx.idx != null) { arr[ctx.idx] = Object.assign({}, arr[ctx.idx], { img: id, w: 60, al: 'c' }); }
      else arr.push({ s: ctx.s, t: ctx.t, c: 'i', img: id, w: 60, al: 'c' });
      snap(ctx.k); setHL(ctx.k, arr); refreshZone(z); toast('ใส่รูปแล้ว · แตะรูปเพื่อปรับขนาด/ตำแหน่ง');
    } catch (e) { toast('ใส่รูปไม่สำเร็จ: ' + e.message); }
  }
  // Keyword: เก็บคำที่เลือกไว้ทวนในหน้า #/keywords
  const kwNorm = t => (t || '').replace(/\s+/g, ' ').trim();
  function kwBox(k) {
    k = k.split('~')[0];
    const q = k.match(/^q:([^|]+)\|(.+)\|[^|]+$/);
    if (q) { const e = CH[q[1]] && CH[q[1]].exams[q[2]]; return { ch: q[1], box: e ? Number(e.box) : 0, q: q[2] }; }
    const m = k.match(/^([^/]+)\/(\d+)$/); return m ? { ch: m[1], box: +m[2] } : { ch: '', box: 0 };
  }
  const kwHas = (k, t) => S.kw.some(x => x.k === k && x.t === kwNorm(t));
  // เดาคำสำคัญไว้ให้ก่อน: ตัวหนาในช่วงที่เลือก > หลังลูกศรตัวสุดท้าย > หลัง = หรือ : > ทั้งข้อความ (ผู้ใช้แก้ได้)
  function kwGuess(t, r) {
    const z = r && (r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentNode).closest('[data-hlk]');
    const bold = [];
    if (z) z.querySelectorAll('b,strong').forEach(el => { const x = kwNorm(el.textContent); if (x.length > 1 && r.intersectsNode(el) && t.includes(x) && !bold.includes(x)) bold.push(x); });
    if (bold.length) { let o = t; bold.sort((a, b) => b.length - a.length).forEach(x => { o = o.replace(x, '==' + x + '=='); }); return o.replace(/====/g, ''); }
    for (const sep of ['→', '=', ':']) { const i = t.lastIndexOf(sep); if (i >= 0 && i < t.length - 2) { const a = t.slice(0, i + sep.length), b = t.slice(i + sep.length); const lead = b.match(/^\s*/)[0]; return a + lead + '==' + b.trim() + '=='; } }
    return '==' + t + '==';
  }
  // ช่องแก้คำก่อนส่งเป็น keyword (เหมือนช่องโน้ต)
  function openKw() {
    const k = popZone, t = kwNorm(popText), init = t;
    pop.dataset.mode = 'note'; pop.classList.add('writing');
    pop.innerHTML = `<div class="note-kind">🔑 ส่งเป็น keyword · แก้คำได้ก่อนส่ง (เน้นเหลือง: เลือกคำแล้วกดเน้นคำที่เลือก)</div><textarea class="note-in" rows="3">${esc(init)}</textarea><div class="note-act"><button class="btn small" data-a="mk" title="Emphasize selected words">Emphasize</button><button class="btn small" data-a="x">Cancel</button><button class="btn small primary" data-a="ok">Save keyword</button></div>`;
    const ta = pop.querySelector('textarea'); ta.focus();
    pop.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'mk') { const v = ta.value, s0 = ta.selectionStart, e0 = ta.selectionEnd; if (e0 > s0) { ta.value = v.slice(0, s0) + '==' + v.slice(s0, e0) + '==' + v.slice(e0); } ta.focus(); return; }
      if (a === 'ok') { const d = ta.value.trim(); if (d) { S.kw.push(Object.assign({ t, k, d, at: Date.now() }, kwBox(k))); save(); toast('🔑 Saved to Keywords'); } }
      hidePop();
    });
  }
  // เอาการเน้นสีเหลือง (==คำ==) ของ keyword ออก
  function kwUnemph(k, texts) {
    const x = S.kw.find(y => 'kw:' + y.at === k); if (!x) return false;
    let d = x.d || x.t, ch = false;
    for (const t of texts) { const n = d.replace('==' + t + '==', t); if (n !== d) { d = n; ch = true; } }
    if (ch) { x.d = d; save(); } return ch;
  }
  const kwHTML = d => esc(d).replace(/==(.+?)==/g, '<mark class="kw-hi">$1</mark>');
  function kwToggle(k, t) {
    t = kwNorm(t); if (!t || !k) return;
    const i = S.kw.findIndex(x => x.k === k && x.t === t);
    if (i >= 0) S.kw.splice(i, 1); else S.kw.push(Object.assign({ t, k, at: Date.now() }, kwBox(k)));
    save(); toast(i >= 0 ? 'Removed from Keywords' : '🔑 Saved to Keywords');
  }
  function toast(msg) {
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('show'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 1600);
  }
  function searchOut(t) {
    t = (t || '').replace(/\s+/g, ' ').trim(); if (!t) return;
    try { navigator.clipboard && navigator.clipboard.writeText(t).catch(() => {}); } catch (e) {}
    window.open('https://www.google.com/search?q=' + encodeURIComponent(t), '_blank', 'noopener');
  }
  /* ---------- Gemini AI Search (Google Search Grounding ในแอป ไม่ต้องสลับแท็บ) ---------- */
  function currentBoxCtx() {
    const m = location.hash.match(/^#\/([^/]+)\/(\d+)/);
    if (!m || !CH[m[1]]) return '';
    const s = CH[m[1]].sections.find(x => x.no === +m[2]);
    return s ? `${CH[m[1]].title} · กล่อง ${s.no} ${s.title}` : CH[m[1]].title;
  }
  let _gemModel = null;
  const _gemCache = new Map();
  const GEM_DEFAULT = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite-preview', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite'];
  async function listGeminiModels(key) {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models', { headers: { 'x-goog-api-key': key } });
    if (!r.ok) return GEM_DEFAULT;
    const d = await r.json().catch(() => ({}));
    const all = (d.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => (m.name || '').replace(/^models\//, ''))
      .filter(n => /^gemini-.*flash/i.test(n) && !/image|audio|tts|embed|aqa|vision|robotics|computer-use|transcribe|2\.0|2\.5/i.test(n));
    return [...new Set([...GEM_DEFAULT, ...all])].slice(0, 8);
  }
  async function askGemini(query, ctx = '', onChunk = null, opts = {}) {
    const key = (S.geminiKey || '').trim();
    if (!key) throw new Error('NO_KEY');
    const cleanQ = (query || '').trim();
    const cacheKey = `${ctx}||${cleanQ}`;
    if (!opts.noCache && _gemCache.has(cacheKey)) {
      const hit = _gemCache.get(cacheKey);
      if (onChunk) onChunk(hit.text);
      return hit;
    }
    const sys = 'คุณคืออาจารย์แพทย์ผู้ช่วยติวสอบ NLE Step 1 ตอบคำถามของผู้ใช้เป็นภาษาไทยอย่างละเอียด ครบถ้วน อ่านง่าย ใช้ศัพท์แพทย์ภาษาอังกฤษตามมาตรฐาน จัดหัวข้อด้วย **ตัวหนา** และ bullet ชัดเจน ครอบคลุม: นิยาม, กลไก/Pathophysiology, อาการและผล Lab สำคัญ, การวินิจฉัยแยกโรค (DDx), หลักการรักษา/ยา, และจุดที่ชอบออกสอบ NLE Step 1 ตอบตรงตามคำถามที่ผู้ใช้พิมพ์เป็นหลัก ไม่ต้องเกริ่นนำและไม่ต้องลงท้าย';
    const prompt = ctx ? `คำถามที่ต้องตอบ: ${cleanQ}\n(บริบทหน้าที่เปิดอยู่: ${ctx} — เชื่อมโยงเฉพาะถ้าเกี่ยวข้องกับคำถาม ถ้าเป็นคนละเรื่องให้ตอบตามคำถามตรงๆ)` : cleanQ;

    const streamCall = async model => {
      const ac = new AbortController();
      const tm = setTimeout(() => ac.abort(), 12000);
      try {
        const body = {
          systemInstruction: { parts: [{ text: sys }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 2800 }
        };
        if (/flash-lite-latest|3\.1-flash-lite|3-flash/i.test(model)) {
          body.generationConfig.thinkingConfig = { thinkingLevel: 'MINIMAL' };
        }
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify(body),
          signal: ac.signal
        });
        clearTimeout(tm);
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          const e = new Error((d.error && d.error.message) || `HTTP ${r.status}`);
          e.status = r.status; throw e;
        }
        if (!r.body || !r.body.getReader) {
          const txtAll = await r.text();
          let full = '';
          for (const line of txtAll.split('\n')) {
            if (!line.startsWith('data:')) continue;
            try {
              const d = JSON.parse(line.slice(5).trim());
              for (const p of (((d.candidates || [])[0] || {}).content || {}).parts || []) {
                if (p.text && !p.thought) full += p.text;
              }
            } catch (_) {}
          }
          if (!full.trim()) throw new Error('Gemini ไม่ได้ส่งข้อความกลับมา');
          if (onChunk) onChunk(full);
          return full.trim();
        }
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = '', full = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';
          let added = false;
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const raw = line.slice(5).trim();
            if (!raw || raw === '[DONE]') continue;
            try {
              const d = JSON.parse(raw);
              for (const p of (((d.candidates || [])[0] || {}).content || {}).parts || []) {
                if (p.text && !p.thought) { full += p.text; added = true; }
              }
            } catch (_) {}
          }
          if (added && onChunk) onChunk(full);
        }
        if (!full.trim()) throw new Error('Gemini ไม่ได้ส่งข้อความกลับมา');
        return full.trim();
      } finally { clearTimeout(tm); }
    };

    const firstList = _gemModel ? [_gemModel, ...GEM_DEFAULT.filter(m => m !== _gemModel)] : GEM_DEFAULT;
    let text = '', lastErr = null, used = null;
    for (const m of firstList) {
      try { text = await streamCall(m); used = m; break; }
      catch (e) { lastErr = e; if (e.status === 401 || /API key not valid/i.test(e.message)) throw e; }
    }
    if (!text) {
      _gemModel = null;
      const more = (await listGeminiModels(key)).filter(m => !firstList.includes(m));
      for (const m of more) {
        try { text = await streamCall(m); used = m; break; }
        catch (e) { lastErr = e; if (e.status === 401 || /API key not valid/i.test(e.message)) throw e; }
      }
    }
    if (!text) throw lastErr || new Error('เชื่อมต่อ Gemini ไม่สำเร็จ');
    _gemModel = used;
    const out = { text, sources: [], model: used };
    _gemCache.set(cacheKey, out);
    if (_gemCache.size > 40) _gemCache.delete(_gemCache.keys().next().value);
    return out;
  }
  function aiFormat(md) {
    const lines = esc(md).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').split('\n');
    let out = '', inUl = false;
    for (const raw of lines) {
      const l = raw.trim();
      if (!l) { if (inUl) { out += '</ul>'; inUl = false; } continue; }
      const h = l.match(/^#{1,4}\s+(.+)/);
      if (h) { if (inUl) { out += '</ul>'; inUl = false; } out += `<p class="ai-h"><b>${h[1]}</b></p>`; continue; }
      const m = l.match(/^(?:[-*•]|\d+\.)\s+(.+)/);
      if (m) { if (!inUl) { out += '<ul>'; inUl = true; } out += `<li>${m[1]}</li>`; }
      else { if (inUl) { out += '</ul>'; inUl = false; } out += `<p>${l}</p>`; }
    }
    if (inUl) out += '</ul>';
    return out;
  }
  /* แถบตัวละครวิ่งระหว่างรอ Gemini ตอบ (ค้างไว้ที่ 100% หลังตอบเสร็จไม่หายไป) */
  function startAiRun(wrap) {
    const mv = uiStyle() === 'monument';
    wrap.innerHTML = `<div class="ai-run"><div class="ai-run-txt"><span>${mv ? '✦ กำลังเดินทางไปหาคำตอบ…' : '✨ น้องหมอกำลังวิ่งไปหาคำตอบ…'}</span><b>10%</b></div><div class="ai-track"><i style="width:10%"></i></div></div>`;
    const bar = wrap.querySelector('.ai-track i');
    const lbl = wrap.querySelector('.ai-run-txt span');
    const pctEl = wrap.querySelector('.ai-run-txt b');
    let pct = 10, phase = 'wait';
    const set = (v, msg) => {
      pct = Math.max(pct, Math.min(100, Math.round(v)));
      if (bar) bar.style.width = pct + '%';
      if (pctEl) pctEl.textContent = pct + '%';
      if (msg && lbl) lbl.textContent = msg;
    };
    const iv = setInterval(() => {
      if (!wrap.isConnected) { clearInterval(iv); return; }
      if (phase === 'wait' && pct < 52) set(pct + (54 - pct) * 0.18);
      else if (phase === 'stream' && pct < 92) set(pct + 1.5);
    }, 220);
    return {
      stream(len) {
        phase = 'stream';
        set(Math.min(92, 55 + Math.round(len / 80)), '✨ กำลังพิมพ์คำตอบ…');
      },
      done() {
        clearInterval(iv);
        set(100, mv ? '✦ ถึงหอคอยคำตอบแล้ว!' : '🎉 ได้คำตอบครบแล้ว!');
        const box = wrap.querySelector('.ai-run');
        if (box) box.classList.add('done');
      },
      stop() { clearInterval(iv); wrap.innerHTML = ''; }
    };
  }
  // ช่องค้นหาในแอปด้วย Gemini Streaming: แก้คำถามให้เสร็จแล้วค่อยกดถาม + ลากคลุมบางส่วนของคำตอบเซฟเป็น Sticky ได้ทันที
  function openSearch(onNote) {
    pop.dataset.mode = 'note'; pop.classList.add('writing', 'ai-pop');
    const w = Math.min(540, document.documentElement.clientWidth - 16);
    const curLeft = parseFloat(pop.style.left) || 8;
    pop.style.left = Math.max(8, Math.min(curLeft, document.documentElement.clientWidth - w - 8)) + 'px';
    const hasKey = !!(S.geminiKey && S.geminiKey.trim());
    const initQ = kwNorm(popText);
    const ctx = currentBoxCtx();
    pop.innerHTML = `<div class="note-kind">✨ ถาม Gemini · พิมพ์/แก้คำถามให้เสร็จแล้วกด <b>ถาม Gemini</b> (หรือ Enter)</div>
      <textarea class="note-in" rows="2" placeholder="พิมพ์คำศัพท์หรือคำถามที่ต้องการ…">${esc(initQ)}</textarea>
      <div class="ai-chips"><button class="btn small" data-q="อธิบายละเอียด ครบกลไก อาการ Lab DDx ยา จุดออกสอบ">ละเอียดเต็มๆ</button><button class="btn small" data-q="อธิบายกลไกทีละขั้น">กลไก</button><button class="btn small" data-q="จุดที่ชอบออกสอบ NLE และกับดักข้อสอบ">ออกสอบตรงไหน</button><button class="btn small" data-q="ตารางเปรียบเทียบ DDx">เทียบ DDx</button></div>
      <div class="note-act"><button class="btn small" data-a="g">Google ↗</button><button class="btn small" data-a="x">ปิด</button><button class="btn small primary" data-a="ai">✨ ถาม Gemini</button></div>
      <div class="ai-ans" id="aiPopAns">${hasKey ? '' : '<p class="muted" style="margin:6px 0 0;font-size:13px">⚙️ ยังไม่ได้ใส่ Gemini API Key (ฟรี) → <a href="#/sync" id="aiGoSync">ไปตั้งค่าที่หน้า Sync</a> หรือกด <b>Google ↗</b> ได้เลย</p>'}</div>`;
    const ta = pop.querySelector('textarea'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    const ansEl = pop.querySelector('#aiPopAns');
    const goSync = pop.querySelector('#aiGoSync'); if (goSync) goSync.onclick = () => hidePop();
    let reqId = 0, activeRun = null, pickedSnippet = '';

    // จับข้อความที่ผู้ใช้ลากคลุมเฉพาะบางส่วนในคำตอบของ Gemini (จับผ่าน document selectionchange + mouseup เพื่อไม่พลาดแม้ลากเลยขอบกล่อง)
    let cleanupSel = null;
    function bindSelectionBar(bodyEl, fullText) {
      if (cleanupSel) { cleanupSel(); cleanupSel = null; }
      const selBar = document.createElement('div');
      selBar.className = 'ai-selbar';
      selBar.hidden = true;
      selBar.innerHTML = `<div class="ai-sel-prev"></div><div class="ai-sel-acts">${onNote ? '<button class="btn small primary" data-s="sticky">🗒️ วงเป็น Sticky ท่อนนี้เลย</button><button class="btn small" data-s="star">★ Star ท่อนนี้</button>' : ''}<button class="btn small" data-s="cp">📋 คัดลอกท่อนนี้</button></div>`;
      bodyEl.after(selBar);
      const prevEl = selBar.querySelector('.ai-sel-prev');
      const syncSel = () => {
        if (!bodyEl.isConnected || pop.hidden) { if (cleanupSel) { cleanupSel(); cleanupSel = null; } return; }
        const sel = getSelection();
        if (sel && sel.rangeCount && !sel.isCollapsed) {
          const r = sel.getRangeAt(0);
          const inBody = bodyEl.contains(r.commonAncestorContainer) || bodyEl.contains(sel.anchorNode) || bodyEl.contains(sel.focusNode);
          if (inBody) {
            const s = r.toString().replace(/\s+\n/g, '\n').trim();
            if (s.length >= 2) {
              pickedSnippet = s;
              prevEl.textContent = `ที่คลุมไว้ (${s.length} ตัวอักษร): “${s.length > 75 ? s.slice(0, 75) + '…' : s}”`;
              selBar.hidden = false;
              return;
            }
          }
        }
      };
      const onDown = () => { pop.dataset.dragging = '1'; };
      const onUp = () => { setTimeout(() => { delete pop.dataset.dragging; syncSel(); }, 30); };
      bodyEl.addEventListener('mousedown', onDown);
      bodyEl.addEventListener('touchstart', onDown, { passive: true });
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchend', onUp);
      document.addEventListener('selectionchange', syncSel);
      cleanupSel = () => {
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchend', onUp);
        document.removeEventListener('selectionchange', syncSel);
      };
      // กันไม่ให้คลิกปุ่มไปล้าง selection ก่อนอ่านค่า
      selBar.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
      selBar.querySelectorAll('button').forEach(b => b.onclick = () => {
        const txt = pickedSnippet; if (!txt) return;
        if (cleanupSel) { cleanupSel(); cleanupSel = null; }
        if (b.dataset.s === 'sticky' && onNote) { onNote(txt, true); hidePop(); toast('🗒️ บันทึกท่อนที่คลุมเป็น Sticky note แล้ว'); }
        else if (b.dataset.s === 'star' && onNote) { onNote(txt, false); hidePop(); toast('★ บันทึกท่อนที่คลุมเป็น Star note แล้ว'); }
        else if (b.dataset.s === 'cp') { navigator.clipboard && navigator.clipboard.writeText(txt).then(() => toast('คัดลอกท่อนที่คลุมแล้ว')).catch(() => {}); }
      });

      const foot = document.createElement('div');
      foot.className = 'ai-foot';
      foot.innerHTML = `${onNote ? '<span class="ai-tip">💡 ลากคลุมท่อนที่ชอบในคำตอบแล้วแถบ Sticky สีเหลืองจะเด้งขึ้นทันที</span><button class="btn small" data-f="edit">✏️ เปิดกล่องแก้/เซฟทั้งหมด</button>' : ''}<button class="btn small" data-f="cp">📋 คัดลอกทั้งหมด</button><button class="btn small" data-f="g">Google ↗</button>`;
      selBar.after(foot);
      const bEdit = foot.querySelector('[data-f="edit"]');
      if (bEdit && onNote) bEdit.onclick = () => { if (cleanupSel) { cleanupSel(); cleanupSel = null; } pop.classList.remove('ai-pop'); openNote(onNote, pickedSnippet || fullText.replace(/\*\*/g, ''), true); };
      const bCp = foot.querySelector('[data-f="cp"]');
      if (bCp) bCp.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(fullText.replace(/\*\*/g, '')).then(() => toast('คัดลอกทั้งหมดแล้ว')).catch(() => {}); };
      const bG = foot.querySelector('[data-f="g"]');
      if (bG) bG.onclick = () => searchOut(ta.value);
    }

    async function runAI(extra) {
      const base = ta.value.trim(); if (!base) { ta.focus(); return; }
      const q = extra ? `${base} (${extra})` : base;
      if (!(S.geminiKey && S.geminiKey.trim())) { toast('กรุณาใส่ Gemini API Key ในหน้า Sync ก่อนครับ'); return; }
      const my = ++reqId;
      pickedSnippet = '';
      if (activeRun) activeRun.stop();
      ansEl.innerHTML = '<div class="ai-run-slot"></div><div class="ai-body" hidden></div>';
      const runSlot = ansEl.querySelector('.ai-run-slot');
      const bodyEl = ansEl.querySelector('.ai-body');
      activeRun = startAiRun(runSlot);
      let lastPaint = 0;
      const paint = txt => {
        if (my !== reqId || pop.hidden) return;
        bodyEl.hidden = false;
        bodyEl.innerHTML = aiFormat(txt);
      };
      try {
        const res = await askGemini(q, ctx, txt => {
          if (my !== reqId || pop.hidden) return;
          activeRun.stream(txt.length);
          const now = Date.now();
          if (now - lastPaint > 70) { lastPaint = now; paint(txt); }
        });
        if (my !== reqId || pop.hidden) return;
        activeRun.done();
        paint(res.text);
        bindSelectionBar(bodyEl, res.text);
      } catch (e) {
        if (my !== reqId || pop.hidden) return;
        activeRun.stop();
        ansEl.innerHTML = `<div class="ai-err">⚠️ ${esc(e.message === 'NO_KEY' ? 'ยังไม่ได้ใส่ Gemini API Key' : e.message)} <a href="#/sync" id="aiErrSync">เช็ก API Key</a></div>`;
        const lk = ansEl.querySelector('#aiErrSync'); if (lk) lk.onclick = () => hidePop();
      }
    }
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (S.geminiKey && S.geminiKey.trim()) runAI(); else { searchOut(ta.value); hidePop(); } } });
    pop.querySelectorAll('.ai-chips button').forEach(b => b.onclick = () => runAI(b.dataset.q));
    pop.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      if (b.dataset.a === 'ai') return runAI();
      if (b.dataset.a === 'g') { searchOut(ta.value); hidePop(); return; }
      if (activeRun) activeRun.stop();
      hidePop();
    });
  }
  function showPalette(rect, onColor, onErase, onNote, curNote) {
    pop.classList.remove('writing', 'ai-pop');
    const noNote = pop.dataset.inNote === '1';
    // แถว 1 สีไฮไลต์ + ยางลบ · แถว 2 สีตัวอักษร + ตัวหนา/ขีดเส้นใต้ · แถว 3 โน้ต รูป keyword ค้นหา
    pop.innerHTML = `<div class="row">${['y', 'g', 'b', 'p', 'v', 'r'].map(c => `<button class="sw c-${c}" data-c="${c}" aria-label="ไฮไลต์สีนี้"></button>`).join('')}<button class="sw erase" data-c="x" aria-label="ลบไฮไลต์" title="ลบไฮไลต์">✕</button>${noNote ? '' : '<button class="sw nb" data-c="n" aria-label="เขียนโน้ตดาว" title="โน้ตดาวต่อจากข้อความนี้">★</button>'}</div>`
      + `<div class="row">${['ty', 'tr', 'tp', 'tv', 'tly', 'tlg', 'tlb'].map(c => `<button class="sw tc c-${c}" data-c="${c}" aria-label="เปลี่ยนสีตัวอักษร" title="เปลี่ยนสีตัวอักษร">A</button>`).join('')}<button class="sw tc fx-b" data-c="bd" aria-label="ตัวหนา" title="ตัวหนา">B</button><button class="sw tc fx-u" data-c="ul" aria-label="ขีดเส้นใต้" title="ขีดเส้นใต้">U</button></div>`
      + `<div class="row">${noNote ? '' : '<button class="sw nb" data-c="k" aria-label="sticky note" title="sticky note ต่อจากข้อความนี้">🗒️</button><button class="sw nb" data-c="i" aria-label="แทรกรูป" title="แทรกรูปต่อจากข้อความนี้">🖼</button>'}`
      + (noNote ? '' : `<button class="sw nb kwb${kwHas(popZone, popText) ? ' on' : ''}" data-c="w" aria-label="เก็บเป็น keyword" title="เก็บเข้าหน้า Keyword">🔑</button>`) + `<button class="sw nb" data-c="s" aria-label="ถาม Gemini / ค้นหา" title="ถาม Gemini หรือค้นหา Google โดยไม่ต้องสลับแอป">🔍</button></div>`;
    pop.hidden = false;
    const w = 380, top = rect.bottom + scrollY + 10, left = Math.max(8, Math.min(rect.left + scrollX + rect.width / 2 - w / 2, document.documentElement.clientWidth - w - 8));
    pop.style.top = top + 'px'; pop.style.left = left + 'px';
    pop.querySelectorAll('button').forEach(b => b.onclick = () => {
      if (b.dataset.c === 'n' || b.dataset.c === 'k') return openNote(onNote, curNote, b.dataset.c === 'k');
      if (b.dataset.c === 'i') { const ctx = popImg; hidePop(); if (moveImg && ctx && ctx.idx == null) return placeMoved(ctx); return pickImage(f => insertImage(ctx, f)); }
      if (b.dataset.c === 's') return openSearch(noNote ? null : onNote);
      if (b.dataset.c === 'w') { if (kwHas(popZone, popText)) { kwToggle(popZone, popText); return hidePop(); } return openKw(); }
      if (b.dataset.c === 'x') onErase(); else onColor(b.dataset.c); hidePop();
    });
  }
  // กล่องพิมพ์โน้ตในแถบเดียวกัน (ถ้าข้อความยาวจาก Gemini จะขยายกล่องให้ตัด/แก้สะดวก)
  function openNote(onNote, cur, sticky) {
    const isLong = (cur || '').length > 140;
    pop.dataset.mode = 'note'; pop.classList.toggle('ai-pop', isLong); pop.classList.add('writing');
    if (isLong) {
      const w = Math.min(540, document.documentElement.clientWidth - 16);
      const curLeft = parseFloat(pop.style.left) || 8;
      pop.style.left = Math.max(8, Math.min(curLeft, document.documentElement.clientWidth - w - 8)) + 'px';
    }
    pop.innerHTML = `<div class="note-kind">${sticky ? '🗒️ Sticky note' : '★ Star note'}${isLong ? ' · ลบ/ตัดแต่งข้อความแล้วกด Save ได้เลย' : ''}</div><textarea class="note-in${sticky ? ' sticky' : ''}" rows="${isLong ? 10 : 3}" placeholder="พิมพ์โน้ต จะแสดงต่อจากข้อความที่เลือก">${esc(cur || '')}</textarea><div class="note-act">${cur ? '<button class="btn small" data-a="del">Delete note</button>' : ''}<button class="btn small" data-a="x">Cancel</button><button class="btn small primary" data-a="ok">Save</button></div>`;
    const ta = pop.querySelector('textarea'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onNote(ta.value.trim(), sticky); hidePop(); } });
    pop.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { const a = b.dataset.a; if (a === 'ok') onNote(ta.value.trim(), sticky); if (a === 'del') onNote('', sticky); hidePop(); });
  }
  // บันทึก/แก้/ลบโน้ตของไฮไลต์ที่มีอยู่แล้ว (ใช้ทั้งตอนแตะไฮไลต์และแตะตัวโน้ต)
  const noteSaver = (k, idx, z) => (n, st) => {
    snap(k); const arr = JSON.parse(JSON.stringify(S.hl[k] || [])); if (!arr[idx]) return;
    if (n) { arr[idx].n = n; if (st) arr[idx].ns = 1; else delete arr[idx].ns; if (!arr[idx].id) arr[idx].id = Date.now().toString(36); }
    else { delete arr[idx].n; delete arr[idx].ns; if (arr[idx].c === 'n') arr.splice(idx, 1); }
    setHL(k, arr); refreshZone(z);
  };
  /* ครอปรูป: เก็บเป็นสัดส่วน [x, y, กว้าง, สูง] (0–1) ของรูปเต็ม · ไม่แก้ไฟล์จริง กดไม่ครอปเพื่อกลับเป็นรูปเต็มได้เสมอ */
  function cropImg(fig, cr) {
    const im = fig.querySelector('img'); if (!im) return;
    let box = im.parentNode.classList.contains('crop') ? im.parentNode : null;
    if (!cr) { if (box) { box.replaceWith(im); ['position', 'left', 'top', 'max-width'].forEach(p => im.style.removeProperty(p)); im.style.width = '100%'; } return; }
    if (!box) { box = document.createElement('div'); box.className = 'crop'; im.before(box); box.appendChild(im); }
    const [x, y, w, h] = cr;
    Object.assign(im.style, { position: 'absolute', maxWidth: 'none', width: (100 / w) + '%', height: 'auto', left: (-x / w * 100) + '%', top: (-y / h * 100) + '%' });
    const fit = () => { const nw = im.naturalWidth || +im.getAttribute('width'), nh = im.naturalHeight || +im.getAttribute('height'); if (nw && nh) box.style.aspectRatio = `${nw * w} / ${nh * h}`; };
    fit(); if (!im.complete || !im.naturalWidth) im.addEventListener('load', fit, { once: true });
  }
  function openCrop(src, cr, onSave) {
    const ov = document.createElement('div'); ov.className = 'crop-ov';
    ov.innerHTML = `<div class="crop-dlg"><div class="note-kind">✂️ ครอปรูป · ลากกรอบเพื่อย้าย ลากมุมเพื่อปรับ หรือลากบนรูปเพื่อวาดกรอบใหม่</div><div class="crop-stage"><img alt="" draggable="false"><div class="crop-sel"><i data-h="nw"></i><i data-h="ne"></i><i data-h="sw"></i><i data-h="se"></i></div></div><div class="note-act"><button class="btn small" data-a="full">ไม่ครอป (รูปเต็ม)</button><button class="btn small" data-a="x">Cancel</button><button class="btn small primary" data-a="ok">Save</button></div></div>`;
    document.body.appendChild(ov); hidePop();
    const st = ov.querySelector('.crop-stage'), sel = ov.querySelector('.crop-sel'); st.querySelector('img').src = src;
    let c = cr ? cr.slice() : [.05, .05, .9, .9];
    const draw = () => Object.assign(sel.style, { left: c[0] * 100 + '%', top: c[1] * 100 + '%', width: c[2] * 100 + '%', height: c[3] * 100 + '%' });
    draw();
    const cl = v => Math.max(0, Math.min(1, v)), MIN = .04;
    let drag = null;
    const pt = e => { const r = st.getBoundingClientRect(); return [cl((e.clientX - r.left) / r.width), cl((e.clientY - r.top) / r.height)]; };
    st.addEventListener('pointerdown', e => {
      e.preventDefault(); st.setPointerCapture(e.pointerId);
      const p = pt(e), hd = e.target.dataset.h;
      drag = { p, c0: c.slice(), mode: hd || (e.target === sel ? 'move' : 'new') };
      if (drag.mode === 'new') { c = [p[0], p[1], 0, 0]; drag.c0 = c.slice(); drag.mode = 'se'; }
    });
    st.addEventListener('pointermove', e => {
      if (!drag) return; const p = pt(e), [x0, y0, w0, h0] = drag.c0, dx = p[0] - drag.p[0], dy = p[1] - drag.p[1];
      if (drag.mode === 'move') { c = [cl(Math.min(x0 + dx, 1 - w0)), cl(Math.min(y0 + dy, 1 - h0)), w0, h0]; }
      else {
        let L = x0, T = y0, R = x0 + w0, B = y0 + h0;
        if (drag.mode.includes('w')) L = Math.min(p[0], R - MIN); else R = Math.max(p[0], L + MIN);
        if (drag.mode.includes('n')) T = Math.min(p[1], B - MIN); else B = Math.max(p[1], T + MIN);
        c = [cl(L), cl(T), Math.min(1, R) - cl(L), Math.min(1, B) - cl(T)];
      }
      draw();
    });
    st.addEventListener('pointerup', () => { drag = null; });
    const close = () => ov.remove();
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    ov.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'ok') { const full = c[0] < .005 && c[1] < .005 && c[2] > .99 && c[3] > .99; onSave(full ? null : c.map(v => Math.round(v * 10000) / 10000)); }
      if (a === 'full') onSave(null);
      close();
    });
  }
  function figSize(fig) {
    const h = S.figw[fig.dataset.fk] || {};
    fig.classList.remove('al-l', 'al-r', 'sized'); fig.style.removeProperty('--w');
    if (h.w && h.w !== 100) { fig.classList.add('sized'); fig.style.setProperty('--w', h.w + '%'); }
    if (h.al === 'l' || h.al === 'r') fig.classList.add('sized', 'al-' + h.al);
    cropImg(fig, h.cr);
  }
  function initFigs(art, k) {
    if (!S.figw) S.figw = {};
    art.querySelectorAll('figure.fig').forEach((f, i) => { const im = f.querySelector('img'); f.dataset.fk = k + '|' + (im ? im.getAttribute('src').split('/').pop() : 'fig' + i); f.title = 'แตะเพื่อปรับขนาดรูป'; figSize(f); });
  }
  function hidePop() { pop.hidden = true; pop.dataset.mode = ''; pop.dataset.inNote = ''; pop.classList.remove('writing', 'ai-pop'); }
  function selOffsets(z, r) {
    let s = 0;
    for (const n of zoneNodes(z)) {
      if (n === r.startContainer) { s += r.startOffset; break; }
      if (r.comparePoint(n, 0) < 0) s += n.nodeValue.length; else break;
    }
    return { s, e: s + r.toString().length };
  }
  let selT;
  document.addEventListener('selectionchange', () => {
    clearTimeout(selT);
    selT = setTimeout(() => {
      const sel = getSelection();
      if (pop.dataset.mode === 'note') return;
      if (!sel.rangeCount || sel.isCollapsed) { if (pop.dataset.mode === 'add') hidePop(); return; }
      const r = sel.getRangeAt(0);
      let a = r.commonAncestorContainer; if (a.nodeType !== 1) a = a.parentNode;
      const z = a.closest('[data-hlk]'); if (!z || !view.contains(z)) return;
      const t = r.toString(); if (t.trim().length < 2) return;
      const k = z.dataset.hlk;
      pop.dataset.mode = 'add'; pop.dataset.inNote = z.classList.contains('inote') || k.startsWith('kw:') ? '1' : '';
      popText = t; popZone = k; popRange = r.cloneRange(); popImg = { k, s: selOffsets(z, r).s, t };
      showPalette(r.getBoundingClientRect(), c => {
        const { s } = selOffsets(z, r);
        snap(k); setHL(k, (S.hl[k] || []).concat([{ s, t, c }]));
        sel.removeAllRanges(); refreshZone(z);
      }, () => {
        // ลบไฮไลต์ทุกอันที่ซ้อนกับข้อความที่เลือก
        const { s, e } = selOffsets(z, r);
        const arr = S.hl[k] || [];
        const keep = arr.filter(h => { const hs = hlPos(z, h); return hs < 0 || hs + h.t.length <= s || hs >= e; });
        if (k.startsWith('kw:') && kwUnemph(k, [...z.querySelectorAll('mark.kw-hi')].filter(m => r.intersectsNode(m)).map(m => m.textContent))) {
          if (keep.length !== arr.length) { snap(k); setHL(k, keep); }
          sel.removeAllRanges(); return rerender();
        }
        if (keep.length === arr.length) return;
        snap(k); setHL(k, keep); sel.removeAllRanges(); refreshZone(z);
      }, (() => { const { s } = selOffsets(z, r); return (n, st) => {
        // โน้ตอย่างเดียว = ขีดเส้นใต้ประ ไม่ระบายสี
        if (!n) return; const h = { s, t, c: 'n', n, id: Date.now().toString(36) }; if (st) h.ns = 1;
        snap(k); setHL(k, (S.hl[k] || []).concat([h]));
        getSelection().removeAllRanges(); refreshZone(z);
      }; })());
    }, 250);
  });
  // รูปในเนื้อหา (รูปครอป/SVG ของบท): แตะรูป → ปรับขนาด / ชิดซ้าย-กลาง-ขวา · จำแยกทีละรูปใน S.figw
  view.addEventListener('click', e => {
    const fig = e.target.closest('figure.fig[data-fk]'); if (!fig || e.target.closest('a,mark.user-hl') || !getSelection().isCollapsed) return;
    e.stopPropagation(); const fk = fig.dataset.fk, h = S.figw[fk] || {}, cw = h.w || 100;
    pop.dataset.mode = 'edit'; pop.classList.remove('writing'); pop.hidden = false;
    const W = [30, 45, 60, 80, 100];
    pop.innerHTML = `<div class="row img-tools"><span class="lbl">ขนาดรูป</span><button data-d="-">−</button><b>${cw}%</b><button data-d="+">+</button></div><div class="row img-tools"><button data-a="l" class="${h.al === 'l' ? 'on' : ''}" title="ชิดซ้าย ข้อความไหลรอบ">⇤</button><button data-a="c" class="${!h.al || h.al === 'c' ? 'on' : ''}" title="กึ่งกลาง">↔</button><button data-a="r" class="${h.al === 'r' ? 'on' : ''}" title="ชิดขวา ข้อความไหลรอบ">⇥</button>${fig.querySelector('img') ? `<button data-cr="1" title="ครอปรูป">✂️ ครอป</button>` : ''}<button data-z="1" title="กลับเป็นขนาดเดิม">รีเซ็ต</button></div>`;
    const r = fig.getBoundingClientRect(); pop.style.top = (r.top + scrollY + Math.min(r.height, 120)) + 'px'; pop.style.left = Math.max(8, r.left + scrollX) + 'px';
    const upd = ch => { const n = Object.assign({}, h, ch); if ((n.w || 100) === 100 && (!n.al || n.al === 'c') && !n.cr) delete S.figw[fk]; else S.figw[fk] = n; save(); figSize(fig); hidePop(); };
    pop.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { let i = W.findIndex(x => x >= cw); if (i < 0) i = W.length - 1; i = b.dataset.d === '+' ? Math.min(W.length - 1, W[i] > cw ? i : i + 1) : Math.max(0, W[i] < cw ? i : i - 1); upd({ w: W[i] }); });
    pop.querySelectorAll('[data-a]').forEach(b => b.onclick = () => upd({ al: b.dataset.a, w: b.dataset.a !== 'c' && cw === 100 ? 45 : cw }));
    pop.querySelector('[data-z]').onclick = () => { delete S.figw[fk]; save(); figSize(fig); hidePop(); };
    const cb = pop.querySelector('[data-cr]'); if (cb) cb.onclick = () => openCrop(fig.querySelector('img').src, h.cr, cr => { const n = Object.assign({}, S.figw[fk] || {}); if (cr) n.cr = cr; else delete n.cr; if (Object.keys(n).length) S.figw[fk] = n; else delete S.figw[fk]; save(); figSize(fig); });
  }, true);
  // แตะรูป: ปรับขนาด / ชิดซ้าย-กลาง-ขวา / ลบ
  view.addEventListener('click', e => {
    const fig = e.target.closest('figure.uimg'); if (!fig) return;
    e.stopPropagation(); const k = fig.dataset.k, idx = +fig.dataset.hl, h = (S.hl[k] || [])[idx]; if (!h) return;
    pop.dataset.mode = 'edit'; pop.classList.remove('writing'); pop.hidden = false;
    const W = [30, 45, 60, 80, 100];
    pop.innerHTML = `<div class="row img-tools"><span class="lbl">ขนาด</span><button data-d="-">−</button><b>${h.w || 60}%</b><button data-d="+">+</button></div><div class="row img-tools"><button data-a="l" class="${h.al === 'l' ? 'on' : ''}" title="ชิดซ้าย ข้อความไหลรอบ">⇤</button><button data-a="c" class="${!h.al || h.al === 'c' ? 'on' : ''}" title="กึ่งกลาง">↔</button><button data-a="r" class="${h.al === 'r' ? 'on' : ''}" title="ชิดขวา ข้อความไหลรอบ">⇥</button><button data-cr="1" title="ครอปรูป">✂️ ครอป</button><button data-m="1" title="ย้ายรูปไปต่อจากข้อความอื่น">ย้าย</button><button data-x="1" class="del" title="ลบรูป">ลบรูป</button></div>`;
    const r = fig.getBoundingClientRect(); pop.style.top = (r.top + scrollY + Math.min(r.height, 120)) + 'px'; pop.style.left = Math.max(8, r.left + scrollX) + 'px';
    const upd = ch => { const arr = JSON.parse(JSON.stringify(S.hl[k])); Object.assign(arr[idx], ch); snap(k); setHL(k, arr); refreshZone(zoneEl(k)); hidePop(); };
    pop.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { const cur = h.w || 60; let i = W.findIndex(x => x >= cur); if (i < 0) i = W.length - 1; i = b.dataset.d === '+' ? Math.min(W.length - 1, W[i] > cur ? i : i + 1) : Math.max(0, W[i] < cur ? i : i - 1); upd({ w: W[i] }); });
    pop.querySelectorAll('[data-a]').forEach(b => b.onclick = () => upd({ al: b.dataset.a }));
    pop.querySelector('[data-cr]').onclick = () => { const im = fig.querySelector('img'); if (!im.src) return toast('รูปนี้ยังไม่โหลด'); openCrop(im.src, h.cr, cr => { const arr = JSON.parse(JSON.stringify(S.hl[k])); if (cr) arr[idx].cr = cr; else delete arr[idx].cr; snap(k); setHL(k, arr); refreshZone(zoneEl(k)); }); };
    pop.querySelector('[data-m]').onclick = () => { moveImg = { k, idx }; hidePop(); toast('เลือกข้อความที่จะวางรูป แล้วกดปุ่มรูปในแถบไฮไลต์'); };
    pop.querySelector('[data-x]').onclick = () => { const arr = S.hl[k].slice(); const x = arr[idx]; if (x.c === 'i') arr.splice(idx, 1); else { arr[idx] = Object.assign({}, x); delete arr[idx].img; } snap(k); setHL(k, arr); refreshZone(zoneEl(k)); hidePop(); };
  }, true);
  // หน้า Keyword: แตะคำที่เน้นเหลือง → ✕ เอาการเน้นออก หรือเลือกสีอื่นแทน
  view.addEventListener('click', e => {
    const m = e.target.closest('mark.kw-hi'); const z = m && m.closest('[data-hlk^="kw:"]');
    if (!z || e.target.closest('mark.user-hl') || !getSelection().isCollapsed) return;
    e.stopPropagation();
    const k = z.dataset.hlk, t = m.textContent; pop.dataset.mode = 'edit'; pop.dataset.inNote = '1'; popText = t; popZone = k;
    const r = document.createRange(); r.selectNodeContents(m); const { s } = selOffsets(z, r);
    showPalette(m.getBoundingClientRect(), c => { kwUnemph(k, [t]); snap(k); setHL(k, (S.hl[k] || []).concat([{ s, t, c }])); rerender(); },
      () => { if (kwUnemph(k, [t])) rerender(); });
  }, true);
  // แตะไฮไลต์เดิม: เปลี่ยนสี หรือ ✕ ลบ
  view.addEventListener('click', e => {
    const m = e.target.closest('mark.user-hl'); const z = m && m.closest('[data-hlk]');
    if (!z || !getSelection().isCollapsed) return;
    e.stopPropagation();
    const idx = +m.dataset.hl, k = z.dataset.hlk; pop.dataset.mode = 'edit'; pop.dataset.inNote = z.classList.contains('inote') || k.startsWith('kw:') ? '1' : '';
    popText = (S.hl[k][idx] || {}).t || m.textContent; popZone = k;
    popRange = document.createRange(); popRange.selectNodeContents(m); popImg = { k, idx };
    showPalette(m.getBoundingClientRect(), c => {
      snap(k); const arr = JSON.parse(JSON.stringify(S.hl[k])); arr[idx].c = c; setHL(k, arr); refreshZone(z);
    }, () => {
      snap(k); const arr = S.hl[k].slice(); arr.splice(idx, 1); setHL(k, arr); refreshZone(z);
    }, noteSaver(k, idx, z), (S.hl[k][idx] || {}).n);
  }, true);
  // แตะตัวโน้ต ★ / sticky ที่บันทึกแล้ว → เปิดกล่องแก้ข้อความได้ทันที
  view.addEventListener('click', e => {
    const d = e.target.closest('.inote'); if (!d || e.target.closest('mark.user-hl') || !getSelection().isCollapsed) return;
    const z = d.parentElement && d.parentElement.closest('[data-hlk]'); if (!z) return;
    const k = z.dataset.hlk, idx = +d.dataset.hl, h = (S.hl[k] || [])[idx]; if (!h || !h.n) return;
    e.stopPropagation();
    const r = d.getBoundingClientRect(), w = 320;
    pop.style.top = (r.bottom + scrollY + 8) + 'px'; pop.style.left = Math.max(8, Math.min(r.left + scrollX, document.documentElement.clientWidth - w - 8)) + 'px';
    pop.hidden = false; openNote(noteSaver(k, idx, z), h.n, !!h.ns);
  }, true);
  // ปิดแถบสีเมื่อแตะที่อื่น (การเลื่อนหน้า หรือลากคลุมข้อความในกล่อง Gemini ไม่ปิด)
  document.addEventListener('click', e => {
    if (pop.dataset.dragging === '1') return;
    if (!pop.hidden && (pop.dataset.mode === 'edit' || pop.dataset.mode === 'note') && e.target.isConnected && !pop.contains(e.target) && !e.target.closest('mark.user-hl')) {
      const sel = getSelection();
      if (pop.classList.contains('ai-pop') && sel && !sel.isCollapsed) return;
      hidePop();
    }
  });
  // ปุ่มเลิกทำ (มุมขวาล่าง) ใช้ได้ทั้งเนื้อหาและข้อสอบในหน้านั้น
  document.addEventListener('click', e => {
    if (!e.target.closest('#undoBtn')) return;
    const ks = new Set([...view.querySelectorAll('[data-hlk]')].map(z => z.dataset.hlk));
    let i = undoStack.length - 1; while (i >= 0 && !ks.has(undoStack[i].k)) i--;
    if (i < 0) return; const u = undoStack.splice(i, 1)[0];
    setHL(u.k, u.before); refreshZone(zoneEl(u.k));
  });

  /* ---------- views ---------- */
  /* ---------- Backup: ไฮไลต์ โน้ต keyword รูป อยู่ในเบราว์เซอร์เครื่องเดียว → สำรองเป็นไฟล์ ---------- */
  const b2u = b => new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); });
  const hasData = (o = S) => !!(o && (Object.keys(o.hl || {}).length || (o.kw || []).length || Object.keys(o.lvl || {}).length || Object.keys(o.notes || {}).length || Object.keys(o.wrong || {}).length || Object.keys(o.known || {}).length || Object.keys(o.stats || {}).length || Object.keys(o.srs || {}).length || Object.keys(o.read || {}).length || Object.keys(o.ans || {}).length || o.plan));
  const backupDue = () => !(window.NLE_SYNC && window.NLE_SYNC.getState().user) && hasData() && (!S.lastBackup || Date.now() - S.lastBackup > 7 * 864e5);
  async function vBackup() {
    renderSidebar();
    const nHl = Object.values(S.hl).reduce((a, x) => a + x.length, 0);
    const keys = await IDB.keys().catch(() => []);
    view.innerHTML = `<div class="hero"><h1>💾 Backup</h1><p>ไฮไลต์ โน้ต keyword ดาวประเมิน ข้อที่พลาด และรูปที่แทรก ถูกเก็บไว้ในเบราว์เซอร์เครื่องนี้เท่านั้น ถ้าล้างข้อมูล Safari เปลี่ยนเครื่อง หรือไม่ได้เปิดเว็บนาน ๆ ข้อมูลอาจหายได้ ควรสำรองเป็นไฟล์ไว้สัปดาห์ละครั้ง</p></div>
      <div class="panel"><h3>ข้อมูลในเครื่องนี้</h3><div class="today-chips"><span>ไฮไลต์/โน้ต <b>${nHl}</b></span><span>Keywords <b>${S.kw.length}</b></span><span>ประเมินแล้ว <b>${Object.keys(S.lvl).length}</b></span><span>รูป <b>${keys.length}</b></span></div>
      <p class="muted">สำรองล่าสุด: ${S.lastBackup ? new Date(S.lastBackup).toLocaleString('th-TH') : 'ยังไม่เคย'}</p>
      <div class="choice"><button class="btn primary" id="bkOut">Download backup</button></div></div>
      <div class="panel"><h3>กู้คืนจากไฟล์</h3><p class="muted">ข้อมูลในไฟล์จะ<b>แทนที่</b>ข้อมูลทั้งหมดในเครื่องนี้ (ใช้ตอนย้ายไปเครื่องใหม่ หรือข้อมูลหาย)</p>
      <input type="file" id="bkFile" accept=".json,application/json"> <button class="btn" id="bkIn" disabled>Restore</button><div id="bkMsg" class="muted"></div></div>`;
    $('#bkOut').onclick = async () => {
      const img = {}; for (const k of keys) { const b = await IDB.get(k); if (b) img[k] = await b2u(b); }
      S.lastBackup = Date.now(); save();
      const blob = new Blob([JSON.stringify({ app: 'nannie-compre', v: 1, at: S.lastBackup, S, img })], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `nannie-backup-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); a.remove();
      toast('ดาวน์โหลดไฟล์สำรองแล้ว'); setTimeout(vBackup, 300);
    };
    let data = null;
    $('#bkFile').onchange = async e => {
      data = null; $('#bkIn').disabled = true; const f = e.target.files[0]; if (!f) return;
      try { const d = JSON.parse(await f.text()); if (d.app !== 'nannie-compre' || !d.S) throw 0; data = d;
        $('#bkMsg').textContent = `ไฟล์วันที่ ${new Date(d.at).toLocaleString('th-TH')} · รูป ${Object.keys(d.img || {}).length} รูป · กด Restore เพื่อแทนที่`; $('#bkIn').disabled = false;
      } catch (_) { $('#bkMsg').textContent = 'ไฟล์นี้ไม่ใช่ไฟล์สำรองของเว็บนี้'; }
    };
    $('#bkIn').onclick = async () => {
      const b = $('#bkIn'); if (!data) return;
      if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'กดอีกครั้งเพื่อยืนยันแทนที่'; b.classList.add('primary'); return; }
      for (const [k, u] of Object.entries(data.img || {})) await IDB.put(k, await (await fetch(u)).blob());
      data.S._updatedAt = Date.now(); data.S._dirty = true;
      localStorage.setItem(KEY, JSON.stringify(data.S)); toast('กู้คืนแล้ว กำลังโหลดใหม่'); setTimeout(() => { location.hash = '#/'; location.reload(); }, 600);
    };
  }
  const G_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.8c2.2-2 3.6-5 3.6-8.8z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.8-3c-1.1.7-2.5 1.2-4.2 1.2-3.2 0-5.9-2.2-6.9-5.1H1.2v3.1C3.2 21.3 7.3 24 12 24z"/><path fill="#FBBC05" d="M5.1 14.2c-.2-.7-.4-1.4-.4-2.2s.1-1.5.4-2.2V6.7H1.2C.4 8.3 0 10.1 0 12s.4 3.7 1.2 5.3l3.9-3.1z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C18 1.2 15.2 0 12 0 7.3 0 3.2 2.7 1.2 6.7l3.9 3.1c1-2.9 3.7-5 6.9-5z"/></svg>';
  async function vSync() {
    await loadIndex();
    renderSidebar();
    const st = window.NLE_SYNC ? window.NLE_SYNC.getState() : { configured: false, offline: !navigator.onLine };
    const nHl = Object.values(S.hl).reduce((a, x) => a + x.length, 0);
    const imgKeys = await IDB.keys().catch(() => []);
    const badgeMap = {
      synced: ['ok', `✓ ซิงค์ล่าสุด ${st.lastSyncedAt ? new Date(st.lastSyncedAt).toLocaleString('th-TH') : 'เมื่อสักครู่'}`],
      syncing: ['busy', '↻ กำลังซิงค์ข้อมูล…'],
      connecting: ['busy', '↻ กำลังเชื่อมต่อ…'],
      offline: ['', '📡 ออฟไลน์อยู่ (จะซิงค์ให้อัตโนมัติเมื่อต่อเน็ต)'],
      error: ['err', `⚠️ ${st.error || 'เกิดข้อผิดพลาด'}`]
    };
    const [bCls, bTxt] = badgeMap[st.status] || ['', 'ยังไม่ได้เชื่อมต่อบัญชี'];

    let cloudHtml = '';
    if (st.user) {
      cloudHtml = `<div class="sync-user">${st.user.photoURL ? `<img src="${esc(st.user.photoURL)}" alt="" referrerpolicy="no-referrer">` : ''}<div class="sync-user-meta"><b>${esc(st.user.displayName)}</b><small>${esc(st.user.email)}</small></div></div>
        <div class="sync-badge ${bCls}">${esc(bTxt)}</div>
        <p class="muted">ไฮไลต์ โน้ต คีย์เวิร์ด ดาวประเมิน ข้อที่พลาด Flashcard แผนอ่าน และรูปที่แทรก จะซิงค์ข้ามทุกเครื่องอัตโนมัติทันทีที่แก้ไข</p>
        <div class="choice"><button class="btn primary" id="syNow">↻ Sync ตอนนี้</button><button class="btn" id="syOut">ออกจากระบบ</button></div>`;
    } else if (st.configured) {
      cloudHtml = `${st.error ? `<div class="sync-badge err">⚠️ ${esc(st.error)}</div>` : ''}
        <p>ล็อกอินด้วยบัญชี Google เพื่อเซฟไฮไลต์ โน้ต ดาวประเมิน ข้อที่พลาด Flashcard และรูปที่แทรกไว้บนคลาวด์ เปิดอ่านต่อบน iPad มือถือ หรือคอมเครื่องอื่นได้ทันที</p>
        <p class="muted">ข้อมูลที่มีอยู่ในเครื่องนี้ตอนนี้จะถูกอัปโหลดขึ้นบัญชีให้อัตโนมัติ ไม่หายครับ</p>
        <div class="choice"><button class="g-btn" id="syIn">${G_SVG}<span>เข้าสู่ระบบด้วย Google</span></button></div>`;
    } else {
      cloudHtml = `<div class="sync-badge busy">⚙️ เหลือขั้นตอนตั้งค่า Firebase (ทำครั้งเดียว ฟรี 100%)</div>
        <p>ระบบ Google Login + Cloud Sync พร้อมทำงานแล้ว เหลือแค่นำค่า <code>firebaseConfig</code> จาก Firebase Console มาใส่ในไฟล์ <code>assets/firebase-config.js</code> ตามคู่มือ <code>FIREBASE_SETUP.md</code></p>
        <ol class="pwa-steps">
          <li>สร้างโปรเจกต์ฟรีที่ <b>console.firebase.google.com</b> (แผน Spark ฟรี ไม่ต้องใส่บัตร)</li>
          <li>เปิด <b>Authentication → Google</b> และเพิ่มโดเมน <code>jinjutananny84.github.io</code></li>
          <li>สร้าง <b>Firestore Database</b> แล้วตั้ง Security Rules ให้แต่ละคนเข้าถึงได้เฉพาะ <code>users/{uid}</code></li>
          <li>นำ <code>firebaseConfig</code> มาวางใน <code>assets/firebase-config.js</code> แล้ว push ขึ้น GitHub</li>
        </ol>`;
    }

    let pwaHtml = '';
    if (st.isStandalone) {
      pwaHtml = `<div class="sync-badge ok">✓ กำลังเปิดใช้งานในโหมดแอป (PWA) อยู่แล้ว</div>`;
    } else if (st.canInstall) {
      pwaHtml = `<p>ติดตั้งเว็บนี้เป็นแอปลงหน้าจอโฮม เพื่อเปิดเต็มจอและอ่านได้เร็วขึ้น</p><div class="choice"><button class="btn primary" id="pwaInst">📲 ติดตั้งเป็นแอป (Install App)</button></div>`;
    } else if (st.isIOS) {
      pwaHtml = `<p>ติดตั้งเป็นแอปบน iPad / iPhone ด้วย Safari:</p><ol class="pwa-steps"><li>แตะปุ่ม <b>แชร์ (Share)</b> รูปกล่องมีลูกศรชี้ขึ้น</li><li>เลื่อนลงแล้วเลือก <b>เพิ่มไปยังหน้าจอโฮม (Add to Home Screen)</b></li><li>กด <b>เพิ่ม (Add)</b> — จะได้ไอคอนน้องหมอบนหน้าจอโฮม เปิดเต็มจอได้เลย!</li></ol>`;
    } else {
      pwaHtml = `<p>สามารถติดตั้งเป็นแอปได้จากเมนูเบราว์เซอร์ (Chrome / Edge กดไอคอน <b>Install</b> ที่แถบ URL หรือเมนู <b>⋮ → Install app</b> · Safari บน Mac กด <b>File → Add to Dock</b>)</p>`;
    }

    const gKey = (S.geminiKey || '').trim();
    const gMask = gKey ? `${gKey.slice(0, 6)}••••${gKey.slice(-4)}` : '';
    const curUi = uiStyle();
    view.innerHTML = `<div class="hero"><h1>☁️ Sync &amp; App <small style="font-size:.5em;opacity:.65">v70</small></h1><p>ซิงค์ข้อมูลข้ามเครื่องด้วย Google และติดตั้งเป็นแอปไว้อ่านแบบออฟไลน์</p></div>
      <div class="panel"><h3>🎨 ธีมหน้าตาเว็บ (สลับได้ทันทีตลอดเวลา)</h3>
        <p class="muted">ลองสลับได้ระหว่าง <b>Monument Valley</b> (สถาปัตยกรรมไอโซเมตริก + หอคอยโปรเกรสแถบซ้าย) กับ <b>Pixel Classic</b> (น้องหมอพิกเซล+ภูเขาเมฆ v60) โดยข้อมูลการอ่านไม่หาย</p>
        <div class="style-pick">
          <button type="button" class="btn${curUi === 'monument' ? ' on' : ''}" data-ui-pick="monument">🏛️ Monument Valley</button>
          <button type="button" class="btn${curUi === 'pixel' ? ' on' : ''}" data-ui-pick="pixel">👾 Pixel Classic (แบบเดิม)</button>
        </div>
      </div>
      <div class="panel"><h3>🔐 Google Cloud Sync</h3>${cloudHtml}
        <div class="today-chips" style="margin-top:12px"><span>ไฮไลต์/โน้ต <b>${nHl}</b></span><span>Keywords <b>${S.kw.length}</b></span><span>ประเมินแล้ว <b>${Object.keys(S.lvl).length}</b></span><span>รูป <b>${imgKeys.length}</b></span></div>
      </div>
      <div class="panel"><h3>✨ Gemini AI Search (ตอบในแอป ไม่ต้องสลับหน้า)</h3>
        ${gKey ? `<div class="sync-badge ok">✓ พร้อมใช้งานแล้ว (${esc(gMask)}) · ซิงค์เข้าบัญชี Google ให้อัตโนมัติ</div>` : '<div class="sync-badge">ยังไม่ได้ใส่ Gemini API Key</div>'}
        <p class="muted">ลากคลุมคำแล้วกด <b>🔍</b> หรือค้นหาจากแถบด้านบน → Gemini จะค้นข้อมูล Google แล้วสรุปคำตอบให้ทันทีในหน้าเดิม (ใช้คีย์ฟรีจาก <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio ↗</a> ไม่ต้องผูกบัตร)</p>
        <div class="ai-key-row"><input type="password" id="gKeyIn" placeholder="วาง Gemini API Key (AQ.… หรือ AIzaSy…)" value="${esc(gKey)}" autocomplete="off"><button class="btn small" id="gKeyEye" title="แสดง/ซ่อน">👁</button></div>
        <div class="choice" style="margin-top:8px"><button class="btn primary" id="gKeySave">บันทึก Key</button>${gKey ? '<button class="btn" id="gKeyTest">ทดสอบ</button><button class="btn" id="gKeyDel">ลบ Key</button>' : ''}</div>
        <div id="gKeyMsg" class="muted" style="margin-top:6px;font-size:13.5px"></div>
      </div>
      <div class="panel"><h3>📲 แอป &amp; อ่านแบบออฟไลน์ (PWA)</h3>${pwaHtml}
        <hr style="border:0;border-top:1px solid var(--line);margin:14px 0">
        <p class="muted">ดาวน์โหลดเนื้อหาและข้อสอบทุกบทเก็บไว้ในเครื่อง เพื่อให้เปิดอ่านและทำโจทย์ได้แม้ไม่มีอินเทอร์เน็ต</p>
        <div class="choice"><button class="btn" id="pwaCache">📥 โหลดทุกบทไว้ใช้ออฟไลน์</button><button class="btn" id="pwaReload">🔄 รีเฟรช / อัปเดตแอป</button></div>
        <div class="offline-prog" id="pwaProg" hidden><div class="bar"><i id="pwaBar" style="width:0%"></i></div><small class="muted" id="pwaTxt"></small></div>
      </div>
      <div class="panel"><h3>💾 สำรองข้อมูลเป็นไฟล์ (เผื่อไว้)</h3><p class="muted">ต้องการเก็บไฟล์ <code>.json</code> สำรองไว้ในเครื่องด้วยตนเอง กดไปที่หน้า Backup ได้ตลอด</p><div class="choice"><a class="btn" href="#/backup">เปิดหน้า Backup</a></div></div>`;

    view.querySelectorAll('[data-ui-pick]').forEach(b => b.onclick = () => setUiStyle(b.dataset.uiPick));
    const bIn = $('#syIn'); if (bIn) bIn.onclick = () => window.NLE_SYNC.signInGoogle();
    const bOut = $('#syOut'); if (bOut) bOut.onclick = () => window.NLE_SYNC.signOut();
    const bNow = $('#syNow'); if (bNow) bNow.onclick = () => window.NLE_SYNC.syncNow();
    const gIn = $('#gKeyIn'), gEye = $('#gKeyEye'), gSave = $('#gKeySave'), gTest = $('#gKeyTest'), gDel = $('#gKeyDel'), gMsg = $('#gKeyMsg');
    if (gEye && gIn) gEye.onclick = () => { gIn.type = gIn.type === 'password' ? 'text' : 'password'; };
    if (gSave && gIn) gSave.onclick = () => {
      _gemModel = null;
      const v = gIn.value.trim();
      if (!v) { delete S.geminiKey; save(); toast('ลบ Gemini Key แล้ว'); return vSync(); }
      S.geminiKey = v; save(); toast('บันทึก Gemini Key แล้ว (ซิงค์ข้ามเครื่องอัตโนมัติ)'); vSync();
    };
    if (gDel) gDel.onclick = () => { _gemModel = null; delete S.geminiKey; save(); toast('ลบ Gemini Key แล้ว'); vSync(); };
    if (gTest) gTest.onclick = async () => {
      _gemModel = null;
      gTest.disabled = true; gMsg.textContent = '✨ กำลังทดสอบเชื่อมต่อ Gemini…';
      try { const r = await askGemini('DKA triad คืออะไร สรุป 1 บรรทัด'); gMsg.innerHTML = `<span style="color:var(--ok)">✓ เชื่อมต่อสำเร็จ (${esc(r.model)})!</span> ตัวอย่างคำตอบ: ${esc(r.text.slice(0, 140))}`; }
      catch (e) { gMsg.innerHTML = `<span style="color:var(--bad)">✗ ไม่สำเร็จ: ${esc(e.message)}</span>`; }
      finally { gTest.disabled = false; }
    };
    const bInst = $('#pwaInst'); if (bInst) bInst.onclick = () => window.NLE_SYNC.installPWA();
    const bRel = $('#pwaReload');
    if (bRel) bRel.onclick = async () => {
      bRel.disabled = true; bRel.textContent = 'กำลังอัปเดต…';
      try {
        if ('caches' in window) {
          const ks = await caches.keys();
          await Promise.all(ks.filter(k => k.startsWith('nle-tb-')).map(k => caches.delete(k)));
        }
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r => r.update().catch(() => {})));
        }
      } catch (_) {}
      location.reload();
    };
    const bCache = $('#pwaCache');
    if (bCache) bCache.onclick = async () => {
      bCache.disabled = true; bCache.textContent = 'กำลังโหลดทุกบท…';
      const pr = $('#pwaProg'), bar = $('#pwaBar'), txt = $('#pwaTxt');
      pr.hidden = false;
      try {
        const res = await window.NLE_SYNC.cacheAllOffline((d, tot) => {
          const pct = tot ? Math.round(d * 100 / tot) : 0;
          bar.style.width = pct + '%';
          txt.textContent = `กำลังบันทึกไฟล์ ${d}/${tot} (${pct}%)`;
        });
        bar.style.width = '100%';
        txt.textContent = `✓ บันทึกครบแล้ว ${res.chapters} บท (${res.cached} ไฟล์) พร้อมใช้งานออฟไลน์!`;
        toast('โหลดทุกบทไว้ใช้ออฟไลน์เรียบร้อย');
      } catch (e) {
        txt.textContent = 'โหลดไม่สำเร็จ: ' + e.message;
      } finally {
        bCache.disabled = false; bCache.textContent = '📥 โหลดทุกบทไว้ใช้ออฟไลน์';
      }
    };
  }
  // กลุ่มสีประจำบท: บทสรุป B (เขียว) / คลิปติว (ม่วง)
  const grpCls = c => c.group ? 'g-clip' : 'g-main';
  // วงแหวนความคืบหน้า แบ่งสีตามดาว (conic-gradient)
  function ring(p) {
    let a = 0; const st = [];
    for (const l of LV_ORD) { if (!p.c[l]) continue; const b = a + p.c[l] * 100 / p.n; st.push(`var(--lv${l}) ${a}% ${b}%`); a = b; }
    st.push(`var(--surface2) ${a}% 100%`);
    return `<div class="ring" style="background:conic-gradient(${st.join(',')})" title="ประเมินแล้ว ${p.d}/${p.n} หัวข้อ"><span><b>${p.n ? Math.round(p.d * 100 / p.n) : 0}%</b><small>${p.d}/${p.n}</small></span></div>`;
  }
  // กล่องที่อ่านล่าสุดของบท (จาก S.lastByCh หรือย้อนหาจากบันทึกการอ่าน)
  function lastOf(id) {
    const h = (S.lastByCh || {})[id]; if (h) return h;
    const days = Object.keys(S.read || {}).map(Number).sort((a, b) => b - a);
    for (const d of days) { const k = Object.keys(S.read[d]).filter(x => x.startsWith(id + '/')).pop(); if (k) return '#/' + k; }
    return null;
  }
  function weakestBox() {
    let best = null;
    for (const ch of loadedCH()) for (const s of ch.sections) {
      let r = 0, n = 0;
      for (const qid of s.examIds || []) { const st = S.stats[`${ch.id}|${qid}`]; if (st) { r += st.r; n += st.r + st.w; } }
      if (n < 2) continue; const p = Math.round(r * 100 / n);
      if (p < 70 && (!best || p < best.p)) best = { ch, s, p };
    }
    return best;
  }
  // ---------- แผนอ่านถึงวันสอบ (S.plan = { date:'YYYY-MM-DD', buf: วันเผื่อทวน, chs:[id] }) ----------
  const dayOf = iso => { const [y, m, d] = iso.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 864e5); };
  function everRead() { const r = new Set(); for (const d in S.read || {}) for (const k in S.read[d]) if (S.read[d][k] >= 60) r.add(k); return r; }
  function planInfo() {
    const P = S.plan; if (!P || !P.date) return null;
    const left = dayOf(P.date) - today();
    const chs = (P.chs && P.chs.length ? P.chs : INDEX.filter(c => c.ready).map(c => c.id)).filter(id => CH[id]);
    const seen = everRead(), day = (S.read || {})[today()] || {};
    const rest = [];   // กล่องที่ยังไม่อ่าน (ไม่นับที่อ่านวันนี้ เพื่อให้เป้าวันนี้ไม่ขยับระหว่างวัน)
    let total = 0;
    for (const id of chs) for (const s of CH[id].sections) { total++; const k = `${id}/${s.no}`; if ((!seen.has(k) && !lvOf(id, s.no)) || (day[k] >= 60)) rest.push({ id, s, k, doneToday: day[k] >= 60 }); }
    const studyDays = Math.max(1, left - (P.buf || 0));
    const target = Math.ceil(rest.length / studyDays);
    const doneToday = rest.filter(x => x.doneToday).length;
    const todo = rest.filter(x => !x.doneToday).slice(0, Math.max(0, target - doneToday));
    return { left, studyDays, target, doneToday, todo, remaining: rest.length - doneToday, total, buf: P.buf || 0, date: P.date, chs };
  }
  function planHTML() {
    const pi = planInfo();
    const chList = INDEX.filter(c => c.ready);
    const sel = new Set((S.plan && S.plan.chs && S.plan.chs.length) ? S.plan.chs : chList.map(c => c.id));
    const form = `<details class="plan-set"${pi ? '' : ' open'}><summary>${pi ? '⚙️ ตั้งค่าแผน' : '🗓️ ตั้งวันสอบเพื่อให้เว็บแบ่งกล่องอ่านต่อวัน'}</summary>
      <div class="plan-form"><label>วันสอบ <input type="date" id="plDate" value="${S.plan && S.plan.date || ''}"></label>
      <label>เผื่อวันทวนก่อนสอบ <input type="number" id="plBuf" min="0" max="60" value="${S.plan && S.plan.buf != null ? S.plan.buf : 7}"> วัน</label>
      <div class="sel-bar"><small class="bar-label">บทที่รวมในแผน</small>${selActs('plChs')}</div>
      <div class="plan-chs" id="plChs">${chList.map(c => `<label class="${grpCls(c)}"><input type="checkbox" value="${c.id}"${sel.has(c.id) ? ' checked' : ''}>${esc(c.title.split(' · ')[0])}</label>`).join('')}</div>
      <div class="plan-btns"><button class="btn small primary" id="plSave">บันทึกแผน</button>${pi ? '<button class="btn small" id="plClear">ลบแผน</button>' : ''}</div></div></details>`;
    if (!pi) return `<div class="plan empty-plan">${form}</div>`;
    if (pi.left < 0) return `<div class="plan">${form.replace('<details class="plan-set"', '<details class="plan-set" open')}<p class="bar-label">วันสอบที่ตั้งไว้ผ่านไปแล้ว ตั้งวันใหม่ได้เลย</p></div>`;
    const pct = pi.target ? Math.min(100, Math.round(pi.doneToday * 100 / pi.target)) : 100;
    const readAll = pi.total - pi.remaining;
    const inReview = pi.left <= pi.buf;
    const goal = inReview ? `<b>ช่วงทวนก่อนสอบ</b> เน้น Review, กองข้อผิด และกล่องที่อ่อน` : pi.remaining <= 0 ? '<b>อ่านครบทุกกล่องแล้ว</b> ใช้เวลาที่เหลือทวนได้เลย' : `<b>เป้าวันนี้ ${pi.target} กล่อง</b> · อ่านแล้ว ${pi.doneToday}${pi.doneToday >= pi.target ? ' ✓ ครบเป้า' : ''}`;
    const list = !inReview && pi.todo.length ? `<div class="plan-list">${pi.todo.slice(0, 8).map(x => `<a class="${grpCls(INDEX.find(c => c.id === x.id) || {})}" href="#/${x.id}/${x.s.no}"><b>${esc(chTitle(x.id))} ${x.s.no}</b> ${esc(x.s.title)}</a>`).join('')}${pi.todo.length > 8 ? `<span class="more">+ อีก ${pi.todo.length - 8} กล่อง</span>` : ''}</div>` : '';
    return `<div class="plan"><div class="plan-top"><div class="cd"><b>${pi.left}</b><small>วันก่อนสอบ</small></div>
      <div class="plan-body"><div class="plan-goal">${goal}</div><div class="plan-bar"><i style="width:${pct}%"></i></div>
      <small class="bar-label">อ่านแล้วทั้งหมด ${readAll}/${pi.total} กล่อง · เหลือ ${pi.remaining} กล่อง ใน ${pi.studyDays} วันอ่าน${pi.buf ? ` + ${pi.buf} วันทวน` : ''}</small></div></div>${list}${form}</div>`;
  }
  function bindPlan() {
    bindSelActs(view);
    const sv = $('#plSave'); if (!sv) return;
    sv.onclick = () => {
      const date = $('#plDate').value; if (!date) { toast('เลือกวันสอบก่อนนะ'); return; }
      const chs = [...view.querySelectorAll('.plan-chs input:checked')].map(x => x.value);
      if (!chs.length) { toast('เลือกอย่างน้อย 1 บท'); return; }
      S.plan = { date, buf: Math.max(0, parseInt($('#plBuf').value) || 0), chs }; save(); rerender(); toast('บันทึกแผนแล้ว');
    };
    const cl = $('#plClear'); if (cl) cl.onclick = () => { delete S.plan; save(); rerender(); };
  }
  async function vHome() {
    await loadAll();
    renderSidebar();
    const tile = c => {
      const ch = CH[c.id];
      if (!c.ready) return `<div class="tile soon ${grpCls(c)}"><h3>${esc(c.title)}</h3><p>${esc(c.desc || 'เร็ว ๆ นี้')}</p></div>`;
      const p = chProgress(ch);
      const rt = readToday(c.id);
      const lh = lastOf(c.id); const lm = lh && lh.match(/\/(\d+)$/);
      const todayLine = `<div class="today-line"><b>Today</b> ${rt.done} boxes read · ${Math.round(rt.done * 100 / p.n)}% of chapter${rt.seen > rt.done ? ` · ${rt.seen - rt.done} in progress` : ''}<i style="width:${Math.round(rt.done * 100 / p.n)}%"></i></div>`;
      return `<div class="tile ${grpCls(c)}${rt.done ? ' read-today' : ''}">
        <a class="tile-main" href="#/${c.id}">${ring(p)}<div class="tile-txt"><h3>${esc(c.title)}</h3><p>${esc(c.desc || '')}</p></div></a>
        <div class="tile-acts"><a class="btn small primary" href="${lh || '#/' + c.id + '/' + (ch.sections[0] ? ch.sections[0].no : 1)}">${lm ? `📖 อ่านต่อ กล่อง ${lm[1]}` : '📖 เริ่มอ่าน'}</a><a class="btn small" href="#/quiz?ch=${c.id}">📝 Quiz</a>${rt.done ? `<span class="tile-today">วันนี้ ${rt.done} กล่อง</span>` : ''}</div>
        <details class="tile-more"><summary>สถิติ</summary>${todayLine}${lvBar(p, true)}<div class="bar-label">ประเมินแล้ว ${p.d}/${p.n} หัวข้อ · มั่นใจ ${p.c[4]} หัวข้อ · ข้อสอบ ${Object.keys(ch.exams).length} ข้อ</div>${lvLegend(p)}</details></div>`;
    };
    // บทหลักก่อน แล้วตามด้วยกลุ่มพิเศษ (chapters.json → group) เช่น คลิปติวอาจารย์
    const groups = [...new Set(INDEX.map(c => c.group || ''))];
    const tiles = groups.map(g => {
      const list = INDEX.filter(c => (c.group || '') === g);
      if (uiStyle() === 'monument') return mvCastleGroupHTML(g || '📘 สรุปบท A3', list, !!g);
      return `<h2 class="grid-h ${g ? 'g-clip' : 'g-main'}">${esc(g || '📘 สรุปบท A3')}</h2><div class="grid">${list.map(tile).join('')}</div>`;
    }).join('');
    const lr = S.lastRead && S.lastRead.h.match(/^#\/([^/]+)\/(\d+)$/);
    const lrSec = lr && CH[lr[1]] && CH[lr[1]].sections.find(x => x.no === +lr[2]);
    const rtAll = readToday(); const rvDone = S.revDone && S.revDone.d === today() ? S.revDone.n : 0;
    const due = dueItems().length, nWrong = Object.keys(S.wrong).length, wk = weakestBox();
    const act = (href, ic, t, sub, cls = '', id = '') => `<a class="dash-act ${cls}" href="${href}"${id ? ` id="${id}"` : ''}><span class="da-ic">${ic}</span><span class="da-t"><b>${t}</b><small>${sub}</small></span></a>`;
    const acts = [
      lrSec ? act(S.lastRead.h, '📖', 'อ่านต่อ', `${esc(chTitle(lr[1]))} · กล่อง ${lrSec.no}. ${esc(lrSec.title)}`, 'main', 'resumeBtn') : act('#/' + (INDEX.find(c => c.ready) || {}).id, '📖', 'เริ่มอ่าน', 'เลือกบทด้านล่างได้เลย', 'main'),
      due ? act('#/review', '📅', `ทวนวันนี้ ${due} รายการ`, 'กล่องและ keyword ที่ถึงรอบทวน', 'due') : act('#/review', '📅', 'ทวนครบแล้ว', rvDone ? `วันนี้ทวนไป ${rvDone} รายการ` : 'ไม่มีรายการถึงกำหนดวันนี้', 'done'),
      wk ? act(`#/${wk.ch.id}/${wk.s.no}`, '🎯', `กล่องที่อ่อนสุด ${wk.p}%`, `${esc(chTitle(wk.ch.id))} · ${wk.s.no}. ${esc(wk.s.title)}`, 'weak') : act('#/quiz', '📝', 'ทำ Quiz 10 ข้อ', 'เพื่อให้เว็บหาจุดอ่อนให้', ''),
      nWrong ? act('#/wrong', '📕', `ข้อผิด ${nWrong} ข้อ`, 'ทำซ้ำให้ถูกเพื่อเคลียร์กอง', 'wrong') : ''
    ].join('');
    const chips = `<div class="today-chips"><span>📖 อ่านวันนี้ <b>${rtAll.done}</b> กล่อง</span><span>📅 ทวนแล้ว <b>${rvDone}</b></span><span>🔥 ต่อเนื่อง <b>${streak()}</b> วัน</span></div>`;
    const bkWarn = backupDue() ? `<a class="bk-warn" href="#/backup">💾 ${S.lastBackup ? 'ไม่ได้สำรองข้อมูลมาเกิน 7 วัน' : 'ยังไม่เคยสำรองไฮไลต์และโน้ต'} · กดเพื่อ Backup</a>` : '';
    const heroHtml = uiStyle() === 'monument' ? mvGrandCitadelHTML(bkWarn) : `<div class="hero home-hero"><h1>nannie compre website</h1>${bkWarn}</div>`;
    view.innerHTML = `${heroHtml}
    <section class="dash"><div class="dash-h"><h2>วันนี้ควรทำอะไร</h2>${chips}</div>${planHTML()}<div class="dash-grid">${acts}</div></section>
    <p class="split-hint">เลขหัวข้อในเว็บตรงกับเลขกล่องในชีท A3 เปิดคู่กันแบบ split view แล้วพิมพ์เลขกล่องที่ปุ่มมุมขวาล่างเพื่อกระโดดไปได้ทันที</p>${tiles}
    <details class="panel legend-panel"><summary>สัญลักษณ์ในเนื้อหา</summary><div class="card think" style="margin:8px 0"><div class="lbl">🤔 หยุดคิดก่อน</div>คำถามสั้นให้ลองตอบในใจก่อนกดดูเฉลย</div><div class="card trap" style="margin:8px 0"><div class="lbl">⚠️ กับดักข้อสอบ</div>จุดที่ข้อสอบชอบหลอก</div><div class="card note" style="margin:8px 0"><div class="lbl">📌 อาจารย์เน้น</div>สิ่งที่อาจารย์ติวย้ำ</div><div class="card hint" style="margin:8px 0"><div class="lbl">🎯 อาจารย์บอกข้อสอบ</div>ข้อที่อาจารย์ผู้ออกข้อสอบยกมาหรือบอกว่าออก กด ▶ เวลา เพื่อเปิดคลิปตรงจุดนั้น</div><p style="margin:8px 0 0"><span class="tag e">ออกสอบ</span> <span class="tag s">เสริม</span> นอกคลิป <span class="tag x">ข้ามบท</span></p><div class="content legend-row"><span><b>คำสำคัญ</b> ไฮไลต์เหลือง</span><span class="hl-exam" style="display:inline-block;background:var(--hl-exam);border-left:3px solid var(--exam);padding:0 8px">ประโยคที่เคยออกสอบ</span><span><mark class="user-hl c-y">ไฮไลต์</mark> <mark class="user-hl c-g">ของ</mark> <mark class="user-hl c-b">ฉัน</mark> <mark class="user-hl c-p">มี</mark> <mark class="user-hl c-v">6</mark> <mark class="user-hl c-r">สี</mark> เลือกข้อความเอง</span></div><p class="bar-label">ปิดไฮไลต์อัตโนมัติได้ที่เมนูด้านข้าง</p></details>`;
    bindPlan();
  }
  async function vChapter(id) {
    await loadIndex(); const ch = await loadChapter(id); if (!ch) return vHome();
    renderSidebar(id);
    const p = chProgress(ch);
    let h = `<div class="crumb"><a href="#/">หน้าแรก</a></div><div class="hero mv-ch-hero">${uiStyle() === 'monument' ? mvSideCardBG(id) : ''}<h1>${esc(ch.title)}</h1><p>${esc(ch.source || '')}</p></div>
      ${lvBar(p, true)}<div class="bar-label">ประเมินแล้ว ${p.d}/${p.n} หัวข้อ · มั่นใจ ${p.c[4]} หัวข้อ</div>${lvLegend(p)}
      <div class="choice" style="margin-top:14px"><a class="btn primary" href="#/quiz?ch=${id}">📝 Quiz this chapter</a><a class="btn" href="#/cards?ch=${id}">🃏 Flashcards</a><a class="btn" href="#/map/${id}">🗺️ Chapter map</a><a class="btn" href="#/db?view=table&ch=${id}">💊 Drug table</a><a class="btn" href="#/flows?ch=${id}">🩺 Flowchart</a></div>`;
    for (const pg of ch.pages) {
      h += `<h2 style="margin-top:22px">หน้า ${pg.no} · ${esc(pg.title)}</h2><ul class="sec-list">`;
      for (const s of ch.sections.filter(x => x.page === pg.no)) {
        const l = lvOf(id, s.no);
        h += `<li><a class="${l ? 'lv' + l : ''}" href="#/${id}/${s.no}"><span class="n">${s.no}</span><span class="t">${esc(s.title)} ${boxScore(id, s)} ${l ? `<span class="ck">${LV[l].s}</span>` : ''}</span><span class="f">${s.freq ? 'ออก ' + esc(s.freq) + ' ' + stars(s.stars) : ''}${s.examIds.length ? ' · ' + s.examIds.length + ' ข้อ' : ''}</span></a></li>`;
      }
      h += '</ul>';
    }
    view.innerHTML = h;
  }
  async function vSection(id, no) {
    await loadIndex(); const ch = await loadChapter(id); if (!ch) return vHome();
    const idx = ch.sections.findIndex(s => s.no === no);
    if (idx < 0) return vChapter(id);
    const s = ch.sections[idx], prev = ch.sections[idx - 1], next = ch.sections[idx + 1];
    renderSidebar(id, no);
    const k = secKey(id, s.no);
    const pg = ch.pages.find(p => p.no === s.page);
    let h = `<div class="crumb"><a href="#/${id}">${esc(ch.title)}</a> · หน้า ${s.page}${pg ? ' ' + esc(pg.title) : ''}</div>
      <div class="sec-head"><div class="sec-no">${s.no}</div><div><h1>${esc(s.title)}</h1><div class="meta">${freqBadge(s)}${s.examIds.length ? `<span class="badge">${s.examIds.length} past Qs</span>` : ''}</div></div></div>
      <article class="content" data-hlk="${secKey(id, s.no)}">${s.lead ? `<p><b>${inline(esc(s.lead))}</b></p>` : ''}${s.html}</article>`;
    if (s.kw.length) h += `<div class="kws">${s.kw.map(x => `<span class="kw">${esc(x)}</span>`).join('')}</div>`;
    const myHl = (S.hl[k] || []).length;
    h += `<details class="panel mynote" ${S.notes[k] ? 'open' : ''}><summary>🗒️ My notes${S.notes[k] ? ' ·  มีโน้ต' : ''}<span id="myHlCount" data-k="${k}">${myHl ? ` · ไฮไลต์ ${myHl} จุด` : ''}</span></summary>
      <textarea id="noteIn" rows="4" placeholder="จดสิ่งที่อยากจำของกล่องนี้ (บันทึกอัตโนมัติ)">${esc(S.notes[k] || '')}</textarea>
      <div class="bar-label">เลือกข้อความในเนื้อหาหรือข้อสอบแล้วกดเลือกสี เปลี่ยนสีตัวอักษร (A) เขียนโน้ต ★ หรือ sticky note 🗒️ ต่อจากข้อความนั้น ตัวหนา (B) ขีดเส้นใต้ (U) และไฮไลต์ข้อความในโน้ตได้ด้วย (เหลือง เขียว ฟ้า ชมพู แดงอ่อน) · แตะโน้ตที่บันทึกแล้วเพื่อแก้ · แตะรูปเพื่อปรับขนาดหรือครอป · แตะไฮไลต์ซ้ำเพื่อลบ · ปุ่ม ↶ มุมขวาล่างใช้เลิกทำ · <a href="#/notes">ดูโน้ตทั้งหมด</a></div></details>`;
    if (s.examIds.length) {
      const doneCnt = s.examIds.filter(qid => S.ans[`${id}|${qid}`]).length;
      h += mvExamBreakHTML(id, s.examIds.length);
      h += `<section class="exam-sec"><div class="exam-sec-h"><h2>📝 Past exam questions</h2><button class="btn small" id="redoBoxExams"${doneCnt ? '' : ' hidden'}>↺ ล้างคำตอบกล่องนี้</button></div><p class="bar-label">กดเลือกคำตอบแล้วระบบจะจำคำตอบไว้ให้อัตโนมัติ (ข้อที่ตอบผิดเข้ากองข้อผิดด้วย · กด ↺ ทำใหม่ ได้ทุกเมื่อ)</p>`;
      for (const qid of s.examIds) h += mcqHTML(id, qid, ch.exams[qid], { showSaved: true });
      h += '</section>';
    }
    h += `<div class="lvpick"><div class="lvq">How well do you understand this box? (tap again to clear)</div>${LV_ORD.map(l => `<button class="lvbtn lv${l}${S.lvl[k] === l ? ' on' : ''}" data-lv="${l}"><span class="st">${LV[l].s}</span><span>${LV[l].t}</span></button>`).join('')}</div>
      <nav class="pager">${prev ? `<a href="#/${id}/${prev.no}"><small>← ก่อนหน้า</small>${prev.no}. ${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a class="next" href="#/${id}/${next.no}"><small>ถัดไป →</small>${next.no}. ${esc(next.title)}</a>` : ''}</nav>
      <div class="jump"><a href="${prev ? `#/${id}/${prev.no}` : '#/' + id}" aria-label="ก่อนหน้า">‹</a><button id="undoBtn" hidden title="เลิกทำไฮไลต์ล่าสุด" aria-label="เลิกทำ">↶</button><button id="focusBtn" title="โหมดอ่าน: ซ่อนเมนูข้าง" aria-label="โหมดอ่าน">${S.focus ? '⤡' : '⤢'}</button><input id="jumpIn" inputmode="numeric" placeholder="${s.no}" aria-label="ไปกล่อง"><a href="${next ? `#/${id}/${next.no}` : '#/' + id}" aria-label="ถัดไป">›</a></div>`;
    view.innerHTML = h;
    view.querySelectorAll('.lvbtn').forEach(b => b.onclick = () => { const l = +b.dataset.lv; if (S.lvl[k] === l) delete S.lvl[k]; else S.lvl[k] = l; save(); rerender(); });
    pop.hidden = true; pop.dataset.mode = '';
    expandAbbr($('article.content', view), ch.abbr);
    initFigs($('article.content', view), k);
    buildToc(); setTimeout(trackRead, 300); coverTools(view); flowHints(view);
    if (s.examIds.length) initExamBreakGame(id, s.examIds.length);
    $('#focusBtn').onclick = () => { S.focus = !S.focus; save(); document.body.classList.toggle('focus', !!S.focus); $('#focusBtn').textContent = S.focus ? '⤡' : '⤢'; };
    applyAllHL(view);
    let tmr; $('#noteIn').addEventListener('input', e => { clearTimeout(tmr); tmr = setTimeout(() => { const v = e.target.value.trim(); if (v) S.notes[k] = v; else delete S.notes[k]; save(); }, 400); });
    const ji = $('#jumpIn');
    ji.addEventListener('keydown', e => { if (e.key === 'Enter') { const n = parseInt(ji.value); if (n) location.hash = `#/${id}/${n}`; } });
    window.scrollTo(0, 0);
    if (kwFlash) {
      // keyword ในข้อสอบ: เปิดเฉลยไม่ได้ แต่โจทย์/ตัวเลือกยังหาเจอ
      setTimeout(flashKw, 60);
    }
  }

  // สารบัญย่อในกล่อง: ชิปหัวข้อย่อย กดแล้วเลื่อนไปทันที และไฮไลต์หัวข้อที่กำลังอ่าน
  function buildToc() {
    const art = $('article.content', view); if (!art) return;
    const hs = [...art.querySelectorAll('h2,h3')];
    const head = $('.sec-head', view);
    if (hs.length < 3 || !head) return;
    const nav = document.createElement('nav'); nav.className = 'toc';
    nav.innerHTML = hs.map((h, i) => `<button data-i="${i}" class="${h.tagName === 'H3' ? 'sub' : ''}">${esc(h.textContent.replace(/\s+/g, ' ').trim())}</button>`).join('')
      + (S.focus === undefined ? '' : '') + ($('.exam-sec', view) ? '<button data-ex="1" class="ex">📝 Exam</button>' : '');
    head.after(nav);
    nav.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const t = b.dataset.ex ? $('.exam-sec', view) : hs[+b.dataset.i];
      scrollTo({ top: t.getBoundingClientRect().top + scrollY - 70, behavior: 'smooth' });
    });
    tocHs = hs; tocNav = nav;
  }
  let tocHs = [], tocNav = null;
  // แถบความคืบหน้าการอ่านใต้แถบบน (ฉากท้องฟ้า + สนามหญ้า + น้องหมอวิ่งตามตำแหน่งที่อ่าน)
  const rwrap = document.createElement('div'); rwrap.className = 'readbar-wrap'; rwrap.hidden = true;
  const rbar = document.createElement('div'); rbar.className = 'readbar'; rwrap.appendChild(rbar);
  document.body.appendChild(rwrap);
  const topbarEl = document.querySelector('.topbar');
  function syncReadbar() {
    const onSec = /^#\/[^/]+\/\d+$/.test(location.hash);
    rwrap.hidden = !onSec;
    document.body.classList.toggle('has-readbar', onSec);
    if (!onSec) { rbar.style.width = '0%'; return; }
    if (topbarEl) rwrap.style.top = topbarEl.offsetHeight + 'px';
    const h = document.documentElement.scrollHeight - innerHeight;
    const pct = h > 0 ? Math.min(100, Math.max(0, scrollY * 100 / h)) : 0;
    rbar.style.width = Math.max(2, pct) + '%';
  }
  addEventListener('resize', syncReadbar, { passive: true });
  addEventListener('hashchange', () => setTimeout(syncReadbar, 40));
  addEventListener('scroll', () => {
    syncReadbar();
    const onSec = /^#\/[^/]+\/\d+$/.test(location.hash);
    if (onSec) trackRead();
    if (onSec && tocNav && document.contains(tocNav)) {
      let cur = -1; tocHs.forEach((x, i) => { if (x.getBoundingClientRect().top < 120) cur = i; });
      tocNav.querySelectorAll('button[data-i]').forEach(b => b.classList.toggle('on', +b.dataset.i === cur));
    }
  }, { passive: true });
  setTimeout(syncReadbar, 80);

  /* quiz */
  function pool(chIds, filter) {
    const items = [];
    for (const c of chIds) { const ch = CH[c]; if (!ch) continue; for (const qid of Object.keys(ch.exams)) { const q = ch.exams[qid]; if (filter && !filter(c, qid, q)) continue; items.push({ ch: c, id: qid }); } }
    return items;
  }
  async function vQuiz(params) {
    await loadAll(); renderSidebar(params.get('ch'));
    const ready = INDEX.filter(c => c.ready);
    const pre = params.get('ch');
    view.innerHTML = `<div class="hero"><h1>📝 Quiz</h1><p>เลือกบทแล้วสุ่มข้อ ข้อที่ผิดจะเก็บเข้ากองข้อผิด</p></div>
    <div class="panel"><div class="sel-bar"><h3>บท</h3>${selActs('qCh')}</div><div class="choice" id="qCh">${ready.map(c => `<label><input type="checkbox" value="${c.id}" ${!pre || pre === c.id ? 'checked' : ''}>${esc(c.title)}</label>`).join('')}</div>
    <h3>ขอบเขต</h3><div class="choice" id="qScope"><label><input type="radio" name="sc" value="all" checked>ทุกหัวข้อ</label><label><input type="radio" name="sc" value="weak">เฉพาะหัวข้อที่ยังไม่แม่น (★–★★)</label><label><input type="radio" name="sc" value="mem">เฉพาะสีชมพู (ใช้ความจำเยอะ)</label><label><input type="radio" name="sc" value="done">เฉพาะหัวข้อที่ประเมินแล้ว</label><label><input type="radio" name="sc" value="hot">เฉพาะหัวข้อออกบ่อย (★★★)</label><label><input type="radio" name="sc" value="new">ข้อที่ยังไม่เคยทำ</label></div>
    <h3>จำนวนข้อ</h3><div class="choice" id="qN">${[10, 20, 40].map((n, i) => `<label><input type="radio" name="qn" value="${n}" ${i === 0 ? 'checked' : ''}>${n} ข้อ</label>`).join('')}<label><input type="radio" name="qn" value="999">ทั้งหมด</label></div>
    <button class="btn primary" id="qGo">Start</button> <span class="bar-label" id="qInfo"></span></div>`;
    const go = () => {
      const chs = [...view.querySelectorAll('#qCh input:checked')].map(x => x.value);
      const sc = view.querySelector('#qScope input:checked').value;
      const n = +view.querySelector('#qN input:checked').value;
      const f = (c, qid, q) => {
        if (sc === 'done') return !!lvOf(c, q.box);
        if (sc === 'weak') { const l = lvOf(c, q.box); return l === 1 || l === 2; }
        if (sc === 'mem') return lvOf(c, q.box) === 5;
        if (sc === 'hot') { const s = CH[c].sections.find(x => x.no === +q.box); return s && s.stars >= 3; }
        if (sc === 'new') return !S.stats[`${c}|${qid}`];
        return true;
      };
      return { items: shuffle(pool(chs, f)).slice(0, n) };
    };
    const info = () => { const r = go(); $('#qInfo').textContent = `จะได้ ${r.items.length} ข้อ`; };
    view.querySelectorAll('input').forEach(x => x.addEventListener('change', info));
    bindSelActs(view, info); info();
    $('#qGo').onclick = () => { const r = go(); if (!r.items.length) { $('#qInfo').textContent = 'ไม่มีข้อในขอบเขตนี้'; return; } runQuiz(r.items, 'ผลการทำข้อสอบ'); };
  }
  function runQuiz(items, title) {
    let i = 0, score = 0;
    const step = () => {
      if (i >= items.length) {
        view.innerHTML = `<div class="hero"><h1>${title}</h1><p>ได้ ${score} จาก ${items.length} ข้อ (${Math.round(score * 100 / items.length)}%)</p></div><div class="choice"><a class="btn primary" href="#/wrong">📕 Go to Mistakes</a><a class="btn" href="#/quiz">New set</a></div>`;
        return;
      }
      const it = items[i], q = CH[it.ch].exams[it.id];
      view.innerHTML = `<div class="qhead"><span>ข้อ ${i + 1} / ${items.length}</span><span>ถูก ${score}</span></div><div class="bar walk"><i style="width:${Math.round(i * 100 / items.length)}%"></i></div>${mcqHTML(it.ch, it.id, q, { showBox: true })}<div class="choice" style="justify-content:flex-end"><button class="btn" id="skip">Skip</button></div>`;
      const box = $(".mcq", view); applyAllHL(view);
      box._onDone = ok => { if (ok) score++; $('#skip').textContent = i + 1 < items.length ? 'Next →' : 'See result'; $('#skip').classList.add('primary'); };
      $('#skip').onclick = () => { i++; step(); window.scrollTo(0, 0); };
    };
    step();
  }
  async function vWrong() {
    await loadAll(); renderSidebar();
    const list = Object.values(S.wrong).filter(w => CH[w.ch] && CH[w.ch].exams[w.id]).sort((a, b) => b.t - a.t);
    let h = `<div class="hero"><h1>📕 Mistakes</h1><p>ตอบถูกเมื่อไหร่ ข้อนั้นจะออกจากกองเอง</p></div>`;
    if (!list.length) { view.innerHTML = h + '<p class="empty">ยังไม่มีข้อผิด ลองทำข้อสอบท้ายหัวข้อหรือโหมดทำข้อสอบดูนะ</p>'; return; }
    h += `<div class="choice"><button class="btn primary" id="wGo">Review all (${list.length})</button><button class="btn" id="wClear">Clear</button></div>`;
    h += list.map(w => { const q = CH[w.ch].exams[w.id]; return `<a class="search-hit" href="#/${w.ch}/${q.box}"><b>${esc(w.id)}</b> · ${esc(CH[w.ch].title)} กล่อง ${q.box} · ผิด ${w.n} ครั้ง<small>${esc(q.stem)}</small></a>`; }).join('');
    view.innerHTML = h; applyAllHL(view);
    $('#wGo').onclick = () => runQuiz(shuffle(list.map(w => ({ ch: w.ch, id: w.id }))), 'ทวนกองข้อผิด');
    $('#wClear').onclick = () => { if (confirm('ล้างกองข้อผิดทั้งหมด?')) { S.wrong = {}; save(); vWrong(); } };
  }
  async function vCards(params) {
    await loadAll(); renderSidebar(params.get('ch'));
    const pre = params.get('ch');
    const ready = INDEX.filter(c => c.ready);
    view.innerHTML = `<div class="hero"><h1>🃏 Flashcards</h1><p>ทำจาก keyword ท้ายกล่อง แตะการ์ดเพื่อพลิก</p></div>
      <div class="panel"><div class="sel-bar"><h3>บท</h3>${selActs('fCh')}</div><div class="choice" id="fCh">${ready.map(c => `<label><input type="checkbox" value="${c.id}" ${!pre || pre === c.id ? 'checked' : ''}>${esc(c.title)}</label>`).join('')}</div>
      <div class="choice" id="fSc"><label><input type="radio" name="fs" value="todo" checked>เฉพาะที่ยังจำไม่ได้</label><label><input type="radio" name="fs" value="all">ทั้งหมด</label></div>
      <button class="btn primary" id="fGo">Start</button> <span class="bar-label" id="fInfo"></span></div><div id="fArea"></div>`;
    const build = () => {
      const chs = [...view.querySelectorAll('#fCh input:checked')].map(x => x.value);
      const todo = view.querySelector('#fSc input:checked').value === 'todo';
      const cards = [];
      for (const c of chs) for (const s of CH[c].sections) s.cards.forEach((cd, j) => { const key = `${c}/${s.no}/${j}`; if (!todo || !S.known[key]) cards.push({ ...cd, key, ch: c, no: s.no }); });
      return cards;
    };
    const info = () => { $('#fInfo').textContent = `${build().length} ใบ`; };
    view.querySelectorAll('input').forEach(x => x.addEventListener('change', info));
    bindSelActs(view, info); info();
    $('#fGo').onclick = () => {
      const cards = shuffle(build()); let i = 0, flipped = false;
      const area = $('#fArea');
      const show = () => {
        if (i >= cards.length) { area.innerHTML = '<p class="empty">ครบทุกใบแล้ว 🎉</p>'; return; }
        const c = cards[i];
        area.innerHTML = `<div class="qhead"><span>ใบที่ ${i + 1}/${cards.length}</span><a href="#/${c.ch}/${c.no}">กล่อง ${c.no}</a></div><div class="flash"><div class="flash-inner" id="fc"><div class="flash-face">${flipped ? `<div class="b">${inline(esc(c.b))}</div><small>${esc(c.f)}</small>` : `<div class="f">${inline(esc(c.f))}</div><small>แตะเพื่อพลิก</small>`}</div></div></div>
        <div class="flash-acts"><button class="btn" id="fNo">Not yet</button><button class="btn primary" id="fYes">Got it</button></div>`;
        $('#fc').onclick = () => { flipped = !flipped; show(); };
        $('#fNo').onclick = () => { delete S.known[c.key]; save(); i++; flipped = false; show(); };
        $('#fYes').onclick = () => { S.known[c.key] = 1; save(); i++; flipped = false; show(); };
      };
      show();
    };
  }
  /* แดชบอร์ดจุดอ่อน */
  async function vStats() {
    await loadAll(); renderSidebar();
    const pct = (r, n) => n ? Math.round(r * 100 / n) : null;
    const boxes = [], years = {};
    let tr = 0, tn = 0;
    for (const ch of loadedCH()) {
      for (const s of ch.sections) {
        let r = 0, n = 0, tried = 0;
        for (const qid of s.examIds) {
          const st = S.stats[`${ch.id}|${qid}`]; if (!st) continue;
          tried++; r += st.r; n += st.r + st.w;
          const y = qid.split('/')[0].split('.')[0];
          years[y] = years[y] || { r: 0, n: 0 }; years[y].r += st.r; years[y].n += st.r + st.w;
        }
        tr += r; tn += n;
        if (s.examIds.length) boxes.push({ ch, s, r, n, tried, total: s.examIds.length, p: pct(r, n) });
      }
    }
    const done = boxes.filter(b => b.n);
    const weak = done.slice().sort((a, b) => a.p - b.p || b.n - a.n);
    const bar = p => `<div class="bar"><i style="width:${p ?? 0}%;background:${p == null ? 'var(--line)' : p < 50 ? 'var(--bad)' : p < 75 ? 'var(--key)' : 'var(--ok)'}"></i></div>`;
    let h = `<div class="hero"><h1>📊 Weak spots</h1><p>คิดจากทุกครั้งที่กดตอบข้อสอบในเว็บ (ท้ายกล่องและโหมดทำข้อสอบ)</p></div>`;
    if (!tn) { view.innerHTML = h + '<p class="empty">ยังไม่มีข้อมูล ลองทำข้อสอบท้ายกล่องหรือโหมดทำข้อสอบก่อนนะ</p>'; return; }
    const w = weak[0];
    h += `<div class="panel"><h3>ภาพรวม: ถูก ${pct(tr, tn)}% (${tr}/${tn} ครั้ง) · ทำแล้ว ${done.length}/${boxes.length} กล่อง</h3>${bar(pct(tr, tn))}
      <div class="choice" style="margin-top:12px"><a class="btn primary" href="#/${w.ch.id}/${w.s.no}">ไปกล่องที่อ่อนสุด: ${w.s.no}. ${esc(w.s.title)} (${w.p}%)</a><button class="btn" id="weakGo">สุ่มข้อจากกล่องที่ต่ำกว่า 70%</button></div></div>`;
    h += `<h2>แยกตามปีข้อสอบ</h2><div class="tbl-wrap"><table class="t"><thead><tr><th>ปี</th><th>ถูก</th><th style="width:45%"></th></tr></thead><tbody>${Object.keys(years).sort().map(y => { const p = pct(years[y].r, years[y].n); return `<tr><td>MDCU${y}</td><td>${p}% (${years[y].r}/${years[y].n})</td><td>${bar(p)}</td></tr>`; }).join('')}</tbody></table></div>`;
    h += `<h2>แยกตามกล่อง (อ่อนสุดอยู่บน)</h2><div class="tbl-wrap"><table class="t"><thead><tr><th>กล่อง</th><th>ถูก</th><th>ทำแล้ว</th><th style="width:30%"></th></tr></thead><tbody>${weak.concat(boxes.filter(b => !b.n)).map(b => `<tr><td><a href="#/${b.ch.id}/${b.s.no}">${b.s.no}. ${esc(b.s.title)}</a></td><td>${b.p == null ? '–' : b.p + '%'}</td><td>${b.tried}/${b.total} ข้อ</td><td>${bar(b.p)}</td></tr>`).join('')}</tbody></table></div>
      <div class="choice"><button class="btn small" id="statReset">Reset stats</button></div>`;
    view.innerHTML = h;
    $('#weakGo').onclick = () => {
      const ws = new Set(done.filter(b => b.p < 70).map(b => `${b.ch.id}/${b.s.no}`));
      const items = shuffle(pool(Object.keys(CH), (c, qid, q) => ws.has(`${c}/${q.box}`)));
      if (items.length) runQuiz(items.slice(0, 20), 'ทวนกล่องที่อ่อน');
    };
    $('#statReset').onclick = () => { if (confirm('ล้างสถิติการตอบทั้งหมด?')) { S.stats = {}; save(); vStats(); } };
  }
  /* หน้ารวมโน้ต */
  async function vNotes() {
    await loadAll(); renderSidebar();
    let h = `<div class="hero"><h1>🗒️ My notes & highlights</h1><p>เรียงตามบทและกล่อง กดชื่อกล่องเพื่อไปอ่านต่อ</p></div>`;
    let any = false;
    for (const ch of loadedCH()) for (const s of ch.sections) {
      const k = secKey(ch.id, s.no), note = S.notes[k], hl = S.hl[k] || [];
      if (!note && !hl.length) continue; any = true;
      h += `<div class="panel"><h3><a href="#/${ch.id}/${s.no}">${esc(ch.title)} · ${s.no}. ${esc(s.title)}</a></h3>${note ? `<p style="white-space:pre-wrap;margin:6px 0">${esc(note)}</p>` : ''}${hl.map(x => `<p style="margin:6px 0"><mark class="user-hl c-${x.c || 'g'}">${esc(x.t)}</mark>${x.n ? `<span class="inote-txt">★ ${esc(x.n)}</span>` : ''}</p>`).join('')}</div>`;
    }
    const qk = {};
    for (const k of Object.keys(S.hl)) { const m = k.match(/^q:([^|]+)\|(.+)\|([^|]+)$/); if (m && S.hl[k].length) (qk[m[1] + '|' + m[2]] = qk[m[1] + '|' + m[2]] || []).push(...S.hl[k]); }
    const qs = Object.keys(qk);
    if (qs.length) {
      any = true; h += '<h2 style="margin:22px 0 8px">📝 ไฮไลต์ในข้อสอบ</h2>';
      for (const x of qs) { const [c, qid] = x.split('|'); const q = CH[c] && CH[c].exams[qid];
        h += `<div class="panel"><h3>${q ? `<a href="#/${c}/${q.box}">ข้อ ${esc(qid)} · กล่อง ${q.box}</a>` : esc(qid)}</h3>${qk[x].map(y => `<p style="margin:6px 0"><mark class="user-hl c-${y.c || 'g'}">${esc(y.t)}</mark>${y.n ? `<span class="inote-txt">★ ${esc(y.n)}</span>` : ''}</p>`).join('')}</div>`; }
    }
    view.innerHTML = h + (any ? '' : '<p class="empty">ยังไม่มีโน้ต เปิดกล่องไหนก็ได้แล้วจดที่ "โน้ตของฉัน" หรือเลือกข้อความเพื่อไฮไลต์</p>');
  }
  /* แผนผังภาพรวมบท: แยกตามหน้า A3 ระบายสีตามดาว มีคะแนนข้อสอบและสิ่งที่อ่านวันนี้ */
  async function vMap(id) {
    await loadIndex(); const ch = await loadChapter(id); if (!ch) return vHome();
    renderSidebar(id);
    const p = chProgress(ch), day = (S.read || {})[today()] || {};
    const HUE = [150, 200, 265, 330, 25, 45, 100, 180];
    let h = `<div class="crumb"><a href="#/${id}">${esc(ch.title)}</a> · แผนผัง</div>
      <div class="map-root"><div class="map-core"><b>${esc(ch.title)}</b><small>${p.n} กล่อง · มั่นใจ ${p.c[4]} · ประเมินแล้ว ${p.d}</small>${lvBar(p, true)}</div></div>
      <div class="map-legend">${LV_ORD.map(l => `<span class="mn lv${l}">${LV[l].s}</span>`).join('')}<span class="mn">ยังไม่ประเมิน</span><span class="mn today">อ่านวันนี้</span><span class="mn"><span class="bxs full">(4/4)</span> คะแนนข้อสอบ</span></div>
      <div class="map-grid">`;
    ch.pages.forEach((pg, i) => {
      const secs = ch.sections.filter(x => x.page === pg.no);
      const pp = { n: secs.length, c: { 4: 0, 3: 0, 2: 0, 1: 0 } }; secs.forEach(x => { const l = lvOf(id, x.no); if (l) pp.c[l]++; }); pp.d = pp.c[4] + pp.c[3] + pp.c[2] + pp.c[1];
      h += `<section class="map-br" style="--h:${HUE[i % HUE.length]}"><h3><span>หน้า ${pg.no}</span>${esc(pg.title)}</h3>${lvBar(pp)}<div class="map-nodes">`
        + secs.map(x => { const l = lvOf(id, x.no), k = secKey(id, x.no); const rd = day[k] >= 60;
          return `<a class="mn${l ? ' lv' + l : ''}${rd ? ' today' : ''}" href="#/${id}/${x.no}" title="${esc(x.title)}"><b>${x.no}</b><span>${esc(x.title)}</span>${boxScore(id, x)}${x.stars >= 3 ? '<em>🔥</em>' : ''}</a>`; }).join('')
        + '</div></section>';
    });
    view.innerHTML = h + '</div><p class="bar-label">🔥 = ออกสอบบ่อย (★★★) · แตะกล่องเพื่อไปอ่าน</p>';
  }
  /* หน้าแผนทวนวันนี้ */
  async function vReview() {
    await loadAll(); renderSidebar();
    const items = dueItems();
    const done = S.revDone && S.revDone.d === today() ? S.revDone.n : 0;
    const nb = items.filter(x => x.type === 'box'), ne = items.filter(x => x.type === 'exam'), nk = items.filter(x => x.type === 'kw');
    const total = items.length + done;
    let h = `<div class="hero rv-hero"><h1>📅 Today's review</h1><p>ระบบนัดทวนให้เอง: ตอบ "จำได้" รอบถัดไปจะห่างออก (1 → 2 → 5 → 11 วัน…) ตอบ "ยังไม่แม่น" จะกลับมาพรุ่งนี้</p>
      <div class="rv-stat"><div><b>${items.length}</b><span>Due</span></div><div><b>${done}</b><span>Done today</span></div><div class="rv-ring" style="--p:${total ? Math.round(done * 100 / total) : 100}"><span>${total ? Math.round(done * 100 / total) : 100}%</span></div></div></div>`;
    if (!items.length) {
      view.innerHTML = h + `<p class="empty">🎉 วันนี้ทวนครบแล้ว${Object.keys(S.lvl).length ? '' : '<br>ให้ดาวกล่องที่อ่าน (★–★★★) เก็บ keyword หรือทำข้อสอบ แล้วรายการจะมาโผล่ที่นี่เอง'}</p>`;
      return;
    }
    const sec = (title, cls, arr, fn) => arr.length ? `<section class="rv-sec ${cls}"><h2>${title} <small>${arr.length}</small></h2>${arr.slice(0, 30).map(fn).join('')}</section>` : '';
    h += sec('📖 Boxes to re-read', 'rv-box', nb.sort((a, b) => a.l - b.l), it => {
      const [c, no] = it.k.split('/'); const ch = CH[c]; const s = ch && ch.sections.find(x => x.no === +no);
      return `<div class="rv-card lv${it.l}" data-id="${it.id}" data-base="${BASE[it.l]}"><div class="rv-main"><span class="rv-lv">${LV[it.l].s}</span><a href="#/${c}/${no}"><b>${no}.</b> ${s ? esc(s.title) : ''}</a><small>${ivText(it.id)}</small></div><div class="rv-act"><button class="btn small" data-g="0">Not yet</button><button class="btn small primary" data-g="1">Read · Got it</button></div></div>`;
    });
    h += sec('📝 Retry past mistakes', 'rv-exam', ne, it => {
      const q = CH[it.w.ch] && CH[it.w.ch].exams[it.w.id]; if (!q) return '';
      return `<div class="rv-q" data-id="${it.id}">${mcqHTML(it.w.ch, it.w.id, q, { showBox: true })}</div>`;
    });
    h += sec('🔑 Keywords', 'rv-kw', nk, it => {
      const x = it.x, ch = CH[x.ch], s = ch && ch.sections.find(y => y.no === x.box);
      return `<div class="rv-card kw" data-id="${it.id}" data-base="1"><div class="rv-main"><span class="kwt" data-hlk="kw:${x.at}">${kwHTML(x.d || x.t)}</span><small><a href="#/${x.ch}/${x.box}" data-kwt="${esc(x.t)}">กล่อง ${x.box}${s ? ' ' + esc(s.title) : ''} ↗</a> · ${ivText(it.id)}</small></div><div class="rv-act"><button class="btn small" data-g="0">Not yet</button><button class="btn small primary" data-g="1">Got it</button></div></div>`;
    });
    view.innerHTML = h; applyAllHL(view);
    const bump = card => { card.classList.add('rv-gone'); setTimeout(() => { const y = scrollY; vReview().then(() => scrollTo(0, y)); updateWrongCount(); }, 380); };
    view.querySelectorAll('.rv-card [data-g]').forEach(b => b.onclick = () => { const c = b.closest('.rv-card'); schedule(c.dataset.id, b.dataset.g === '1', +c.dataset.base); bump(c); });
    view.querySelectorAll('.rv-q').forEach(w => { const m = w.querySelector('.mcq'); m._onDone = ok => {
      schedule(w.dataset.id, ok, 2);
      const nx = document.createElement('div'); nx.className = 'rv-act'; nx.innerHTML = `<button class="btn small primary">Next</button>`; m.appendChild(nx);
      nx.querySelector('button').onclick = () => bump(w);
    }; });
    view.querySelectorAll('[data-kwt]').forEach(a => a.onclick = () => { kwFlash = a.dataset.kwt; });
  }
  /* หน้า Keyword: เรียงตามบทและกล่อง กรองตามบทได้ ติ๊กว่าทวนแล้วได้ */
  let kwFlash = '';
  async function vKeywords() {
    await loadAll(); renderSidebar();
    const left = S.kw.filter(x => !x.ok).length;
    let h = `<div class="hero"><h1>🔑 My keywords</h1><p>ลากเลือกคำเพื่อไฮไลต์/เปลี่ยนสีได้ · ↗ กลับไปอ่านตรงจุดนั้น · ติ๊กช่องเมื่อทวนแล้ว · ✎ แก้คำหรือคำที่เน้น · ยังไม่ได้ทวน ${left} จาก ${S.kw.length} คำ</p></div>`;
    if (!S.kw.length) { view.innerHTML = h + '<p class="empty">ยังไม่มี keyword ลองเลือกข้อความในเนื้อหาหรือข้อสอบแล้วกด 🔑</p>'; return; }
    // นับจำนวน keyword แยกตามบท แล้วสร้างปุ่มกรองตามบท
    const chCounts = {};
    for (const x of S.kw) { const c = x.ch || '_'; chCounts[c] = (chCounts[c] || 0) + 1; }
    const chList = Object.keys(chCounts).sort((a, b) => chNum(a) - chNum(b) || (a < b ? -1 : 1));
    if (S.kwCh && !chCounts[S.kwCh]) S.kwCh = '';
    const activeCh = S.kwCh || '';
    const pills = `<div class="kw-chs"><button class="btn small${!activeCh ? ' primary' : ''}" data-ch="">ทั้งหมด (${S.kw.length})</button>`
      + chList.map(c => `<button class="btn small${activeCh === c ? ' primary' : ''}" data-ch="${esc(c)}">${esc(CH[c] ? CH[c].title : (c === '_' ? 'อื่นๆ' : c))} (${chCounts[c]})</button>`).join('') + '</div>';
    h += pills;
    h += `<div class="choice kw-filter"><label><input type="checkbox" id="kwHide" ${S.kwHide ? 'checked' : ''}> Hide reviewed</label><button class="btn small" id="kwShuffle">Random review${activeCh && CH[activeCh] ? ` (${esc(CH[activeCh].title)})` : ''}</button></div>`;
    h += '<div class="kw-cols">';
    const groups = {};
    S.kw.forEach((x, i) => {
      const c = x.ch || '_';
      if (activeCh && c !== activeCh) return;
      const g = `${x.ch}|${x.box}`; (groups[g] = groups[g] || []).push(i);
    });
    const keys = Object.keys(groups).sort((a, b) => { const [ca, ba] = a.split('|'), [cb, bb] = b.split('|'); return ca === cb ? ba - bb : chNum(ca) - chNum(cb) || (ca < cb ? -1 : 1); });
    let shown = 0;
    for (const g of keys) {
      const [c, box] = g.split('|'); const ch = CH[c]; const sec = ch && ch.sections.find(x => x.no === +box);
      const items = groups[g].filter(i => !(S.kwHide && S.kw[i].ok)); if (!items.length) continue;
      shown += items.length;
      h += `<div class="kw-group"><h3><a href="#/${c}/${box}"><b>${box}</b> ${sec ? esc(sec.title) : ''}</a><small>${ch ? esc(ch.title) : ''}</small></h3><ul class="kw-list">`
        + items.map(i => { const x = S.kw[i]; return `<li class="kwi${x.ok ? ' ok' : ''}"><button class="kw-ok" data-i="${i}" title="ทวนแล้ว">${x.ok ? '✓' : ''}</button><span class="kwt" data-hlk="kw:${x.at}">${kwHTML(x.d || x.t)}</span><a class="kw-go" href="#/${c}/${box}" data-kwt="${esc(x.t)}" title="ไปอ่านตรงจุดนั้น">↗</a>${x.q ? `<small>ข้อ ${esc(x.q)}</small>` : ''}<button class="kw-ed" data-i="${i}" title="แก้ไข">✎</button><button class="kw-del" data-i="${i}" title="ลบ">✕</button></li>`; }).join('')
        + '</ul></div>';
    }
    view.innerHTML = h + '</div>' + (!shown ? '<p class="empty">ไม่มี keyword ที่ยังไม่ทวนในบทนี้แล้ว 🎉</p>' : '');
    applyAllHL(view);
    view.querySelectorAll('.kw-chs button').forEach(b => b.onclick = () => { S.kwCh = b.dataset.ch; save(); vKeywords(); });
    view.querySelectorAll('.kw-ed').forEach(b => b.onclick = () => {
      const i = +b.dataset.i, x = S.kw[i], li = b.closest('li');
      li.innerHTML = `<div class="kw-edit"><textarea rows="2">${esc(x.d || x.t)}</textarea><div class="note-act"><button class="btn small" data-a="mk">Emphasize</button><button class="btn small" data-a="x">Cancel</button><button class="btn small primary" data-a="ok">Save</button></div></div>`;
      const ta = li.querySelector('textarea'); ta.focus();
      li.querySelectorAll('[data-a]').forEach(c => c.onclick = () => {
        if (c.dataset.a === 'mk') { const v = ta.value, s0 = ta.selectionStart, e0 = ta.selectionEnd; if (e0 > s0) ta.value = v.slice(0, s0) + '==' + v.slice(s0, e0) + '==' + v.slice(e0); return ta.focus(); }
        if (c.dataset.a === 'ok' && ta.value.trim()) { x.d = ta.value.trim(); save(); }
        vKeywords();
      });
    });
    view.querySelectorAll('.kw-ok').forEach(b => b.onclick = () => { const x = S.kw[+b.dataset.i]; x.ok = x.ok ? 0 : Date.now(); save(); vKeywords(); });
    view.querySelectorAll('.kw-del').forEach(b => b.onclick = () => { const x = S.kw.splice(+b.dataset.i, 1)[0]; if (x) delete S.hl['kw:' + x.at]; save(); vKeywords(); });
    view.querySelectorAll('[data-kwt]').forEach(a => a.onclick = () => { kwFlash = a.dataset.kwt; });
    $('#kwHide').onchange = e => { S.kwHide = e.target.checked; save(); vKeywords(); };
    $('#kwShuffle').onclick = () => {
      const pool = S.kw.filter(x => !x.ok && (!activeCh || (x.ch || '_') === activeCh));
      if (!pool.length) return toast('All keywords reviewed');
      const x = pool[Math.floor(Math.random() * pool.length)]; kwFlash = x.t; location.hash = `#/${x.ch}/${x.box}`;
    };
  }
  // พากลับไปจุดที่เก็บ keyword แล้วกะพริบให้เห็น
  function flashKw() {
    if (!kwFlash) return; const t = kwFlash; kwFlash = '';
    for (const n of textNodes(view)) {
      const i = n.nodeValue.indexOf(t); if (i < 0) continue;
      const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + t.length);
      const mk = document.createElement('span'); mk.className = 'kw-flash';
      try { r.surroundContents(mk); } catch (e) { n.parentNode.scrollIntoView({ block: 'center' }); return; }
      mk.scrollIntoView({ block: 'center' }); setTimeout(() => mk.replaceWith(...mk.childNodes), 2600); return;
    }
    // ข้อความยาวข้ามหลายส่วน: เลื่อนไปที่ต้นคำ
    const head = t.slice(0, 12); for (const n of textNodes(view)) if (n.nodeValue.includes(head)) { n.parentNode.scrollIntoView({ block: 'center' }); n.parentNode.classList.add('kw-flash-blk'); setTimeout(() => n.parentNode.classList.remove('kw-flash-blk'), 2600); return; }
  }
  /* ---------- ตารางท่องจำ: ปิดคำตอบแล้วแตะทีละช่อง ---------- */
  function coverTools(root) {
    root.querySelectorAll('article.content .tbl-wrap').forEach((w, ti) => {
      const t = w.querySelector('table'); if (!t || t.rows.length < 3 || w.previousElementSibling?.classList.contains('cover-bar')) return;
      const bar = document.createElement('div'); bar.className = 'cover-bar';
      bar.innerHTML = `<span class="cb-l">ท่องจำตาราง</span><button data-m="ans">ปิดคำตอบ</button><button data-m="name">ปิดชื่อ</button><button data-m="shuf">สลับแถว</button><button data-m="off" hidden>เปิดทั้งหมด</button>`;
      w.before(bar);
      const cells = mode => [...t.tBodies[0].rows].flatMap(r => [...r.cells].filter((c, i) => mode === 'name' ? i === 0 : i > 0));
      const off = () => { t.querySelectorAll('td.cv').forEach(c => c.classList.remove('cv', 'shown')); t.classList.remove('covering'); bar.querySelector('[data-m="off"]').hidden = true; };
      bar.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return; const m = b.dataset.m;
        if (m === 'off') return off();
        if (m === 'shuf') { const tb = t.tBodies[0]; [...tb.rows].sort(() => Math.random() - .5).forEach(r => tb.appendChild(r)); return; }
        off(); cells(m).forEach(c => c.classList.add('cv')); t.classList.add('covering'); bar.querySelector('[data-m="off"]').hidden = false;
      });
      t.addEventListener('click', e => { const c = e.target.closest('td.cv'); if (c && !e.target.closest('mark.user-hl')) { c.classList.toggle('shown'); } });
    });
  }

  /* ---------- Drill: สร้างข้อสอบจับคู่อัตโนมัติจากตารางในเนื้อหา (เหมาะกับยา/เชื้อ/ชื่อเยอะ) ---------- */
  const clean = x => x.replace(/\s+/g, ' ').trim();
  function tableFacts(ch) {
    const out = [];
    for (const s of ch.sections) {
      if (!/<table/.test(s.html)) continue;
      const d = document.createElement('div'); d.innerHTML = s.html;
      d.querySelectorAll('table').forEach((t, ti) => {
        const head = [...t.tHead.rows[0].cells].map(c => clean(c.textContent));
        const rows = [...t.tBodies[0].rows].map(r => [...r.cells].map(c => clean(c.textContent))).filter(r => r[0] && r.length === head.length);
        if (rows.length >= 4) out.push({ box: s.no, title: s.title, ti, head, rows });
      });
    }
    return out;
  }
  const DRUGBUG = /ยา|เชื้อ|clue|drug|bug|organism|รักษา|โรค/i;
  function makeDrill(tables, n) {
    const qs = [];
    for (const T of tables) for (let j = 1; j < T.head.length; j++) {
      const col = [...new Set(T.rows.map(r => r[j]).filter(v => v && v !== '–' && v !== '-'))]; if (col.length < 3) continue;
      if (/^ข้อ$|ปีที่ออก|^กล่อง$/.test(T.head[j])) continue;
      T.rows.forEach((r, ri) => {
        if (!r[j] || r[j] === '–') return;
        const wrong = shuffle(col.filter(v => v !== r[j])).slice(0, 3);
        qs.push({ T, ri, j, dir: 'f', q: r[0], ask: T.head[j], ans: r[j], opts: shuffle([r[j], ...wrong]) });
        const names = [...new Set(T.rows.filter(x => x[j] !== r[j]).map(x => x[0]))];
        if (names.length >= 3 && r[j].length <= 90) qs.push({ T, ri, j, dir: 'r', q: r[j], ask: T.head[0], ans: r[0], opts: shuffle([r[0], ...shuffle(names).slice(0, 3)]) });
      });
    }
    return shuffle(qs).slice(0, n);
  }
  async function vDrill(params) {
    await loadAll(); renderSidebar();
    const chs = loadedCH();
    const all = chs.flatMap(ch => tableFacts(ch).map(t => Object.assign(t, { ch: ch.id, chTitle: ch.title })));
    const db = all.filter(t => DRUGBUG.test(t.head.join(' ')));
    const weak = S.drillWrong || {};
    let h = `<div class="hero"><h1>🧠 Name drill</h1><p>ข้อสอบจับคู่ที่สร้างเองจากตารางในเนื้อหา เหมาะกับเรื่องที่ต้องจำชื่อเยอะ (ยา เชื้อ โรค อาชีพ) ถามทั้งสองทาง: ชื่อ → คุณสมบัติ และ คุณสมบัติ → ชื่อ</p></div>
      <div class="panel"><h3>เลือกตาราง</h3><div class="drill-pick">
        <label class="dp"><input type="radio" name="dsc" value="db" checked><b>ยา & เชื้อ</b><small>${db.length} ตาราง</small></label>
        <label class="dp"><input type="radio" name="dsc" value="all"><b>ทุกตาราง</b><small>${all.length} ตาราง</small></label>
        <label class="dp"><input type="radio" name="dsc" value="weak" ${Object.keys(weak).length ? '' : 'disabled'}><b>ข้อที่เคยพลาด</b><small>${Object.keys(weak).length} ข้อ</small></label>
      </div><div class="sel-bar"><small class="bar-label">เลือกทีละตาราง</small>${selActs('dTables')}</div><div class="drill-tables" id="dTables">${all.map((t, i) => `<label><input type="checkbox" value="${i}" ${DRUGBUG.test(t.head.join(' ')) ? 'checked' : ''}> <b>${t.box}</b> ${esc(t.head.join(' · '))}</label>`).join('')}</div>
      <div class="choice"><label><input type="radio" name="dn" value="10" checked>10 ข้อ</label><label><input type="radio" name="dn" value="20">20 ข้อ</label><label><input type="radio" name="dn" value="40">40 ข้อ</label></div>
      <button class="btn primary" id="dGo">Start drill</button></div>`;
    view.innerHTML = h;
    bindSelActs(view);
    const boxes = [...view.querySelectorAll('.drill-tables input')];
    view.querySelectorAll('[name=dsc]').forEach(r => r.onchange = () => { boxes.forEach((b, i) => b.checked = r.value === 'all' ? true : r.value === 'db' ? DRUGBUG.test(all[+b.value].head.join(' ')) : false); });
    $('#dGo').onclick = () => {
      const n = +view.querySelector('[name=dn]:checked').value, sc = view.querySelector('[name=dsc]:checked').value;
      let qs;
      if (sc === 'weak') { const keys = new Set(Object.keys(weak)); qs = makeDrill(all, 9999).filter(q => keys.has(`${q.T.ch}|${q.T.box}|${q.T.ti}|${q.ri}|${q.j}|${q.dir}`)).slice(0, n); }
      else qs = makeDrill(boxes.filter(b => b.checked).map(b => all[+b.value]), n);
      if (!qs.length) return toast('ไม่มีข้อในตารางที่เลือก');
      runDrill(qs);
    };
  }
  /* ---------- Drug & Bug: รวมยาและเชื้อจากตารางของทุกบท (อัปเดตเองเมื่อเพิ่มบทใหม่) ---------- */
  const DRUG_H = /^(ยา|drug|กลุ่มยา|ชื่อยา)/i, BUG_H = /^(เชื้อ|bug|organism|pathogen)/i, SKIP_H = /^(ข้อ|ปีที่ออก|กล่อง)$/;
  function dbEntries() {
    const map = new Map();
    for (const ch of loadedCH()) for (const s of ch.sections) {
      if (!/<table/.test(s.html)) continue;
      const d = document.createElement('div'); d.innerHTML = s.html;
      d.querySelectorAll('.abx').forEach(x => x.remove());
      d.querySelectorAll('table').forEach(t => {
        if (!t.tHead || !t.tBodies[0]) return;
        const head = [...t.tHead.rows[0].cells].map(c => clean(c.textContent));
        let kind = null, ei = head.findIndex(h => DRUG_H.test(h));
        if (ei >= 0) kind = 'drug'; else { ei = head.findIndex(h => BUG_H.test(h)); if (ei >= 0) kind = 'bug'; }
        // ตารางโรคที่มีคอลัมน์เชื้อแต่เป็นข้อความยาว → ใช้ชื่อโรคเป็นหัว
        if (kind === 'bug' && ei > 0 && [...t.tBodies[0].rows].some(r => r.cells[ei] && r.cells[ei].textContent.length > 45)) ei = 0;
        if (!kind) return;
        [...t.tBodies[0].rows].forEach(r => {
          const cells = [...r.cells]; if (cells.length !== head.length) return;
          const name = clean(cells[ei].textContent); if (!name || name === '–') return;
          const key = kind + '|' + name.toLowerCase().replace(/\s*\(.*$/, '').replace(/[.\s]+/g, ' ').trim();
          let e = map.get(key); if (!e) map.set(key, e = { kind, name, facts: [], src: [], ex: [] });
          const src = `${ch.id}/${s.no}`; if (!e.src.some(x => x.h === src)) e.src.push({ h: src, ch: ch.id, no: s.no, title: s.title });
          cells.forEach((c, j) => {
            if (j === ei) return; const v = clean(c.textContent); if (!v || v === '–' || v === '-') return;
            if (/^ข้อ$/.test(head[j])) { e.ex.push(...v.split(/\s*[·,]\s*/)); return; }
            if (SKIP_H.test(head[j])) return;
            e.facts.push({ k: head[j], v: c.innerHTML.trim() });
          });
        });
      });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  }
  async function vDB(params) {
    await loadAll(); renderSidebar();
    const all = dbEntries(), f = S.dbf || (S.dbf = { k: 'all', cover: 0 });
    // หมวดยา/เชื้อ 2 ชั้น จาก data/taxonomy.json (กฎ regex แรกที่ตรงชื่อ) → ตะแกรงอีกชั้นนอกจากบท
    const TX = await fetch('data/taxonomy.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : {}).catch(() => ({}));
    const rules = {}; for (const k of ['drug', 'bug']) rules[k] = (TX[k] || []).map(([p, g, s]) => { try { return [new RegExp(p, 'i'), g, s]; } catch (e) { return null; } }).filter(Boolean);
    all.forEach(e => { const m = rules[e.kind].find(([re]) => re.test(e.name)); e.g = m ? m[1] : 'Others'; e.sub = m ? m[2] : 'Unclassified'; });
    const tree = { drug: [], bug: [] };
    for (const k of ['drug', 'bug']) { const seen = new Map(); rules[k].forEach(([, g, s]) => { if (!seen.has(g)) seen.set(g, []); if (!seen.get(g).includes(s)) seen.get(g).push(s); }); if (all.some(e => e.kind === k && e.sub === 'Unclassified')) { if (!seen.has('Others')) seen.set('Others', []); seen.get('Others').push('Unclassified'); } tree[k] = [...seen].map(([g, subs]) => ({ g, subs })); }
    f.cat = Array.isArray(f.cat) ? f.cat : [];
    const chs = [...new Set(all.flatMap(e => e.src.map(x => x.ch)))];
    const n = k => all.filter(e => k === 'all' || e.kind === k).length;
    view.innerHTML = `<div class="hero"><h1>💊 Drug & Bug</h1><p>รวมยาและเชื้อจากตารางของทุกบทไว้ที่เดียว เรียง A–Z ถ้าชื่อเดียวกันอยู่หลายกล่องจะรวมเป็นการ์ดเดียว · เพิ่มบทใหม่แล้วหน้านี้อัปเดตเอง</p></div>
      ${dbViews('cards')}
      <div class="db-bar"><div class="seg">${[['all', 'All'], ['drug', 'Drugs'], ['bug', 'Bugs']].map(([k, l]) => `<button class="${f.k === k ? 'on' : ''}" data-k="${k}">${l} <small>${n(k)}</small></button>`).join('')}</div>
        <input id="dbq" type="search" placeholder="ค้นชื่อ กลไก อาการ…" value="${esc(params.get('q') || '')}">
        <label class="db-cv"><input type="checkbox" id="dbCover" ${f.cover ? 'checked' : ''}> Cover mode</label>
        <a class="btn small" href="#/drill">🧠 Drill</a></div>
      ${chs.length > 1 ? `<div class="db-chs-wrap"><div class="sel-bar"><small class="bar-label">กรองตามบท</small>${selActs('dbChs')}</div><div class="db-chs" id="dbChs">${chs.map(c => `<label><input type="checkbox" value="${c}" checked> ${c.toUpperCase()}</label>`).join('')}</div></div>` : ''}
      <details class="db-cats" id="dbCats"${f.cat.length ? ' open' : ''}><summary>🗂️ กรองตามหมวด <small id="dbCatN"></small></summary><div id="dbCatBody"></div></details>
      <div class="db-az" id="dbAz"></div><div class="db-grid" id="dbGrid"></div>`;
    const grid = $('#dbGrid'), az = $('#dbAz'), catBody = $('#dbCatBody');
    const chOn = () => { const on = new Set([...view.querySelectorAll('.db-chs input:checked')].map(x => x.value)); return e => !view.querySelector('.db-chs') || e.src.some(x => on.has(x.ch)); };
    const ck = (kind, s) => kind + '|' + s;
    const drawCats = () => {
      const okCh = chOn(), kinds = f.k === 'all' ? ['drug', 'bug'] : [f.k], cat = new Set(f.cat);
      catBody.innerHTML = `<div class="cat-top-acts"><button type="button" class="btn small" id="dbCatAll">เลือกทุกหมวด</button><button type="button" class="btn small" id="dbCatClr">ไม่เลือกเลย (แสดงทั้งหมด)</button></div>`
        + kinds.map(kind => `<div class="cat-kind"><div class="cat-kh">${kind === 'drug' ? '💊 Drugs' : '🦠 Bugs'}</div>${tree[kind].map(({ g, subs }) => {
        const cnt = s => all.filter(e => e.kind === kind && e.sub === s && okCh(e)).length;
        const vis = subs.filter(s => cnt(s)); if (!vis.length) return '';
        const n = vis.filter(s => cat.has(ck(kind, s))).length;
        return `<div class="cat-g"><label class="cat-gl"><input type="checkbox" data-g="${esc(kind + '|' + g)}" ${n === vis.length ? 'checked' : ''} ${n && n < vis.length ? 'data-ind="1"' : ''}><b>${esc(g)}</b></label><div class="cat-subs">${vis.map(s => `<label><input type="checkbox" data-s="${esc(ck(kind, s))}" ${cat.has(ck(kind, s)) ? 'checked' : ''}> ${esc(s)} <small>${cnt(s)}</small></label>`).join('')}</div></div>`;
      }).join('')}</div>`).join('');
      catBody.querySelectorAll('[data-ind]').forEach(x => x.indeterminate = true);
      $('#dbCatN').textContent = f.cat.length ? `· เลือก ${f.cat.length} หมวด` : '· ยังไม่เลือก = แสดงทุกหมวด';
    };
    catBody.addEventListener('change', e => {
      const x = e.target; const set = new Set(f.cat);
      if (x.dataset.s) { x.checked ? set.add(x.dataset.s) : set.delete(x.dataset.s); }
      else if (x.dataset.g) { x.closest('.cat-g').querySelectorAll('[data-s]').forEach(s => x.checked ? set.add(s.dataset.s) : set.delete(s.dataset.s)); }
      f.cat = [...set]; save(); drawCats(); draw();
    });
    catBody.addEventListener('click', e => {
      if (e.target.id === 'dbCatClr') { f.cat = []; save(); drawCats(); draw(); }
      else if (e.target.id === 'dbCatAll') { f.cat = [...catBody.querySelectorAll('[data-s]')].map(s => s.dataset.s); save(); drawCats(); draw(); }
    });
    const draw = () => {
      const q = $('#dbq').value.trim().toLowerCase(), okCh = chOn(), cat = new Set(f.cat);
      const anyCh = !view.querySelector('.db-chs') || view.querySelectorAll('.db-chs input:checked').length > 0;
      const list = all.filter(e => (f.k === 'all' || e.kind === f.k) && okCh(e)
        && (!cat.size || cat.has(ck(e.kind, e.sub)))
        && (!q || (e.name + ' ' + e.facts.map(x => x.v.replace(/<[^>]+>/g, '')).join(' ')).toLowerCase().includes(q)));
      let last = '', letters = [];
      grid.innerHTML = list.map(e => {
        const L = /^[a-z]/i.test(e.name) ? e.name[0].toUpperCase() : '#'; let anc = '';
        if (L !== last) { last = L; letters.push(L); anc = ` id="db-${L}"`; }
        return `<div class="db-card ${e.kind}"${anc}><div class="db-h"><span class="db-k">${e.kind === 'drug' ? 'Drug' : 'Bug'}</span><b>${esc(e.name)}</b><span class="db-cat">${esc(e.g)} › ${esc(e.sub)}</span></div>
          ${e.facts.map(x => `<div class="db-f"><span>${esc(x.k)}</span><div class="db-v">${x.v}</div></div>`).join('')}
          <div class="db-src">${e.src.map(x => `<a href="#/${x.h}">${x.ch.toUpperCase()} · กล่อง ${x.no} ↗</a>`).join('')}${e.ex.length ? `<span class="db-ex">ออกสอบ ${e.ex.length} ข้อ</span>` : ''}</div></div>`;
      }).join('') || `<p class="empty">${anyCh ? 'ไม่เจอชื่อที่ค้น' : 'ยังไม่ได้เลือกบท — ติ๊กเลือกบทที่ต้องการด้านบน'}</p>`;
      az.innerHTML = letters.map(L => `<a href="#" data-l="${L}">${L}</a>`).join('');
      grid.classList.toggle('covering', !!f.cover);
    };
    view.querySelectorAll('.seg button').forEach(b => b.onclick = () => { f.k = b.dataset.k; save(); view.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === b)); drawCats(); draw(); });
    $('#dbq').oninput = draw;
    $('#dbCover').onchange = e => { f.cover = e.target.checked ? 1 : 0; save(); grid.querySelectorAll('.db-v.shown').forEach(x => x.classList.remove('shown')); draw(); };
    view.querySelectorAll('.db-chs input').forEach(x => x.onchange = () => { drawCats(); draw(); });
    bindSelActs(view, () => { drawCats(); draw(); });
    az.onclick = e => { const a = e.target.closest('a'); if (!a) return; e.preventDefault(); const t = document.getElementById('db-' + a.dataset.l); if (t) scrollTo({ top: t.getBoundingClientRect().top + scrollY - 70, behavior: 'smooth' }); };
    grid.addEventListener('click', e => { if (!f.cover) return; const v = e.target.closest('.db-v'); if (v && !e.target.closest('a')) v.classList.toggle('shown'); });
    drawCats(); draw();
  }
  /* ---------- Drug table: ตารางรวมยาต่อบท (#/drugs/<id>) ----------
     ถ้ามี data/<id>-drugs.json (ไฟล์คัดเอง) ใช้ไฟล์นั้น · ไม่มีก็ดึงจากตารางยาในบทเอง แล้วจัดคอลัมน์ให้เป็นแบบเดียวกัน */
  const DCOL = [['moa', 'กลไก / กลุ่ม'], ['use', 'ใช้เมื่อ'], ['se', 'SE / จุดออกสอบ']];
  const SE_H = /^se\b|se\s*\/|ผลข้างเคียง|พิษ|ระวัง|ข้อห้าม|จุดสอบ|toxic|ข้อควร|ดื้อ|clue/i, MOA_H = /กลไก|mechanism|moa|class|ตำแหน่ง|ออกฤทธิ์|receptor/i, USE_H = /ใช้|indication|regimen|รักษา|จุดเด่น|ตัวอย่าง|เลือก/i, GRP_H = /^(กลุ่ม|class)$/i;
  let TXC = null;
  async function drugTx() {
    if (!TXC) { const TX = await fetch('data/taxonomy.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : {}).catch(() => ({})); TXC = (TX.drug || []).map(([p, g, s]) => { try { return [new RegExp(p, 'i'), g, s]; } catch (e) { return null; } }).filter(Boolean); }
    return TXC;
  }
  function autoDrugRows(ch) {
    const map = new Map();
    for (const s of ch.sections) {
      if (!/<table/.test(s.html)) continue;
      const d = document.createElement('div'); d.innerHTML = s.html; d.querySelectorAll('.abx').forEach(x => x.remove());
      d.querySelectorAll('table').forEach(t => {
        if (!t.tHead || !t.tBodies[0]) return;
        const head = [...t.tHead.rows[0].cells].map(c => clean(c.textContent));
        const ei = head.findIndex(h => DRUG_H.test(h)); if (ei < 0) return;
        const gi = head.findIndex((h, j) => j !== ei && GRP_H.test(h));
        const hdr = /^(ยา|drug|ชื่อยา)$/i.test(head[ei]) ? '' : head[ei];
        [...t.tBodies[0].rows].forEach(r => {
          const cells = [...r.cells]; if (cells.length !== head.length) return;
          const name = clean(cells[ei].textContent); if (!name || name === '–' || name === '-') return;
          const key = name.toLowerCase().replace(/\s*\(.*$/, '').replace(/[.\s]+/g, ' ').trim();
          let e = map.get(key); if (!e) map.set(key, e = { name, nameH: cells[ei].innerHTML.trim(), moa: [], use: [], se: [], ex: 0, boxes: [], grp: '' });
          if (!e.boxes.includes(s.no)) e.boxes.push(s.no);
          // หัวคอลัมน์ยาที่บอกบริบท เช่น "ยา (ตำแหน่ง)" / "ยาเลิกบุหรี่" ติดไปด้วย
          if (hdr) { const k = `<small class="dt-k">${esc(hdr)}</small>`; if (!e.moa.includes(k)) e.moa.push(k); }
          cells.forEach((c, j) => {
            if (j === ei) return; const v = clean(c.textContent); if (!v || v === '–' || v === '-') return;
            const h = head[j];
            if (/^ข้อ$/.test(h)) { e.ex += v.split(/\s*[·,]\s*/).filter(Boolean).length; return; }
            if (SKIP_H.test(h)) return;
            if (j === gi) { if (!e.grp) e.grp = v; const x = c.innerHTML.trim(); if (!e.moa.includes(x)) e.moa.unshift(x); return; }
            const col = SE_H.test(h) ? 'se' : MOA_H.test(h) ? 'moa' : USE_H.test(h) ? 'use' : 'se';
            const plain = (col === 'se' && /^(se|ผลข้างเคียง|se \/ จุดสอบ|จุดสอบ)$/i.test(h)) || (col === 'use' && /^ใช้/.test(h)) || (col === 'moa' && /^กลไก$/.test(h));
            const html = (plain ? '' : `<small class="dt-k">${esc(h)}</small> `) + c.innerHTML.trim(); if (!e[col].includes(html)) e[col].push(html);
          });
        });
      });
    }
    return [...map.values()];
  }
  const dbViews = v => `<div class="db-views"><a href="#/db?view=cards" class="${v === 'cards' ? 'on' : ''}">🗂️ การ์ด A–Z ทุกบท</a><a href="#/db?view=table" class="${v === 'table' ? 'on' : ''}">📋 ตารางยารายบท</a></div>`;
  async function drugRowsOf(id) {
    const ch = await loadChapter(id); if (!ch) return null;
    if (ch.drugT) return ch.drugT;
    const cur = await fetch(`data/${id}-drugs.json`, { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null);
    const tx = await drugTx();
    const curated = !!(cur && cur.rows && cur.rows.length);
    const rows = curated
      ? cur.rows.map(r => ({ name: r.drug, nameH: inline(esc(r.drug)), g: r.g || 'อื่น ๆ', moa: r.moa ? [inline(esc(r.moa))] : [], use: r.use ? [inline(esc(r.use))] : [], se: [r.se, r.kw ? '🎯 ' + r.kw : ''].filter(Boolean).map(x => inline(esc(x))), ex: r.ex || 0, boxes: [].concat(r.box || []) }))
      : autoDrugRows(ch).map(e => { const m = tx.find(([re]) => re.test(e.name)); e.g = m ? `${m[1]} › ${m[2]}` : (e.grp || 'อื่น ๆ'); return e; });
    const byBox = (a, b) => (a.boxes[0] || 0) - (b.boxes[0] || 0);
    const order = curated ? [...new Set(rows.map(r => r.g))] : [...new Set(rows.slice().sort(byBox).map(r => r.g))];
    if (!curated) rows.sort(byBox);
    return (ch.drugT = { ch, rows, order, curated });
  }
  async function vDrugs(id, params) {
    await loadAll(); renderSidebar();
    const f = S.dtf || (S.dtf = { cv: '' });
    // ชิปเลือกบท: เฉพาะบทที่มียา
    const list = [];
    for (const c of INDEX.filter(c => c.ready)) { const d = await drugRowsOf(c.id); if (d && d.rows.length) list.push({ id: c.id, title: c.title, n: d.rows.length }); }
    if (!list.length) { view.innerHTML = `<p class="empty">ยังไม่มีตารางยา</p>`; return; }
    if (!list.some(c => c.id === id)) id = list.some(c => c.id === S.dtCh) ? S.dtCh : list[0].id;
    S.dtCh = id; save();
    const { ch, rows, order, curated } = await drugRowsOf(id);
    view.innerHTML = `<div class="hero"><h1>💊 Drug & Bug</h1><p>ตารางยารายบท: ยาทั้งบทในที่เดียว แบ่งตามกลุ่มยา · แตะแถวเพื่อดูข้อความเต็ม · เลือก Cover แล้วแตะช่องที่ปิดเพื่อท่อง · กดเลขกล่องเพื่อกลับไปอ่าน</p></div>
      ${dbViews('table')}
      <div class="dt-chs">${list.map(c => `<a href="#/db?view=table&ch=${c.id}" class="${c.id === id ? 'on' : ''}">${esc(c.title.replace(/\s*·.*$/, ''))} <small>${c.n}</small></a>`).join('')}</div>
      <div class="db-bar"><input id="dtq" type="search" placeholder="ค้นในบทนี้: ชื่อยา กลไก SE…" value="${esc(params.get('q') || '')}">
        <label class="db-cv">Cover <select id="dtCv"><option value="">ไม่ปิด</option><option value="name">ชื่อยา</option>${DCOL.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}<option value="all">ทุกช่องยกเว้นชื่อ</option></select></label>
        <label class="db-cv"><input type="checkbox" id="dtAll" ${f.open ? 'checked' : ''}> แสดงเต็มทุกแถว</label></div>
      <div class="dt-gs" id="dtGs"></div><div class="dt-meta">${esc(ch.title)} · ${rows.length} ยา · ${curated ? 'ตารางคัดเอง' : 'รวมจากตารางยาในทุกกล่องของบทนี้'}</div><div id="dtBody"></div>`;
    $('#dtCv').value = f.cv || '';
    const body = $('#dtBody'), gs = $('#dtGs');
    const cvOn = k => f.cv === k || (f.cv === 'all' && k !== 'name');
    const cell = xs => xs.length ? `<div class="dt-c">${xs.map(x => `<div>${x}</div>`).join('')}</div>` : '<span class="dt-na">–</span>';
    const draw = () => {
      const q = $('#dtq').value.trim().toLowerCase();
      const hit = r => !q || (r.name + ' ' + r.g + ' ' + [...r.moa, ...r.use, ...r.se].join(' ').replace(/<[^>]+>/g, '')).toLowerCase().includes(q);
      let gi = 0;
      const html = order.map(g => {
        const rs = rows.filter(r => r.g === g && hit(r)); if (!rs.length) return '';
        gi++;
        return `<tbody class="dt-grp"><tr class="dt-g" id="dtg-${gi}" data-n="${esc(g)}"><th colspan="5">${esc(g)} <small>${rs.length} ยา</small></th></tr>` + rs.map(r => `<tr class="dt-r">
          <td class="dt-n${cvOn('name') ? ' cv' : ''}"><b>${r.nameH}</b>${r.ex ? `<span class="dt-ex">ออก ${r.ex} ข้อ</span>` : ''}</td>
          ${DCOL.map(([k, l]) => `<td data-l="${l}" class="${cvOn(k) && r[k].length ? 'cv' : r[k].length ? '' : 'dt-e'}">${cell(r[k])}</td>`).join('')}
          <td class="dt-b" data-l="กล่อง">${r.boxes.map(b => `<a href="#/${id}/${b}">${b}</a>`).join('')}</td></tr>`).join('') + '</tbody>';
      }).join('');
      body.innerHTML = html ? `<table class="dt${f.cv ? ' covering' : ''}${f.open ? ' dt-open' : ''}"><colgroup><col class="c-n"><col><col class="c-u"><col><col class="c-b"></colgroup><thead><tr><th>ยา</th>${DCOL.map(([, l]) => `<th>${l}</th>`).join('')}<th>กล่อง</th></tr></thead>${html}</table>` : `<p class="empty">ไม่เจอที่ค้น</p>`;
      gs.innerHTML = [...body.querySelectorAll('.dt-g')].map(x => `<a href="#" data-g="${x.id}">${esc(x.dataset.n.replace(/^.*›\s*/, ''))}</a>`).join('');
    };
    $('#dtq').oninput = draw;
    $('#dtCv').onchange = e => { f.cv = e.target.value; save(); draw(); };
    $('#dtAll').onchange = e => { f.open = e.target.checked ? 1 : 0; save(); draw(); };
    gs.onclick = e => { const a = e.target.closest('a'); if (!a) return; e.preventDefault(); const t = document.getElementById(a.dataset.g); if (t) scrollTo({ top: t.getBoundingClientRect().top + scrollY - 70, behavior: 'smooth' }); };
    body.addEventListener('click', e => {
      if (e.target.closest('a')) return;
      const c = e.target.closest('td.cv'); if (c && !c.classList.contains('shown')) { c.classList.add('shown'); return; }
      const r = e.target.closest('tr.dt-r'); if (r) r.classList.toggle('open');
    });
    draw();
  }
  /* ---------- Diagnosis flowchart (data/<id>-flows.json) ----------
     node = { t: ข้อความ, k: start|step|dx|out|tx, s: บรรทัดเล็ก, e: ป้ายบนเส้นจากกล่องแม่, c: [ลูก], then: กล่องถัดไปหลังทุกแขนงมาบรรจบ } */
  function flowNode(n) {
    const k = n.k || 'step';
    let h = `<div class="fn k-${k}"><span class="fn-t">${inline(esc(n.t || ''))}</span>${n.s ? `<small>${inline(esc(n.s))}</small>` : ''}</div>`;
    if (n.c && n.c.length) h += `<ul>${n.c.map(x => `<li>${x.e ? `<span class="fe">${inline(esc(x.e))}</span>` : ''}${flowNode(x)}</li>`).join('')}</ul>`;
    if (n.then) h += `<div class="fl-then">${n.then.e ? `<span class="fe">${inline(esc(n.then.e))}</span>` : ''}${flowNode(n.then)}</div>`;
    return `<div class="ft">${h}</div>`;
  }
  function flowHTML(f, hlk, extra) {
    return `<div class="flow" id="fl-${esc(f.id)}"${hlk ? ` data-hlk="${esc(hlk)}"` : ''}><div class="fl-h">${ic('flow')} <b>${inline(esc(f.title))}</b>${extra || ''}</div><div class="fl-scroll"><div class="fl-tree">${flowNode(f.root)}</div></div></div>`;
  }
  // แผนภาพที่กว้างกว่าจอ (มือถือ) ขึ้นป้ายบอกให้เลื่อนด้านข้าง
  function flowHints(root) { root.querySelectorAll('.flow').forEach(x => { const sc = x.querySelector('.fl-scroll'); x.classList.toggle('fl-wide', sc.scrollWidth > sc.clientWidth + 2); }); }
  async function vFlows(params) {
    await loadAll(); renderSidebar(params.get('ch') || undefined);
    const chs = loadedCH().filter(c => c.flows && c.flows.length);
    const f = S.flf || (S.flf = { cover: 0 });
    const sel = params.get('ch') && chs.some(c => c.id === params.get('ch')) ? params.get('ch') : '';
    const total = chs.reduce((a, c) => a + c.flows.length, 0);
    view.innerHTML = `<div class="hero"><h1>🩺 Diagnosis flowchart</h1><p>ขั้นตอนวินิจฉัยของทุกบทเป็นภาพ ${total} แผนภาพ · เปิด Cover แล้วแตะกล่องผลเพื่อท่องทีละขั้น · กดเลขกล่องเพื่อกลับไปอ่านเนื้อหา</p></div>
      <div class="db-bar"><input id="flq" type="search" placeholder="ค้น เช่น cortisol, Cushing, Ca…">
        <label class="db-cv"><input type="checkbox" id="flCover" ${f.cover ? 'checked' : ''}> Cover ผลวินิจฉัย</label></div>
      ${chs.length > 1 ? `<div class="db-chs-wrap"><div class="sel-bar"><small class="bar-label">กรองตามบท</small>${selActs('flChs')}</div><div class="db-chs" id="flChs">${chs.map(c => `<label><input type="checkbox" value="${c.id}" ${!sel || sel === c.id ? 'checked' : ''}> ${esc(c.id.toUpperCase())} <small>(${c.flows.length})</small></label>`).join('')}</div></div>` : ''}
      <div class="dt-gs" id="flGs"></div><div id="flBody"></div>`;
    const body = $('#flBody'), gs = $('#flGs');
    const draw = () => {
      const q = $('#flq').value.trim().toLowerCase();
      const on = new Set([...view.querySelectorAll('#flChs input:checked')].map(x => x.value));
      const anyCh = !view.querySelector('#flChs') || on.size > 0;
      const single = on.size === 1;
      const txt = n => [n.t, n.s, n.e, ...(n.c || []).map(txt), n.then ? txt(n.then) : ''].filter(Boolean).join(' ');
      let html = '';
      for (const ch of chs) {
        if (view.querySelector('#flChs') && !on.has(ch.id)) continue;
        const fs = ch.flows.filter(x => !q || (x.title + ' ' + (x.cat || '') + ' ' + txt(x.root)).toLowerCase().includes(q)); if (!fs.length) continue;
        html += `<h2 class="fl-ch">${esc(ch.title)}</h2>`;
        let cat = null;
        for (const x of fs) {
          if (x.cat && x.cat !== cat) { cat = x.cat; html += `<h3 class="fl-cat" id="flc-${esc(ch.id)}-${esc(cat).replace(/[^\w\u0E00-\u0E7F]+/g, '')}" data-n="${esc(single ? cat : ch.id.toUpperCase() + ' · ' + cat)}">${esc(cat)}</h3>`; }
          html += flowHTML(x, '', `<a class="fl-box" href="#/${ch.id}/${x.box}" title="ไปที่กล่อง ${x.box}">${ch.id.toUpperCase()}·${x.box}</a>`);
        }
      }
      body.innerHTML = html || `<p class="empty">${anyCh ? 'ไม่เจอที่ค้น' : 'ยังไม่ได้เลือกบท — ติ๊กเลือกบทที่ต้องการด้านบน'}</p>`;
      body.classList.toggle('fl-covering', !!f.cover);
      flowHints(body);
      gs.innerHTML = [...body.querySelectorAll('.fl-cat')].map(x => `<a href="#" data-g="${x.id}">${esc(x.dataset.n)}</a>`).join('');
    };
    const syncFlUrl = () => {
      const on = [...view.querySelectorAll('#flChs input:checked')].map(x => x.value);
      history.replaceState(null, '', on.length === 1 ? `#/flows?ch=${on[0]}` : '#/flows');
    };
    $('#flq').oninput = draw;
    view.querySelectorAll('#flChs input').forEach(x => x.onchange = () => { syncFlUrl(); draw(); });
    bindSelActs(view, () => { syncFlUrl(); draw(); });
    $('#flCover').onchange = e => { f.cover = e.target.checked ? 1 : 0; save(); draw(); };
    gs.onclick = e => { const a = e.target.closest('a'); if (!a) return; e.preventDefault(); const t = document.getElementById(a.dataset.g); if (t) scrollTo({ top: t.getBoundingClientRect().top + scrollY - 110, behavior: 'smooth' }); };
    body.addEventListener('click', e => { const n = e.target.closest('.fl-covering .fn.k-dx, .fl-covering .fn.k-out'); if (n) n.classList.toggle('shown'); });
    draw();
  }
  /* ---------- Numbers: cutpoint · ค่าปกติ · สูตร ของทุกบท (data/<id>-numbers.json) ---------- */
  async function vNumbers(params) {
    await loadAll(); renderSidebar();
    const all = loadedCH().flatMap(ch => (ch.numbers || []).map(x => Object.assign({ ch: ch.id }, x)));
    const f = S.nuf || (S.nuf = { k: 'all', cover: 0 });
    const chs = [...new Set(all.map(x => x.ch))];
    const n = k => all.filter(x => k === 'all' || x.t === k).length;
    view.innerHTML = `<div class="hero"><h1>🔢 Numbers</h1><p>ตัวเลข cutpoint ค่าปกติ และสูตรคำนวณของทุกบทในหน้าเดียว · เปิด Cover mode แล้วแตะทีละช่องเพื่อท่อง · เพิ่มบทใหม่แล้วหน้านี้อัปเดตเอง</p></div>
      <div class="db-bar"><div class="seg">${[['all', 'All'], ['cut', 'Cutpoints'], ['f', 'Formulas']].map(([k, l]) => `<button class="${f.k === k ? 'on' : ''}" data-k="${k}">${l} <small>${n(k)}</small></button>`).join('')}</div>
        <input id="nuq" type="search" placeholder="ค้น เช่น PaO2, Light, FEV1…">
        <label class="db-cv"><input type="checkbox" id="nuCover" ${f.cover ? 'checked' : ''}> Cover mode</label></div>
      ${chs.length > 1 ? `<div class="db-chs-wrap"><div class="sel-bar"><small class="bar-label">กรองตามบท</small>${selActs('nuChs')}</div><div class="db-chs" id="nuChs">${chs.map(c => `<label><input type="checkbox" value="${c}" checked> ${c.toUpperCase()}</label>`).join('')}</div></div>` : ''}
      <div class="nu-grid" id="nuGrid"></div>`;
    const grid = $('#nuGrid');
    const draw = () => {
      const q = $('#nuq').value.trim().toLowerCase();
      const on = new Set([...view.querySelectorAll('#nuChs input:checked')].map(x => x.value));
      const anyCh = !view.querySelector('#nuChs') || on.size > 0;
      const list = all.filter(x => (f.k === 'all' || x.t === f.k) && (!view.querySelector('#nuChs') || on.has(x.ch)) && (!q || (x.cat + ' ' + x.name + ' ' + x.v + ' ' + (x.note || '')).toLowerCase().includes(q)));
      const groups = {}; list.forEach(x => (groups[(x.t === 'f' ? 'สูตร · ' : '') + x.cat] = groups[(x.t === 'f' ? 'สูตร · ' : '') + x.cat] || []).push(x));
      grid.innerHTML = Object.entries(groups).map(([g, xs]) => `<section class="nu-card ${xs[0].t === 'f' ? 'f' : ''}"><h3>${esc(g)}</h3>${xs.map(x => `<div class="nu-row"><div class="nu-n">${esc(x.name)} <a href="#/${x.ch}/${x.box}" title="ไปที่กล่อง ${x.box}">${x.ch.toUpperCase()}·${x.box}</a></div><div class="nu-v${x.t === 'f' ? ' flow' : ''}">${inline(esc(x.v))}</div>${x.note ? `<div class="nu-note">${inline(esc(x.note))}</div>` : ''}</div>`).join('')}</section>`).join('') || `<p class="empty">${anyCh ? 'ไม่เจอที่ค้น' : 'ยังไม่ได้เลือกบท — ติ๊กเลือกบทที่ต้องการด้านบน'}</p>`;
      grid.classList.toggle('covering', !!f.cover);
    };
    view.querySelectorAll('.seg button').forEach(b => b.onclick = () => { f.k = b.dataset.k; save(); view.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === b)); draw(); });
    $('#nuq').oninput = draw;
    $('#nuCover').onchange = e => { f.cover = e.target.checked ? 1 : 0; save(); draw(); };
    view.querySelectorAll('#nuChs input').forEach(x => x.onchange = draw);
    bindSelActs(view, draw);
    grid.addEventListener('click', e => { if (!f.cover) return; const v = e.target.closest('.nu-v'); if (v) v.classList.toggle('shown'); });
    draw();
  }
  function runDrill(qs) {
    let i = 0, score = 0; const miss = [];
    const step = () => {
      if (i >= qs.length) {
        view.innerHTML = `<div class="hero"><h1>🧠 Drill result</h1><p>ถูก ${score} จาก ${qs.length} (${Math.round(score * 100 / qs.length)}%)</p></div>`
          + (miss.length ? `<div class="panel"><h3>ที่พลาด ทวนอีกที</h3>${miss.map(q => `<div class="dr-miss"><b>${esc(q.q)}</b> → <span>${esc(q.ask)}:</span> ${esc(q.ans)} <a href="#/${q.T.ch}/${q.T.box}">กล่อง ${q.T.box} ↗</a></div>`).join('')}</div>` : '')
          + `<div class="choice"><a class="btn primary" href="#/drill">New drill</a>${miss.length ? '<button class="btn" id="dAgain">Retry misses</button>' : ''}</div>`;
        const ag = $('#dAgain'); if (ag) ag.onclick = () => runDrill(shuffle(miss.slice()));
        return;
      }
      const q = qs[i], key = `${q.T.ch}|${q.T.box}|${q.T.ti}|${q.ri}|${q.j}|${q.dir}`;
      view.innerHTML = `<div class="qhead"><span>Drill ${i + 1} / ${qs.length}</span><span>ถูก ${score}</span></div><div class="bar walk"><i style="width:${Math.round(i * 100 / qs.length)}%"></i></div>
        <div class="mcq drill"><div class="qid">กล่อง ${q.T.box} · ${esc(q.T.title)}</div>
        <div class="dq"><span class="dq-k">${esc(q.dir === 'f' ? q.T.head[0] : q.ask === q.T.head[0] ? q.T.head[q.j] : q.T.head[q.j])}</span><div class="dq-v">${esc(q.q)}</div><div class="dq-ask">${q.dir === 'f' ? 'มี ' : 'คือ '}<b>${esc(q.ask)}</b> อะไร?</div></div>
        <div class="opts">${q.opts.map((o, k) => `<div class="opt" role="button" data-o="${k}"><span class="l">${'ABCD'[k]}</span><span class="ot">${esc(o)}</span></div>`).join('')}</div><div class="explain" hidden></div></div>
        <div class="choice" style="justify-content:flex-end"><button class="btn" id="dNext">Skip</button></div>`;
      const box = $('.mcq.drill', view);
      box.querySelectorAll('.opt').forEach(o => o.onclick = () => {
        if (box.dataset.done) return; box.dataset.done = 1;
        const ok = q.opts[+o.dataset.o] === q.ans;
        box.querySelectorAll('.opt').forEach(x => { x.classList.add('off'); if (q.opts[+x.dataset.o] === q.ans) x.classList.add('right'); else if (x === o) x.classList.add('wrong'); });
        S.drillWrong = S.drillWrong || {};
        if (ok) { score++; delete S.drillWrong[key]; } else { miss.push(q); S.drillWrong[key] = Date.now(); }
        save();
        const row = q.T.rows[q.ri];
        const ex = box.querySelector('.explain'); ex.hidden = false;
        ex.innerHTML = `<div class="res ${ok ? 'ok' : 'no'}">${ok ? '✓ Correct' : '✗ ' + esc(q.ans)}</div><div class="dr-row">${q.T.head.map((hh, k) => `<div><span>${esc(hh)}</span>${esc(row[k] || '')}</div>`).join('')}</div>`;
        const nb = $('#dNext'); nb.textContent = i + 1 < qs.length ? 'Next →' : 'See result'; nb.classList.add('primary');
      });
      $('#dNext').onclick = () => { i++; step(); scrollTo(0, 0); };
    };
    step();
  }
  async function vSearch(q) {
    await loadAll(); renderSidebar();
    q = (q || '').trim();
    $('#searchInput').value = q;
    if (!q) { view.innerHTML = '<p class="empty">พิมพ์คำที่ต้องการค้นหา</p>'; return; }
    const ql = q.toLowerCase(); const hits = [];
    for (const ch of loadedCH()) {
      for (const s of ch.sections) {
        const hay = (s.title + ' ' + s.kw.join(' ') + ' ' + s.text).replace(/\*\*|==|`|\{[ESX]\}/g, '').replace(/\s+/g, ' ');
        const pos = hay.toLowerCase().indexOf(ql);
        if (pos >= 0) hits.push({ ch, s, snip: hay.slice(Math.max(0, pos - 60), pos + 90) });
      }
      for (const [qid, e] of Object.entries(ch.exams)) {
        const hay = e.stem + ' ' + Object.values(e.options || {}).join(' ');
        if (hay.toLowerCase().includes(ql)) hits.push({ ch, s: ch.sections.find(x => x.no === +e.box), snip: `ข้อสอบ ${qid}: ${e.stem}`, ex: true });
      }
    }
    const hl = t => esc(t).replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), m => `<mark>${m}</mark>`);
    const hasKey = !!(S.geminiKey && S.geminiKey.trim());
    const aiCard = `<div class="panel ai-card"><div class="ai-card-h"><b>✨ Gemini สรุปคำตอบ</b><button class="btn small" id="srGoogle">Google ↗</button></div><div id="srAiBody">${hasKey ? '<div class="ai-run-slot"></div><div class="ai-body" hidden></div>' : '<p class="muted" style="margin:4px 0 0;font-size:14px">ยังไม่ได้ใส่ Gemini API Key (ฟรี) · <a href="#/sync">ตั้งค่าที่หน้า ☁️ Sync</a> เพื่อให้ขึ้นคำตอบจาก Gemini ตรงนี้ทันทีทุกครั้งที่ค้นหา</p>'}</div></div>`;
    view.innerHTML = `<div class="hero"><h1>ค้นหา “${esc(q)}”</h1><p>เจอในตำรา ${hits.length} ที่</p></div>${aiCard}` + hits.filter(x => x.s).map(x => `<a class="search-hit" href="#/${x.ch.id}/${x.s.no}"><b>${x.s.no}. ${esc(x.s.title)}</b> · ${esc(x.ch.title)}<small>…${hl(x.snip)}…</small></a>`).join('');
    const bG = $('#srGoogle'); if (bG) bG.onclick = () => searchOut(q);
    if (hasKey) {
      const box = $('#srAiBody');
      const runSlot = box.querySelector('.ai-run-slot');
      const bodyEl = box.querySelector('.ai-body');
      const run = startAiRun(runSlot);
      let lastPaint = 0;
      const paint = txt => {
        if (!box || !box.isConnected) return;
        bodyEl.hidden = false;
        bodyEl.innerHTML = aiFormat(txt);
      };
      askGemini(q, '', txt => {
        if (!box || !box.isConnected) return;
        run.stream(txt.length);
        const now = Date.now();
        if (now - lastPaint > 70) { lastPaint = now; paint(txt); }
      }).then(res => {
        if (!box || !box.isConnected) return;
        run.done();
        paint(res.text);
        const foot = document.createElement('div');
        foot.className = 'ai-foot';
        foot.innerHTML = '<button class="btn small" id="srCp">📋 คัดลอกคำตอบ</button>';
        box.appendChild(foot);
        const bCp = $('#srCp'); if (bCp) bCp.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(res.text.replace(/\*\*/g, '')).then(() => toast('คัดลอกคำตอบแล้ว')).catch(() => {}); };
      }).catch(e => {
        if (!box || !box.isConnected) return;
        run.stop();
        box.innerHTML = `<div class="ai-err">⚠️ ${esc(e.message)} · <a href="#/sync">เช็ก API Key</a></div>`;
      });
    }
  }

  /* ---------- router ---------- */
  async function route() {
    stopExamBreakGame();
    closeNav();
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, qs] = raw.split('?');
    const params = new URLSearchParams(qs || '');
    const parts = path.split('/').filter(Boolean);
    try {
      await loadIndex();
      if (!parts.length) return vHome();
      if (parts[0] === 'quiz') return vQuiz(params);
      if (parts[0] === 'wrong') return vWrong();
      if (parts[0] === 'cards') return vCards(params);
      if (parts[0] === 'search') return vSearch(params.get('q'));
      if (parts[0] === 'stats') return vStats();
      if (parts[0] === 'notes') return vNotes();
      if (parts[0] === 'keywords') return vKeywords();
      if (parts[0] === 'review') return vReview();
      if (parts[0] === 'drill') return vDrill(params);
      if (parts[0] === 'db') { const v = params.get('view') || S.dbView || 'cards'; S.dbView = v; save(); return v === 'table' ? vDrugs(params.get('ch'), params) : vDB(params); }
      if (parts[0] === 'numbers') return vNumbers(params);
      if (parts[0] === 'flows') return vFlows(params);
      if (parts[0] === 'drugs') return vDrugs(parts[1], params);
      if (parts[0] === 'sync') return vSync();
      if (parts[0] === 'backup') return vBackup();
      if (parts[0] === 'map' && parts[1]) return vMap(parts[1]);
      if (parts[1]) return vSection(parts[0], parseInt(parts[1]));
      return vChapter(parts[0]);
    } catch (err) {
      console.error(err);
      view.innerHTML = `<p class="empty">โหลดข้อมูลไม่สำเร็จ (${esc(err.message)})<br>ถ้าเปิดไฟล์จากเครื่องโดยตรง ให้เปิดผ่านลิงก์เว็บแทน</p>`;
    }
  }
  /* ย้อนกลับไปหน้าเดิม + ตำแหน่งเดิมเสมอ · จำจุดที่อ่านล่าสุดไว้ให้ "อ่านต่อ" */
  let curHash = location.hash, curY = 0, backY = null, goingBack = false, lrT;
  const hist = (() => { try { return JSON.parse(sessionStorage.getItem('nle-back') || '[]'); } catch (e) { return []; } })();
  const saveHist = () => { try { sessionStorage.setItem('nle-back', JSON.stringify(hist.slice(-40))); } catch (e) {} syncBack(); };
  function syncBack() { const b = document.getElementById('backBtn'); if (b) b.classList.toggle('dim', !hist.length); }
  addEventListener('scroll', () => {
    curY = scrollY;
    if (/^#\/[^/]+\/\d+$/.test(location.hash)) {
      clearTimeout(lrT); lrT = setTimeout(() => { S.lastRead = { h: location.hash, y: Math.round(scrollY) }; (S.lastByCh = S.lastByCh || {})[location.hash.split('/')[1]] = location.hash; save(); }, 500);
    }
  }, { passive: true });
  iconize(document.querySelector('.topbar'));
  window.addEventListener('hashchange', () => {
    if (!goingBack && curHash !== location.hash) { hist.push({ h: curHash || '#/', y: Math.round(curY) }); saveHist(); }
    goingBack = false; curHash = location.hash; hidePop();
    const y = backY; backY = null;
    route().then(() => { if (y != null) setTimeout(() => scrollTo(0, y), 30); });
  });
  function goBack(e) {
    if (e) e.preventDefault(); hidePop();
    const last = hist.pop(); saveHist(); if (!last) return toast('No previous page');
    goingBack = true; backY = last.y;
    if (location.hash === last.h || (!location.hash && last.h === '#/')) { goingBack = false; route().then(() => scrollTo(0, last.y)); curHash = last.h; }
    else location.hash = last.h;
  }
  document.getElementById('backBtn').addEventListener('click', goBack);
  syncBack();
  // อ่านต่อจากจุดล่าสุด
  document.addEventListener('click', e => {
    const a = e.target.closest('#resumeBtn'); if (!a || !S.lastRead) return;
    e.preventDefault(); backY = S.lastRead.y; location.hash = S.lastRead.h;
  });
  $('#menuBtn').onclick = () => document.body.classList.toggle('nav-open');
  $('#scrim').onclick = closeNav;
  sidebar.addEventListener('click', e => {
    if (e.target.closest('#mvMapToggle')) {
      e.preventDefault(); S.mvMapHide = !S.mvMapHide; save();
      const m = location.hash.match(/^#\/([^/]+)(?:\/(\d+))?/);
      renderSidebar(m && CH[m[1]] ? m[1] : undefined, m && m[2] ? +m[2] : undefined);
      return;
    }
    if (e.target.closest('#uiToggle')) {
      e.preventDefault(); setUiStyle(uiStyle() === 'pixel' ? 'monument' : 'pixel'); return;
    }
    const hl = e.target.closest('#hlToggle');
    if (!hl) return;
    e.preventDefault(); S.hlOff = !S.hlOff; save();
    document.documentElement.classList.toggle('no-hl', S.hlOff);
    hl.textContent = `🖍 Auto highlight: ${S.hlOff ? 'OFF' : 'ON'}`;
  });
  $('#searchForm').onsubmit = e => { e.preventDefault(); location.hash = '#/search?q=' + encodeURIComponent($('#searchInput').value); };
  const themeBtn = $('#themeBtn');
  const isDark = () => document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const syncTheme = () => { themeBtn.textContent = isDark() ? '☀️' : '🌙'; };
  themeBtn.onclick = () => { S.theme = isDark() ? 'light' : 'dark'; document.documentElement.dataset.theme = S.theme; save(); syncTheme(); if (uiStyle() === 'monument') rerender(); };
  syncTheme(); applyUiStyle();
  $('#fontBtn').onclick = () => { const sizes = [15, 17, 19, 21]; const cur = S.font || 17; S.font = sizes[(sizes.indexOf(cur) + 1) % sizes.length]; document.documentElement.style.setProperty('--fs', S.font + 'px'); save(); };
  updateWrongCount();
  function updateAuthBtn(st) {
    const b = $('#authBtn'); if (!b) return;
    if (st && st.user) {
      const dotCls = st.status === 'synced' ? 'ok' : (st.status === 'syncing' || st.status === 'connecting') ? 'busy' : st.status === 'error' ? 'err' : '';
      const lbl = st.status === 'syncing' ? 'Syncing' : st.status === 'offline' ? 'Offline' : 'Synced';
      b.innerHTML = `${st.user.photoURL ? `<img class="auth-ava" src="${esc(st.user.photoURL)}" alt="" referrerpolicy="no-referrer">` : '👤'}<span>${lbl}</span><i class="sync-dot ${dotCls}"></i>`;
      b.title = `${st.user.displayName} (${st.user.email}) · ${lbl}`;
    } else {
      b.innerHTML = `☁️<span>${st && st.configured ? 'Login' : 'Sync'}</span>`;
      b.title = 'Google Sync & App';
    }
  }
  if (window.NLE_SYNC) {
    window.NLE_SYNC.init({
      getS: () => S,
      saveLocalOnly,
      replaceS: newS => {
        for (const k of Object.keys(S)) delete S[k];
        Object.assign(S, newS);
        ensureS();
        saveLocalOnly();
        if (S.theme) document.documentElement.dataset.theme = S.theme;
        if (S.font) document.documentElement.style.setProperty('--fs', S.font + 'px');
        document.documentElement.classList.toggle('no-hl', !!S.hlOff);
        document.body.classList.toggle('focus', !!S.focus);
        syncTheme(); applyUiStyle();
        route();
      },
      hasData,
      idb: IDB,
      toast,
      onImagesPulled: () => {
        // วาดรูปใหม่ถ้าหน้าปัจจุบันมีรูปที่เคยขึ้น missing
        if (view.querySelector('.uimg.missing')) route();
      },
      onChange: st => {
        updateAuthBtn(st);
        if (INDEX && location.hash.replace(/^#\/?/, '').split('?')[0] === 'sync') vSync();
      }
    });
  }
  route();
})();
