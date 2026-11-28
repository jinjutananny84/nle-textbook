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
    S.done = S.done || {}; S.lvl = S.lvl || {}; S.lvl2 = S.lvl2 || {}; for (const k in S.done) { if (!S.lvl[k]) S.lvl[k] = 4; } S.done = {};
    S.wrong = S.wrong || {}; S.known = S.known || {}; S.stats = S.stats || {}; S.notes = S.notes || {};
    S.hl = S.hl || {}; S.kw = S.kw || []; S.srs = S.srs || {}; S.figw = S.figw || {}; S.ans = S.ans || {}; S.flag = S.flag || {};
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
  const CH_PROM = {};
  let _globalAbbrProm = null;
  async function loadChapter(id) {
    if (CH[id]) return CH[id];
    const fast = typeof draftOn === 'function' && draftOn('fastSidebarNav');
    if (fast && CH_PROM[id]) return CH_PROM[id];
    const meta = INDEX.find(c => c.id === id);
    if (!meta || !meta.ready) return null;
    const job = (async () => {
      const fOpt = fast ? undefined : { cache: 'no-cache' };
      const j = u => fetch(u, fOpt).then(r => r.ok ? r.json() : {}).catch(() => ({}));
      const gaP = fast ? (_globalAbbrProm || (_globalAbbrProm = j('data/abbr.json'))) : j('data/abbr.json');
      const [md, ex, ga, ca, nu, fl] = await Promise.all([
        fetch(`data/${id}.md`, fOpt).then(r => r.text()),
        j(`data/${id}-exams.json`), gaP, j(`data/${id}-abbr.json`), j(`data/${id}-numbers.json`), j(`data/${id}-flows.json`)
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
    })();
    if (fast) {
      CH_PROM[id] = job;
      job.finally(() => { delete CH_PROM[id]; });
    }
    return job;
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
  const lv1Of = (c, no) => S.lvl[secKey(c, no)] || 0;
  const lv2Of = (c, no) => (typeof draftOn === 'function' && draftOn('round2Rating')) ? ((S.lvl2 && S.lvl2[secKey(c, no)]) || 0) : 0;
  const lvOf = (c, no) => lv2Of(c, no) || lv1Of(c, no);
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
    const allLvKeys = new Set([...Object.keys(S.lvl), ...((typeof draftOn === 'function' && draftOn('round2Rating')) ? Object.keys(S.lvl2 || {}) : [])]);
    for (const k of allLvKeys) { const l = ((typeof draftOn === 'function' && draftOn('round2Rating')) && S.lvl2 && S.lvl2[k]) || S.lvl[k]; if (((l >= 1 && l <= 3) || l === 5) && due('b:' + k)) out.push({ type: 'box', id: 'b:' + k, k, l }); }
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
  const APP_VER = '71';
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
            const l1 = lv1Of(ch.id, s.no), l2 = lv2Of(ch.id, s.no);
            const l = l2 || l1;
            const dual = draftOn('round2Rating') && l1 && l2;
            const isOn = s.no === curNo;
            const lit = isOn || !!l || (curPos >= 0 && gIdx <= curPos);
            const zig = isMv ? (gIdx % 2 ? ' mz-r' : ' mz-l') : '';
            const node = isMv ? `<span class="mz-node${isOn ? ' on' : ''}${l ? ' lv' + l : ''}" aria-hidden="true">${isOn ? MV_MINI_HERO : '<i class="mz-gem"></i>'}</span>` : '';
            const dualStyle = dual ? ` style="--lv-l:var(--lv${l1}s);--lv-r:var(--lv${l2}s);--lv-lb:var(--lv${l1});--lv-rb:var(--lv${l2})"` : '';
            const dualCls = dual ? ` lv-dual${l1 === 1 ? ' lv-l1' : ''}${l2 === 1 ? ' lv-r1' : ''}` : (l ? ` lv${l}` : '');
            const ckHtml = dual
              ? `<span class="ck ck-dual" title="รอบ 1: ${LV[l1].s} → รอบ 2: ${LV[l2].s}"><small>R2</small>${LV[l2].s}</span>`
              : (l ? `<span class="ck">${LV[l].s}</span>` : '');
            out += `<a class="side-sec${isOn ? ' on' : ''}${dualCls}${zig}${lit ? ' mz-lit' : ''}"${dualStyle} href="#/${ch.id}/${s.no}">${node}<span class="n">${s.no}</span><span class="t">${esc(s.title)}</span>${boxScore(ch.id, s)}${ckHtml}</a>`;
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
    const flagged = !!S.flag[k];
    return `<div class="mcq" data-ch="${chId}" data-q="${esc(qid)}"${saved ? ' data-done="1"' : ''}${opts.showSaved ? ' data-saved-mode="1"' : ''}>
      <div class="qid">ข้อ ${esc(qid)} ${src} ${wasWrong} ${opts.showBox ? `<a class="src" href="#/${chId}/${q.box}">กล่อง ${q.box}</a>` : ''}<button type="button" class="flag-btn${flagged ? ' on' : ''}" data-flag="${esc(k)}" title="ปักหมุดไว้ทวน (เดาถูก/ยังไม่ชัวร์)">🚩${flagged ? ' ปักหมุดแล้ว' : ''}</button></div>
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
    if (box.dataset.savedMode === '1') maybeShowBoxExamRes();
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
    const fl = e.target.closest('[data-flag]');
    if (fl) {
      const k = fl.dataset.flag, [ch, ...rest] = k.split('|'), id = rest.join('|');
      if (S.flag[k]) { delete S.flag[k]; fl.classList.remove('on'); fl.textContent = '🚩'; toast('เอาหมุดออกแล้ว'); }
      else { S.flag[k] = { ch, id, t: Date.now() }; fl.classList.add('on'); fl.textContent = '🚩 ปักหมุดแล้ว'; toast('🚩 ปักหมุดไว้ทวนแล้ว'); }
      save();
      return;
    }
    const rd = e.target.closest('[data-redo]');
    if (rd) { const box = rd.closest('.mcq'); if (box) resetMCQ(box); return; }
    const rdAll = e.target.closest('#redoBoxExams');
    if (rdAll) {
      view.querySelectorAll('.exam-sec .mcq[data-done]').forEach(b => resetMCQ(b));
      rdAll.hidden = true;
      const br = $('#boxExamRes'); if (br) br.innerHTML = '';
      toast('ล้างคำตอบในกล่องนี้แล้ว ทำใหม่ได้เลย');
      return;
    }
    const stk = e.target.closest('.strike');
    if (stk) { const o = stk.closest('.opt'); if (!o.classList.contains('off')) o.classList.toggle('struck'); return; }
    const opt = e.target.closest('.opt');
    if (opt && !opt.classList.contains('off')) { if (!getSelection().isCollapsed) return; const box = opt.closest('.mcq'); if (box.classList.contains('mock-pending')) return; answerMCQ(box, opt.dataset.l, box._onDone); return; }
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
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    crown: '<path d="M3 18h18l1-10-5 4-5-7-5 7-5-4z"/><path d="M5 20.5h14"/>',
    rocket: '<path d="M12 2.5c3.5 2.5 5 6.5 5 11l-5 3-5-3c0-4.5 1.5-8.5 5-11z"/><path d="M7 13.5 4 16.5v3l3-1.5M17 13.5l3 3v3l-3-1.5M10 18.5l2 3 2-3"/><circle cx="12" cy="9.5" r="1.5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a13 13 0 0 1 0 18M12 3a13 13 0 0 0 0 18"/>',
    tag: '<path d="M3.5 11.5V4h7.5l9.5 9.5-7.5 7.5z"/><circle cx="8" cy="8.5" r="1.3" fill="currentColor" stroke="none"/>',
    link: '<path d="M10 14a4.5 4.5 0 0 1 0-6.4l2.2-2.2a4.5 4.5 0 1 1 6.4 6.4L17 13.4M14 10a4.5 4.5 0 0 1 0 6.4l-2.2 2.2a4.5 4.5 0 1 1-6.4-6.4L7 10.6"/>',
    coral: '<path d="M12 21V9M12 14l-5-4V6M12 12l5-4V5M9 17l-4-2M15 16l4-2M6 21h12"/>',
    fish: '<path d="M3 12c3.5-4.5 9-5 13-1.5L21 7v10l-5-3.5C12 17 6.5 16.5 3 12Z"/><circle cx="8" cy="11.2" r="1" fill="currentColor" stroke="none"/>',
    bubble: '<circle cx="9.5" cy="14" r="5"/><circle cx="16.5" cy="8.5" r="3"/><circle cx="17.5" cy="16" r="2"/>',
    whale: '<path d="M3 14c0-4.5 4-7.5 10-7.5 3.5 0 6 1.5 7 4l1.5-2.5 1 4.5c-1.5 2-4 3-7 3H6.5C4.5 15.5 3 15 3 14Z"/><circle cx="8" cy="12" r="1" fill="currentColor" stroke="none"/>',
    dna: '<path d="M7 3c0 5 10 5 10 10s-10 5-10 8M17 3c0 5-10 5-10 10s10 5 10 8M8 6.5h8M9 12h6M8 17.5h8"/>'
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
    user: '<polygon points="12,2.5 15,8.5 9,8.5" fill="currentColor" fill-opacity=".22"/><polygon points="12,2.5 15,8.5 9,8.5"/><polygon points="12,10.5 17.5,21 6.5,21" fill="currentColor" fill-opacity=".14"/><polygon points="12,10.5 17.5,21 6.5,21"/>',
    crown: '<polygon points="3.5,18 20.5,18 21.5,8 16.5,12.5 12,5 7.5,12.5 2.5,8" fill="currentColor" fill-opacity=".18"/><polygon points="3.5,18 20.5,18 21.5,8 16.5,12.5 12,5 7.5,12.5 2.5,8"/><path d="M4.5 20.5h15"/><polygon points="12,11.5 13.4,13.5 12,15.5 10.6,13.5" fill="currentColor" stroke="none"/>',
    rocket: '<polygon points="12,2.5 16.5,8.5 16.5,15.5 12,18 7.5,15.5 7.5,8.5" fill="currentColor" fill-opacity=".14"/><polygon points="12,2.5 16.5,8.5 16.5,15.5 12,18 7.5,15.5 7.5,8.5"/><path d="M7.5 13.5 4 17v2.5l3.5-1.5M16.5 13.5 20 17v2.5l-3.5-1.5M12 18v3.5"/><polygon points="12,8 13.6,10 12,12 10.4,10" fill="currentColor" stroke="none"/>',
    globe: '<polygon points="12,2.5 21.5,12 12,21.5 2.5,12" fill="currentColor" fill-opacity=".1"/><polygon points="12,2.5 21.5,12 12,21.5 2.5,12"/><path d="M2.5 12h19M12 2.5v19"/><polygon points="12,7 17,12 12,17 7,12"/>',
    tag: '<polygon points="3.5,4 11,4 20.5,13.5 13,21 3.5,11.5" fill="currentColor" fill-opacity=".12"/><polygon points="3.5,4 11,4 20.5,13.5 13,21 3.5,11.5"/><polygon points="8,7.2 9.3,8.5 8,9.8 6.7,8.5" fill="currentColor" stroke="none"/>',
    link: '<polygon points="11.5,6.5 15.5,2.5 21.5,8.5 17.5,12.5" fill="currentColor" fill-opacity=".12"/><polygon points="11.5,6.5 15.5,2.5 21.5,8.5 17.5,12.5"/><polygon points="6.5,11.5 2.5,15.5 8.5,21.5 12.5,17.5" fill="currentColor" fill-opacity=".12"/><polygon points="6.5,11.5 2.5,15.5 8.5,21.5 12.5,17.5"/><path d="m9 15 6-6"/>',
    coral: '<polygon points="12,18 18,21 6,21" fill="currentColor" fill-opacity=".16"/><path d="M12 20V8l-2-3M12 14l-4.5-3.5V6.5M12 12l4.5-3.5V5M7.5 10.5l-2.5-.5M16.5 8.5l2.5-.5M5 21h14"/>',
    fish: '<polygon points="3,12 10,7 16,12 10,17" fill="currentColor" fill-opacity=".16"/><polygon points="3,12 10,7 16,12 10,17"/><polygon points="16,12 21,8 21,16"/><circle cx="8" cy="11.5" r="1" fill="currentColor" stroke="none"/>',
    bubble: '<polygon points="9.5,9 14,13.5 9.5,18 5,13.5" fill="currentColor" fill-opacity=".14"/><polygon points="9.5,9 14,13.5 9.5,18 5,13.5"/><polygon points="16.5,5.5 19.5,8.5 16.5,11.5 13.5,8.5"/><circle cx="17.5" cy="16" r="1.5"/>',
    whale: '<polygon points="3,14 8,7.5 17,9 21,6.5 20,13.5 14,16.5 5,16.5" fill="currentColor" fill-opacity=".14"/><polygon points="3,14 8,7.5 17,9 21,6.5 20,13.5 14,16.5 5,16.5"/><circle cx="8.5" cy="12" r="1" fill="currentColor" stroke="none"/>',
    dna: '<polygon points="12,3 17,8 12,13 7,8" fill="currentColor" fill-opacity=".14"/><polygon points="12,11 17,16 12,21 7,16" fill="currentColor" fill-opacity=".14"/><path d="M7 4 17 12 7 20M17 4 7 12 17 20"/>'
  };
  const EMO = { '☁': 'cloud', '🩺': 'flow', '💾': 'save', '🔢': 'hash', '💊': 'pill', '🧠': 'brain', '🖼': 'img', '🏠': 'home', '📝': 'quiz', '📕': 'wrong', '🃏': 'cards', '📊': 'stats', '📅': 'cal', '🗒': 'note', '🔑': 'key', '🗺': 'map', '🖍': 'hl', '🔍': 'search', '📖': 'book', '🔥': 'flame', '🎉': 'done', '🤔': 'think', '⚠': 'warn', '📌': 'pin', '📍': 'pin', '☀': 'sun', '🌙': 'moon', '↩': 'back', '✨': 'spark', '🎬': 'clip', '🎯': 'target', '📋': 'clipb', '⚙': 'gear', '✂': 'crop', '🎨': 'palette', '📲': 'phone', '📥': 'dl', '🗂': 'folder', '📚': 'stack', '🧰': 'tools', '💡': 'bulb', '✏': 'edit', '📡': 'radar', '🏛': 'temple', '👾': 'pixel', '🔐': 'lock', '🔒': 'lock', '👁': 'eye', '🔄': 'sync', '🗓': 'sched', '📘': 'codex', '🦠': 'bug', '👤': 'user', '👑': 'crown', '🚀': 'rocket', '🌐': 'globe', '🏷': 'tag', '🔗': 'link', '🪸': 'coral', '🐟': 'fish', '🫧': 'bubble', '🐋': 'whale', '🧬': 'dna' };
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
      const useMascot = !!h.ns && typeof draftOn === 'function' && draftOn('noteNeonMascot');
      const d = document.createElement('span');
      d.className = 'inote' + (h.ns ? ' sticky' : '') + (useMascot ? ' has-mascot' + (h.nc === 'g' ? ' st-g' : '') : '');
      d.dataset.hl = i;
      d.dataset.hlk = z.dataset.hlk + '~' + h.id; d.textContent = h.n; d.title = 'แตะเพื่อแก้โน้ต';
      // วางต่อจากข้อความที่จุดไว้ทันที (ออกจากตัวหนา/ลิงก์ก่อน เพื่อไม่ให้สีพื้นติดมา)
      const segs = z.querySelectorAll(`mark.user-hl[data-hl="${i}"]`); let at = segs[segs.length - 1];
      while (at.parentNode !== z && /^(B|STRONG|I|EM|A|SPAN|MARK|CODE|SUB|SUP)$/.test(at.parentNode.tagName)) at = at.parentNode;
      let after = at; while (after.nextSibling && after.nextSibling.nodeType === 1 && after.nextSibling.classList.contains('inote')) after = after.nextSibling;
      after.after(d); applyHL(d);
      if (useMascot) {
        const mc = document.createElement('span');
        mc.className = 'inote-mascot';
        mc.setAttribute('aria-hidden', 'true');
        mc.innerHTML = stickyMascotSVG(h.nc);
        d.appendChild(mc);
      }
    });
  }
  function stickyMascotSVG(color) {
    if (color === 'g') {
      // ตัวการ์ตูนมุมขวาสำหรับ Sticky สีเขียวนีออน: น้อง Crow + คริสตัลมิ้นต์เรืองแสง (สไตล์ Monument Valley)
      return `<svg viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="25" cy="9" r="5" fill="#5eead4" opacity=".28"/>
        <polygon points="25,4 28,9 25,14 22,9" fill="#5eead4" stroke="#e6faf7" stroke-width=".8"/>
        <g transform="translate(15,24)">
          <line x1="-2.2" y1="6" x2="-2.2" y2="10" stroke="#0f172a" stroke-width="1.4" stroke-linecap="round"/>
          <line x1="2.2" y1="6" x2="2.2" y2="10" stroke="#0f172a" stroke-width="1.4" stroke-linecap="round"/>
          <ellipse cx="0" cy="1" rx="6.2" ry="7.6" fill="#1e293b"/>
          <circle cx="0" cy="-7" r="4.6" fill="#1e293b"/>
          <polygon points="3.5,-8.5 11.5,-6.2 3.5,-4" fill="#fbbf24"/>
          <circle cx="1.6" cy="-7.6" r="1.7" fill="#fff"/>
          <circle cx="2" cy="-7.6" r=".8" fill="#0f172a"/>
          <path d="M-5.5 0 Q-9 3 -6 6" fill="none" stroke="#334155" stroke-width="1.6" stroke-linecap="round"/>
        </g>
      </svg>`;
    }
    // ตัวการ์ตูนมุมขวาสำหรับ Sticky สีเหลือง: น้อง Ida ยืนบน Totem ทองคำ (สไตล์ Monument Valley)
    return `<svg viewBox="0 0 36 36" aria-hidden="true">
      <g transform="translate(18,26)">
        <polygon points="-7,-1 0,-4.5 7,-1 0,2.5" fill="#fde047"/>
        <polygon points="-7,-1 0,2.5 0,9 -7,5.5" fill="#f59e0b"/>
        <polygon points="7,-1 0,2.5 0,9 7,5.5" fill="#d97706"/>
        <circle cx="-3.5" cy="3.8" r="1.9" fill="#1e1b4b" stroke="#fff" stroke-width=".7"/>
      </g>
      <g transform="translate(18,21)">
        <line x1="-1.5" y1="0" x2="-1.5" y2="3" stroke="#1e293b" stroke-width="1.2"/>
        <line x1="1.5" y1="0" x2="1.5" y2="3" stroke="#1e293b" stroke-width="1.2"/>
        <polygon points="0,-9 -5.5,0 5.5,0" fill="#fff" stroke="#cbd5e1" stroke-width=".5"/>
        <circle cx="0" cy="-11" r="2.7" fill="#1e293b"/>
        <polygon points="0,-20 -3.6,-11 3.6,-11" fill="#fff" stroke="#cbd5e1" stroke-width=".5"/>
      </g>
      <circle cx="29" cy="9" r="1.6" fill="#fb7185"/>
    </svg>`;
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
    const useArt = draftOn('kwPopViewportArt');
    pop.dataset.mode = 'note'; pop.classList.add('writing');
    pop.classList.toggle('ai-pop', useArt);
    pop.classList.toggle('ai-pop-fit', useArt);
    pop.classList.toggle('kw-pop-fit', useArt);
    const artHtml = useArt ? `<div class="kw-art" aria-hidden="true">
      <svg viewBox="0 4 360 108" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="kwWf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#e0f2fe" stop-opacity=".88"/><stop offset="100%" stop-color="#5eead4" stop-opacity=".18"/></linearGradient>
          <radialGradient id="kwSp" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#5eead4" stop-opacity=".85"/><stop offset="100%" stop-color="#5eead4" stop-opacity="0"/></radialGradient>
        </defs>
        <g fill="#bae6fd" opacity=".55"><circle cx="28" cy="22" r="1"/><circle cx="72" cy="16" r="1.2"/><circle cx="152" cy="18" r="1"/><circle cx="298" cy="20" r="1.3"/><circle cx="332" cy="42" r="1"/><circle cx="240" cy="14" r=".9"/><circle cx="316" cy="86" r="1.1"/></g>
        <!-- หอคอยซ้าย + โดม Monument Valley -->
        <polygon points="82,30 98,22 114,30 114,112 82,112" fill="#3b5368"/>
        <polygon points="98,22 114,30 114,112 98,112" fill="#25384a"/>
        <path d="M84 30 Q98 12 112 30 Z" fill="#88a4bc"/>
        <line x1="98" y1="14" x2="98" y2="8" stroke="#e2e8f0" stroke-width="1.4"/>
        <path d="M93 52 v-14 a5 5 0 0 1 10 0 v14 Z" fill="var(--surface,#0b1526)"/>
        <!-- สะพานน้ำตกที่เป็นไปไม่ได้ (อิงภาพ Monument Valley) -->
        <polygon points="104,48 258,92 246,98 92,54" fill="#cbd5e1"/>
        <polygon points="92,54 246,98 246,108 92,64" fill="#47637a"/>
        <polygon points="164,66 266,28 278,34 176,72" fill="#94b0c7"/>
        <polygon points="176,72 278,34 278,43 176,81" fill="#32495e"/>
        <!-- สายน้ำตกเรืองแสงไหลลงสู่สะพานล่าง -->
        <rect class="kw-wf" x="262" y="34" width="12" height="60" fill="url(#kwWf)"/>
        <line class="kw-wf" x1="266" y1="36" x2="266" y2="92" stroke="#e0f2fe" stroke-width="1.2" stroke-dasharray="5 4"/>
        <line class="kw-wf" x1="270" y1="40" x2="270" y2="92" stroke="#5eead4" stroke-width="1" stroke-dasharray="4 5"/>
        <ellipse cx="268" cy="94" rx="11" ry="3.5" fill="#7ce0d3" opacity=".45"/>
        <!-- น้อง Ida ตัวจิ๋วบนสะพานซ้าย -->
        <g transform="translate(124,48)" class="kw-bob">
          <polygon points="0,-7 -3.4,1 3.4,1" fill="#fff"/>
          <circle cx="0" cy="-8.5" r="2" fill="#1e293b"/>
          <polygon points="0,-16.5 -2.6,-8.5 2.6,-8.5" fill="#fff"/>
        </g>
        <!-- วิญญาณสีฟ้าเรืองแสงลอยน่ารักข้างน้ำตก -->
        <g transform="translate(234,58)" class="kw-spirit">
          <circle cx="0" cy="-2" r="15" fill="url(#kwSp)"/>
          <path d="M0,-10 C4,-10 5,-4 5,2 C2,0 -2,0 -5,2 C-5,-4 -4,-10 0,-10 Z" fill="#67e8f9"/>
          <circle cx="0" cy="-12" r="2.6" fill="#a5f3fc"/>
          <polygon points="0,-17 -2.2,-12 2.2,-12" fill="#cffafe"/>
        </g>
      </svg>
    </div>` : '';
    pop.innerHTML = `<div class="note-kind">🔑 ส่งเป็น keyword · แก้คำได้ก่อนส่ง (เน้นเหลือง: เลือกคำแล้วกดเน้นคำที่เลือก)</div><textarea class="note-in" rows="3">${esc(init)}</textarea><div class="note-act"><button class="btn small" data-a="mk" title="Emphasize selected words">Emphasize</button><button class="btn small" data-a="x">Cancel</button><button class="btn small primary" data-a="ok">Save keyword</button></div>${artHtml}`;
    const ta = pop.querySelector('textarea'); ta.focus();
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); const d = ta.value.trim(); if (d) { S.kw.push(Object.assign({ t, k, d, at: Date.now() }, kwBox(k))); save(); toast('🔑 Saved to Keywords'); } hidePop(); } });
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
    pop.classList.toggle('ai-pop-fit', draftOn('aiPopViewportFit'));
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
        if (b.dataset.s === 'sticky' && onNote) { onNote(txt, true, draftOn('noteNeonMascot') ? 'g' : 'y'); hidePop(); toast('🗒️ บันทึกท่อนที่คลุมเป็น Sticky note แล้ว'); }
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
  function showPalette(rect, onColor, onErase, onNote, curNote, curNoteColor) {
    pop.classList.remove('writing', 'ai-pop', 'ai-pop-fit', 'kw-pop-fit');
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
      if (b.dataset.c === 'n' || b.dataset.c === 'k') return openNote(onNote, curNote, b.dataset.c === 'k', curNoteColor);
      if (b.dataset.c === 'i') { const ctx = popImg; hidePop(); if (moveImg && ctx && ctx.idx == null) return placeMoved(ctx); return pickImage(f => insertImage(ctx, f)); }
      if (b.dataset.c === 's') return openSearch(noNote ? null : onNote);
      if (b.dataset.c === 'w') { if (kwHas(popZone, popText)) { kwToggle(popZone, popText); return hidePop(); } return openKw(); }
      if (b.dataset.c === 'x') onErase(); else onColor(b.dataset.c); hidePop();
    });
  }
  // กล่องพิมพ์โน้ตในแถบเดียวกัน (ถ้าข้อความยาวจาก Gemini จะขยายกล่องให้ตัด/แก้สะดวก)
  function openNote(onNote, cur, sticky, curColor) {
    const isLong = (cur || '').length > 140;
    const useArt = draftOn('notePopViewportArt');
    const useColor = !!sticky && draftOn('noteNeonMascot');
    let noteCol = curColor ? (curColor === 'g' ? 'g' : 'y') : (cur ? 'y' : 'g');
    pop.dataset.mode = 'note';
    pop.classList.toggle('ai-pop', isLong || useArt);
    pop.classList.toggle('ai-pop-fit', useArt || (isLong && draftOn('aiPopViewportFit')));
    pop.classList.toggle('kw-pop-fit', useArt && !isLong);
    pop.classList.add('writing');
    if (isLong && !useArt) {
      const w = Math.min(540, document.documentElement.clientWidth - 16);
      const curLeft = parseFloat(pop.style.left) || 8;
      pop.style.left = Math.max(8, Math.min(curLeft, document.documentElement.clientWidth - w - 8)) + 'px';
    }
    const artHtml = useArt ? (sticky ? `<div class="kw-art" aria-hidden="true">
      <svg viewBox="0 0 360 108" preserveAspectRatio="xMidYMid meet">
        <!-- ปราสาททอง Monument Valley 2 (Ro + ลูก + Totem + ธงชมพู + กล่องลอย) -->
        <g transform="translate(306,42)"><g class="nt-cube"><polygon points="0,-10 10,-5 0,0 -10,-5" fill="#fde047"/><polygon points="-10,-5 0,0 0,11 -10,6" fill="#f59e0b"/><polygon points="10,-5 0,0 0,11 10,6" fill="#d97706"/></g></g>
        <g transform="translate(52,66)"><g class="nt-cube2"><polygon points="0,-7 7,-3.5 0,0 -7,-3.5" fill="#7ce0d3"/><polygon points="-7,-3.5 0,0 0,8 -7,4.5" fill="#38989c"/><polygon points="7,-3.5 0,0 0,8 7,4.5" fill="#23666b"/></g></g>
        <g transform="translate(88,82)"><g class="nt-cube"><polygon points="0,-5 6,-2 0,1 -6,-2" fill="#fde047"/><polygon points="-6,-2 0,1 0,6 -6,3" fill="#f59e0b"/><polygon points="6,-2 0,1 0,6 6,3" fill="#d97706"/></g></g>
        <g transform="translate(122,88)"><g class="nt-cube2"><polygon points="0,-5 7,-2 0,1 -7,-2" fill="#99f6e4"/><polygon points="-7,-2 0,1 0,6 -7,3" fill="#2dd4bf"/><polygon points="7,-2 0,1 0,6 7,3" fill="#0d9488"/></g></g>
        <!-- หอคอยทอง + โดมเหลี่ยมสีกรมท่า + ธงชมพูพลิ้ว -->
        <polygon points="196,42 222,30 248,42 248,108 196,108" fill="#fbbf24"/>
        <polygon points="222,30 248,42 248,108 222,108" fill="#f59e0b"/>
        <path d="M206 72 v-18 a7 7 0 0 1 14 0 v18 Z" fill="#b45309"/>
        <path d="M204 42 Q222 14 240 42 Z" fill="#334155"/>
        <path d="M222 22 Q232 30 240 42 L222 44 Z" fill="#1e293b"/>
        <line x1="222" y1="20" x2="222" y2="8" stroke="#e2e8f0" stroke-width="1.3"/>
        <path class="nt-flag" d="M222,10 Q238,14 248,22 Q256,26 266,24 Q254,28 242,24 Q232,18 222,18 Z" fill="#f472b6"/>
        <!-- ระเบียงทองหน้าปราสาท + บันได -->
        <polygon points="150,74 222,42 292,74 222,108" fill="#fde68a"/>
        <polygon points="150,74 222,108 222,112 150,112" fill="#f59e0b"/>
        <polygon points="222,108 292,74 292,112 222,112" fill="#d97706"/>
        <!-- Totem ฟ้า-ชมพู -->
        <polygon points="232,58 250,50 268,58 250,66" fill="#99f6e4"/>
        <polygon points="232,58 250,66 250,86 232,78" fill="#38bdf8"/>
        <polygon points="250,66 268,58 268,78 250,86" fill="#f472b6"/>
        <circle cx="241" cy="72" r="4.5" fill="#0f172a" stroke="#fff" stroke-width="1.4"/>
        <!-- Ro & ลูกจับมือกัน -->
        <g transform="translate(178,74)"><g class="kw-bob">
          <line x1="-2" y1="-2" x2="-2" y2="4" stroke="#1e293b" stroke-width="1.3"/><line x1="2" y1="-2" x2="2" y2="4" stroke="#1e293b" stroke-width="1.3"/>
          <polygon points="0,-13 -7,-2 7,-2" fill="#fb7185"/>
          <circle cx="0" cy="-16" r="3" fill="#fff"/>
          <circle cx="-1.5" cy="-19" r="2.2" fill="#1e3a8a"/>
        </g></g>
        <g transform="translate(198,78)"><g class="kw-bob" style="animation-delay:.4s">
          <line x1="-1.5" y1="-1" x2="-1.5" y2="3.5" stroke="#1e293b" stroke-width="1.2"/><line x1="1.5" y1="-1" x2="1.5" y2="3.5" stroke="#1e293b" stroke-width="1.2"/>
          <polygon points="0,-9 -4.5,-1 4.5,-1" fill="#fff"/>
          <circle cx="0" cy="-11" r="2.3" fill="#e11d48"/>
          <polygon points="2,-14 -2,-11 3,-10" fill="#e11d48"/>
        </g></g>
      </svg>
    </div>` : `<div class="kw-art" aria-hidden="true">
      <svg viewBox="0 0 360 108" preserveAspectRatio="xMidYMid meet">
        <!-- ปราสาทเขียวมิ้นต์ Monument Valley 1 (Ida + Crow + Totem ทอง + ธงเหลือง + กล่องลอย) -->
        <g transform="translate(52,58)"><g class="nt-cube"><polygon points="0,-10 10,-5 0,0 -10,-5" fill="#99f6e4"/><polygon points="-10,-5 0,0 0,11 -10,6" fill="#2dd4bf"/><polygon points="10,-5 0,0 0,11 10,6" fill="#0f766e"/></g></g>
        <g transform="translate(304,50)"><g class="nt-cube2"><polygon points="0,-7 7,-3.5 0,0 -7,-3.5" fill="#fde047"/><polygon points="-7,-3.5 0,0 0,8 -7,4.5" fill="#f59e0b"/><polygon points="7,-3.5 0,0 0,8 7,4.5" fill="#b45309"/></g></g>
        <g transform="translate(264,78)"><g class="nt-cube"><polygon points="0,-5 7,-2 0,1 -7,-2" fill="#99f6e4"/><polygon points="-7,-2 0,1 0,6 -7,3" fill="#2dd4bf"/><polygon points="7,-2 0,1 0,6 7,3" fill="#0d9488"/></g></g>
        <g transform="translate(232,86)"><g class="nt-cube2"><polygon points="0,-5 7,-2 0,1 -7,-2" fill="#fde68a"/><polygon points="-7,-2 0,1 0,6 -7,3" fill="#fbbf24"/><polygon points="7,-2 0,1 0,6 7,3" fill="#d97706"/></g></g>
        <!-- หอคอยเขียวมิ้นต์ + โดมสีกรมท่า + ธงเหลืองพลิ้ว -->
        <polygon points="108,38 134,26 160,38 160,108 108,108" fill="#4db6ac"/>
        <polygon points="134,26 160,38 160,108 134,108" fill="#2b7a78"/>
        <path d="M122 68 v-18 a7 7 0 0 1 14 0 v18 Z" fill="#133a42"/>
        <path d="M114 38 Q134 10 154 38 Z" fill="#334155"/>
        <path d="M134 18 Q144 26 154 38 L134 40 Z" fill="#1e293b"/>
        <line x1="134" y1="16" x2="134" y2="6" stroke="#e2e8f0" stroke-width="1.3"/>
        <path class="nt-flag" d="M134,8 Q152,12 162,20 Q170,24 180,22 Q168,26 156,22 Q146,16 134,16 Z" fill="#fde047"/>
        <!-- บันไดเฉียงเขียวมิ้นต์ + Totem สีทอง -->
        <polygon points="122,70 198,108 176,108 100,70" fill="#80cbc4"/>
        <path d="M128 76 l16 8 M140 82 l16 8 M152 88 l16 8 M164 94 l16 8" stroke="#1f5c5b" stroke-width="1.4"/>
        <polygon points="168,54 186,46 204,54 186,62" fill="#fde047"/>
        <polygon points="168,54 186,62 186,86 168,78" fill="#facc15"/>
        <polygon points="186,62 204,54 204,78 186,86" fill="#ca8a04"/>
        <circle cx="177" cy="68" r="4.5" fill="#1e1b4b" stroke="#fff" stroke-width="1.4"/>
        <!-- น้อง Ida บนบันได -->
        <g transform="translate(148,66)"><g class="kw-bob">
          <line x1="-1.5" y1="0" x2="-1.5" y2="3" stroke="#1e293b" stroke-width="1.2"/><line x1="1.5" y1="0" x2="1.5" y2="3" stroke="#1e293b" stroke-width="1.2"/>
          <polygon points="0,-10 -5,0 5,0" fill="#fff"/>
          <circle cx="0" cy="-12" r="2.5" fill="#1e293b"/>
          <polygon points="0,-22 -3.4,-12 3.4,-12" fill="#fff"/>
        </g></g>
        <!-- นกกา Crow นั่งอยู่ชั้นล่าง -->
        <g transform="translate(128,86)">
          <ellipse cx="0" cy="4" rx="4" ry="5.5" fill="#111827"/>
          <circle cx="0" cy="-2.5" r="3" fill="#111827"/>
          <polygon points="2.5,-3.5 9,-1.5 2.5,0" fill="#111827"/>
          <circle cx=".8" cy="-2.8" r="1" fill="#fff"/>
        </g>
      </svg>
    </div>`) : '';
    const colPickHtml = useColor ? `<span class="note-col-pick"><button type="button" class="nc-sw nc-g${noteCol === 'g' ? ' on' : ''}" data-nc="g" title="สีเขียวนีออนอ่อน">เขียวนีออน</button><button type="button" class="nc-sw nc-y${noteCol === 'y' ? ' on' : ''}" data-nc="y" title="สีเหลือง">เหลือง</button></span>` : '';
    pop.innerHTML = `<div class="note-kind"><span>${sticky ? '🗒️ Sticky note' : '★ Star note'}${isLong ? ' · ลบ/ตัดแต่งข้อความแล้วกด Save ได้เลย' : ''}</span>${colPickHtml}</div><textarea class="note-in${sticky ? ' sticky' : ''}${useColor && noteCol === 'g' ? ' st-g' : ''}" rows="${isLong ? 10 : 3}" placeholder="พิมพ์โน้ต จะแสดงต่อจากข้อความที่เลือก">${esc(cur || '')}</textarea><div class="note-act">${cur ? '<button class="btn small" data-a="del">Delete note</button>' : ''}<button class="btn small" data-a="x">Cancel</button><button class="btn small primary" data-a="ok">Save</button></div>${artHtml}`;
    const ta = pop.querySelector('textarea'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    if (useColor) {
      pop.querySelectorAll('[data-nc]').forEach(b => b.onclick = () => {
        noteCol = b.dataset.nc === 'g' ? 'g' : 'y';
        pop.querySelectorAll('[data-nc]').forEach(x => x.classList.toggle('on', x.dataset.nc === noteCol));
        ta.classList.toggle('st-g', noteCol === 'g');
        ta.focus();
      });
    }
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onNote(ta.value.trim(), sticky, noteCol); hidePop(); } });
    pop.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { const a = b.dataset.a; if (a === 'ok') onNote(ta.value.trim(), sticky, noteCol); if (a === 'del') onNote('', sticky, noteCol); hidePop(); });
  }
  // บันทึก/แก้/ลบโน้ตของไฮไลต์ที่มีอยู่แล้ว (ใช้ทั้งตอนแตะไฮไลต์และแตะตัวโน้ต)
  const noteSaver = (k, idx, z) => (n, st, nc) => {
    snap(k); const arr = JSON.parse(JSON.stringify(S.hl[k] || [])); if (!arr[idx]) return;
    if (n) { arr[idx].n = n; if (st) { arr[idx].ns = 1; if (nc === 'g') arr[idx].nc = 'g'; else delete arr[idx].nc; } else { delete arr[idx].ns; delete arr[idx].nc; } if (!arr[idx].id) arr[idx].id = Date.now().toString(36); }
    else { delete arr[idx].n; delete arr[idx].ns; delete arr[idx].nc; if (arr[idx].c === 'n') arr.splice(idx, 1); }
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
  function hidePop() { pop.hidden = true; pop.dataset.mode = ''; pop.dataset.inNote = ''; pop.classList.remove('writing', 'ai-pop', 'ai-pop-fit', 'kw-pop-fit'); }
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
      }, (() => { const { s } = selOffsets(z, r); return (n, st, nc) => {
        // โน้ตอย่างเดียว = ขีดเส้นใต้ประ ไม่ระบายสี
        if (!n) return; const h = { s, t, c: 'n', n, id: Date.now().toString(36) }; if (st) { h.ns = 1; if (nc === 'g') h.nc = 'g'; }
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
    }, noteSaver(k, idx, z), (S.hl[k][idx] || {}).n, (S.hl[k][idx] || {}).nc);
  }, true);
  // แตะตัวโน้ต ★ / sticky ที่บันทึกแล้ว → เปิดกล่องแก้ข้อความได้ทันที
  view.addEventListener('click', e => {
    const d = e.target.closest('.inote'); if (!d || e.target.closest('mark.user-hl') || !getSelection().isCollapsed) return;
    const z = d.parentElement && d.parentElement.closest('[data-hlk]'); if (!z) return;
    const k = z.dataset.hlk, idx = +d.dataset.hl, h = (S.hl[k] || [])[idx]; if (!h || !h.n) return;
    e.stopPropagation();
    const r = d.getBoundingClientRect(), w = 320;
    pop.style.top = (r.bottom + scrollY + 8) + 'px'; pop.style.left = Math.max(8, Math.min(r.left + scrollX, document.documentElement.clientWidth - w - 8)) + 'px';
    pop.hidden = false; openNote(noteSaver(k, idx, z), h.n, !!h.ns, h.nc);
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
    view.innerHTML = `<div class="hero"><h1>☁️ Sync &amp; App <small style="font-size:.5em;opacity:.65">v105</small></h1><p>ซิงค์ข้อมูลข้ามเครื่องด้วย Google และติดตั้งเป็นแอปไว้อ่านแบบออฟไลน์</p></div>
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
          await Promise.all(regs.map(r => r.unregister().catch(() => {})));
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
  async function vGuide() {
    await loadIndex();
    renderSidebar();
    const newItems = [
      draftOn('round2Rating') && `<li><b>ประเมินอ่านรอบ 2 &amp; แถบสารบัญ 2 สี:</b> ท้ายแต่ละกล่องมีช่องประเมิน <b>รอบ 1</b> และ <b>รอบ 2</b> เรียงซ้าย-ขวาให้เห็นพัฒนาการ (เช่น ★ → ★★★★) กล่องที่ประเมินครบ 2 รอบแถบซ้ายจะแบ่งเป็น <b>2 สี (ซ้ายรอบ 1 / ขวารอบ 2)</b> และวงแหวนหน้าหลักจะนับจากรอบล่าสุด</li>`,
      (draftOn('underwaterReefTimer') || draftOn('reefTankExpand')) && `<li><b>จับเวลาอ่าน + Tank ปราสาทใต้น้ำ 🪸:</b> กดปุ่มจับเวลามุมขวาล่าง (ตั้งเวลาอ่านเองเป็นนาทีได้) ทุก 30 นาทีที่อ่านสะสมในวันนั้นจะปลดล็อกปะการัง/สัตว์ทะเลเพิ่ม 1 ชนิด (ครบ 16 ชนิดที่ 8 ชม.)${draftOn('reefTankExpand') ? ' · กดปุ่ม <b>⤢</b> บนกรอบขวาเพื่อขยายตู้ปลาออกด้านข้าง ดูปราสาท 5 ชั้น + วาฬ + นางเงือก และกด <b>🐟 ให้อาหารปลา</b> ให้ปลาเรืองแสงหรือแตะน้ำปล่อยฟองแก้เครียดได้!' : ''}</li>`,
      draftOn('anatomySidebarInfographic') && `<li><b>น้อง Ida Anatomy ด้านซ้ายหน้าอ่านบท:</b> บนหน้าจอคอมจะมีหุ่นน้อง Ida ลอยด้านซ้ายพร้อมหน้าต่างคริสตัลโชว์อวัยวะที่จะ <b>เรืองแสงอัตโนมัติตามบทที่กำลังอ่าน</b> (แตะดูชื่ออวัยวะได้ และกด <b>–</b> เพื่อย่อเป็นน้อง Ida ตัวจิ๋วได้ตลอดเวลา)</li>`,
      (draftOn('noteNeonMascot') || draftOn('notePopViewportArt')) && `<li><b>Sticky Note 2 สี + สติ๊กเกอร์น่ารัก 🗒️:</b> ลากคลุมข้อความแล้วเลือก 🗒️ เพื่อแปะโน้ต เลือกได้ทั้ง <b>สีเหลือง</b> และ <b>สีเขียวนีออน</b> พร้อมตัวการ์ตูน Monument Valley มุมขวาล่าง</li>`,
      draftOn('drugBloomTree') && `<li><b>ต้นไม้ผลิดอกจำยา &amp; เชื้อ 🌸:</b> ในหน้า <a href="#/db">💊 Drug &amp; Bug</a> กดปุ่ม <b>+ จำได้</b> บนการ์ดยาหรือเชื้อ ยิ่งจำได้เยอะ ดอกไม้กังหันหลากสีและผีเสื้อสีฟ้าจะค่อย ๆ ผลิบานเต็มต้น</li>`,
      draftOn('mazeReviewQuest') && `<li><b>เขาวงกตมรกตปลดล็อกคริสตัล 🧩:</b> ในหน้า <a href="#/wrong">📕 Mistakes</a>, <a href="#/review">📅 Review</a> และ <a href="#/mock">⏱️ Mock Exam</a> ยิ่งเคลียร์ข้อผิดหรือทวนครบ น้อง Ro จะเดินเหยียบสวิตช์สีชมพูไปปลดล็อกคริสตัลสีม่วงกลางวิหาร</li>`,
      draftOn('homeFloatingIslands') && `<li><b>3 เกาะปราสาทลอยน้ำหน้าแรก 🏰:</b> แยก 3 ทางลัดหลัก (เกาะทอง = อ่านต่อ/รอบ 2, เกาะชมพู = โจทย์/ข้อผิด/Mock, เกาะมิ้นต์ = จำยา/เชื้อ) พร้อมแถบ Shortcuts ด้านล่าง</li>`,
      draftOn('aiPopViewportFit') && `<li><b>ถาม Gemini AI ในหน้าเดิม 🔍:</b> ลากคลุมคำแล้วกด 🔍 หน้าต่างจะลอยพอดีกลางจอ สามารถลากคลุมท่อนที่ชอบในคำตอบแล้วกดปุ่มแปะเป็น Sticky Note ได้ทันที</li>`
    ].filter(Boolean);
    const newPanel = newItems.length ? `<div class="panel"><h3>5. ฟีเจอร์ใหม่ &amp; กิมมิคกระตุ้นการอ่าน ✨</h3>
        <ul class="guide-list">${newItems.join('')}</ul>
      </div>` : '';
    view.innerHTML = `<div class="hero"><h1>📖 คู่มือการใช้งาน</h1><p>สรุปวิธีใช้เว็บอ่านเตรียมสอบให้คุ้มที่สุด (อ่านจบใน 1 นาที)</p></div>
      <div class="panel"><h3>1. เริ่มต้นใช้งาน (ไม่ต้องล็อกอินก่อนก็ได้)</h3>
        <ul class="guide-list">
          <li>เปิดอ่านบทเรียนและทำข้อสอบได้ทันที ข้อมูลทั้งหมดจะบันทึกไว้ในเครื่องอัตโนมัติ</li>
          <li><b>แนะนำ:</b> กด <a href="#/sync">☁️ Sync</a> เพื่อเข้าสู่ระบบด้วย Google — ข้อมูลที่ทำไว้ก่อนล็อกอินจะถูกซิงค์ขึ้นคลาวด์ให้ทันที ไม่หาย และเปิดอ่านต่อข้าม iPad / มือถือ / คอมได้</li>
        </ul>
      </div>
      <div class="panel"><h3>2. อ่านคู่ชีท A3 &amp; เครื่องมือระหว่างอ่าน</h3>
        <ul class="guide-list">
          <li><b>เลขกล่องตรงกับชีท A3:</b> กดปุ่มกระโดดไปเลขกล่องได้ที่มุมขวาล่าง เพื่อเปิดอ่านคู่กันแบบ Split View</li>
          <li><b>ลากคลุมข้อความ:</b> ไฮไลต์ได้ <b>6 สี</b>, เพิ่ม<b>โน้ตแปะ</b>, เก็บเป็น <b>Keyword</b> (เอาไปท่องเป็น Flashcard) หรือกด <b>🔍 ถาม Gemini AI</b> ในหน้าเดิมได้ทันที</li>
          <li><b>ประเมิน 5 ระดับท้ายกล่อง:</b> ช่วยเว็บจัดลำดับทบทวนและหาจุดอ่อน (เช่น สีชมพู 🧠 จำเยอะ / ★–★★ ยังไม่แม่น)</li>
        </ul>
      </div>
      <div class="panel"><h3>3. ทำข้อสอบ &amp; เคลียร์จุดอ่อน</h3>
        <ul class="guide-list">
          <li><b>ข้อสอบท้ายกล่อง:</b> ทำแล้วระบบจำคำตอบให้ ข้อที่ตอบผิดจะเข้ากอง <a href="#/wrong">📕 Mistakes</a> อัตโนมัติ (พอทำซ้ำจนถูกจะออกจากกองเอง)</li>
          <li><a href="#/quiz">📝 Quiz</a>: สุ่มข้อสอบเลือกบทได้ หรือกรองเฉพาะหัวข้อที่ยังไม่แม่น / ข้อที่ยังไม่เคยทำ</li>
          <li><a href="#/mock">⏱️ Mock Exam แยกตามปี</a>: จำลองทำข้อสอบจริงแยกตามปี (74–79, Mock) จับเวลา + ส่งคำตอบทีเดียว + ดูคะแนนแยกตามบท</li>
        </ul>
      </div>
      <div class="panel"><h3>4. เครื่องมือช่วยจำ &amp; ใช้งานออฟไลน์</h3>
        <ul class="guide-list">
          <li><b>ช่วยจำ:</b> <a href="#/cards">🃏 Cards</a> (Flashcards), <a href="#/review">📅 Review</a> (ทวนตามรอบความจำ), <a href="#/db">💊 Drug&amp;Bug</a>, <a href="#/numbers">🔢 Numbers</a>, <a href="#/flows">🩺 Flowchart</a>, <a href="#/drill">🧠 Drill</a></li>
          <li><b>ออฟไลน์ &amp; AI:</b> เข้า <a href="#/sync">☁️ Sync</a> เพื่อติดตั้งเป็นแอป (PWA), กดโหลดทุกบทไว้ใช้ออฟไลน์, ใส่ Gemini API Key ฟรี และสลับธีม Monument Valley / Pixel Classic ได้</li>
        </ul>
      </div>
      ${newPanel}
      <div class="choice">
        <a class="btn primary" href="#/">🏠 กลับหน้าแรก</a>
        <a class="btn" href="#/mock">⏱️ ลองทำ Mock Exam</a>
        <a class="btn" href="#/sync">☁️ ตั้งค่า Sync / ออฟไลน์</a>
      </div>`;
    window.scrollTo(0, 0);
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
      act('#/mock', '⏱️', 'Mock Exam แยกตามปี', 'จำลองทำข้อสอบจริงรายปี', ''),
      nWrong ? act('#/wrong', '📕', `ข้อผิด ${nWrong} ข้อ`, 'ทำซ้ำให้ถูกเพื่อเคลียร์กอง', 'wrong') : ''
    ].join('');
    const chips = `<div class="today-chips"><span>📖 อ่านวันนี้ <b>${rtAll.done}</b> กล่อง</span><span>📅 ทวนแล้ว <b>${rvDone}</b></span><span>🔥 ต่อเนื่อง <b>${streak()}</b> วัน</span></div>`;
    const bkWarn = backupDue() ? `<a class="bk-warn" href="#/backup">💾 ${S.lastBackup ? 'ไม่ได้สำรองข้อมูลมาเกิน 7 วัน' : 'ยังไม่เคยสำรองไฮไลต์และโน้ต'} · กดเพื่อ Backup</a>` : '';
    const heroHtml = uiStyle() === 'monument' ? mvGrandCitadelHTML(bkWarn) : `<div class="hero home-hero"><h1>nannie compre website</h1>${bkWarn}</div>`;
    const useIslands = draftOn('homeFloatingIslands');
    const dashBlock = useIslands ? mvHomeIslandsHTML({
      lrHref: lrSec ? S.lastRead.h : ('#/' + (INDEX.find(c => c.ready) || {}).id),
      lrSub: lrSec ? `${chTitle(lr[1])} · กล่อง ${lrSec.no}` : 'เริ่มอ่านบทแรก',
      nWrong, due, rvDone, wk,
      readTodayDone: rtAll.done,
      streakDays: streak(),
      dbKnown: Object.keys(S.known || {}).filter(k => k.startsWith('db:')).length
    }) : `<section class="dash"><div class="dash-h"><h2>วันนี้ควรทำอะไร</h2>${chips}</div>${planHTML()}<div class="dash-grid">${acts}</div></section>`;
    view.innerHTML = `${heroHtml}${dashBlock}
    <p class="split-hint">เลขหัวข้อในเว็บตรงกับเลขกล่องในชีท A3 เปิดคู่กันแบบ split view แล้วพิมพ์เลขกล่องที่ปุ่มมุมขวาล่างเพื่อกระโดดไปได้ทันที</p>${tiles}
    <details class="panel legend-panel"><summary>สัญลักษณ์ในเนื้อหา</summary><div class="card think" style="margin:8px 0"><div class="lbl">🤔 หยุดคิดก่อน</div>คำถามสั้นให้ลองตอบในใจก่อนกดดูเฉลย</div><div class="card trap" style="margin:8px 0"><div class="lbl">⚠️ กับดักข้อสอบ</div>จุดที่ข้อสอบชอบหลอก</div><div class="card note" style="margin:8px 0"><div class="lbl">📌 อาจารย์เน้น</div>สิ่งที่อาจารย์ติวย้ำ</div><div class="card hint" style="margin:8px 0"><div class="lbl">🎯 อาจารย์บอกข้อสอบ</div>ข้อที่อาจารย์ผู้ออกข้อสอบยกมาหรือบอกว่าออก กด ▶ เวลา เพื่อเปิดคลิปตรงจุดนั้น</div><p style="margin:8px 0 0"><span class="tag e">ออกสอบ</span> <span class="tag s">เสริม</span> นอกคลิป <span class="tag x">ข้ามบท</span></p><div class="content legend-row"><span><b>คำสำคัญ</b> ไฮไลต์เหลือง</span><span class="hl-exam" style="display:inline-block;background:var(--hl-exam);border-left:3px solid var(--exam);padding:0 8px">ประโยคที่เคยออกสอบ</span><span><mark class="user-hl c-y">ไฮไลต์</mark> <mark class="user-hl c-g">ของ</mark> <mark class="user-hl c-b">ฉัน</mark> <mark class="user-hl c-p">มี</mark> <mark class="user-hl c-v">6</mark> <mark class="user-hl c-r">สี</mark> เลือกข้อความเอง</span></div><p class="bar-label">ปิดไฮไลต์อัตโนมัติได้ที่เมนูด้านข้าง</p></details>`;
    if (!useIslands) bindPlan();
  }
  let _routeSeq = 0;
  async function vChapter(id, seq) {
    await loadIndex();
    if (draftOn('fastSidebarNav') && !CH[id]) {
      const m = INDEX.find(c => c.id === id);
      view.innerHTML = `<p class="loading">กำลังโหลด ${esc(m ? m.title : id)}…</p>`;
    }
    const ch = await loadChapter(id);
    if (draftOn('fastSidebarNav') && seq != null && seq !== _routeSeq) return;
    if (!ch) return vHome();
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
  async function vSection(id, no, seq) {
    await loadIndex();
    if (draftOn('fastSidebarNav') && !CH[id]) {
      const m = INDEX.find(c => c.id === id);
      view.innerHTML = `<p class="loading">กำลังโหลด ${esc(m ? m.title : id)}…</p>`;
    }
    const ch = await loadChapter(id);
    if (draftOn('fastSidebarNav') && seq != null && seq !== _routeSeq) return;
    if (!ch) return vHome();
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
    h += mvExamBreakHTML(id);
    if (s.examIds.length) {
      const doneCnt = s.examIds.filter(qid => S.ans[`${id}|${qid}`]).length;
      h += `<section class="exam-sec"><div class="exam-sec-h"><h2>📝 Past exam questions</h2><button class="btn small" id="redoBoxExams"${doneCnt ? '' : ' hidden'}>↺ ล้างคำตอบกล่องนี้</button></div><p class="bar-label">กดเลือกคำตอบแล้วระบบจะจำคำตอบไว้ให้อัตโนมัติ (ข้อที่ตอบผิดเข้ากองข้อผิดด้วย · กด ↺ ทำใหม่ ได้ทุกเมื่อ)</p>`;
      for (const qid of s.examIds) h += mcqHTML(id, qid, ch.exams[qid], { showSaved: true });
      h += '<div id="boxExamRes"></div></section>';
    }
    const r2On = draftOn('round2Rating');
    const r1v = S.lvl[k] || 0, r2v = (S.lvl2 && S.lvl2[k]) || 0;
    const r2Prog = (r2On && r1v && r2v) ? `<span class="lv-prog">${LV[r1v].s} → ${LV[r2v].s}${r2v === 4 && r1v !== 4 ? ' ✨ เข้าใจแล้ว!' : (r2v > r1v && r2v <= 4 && r1v <= 4 ? ' ↗ ดีขึ้น!' : '')}</span>` : '';
    if (r2On) {
      h += `<div class="lvpick-dual">
        <div class="lvpick lvpick-r1"><div class="lvq"><span class="lv-rbadge r1">รอบ 1</span> ประเมินครั้งแรก (แตะซ้ำเพื่อล้าง)</div>${LV_ORD.map(l => `<button class="lvbtn lv${l}${r1v === l ? ' on' : ''}" data-lv="${l}" data-r="1"><span class="st">${LV[l].s}</span><span>${LV[l].t}</span></button>`).join('')}</div>
        <div class="lvpick lvpick-r2"><div class="lvq"><span class="lv-rbadge r2">รอบ 2</span> ประเมินรอบสอง ${r2Prog}</div>${LV_ORD.map(l => `<button class="lvbtn lv${l}${r2v === l ? ' on' : ''}" data-lv="${l}" data-r="2"><span class="st">${LV[l].s}</span><span>${LV[l].t}</span></button>`).join('')}</div>
      </div>`;
    } else {
      h += `<div class="lvpick"><div class="lvq">How well do you understand this box? (tap again to clear)</div>${LV_ORD.map(l => `<button class="lvbtn lv${l}${r1v === l ? ' on' : ''}" data-lv="${l}" data-r="1"><span class="st">${LV[l].s}</span><span>${LV[l].t}</span></button>`).join('')}</div>`;
    }
    h += `<nav class="pager">${prev ? `<a href="#/${id}/${prev.no}"><small>← ก่อนหน้า</small>${prev.no}. ${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a class="next" href="#/${id}/${next.no}"><small>ถัดไป →</small>${next.no}. ${esc(next.title)}</a>` : ''}</nav>
      <div class="jump"><a href="${prev ? `#/${id}/${prev.no}` : '#/' + id}" aria-label="ก่อนหน้า">‹</a><button id="undoBtn" hidden title="เลิกทำไฮไลต์ล่าสุด" aria-label="เลิกทำ">↶</button><button id="focusBtn" title="โหมดอ่าน: ซ่อนเมนูข้าง" aria-label="โหมดอ่าน">${S.focus ? '⤡' : '⤢'}</button><input id="jumpIn" inputmode="numeric" placeholder="${s.no}" aria-label="ไปกล่อง"><a href="${next ? `#/${id}/${next.no}` : '#/' + id}" aria-label="ถัดไป">›</a></div>`;
    view.innerHTML = h;
    view.querySelectorAll('.lvbtn').forEach(b => b.onclick = () => {
      const l = +b.dataset.lv, r = b.dataset.r === '2' ? 2 : 1;
      if (r === 2) { S.lvl2 = S.lvl2 || {}; if (S.lvl2[k] === l) delete S.lvl2[k]; else S.lvl2[k] = l; }
      else { if (S.lvl[k] === l) delete S.lvl[k]; else S.lvl[k] = l; }
      save(); rerender();
    });
    pop.hidden = true; pop.dataset.mode = '';
    expandAbbr($('article.content', view), ch.abbr);
    initFigs($('article.content', view), k);
    buildToc(); setTimeout(trackRead, 300); coverTools(view); flowHints(view);
    initExamBreakGame(id);
    if (typeof updateAnatomyInfographic === 'function') updateAnatomyInfographic(id, s, pg);
    if (s.examIds.length) maybeShowBoxExamRes();
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
    const hasEx = !!$('.exam-sec', view);
    if ((!hs.length && !hasEx) || !head) return;
    const nav = document.createElement('nav'); nav.className = 'toc';
    nav.innerHTML = hs.map((h, i) => `<button data-i="${i}" class="${h.tagName === 'H3' ? 'sub' : ''}">${esc(h.textContent.replace(/\s+/g, ' ').trim())}</button>`).join('')
      + (hasEx ? '<button data-ex="1" class="ex">📝 Exam</button>' : '');
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
    <div class="mode-tabs"><a class="btn primary" href="#/quiz">📝 สุ่ม Quiz ตามบท</a><a class="btn" href="#/mock">⏱️ Mock Exam แยกตามปี</a></div>
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
  /* 🏛️ หน้าสรุปผลสอบสไตล์ Monument Valley + วิเคราะห์จุดอ่อน (ใช้ร่วมกันทั้ง Mock / Quiz / ท้ายกล่อง) */
  function renderExamResult(container, title, results, opts = {}) {
    if (!container || !results.length) return;
    const total = results.length;
    const right = results.filter(r => r.ok).length;
    const wrong = results.filter(r => !r.ok && r.picked).length;
    const unans = total - right - wrong;
    const pct = Math.round(right * 100 / total);
    const pass = pct >= 60;
    const flagCnt = results.filter(r => S.flag[`${r.ch}|${r.id}`]).length;
    const fmtT = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    const dark = isDark();

    // จัดกลุ่มตามบท (ถ้ามีบทเดียว จัดกลุ่มตามเลขกล่อง/หัวข้อแทน)
    const chSet = [...new Set(results.map(r => r.ch))];
    const byGrp = {};
    for (const r of results) {
      const q = CH[r.ch] && CH[r.ch].exams[r.id];
      const key = chSet.length > 1 ? r.ch : `box:${q ? q.box : 0}`;
      const label = chSet.length > 1 ? chTitle(r.ch) : `กล่อง ${q ? q.box : '?'}`;
      const short = chSet.length > 1 ? r.ch.toUpperCase().replace('KT-', '') : `#${q ? q.box : '?'}`;
      const g = byGrp[key] = byGrp[key] || { key, ch: r.ch, label, short, ok: 0, tot: 0 };
      g.tot++; if (r.ok) g.ok++;
    }
    const grps = Object.values(byGrp);
    const sortedWeak = [...grps].sort((a, b) => (a.ok / a.tot) - (b.ok / b.tot));
    const maxP = Math.max(...grps.map(g => g.ok / g.tot));
    const bestIdx = grps.findIndex(g => g.ok / g.tot === maxP);

    // สร้าง SVG หอคอยไอโซเมตริก Monument Valley แบบกระชับ (จบในแถบเดียวไม่ต้องเลื่อน)
    const n = grps.length;
    const vw = Math.max(280, Math.min(680, n * 68 + 60));
    const baseY = 148, maxH = 88, passY = baseY - maxH * 0.6;
    const stepX = (vw - 56) / Math.max(1, n);
    let svg = '';
    const bgF = dark ? 'rgba(124,224,211,.08)' : 'rgba(255,255,255,.28)';
    svg += `<polygon points="12,134 34,123 56,134 34,145" fill="${bgF}"/>`;
    svg += `<polygon points="${vw - 56},130 ${vw - 34},119 ${vw - 12},130 ${vw - 34},141" fill="${bgF}"/>`;
    if (n > 1) svg += `<rect x="28" y="${baseY - 15}" width="${vw - 56}" height="14" fill="${dark ? '#a83630' : '#e8584a'}" opacity=".42"/>`;
    svg += `<line x1="12" y1="${passY}" x2="${vw - 12}" y2="${passY}" stroke="${dark ? '#4cf2f2' : '#0284c7'}" stroke-width="1.6" stroke-dasharray="5 4" opacity=".88"/>`;
    svg += `<rect x="${vw - 78}" y="${passY - 10}" width="66" height="17" rx="8" fill="${dark ? '#0f2b36' : '#ffffff'}" opacity=".92"/>`;
    svg += `<text x="${vw - 45}" y="${passY + 2}" text-anchor="middle" font-size="9.5" font-weight="700" fill="${dark ? '#4cf2f2' : '#0284c7'}">เกณฑ์ 60%</text>`;

    grps.forEach((g, idx) => {
      const gp = Math.round(g.ok * 100 / g.tot);
      const h = Math.max(22, Math.round((gp / 100) * maxH));
      const cx = Math.round(28 + stepX * idx + stepX / 2);
      const w = Math.min(20, Math.max(13, Math.round(stepX * 0.28)));
      const ty = baseY - h, isP = gp >= 60;
      const cT = isP ? '#ff8470' : '#e2b6a3', cL = isP ? '#ff5f4d' : '#c99682', cR = isP ? '#d13c32' : '#a37261';
      svg += `<g class="mv-tw" data-i="${idx}">`;
      svg += `<polygon points="${cx},${baseY + 10} ${cx - w},${baseY + 3} ${cx},${baseY - 3} ${cx + w},${baseY + 3}" fill="rgba(14,45,54,.18)"/>`;
      svg += `<polygon points="${cx - w},${ty + 7} ${cx},${ty + 14} ${cx},${baseY + 7} ${cx - w},${baseY}" fill="${cL}"/>`;
      svg += `<polygon points="${cx},${ty + 14} ${cx + w},${ty + 7} ${cx + w},${baseY} ${cx},${baseY + 7}" fill="${cR}"/>`;
      svg += `<polygon points="${cx},${ty} ${cx + w},${ty + 7} ${cx},${ty + 14} ${cx - w},${ty + 7}" fill="${cT}"/>`;
      if (isP) svg += `<polygon points="${cx},${ty + 3} ${cx + 6},${ty + 7} ${cx},${ty + 11} ${cx - 6},${ty + 7}" fill="#4cf2f2" opacity=".95"/>`;
      if (idx === bestIdx) {
        const iy = ty - 2;
        svg += `<rect x="${cx - 4}" y="${iy - 12}" width="8" height="12" rx="1" fill="#facc15" stroke="#ca8a04" stroke-width=".8"/>`;
        svg += `<circle cx="${cx}" cy="${iy - 7}" r="1.8" fill="#fff"/><circle cx="${cx}" cy="${iy - 7}" r=".8" fill="#14343d"/>`;
        svg += `<polygon points="${cx},${iy - 20} ${cx - 3.5},${iy - 12} ${cx + 3.5},${iy - 12}" fill="#fff"/>`;
      }
      const ly = idx === bestIdx ? ty - 24 : ty - 5;
      svg += `<text x="${cx}" y="${ly}" text-anchor="middle" font-size="10.5" font-weight="800" fill="${dark ? '#fff' : '#14343d'}">${gp}%</text>`;
      svg += `<text x="${cx}" y="${baseY + 20}" text-anchor="middle" font-size="10" font-weight="700" fill="${dark ? '#d9faf5' : '#14343d'}">${esc(g.short)}</text>`;
      svg += `<text x="${cx}" y="${baseY + 31}" text-anchor="middle" font-size="9.5" font-weight="600" fill="${dark ? '#8cdcd2' : '#1f5360'}">${g.ok}/${g.tot}</text>`;
      svg += `</g>`;
    });

    const needPass = Math.max(0, Math.ceil(total * 0.6) - right);
    const w1 = sortedWeak[0], w2 = sortedWeak[1], best = sortedWeak[sortedWeak.length - 1];
    const missTop2 = (w1 ? w1.tot - w1.ok : 0) + (w2 ? w2.tot - w2.ok : 0);
    const boost = Math.min(Math.max(2, needPass), missTop2);
    const projPct = Math.min(100, Math.round((right + boost) * 100 / total));
    const anaText = pass
      ? `<b>จุดแข็ง:</b> ${esc(best.label)} (${best.ok}/${best.tot} · ${Math.round(best.ok * 100 / best.tot)}%)` + (missTop2 > 0 ? `<br><b>เก็บเพิ่ม:</b> ${esc(w1.label)} (${w1.ok}/${w1.tot})${w2 && w2.ok < w2.tot ? `, ${esc(w2.label)}` : ''} (+${boost} ข้อ → <b>${projPct}%</b>)` : `<br>เยี่ยมมาก! ครบทุกข้อแล้ว`)
      : `<b>ต่ำกว่า 60%</b> (ขาด <b>${needPass} ข้อ</b>)<br>ควรทวน <b>${esc(w1.label)}</b> (${w1.ok}/${w1.tot})${w2 && w2.ok < w2.tot ? `, <b>${esc(w2.label)}</b>` : ''} (+${boost} ข้อ → <b>${projPct}%</b>)`;

    const barsHtml = sortedWeak.map(g => {
      const gp = Math.round(g.ok * 100 / g.tot);
      const col = gp >= 75 ? '#10b981' : gp >= 60 ? '#0ea5e9' : '#ff6b57';
      return `<div class="mv-bar-row"><div class="mv-bar-lbl"><b>${esc(g.label)}</b><span>${g.ok}/${g.tot} (<b>${gp}%</b>)</span></div><div class="mv-bar-trk"><i style="width:${gp}%;background:${col}"></i></div></div>`;
    }).join('');

    const weakHref = w1 ? `#/quiz?ch=${w1.ch}` : '#/quiz';
    container.innerHTML = `<div class="mv-res-row">
      <div class="mv-res">
        <div class="mv-res-top">
          <div>
            <span class="mv-res-badge">🏛️ ${esc(title)}</span>
            <div class="mv-res-score"><span class="mv-res-pct">${pct}%</span><span class="mv-res-sub">${right}/${total} ข้อ${opts.usedSec != null ? ' · ' + fmtT(opts.usedSec) : ''}</span></div>
          </div>
          <div class="mv-res-pill${pass ? '' : ' fail'}">${pass ? `✓ ผ่าน 60%` : `⚠ ขาด ${needPass} ข้อ`}</div>
        </div>
        <svg class="mv-res-svg" viewBox="0 0 ${vw} 188">${svg}</svg>
        <div class="mv-res-foot"><div class="mv-res-detail">👆 แตะหอคอยดูคะแนนรายบท</div></div>
      </div>
      <div class="panel mv-res-col">
        <div><h3>📊 คะแนนแยกหัวข้อ</h3><div class="mv-bars-scroll">${barsHtml}</div></div>
      </div>
      <div class="panel mv-res-col">
        <div><h3>🎯 วิเคราะห์ &amp; ไปต่อ</h3>
          <div class="mv-ana-box">${anaText}</div>
          <div class="mv-stat-chips">
            <span style="color:var(--ok)">✓ ถูก ${right}</span>
            <span style="color:var(--bad)">✗ ผิด ${wrong + unans}</span>
            <span style="color:#f59e0b">🚩 ปักหมุด ${flagCnt}</span>
          </div>
        </div>
        <div class="choice">
          ${opts.onRetake ? '<button class="btn primary" id="resRetake">🔄 ทำใหม่</button>' : `<a class="btn primary" href="${weakHref}">📝 Quiz จุดอ่อน</a>`}
          <a class="btn" href="#/wrong">📕 ข้อผิด</a>
          <a class="btn" href="#/wrong?tab=flag">🚩 ปักหมุด</a>
          ${opts.extraHref ? `<a class="btn" href="${opts.extraHref}">${esc(opts.extraLabel || 'ชุดอื่น')}</a>` : ''}
        </div>
      </div>
    </div>`;
    const det = container.querySelector('.mv-res-detail');
    container.querySelectorAll('.mv-tw').forEach(tw => {
      tw.addEventListener('click', () => {
        container.querySelectorAll('.mv-tw').forEach(x => x.classList.remove('sel'));
        tw.classList.add('sel');
        const g = grps[+tw.dataset.i], gp = Math.round(g.ok * 100 / g.tot);
        if (det) det.innerHTML = `🏛️ <b>${esc(g.label)}</b>: ถูก <b>${g.ok} / ${g.tot} ข้อ (${gp}%)</b> · ${gp >= 60 ? 'ผ่านเกณฑ์แล้ว' : 'ควรทวนเพิ่ม'}`;
      });
    });
    const rt = container.querySelector('#resRetake');
    if (rt && opts.onRetake) rt.onclick = opts.onRetake;
  }
  function maybeShowBoxExamRes() {
    const holder = $('#boxExamRes'); if (!holder) return;
    const boxes = [...view.querySelectorAll('.exam-sec .mcq')];
    if (!boxes.length || boxes.some(b => !b.dataset.done)) { holder.innerHTML = ''; return; }
    const results = boxes.map(b => {
      const ch = b.dataset.ch, id = b.dataset.q, q = CH[ch] && CH[ch].exams[id];
      const p = S.ans[`${ch}|${id}`] || '';
      return { ch, id, picked: p, ok: !!(q && p === q.answer) };
    });
    renderExamResult(holder, 'สรุปผลข้อสอบท้ายกล่อง', results, {});
  }
  function runQuiz(items, title) {
    let i = 0, score = 0;
    const results = [];
    const startMs = Date.now();
    const step = () => {
      if (i >= items.length) {
        view.innerHTML = '<div id="quizRes"></div>';
        renderExamResult($('#quizRes'), title, results, {
          usedSec: Math.round((Date.now() - startMs) / 1000),
          onRetake: () => runQuiz(items, title),
          extraHref: '#/quiz', extraLabel: '📝 ชุดใหม่'
        });
        return;
      }
      const it = items[i], q = CH[it.ch].exams[it.id];
      let answered = false;
      view.innerHTML = `<div class="qhead"><span>ข้อ ${i + 1} / ${items.length}</span><span>ถูก ${score}</span></div><div class="bar walk"><i style="width:${Math.round(i * 100 / items.length)}%"></i></div>${mcqHTML(it.ch, it.id, q, { showBox: true })}<div class="choice" style="justify-content:flex-end"><button class="btn" id="skip">Skip</button></div>`;
      const box = $(".mcq", view); applyAllHL(view);
      box._onDone = ok => {
        answered = true;
        if (ok) score++;
        results.push({ ch: it.ch, id: it.id, ok, picked: S.ans[`${it.ch}|${it.id}`] || '1' });
        $('#skip').textContent = i + 1 < items.length ? 'Next →' : 'See result';
        $('#skip').classList.add('primary');
      };
      $('#skip').onclick = () => { if (!answered) results.push({ ch: it.ch, id: it.id, ok: false, picked: '' }); i++; step(); window.scrollTo(0, 0); };
    };
    step();
  }

  /* mock exam แยกตามปี */
  let mockTmr = null;
  function stopMockTimer() { if (mockTmr) { clearInterval(mockTmr); mockTmr = null; } }
  function mockGroupOf(qid) { return qid.includes('/') ? qid.split('/')[0] : 'อื่นๆ'; }
  function mockGroupLabel(g) { return /^\d+(\.\d+)?$/.test(g) ? `ปี ${g}` : g === 'Mock' ? 'ชุด Mock' : `ชุด ${g}`; }
  function mockGroupOrder(a, b) {
    const na = parseFloat(a), nb = parseFloat(b);
    const ia = !isNaN(na), ib = !isNaN(nb);
    if (ia && ib) return nb - na;
    if (ia !== ib) return ia ? -1 : 1;
    if (a === 'Mock' || b === 'Mock') return a === 'Mock' ? -1 : 1;
    return a.localeCompare(b);
  }
  async function vMock(params) {
    await loadAll(); renderSidebar();
    const groups = {};
    for (const c of INDEX.filter(x => x.ready)) {
      const ch = CH[c.id]; if (!ch) continue;
      for (const qid of Object.keys(ch.exams)) {
        const g = mockGroupOf(qid);
        (groups[g] = groups[g] || []).push({ ch: c.id, id: qid });
      }
    }
    const keys = Object.keys(groups).sort(mockGroupOrder);
    if (!keys.length) { view.innerHTML = '<div class="hero"><h1>⏱️ Mock Exam แยกตามปี</h1></div><p class="empty">ยังไม่มีข้อสอบในระบบ</p>'; return; }
    const preYr = params.get('year') && groups[params.get('year')] ? params.get('year') : keys[0];
    const mTotal = groups[preYr] ? groups[preYr].length : 0;
    const mDone = groups[preYr] ? groups[preYr].filter(x => S.ans[`${x.ch}|${x.id}`]).length : 0;
    const mockMaze = draftOn('mazeReviewQuest') ? mvEmeraldMazeHTML({
      done: mDone, total: Math.max(1, mTotal),
      title: `เขาวงกต Mock Exam · ${mockGroupLabel(preYr)}`,
      sub: mDone >= mTotal && mTotal > 0 ? '✨ ทำครบชุดนี้แล้ว! คริสตัลปลดล็อก' : `ทำไปแล้ว ${mDone}/${mTotal} ข้อ · เดินเหยียบสวิตช์สีชมพูไปให้ถึงคริสตัลกลางวิหาร!`
    }) : '';
    view.innerHTML = `<div class="hero"><h1>⏱️ Mock Exam แยกตามปี</h1><p>จำลองทำข้อสอบจริงแยกแต่ละปี ใช้หน้าตาข้อสอบเดียวกับท้ายบทและ Quiz</p></div>${mockMaze}
    <div class="mode-tabs"><a class="btn" href="#/quiz">📝 สุ่ม Quiz ตามบท</a><a class="btn primary" href="#/mock">⏱️ Mock Exam แยกตามปี</a></div>
    <div class="panel">
      <h3>เลือกปี / ชุดข้อสอบ</h3>
      <div class="choice" id="mYr">${keys.map(g => `<label><input type="radio" name="myr" value="${esc(g)}" ${g === preYr ? 'checked' : ''}>${esc(mockGroupLabel(g))} (${groups[g].length} ข้อ)</label>`).join('')}</div>
      <h3>รูปแบบการทำ</h3>
      <div class="choice" id="mMode">
        <label><input type="radio" name="mmode" value="exam" checked>⏱️ จำลองสอบจริง (ทำรวดเดียว ส่งทีเดียว)</label>
        <label><input type="radio" name="mmode" value="quiz">📝 เฉลยทีละข้อ (เหมือน Quiz)</label>
      </div>
      <h3>ลำดับข้อ</h3>
      <div class="choice" id="mOrd">
        <label><input type="radio" name="mord" value="seq" checked>เรียงตามเลขข้อ</label>
        <label><input type="radio" name="mord" value="rand">สุ่มลำดับข้อ</label>
      </div>
      <h3>จำนวนข้อ</h3>
      <div class="choice" id="mN">
        <label><input type="radio" name="mn" value="9999" checked>ทั้งหมด</label>
        <label><input type="radio" name="mn" value="50">50 ข้อ</label>
        <label><input type="radio" name="mn" value="100">100 ข้อ</label>
      </div>
      <div id="mTimeWrap">
        <h3>จับเวลา (โหมดจำลองสอบจริง)</h3>
        <div class="choice" id="mTime">
          <label><input type="radio" name="mtime" value="1" checked>จับเวลา (1 นาที/ข้อ)</label>
          <label><input type="radio" name="mtime" value="0">ไม่จับเวลา</label>
        </div>
      </div>
      <button class="btn primary" id="mGo">เริ่มทำข้อสอบ</button> <span class="bar-label" id="mInfo"></span>
    </div>`;
    const getItems = () => {
      const yr = view.querySelector('#mYr input:checked').value;
      const ord = view.querySelector('#mOrd input:checked').value;
      const n = +view.querySelector('#mN input:checked').value;
      let list = [...groups[yr]];
      if (ord === 'rand') list = shuffle(list);
      else list.sort((a, b) => (parseInt(a.id.split('/')[1]) || 0) - (parseInt(b.id.split('/')[1]) || 0) || a.ch.localeCompare(b.ch));
      return { yr, items: list.slice(0, n) };
    };
    const syncInfo = () => {
      const mode = view.querySelector('#mMode input:checked').value;
      $('#mTimeWrap').hidden = mode !== 'exam';
      const r = getItems();
      $('#mInfo').textContent = `${mockGroupLabel(r.yr)} · ${r.items.length} ข้อ`;
    };
    view.querySelectorAll('input').forEach(x => x.addEventListener('change', syncInfo));
    syncInfo();
    $('#mGo').onclick = () => {
      const { yr, items } = getItems();
      const mode = view.querySelector('#mMode input:checked').value;
      const title = `Mock ${mockGroupLabel(yr)}`;
      if (mode === 'quiz') return runQuiz(items, title);
      const timed = view.querySelector('#mTime input:checked').value === '1';
      runMockExam(items, title, timed, yr);
    };
  }
  function runMockExam(items, title, timed, yr) {
    stopMockTimer();
    const picks = new Array(items.length).fill('');
    let cur = 0, secLeft = timed ? items.length * 60 : 0;
    const startMs = Date.now();
    const fmtT = s => { const m = Math.floor(s / 60), r = s % 60; return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`; };
    const submit = auto => {
      stopMockTimer();
      const unans = picks.filter(x => !x).length;
      if (!auto && unans && !confirm(`ยังไม่ได้ตอบ ${unans} ข้อ ต้องการส่งข้อสอบเลยไหม?`)) {
        if (timed) startTimer();
        return;
      }
      const results = items.map((it, idx) => {
        const q = CH[it.ch].exams[it.id], p = picks[idx], ok = p === q.answer;
        if (p) {
          const k = `${it.ch}|${it.id}`;
          S.ans[k] = p;
          S.stats[k] = S.stats[k] || { r: 0, w: 0 };
          if (ok) { S.stats[k].r++; delete S.wrong[k]; }
          else { S.stats[k].w++; S.wrong[k] = { ch: it.ch, id: it.id, n: (S.wrong[k]?.n || 0) + 1, t: Date.now() }; }
        }
        return { ch: it.ch, id: it.id, picked: p, ok };
      });
      save();
      const right = results.filter(r => r.ok).length;
      const usedSec = Math.round((Date.now() - startMs) / 1000);
      const renderList = flt => {
        const rows = items.map((it, idx) => ({ it, idx, q: CH[it.ch].exams[it.id], ok: picks[idx] === CH[it.ch].exams[it.id].answer }))
          .filter(x => flt === 'all' ? true : flt === 'wrong' ? !x.ok : x.ok);
        return rows.map(x => `<div class="mock-rev-item">${!picks[x.idx] ? '<p class="bar-label" style="margin:10px 0 -8px">ข้อ ' + (x.idx + 1) + ' · ยังไม่ได้ตอบในรอบนี้</p>' : ''}${mcqHTML(x.it.ch, x.it.id, x.q, { showBox: true, showSaved: true })}</div>`).join('') || '<p class="empty">ไม่มีข้อในหมวดนี้</p>';
      };
      view.innerHTML = `<div id="mockRes"></div>
        <div class="mode-tabs" id="mFlt">
          <button class="btn primary" data-f="all">ทั้งหมด (${items.length})</button>
          <button class="btn" data-f="wrong">ผิด / ไม่ได้ตอบ (${items.length - right})</button>
          <button class="btn" data-f="right">ถูก (${right})</button>
        </div>
        <div id="mRev">${renderList('all')}</div>`;
      renderExamResult($('#mockRes'), title, results, {
        usedSec,
        onRetake: () => runMockExam(items, title, timed, yr),
        extraHref: '#/mock', extraLabel: '⏱️ เลือกปีอื่น'
      });
      applyAllHL(view);
      $('#mFlt').addEventListener('click', e => {
        const b = e.target.closest('button[data-f]'); if (!b) return;
        view.querySelectorAll('#mFlt button').forEach(x => x.classList.toggle('primary', x === b));
        $('#mRev').innerHTML = renderList(b.dataset.f);
        applyAllHL($('#mRev'));
      });
      window.scrollTo(0, 0);
    };
    const startTimer = () => {
      stopMockTimer();
      if (!timed) return;
      mockTmr = setInterval(() => {
        secLeft--;
        const el = $('#mTmr');
        if (el) { el.textContent = '⏱️ ' + fmtT(Math.max(0, secLeft)); el.classList.toggle('low', secLeft <= 60); }
        if (secLeft <= 0) { toast('หมดเวลา! ระบบส่งข้อสอบให้อัตโนมัติ'); submit(true); }
      }, 1000);
    };
    const draw = () => {
      const it = items[cur], q = CH[it.ch].exams[it.id];
      const answered = picks.filter(Boolean).length;
      view.innerHTML = `<div class="qhead"><span><b>${esc(title)}</b> · ข้อ ${cur + 1} / ${items.length} (ตอบแล้ว ${answered})</span>${timed ? `<span class="mock-timer${secLeft <= 60 ? ' low' : ''}" id="mTmr">⏱️ ${fmtT(secLeft)}</span>` : ''}</div>
        <div class="bar walk"><i style="width:${Math.round(answered * 100 / items.length)}%"></i></div>
        ${mcqHTML(it.ch, it.id, q, { showBox: false })}
        <div class="choice" style="justify-content:space-between;margin-top:12px">
          <div style="display:flex;gap:8px"><button class="btn" id="mPrev"${cur === 0 ? ' disabled' : ''}>← ก่อนหน้า</button><button class="btn" id="mNext"${cur === items.length - 1 ? ' disabled' : ''}>ถัดไป →</button></div>
          <button class="btn primary" id="mSub">📤 ส่งข้อสอบ (${answered}/${items.length})</button>
        </div>
        <details class="panel" style="margin-top:12px"><summary style="cursor:pointer;font-weight:700">🔢 ข้ามไปข้อที่… (${answered}/${items.length})</summary><div class="mock-nav" id="mNav">${items.map((_, idx) => `<button type="button" data-i="${idx}" class="${picks[idx] ? 'ans' : ''}${idx === cur ? ' cur' : ''}">${idx + 1}</button>`).join('')}</div></details>`;
      const box = $('.mcq', view);
      box.classList.add('mock-pending');
      if (picks[cur]) { const po = box.querySelector(`.opt[data-l="${picks[cur]}"]`); if (po) po.classList.add('picked'); }
      applyAllHL(view);
      box.addEventListener('click', e => {
        if (e.target.closest('.strike')) return;
        const opt = e.target.closest('.opt');
        if (!opt || !getSelection().isCollapsed) return;
        const l = opt.dataset.l;
        picks[cur] = picks[cur] === l ? '' : l;
        box.querySelectorAll('.opt').forEach(o => o.classList.toggle('picked', o.dataset.l === picks[cur]));
        const cnt = picks.filter(Boolean).length;
        const nb = $(`#mNav button[data-i="${cur}"]`); if (nb) nb.classList.toggle('ans', !!picks[cur]);
        $('#mSub').textContent = `📤 ส่งข้อสอบ (${cnt}/${items.length})`;
      });
      $('#mPrev').onclick = () => { if (cur > 0) { cur--; draw(); window.scrollTo(0, 0); } };
      $('#mNext').onclick = () => { if (cur < items.length - 1) { cur++; draw(); window.scrollTo(0, 0); } };
      $('#mSub').onclick = () => submit(false);
      $('#mNav').addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) { cur = +b.dataset.i; draw(); window.scrollTo(0, 0); } });
    };
    draw();
    startTimer();
  }
  async function vWrong(params) {
    await loadAll(); renderSidebar();
    const isFlag = params && params.get('tab') === 'flag';
    const wList = Object.values(S.wrong).filter(w => CH[w.ch] && CH[w.ch].exams[w.id]).sort((a, b) => b.t - a.t);
    const fList = Object.values(S.flag).filter(w => CH[w.ch] && CH[w.ch].exams[w.id]).sort((a, b) => b.t - a.t);
    const list = isFlag ? fList : wList;
    const totalAttempted = Object.keys(S.stats || {}).length;
    const clearedCnt = Math.max(0, totalAttempted - wList.length);
    const wrongMaze = draftOn('mazeReviewQuest') ? mvEmeraldMazeHTML({
      done: list.length === 0 ? 1 : clearedCnt,
      total: list.length === 0 ? 1 : Math.max(1, totalAttempted),
      title: isFlag ? 'เขาวงกตข้อที่ปักหมุด' : 'เขาวงกตเคลียร์ข้อผิด (Mistakes)',
      sub: !list.length ? '✨ เคลียร์ข้อผิดหมดแล้ว! คริสตัลสีม่วงปลดล็อกสว่างไสว' : `เหลืออีก ${list.length} ข้อที่ต้องเคลียร์ · ตอบถูกเมื่อไหร่ น้อง Ro จะก้าวเข้าใกล้คริสตัล!`
    }) : '';
    let h = `<div class="hero"><h1>${isFlag ? '🚩 ข้อที่ปักหมุดไว้ทวน' : '📕 Mistakes'}</h1><p>${isFlag ? 'ข้อที่กดปักหมุดไว้ (เช่น เดาถูกแต่ยังไม่ชัวร์) ไว้กลับมาทวนซ้ำ' : 'ตอบถูกเมื่อไหร่ ข้อนั้นจะออกจากกองเอง'}</p></div>${wrongMaze}
      <div class="mode-tabs"><a class="btn${isFlag ? '' : ' primary'}" href="#/wrong">📕 ข้อที่ผิด (${wList.length})</a><a class="btn${isFlag ? ' primary' : ''}" href="#/wrong?tab=flag">🚩 ปักหมุด (${fList.length})</a></div>`;
    if (!list.length) { view.innerHTML = h + `<p class="empty">${isFlag ? 'ยังไม่มีข้อที่ปักหมุด กดปุ่ม 🚩 บนข้อสอบข้อไหนก็ได้เพื่อเก็บไว้ทวน' : 'ยังไม่มีข้อผิด ลองทำข้อสอบท้ายหัวข้อหรือโหมดทำข้อสอบดูนะ'}</p>`; return; }
    h += `<div class="choice"><button class="btn primary" id="wGo">Review all (${list.length})</button><button class="btn" id="wClear">Clear</button></div>`;
    h += list.map(w => { const q = CH[w.ch].exams[w.id]; return `<a class="search-hit" href="#/${w.ch}/${q.box}"><b>${esc(w.id)}</b> · ${esc(CH[w.ch].title)} กล่อง ${q.box}${w.n ? ` · ผิด ${w.n} ครั้ง` : ' · 🚩 ปักหมุด'}<small>${esc(q.stem)}</small></a>`; }).join('');
    view.innerHTML = h; applyAllHL(view);
    $('#wGo').onclick = () => runQuiz(shuffle(list.map(w => ({ ch: w.ch, id: w.id }))), isFlag ? 'ทวนข้อที่ปักหมุด' : 'ทวนกองข้อผิด');
    $('#wClear').onclick = () => { if (confirm(isFlag ? 'ล้างข้อที่ปักหมุดทั้งหมด?' : 'ล้างกองข้อผิดทั้งหมด?')) { if (isFlag) S.flag = {}; else S.wrong = {}; save(); vWrong(params); } };
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
    const useMascot = draftOn('noteNeonMascot');
    const renderNoteItem = x => {
      if (!x.n) return '';
      if (useMascot && x.ns) {
        return `<span class="inote sticky has-mascot${x.nc === 'g' ? ' st-g' : ''}" style="cursor:default">${esc(x.n)}<span class="inote-mascot" aria-hidden="true">${stickyMascotSVG(x.nc)}</span></span>`;
      }
      return `<span class="inote-txt">${x.ns ? '🗒️ ' : '★ '}${esc(x.n)}</span>`;
    };
    let h = `<div class="hero"><h1>🗒️ My notes & highlights</h1><p>เรียงตามบทและกล่อง กดชื่อกล่องเพื่อไปอ่านต่อ</p></div>`;
    let any = false;
    for (const ch of loadedCH()) for (const s of ch.sections) {
      const k = secKey(ch.id, s.no), note = S.notes[k], hl = S.hl[k] || [];
      if (!note && !hl.length) continue; any = true;
      h += `<div class="panel"><h3><a href="#/${ch.id}/${s.no}">${esc(ch.title)} · ${s.no}. ${esc(s.title)}</a></h3>${note ? `<p style="white-space:pre-wrap;margin:6px 0">${esc(note)}</p>` : ''}${hl.map(x => `<p style="margin:6px 0"><mark class="user-hl c-${x.c || 'g'}">${esc(x.t)}</mark>${renderNoteItem(x)}</p>`).join('')}</div>`;
    }
    const qk = {};
    for (const k of Object.keys(S.hl)) { const m = k.match(/^q:([^|]+)\|(.+)\|([^|]+)$/); if (m && S.hl[k].length) (qk[m[1] + '|' + m[2]] = qk[m[1] + '|' + m[2]] || []).push(...S.hl[k]); }
    const qs = Object.keys(qk);
    if (qs.length) {
      any = true; h += '<h2 style="margin:22px 0 8px">📝 ไฮไลต์ในข้อสอบ</h2>';
      for (const x of qs) { const [c, qid] = x.split('|'); const q = CH[c] && CH[c].exams[qid];
        h += `<div class="panel"><h3>${q ? `<a href="#/${c}/${q.box}">ข้อ ${esc(qid)} · กล่อง ${q.box}</a>` : esc(qid)}</h3>${qk[x].map(y => `<p style="margin:6px 0"><mark class="user-hl c-${y.c || 'g'}">${esc(y.t)}</mark>${renderNoteItem(y)}</p>`).join('')}</div>`; }
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
    const revMaze = draftOn('mazeReviewQuest') ? mvEmeraldMazeHTML({
      done: total ? done : 1,
      total: total || 1,
      title: 'เขาวงกตทบทวนประจำวัน (Today\'s Review)',
      sub: !items.length ? '✨ ทวนวันนี้ครบทุกข้อแล้ว! คริสตัลปลดล็อกแล้ว' : `ทวนไปแล้ว ${done}/${total} รายการ · กด "Got it" เพื่อให้น้อง Ro เดินเหยียบสวิตช์ไปถึงกลางวิหาร`
    }) : '';
    let h = `<div class="hero rv-hero"><h1>📅 Today's review</h1><p>ระบบนัดทวนให้เอง: ตอบ "จำได้" รอบถัดไปจะห่างออก (1 → 2 → 5 → 11 วัน…) ตอบ "ยังไม่แม่น" จะกลับมาพรุ่งนี้</p>
      <div class="rv-stat"><div><b>${items.length}</b><span>Due</span></div><div><b>${done}</b><span>Done today</span></div><div class="rv-ring" style="--p:${total ? Math.round(done * 100 / total) : 100}"><span>${total ? Math.round(done * 100 / total) : 100}%</span></div></div></div>${revMaze}`;
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
    const drillTree = draftOn('drugBloomTree') ? mvDrugBloomTreeHTML({
      known: Object.keys(S.known || {}).filter(k => k.startsWith('db:')).length,
      total: Math.max(12, db.reduce((a, t) => a + (t.rows ? t.rows.length : 4), 0)),
      mode: 'drill'
    }) : '';
    let h = `<div class="hero"><h1>🧠 Name drill</h1><p>ข้อสอบจับคู่ที่สร้างเองจากตารางในเนื้อหา เหมาะกับเรื่องที่ต้องจำชื่อเยอะ (ยา เชื้อ โรค อาชีพ) ถามทั้งสองทาง: ชื่อ → คุณสมบัติ และ คุณสมบัติ → ชื่อ</p></div>${drillTree}
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
    const useTree = draftOn('drugBloomTree');
    const dbKeyOf = e => `db:${e.kind}|${e.name}`;
    const dbKnownCount = () => all.filter(e => S.known[dbKeyOf(e)]).length;
    view.innerHTML = `<div class="hero"><h1>💊 Drug & Bug</h1><p>รวมยาและเชื้อจากตารางของทุกบทไว้ที่เดียว เรียง A–Z ถ้าชื่อเดียวกันอยู่หลายกล่องจะรวมเป็นการ์ดเดียว · เพิ่มบทใหม่แล้วหน้านี้อัปเดตเอง</p></div>
      ${useTree ? `<div id="dbTreeSlot">${mvDrugBloomTreeHTML({ known: dbKnownCount(), total: Math.max(1, all.length), mode: 'db' })}</div>` : ''}
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
        const dk = dbKeyOf(e), isK = !!S.known[dk];
        const kBtn = useTree ? `<button type="button" class="db-know-btn${isK ? ' on' : ''}" data-dbk="${esc(dk)}" title="กดเมื่อจำตัวนี้ได้แล้ว เพื่อปลูกดอกไม้บนต้นไม้">${isK ? '✓ จำได้แล้ว' : '+ จำได้'}</button>` : '';
        return `<div class="db-card ${e.kind}${isK && useTree ? ' is-known' : ''}"${anc}><div class="db-h"><span class="db-k">${e.kind === 'drug' ? 'Drug' : 'Bug'}</span><b>${esc(e.name)}</b><span class="db-cat">${esc(e.g)} › ${esc(e.sub)}</span>${kBtn}</div>
          ${e.facts.map(x => `<div class="db-f"><span>${esc(x.k)}</span><div class="db-v">${x.v}</div></div>`).join('')}
          <div class="db-src">${e.src.map(x => `<a href="#/${x.h}">${x.ch.toUpperCase()} · กล่อง ${x.no} ↗</a>`).join('')}${e.ex.length ? `<span class="db-ex">ออกสอบ ${e.ex.length} ข้อ</span>` : ''}</div></div>`;
      }).join('') || `<p class="empty">${anyCh ? 'ไม่เจอชื่อที่ค้น' : 'ยังไม่ได้เลือกบท — ติ๊กเลือกบทที่ต้องการด้านบน'}</p>`;
      az.innerHTML = letters.map(L => `<a href="#" data-l="${L}">${L}</a>`).join('');
      grid.classList.toggle('covering', !!f.cover);
    };
    const refreshTree = () => {
      if (!useTree) return;
      const slot = $('#dbTreeSlot');
      if (slot) { slot.innerHTML = mvDrugBloomTreeHTML({ known: dbKnownCount(), total: Math.max(1, all.length), mode: 'db' }); bindTreePv(slot); }
    };
    const bindTreePv = root => {
      const pv = root && root.querySelector('.mv-tree-pv');
      if (pv) pv.onclick = () => {
        const card = pv.closest('.mv-tree-card');
        if (card) { card.classList.toggle('is-pv'); pv.classList.toggle('on'); }
      };
    };
    if (useTree) bindTreePv($('#dbTreeSlot'));
    view.querySelectorAll('.seg button').forEach(b => b.onclick = () => { f.k = b.dataset.k; save(); view.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === b)); drawCats(); draw(); });
    $('#dbq').oninput = draw;
    $('#dbCover').onchange = e => { f.cover = e.target.checked ? 1 : 0; save(); grid.querySelectorAll('.db-v.shown').forEach(x => x.classList.remove('shown')); draw(); };
    view.querySelectorAll('.db-chs input').forEach(x => x.onchange = () => { drawCats(); draw(); });
    bindSelActs(view, () => { drawCats(); draw(); });
    az.onclick = e => { const a = e.target.closest('a'); if (!a) return; e.preventDefault(); const t = document.getElementById('db-' + a.dataset.l); if (t) scrollTo({ top: t.getBoundingClientRect().top + scrollY - 70, behavior: 'smooth' }); };
    grid.addEventListener('click', e => {
      const kb = e.target.closest('.db-know-btn');
      if (kb) {
        const dk = kb.dataset.dbk;
        if (S.known[dk]) delete S.known[dk]; else { S.known[dk] = 1; toast('✨ ดอกไม้ผลิบานบนต้นไม้จำยาแล้ว!'); }
        save(); draw(); refreshTree(); return;
      }
      if (!f.cover) return; const v = e.target.closest('.db-v'); if (v && !e.target.closest('a')) v.classList.toggle('shown');
    });
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
  function flowHints(root) { root.querySelectorAll('.flow').forEach(x => { const sc = x.querySelector('.fl-scroll'); if (sc) x.classList.toggle('fl-wide', sc.scrollWidth > sc.clientWidth + 2); }); }
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
    const seq = ++_routeSeq;
    stopExamBreakGame();
    stopMockTimer();
    closeNav();
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, qs] = raw.split('?');
    const params = new URLSearchParams(qs || '');
    const parts = path.split('/').filter(Boolean);
    try {
      await loadIndex();
      if (!parts.length) return vHome();
      if (parts[0] === 'quiz') return vQuiz(params);
      if (parts[0] === 'mock') return vMock(params);
      if (parts[0] === 'wrong') return vWrong(params);
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
      if (parts[0] === 'owner') return vOwner();
      if (parts[0] === 'guide') return vGuide();
      if (parts[0] === 'backup') return vBackup();
      if (parts[0] === 'map' && parts[1]) return vMap(parts[1]);
      if (parts[1]) return vSection(parts[0], parseInt(parts[1]), seq);
      return vChapter(parts[0], seq);
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
  sidebar.addEventListener('pointerover', e => {
    if (!draftOn('fastSidebarNav') || !INDEX) return;
    const card = e.target.closest('.side-ch-mz');
    if (!card) return;
    const a = card.querySelector('a[href^="#/"]');
    if (!a) return;
    const cid = a.getAttribute('href').replace(/^#\/?/, '').split('/')[0];
    if (cid && !CH[cid]) loadChapter(cid).catch(() => {});
  });
  sidebar.addEventListener('click', e => {
    if (draftOn('fastSidebarNav')) {
      const card = e.target.closest('.side-ch-mz');
      if (card && !e.target.closest('a,button,summary')) {
        const a = card.querySelector('a[href^="#/"]');
        if (a) { e.preventDefault(); location.hash = a.getAttribute('href'); return; }
      }
    }
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
  /* 🔒 โหมด "ของเจ้าของ" (jinjuta.nanny84@docchula.com) — รายการ Unpublished & ปุ่ม Publish */
  var OWNER_EMAIL = 'jinjuta.nanny84@docchula.com';
  var DRAFT_REGISTRY = [
    {
      key: 'pomoMiniCastle',
      title: 'ปุ่มจับเวลาย่อขนาดแบบเขาวงกตสี่เหลี่ยม',
      area: 'Widget จับเวลา (มุมขวาล่าง)',
      desc: 'เปลี่ยนปุ่มจับเวลาตอนย่อจากวงกลม เป็นเขาวงกตสี่เหลี่ยม Monument Valley ที่มีตัวน้อง Ida เดินตามเวลาเหมือนหน้าจับเวลาเต็ม',
      added: 'v81'
    },
    {
      key: 'aiPopViewportFit',
      title: 'หน้าต่างถาม Gemini + ปุ่ม Sticky พอดีจอไม่ต้องเลื่อน',
      area: 'ป๊อปอัปถาม Gemini (เมื่อลากคลุมคำ)',
      desc: 'จัดหน้าต่างถาม Gemini ให้ลอยกลางจอพอดีความสูง MacBook และตรึงปุ่มลัด Sticky Note ไว้ด้านล่างเสมอ ไม่ว่าจะคลุมคำอยู่ล่างสุดของหน้าก็ไม่ต้องเลื่อนจอลง',
      added: 'v84'
    },
    {
      key: 'underwaterReefTimer',
      title: 'จับเวลาแบบกำหนดเอง + Infographic ปราสาทใต้น้ำ',
      area: 'Widget จับเวลา + กรอบแนวตั้งด้านขวา',
      desc: 'พิมพ์กำหนดเวลาอ่านเองได้ (นาที) บันทึกเวลาอ่านสะสมรายวัน และแสดงกรอบปราสาทใต้น้ำแนวตั้งด้านขวาที่มีปะการัง/สัตว์ทะเลค่อย ๆ เพิ่มขึ้นทีละชนิดทุก 30 นาที (กดหุบเก็บได้)',
      added: 'v84'
    },
    {
      key: 'fastSidebarNav',
      title: 'กดเปลี่ยนบทจากแถบข้างติดทันที + โหลดไวขึ้น',
      area: 'แถบสารบัญด้านข้าง (Sidebar)',
      desc: 'กดได้ทั้งการ์ดบท (รวมถึงตรงแถบความคืบหน้า) พรีโหลดบทล่วงหน้าตอนชี้เมาส์ ตัดการโหลดซ้ำ และแสดงสถานะกำลังโหลดทันที',
      added: 'v86'
    },
    {
      key: 'kwPopViewportArt',
      title: 'หน้าต่างเพิ่ม Keyword พอดีจอ + กราฟิก Monument Valley',
      area: 'ป๊อปอัปเพิ่ม Keyword (เมื่อลากคลุมคำ)',
      desc: 'จัดกล่องเพิ่ม Keyword ให้ลอยกลางจอไม่ต้องเลื่อนลงแม้คลุมคำอยู่ล่างสุด พร้อมกราฟิกน้ำตกและวิญญาณเรืองแสงน่ารักด้านล่าง',
      added: 'v88'
    },
    {
      key: 'notePopViewportArt',
      title: 'หน้าต่าง Star & Sticky Note พอดีจอ + กราฟิก Monument Valley',
      area: 'ป๊อปอัป ★ Star note & 🗒️ Sticky note',
      desc: 'จัดกล่องโน้ตขนาดเท่ากล่อง Keyword ลอยกลางจอไม่ต้องเลื่อน พร้อมกราฟิกปราสาท Ida/Crow (★) และ Ro & ลูก (Sticky) เบลนด์กลืนพื้นหลังด้านล่าง',
      added: 'v90'
    },
    {
      key: 'round2Rating',
      title: 'ประเมินความเข้าใจรอบ 2 + แถบซ้าย 2 สี (ซ้ายรอบ 1 / ขวารอบ 2)',
      area: 'หน้าอ่านบท + แถบสารบัญซ้าย + วงแหวนหน้าหลัก',
      desc: 'เพิ่มปุ่มประเมินรอบสองเพื่อให้เห็นพัฒนาการ (เช่น ★ → ★★★★) การ์ดแถบซ้ายแบ่ง 2 สีซ้าย-ขวา และวงแหวนความคืบหน้าหน้าหลักใช้ผลรอบล่าสุด',
      added: 'v91'
    },
    {
      key: 'reefTankExpand',
      title: 'ขยายปราสาทใต้น้ำกลางจอ + นางเงือก วาฬ กลุ่มปะการัง & เกมส์ให้อาหารปลา',
      area: 'Tank น้ำจับเวลา (กรอบขวา → หน้าต่างกลางจอ)',
      desc: 'กดขยายแทงก์น้ำมาดูกลางจอแก้เบื่อได้ ปราสาทใต้น้ำอลังการกว่าเดิม มีนางเงือกและวาฬว่ายช้า ๆ เป็นฉากหลัง ปะการังขยายเป็นกลุ่มตามชนิดที่สะสมวันนี้ พร้อมปุ่มให้อาหารปลาเรืองแสง โหมดเรืองแสงกลางคืน และแตะฟองอากาศ/ไข่มุก',
      added: 'v91'
    },
    {
      key: 'noteNeonMascot',
      title: 'Sticky Note สีเขียวนีออนอ่อน + ตัวการ์ตูนมุมขวาทั้ง 2 สี',
      area: 'Sticky Note ในบทอ่าน & หน้า Notes',
      desc: 'เพิ่มสีเขียวนีออนอ่อนสไตล์หัวข้อย่อย (เข้มสวยในโหมดมืด) ให้เลือกคู่กับสีเหลือง พร้อมตัวการ์ตูน Monument Valley น่ารักมุมขวาล่างทั้งสองสี',
      added: 'v91'
    },
    {
      key: 'anatomySidebarInfographic',
      title: 'Infographic หุ่น Anatomy ลอยด้านซ้าย + อวัยวะเรืองแสงตามบท',
      area: 'พื้นที่ด้านซ้ายหน้าอ่านเนื้อหา (Desktop)',
      desc: 'เพิ่มหุ่นคนยืนผิวใสลอยพร้อมเงาบนพื้นและ Anatomy จำลองด้านซ้ายของเนื้อหา พร้อมทำให้อวัยวะที่ตรงกับบทและหัวข้อที่กำลังอ่านเรืองแสงอัตโนมัติ',
      added: 'v91'
    },
    {
      key: 'drugBloomTree',
      title: 'ต้นไม้ผลิดอกเรขาคณิต + ผีเสื้อ (จำยา & เชื้อ)',
      area: 'หน้า Drug & Bug (#/db) & Name Drill (#/drill)',
      desc: 'เพิ่มต้นไม้ Monument Valley บนลานหิน ยิ่งกดติ๊กจำยา/เชื้อได้เยอะ ดอกไม้กังหันหลากสีและผีเสื้อสีฟ้าจะค่อย ๆ ผลิบานและบินวนรอบต้นไม้',
      added: 'v95'
    },
    {
      key: 'mazeReviewQuest',
      title: 'เขาวงกตมรกต + คริสตัลปลดล็อก (Mistakes / Review / Mock)',
      area: 'หน้า Mistakes (#/wrong), Review (#/review) & Mock (#/mock)',
      desc: 'เพิ่มเขาวงกตมรกต Monument Valley ที่น้อง Ro ค่อย ๆ เดินเหยียบสวิตช์สีชมพูไปปลดล็อกคริสตัลสีม่วงตรงกลางเมื่อเคลียร์ข้อผิดหรือทวนวันนี้ครบ',
      added: 'v95'
    },
    {
      key: 'homeFloatingIslands',
      title: 'เกาะปราสาทลอยน้ำ 3 สีพาสเทล (3 พอร์ทัลหลักหน้า Home)',
      area: 'หน้าแรก (#/)',
      desc: 'เพิ่มเกาะปราสาทลอยน้ำ 3 สีพาสเทล (ทอง=อ่านบทเรียน, ชมพู=โจทย์/ข้อผิด/Mock, มิ้นต์=ยา/เชื้อ/Drill) ลอยขึ้นลงพร้อมธงพลิ้วบนหน้าแรก',
      added: 'v95'
    }
  ];
  var _onOwnerChange = [];
  var _friendPreview = false;
  function isOwner() {
    if (!OWNER_EMAIL) return false;
    const st = window.NLE_SYNC ? window.NLE_SYNC.getState() : null;
    const em = st && st.user && st.user.email ? st.user.email.toLowerCase() : '';
    if (em) return em === OWNER_EMAIL;
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return true;
    try { return localStorage.getItem('nle-owner-preview') === '1'; } catch (_) { return false; }
  }
  function isPublished(flag) {
    const pub = window.NLE_SYNC && window.NLE_SYNC.getPublishedFlags ? window.NLE_SYNC.getPublishedFlags() : {};
    return !!pub[flag];
  }
  function draftOn(flag) {
    if (isPublished(flag)) return true;
    if (!DRAFT_REGISTRY || !DRAFT_REGISTRY.some(f => f.key === flag)) return false;
    return isOwner() && !_friendPreview;
  }
  function updateOwnerBadge() {
    const on = isOwner();
    const btn = $('#ownerBtn');
    const pill = $('#ownerDraftCount');
    if (btn) btn.hidden = !on;
    if (pill) {
      const unpub = DRAFT_REGISTRY.filter(f => !isPublished(f.key)).length;
      pill.hidden = !on || !unpub;
      pill.textContent = unpub;
    }
    let bar = $('#friendPreviewBar');
    if (on && _friendPreview) {
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'friendPreviewBar';
        bar.className = 'friend-preview-bar';
        bar.innerHTML = '<span>👁️ กำลังดูใน<b>มุมมองเพื่อน</b> (ซ่อนฟีเจอร์ที่ยัง Unpublished)</span><button type="button" id="fpExitBtn">กลับสู่มุมมองเจ้าของ</button>';
        document.body.appendChild(bar);
        $('#fpExitBtn', bar).onclick = () => { _friendPreview = false; notifyOwnerUI(); if (location.hash.replace(/^#\/?/, '').split('?')[0] === 'owner') vOwner(); };
      }
    } else if (bar) {
      bar.remove();
    }
  }
  function notifyOwnerUI() {
    const on = isOwner();
    document.documentElement.classList.toggle('owner-preview', on);
    updateOwnerBadge();
    _onOwnerChange.forEach(fn => { try { fn(on); } catch (_) {} });
  }
  function syncOwnerPreview(st) {
    const em = st && st.user && st.user.email ? st.user.email.toLowerCase() : '';
    try {
      if (em === OWNER_EMAIL) localStorage.setItem('nle-owner-preview', '1');
      else if (em) localStorage.removeItem('nle-owner-preview');
    } catch (_) {}
    notifyOwnerUI();
  }
  function vOwner() {
    renderSidebar();
    if (!isOwner()) {
      view.innerHTML = `<div class="hero"><h1>🔒 เฉพาะของเจ้าของ</h1><p>หน้านี้สำหรับจัดการฟีเจอร์ของเจ้าของเว็บไซต์ (<code>${OWNER_EMAIL}</code>) เท่านั้น</p><p><a class="btn" href="#/">← กลับหน้าแรก</a> <a class="btn" href="#/sync">☁️ ไปหน้า Login</a></p></div>`;
      return;
    }
    const st = window.NLE_SYNC ? window.NLE_SYNC.getState() : {};
    const fs = window.NLE_SYNC && window.NLE_SYNC.getFlagsStatus ? window.NLE_SYNC.getFlagsStatus() : { loaded: false, error: '' };
    const signedInAsOwner = !!(st.user && st.user.email && st.user.email.toLowerCase() === OWNER_EMAIL);
    const unpubList = DRAFT_REGISTRY.filter(f => !isPublished(f.key));
    const pubList = DRAFT_REGISTRY.filter(f => isPublished(f.key));
    const needRules = fs.error === 'permission-denied';
    const rulesCode = `rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /users/{userId}/{document=**} {\n      allow read, write: if request.auth != null && request.auth.uid == userId;\n    }\n    match /appConfig/{docId} {\n      allow read: if true;\n      allow write: if request.auth != null && request.auth.token.email == '${OWNER_EMAIL}';\n    }\n  }\n}`;
    const itemHtml = f => {
      const pub = isPublished(f.key);
      return `<div class="owner-item ${pub ? 'is-pub' : 'is-draft'}">
        <div class="owner-item-hd">
          <div class="owner-item-title">
            <span class="owner-badge ${pub ? 'pub' : 'draft'}">${pub ? '🌐 Published (เพื่อนใช้ได้แล้ว)' : '🔒 Unpublished (เฉพาะของเจ้าของ)'}</span>
            <h3>${esc(f.title)}</h3>
          </div>
          <div class="owner-item-act">
            <button type="button" class="btn ${pub ? '' : 'primary'}" data-pub-key="${esc(f.key)}" data-pub-next="${pub ? '0' : '1'}"${!signedInAsOwner ? ' disabled title="กรุณาล็อกอินด้วยบัญชีเจ้าของก่อน"' : ''}>${pub ? '🔒 ซ่อนกลับ (Unpublish)' : '🚀 Publish ให้เพื่อนใช้เลย'}</button>
          </div>
        </div>
        <div class="owner-meta"><span>📍 ${esc(f.area)}</span><span>🏷️ ${esc(f.added)}</span><code>${esc(f.key)}</code></div>
        <p class="owner-desc">${esc(f.desc)}</p>
      </div>`;
    };
    view.innerHTML = `<div class="hero">
        <h1>👑 เมนูของเจ้าของ <small style="font-size:.5em;opacity:.65">Draft &amp; Publish</small></h1>
        <p>บัญชีเจ้าของ: <b>${OWNER_EMAIL}</b> · ยังไม่ Publish <b>${unpubList.length}</b> รายการ · Publish แล้ว <b>${pubList.length}</b> รายการ</p>
      </div>
      <div class="owner-bar">
        <button type="button" class="btn${_friendPreview ? ' primary' : ''}" id="owPreviewBtn">${_friendPreview ? '👑 กลับสู่มุมมองเจ้าของ' : '👁️ ทดลองดูมุมมองเพื่อน'}</button>
        ${unpubList.length ? `<button type="button" class="btn primary" id="owPubAll"${!signedInAsOwner ? ' disabled' : ''}>🚀 Publish ทั้งหมด (${unpubList.length})</button>` : ''}
        <button type="button" class="btn" id="owCopyList">📋 คัดลอกรายการ Unpublished</button>
      </div>
      ${!signedInAsOwner ? `<div class="owner-notice">⚠️ ตอนนี้ยังไม่ได้ล็อกอิน Google ด้วย <b>${OWNER_EMAIL}</b> — กรุณาไปที่ <a href="#/sync">☁️ Sync</a> เพื่อล็อกอินก่อนกดปุ่ม Publish ให้เพื่อนครับ</div>` : ''}
      ${needRules ? `<div class="owner-rules">
        <h3>⚙️ ตั้งค่าสิทธิ์ Firestore ครั้งแรก (ทำครั้งเดียว 15 วินาที)</h3>
        <p>เพื่อให้ปุ่ม <b>Publish ให้เพื่อนใช้เลย</b> อัปเดตให้เพื่อนทุกคนได้ทันที กรุณานำ Rules ด้านล่างไปวางใน Firebase Console → Firestore Database → Rules แล้วกด <b>Publish</b>:</p>
        <pre><code>${esc(rulesCode)}</code></pre>
        <div class="owner-bar"><button type="button" class="btn primary" id="owCopyRules">📋 คัดลอก Rules</button><a class="btn" href="https://console.firebase.google.com/project/jinjutananny84-6965c/firestore/rules" target="_blank" rel="noopener">🔗 เปิดหน้า Firebase Rules</a></div>
      </div>` : ''}
      <div class="owner-list">
        ${DRAFT_REGISTRY.length ? DRAFT_REGISTRY.map(itemHtml).join('') : '<p class="empty">ตอนนี้ไม่มีฟีเจอร์ค้างอยู่ในรายการ Draft แล้วครับ 🎉</p>'}
      </div>`;
    const pvBtn = $('#owPreviewBtn', view);
    if (pvBtn) pvBtn.onclick = () => { _friendPreview = !_friendPreview; notifyOwnerUI(); vOwner(); };
    const cpRules = $('#owCopyRules', view);
    if (cpRules) cpRules.onclick = () => navigator.clipboard.writeText(rulesCode).then(() => toast('📋 คัดลอก Firestore Rules แล้ว'));
    const cpList = $('#owCopyList', view);
    if (cpList) cpList.onclick = () => {
      const txt = unpubList.length
        ? 'รายการที่ยัง Unpublished:\n' + unpubList.map((f, i) => `${i + 1}. ${f.title} (${f.area} · ${f.added}) [${f.key}]`).join('\n')
        : 'ไม่มีรายการที่ยัง Unpublished';
      navigator.clipboard.writeText(txt).then(() => toast('📋 คัดลอกรายการแล้ว'));
    };
    const handlePublishErr = err => {
      const msg = err && err.code === 'permission-denied'
        ? 'ยังไม่ได้เพิ่มสิทธิ์ appConfig ใน Firestore Rules (ดูวิธีด้านบนแล้วกด Publish ใน Firebase Console)'
        : (err && err.message ? err.message : 'อัปเดตไม่สำเร็จ');
      toast('⚠️ ' + msg);
      vOwner();
    };
    const pubAll = $('#owPubAll', view);
    if (pubAll) pubAll.onclick = async () => {
      pubAll.disabled = true;
      try {
        const patch = {};
        unpubList.forEach(f => { patch[f.key] = true; });
        await window.NLE_SYNC.setPublishedFlags(patch);
        toast(`🚀 Publish ทั้งหมด ${unpubList.length} รายการให้เพื่อนใช้เรียบร้อย!`);
        vOwner();
      } catch (e) { handlePublishErr(e); }
    };
    view.querySelectorAll('[data-pub-key]').forEach(btn => {
      btn.onclick = async () => {
        const key = btn.dataset.pubKey;
        const next = btn.dataset.pubNext === '1';
        btn.disabled = true;
        try {
          await window.NLE_SYNC.setPublishedFlag(key, next);
          toast(next ? '🚀 Publish ให้เพื่อนใช้เรียบร้อยแล้ว!' : '🔒 ซ่อนกลับเป็นเฉพาะของเจ้าของแล้ว');
          vOwner();
        } catch (e) { handlePublishErr(e); }
      };
    });
  }
  notifyOwnerUI();
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
        notifyOwnerUI();
        route();
      },
      hasData,
      idb: IDB,
      toast,
      onImagesPulled: () => {
        // วาดรูปใหม่ถ้าหน้าปัจจุบันมีรูปที่เคยขึ้น missing
        if (view.querySelector('.uimg.missing')) route();
      },
      onFlagsChange: () => {
        notifyOwnerUI();
        if (INDEX && location.hash.replace(/^#\/?/, '').split('?')[0] === 'owner') vOwner();
      },
      onChange: st => {
        syncOwnerPreview(st);
        updateAuthBtn(st);
        const cur = location.hash.replace(/^#\/?/, '').split('?')[0];
        if (INDEX && cur === 'sync') vSync();
        if (INDEX && cur === 'owner') vOwner();
      }
    });
  }
  /* 🍅 Monument Valley Rotating Castle Pomodoro Widget (persistent across routes) */
  function initPomodoro() {
    const PATH = [
      { x: 95, y: 156, msg: 'ออกเดินทางจากฐานปราสาท' },
      { x: 112, y: 164, msg: 'เหยียบแท่นไฟสีฟ้า…' },
      { x: 132, y: 173, msg: 'เข้าใกล้จุดเชื่อมสะพาน' },
      { x: 156, y: 165, msg: 'ข้ามทางเดินสีปะการัง…' },
      { x: 186, y: 152, msg: 'ขึ้นสู่สะพานกลไก' },
      { x: 152, y: 118, msg: 'เดินข้ามสะพานกลางปราสาท!' },
      { x: 108, y: 84, msg: 'ไต่ขึ้นชั้นบนหอคอย' },
      { x: 144, y: 60, msg: 'ใกล้ถึงยอดคริสตัลแล้ว!' },
      { x: 176, y: 72, msg: '✨ ครบเวลาแล้ว!' }
    ];
    let total = 25 * 60, left = 25 * 60, tmr = null, open = false, spin = 0;
    const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    const chime = () => {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        [523.25, 659.25, 783.99].forEach((f, idx) => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sine'; o.frequency.value = f;
          g.gain.setValueAtTime(0.08, ctx.currentTime + idx * 0.14);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.14 + 0.55);
          o.connect(g); g.connect(ctx.destination);
          o.start(ctx.currentTime + idx * 0.14); o.stop(ctx.currentTime + idx * 0.14 + 0.6);
        });
      } catch (e) {}
    };
    const castleSvg = (p, vb = '0 0 280 250') => `<svg viewBox="${vb}" aria-hidden="true">
            <defs>
              <radialGradient id="${p}AG" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#4cf2f2" stop-opacity=".55"/><stop offset="100%" stop-color="#4cf2f2" stop-opacity="0"/></radialGradient>
              <linearGradient id="${p}ST" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#a8d5cb"/><stop offset="100%" stop-color="#74aba2"/></linearGradient>
              <linearGradient id="${p}SL" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#5d948d"/><stop offset="100%" stop-color="#3a6868"/></linearGradient>
              <linearGradient id="${p}SR" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2c555c"/><stop offset="100%" stop-color="#193740"/></linearGradient>
            </defs>
            <g><circle class="pm-star" cx="28" cy="24" r="1.4" fill="#fff"/><circle class="pm-star" cx="62" cy="14" r="1.1" fill="#ff9e9e" style="animation-delay:.8s"/><circle class="pm-star" cx="242" cy="28" r="1.5" fill="#7ce0d3" style="animation-delay:.4s"/><circle class="pm-star" cx="256" cy="64" r="1.2" fill="#fff" style="animation-delay:1.5s"/><path class="pm-star" d="M214 14v8M210 18h8" stroke="#fff" stroke-width="1"/></g>
            <g>
              <polygon points="140,188 228,224 140,248 52,224" fill="#1e313b"/><polygon points="52,224 140,248 140,256 52,232" fill="#122029"/><polygon points="140,248 228,224 228,232 140,256" fill="#0b151c"/>
              <polygon points="140,174 210,204 140,228 70,204" fill="#2b454f"/><polygon points="70,204 140,228 140,238 70,214" fill="#1a2e36"/><polygon points="140,228 210,204 210,214 140,238" fill="#112026"/>
              <polygon points="140,162 192,184 140,206 88,184" fill="#416970"/><polygon points="88,184 140,206 140,216 88,194" fill="#27464d"/><polygon points="140,206 192,184 192,194 140,216" fill="#183038"/>
              <circle cx="106" cy="200" r="2.4" fill="#0d1d24" stroke="#6aa09a" stroke-width=".7"/><circle cx="116" cy="204" r="2.4" fill="#0d1d24" stroke="#6aa09a" stroke-width=".7"/><circle cx="126" cy="208" r="2.4" fill="#0d1d24" stroke="#6aa09a" stroke-width=".7"/>
            </g>
            <g>
              <polygon points="131,58 140,62 140,174 131,170" fill="url(#${p}SL)"/><polygon points="140,62 149,58 149,170 140,174" fill="url(#${p}SR)"/>
              <polygon points="62,92 73,97 73,168 62,163" fill="url(#${p}SL)"/><polygon points="73,97 82,93 82,164 73,168" fill="url(#${p}SR)"/>
              <polygon points="198,92 209,97 209,168 198,163" fill="url(#${p}SL)"/><polygon points="209,97 218,93 218,164 209,168" fill="url(#${p}SR)"/>
            </g>
            <g>
              <polygon points="73,154 140,186 140,198 73,166" fill="url(#${p}SL)"/><polygon points="73,154 84,149 150,180 140,186" fill="url(#${p}ST)"/>
              <polygon points="140,186 208,154 208,166 140,198" fill="url(#${p}SR)"/><polygon points="140,186 130,180 197,149 208,154" fill="url(#${p}ST)"/>
              <polygon id="${p}T0" points="92,155 103,160 96,164 85,159" fill="#4cf2f2" opacity=".3"/>
              <polygon id="${p}T1" points="107,162 118,167 111,171 100,166" fill="#4cf2f2" opacity=".3"/>
              <polygon id="${p}T2" points="122,169 133,174 126,178 115,173" fill="#4cf2f2" opacity=".3"/>
              <polygon id="${p}T3" points="154,169 165,164 172,168 161,173" fill="#ff7c6e" opacity=".3"/>
              <polygon id="${p}T4" points="169,162 180,157 187,161 176,166" fill="#ff7c6e" opacity=".3"/>
              <polygon id="${p}T5" points="184,155 195,150 202,154 191,159" fill="#ff7c6e" opacity=".3"/>
            </g>
            <g id="${p}Bridge" class="pomo-bridge">
              <polygon points="78,142 198,86 208,91 88,147" fill="url(#${p}ST)"/><polygon points="78,142 88,147 88,158 78,153" fill="url(#${p}SL)"/><polygon points="88,147 208,91 208,102 88,158" fill="url(#${p}SR)"/>
              <polygon points="140,113 149,117 140,121 131,117" fill="#4cf2f2" opacity=".9"/>
            </g>
            <g>
              <polygon points="62,92 140,56 151,61 73,97" fill="url(#${p}ST)"/><polygon points="62,92 73,97 73,108 62,103" fill="url(#${p}SL)"/>
              <polygon points="140,56 218,92 207,97 129,61" fill="url(#${p}ST)"/><polygon points="129,61 207,97 207,108 129,72" fill="url(#${p}SR)"/>
            </g>
            <g>
              <circle cx="184" cy="72" r="26" fill="url(#${p}AG)"/>
              <circle class="pm-ring" cx="184" cy="72" r="14" fill="none" stroke="#7ce0d3" stroke-width="1"/>
              <circle class="pm-ring" cx="184" cy="72" r="21" fill="none" stroke="#7ce0d3" stroke-width=".7" style="animation-delay:1.2s"/>
              <polygon points="184,65 193,70 184,75 175,70" fill="#133a42" stroke="#7ce0d3" stroke-width="1"/>
              <g id="${p}Cry"><polygon points="184,54 190,61 184,66 178,61" fill="#ff7c6e" stroke="#fff" stroke-width=".7"/></g>
            </g>
            <g transform="translate(86,152)"><ellipse cx="0" cy="4" rx="3.4" ry="4.8" fill="#111827"/><circle cx="0" cy="-2" r="2.6" fill="#111827"/><polygon points="2,-3 7,-1 2,0" fill="#111827"/><circle cx=".6" cy="-2.2" r=".9" fill="#fff"/></g>
            <g id="${p}Ida" transform="translate(95,156)"><g class="pm-bob"><ellipse cx="0" cy="3" rx="4.2" ry="1.8" fill="rgba(0,0,0,.32)"/><line x1="-1.5" y1="0" x2="-1.5" y2="3" stroke="#1e293b" stroke-width="1.2"/><line x1="1.5" y1="0" x2="1.5" y2="3" stroke="#1e293b" stroke-width="1.2"/><polygon points="0,-10 -5,0 5,0" fill="#fff"/><circle cx="0" cy="-12" r="2.7" fill="#1e293b"/><polygon points="0,-24 -3.8,-12 3.8,-12" fill="#fff"/></g></g>
          </svg>`;
    const wrap = document.createElement('div');
    wrap.className = 'pomo-wrap';
    wrap.innerHTML = `<button type="button" class="pomo-mini" id="pmMini" title="ขยายปราสาทจับเวลา Monument Valley"></button>
      <div class="pomo-card" id="pmCard" hidden>
        <div class="pomo-hd"><span id="pmTitle">🍅 โฟกัส · 25 นาที</span><div class="pm-acts"><button type="button" id="pmSpin" title="หมุนกลไกปราสาท">↻ หมุน</button><button type="button" id="pmHide" title="ย่อเก็บ">– ย่อ</button></div></div>
        <div class="pomo-stage" id="pmStage" title="คลิกเพื่อหมุนกลไกปราสาท">
          ${castleSvg('pm')}
        </div>
        <div class="pomo-ctl">
          <div class="pomo-toprow"><div class="pomo-time" id="pmTime">25:00</div><div class="pomo-stat" id="pmStat">พร้อมออกเดินทาง</div></div>
          <div class="pomo-presets"><button type="button" data-pm="25" class="on">25/5</button><button type="button" data-pm="50">50/10</button><button type="button" data-pm="5">พัก 5 น.</button></div>
          <div class="pomo-custom" id="pmCustomRow" hidden><input type="number" id="pmCustomIn" min="1" max="240" value="30" inputmode="numeric" aria-label="กำหนดเวลาอ่าน (นาที)"><span>นาที</span><button type="button" id="pmCustomSet">ตั้งเวลา</button></div>
          <div class="pomo-btns"><button type="button" class="pm-go" id="pmGo">▶ เริ่มจับเวลา</button><button type="button" id="pmReset" title="รีเซ็ต">↺</button></div>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    let isBreak = false, saveTick = 0;
    const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const getTodaySec = () => ((S.pomoLog && S.pomoLog[localDay()]) || 0);
    const fmtHM = sec => {
      const m = Math.floor(sec / 60), h = Math.floor(m / 60), rm = m % 60;
      return h ? `${h} ชม. ${rm} น.` : `${rm} น.`;
    };

    /* 🪸 Underwater Monument Valley Castle Infographic (แนวตั้งเต็มกรอบ ไม่มีขอบ + ปราสาท 5 ชั้นซับซ้อน + ไอคอนรางวัลถัดไป) */
    const REEF_SPECIES = [
      { name: 'Staghorn Coral (ปะการังเขากวาง)', short: 'Staghorn', min: 30, ic: '<path d="M16 26V10m0 7-6-7m6 4 6-8m-6 11-5-2" fill="none" stroke="#facc15" stroke-width="2.8" stroke-linecap="round"/>' },
      { name: 'Clownfish (ปลาการ์ตูน)', short: 'Clownfish', min: 60, ic: '<ellipse cx="14" cy="16" rx="8" ry="5" fill="#fb923c"/><polygon points="21,16 27,11 27,21" fill="#fb923c"/><rect x="11" y="11" width="2.4" height="10" fill="#fff"/><rect x="16" y="12" width="2" height="8" fill="#fff"/><circle cx="9.5" cy="15" r="1.2" fill="#0f172a"/>' },
      { name: 'Carnation Coral (ปะการังอ่อนส้ม)', short: 'Carnation', min: 90, ic: '<path d="M16 26V12m0 6-6-6m6 8 6-7" fill="none" stroke="#ff7c6e" stroke-width="2.8" stroke-linecap="round"/><circle cx="10" cy="11" r="2.6" fill="#fda4af"/><circle cx="22" cy="12" r="2.6" fill="#fda4af"/><circle cx="16" cy="10" r="2.8" fill="#fecdd3"/>' },
      { name: 'Blue Tang (ปลาขี้ตังเบ็ดฟ้า)', short: 'Blue Tang', min: 120, ic: '<ellipse cx="17" cy="16" rx="8.5" ry="5.5" fill="#38bdf8"/><polygon points="9,16 4,11 4,21" fill="#facc15"/><path d="M13 14q5-3 9 2" fill="none" stroke="#0f172a" stroke-width="1.8"/><circle cx="21" cy="15" r="1.2" fill="#0f172a"/>' },
      { name: 'Cauliflower Coral (ปะการังดอกกะหล่ำ)', short: 'Cauliflower', min: 150, ic: '<g fill="#f472b6"><circle cx="11" cy="19" r="5.5"/><circle cx="17" cy="15" r="6"/><circle cx="22" cy="20" r="5"/><circle cx="16" cy="22" r="4.8" fill="#db2777"/></g>' },
      { name: 'Sun Coral (ปะการังถ้วยส้มเรืองแสง)', short: 'Sun Coral', min: 180, ic: '<circle cx="12" cy="17" r="5" fill="#f59e0b"/><circle cx="20" cy="15" r="5.5" fill="#fde047"/><circle cx="16" cy="21" r="4.5" fill="#fb923c"/><circle cx="12" cy="17" r="2" fill="#fef08a"/><circle cx="20" cy="15" r="2.2" fill="#fff"/>' },
      { name: 'Moon Jellyfish (แมงกะพรุนเรืองแสง)', short: 'Jellyfish', min: 210, ic: '<path d="M8 15a8 7.5 0 0 1 16 0Z" fill="#67e8f9" fill-opacity=".8" stroke="#cffafe" stroke-width="1.2"/><path d="M11 16q-2 6 0 10M16 16q2 7-1 11M21 16q2 6 0 10" fill="none" stroke="#a5f3fc" stroke-width="1.3"/>' },
      { name: 'Sea Fan (กัลปังหาพัดแดง)', short: 'Sea Fan', min: 240, ic: '<path d="M16 27V9m0 11-8-9m8 5 8-9m-8 2-4-8m4 8 4-8" fill="none" stroke="#fb7185" stroke-width="2.1" stroke-linecap="round"/>' },
      { name: 'Brain Coral (ปะการังสมองมรกต)', short: 'Brain Coral', min: 270, ic: '<ellipse cx="16" cy="18" rx="10" ry="7.5" fill="#34d399"/><path d="M9 17q4-4 7 0t7 0M10 21q3-3 6 0t6-1" fill="none" stroke="#065f46" stroke-width="1.5" stroke-linecap="round"/>' },
      { name: 'Butterflyfish (ปลาผีเสื้อเหลือง)', short: 'Butterfly', min: 300, ic: '<polygon points="8,16 16,9 24,16 16,23" fill="#fde047"/><polygon points="23,16 28,12 28,20" fill="#fef08a"/><line x1="14" y1="11" x2="14" y2="21" stroke="#0f172a" stroke-width="1.8"/><circle cx="11.5" cy="15" r="1.1" fill="#0f172a"/>' },
      { name: 'Sea Anemone (ดอกไม้ทะเลมิ้นต์)', short: 'Anemone', min: 330, ic: '<ellipse cx="16" cy="23" rx="7.5" ry="3.5" fill="#0d9488"/><path d="M11 21q-3-8 1-11M15 21q-1-9 1-12M18 21q2-9 4-11M21 21q3-6 2-10" fill="none" stroke="#5eead4" stroke-width="2" stroke-linecap="round"/>' },
      { name: 'Sea Turtle (เต่าทะเลน้อย)', short: 'Sea Turtle', min: 360, ic: '<ellipse cx="14" cy="16" rx="8" ry="5.5" fill="#10b981" stroke="#6ee7b7" stroke-width="1.1"/><circle cx="24" cy="15" r="2.8" fill="#34d399"/><path d="M17 11l4-5M17 21l3 5M8 13l-4-3M8 19l-4 3" stroke="#34d399" stroke-width="2.3" stroke-linecap="round"/>' },
      { name: 'Organ Pipe Coral (ปะการังออร์แกน)', short: 'Organ Pipe', min: 390, ic: '<g stroke="#a78bfa" stroke-width="2.6" stroke-linecap="round"><line x1="11" y1="24" x2="11" y2="12"/><line x1="16" y1="24" x2="16" y2="9"/><line x1="21" y1="24" x2="21" y2="13"/></g><circle cx="11" cy="11" r="2.2" fill="#e9d5ff"/><circle cx="16" cy="8" r="2.4" fill="#e9d5ff"/><circle cx="21" cy="12" r="2.2" fill="#e9d5ff"/>' },
      { name: 'Manta Ray (ปลากระเบนราหู)', short: 'Manta Ray', min: 420, ic: '<path d="M4 16q12-10 24 0-8 2-12 6-4-4-12-6Z" fill="#60a5fa"/><line x1="16" y1="21" x2="16" y2="29" stroke="#93c5fd" stroke-width="1.4"/>' },
      { name: 'Elkhorn Coral (ปะการังเขากวางใหญ่)', short: 'Elkhorn', min: 450, ic: '<path d="M16 26V11m0 7-8-9m8 6 8-9m-8 2-3-6m11 3 2-5" fill="none" stroke="#fbbf24" stroke-width="3.2" stroke-linecap="round"/>' },
      { name: 'Crystal Lotus & Whale (บัวคริสตัล + วาฬ)', short: 'Golden Whale', min: 480, ic: '<path d="M5 17q9-8 18-2 3 1 5-3l-1 6q-3 2-6 1-9 3-16-2Z" fill="#fef08a"/><circle cx="10" cy="16" r="1.2" fill="#0f172a"/><polygon points="16,4 19,8 16,11 13,8" fill="#ff7c6e" stroke="#fff" stroke-width=".8"/>' }
    ];
    let lastUnlocked = Math.min(REEF_SPECIES.length, Math.floor(getTodaySec() / 1800));
    let reefPreviewMin = null, reefExpOpen = false, reefAutoHideOnHome = true, reefNight = false, reefPearls = 0, feedGlowTmr = null;
    const playWaterChime = (notes = [587.33, 783.99, 1046.5]) => {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        notes.forEach((f, idx) => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sine'; o.frequency.value = f;
          g.gain.setValueAtTime(0.045, ctx.currentTime + idx * 0.09);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.09 + 0.45);
          o.connect(g); g.connect(ctx.destination);
          o.start(ctx.currentTime + idx * 0.09); o.stop(ctx.currentTime + idx * 0.09 + 0.48);
        });
      } catch (_) {}
    };
    // ปราสาทใต้น้ำ Monument Valley 5 ชั้นต้นฉบับ (ใช้ร่วมกันทั้งโหมดย่อและโหมดขยายด้านข้าง)
    const rfCastleCore = (p) => `
      <ellipse cx="90" cy="558" rx="68" ry="13" fill="#04101e" opacity=".52"/>
      <polygon points="90,504 152,534 90,564 28,534" fill="#27557d"/>
      <polygon points="28,534 90,564 90,576 28,546" fill="#1a3d5c"/>
      <polygon points="90,564 152,534 152,546 90,576" fill="#122c45"/>
      <polygon points="90,486 138,510 90,534 42,510" fill="#37719e"/>
      <polygon points="42,510 90,534 90,545 42,521" fill="#234f75"/>
      <polygon points="90,534 138,510 138,521 90,545" fill="#173857"/>
      <polygon points="46,432 90,454 90,510 46,488" fill="url(#${p}Wall)"/>
      <polygon points="90,454 134,432 134,488 90,510" fill="url(#${p}Side)"/>
      <path d="M58 494 v-24 a9 9 0 0 1 18 0 v24 Z" fill="#0c2338"/>
      <path d="M104 494 v-24 a9 9 0 0 1 18 0 v24 Z" fill="#163552"/>
      <circle cx="67" cy="462" r="2.2" fill="#5eead4" opacity=".8"/><circle cx="113" cy="462" r="2.2" fill="#5eead4" opacity=".8"/>
      <polygon points="90,394 150,424 90,454 30,424" fill="url(#${p}Sand)"/>
      <polygon points="30,424 90,454 90,466 30,436" fill="url(#${p}Wall)"/>
      <polygon points="90,454 150,424 150,436 90,466" fill="url(#${p}Side)"/>
      <polygon points="24,376 46,388 46,420 24,408" fill="url(#${p}Wall)"/>
      <polygon points="24,376 36,370 58,382 46,388" fill="url(#${p}Sand)"/>
      <path d="M26 384 l18 9 M26 392 l18 9 M26 400 l18 9" stroke="#183b59" stroke-width="1.3"/>
      <polygon points="156,376 134,388 134,420 156,408" fill="url(#${p}Side)"/>
      <polygon points="156,376 144,370 122,382 134,388" fill="url(#${p}Sand)"/>
      <path d="M154 384 l-18 9 M154 392 l-18 9 M154 400 l-18 9" stroke="#9e6d44" stroke-width="1.3"/>
      <polygon points="46,246 62,254 62,406 46,398" fill="url(#${p}Wall)"/>
      <polygon points="62,254 73,249 73,401 62,406" fill="#1e4b70"/>
      <polygon points="107,249 118,254 118,406 107,401" fill="url(#${p}Wall)"/>
      <polygon points="118,254 134,246 134,398 118,406" fill="url(#${p}Side)"/>
      <path d="M51 324 v-14 a3.5 3.5 0 0 1 7 0 v14 Z" fill="#0d2740"/>
      <path d="M122 324 v-14 a3.5 3.5 0 0 1 7 0 v14 Z" fill="#8f5f38"/>
      <polygon points="60,312 122,282 130,287 68,317" fill="url(#${p}Teal)"/>
      <polygon points="60,312 68,317 68,325 60,320" fill="#23666b"/>
      <polygon points="68,317 130,287 130,295 68,325" fill="#194a54"/>
      <polygon points="90,296 97,300 90,304 83,300" fill="#e6faf7" opacity=".9"/>
      <circle cx="90" cy="378" r="24" fill="url(#${p}Glow)"/>
      <path d="M90 412 Q90 392 80 380 M90 398 Q100 386 106 378 M90 388 Q86 374 92 364 M84 385 Q77 378 74 374" fill="none" stroke="#c084fc" stroke-width="2.2" stroke-linecap="round"/>
      <polygon points="90,210 142,236 90,262 38,236" fill="url(#${p}Sand)"/>
      <polygon points="38,236 90,262 90,274 38,248" fill="url(#${p}Wall)"/>
      <polygon points="90,262 142,236 142,248 90,274" fill="url(#${p}Side)"/>
      <polygon points="90,222 118,236 90,250 62,236" fill="#4cc9c8" opacity=".88"/>
      <polygon points="64,142 90,155 90,222 64,209" fill="url(#${p}Wall)"/>
      <polygon points="90,155 116,142 116,209 90,222" fill="url(#${p}Side)"/>
      <path d="M72 202 v-20 a6 6 0 0 1 12 0 v20 Z" fill="#0c2338"/>
      <path d="M96 202 v-20 a6 6 0 0 1 12 0 v20 Z" fill="#7c5230"/>
      <polygon points="90,118 124,135 90,152 56,135" fill="url(#${p}Sand)"/>
      <polygon points="56,135 90,152 90,161 56,144" fill="url(#${p}Wall)"/>
      <polygon points="90,152 124,135 124,144 90,161" fill="url(#${p}Side)"/>
      <polygon points="90,125 108,134 90,143 72,134" fill="#5eead4" opacity=".82"/>
      <line x1="78" y1="124" x2="78" y2="96" stroke="#fde4be" stroke-width="2.2"/>
      <line x1="102" y1="124" x2="102" y2="96" stroke="#e3b685" stroke-width="2.2"/>
      <line x1="90" y1="128" x2="90" y2="98" stroke="#5da3cc" stroke-width="1.6"/>
      <path d="M72 96 Q90 62 108 96 Z" fill="#e85a6b"/>
      <path d="M90 72 Q99 83 108 96 L90 99 Z" fill="#b8344c"/>
      <circle cx="90" cy="64" r="3" fill="#ffd97d"/>
      <line x1="90" y1="61" x2="90" y2="48" stroke="#ffd97d" stroke-width="1.8"/>
      <circle cx="90" cy="46" r="2.2" fill="#5eead4"/>
      <g transform="translate(18,530)">
        <polygon points="0,8 28,19 35,13 7,2" fill="#e6b884"/>
        <polygon points="0,8 28,19 28,25 0,14" fill="#b88454"/>
        <path d="M13 6 Q21 -16 30 2 Z" fill="#facc15" opacity=".95"/>
        <circle cx="20" cy="-1" r="2.8" fill="#9f1239"/>
      </g>`;

    const reefHost = document.createElement('aside');
    reefHost.className = 'reef-host';
    reefHost.setAttribute('aria-label', 'Infographic ปราสาทใต้น้ำบันทึกเวลาอ่านรายวัน');
    reefHost.innerHTML = `<button type="button" class="reef-tab" id="reefTab" title="เปิดกรอบปราสาทใต้น้ำ" hidden><span class="reef-tab-arr">‹</span><span class="reef-tab-ic">🪸</span><span class="reef-tab-m" id="reefTabM">0 น.</span></button>
      <div class="reef-dock" id="reefDock">
        <div class="reef-hd">
          <div class="reef-hd-l">
            <span class="reef-hd-t" id="reefToday">0 น.</span>
            <span class="reef-hd-c" id="reefCount">0/16</span>
            <span class="reef-hd-pearl" id="reefExpPearl" hidden>🫧 0</span>
          </div>
          <div class="reef-hd-r">
            <button type="button" class="reef-exp-glow" id="reefExpGlow" title="สลับโหมดเรืองแสงกลางคืน" hidden>✨</button>
            <button type="button" class="reef-exp-btn" id="reefExpBtn" title="ขยายปราสาทใต้น้ำด้านข้าง" hidden>⤢</button>
            <button type="button" class="reef-pv-btn" id="reefPvToggle" title="ดู Preview เต็ม 8 ชม. (16 ชนิด)">👁️</button>
            <button type="button" class="reef-hide" id="reefHide" title="หุบเก็บกรอบปราสาทใต้น้ำ">›</button>
          </div>
        </div>
        <div class="reef-scene" id="reefScene">
          <svg id="reefMiniSvg" viewBox="0 0 180 620" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <defs>
              <linearGradient id="rfBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2e99b5"/><stop offset="16%" stop-color="#1e6f8f"/><stop offset="46%" stop-color="#134569"/><stop offset="78%" stop-color="#0b2642"/><stop offset="100%" stop-color="#061426"/></linearGradient>
              <linearGradient id="rfRay" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#a5f3fc" stop-opacity=".32"/><stop offset="100%" stop-color="#a5f3fc" stop-opacity="0"/></linearGradient>
              <linearGradient id="rfSand" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fde4be"/><stop offset="100%" stop-color="#e3b685"/></linearGradient>
              <linearGradient id="rfWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#5da3cc"/><stop offset="100%" stop-color="#2c5d87"/></linearGradient>
              <linearGradient id="rfSide" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ecc294"/><stop offset="100%" stop-color="#c69062"/></linearGradient>
              <linearGradient id="rfTeal" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7ce0d3"/><stop offset="100%" stop-color="#38989c"/></linearGradient>
              <radialGradient id="rfGlow" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#7ce0d3" stop-opacity=".72"/><stop offset="100%" stop-color="#7ce0d3" stop-opacity="0"/></radialGradient>
            </defs>
            <rect width="180" height="620" fill="url(#rfBg)"/>
            <polygon points="8,0 52,0 98,320 34,320" fill="url(#rfRay)"/>
            <polygon points="78,0 132,0 166,340 108,340" fill="url(#rfRay)"/>
            <path d="M0 18 Q45 9 90 18 T180 18" fill="none" stroke="#a5f3fc" stroke-opacity=".34" stroke-width="1.6"/>
            <path d="M0 32 Q45 25 90 32 T180 32" fill="none" stroke="#99f6e4" stroke-opacity=".2" stroke-width="1"/>
            <g class="rf-bubbles" fill="none" stroke="#a5f3fc" stroke-opacity=".48" stroke-width="1">
              <circle class="rf-bub" cx="22" cy="510" r="2.2"/><circle class="rf-bub" cx="156" cy="460" r="2.8" style="animation-delay:1.3s"/>
              <circle class="rf-bub" cx="38" cy="340" r="2" style="animation-delay:2.4s"/><circle class="rf-bub" cx="146" cy="240" r="2.2" style="animation-delay:.7s"/>
              <circle class="rf-bub" cx="90" cy="180" r="1.6" style="animation-delay:3.1s"/><circle class="rf-bub" cx="30" cy="140" r="1.8" style="animation-delay:1.9s"/>
            </g>
            <path d="M0 546 Q46 530 92 542 T180 538 L180 620 L0 620 Z" fill="#133454"/>
            <path d="M0 568 Q60 554 118 566 T180 560 L180 620 L0 620 Z" fill="#0d243c"/>
            <path d="M0 592 Q50 582 104 592 T180 588 L180 620 L0 620 Z" fill="#08182b"/>
            <g class="rf-castle">${rfCastleCore('rf')}</g>
            <g id="rfSp0" class="rf-sp rf-sway"><title>0:30 · Staghorn Coral (ปะการังเขากวาง)</title><path d="M36 574 v-20 m0 9 l-9-10 m9 6 l8-11 m-8 15 l-6-3" fill="none" stroke="#facc15" stroke-width="3.4" stroke-linecap="round"/></g>
            <g id="rfSp1" class="rf-sp rf-swim"><title>1:00 · Clownfish (ปลาการ์ตูน)</title><g transform="translate(136,482)"><ellipse cx="0" cy="0" rx="8.5" ry="4.8" fill="#fb923c"/><polygon points="7.5,0 14,-4.5 14,4.5" fill="#fb923c"/><rect x="-3" y="-4.2" width="2.2" height="8.4" fill="#fff"/><rect x="2" y="-3.6" width="2" height="7.2" fill="#fff"/><circle cx="-5" cy="-1" r="1.1" fill="#0f172a"/></g></g>
            <g id="rfSp2" class="rf-sp rf-sway"><title>1:30 · Carnation Coral (ปะการังอ่อนส้ม)</title><path d="M148 566 v-18 m0 8 l-7-9 m7 12 l8-10" fill="none" stroke="#ff7c6e" stroke-width="3.5" stroke-linecap="round"/><circle cx="139" cy="547" r="2.6" fill="#fda4af"/><circle cx="156" cy="549" r="2.6" fill="#fda4af"/><circle cx="148" cy="546" r="2.8" fill="#fecdd3"/></g>
            <g id="rfSp3" class="rf-sp rf-swim2"><title>2:00 · Blue Tang (ปลาขี้ตังเบ็ดฟ้า)</title><g transform="translate(32,332)"><ellipse cx="0" cy="0" rx="9" ry="5.2" fill="#38bdf8"/><polygon points="-8,0 -14,-4.5 -14,4.5" fill="#facc15"/><path d="M-4 -2 Q2 -5 6 0" fill="none" stroke="#0f172a" stroke-width="1.6"/><circle cx="5" cy="-1" r="1.1" fill="#0f172a"/></g></g>
            <g id="rfSp4" class="rf-sp rf-sway"><title>2:30 · Cauliflower Coral (ปะการังดอกกะหล่ำ)</title><g fill="#f472b6"><circle cx="64" cy="576" r="6.5"/><circle cx="73" cy="571" r="7"/><circle cx="81" cy="577" r="6"/><circle cx="71" cy="580" r="5.5" fill="#db2777"/></g></g>
            <g id="rfSp5" class="rf-sp rf-sway"><title>3:00 · Sun Coral (ปะการังถ้วยส้มเรืองแสง)</title><g transform="translate(120,568)"><circle cx="-5" cy="2" r="5.2" fill="#f59e0b"/><circle cx="5" cy="0" r="5.8" fill="#fde047"/><circle cx="0" cy="5.5" r="4.8" fill="#fb923c"/><circle cx="-5" cy="2" r="2.2" fill="#fef08a"/><circle cx="5" cy="0" r="2.4" fill="#fff"/></g></g>
            <g id="rfSp6" class="rf-sp rf-float"><title>3:30 · Moon Jellyfish (แมงกะพรุนเรืองแสง)</title><g transform="translate(148,186)"><path d="M-9.5 0 a9.5 8.5 0 0 1 19 0 Z" fill="#67e8f9" fill-opacity=".72" stroke="#cffafe" stroke-width="1.1"/><path d="M-5 1 Q-7 9 -4 15 M0 1 Q2 10 -1 17 M5 1 Q7 9 4 15" fill="none" stroke="#a5f3fc" stroke-width="1.1"/></g></g>
            <g id="rfSp7" class="rf-sp rf-sway"><title>4:00 · Sea Fan (กัลปังหาพัดแดง)</title><path d="M22 462 v-24 m0 15 l-9-11 m9 7 l9-11 m-9 3 l-5-12 m5 12 l5-12" fill="none" stroke="#fb7185" stroke-width="2.1" stroke-linecap="round"/></g>
            <g id="rfSp8" class="rf-sp"><title>4:30 · Brain Coral (ปะการังสมองมรกต)</title><g transform="translate(96,578)"><ellipse cx="0" cy="0" rx="11.5" ry="7.8" fill="#34d399"/><path d="M-7 -1 Q-3 -5 0 -1 T7 -1 M-6 3 Q-2 0 2 3 T6 2" fill="none" stroke="#065f46" stroke-width="1.4" stroke-linecap="round"/></g></g>
            <g id="rfSp9" class="rf-sp rf-swim"><title>5:00 · Butterflyfish (ปลาผีเสื้อเหลือง)</title><g transform="translate(146,356)"><polygon points="-8.5,0 0,-7.5 8.5,0 0,7.5" fill="#fde047"/><polygon points="7.5,0 13.5,-4.5 13.5,4.5" fill="#fef08a"/><line x1="-2" y1="-5.5" x2="-2" y2="5.5" stroke="#0f172a" stroke-width="1.7"/><circle cx="-4.8" cy="-1" r="1.1" fill="#0f172a"/></g></g>
            <g id="rfSp10" class="rf-sp rf-sway"><title>5:30 · Sea Anemone (ดอกไม้ทะเลมิ้นต์)</title><g transform="translate(158,504)"><ellipse cx="0" cy="8" rx="8.5" ry="3.6" fill="#0d9488"/><path d="M-6 6 Q-9 -3 -4 -8 M-2 6 Q-3 -5 0 -10 M2 6 Q4 -5 6 -9 M6 6 Q10 -2 8 -7" fill="none" stroke="#5eead4" stroke-width="2.1" stroke-linecap="round"/></g></g>
            <g id="rfSp11" class="rf-sp rf-swim2"><title>6:00 · Sea Turtle (เต่าทะเลน้อย)</title><g transform="translate(36,158)"><ellipse cx="0" cy="0" rx="10.5" ry="6.8" fill="#10b981" stroke="#6ee7b7" stroke-width="1.1"/><circle cx="11.5" cy="-1" r="3.2" fill="#34d399"/><path d="M3 -5 L8 -11 M3 5 L7 11 M-7 -3 L-11 -6 M-7 3 L-11 6" stroke="#34d399" stroke-width="2.5" stroke-linecap="round"/></g></g>
            <g id="rfSp12" class="rf-sp rf-sway"><title>6:30 · Organ Pipe Coral (ปะการังออร์แกน)</title><g transform="translate(18,568)" stroke="#a78bfa" stroke-width="2.8" stroke-linecap="round"><line x1="-5" y1="8" x2="-5" y2="-5"/><line x1="0" y1="8" x2="0" y2="-9"/><line x1="5" y1="8" x2="5" y2="-4"/><circle cx="-5" cy="-6" r="2.2" fill="#e9d5ff" stroke="none"/><circle cx="0" cy="-10" r="2.4" fill="#e9d5ff" stroke="none"/><circle cx="5" cy="-5" r="2.2" fill="#e9d5ff" stroke="none"/></g></g>
            <g id="rfSp13" class="rf-sp rf-float"><title>7:00 · Manta Ray (ปลากระเบนราหู)</title><g transform="translate(90,268)"><path d="M-20 2 Q0 -13 20 2 Q7 4 0 10 Q-7 4 -20 2 Z" fill="#60a5fa" fill-opacity=".88"/><line x1="0" y1="9" x2="0" y2="22" stroke="#93c5fd" stroke-width="1.3"/></g></g>
            <g id="rfSp14" class="rf-sp rf-sway"><title>7:30 · Elkhorn Coral (ปะการังเขากวางใหญ่)</title><path d="M162 574 v-20 m0 9 l-10-13 m10 8 l9-11 m-10 4 l-4-8 m14 5 l3-7" fill="none" stroke="#fbbf24" stroke-width="3.6" stroke-linecap="round"/></g>
            <g id="rfSp15" class="rf-sp rf-float"><title>8:00 · Crystal Lotus &amp; Golden Whale</title><g transform="translate(90,134)"><polygon points="0,-11 5.5,-3 0,2.5 -5.5,-3" fill="#ff7c6e" stroke="#fff" stroke-width=".8"/><circle cx="0" cy="-4" r="14" fill="url(#rfGlow)"/></g><g transform="translate(132,68)"><path d="M-17 0 Q-4 -10 15 -2 Q19 0 23 -5 L22 3 Q17 5 13 4 Q-4 9 -17 0 Z" fill="#fef08a" fill-opacity=".92"/><circle cx="-10" cy="-1" r="1.2" fill="#0f172a"/></g></g>
          </svg>

          <!-- 🏛️ โหมดขยายด้านข้าง (ความสูงเท่าเดิม 620, กว้าง 540): ปราสาท 5 ชั้นเดิมตรงกลาง + ปีกปราสาทซ้ายขวาอลังการ + วาฬ & นางเงือก + ปะการังเป็นกลุ่ม -->
          <svg id="reefExpSvg" viewBox="0 0 540 620" preserveAspectRatio="xMidYMid meet" hidden>
            <defs>
              <linearGradient id="reBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2e99b5"/><stop offset="16%" stop-color="#1e6f8f"/><stop offset="46%" stop-color="#134569"/><stop offset="78%" stop-color="#0b2642"/><stop offset="100%" stop-color="#061426"/></linearGradient>
              <linearGradient id="reRay" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#a5f3fc" stop-opacity=".28"/><stop offset="100%" stop-color="#a5f3fc" stop-opacity="0"/></linearGradient>
              <linearGradient id="reSand" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fde4be"/><stop offset="100%" stop-color="#e3b685"/></linearGradient>
              <linearGradient id="reWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#5da3cc"/><stop offset="100%" stop-color="#2c5d87"/></linearGradient>
              <linearGradient id="reSide" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ecc294"/><stop offset="100%" stop-color="#c69062"/></linearGradient>
              <linearGradient id="reRose" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f9a8d4"/><stop offset="100%" stop-color="#be4b82"/></linearGradient>
              <linearGradient id="reTeal" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7ce0d3"/><stop offset="100%" stop-color="#38989c"/></linearGradient>
              <radialGradient id="reGlow" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#7ce0d3" stop-opacity=".72"/><stop offset="100%" stop-color="#7ce0d3" stop-opacity="0"/></radialGradient>
              <radialGradient id="rePinkGlow" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#f472b6" stop-opacity=".6"/><stop offset="100%" stop-color="#f472b6" stop-opacity="0"/></radialGradient>
              <radialGradient id="reGoldGlow" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#fde047" stop-opacity=".65"/><stop offset="100%" stop-color="#fde047" stop-opacity="0"/></radialGradient>
              <filter id="reSoftGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            </defs>
            <rect width="540" height="620" fill="url(#reBg)"/>
            <g class="re-rays">
              <polygon points="30,0 110,0 190,370 70,370" fill="url(#reRay)"/>
              <polygon points="195,0 285,0 355,390 230,390" fill="url(#reRay)"/>
              <polygon points="370,0 465,0 520,370 400,370" fill="url(#reRay)"/>
            </g>
            <path d="M0 18 Q68 8 135 18 T270 18 T405 18 T540 18" fill="none" stroke="#a5f3fc" stroke-opacity=".34" stroke-width="1.8"/>
            <path d="M0 32 Q90 24 180 32 T360 32 T540 32" fill="none" stroke="#99f6e4" stroke-opacity=".2" stroke-width="1.1"/>
            <path d="M0 470 Q95 390 195 452 T395 438 T540 460 L540 620 L0 620 Z" fill="#0d3152" opacity=".5"/>
            <g class="re-dust" fill="#a5f3fc" opacity=".62">
              <circle cx="66" cy="138" r="1.7"/><circle cx="152" cy="92" r="1.4"/><circle cx="230" cy="64" r="1.8"/>
              <circle cx="348" cy="84" r="1.5"/><circle cx="442" cy="126" r="2"/><circle cx="496" cy="78" r="1.4"/>
              <circle cx="94" cy="276" r="1.5"/><circle cx="456" cy="252" r="1.6"/>
            </g>
            <!-- 🐋 ปลาวาฬว่ายช้า ๆ ฉากหลังด้านบน -->
            <g id="reWhale" class="re-whale" style="cursor:pointer"><title>วาฬน้อยผู้พิทักษ์ · แตะเพื่อปล่อยฟองดนตรี</title>
              <g transform="translate(0,82)">
                <ellipse cx="42" cy="14" rx="58" ry="22" fill="url(#reGlow)" opacity=".42"/>
                <path d="M-20 12 Q2 -14 48 -8 Q78 -4 94 8 Q84 19 58 21 Q16 24 -20 12 Z" fill="#7dd3fc" fill-opacity=".86" stroke="#bae6fd" stroke-width="1.1"/>
                <path d="M-12 14 Q22 22 72 15 Q52 23 14 21 Z" fill="#e0f2fe" opacity=".6"/>
                <path d="M-18 12 L-38 0 Q-31 12 -38 24 Z" fill="#38bdf8" fill-opacity=".85"/>
                <path d="M40 18 Q47 31 28 28 Q35 22 40 18 Z" fill="#38bdf8" opacity=".82"/>
                <circle cx="72" cy="8" r="2" fill="#0f172a"/><circle cx="73" cy="7.4" r=".6" fill="#fff"/>
                <rect x="29" y="-19" width="12" height="10" rx="2" fill="#fde68a" opacity=".92"/>
                <polygon points="26,-19 35,-27 44,-19" fill="#f472b6" opacity=".95"/>
                <circle cx="35" cy="-14" r="2.2" fill="#fef08a" filter="url(#reSoftGlow)"/>
              </g>
            </g>
            <!-- 🧜‍♀️ นางเงือกว่ายช้า ๆ ฉากหลังช่วงกลางน้ำ -->
            <g id="reMermaid" class="re-mermaid" style="cursor:pointer"><title>นางเงือกแห่งปราสาทใต้น้ำ · แตะเพื่อโปรยละอองมุก</title>
              <g transform="translate(0,224)">
                <circle cx="0" cy="0" r="28" fill="url(#rePinkGlow)" opacity=".38"/>
                <path d="M-7 3 Q-22 9 -38 2 Q-48 -3 -54 5 Q-44 10 -39 15 Q-49 19 -54 24 Q-40 24 -30 15 Q-15 13 -3 8 Z" fill="#5eead4" fill-opacity=".88" stroke="#ccfbf1" stroke-width="1"/>
                <path d="M-5 4 Q3 -2 12 2 L8 9 Q0 9 -5 4 Z" fill="#fde4cf"/>
                <path d="M2 2 Q7 0 9 4 L3 6 Z" fill="#f472b6"/>
                <path d="M10 2 Q18 -3 24 -1" fill="none" stroke="#fde4cf" stroke-width="2.2" stroke-linecap="round"/>
                <circle cx="27" cy="-1" r="3" fill="#fef08a" filter="url(#reSoftGlow)"/>
                <circle cx="14" cy="-5" r="4.5" fill="#fde4cf"/>
                <path d="M13 -9 Q3 -14 -12 -7 Q-21 -3 -29 -6 Q-18 2 -5 -2 Q5 -3 12 -4 Z" fill="#f9a8d4" fill-opacity=".9"/>
                <circle cx="16" cy="-5.5" r=".8" fill="#1e293b"/>
              </g>
            </g>
            <!-- สาหร่ายเคลป์สูง 2 ขอบ -->
            <g class="re-kelp" fill="none" stroke-linecap="round" opacity=".52">
              <path d="M22 610 Q10 510 26 420 T16 250 T28 110" stroke="#10b981" stroke-width="5"/>
              <path d="M40 610 Q52 530 36 450 T46 310" stroke="#14b8a6" stroke-width="3.6"/>
              <path d="M518 610 Q530 500 512 400 T524 230 T512 100" stroke="#10b981" stroke-width="5"/>
              <path d="M498 610 Q486 520 502 440 T492 300" stroke="#0d9488" stroke-width="3.6"/>
            </g>
            <!-- พื้นทรายใต้ทะเลหลายชั้นเต็มกว้าง 540 -->
            <path d="M0 546 Q110 526 220 542 T430 534 T540 540 L540 620 L0 620 Z" fill="#133454"/>
            <path d="M0 568 Q135 552 270 566 T540 558 L540 620 L0 620 Z" fill="#0d243c"/>
            <path d="M0 592 Q125 582 260 592 T540 586 L540 620 L0 620 Z" fill="#08182b"/>

            <!-- 🏛️ ปีกปราสาทซ้ายสุดอลังการ (เชื่อมสะพานเข้ากับปราสาท 5 ชั้นเดิมตรงกลาง!) -->
            <g class="re-wing-l">
              <ellipse cx="110" cy="552" rx="54" ry="11" fill="#04101e" opacity=".46"/>
              <!-- ฐานหอคอยซ้าย -->
              <polygon points="110,506 164,532 110,558 56,532" fill="#234f75"/>
              <polygon points="56,532 110,558 110,569 56,543" fill="#163654"/>
              <polygon points="110,558 164,532 164,543 110,569" fill="#0f2740"/>
              <!-- หอคอยชมพู-ฟ้าซ้าย + ซุ้มโค้ง 2 ชั้น -->
              <polygon points="74,316 110,334 110,514 74,496" fill="url(#reRose)"/>
              <polygon points="110,334 146,316 146,496 110,514" fill="url(#reWall)"/>
              <path d="M84,484 v-28 a8 8 0 0 1 16 0 v28 Z" fill="#132944"/>
              <path d="M120,484 v-28 a8 8 0 0 1 16 0 v28 Z" fill="#0d2238"/>
              <path d="M86,416 v-22 a6 6 0 0 1 12 0 v22 Z" fill="#132944"/>
              <circle cx="92" cy="402" r="2.2" fill="#fde047"/>
              <path d="M122,416 v-22 a6 6 0 0 1 12 0 v22 Z" fill="#0d2238"/>
              <circle cx="128" cy="402" r="2.2" fill="#5eead4"/>
              <!-- ระเบียงหอซ้าย + หอสังเกตการณ์ยอดแหลมเขียวมิ้นต์ -->
              <polygon points="110,290 154,312 110,334 66,312" fill="url(#reSand)"/>
              <polygon points="66,312 110,334 110,344 66,322" fill="url(#reWall)"/>
              <polygon points="110,334 154,312 154,322 110,344" fill="url(#reSide)"/>
              <polygon points="88,224 110,235 110,296 88,285" fill="url(#reWall)"/>
              <polygon points="110,235 132,224 132,285 110,296" fill="url(#reSide)"/>
              <path d="M95,274 v-16 a5 5 0 0 1 10 0 v16 Z" fill="#0c2338"/>
              <path d="M84,224 Q110,180 136,224 Z" fill="url(#reTeal)"/>
              <line x1="110" y1="190" x2="110" y2="168" stroke="#fde68a" stroke-width="1.8"/>
              <polygon points="110,160 115,168 110,176 105,168" fill="#f9a8d4" filter="url(#reSoftGlow)"/>
              <!-- สะพานเฉียง Monument Valley เชื่อมปีกซ้ายเข้าสู่ชั้น 2 และชั้น 4 ปราสาทกลาง -->
              <polygon points="138,448 214,412 224,417 148,453" fill="url(#reTeal)"/>
              <polygon points="138,448 148,453 148,462 138,457" fill="#1e5c66"/>
              <polygon points="130,308 216,258 225,263 139,313" fill="url(#reSand)"/>
              <polygon points="130,308 139,313 139,321 130,316" fill="#2c5d87"/>
              <!-- วงแหวนศักดิ์สิทธิ์ลอย + ดอกคาลล่าลิลลี่ใต้น้ำ -->
              <ellipse cx="164" cy="368" rx="18" ry="22" fill="none" stroke="#f9a8d4" stroke-width="5" opacity=".72"/>
              <ellipse cx="164" cy="368" rx="18" ry="22" fill="none" stroke="#7ce0d3" stroke-width="1.6" opacity=".9"/>
              <path d="M56,520 Q42,478 54,446" fill="none" stroke="#2dd4bf" stroke-width="2.4"/>
              <path d="M54,446 Q38,430 58,420 Q70,436 54,446 Z" fill="#fbcfe8"/>
            </g>

            <!-- 🏛️ ปีกปราสาทขวาสุดอลังการ (เชื่อมสะพานเข้ากับปราสาท 5 ชั้นเดิมตรงกลาง!) -->
            <g class="re-wing-r">
              <ellipse cx="430" cy="552" rx="54" ry="11" fill="#04101e" opacity=".46"/>
              <polygon points="430,506 484,532 430,558 376,532" fill="#234f75"/>
              <polygon points="376,532 430,558 430,569 376,543" fill="#163654"/>
              <polygon points="430,558 484,532 484,543 430,569" fill="#0f2740"/>
              <!-- หอคอยฟ้า-ชมพูขวา + ซุ้มโค้ง 2 ชั้น -->
              <polygon points="394,316 430,334 430,514 394,496" fill="url(#reWall)"/>
              <polygon points="430,334 466,316 466,496 430,514" fill="url(#reRose)"/>
              <path d="M404,484 v-28 a8 8 0 0 1 16 0 v28 Z" fill="#0d2238"/>
              <path d="M440,484 v-28 a8 8 0 0 1 16 0 v28 Z" fill="#132944"/>
              <path d="M406,416 v-22 a6 6 0 0 1 12 0 v22 Z" fill="#0d2238"/>
              <circle cx="412" cy="402" r="2.2" fill="#5eead4"/>
              <path d="M442,416 v-22 a6 6 0 0 1 12 0 v22 Z" fill="#132944"/>
              <circle cx="448" cy="402" r="2.2" fill="#fde047"/>
              <!-- ระเบียงหอขวา + โดมปะการังยอดคู่ -->
              <polygon points="430,290 474,312 430,334 386,312" fill="url(#reSand)"/>
              <polygon points="386,312 430,334 430,344 386,322" fill="url(#reWall)"/>
              <polygon points="430,334 474,312 474,322 430,344" fill="url(#reSide)"/>
              <polygon points="408,224 430,235 430,296 408,285" fill="url(#reWall)"/>
              <polygon points="430,235 452,224 452,285 430,296" fill="url(#reSide)"/>
              <path d="M435,274 v-16 a5 5 0 0 1 10 0 v16 Z" fill="#7c5230"/>
              <path d="M404,224 Q430,180 456,224 Z" fill="url(#reTeal)"/>
              <line x1="430" y1="190" x2="430" y2="168" stroke="#fde68a" stroke-width="1.8"/>
              <polygon points="430,160 435,168 430,176 425,168" fill="#5eead4" filter="url(#reSoftGlow)"/>
              <!-- สะพานเฉียงเชื่อมปราสาทกลางเข้าสู่ปีกขวา -->
              <polygon points="316,417 326,412 402,448 392,453" fill="url(#reTeal)"/>
              <polygon points="392,453 402,448 402,457 392,462" fill="#164652"/>
              <polygon points="315,263 324,258 410,308 401,313" fill="url(#reSand)"/>
              <polygon points="401,313 410,308 410,316 401,321" fill="#c69062"/>
              <!-- เสาคริสตัลลอย + ดอกคาลล่าลิลลี่ใต้น้ำขวา -->
              <polygon points="376,346 386,364 376,382 366,364" fill="#67e8f9" opacity=".82" filter="url(#reSoftGlow)"/>
              <path d="M484,520 Q498,478 486,446" fill="none" stroke="#2dd4bf" stroke-width="2.4"/>
              <path d="M486,446 Q502,430 482,420 Q470,436 486,446 Z" fill="#fbcfe8"/>
            </g>

            <!-- 🏛️ ปราสาท 5 ชั้นเดิมตรงกลาง (ความละเอียดจัดเต็มเหมือนเดิมเป๊ะ!) -->
            <g class="rf-castle" transform="translate(180,0)">${rfCastleCore('re')}</g>

            <!-- 🐟 ปลาจิ๋วประจำปราสาท (เล่นให้อาหารปลาได้ตลอดแม้ยังไม่ครบ 30 น.) -->
            <g class="re-fish-grp re-ambient-fish">
              <g class="rf-swim" transform="translate(168,268)"><ellipse cx="0" cy="0" rx="5.8" ry="3" fill="#99f6e4"/><polygon points="4.8,0 9.5,-2.8 9.5,2.8" fill="#5eead4"/><circle cx="-3.2" cy="-.5" r=".8" fill="#0f172a"/></g>
              <g class="rf-swim2" transform="translate(376,262)"><ellipse cx="0" cy="0" rx="6" ry="3.2" fill="#fbcfe8"/><polygon points="-5,0 -9.8,-2.8 -9.8,2.8" fill="#f472b6"/><circle cx="3.2" cy="-.5" r=".8" fill="#0f172a"/></g>
              <g class="rf-swim" transform="translate(268,180)"><ellipse cx="0" cy="0" rx="5.2" ry="2.6" fill="#fde68a"/><polygon points="4.2,0 8.5,-2.4 8.5,2.4" fill="#fbbf24"/><circle cx="-2.8" cy="-.5" r=".8" fill="#0f172a"/></g>
            </g>

            <!-- 🪸 16 ชนิดปะการัง & สัตว์ทะเลจัดเต็มเป็นกลุ่ม (โชว์เฉพาะชนิดที่สะสมได้ในวันนี้!) -->
            <g id="reSp0" class="rf-sp rf-sway re-coral" data-sp="0"><title>0:30 · กลุ่ม Staghorn Coral (ปะการังเขากวาง)</title>
              <g transform="translate(68,580)" stroke="#facc15" stroke-linecap="round" fill="none"><path d="M0 0v-28m0 12-10-13m10 8 9-14m-9 19-8-4" stroke-width="3.8"/><path d="M22 4v-22m0 10-8-10m8 5 8-11" stroke-width="3.2" stroke="#fde047"/><path d="M-20 6v-20m0 9-7-9m7 4 7-10" stroke-width="3" stroke="#eab308"/></g>
              <g transform="translate(468,576)" stroke="#facc15" stroke-linecap="round" fill="none"><path d="M0 0v-26m0 11-9-12m9 7 9-13" stroke-width="3.6"/><path d="M18 5v-18m0 8-6-8m6 4 6-9" stroke-width="3" stroke="#fde047"/></g>
            </g>
            <g id="reSp1" class="rf-sp rf-swim re-fish-grp" data-sp="1"><title>1:00 · ฝูง Clownfish (ปลาการ์ตูน)</title>
              <g transform="translate(352,480)"><ellipse cx="0" cy="0" rx="9.5" ry="5.2" fill="#fb923c"/><polygon points="8.5,0 15,-5 15,5" fill="#fb923c"/><rect x="-3.4" y="-4.6" width="2.4" height="9.2" fill="#fff"/><rect x="2.2" y="-4" width="2.1" height="8" fill="#fff"/><circle cx="-5.6" cy="-1" r="1.2" fill="#0f172a"/></g>
              <g transform="translate(382,496) scale(.8)"><ellipse cx="0" cy="0" rx="9.5" ry="5.2" fill="#fb923c"/><polygon points="8.5,0 15,-5 15,5" fill="#fb923c"/><rect x="-3.4" y="-4.6" width="2.4" height="9.2" fill="#fff"/><rect x="2.2" y="-4" width="2.1" height="8" fill="#fff"/><circle cx="-5.6" cy="-1" r="1.2" fill="#0f172a"/></g>
              <g transform="translate(174,474) scale(-.85,.85)"><ellipse cx="0" cy="0" rx="9.5" ry="5.2" fill="#fb923c"/><polygon points="8.5,0 15,-5 15,5" fill="#fb923c"/><rect x="-3.4" y="-4.6" width="2.4" height="9.2" fill="#fff"/><rect x="2.2" y="-4" width="2.1" height="8" fill="#fff"/><circle cx="-5.6" cy="-1" r="1.2" fill="#0f172a"/></g>
            </g>
            <g id="reSp2" class="rf-sp rf-sway re-coral" data-sp="2"><title>1:30 · กลุ่ม Carnation Coral (ปะการังอ่อนส้ม)</title>
              <g transform="translate(392,582)"><path d="M0 0v-24m0 11-9-11m9 14 9-12" fill="none" stroke="#ff7c6e" stroke-width="3.8" stroke-linecap="round"/><circle cx="-10" cy="-24" r="3.4" fill="#fda4af"/><circle cx="10" cy="-22" r="3.4" fill="#fda4af"/><circle cx="0" cy="-26" r="3.8" fill="#fecdd3"/><g transform="translate(24,5) scale(.8)"><path d="M0 0v-22m0 10-8-10m8 13 8-11" fill="none" stroke="#fb7185" stroke-width="3.5" stroke-linecap="round"/><circle cx="-9" cy="-22" r="3.2" fill="#fecdd3"/><circle cx="9" cy="-20" r="3.2" fill="#fda4af"/><circle cx="0" cy="-24" r="3.4" fill="#ffe4e6"/></g><g transform="translate(-24,4) scale(.78)"><path d="M0 0v-22m0 10-8-10m8 13 8-11" fill="none" stroke="#ff7c6e" stroke-width="3.5" stroke-linecap="round"/><circle cx="-9" cy="-22" r="3.2" fill="#fda4af"/><circle cx="9" cy="-20" r="3.2" fill="#fecdd3"/><circle cx="0" cy="-24" r="3.4" fill="#fda4af"/></g></g>
            </g>
            <g id="reSp3" class="rf-sp rf-swim2 re-fish-grp" data-sp="3"><title>2:00 · ฝูง Blue Tang (ปลาขี้ตังเบ็ดฟ้า)</title>
              <g transform="translate(154,328)"><ellipse cx="0" cy="0" rx="10" ry="5.8" fill="#38bdf8"/><polygon points="-9,0 -15.5,-5 -15.5,5" fill="#facc15"/><path d="M-4.5 -2 Q2 -5.5 6.8 0" fill="none" stroke="#0f172a" stroke-width="1.8"/><circle cx="5.6" cy="-1" r="1.2" fill="#0f172a"/></g>
              <g transform="translate(124,348) scale(.78)"><ellipse cx="0" cy="0" rx="10" ry="5.8" fill="#38bdf8"/><polygon points="-9,0 -15.5,-5 -15.5,5" fill="#facc15"/><path d="M-4.5 -2 Q2 -5.5 6.8 0" fill="none" stroke="#0f172a" stroke-width="1.8"/><circle cx="5.6" cy="-1" r="1.2" fill="#0f172a"/></g>
              <g transform="translate(396,318) scale(-.85,.85)"><ellipse cx="0" cy="0" rx="10" ry="5.8" fill="#38bdf8"/><polygon points="-9,0 -15.5,-5 -15.5,5" fill="#facc15"/><path d="M-4.5 -2 Q2 -5.5 6.8 0" fill="none" stroke="#0f172a" stroke-width="1.8"/><circle cx="5.6" cy="-1" r="1.2" fill="#0f172a"/></g>
            </g>
            <g id="reSp4" class="rf-sp rf-sway re-coral" data-sp="4"><title>2:30 · กลุ่ม Cauliflower Coral (ปะการังดอกกะหล่ำ)</title>
              <g transform="translate(148,582)" fill="#f472b6"><circle cx="-15" cy="2" r="8.5"/><circle cx="-4" cy="-5" r="9.5"/><circle cx="8" cy="-1" r="9"/><circle cx="16" cy="4" r="7.5"/><circle cx="-2" cy="6" r="7.5" fill="#db2777"/><circle cx="9" cy="7" r="6.8" fill="#be185d"/></g>
              <g transform="translate(188,592) scale(.8)" fill="#f9a8d4"><circle cx="-12" cy="2" r="7.8"/><circle cx="-2" cy="-4" r="9"/><circle cx="9" cy="0" r="8"/><circle cx="0" cy="6" r="7" fill="#ec4899"/></g>
              <g transform="translate(110,590) scale(.76)" fill="#ec4899"><circle cx="-10" cy="2" r="7.5"/><circle cx="0" cy="-4" r="8.5"/><circle cx="9" cy="1" r="7.5"/><circle cx="0" cy="5" r="6.5" fill="#be185d"/></g>
              <g transform="translate(342,588) scale(.85)" fill="#f472b6"><circle cx="-12" cy="2" r="8"/><circle cx="-2" cy="-4" r="9"/><circle cx="9" cy="1" r="8"/><circle cx="2" cy="6" r="7" fill="#db2777"/></g>
            </g>
            <g id="reSp5" class="rf-sp rf-sway re-coral" data-sp="5"><title>3:00 · กลุ่ม Sun Coral (ปะการังถ้วยส้มเรืองแสง)</title>
              <g transform="translate(306,578)"><circle cx="0" cy="0" r="20" fill="url(#reGoldGlow)" opacity=".5"/><circle cx="-10" cy="2" r="6.5" fill="#f59e0b"/><circle cx="2" cy="-3" r="7.2" fill="#fde047"/><circle cx="12" cy="3" r="6.2" fill="#fb923c"/><circle cx="-10" cy="2" r="2.6" fill="#fef08a"/><circle cx="2" cy="-3" r="2.8" fill="#fff"/></g>
              <g transform="translate(222,584) scale(.84)"><circle cx="0" cy="0" r="18" fill="url(#reGoldGlow)" opacity=".45"/><circle cx="-9" cy="2" r="6" fill="#f59e0b"/><circle cx="2" cy="-3" r="6.8" fill="#fde047"/><circle cx="11" cy="3" r="5.8" fill="#fb923c"/><circle cx="2" cy="-3" r="2.6" fill="#fff"/></g>
            </g>
            <g id="reSp6" class="rf-sp rf-float re-fish-grp" data-sp="6"><title>3:30 · ฝูง Moon Jellyfish (แมงกะพรุนเรืองแสง)</title>
              <g transform="translate(466,184)"><circle cx="0" cy="-2" r="18" fill="url(#reGlow)" opacity=".45"/><path d="M-11 0 a11 9.5 0 0 1 22 0 Z" fill="#67e8f9" fill-opacity=".76" stroke="#cffafe" stroke-width="1.2"/><path d="M-6 1 Q-8 10 -5 18 M0 1 Q2 12 -2 20 M6 1 Q8 10 5 18" fill="none" stroke="#a5f3fc" stroke-width="1.2"/></g>
              <g transform="translate(498,218) scale(.72)"><path d="M-11 0 a11 9.5 0 0 1 22 0 Z" fill="#a5f3fc" fill-opacity=".72" stroke="#ecfeff" stroke-width="1.2"/><path d="M-6 1 Q-8 10 -5 18 M0 1 Q2 12 -2 20 M6 1 Q8 10 5 18" fill="none" stroke="#cffafe" stroke-width="1.2"/></g>
              <g transform="translate(64,192) scale(.82)"><path d="M-11 0 a11 9.5 0 0 1 22 0 Z" fill="#67e8f9" fill-opacity=".74" stroke="#cffafe" stroke-width="1.2"/><path d="M-6 1 Q-8 10 -5 18 M0 1 Q2 12 -2 20 M6 1 Q8 10 5 18" fill="none" stroke="#a5f3fc" stroke-width="1.2"/></g>
            </g>
            <g id="reSp7" class="rf-sp rf-sway re-coral" data-sp="7"><title>4:00 · กลุ่ม Sea Fan (กัลปังหาพัดแดง)</title>
              <g transform="translate(62,534)" stroke="#fb7185" fill="none" stroke-linecap="round"><path d="M0 0v-32m0 20-12-14m12 9 12-14m-12 4-6-15m6 15 6-15" stroke-width="2.4"/><path d="M22 6v-24m0 14-9-10m9 6 9-10" stroke-width="2" stroke="#fda4af"/></g>
              <g transform="translate(476,530)" stroke="#fb7185" fill="none" stroke-linecap="round"><path d="M0 0v-30m0 18-11-13m11 8 11-13m-11 4-6-14m6 14 6-14" stroke-width="2.3"/></g>
            </g>
            <g id="reSp8" class="rf-sp re-coral" data-sp="8"><title>4:30 · กลุ่ม Brain Coral (ปะการังสมองมรกต)</title>
              <g transform="translate(272,588)"><ellipse cx="0" cy="0" rx="15" ry="10" fill="#34d399"/><path d="M-9 -2 Q-4 -6 0 -2 T9 -2 M-8 3 Q-2 0 2 3 T8 2" fill="none" stroke="#065f46" stroke-width="1.6" stroke-linecap="round"/></g>
              <g transform="translate(298,595) scale(.76)"><ellipse cx="0" cy="0" rx="15" ry="10" fill="#10b981"/><path d="M-9 -2 Q-4 -6 0 -2 T9 -2 M-8 3 Q-2 0 2 3 T8 2" fill="none" stroke="#064e3b" stroke-width="1.6" stroke-linecap="round"/></g>
              <g transform="translate(244,595) scale(.74)"><ellipse cx="0" cy="0" rx="15" ry="10" fill="#6ee7b7"/><path d="M-9 -2 Q-4 -6 0 -2 T9 -2 M-8 3 Q-2 0 2 3 T8 2" fill="none" stroke="#065f46" stroke-width="1.6" stroke-linecap="round"/></g>
            </g>
            <g id="reSp9" class="rf-sp rf-swim re-fish-grp" data-sp="9"><title>5:00 · ฝูง Butterflyfish (ปลาผีเสื้อเหลือง)</title>
              <g transform="translate(362,364)"><polygon points="-9.5,0 0,-8.5 9.5,0 0,8.5" fill="#fde047"/><polygon points="8.5,0 15,-5 15,5" fill="#fef08a"/><line x1="-2.2" y1="-6.4" x2="-2.2" y2="6.4" stroke="#0f172a" stroke-width="1.8"/><circle cx="-5.2" cy="-1" r="1.2" fill="#0f172a"/></g>
              <g transform="translate(394,382) scale(.78)"><polygon points="-9.5,0 0,-8.5 9.5,0 0,8.5" fill="#fde047"/><polygon points="8.5,0 15,-5 15,5" fill="#fef08a"/><line x1="-2.2" y1="-6.4" x2="-2.2" y2="6.4" stroke="#0f172a" stroke-width="1.8"/><circle cx="-5.2" cy="-1" r="1.2" fill="#0f172a"/></g>
            </g>
            <g id="reSp10" class="rf-sp rf-sway re-coral" data-sp="10"><title>5:30 · กลุ่ม Sea Anemone (ดอกไม้ทะเลมิ้นต์)</title>
              <g transform="translate(432,554)"><ellipse cx="0" cy="9" rx="11" ry="4.5" fill="#0d9488"/><path d="M-8 7 Q-12 -3 -5 -10 M-2.5 7 Q-4 -6 0 -13 M2.5 7 Q5 -6 8 -11 M8 7 Q12 -2 10 -8" fill="none" stroke="#5eead4" stroke-width="2.4" stroke-linecap="round"/></g>
              <g transform="translate(456,560) scale(.8)"><ellipse cx="0" cy="9" rx="11" ry="4.5" fill="#0f766e"/><path d="M-8 7 Q-12 -3 -5 -10 M-2.5 7 Q-4 -6 0 -13 M2.5 7 Q5 -6 8 -11 M8 7 Q12 -2 10 -8" fill="none" stroke="#99f6e4" stroke-width="2.4" stroke-linecap="round"/></g>
              <g transform="translate(120,554) scale(.84)"><ellipse cx="0" cy="9" rx="11" ry="4.5" fill="#0d9488"/><path d="M-8 7 Q-12 -3 -5 -10 M-2.5 7 Q-4 -6 0 -13 M2.5 7 Q5 -6 8 -11 M8 7 Q12 -2 10 -8" fill="none" stroke="#5eead4" stroke-width="2.4" stroke-linecap="round"/></g>
            </g>
            <g id="reSp11" class="rf-sp rf-swim2 re-fish-grp" data-sp="11"><title>6:00 · คู่ Sea Turtle (เต่าทะเลน้อย)</title>
              <g transform="translate(152,148)"><ellipse cx="0" cy="0" rx="12.5" ry="8" fill="#10b981" stroke="#6ee7b7" stroke-width="1.2"/><circle cx="14" cy="-1" r="3.6" fill="#34d399"/><path d="M3.5 -6 L10 -13 M3.5 6 L8.5 13 M-8 -3.5 L-13 -7 M-8 3.5 L-13 7" stroke="#34d399" stroke-width="2.8" stroke-linecap="round"/></g>
              <g transform="translate(116,174) scale(.66)"><ellipse cx="0" cy="0" rx="12.5" ry="8" fill="#10b981" stroke="#6ee7b7" stroke-width="1.2"/><circle cx="14" cy="-1" r="3.6" fill="#34d399"/><path d="M3.5 -6 L10 -13 M3.5 6 L8.5 13 M-8 -3.5 L-13 -7 M-8 3.5 L-13 7" stroke="#34d399" stroke-width="2.8" stroke-linecap="round"/></g>
            </g>
            <g id="reSp12" class="rf-sp rf-sway re-coral" data-sp="12"><title>6:30 · กลุ่ม Organ Pipe Coral (ปะการังออร์แกน)</title>
              <g transform="translate(36,584)" stroke="#a78bfa" stroke-width="3.2" stroke-linecap="round"><line x1="-8" y1="10" x2="-8" y2="-6"/><line x1="-1" y1="10" x2="-1" y2="-13"/><line x1="6" y1="10" x2="6" y2="-9"/><circle cx="-8" cy="-7" r="2.6" fill="#e9d5ff" stroke="none"/><circle cx="-1" cy="-14" r="3" fill="#e9d5ff" stroke="none"/><circle cx="6" cy="-10" r="2.6" fill="#e9d5ff" stroke="none"/></g>
              <g transform="translate(504,584) scale(.9)" stroke="#c084fc" stroke-width="3.2" stroke-linecap="round"><line x1="-7" y1="10" x2="-7" y2="-6"/><line x1="0" y1="10" x2="0" y2="-12"/><line x1="7" y1="10" x2="7" y2="-8"/><circle cx="-7" cy="-7" r="2.6" fill="#f3e8ff" stroke="none"/><circle cx="0" cy="-13" r="3" fill="#f3e8ff" stroke="none"/><circle cx="7" cy="-9" r="2.6" fill="#f3e8ff" stroke="none"/></g>
            </g>
            <g id="reSp13" class="rf-sp rf-float re-fish-grp" data-sp="13"><title>7:00 · คู่ Manta Ray (ปลากระเบนราหู)</title>
              <g transform="translate(182,210)"><path d="M-24 2.5 Q0 -15 24 2.5 Q8.5 5 0 12 Q-8.5 5 -24 2.5 Z" fill="#60a5fa" fill-opacity=".88"/><line x1="0" y1="11" x2="0" y2="26" stroke="#93c5fd" stroke-width="1.4"/></g>
              <g transform="translate(366,196) scale(.76)"><path d="M-24 2.5 Q0 -15 24 2.5 Q8.5 5 0 12 Q-8.5 5 -24 2.5 Z" fill="#93c5fd" fill-opacity=".84"/><line x1="0" y1="11" x2="0" y2="26" stroke="#bfdbfe" stroke-width="1.4"/></g>
            </g>
            <g id="reSp14" class="rf-sp rf-sway re-coral" data-sp="14"><title>7:30 · กลุ่ม Elkhorn Coral (ปะการังเขากวางใหญ่)</title>
              <g transform="translate(486,590)" stroke="#fbbf24" fill="none" stroke-linecap="round"><path d="M0 0v-26m0 12-12-15m12 9 11-14m-12 5-5-10m17 7 3-8" stroke-width="4"/><path d="M-24 6v-20m0 9-8-12m8 8 8-11" stroke-width="3.4" stroke="#fcd34d"/></g>
              <g transform="translate(198,588) scale(.82)" stroke="#fbbf24" fill="none" stroke-linecap="round"><path d="M0 0v-24m0 10-11-14m11 8 10-13" stroke-width="3.8"/></g>
            </g>
            <g id="reSp15" class="rf-sp rf-float re-fish-grp" data-sp="15"><title>8:00 · Crystal Lotus &amp; Golden Whale</title>
              <g transform="translate(270,134)"><polygon points="0,-13 6.5,-3.5 0,3 -6.5,-3.5" fill="#ff7c6e" stroke="#fff" stroke-width=".9"/><circle cx="0" cy="-4" r="16" fill="url(#reGoldGlow)"/></g>
              <g transform="translate(342,64)"><path d="M-20 0 Q-4 -11 18 -2.5 Q23 0 28 -6 L26 4 Q20 6 15 5 Q-4 10 -20 0 Z" fill="#fef08a" fill-opacity=".94" filter="url(#reSoftGlow)"/><circle cx="-12" cy="-1.2" r="1.4" fill="#0f172a"/></g>
            </g>
            <g id="reefFxLayer"></g>
          </svg>
        </div>
        <div class="reef-ft">
          <div class="reef-pv-bar" id="reefPvBar" hidden><button type="button" id="rfPvPrev" title="ลด 30 นาที">−</button><span id="rfPvLbl">8 ชม.</span><button type="button" id="rfPvNext" title="เพิ่ม 30 นาที">+</button></div>
          <div class="reef-next-card" id="reefNextCard">
            <div class="reef-next-ic" id="reefNextIc"></div>
            <div class="reef-next-lbl" id="reefNext">Staghorn</div>
            <div class="reef-pbar"><i id="reefPbar"></i><span id="reefPtxt">0/30</span></div>
          </div>
          <div class="reef-exp-panel" id="reefExpPanel" hidden>
            <div class="reef-exp-games">
              <button type="button" class="reef-game-btn feed" id="reefFeedBtn">🐟 ให้อาหารปลา</button>
              <button type="button" class="reef-game-btn" id="reefBubBtn">🫧 ฟองอากาศ</button>
            </div>
            <div class="reef-exp-coll" id="reefExpColl"></div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(reefHost);

    const spawnFx = (html, ms = 2400) => {
      const layer = $('#reefFxLayer', reefHost);
      if (!layer) return;
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.innerHTML = html;
      layer.appendChild(g);
      setTimeout(() => g.remove(), ms);
    };
    const addPearls = n => {
      reefPearls += n;
      const el = $('#reefExpPearl', reefHost);
      if (el) el.textContent = `🫧 ${reefPearls}`;
    };
    const triggerFeedFish = () => {
      playWaterChime([523.25, 659.25, 783.99, 1046.5]);
      let pellets = '';
      for (let i = 0; i < 8; i++) {
        const x = 95 + Math.random() * 350;
        const y = 70 + Math.random() * 80;
        const delay = (i * 0.1).toFixed(2);
        pellets += `<circle class="re-pellet" cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(3 + Math.random() * 1.6).toFixed(1)}" fill="${i % 2 ? '#fde047' : '#f9a8d4'}" style="animation-delay:${delay}s"/>`;
      }
      spawnFx(pellets, 2800);
      const sc = $('#reefScene', reefHost);
      sc.classList.add('fish-glow');
      clearTimeout(feedGlowTmr);
      feedGlowTmr = setTimeout(() => sc.classList.remove('fish-glow'), 3600);
      addPearls(3);
      toast('🐟 ให้อาหารปลาแล้ว! ปลาเรืองแสงดีใจมาก (+3 ไข่มุก)');
    };
    const triggerBubbles = (cx, cy, cnt = 6) => {
      playWaterChime([659.25, 880]);
      let html = `<circle class="re-ripple" cx="${cx}" cy="${cy}" r="6" fill="none" stroke="#a5f3fc" stroke-width="1.5"/>`;
      for (let i = 0; i < cnt; i++) {
        const bx = cx + (Math.random() - 0.5) * 38;
        const by = cy + (Math.random() - 0.5) * 18;
        const r = (2.2 + Math.random() * 3.8).toFixed(1);
        html += `<circle class="re-fx-bub" cx="${bx.toFixed(0)}" cy="${by.toFixed(0)}" r="${r}" fill="rgba(165,243,252,.22)" stroke="#a5f3fc" stroke-width="1.2" style="animation-delay:${(i * 0.08).toFixed(2)}s"/>`;
      }
      spawnFx(html, 2200);
    };
    $('#reefFeedBtn', reefHost).onclick = e => { e.stopPropagation(); triggerFeedFish(); };
    $('#reefBubBtn', reefHost).onclick = e => { e.stopPropagation(); triggerBubbles(270 + (Math.random() - 0.5) * 240, 360, 10); addPearls(1); };
    $('#reefExpGlow', reefHost).onclick = () => {
      reefNight = !reefNight;
      $('#reefDock', reefHost).classList.toggle('is-night', reefNight);
      $('#reefExpGlow', reefHost).classList.toggle('on', reefNight);
    };
    $('#reefScene', reefHost).addEventListener('click', e => {
      if (!draftOn('reefTankExpand')) return;
      if (!reefExpOpen) { reefExpOpen = true; syncReef(false); return; }
      const svg = $('#reefExpSvg', reefHost);
      const pt = svg.getBoundingClientRect();
      const sx = ((e.clientX - pt.left) / pt.width) * 540;
      const sy = ((e.clientY - pt.top) / pt.height) * 620;
      if (e.target.closest('#reWhale')) {
        playWaterChime([392, 493.88, 587.33, 783.99]);
        triggerBubbles(sx, sy, 12);
        addPearls(5);
        toast('🐋 วาฬร้องเพลงและปล่อยฟองเรืองแสง! (+5 ไข่มุก)');
        return;
      }
      if (e.target.closest('#reMermaid')) {
        playWaterChime([659.25, 783.99, 987.77, 1318.5]);
        triggerBubbles(sx, sy, 10);
        addPearls(5);
        toast('✨ นางเงือกโปรยละอองไข่มุกให้กำลังใจ! (+5 ไข่มุก)');
        return;
      }
      const spEl = e.target.closest('[data-sp]');
      if (spEl && spEl.classList.contains('on')) {
        const sp = REEF_SPECIES[+spEl.dataset.sp];
        spEl.classList.add('re-pulse');
        setTimeout(() => spEl.classList.remove('re-pulse'), 900);
        triggerBubbles(sx, sy, 7);
        addPearls(2);
        if (sp) toast(`🪸 ${sp.name} เรืองแสง! (+2 ไข่มุก)`);
        return;
      }
      triggerBubbles(sx, sy, 6);
    });

    const syncReefExpanded = (count, isPv, dispSec, realSec) => {
      const expEnabled = draftOn('reefTankExpand');
      const expBtn = $('#reefExpBtn', reefHost);
      if (expBtn) expBtn.hidden = !expEnabled;
      if (!expEnabled) reefExpOpen = false;
      const dock = $('#reefDock', reefHost);
      dock.classList.toggle('is-expanded', expEnabled && reefExpOpen);
      if (expBtn) {
        expBtn.textContent = reefExpOpen ? '⤡' : '⤢';
        expBtn.title = reefExpOpen ? 'ย่อกลับขนาดเดิม' : 'ขยายปราสาทใต้น้ำด้านข้าง';
      }
      const miniSvg = $('#reefMiniSvg', reefHost);
      const expSvg = $('#reefExpSvg', reefHost);
      const isExp = !!(expEnabled && reefExpOpen);
      if (miniSvg) { miniSvg.style.display = isExp ? 'none' : 'block'; miniSvg.toggleAttribute('hidden', isExp); }
      if (expSvg) { expSvg.style.display = isExp ? 'block' : 'none'; expSvg.toggleAttribute('hidden', !isExp); }
      $('#reefNextCard', reefHost).hidden = isExp;
      $('#reefExpPanel', reefHost).hidden = !isExp;
      $('#reefExpGlow', reefHost).hidden = !isExp;
      $('#reefExpPearl', reefHost).hidden = !isExp;
      if (!expEnabled) return;
      for (let i = 0; i < REEF_SPECIES.length; i++) {
        const g = $(`#reSp${i}`, reefHost);
        if (g) g.classList.toggle('on', i < count);
      }
      const coll = $('#reefExpColl', reefHost);
      if (coll) {
        if (count === 0) {
          coll.innerHTML = `<span class="reef-coll-empty">อ่านครบ 30 น. แรกเพื่อปลดล็อก <b>${esc(REEF_SPECIES[0].short)}</b> (ระหว่างนี้กดให้อาหารปลาเล่นได้เลย!)</span>`;
        } else {
          coll.innerHTML = REEF_SPECIES.slice(0, count).map(sp => `<span class="reef-coll-chip" title="${esc(sp.name)}"><svg viewBox="0 0 32 32" aria-hidden="true">${sp.ic}</svg><span>${esc(sp.short)}</span></span>`).join('')
            + (count < REEF_SPECIES.length ? `<span class="reef-coll-next">ถัดไป: ${esc(REEF_SPECIES[count].short)}</span>` : '<span class="reef-coll-next done">✨ ครบ 16/16!</span>');
        }
      }
    };
    $('#reefExpBtn', reefHost).onclick = () => {
      if (!draftOn('reefTankExpand')) return;
      reefExpOpen = !reefExpOpen;
      syncReef(false);
    };

    const syncReef = (announce) => {
      const enabled = draftOn('underwaterReefTimer');
      reefHost.hidden = !enabled;
      const customRow = $('#pmCustomRow', wrap);
      if (customRow) customRow.hidden = !enabled;
      if (!enabled) { document.body.classList.remove('reef-open'); return; }
      const onHome = !location.hash.replace(/^#\/?/, '').split('?')[0];
      const collapsed = (onHome && reefAutoHideOnHome) ? true : (S.reefHidden != null ? !!S.reefHidden : window.innerWidth < 1240);
      if (collapsed) reefExpOpen = false;
      $('#reefDock', reefHost).hidden = collapsed;
      $('#reefTab', reefHost).hidden = !collapsed;
      document.body.classList.toggle('reef-open', !collapsed);
      const isPv = reefPreviewMin != null;
      const realSec = getTodaySec();
      const dispSec = isPv ? reefPreviewMin * 60 : realSec;
      const mins = Math.floor(dispSec / 60);
      const count = Math.min(REEF_SPECIES.length, Math.floor(mins / 30));
      const inStep = mins % 30;
      const stepPct = ((dispSec % 1800) / 1800) * 100;
      $('#reefToday', reefHost).textContent = isPv ? `PV ${fmtHM(dispSec)}` : fmtHM(realSec);
      $('#reefTabM', reefHost).textContent = fmtHM(realSec);
      $('#reefCount', reefHost).textContent = `${count}/${REEF_SPECIES.length}`;
      const pvBtn = $('#reefPvToggle', reefHost);
      if (pvBtn) pvBtn.classList.toggle('on', isPv);
      const pvBar = $('#reefPvBar', reefHost);
      if (pvBar) {
        pvBar.hidden = !isPv;
        $('#rfPvLbl', reefHost).textContent = fmtHM(dispSec);
      }
      for (let i = 0; i < REEF_SPECIES.length; i++) {
        const g = $(`#rfSp${i}`, reefHost);
        if (g) g.classList.toggle('on', i < count);
      }
      const icEl = $('#reefNextIc', reefHost);
      if (count >= REEF_SPECIES.length) {
        const last = REEF_SPECIES[REEF_SPECIES.length - 1];
        if (icEl) icEl.innerHTML = `<svg viewBox="0 0 32 32" aria-hidden="true">${last.ic}</svg>`;
        $('#reefNext', reefHost).textContent = 'ครบ 16/16!';
        $('#reefPbar', reefHost).style.width = '100%';
        $('#reefPtxt', reefHost).textContent = '8 ชม.';
      } else {
        const nxt = REEF_SPECIES[count];
        if (icEl) icEl.innerHTML = `<svg viewBox="0 0 32 32" aria-hidden="true">${nxt.ic}</svg>`;
        $('#reefNext', reefHost).textContent = nxt.short;
        $('#reefPbar', reefHost).style.width = `${stepPct.toFixed(1)}%`;
        $('#reefPtxt', reefHost).textContent = `${inStep}/30 น.`;
      }
      const realCount = Math.min(REEF_SPECIES.length, Math.floor(realSec / 1800));
      if (announce && realCount > lastUnlocked) {
        const sp = REEF_SPECIES[realCount - 1];
        if (sp) toast(`🪸 ปลดล็อกปราสาทใต้น้ำใหม่: ${sp.name}!`);
      }
      lastUnlocked = realCount;
      syncReefExpanded(count, isPv, dispSec, realSec);
    };
    $('#reefHide', reefHost).onclick = () => { S.reefHidden = true; reefExpOpen = false; save(); syncReef(false); };
    $('#reefTab', reefHost).onclick = () => { reefAutoHideOnHome = false; S.reefHidden = false; save(); syncReef(false); };
    $('#reefPvToggle', reefHost).onclick = () => { reefPreviewMin = reefPreviewMin == null ? 480 : null; syncReef(false); };
    $('#rfPvPrev', reefHost).onclick = () => { reefPreviewMin = Math.max(0, (reefPreviewMin || 0) - 30); syncReef(false); };
    $('#rfPvNext', reefHost).onclick = () => { reefPreviewMin = Math.min(480, (reefPreviewMin || 0) + 30); syncReef(false); };
    window.addEventListener('hashchange', () => {
      const h = location.hash.replace(/^#\/?/, '').split('?')[0];
      if (!h) { reefExpOpen = false; reefAutoHideOnHome = true; }
      syncReef(false);
    });

    const updatePomoTitle = () => {
      const m = Math.max(1, Math.round(total / 60));
      $('#pmTitle', wrap).textContent = isBreak ? `☕ พักเบรก · ${m} นาที` : `🍅 โฟกัส · ${m} นาที`;
      const inp = $('#pmCustomIn', wrap); if (inp && !isBreak) inp.value = m;
      wrap.querySelectorAll('[data-pm]').forEach(x => x.classList.toggle('on', (+x.dataset.pm === m && (m === 5) === isBreak)));
    };
    const persistPomo = (running, doSave = true) => {
      S.pomoRun = { total, left, running: !!running, isBreak: !!isBreak, lastTickAt: Date.now(), updatedAt: Date.now() };
      if (doSave) save();
    };
    const startTicker = () => {
      clearInterval(tmr);
      $('#pmGo', wrap).textContent = '⏸ พักชั่วคราว';
      persistPomo(true, true);
      tmr = setInterval(() => {
        if (left > 0) {
          left--;
          if (!isBreak) {
            S.pomoLog = S.pomoLog || {};
            const d = localDay();
            S.pomoLog[d] = (S.pomoLog[d] || 0) + 1;
            syncReef(true);
          }
          persistPomo(true, (++saveTick % 10 === 0));
          sync();
        } else {
          clearInterval(tmr); tmr = null;
          persistPomo(false, true);
          $('#pmGo', wrap).textContent = '✨ ครบเวลาแล้ว!'; chime();
          toast('✨ Ida ถึงยอดปราสาทแล้ว! ครบเวลาอ่าน');
          syncReef(true);
        }
      }, 1000);
    };
    let lastRestoredAt = 0;
    const restorePomo = () => {
      const r = S.pomoRun;
      if (!r || !r.total || (r.updatedAt && r.updatedAt === lastRestoredAt)) return;
      lastRestoredAt = r.updatedAt || Date.now();
      clearInterval(tmr); tmr = null;
      total = Math.max(60, +r.total || 25 * 60);
      left = Math.max(0, Math.min(total, +r.left || 0));
      isBreak = !!r.isBreak;
      if (r.running && left > 0) {
        const el = Math.max(0, Math.floor((Date.now() - (r.lastTickAt || Date.now())) / 1000));
        const used = Math.min(left, el);
        if (used > 0) {
          left -= used;
          if (!isBreak) {
            S.pomoLog = S.pomoLog || {};
            const d = localDay();
            S.pomoLog[d] = (S.pomoLog[d] || 0) + used;
          }
        }
        updatePomoTitle();
        if (left > 0) { startTicker(); }
        else { persistPomo(false, true); $('#pmGo', wrap).textContent = '✨ ครบเวลาแล้ว!'; syncReef(false); }
      } else {
        updatePomoTitle();
        $('#pmGo', wrap).textContent = left < total && left > 0 ? '▶ เริ่มต่อ' : '▶ เริ่มจับเวลา';
      }
      sync();
    };
    window.addEventListener('beforeunload', () => { if (tmr) persistPomo(true, true); });

    const applyCustomMins = () => {
      const inp = $('#pmCustomIn', wrap);
      const m = Math.max(1, Math.min(240, parseInt(inp.value, 10) || 25));
      inp.value = m;
      clearInterval(tmr); tmr = null; isBreak = false;
      total = left = m * 60;
      updatePomoTitle();
      $('#pmGo', wrap).textContent = '▶ เริ่มจับเวลา';
      persistPomo(false, true);
      sync();
    };
    $('#pmCustomSet', wrap).onclick = applyCustomMins;
    $('#pmCustomIn', wrap).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyCustomMins(); } });
    const renderMini = () => {
      const btn = $('#pmMini', wrap);
      const useMaze = draftOn('pomoMiniCastle');
      btn.classList.toggle('pomo-mini-maze', useMaze);
      if (useMaze) {
        btn.innerHTML = `<div class="pm-mini-stage">${castleSvg('pmM', '38 30 204 220')}</div>
          <div class="pm-mini-bar"><span class="pm-t" id="pmMiniT">25:00</span><span class="pm-mini-prog"><i id="pmMiniBar"></i></span></div>`;
      } else {
        btn.innerHTML = `<svg viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r="24" fill="none" stroke="rgba(168,213,203,.24)" stroke-width="4.5"/>
            <circle cx="32" cy="32" r="24" fill="none" stroke="rgba(124,224,211,.35)" stroke-width="1" stroke-dasharray="3 4"/>
            <circle id="pmArc" cx="32" cy="32" r="24" fill="none" stroke="#4cf2f2" stroke-width="3.2" stroke-linecap="round" stroke-dasharray="150.8" stroke-dashoffset="150.8" transform="rotate(-90 32 32)"/>
            <polygon points="32,5 34.5,8 32,11 29.5,8" fill="#ff7c6e" stroke="#fff" stroke-width=".5"/>
            <g id="pmMiniIda" transform="rotate(0 32 32)">
              <g transform="translate(32,8)">
                <polygon points="0,-5 -2.6,1.5 2.6,1.5" fill="#fff"/>
                <circle cx="0" cy="-6" r="1.4" fill="#1e293b"/>
                <polygon points="0,-11.5 -2,-6 2,-6" fill="#fff"/>
              </g>
            </g>
          </svg>
          <span class="pm-t" id="pmMiniT">25:00</span>`;
      }
    };
    const syncCastle = (pref, x, y, p, tilt) => {
      const ida = $(`#${pref}Ida`, wrap); if (ida) ida.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
      for (let k = 0; k < 6; k++) { const el = $(`#${pref}T${k}`, wrap); if (el) el.setAttribute('opacity', p >= (k + 1) * 0.11 ? '.95' : '.28'); }
      const br = $(`#${pref}Bridge`, wrap); if (br) br.style.transform = `rotate(${spin + tilt}deg)`;
      const cr = $(`#${pref}Cry`, wrap); if (cr) cr.setAttribute('transform', p >= 1 ? 'translate(0,-4) scale(1.15)' : 'translate(0,0)');
    };
    const sync = () => {
      const p = Math.max(0, Math.min(1, 1 - left / total));
      const sc = p * (PATH.length - 1), i = Math.min(PATH.length - 2, Math.floor(sc)), t = sc - i;
      const a = PATH[i], b = PATH[i + 1];
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      const tilt = p > 0.35 && p < 0.78 ? -6 : 0;
      syncCastle('pm', x, y, p, tilt);
      syncCastle('pmM', x, y, p, tilt);
      const ts = fmt(left);
      $('#pmTime', wrap).textContent = ts;
      const mt = $('#pmMiniT', wrap); if (mt) mt.textContent = ts;
      $('#pmStat', wrap).textContent = p === 0 && !tmr ? 'พร้อมออกเดินทาง' : (p >= 1 ? PATH[PATH.length - 1].msg : a.msg);
      const arc = $('#pmArc', wrap); if (arc) arc.setAttribute('stroke-dashoffset', (150.8 * (1 - p)).toFixed(1));
      const mi = $('#pmMiniIda', wrap); if (mi) mi.setAttribute('transform', `rotate(${(p * 360).toFixed(1)} 32 32)`);
      const mb = $('#pmMiniBar', wrap); if (mb) mb.style.width = `${(p * 100).toFixed(1)}%`;
    };
    renderMini();
    restorePomo();
    syncReef(false);
    _onOwnerChange.push(() => { renderMini(); restorePomo(); sync(); syncReef(false); });
    const setOpen = v => { open = v; $('#pmMini', wrap).hidden = v; $('#pmCard', wrap).hidden = !v; };
    const doSpin = () => { spin = spin === 0 ? 12 : spin === 12 ? -12 : 0; sync(); };
    $('#pmMini', wrap).onclick = () => setOpen(true);
    $('#pmHide', wrap).onclick = () => setOpen(false);
    $('#pmSpin', wrap).onclick = e => { e.stopPropagation(); doSpin(); };
    $('#pmStage', wrap).onclick = doSpin;
    wrap.querySelectorAll('[data-pm]').forEach(b => b.onclick = () => {
      clearInterval(tmr); tmr = null;
      const m = +b.dataset.pm; total = left = m * 60; isBreak = m === 5;
      updatePomoTitle();
      $('#pmGo', wrap).textContent = '▶ เริ่มจับเวลา';
      persistPomo(false, true);
      sync();
    });
    $('#pmGo', wrap).onclick = () => {
      if (tmr) { clearInterval(tmr); tmr = null; persistPomo(false, true); $('#pmGo', wrap).textContent = '▶ เริ่มต่อ'; return; }
      if (left <= 0) left = total;
      startTicker();
    };
    $('#pmReset', wrap).onclick = () => { clearInterval(tmr); tmr = null; left = total; persistPomo(false, true); $('#pmGo', wrap).textContent = '▶ เริ่มจับเวลา'; sync(); };
    sync();
  }
  initPomodoro();

  /* 🫀 Floating Human Anatomy Infographic with Glowing Organs (anatomySidebarInfographic) */
  let _anatCur = null, _anatMode = null;
  const anatHost = document.createElement('aside');
  anatHost.className = 'anat-host';
  anatHost.id = 'anatHost';
  anatHost.hidden = true;
  anatHost.setAttribute('aria-label', 'Infographic หุ่น Anatomy เรืองแสงตามบท');
  anatHost.innerHTML = `<button type="button" class="anat-tab anat-mini-ida" id="anatTab" title="ขยายน้อง Ida Anatomy" hidden>
      <svg viewBox="0 0 44 68" aria-hidden="true">
        <polygon points="22,60 36,65 22,68 8,65" fill="#5eead4" opacity=".28"/>
        <line x1="19" y1="48" x2="19" y2="61" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round"/>
        <line x1="25" y1="48" x2="25" y2="61" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/>
        <polygon points="22,19 36,50 8,50" fill="#e6faf7"/>
        <polygon points="22,19 36,50 22,50" fill="#5eead4" opacity=".42"/>
        <polygon points="22,25 30,37 22,48 14,37" fill="#0b1f36" stroke="#5eead4" stroke-width=".9"/>
        <circle cx="22" cy="36" r="3" fill="#5eead4"/>
        <circle cx="22" cy="15" r="5.2" fill="#f8fafc"/>
        <polygon points="22,2 27,12 17,12" fill="#5eead4"/>
      </svg>
      <span class="anat-mini-lbl">Ida ⤢</span>
    </button>
    <div class="anat-dock" id="anatDock">
      <button type="button" class="anat-hide" id="anatHide" title="ย่อเป็นน้อง Ida ตัวเล็ก">–</button>
      <div class="anat-stage" id="anatStage"></div>
      <div class="anat-pill"><span class="anat-sys" id="anatSys">Anatomy</span> · <span class="anat-ft" id="anatFt">กำลังอ่าน</span></div>
    </div>`;
  document.body.appendChild(anatHost);

  const IDA_DEFS = `<defs>
    <linearGradient id="mvIdaL" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f0fdfa" stop-opacity=".95"/><stop offset="100%" stop-color="#99f6e4" stop-opacity=".86"/></linearGradient>
    <linearGradient id="mvIdaR" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#5eead4" stop-opacity=".5"/><stop offset="100%" stop-color="#1e5c70" stop-opacity=".55"/></linearGradient>
    <linearGradient id="mvHat" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#99f6e4"/><stop offset="100%" stop-color="#2dd4bf"/></linearGradient>
    <linearGradient id="mvWin" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b1f36" stop-opacity=".9"/><stop offset="100%" stop-color="#061224" stop-opacity=".94"/></linearGradient>
    <filter id="anDrop" x="-25%" y="-15%" width="150%" height="130%"><feDropShadow dx="0" dy="7" stdDeviation="5" flood-color="#020617" flood-opacity=".38"/></filter>
  </defs>`;
  const IDA_WINKS = `<g class="anat-winks" aria-hidden="true">
    <path class="an-wink" d="M38 46 l1.5 4.2 l4.2 1.5 l-4.2 1.5 l-1.5 4.2 l-1.5-4.2 l-4.2-1.5 l4.2-1.5 Z" fill="#fde047"/>
    <path class="an-wink" d="M168 62 l1.4 3.8 l3.8 1.4 l-3.8 1.4 l-1.4 3.8 l-1.4-3.8 l-3.8-1.4 l3.8-1.4 Z" fill="#5eead4" style="animation-delay:2.2s"/>
    <path class="an-wink" d="M174 188 l1.4 3.8 l3.8 1.4 l-3.8 1.4 l-1.4 3.8 l-1.4-3.8 l-3.8-1.4 l3.8-1.4 Z" fill="#a5f3fc" style="animation-delay:4.3s"/>
  </g>`;

  function idaTopShell(innerOrgans, opts = {}) {
    const bigHead = !!opts.bigHead;
    const headR = bigHead ? 24 : 15;
    const headCy = bigHead ? 54 : 40;
    const hatPts = bigHead ? '105,6 122,33 88,33' : '105,6 118,30 92,30';
    const cloakTop = bigHead ? 74 : 54;
    const winTop = bigHead ? 86 : 68;
    const winMid = bigHead ? 136 : 126;
    return `
      <polygon class="anat-shadow" points="105,212 142,223 105,233 68,223" fill="#5eead4" opacity=".22"/>
      <polygon class="anat-ring" points="105,216 130,223 105,230 80,223" fill="#1e1b4b" opacity=".5" stroke="#5eead4" stroke-opacity=".4" stroke-width=".9"/>
      <g class="anat-body" filter="url(#anDrop)">
        <line x1="97" y1="184" x2="97" y2="215" stroke="#cbd5e1" stroke-width="3.6" stroke-linecap="round"/>
        <line x1="113" y1="184" x2="113" y2="215" stroke="#94a3b8" stroke-width="3.6" stroke-linecap="round"/>
        <g class="an-org" data-org="skin" data-name="ผิวหนัง (Skin)">
          <polygon points="105,${cloakTop} 146,188 64,188" fill="url(#mvIdaL)"/>
          <polygon points="105,${cloakTop} 146,188 105,188" fill="url(#mvIdaR)"/>
          <circle cx="105" cy="${headCy}" r="${headR}" fill="#f8fafc" stroke="#99f6e4" stroke-opacity=".6" stroke-width="1.1"/>
          <polygon points="${hatPts}" fill="url(#mvHat)"/>
          <polygon points="${hatPts.split(' ')[0]} ${hatPts.split(' ')[1]} 105,${bigHead ? 33 : 30}" fill="#0f766e" opacity=".32"/>
        </g>
        <polygon points="105,${winTop} 135,${winMid} 105,182 75,${winMid}" fill="url(#mvWin)" stroke="#5eead4" stroke-opacity=".6" stroke-width="1.2"/>
        ${innerOrgans}
      </g>`;
  }

  function anatModeFor(chId) {
    if (chId === 'b3') return 'neuro';
    if (chId === 'b4') return 'derm';
    if (chId === 'b5' || chId === 'kt-msk') return 'msk';
    if (chId === 'b6' || chId === 'kt-rs') return 'rs';
    if (chId === 'b7') return 'heart';
    if (chId === 'b9') return 'renal';
    if (chId === 'kt-parasit') return 'parasit';
    return 'default';
  }

  function idaStageSVG(mode) {
    if (mode === 'neuro') {
      const inner = `
        <g class="an-org" data-org="brain" data-name="สมอง & ไขสันหลัง (CNS)">
          <path d="M86 52 C84 36 95 31 105 33 C115 31 126 36 124 52 C125 63 117 69 109 67 L101 67 C93 69 85 63 86 52 Z" fill="#fda4af" stroke="#831843" stroke-width=".9"/>
          <path d="M105 33 v33 M91 44 Q98 38 104 45 M106 45 Q112 38 119 44 M89 53 Q97 59 104 52 M106 52 Q113 59 121 53" fill="none" stroke="#831843" stroke-width="1.15" stroke-linecap="round"/>
          <path d="M102 66 L108 66 L107 84 L103 84 Z" fill="#fbcfe8"/>
          <line x1="105" y1="84" x2="105" y2="170" stroke="#c084fc" stroke-width="2.6" stroke-linecap="round"/>
          <path d="M105 108 L90 116 M105 108 L120 116 M105 128 L88 138 M105 128 L122 138 M105 148 L92 156 M105 148 L118 156" stroke="#e9d5ff" stroke-width="1.15" opacity=".88"/>
        </g>
        <g class="an-org an-eye-only" data-org="eye" data-name="ตา & เส้นประสาทตา (CN II/III)">
          <ellipse cx="96" cy="58" rx="3.4" ry="2.2" fill="#38bdf8"/>
          <ellipse cx="114" cy="58" rx="3.4" ry="2.2" fill="#38bdf8"/>
        </g>`;
      return `<svg viewBox="0 0 210 374" aria-hidden="true">${IDA_DEFS}${IDA_WINKS}${idaTopShell(inner, { bigHead: true })}
        <!-- 🧠 สมอง 2 มุมด้านล่างคู่กัน: ซ้าย Lateral 4 Lobes / ขวา Mid-Sagittal Arbor Vitae -->
        <g transform="translate(0,296)">
          <g class="an-org an-sub" data-org="brain" data-name="สมองมุมข้าง (Lateral · 4 Lobes)" transform="translate(52,0) scale(1.06)">
            <path d="M-38 4 C-40 -18 -20 -28 0 -27 L0 0 Q-20 4 -38 4 Z" fill="#fda4af" stroke="#4c1d95" stroke-width=".9"/>
            <path d="M0 -27 C18 -27 32 -18 36 -4 L16 2 L0 0 Z" fill="#d8b4fe" stroke="#4c1d95" stroke-width=".9"/>
            <path d="M36 -4 C40 6 36 16 24 18 L12 8 L16 2 Z" fill="#bef264" stroke="#4c1d95" stroke-width=".9"/>
            <path d="M-24 6 Q-4 -4 18 4 L14 17 Q-8 20 -24 6 Z" fill="#fcd34d" stroke="#4c1d95" stroke-width=".9"/>
            <path d="M-30 -6 Q-18 -14 -8 -6 M-24 -16 Q-12 -22 -2 -14 M8 -18 Q18 -12 26 -16 M6 -6 Q16 -2 28 -8 M-14 10 Q0 6 12 12" fill="none" stroke="#581c87" stroke-width="1" stroke-linecap="round" opacity=".68"/>
            <ellipse cx="18" cy="22" rx="12" ry="7.5" fill="#fb7185" stroke="#881337" stroke-width=".9"/>
            <path d="M10 21 Q18 18 26 21 M11 24 Q18 22 25 24" fill="none" stroke="#881337" stroke-width=".8"/>
            <path d="M1 16 L8 16 L7 32 L2 32 Z" fill="#fbcfe8" stroke="#831843" stroke-width=".8"/>
            <text x="0" y="48" text-anchor="middle" fill="#e9d5ff" font-size="8.5" font-weight="700">Lateral · 4 Lobes</text>
          </g>
          <g class="an-org an-sub" data-org="brain" data-name="สมองผ่ากลาง (Mid-Sagittal · Arbor Vitae)" transform="translate(156,0) scale(1.02)">
            <path d="M-40 6 C-42 -18 -22 -29 0 -28 L-4 -8 Q-24 -6 -40 6 Z" fill="#fda4af" stroke="#701a75" stroke-width=".9"/>
            <path d="M0 -28 C18 -27 33 -18 38 -2 L20 2 L-4 -8 Z" fill="#d8b4fe" stroke="#701a75" stroke-width=".9"/>
            <path d="M38 -2 C43 8 37 18 24 18 L14 6 L20 2 Z" fill="#bef264" stroke="#701a75" stroke-width=".9"/>
            <path d="M-25 2 C-23 -15 10 -17 20 -2 L12 4 C4 -8 -14 -8 -18 4 Z" fill="#fdba74" opacity=".9"/>
            <path d="M-18 2 C-16 -10 8 -11 16 1 C14 5 8 4 4 0 C-2 -3 -10 -2 -12 5 Z" fill="#fce7f3" stroke="#9d174d" stroke-width=".9"/>
            <ellipse cx="2" cy="7" rx="9" ry="6" fill="#f472b6" stroke="#831843" stroke-width=".8"/>
            <circle cx="-4" cy="14" r="2.8" fill="#fde047"/>
            <circle cx="-10" cy="8" r="2.4" fill="#6366f1"/>
            <path d="M-2 13 C-8 18 -6 26 0 30 L5 42 L10 41 L7 25 L6 13 Z" fill="#fbcfe8" stroke="#831843" stroke-width=".9"/>
            <ellipse cx="22" cy="23" rx="13" ry="10.5" fill="#fb7185" stroke="#881337" stroke-width=".9"/>
            <path d="M12 23 L24 19 M16 22 L26 25 M19 21 L28 16 M18 24 L26 29 M12 23 L20 14" fill="none" stroke="#fff1f2" stroke-width="1.15" stroke-linecap="round"/>
            <text x="0" y="50" text-anchor="middle" fill="#e9d5ff" font-size="8.5" font-weight="700">Mid-Sagittal</text>
          </g>
        </g>
      </svg>`;
    }
    if (mode === 'derm') {
      const inner = `
        <g class="an-org an-eye-only" data-org="eye" data-name="ตา & เส้นประสาทตา (Eyes)">
          <ellipse cx="99" cy="41" rx="3" ry="2" fill="#38bdf8"/>
          <ellipse cx="111" cy="41" rx="3" ry="2" fill="#38bdf8"/>
        </g>
        <g class="an-org" data-org="skin" data-name="ชั้นผิวหนัง (Skin Barrier)" opacity=".7">
          <path d="M105 76 L128 126 L105 174 L82 126 Z" fill="none" stroke="#5eead4" stroke-width="1.6" stroke-dasharray="3 3"/>
        </g>`;
      return `<svg viewBox="0 0 210 374" aria-hidden="true">${IDA_DEFS}${IDA_WINKS}${idaTopShell(inner)}
        <!-- 🧴👁️ B4 ด้านล่างคู่กัน: ซ้าย ผิวหนังตัดขวาง / ขวา ลูกตาตัดขวาง -->
        <g transform="translate(0,298)">
          <!-- ซ้าย: Skin Cross-Section (Epidermis · Dermis · Subcutis + Hair + Sweat gland) -->
          <g class="an-org an-sub" data-org="skin" data-name="ผิวหนังตัดขวาง (Epidermis · Dermis · Subcutis)" transform="translate(52,0)">
            <rect x="-40" y="-28" width="80" height="14" rx="4" fill="#fdba74" stroke="#9a3412" stroke-width=".9"/>
            <path d="M-40 -14 Q-30 -10 -20 -14 Q-10 -10 0 -14 Q10 -10 20 -14 Q30 -10 40 -14 L40 14 L-40 14 Z" fill="#fda4af" stroke="#9f1239" stroke-width=".9"/>
            <rect x="-40" y="14" width="80" height="20" rx="4" fill="#fde047" stroke="#a16207" stroke-width=".9"/>
            <!-- Adipose lobules -->
            <g fill="#fef08a" stroke="#ca8a04" stroke-width=".6">
              <circle cx="-28" cy="24" r="5"/><circle cx="-14" cy="24" r="5"/><circle cx="0" cy="24" r="5"/><circle cx="14" cy="24" r="5"/><circle cx="28" cy="24" r="5"/>
            </g>
            <!-- Hair shaft + follicle + sebaceous gland -->
            <path d="M-8 -44 Q-4 -26 -10 10" fill="none" stroke="#451a03" stroke-width="3.2" stroke-linecap="round"/>
            <ellipse cx="-10" cy="10" rx="5.5" ry="7" fill="#78350f"/>
            <ellipse cx="-2" cy="-2" rx="5" ry="3.5" fill="#fef08a" stroke="#a16207" stroke-width=".7"/>
            <!-- Sweat gland coil -->
            <path d="M22 -28 Q20 -12 22 4 Q16 8 24 10 Q18 13 25 12" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round"/>
            <!-- Dermal capillaries -->
            <path d="M-32 10 Q-26 -4 -20 10" fill="none" stroke="#ef4444" stroke-width="1.3"/>
            <path d="M4 10 Q10 -2 15 10" fill="none" stroke="#3b82f6" stroke-width="1.3"/>
            <text x="0" y="49" text-anchor="middle" fill="#fed7aa" font-size="8.5" font-weight="700">Skin Layers</text>
          </g>
          <!-- ขวา: Eye Cross-Section (Cornea · Iris · Lens · Retina · Optic Nerve) -->
          <g class="an-org an-sub" data-org="eye" data-name="ลูกตาตัดขวาง (Cornea · Lens · Retina · Optic N.)" transform="translate(156,2)">
            <!-- Optic nerve exiting right -->
            <path d="M26 -6 L44 -9 L44 5 L26 6 Z" fill="#fde047" stroke="#a16207" stroke-width=".9"/>
            <!-- Sclera outer globe -->
            <circle cx="0" cy="0" r="30" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.4"/>
            <!-- Retina inner arc (ส้มทอง) -->
            <path d="M-10 -25 A26 26 0 1 1 -10 25" fill="#38bdf8" fill-opacity=".22" stroke="#f97316" stroke-width="2.6"/>
            <!-- Cornea dome (ซ้าย) -->
            <path d="M-24 -16 C-38 -10 -38 10 -24 16" fill="#bae6fd" fill-opacity=".55" stroke="#38bdf8" stroke-width="1.8"/>
            <!-- Iris & Pupil -->
            <line x1="-22" y1="-15" x2="-22" y2="-5" stroke="#14b8a6" stroke-width="3.4" stroke-linecap="round"/>
            <line x1="-22" y1="5" x2="-22" y2="15" stroke="#14b8a6" stroke-width="3.4" stroke-linecap="round"/>
            <!-- Crystalline Lens -->
            <ellipse cx="-14" cy="0" rx="5.5" ry="11" fill="#e0f2fe" stroke="#38bdf8" stroke-width="1.2"/>
            <!-- Retinal vessels -->
            <path d="M28 -2 Q14 -12 4 -18 M28 0 Q14 12 4 18" fill="none" stroke="#ef4444" stroke-width="1.1" opacity=".8"/>
            <text x="4" y="47" text-anchor="middle" fill="#bae6fd" font-size="8.5" font-weight="700">Eye Anatomy</text>
          </g>
        </g>
      </svg>`;
    }
    if (mode === 'msk') {
      return `<svg viewBox="0 0 180 350" aria-hidden="true">${IDA_DEFS}
        <polygon class="anat-shadow" points="90,316 136,332 90,346 44,332" fill="#5eead4" opacity=".22"/>
        <polygon class="anat-ring" points="90,321 122,332 90,342 58,332" fill="#1e1b4b" opacity=".52" stroke="#5eead4" stroke-opacity=".42" stroke-width="1"/>
        <g class="anat-winks" aria-hidden="true">
          <path class="an-wink" d="M36 46 l1.5 4.2 l4.2 1.5 l-4.2 1.5 l-1.5 4.2 l-1.5-4.2 l-4.2-1.5 l4.2-1.5 Z" fill="#fde047"/>
          <path class="an-wink" d="M144 66 l1.4 3.8 l3.8 1.4 l-3.8 1.4 l-1.4 3.8 l-1.4-3.8 l-3.8-1.4 l3.8-1.4 Z" fill="#5eead4" style="animation-delay:2.2s"/>
          <path class="an-wink" d="M150 202 l1.4 3.8 l3.8 1.4 l-3.8 1.4 l-1.4 3.8 l-1.4-3.8 l-3.8-1.4 l3.8-1.4 Z" fill="#a5f3fc" style="animation-delay:4.3s"/>
        </g>
        <g class="anat-body" filter="url(#anDrop)">
          <line x1="81" y1="268" x2="81" y2="312" stroke="#94a3b8" stroke-width="4" stroke-linecap="round" opacity=".48"/>
          <line x1="99" y1="268" x2="99" y2="312" stroke="#94a3b8" stroke-width="4" stroke-linecap="round" opacity=".48"/>
          <g class="an-org" data-org="skin" data-name="ผิวหนัง (Skin)">
            <polygon points="90,76 146,272 34,272" fill="url(#mvIdaL)" opacity=".88"/>
            <polygon points="90,76 146,272 90,272" fill="url(#mvIdaR)"/>
            <circle cx="90" cy="58" r="20" fill="#f8fafc" stroke="#99f6e4" stroke-opacity=".55" stroke-width="1"/>
            <polygon points="90,6 108,42 72,42" fill="url(#mvHat)"/>
            <polygon points="90,6 108,42 90,42" fill="#0f766e" opacity=".32"/>
          </g>
          <polygon points="90,92 135,176 90,262 45,176" fill="url(#mvWin)" stroke="#5eead4" stroke-opacity=".62" stroke-width="1.4"/>
          <!-- อวัยวะจาง ๆ ด้านหลังให้เห็นตำแหน่ง -->
          <path d="M94 134 C93 128 83 129 84 138 C85 148 95 156 100 159 C105 155 110 146 108 137 C106 130 97 130 94 134 Z" fill="#ef4444" opacity=".18"/>
          <!-- 🦴 โครงกระดูกละเอียดเรืองแสง (Skull · Spine · Clavicle · Sternum · 6 Ribs · Pelvis · Left Arm · Left Leg) -->
          <g class="an-org" data-org="msk" data-name="โครงกระดูก & กล้ามเนื้อ (Skeleton · MSK)" stroke="#f8fafc" stroke-linecap="round" fill="none">
            <circle cx="90" cy="56" r="13" stroke="#e2e8f0" stroke-width="1.8"/>
            <path d="M84 56 h4 M92 56 h4 M87 63 h6" stroke="#94a3b8" stroke-width="1.4"/>
            <path d="M90 74 v124" stroke="#cbd5e1" stroke-width="2.2" stroke-dasharray="5 3"/>
            <path d="M58 106 Q74 99 90 104 Q106 99 122 106" stroke-width="2.8"/>
            <path d="M90 105 v38" stroke="#fff" stroke-width="4.2"/>
            <path d="M68 112 Q90 119 112 112 M63 120 Q90 128 117 120 M60 128 Q90 137 120 128 M60 137 Q90 146 120 137 M63 146 Q90 154 117 146 M68 155 Q90 162 112 155" stroke-width="1.8"/>
            <path d="M90 192 C74 190 64 200 66 214 C72 222 84 218 90 210 C96 218 108 222 114 214 C116 200 106 190 90 192 Z" stroke-width="2.2" fill="rgba(248,250,252,.14)"/>
            <!-- แขนซ้าย -->
            <circle cx="56" cy="109" r="3.8" fill="#fff" stroke="none"/><line x1="55" y1="113" x2="43" y2="154" stroke-width="3.4"/>
            <circle cx="42" cy="157" r="3" fill="#cbd5e1" stroke="none"/><line x1="41" y1="160" x2="32" y2="198" stroke-width="2.2"/><line x1="44" y1="160" x2="37" y2="198" stroke="#cbd5e1" stroke-width="1.5"/>
            <circle cx="33" cy="201" r="2.2" fill="#e2e8f0" stroke="none"/>
            <!-- ขาซ้าย -->
            <circle cx="71" cy="215" r="3.8" fill="#fff" stroke="none"/><line x1="72" y1="219" x2="78" y2="266" stroke-width="3.8"/>
            <circle cx="79" cy="269" r="3.6" fill="#e2e8f0" stroke="#64748b" stroke-width=".8"/><line x1="80" y1="273" x2="81" y2="309" stroke-width="3"/><line x1="75" y1="275" x2="77" y2="308" stroke="#cbd5e1" stroke-width="1.5"/>
            <ellipse cx="81" cy="312" rx="4.6" ry="2.2" fill="#e2e8f0" stroke="none"/>
          </g>
        </g>
      </svg>`;
    }
    if (mode === 'rs') {
      const inner = `
        <g class="an-org" data-org="lungs" data-name="ปอด & ทางเดินหายใจ (Lungs · RS)">
          <line x1="105" y1="80" x2="105" y2="106" stroke="#bae6fd" stroke-width="3.2"/>
          <path d="M102.5 86 h5 M102.5 91 h5 M102.5 96 h5" stroke="#0284c7" stroke-width=".9"/>
          <path d="M101 100 C89 99 81 112 82 132 C83 140 94 139 101 132 Z" fill="#fb7185" stroke="#fecdd3" stroke-width=".8"/>
          <path d="M109 100 C121 99 129 112 128 132 C127 140 116 139 109 132 Z" fill="#f43f5e" stroke="#fecdd3" stroke-width=".8"/>
        </g>`;
      return `<svg viewBox="0 0 210 374" aria-hidden="true">${IDA_DEFS}${IDA_WINKS}${idaTopShell(inner)}
        <!-- 🫁 B6/RS ด้านล่างคู่กัน: ซ้าย ปอด 3/2 กลีบ + หลอดลม / ขวา ถุงลม Alveoli Gas Exchange -->
        <g transform="translate(0,298)">
          <!-- ซ้าย: Detailed Lungs (Right 3 Lobes / Left 2 Lobes + Carina) -->
          <g class="an-org an-sub" data-org="lungs" data-name="ปอดขวา 3 กลีบ / ซ้าย 2 กลีบ + Carina" transform="translate(52,0)">
            <!-- Trachea + Rings + Carina -->
            <rect x="-4" y="-44" width="8" height="30" rx="3" fill="#bae6fd" stroke="#0284c7" stroke-width=".9"/>
            <path d="M-4 -38 h8 M-4 -32 h8 M-4 -26 h8 M-4 -20 h8" stroke="#0369a1" stroke-width="1"/>
            <path d="M0 -16 L-14 -4 M0 -16 L14 -4" stroke="#bae6fd" stroke-width="4" stroke-linecap="round"/>
            <!-- Right Lung (ซ้ายมือภาพ = 3 Lobes: Horizontal + Oblique fissures) -->
            <path d="M-6 -20 C-26 -22 -38 -2 -36 24 C-34 36 -16 36 -6 26 Z" fill="#fb7185" stroke="#fecdd3" stroke-width="1"/>
            <path d="M-35 2 Q-20 4 -6 0 M-34 18 Q-18 12 -6 4" fill="none" stroke="#881337" stroke-width="1.2" stroke-linecap="round"/>
            <!-- Left Lung (ขวามือภาพ = 2 Lobes + Cardiac notch) -->
            <path d="M6 -20 C26 -22 38 -2 36 24 C34 36 18 36 12 26 C14 18 8 14 6 12 Z" fill="#f43f5e" stroke="#fecdd3" stroke-width="1"/>
            <path d="M35 16 Q20 10 6 0" fill="none" stroke="#881337" stroke-width="1.2" stroke-linecap="round"/>
            <!-- Bronchial tree hints -->
            <path d="M-14 -4 L-22 6 M-14 -4 L-18 16 M14 -4 L22 6 M14 -4 L18 16" stroke="#fde68a" stroke-width="1.3" stroke-linecap="round" opacity=".85"/>
            <text x="0" y="50" text-anchor="middle" fill="#fecdd3" font-size="8.5" font-weight="700">Lungs · 3R / 2L</text>
          </g>
          <!-- ขวา: Alveoli + Capillary Gas Exchange -->
          <g class="an-org an-sub" data-org="lungs" data-name="ถุงลมปอด & แลกเปลี่ยนแก๊ส (Alveoli · O₂/CO₂)" transform="translate(156,0)">
            <!-- Bronchiole stem -->
            <path d="M0 -42 L0 -14 M0 -18 L-14 -4 M0 -18 L14 -4" stroke="#bae6fd" stroke-width="5" stroke-linecap="round"/>
            <!-- Alveolar sacs (พวงองุ่นสีชมพูพาสเทล) -->
            <g fill="#fda4af" stroke="#ffe4e6" stroke-width="1">
              <circle cx="-18" cy="2" r="10"/><circle cx="-6" cy="-4" r="10"/><circle cx="8" cy="-4" r="10"/>
              <circle cx="18" cy="4" r="10"/><circle cx="-16" cy="16" r="10"/><circle cx="0" cy="12" r="11"/>
              <circle cx="16" cy="18" r="10"/><circle cx="-4" cy="26" r="9"/><circle cx="10" cy="26" r="9"/>
            </g>
            <!-- Capillary net (Deoxygenated Blue -> Oxygenated Red) -->
            <path d="M-30 -6 Q-18 4 -10 16 Q-2 26 8 24" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round"/>
            <path d="M8 24 Q18 18 24 6 Q28 -6 32 -14" fill="none" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round"/>
            <path d="M-20 4 Q0 6 16 14" fill="none" stroke="#a855f7" stroke-width="1.5" stroke-dasharray="2 2"/>
            <text x="0" y="50" text-anchor="middle" fill="#bae6fd" font-size="8.5" font-weight="700">Alveoli · O₂/CO₂</text>
          </g>
        </g>
      </svg>`;
    }
    if (mode === 'heart') {
      const inner = `
        <g class="an-org" data-org="heart" data-name="หัวใจ & หลอดเลือด (Heart · CVS)">
          <path d="M106 108 Q106 98 113 100 Q116 103 114 110" fill="none" stroke="#f87171" stroke-width="2.6" stroke-linecap="round"/>
          <line x1="102" y1="101" x2="102" y2="111" stroke="#60a5fa" stroke-width="2.2" stroke-linecap="round"/>
          <path d="M108 110 C107 105 99 106 100 113 C101 120 109 126 113 129 C117 125 121 119 119 112 C118 107 110 107 108 110 Z" fill="#ef4444" stroke="#fecaca" stroke-width=".9"/>
        </g>`;
      return `<svg viewBox="0 0 210 380" aria-hidden="true">${IDA_DEFS}${IDA_WINKS}${idaTopShell(inner)}
        <!-- ❤️ B7 หัวใจ 2 ดวงคู่กันด้านใต้: ซ้าย External / ขวา 4 Chambers + Flow -->
        <g transform="translate(0,296)">
          <g class="an-org an-sub" data-org="heart" data-name="หัวใจผิวนอก & โคโรนารี (External)" transform="translate(52,0) scale(.86)">
            <rect x="-25" y="-56" width="12" height="94" rx="4" fill="#38bdf8"/>
            <path d="M-25 -36 L-36 -40 M-25 -28 L-36 -30" stroke="#38bdf8" stroke-width="5" stroke-linecap="round"/>
            <rect x="6" y="24" width="11" height="24" rx="3" fill="#b91c1c"/>
            <path d="M-4 -14 C-14 -46 18 -54 22 -18" fill="none" stroke="#f87171" stroke-width="14" stroke-linecap="round"/>
            <path d="M-3 -42 L-6 -58 M6 -45 L6 -61 M15 -41 L18 -56" stroke="#f87171" stroke-width="5.5" stroke-linecap="round"/>
            <path d="M-34 -14 L-18 -10 M-34 -6 L-18 -4 M24 -10 L36 -12 M24 -2 L36 -2" stroke="#ef4444" stroke-width="4.5" stroke-linecap="round"/>
            <path d="M4 -8 C4 -28 18 -30 34 -26" fill="none" stroke="#38bdf8" stroke-width="10" stroke-linecap="round"/>
            <path d="M-24 -8 C-30 14 -12 36 16 40 C32 42 40 24 34 2 C28 -16 4 -24 -24 -8 Z" fill="#f87171" stroke="#fecaca" stroke-width="1"/>
            <path d="M-32 -2 C-34 -22 -14 -30 0 -16 C-8 -6 -16 6 -24 6 C-30 6 -32 2 -32 -2 Z" fill="#fde68a"/>
            <path d="M18 -16 C28 -18 36 -8 32 4 C24 0 18 -6 18 -16 Z" fill="#fde68a"/>
            <path d="M12 -8 Q18 10 10 34 M14 6 L26 16 M-10 8 Q-2 18 4 30" fill="none" stroke="#991b1b" stroke-width="1.6" stroke-linecap="round"/>
            <text x="2" y="60" text-anchor="middle" fill="#fecaca" font-size="9.5" font-weight="700">External</text>
          </g>
          <g class="an-org an-sub" data-org="heart" data-name="หัวใจ 4 ห้อง & ทิศทางเลือด (4 Chambers + Flow)" transform="translate(154,0) scale(.86)">
            <rect x="-25" y="-56" width="12" height="94" rx="4" fill="#38bdf8"/>
            <rect x="6" y="24" width="11" height="24" rx="3" fill="#b91c1c"/>
            <path d="M-4 -14 C-14 -46 18 -54 22 -18" fill="none" stroke="#f87171" stroke-width="14" stroke-linecap="round"/>
            <path d="M-3 -42 L-6 -58 M6 -45 L6 -61 M15 -41 L18 -56" stroke="#f87171" stroke-width="5.5" stroke-linecap="round"/>
            <path d="M4 -8 C4 -28 18 -30 34 -26" fill="none" stroke="#38bdf8" stroke-width="10" stroke-linecap="round"/>
            <path d="M-26 -14 C-36 8 -22 36 16 42 C34 44 42 22 36 -2 C30 -22 4 -28 -26 -14 Z" fill="#fecdd3"/>
            <path d="M-22 -10 C-28 6 -16 28 14 34 C16 26 8 10 4 -6 C-4 -14 -16 -16 -22 -10 Z" fill="#0284c7"/>
            <path d="M16 -14 C28 -12 34 8 28 28 C20 26 14 14 14 -6 Z" fill="#991b1b"/>
            <path d="M-12 6 Q-4 2 2 8 M16 2 Q22 -2 28 2" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
            <path d="M-19 -54 L-19 2 Q-12 18 2 14 L8 -20 L32 -26" fill="none" stroke="#0c4a6e" stroke-width="2.2" stroke-linecap="round"/>
            <polygon points="35,-27 28,-30 29,-22" fill="#0c4a6e"/>
            <path d="M22 -4 Q24 14 18 20 Q12 4 6 -34 L6 -56" fill="none" stroke="#dc2626" stroke-width="2.2" stroke-linecap="round"/>
            <polygon points="6,-60 2,-52 10,-52" fill="#dc2626"/>
            <text x="4" y="60" text-anchor="middle" fill="#bae6fd" font-size="9.5" font-weight="700">4 Chambers + Flow</text>
          </g>
        </g>
      </svg>`;
    }
    if (mode === 'renal') {
      const inner = `
        <g class="an-org" data-org="kidneys" data-name="ไต & ต่อมหมวกไต (Kidneys)">
          <ellipse cx="93" cy="134" rx="5.2" ry="8" fill="#e11d48" stroke="#fecdd3" stroke-width=".8"/>
          <ellipse cx="117" cy="131" rx="5.2" ry="8" fill="#e11d48" stroke="#fecdd3" stroke-width=".8"/>
          <path d="M89 125 Q93 121 97 125 Z M113 122 Q117 118 121 122 Z" fill="#fde047"/>
          <path d="M96 140 L102 160 M114 137 L108 160" stroke="#fde047" stroke-width="1.3"/>
        </g>
        <g class="an-org" data-org="bladder" data-name="กระเพาะปัสสาวะ (Bladder)">
          <path d="M99 160 Q105 156 111 160 Q111 169 105 172 Q99 169 99 160 Z" fill="#38bdf8" stroke="#e0f2fe" stroke-width=".8"/>
        </g>`;
      return `<svg viewBox="0 0 210 380" aria-hidden="true">${IDA_DEFS}${IDA_WINKS}${idaTopShell(inner)}
        <!-- 🔴 B9 ไตใหญ่ 2 ข้างด้านใต้: ซ้าย External / ขวา Cross-Section (ปิรามิดชี้เข้า Calyx ถูกต้อง) -->
        <g transform="translate(0,298)">
          <g class="an-org an-sub" data-org="kidneys" data-name="ไตผิวนอก & ต่อมหมวกไต (External)" transform="translate(52,0)">
            <path d="M-14 -38 Q0 -52 14 -36 Q0 -31 -14 -38 Z" fill="#fde047" stroke="#fef9c3" stroke-width=".9"/>
            <path d="M12 -6 L38 -6" stroke="#ef4444" stroke-width="4.5" stroke-linecap="round"/>
            <path d="M12 4 L38 4" stroke="#3b82f6" stroke-width="4.5" stroke-linecap="round"/>
            <path d="M10 12 Q26 24 28 54" fill="none" stroke="#fde047" stroke-width="3.6" stroke-linecap="round"/>
            <path d="M-4 -36 C-26 -36 -34 -14 -32 4 C-29 26 -16 40 0 38 C12 37 16 26 14 14 C10 7 10 -7 14 -14 C16 -26 10 -36 -4 -36 Z" fill="#b91c1c" stroke="#fca5a5" stroke-width="1.3"/>
            <path d="M-20 -18 Q-25 0 -18 20" fill="none" stroke="#fb7185" stroke-width="1.6" opacity=".55" stroke-linecap="round"/>
            <text x="-4" y="60" text-anchor="middle" fill="#fecdd3" font-size="9" font-weight="700">External</text>
          </g>
          <g class="an-org an-sub" data-org="kidneys" data-name="ไตตัดขวาง (Cortex · Pyramids · Calyx · Pelvis)" transform="translate(154,0)">
            <path d="M-14 -36 Q0 -52 14 -38 Q0 -31 -14 -36 Z" fill="#fde047" stroke="#fef9c3" stroke-width=".9"/>
            <path d="M4 -36 C26 -36 34 -14 32 4 C29 26 16 40 0 38 C-12 37 -16 26 -14 14 C-10 7 -10 -7 -14 -14 C-16 -26 -10 -36 4 -36 Z" fill="#ea580c" stroke="#7c2d12" stroke-width="1.6"/>
            <path d="M4 -32 C22 -32 29 -12 27 4 C25 22 14 35 0 33 C-9 32 -12 22 -10 12 C-7 6 -7 -6 -10 -12 C-12 -22 -7 -32 4 -32 Z" fill="#fb923c"/>
            <g fill="#b91c1c" stroke="#7f1d1d" stroke-width=".7">
              <path d="M-3 -27 Q4 -30 11 -26 L4 -12 Z"/>
              <path d="M13 -24 Q22 -18 23 -10 L10 -8 Z"/>
              <path d="M24 -6 Q26 2 24 9 L11 2 Z"/>
              <path d="M23 12 Q20 21 13 26 L9 10 Z"/>
              <path d="M10 28 Q2 32 -5 27 L3 14 Z"/>
            </g>
            <path d="M-12 10 Q-22 24 -24 54" fill="none" stroke="#fde047" stroke-width="4.2" stroke-linecap="round"/>
            <path d="M-12 6 Q-4 2 4 -12 M-10 4 Q0 0 10 -8 M-10 4 Q2 4 11 2 M-10 6 Q0 8 9 10 M-11 8 Q-2 10 3 14" fill="none" stroke="#fef08a" stroke-width="3.2" stroke-linecap="round"/>
            <path d="M-13 -4 Q-4 -2 -2 6 Q-4 14 -13 14 Q-16 6 -13 -4 Z" fill="#fde047"/>
            <text x="4" y="60" text-anchor="middle" fill="#fecdd3" font-size="9" font-weight="700">Cross-Section</text>
          </g>
        </g>
      </svg>`;
    }
    if (mode === 'parasit') {
      const inner = `
        <g class="an-org" data-org="brain" data-name="สมอง (CNS Parasite)">
          <circle cx="105" cy="40" r="10" fill="#c084fc" stroke="#f5d0fe" stroke-width=".7"/>
        </g>
        <g class="an-org" data-org="heart" data-name="เลือด & หัวใจ (Blood Parasite)">
          <path d="M108 102 C107 98 101 99 102 105 C103 110 108 114 111 116 C114 113 117 109 116 104 C115 100 109 100 108 102 Z" fill="#ef4444"/>
        </g>
        <g class="an-org" data-org="liver" data-name="ตับ & ทางเดินน้ำดี (Liver Fluke)">
          <path d="M86 122 Q98 116 112 123 Q108 132 100 134 Q90 135 87 130 Z" fill="#b45309" stroke="#fdba74" stroke-width=".7"/>
        </g>
        <g class="an-org" data-org="spleen" data-name="ม้าม (Malaria · Spleen)">
          <ellipse cx="122" cy="128" rx="4" ry="7" fill="#a855f7" stroke="#e9d5ff" stroke-width=".7"/>
        </g>
        <g class="an-org" data-org="intestines" data-name="ลำไส้ (GI Parasite)">
          <path d="M90 140 Q105 136 120 140 L118 160 Q105 166 92 160 Z" fill="#f472b6" stroke="#fbcfe8" stroke-width=".8"/>
          <path d="M95 146 Q105 143 115 146 M95 153 Q105 156 115 153" fill="none" stroke="#831843" stroke-width="1.3" stroke-linecap="round"/>
        </g>`;
      return `<svg viewBox="0 0 210 362" aria-hidden="true">${IDA_DEFS}${IDA_WINKS}${idaTopShell(inner)}
        <!-- 🔬 Parasite ด้านล่าง: เลนส์กล้องจุลทรรศน์ 3 วงพาสเทล (Malaria Ring · Helminth Egg · Nematode) -->
        <g transform="translate(0,296)">
          <!-- เลนส์ 1: Malaria Ring Form in RBC -->
          <g class="an-org an-sub" data-org="heart" data-name="Malaria Ring Form (Blood Smear)" transform="translate(38,0)">
            <circle cx="0" cy="0" r="25" fill="#0f172a" stroke="#5eead4" stroke-width="2"/>
            <circle cx="0" cy="0" r="21" fill="#1e1b4b"/>
            <circle cx="-6" cy="-5" r="9" fill="#fda4af" opacity=".9"/>
            <circle cx="-6" cy="-5" r="5" fill="none" stroke="#6366f1" stroke-width="1.5"/>
            <circle cx="-2" cy="-8" r="2" fill="#e11d48"/>
            <circle cx="8" cy="7" r="8" fill="#fda4af" opacity=".75"/>
            <circle cx="8" cy="7" r="4" fill="none" stroke="#6366f1" stroke-width="1.3"/>
            <circle cx="11" cy="5" r="1.8" fill="#e11d48"/>
            <text x="0" y="38" text-anchor="middle" fill="#fda4af" font-size="8" font-weight="700">Malaria</text>
          </g>
          <!-- เลนส์ 2: Helminth Egg -->
          <g class="an-org an-sub" data-org="intestines" data-name="ไข่พยาธิ (Helminth Egg · Stool Exam)" transform="translate(105,0)">
            <circle cx="0" cy="0" r="25" fill="#0f172a" stroke="#fde047" stroke-width="2"/>
            <circle cx="0" cy="0" r="21" fill="#1e293b"/>
            <ellipse cx="0" cy="0" rx="13" ry="9" fill="#d97706" stroke="#fde68a" stroke-width="1.5" stroke-dasharray="3 1.5"/>
            <ellipse cx="0" cy="0" rx="8" ry="5" fill="#fef3c7" opacity=".85"/>
            <circle cx="-2" cy="0" r="2.2" fill="#92400e"/><circle cx="3" cy="-1" r="1.8" fill="#92400e"/>
            <text x="0" y="38" text-anchor="middle" fill="#fde68a" font-size="8" font-weight="700">Ova / Egg</text>
          </g>
          <!-- เลนส์ 3: Nematode / Roundworm -->
          <g class="an-org an-sub" data-org="liver" data-name="พยาธิตัวกลม/ใบไม้ (Helminth)" transform="translate(172,0)">
            <circle cx="0" cy="0" r="25" fill="#0f172a" stroke="#f472b6" stroke-width="2"/>
            <circle cx="0" cy="0" r="21" fill="#1e293b"/>
            <path d="M-12 10 C-14 -4 -2 -14 6 -6 C12 0 4 10 12 12" fill="none" stroke="#fbcfe8" stroke-width="4.2" stroke-linecap="round"/>
            <path d="M-12 10 C-14 -4 -2 -14 6 -6 C12 0 4 10 12 12" fill="none" stroke="#ec4899" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="2 2"/>
            <text x="0" y="38" text-anchor="middle" fill="#fbcfe8" font-size="8" font-weight="700">Helminth</text>
          </g>
        </g>
      </svg>`;
    }
    /* Default: Standard Monument Valley Ida with full organs + left arm & leg bones */
    return `<svg viewBox="0 0 180 342" aria-hidden="true">${IDA_DEFS}
      <polygon class="anat-shadow" points="90,308 136,324 90,338 44,324" fill="#5eead4" opacity=".22"/>
      <polygon class="anat-ring" points="90,313 122,324 90,334 58,324" fill="#1e1b4b" opacity=".52" stroke="#5eead4" stroke-opacity=".42" stroke-width="1"/>
      <g class="anat-winks" aria-hidden="true">
        <path class="an-wink" d="M38 46 l1.5 4.2 l4.2 1.5 l-4.2 1.5 l-1.5 4.2 l-1.5-4.2 l-4.2-1.5 l4.2-1.5 Z" fill="#fde047"/>
        <path class="an-wink" d="M144 66 l1.4 3.8 l3.8 1.4 l-3.8 1.4 l-1.4 3.8 l-1.4-3.8 l-3.8-1.4 l3.8-1.4 Z" fill="#5eead4" style="animation-delay:2.2s"/>
        <path class="an-wink" d="M150 202 l1.4 3.8 l3.8 1.4 l-3.8 1.4 l-1.4 3.8 l-1.4-3.8 l-3.8-1.4 l3.8-1.4 Z" fill="#a5f3fc" style="animation-delay:4.3s"/>
      </g>
      <g class="anat-body" filter="url(#anDrop)">
        <line x1="81" y1="264" x2="81" y2="306" stroke="#cbd5e1" stroke-width="4.2" stroke-linecap="round"/>
        <line x1="99" y1="264" x2="99" y2="306" stroke="#94a3b8" stroke-width="4.2" stroke-linecap="round"/>
        <g class="an-org" data-org="skin" data-name="ผิวหนัง (Skin)">
          <polygon points="90,76 146,268 34,268" fill="url(#mvIdaL)"/>
          <polygon points="90,76 146,268 90,268" fill="url(#mvIdaR)"/>
          <circle cx="90" cy="58" r="20" fill="#f8fafc" stroke="#99f6e4" stroke-opacity=".55" stroke-width="1"/>
          <polygon points="90,6 108,42 72,42" fill="url(#mvHat)"/>
          <polygon points="90,6 108,42 90,42" fill="#0f766e" opacity=".32"/>
        </g>
        <polygon points="90,92 135,176 90,258 45,176" fill="url(#mvWin)" stroke="#5eead4" stroke-opacity=".62" stroke-width="1.4"/>
        <polygon points="90,97 130,176 90,253 50,176" fill="none" stroke="#a5f3fc" stroke-opacity=".22" stroke-width=".8"/>
        <g class="an-org" data-org="msk" data-name="กระดูกสำคัญ (ซี่โครง + แขนซ้าย + ขาซ้าย)" stroke="#e2e8f0" stroke-linecap="round" fill="none">
          <line x1="90" y1="84" x2="90" y2="196" stroke-width="2.8" stroke-dasharray="4 3"/>
          <path d="M62 110 Q76 103 90 108 Q104 103 118 110" stroke-width="2.6"/>
          <path d="M90 109 v34" stroke="#f8fafc" stroke-width="3.6"/>
          <path d="M70 118 Q90 124 110 118 M64 126 Q90 133 116 126 M61 135 Q90 142 119 135 M62 144 Q90 151 118 144 M66 153 Q90 159 114 153 M72 162 Q90 167 108 162" stroke-width="1.7" opacity=".88"/>
          <circle cx="59" cy="113" r="3.4" fill="#f8fafc" stroke="none"/><line x1="58" y1="116" x2="46" y2="154" stroke="#f8fafc" stroke-width="3.2"/>
          <circle cx="45" cy="156" r="2.8" fill="#cbd5e1" stroke="none"/><line x1="44" y1="159" x2="36" y2="196" stroke="#f8fafc" stroke-width="2.2"/><line x1="47" y1="159" x2="40" y2="196" stroke="#cbd5e1" stroke-width="1.5"/>
          <circle cx="37" cy="199" r="2.2" fill="#e2e8f0" stroke="none"/>
          <path d="M88 196 Q74 202 68 214" stroke="#cbd5e1" stroke-width="2.6"/>
          <circle cx="69" cy="215" r="3.4" fill="#f8fafc" stroke="none"/><line x1="70" y1="218" x2="77" y2="262" stroke="#f8fafc" stroke-width="3.4"/>
          <circle cx="78" cy="265" r="3.2" fill="#e2e8f0" stroke="#94a3b8" stroke-width=".7"/><line x1="79" y1="268" x2="80" y2="303" stroke="#f8fafc" stroke-width="2.6"/><line x1="75" y1="270" x2="77" y2="302" stroke="#cbd5e1" stroke-width="1.4"/>
          <ellipse cx="81" cy="306" rx="4.5" ry="2.1" fill="#e2e8f0" stroke="none"/>
        </g>
        <g class="an-org" data-org="brain" data-name="สมอง & ระบบประสาท (CNS)">
          <path d="M75 56 C74 44 83 41 90 42 C97 41 106 44 105 56 C106 63 100 68 94 67 L86 67 C80 68 74 63 75 56 Z" fill="#c084fc" stroke="#f5d0fe" stroke-width=".9"/>
          <path d="M80 51 Q85 47 90 51 Q95 47 100 51 M78 57 Q84 61 90 57 Q96 61 102 57 M90 43 v22" fill="none" stroke="#581c87" stroke-width="1.15" stroke-linecap="round" opacity=".72"/>
          <ellipse cx="97" cy="68" rx="5.5" ry="3.6" fill="#a855f7" stroke="#f5d0fe" stroke-width=".7"/>
          <path d="M88 66 L92 66 L91.5 96 L88.5 96 Z" fill="#d8b4fe"/>
        </g>
        <g class="an-org an-eye-only" data-org="eye" data-name="ตา & เส้นประสาทตา (Eyes)">
          <ellipse cx="83" cy="60" rx="3.2" ry="2" fill="#38bdf8"/><ellipse cx="97" cy="60" rx="3.2" ry="2" fill="#38bdf8"/>
        </g>
        <g class="an-org" data-org="thyroid" data-name="ต่อมไทรอยด์ (Thyroid)">
          <path d="M81 98 Q85 93 90 99 Q95 93 99 98 Q99 106 90 104 Q81 106 81 98 Z" fill="#fbbf24" stroke="#fef08a" stroke-width=".8"/>
        </g>
        <g class="an-org" data-org="lungs" data-name="ปอด & ทางเดินหายใจ (Lungs)">
          <line x1="90" y1="98" x2="90" y2="128" stroke="#bae6fd" stroke-width="3.4"/>
          <path d="M87.5 104 h5 M87.5 109 h5 M87.5 114 h5 M87.5 119 h5" stroke="#0284c7" stroke-width=".9"/>
          <path d="M86 122 C73 121 63 136 64 157 C65 166 78 165 86 157 Z" fill="#fb7185" stroke="#fecdd3" stroke-width=".8"/>
          <path d="M94 122 C107 121 117 136 116 157 C115 166 102 165 94 157 Z" fill="#f43f5e" stroke="#fecdd3" stroke-width=".8"/>
          <path d="M68 144 Q77 146 84 142 M112 146 Q104 148 96 144" fill="none" stroke="#9f1239" stroke-width="1" opacity=".55"/>
        </g>
        <g class="an-org" data-org="heart" data-name="หัวใจ & หลอดเลือด (Heart)">
          <path d="M91 131 Q91 118 99 121 Q103 124 101 133" fill="none" stroke="#f87171" stroke-width="3" stroke-linecap="round"/>
          <line x1="87" y1="122" x2="87" y2="134" stroke="#60a5fa" stroke-width="2.6" stroke-linecap="round"/>
          <path d="M94 134 C93 128 83 129 84 138 C85 148 95 156 100 159 C105 155 110 146 108 137 C106 130 97 130 94 134 Z" fill="#ef4444" stroke="#fecaca" stroke-width=".9"/>
        </g>
        <g class="an-org" data-org="liver" data-name="ตับ & ทางเดินน้ำดี (Liver)">
          <path d="M62 164 Q76 156 97 165 Q91 178 82 181 Q68 183 63 176 Z" fill="#b45309" stroke="#fdba74" stroke-width=".8"/>
          <path d="M80 161 L78 179" stroke="#78350f" stroke-width="1.1" opacity=".6"/>
          <ellipse cx="75" cy="181" rx="4.2" ry="2.8" fill="#4ade80" stroke="#dcfce7" stroke-width=".7"/>
        </g>
        <g class="an-org" data-org="stomach" data-name="กระเพาะอาหาร (Stomach)">
          <path d="M92 158 C105 156 114 166 113 177 C112 188 97 192 88 186 C83 182 86 175 91 172 C94 170 91 163 92 158 Z" fill="#fb923c" stroke="#fed7aa" stroke-width=".9"/>
        </g>
        <g class="an-org" data-org="spleen" data-name="ม้าม (Spleen)">
          <ellipse cx="116" cy="173" rx="4.8" ry="8.5" fill="#a855f7" stroke="#e9d5ff" stroke-width=".8"/>
        </g>
        <g class="an-org" data-org="pancreas" data-name="ตับอ่อน (Pancreas)">
          <path d="M80 187 Q94 182 110 185 Q111 193 95 194 Q82 195 80 187 Z" fill="#facc15" stroke="#fef9c3" stroke-width=".8"/>
          <path d="M83 189 Q96 187 107 188" fill="none" stroke="#a16207" stroke-width="1"/>
        </g>
        <g class="an-org" data-org="kidneys" data-name="ไต & ต่อมหมวกไต (Kidneys)">
          <ellipse cx="73" cy="197" rx="5.5" ry="8.5" fill="#e11d48" stroke="#fecdd3" stroke-width=".8"/>
          <ellipse cx="107" cy="194" rx="5.5" ry="8.5" fill="#e11d48" stroke="#fecdd3" stroke-width=".8"/>
          <path d="M68 188 Q73 183 78 188 Z M102 185 Q107 180 112 185 Z" fill="#fde047"/>
          <path d="M77 202 Q82 216 86 228 M103 199 Q98 216 94 228" fill="none" stroke="#fde047" stroke-width="1.3" opacity=".8"/>
        </g>
        <g class="an-org" data-org="intestines" data-name="ลำไส้เล็ก & ลำไส้ใหญ่ (Intestines)">
          <path d="M68 198 Q68 192 90 193 Q112 192 112 198 L109 221 Q90 229 71 221 Z" fill="#f472b6" fill-opacity=".88" stroke="#fbcfe8" stroke-width=".9"/>
          <path d="M75 203 Q90 199 105 203 M74 210 Q90 214 106 210 M76 217 Q90 221 104 217" fill="none" stroke="#831843" stroke-width="1.5" stroke-linecap="round"/>
        </g>
        <g class="an-org" data-org="bladder" data-name="กระเพาะปัสสาวะ (Bladder)">
          <path d="M82 229 Q90 223 98 229 Q98 240 90 244 Q82 240 82 229 Z" fill="#38bdf8" stroke="#e0f2fe" stroke-width=".9"/>
        </g>
        <g class="an-org" data-org="repro" data-name="ระบบสืบพันธุ์ (Repro)">
          <path d="M81 232 Q90 226 99 232 L94 244 Q90 247 86 244 Z" fill="#f472b6" stroke="#fce7f3" stroke-width=".8"/>
          <circle cx="77" cy="232" r="3.2" fill="#fbcfe8"/><circle cx="103" cy="232" r="3.2" fill="#fbcfe8"/>
        </g>
      </g>
    </svg>`;
  }

  function bindAnatomyClicks() {
    anatHost.querySelectorAll('.an-org').forEach(g => {
      g.style.cursor = 'pointer';
      g.addEventListener('click', () => { if (g.dataset.name) toast(`🧬 ${g.dataset.name}`); });
    });
  }

  function resolveOrgans(chId, sec, pg) {
    const txt = `${sec ? sec.title : ''} ${pg ? pg.title : ''}`.toLowerCase();
    if (chId === 'b3') {
      if (/eye|optic|ตา|vision|cn\s*2|cn\s*3|pupil/.test(txt)) return { organs: ['brain', 'eye'], label: 'Brain & Eyes' };
      return { organs: ['brain'], label: 'Brain · CNS' };
    }
    if (chId === 'b4') {
      if (/ตา|eye|optic|glaucoma|retina|cornea|uveit|conjunct/.test(txt)) return { organs: ['eye', 'skin'], label: 'Eyes & Skin' };
      return { organs: ['skin'], label: 'Skin · Derm' };
    }
    if (chId === 'b5' || chId === 'kt-msk') return { organs: ['msk'], label: 'Bones & Muscles' };
    if (chId === 'b6' || chId === 'kt-rs') return { organs: ['lungs'], label: 'Lungs · Resp' };
    if (chId === 'b7') return { organs: ['heart'], label: 'Heart · CVS' };
    if (chId === 'b8') {
      if (/ตับอ่อน|pancrea/.test(txt)) return { organs: ['pancreas'], label: 'Pancreas' };
      if (/ตับ|liver|hepat|bilirubin|ดีซ่าน|gallstone|biliary|portal|cirrh/.test(txt)) return { organs: ['liver'], label: 'Liver & Biliary' };
      if (/ม้าม|spleen/.test(txt)) return { organs: ['spleen'], label: 'Spleen' };
      if (/gastric|peptic|ulcer|pylori|การหลั่งกรด|dysphagia|achalasia|gerd|barrett|ยาลดกรด|vomiting|antiemetic|foregut/.test(txt)) return { organs: ['stomach'], label: 'Stomach & Esoph' };
      if (/ibd|celiac|polyp|colorectal|ท้องเสีย|diarrhea|colitis|ischemia|midgut|hindgut|hirschsprung|ibs|ยาแก้ท้องเสีย|ยาระบาย|digestion|absorption|steatorrhea|protozoa|helminth|food poisoning/.test(txt)) return { organs: ['intestines'], label: 'Intestines · GI' };
      return { organs: ['stomach', 'liver', 'intestines'], label: 'GI System' };
    }
    if (chId === 'b9') {
      if (/bladder|prostate|กระเพาะปัสสาวะ|ต่อมลูกหมาก|uti/.test(txt)) return { organs: ['bladder', 'kidneys'], label: 'Kidneys & Bladder' };
      return { organs: ['kidneys'], label: 'Kidneys · Renal' };
    }
    if (chId === 'b10') {
      if (/thyroid|ไทรอยด์|parathyroid|calcium/.test(txt)) return { organs: ['thyroid'], label: 'Thyroid' };
      if (/dm|diabet|insulin|glucose|obesity|pancrea/.test(txt)) return { organs: ['pancreas'], label: 'Pancreas · DM' };
      if (/adrenal|cushing|addison|pheo|aldosteron/.test(txt)) return { organs: ['kidneys'], label: 'Adrenal Glands' };
      if (/pituitary|hypothal|prolactin|adh/.test(txt)) return { organs: ['brain'], label: 'Pituitary · Brain' };
      return { organs: ['thyroid', 'pancreas', 'kidneys'], label: 'Endocrine' };
    }
    if (chId === 'kt-repro') return { organs: ['repro'], label: 'Reproductive' };
    if (chId === 'kt-embryo') {
      if (/nerv|neural|brain/.test(txt)) return { organs: ['brain'], label: 'Embryo · CNS' };
      if (/cvs|heart/.test(txt)) return { organs: ['heart'], label: 'Embryo · CVS' };
      if (/resp|lung/.test(txt)) return { organs: ['lungs'], label: 'Embryo · Resp' };
      if (/gi|gut|foregut|midgut|hindgut/.test(txt)) return { organs: ['stomach', 'intestines'], label: 'Embryo · GI' };
      return { organs: ['heart', 'lungs', 'stomach', 'kidneys'], label: 'Embryology' };
    }
    if (chId === 'kt-parasit') {
      if (/malaria|filaria|blood/.test(txt)) return { organs: ['heart', 'spleen'], label: 'Blood & Spleen' };
      if (/toxo|amoeba|brain/.test(txt)) return { organs: ['brain'], label: 'CNS Parasite' };
      if (/เหา|โลน|หิด|skin/.test(txt)) return { organs: ['skin'], label: 'Skin Parasite' };
      return { organs: ['intestines', 'liver'], label: 'GI Parasite' };
    }
    return { organs: ['heart', 'lungs'], label: 'Anatomy' };
  }
  function syncAnatomyUI() {
    const onSec = /^#\/[^/]+\/\d+$/.test(location.hash);
    const enabled = draftOn('anatomySidebarInfographic') && onSec && !!_anatCur;
    anatHost.hidden = !enabled;
    document.body.classList.toggle('anat-open', enabled && !S.anatHidden);
    if (!enabled) return;
    const collapsed = !!S.anatHidden;
    const dock = $('#anatDock', anatHost);
    dock.hidden = collapsed;
    $('#anatTab', anatHost).hidden = !collapsed;
    const mode = anatModeFor(_anatCur.chId);
    if (_anatMode !== mode) {
      _anatMode = mode;
      $('#anatStage', anatHost).innerHTML = idaStageSVG(mode);
      dock.classList.toggle('is-wide', mode !== 'default' && mode !== 'msk');
      bindAnatomyClicks();
    }
    const res = resolveOrgans(_anatCur.chId, _anatCur.sec, _anatCur.pg);
    $('#anatSys', anatHost).textContent = res.label;
    $('#anatFt', anatHost).textContent = `${chTitle(_anatCur.chId)} · กล่อง ${_anatCur.sec.no}`;
    const litSet = new Set(res.organs);
    anatHost.querySelectorAll('.an-org').forEach(g => {
      g.classList.toggle('lit', litSet.has(g.dataset.org));
    });
  }
  function updateAnatomyInfographic(chId, sec, pg) {
    _anatCur = { chId, sec, pg };
    syncAnatomyUI();
  }
  $('#anatHide', anatHost).onclick = () => { S.anatHidden = true; save(); syncAnatomyUI(); };
  $('#anatTab', anatHost).onclick = () => { S.anatHidden = false; save(); syncAnatomyUI(); };
  addEventListener('hashchange', () => setTimeout(syncAnatomyUI, 45));
  _onOwnerChange.push(() => syncAnatomyUI());

  /* 🌸 1. Sacred Blooming Tree (Drug & Bug / Name Drill — drugBloomTree) */
  function mvDrugBloomTreeHTML({ known = 0, total = 1, mode = 'db' }) {
    const pct = Math.min(100, Math.round((known / Math.max(1, total)) * 100));
    const BLOOMS = [
      { x: 96, y: 84, c1: '#fb7185', c2: '#fb923c', c3: '#f472b6' },
      { x: 118, y: 60, c1: '#fb923c', c2: '#fde047', c3: '#f472b6' },
      { x: 146, y: 46, c1: '#f472b6', c2: '#fb923c', c3: '#e879f9' },
      { x: 174, y: 54, c1: '#fb923c', c2: '#f472b6', c3: '#facc15' },
      { x: 196, y: 42, c1: '#e879f9', c2: '#fde047', c3: '#fb7185' },
      { x: 132, y: 92, c1: '#f472b6', c2: '#fb7185', c3: '#fde047' },
      { x: 108, y: 122, c1: '#fb923c', c2: '#f472b6', c3: '#facc15' },
      { x: 214, y: 76, c1: '#fb923c', c2: '#facc15', c3: '#f472b6' },
      { x: 238, y: 66, c1: '#f472b6', c2: '#fb923c', c3: '#e879f9' },
      { x: 262, y: 88, c1: '#facc15', c2: '#fb923c', c3: '#4ade80' },
      { x: 282, y: 74, c1: '#fb923c', c2: '#fde047', c3: '#f472b6' },
      { x: 246, y: 114, c1: '#e879f9', c2: '#fb923c', c3: '#facc15' },
      { x: 184, y: 84, c1: '#fb7185', c2: '#f472b6', c3: '#fde047' },
      { x: 216, y: 118, c1: '#4ade80', c2: '#f472b6', c3: '#fb923c' }
    ];
    // ปลดล็อกดอกไม้ตามจำนวนที่จำได้ (อย่างน้อย 1 ดอกต่อทุกตัวที่จำได้ช่วงแรก หรือตามสัดส่วน)
    const litCount = known <= 0 ? 0 : Math.min(BLOOMS.length, Math.max(Math.min(known, 5), Math.ceil((known / Math.max(1, total)) * BLOOMS.length)));
    const bflies = [
      { x: 74, y: 78, r: -18 }, { x: 204, y: 20, r: 12 }, { x: 244, y: 14, r: -10 }, { x: 312, y: 62, r: 16 }, { x: 294, y: 116, r: -24 }
    ];
    const litBf = known <= 0 ? 0 : Math.min(bflies.length, Math.max(1, Math.ceil((litCount / BLOOMS.length) * bflies.length)));
    return `<section class="mv-tree-card">
      <div class="mv-tree-art">
        <svg viewBox="0 0 360 250" aria-hidden="true">
          <defs>
            <linearGradient id="trSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f8efe9" stop-opacity=".18"/><stop offset="100%" stop-color="#7ce0d3" stop-opacity=".08"/></linearGradient>
            <linearGradient id="trWood" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#8b6b64"/><stop offset="100%" stop-color="#5c423d"/></linearGradient>
            <radialGradient id="trCubeG" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#67e8f9" stop-opacity=".75"/><stop offset="100%" stop-color="#67e8f9" stop-opacity="0"/></radialGradient>
          </defs>
          <rect width="360" height="250" rx="14" fill="url(#trSky)"/>
          <!-- ลานหินเรขาคณิต Monument Valley -->
          <g transform="translate(180,186)">
            <polygon points="0,-46 116,8 0,60 -116,8" fill="#8fb3a8" opacity=".92"/>
            <polygon points="-116,8 0,60 0,72 -116,20" fill="#52756d"/>
            <polygon points="0,60 116,8 116,20 0,72" fill="#3a5953"/>
            <polygon points="0,-36 96,8 0,50 -96,8" fill="#dce7e2" opacity=".94"/>
            <polygon points="0,-24 68,8 0,38 -68,8" fill="#bfd4cd" opacity=".9"/>
            <polygon points="0,-16 48,6 0,28 -48,6" fill="#eef4f0" opacity=".92"/>
            <!-- วงคลื่นแสงรอบลูกบาศก์คริสตัล -->
            <ellipse cx="26" cy="8" rx="22" ry="11" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1"/>
            <ellipse cx="26" cy="8" rx="34" ry="17" fill="none" stroke="#7ce0d3" stroke-opacity=".34" stroke-width=".9"/>
            <!-- ลูกบาศก์คริสตัลใต้ต้นไม้ -->
            <g transform="translate(26,4)">
              <circle cx="0" cy="-4" r="16" fill="url(#trCubeG)" opacity=".7"/>
              <polygon points="0,-12 10,-7 0,-2 -10,-7" fill="#a5f3fc"/>
              <polygon points="-10,-7 0,-2 0,9 -10,4" fill="#2b5968"/>
              <polygon points="10,-7 0,-2 0,9 10,4" fill="#133442"/>
              <polygon points="0,-9 6,-6 0,-3 -6,-6" fill="#fff" opacity=".8"/>
            </g>
            <!-- น้อง Ida ยืนมองต้นไม้ -->
            <g transform="translate(8,18)">
              <ellipse cx="0" cy="3" rx="4" ry="1.6" fill="rgba(0,0,0,.22)"/>
              <line x1="-1.2" y1="0" x2="-1.2" y2="3" stroke="#1e293b" stroke-width="1.1"/><line x1="1.2" y1="0" x2="1.2" y2="3" stroke="#1e293b" stroke-width="1.1"/>
              <polygon points="0,-10 -5,0 5,0" fill="#fff"/>
              <circle cx="0" cy="-12" r="2.5" fill="#1e293b"/>
              <polygon points="0,-22 -3.4,-12 3.4,-12" fill="#fff"/>
            </g>
          </g>
          <!-- ลำต้นและกิ่งก้านเรขาคณิต Monument Valley -->
          <g fill="none" stroke="url(#trWood)" stroke-linecap="round" stroke-linejoin="round">
            <path d="M168 186 Q174 162 162 138 Q144 106 146 48" stroke-width="11"/>
            <path d="M162 146 Q198 134 212 104 L214 78" stroke-width="7.5"/>
            <path d="M196 130 Q232 126 244 100 L240 68" stroke-width="5.5"/>
            <path d="M228 118 Q264 114 278 90 L282 76" stroke-width="4.2"/>
            <path d="M154 128 Q118 124 106 102 L96 86" stroke-width="5.5"/>
            <path d="M148 96 Q126 86 118 62" stroke-width="4.5"/>
            <path d="M148 82 Q170 72 174 56" stroke-width="4"/>
            <path d="M164 68 Q186 58 196 44" stroke-width="3.6"/>
            <path d="M214 96 Q244 96 262 88" stroke-width="3.4"/>
            <path d="M132 124 L108 122 M146 102 L132 94 M214 118 L246 114" stroke-width="3"/>
          </g>
          <!-- โคนต้นไม้ 3D -->
          <path d="M148 188 L164 168 L184 176 L190 192 L172 195 L154 192 Z" fill="#6b4e48"/>
          <!-- ดอกไม้กังหันเรขาคณิต 14 ช่อ (ผลิบานตามจำนวนที่จำได้!) -->
          ${BLOOMS.map((b, i) => `<g class="mv-bloom${i < litCount ? ' on' : ''}" transform="translate(${b.x},${b.y})" style="animation-delay:${(i * 0.12).toFixed(2)}s">
            <ellipse cx="-8" cy="0" rx="8.5" ry="3.2" fill="${b.c1}" transform="rotate(-18)"/>
            <ellipse cx="8" cy="0" rx="8.5" ry="3.2" fill="${b.c2}" transform="rotate(18)"/>
            <ellipse cx="0" cy="-7" rx="7" ry="3" fill="${b.c3}" transform="rotate(-72)"/>
            <ellipse cx="0" cy="6" rx="6.5" ry="2.8" fill="${b.c1}" transform="rotate(68)"/>
            <circle cx="0" cy="0" r="2.2" fill="#fff"/>
          </g>`).join('')}
          <!-- ผีเสื้อสีฟ้าเรืองแสงบินวนรอบต้นไม้ -->
          ${bflies.map((f, i) => `<g class="mv-bfly${i < litBf ? ' on' : ''}" transform="translate(${f.x},${f.y}) rotate(${f.r})" style="animation-delay:${(i * 0.45).toFixed(2)}s">
            <polygon points="0,0 -7,-5 -4,3" fill="#22d3ee"/>
            <polygon points="0,0 7,-5 4,3" fill="#67e8f9"/>
            <polygon points="0,1 -5,5 -1,6" fill="#06b6d4"/>
            <polygon points="0,1 5,5 1,6" fill="#38bdf8"/>
          </g>`).join('')}
        </svg>
      </div>
      <div class="mv-tree-info">
        <div class="mv-tree-badge">✨ ต้นไม้จำยา &amp; เชื้อ (Blooming Tree)</div>
        <h3>จำได้แล้ว <b>${known}</b> / ${total} ตัว (${pct}%)</h3>
        <p>${mode === 'db' ? 'กดปุ่ม <b>+ จำได้</b> บนการ์ดยาหรือเชื้อด้านล่าง เพื่อปลูกดอกไม้กังหันหลากสีและเรียกผีเสื้อสีฟ้าให้บินวนรอบต้นไม้!' : 'ฝึกทำ Name Drill และติ๊กจำยา/เชื้อในหน้า Drug & Bug เพื่อปลูกดอกไม้ให้บานเต็มต้น!'}</p>
        <div class="mv-tree-bar"><i style="width:${pct}%"></i></div>
        <div class="mv-tree-acts">
          <button type="button" class="btn small mv-tree-pv">👁️ Preview บานเต็มต้น</button>
          ${mode === 'db' ? '<a class="btn small primary" href="#/drill">🧠 ไปฝึก Name Drill</a>' : '<a class="btn small primary" href="#/db">💊 ไปติ๊กจำยาใน Drug &amp; Bug</a>'}
        </div>
      </div>
    </section>`;
  }

  /* 🧩 2. Emerald Sanctuary Maze (Mistakes / Today's Review / Mock Exam — mazeReviewQuest) */
  function mvEmeraldMazeHTML({ done = 0, total = 1, title = '', sub = '' }) {
    const pct = Math.max(0, Math.min(1, done / Math.max(1, total)));
    const unlocked = pct >= 1;
    // จุดเดินของน้อง Ro จากประตูบน -> สวิตช์ชมพู 1 -> สวิตช์ชมพู 2 -> กลางวิหาร
    const pts = [{ x: 112, y: 66 }, { x: 152, y: 98 }, { x: 162, y: 132 }, { x: 120, y: 174 }, { x: 120, y: 128 }];
    const sc = pct * (pts.length - 1), idx = Math.min(pts.length - 2, Math.floor(sc)), t = sc - idx;
    const rx = (pts[idx].x + (pts[idx + 1].x - pts[idx].x) * t).toFixed(1);
    const ry = (pts[idx].y + (pts[idx + 1].y - pts[idx].y) * t).toFixed(1);
    const sw1 = pct >= 0.35, sw2 = pct >= 0.72;
    return `<section class="mv-maze-card${unlocked ? ' is-unlocked' : ''}">
      <div class="mv-maze-art">
        <svg viewBox="0 0 240 240" aria-hidden="true">
          <defs>
            <linearGradient id="mzBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#86efac" stop-opacity=".24"/><stop offset="100%" stop-color="#10b981" stop-opacity=".12"/></linearGradient>
            <linearGradient id="mzTop" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#8ff3d1"/><stop offset="100%" stop-color="#52d1a8"/></linearGradient>
            <linearGradient id="mzL" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#48be98"/><stop offset="100%" stop-color="#2c8f73"/></linearGradient>
            <linearGradient id="mzR" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#35a684"/><stop offset="100%" stop-color="#1e6e58"/></linearGradient>
            <radialGradient id="mzCryG" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#818cf8" stop-opacity=".85"/><stop offset="100%" stop-color="#818cf8" stop-opacity="0"/></radialGradient>
          </defs>
          <rect width="240" height="240" rx="16" fill="url(#mzBg)"/>
          <!-- โครงเปลือกวิหารมรกตโค้งมน Monument Valley -->
          <path d="M120 14 C146 14 164 34 166 56 C188 64 202 88 200 116 L200 176 C200 202 162 214 120 228 C78 214 40 202 40 176 L40 116 C38 88 52 64 74 56 C76 34 94 14 120 14 Z" fill="url(#mzL)" stroke="#a7f3d0" stroke-opacity=".55" stroke-width="1.4"/>
          <path d="M120 22 C142 22 156 38 158 58 C178 66 190 88 188 114 L188 172 C188 192 156 204 120 218 C84 204 52 192 52 172 L52 114 C50 88 62 66 82 58 C84 38 98 22 120 22 Z" fill="url(#mzR)"/>
          <!-- ทางเดินและบันไดเขาวงกตชั้นบน -->
          <polygon points="120,56 172,82 120,108 68,82" fill="url(#mzTop)"/>
          <path d="M106 66 v-16 a5 5 0 0 1 10 0 v16 Z" fill="#183d38"/>
          <!-- บันไดเฉียงซ้าย-ขวา -->
          <path d="M84 74 l-14 14 M88 78 l-14 14 M92 82 l-14 14" stroke="#1d6b56" stroke-width="2"/>
          <path d="M156 74 l14 14 M152 78 l14 14 M148 82 l14 14" stroke="#1d6b56" stroke-width="2"/>
          <!-- ทางเดินโค้งชั้นล่าง -->
          <path d="M62 126 Q120 198 178 126 L178 144 Q120 216 62 144 Z" fill="url(#mzTop)"/>
          <path d="M72 144 Q120 202 168 144 L168 162 Q120 220 72 162 Z" fill="url(#mzL)"/>
          <!-- แท่นกลางวิหาร + คริสตัลสีม่วง Sacred Geometry -->
          <polygon points="120,98 146,112 120,126 94,112" fill="url(#mzTop)"/>
          <polygon points="94,112 120,126 120,156 94,142" fill="url(#mzL)"/>
          <polygon points="120,126 146,112 146,142 120,156" fill="url(#mzR)"/>
          <g class="mz-crystal${unlocked ? ' lit' : ''}" transform="translate(120,126)">
            <circle cx="0" cy="0" r="${unlocked ? 26 : 16}" fill="url(#mzCryG)" opacity="${unlocked ? '.92' : '.38'}"/>
            <polygon points="0,-16 11,-4 11,6 0,16 -11,6 -11,-4" fill="${unlocked ? '#818cf8' : '#4338ca'}" stroke="#e0e7ff" stroke-width="1.2"/>
            <polygon points="0,-10 6,-2 0,10 -6,-2" fill="#c7d2fe" opacity=".88"/>
          </g>
          <!-- สวิตช์สีชมพูเรืองแสง 2 จุด -->
          <g transform="translate(162,114)"><polygon points="0,-5 9,0 0,5 -9,0" fill="${sw1 ? '#f472b6' : '#f9a8d4'}" opacity="${sw1 ? '1' : '.65'}"/><polygon points="0,-2.5 4.5,0 0,2.5 -4.5,0" fill="#fff"/></g>
          <g transform="translate(120,174)"><polygon points="0,-5 9,0 0,5 -9,0" fill="${sw2 ? '#f472b6' : '#f9a8d4'}" opacity="${sw2 ? '1' : '.65'}"/><polygon points="0,-2.5 4.5,0 0,2.5 -4.5,0" fill="#fff"/></g>
          <!-- น้อง Ro เดินตามความคืบหน้าในเขาวงกต -->
          <g class="mz-ro" transform="translate(${rx},${ry})">
            <ellipse cx="0" cy="4" rx="4.5" ry="1.8" fill="rgba(0,0,0,.28)"/>
            <polygon points="0,-11 -5.5,1 5.5,1" fill="#fb7185"/>
            <circle cx="0" cy="-14" r="3" fill="#fff"/>
            <circle cx="-1.5" cy="-16" r="2.2" fill="#1e3a8a"/>
          </g>
        </svg>
      </div>
      <div class="mv-maze-info">
        <div class="mv-maze-badge">${unlocked ? '✨ ปลดล็อกคริสตัลแล้ว!' : '🏛️ Emerald Sanctuary Maze'}</div>
        <h3>${esc(title)}</h3>
        <p>${esc(sub)}</p>
        <div class="mv-maze-bar"><i style="width:${Math.round(pct * 100)}%"></i></div>
      </div>
    </section>`;
  }

  /* 🏰 3. Three Pastel Floating Castle Islands + Compact Shortcuts (Home — homeFloatingIslands) */
  function mvHomeIslandsHTML({ lrHref, lrSub, nWrong, due, rvDone = 0, wk = null, readTodayDone = 0, streakDays = 0, dbKnown = 0 }) {
    const islandSvg = (id, topC, leftC, rightC, flagC, stripe1, stripe2, stripe3) => `<svg viewBox="0 0 150 175" aria-hidden="true">
      <polygon points="75,92 126,116 75,140 24,116" fill="${topC}"/>
      <path d="M24 116 L75 140 L126 116 L118 134 L75 156 L32 134 Z" fill="${stripe1}"/>
      <path d="M32 134 L75 156 L118 134 L106 149 L75 165 L44 149 Z" fill="${stripe2}"/>
      <path d="M44 149 L75 165 L106 149 L92 162 L75 171 L58 162 Z" fill="${stripe3}"/>
      <polygon points="36,56 54,65 54,114 36,105" fill="${leftC}"/>
      <polygon points="54,65 68,58 68,107 54,114" fill="${rightC}"/>
      <polygon points="52,22 36,56 54,65 68,58" fill="#1e3a4c"/>
      <line x1="52" y1="22" x2="52" y2="10" stroke="#1e293b" stroke-width="1.3"/>
      <path class="isl-flag" d="M52,12 Q66,15 76,22 Q64,23 52,19 Z" fill="${flagC}"/>
      <polygon points="84,48 102,57 102,114 84,105" fill="${leftC}"/>
      <polygon points="102,57 116,50 116,107 102,114" fill="${rightC}"/>
      <polygon points="100,14 84,48 102,57 116,50" fill="#162e40"/>
      <line x1="100" y1="14" x2="100" y2="3" stroke="#1e293b" stroke-width="1.3"/>
      <path class="isl-flag" d="M100,5 Q114,8 126,15 Q114,16 100,12 Z" fill="${flagC}"/>
      <path d="M43 96 v-14 a4.5 4.5 0 0 1 9 0 v14 Z" fill="#13293d"/>
      <path d="M91 92 v-14 a4.5 4.5 0 0 1 9 0 v14 Z" fill="#13293d"/>
      <polygon points="62,92 88,92 88,108 62,108" fill="${topC}"/>
    </svg>`;
    const shortcuts = [
      `<a class="isl-sc${due ? ' due' : ''}" href="#/review">📅 ${due ? `ทวนวันนี้ (${due})` : (rvDone ? `ทวนแล้ว (${rvDone})` : 'ทวนวันนี้')}</a>`,
      wk ? `<a class="isl-sc weak" href="#/${wk.ch.id}/${wk.s.no}">🎯 จุดอ่อนสุด ${wk.p}%</a>` : `<a class="isl-sc" href="#/quiz">📝 Quiz 10 ข้อ</a>`,
      `<a class="isl-sc" href="#/mock">⏱️ Mock Exam</a>`,
      nWrong ? `<a class="isl-sc wrong" href="#/wrong">📕 ข้อผิด (${nWrong})</a>` : '',
      `<a class="isl-sc" href="#/drill">🧠 Name Drill</a>`,
      `<a class="isl-sc" href="#/cards">🃏 Flashcards</a>`
    ].join('');
    return `<section class="mv-islands-sec" aria-label="3 เกาะปราสาทลอยน้ำและทางลัดหลัก">
      <div class="mv-islands-wrap">
        <a class="mv-isl isl-gold" id="resumeBtn" href="${esc(lrHref)}">
          <div class="mv-isl-art">${islandSvg('g', '#7ce0d3', '#fde047', '#f59e0b', '#fb7185', '#fb7185', '#1e3a5f', '#4ade80')}</div>
          <div class="mv-isl-txt"><span class="mv-isl-tag">📖 เกาะอ่านบทเรียน</span><b>อ่านต่อ &amp; รอบ 2</b><small>${esc(lrSub)}</small></div>
        </a>
        <a class="mv-isl isl-pink" href="${nWrong ? '#/wrong' : '#/mock'}">
          <div class="mv-isl-art">${islandSvg('p', '#fde68a', '#fb7185', '#e11d48', '#2dd4bf', '#38bdf8', '#fde047', '#1e3a5f')}</div>
          <div class="mv-isl-txt"><span class="mv-isl-tag">📕 เกาะฝึกโจทย์</span><b>${nWrong ? `เคลียร์ข้อผิด ${nWrong} ข้อ` : 'Mock Exam & Quiz'}</b><small>${due ? `ทวนวันนี้ ${due} รายการ` : 'เดินเขาวงกตปลดล็อกคริสตัล'}</small></div>
        </a>
        <a class="mv-isl isl-mint" href="#/db">
          <div class="mv-isl-art">${islandSvg('m', '#f9a8d4', '#5eead4', '#0d9488', '#fbbf24', '#fb7185', '#fde047', '#38bdf8')}</div>
          <div class="mv-isl-txt"><span class="mv-isl-tag">💊 เกาะจำยา &amp; เชื้อ</span><b>ปลูกต้นไม้ดอกไม้</b><small>${dbKnown ? `จำได้แล้ว ${dbKnown} ตัว 🌸` : 'Drug & Bug · Name Drill'}</small></div>
        </a>
      </div>
      <div class="mv-isl-bar">
        <div class="mv-isl-scs">${shortcuts}</div>
        <div class="mv-isl-stats"><span>📖 วันนี้ <b>${readTodayDone}</b> กล่อง</span><span>🔥 <b>${streakDays}</b> วัน</span></div>
      </div>
    </section>`;
  }

  route();
})();
