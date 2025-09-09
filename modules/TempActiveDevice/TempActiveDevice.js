/* Global Inputs (Meldung, AUN, PartNo) — single-key localStorage sync */
(function () {
  const LS_KEY = 'module_data_v1';   // one document for all modules
  const FIELDS = ['Meldung', 'AUN', 'PartNo'];

  // ---- storage helpers ----
  const parse = (s, fb) => { try { return JSON.parse(s) ?? fb; } catch { return fb; } };
  const loadDoc = () => parse(localStorage.getItem(LS_KEY), { __meta:{v:1}, general:{}, instances:{} });
  const saveDoc = (doc) => {
    doc.__meta = { v: 1, updatedAt: new Date().toISOString() };
    try { localStorage.setItem(LS_KEY, JSON.stringify(doc)); }
    catch (e) { console.warn('localStorage save failed (quota?)', e); }
  };
  const debounce = (ms, fn) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };
  const broadcast = (payload) => window.dispatchEvent(new CustomEvent('module-data:update', { detail: payload }));

  function ui(root, title){
    const rows = FIELDS.map(k => `
      <label class="block text-sm">
        <span class="opacity-90">${k}</span>
        <input data-key="${k}" class="gi-input w-full text-black p-1 rounded" placeholder="${k}…" />
      </label>`).join('');
    root.innerHTML = `
      <div class="space-y-2">
        <div class="text-white/90 font-semibold">${title}</div>
        <div class="space-y-2">${rows}</div>
        <div class="text-xs opacity-80 gi-status"></div>
      </div>`;
    return {
      inputs: Array.from(root.querySelectorAll('.gi-input')),
      status: root.querySelector('.gi-status')
    };
  }
  const setStatus = (els, msg) => { if (els.status) els.status.textContent = msg || ''; };

  window.renderGlobalInputs = function renderGlobalInputs(root, ctx){
    const title = (ctx?.moduleJson?.settings?.title) || (ctx?.moduleJson?.name) || 'Global Inputs';
    const els = ui(root, title);

    // initial load
    let doc = loadDoc();
    FIELDS.forEach(k => {
      els.inputs.find(i => i.dataset.key === k).value = doc.general?.[k] ?? '';
    });

    // writer (debounced)
    const write = debounce(180, (key, value) => {
      doc = loadDoc();
      (doc.general ||= {})[key] = value;
      saveDoc(doc);
      setStatus(els, 'Saved');
      broadcast({ type:'general', key, value });
    });

    // input handlers
    function onInput(e){
      const key = e.target.dataset.key;
      write(key, e.target.value);
    }
    els.inputs.forEach(inp => inp.addEventListener('input', onInput));

    // same-tab sync
    function onSameTab(ev){
      const d = ev?.detail;
      if (!d || d.type !== 'general') return;
      const inp = els.inputs.find(i => i.dataset.key === d.key);
      if (inp && document.activeElement !== inp) inp.value = d.value ?? '';
    }
    window.addEventListener('module-data:update', onSameTab);

    // cross-tab sync
    function onStorage(ev){
      if (ev.key !== LS_KEY) return;
      const latest = loadDoc();
      FIELDS.forEach(k => {
        const inp = els.inputs.find(i => i.dataset.key === k);
        const v = latest.general?.[k] ?? '';
        if (inp && document.activeElement !== inp) inp.value = v;
      });
    }
    window.addEventListener('storage', onStorage);

    // cleanup when removed from DOM
    const mo = new MutationObserver(() => {
      if (!document.body.contains(root)) {
        els.inputs.forEach(inp => inp.removeEventListener('input', onInput));
        window.removeEventListener('module-data:update', onSameTab);
        window.removeEventListener('storage', onStorage);
        mo.disconnect();
      }
    });
    mo.observe(document.body, { childList:true, subtree:true });

    // expose for debugging
    root.__globalInputs = { LS_KEY };
  };
})();
