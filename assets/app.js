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
    S.hl = S.hl || {}; S.kw = S.kw || []; S.srs = S.srs || {}; S.figw = S.figw || {};
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
  // ระดับความเข้าใจ 4 ระดับ (4 = มั่นใจ) ที่ผู้ใช้เปลี่ยนได้ตลอด
  const LV = {
    4: { s: '★★★★', t: 'เข้าใจแล้ว มั่นใจมาก' },
    3: { s: '★★★', t: 'เข้าใจปานกลาง ถ้ามีเวลาให้กลับมาทวน' },
    2: { s: '★★', t: 'ไม่ค่อยเข้าใจ กลับมาทวน' },
    1: { s: '★', t: 'ไม่เข้าใจ ไม่แม่นเลย' }
  };
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
    const n = ch.sections.length, c = { 4: 0, 3: 0, 2: 0, 1: 0 };
    ch.sections.forEach(s => { const l = lvOf(ch.id, s.no); if (l) c[l]++; });
    const d = c[4] + c[3] + c[2] + c[1];
    return { n, d, c, pct: n ? Math.round(c[4] * 100 / n) : 0 };
  }
  // แถบความคืบหน้าแบ่งสีตามดาว
  function lvBar(p, big) {
    const seg = l => p.c[l] ? `<i class="lv${l}" style="width:${p.c[l] * 100 / p.n}%" title="${LV[l].s} ${p.c[l]} หัวข้อ"></i>` : '';
    return `<div class="lvbar${big ? ' big' : ''}">${seg(4)}${seg(3)}${seg(2)}${seg(1)}</div>`;
  }
  function lvLegend(p) {
    return `<div class="lvlegend">${[4, 3, 2, 1].map(l => `<span><b class="dot lv${l}"></b>${LV[l].s} ${p.c[l]}</span>`).join('')}<span><b class="dot"></b>ยังไม่ประเมิน ${p.n - p.d}</span></div>`;
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
  const BASE = { 1: 1, 2: 2, 3: 4 };
  function dueItems() {
    const t = today(), out = [];
    const due = id => { const r = S.srs[id]; return !r || r.due <= t; };
    for (const k in S.lvl) { const l = S.lvl[k]; if (l >= 1 && l <= 3 && due('b:' + k)) out.push({ type: 'box', id: 'b:' + k, k, l }); }
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

  /* ---------- sidebar ---------- */
  function renderSidebar(curCh, curNo) {
    let h = '', grp = '';
    for (const c of INDEX) {
      const ch = CH[c.id];
      if (!c.ready) continue;
      if ((c.group || '') !== grp) { grp = c.group || ''; if (grp) h += `<div class="side-grp">${esc(grp)}</div>`; }
      const p = ch ? chProgress(ch) : null;
      h += `<div class="side-ch ${grpCls(c)}"><a href="#/${c.id}">${esc(c.title)}</a>`;
      if (p) h += `<div class="side-bar">${lvBar(p)}</div>`;
      if (ch && c.id === curCh) {
        for (const pg of ch.pages) {
          h += `<div class="side-pg">หน้า ${pg.no} · ${esc(pg.title)}</div>`;
          for (const s of ch.sections.filter(x => x.page === pg.no)) {
            const l = lvOf(ch.id, s.no);
            h += `<a class="side-sec${s.no === curNo ? ' on' : ''}${l ? ' lv' + l : ''}" href="#/${ch.id}/${s.no}"><span class="n">${s.no}</span><span class="t">${esc(s.title)}</span>${boxScore(ch.id, s)}${l ? `<span class="ck">${LV[l].s}</span>` : ''}</a>`;
          }
        }
      }
      h += '</div>';
    }
    h += `<div class="side-links"><a href="#/">🏠 Home</a><a href="#/quiz">📝 Quiz</a><a href="#/wrong">📕 Mistakes</a><a href="#/cards">🃏 Flashcard</a><a href="#/stats">📊 Weak spots</a><a href="#/review">📅 Today's review</a><a href="#/db">💊 Drug & Bug</a><a href="#/numbers">🔢 Numbers</a><a href="#/flows${curCh ? '?ch=' + curCh : ''}">🩺 Diagnosis flowchart</a><a href="#/drill">🧠 Name drill</a>${curCh ? `<a href="#/map/${curCh}">🗺️ Chapter map</a><a href="#/db?view=table&ch=${curCh}">💊 Drug table</a>` : ''}<a href="#/notes">🗒️ My notes</a><a href="#/keywords">🔑 My keywords</a><a href="#/sync">☁️ Sync & App</a><a href="#/backup">💾 Backup</a><a href="#" id="hlToggle">🖍 Auto highlight: ${S.hlOff ? 'OFF' : 'ON'}</a></div>`;
    sidebar.innerHTML = h;
    const on = $('.side-sec.on', sidebar); if (on) on.scrollIntoView({ block: 'nearest' });
  }

  /* ---------- MCQ ---------- */
  function mcqHTML(chId, qid, q, opts = {}) {
    const letters = Object.keys(q.options || {});
    const src = q.source ? `<span class="src">${esc(q.source)}</span>` : '';
    const wasWrong = S.wrong[`${chId}|${qid}`] ? '<span class="src">· เคยตอบผิด</span>' : '';
    return `<div class="mcq" data-ch="${chId}" data-q="${esc(qid)}">
      <div class="qid">ข้อ ${esc(qid)} ${src} ${wasWrong} ${opts.showBox ? `<a class="src" href="#/${chId}/${q.box}">กล่อง ${q.box}</a>` : ''}</div>
      <div class="stem" data-hlk="${esc(qKey(chId, qid, 'stem'))}">${inline(esc(q.stem))}</div>
      ${q.needs_image ? '<div class="warn">ข้อนี้ข้อสอบจริงมีรูปประกอบ</div>' : ''}
      <div class="opts">${letters.map(l => `<div class="opt" role="button" tabindex="0" data-l="${l}"><span class="l">${l}</span><span class="ot" data-hlk="${esc(qKey(chId, qid, l))}">${inline(esc(q.options[l]))}</span><button class="strike" type="button" aria-label="ตัดชอยส์นี้" title="ตัดชอยส์ (ยังไม่ใช่การตอบ)">✕</button></div>`).join('')}</div>
      <div class="explain" hidden></div>
    </div>`;
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
    S.stats[k] = S.stats[k] || { r: 0, w: 0 };
    let note = '';
    if (ok) { S.stats[k].r++; if (S.wrong[k]) { delete S.wrong[k]; note = '<div class="warn">เอาออกจากกองข้อผิดแล้ว</div>'; } }
    else { S.stats[k].w++; S.wrong[k] = { ch: chId, id: qid, n: (S.wrong[k]?.n || 0) + 1, t: Date.now() }; note = '<div class="warn">เก็บเข้ากองข้อผิดแล้ว</div>'; }
    save();
    const ex = box.querySelector('.explain');
    ex.hidden = false;
    ex.innerHTML = `<div class="res ${ok ? 'ok' : 'no'}">${ok ? '✓ Correct' : `✗ ยังไม่ใช่ ตอบ ${q.answer}`}</div><div data-hlk="${esc(qKey(chId, qid, 'why'))}">${inline(esc(q.why || ''))}</div>${q.doubt ? `<div class="warn">⚠ ${esc(q.doubt)}</div>` : ''}${note}`;
    applyAllHL(ex);
    if (onDone) onDone(ok);
    if (/^#\/[^/]+\/\d+/.test(location.hash)) { const m = location.hash.match(/^#\/([^/]+)\/(\d+)/); const y = sidebar.scrollTop; renderSidebar(m[1], +m[2]); sidebar.scrollTop = y; }
  }
  view.addEventListener('click', e => {
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
    cloud: '<path d="M6.5 19h11a4 4 0 0 0 .9-7.9A5.5 5.5 0 0 0 7.7 9.3 4 4 0 0 0 6.5 19z"/>'
  };
  const EMO = { '☁': 'cloud', '🩺': 'flow', '💾': 'save', '🔢': 'hash', '💊': 'pill', '🧠': 'brain', '🖼': 'img', '🏠': 'home', '📝': 'quiz', '📕': 'wrong', '🃏': 'cards', '📊': 'stats', '📅': 'cal', '🗒': 'note', '🔑': 'key', '🗺': 'map', '🖍': 'hl', '🔍': 'search', '📖': 'book', '🔥': 'flame', '🎉': 'done', '🤔': 'think', '⚠': 'warn', '📌': 'pin', '☀': 'sun', '🌙': 'moon', '↩': 'back' };
  const EMO_RE = new RegExp(`(${Object.keys(EMO).join('|')})\\ufe0f?`, 'gu');
  const ic = n => `<svg class="ic ic-${n}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;
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
  pop.addEventListener('mousedown', e => { if (!e.target.closest('textarea')) e.preventDefault(); });
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
  let _gemCfg = null;
  async function listGeminiModels(key) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
    if (!r.ok) return ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
    const d = await r.json().catch(() => ({}));
    const all = (d.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => (m.name || '').replace(/^models\//, ''))
      .filter(n => !/image|audio|tts|embed|aqa|vision|robotics|computer-use/i.test(n));
    const flashes = all.filter(n => /^gemini-.*flash/i.test(n) && !/exp|thinking/i.test(n));
    flashes.sort((a, b) => {
      const la = /lite/i.test(a) ? 1 : 0, lb = /lite/i.test(b) ? 1 : 0;
      if (la !== lb) return la - lb;
      return b.localeCompare(a, undefined, { numeric: true });
    });
    const gemmas = all.filter(n => /^gemma-3/i.test(n)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    return [...new Set([...flashes, ...gemmas])].slice(0, 8);
  }
  async function askGemini(query, ctx = '') {
    const key = (S.geminiKey || '').trim();
    if (!key) throw new Error('NO_KEY');
    const sys = 'คุณคือผู้ช่วยติวสอบแพทย์ NLE Step 1 ตอบเป็นภาษาไทยกระชับ ชัดเจน เข้าใจง่าย ใช้ศัพท์แพทย์ภาษาอังกฤษตามมาตรฐาน เน้นนิยาม กลไก จุดแยกโรค และจุดที่ออกสอบบ่อย ความยาว 3–7 บรรทัด (ใช้ bullet ได้) ไม่อารัมภบท';
    const prompt = ctx ? `บริบทที่กำลังอ่าน: ${ctx}\nคำถาม/คำที่ต้องการค้นหา: ${query}` : query;
    const call = async (model, useSearch) => {
      const isGemma = /^gemma/i.test(model);
      const body = {
        contents: [{ role: 'user', parts: [{ text: isGemma ? `${sys}\n\n${prompt}` : prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 700 }
      };
      if (!isGemma) body.systemInstruction = { parts: [{ text: sys }] };
      if (useSearch && !isGemma) body.tools = [{ google_search: {} }];
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { const e = new Error((d.error && d.error.message) || `HTTP ${r.status}`); e.status = r.status; throw e; }
      return d;
    };

    const tries = _gemCfg ? [_gemCfg] : [{ model: 'gemini-3.8-flash', useSearch: true }, { model: 'gemini-3.8-flash', useSearch: false }];
    let d = null, lastErr = null, used = null;
    for (const t of tries) {
      try { d = await call(t.model, t.useSearch); used = t; break; }
      catch (e) { lastErr = e; if (e.status === 401 || /API key not valid/i.test(e.message)) throw e; }
    }
    if (!d) {
      // ถ้าโควตา Google Search หรือรุ่นหลักเต็ม/ติด limit 0 → วนหาโมเดล Flash / Flash-Lite / Gemma ที่ใช้ฟรีได้ให้อัตโนมัติ
      _gemCfg = null;
      const models = await listGeminiModels(key);
      for (const m of models) {
        if (m === 'gemini-3.8-flash' && !tries.some(x => x.model !== m)) continue;
        try { d = await call(m, false); used = { model: m, useSearch: false }; break; }
        catch (e) { lastErr = e; if (e.status === 401 || /API key not valid/i.test(e.message)) throw e; }
      }
    }
    if (!d) throw lastErr || new Error('เชื่อมต่อ Gemini ไม่สำเร็จ');
    _gemCfg = used;
    const cand = (d.candidates || [])[0] || {};
    const text = ((cand.content && cand.content.parts) || []).map(p => p.text || '').join('').trim();
    if (!text) throw new Error('Gemini ไม่ได้ส่งข้อความกลับมา');
    const chunks = ((cand.groundingMetadata && cand.groundingMetadata.groundingChunks) || []).map(c => c.web).filter(w => w && w.uri);
    const seen = new Set(), sources = [];
    for (const w of chunks) { if (!seen.has(w.uri)) { seen.add(w.uri); sources.push({ title: w.title || new URL(w.uri).hostname, uri: w.uri }); } }
    return { text, sources: sources.slice(0, 4), model: used.model, grounded: used.useSearch };
  }
  function aiFormat(md) {
    const lines = esc(md).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').split('\n');
    let out = '', inUl = false;
    for (const raw of lines) {
      const l = raw.trim();
      if (!l) { if (inUl) { out += '</ul>'; inUl = false; } continue; }
      const m = l.match(/^(?:[-*•]|\d+\.)\s+(.+)/);
      if (m) { if (!inUl) { out += '<ul>'; inUl = true; } out += `<li>${m[1]}</li>`; }
      else { if (inUl) { out += '</ul>'; inUl = false; } out += `<p>${l}</p>`; }
    }
    if (inUl) out += '</ul>';
    return out;
  }
  // ช่องค้นหาในแอปด้วย Gemini + Google Search (ไม่ต้องสลับแอปไปมา)
  function openSearch(onNote) {
    pop.dataset.mode = 'note'; pop.classList.add('writing', 'ai-pop');
    const w = Math.min(440, document.documentElement.clientWidth - 16);
    const curLeft = parseFloat(pop.style.left) || 8;
    pop.style.left = Math.max(8, Math.min(curLeft, document.documentElement.clientWidth - w - 8)) + 'px';
    const hasKey = !!(S.geminiKey && S.geminiKey.trim());
    const initQ = kwNorm(popText);
    const ctx = currentBoxCtx();
    pop.innerHTML = `<div class="note-kind">✨ ถาม Gemini / ค้นหา · ไม่ต้องสลับแอป</div>
      <textarea class="note-in" rows="2" placeholder="พิมพ์คำศัพท์หรือคำถาม…">${esc(initQ)}</textarea>
      <div class="ai-chips"><button class="btn small" data-q="สรุปสั้นๆ">สรุปสั้น</button><button class="btn small" data-q="อธิบายกลไก">กลไก</button><button class="btn small" data-q="จุดที่ชอบออกสอบ NLE">ออกสอบตรงไหน</button><button class="btn small" data-q="แยกโรค (DDx) ยังไง">แยกโรค</button></div>
      <div class="note-act"><button class="btn small" data-a="g">Google ↗</button><button class="btn small" data-a="x">ปิด</button><button class="btn small primary" data-a="ai">✨ ถาม Gemini</button></div>
      <div class="ai-ans" id="aiPopAns">${hasKey ? '' : '<p class="muted" style="margin:6px 0 0;font-size:13px">⚙️ ยังไม่ได้ใส่ Gemini API Key (ฟรี) → <a href="#/sync" id="aiGoSync">ไปตั้งค่าที่หน้า Sync</a> หรือกด <b>Google ↗</b> ได้เลย</p>'}</div>`;
    const ta = pop.querySelector('textarea'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    const ansEl = pop.querySelector('#aiPopAns');
    const goSync = pop.querySelector('#aiGoSync'); if (goSync) goSync.onclick = () => hidePop();
    let reqId = 0;
    async function runAI(extra) {
      const base = ta.value.trim(); if (!base) return;
      const q = extra ? `${base} (${extra})` : base;
      if (!(S.geminiKey && S.geminiKey.trim())) { toast('กรุณาใส่ Gemini API Key ในหน้า Sync ก่อนครับ'); return; }
      const my = ++reqId;
      ansEl.innerHTML = '<div class="ai-load">✨ กำลังค้นหาและสรุปคำตอบจาก Gemini…</div>';
      try {
        const res = await askGemini(q, ctx);
        if (my !== reqId || pop.hidden) return;
        const srcHtml = res.sources.length ? `<div class="ai-src"><span>แหล่งอ้างอิง:</span> ${res.sources.map(s => `<a href="${esc(s.uri)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join('')}</div>` : '';
        ansEl.innerHTML = `<div class="ai-body">${aiFormat(res.text)}</div>${srcHtml}<div class="ai-foot">${onNote ? '<button class="btn small" data-f="note">📌 เซฟเป็นโน้ต</button>' : ''}<button class="btn small" data-f="cp">📋 คัดลอก</button><button class="btn small" data-f="g">Google ↗</button></div>`;
        const bNote = ansEl.querySelector('[data-f="note"]');
        if (bNote && onNote) bNote.onclick = () => { pop.classList.remove('ai-pop'); openNote(onNote, res.text.replace(/\*\*/g, ''), true); };
        const bCp = ansEl.querySelector('[data-f="cp"]');
        if (bCp) bCp.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(res.text).then(() => toast('คัดลอกคำตอบแล้ว')).catch(() => {}); };
        const bG = ansEl.querySelector('[data-f="g"]');
        if (bG) bG.onclick = () => searchOut(ta.value);
      } catch (e) {
        if (my !== reqId || pop.hidden) return;
        ansEl.innerHTML = `<div class="ai-err">⚠️ ${esc(e.message === 'NO_KEY' ? 'ยังไม่ได้ใส่ Gemini API Key' : e.message)} <a href="#/sync" id="aiErrSync">เช็ก API Key</a></div>`;
        const lk = ansEl.querySelector('#aiErrSync'); if (lk) lk.onclick = () => hidePop();
      }
    }
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (S.geminiKey && S.geminiKey.trim()) runAI(); else { searchOut(ta.value); hidePop(); } } });
    pop.querySelectorAll('.ai-chips button').forEach(b => b.onclick = () => runAI(b.dataset.q));
    pop.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      if (b.dataset.a === 'ai') return runAI();
      if (b.dataset.a === 'g') { searchOut(ta.value); hidePop(); return; }
      hidePop();
    });
    // ถ้าตั้งค่า Gemini Key ไว้แล้ว ให้สรุปคำที่เลือกทันทีเหมือนกล่อง AI Overview ของ Google
    if (hasKey && initQ) runAI();
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
  // กล่องพิมพ์โน้ตในแถบเดียวกัน
  function openNote(onNote, cur, sticky) {
    pop.dataset.mode = 'note'; pop.classList.remove('ai-pop'); pop.classList.add('writing');
    pop.innerHTML = `<div class="note-kind">${sticky ? '🗒️ Sticky note' : '★ Star note'}</div><textarea class="note-in${sticky ? ' sticky' : ''}" rows="3" placeholder="พิมพ์โน้ต จะแสดงต่อจากข้อความที่เลือก">${esc(cur || '')}</textarea><div class="note-act">${cur ? '<button class="btn small" data-a="del">Delete note</button>' : ''}<button class="btn small" data-a="x">Cancel</button><button class="btn small primary" data-a="ok">Save</button></div>`;
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
  function hidePop() { pop.hidden = true; pop.dataset.mode = ''; pop.dataset.inNote = ''; pop.classList.remove('writing'); }
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
  // ปิดแถบสีเมื่อแตะที่อื่น (การเลื่อนหน้าไม่ปิด)
  document.addEventListener('click', e => { if (!pop.hidden && (pop.dataset.mode === 'edit' || pop.dataset.mode === 'note') && e.target.isConnected && !pop.contains(e.target) && !e.target.closest('mark.user-hl')) hidePop(); });
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
  const hasData = (o = S) => !!(o && (Object.keys(o.hl || {}).length || (o.kw || []).length || Object.keys(o.lvl || {}).length || Object.keys(o.notes || {}).length || Object.keys(o.wrong || {}).length || Object.keys(o.known || {}).length || Object.keys(o.stats || {}).length || Object.keys(o.srs || {}).length || Object.keys(o.read || {}).length || o.plan));
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
    view.innerHTML = `<div class="hero"><h1>☁️ Sync &amp; App</h1><p>ซิงค์ข้อมูลข้ามเครื่องด้วย Google และติดตั้งเป็นแอปไว้อ่านแบบออฟไลน์</p></div>
      <div class="panel"><h3>🔐 Google Cloud Sync</h3>${cloudHtml}
        <div class="today-chips" style="margin-top:12px"><span>ไฮไลต์/โน้ต <b>${nHl}</b></span><span>Keywords <b>${S.kw.length}</b></span><span>ประเมินแล้ว <b>${Object.keys(S.lvl).length}</b></span><span>รูป <b>${imgKeys.length}</b></span></div>
      </div>
      <div class="panel"><h3>✨ Gemini AI Search (ตอบในแอป ไม่ต้องสลับหน้า)</h3>
        ${gKey ? `<div class="sync-badge ok">✓ พร้อมใช้งานแล้ว (${esc(gMask)}) · ซิงค์เข้าบัญชี Google ให้อัตโนมัติ</div>` : '<div class="sync-badge">ยังไม่ได้ใส่ Gemini API Key</div>'}
        <p class="muted">ลากคลุมคำแล้วกด <b>🔍</b> หรือค้นหาจากแถบด้านบน → Gemini จะค้นข้อมูล Google แล้วสรุปคำตอบให้ทันทีในหน้าเดิม (ใช้คีย์ฟรีจาก <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio ↗</a> ไม่ต้องผูกบัตร)</p>
        <div class="ai-key-row"><input type="password" id="gKeyIn" placeholder="วาง Gemini API Key (AIzaSy…)" value="${esc(gKey)}" autocomplete="off"><button class="btn small" id="gKeyEye" title="แสดง/ซ่อน">👁</button></div>
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

    const bIn = $('#syIn'); if (bIn) bIn.onclick = () => window.NLE_SYNC.signInGoogle();
    const bOut = $('#syOut'); if (bOut) bOut.onclick = () => window.NLE_SYNC.signOut();
    const bNow = $('#syNow'); if (bNow) bNow.onclick = () => window.NLE_SYNC.syncNow();
    const gIn = $('#gKeyIn'), gEye = $('#gKeyEye'), gSave = $('#gKeySave'), gTest = $('#gKeyTest'), gDel = $('#gKeyDel'), gMsg = $('#gKeyMsg');
    if (gEye && gIn) gEye.onclick = () => { gIn.type = gIn.type === 'password' ? 'text' : 'password'; };
    if (gSave && gIn) gSave.onclick = () => {
      _gemCfg = null;
      const v = gIn.value.trim();
      if (!v) { delete S.geminiKey; save(); toast('ลบ Gemini Key แล้ว'); return vSync(); }
      S.geminiKey = v; save(); toast('บันทึก Gemini Key แล้ว (ซิงค์ข้ามเครื่องอัตโนมัติ)'); vSync();
    };
    if (gDel) gDel.onclick = () => { _gemCfg = null; delete S.geminiKey; save(); toast('ลบ Gemini Key แล้ว'); vSync(); };
    if (gTest) gTest.onclick = async () => {
      _gemCfg = null;
      gTest.disabled = true; gMsg.textContent = '✨ กำลังทดสอบเชื่อมต่อ Gemini…';
      try { const r = await askGemini('DKA triad คืออะไร สรุป 1 บรรทัด'); gMsg.innerHTML = `<span style="color:var(--ok)">✓ เชื่อมต่อสำเร็จ (${esc(r.model)}${r.grounded ? ' + Google Search' : ''})!</span> ตัวอย่างคำตอบ: ${esc(r.text.slice(0, 140))}`; }
      catch (e) { gMsg.innerHTML = `<span style="color:var(--bad)">✗ ไม่สำเร็จ: ${esc(e.message)}</span>`; }
      finally { gTest.disabled = false; }
    };
    const bInst = $('#pwaInst'); if (bInst) bInst.onclick = () => window.NLE_SYNC.installPWA();
    const bRel = $('#pwaReload');
    if (bRel) bRel.onclick = async () => {
      bRel.disabled = true; bRel.textContent = 'กำลังอัปเดต…';
      try {
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
    for (const l of [4, 3, 2, 1]) { if (!p.c[l]) continue; const b = a + p.c[l] * 100 / p.n; st.push(`var(--lv${l}) ${a}% ${b}%`); a = b; }
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
      <div class="plan-chs">${chList.map(c => `<label class="${grpCls(c)}"><input type="checkbox" value="${c.id}"${sel.has(c.id) ? ' checked' : ''}>${esc(c.title.split(' · ')[0])}</label>`).join('')}</div>
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
    const tiles = groups.map(g => `<h2 class="grid-h ${g ? 'g-clip' : 'g-main'}">${esc(g || '📘 สรุปบท A3')}</h2><div class="grid">${INDEX.filter(c => (c.group || '') === g).map(tile).join('')}</div>`).join('');
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
    view.innerHTML = `<div class="hero home-hero"><h1>nannie compre website</h1>${backupDue() ? `<a class="bk-warn" href="#/backup">💾 ${S.lastBackup ? 'ไม่ได้สำรองข้อมูลมาเกิน 7 วัน' : 'ยังไม่เคยสำรองไฮไลต์และโน้ต'} · กดเพื่อ Backup</a>` : ''}</div>
    <section class="dash"><div class="dash-h"><h2>วันนี้ควรทำอะไร</h2>${chips}</div>${planHTML()}<div class="dash-grid">${acts}</div></section>
    <p class="split-hint">เลขหัวข้อในเว็บตรงกับเลขกล่องในชีท A3 เปิดคู่กันแบบ split view แล้วพิมพ์เลขกล่องที่ปุ่มมุมขวาล่างเพื่อกระโดดไปได้ทันที</p>${tiles}
    <details class="panel legend-panel"><summary>สัญลักษณ์ในเนื้อหา</summary><div class="card think" style="margin:8px 0"><div class="lbl">🤔 หยุดคิดก่อน</div>คำถามสั้นให้ลองตอบในใจก่อนกดดูเฉลย</div><div class="card trap" style="margin:8px 0"><div class="lbl">⚠️ กับดักข้อสอบ</div>จุดที่ข้อสอบชอบหลอก</div><div class="card note" style="margin:8px 0"><div class="lbl">📌 อาจารย์เน้น</div>สิ่งที่อาจารย์ติวย้ำ</div><div class="card hint" style="margin:8px 0"><div class="lbl">🎯 อาจารย์บอกข้อสอบ</div>ข้อที่อาจารย์ผู้ออกข้อสอบยกมาหรือบอกว่าออก กด ▶ เวลา เพื่อเปิดคลิปตรงจุดนั้น</div><p style="margin:8px 0 0"><span class="tag e">ออกสอบ</span> <span class="tag s">เสริม</span> นอกคลิป <span class="tag x">ข้ามบท</span></p><div class="content legend-row"><span><b>คำสำคัญ</b> ไฮไลต์เหลือง</span><span class="hl-exam" style="display:inline-block;background:var(--hl-exam);border-left:3px solid var(--exam);padding:0 8px">ประโยคที่เคยออกสอบ</span><span><mark class="user-hl c-y">ไฮไลต์</mark> <mark class="user-hl c-g">ของ</mark> <mark class="user-hl c-b">ฉัน</mark> <mark class="user-hl c-p">มี</mark> <mark class="user-hl c-v">6</mark> <mark class="user-hl c-r">สี</mark> เลือกข้อความเอง</span></div><p class="bar-label">ปิดไฮไลต์อัตโนมัติได้ที่เมนูด้านข้าง</p></details>`;
    bindPlan();
  }
  async function vChapter(id) {
    await loadIndex(); const ch = await loadChapter(id); if (!ch) return vHome();
    renderSidebar(id);
    const p = chProgress(ch);
    let h = `<div class="crumb"><a href="#/">หน้าแรก</a></div><div class="hero"><h1>${esc(ch.title)}</h1><p>${esc(ch.source || '')}</p></div>
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
      h += `<section class="exam-sec"><h2>📝 Past exam questions</h2><p class="bar-label">กดเลือกคำตอบ ข้อที่ตอบผิดจะเข้ากองข้อผิดให้อัตโนมัติ</p>`;
      for (const qid of s.examIds) h += mcqHTML(id, qid, ch.exams[qid]);
      h += '</section>';
    }
    h += `<div class="lvpick"><div class="lvq">How well do you understand this box? (tap again to clear)</div>${[4, 3, 2, 1].map(l => `<button class="lvbtn lv${l}${S.lvl[k] === l ? ' on' : ''}" data-lv="${l}"><span class="st">${LV[l].s}</span><span>${LV[l].t}</span></button>`).join('')}</div>
      <nav class="pager">${prev ? `<a href="#/${id}/${prev.no}"><small>← ก่อนหน้า</small>${prev.no}. ${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a class="next" href="#/${id}/${next.no}"><small>ถัดไป →</small>${next.no}. ${esc(next.title)}</a>` : ''}</nav>
      <div class="jump"><a href="${prev ? `#/${id}/${prev.no}` : '#/' + id}" aria-label="ก่อนหน้า">‹</a><button id="undoBtn" hidden title="เลิกทำไฮไลต์ล่าสุด" aria-label="เลิกทำ">↶</button><button id="focusBtn" title="โหมดอ่าน: ซ่อนเมนูข้าง" aria-label="โหมดอ่าน">${S.focus ? '⤡' : '⤢'}</button><input id="jumpIn" inputmode="numeric" placeholder="${s.no}" aria-label="ไปกล่อง"><a href="${next ? `#/${id}/${next.no}` : '#/' + id}" aria-label="ถัดไป">›</a></div>`;
    view.innerHTML = h;
    view.querySelectorAll('.lvbtn').forEach(b => b.onclick = () => { const l = +b.dataset.lv; if (S.lvl[k] === l) delete S.lvl[k]; else S.lvl[k] = l; save(); rerender(); });
    pop.hidden = true; pop.dataset.mode = '';
    expandAbbr($('article.content', view), ch.abbr);
    initFigs($('article.content', view), k);
    buildToc(); setTimeout(trackRead, 300); coverTools(view); flowHints(view);
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
  // แถบความคืบหน้าการอ่านใต้แถบบน + หัวข้อที่กำลังอ่าน
  const rbar = document.createElement('div'); rbar.className = 'readbar'; document.body.appendChild(rbar);
  addEventListener('scroll', () => {
    const onSec = /^#\/[^/]+\/\d+$/.test(location.hash);
    const h = document.documentElement.scrollHeight - innerHeight;
    rbar.style.width = onSec && h > 0 ? Math.min(100, scrollY * 100 / h) + '%' : '0';
    if (onSec) trackRead();
    if (onSec && tocNav && document.contains(tocNav)) {
      let cur = -1; tocHs.forEach((x, i) => { if (x.getBoundingClientRect().top < 120) cur = i; });
      tocNav.querySelectorAll('button[data-i]').forEach(b => b.classList.toggle('on', +b.dataset.i === cur));
    }
  }, { passive: true });

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
    <div class="panel"><h3>บท</h3><div class="choice" id="qCh">${ready.map(c => `<label><input type="checkbox" value="${c.id}" ${!pre || pre === c.id ? 'checked' : ''}>${esc(c.title)}</label>`).join('')}</div>
    <h3>ขอบเขต</h3><div class="choice" id="qScope"><label><input type="radio" name="sc" value="all" checked>ทุกหัวข้อ</label><label><input type="radio" name="sc" value="weak">เฉพาะหัวข้อที่ยังไม่แม่น (★–★★)</label><label><input type="radio" name="sc" value="done">เฉพาะหัวข้อที่ประเมินแล้ว</label><label><input type="radio" name="sc" value="hot">เฉพาะหัวข้อออกบ่อย (★★★)</label><label><input type="radio" name="sc" value="new">ข้อที่ยังไม่เคยทำ</label></div>
    <h3>จำนวนข้อ</h3><div class="choice" id="qN">${[10, 20, 40].map((n, i) => `<label><input type="radio" name="qn" value="${n}" ${i === 0 ? 'checked' : ''}>${n} ข้อ</label>`).join('')}<label><input type="radio" name="qn" value="999">ทั้งหมด</label></div>
    <button class="btn primary" id="qGo">Start</button> <span class="bar-label" id="qInfo"></span></div>`;
    const go = () => {
      const chs = [...view.querySelectorAll('#qCh input:checked')].map(x => x.value);
      const sc = view.querySelector('#qScope input:checked').value;
      const n = +view.querySelector('#qN input:checked').value;
      const f = (c, qid, q) => {
        if (sc === 'done') return !!lvOf(c, q.box);
        if (sc === 'weak') { const l = lvOf(c, q.box); return l === 1 || l === 2; }
        if (sc === 'hot') { const s = CH[c].sections.find(x => x.no === +q.box); return s && s.stars >= 3; }
        if (sc === 'new') return !S.stats[`${c}|${qid}`];
        return true;
      };
      return { items: shuffle(pool(chs, f)).slice(0, n) };
    };
    const info = () => { const r = go(); $('#qInfo').textContent = `จะได้ ${r.items.length} ข้อ`; };
    view.querySelectorAll('input').forEach(x => x.addEventListener('change', info)); info();
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
      <div class="panel"><div class="choice" id="fCh">${ready.map(c => `<label><input type="checkbox" value="${c.id}" ${!pre || pre === c.id ? 'checked' : ''}>${esc(c.title)}</label>`).join('')}</div>
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
    view.querySelectorAll('input').forEach(x => x.addEventListener('change', info)); info();
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
      <div class="map-legend">${[4, 3, 2, 1].map(l => `<span class="mn lv${l}">${LV[l].s}</span>`).join('')}<span class="mn">ยังไม่ประเมิน</span><span class="mn today">อ่านวันนี้</span><span class="mn"><span class="bxs full">(4/4)</span> คะแนนข้อสอบ</span></div>
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
  /* หน้า Keyword: เรียงตามบทและกล่อง ติ๊กว่าทวนแล้วได้ */
  let kwFlash = '';
  async function vKeywords() {
    await loadAll(); renderSidebar();
    const left = S.kw.filter(x => !x.ok).length;
    let h = `<div class="hero"><h1>🔑 My keywords</h1><p>ลากเลือกคำเพื่อไฮไลต์/เปลี่ยนสีได้ · ↗ กลับไปอ่านตรงจุดนั้น · ติ๊กช่องเมื่อทวนแล้ว · ✎ แก้คำหรือคำที่เน้น · ยังไม่ได้ทวน ${left} จาก ${S.kw.length} คำ</p></div>`;
    if (!S.kw.length) { view.innerHTML = h + '<p class="empty">ยังไม่มี keyword ลองเลือกข้อความในเนื้อหาหรือข้อสอบแล้วกด 🔑</p>'; return; }
    h += `<div class="choice kw-filter"><label><input type="checkbox" id="kwHide" ${S.kwHide ? 'checked' : ''}> Hide reviewed</label><button class="btn small" id="kwShuffle">Random review</button></div>`;
    h += '<div class="kw-cols">';
    const groups = {};
    S.kw.forEach((x, i) => { const g = `${x.ch}|${x.box}`; (groups[g] = groups[g] || []).push(i); });
    const keys = Object.keys(groups).sort((a, b) => { const [ca, ba] = a.split('|'), [cb, bb] = b.split('|'); return ca === cb ? ba - bb : chNum(ca) - chNum(cb) || (ca < cb ? -1 : 1); });
    for (const g of keys) {
      const [c, box] = g.split('|'); const ch = CH[c]; const sec = ch && ch.sections.find(x => x.no === +box);
      const items = groups[g].filter(i => !(S.kwHide && S.kw[i].ok)); if (!items.length) continue;
      h += `<div class="kw-group"><h3><a href="#/${c}/${box}"><b>${box}</b> ${sec ? esc(sec.title) : ''}</a><small>${ch ? esc(ch.title) : ''}</small></h3><ul class="kw-list">`
        + items.map(i => { const x = S.kw[i]; return `<li class="kwi${x.ok ? ' ok' : ''}"><button class="kw-ok" data-i="${i}" title="ทวนแล้ว">${x.ok ? '✓' : ''}</button><span class="kwt" data-hlk="kw:${x.at}">${kwHTML(x.d || x.t)}</span><a class="kw-go" href="#/${c}/${box}" data-kwt="${esc(x.t)}" title="ไปอ่านตรงจุดนั้น">↗</a>${x.q ? `<small>ข้อ ${esc(x.q)}</small>` : ''}<button class="kw-ed" data-i="${i}" title="แก้ไข">✎</button><button class="kw-del" data-i="${i}" title="ลบ">✕</button></li>`; }).join('')
        + '</ul></div>';
    }
    view.innerHTML = h + '</div>';
    applyAllHL(view);
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
      const pool = S.kw.filter(x => !x.ok); if (!pool.length) return toast('All keywords reviewed');
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
      </div><div class="drill-tables">${all.map((t, i) => `<label><input type="checkbox" value="${i}" ${DRUGBUG.test(t.head.join(' ')) ? 'checked' : ''}> <b>${t.box}</b> ${esc(t.head.join(' · '))}</label>`).join('')}</div>
      <div class="choice"><label><input type="radio" name="dn" value="10" checked>10 ข้อ</label><label><input type="radio" name="dn" value="20">20 ข้อ</label><label><input type="radio" name="dn" value="40">40 ข้อ</label></div>
      <button class="btn primary" id="dGo">Start drill</button></div>`;
    view.innerHTML = h;
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
      ${chs.length > 1 ? `<div class="db-chs">${chs.map(c => `<label><input type="checkbox" value="${c}" checked> ${c.toUpperCase()}</label>`).join('')}</div>` : ''}
      <details class="db-cats" id="dbCats"${f.cat.length ? ' open' : ''}><summary>🗂️ กรองตามหมวด <small id="dbCatN"></small></summary><div id="dbCatBody"></div></details>
      <div class="db-az" id="dbAz"></div><div class="db-grid" id="dbGrid"></div>`;
    const grid = $('#dbGrid'), az = $('#dbAz'), catBody = $('#dbCatBody');
    const chOn = () => { const on = new Set([...view.querySelectorAll('.db-chs input:checked')].map(x => x.value)); return e => !view.querySelector('.db-chs') || e.src.some(x => on.has(x.ch)); };
    const ck = (kind, s) => kind + '|' + s;
    const drawCats = () => {
      const okCh = chOn(), kinds = f.k === 'all' ? ['drug', 'bug'] : [f.k], cat = new Set(f.cat);
      catBody.innerHTML = kinds.map(kind => `<div class="cat-kind"><div class="cat-kh">${kind === 'drug' ? '💊 Drugs' : '🦠 Bugs'}</div>${tree[kind].map(({ g, subs }) => {
        const cnt = s => all.filter(e => e.kind === kind && e.sub === s && okCh(e)).length;
        const vis = subs.filter(s => cnt(s)); if (!vis.length) return '';
        const n = vis.filter(s => cat.has(ck(kind, s))).length;
        return `<div class="cat-g"><label class="cat-gl"><input type="checkbox" data-g="${esc(kind + '|' + g)}" ${n === vis.length ? 'checked' : ''} ${n && n < vis.length ? 'data-ind="1"' : ''}><b>${esc(g)}</b></label><div class="cat-subs">${vis.map(s => `<label><input type="checkbox" data-s="${esc(ck(kind, s))}" ${cat.has(ck(kind, s)) ? 'checked' : ''}> ${esc(s)} <small>${cnt(s)}</small></label>`).join('')}</div></div>`;
      }).join('')}</div>`).join('') + `<button class="btn small" id="dbCatClr">ล้างหมวด (แสดงทั้งหมด)</button>`;
      catBody.querySelectorAll('[data-ind]').forEach(x => x.indeterminate = true);
      $('#dbCatN').textContent = f.cat.length ? `· เลือก ${f.cat.length} หมวด` : '· ยังไม่เลือก = แสดงทุกหมวด';
    };
    catBody.addEventListener('change', e => {
      const x = e.target; const set = new Set(f.cat);
      if (x.dataset.s) { x.checked ? set.add(x.dataset.s) : set.delete(x.dataset.s); }
      else if (x.dataset.g) { x.closest('.cat-g').querySelectorAll('[data-s]').forEach(s => x.checked ? set.add(s.dataset.s) : set.delete(s.dataset.s)); }
      f.cat = [...set]; save(); drawCats(); draw();
    });
    catBody.addEventListener('click', e => { if (e.target.id === 'dbCatClr') { f.cat = []; save(); drawCats(); draw(); } });
    const draw = () => {
      const q = $('#dbq').value.trim().toLowerCase(), okCh = chOn(), cat = new Set(f.cat);
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
      }).join('') || '<p class="empty">ไม่เจอชื่อที่ค้น</p>';
      az.innerHTML = letters.map(L => `<a href="#" data-l="${L}">${L}</a>`).join('');
      grid.classList.toggle('covering', !!f.cover);
    };
    view.querySelectorAll('.seg button').forEach(b => b.onclick = () => { f.k = b.dataset.k; save(); view.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === b)); drawCats(); draw(); });
    $('#dbq').oninput = draw;
    $('#dbCover').onchange = e => { f.cover = e.target.checked ? 1 : 0; save(); grid.querySelectorAll('.db-v.shown').forEach(x => x.classList.remove('shown')); draw(); };
    view.querySelectorAll('.db-chs input').forEach(x => x.onchange = () => { drawCats(); draw(); });
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
      <div class="db-bar"><select id="flCh"><option value="">ทุกบท</option>${chs.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.title)} (${c.flows.length})</option>`).join('')}</select>
        <input id="flq" type="search" placeholder="ค้น เช่น cortisol, Cushing, Ca…">
        <label class="db-cv"><input type="checkbox" id="flCover" ${f.cover ? 'checked' : ''}> Cover ผลวินิจฉัย</label></div>
      <div class="dt-gs" id="flGs"></div><div id="flBody"></div>`;
    const body = $('#flBody'), gs = $('#flGs');
    const draw = () => {
      const q = $('#flq').value.trim().toLowerCase(), c = $('#flCh').value;
      const txt = n => [n.t, n.s, n.e, ...(n.c || []).map(txt), n.then ? txt(n.then) : ''].filter(Boolean).join(' ');
      let html = '';
      for (const ch of chs) {
        if (c && ch.id !== c) continue;
        const fs = ch.flows.filter(x => !q || (x.title + ' ' + (x.cat || '') + ' ' + txt(x.root)).toLowerCase().includes(q)); if (!fs.length) continue;
        html += `<h2 class="fl-ch">${esc(ch.title)}</h2>`;
        let cat = null;
        for (const x of fs) {
          if (x.cat && x.cat !== cat) { cat = x.cat; html += `<h3 class="fl-cat" id="flc-${esc(ch.id)}-${esc(cat).replace(/[^\w\u0E00-\u0E7F]+/g, '')}" data-n="${esc(c ? cat : ch.id.toUpperCase() + ' · ' + cat)}">${esc(cat)}</h3>`; }
          html += flowHTML(x, '', `<a class="fl-box" href="#/${ch.id}/${x.box}" title="ไปที่กล่อง ${x.box}">${ch.id.toUpperCase()}·${x.box}</a>`);
        }
      }
      body.innerHTML = html || '<p class="empty">ไม่เจอที่ค้น</p>';
      body.classList.toggle('fl-covering', !!f.cover);
      flowHints(body);
      gs.innerHTML = [...body.querySelectorAll('.fl-cat')].map(x => `<a href="#" data-g="${x.id}">${esc(x.dataset.n)}</a>`).join('');
    };
    $('#flq').oninput = draw;
    $('#flCh').onchange = e => { history.replaceState(null, '', e.target.value ? `#/flows?ch=${e.target.value}` : '#/flows'); draw(); };
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
    const n = k => all.filter(x => k === 'all' || x.t === k).length;
    view.innerHTML = `<div class="hero"><h1>🔢 Numbers</h1><p>ตัวเลข cutpoint ค่าปกติ และสูตรคำนวณของทุกบทในหน้าเดียว · เปิด Cover mode แล้วแตะทีละช่องเพื่อท่อง · เพิ่มบทใหม่แล้วหน้านี้อัปเดตเอง</p></div>
      <div class="db-bar"><div class="seg">${[['all', 'All'], ['cut', 'Cutpoints'], ['f', 'Formulas']].map(([k, l]) => `<button class="${f.k === k ? 'on' : ''}" data-k="${k}">${l} <small>${n(k)}</small></button>`).join('')}</div>
        <input id="nuq" type="search" placeholder="ค้น เช่น PaO2, Light, FEV1…">
        <label class="db-cv"><input type="checkbox" id="nuCover" ${f.cover ? 'checked' : ''}> Cover mode</label></div>
      <div class="nu-grid" id="nuGrid"></div>`;
    const grid = $('#nuGrid');
    const draw = () => {
      const q = $('#nuq').value.trim().toLowerCase();
      const list = all.filter(x => (f.k === 'all' || x.t === f.k) && (!q || (x.cat + ' ' + x.name + ' ' + x.v + ' ' + (x.note || '')).toLowerCase().includes(q)));
      const groups = {}; list.forEach(x => (groups[(x.t === 'f' ? 'สูตร · ' : '') + x.cat] = groups[(x.t === 'f' ? 'สูตร · ' : '') + x.cat] || []).push(x));
      grid.innerHTML = Object.entries(groups).map(([g, xs]) => `<section class="nu-card ${xs[0].t === 'f' ? 'f' : ''}"><h3>${esc(g)}</h3>${xs.map(x => `<div class="nu-row"><div class="nu-n">${esc(x.name)} <a href="#/${x.ch}/${x.box}" title="ไปที่กล่อง ${x.box}">${x.ch.toUpperCase()}·${x.box}</a></div><div class="nu-v${x.t === 'f' ? ' flow' : ''}">${inline(esc(x.v))}</div>${x.note ? `<div class="nu-note">${inline(esc(x.note))}</div>` : ''}</div>`).join('')}</section>`).join('') || '<p class="empty">ไม่เจอที่ค้น</p>';
      grid.classList.toggle('covering', !!f.cover);
    };
    view.querySelectorAll('.seg button').forEach(b => b.onclick = () => { f.k = b.dataset.k; save(); view.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === b)); draw(); });
    $('#nuq').oninput = draw;
    $('#nuCover').onchange = e => { f.cover = e.target.checked ? 1 : 0; save(); draw(); };
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
    const aiCard = `<div class="panel ai-card"><div class="ai-card-h"><b>✨ Gemini สรุปจาก Google</b><button class="btn small" id="srGoogle">Google ↗</button></div><div id="srAiBody">${hasKey ? '<div class="ai-load">✨ กำลังค้นหาและสรุปคำตอบ…</div>' : '<p class="muted" style="margin:4px 0 0;font-size:14px">ยังไม่ได้ใส่ Gemini API Key (ฟรี) · <a href="#/sync">ตั้งค่าที่หน้า ☁️ Sync</a> เพื่อให้ขึ้นคำตอบจาก Gemini ตรงนี้ทันทีทุกครั้งที่ค้นหา</p>'}</div></div>`;
    view.innerHTML = `<div class="hero"><h1>ค้นหา “${esc(q)}”</h1><p>เจอในตำรา ${hits.length} ที่</p></div>${aiCard}` + hits.filter(x => x.s).map(x => `<a class="search-hit" href="#/${x.ch.id}/${x.s.no}"><b>${x.s.no}. ${esc(x.s.title)}</b> · ${esc(x.ch.title)}<small>…${hl(x.snip)}…</small></a>`).join('');
    const bG = $('#srGoogle'); if (bG) bG.onclick = () => searchOut(q);
    if (hasKey) {
      const box = $('#srAiBody');
      askGemini(q).then(res => {
        if (!box || !box.isConnected) return;
        const srcHtml = res.sources.length ? `<div class="ai-src"><span>แหล่งอ้างอิง:</span> ${res.sources.map(s => `<a href="${esc(s.uri)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join('')}</div>` : '';
        box.innerHTML = `<div class="ai-body">${aiFormat(res.text)}</div>${srcHtml}`;
      }).catch(e => {
        if (!box || !box.isConnected) return;
        box.innerHTML = `<div class="ai-err">⚠️ ${esc(e.message)} · <a href="#/sync">เช็ก API Key</a></div>`;
      });
    }
  }

  /* ---------- router ---------- */
  async function route() {
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
    if (e.target.id !== 'hlToggle') return;
    e.preventDefault(); S.hlOff = !S.hlOff; save();
    document.documentElement.classList.toggle('no-hl', S.hlOff);
    e.target.textContent = `🖍 Auto highlight: ${S.hlOff ? 'OFF' : 'ON'}`;
  });
  $('#searchForm').onsubmit = e => { e.preventDefault(); location.hash = '#/search?q=' + encodeURIComponent($('#searchInput').value); };
  const themeBtn = $('#themeBtn');
  const isDark = () => document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const syncTheme = () => { themeBtn.textContent = isDark() ? '☀️' : '🌙'; };
  themeBtn.onclick = () => { S.theme = isDark() ? 'light' : 'dark'; document.documentElement.dataset.theme = S.theme; save(); syncTheme(); };
  syncTheme();
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
        syncTheme();
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
