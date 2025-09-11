/* Recent Files module */
(function(){
  // ----- constants and helpers -----
  const LS_KEY = 'module_data_v1';
  const IDB_NAME = 'modulesApp';
  const IDB_STORE = 'fs-handles';

  const parse = (s, fb) => { try { return JSON.parse(s) ?? fb; } catch { return fb; } };
  const loadDoc = () => parse(localStorage.getItem(LS_KEY), { __meta:{v:1}, general:{}, instances:{} });
  const saveDoc = (doc) => { doc.__meta = {v:1, updatedAt:new Date().toISOString()}; localStorage.setItem(LS_KEY, JSON.stringify(doc)); };

  function instanceIdOf(root){
    return root.closest('.grid-stack-item')?.dataset?.instanceId || 'inst-'+Math.random().toString(36).slice(2);
  }

  // --- idb helpers for directory handle persistence ---
  function idbOpen(){ return new Promise((res,rej)=>{ const r=indexedDB.open(IDB_NAME,1); r.onupgradeneeded=()=>r.result.createObjectStore(IDB_STORE); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
  async function idbSet(k,v){ const db=await idbOpen(); return new Promise((res,rej)=>{ const tx=db.transaction(IDB_STORE,'readwrite'); tx.objectStore(IDB_STORE).put(v,k); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); }); }
  async function idbGet(k){ const db=await idbOpen(); return new Promise((res,rej)=>{ const tx=db.transaction(IDB_STORE,'readonly'); const rq=tx.objectStore(IDB_STORE).get(k); rq.onsuccess=()=>res(rq.result||null); rq.onerror=()=>rej(rq.error); }); }

  async function ensureRPermission(handle){
    if (!handle?.queryPermission) return true;
    const q = await handle.queryPermission({mode:'read'}); if (q==='granted') return true;
    const r = await handle.requestPermission({mode:'read'}); return r==='granted';
  }

  // ----- one-time styles -----
  if (!document.getElementById('recent-files-styles')) {
    const css = `
    .rf-root{height:100%;display:flex;flex-direction:column;--rf-bg:#f8fafc;--rf-item-bg:#fff;--rf-active:#3b82f6;}
    .rf-titlebar{display:flex;justify-content:space-between;align-items:center;font-weight:600;color:var(--text-color);padding:0 .25rem;}
    .rf-surface{flex:1;background:var(--rf-bg);border-radius:1rem;padding:.5rem;overflow:auto;}
    .rf-list{display:flex;flex-direction:column;gap:.35rem;}
    .rf-item{display:flex;justify-content:space-between;align-items:center;padding:.45rem .6rem;background:var(--rf-item-bg);border-radius:.5rem;cursor:pointer;box-shadow:0 2px 4px rgba(0,0,0,.06);}
    .rf-item:hover{box-shadow:0 4px 8px rgba(0,0,0,.1);}
    .rf-item.active{box-shadow:0 0 0 2px var(--rf-active) inset;}
    .rf-modal{position:fixed;inset:0;display:none;place-items:center;background:rgba(0,0,0,.35);z-index:50;}
    .rf-modal.open{display:grid;}
    .rf-panel{background:#fff;color:#111827;width:min(92vw,420px);border-radius:.9rem;padding:1rem;box-shadow:0 10px 30px rgba(0,0,0,.25);}
    .rf-field{margin-bottom:.6rem;}
    .rf-field label{display:block;font-size:.85rem;font-weight:600;margin-bottom:.25rem;}
    .rf-color{width:100%;height:2.25rem;border:1px solid #e5e7eb;border-radius:.5rem;}
    .rf-btn{padding:.4rem .7rem;border-radius:.5rem;background:var(--button-bg,#2563eb);color:var(--button-text,#fff);}
    `;
    const tag = document.createElement('style'); tag.id='recent-files-styles'; tag.textContent=css; document.head.appendChild(tag);
  }

  // ----- main render -----
  window.renderRecentFiles = async function(root, ctx){
    const instanceId = instanceIdOf(root);
    const title = (ctx?.moduleJson?.settings?.title) || (ctx?.moduleJson?.name) || 'Recent Files';

    // load instance config
    let doc = loadDoc();
    const inst = doc.instances?.[instanceId] || {dirKey:null, colors:{bg:'#f8fafc', item:'#ffffff', active:'#3b82f6'}};

    function saveInst(){
      doc = loadDoc();
      (doc.instances ||= {})[instanceId] = inst;
      saveDoc(doc);
    }

    root.innerHTML = `
      <div class="rf-root" style="--rf-bg:${inst.colors.bg};--rf-item-bg:${inst.colors.item};--rf-active:${inst.colors.active}">
        <div class="rf-titlebar"><span class="rf-title">${title}</span><button class="rf-settings">⚙️</button></div>
        <div class="rf-surface"><div class="rf-list"></div></div>
      </div>
      <div class="rf-modal"><div class="rf-panel">
        <div class="rf-field"><label>Background</label><input type="color" class="rf-color rf-bg" value="${inst.colors.bg}"></div>
        <div class="rf-field"><label>Item</label><input type="color" class="rf-color rf-item" value="${inst.colors.item}"></div>
        <div class="rf-field"><label>Highlight</label><input type="color" class="rf-color rf-active" value="${inst.colors.active}"></div>
        <div class="rf-field"><button class="rf-btn rf-folder">Choose Folder</button></div>
        <div style="text-align:right"><button class="rf-btn rf-close">Close</button></div>
      </div></div>`;

    const els = {
      list: root.querySelector('.rf-list'),
      modal: root.querySelector('.rf-modal'),
      settings: root.querySelector('.rf-settings'),
      close: root.querySelector('.rf-close'),
      folderBtn: root.querySelector('.rf-folder'),
      bg: root.querySelector('.rf-bg'),
      item: root.querySelector('.rf-item'),
      active: root.querySelector('.rf-active'),
      rootBox: root.querySelector('.rf-root')
    };

    // modal events
    els.settings.addEventListener('click', ()=>{ els.modal.classList.add('open'); });
    els.close.addEventListener('click', ()=>{ els.modal.classList.remove('open'); });
    els.bg.addEventListener('input', ()=>{ inst.colors.bg=els.bg.value; els.rootBox.style.setProperty('--rf-bg', inst.colors.bg); saveInst(); });
    els.item.addEventListener('input', ()=>{ inst.colors.item=els.item.value; els.rootBox.style.setProperty('--rf-item-bg', inst.colors.item); saveInst(); });
    els.active.addEventListener('input', ()=>{ inst.colors.active=els.active.value; els.rootBox.style.setProperty('--rf-active', inst.colors.active); saveInst(); });

    // directory picker
    els.folderBtn.addEventListener('click', async ()=>{
      try{
        const handle = await window.showDirectoryPicker();
        const key = instanceId+'-dir';
        await idbSet(key, handle);
        inst.dirKey = key; saveInst();
        await loadList(handle);
      }catch(e){ console.warn(e); }
    });

    async function loadList(dirHandle){
      if(!dirHandle) return;
      els.list.innerHTML='';
      const items = [];
      for await(const [name,handle] of dirHandle.entries()){
        if(handle.kind==='file'){
          try{
            const file = await handle.getFile();
            items.push({name, handle, date:file.lastModified});
          }catch{}
        }
      }
      items.sort((a,b)=>b.date-a.date);
      items.forEach(item=>{
        const div=document.createElement('div');
        div.className='rf-item';
        div.innerHTML=`<span>${item.name}</span><span class="text-xs opacity-75">${new Date(item.date).toLocaleString()}</span>`;
        div.addEventListener('click',()=>selectItem(div, item.handle));
        els.list.appendChild(div);
      });
    }

    function selectItem(el, handle){
      els.list.querySelectorAll('.rf-item').forEach(i=>i.classList.remove('active'));
      el.classList.add('active');
      // Save path to general so other modules can read
      doc = loadDoc();
      (doc.general ||= {}).recentFilePath = handle.name; // name only; full path not available
      saveDoc(doc);
    }

    // initial load if directory previously chosen
    if(inst.dirKey){
      const h = await idbGet(inst.dirKey);
      if(h && await ensureRPermission(h)) loadList(h);
    }
  };
})();
