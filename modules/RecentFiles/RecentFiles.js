window.renderRecentFiles = function(targetDiv, opts) {
  const LS_KEY = 'recentFilesDirKey';
  const IDB_NAME = 'modulesApp';
  const IDB_STORE = 'fs-handles';
  const IDB_KEY = 'recentFiles-dir';

  targetDiv.innerHTML = `
    <div id="rf-root" style="display:flex;flex-direction:column;height:100%">
      <button id="rf-open">Ordner wählen</button>
      <ul id="rf-list" style="flex:1;overflow:auto;list-style:none;padding:0;margin:0.5rem 0 0 0"></ul>
    </div>
  `;

  function idbOpen(){
    return new Promise((res, rej) => {
      const r = indexedDB.open(IDB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function idbSet(k, v){
    const db = await idbOpen();
    return new Promise((res, rej) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(v, k);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }
  async function idbGet(k){
    const db = await idbOpen();
    return new Promise((res, rej) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const rq = tx.objectStore(IDB_STORE).get(k);
      rq.onsuccess = () => res(rq.result || null);
      rq.onerror = () => rej(rq.error);
    });
  }
  async function ensureRPermission(handle){
    if (!handle?.queryPermission) return true;
    const q = await handle.queryPermission({mode:'read'});
    if (q === 'granted') return true;
    const r = await handle.requestPermission({mode:'read'});
    return r === 'granted';
  }

  async function listFiles(root){
    const files = [];
    for await (const partHandle of root.values()) {
      if (partHandle.kind !== 'directory') continue;
      for await (const serialHandle of partHandle.values()) {
        if (serialHandle.kind !== 'directory') continue;
        for await (const fileHandle of serialHandle.values()) {
          if (fileHandle.kind !== 'file') continue;
          const file = await fileHandle.getFile();
          files.push({
            part: partHandle.name,
            serial: serialHandle.name,
            name: fileHandle.name,
            modified: file.lastModified
          });
        }
      }
    }
    files.sort((a,b)=>b.modified-a.modified);
    const list = document.getElementById('rf-list');
    list.innerHTML = files.map(f => {
      const date = new Date(f.modified).toLocaleString();
      return `<li>${date} – ${f.part} / ${f.serial} / ${f.name}</li>`;
    }).join('');
  }

  async function pickDir(){
    try {
      const root = await window.showDirectoryPicker();
      await idbSet(IDB_KEY, root);
      localStorage.setItem(LS_KEY, IDB_KEY);
      await listFiles(root);
    } catch(e) {
      if (e?.name !== 'AbortError') console.warn('pickDir', e);
    }
  }

  document.getElementById('rf-open').addEventListener('click', pickDir);

  (async () => {
    const key = localStorage.getItem(LS_KEY);
    if (!key) return;
    try {
      const handle = await idbGet(key);
      if (handle && await ensureRPermission(handle)) {
        await listFiles(handle);
      }
    } catch (e) {
      console.warn('restoreDir', e);
    }
  })();
};
