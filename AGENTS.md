# Project Rules — nannie compre website (`nle-textbook`)

- **Local repo:** `/Users/nanniejinnn/.gemini/antigravity/scratch/nle-textbook`
- **Remote & Live URL:** `https://github.com/jinjutananny84/nle-textbook` → `https://jinjutananny84.github.io/nle-textbook/`
- **Language:** Reply to the user in **Thai** (concise, friendly, clear).
- **Stack:** Pure static Vanilla HTML/CSS/JS SPA (no build step / no npm) deployed directly on GitHub Pages.

## Architecture Quick Map
- `index.html` — App shell, topbar (compact stacked icons on desktop `≥961px` so all 16 tools fit without scrolling), PWA meta tags.
- `assets/app.js` — Router, textbook parser, highlights/notes/keywords, MCQs (saved answers in `S.ans`), 5-level self-rating (`LV_ORD = [4, 3, 2, 1, 5]` where `5` = pink `🧠 จำเยอะ`), Gemini streaming AI search, `#/sync` UI.
- `assets/sync.js` + `assets/firebase-config.js` — Google Login only (Firebase Auth) + Firestore Cloud Sync (`users/{uid}` + `users/{uid}/images/{id}`), smart merge preserving pre-login data (`_syncedUid`, `nle-tb-pre-sync-backup`), PWA install & offline chapter pre-caching.
- `assets/style.css` — Base styles (light + dark mode).
- `tools/pixel_theme.css` + `tools/pixel_sprites.py` → generates `assets/pixel.css` (pixel doctor sprites, grass hills, twilight sunset dark sky, `.readbar-wrap` reading runner, `.ai-run` loading runner).
- `sw.js` + `manifest.json` + `tools/gen_pwa_icons.py` — PWA offline service worker (network-first for same-origin; never intercepts Firebase/Google Auth/Gemini API).
- `data/` — Chapters (`<id>.md`), exams (`<id>-exams.json`), flows, numbers, abbr, `chapters.json`. Follow `FORMAT.md` when editing content.

## โหมด "ของเจ้าของ" (Owner-Only Draft / Preview — ใช้เป็นค่าเริ่มต้นทุกครั้ง)
- **"ของเจ้าของ"** หมายถึงบัญชี `jinjuta.nanny84@docchula.com` เท่านั้น
- **ห้าม publish ให้เพื่อนใช้จนกว่าผู้ใช้จะสั่ง:** ทุกฟีเจอร์หรือการแก้ไข UI ใหม่ต่อจากนี้ **ต้อง** ลงทะเบียนใน `DRAFT_REGISTRY` ใน `assets/app.js` (ระบุ `key`, `title`, `area`, `desc`, `added`) และครอบด้วย `draftOn('<key>')` (หรือ `.owner-preview` ใน CSS) เพื่อให้เห็นเฉพาะ **ของเจ้าของ** (และ `localhost`) ส่วนเพื่อนจะยังเห็นเวอร์ชันเสถียรเดิม 100%
- **ขั้นตอนตอนสั่ง publish (ประมาณวันละครั้ง):** เมื่อผู้ใช้บอกว่าต้องการ publish ให้ **ลิสต์รายการที่แตกต่าง / ยัง unpublished ทั้งหมด** ออกมาให้ผู้ใช้ดูก่อน เพื่อให้ผู้ใช้เลือกได้ว่าจะ publish ฟีเจอร์ไหนบ้าง แล้วค่อยถอด gate / promote เฉพาะฟีเจอร์ที่ผู้ใช้เลือก
- **ปุ่ม Publish ในเว็บ (เมนู `👑 Owner` → `#/owner`):** เฉพาะของเจ้าของสามารถดูรายการที่ยัง unpublished และกด Publish / Unpublish ให้เพื่อนใช้ได้ทันทีผ่าน Firestore `appConfig/flags`
- **ไอคอนลายเส้นตามธีมเสมอ (ห้ามปล่อยเป็น Emoji ดิบ):** ทุกครั้งที่เพิ่ม emoji/ไอคอนใหม่ใน UI ต้องเพิ่มลายเส้น SVG ทั้งใน `ICON`, `ICON_MV` และ `EMO` ใน `assets/app.js` เพื่อให้ `iconize()` แปลงเป็นลายเส้นเข้าธีม (Monument Valley / Pixel) เสมอ
- **ยัง push ขึ้น `origin main` ตามปกติ:** เพื่อให้เจ้าของเปิดทดสอบฟีเจอร์ใหม่บนทุกเครื่องของตัวเองผ่าน `https://jinjutananny84.github.io/nle-textbook/` ได้ทันทีโดยไม่กระทบเพื่อน

## Mandatory Checklist Before Every Push
1. **Sync with remote first:** Run `git pull --rebase origin main` before pushing (other tools/PRs may push content/exam updates concurrently).
2. **Pixel theme edits:** Never hand-edit `assets/pixel.css`. Edit `tools/pixel_theme.css` or `tools/pixel_sprites.py`, then run:
   ```bash
   python3 tools/pixel_sprites.py
   ```
3. **Bump asset version (`vN`) everywhere** whenever changing `index.html`, `assets/*`, or `sw.js`:
   - `index.html` (`?v=N` on CSS & JS tags)
   - `sw.js` (`CACHE = 'nle-tb-vN'` and `SHELL` query strings)
   - `assets/sync.js` (`CACHE_NAME = 'nle-tb-vN'`)
   - `assets/app.js` (`vN` label in `vSync()` heading)
4. **Validate before commit:** Run `python3 tools/check.py` (must pass with `0 error`).
5. **Deploy:** Commit and push directly (`GIT_TERMINAL_PROMPT=0 git push origin main` — macOS Keychain already caches push credentials).

## Critical Guardrails (Do Not Break)
- **Preserve existing user data:** Never rename `localStorage` key `'nle-tb-v1'` or `IndexedDB` `'nle-img'`. First-time Google sign-in on any device with existing local data must always **merge**, never overwrite.
- **No secrets in repo:** Never commit the user's personal Gemini API Key (`AQ.…` / `AIza…`). It is stored only in `S.geminiKey` (private `localStorage` + user's Firestore doc).
- **Gemini AI Search:** Uses `x-goog-api-key` header + `streamGenerateContent?alt=sse` on free-tier Flash models (`gemini-3.5-flash-lite`, etc.) without `google_search` tool (free tier returns 429 on grounding). Do NOT auto-fire on opening `🔍` — let the user edit their question first. Keep `textarea, .ai-body` excluded from `pop`'s `mousedown` `preventDefault()` so drag-to-select sticky notes work inside Gemini answers.
