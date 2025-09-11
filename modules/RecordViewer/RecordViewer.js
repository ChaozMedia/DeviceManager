(function(){
  const LS_KEY = 'module_data_v1'; // document key used by recentFiles

  function escapeHtml(str){
    return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  }

  function getPath(){
    try{
      const doc = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      return doc?.general?.recentFilePath || null;
    }catch{
      return null;
    }
  }

  async function loadAndRender(root){
    const path = getPath();
    if(!path){
      root.textContent = 'No recent file selected.';
      return;
    }
    try{
      const res = await fetch(path);
      const text = await res.text();
      const lines = text.split(/\r?\n/);
      root.innerHTML = lines.map(line => {
        const trimmed = line.trim();
        let cls = '';
        if(trimmed.includes('clfocused')){
          cls = 'rv-focused';
        }else if(trimmed.includes('Step:')){
          cls = 'rv-failed';
        }else if(trimmed.includes('clchecked')){
          cls = 'rv-passed';
        }
        return `<div class="rv-line ${cls}">${escapeHtml(line)}</div>`;
      }).join('');
    }catch(err){
      root.textContent = 'Error loading file';
    }
  }

  function ensureStyles(){
    if(document.getElementById('rv-styles')) return;
    const style = document.createElement('style');
    style.id = 'rv-styles';
    style.textContent = `
      .rv-line { white-space: pre; background:#e5e5e5; }
      .rv-line.rv-passed { background:#d4f8d4; }
      .rv-line.rv-failed { background:#f8d4d4; }
      .rv-line.rv-focused { background:#cfe2ff; }
    `;
    document.head.appendChild(style);
  }

  window.renderRecordViewer = function(root){
    ensureStyles();
    loadAndRender(root);
    function onStorage(ev){ if(ev.key === LS_KEY) loadAndRender(root); }
    window.addEventListener('storage', onStorage);
    const mo = new MutationObserver(() => {
      if(!document.body.contains(root)){
        window.removeEventListener('storage', onStorage);
        mo.disconnect();
      }
    });
    mo.observe(document.body, {childList:true, subtree:true});
  };
})();
