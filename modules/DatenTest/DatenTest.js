/* Two Texts (Generic Storage) — SINGLE KEY document in localStorage */
(function () {
  const LS_KEY = 'module_data_v1'; // << single, generic key for ALL modules

  // ---- tiny helpers ----
  const parse = (s, fb) => { try { return JSON.parse(s) ?? fb; } catch { return fb; } };
  const loadDoc = () => parse(localStorage.getItem(LS_KEY), { __meta:{v:1}, general:{}, instances:{} });
  const saveDoc = (doc) => {
    doc.__meta = { v: 1, updatedAt: new Date().toISOString() };
    try { localStorage.setItem(LS_KEY, JSON.stringify(doc)); }
    catch (e) { console.warn('localStorage save failed (quota?)', e); }
  };
  const debounce = (ms, fn) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };

  // intra-tab broadcast so other widgets update immediately
  const broadcast = (type, payload) => window.dispatchEvent(new CustomEvent('module-data:update', { detail: { type, ...payload } }));

  function getInstanceId(root){
    return root.closest('.grid-stack-item')?.dataset?.instanceId
        || 'inst-' + Math.random().toString(36).slice(2);
  }

  function renderUI(root, title){
    root.innerHTML = `
      <div class="space-y-2">
        <label class="block text-sm">
          <span class="opacity-90">Shared (doc.general.sharedText)</span>
          <input class="gt-shared w-full text-black p-1 rounded" placeholder="Shared…" />
        </label>
        <label class="block text-sm">
          <span class="opacity-90">Only this instance (doc.instances[ID].localText)</span>
          <input class="gt-local w-full text-black p-1 rounded" placeholder="Local…" />
        </label>
        <div class="text-xs opacity-80 gt-status"></div>
      </div>
    `;
    return {
      shared: root.querySelector('.gt-shared'),
      local:  root.querySelector('.gt-local'),
      status: root.querySelector('.gt-status')
    };
  }

  // ---- public render ----
  window.renderTwoTextsGeneric = function renderTwoTextsGeneric(root, ctx){
    const instanceId = getInstanceId(root);
    const title = (ctx?.moduleJson?.settings?.title) || (ctx?.moduleJson?.name) || 'Two Texts';

    const els = renderUI(root, title);

    // initial load
    let doc = loadDoc();
    els.shared.value = doc.general?.sharedText ?? '';
    els.local.value  = doc.instances?.[instanceId]?.localText ?? '';

    // debounced writers
    const writeShared = debounce(200, () => {
      doc = loadDoc();                       // re-read to merge external changes
      (doc.general ||= {}).sharedText = els.shared.value;
      saveDoc(doc);
      broadcast('shared', { key: 'sharedText', value: els.shared.value });
    });

    const writeLocal = debounce(200, () => {
      doc = loadDoc();
      (doc.instances ||= {});
      (doc.instances[instanceId] ||= { data:{} }).localText = els.local.value;
      saveDoc(doc);
    });

    // events
    function onSharedInput(){ writeShared(); }
    function onLocalInput(){  writeLocal();  }

    els.shared.addEventListener('input', onSharedInput);
    els.local .addEventListener('input',  onLocalInput);

    // same-tab live updates for sharedText
    function onSameTab(ev){
      if (ev?.detail?.type !== 'shared') return;
      const v = ev.detail.value ?? '';
      if (document.activeElement !== els.shared) els.shared.value = v;
    }
    window.addEventListener('module-data:update', onSameTab);

    // cross-tab/window updates via StorageEvent (fires in OTHER tabs)
    function onStorage(ev){
      if (ev.key !== LS_KEY) return;
      const latest = loadDoc();
      if (document.activeElement !== els.shared) els.shared.value = latest.general?.sharedText ?? '';
      // localText is per instance; only update if our ID exists
      const my = latest.instances?.[instanceId]?.localText;
      if (typeof my === 'string' && document.activeElement !== els.local) els.local.value = my;
    }
    window.addEventListener('storage', onStorage);

    // cleanup when removed
    const mo = new MutationObserver(() => {
      if (!document.body.contains(root)) {
        els.shared.removeEventListener('input', onSharedInput);
        els.local .removeEventListener('input', onLocalInput);
        window.removeEventListener('module-data:update', onSameTab);
        window.removeEventListener('storage', onStorage);
        mo.disconnect();
      }
    });
    mo.observe(document.body, { childList:true, subtree:true });

    // expose for debugging
    root.__twoTextsGeneric = { LS_KEY, instanceId };
  };
})();
