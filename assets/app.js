/* ตำราคู่ชีท — โครงเว็บ (ไม่ต้องแก้ไฟล์นี้เวลาเพิ่มบท: เพิ่มแค่ data/<id>.md + data/<id>-exams.json แล้วใส่ชื่อใน data/chapters.json) */
(function () {
  'use strict';
  const KEY = 'nle-tb-v1';
  const $ = (s, el = document) => el.querySelector(s);
  const view = $('#view');
  const sidebar = $('#sidebar');

  /* ---------- storage ---------- */
  let S = {};
  try { S = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { S = {}; }
  S.done = S.done || {}; S.lvl = S.lvl || {}; for (const k in S.done) { if (!S.lvl[k]) S.lvl[k] = 4; } S.done = {}; S.wrong = S.wrong || {}; S.known = S.known || {}; S.stats = S.stats || {}; S.notes = S.notes || {}; S.hl = S.hl || {};
  if (S.hlOff) document.documentElement.classList.add('no-hl');
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} updateWrongCount(); }

  /* ---------- data ---------- */
  let INDEX = null;
  const CH = {};
  async function loadIndex() {
    if (INDEX) return INDEX;
    const r = await fetch('data/chapters.json', { cache: 'no-cache' });
    INDEX = (await r.json()).chapters;
    return INDEX;
  }
  async function loadChapter(id) {
    if (CH[id]) return CH[id];
    const meta = INDEX.find(c => c.id === id);
    if (!meta || !meta.ready) return null;
    const [md, ex] = await Promise.all([
      fetch(`data/${id}.md`, { cache: 'no-cache' }).then(r => r.text()),
      fetch(`data/${id}-exams.json`, { cache: 'no-cache' }).then(r => r.ok ? r.json() : {}).catch(() => ({}))
    ]);
    const ch = parseChapter(md, meta);
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
  function yearNum(id) { const y = id.split('/')[0]; return parseFloat(y); }
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
      .replace(/\[\[(\d+)\]\]/g, '<a href="#" data-box="$1">กล่อง $1</a>');
  }
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
        out += `<div class="card think"><div class="lbl">🤔 หยุดคิดก่อน</div><p class="think-q">${inline(q.trim())}</p><button class="reveal-btn" data-reveal>ดูเฉลย</button><div class="think-a" hidden>${inline((a || '').trim())}</div></div>`;
        i++; continue;
      }
      if (L.startsWith('!! ') || L.startsWith('>> ')) {
        flushP(); const kind = L.startsWith('!!') ? 'trap' : 'note'; const tag = L.slice(0, 2); const items = [];
        while (i < lines.length && lines[i].startsWith(tag + ' ')) { items.push(lines[i].slice(3)); i++; }
        const lbl = kind === 'trap' ? '⚠️ กับดักข้อสอบ' : '📌 อาจารย์เน้น';
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
    return `<span class="badge ${cls}">ออก ${esc(s.freq)} ปี ${stars(s.stars)}</span>`;
  }
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function updateWrongCount() { const n = Object.keys(S.wrong).length; const el = $('#wrongCount'); el.hidden = !n; el.textContent = n; }
  function closeNav() { document.body.classList.remove('nav-open'); }

  /* ---------- sidebar ---------- */
  function renderSidebar(curCh, curNo) {
    let h = '';
    for (const c of INDEX) {
      const ch = CH[c.id];
      if (!c.ready) continue;
      const p = ch ? chProgress(ch) : null;
      h += `<div class="side-ch"><a href="#/${c.id}">${esc(c.title)}</a>`;
      if (p) h += `<div class="side-bar">${lvBar(p)}</div>`;
      if (ch && c.id === curCh) {
        for (const pg of ch.pages) {
          h += `<div class="side-pg">หน้า ${pg.no} · ${esc(pg.title)}</div>`;
          for (const s of ch.sections.filter(x => x.page === pg.no)) {
            const l = lvOf(ch.id, s.no);
            h += `<a class="side-sec${s.no === curNo ? ' on' : ''}${l ? ' lv' + l : ''}" href="#/${ch.id}/${s.no}"><span class="n">${s.no}</span><span class="t">${esc(s.title)}</span>${l ? `<span class="ck">${LV[l].s}</span>` : ''}</a>`;
          }
        }
      }
      h += '</div>';
    }
    h += `<div class="side-links"><a href="#/">🏠 หน้าแรก</a><a href="#/quiz">📝 โหมดทำข้อสอบ</a><a href="#/wrong">📕 กองข้อที่ทำผิด</a><a href="#/cards">🃏 Flashcard</a><a href="#/stats">📊 จุดอ่อนของฉัน</a><a href="#/notes">🗒️ โน้ตของฉัน</a><a href="#" id="hlToggle">🖍 ไฮไลต์จุดสำคัญ: ${S.hlOff ? 'ปิด' : 'เปิด'}</a></div>`;
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
      <div class="stem">${inline(esc(q.stem))}</div>
      ${q.needs_image ? '<div class="warn">ข้อนี้ข้อสอบจริงมีรูปประกอบ</div>' : ''}
      <div class="opts">${letters.map(l => `<button class="opt" data-l="${l}"><span class="l">${l}</span><span>${inline(esc(q.options[l]))}</span></button>`).join('')}</div>
      <div class="explain" hidden></div>
    </div>`;
  }
  function answerMCQ(box, letter, onDone) {
    const chId = box.dataset.ch, qid = box.dataset.q, q = CH[chId].exams[qid];
    if (box.dataset.done) return;
    box.dataset.done = '1';
    const ok = letter === q.answer;
    box.querySelectorAll('.opt').forEach(b => {
      b.disabled = true;
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
    ex.innerHTML = `<div class="res ${ok ? 'ok' : 'no'}">${ok ? '✓ ถูกต้อง' : `✗ ยังไม่ใช่ ตอบ ${q.answer}`}</div>${inline(esc(q.why || ''))}${q.doubt ? `<div class="warn">⚠ ${esc(q.doubt)}</div>` : ''}${note}`;
    if (onDone) onDone(ok);
  }
  view.addEventListener('click', e => {
    const opt = e.target.closest('.opt');
    if (opt && !opt.disabled) { const box = opt.closest('.mcq'); answerMCQ(box, opt.dataset.l, box._onDone); return; }
    const rv = e.target.closest('[data-reveal]');
    if (rv) { const a = rv.nextElementSibling; a.hidden = !a.hidden; rv.textContent = a.hidden ? 'ดูเฉลย' : 'ซ่อนเฉลย'; return; }
    const bx = e.target.closest('[data-box]');
    if (bx) { e.preventDefault(); const cur = location.hash.split('/')[1]; location.hash = `#/${cur}/${bx.dataset.box}`; }
  });

  /* ---------- ไฮไลต์ของผู้ใช้ ---------- */
  let curSec = null; const undoStack = [];
  function syncUndo() { const b = document.getElementById('undoBtn'); if (b) b.hidden = !undoStack.some(u => curSec && u.k === curSec.k); }
  function rerender() { const y = scrollY; return route().then(() => scrollTo(0, y)); }
  function textNodes(root) { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const a = []; let n; while ((n = w.nextNode())) a.push(n); return a; }
  function wrapRange(root, start, end, idx, c) {
    let pos = 0;
    for (const n of textNodes(root)) {
      const len = n.nodeValue.length, s = Math.max(start, pos), e = Math.min(end, pos + len);
      if (s < e && !n.parentNode.closest('svg')) {
        const r = document.createRange(); r.setStart(n, s - pos); r.setEnd(n, e - pos);
        const m = document.createElement('mark'); m.className = 'user-hl c-' + (c || 'g'); m.dataset.hl = idx; r.surroundContents(m);
      }
      pos += len;
    }
  }
  function applyHL(art, k) {
    const full = art.textContent;
    (S.hl[k] || []).forEach((h, i) => {
      let s = full.substr(h.s, h.t.length) === h.t ? h.s : full.indexOf(h.t);
      if (s >= 0) wrapRange(art, s, s + h.t.length, i, h.c);
    });
  }
  const pop = document.createElement('div'); pop.className = 'hl-pop'; pop.hidden = true; document.body.appendChild(pop);
  pop.addEventListener('mousedown', e => e.preventDefault());
  // เก็บสถานะก่อนแก้ไว้สำหรับปุ่มเลิกทำ
  function snap(k) { undoStack.push({ k, before: JSON.parse(JSON.stringify(S.hl[k] || [])) }); }
  function setHL(k, arr) { if (arr.length) S.hl[k] = arr; else delete S.hl[k]; save(); }
  // แถบสี: 4 สี + ยางลบ · วางตามตำแหน่งในหน้า จึงเลื่อนตามข้อความ ไม่หายตอนเลื่อน
  function showPalette(rect, onColor, onErase) {
    pop.innerHTML = ['y', 'g', 'p', 'r'].map(c => `<button class="sw c-${c}" data-c="${c}" aria-label="ไฮไลต์สีนี้"></button>`).join('') + `<button class="sw erase" data-c="x" aria-label="ลบไฮไลต์" title="ลบไฮไลต์">✕</button>`;
    pop.hidden = false;
    const w = 230, top = rect.bottom + scrollY + 10, left = Math.max(8, Math.min(rect.left + scrollX + rect.width / 2 - w / 2, document.documentElement.clientWidth - w - 8));
    pop.style.top = top + 'px'; pop.style.left = left + 'px';
    pop.querySelectorAll('button').forEach(b => b.onclick = () => { if (b.dataset.c === 'x') onErase(); else onColor(b.dataset.c); hidePop(); });
  }
  function hidePop() { pop.hidden = true; pop.dataset.mode = ''; }
  function selOffsets(r) {
    const pre = document.createRange(); pre.setStart(curSec.art, 0); pre.setEnd(r.startContainer, r.startOffset);
    const s = pre.toString().length; return { s, e: s + r.toString().length };
  }
  function hlPos(h) { const full = curSec.art.textContent; const s = full.substr(h.s, h.t.length) === h.t ? h.s : full.indexOf(h.t); return s; }
  let selT;
  document.addEventListener('selectionchange', () => {
    clearTimeout(selT);
    selT = setTimeout(() => {
      const sel = getSelection();
      if (!curSec || !document.contains(curSec.art) || !sel.rangeCount || sel.isCollapsed) { if (pop.dataset.mode === 'add') hidePop(); return; }
      const r = sel.getRangeAt(0);
      if (!curSec.art.contains(r.commonAncestorContainer)) return;
      const t = r.toString(); if (t.trim().length < 2) return;
      pop.dataset.mode = 'add';
      showPalette(r.getBoundingClientRect(), c => {
        const { k } = curSec; const { s } = selOffsets(r);
        snap(k); setHL(k, (S.hl[k] || []).concat([{ s, t, c }]));
        sel.removeAllRanges(); rerender(); syncUndo();
      }, () => {
        // ลบไฮไลต์ทุกอันที่ซ้อนกับข้อความที่เลือก
        const { k } = curSec; const { s, e } = selOffsets(r);
        const arr = S.hl[k] || [];
        const keep = arr.filter(h => { const hs = hlPos(h); return hs < 0 || hs + h.t.length <= s || hs >= e; });
        if (keep.length === arr.length) return;
        snap(k); setHL(k, keep); sel.removeAllRanges(); rerender();
      });
    }, 250);
  });
  // แตะไฮไลต์เดิม: เปลี่ยนสี หรือ ✕ ลบ
  view.addEventListener('click', e => {
    const m = e.target.closest('mark.user-hl');
    if (!m || !curSec || !getSelection().isCollapsed) return;
    const idx = +m.dataset.hl, { k } = curSec; pop.dataset.mode = 'edit';
    showPalette(m.getBoundingClientRect(), c => {
      snap(k); const arr = JSON.parse(JSON.stringify(S.hl[k])); arr[idx].c = c; setHL(k, arr); rerender();
    }, () => {
      snap(k); const arr = S.hl[k].slice(); arr.splice(idx, 1); setHL(k, arr); rerender();
    });
  });
  // ปิดแถบสีเมื่อแตะที่อื่น (การเลื่อนหน้าไม่ปิด)
  document.addEventListener('click', e => { if (!pop.hidden && pop.dataset.mode === 'edit' && !pop.contains(e.target) && !e.target.closest('mark.user-hl')) hidePop(); });

  /* ---------- views ---------- */
  async function vHome() {
    await loadAll();
    renderSidebar();
    const tiles = INDEX.map(c => {
      const ch = CH[c.id];
      if (!c.ready) return `<div class="tile soon"><h3>${esc(c.title)}</h3><p>${esc(c.desc || 'เร็ว ๆ นี้')}</p></div>`;
      const p = chProgress(ch);
      return `<a class="tile" href="#/${c.id}"><h3>${esc(c.title)}</h3><p>${esc(c.desc || '')}</p>${lvBar(p, true)}<div class="bar-label">ประเมินแล้ว ${p.d}/${p.n} หัวข้อ · มั่นใจ ${p.c[4]} หัวข้อ · ข้อสอบ ${Object.keys(ch.exams).length} ข้อ</div>${lvLegend(p)}</a>`;
    }).join('');
    view.innerHTML = `<div class="hero"><h1>ตำราคู่ชีท NLE Step 1</h1><p>เลขหัวข้อในเว็บตรงกับเลขกล่องในชีท A3 เปิดคู่กันแบบ split view แล้วพิมพ์เลขกล่องที่ปุ่มมุมขวาล่างเพื่อกระโดดไปได้ทันที</p></div><div class="grid">${tiles}</div>
    <div class="panel"><h3>สัญลักษณ์</h3><div class="card think" style="margin:8px 0"><div class="lbl">🤔 หยุดคิดก่อน</div>คำถามสั้นให้ลองตอบในใจก่อนกดดูเฉลย</div><div class="card trap" style="margin:8px 0"><div class="lbl">⚠️ กับดักข้อสอบ</div>จุดที่ข้อสอบชอบหลอก</div><div class="card note" style="margin:8px 0"><div class="lbl">📌 อาจารย์เน้น</div>สิ่งที่อาจารย์ติวย้ำ</div><p style="margin:8px 0 0"><span class="tag e">ออกสอบ</span> <span class="tag s">เสริม</span> นอกคลิป <span class="tag x">ข้ามบท</span></p><div class="content legend-row"><span><b>คำสำคัญ</b> ไฮไลต์เหลือง</span><span class="hl-exam" style="display:inline-block;background:var(--hl-exam);border-left:3px solid var(--exam);padding:0 8px">ประโยคที่เคยออกสอบ</span><span><mark class="user-hl c-y">ไฮไลต์</mark> <mark class="user-hl c-g">ของ</mark> <mark class="user-hl c-p">ฉัน</mark> <mark class="user-hl c-r">4 สี</mark> เลือกข้อความเอง</span></div><p class="bar-label">ปิดไฮไลต์อัตโนมัติได้ที่เมนูด้านข้าง</p></div>`;
  }
  async function vChapter(id) {
    await loadIndex(); const ch = await loadChapter(id); if (!ch) return vHome();
    renderSidebar(id);
    const p = chProgress(ch);
    let h = `<div class="crumb"><a href="#/">หน้าแรก</a></div><div class="hero"><h1>${esc(ch.title)}</h1><p>${esc(ch.source || '')}</p></div>
      ${lvBar(p, true)}<div class="bar-label">ประเมินแล้ว ${p.d}/${p.n} หัวข้อ · มั่นใจ ${p.c[4]} หัวข้อ</div>${lvLegend(p)}
      <div class="choice" style="margin-top:14px"><a class="btn primary" href="#/quiz?ch=${id}">📝 สุ่มข้อสอบทั้งบท</a><a class="btn" href="#/cards?ch=${id}">🃏 Flashcard บทนี้</a></div>`;
    for (const pg of ch.pages) {
      h += `<h2 style="margin-top:22px">หน้า ${pg.no} · ${esc(pg.title)}</h2><ul class="sec-list">`;
      for (const s of ch.sections.filter(x => x.page === pg.no)) {
        const l = lvOf(id, s.no);
        h += `<li><a class="${l ? 'lv' + l : ''}" href="#/${id}/${s.no}"><span class="n">${s.no}</span><span class="t">${esc(s.title)} ${l ? `<span class="ck">${LV[l].s}</span>` : ''}</span><span class="f">${s.freq ? 'ออก ' + esc(s.freq) + ' ' + stars(s.stars) : ''}${s.examIds.length ? ' · ' + s.examIds.length + ' ข้อ' : ''}</span></a></li>`;
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
      <div class="sec-head"><div class="sec-no">${s.no}</div><div><h1>${esc(s.title)}</h1><div class="meta">${freqBadge(s)}${s.examIds.length ? `<span class="badge">ข้อสอบเก่า ${s.examIds.length} ข้อ</span>` : ''}</div></div></div>
      <article class="content">${s.lead ? `<p><b>${inline(esc(s.lead))}</b></p>` : ''}${s.html}</article>`;
    if (s.kw.length) h += `<div class="kws">${s.kw.map(x => `<span class="kw">${esc(x)}</span>`).join('')}</div>`;
    const myHl = (S.hl[k] || []).length;
    h += `<details class="panel mynote" ${S.notes[k] ? 'open' : ''}><summary>🗒️ โน้ตของฉัน${S.notes[k] ? ' ·  มีโน้ต' : ''}${myHl ? ` · ไฮไลต์ ${myHl} จุด` : ''}</summary>
      <textarea id="noteIn" rows="4" placeholder="จดสิ่งที่อยากจำของกล่องนี้ (บันทึกอัตโนมัติ)">${esc(S.notes[k] || '')}</textarea>
      <div class="bar-label">เลือกข้อความในเนื้อหาแล้วกดเลือกสี (เหลือง เขียว ชมพู แดงอ่อน) เพื่อไฮไลต์เอง · แตะไฮไลต์ซ้ำเพื่อลบ · ปุ่ม ↶ มุมขวาล่างใช้เลิกทำ · <a href="#/notes">ดูโน้ตทั้งหมด</a></div></details>`;
    if (s.examIds.length) {
      h += `<section class="exam-sec"><h2>📝 ข้อสอบเก่าของหัวข้อนี้</h2><p class="bar-label">กดเลือกคำตอบ ข้อที่ตอบผิดจะเข้ากองข้อผิดให้อัตโนมัติ</p>`;
      for (const qid of s.examIds) h += mcqHTML(id, qid, ch.exams[qid]);
      h += '</section>';
    }
    h += `<div class="lvpick"><div class="lvq">หัวข้อนี้เข้าใจแค่ไหน (กดเปลี่ยนได้ตลอด กดซ้ำเพื่อล้าง)</div>${[4, 3, 2, 1].map(l => `<button class="lvbtn lv${l}${S.lvl[k] === l ? ' on' : ''}" data-lv="${l}"><span class="st">${LV[l].s}</span><span>${LV[l].t}</span></button>`).join('')}</div>
      <nav class="pager">${prev ? `<a href="#/${id}/${prev.no}"><small>← ก่อนหน้า</small>${prev.no}. ${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a class="next" href="#/${id}/${next.no}"><small>ถัดไป →</small>${next.no}. ${esc(next.title)}</a>` : ''}</nav>
      <div class="jump"><a href="${prev ? `#/${id}/${prev.no}` : '#/' + id}" aria-label="ก่อนหน้า">‹</a><button id="undoBtn" hidden title="เลิกทำไฮไลต์ล่าสุด" aria-label="เลิกทำ">↶</button><input id="jumpIn" inputmode="numeric" placeholder="${s.no}" aria-label="ไปกล่อง"><a href="${next ? `#/${id}/${next.no}` : '#/' + id}" aria-label="ถัดไป">›</a></div>`;
    view.innerHTML = h;
    view.querySelectorAll('.lvbtn').forEach(b => b.onclick = () => { const l = +b.dataset.lv; if (S.lvl[k] === l) delete S.lvl[k]; else S.lvl[k] = l; save(); rerender(); });
    pop.hidden = true; pop.dataset.mode = '';
    const art = $('.content', view);
    applyHL(art, k);
    curSec = { k, art };
    let tmr; $('#noteIn').addEventListener('input', e => { clearTimeout(tmr); tmr = setTimeout(() => { const v = e.target.value.trim(); if (v) S.notes[k] = v; else delete S.notes[k]; save(); }, 400); });
    syncUndo();
    $('#undoBtn').onclick = () => {
      let i = undoStack.length - 1; while (i >= 0 && undoStack[i].k !== k) i--;
      if (i < 0) return; const u = undoStack.splice(i, 1)[0];
      setHL(k, u.before); rerender();
    };
    const ji = $('#jumpIn');
    ji.addEventListener('keydown', e => { if (e.key === 'Enter') { const n = parseInt(ji.value); if (n) location.hash = `#/${id}/${n}`; } });
    window.scrollTo(0, 0);
  }

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
    view.innerHTML = `<div class="hero"><h1>📝 โหมดทำข้อสอบ</h1><p>เลือกบทแล้วสุ่มข้อ ข้อที่ผิดจะเก็บเข้ากองข้อผิด</p></div>
    <div class="panel"><h3>บท</h3><div class="choice" id="qCh">${ready.map(c => `<label><input type="checkbox" value="${c.id}" ${!pre || pre === c.id ? 'checked' : ''}>${esc(c.title)}</label>`).join('')}</div>
    <h3>ขอบเขต</h3><div class="choice" id="qScope"><label><input type="radio" name="sc" value="all" checked>ทุกหัวข้อ</label><label><input type="radio" name="sc" value="weak">เฉพาะหัวข้อที่ยังไม่แม่น (★–★★)</label><label><input type="radio" name="sc" value="done">เฉพาะหัวข้อที่ประเมินแล้ว</label><label><input type="radio" name="sc" value="hot">เฉพาะหัวข้อออกบ่อย (★★★)</label><label><input type="radio" name="sc" value="new">ข้อที่ยังไม่เคยทำ</label></div>
    <h3>จำนวนข้อ</h3><div class="choice" id="qN">${[10, 20, 40].map((n, i) => `<label><input type="radio" name="qn" value="${n}" ${i === 0 ? 'checked' : ''}>${n} ข้อ</label>`).join('')}<label><input type="radio" name="qn" value="999">ทั้งหมด</label></div>
    <button class="btn primary" id="qGo">เริ่มทำ</button> <span class="bar-label" id="qInfo"></span></div>`;
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
        view.innerHTML = `<div class="hero"><h1>${title}</h1><p>ได้ ${score} จาก ${items.length} ข้อ (${Math.round(score * 100 / items.length)}%)</p></div><div class="choice"><a class="btn primary" href="#/wrong">📕 ไปกองข้อผิด</a><a class="btn" href="#/quiz">ทำชุดใหม่</a></div>`;
        return;
      }
      const it = items[i], q = CH[it.ch].exams[it.id];
      view.innerHTML = `<div class="qhead"><span>ข้อ ${i + 1} / ${items.length}</span><span>ถูก ${score}</span></div><div class="bar"><i style="width:${Math.round(i * 100 / items.length)}%"></i></div>${mcqHTML(it.ch, it.id, q, { showBox: true })}<div class="choice" style="justify-content:flex-end"><button class="btn" id="skip">ข้าม</button></div>`;
      const box = $('.mcq', view);
      box._onDone = ok => { if (ok) score++; $('#skip').textContent = i + 1 < items.length ? 'ข้อต่อไป →' : 'ดูผล'; $('#skip').classList.add('primary'); };
      $('#skip').onclick = () => { i++; step(); window.scrollTo(0, 0); };
    };
    step();
  }
  async function vWrong() {
    await loadAll(); renderSidebar();
    const list = Object.values(S.wrong).filter(w => CH[w.ch] && CH[w.ch].exams[w.id]).sort((a, b) => b.t - a.t);
    let h = `<div class="hero"><h1>📕 กองข้อที่ทำผิด</h1><p>ตอบถูกเมื่อไหร่ ข้อนั้นจะออกจากกองเอง</p></div>`;
    if (!list.length) { view.innerHTML = h + '<p class="empty">ยังไม่มีข้อผิด ลองทำข้อสอบท้ายหัวข้อหรือโหมดทำข้อสอบดูนะ</p>'; return; }
    h += `<div class="choice"><button class="btn primary" id="wGo">ทวนทั้งกอง (${list.length} ข้อ)</button><button class="btn" id="wClear">ล้างกอง</button></div>`;
    h += list.map(w => { const q = CH[w.ch].exams[w.id]; return `<a class="search-hit" href="#/${w.ch}/${q.box}"><b>${esc(w.id)}</b> · ${esc(CH[w.ch].title)} กล่อง ${q.box} · ผิด ${w.n} ครั้ง<small>${esc(q.stem)}</small></a>`; }).join('');
    view.innerHTML = h;
    $('#wGo').onclick = () => runQuiz(shuffle(list.map(w => ({ ch: w.ch, id: w.id }))), 'ทวนกองข้อผิด');
    $('#wClear').onclick = () => { if (confirm('ล้างกองข้อผิดทั้งหมด?')) { S.wrong = {}; save(); vWrong(); } };
  }
  async function vCards(params) {
    await loadAll(); renderSidebar(params.get('ch'));
    const pre = params.get('ch');
    const ready = INDEX.filter(c => c.ready);
    view.innerHTML = `<div class="hero"><h1>🃏 Flashcard</h1><p>ทำจาก keyword ท้ายกล่อง แตะการ์ดเพื่อพลิก</p></div>
      <div class="panel"><div class="choice" id="fCh">${ready.map(c => `<label><input type="checkbox" value="${c.id}" ${!pre || pre === c.id ? 'checked' : ''}>${esc(c.title)}</label>`).join('')}</div>
      <div class="choice" id="fSc"><label><input type="radio" name="fs" value="todo" checked>เฉพาะที่ยังจำไม่ได้</label><label><input type="radio" name="fs" value="all">ทั้งหมด</label></div>
      <button class="btn primary" id="fGo">เริ่ม</button> <span class="bar-label" id="fInfo"></span></div><div id="fArea"></div>`;
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
        <div class="flash-acts"><button class="btn" id="fNo">ยังจำไม่ได้</button><button class="btn primary" id="fYes">จำได้แล้ว</button></div>`;
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
    for (const ch of Object.values(CH)) {
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
    let h = `<div class="hero"><h1>📊 จุดอ่อนของฉัน</h1><p>คิดจากทุกครั้งที่กดตอบข้อสอบในเว็บ (ท้ายกล่องและโหมดทำข้อสอบ)</p></div>`;
    if (!tn) { view.innerHTML = h + '<p class="empty">ยังไม่มีข้อมูล ลองทำข้อสอบท้ายกล่องหรือโหมดทำข้อสอบก่อนนะ</p>'; return; }
    const w = weak[0];
    h += `<div class="panel"><h3>ภาพรวม: ถูก ${pct(tr, tn)}% (${tr}/${tn} ครั้ง) · ทำแล้ว ${done.length}/${boxes.length} กล่อง</h3>${bar(pct(tr, tn))}
      <div class="choice" style="margin-top:12px"><a class="btn primary" href="#/${w.ch.id}/${w.s.no}">ไปกล่องที่อ่อนสุด: ${w.s.no}. ${esc(w.s.title)} (${w.p}%)</a><button class="btn" id="weakGo">สุ่มข้อจากกล่องที่ต่ำกว่า 70%</button></div></div>`;
    h += `<h2>แยกตามปีข้อสอบ</h2><div class="tbl-wrap"><table class="t"><thead><tr><th>ปี</th><th>ถูก</th><th style="width:45%"></th></tr></thead><tbody>${Object.keys(years).sort().map(y => { const p = pct(years[y].r, years[y].n); return `<tr><td>MDCU${y}</td><td>${p}% (${years[y].r}/${years[y].n})</td><td>${bar(p)}</td></tr>`; }).join('')}</tbody></table></div>`;
    h += `<h2>แยกตามกล่อง (อ่อนสุดอยู่บน)</h2><div class="tbl-wrap"><table class="t"><thead><tr><th>กล่อง</th><th>ถูก</th><th>ทำแล้ว</th><th style="width:30%"></th></tr></thead><tbody>${weak.concat(boxes.filter(b => !b.n)).map(b => `<tr><td><a href="#/${b.ch.id}/${b.s.no}">${b.s.no}. ${esc(b.s.title)}</a></td><td>${b.p == null ? '–' : b.p + '%'}</td><td>${b.tried}/${b.total} ข้อ</td><td>${bar(b.p)}</td></tr>`).join('')}</tbody></table></div>
      <div class="choice"><button class="btn small" id="statReset">ล้างสถิติ</button></div>`;
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
    let h = `<div class="hero"><h1>🗒️ โน้ตและไฮไลต์ของฉัน</h1><p>เรียงตามบทและกล่อง กดชื่อกล่องเพื่อไปอ่านต่อ</p></div>`;
    let any = false;
    for (const ch of Object.values(CH)) for (const s of ch.sections) {
      const k = secKey(ch.id, s.no), note = S.notes[k], hl = S.hl[k] || [];
      if (!note && !hl.length) continue; any = true;
      h += `<div class="panel"><h3><a href="#/${ch.id}/${s.no}">${esc(ch.title)} · ${s.no}. ${esc(s.title)}</a></h3>${note ? `<p style="white-space:pre-wrap;margin:6px 0">${esc(note)}</p>` : ''}${hl.map(x => `<p style="margin:6px 0"><mark class="user-hl c-${x.c || 'g'}">${esc(x.t)}</mark></p>`).join('')}</div>`;
    }
    view.innerHTML = h + (any ? '' : '<p class="empty">ยังไม่มีโน้ต เปิดกล่องไหนก็ได้แล้วจดที่ "โน้ตของฉัน" หรือเลือกข้อความเพื่อไฮไลต์</p>');
  }
  async function vSearch(q) {
    await loadAll(); renderSidebar();
    q = (q || '').trim();
    $('#searchInput').value = q;
    if (!q) { view.innerHTML = '<p class="empty">พิมพ์คำที่ต้องการค้นหา</p>'; return; }
    const ql = q.toLowerCase(); const hits = [];
    for (const ch of Object.values(CH)) {
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
    view.innerHTML = `<div class="hero"><h1>ค้นหา “${esc(q)}”</h1><p>เจอ ${hits.length} ที่</p></div>` + hits.filter(x => x.s).map(x => `<a class="search-hit" href="#/${x.ch.id}/${x.s.no}"><b>${x.s.no}. ${esc(x.s.title)}</b> · ${esc(x.ch.title)}<small>…${hl(x.snip)}…</small></a>`).join('');
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
      if (parts[1]) return vSection(parts[0], parseInt(parts[1]));
      return vChapter(parts[0]);
    } catch (err) {
      console.error(err);
      view.innerHTML = `<p class="empty">โหลดข้อมูลไม่สำเร็จ (${esc(err.message)})<br>ถ้าเปิดไฟล์จากเครื่องโดยตรง ให้เปิดผ่านลิงก์เว็บแทน</p>`;
    }
  }
  window.addEventListener('hashchange', route);
  $('#menuBtn').onclick = () => document.body.classList.toggle('nav-open');
  $('#scrim').onclick = closeNav;
  sidebar.addEventListener('click', e => {
    if (e.target.id !== 'hlToggle') return;
    e.preventDefault(); S.hlOff = !S.hlOff; save();
    document.documentElement.classList.toggle('no-hl', S.hlOff);
    e.target.textContent = `🖍 ไฮไลต์จุดสำคัญ: ${S.hlOff ? 'ปิด' : 'เปิด'}`;
  });
  $('#searchForm').onsubmit = e => { e.preventDefault(); location.hash = '#/search?q=' + encodeURIComponent($('#searchInput').value); };
  const themeBtn = $('#themeBtn');
  const isDark = () => document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const syncTheme = () => { themeBtn.textContent = isDark() ? '☀️' : '🌙'; };
  themeBtn.onclick = () => { S.theme = isDark() ? 'light' : 'dark'; document.documentElement.dataset.theme = S.theme; save(); syncTheme(); };
  syncTheme();
  $('#fontBtn').onclick = () => { const sizes = [15, 17, 19, 21]; const cur = S.font || 17; S.font = sizes[(sizes.indexOf(cur) + 1) % sizes.length]; document.documentElement.style.setProperty('--fs', S.font + 'px'); save(); };
  updateWrongCount();
  route();
})();
