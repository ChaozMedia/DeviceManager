/* DeviceList (Excel)
   - Right-click for Options (button hidden)
   - Pick/create .xlsx; per-instance colors (bg, item, title, subtitle, active)
   - Optional Title (from Options). Empty => hidden => list goes to top
   - Cross-instance Sortable; drag by right handle; click card sets active Meldung
   - Highlights card if Meldung == module_data_v1.general.Meldung
   - Persists config per instance in localStorage; file handle in IndexedDB
   - Cleans up stored values when the widget is removed
   - Requires: File System Access API (Chromium) + Sortable.js
*/
(function(){
  // ---------- one-time styles ----------
  if (!document.getElementById('device-board-styles')) {
    const css = `
    .db-root{height:100%;display:flex;flex-direction:column;gap:.6rem;
      --dl-bg:#f5f7fb; --dl-item-bg:#ffffff; --dl-title:#2563eb; --dl-sub:#4b5563; --dl-active:#10b981;}
    .db-titlebar{font-weight:600; color:var(--text-color); padding:0 .15rem; user-select:none}
    .db-surface{flex:1; background:var(--dl-bg); border-radius:1rem; padding:.75rem; overflow:auto;}
    .db-list{display:flex; flex-direction:column; gap:.65rem; min-height:1.5rem;}
    .db-card{
      background:var(--dl-item-bg); color:var(--dl-sub);
      border-radius:.8rem; padding:.65rem .75rem; box-shadow:0 2px 6px rgba(0,0,0,.06);
      display:flex; align-items:center; gap:.75rem; user-select:none;
      transition: box-shadow .12s ease, outline-color .12s ease, transform .12s ease;
    }
    .db-card .db-title{ color:var(--dl-title); font-weight:600; line-height:1.1; }
    .db-card .db-sub{ color:var(--dl-sub); font-size:.85rem; margin-top:.15rem; }
    .db-card .db-flex{flex:1; display:flex; flex-direction:column;}
    .db-handle{
      margin-left:.5rem; flex:0 0 auto; width:28px; height:28px; display:flex; align-items:center; justify-content:center;
      border-radius:.45rem; background:rgba(0,0,0,.06); cursor:grab; color:inherit;
    }
    .db-handle:active{cursor:grabbing}
    .db-card.active{ box-shadow:0 0 0 2px var(--dl-active) inset, 0 8px 20px rgba(0,0,0,.12); transform:translateY(-1px); }
    .db-btn{background:var(--button-bg); color:var(--button-text); padding:.35rem .6rem; border-radius:.5rem; font-size:.875rem}
    .db-btn.secondary{background: rgba(255,255,255,.14); color: var(--text-color);}
    .db-add{align-self:center; border-radius:9999px; width:2.2rem; height:2.2rem; display:flex; align-items:center; justify-content:center;
            background:var(--button-bg); color:var(--button-text); box-shadow:0 8px 18px rgba(0,0,0,.16);}
    .db-footer{display:flex; justify-content:center; padding:.25rem 0 .5rem;}
    /* options modal */
    .db-modal{position:fixed; inset:0; display:none; place-items:center; background:rgba(0,0,0,.35); z-index:50;}
    .db-modal.open{display:grid;}
    .db-panel{background:#fff; color:#111827; width:min(92vw,760px); border-radius:.9rem; padding:1rem; box-shadow:0 10px 30px rgba(0,0,0,.25);}
    .db-grid{display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:.75rem;}
    .db-field label{font-size:.85rem; font-weight:600; display:block; margin-bottom:.25rem;}
    .db-color{width:100%; height:2.25rem; border:1px solid #e5e7eb; border-radius:.5rem;}
    .db-input{width:100%; height:2.25rem; border:1px solid #e5e7eb; border-radius:.5rem; padding:.4rem .55rem;}
    .db-row{display:flex; gap:.5rem; align-items:center;}
    .db-file{font-size:.85rem; opacity:.85;}
    @media (max-width:840px){ .db-grid{grid-template-columns:repeat(2,minmax(0,1fr));} }
    @media (max-width:520px){ .db-grid{grid-template-columns:1fr;} }
    /* Sortable visuals */
    .db-ghost{opacity:.4}
    .db-chosen{transform:scale(1.01)}
    /* custom context menu */
    .db-menu{position:fixed; z-index:1000; display:none; min-width:180px; padding:.25rem;
      background:var(--sidebar-module-card-bg,#fff); color:var(--sidebar-module-card-text,#111);
      border:1px solid var(--border-color,#e5e7eb); border-radius:.5rem; box-shadow:0 10px 24px rgba(0,0,0,.18);}
    .db-menu.open{display:block}
    .db-menu .mi{display:block; width:100%; padding:.5rem .75rem; text-align:left; border-radius:.4rem;}
    .db-menu .mi:hover{background:rgba(0,0,0,.06)}
    `;
    const tag = document.createElement('style'); tag.id='device-board-styles'; tag.textContent=css; document.head.appendChild(tag);
  }

  // ---------- small utils ----------
  const LS_DOC = 'module_data_v1';
  const IDB_NAME = 'modulesApp';
  const IDB_STORE = 'fs-handles';
  const GROUP_NAME = 'deviceBoardGroup'; // cross-instance DnD
  const CUSTOM_BROADCAST = 'deviceBoard:update';

  const parse = (s, fb) => { try { return JSON.parse(s) ?? fb; } catch { return fb; } };
  const loadDoc = () => parse(localStorage.getItem(LS_DOC), { __meta:{v:1}, general:{}, instances:{} });
  const saveDoc = (doc) => { doc.__meta = {v:1, updatedAt:new Date().toISOString()}; localStorage.setItem(LS_DOC, JSON.stringify(doc)); };
  const debounce = (ms, fn)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };
  const instanceIdOf = root => root.closest('.grid-stack-item')?.dataset?.instanceId || ('inst-'+Math.random().toString(36).slice(2));

  // IndexedDB for handles
  function idbOpen(){ return new Promise((res,rej)=>{ const r=indexedDB.open(IDB_NAME,1); r.onupgradeneeded=()=>r.result.createObjectStore(IDB_STORE); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
  async function idbSet(k,v){ const db=await idbOpen(); return new Promise((res,rej)=>{ const tx=db.transaction(IDB_STORE,'readwrite'); tx.objectStore(IDB_STORE).put(v,k); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); }); }
  async function idbGet(k){ const db=await idbOpen(); return new Promise((res,rej)=>{ const tx=db.transaction(IDB_STORE,'readonly'); const rq=tx.objectStore(IDB_STORE).get(k); rq.onsuccess=()=>res(rq.result||null); rq.onerror=()=>rej(rq.error); }); }
  async function idbDel(k){ const db=await idbOpen(); return new Promise((res,rej)=>{ const tx=db.transaction(IDB_STORE,'readwrite'); tx.objectStore(IDB_STORE).delete(k); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); }); }
  async function ensureRWPermission(handle){
    if (!handle?.queryPermission) return true;
    const q = await handle.queryPermission({mode:'readwrite'}); if (q==='granted') return true;
    const r = await handle.requestPermission({mode:'readwrite'}); return r==='granted';
  }

  // Robust SheetJS loader (multiple CDNs, memoized)
  async function ensureXLSX(){
    if (window.XLSX) return;
    if (window.__XLSX_LOAD_PROMISE__) return window.__XLSX_LOAD_PROMISE__;
    const urls = [
      'https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js',
      'https://cdn.jsdelivr.net/npm/xlsx@0.20.2/dist/xlsx.full.min.js',
      'https://unpkg.com/xlsx@0.20.2/dist/xlsx.full.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.20.2/xlsx.full.min.js'
    ];
    window.__XLSX_LOAD_PROMISE__ = (async () => {
      let lastErr;
      for (const url of urls) {
        try {
          await new Promise((res, rej) => {
            const s = document.createElement('script'); s.src = url; s.async = true;
            s.onload = () => res(); s.onerror = () => rej(new Error('Failed to load '+url));
            document.head.appendChild(s);
          });
          if (window.XLSX) return;
        } catch (e) { lastErr = e; }
      }
      throw lastErr || new Error('Failed to load XLSX from all CDNs');
    })();
    return window.__XLSX_LOAD_PROMISE__;
  }

  // Excel helpers
  async function readItemsFromHandle(handle){
    await ensureXLSX();
    const f = await handle.getFile();
    if (f.size === 0) return [];
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type:'array' });
    const ws = wb.Sheets['Devices'] || wb.Sheets[wb.SheetNames[0]];
    if (!ws) return [];
    const rows = XLSX.utils.sheet_to_json(ws, { header:1, raw:false, defval:'' });
    const data = rows.slice(1).filter(r=>r.length && (r[0]!==''||r[1]!=='')); // skip blanks
    return data.map((r,i)=>({ id: 'it-'+i+'-'+Date.now().toString(36), name: String(r[0]||''), meldung: String(r[1]||'') }));
  }
  async function writeItemsToHandle(handle, items){
    await ensureXLSX();
    const wb = XLSX.utils.book_new();
    const aoa = [['Name','Meldung'], ...items.map(it=>[it.name, it.meldung])];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, 'Devices');
    const out = XLSX.write(wb, { bookType:'xlsx', type:'array' });
    const w = await handle.createWritable();
    await w.write(new Blob([out], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    await w.close();
  }

  // ---------- UI builders ----------
  function buildUI(root){
    root.innerHTML = `
      <div class="db-root">
        <div class="db-titlebar" style="display:none"></div>
        <div class="db-surface">
          <div class="db-list"></div>
        </div>
        <div class="db-footer">
          <button class="db-add" title="Neues Item">＋</button>
        </div>
      </div>

      <div class="db-modal">
        <div class="db-panel">
          <div class="db-row" style="justify-content:space-between; margin-bottom:.5rem">
            <div class="font-semibold">DeviceList – Optionen</div>
            <button class="db-btn secondary db-close">Schließen</button>
          </div>
          <div class="db-grid">
            <div class="db-field" style="grid-column: span 3;">
              <label>Datei</label>
              <div class="db-row">
                <button class="db-btn db-pick">Excel wählen</button>
                <button class="db-btn secondary db-create">Excel erstellen</button>
                <span class="db-file"></span>
              </div>
            </div>
            <div class="db-field" style="grid-column: span 3;">
              <label>Titel (optional)</label>
              <input type="text" class="db-input db-title-input" placeholder="Kein Titel">
            </div>
            <div class="db-field">
              <label>Hintergrund</label>
              <input type="color" class="db-color db-c-bg" value="#f5f7fb">
            </div>
            <div class="db-field">
              <label>Item Hintergrund</label>
              <input type="color" class="db-color db-c-item" value="#ffffff">
            </div>
            <div class="db-field">
              <label>Titelfarbe</label>
              <input type="color" class="db-color db-c-title" value="#2563eb">
            </div>
            <div class="db-field">
              <label>Untertitel-Farbe</label>
              <input type="color" class="db-color db-c-sub" value="#4b5563">
            </div>
            <div class="db-field">
              <label>Aktiv-Highlight</label>
              <input type="color" class="db-color db-c-active" value="#10b981">
            </div>
          </div>
          <div class="db-row" style="justify-content:flex-end; margin-top:.75rem">
            <button class="db-btn db-save">Speichern</button>
          </div>
        </div>
      </div>
    `;
    // custom context menu
    const menu = document.createElement('div');
    menu.className = 'db-menu';
    menu.innerHTML = `<button class="mi mi-opt">⚙️ Optionen</button>`;
    document.body.appendChild(menu);

    return {
      rootVars: root.querySelector('.db-root'),
      titlebar: root.querySelector('.db-titlebar'),
      list: root.querySelector('.db-list'),
      add: root.querySelector('.db-add'),
      modal: root.querySelector('.db-modal'),
      close: root.querySelector('.db-close'),
      pick: root.querySelector('.db-pick'),
      create: root.querySelector('.db-create'),
      save: root.querySelector('.db-save'),
      fLabel: root.querySelector('.db-file'),
      cBg: root.querySelector('.db-c-bg'),
      cItem: root.querySelector('.db-c-item'),
      cTitle: root.querySelector('.db-c-title'),
      cSub: root.querySelector('.db-c-sub'),
      cActive: root.querySelector('.db-c-active'),
      titleInput: root.querySelector('.db-title-input'),
      menu
    };
  }
  function cardEl(item){
    const el = document.createElement('div');
    el.className = 'db-card';
    el.dataset.id = item.id;
    el.dataset.meldung = item.meldung || '';
    el.innerHTML = `
      <div class="db-flex">
        <div class="db-title">${item.name || ''}</div>
        <div class="db-sub">${item.meldung || ''}</div>
      </div>
      <div class="db-handle" title="Ziehen">⋮⋮</div>
    `;
    return el;
  }

  // ---------- main render ----------
  window.renderDeviceListExcel = function(root, ctx){
    if (!('showOpenFilePicker' in window) || !('showSaveFilePicker' in window)) {
      root.innerHTML = `<div class="p-2 text-sm">Dieses Modul benötigt die File System Access API (Chromium).</div>`;
      return;
    }

    const els = buildUI(root);
    const instanceId = instanceIdOf(root);
    const idbKey = `deviceBoard:${instanceId}`;

    let fileHandle = null;
    let items = []; // {id, name, meldung}

    // load per-instance config
    function loadCfg(){
      const doc = loadDoc();
      const cfg = doc?.instances?.[instanceId]?.deviceBoard || {};
      return {
        idbKey: cfg.idbKey || idbKey,
        fileName: cfg.fileName || '',
        title: cfg.title || '',
        colors: cfg.colors || { bg:'#f5f7fb', item:'#ffffff', title:'#2563eb', sub:'#4b5563', active:'#10b981' }
      };
    }
    function saveCfg(cfg){
      const doc = loadDoc();
      doc.instances ||= {};
      doc.instances[instanceId] ||= {};
      doc.instances[instanceId].deviceBoard = cfg;
      saveDoc(doc);
    }
    function removeCfg(){
      const doc = loadDoc();
      if (doc?.instances && doc.instances[instanceId]) {
        delete doc.instances[instanceId].deviceBoard;
        if (Object.keys(doc.instances[instanceId]).length === 0) delete doc.instances[instanceId];
        saveDoc(doc);
      }
    }
    function applyColors(colors){
      els.rootVars.style.setProperty('--dl-bg', colors.bg || '#f5f7fb');
      els.rootVars.style.setProperty('--dl-item-bg', colors.item || '#ffffff');
      els.rootVars.style.setProperty('--dl-title', colors.title || '#2563eb');
      els.rootVars.style.setProperty('--dl-sub', colors.sub || '#4b5563');
      els.rootVars.style.setProperty('--dl-active', colors.active || '#10b981');
      updateHighlights();
    }
    function applyTitle(title){
      const t = (title || '').trim();
      if (!t) {
        els.titlebar.style.display = 'none';
        els.titlebar.textContent = '';
      } else {
        els.titlebar.textContent = t;
        els.titlebar.style.display = 'block';
      }
    }
    function getActiveMeldung(){
      const doc = loadDoc();
      return (doc?.general?.Meldung || '').trim();
    }

    const cfg = loadCfg();
    // init UI from cfg
    els.cBg.value = cfg.colors.bg;
    els.cItem.value = cfg.colors.item;
    els.cTitle.value = cfg.colors.title;
    els.cSub.value = cfg.colors.sub;
    els.cActive.value = cfg.colors.active;
    els.titleInput.value = cfg.title || '';
    applyColors(cfg.colors);
    applyTitle(cfg.title);
    els.fLabel.textContent = cfg.fileName ? `• ${cfg.fileName}` : 'Keine Datei gewählt';

    // -- Sortable (cross-instance group, handle only on right grip)
    const sortable = new Sortable(els.list, {
      group: { name: GROUP_NAME, pull: true, put: true },
      animation: 150,
      handle: '.db-handle',
      draggable: '.db-card',
      ghostClass: 'db-ghost',
      chosenClass: 'db-chosen',
      onSort: () => { syncFromDOM(); scheduleSave(); },
      onAdd:  () => { syncFromDOM(); scheduleSave(); updateHighlights(); },
      onRemove:() => { syncFromDOM(); scheduleSave(); }
    });

    function renderList(){
      els.list.innerHTML = '';
      items.forEach(it => els.list.appendChild(cardEl(it)));
      updateHighlights();
    }
    function syncFromDOM(){
      items = Array.from(els.list.children).map(el => ({
        id: el.dataset.id,
        name: el.querySelector('.db-title').textContent.trim(),
        meldung: el.dataset.meldung || el.querySelector('.db-sub').textContent.trim()
      }));
    }

    const scheduleSave = debounce(250, async () => {
      if (!fileHandle) return;
      try { await writeItemsToHandle(fileHandle, items); } catch(e){ console.warn('Save failed', e); }
    });

    async function bindHandle(h){
      const ok = await ensureRWPermission(h);
      if (!ok) return false;
      fileHandle = h;
      await idbSet(cfg.idbKey, h);
      cfg.fileName = h.name || 'devices.xlsx';
      els.fLabel.textContent = `• ${cfg.fileName}`;
      saveCfg(cfg);
      return true;
    }

    async function pickExcel(){
      try {
        const [h] = await window.showOpenFilePicker({
          types: [{ description:'Excel', accept:{ 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx'] } }],
          excludeAcceptAllOption:false, multiple:false
        });
        if (!h) return;
        if (!(await bindHandle(h))) return;
        items = await readItemsFromHandle(h);
        renderList();
      } catch(e){ if (e?.name!=='AbortError') console.warn(e); }
    }
    async function createExcel(){
      try {
        const h = await window.showSaveFilePicker({
          suggestedName: 'devices.xlsx',
          types: [{ description:'Excel', accept:{ 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx'] } }]
        });
        if (!h) return;
        if (!(await bindHandle(h))) return;
        items = []; await writeItemsToHandle(h, items);
        renderList();
      } catch(e){ if (e?.name!=='AbortError') console.warn(e); }
    }

    // + button
    els.add.addEventListener('click', async () => {
      const name = prompt('Name des Items:','');
      if (name===null) return;
      const meldung = prompt('Meldung:','') ?? '';
      const it = { id: 'it-'+Math.random().toString(36).slice(2), name: (name||'').trim(), meldung: (meldung||'').trim() };
      items.push(it);
      els.list.appendChild(cardEl(it));
      scheduleSave();
      updateHighlights();
    });

    // clicking a card (except handle) sets active Meldung
    els.list.addEventListener('click', (e) => {
      if (e.target.closest('.db-handle')) return; // dragging grip—ignore click
      const card = e.target.closest('.db-card');
      if (!card) return;
      const meld = (card.dataset.meldung || '').trim();
      const doc = loadDoc();
      doc.general ||= {};
      if (doc.general.Meldung !== meld) {
        doc.general.Meldung = meld;
        saveDoc(doc);
        updateHighlights();
        window.dispatchEvent(new Event(CUSTOM_BROADCAST)); // notify other instances in same tab
      }
    });

    // options modal
    function openModal(){ els.modal.classList.add('open'); }
    function closeModal(){ els.modal.classList.remove('open'); }
    els.pick.addEventListener('click', pickExcel);
    els.create.addEventListener('click', createExcel);
    els.save.addEventListener('click', () => {
      cfg.colors = {
        bg: els.cBg.value, item: els.cItem.value,
        title: els.cTitle.value, sub: els.cSub.value, active: els.cActive.value
      };
      cfg.title = els.titleInput.value || '';
      applyColors(cfg.colors);
      applyTitle(cfg.title);
      saveCfg(cfg);
      closeModal();
    });
    els.close.addEventListener('click', closeModal);

    // custom context menu (right-click)
    function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }
    root.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      const m = els.menu;
      const pad = 8; const vw = window.innerWidth, vh = window.innerHeight;
      const w = 200, h = 44; // approx
      m.style.left = clamp(e.clientX, pad, vw - w - pad) + 'px';
      m.style.top  = clamp(e.clientY, pad, vh - h - pad) + 'px';
      m.classList.add('open');
    });
    els.menu.querySelector('.mi-opt').addEventListener('click', () => { els.menu.classList.remove('open'); openModal(); });
    window.addEventListener('click', () => els.menu.classList.remove('open'));
    window.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') els.menu.classList.remove('open'); });

    // restore previous handle + items
    (async () => {
      try {
        const h = await idbGet(cfg.idbKey);
        if (h && await ensureRWPermission(h)) {
          fileHandle = h;
          items = await readItemsFromHandle(h);
          els.fLabel.textContent = `• ${cfg.fileName || h.name || 'devices.xlsx'}`;
          renderList();
        }
      } catch(e){ console.warn('Restore failed', e); }
    })();

    // highlight logic
    function updateHighlights(){
      const active = getActiveMeldung();
      Array.from(els.list.children).forEach(node => {
        const m = (node.dataset.meldung || '').trim();
        node.classList.toggle('active', active && m === active);
      });
    }
    // react to external changes (other modules / tabs)
    window.addEventListener('storage', (e) => { if (e.key === LS_DOC) updateHighlights(); });
    window.addEventListener(CUSTOM_BROADCAST, updateHighlights);

    // cleanup (when this module instance is removed from DOM)
    const mo = new MutationObserver(()=>{
      if (!document.body.contains(root)) {
        try { sortable.destroy(); } catch {}
        els.menu?.remove();
        (async () => {
          try { await idbDel(cfg.idbKey); } catch {}
          try { removeCfg(); } catch {}
        })();
        mo.disconnect();
      }
    });
    mo.observe(document.body,{childList:true,subtree:true});
  };
})();
