/* Namensregeln Module
   - Sortable list of prefix+name pairs
   - Add items via modal
   - Options modal to pick/create XLSX and set colors
   - Stores config per instance in localStorage; file handle in IndexedDB
   - Requires: File System Access API + Sortable.js + SheetJS (XLSX)
*/
(function(){
  // ---------- styles ----------
  if(!document.getElementById('naming-rules-styles')){
    const css = `
    .nr-root{height:100%;display:flex;flex-direction:column;gap:.6rem;
      --nr-bg:#f5f7fb; --nr-item-bg:#ffffff; --nr-title:#2563eb; --nr-sub:#4b5563;}
    .nr-titlebar{font-weight:600;color:var(--text-color);padding:0 .15rem;user-select:none}
    .nr-surface{flex:1;background:var(--nr-bg);border-radius:1rem;padding:.75rem;overflow:auto;}
    .nr-list{display:flex;flex-direction:column;gap:.65rem;min-height:1.5rem;}
    .nr-card{background:var(--nr-item-bg);color:var(--nr-sub);border-radius:.8rem;padding:.65rem .75rem;
      box-shadow:0 2px 6px rgba(0,0,0,.06);display:flex;align-items:center;gap:.75rem;user-select:none;}
    .nr-card .nr-title{color:var(--nr-title);font-weight:600;line-height:1.1;}
    .nr-card .nr-sub{color:var(--nr-sub);font-size:.85rem;margin-top:.15rem;}
    .nr-card .nr-flex{flex:1;display:flex;flex-direction:column;}
    .nr-handle{margin-left:.5rem;flex:0 0 auto;width:28px;height:28px;display:flex;align-items:center;justify-content:center;
      border-radius:.45rem;background:rgba(0,0,0,.06);cursor:grab;color:inherit;}
    .nr-handle:active{cursor:grabbing}
    .nr-del{margin-left:.25rem;flex:0 0 auto;width:28px;height:28px;display:flex;align-items:center;justify-content:center;
      border-radius:.45rem;background:rgba(0,0,0,.06);cursor:pointer;color:inherit;}
    .nr-btn{background:var(--button-bg);color:var(--button-text);padding:.35rem .6rem;border-radius:.5rem;font-size:.875rem}
    .nr-btn.secondary{background:rgba(255,255,255,.14);color:var(--text-color);}
    .nr-add{align-self:center;border-radius:9999px;width:2.2rem;height:2.2rem;display:flex;align-items:center;justify-content:center;
      background:var(--button-bg);color:var(--button-text);box-shadow:0 8px 18px rgba(0,0,0,.16);}
    .nr-footer{display:flex;justify-content:center;padding:.25rem 0 .5rem;}
    .nr-modal{position:fixed;inset:0;display:none;place-items:center;background:rgba(0,0,0,.35);z-index:50;}
    .nr-modal.open{display:grid;}
    .nr-panel{background:#fff;color:#111827;width:min(92vw,760px);border-radius:.9rem;padding:1rem;box-shadow:0 10px 30px rgba(0,0,0,.25);}
    .nr-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.75rem;}
    .nr-field label{font-size:.85rem;font-weight:600;display:block;margin-bottom:.25rem;}
    .nr-color{width:100%;height:2.25rem;border:1px solid #e5e7eb;border-radius:.5rem;}
    .nr-input{width:100%;height:2.25rem;border:1px solid #e5e7eb;border-radius:.5rem;padding:.4rem .55rem;}
    .nr-row{display:flex;gap:.5rem;align-items:center;}
    .nr-file{font-size:.85rem;opacity:.85;}
    @media(max-width:840px){.nr-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}
    @media(max-width:520px){.nr-grid{grid-template-columns:1fr;}}
    .nr-ghost{opacity:.4}
    .nr-chosen{transform:scale(1.01)}
    .nr-menu{position:fixed;z-index:1000;display:none;min-width:180px;padding:.25rem;
      background:var(--sidebar-module-card-bg,#fff);color:var(--sidebar-module-card-text,#111);
      border:1px solid var(--border-color,#e5e7eb);border-radius:.5rem;box-shadow:0 10px 24px rgba(0,0,0,.18);}
    .nr-menu.open{display:block}
    .nr-menu .mi{display:block;width:100%;padding:.5rem .75rem;text-align:left;border-radius:.4rem;}
    .nr-menu .mi:hover{background:rgba(0,0,0,.06)}
    `;
    const tag=document.createElement('style');tag.id='naming-rules-styles';tag.textContent=css;document.head.appendChild(tag);
  }

  // ---------- utils ----------
  const LS_DOC='namingRulesDoc';
  const IDB_NAME='modulesApp';
  const IDB_STORE='fs-handles';
  const parse=(s,fb)=>{try{return JSON.parse(s)??fb;}catch{return fb;}};
  const loadDoc=()=>parse(localStorage.getItem(LS_DOC),{__meta:{v:1},instances:{}});
  const saveDoc=(doc)=>{doc.__meta={v:1,updatedAt:new Date().toISOString()};localStorage.setItem(LS_DOC,JSON.stringify(doc));};
  const instanceIdOf=root=>root.closest('.grid-stack-item')?.dataset?.instanceId||('inst-'+Math.random().toString(36).slice(2));
  const debounce=(ms,fn)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};};

  function getCfg(id){const doc=loadDoc();return doc.instances[id]||null;}
  function saveCfg(id,cfg){const doc=loadDoc();doc.instances[id]=cfg;saveDoc(doc);} 
  function removeCfg(id){const doc=loadDoc();delete doc.instances[id];saveDoc(doc);} 

  function idbOpen(){return new Promise((res,rej)=>{const r=indexedDB.open(IDB_NAME,1);r.onupgradeneeded=()=>r.result.createObjectStore(IDB_STORE);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
  async function idbSet(k,v){const db=await idbOpen();return new Promise((res,rej)=>{const tx=db.transaction(IDB_STORE,'readwrite');tx.objectStore(IDB_STORE).put(v,k);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
  async function idbGet(k){const db=await idbOpen();return new Promise((res,rej)=>{const tx=db.transaction(IDB_STORE,'readonly');const rq=tx.objectStore(IDB_STORE).get(k);rq.onsuccess=()=>res(rq.result||null);rq.onerror=()=>rej(rq.error);});}
  async function idbDel(k){const db=await idbOpen();return new Promise((res,rej)=>{const tx=db.transaction(IDB_STORE,'readwrite');tx.objectStore(IDB_STORE).delete(k);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
  async function ensureRWPermission(handle){if(!handle?.queryPermission)return true;const q=await handle.queryPermission({mode:'readwrite'});if(q==='granted')return true;const r=await handle.requestPermission({mode:'readwrite'});return r==='granted';}

  // SheetJS loader
  async function ensureXLSX(){
    if(window.XLSX)return;
    if(window.__XLSX_LOAD_PROMISE__)return window.__XLSX_LOAD_PROMISE__;
    const urls=[
      'https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js',
      'https://cdn.jsdelivr.net/npm/xlsx@0.20.2/dist/xlsx.full.min.js',
      'https://unpkg.com/xlsx@0.20.2/dist/xlsx.full.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.20.2/xlsx.full.min.js'
    ];
    window.__XLSX_LOAD_PROMISE__=(async()=>{
      let lastErr;for(const url of urls){try{await new Promise((res,rej)=>{const s=document.createElement('script');s.src=url;s.async=true;s.onload=res;s.onerror=rej;document.head.appendChild(s);});return;}catch(e){lastErr=e;}}throw lastErr;})();
    return window.__XLSX_LOAD_PROMISE__;
  }

  // read/write
  async function readItemsFromHandle(handle){
    await ensureXLSX();
    const f=await handle.getFile();
    if(f.size===0)return [];
    const buf=await f.arrayBuffer();
    const wb=XLSX.read(buf,{type:'array'});
    const ws=wb.Sheets['Rules']||wb.Sheets[wb.SheetNames[0]];
    if(!ws)return [];
    const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:''});
    const data=rows.slice(1).filter(r=>r.length&& (r[0]!==''||r[1]!==''));
    return data.map((r,i)=>({id:'it-'+i+'-'+Date.now().toString(36),prefix:String(r[0]||''),name:String(r[1]||'')}));
  }
  async function writeItemsToHandle(handle,items){
    await ensureXLSX();
    const wb=XLSX.utils.book_new();
    const aoa=[['Prefix','Name'],...items.map(it=>[it.prefix,it.name])];
    const ws=XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb,ws,'Rules');
    const out=XLSX.write(wb,{bookType:'xlsx',type:'array'});
    const w=await handle.createWritable();
    await w.write(new Blob([out],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    await w.close();
  }

  // ---------- UI ----------
  function buildUI(root){
    root.innerHTML=`
      <div class="nr-root">
        <div class="nr-titlebar" style="display:none"></div>
        <div class="nr-surface"><div class="nr-list"></div></div>
        <div class="nr-footer"><button class="nr-add" title="Neues Item">＋</button></div>
      </div>
      <div class="nr-modal nr-options">
        <div class="nr-panel">
          <div class="nr-row" style="justify-content:space-between;margin-bottom:.5rem">
            <div class="font-semibold">Namensregeln – Optionen</div>
            <button class="nr-btn secondary nr-close">Schließen</button>
          </div>
          <div class="nr-grid">
            <div class="nr-field" style="grid-column:span 3;">
              <label>Datei</label>
              <div class="nr-row">
                <button class="nr-btn nr-pick">Excel wählen</button>
                <button class="nr-btn secondary nr-create">Excel erstellen</button>
                <span class="nr-file"></span>
              </div>
            </div>
            <div class="nr-field" style="grid-column:span 3;">
              <label>Titel (optional)</label>
              <input type="text" class="nr-input nr-title-input" placeholder="Kein Titel">
            </div>
            <div class="nr-field">
              <label>Hintergrund</label>
              <input type="color" class="nr-color nr-c-bg" value="#f5f7fb">
            </div>
            <div class="nr-field">
              <label>Item Hintergrund</label>
              <input type="color" class="nr-color nr-c-item" value="#ffffff">
            </div>
            <div class="nr-field">
              <label>Titelfarbe</label>
              <input type="color" class="nr-color nr-c-title" value="#2563eb">
            </div>
            <div class="nr-field">
              <label>Untertitel-Farbe</label>
              <input type="color" class="nr-color nr-c-sub" value="#4b5563">
            </div>
          </div>
          <div class="nr-row" style="justify-content:flex-end;margin-top:.75rem">
            <button class="nr-btn nr-save">Speichern</button>
          </div>
        </div>
      </div>
      <div class="nr-modal nr-add-modal">
        <div class="nr-panel">
          <div class="nr-row" style="justify-content:space-between;margin-bottom:.5rem">
            <div class="font-semibold">Neues Item</div>
            <button class="nr-btn secondary nr-add-close">Schließen</button>
          </div>
          <div class="nr-grid" style="grid-template-columns:1fr;">
            <div class="nr-field">
              <label>Prefix</label>
              <input type="text" class="nr-input nr-add-prefix" />
            </div>
            <div class="nr-field">
              <label>Name</label>
              <input type="text" class="nr-input nr-add-name" />
            </div>
          </div>
          <div class="nr-row" style="justify-content:flex-end;margin-top:.75rem">
            <button class="nr-btn nr-add-save">Speichern</button>
          </div>
        </div>
      </div>
    `;
    const menu=document.createElement('div');
    menu.className='nr-menu';
    menu.innerHTML=`<button class="mi mi-opt">⚙️ Optionen</button>`;
    document.body.appendChild(menu);
    return {
      rootVars:root.querySelector('.nr-root'),
      titlebar:root.querySelector('.nr-titlebar'),
      list:root.querySelector('.nr-list'),
      add:root.querySelector('.nr-add'),
      modal:root.querySelector('.nr-options'),
      close:root.querySelector('.nr-close'),
      pick:root.querySelector('.nr-pick'),
      create:root.querySelector('.nr-create'),
      save:root.querySelector('.nr-save'),
      fLabel:root.querySelector('.nr-file'),
      cBg:root.querySelector('.nr-c-bg'),
      cItem:root.querySelector('.nr-c-item'),
      cTitle:root.querySelector('.nr-c-title'),
      cSub:root.querySelector('.nr-c-sub'),
      titleInput:root.querySelector('.nr-title-input'),
      addModal:root.querySelector('.nr-add-modal'),
      addClose:root.querySelector('.nr-add-close'),
      addSave:root.querySelector('.nr-add-save'),
      addPrefix:root.querySelector('.nr-add-prefix'),
      addName:root.querySelector('.nr-add-name'),
      menu
    };
  }

  function cardEl(item){
    const el=document.createElement('div');
    el.className='nr-card';
    el.dataset.id=item.id;
    el.innerHTML=`<div class="nr-flex"><div class="nr-title">${escapeHtml(item.prefix)}</div><div class="nr-sub">${escapeHtml(item.name)}</div></div><div class="nr-handle" title="Ziehen">⋮⋮</div><button class="nr-del" title="Löschen">✕</button>`;
    return el;
  }
  const escapeHtml=s=>s.replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]));

  // ---------- main render ----------
  window.renderNamingRules=function(root,ctx){
    if(!('showOpenFilePicker' in window)||!('showSaveFilePicker' in window)){
      root.innerHTML='<div class="p-2 text-sm">Dieses Modul benötigt die File System Access API (Chromium).</div>';
      return;
    }
    const els=buildUI(root);
    const instanceId=instanceIdOf(root);
    let cfg=getCfg(instanceId)||{};
    cfg.colors=cfg.colors||{bg:'#f5f7fb',item:'#ffffff',title:'#2563eb',sub:'#4b5563'};
    cfg.title=cfg.title||'';
    cfg.idbKey=cfg.idbKey||('nr-'+instanceId);
    cfg.fileName=cfg.fileName||'';
    let fileHandle=null;
    let items=[];

    function applyColors(c){els.rootVars.style.setProperty('--nr-bg',c.bg);els.rootVars.style.setProperty('--nr-item-bg',c.item);els.rootVars.style.setProperty('--nr-title',c.title);els.rootVars.style.setProperty('--nr-sub',c.sub);}
    function applyTitle(t){els.titlebar.textContent=t;els.titlebar.style.display=t?'':'none';}
    applyColors(cfg.colors);applyTitle(cfg.title);

    function renderList(){els.list.innerHTML='';items.forEach(it=>els.list.appendChild(cardEl(it)));}
    function reorderFromDOM(){const order=Array.from(els.list.children).map(el=>el.dataset.id);items.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));}
    const scheduleSave=debounce(500,()=>{if(fileHandle)writeItemsToHandle(fileHandle,items);});

    const sortable=Sortable.create(els.list,{handle:'.nr-handle',animation:150,ghostClass:'nr-ghost',chosenClass:'nr-chosen',group:{name:'nr-'+instanceId,pull:false,put:false},onSort:()=>{reorderFromDOM();scheduleSave();}});
    els.list.addEventListener('click',e=>{const btn=e.target.closest('.nr-del');if(!btn)return;const card=btn.closest('.nr-card');const id=card.dataset.id;items=items.filter(it=>it.id!==id);card.remove();scheduleSave();});

    // add modal
    function openAdd(){els.addModal.classList.add('open');els.addPrefix.value='';els.addName.value='';}
    function closeAdd(){els.addModal.classList.remove('open');}
    els.add.addEventListener('click',openAdd);
    els.addClose.addEventListener('click',closeAdd);
    els.addSave.addEventListener('click',()=>{
      const prefix=(els.addPrefix.value||'').trim();
      const name=(els.addName.value||'').trim();
      if(!prefix&&!name){closeAdd();return;}
      const it={id:'it-'+Math.random().toString(36).slice(2),prefix,name};
      items.push(it);els.list.appendChild(cardEl(it));scheduleSave();closeAdd();
    });
    [els.addPrefix,els.addName].forEach(inp=>inp.addEventListener('keydown',e=>{if(e.key==='Enter')els.addSave.click();}));

    // options modal
    function openModal(){els.modal.classList.add('open');els.cBg.value=cfg.colors.bg;els.cItem.value=cfg.colors.item;els.cTitle.value=cfg.colors.title;els.cSub.value=cfg.colors.sub;els.titleInput.value=cfg.title;}
    function closeModal(){els.modal.classList.remove('open');}
    els.save.addEventListener('click',()=>{cfg.colors={bg:els.cBg.value,item:els.cItem.value,title:els.cTitle.value,sub:els.cSub.value};cfg.title=els.titleInput.value||'';applyColors(cfg.colors);applyTitle(cfg.title);saveCfg(instanceId,cfg);closeModal();});
    els.close.addEventListener('click',closeModal);

    // file pick/create
    els.pick.addEventListener('click',pickExcel);
    els.create.addEventListener('click',createExcel);
    async function pickExcel(){try{const [h]=await window.showOpenFilePicker({types:[{description:'Excel',accept:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx']}}]});if(!h)return;if(await ensureRWPermission(h)){fileHandle=h;cfg.fileName=h.name;saveCfg(instanceId,cfg);await idbSet(cfg.idbKey,h);items=await readItemsFromHandle(h);renderList();els.fLabel.textContent='• '+(cfg.fileName||h.name);}}catch(e){console.warn('pickExcel',e);}}
    async function createExcel(){try{const h=await window.showSaveFilePicker({suggestedName:'naming-rules.xlsx',types:[{description:'Excel',accept:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx']}}]});if(await ensureRWPermission(h)){fileHandle=h;cfg.fileName=h.name;saveCfg(instanceId,cfg);await idbSet(cfg.idbKey,h);items=[];await writeItemsToHandle(h,items);renderList();els.fLabel.textContent='• '+(cfg.fileName||h.name);}}catch(e){console.warn('createExcel',e);}}

    // context menu
    function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
    root.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();const m=els.menu;const pad=8;const vw=window.innerWidth,vh=window.innerHeight;const w=200,h=44;m.style.left=clamp(e.clientX,pad,vw-w-pad)+'px';m.style.top=clamp(e.clientY,pad,vh-h-pad)+'px';m.classList.add('open');});
    els.menu.querySelector('.mi-opt').addEventListener('click',()=>{els.menu.classList.remove('open');openModal();});
    window.addEventListener('click',()=>els.menu.classList.remove('open'));
    window.addEventListener('keydown',e=>{if(e.key==='Escape')els.menu.classList.remove('open');});

    // restore previous handle + items
    (async()=>{try{const h=await idbGet(cfg.idbKey);if(h&&await ensureRWPermission(h)){fileHandle=h;cfg.fileName=h.name;saveCfg(instanceId,cfg);items=await readItemsFromHandle(h);renderList();els.fLabel.textContent='• '+(cfg.fileName||h.name);}}catch(e){console.warn('Restore failed',e);}})();

    // cleanup when removed
    const mo=new MutationObserver(()=>{if(!document.body.contains(root)){try{sortable.destroy();}catch{};els.menu?.remove();(async()=>{try{await idbDel(cfg.idbKey);}catch{};try{removeCfg(instanceId);}catch{};})();mo.disconnect();}});
    mo.observe(document.body,{childList:true,subtree:true});
  };
})();
