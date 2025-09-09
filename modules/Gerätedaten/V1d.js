/* Gerätedaten
 * - Excel pick/create with configurable fields
 * - Fields can be reordered and toggled via Sortable list in options
 * - Manual column count option replaces previous automatic layout
 * - Requires FS Access API (Chromium); auto-loads xlsx from CDN.
 */
(function(){
  // ----- styles -----
  const CSS = `
  .rs-root{height:100%;display:flex;flex-direction:column;gap:.6rem}
  .rs-head{font-weight:700;font-size:1.35rem;text-align:center;margin:.2rem 0 .2rem;user-select:none;color:var(--text-color)}
  .rs-form{flex:1;overflow:auto;padding:.25rem .1rem .1rem .1rem;scrollbar-width:none;-ms-overflow-style:none}
  .rs-form::-webkit-scrollbar{width:0;height:0;display:none}
  .rs-grid{display:grid;gap:.9rem}
  .rs-field{display:flex;flex-direction:column;gap:.35rem}
  .rs-label{font-weight:600;opacity:.95;color:var(--text-color)}
  .rs-inputwrap{display:grid;grid-template-columns:auto 38px;align-items:center}
  .rs-input{width:100%;background:rgba(255,255,255,.08);border:1px solid var(--module-border-color);color:var(--text-color);padding:.45rem .55rem;border-radius:.4rem}
  .rs-copy{width:34px;height:34px;display:flex;align-items:center;justify-content:center;border:1px solid var(--module-border-color);border-radius:.35rem;background:rgba(255,255,255,.08);cursor:pointer;color:var(--text-color)}
  .rs-copy:active{transform:scale(.98)}
  .rs-note{font-size:.85rem;opacity:.75;margin-top:.15rem;color:var(--text-color)}
  .rs-item{display:flex;justify-content:space-between;align-items:center;padding:.35rem .5rem;margin-bottom:.3rem;border:1px solid #d1d5db;border-radius:.4rem;cursor:pointer}
  .rs-item.off{opacity:.5}
  `;
  (function inject(){
    let tag=document.getElementById('record-sheet-styles');
    if(!tag){tag=document.createElement('style');tag.id='record-sheet-styles';document.head.appendChild(tag);} 
    tag.textContent=CSS;
  })();

  // ----- utilities -----
  const LS_DOC='module_data_v1';
  const IDB_NAME='modulesApp';
  const IDB_STORE='fs-handles';
  const SHEET_NAME='records';
  const WATCH_INTERVAL=300;

  const parse=(s,fb)=>{try{return JSON.parse(s)||fb;}catch{return fb;}};
  const loadDoc=()=>parse(localStorage.getItem(LS_DOC),{__meta:{v:1},general:{},instances:{}});
  const saveDoc=(doc)=>{doc.__meta={v:1,updatedAt:new Date().toISOString()};localStorage.setItem(LS_DOC,JSON.stringify(doc));};
  const getDocString=()=>localStorage.getItem(LS_DOC)||'';
  const instanceIdOf=root=>root.closest('.grid-stack-item')?.dataset?.instanceId||('inst-'+Math.random().toString(36).slice(2));
  const debounce=(ms,fn)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};};

  function idbOpen(){return new Promise((res,rej)=>{const r=indexedDB.open(IDB_NAME,1);r.onupgradeneeded=()=>r.result.createObjectStore(IDB_STORE);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
  async function idbSet(k,v){const db=await idbOpen();return new Promise((res,rej)=>{const tx=db.transaction(IDB_STORE,'readwrite');tx.objectStore(IDB_STORE).put(v,k);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
  async function idbGet(k){const db=await idbOpen();return new Promise((res,rej)=>{const tx=db.transaction(IDB_STORE,'readonly');const rq=tx.objectStore(IDB_STORE).get(k);rq.onsuccess=()=>res(rq.result||null);rq.onerror=()=>rej(rq.error);});}
  async function idbDel(k){const db=await idbOpen();return new Promise((res,rej)=>{const tx=db.transaction(IDB_STORE,'readwrite');tx.objectStore(IDB_STORE).delete(k);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
  async function ensureRWPermission(handle){if(!handle?.queryPermission)return true;const q=await handle.queryPermission({mode:'readwrite'});if(q==='granted')return true;const r=await handle.requestPermission({mode:'readwrite'});return r==='granted';}
  async function ensureRPermission(handle){if(!handle?.queryPermission)return true;const q=await handle.queryPermission({mode:'read'});if(q==='granted')return true;const r=await handle.requestPermission({mode:'read'});return r==='granted';}

  async function ensureXLSX(){
    if(window.XLSX) return;
    if(window.__XLSX_LOAD_PROMISE__) return window.__XLSX_LOAD_PROMISE__;
    const urls=[
      'https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js',
      'https://cdn.jsdelivr.net/npm/xlsx@0.20.2/dist/xlsx.full.min.js',
      'https://unpkg.com/xlsx@0.20.2/dist/xlsx.full.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.20.2/xlsx.full.min.js'
    ];
    window.__XLSX_LOAD_PROMISE__=(async()=>{
      let last;for(const url of urls){try{await new Promise((ok,err)=>{const s=document.createElement('script');s.src=url;s.async=true;s.onload=ok;s.onerror=()=>err(new Error('load '+url));document.head.appendChild(s);});if(window.XLSX) return;}catch(e){last=e;}}
      throw last||new Error('XLSX load failed');
    })();
    return window.__XLSX_LOAD_PROMISE__;
  }

  let HEAD=[];
  async function readAll(handle){
    await ensureXLSX();
    const f=await handle.getFile();
    if(f.size===0) return [];
    const buf=await f.arrayBuffer();
    const wb=XLSX.read(buf,{type:'array'});
    const ws=wb.Sheets[SHEET_NAME]||wb.Sheets[wb.SheetNames[0]];
    if(!ws) return [];
    const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
    const hdr=rows[0]?.map(h=>String(h||'').toLowerCase().trim())||[];
    const idx=Object.fromEntries(HEAD.map(h=>[h,hdr.indexOf(h)]));
    return rows.slice(1).map(r=>{const o={};HEAD.forEach(k=>o[k]=String(r[idx[k]]??''));return o;}).filter(row=>HEAD.some(k=>row[k]!==''));
  }
  async function writeAll(handle,rows){
    await ensureXLSX();
    const wb=XLSX.utils.book_new();
    const aoa=[HEAD,...rows.map(r=>HEAD.map(k=>r[k]||''))];
    const ws=XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb,ws,SHEET_NAME);
    const out=XLSX.write(wb,{bookType:'xlsx',type:'array'});
    const w=await handle.createWritable();
    await w.write(new Blob([out],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    await w.close();
  }

  async function readRulesFromHandle(handle){
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

  function buildUI(root){
    root.innerHTML=`
      <div class="rs-root">
        <div class="rs-head" style="display:none"></div>
        <div class="rs-form">
          <div class="rs-grid"></div>
          <div class="rs-note"></div>
        </div>
      </div>
      <div class="db-modal rs-modal" style="position:fixed;inset:0;display:none;place-items:center;background:rgba(0,0,0,.35);z-index:50;">
        <div class="db-panel" style="background:#fff;color:#111827;width:min(92vw,720px);border-radius:.9rem;padding:1rem;">
          <div class="db-row" style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;margin-bottom:.5rem">
            <div class="font-semibold">Gerätedaten – Optionen</div>
            <button class="db-btn secondary rs-close" style="background:#eee;border-radius:.5rem;padding:.35rem .6rem">Schließen</button>
          </div>
          <div class="db-field">
            <label style="font-size:.85rem;font-weight:600;display:block;margin-bottom:.25rem">Excel-Datei</label>
            <div class="db-row" style="display:flex;gap:.5rem;align-items:center">
              <button class="db-btn rs-pick" style="background:var(--button-bg);color:var(--button-text);border-radius:.5rem;padding:.35rem .6rem">Excel wählen</button>
              <button class="db-btn rs-create" style="background:rgba(0,0,0,.08);border-radius:.5rem;padding:.35rem .6rem">Excel erstellen</button>
              <span class="rs-file db-file"></span>
            </div>
          </div>
          <div class="db-field" style="margin-top:1rem;">
            <label style="font-size:.85rem;font-weight:600;display:block;margin-bottom:.25rem">Namensregeln</label>
            <div class="db-row" style="display:flex;gap:.5rem;align-items:center">
              <button class="db-btn rs-rule-pick" style="background:var(--button-bg);color:var(--button-text);border-radius:.5rem;padding:.35rem .6rem">Excel wählen</button>
              <span class="rs-rule-file db-file"></span>
            </div>
          </div>
          <div class="db-field" style="margin-top:1rem;">
            <label style="font-size:.85rem;font-weight:600;display:block;margin-bottom:.25rem">Felder</label>
            <ul class="rs-list" style="list-style:none;margin:0;padding:0;"></ul>
            <div style="font-size:.8rem;opacity:.7;margin-top:.25rem;">Klicken zum Aktivieren/Deaktivieren, ziehen zum Sortieren.</div>
          </div>
          <div class="db-field" style="margin-top:1rem;">
            <label style="font-size:.85rem;font-weight:600;display:block;margin-bottom:.25rem">Spalten</label>
            <input type="number" min="1" max="6" class="rs-cols" style="width:4rem;padding:.25rem .4rem;border:1px solid #ccc;border-radius:.25rem;" />
          </div>
        </div>
      </div>
    `;
    const menu=document.createElement('div');
    menu.className='db-menu';
    menu.innerHTML=`<button class="mi mi-opt">⚙️ Optionen</button>`;
    document.body.appendChild(menu);
    return {
      grid:root.querySelector('.rs-grid'),
      note:root.querySelector('.rs-note'),
      modal:root.querySelector('.rs-modal'),
      mClose:root.querySelector('.rs-close'),
      mPick:root.querySelector('.rs-pick'),
      mCreate:root.querySelector('.rs-create'),
      head:root.querySelector('.rs-head'),
      mFile:root.querySelector('.rs-file'),
      mRulePick:root.querySelector('.rs-rule-pick'),
      mRuleFile:root.querySelector('.rs-rule-file'),
      mList:root.querySelector('.rs-list'),
      mCols:root.querySelector('.rs-cols'),
      menu
    };
  }

  // ----- main -----
  window.renderRecordSheet=function(root,ctx){
    if(!('showOpenFilePicker' in window)||!('showSaveFilePicker' in window)){
      root.innerHTML=`<div class="p-2 text-sm">Dieses Modul benötigt die File System Access API (Chromium).</div>`;
      return;
    }

    const defaults=ctx?.moduleJson?.settings||{};
    const defaultFields=Array.isArray(defaults.fields)&&defaults.fields.length?defaults.fields.map(f=>({key:f.key,label:f.label,enabled:!!f.enabled})):[
      {key:'meldung',label:'Meldung',enabled:true},
      {key:'auftrag',label:'Auftrag',enabled:true},
      {key:'part',label:'P/N',enabled:true},
      {key:'serial',label:'S/N',enabled:true}
    ];
    const defaultColumns=defaults.columns||2;

    const els=buildUI(root);
    const instanceId=instanceIdOf(root);
    const idbKey=`recordSheet:${instanceId}`;
    const ruleIdbKey=`recordSheetRules:${instanceId}`;

    function cloneFields(a){return a.map(f=>({key:f.key,label:f.label,enabled:!!f.enabled}));}
    function loadCfg(){
      const doc=loadDoc();
      const cfg=doc?.instances?.[instanceId]?.recordSheet||{};
      return{
        idbKey:cfg.idbKey||idbKey,
        fileName:cfg.fileName||'',
        ruleIdbKey:cfg.ruleIdbKey||ruleIdbKey,
        ruleFileName:cfg.ruleFileName||'',
        fields:Array.isArray(cfg.fields)?cfg.fields:cloneFields(defaultFields),
        columns:cfg.columns||defaultColumns
      };
    }
    function saveCfg(cfg){const doc=loadDoc();doc.instances||={};doc.instances[instanceId]||={};doc.instances[instanceId].recordSheet=cfg;saveDoc(doc);}
    function removeCfg(){const doc=loadDoc();if(doc?.instances?.[instanceId]){delete doc.instances[instanceId].recordSheet;if(!Object.keys(doc.instances[instanceId]).length)delete doc.instances[instanceId];saveDoc(doc);}}

    let cfg=loadCfg();
    els.mFile.textContent=cfg.fileName?`• ${cfg.fileName}`:'Keine Datei gewählt';
    els.mRuleFile.textContent=cfg.ruleFileName?`• ${cfg.ruleFileName}`:'Keine Namensregeln';
    els.head.style.display='none';
    HEAD=cfg.fields.map(f=>f.key);
    let handle=null;
    let ruleHandle=null;
    let rules=[];
    let cache=[];

    const setNote=s=>els.note.textContent=s||'';
    const copy=async val=>{try{await navigator.clipboard.writeText(val||'');setNote('Kopiert.');setTimeout(()=>setNote(''),800);}catch{setNote('Kopieren fehlgeschlagen');}};

    let fieldEls={};
    const lookupName=pn=>{for(const r of rules){if(pn.startsWith(r.prefix))return r.name;}return'';};
    function updateName(){if(!rules.length){els.head.style.display='none';return;}const pn=fieldEls['part']?.input?.value?.trim()||'';const name=lookupName(pn);els.head.style.display='block';els.head.textContent=name||'Unbekanntes Gerät';}
    function applyColumns(){const cols=Math.max(1,parseInt(cfg.columns)||1);els.grid.style.gridTemplateColumns=`repeat(${cols},1fr)`;}
    function renderFields(){
      HEAD=cfg.fields.map(f=>f.key);
      els.grid.innerHTML='';fieldEls={};
      cfg.fields.filter(f=>f.enabled).forEach(f=>{
        const wrap=document.createElement('div');
        wrap.className='rs-field';
        wrap.innerHTML=`<label class="rs-label">${f.label}</label><div class="rs-inputwrap"><input class="rs-input" type="text" ${f.key==='meldung'?'readonly':''}/><button class="rs-copy" title="Kopieren">⧉</button></div>`;
        const input=wrap.querySelector('input');
        const btn=wrap.querySelector('.rs-copy');
        btn.addEventListener('click',()=>copy(input.value));
        if(f.key!=='meldung'){input.addEventListener('input',()=>{putField(f.key,input.value);if(f.key==='part')updateName();});}
        els.grid.appendChild(wrap);
        fieldEls[f.key]={input};
      });
      applyColumns();
      refreshFromCache();
    }

    function renderFieldList(){
      const list=els.mList;list.innerHTML='';
      cfg.fields.forEach(f=>{
        const li=document.createElement('li');
        li.className='rs-item'+(f.enabled?'':' off');
        li.dataset.key=f.key;
        li.innerHTML=`<span>${f.key}</span><span>${f.label}</span>`;
        li.addEventListener('click',()=>{f.enabled=!f.enabled;li.classList.toggle('off',!f.enabled);});
        list.appendChild(li);
      });
      new Sortable(list,{animation:150,onEnd:()=>{const order=Array.from(list.children).map(li=>li.dataset.key);cfg.fields.sort((a,b)=>order.indexOf(a.key)-order.indexOf(b.key));}});
    }

    function openModal(){renderFieldList();els.mCols.value=cfg.columns;els.modal.style.display='grid';}
    function closeModal(){els.modal.style.display='none';saveCfg(cfg);renderFields();}
    els.mClose.onclick=closeModal;
    els.mCols.addEventListener('change',()=>{cfg.columns=Math.max(1,parseInt(els.mCols.value)||1);applyColumns();saveCfg(cfg);});

    function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
    root.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();const m=els.menu,pad=8,vw=innerWidth,vh=innerHeight;const rect=m.getBoundingClientRect();const w=rect.width||200,h=rect.height||44;m.style.left=clamp(e.clientX,pad,vw-w-pad)+'px';m.style.top=clamp(e.clientY,pad,vh-h-pad)+'px';m.classList.add('open');});
    addEventListener('click',()=>els.menu.classList.remove('open'));
    addEventListener('keydown',e=>{if(e.key==='Escape')els.menu.classList.remove('open');});
    els.menu.querySelector('.mi-opt').addEventListener('click',()=>{els.menu.classList.remove('open');openModal();});

    async function bindHandle(h){const ok=await ensureRWPermission(h);if(!ok){setNote('Berechtigung verweigert.');return false;}handle=h;await idbSet(cfg.idbKey,h);cfg.fileName=h.name||'Dictionary.xlsx';saveCfg(cfg);els.mFile.textContent=`• ${cfg.fileName}`;return true;}
    async function bindRuleHandle(h){const ok=await ensureRPermission(h);if(!ok){setNote('Berechtigung verweigert.');return false;}ruleHandle=h;await idbSet(cfg.ruleIdbKey,h);cfg.ruleFileName=h.name||'Rules.xlsx';saveCfg(cfg);els.mRuleFile.textContent=`• ${cfg.ruleFileName}`;try{rules=await readRulesFromHandle(h);}catch{rules=[];}updateName();return true;}
    els.mPick.onclick=async()=>{try{const [h]=await showOpenFilePicker({types:[{description:'Excel',accept:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx']}}],excludeAcceptAllOption:false,multiple:false});if(h&&await bindHandle(h)){cache=await readAll(h);setNote('Datei geladen.');refreshFromCache();}}catch(e){if(e?.name!=='AbortError')setNote('Auswahl fehlgeschlagen.');}};
    els.mCreate.onclick=async()=>{try{const h=await showSaveFilePicker({suggestedName:'Dictionary.xlsx',types:[{description:'Excel',accept:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx']}}]});if(h&&await bindHandle(h)){cache=[];await writeAll(h,cache);setNote('Datei erstellt.');refreshFromCache();}}catch(e){if(e?.name!=='AbortError')setNote('Erstellen fehlgeschlagen.');}};
    els.mRulePick.onclick=async()=>{try{const [h]=await showOpenFilePicker({types:[{description:'Excel',accept:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx']}}],excludeAcceptAllOption:false,multiple:false});if(h)await bindRuleHandle(h);}catch(e){if(e?.name!=='AbortError')setNote('Auswahl fehlgeschlagen.');}};

    (async()=>{try{const h=await idbGet(cfg.idbKey);if(h&&await ensureRWPermission(h)){handle=h;cache=await readAll(h);refreshFromCache();}}catch(e){}})();
    (async()=>{try{const h=await idbGet(cfg.ruleIdbKey);if(h&&await ensureRPermission(h)){ruleHandle=h;rules=await readRulesFromHandle(h);els.mRuleFile.textContent=`• ${cfg.ruleFileName||h.name||'Rules.xlsx'}`;updateName();}}catch(e){}})();

    function activeMeldung(){return(loadDoc()?.general?.Meldung||'').trim();}
    function refreshFromCache(){const m=activeMeldung();const row=cache.find(r=>(r.meldung||'').trim()===m);cfg.fields.forEach(f=>{const el=fieldEls[f.key];if(!el)return;if(f.key==='meldung')el.input.value=m;else el.input.value=row?.[f.key]||'';});updateName();}

    addEventListener('storage',e=>{if(e.key===LS_DOC)refreshFromCache();});
    addEventListener('visibilitychange',()=>{if(!document.hidden)refreshFromCache();});
    let lastDocString=getDocString();
    const watcher=setInterval(()=>{const now=getDocString();if(now!==lastDocString){lastDocString=now;refreshFromCache();}},WATCH_INTERVAL);

    const scheduleSave=debounce(350,async()=>{if(!handle){setNote('Keine Excel-Datei gewählt.');return;}try{await writeAll(handle,cache);setNote('Gespeichert.');setTimeout(()=>setNote(''),700);}catch{setNote('Speichern fehlgeschlagen.');}});
    function putField(field,value){const m=activeMeldung();if(!m)return;let row=cache.find(r=>(r.meldung||'').trim()===m);if(!row){row=HEAD.reduce((o,k)=>(o[k]='',o),{});row.meldung=m;cache.push(row);}row[field]=value;scheduleSave();}

    renderFields();

    const mo=new MutationObserver(()=>{if(!document.body.contains(root)){clearInterval(watcher);els.menu?.remove();(async()=>{try{await idbDel(cfg.idbKey);}catch{}try{await idbDel(cfg.ruleIdbKey);}catch{}try{removeCfg();}catch{}})();mo.disconnect();}});
    mo.observe(document.body,{childList:true,subtree:true});
  };
})();
