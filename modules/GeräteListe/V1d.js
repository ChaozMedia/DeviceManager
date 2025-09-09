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
  async function ensureRPermission(handle){
    if (!handle?.queryPermission) return true;
    const q = await handle.queryPermission({mode:'read'}); if (q==='granted') return true;
    const r = await handle.requestPermission({mode:'read'}); return r==='granted';
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
    const data = rows.slice(1).filter(r=>r.length && r[0] !== '');
    return data.map((r,i)=>({ id: 'it-'+i+'-'+Date.now().toString(36), meldung: String(r[0]||'') }));
  }
  async function writeItemsToHandle(handle, items){
    await ensureXLSX();
    const wb = XLSX.utils.book_new();
    const aoa = [['Meldung'], ...items.map(it=>[it.meldung])];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, 'Devices');
    const out = XLSX.write(wb, { bookType:'xlsx', type:'array' });
    const w = await handle.createWritable();
    await w.write(new Blob([out], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    await w.close();
  }

  async function readDictFromHandle(handle){
    await ensureXLSX();
    const f = await handle.getFile();
    if (f.size === 0) return {};
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type:'array' });
    const ws = wb.Sheets['records'] || wb.Sheets[wb.SheetNames[0]];
    if (!ws) return {};
    const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
    const hdr = rows[0]?.map(h=>String(h||'').toLowerCase().trim()) || [];
    const idx = {meldung:hdr.indexOf('meldung'),auftrag:hdr.indexOf('auftrag'),part:hdr.indexOf('part'),serial:hdr.indexOf('serial')};
    const map = {};
    rows.slice(1).forEach(r=>{
      const m = String(r[idx.meldung]||'').trim();
      if(!m) return;
      map[m] = {
        meldung:m,
        auftrag:String(r[idx.auftrag]||''),
        part:String(r[idx.part]||''),
        serial:String(r[idx.serial]||'')
      };
    });
    return map;
  }

  async function readNameRulesFromHandle(handle){
    await ensureXLSX();
    const f=await handle.getFile();
    if(f.size===0)return[];
    const buf=await f.arrayBuffer();
    const wb=XLSX.read(buf,{type:'array'});
    const ws=wb.Sheets['Rules']||wb.Sheets[wb.SheetNames[0]];
    if(!ws)return[];
    const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
    return rows.slice(1).filter(r=>r.length&&(r[0]!==''||r[1]!==''))
      .map(r=>({prefix:String(r[0]||''),name:String(r[1]||'')}))
      .sort((a,b)=>b.prefix.length-a.prefix.length);
  }

  const lookupName=(part,rules)=>{for(const r of rules){if(part.startsWith(r.prefix))return r.name;}return'';};

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
              <label>Wörterbuch</label>
              <div class="db-row">
                <button class="db-btn db-dict-pick">Excel wählen</button>
                <span class="db-dict-file db-file"></span>
              </div>
            </div>
            <div class="db-field" style="grid-column: span 3;">
              <label>Namensregeln</label>
              <div class="db-row">
                <button class="db-btn db-name-pick">Excel wählen</button>
                <span class="db-name-file db-file"></span>
              </div>
            </div>
            <div class="db-field" style="grid-column: span 3;">
              <label>Titel (optional)</label>
              <input type="text" class="db-input db-title-input" placeholder="Kein Titel">
            </div>
            <div class="db-field">
              <label>Titel-Feld</label>
              <select class="db-input db-sel-title">
                <option value="meldung">Meldung</option>
                <option value="auftrag">Auftrag</option>
                <option value="part">PartNo</option>
                <option value="serial">SerialNo</option>
              </select>
            </div>
            <div class="db-field">
              <label>Untertitel-Feld</label>
              <select class="db-input db-sel-sub">
                <option value="meldung">Meldung</option>
                <option value="auftrag">Auftrag</option>
                <option value="part">PartNo</option>
                <option value="serial">SerialNo</option>
              </select>
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

      <div class="db-modal db-add-modal">
        <div class="db-panel">
          <div class="db-row" style="justify-content:space-between; margin-bottom:.5rem">
            <div class="font-semibold">Neues Item</div>
            <button class="db-btn secondary db-add-close">Schließen</button>
          </div>
          <div class="db-field" style="grid-column: span 3;">
            <label>Meldung</label>
            <input type="text" class="db-input db-add-input" />
          </div>
          <div class="db-row" style="justify-content:flex-end; margin-top:.75rem">
            <button class="db-btn db-add-save">Speichern</button>
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
      dictPick: root.querySelector('.db-dict-pick'),
      dictLabel: root.querySelector('.db-dict-file'),
      namePick: root.querySelector('.db-name-pick'),
      nameLabel: root.querySelector('.db-name-file'),
      selTitle: root.querySelector('.db-sel-title'),
      selSub: root.querySelector('.db-sel-sub'),
      cBg: root.querySelector('.db-c-bg'),
      cItem: root.querySelector('.db-c-item'),
      cTitle: root.querySelector('.db-c-title'),
      cSub: root.querySelector('.db-c-sub'),
      cActive: root.querySelector('.db-c-active'),
      titleInput: root.querySelector('.db-title-input'),
      addModal: root.querySelector('.db-add-modal'),
      addClose: root.querySelector('.db-add-close'),
      addSave: root.querySelector('.db-add-save'),
      addInput: root.querySelector('.db-add-input'),
      menu
    };
  }
  function cardEl(item, cfg, dict, rules){
    const el = document.createElement('div');
    el.className = 'db-card';
    el.dataset.id = item.id;
    el.dataset.meldung = item.meldung || '';
    const data = dict[item.meldung] || {};
    const val = (f)=>{
      if (f === 'meldung') return item.meldung || '';
      if (f === 'name') return lookupName(data.part || '', rules);
      return data[f] || '';
    };
    el.innerHTML = `
      <div class="db-flex">
        <div class="db-title">${val(cfg.titleField)}</div>
        <div class="db-sub">${val(cfg.subField)}</div>
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
    const dictIdbKey = `deviceBoardDict:${instanceId}`;
    const nameIdbKey = `deviceBoardNames:${instanceId}`;

    let fileHandle = null;
    let dictHandle = null;
    let dictData = {};
    let nameHandle = null;
    let nameRules = [];
    let items = []; // {id, meldung}

    // load per-instance config
    function loadCfg(){
      const doc = loadDoc();
      const cfg = doc?.instances?.[instanceId]?.deviceBoard || {};
      return {
        idbKey: cfg.idbKey || idbKey,
        dictIdbKey: cfg.dictIdbKey || dictIdbKey,
        nameIdbKey: cfg.nameIdbKey || nameIdbKey,
        fileName: cfg.fileName || '',
        dictFileName: cfg.dictFileName || '',
        nameFileName: cfg.nameFileName || '',
        titleField: cfg.titleField || 'meldung',
        subField: cfg.subField || 'auftrag',
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
    els.selTitle.value = cfg.titleField;
    els.selSub.value = cfg.subField;
    applyColors(cfg.colors);
    applyTitle(cfg.title);
    els.fLabel.textContent = cfg.fileName ? `• ${cfg.fileName}` : 'Keine Datei gewählt';
    els.dictLabel.textContent = cfg.dictFileName ? `• ${cfg.dictFileName}` : 'Kein Wörterbuch';
    els.nameLabel.textContent = cfg.nameFileName ? `• ${cfg.nameFileName}` : 'Keine Namensregeln';
    updateFieldOptions();

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
      items.forEach(it => els.list.appendChild(cardEl(it, cfg, dictData, nameRules)));
      updateHighlights();
    }
    function updateFieldOptions(){
      const hasName = nameRules.length > 0;
      [els.selTitle, els.selSub].forEach(sel=>{
        const exists = Array.from(sel.options).some(o=>o.value==='name');
        if(hasName && !exists){ const opt=document.createElement('option');opt.value='name';opt.textContent='Name';sel.appendChild(opt); }
        if(!hasName && exists){ Array.from(sel.options).forEach(o=>{if(o.value==='name')o.remove();}); }
      });
      if(!hasName){ if(cfg.titleField==='name')cfg.titleField='meldung'; if(cfg.subField==='name')cfg.subField='auftrag'; }
      els.selTitle.value = cfg.titleField;
      els.selSub.value = cfg.subField;
    }
    function syncFromDOM(){
      items = Array.from(els.list.children).map(el => ({
        id: el.dataset.id,
        meldung: el.dataset.meldung || ''
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

    async function bindDictHandle(h){
      const ok = await ensureRPermission(h);
      if (!ok) return false;
      dictHandle = h;
      await idbSet(cfg.dictIdbKey, h);
      cfg.dictFileName = h.name || 'dictionary.xlsx';
      els.dictLabel.textContent = `• ${cfg.dictFileName}`;
      saveCfg(cfg);
      try { dictData = await readDictFromHandle(h); } catch(e){ console.warn('Dict read failed', e); dictData = {}; }
      renderList();
      return true;
    }
    async function pickDict(){
      try {
        const [h] = await window.showOpenFilePicker({
          types: [{ description:'Excel', accept:{ 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx'] } }],
          excludeAcceptAllOption:false, multiple:false
        });
        if (!h) return;
        await bindDictHandle(h);
      } catch(e){ if (e?.name!=='AbortError') console.warn(e); }
    }

    async function bindNameHandle(h){
      const ok = await ensureRPermission(h);
      if (!ok) return false;
      nameHandle = h;
      await idbSet(cfg.nameIdbKey, h);
      cfg.nameFileName = h.name || 'namerules.xlsx';
      els.nameLabel.textContent = `• ${cfg.nameFileName}`;
      saveCfg(cfg);
      try { nameRules = await readNameRulesFromHandle(h); } catch(e){ console.warn('Name rules read failed', e); nameRules = []; }
      updateFieldOptions();
      renderList();
      return true;
    }
    async function pickName(){
      try {
        const [h] = await window.showOpenFilePicker({
          types: [{ description:'Excel', accept:{ 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx'] } }],
          excludeAcceptAllOption:false, multiple:false
        });
        if (!h) return;
        await bindNameHandle(h);
      } catch(e){ if (e?.name!=='AbortError') console.warn(e); }
    }

    function openAdd(){ els.addModal.classList.add('open'); els.addInput.value = ''; }
    function closeAdd(){ els.addModal.classList.remove('open'); }
    els.add.addEventListener('click', openAdd);
    els.addClose.addEventListener('click', closeAdd);
    els.addSave.addEventListener('click', () => {
      const meldung = (els.addInput.value || '').trim();
      if (!meldung) { closeAdd(); return; }
      const it = { id: 'it-'+Math.random().toString(36).slice(2), meldung };
      items.push(it);
      els.list.appendChild(cardEl(it, cfg, dictData, nameRules));
      scheduleSave();
      updateHighlights();
      closeAdd();
    });
    els.addInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter') els.addSave.click(); });

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
    els.dictPick.addEventListener('click', pickDict);
    els.namePick.addEventListener('click', pickName);
    els.save.addEventListener('click', () => {
      cfg.colors = {
        bg: els.cBg.value, item: els.cItem.value,
        title: els.cTitle.value, sub: els.cSub.value, active: els.cActive.value
      };
      cfg.title = els.titleInput.value || '';
      cfg.titleField = els.selTitle.value;
      cfg.subField = els.selSub.value;
      applyColors(cfg.colors);
      applyTitle(cfg.title);
      saveCfg(cfg);
      renderList();
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

    // restore previous handles + items
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
    (async () => {
      try {
        const h = await idbGet(cfg.dictIdbKey);
        if (h && await ensureRPermission(h)) {
          dictHandle = h;
          dictData = await readDictFromHandle(h);
          els.dictLabel.textContent = `• ${cfg.dictFileName || h.name || 'dictionary.xlsx'}`;
          renderList();
        }
      } catch(e){ console.warn('Dict restore failed', e); }
    })();
    (async () => {
      try {
        const h = await idbGet(cfg.nameIdbKey);
        if (h && await ensureRPermission(h)) {
          nameHandle = h;
          nameRules = await readNameRulesFromHandle(h);
          els.nameLabel.textContent = `• ${cfg.nameFileName || h.name || 'namerules.xlsx'}`;
          updateFieldOptions();
          renderList();
        }
      } catch(e){ console.warn('Name rules restore failed', e); }
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
          try { await idbDel(cfg.dictIdbKey); } catch {}
          try { await idbDel(cfg.nameIdbKey); } catch {}
          try { removeCfg(); } catch {}
        })();
        mo.disconnect();
      }
    });
    mo.observe(document.body,{childList:true,subtree:true});
  };
})();
