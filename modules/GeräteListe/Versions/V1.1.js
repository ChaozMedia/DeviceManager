/* DeviceList (Excel)
   - Options panel: pick/create .xlsx, colors (bg, item bg, text)
   - Per-instance persistence: localStorage (doc) + IndexedDB (handle)
   - Sortable cards; add new item; instant save to Excel (debounced)
   - Requires: File System Access API (Chromium) + Sortable.js (already loaded globally)
*/
(function(){
  // ---------- one-time styles ----------
  if (!document.getElementById('device-board-styles')) {
    const css = `
    .db-root{height:100%;display:flex;flex-direction:column;gap:.6rem; --dl-bg:#f5f7fb; --dl-item-bg:#ffffff; --dl-text:#111827;}
    .db-surface{flex:1; background:var(--dl-bg); border-radius:1rem; padding:.75rem; overflow:auto;}
    .db-list{display:flex; flex-direction:column; gap:.65rem;}
    .db-card{
      background:var(--dl-item-bg); color:var(--dl-text);
      border-radius:.8rem; padding:.75rem .9rem; box-shadow:0 2px 6px rgba(0,0,0,.06);
      display:flex; align-items:center; gap:.75rem; user-select:none;
    }
    .db-card .db-title{ color:#2563eb; font-weight:600; line-height:1.1; }
    .db-card .db-sub{ opacity:.8; font-size:.85rem; margin-top:.15rem; }
    .db-card .db-flex{flex:1; display:flex; flex-direction:column;}
    .db-menu{margin-left:auto; opacity:.55;}
    .db-toolbar{display:flex; align-items:center; gap:.5rem;}
    .db-btn{background:var(--button-bg); color:var(--button-text); padding:.35rem .6rem; border-radius:.5rem; font-size:.875rem}
    .db-btn.secondary{background: rgba(255,255,255,.14); color: var(--text-color);}
    .db-add{align-self:center; border-radius:9999px; width:2.2rem; height:2.2rem; display:flex; align-items:center; justify-content:center;
            background:var(--button-bg); color:var(--button-text); box-shadow:0 8px 18px rgba(0,0,0,.16);}
    .db-footer{display:flex; justify-content:center; padding:.25rem 0 .5rem;}
    .db-status{font-size:.75rem; opacity:.75; margin-left:.5rem;}
    /* options modal */
    .db-modal{position:fixed; inset:0; display:none; place-items:center; background:rgba(0,0,0,.35); z-index:50;}
    .db-modal.open{display:grid;}
    .db-panel{background:#fff; color:#111827; width:min(92vw,720px); border-radius:.9rem; padding:1rem; box-shadow:0 10px 30px rgba(0,0,0,.25);}
    .db-grid{display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.75rem;}
    .db-field label{font-size:.85rem; font-weight:600; display:block; margin-bottom:.25rem;}
    .db-color{width:100%; height:2.25rem; border:1px solid #e5e7eb; border-radius:.5rem;}
    .db-row{display:flex; gap:.5rem; align-items:center;}
    .db-file{font-size:.85rem; opacity:.85;}
    @media (max-width:640px){ .db-grid{grid-template-columns:1fr;} }
    `;
    const tag = document.createElement('style'); tag.id='device-board-styles'; tag.textContent=css; document.head.appendChild(tag);
  }

  // ---------- small utils ----------
  const LS_DOC = 'module_data_v1';
  const IDB_NAME = 'modulesApp';
  const IDB_STORE = 'fs-handles';
  const parse = (s, fb) => { try { return JSON.parse(s) ?? fb; } catch { return fb; } };
  const loadDoc = () => parse(localStorage.getItem(LS_DOC), { __meta:{v:1}, general:{}, instances:{} });
  const saveDoc = (doc) => { doc.__meta = {v:1, updatedAt:new Date().toISOString()}; localStorage.setItem(LS_DOC, JSON.stringify(doc)); };
  const debounce = (ms, fn)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };
  const instanceIdOf = root => root.closest('.grid-stack-item')?.dataset?.instanceId || ('inst-'+Math.random().toString(36).slice(2));

  // IndexedDB for handles
  function idbOpen(){ return new Promise((res,rej)=>{ const r=indexedDB.open(IDB_NAME,1); r.onupgradeneeded=()=>r.result.createObjectStore(IDB_STORE); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
  async function idbSet(k,v){ const db=await idbOpen(); return new Promise((res,rej)=>{ const tx=db.transaction(IDB_STORE,'readwrite'); tx.objectStore(IDB_STORE).put(v,k); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); }); }
  async function idbGet(k){ const db=await idbOpen(); return new Promise((res,rej)=>{ const tx=db.transaction(IDB_STORE,'readonly'); const rq=tx.objectStore(IDB_STORE).get(k); rq.onsuccess=()=>res(rq.result||null); rq.onerror=()=>rej(rq.error); }); }
  async function ensureRWPermission(handle){
    if (!handle?.queryPermission) return true;
    const q = await handle.queryPermission({mode:'readwrite'}); if (q==='granted') return true;
    const r = await handle.requestPermission({mode:'readwrite'}); return r==='granted';
  }

  // SheetJS loader (one time)
  async function ensureXLSX(){
    if (window.XLSX) return;
    await new Promise((res,rej)=>{
      const s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/xlsx@0.19.1/dist/xlsx.full.min.js';
      s.onload=res; s.onerror=()=>rej(new Error('Failed to load XLSX'));
      document.head.appendChild(s);
    });
  }

  // Excel helpers
  async function readItemsFromHandle(handle){
    await ensureXLSX();
    const f = await handle.getFile();
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type:'array' });
    const ws = wb.Sheets['Devices'] || wb.Sheets[wb.SheetNames[0]];
    if (!ws) return [];
    const rows = XLSX.utils.sheet_to_json(ws, { header:1, raw:false, defval:'' });
    // expect header row: Name | Meldung
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
        <div class="db-toolbar">
          <button class="db-btn db-opt">⚙️ Optionen</button>
          <span class="db-status"></span>
        </div>
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
            <div class="db-field">
              <label>Datei</label>
              <div class="db-row">
                <button class="db-btn db-pick">Excel wählen</button>
                <button class="db-btn secondary db-create">Excel erstellen</button>
                <span class="db-file"></span>
              </div>
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
              <label>Textfarbe</label>
              <input type="color" class="db-color db-c-text" value="#111827">
            </div>
          </div>
          <div class="db-row" style="justify-content:flex-end; margin-top:.75rem">
            <button class="db-btn db-save">Speichern</button>
          </div>
        </div>
      </div>
    `;
    return {
      rootVars: root.querySelector('.db-root'),
      list: root.querySelector('.db-list'),
      add: root.querySelector('.db-add'),
      opt: root.querySelector('.db-opt'),
      status: root.querySelector('.db-status'),
      modal: root.querySelector('.db-modal'),
      close: root.querySelector('.db-close'),
      pick: root.querySelector('.db-pick'),
      create: root.querySelector('.db-create'),
      save: root.querySelector('.db-save'),
      fLabel: root.querySelector('.db-file'),
      cBg: root.querySelector('.db-c-bg'),
      cItem: root.querySelector('.db-c-item'),
      cText: root.querySelector('.db-c-text')
    };
  }
  function cardEl(item){
    const el = document.createElement('div');
    el.className = 'db-card';
    el.dataset.id = item.id;
    el.innerHTML = `
      <div class="db-flex">
        <div class="db-title">${item.name || ''}</div>
        <div class="db-sub">${item.meldung || ''}</div>
      </div>
      <div class="db-menu">⋮</div>
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
        colors: cfg.colors || { bg:'#f5f7fb', item:'#ffffff', text:'#111827' }
      };
    }
    function saveCfg(cfg){
      const doc = loadDoc();
      doc.instances ||= {};
      doc.instances[instanceId] ||= {};
      doc.instances[instanceId].deviceBoard = cfg;
      saveDoc(doc);
    }
    function applyColors(colors){
      els.rootVars.style.setProperty('--dl-bg', colors.bg || '#f5f7fb');
      els.rootVars.style.setProperty('--dl-item-bg', colors.item || '#ffffff');
      els.rootVars.style.setProperty('--dl-text', colors.text || '#111827');
    }

    const cfg = loadCfg();
    els.cBg.value = cfg.colors.bg;
    els.cItem.value = cfg.colors.item;
    els.cText.value = cfg.colors.text;
    applyColors(cfg.colors);
    els.fLabel.textContent = cfg.fileName ? `• ${cfg.fileName}` : 'Keine Datei gewählt';

    // -- Sortable
    const sortable = new Sortable(els.list, {
      animation: 150,
      handle: '.db-card',
      draggable: '.db-card',
      onSort: () => { syncFromDOM(); scheduleSave(); }
    });

    function renderList(){
      els.list.innerHTML = '';
      items.forEach(it => els.list.appendChild(cardEl(it)));
    }
    function syncFromDOM(){
      items = Array.from(els.list.children).map(el => ({
        id: el.dataset.id,
        name: el.querySelector('.db-title').textContent.trim(),
        meldung: el.querySelector('.db-sub').textContent.trim()
      }));
    }

    const scheduleSave = debounce(250, async () => {
      if (!fileHandle) { setStatus('Keine Excel-Datei. Öffne Optionen.'); return; }
      try { await writeItemsToHandle(fileHandle, items); setStatus('Gespeichert.'); }
      catch(e){ console.warn(e); setStatus('Speichern fehlgeschlagen.'); }
    });
    const setStatus = msg => els.status.textContent = msg || '';

    async function bindHandle(h){
      const ok = await ensureRWPermission(h);
      if (!ok) { setStatus('Berechtigung verweigert.'); return false; }
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
        renderList(); setStatus('Geladen.');
      } catch(e){ if (e?.name!=='AbortError'){ console.warn(e); setStatus('Auswahl abgebrochen.'); } }
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
        renderList(); setStatus('Erstellt.');
      } catch(e){ if (e?.name!=='AbortError'){ console.warn(e); setStatus('Erstellen abgebrochen.'); } }
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
    });

    // options
    function openModal(){ els.modal.classList.add('open'); }
    function closeModal(){ els.modal.classList.remove('open'); }
    els.opt.addEventListener('click', openModal);
    els.close.addEventListener('click', closeModal);

    els.pick.addEventListener('click', pickExcel);
    els.create.addEventListener('click', createExcel);
    els.save.addEventListener('click', () => {
      cfg.colors = { bg: els.cBg.value, item: els.cItem.value, text: els.cText.value };
      applyColors(cfg.colors);
      saveCfg(cfg);
      closeModal();
    });

    // restore previous handle + items
    (async () => {
      try {
        const h = await idbGet(cfg.idbKey);
        if (h && await ensureRWPermission(h)) {
          fileHandle = h;
          items = await readItemsFromHandle(h);
          els.fLabel.textContent = `• ${cfg.fileName || h.name || 'devices.xlsx'}`;
          renderList();
          setStatus('Geladen.');
        } else {
          setStatus('Keine Datei. Öffne Optionen.');
        }
      } catch(e){ console.warn(e); setStatus('Wiederherstellung fehlgeschlagen.'); }
    })();

    // cleanup
    const mo = new MutationObserver(()=>{ if (!document.body.contains(root)) { try{ sortable.destroy(); }catch{} mo.disconnect(); } });
    mo.observe(document.body,{childList:true,subtree:true});
  };
})();
