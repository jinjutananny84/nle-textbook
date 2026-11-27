/* Google Login + Firestore Cloud Sync + PWA Offline Manager
   ทำงานร่วมกับ app.js ผ่าน window.NLE_SYNC.init(bridge) */
(function () {
  'use strict';

  const FB_VER = '11.6.0';
  const CACHE_NAME = 'nle-tb-v54';
  const CLIENT_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const MAX_IMG_CHARS = 760000; // เผื่อให้เล็กกว่าลิมิต 1MB ของ Firestore document เสมอ

  let bridge = null;
  let fb = null; // { auth, db, modAuth, modFs }
  let unsubDoc = null;
  let pushTimer = null;
  let pushing = false;
  let deferredPrompt = null;

  const state = {
    configured: false,
    ready: false,
    user: null,
    status: 'idle', // idle | connecting | syncing | synced | offline | error
    lastSyncedAt: 0,
    error: '',
    offline: !navigator.onLine,
    canInstall: false,
    isStandalone: window.matchMedia('(display-mode: standalone)').matches || !!window.navigator.standalone,
    isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  };

  function emit() {
    if (bridge && bridge.onChange) bridge.onChange(Object.assign({}, state));
  }

  function hasValidConfig(cfg) {
    return !!(cfg && typeof cfg.apiKey === 'string' && cfg.apiKey.trim() && typeof cfg.projectId === 'string' && cfg.projectId.trim());
  }

  /* ---------- PWA Install + Service Worker ---------- */
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    state.canInstall = true;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    state.canInstall = false;
    state.isStandalone = true;
    emit();
    if (bridge) bridge.toast('ติดตั้งเป็นแอปเรียบร้อยแล้ว');
  });
  window.addEventListener('online', () => {
    state.offline = false;
    emit();
    if (state.user) syncNow();
    else if (state.configured && !fb) connectFirebase();
  });
  window.addEventListener('offline', () => {
    state.offline = true;
    if (state.user) state.status = 'offline';
    emit();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && state.user && pushTimer) {
      clearTimeout(pushTimer);
      pushTimer = null;
      pushToCloud(true);
    }
  });

  async function installPWA() {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const res = await deferredPrompt.userChoice.catch(() => ({ outcome: 'dismissed' }));
    deferredPrompt = null;
    state.canInstall = false;
    emit();
    return res.outcome === 'accepted';
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  /* ดาวน์โหลดทุกบทลง Cache เพื่อให้เปิดอ่านและทำข้อสอบได้ 100% แบบออฟไลน์ */
  async function cacheAllOffline(onProgress) {
    if (!('caches' in window)) throw new Error('เบราว์เซอร์นี้ไม่รองรับ Offline Cache');
    const cache = await caches.open(CACHE_NAME);
    const chRes = await fetch('data/chapters.json', { cache: 'no-cache' });
    const chData = await chRes.json();
    await cache.put('data/chapters.json', new Response(JSON.stringify(chData), { headers: { 'Content-Type': 'application/json' } }));

    const urls = new Set([
      './', './index.html', './manifest.json',
      'data/abbr.json', 'data/bacteria.json', 'data/taxonomy.json'
    ]);
    const readyChs = (chData.chapters || []).filter(c => c.ready);
    for (const c of readyChs) {
      urls.add(`data/${c.id}.md`);
      urls.add(`data/${c.id}-exams.json`);
      urls.add(`data/${c.id}-abbr.json`);
      urls.add(`data/${c.id}-numbers.json`);
      urls.add(`data/${c.id}-flows.json`);
      urls.add(`data/${c.id}-drugs.json`);
    }

    const list = [...urls];
    let done = 0, okCount = 0;
    const imgUrls = new Set();
    const CONC = 6;
    let idx = 0;

    async function worker() {
      while (idx < list.length) {
        const u = list[idx++];
        try {
          const r = await fetch(u, { cache: 'no-cache' });
          if (r.ok) {
            okCount++;
            const cl = r.clone();
            await cache.put(u, cl);
            if (u.endsWith('.md')) {
              const txt = await r.text();
              for (const m of txt.matchAll(/(?:src=|]\()(["']?)(data\/img\/[^"')\s]+)\1/g)) imgUrls.add(m[2]);
            }
          }
        } catch (_) {}
        done++;
        if (onProgress) onProgress(done, list.length + imgUrls.size, okCount);
      }
    }
    await Promise.all(Array.from({ length: CONC }, worker));

    // แคชรูปประกอบในบท (data/img/...)
    const imgs = [...imgUrls];
    let iIdx = 0;
    async function imgWorker() {
      while (iIdx < imgs.length) {
        const u = imgs[iIdx++];
        try {
          const r = await fetch(u);
          if (r.ok) { okCount++; await cache.put(u, r.clone()); }
        } catch (_) {}
        done++;
        if (onProgress) onProgress(done, list.length + imgs.length, okCount);
      }
    }
    await Promise.all(Array.from({ length: CONC }, imgWorker));
    return { total: list.length + imgs.length, cached: okCount, chapters: readyChs.length };
  }

  /* ---------- Smart Merge (ป้องกันข้อมูลหายเวลาแก้จากหลายเครื่อง) ---------- */
  function mergeState(local, remote) {
    const lTime = local._updatedAt || 0;
    const rTime = remote._updatedAt || 0;
    const newer = lTime >= rTime ? local : remote;
    const older = lTime >= rTime ? remote : local;
    const out = Object.assign({}, older, newer);

    // lvl: เก็บครบทุกกล่อง (ถ้าซ้ำเอาของใหม่กว่า)
    out.lvl = Object.assign({}, older.lvl || {}, newer.lvl || {});
    out.done = {};

    // hl: รวมไฮไลต์/โน้ตแทรก/รูปแทรกจากทั้งสองฝั่งแบบไม่ซ้ำ
    const hl = {};
    const hlKeys = new Set([...Object.keys(older.hl || {}), ...Object.keys(newer.hl || {})]);
    for (const k of hlKeys) {
      const a = (older.hl || {})[k] || [];
      const b = (newer.hl || {})[k] || [];
      const seen = new Set();
      const merged = [];
      for (const item of [...b, ...a]) {
        const sig = item.id || `${item.s}|${item.t}|${item.c}|${item.img || ''}|${item.n || ''}`;
        if (!seen.has(sig)) { seen.add(sig); merged.push(item); }
      }
      if (merged.length) hl[k] = merged;
    }
    out.hl = hl;

    // notes, wrong, known, srs, figw, lastByCh, drillWrong
    out.notes = Object.assign({}, older.notes || {}, newer.notes || {});
    out.wrong = Object.assign({}, older.wrong || {}, newer.wrong || {});
    out.known = Object.assign({}, older.known || {}, newer.known || {});
    out.srs = Object.assign({}, older.srs || {}, newer.srs || {});
    out.figw = Object.assign({}, older.figw || {}, newer.figw || {});
    out.lastByCh = Object.assign({}, older.lastByCh || {}, newer.lastByCh || {});
    out.drillWrong = Object.assign({}, older.drillWrong || {}, newer.drillWrong || {});

    // stats: เก็บจำนวนที่ทำมากสุดของแต่ละข้อ
    const stats = Object.assign({}, older.stats || {});
    for (const [k, v] of Object.entries(newer.stats || {})) {
      const prev = stats[k];
      stats[k] = prev ? { r: Math.max(prev.r || 0, v.r || 0), w: Math.max(prev.w || 0, v.w || 0) } : v;
    }
    out.stats = stats;

    // read: เก็บเวลาอ่านสูงสุดของแต่ละวัน/กล่อง
    const read = {};
    const days = new Set([...Object.keys(older.read || {}), ...Object.keys(newer.read || {})]);
    for (const d of days) {
      read[d] = Object.assign({}, (older.read || {})[d] || {});
      for (const [bk, sec] of Object.entries((newer.read || {})[d] || {})) {
        read[d][bk] = Math.max(read[d][bk] || 0, sec || 0);
      }
    }
    out.read = read;

    // kw: รวม keyword แบบไม่ซ้ำ
    const kwSeen = new Set();
    const kw = [];
    for (const item of [...(newer.kw || []), ...(older.kw || [])]) {
      const sig = `${item.k}|${item.t}`;
      if (!kwSeen.has(sig)) { kwSeen.add(sig); kw.push(item); }
    }
    out.kw = kw;

    // เก็บ plan / lastRead / geminiKey ถ้าฝั่งใหม่ยังไม่ได้ตั้ง
    out.plan = newer.plan || older.plan;
    out.lastRead = newer.lastRead || older.lastRead;
    out.geminiKey = newer.geminiKey || older.geminiKey;
    out._updatedAt = Math.max(lTime, rTime, Date.now());
    return out;
  }

  function cleanForCloud(s) {
    const c = Object.assign({}, s);
    delete c._dirty;
    delete c._lastSyncedAt;
    delete c._syncedUid;
    return c;
  }

  /* ---------- Image Sync (Firestore subcollection users/{uid}/images/{id}) ---------- */
  function blobToDataURL(blob) {
    return new Promise((ok, no) => {
      const r = new FileReader();
      r.onload = () => ok(r.result);
      r.onerror = () => no(r.error);
      r.readAsDataURL(blob);
    });
  }

  async function compressForCloud(blob) {
    let url = await blobToDataURL(blob);
    if (url.length <= MAX_IMG_CHARS) return url;
    // บีบอัดเป็น JPEG เพื่อไม่ให้เกินลิมิต 1MB ของ Firestore
    const bmp = await createImageBitmap(blob);
    let maxW = 1200, q = 0.78;
    for (let i = 0; i < 4; i++) {
      const sc = Math.min(1, maxW / bmp.width);
      const cv = document.createElement('canvas');
      cv.width = Math.round(bmp.width * sc);
      cv.height = Math.round(bmp.height * sc);
      const g = cv.getContext('2d');
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, cv.width, cv.height);
      g.drawImage(bmp, 0, 0, cv.width, cv.height);
      url = cv.toDataURL('image/jpeg', q);
      if (url.length <= MAX_IMG_CHARS) break;
      maxW = Math.round(maxW * 0.78);
      q = Math.max(0.45, q - 0.12);
    }
    bmp.close();
    return url;
  }

  async function syncImagePut(id, blob) {
    if (!fb || !state.user || !id || !blob) return;
    try {
      const dataUrl = await compressForCloud(blob);
      if (dataUrl.length > 980000) return; // ใหญ่เกินไป ข้ามเพื่อไม่ให้ error
      const ref = fb.modFs.doc(fb.db, 'users', state.user.uid, 'images', id);
      await fb.modFs.setDoc(ref, { dataUrl, updatedAt: Date.now() });
    } catch (e) {
      console.warn('[sync] image upload failed:', e);
    }
  }

  async function syncAllImages() {
    if (!fb || !state.user || !bridge || !bridge.idb) return;
    try {
      const colRef = fb.modFs.collection(fb.db, 'users', state.user.uid, 'images');
      const snap = await fb.modFs.getDocs(colRef);
      const remoteIds = new Set();
      const localKeys = new Set(await bridge.idb.keys().catch(() => []));
      let pulled = 0;

      for (const d of snap.docs) {
        remoteIds.add(d.id);
        if (!localKeys.has(d.id)) {
          const data = d.data();
          if (data && data.dataUrl) {
            const b = await (await fetch(data.dataUrl)).blob();
            await bridge.idb.put(d.id, b);
            pulled++;
          }
        }
      }
      // อัปโหลดรูปที่มีในเครื่องนี้แต่ยังไม่มีบนคลาวด์
      for (const k of localKeys) {
        if (!remoteIds.has(k)) {
          const b = await bridge.idb.get(k);
          if (b) await syncImagePut(k, b);
        }
      }
      if (pulled && bridge.onImagesPulled) bridge.onImagesPulled();
    } catch (e) {
      console.warn('[sync] images sync warning:', e);
    }
  }

  /* ---------- Firebase Auth & Firestore ---------- */
  async function loadFirebase() {
    if (fb) return fb;
    const cfg = window.NLE_FIREBASE_CONFIG;
    if (!hasValidConfig(cfg)) return null;
    const [modApp, modAuth, modFs] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-firestore.js`)
    ]);
    const app = modApp.getApps().length ? modApp.getApp() : modApp.initializeApp(cfg);
    const auth = modAuth.getAuth(app);
    const db = modFs.getFirestore(app);
    fb = { app, auth, db, modAuth, modFs };
    return fb;
  }

  function userDocRef(uid) {
    return fb.modFs.doc(fb.db, 'users', uid);
  }

  async function pushToCloud(silent) {
    if (!fb || !state.user || !bridge) return;
    if (!navigator.onLine) { state.status = 'offline'; emit(); return; }
    if (pushing) return;
    pushing = true;
    state.status = 'syncing';
    state.error = '';
    emit();
    try {
      const S = bridge.getS();
      const now = S._updatedAt || Date.now();
      S._updatedAt = now;
      const payload = JSON.stringify(cleanForCloud(S));
      if (payload.length > 950000) {
        throw new Error('ข้อมูลมีขนาดใหญ่เกิน 1MB');
      }
      await fb.modFs.setDoc(userDocRef(state.user.uid), {
        v: 1,
        payload,
        updatedAt: now,
        clientId: CLIENT_ID,
        email: state.user.email || '',
        displayName: state.user.displayName || ''
      }, { merge: true });
      S._dirty = false;
      S._lastSyncedAt = now;
      if (state.user) S._syncedUid = state.user.uid;
      bridge.saveLocalOnly();
      state.lastSyncedAt = now;
      state.status = 'synced';
      emit();
    } catch (e) {
      console.error('[sync] push error:', e);
      state.status = 'error';
      state.error = e.code === 'permission-denied'
        ? 'ยังไม่ได้ตั้งค่า Firestore Security Rules (ดูวิธีใน FIREBASE_SETUP.md)'
        : (e.message || 'ซิงค์ไม่สำเร็จ');
      emit();
      if (!silent) bridge.toast('ซิงค์ไม่สำเร็จ: ' + state.error);
    } finally {
      pushing = false;
    }
  }

  function schedulePush() {
    if (!state.user) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { pushTimer = null; pushToCloud(true); }, 1500);
  }

  function applyRemote(remoteS, remoteAt, msg) {
    remoteS._updatedAt = remoteAt;
    remoteS._lastSyncedAt = remoteAt;
    remoteS._dirty = false;
    if (state.user) remoteS._syncedUid = state.user.uid;
    bridge.replaceS(remoteS);
    state.lastSyncedAt = remoteAt;
    state.status = 'synced';
    emit();
    if (msg) bridge.toast(msg);
  }

  async function handleFirstSync(uid) {
    state.status = 'syncing';
    state.error = '';
    emit();
    try {
      const snap = await fb.modFs.getDoc(userDocRef(uid));
      const localS = bridge.getS();
      const localHas = bridge.hasData(localS);
      const isFirstBindOnDevice = localS._syncedUid !== uid;

      // สำรองข้อมูลเดิมในเครื่องก่อนซิงค์ครั้งแรกเสมอ (กันเหนียวไม่ให้ไฮไลต์เก่าหายเด็ดขาด)
      if (localHas && isFirstBindOnDevice) {
        try {
          if (!localStorage.getItem('nle-tb-pre-sync-backup')) {
            localStorage.setItem('nle-tb-pre-sync-backup', JSON.stringify(localS));
          }
        } catch (_) {}
      }

      if (!snap.exists() || !snap.data().payload) {
        // บัญชีใหม่บนคลาวด์ → อัปโหลดข้อมูลในเครื่องขึ้นทันที
        localS._updatedAt = localS._updatedAt || Date.now();
        localS._syncedUid = uid;
        await pushToCloud(false);
        await syncAllImages();
        if (localHas) bridge.toast('☁️ อัปโหลดข้อมูลเดิมจากเครื่องนี้ขึ้นคลาวด์แล้ว');
        return;
      }

      const d = snap.data();
      const remoteS = JSON.parse(d.payload);
      const remoteAt = d.updatedAt || remoteS._updatedAt || 0;
      const localAt = localS._updatedAt || 0;
      const lastSynced = localS._lastSyncedAt || 0;

      if (!localHas) {
        // เครื่องใหม่ยังไม่มีข้อมูล → ดึงจากคลาวด์มาเลย
        applyRemote(remoteS, remoteAt, '☁️ ดึงข้อมูลจากบัญชี Google แล้ว');
      } else if (isFirstBindOnDevice) {
        // เครื่องนี้มีข้อมูลเดิมอยู่แล้วและเพิ่งล็อกอินบัญชีนี้ครั้งแรก → รวมข้อมูลเสมอ ห้ามทับของเดิมหาย!
        const merged = mergeState(localS, remoteS);
        merged._syncedUid = uid;
        bridge.replaceS(merged);
        await pushToCloud(false);
        bridge.toast('☁️ รวมไฮไลต์เดิมในเครื่องนี้เข้ากับคลาวด์เรียบร้อย');
      } else if (!localS._dirty && remoteAt > localAt) {
        // ไม่มีงานค้างในเครื่องนี้ และคลาวด์ใหม่กว่า → ใช้คลาวด์
        applyRemote(remoteS, remoteAt, '☁️ อัปเดตข้อมูลล่าสุดจากคลาวด์แล้ว');
      } else if (localS._dirty && remoteAt <= lastSynced) {
        // เครื่องนี้แก้ต่อจากรอบซิงค์ล่าสุด → ดันขึ้นคลาวด์
        await pushToCloud(false);
      } else if (remoteAt !== localAt) {
        // ทั้งสองฝั่งมีข้อมูลต่างกัน → รวมข้อมูลไม่ให้หายแล้วซิงค์ขึ้น
        const merged = mergeState(localS, remoteS);
        merged._syncedUid = uid;
        bridge.replaceS(merged);
        await pushToCloud(false);
        bridge.toast('☁️ รวมข้อมูลจากเครื่องนี้และคลาวด์เรียบร้อย');
      } else {
        state.lastSyncedAt = remoteAt;
        state.status = 'synced';
        emit();
      }
      await syncAllImages();
    } catch (e) {
      console.error('[sync] first sync error:', e);
      state.status = 'error';
      state.error = e.code === 'permission-denied'
        ? 'ยังไม่ได้ตั้งค่า Firestore Rules (ดูคู่มือ FIREBASE_SETUP.md)'
        : (e.message || 'เชื่อมต่อคลาวด์ไม่สำเร็จ');
      emit();
    }
  }

  function startRealtime(uid) {
    stopRealtime();
    unsubDoc = fb.modFs.onSnapshot(userDocRef(uid), snap => {
      if (!snap.exists()) return;
      const d = snap.data();
      if (!d || !d.payload || d.clientId === CLIENT_ID) return;
      const localS = bridge.getS();
      const remoteAt = d.updatedAt || 0;
      const localAt = localS._updatedAt || 0;
      if (remoteAt <= localAt) return;
      try {
        const remoteS = JSON.parse(d.payload);
        if (localS._dirty) {
          const merged = mergeState(localS, remoteS);
          bridge.replaceS(merged);
          schedulePush();
        } else {
          applyRemote(remoteS, remoteAt, '☁️ ซิงค์ข้อมูลล่าสุดจากเครื่องอื่นแล้ว');
          syncAllImages();
        }
      } catch (e) {
        console.warn('[sync] bad snapshot payload:', e);
      }
    }, err => {
      console.warn('[sync] snapshot listener error:', err);
    });
  }

  function stopRealtime() {
    if (unsubDoc) { unsubDoc(); unsubDoc = null; }
  }

  async function signInGoogle() {
    if (!state.configured) {
      bridge.toast('ยังไม่ได้ใส่ค่า Firebase Config ใน assets/firebase-config.js');
      return;
    }
    state.status = 'connecting';
    state.error = '';
    emit();
    try {
      const f = await loadFirebase();
      const provider = new f.modAuth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try {
        await f.modAuth.signInWithPopup(f.auth, provider);
      } catch (e) {
        if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
          await f.modAuth.signInWithRedirect(f.auth, provider);
        } else if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') {
          state.status = 'idle';
          emit();
        } else {
          throw e;
        }
      }
    } catch (e) {
      console.error('[sync] signIn error:', e);
      state.status = 'error';
      state.error = e.code === 'auth/unauthorized-domain'
        ? `โดเมน ${location.hostname} ยังไม่ได้เพิ่มใน Firebase → Authentication → Authorized domains`
        : (e.message || 'เข้าสู่ระบบไม่สำเร็จ');
      emit();
      bridge.toast(state.error);
    }
  }

  async function signOut() {
    clearTimeout(pushTimer);
    pushTimer = null;
    stopRealtime();
    if (fb && fb.auth) {
      await fb.modAuth.signOut(fb.auth).catch(() => {});
    }
    state.user = null;
    state.status = 'idle';
    state.error = '';
    emit();
    bridge.toast('ออกจากระบบแล้ว (ข้อมูลในเครื่องยังอยู่ครบ)');
  }

  async function syncNow() {
    if (!state.user) return;
    clearTimeout(pushTimer);
    pushTimer = null;
    await handleFirstSync(state.user.uid);
  }

  let authBound = false;
  async function connectFirebase() {
    if (!state.configured || authBound) return;
    try {
      state.status = 'connecting';
      state.error = '';
      emit();
      const f = await loadFirebase();
      if (!f || authBound) return;
      authBound = true;
      f.modAuth.getRedirectResult(f.auth).catch(e => {
        if (e && e.code) { state.error = e.message; emit(); }
      });
      f.modAuth.onAuthStateChanged(f.auth, async user => {
        state.ready = true;
        if (user) {
          state.user = {
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || user.email || 'Google User',
            photoURL: user.photoURL || ''
          };
          emit();
          await handleFirstSync(user.uid);
          startRealtime(user.uid);
        } else {
          stopRealtime();
          state.user = null;
          state.status = 'idle';
          emit();
        }
      });
    } catch (e) {
      console.warn('[sync] firebase init error:', e);
      state.ready = true;
      state.status = navigator.onLine ? 'error' : 'offline';
      state.error = navigator.onLine ? 'โหลดระบบ Google Login ไม่สำเร็จ' : 'ออฟไลน์อยู่';
      emit();
    }
  }

  async function init(b) {
    bridge = b;
    registerSW();
    state.configured = hasValidConfig(window.NLE_FIREBASE_CONFIG);
    emit();

    if (!state.configured) {
      state.ready = true;
      emit();
      return;
    }

    await connectFirebase();
  }

  window.NLE_SYNC = {
    init,
    getState: () => Object.assign({}, state),
    signInGoogle,
    signOut,
    syncNow,
    schedulePush,
    syncImagePut,
    installPWA,
    cacheAllOffline
  };
})();
