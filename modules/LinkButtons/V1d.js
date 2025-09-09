/* Link Buttons — uses Excel to resolve AUN/PartNo for the active Meldung.
 * - Context menu “Options” to pick/create the Excel (same FS API flow).
 * - Looks up the row with header: meldung | auftrag | part | serial   (sheet: "records")
 * - Buttons:
 *     Event, ZIAUF3, ZIKV, ZIQA → need AUN (auftrag)   → no-op if missing
 *     CMDS                     → needs PartNo (part)   → no-op if missing
 *     ZILLK                    → uses Meldung directly → opens even without Excel
 * - Layout switch by GridStack height (2 rows => compact 3×2; else 2×4).
 * - Instant updates when other modules change Meldung (storage + visibility + polling).
 */

(function () {
  // ---------- styles (extend or create) ----------
  (function injectCSS() {
    const css = `
    .ops-root{ height:100%; }
    .ops-outer{ height:100%; width:100%; padding:.6rem; box-sizing:border-box; overflow:hidden; }
    .ops-grid{
      height:100%; box-sizing:border-box; display:grid;
      grid-template-columns: 1fr 1fr; grid-template-rows: repeat(4, 1fr);
      gap:.6rem;
      grid-template-areas:
        "leftTop r0"
        "leftTop r1"
        "leftBot r2"
        "leftBot r3";
    }
    .ops-compact .ops-grid{
      grid-template-columns: repeat(3, 1fr);
      grid-template-rows: repeat(2, 1fr);
      grid-template-areas:
        "leftTop r0 r2"
        "leftBot r1 r3";
    }
    .ops-card{
      width:100%; height:100%; box-sizing:border-box;
      background: linear-gradient(to bottom, rgba(255,255,255,.08), rgba(255,255,255,.06)), var(--module-bg);
      border: 1px solid var(--module-border-color, #e5e7eb);
      border-radius: var(--module-border-radius, 1.25rem);
      color: var(--text-color);
      display:flex; align-items:center; justify-content:center;
      padding:.5rem 1rem; font-weight:600; letter-spacing:.2px;
      font-size: clamp(.9rem, 1.1vw + .4vh, 1.25rem);
      user-select:none; text-align:center;
      transition: transform .12s ease, box-shadow .12s ease, background-color .12s ease;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 6px 20px rgba(0,0,0,.12);
      cursor: pointer;
    }
    .ops-card:hover{ transform: translateY(-1px); box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 10px 26px rgba(0,0,0,.18); }
    .ops-card:active{ transform: translateY(0); filter:saturate(1.05); }
    .leftTop{ grid-area:leftTop; } .leftBot{ grid-area:leftBot; }
    .r0{ grid-area:r0; } .r1{ grid-area:r1; } .r2{ grid-area:r2; } .r3{ grid-area:r3; }
    .ops-bounce{ animation: ops-bounce .25s ease; }
    @keyframes ops-bounce { 0%{transform:scale(1)} 50%{transform:scale(1.02)} 100%{transform:scale(1)} }

    /* Minimal context menu + modal for options */
    .ops-menu{position:fixed; z-index:1000; display:none; min-width:180px; padding:.25rem;
      background:var(--sidebar-module-card-bg,#fff); color:var(--sidebar-module-card-text,#111);
      border:1px solid var(--border-color,#e5e7eb); border-radius:.5rem; box-shadow:0 10px 24px rgba(0,0,0,.18);}
    .ops-menu.open{display:block}
    .ops-menu .mi{display:block; width:100%; padding:.5rem .75rem; text-align:left; border-radius:.4rem; background:transparent;}
    .ops-menu .mi:hover{background:rgba(0,0,0,.06)}

    .ops-modal{position:fixed; inset:0; display:none; place-items:center; background:rgba(0,0,0,.35); z-index:1050;}
    .ops-modal.open{display:grid;}
    .ops-dialog{background:#fff; color:#111827; width:min(92vw,720px); border-radius:.9rem; padding:1rem; box-shadow:0 10px 30px rgba(0,0,0,.25);}
    .ops-row{display:flex; gap:.5rem; align-items:center;}
    .ops-btn{background:var(--button-bg); color:var(--button-text); padding:.35rem .6rem; border-radius:.5rem; font-size:.9rem;}
    .ops-btn.secondary{background:#eee; color:#111;}
    .ops-file{font-size:.9rem; opacity:.85;}
    `;
    let tag = document.getElementById('ops-panel-styles');
    if (!tag) {
      tag = document.createElement('style');
      tag.id = 'ops-panel-styles';
      document.head.appendChild(tag);
    }
    tag.textContent = css;
  })();

  // ---------- shared helpers ----------
  const LS_KEY = 'module_data_v1';  // holds .general.Meldung
  const SHEET_NAME = 'records';     // same as the Record Sheet module
  const HEAD = ['meldung','auftrag','part','serial'];
  const IDB_NAME = 'modulesApp';
  const IDB_STORE = 'fs-handles';
  const WATCH_INTERVAL = 300;

  function loadDoc(){ try { return JSON.parse(localStorage.getItem(LS_KEY)) || {general:{}}; } catch { return {general:{}}; } }
  const getDocString = () => localStorage.getItem(LS_KEY) || '';
  function activeMeldung(){ return (loadDoc()?.general?.Meldung || '').trim(); }

  function instanceIdOf(root){
    return root.closest('.grid-stack-item')?.dataset?.instanceId || ('inst-' + Math.random().toString(36).slice(2));
  }
  function clamp(n,min,max){ return Math.max(min, Math.min(max,n)); }

  // IndexedDB for file handles
  function idbOpen(){ return new Promise((res,rej)=>{ const r=indexedDB.open(IDB_NAME,1); r.onupgradeneeded=()=>r.result.createObjectStore(IDB_STORE); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
  async function idbSet(k,v){ const db=await idbOpen(); return new Promise((res,rej)=>{ const tx=db.transaction(IDB_STORE,'readwrite'); tx.objectStore(IDB_STORE).put(v,k); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); }); }
  async function idbGet(k){ const db=await idbOpen(); return new Promise((res,rej)=>{ const tx=db.transaction(IDB_STORE,'readonly'); const rq=tx.objectStore(IDB_STORE).get(k); rq.onsuccess=()=>res(rq.result||null); rq.onerror=()=>rej(rq.error); }); }
  async function idbDel(k){ const db=await idbOpen(); return new Promise((res,rej)=>{ const tx=db.transaction(IDB_STORE,'readwrite'); tx.objectStore(IDB_STORE).delete(k); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); }); }
  async function ensureRWPermission(handle){
    if (!handle?.queryPermission) return true;
    const q = await handle.queryPermission({mode:'readwrite'}); if (q==='granted') return true;
    const r = await handle.requestPermission({mode:'readwrite'}); return r==='granted';
  }

  // Robust XLSX loader
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
    })).filter(r => r.meldung || r.auftrag || r.part || r.serial);
  }
  async function writeEmpty(handle){ // used when creating a new sheet
    await ensureXLSX();
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([HEAD]);
    XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME);
    const out = XLSX.write(wb, { bookType:'xlsx', type:'array' });
    const w = await handle.createWritable();
    await w.write(new Blob([out], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    await w.close();
  }

  // ---------- render ----------
  window.renderOpsPanel = function renderOpsPanel(root, ctx){
    const s = (ctx && ctx.moduleJson && ctx.moduleJson.settings) || {};
    const leftTop = s.leftTop || 'Event';
    const leftBottom = s.leftBottom || 'CMDS';
    const r = Array.isArray(s.rightLabels) && s.rightLabels.length
      ? s.rightLabels.slice(0,4)
      : ['ZIAUF3','ZILLK','ZIKV','ZIQA'];

    root.classList.add('ops-root');

    root.innerHTML = `
      <div class="ops-outer">
        <div class="ops-grid">
          <div class="ops-card leftTop">${leftTop}</div>
          <div class="ops-card leftBot">${leftBottom}</div>
          <div class="ops-card r0">${r[0] || ''}</div>
          <div class="ops-card r1">${r[1] || ''}</div>
          <div class="ops-card r2">${r[2] || ''}</div>
          <div class="ops-card r3">${r[3] || ''}</div>
        </div>
      </div>

      <!-- context menu + options modal -->
      <div class="ops-menu"><button class="mi mi-opt">⚙️ Optionen</button></div>
      <div class="ops-modal">
        <div class="ops-dialog">
          <div class="ops-row" style="justify-content:space-between;margin-bottom:.5rem">
            <div class="font-semibold">Link-Knöpfe – Optionen</div>
            <button class="ops-btn secondary ops-close">Schließen</button>
          </div>
          <div class="ops-row" style="gap:.6rem">
            <button class="ops-btn ops-pick">Excel wählen</button>
            <button class="ops-btn secondary ops-create">Excel erstellen</button>
            <span class="ops-file"></span>
          </div>
        </div>
      </div>
    `;

    // ---- URLs ----
    const URLS = {
      ZIAUF3_BASE: 'https://sap-p04.lht.ham.dlh.de/sap/bc/gui/sap/its/webgui?sap-client=002&~transaction=*ziauf3+CAUFVD-AUFNR%3D',
      ZILLK_BASE:  'https://sap-p04.lht.ham.dlh.de/sap/bc/gui/sap/its/webgui?sap-client=002&~transaction=*zillk+ZILLK_IE_EINSTIEG-QMNUM%3D',
      ZILLK_TAIL:  '%3BDYNP_OKCODE%3DAENDERN',
      ZIKV_BASE:   'https://sap-p04.lht.ham.dlh.de/sap/bc/gui/sap/its/webgui?sap-client=002&~transaction=*zikv+AUFK-AUFNR%3D',
      ZIQA_BASE:   'https://sap-p04.lht.ham.dlh.de/sap/bc/gui/sap/its/webgui?sap-client=002&~transaction=*ziqa+AUFK-AUFNR%3D',
      EDOC_BASE:   'https://lww.edoc-read.lht.ham.dlh.de/edoc/app/login.html?nextURL='
    };
    const openNew = (url) => window.open(url, '_blank', 'noopener,noreferrer');

    // ----- per-instance config -----
    const instanceId = instanceIdOf(root);
    const idbKey = `opsPanel:${instanceId}`;
    function loadCfg(){
      const d = loadDoc();
      const cfg = d?.instances?.[instanceId]?.opsPanel || {};
      return { idbKey: cfg.idbKey || idbKey, fileName: cfg.fileName || '' };
    }
    function saveCfg(cfg){
      const d = loadDoc(); d.instances ||= {}; d.instances[instanceId] ||= {};
      d.instances[instanceId].opsPanel = cfg; localStorage.setItem(LS_KEY, JSON.stringify(d));
    }
    function removeCfg(){
      const d = loadDoc();
      if (d?.instances?.[instanceId]) {
        delete d.instances[instanceId].opsPanel;
        if (!Object.keys(d.instances[instanceId]).length) delete d.instances[instanceId];
        localStorage.setItem(LS_KEY, JSON.stringify(d));
      }
    }
    const cfg = loadCfg();
    const menuEl   = root.querySelector('.ops-menu');
    const modalEl  = root.querySelector('.ops-modal');
    const fileLbl  = root.querySelector('.ops-file');
    fileLbl.textContent = cfg.fileName ? `• ${cfg.fileName}` : 'Keine Datei gewählt';

    let fileHandle = null;
    let cache = []; // rows from Excel

    async function bindHandle(h){
      const ok = await ensureRWPermission(h); if (!ok) return false;
      fileHandle = h; await idbSet(cfg.idbKey, h);
      cfg.fileName = h.name || 'Dictionary.xlsx'; saveCfg(cfg);
      fileLbl.textContent = `• ${cfg.fileName}`;
      return true;
    }

    async function pickExcel(){
      try {
        const [h] = await showOpenFilePicker({
          types: [{ description:'Excel', accept:{ 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
          excludeAcceptAllOption:false, multiple:false
        });
        if (h && await bindHandle(h)) { cache = await readAll(h); }
      } catch(e){ /* ignore abort */ }
    }
    async function createExcel(){
      try {
        const h = await showSaveFilePicker({
          suggestedName: 'Dictionary.xlsx',
          types: [{ description:'Excel', accept:{ 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }]
        });
        if (h && await bindHandle(h)) { cache = []; await writeEmpty(h); }
      } catch(e){ /* ignore abort */ }
    }

    // restore
    (async () => {
      try {
        const h = await idbGet(cfg.idbKey);
        if (h && await ensureRWPermission(h)) { fileHandle = h; cache = await readAll(h); }
      } catch(e){ /* ignore */ }
    })();

    // ----- context menu -----
    function showMenu(x,y){
      const pad=8, vw=innerWidth, vh=innerHeight;
      const rect=menuEl.getBoundingClientRect(); const w=rect.width||200, h=rect.height||44;
      menuEl.style.left = clamp(x, pad, vw-w-pad) + 'px';
      menuEl.style.top  = clamp(y, pad, vh-h-pad) + 'px';
      menuEl.classList.add('open');
    }
    root.addEventListener('contextmenu', (e)=>{ e.preventDefault(); e.stopPropagation(); showMenu(e.clientX, e.clientY); });
    document.addEventListener('click', ()=>menuEl.classList.remove('open'));
    document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') menuEl.classList.remove('open'); });
    menuEl.querySelector('.mi-opt').addEventListener('click', ()=>{ menuEl.classList.remove('open'); modalEl.classList.add('open'); });

    modalEl.querySelector('.ops-close').addEventListener('click', ()=>modalEl.classList.remove('open'));
    modalEl.querySelector('.ops-pick').addEventListener('click', pickExcel);
    modalEl.querySelector('.ops-create').addEventListener('click', createExcel);

    // ----- resolve current values from cache -----
    function lookup(){
      const m = activeMeldung();
      if (!m) return { m:'', aun:'', part:'' };
      const row = cache.find(r => (r.meldung||'').trim() === m);
      return { m, aun: (row?.auftrag||'').trim(), part: (row?.part||'').trim() };
    }

    // ----- Click behavior -----
    root.querySelectorAll('.ops-card').forEach(el => {
      el.addEventListener('click', async () => {
        const label = (el.textContent || '').trim().toUpperCase();
        const { m, aun, part } = lookup();

        const openIf = (cond, url) => { if (cond) { window.open(url, '_blank', 'noopener,noreferrer'); el.classList.add('ops-bounce'); setTimeout(()=>el.classList.remove('ops-bounce'), 260); } };

        if (label === 'EVENT') {
          if (!aun) return;                                   // need AUN
          const raw = `func=deeplinksearch&searchTab=event&OPRange=&JobOrderNo=${aun}`;
          const b64 = (()=>{ try{return btoa(raw);}catch{return btoa(unescape(encodeURIComponent(raw)));} })();
          openIf(true, URLS.EDOC_BASE + encodeURIComponent(b64) + '&b64=t');
          return;
        }
        if (label === 'CMDS') {
          if (!part) return;                                   // need PartNo
          const raw = `func=deeplinksearch&searchTab=maint&DocumentType=CMDS&Status=eRL&Component=${part}`;
          const b64 = (()=>{ try{return btoa(raw);}catch{return btoa(unescape(encodeURIComponent(raw)));} })();
          openIf(true, URLS.EDOC_BASE + encodeURIComponent(b64) + '&b64=t');
          return;
        }
        if (label === 'ZIAUF3') { if (!aun) return; openIf(true, URLS.ZIAUF3_BASE + encodeURIComponent(aun)); return; }
        if (label === 'ZILLK')  { if (!m)   return; openIf(true, URLS.ZILLK_BASE  + encodeURIComponent(m) + URLS.ZILLK_TAIL); return; }
        if (label === 'ZIKV')   { if (!aun) return; openIf(true, URLS.ZIKV_BASE   + encodeURIComponent(aun)); return; }
        if (label === 'ZIQA')   { if (!aun) return; openIf(true, URLS.ZIQA_BASE   + encodeURIComponent(aun)); return; }

        // default: click-to-copy the tile label
        if (navigator.clipboard) navigator.clipboard.writeText(label).catch(()=>{});
        el.classList.add('ops-bounce'); setTimeout(()=>el.classList.remove('ops-bounce'), 260);
      });
    });

    // --- Layout switch based on GridStack cell height (stable, no flicker) ---
    const itemEl = root.closest('.grid-stack-item');
    function getCellHeight(){
      const h = itemEl?.gridstackNode?.h || parseInt(itemEl?.getAttribute('gs-h') || '0', 10);
      return isNaN(h) ? 0 : h;
    }
    function applyMode(){
      const isCompact = getCellHeight() <= 2;   // 2 cells high => 3×2 layout
      root.classList.toggle('ops-compact', isCompact);
    }
    applyMode();
    const attrObserver = new MutationObserver(applyMode);
    if (itemEl) attrObserver.observe(itemEl, { attributes: true, attributeFilter: ['gs-h','style','class'] });

    // ---- keep Meldung/cache current (instant across tabs + within page) ----
    let lastDoc = getDocString();
    const watcher = setInterval(async () => {
      const now = getDocString();
      if (now !== lastDoc) {
        lastDoc = now;
        // if we have a file, ensure cache exists; not re-reading every time to avoid IO,
        // because this module only *reads* on click. No-op here is fine.
      }
    }, WATCH_INTERVAL);
    window.addEventListener('storage', e => { if (e.key === LS_KEY) lastDoc = getDocString(); });
    window.addEventListener('visibilitychange', () => { if (!document.hidden) lastDoc = getDocString(); });

    // Cleanup when removed
    const mo = new MutationObserver(() => {
      if (!document.body.contains(root)) {
        attrObserver.disconnect();
        clearInterval(watcher);
        menuEl?.remove();
        (async()=>{ try{await idbDel(idbKey);}catch{} try{removeCfg();}catch{} })();
        mo.disconnect();
      }
    });
    mo.observe(document.body, { childList:true, subtree:true });
  };
})();
