/* Gerätedaten
 * - No extra panel box; uses app theme background directly
 * - Excel pick/create (headers: meldung, auftrag, part, serial)
 * - Meldung is read-only and mirrors module_data_v1.general.Meldung
 * - Typing into Auftrag / P/N / S/N updates (upsert by meldung) in Excel
 * - Reacts instantly to changes from other modules:
 *     • storage event (other browser tabs)
 *     • visibilitychange (when tab refocuses)
 *     • polling watcher on localStorage string (same-document)
 * - Responsive: gs-w >= 4 => horizontal; <= 3 => vertical
 * - Copy buttons next to each field
 * - Requires FS Access API (Chromium); auto-loads xlsx from CDN.
 */
(function () {
  /* ---------- styles (create or replace) ---------- */
  const CSS = `
  .rs-root{height:100%;display:flex;flex-direction:column;gap:.6rem}
  /* No extra box — just spacing */
  .rs-head{font-weight:700; font-size:1.35rem; text-align:center; margin:.2rem 0 .2rem; user-select:none; color:var(--text-color)}
  .rs-form{flex:1; overflow:auto; padding:.25rem .1rem .1rem .1rem;
           scrollbar-width:none; -ms-overflow-style:none}
  .rs-form::-webkit-scrollbar{width:0;height:0;display:none}
  .rs-grid{display:grid; gap:.9rem}
  .rs-grid.h{grid-template-columns: 1fr 1fr}
  .rs-grid.v{grid-template-columns: 1fr}
  .rs-field{display:flex; flex-direction:column; gap:.35rem}
  .rs-label{font-weight:600; opacity:.95; color:var(--text-color)}
  .rs-inputwrap{display:grid; grid-template-columns:auto 38px; align-items:center}
  .rs-input{width:100%; background:rgba(255,255,255,.08); border:1px solid var(--module-border-color);
            color:var(--text-color); padding:.45rem .55rem; border-radius:.4rem}
  .rs-copy{width:34px;height:34px; display:flex; align-items:center; justify-content:center;
           border:1px solid var(--module-border-color); border-radius:.35rem;
           background:rgba(255,255,255,.08); cursor:pointer; color:var(--text-color)}
  .rs-copy:active{transform:scale(.98)}
  .rs-note{font-size:.85rem; opacity:.75; margin-top:.15rem; color:var(--text-color)}
  `;
  (function injectOrReplace() {
    let tag = document.getElementById('record-sheet-styles');
    if (!tag) { tag = document.createElement('style'); tag.id = 'record-sheet-styles'; document.head.appendChild(tag); }
    tag.textContent = CSS;
  })();

  /* ---------- utilities ---------- */
  const LS_DOC = 'module_data_v1';                    // shared doc
  const IDB_NAME = 'modulesApp';
  const IDB_STORE = 'fs-handles';
  const SHEET_NAME = 'records';
  const WATCH_INTERVAL = 300;                         // ms, for same-document "instant" updates

  const parse = (s, fb) => { try { return JSON.parse(s) ?? fb; } catch { return fb; } };
  const loadDoc = () => parse(localStorage.getItem(LS_DOC), { __meta:{v:1}, general:{}, instances:{} });
  const saveDoc = (doc) => { doc.__meta = { v:1, updatedAt: new Date().toISOString() }; localStorage.setItem(LS_DOC, JSON.stringify(doc)); };

  const getDocString = () => localStorage.getItem(LS_DOC) || '';
  const instanceIdOf = root => root.closest('.grid-stack-item')?.dataset?.instanceId || ('inst-' + Math.random().toString(36).slice(2));
  const debounce = (ms, fn)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };

  // IndexDB helpers for file handles
  function idbOpen(){ return new Promise((res,rej)=>{ const r=indexedDB.open(IDB_NAME,1); r.onupgradeneeded=()=>r.result.createObjectStore(IDB_STORE); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
  async function idbSet(k,v){ const db=await idbOpen(); return new Promise((res,rej)=>{ const tx=db.transaction(IDB_STORE,'readwrite'); tx.objectStore(IDB_STORE).put(v,k); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); }); }
  async function idbGet(k){ const db=await idbOpen(); return new Promise((res,rej)=>{ const tx=db.transaction(IDB_STORE,'readonly'); const rq=tx.objectStore(IDB_STORE).get(k); rq.onsuccess=()=>res(rq.result||null); rq.onerror=()=>rej(rq.error); }); }
  async function idbDel(k){ const db=await idbOpen(); return new Promise((res,rej)=>{ const tx=db.transaction(IDB_STORE,'readwrite'); tx.objectStore(IDB_STORE).delete(k); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); }); }
  async function ensureRWPermission(handle){
    if (!handle?.queryPermission) return true;
    const q = await handle.queryPermission({mode:'readwrite'}); if (q==='granted') return true;
    const r = await handle.requestPermission({mode:'readwrite'}); return r==='granted';
  }

  // XLSX loader (robust)
  async function ensureXLSX(){
    if (window.XLSX) return;
    if (window.__XLSX_LOAD_PROMISE__) return window.__XLSX_LOAD_PROMISE__;
    const urls = [
      'https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js',
      'https://cdn.jsdelivr.net/npm/xlsx@0.20.2/dist/xlsx.full.min.js',
      'https://unpkg.com/xlsx@0.20.2/dist/xlsx.full.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.20.2/xlsx.full.min.js'
    ];
    window.__XLSX_LOAD_PROMISE__ = (async()=>{
      let last;
      for (const url of urls) {
        try {
          await new Promise((ok,err)=>{ const s=document.createElement('script'); s.src=url; s.async=true; s.onload=ok; s.onerror=()=>err(new Error('load '+url)); document.head.appendChild(s); });
          if (window.XLSX) return;
        } catch(e){ last=e; }
      }
      throw last || new Error('XLSX load failed');
    })();
    return window.__XLSX_LOAD_PROMISE__;
  }

  // Excel helpers
  const HEAD = ['meldung','auftrag','part','serial']; // exact header row
  async function readAll(handle){
    await ensureXLSX();
    const f = await handle.getFile();
    if (f.size === 0) return [];
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type:'array' });
    const ws = wb.Sheets[SHEET_NAME] || wb.Sheets[wb.SheetNames[0]];
    if (!ws) return [];
    const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
    const hdr = rows[0]?.map(h => String(h||'').toLowerCase().trim()) || [];
    const idx = Object.fromEntries(HEAD.map(h => [h, hdr.indexOf(h)]));
    return rows.slice(1).map(r => ({
      meldung: String(r[idx.meldung] ?? ''),
      auftrag: String(r[idx.auftrag] ?? ''),
      part:    String(r[idx.part] ?? ''),
      serial:  String(r[idx.serial] ?? '')
    })).filter(row => row.meldung !== '' || row.auftrag !== '' || row.part !== '' || row.serial !== '');
  }
  async function writeAll(handle, rows){
    await ensureXLSX();
    const wb = XLSX.utils.book_new();
    const aoa = [HEAD, ...rows.map(r => [r.meldung||'', r.auftrag||'', r.part||'', r.serial||''])];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME);
    const out = XLSX.write(wb, { bookType:'xlsx', type:'array' });
    const w = await handle.createWritable();
    await w.write(new Blob([out], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    await w.close();
  }

  // ---------- UI ----------
  function buildUI(root){
    root.innerHTML = `
      <div class="rs-root">
        <div class="rs-head">(Gerätename)</div>
        <div class="rs-form">
          <div class="rs-grid h">
            <div class="rs-field">
              <label class="rs-label">Meldung</label>
              <div class="rs-inputwrap">
                <input class="rs-input rs-meldung" type="text" readonly />
                <button class="rs-copy rs-copy-m" title="Kopieren">⧉</button>
              </div>
            </div>
            <div class="rs-field">
              <label class="rs-label">Auftrag</label>
              <div class="rs-inputwrap">
                <input class="rs-input rs-auftrag" type="text" />
                <button class="rs-copy rs-copy-a" title="Kopieren">⧉</button>
              </div>
            </div>

            <div class="rs-field">
              <label class="rs-label">P/N</label>
              <div class="rs-inputwrap">
                <input class="rs-input rs-part" type="text" />
                <button class="rs-copy rs-copy-p" title="Kopieren">⧉</button>
              </div>
            </div>
            <div class="rs-field">
              <label class="rs-label">S/N</label>
              <div class="rs-inputwrap">
                <input class="rs-input rs-serial" type="text" />
                <button class="rs-copy rs-copy-s" title="Kopieren">⧉</button>
              </div>
            </div>
          </div>
          <div class="rs-note"></div>
        </div>
      </div>

      <!-- Options modal (reuses neutral styles used elsewhere) -->
      <div class="db-modal rs-modal" style="position:fixed; inset:0; display:none; place-items:center; background:rgba(0,0,0,.35); z-index:50;">
        <div class="db-panel" style="background:#fff; color:#111827; width:min(92vw,720px); border-radius:.9rem; padding:1rem;">
          <div class="db-row" style="display:flex; justify-content:space-between; align-items:center; gap:.5rem; margin-bottom:.5rem">
            <div class="font-semibold">Gerätedaten – Optionen</div>
            <button class="db-btn secondary rs-close" style="background:#eee; border-radius:.5rem; padding:.35rem .6rem">Schließen</button>
          </div>
          <div class="db-field">
            <label style="font-size:.85rem; font-weight:600; display:block; margin-bottom:.25rem">Excel-Datei</label>
            <div class="db-row" style="display:flex; gap:.5rem; align-items:center">
              <button class="db-btn rs-pick" style="background:var(--button-bg); color:var(--button-text); border-radius:.5rem; padding:.35rem .6rem">Excel wählen</button>
              <button class="db-btn rs-create" style="background:rgba(0,0,0,.08); border-radius:.5rem; padding:.35rem .6rem">Excel erstellen</button>
              <span class="rs-file db-file"></span>
            </div>
          </div>
        </div>
      </div>
    `;
    // Context menu
    const menu = document.createElement('div');
    menu.className = 'db-menu';
    menu.innerHTML = `<button class="mi mi-opt">⚙️ Optionen</button>`;
    document.body.appendChild(menu);

    const el = {
      grid: root.querySelector('.rs-grid'),
      head: root.querySelector('.rs-head'),
      meldung: root.querySelector('.rs-meldung'),
      auftrag: root.querySelector('.rs-auftrag'),
      part: root.querySelector('.rs-part'),
      serial: root.querySelector('.rs-serial'),
      note: root.querySelector('.rs-note'),
      copyM: root.querySelector('.rs-copy-m'),
      copyA: root.querySelector('.rs-copy-a'),
      copyP: root.querySelector('.rs-copy-p'),
      copyS: root.querySelector('.rs-copy-s'),
      modal: root.querySelector('.rs-modal'),
      mClose: root.querySelector('.rs-close'),
      mPick: root.querySelector('.rs-pick'),
      mCreate: root.querySelector('.rs-create'),
      mFile: root.querySelector('.rs-file'),
      menu
    };
    return el;
  }

  /* ---------- main ---------- */
  window.renderRecordSheet = function(root) {
    if (!('showOpenFilePicker' in window) || !('showSaveFilePicker' in window)) {
      root.innerHTML = `<div class="p-2 text-sm">Dieses Modul benötigt die File System Access API (Chromium).</div>`;
      return;
    }

    const els = buildUI(root);
    const instanceId = instanceIdOf(root);
    const idbKey = `recordSheet:${instanceId}`;

    let handle = null;
    let cache = []; // array of {meldung, auftrag, part, serial}

    // per-instance config in localStorage
    function loadCfg(){
      const doc = loadDoc();
      const cfg = doc?.instances?.[instanceId]?.recordSheet || {};
      return { idbKey: cfg.idbKey || idbKey, fileName: cfg.fileName || '' };
    }
    function saveCfg(cfg){
      const doc = loadDoc(); doc.instances ||= {}; doc.instances[instanceId] ||= {};
      doc.instances[instanceId].recordSheet = cfg; saveDoc(doc);
    }
    function removeCfg(){
      const doc = loadDoc(); if (doc?.instances?.[instanceId]) {
        delete doc.instances[instanceId].recordSheet;
        if (!Object.keys(doc.instances[instanceId]).length) delete doc.instances[instanceId];
        saveDoc(doc);
      }
    }
    const cfg = loadCfg();
    els.mFile.textContent = cfg.fileName ? `• ${cfg.fileName}` : 'Keine Datei gewählt';

    // UI helpers
    const setNote = (s)=> els.note.textContent = s || '';
    const copy = async (val)=> { try { await navigator.clipboard.writeText(val||''); setNote('Kopiert.'); setTimeout(()=>setNote(''), 800); } catch{ setNote('Kopieren fehlgeschlagen'); } };
    els.copyM.onclick = () => copy(els.meldung.value);
    els.copyA.onclick = () => copy(els.auftrag.value);
    els.copyP.onclick = () => copy(els.part.value);
    els.copyS.onclick = () => copy(els.serial.value);

    // Responsive layout by GridStack width attribute
    const gridItem = root.closest('.grid-stack-item');
    function applyLayout(){
      const w = parseInt(gridItem?.getAttribute('gs-w') || gridItem?.dataset?.gsWidth || '4', 10);
      els.grid.classList.toggle('h', w >= 4);
      els.grid.classList.toggle('v', w <= 3);
    }
    applyLayout();
    const moSize = new MutationObserver(muts => { if (muts.some(m => m.attributeName === 'gs-w')) applyLayout(); });
    if (gridItem) moSize.observe(gridItem, { attributes:true });

    // Context menu for options
    function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }
    root.addEventListener('contextmenu', e => {
      e.preventDefault(); e.stopPropagation();
      const m = els.menu, pad = 8, vw = innerWidth, vh = innerHeight;
      const rect = m.getBoundingClientRect(); const w = rect.width||200, h = rect.height||44;
      m.style.left = clamp(e.clientX, pad, vw - w - pad) + 'px';
      m.style.top  = clamp(e.clientY, pad, vh - h - pad) + 'px';
      m.classList.add('open');
    });
    addEventListener('click', () => els.menu.classList.remove('open'));
    addEventListener('keydown', e => { if (e.key === 'Escape') els.menu.classList.remove('open'); });
    els.menu.querySelector('.mi-opt').addEventListener('click', () => { els.menu.classList.remove('open'); openModal(); });

    function openModal(){ els.modal.style.display = 'grid'; }
    function closeModal(){ els.modal.style.display = 'none'; }
    els.mClose.onclick = closeModal;

    // File handling
    async function bindHandle(h){
      const ok = await ensureRWPermission(h); if (!ok) { setNote('Berechtigung verweigert.'); return false; }
      handle = h; await idbSet(cfg.idbKey, h);
      cfg.fileName = h.name || 'Dictionary.xlsx'; saveCfg(cfg);
      els.mFile.textContent = `• ${cfg.fileName}`;
      return true;
    }
    els.mPick.onclick = async () => {
      try {
        const [h] = await showOpenFilePicker({
          types: [{ description:'Excel', accept:{ 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
          excludeAcceptAllOption:false, multiple:false
        });
        if (h && await bindHandle(h)) { cache = await readAll(h); setNote('Datei geladen.'); refreshFromCache(); }
      } catch(e){ if (e?.name!=='AbortError') setNote('Auswahl fehlgeschlagen.'); }
    };
    els.mCreate.onclick = async () => {
      try {
        const h = await showSaveFilePicker({
          suggestedName: 'Dictionary.xlsx',
          types: [{ description:'Excel', accept:{ 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }]
        });
        if (h && await bindHandle(h)) { cache = []; await writeAll(h, cache); setNote('Datei erstellt.'); refreshFromCache(); }
      } catch(e){ if (e?.name!=='AbortError') setNote('Erstellen fehlgeschlagen.'); }
    };

    // Load previous handle if available
    (async () => {
      try {
        const h = await idbGet(cfg.idbKey);
        if (h && await ensureRWPermission(h)) { handle = h; cache = await readAll(h); refreshFromCache(); }
      } catch (e) { /* ignore */ }
    })();

    // Current Meldung value (from LS)
    function activeMeldung(){ return (loadDoc()?.general?.Meldung || '').trim(); }

    // Show current row in inputs
    function refreshFromCache(){
      const m = activeMeldung();
      els.meldung.value = m;
      if (!m) { els.auftrag.value = els.part.value = els.serial.value = ''; return; }
      const row = cache.find(r => (r.meldung || '').trim() === m);
      els.auftrag.value = row?.auftrag || '';
      els.part.value    = row?.part    || '';
      els.serial.value  = row?.serial  || '';
    }

    // Instant updates from other modules (same document + other tabs)
    // 1) other tabs
    addEventListener('storage', (e) => { if (e.key === LS_DOC) refreshFromCache(); });
    // 2) refocus
    addEventListener('visibilitychange', () => { if (!document.hidden) refreshFromCache(); });
    // 3) same-document watcher
    let lastDocString = getDocString();
    const watcher = setInterval(() => {
      const now = getDocString();
      if (now !== lastDocString) { lastDocString = now; refreshFromCache(); }
    }, WATCH_INTERVAL);

    // Writing logic: update cache then write to disk (debounced)
    const scheduleSave = debounce(350, async () => {
      if (!handle) { setNote('Keine Excel-Datei gewählt.'); return; }
      try { await writeAll(handle, cache); setNote('Gespeichert.'); setTimeout(()=>setNote(''), 700); }
      catch { setNote('Speichern fehlgeschlagen.'); }
    });

    function putField(field, value){
      const m = activeMeldung(); if (!m) return; // nothing to index by
      let row = cache.find(r => (r.meldung||'').trim() === m);
      if (!row) { row = { meldung: m, auftrag:'', part:'', serial:'' }; cache.push(row); }
      row[field] = value;
      scheduleSave();
    }

    // Inputs: Meldung is read-only; others update cache+file
    els.auftrag.addEventListener('input', () => putField('auftrag', els.auftrag.value));
    els.part.addEventListener('input',    () => putField('part',    els.part.value));
    els.serial.addEventListener('input',  () => putField('serial',  els.serial.value));

    // Initialize from current LS
    refreshFromCache();

    // Cleanup on removal
    const mo = new MutationObserver(() => {
      if (!document.body.contains(root)) {
        clearInterval(watcher);
        els.menu?.remove();
        (async () => { try { await idbDel(cfg.idbKey); } catch {} try { removeCfg(); } catch {} })();
        mo.disconnect();
      }
    });
    mo.observe(document.body, { childList:true, subtree:true });
  };
})();

