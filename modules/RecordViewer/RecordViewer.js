(function(){
  const LS_KEY = 'module_data_v1'; // document key used by recentFiles
  const IDB_NAME = 'modulesApp';
  const IDB_STORE = 'fs-handles';

  // ensure "storage" events also fire in the same tab
  function patchStorage(){
    if(localStorage.__rvPatched) return;
    const orig = localStorage.setItem;
    localStorage.setItem = function(key, val){
      const old = localStorage.getItem(key);
      orig.apply(this, arguments);
      window.dispatchEvent(new StorageEvent('storage', {
        key,
        oldValue: old,
        newValue: String(val),
        storageArea: localStorage
      }));
    };
    localStorage.__rvPatched = true;
  }

  patchStorage();

  // ----- helpers -----
  function escapeHtml(str){
    return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  }

  function loadDoc(){
    try{ return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
    catch{ return {}; }
  }

  function getPath(){
    const doc = loadDoc();
    return doc?.general?.recentFilePath || doc?.general?.recentFile || null;
  }

  function idbOpen(){
    return new Promise((res,rej)=>{
      const r = indexedDB.open(IDB_NAME,1);
      r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }

  async function idbGet(k){
    const db = await idbOpen();
    return new Promise((res,rej)=>{
      const tx = db.transaction(IDB_STORE,'readonly');
      const rq = tx.objectStore(IDB_STORE).get(k);
      rq.onsuccess = () => res(rq.result||null);
      rq.onerror = () => rej(rq.error);
    });
  }

  async function ensureRPermission(handle){
    if(!handle?.queryPermission) return true;
    const q = await handle.queryPermission({mode:'read'});
    if(q === 'granted') return true;
    const r = await handle.requestPermission({mode:'read'});
    return r === 'granted';
  }

  async function resolveFile(dirHandle, path){
    try{
      const parts = path.split('/').filter(Boolean);
      let handle = dirHandle;
      for(let i=0;i<parts.length;i++){
        const p = parts[i];
        if(i === parts.length-1){
          return await handle.getFileHandle(p);
        }
        handle = await handle.getDirectoryHandle(p);
      }
    }catch{}
    return null;
  }

  async function readFileFromHandles(path){
    const doc = loadDoc();
    const instances = doc.instances || {};
    for(const key of Object.keys(instances)){
      const dirKey = instances[key]?.dirKey;
      if(!dirKey) continue;
      try{
        const dirHandle = await idbGet(dirKey);
        if(dirHandle && await ensureRPermission(dirHandle)){
          const fileHandle = await resolveFile(dirHandle, path);
          if(fileHandle){
            const file = await fileHandle.getFile();
            return await file.text();
          }
        }
      }catch(e){ console.warn(e); }
    }
    return null;
  }

  async function loadAndRender(root){
    const path = getPath();
    if(!path){
      root.textContent = 'No recent file selected.';
      return;
    }
    try{
      let text = await readFileFromHandles(path);
      if(text == null){
        // fall back to fetch for non-local paths
        const res = await fetch(path);
        text = await res.text();
      }
      const lines = text.split(/\r?\n/);
      root.innerHTML = lines.map(line => {
        const trimmed = line.trim();
        let cls = '';
        if(trimmed.includes('clfocused')){
          cls = 'rv-focused';
        }else if(trimmed.includes('clchecked')){
          cls = 'rv-passed';
        }else if(trimmed.includes('Step:')){
          cls = 'rv-failed';
        }
        return `<div class="rv-line ${cls}">${escapeHtml(line)}</div>`;
      }).join('');
    }catch(err){
      console.warn(err);
      root.textContent = 'Error loading file';
    }
  }

  function ensureStyles(){
    if(document.getElementById('rv-styles')) return;
    const style = document.createElement('style');
    style.id = 'rv-styles';
    style.textContent = `
      .rv-container { overflow:auto; font-family:monospace; }
      .rv-line { white-space: pre; background:#e5e5e5; }
      .rv-line.rv-passed { background:#d4f8d4; }
      .rv-line.rv-failed { background:#f8d4d4; }
      .rv-line.rv-focused { background:#cfe2ff; }
    `;
    document.head.appendChild(style);
  }

  window.renderRecordViewer = function(root){
    ensureStyles();
    root.classList.add('rv-container');

    let lastPath;

    async function refresh(){
      const p = getPath();
      if(p !== lastPath){
        lastPath = p;
        await loadAndRender(root);
      }
    }

    refresh();

    function onStorage(ev){ if(ev.key === LS_KEY) refresh(); }
    window.addEventListener('storage', onStorage);
    const interval = setInterval(refresh, 1000);

    const mo = new MutationObserver(() => {
      if(!document.body.contains(root)){
        window.removeEventListener('storage', onStorage);
        clearInterval(interval);
        mo.disconnect();
      }
    });
    mo.observe(document.body, {childList:true, subtree:true});
  };
})();
