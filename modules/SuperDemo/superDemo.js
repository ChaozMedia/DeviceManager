/* global GridStack, $ */
(function () {
  function uid() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function nowISO() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return (
      d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
    );
  }

  function toCSV(rows) {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    return rows.map(r => r.map(esc).join(';')).join('\n');
  }

  function saveFile(name, text, type = 'text/plain') {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function setStyleVars(el, vars) {
    Object.entries(vars).forEach(([k, v]) => el.style.setProperty(k, v));
  }

  window.renderSuperDemo = function renderSuperDemo(root, ctx) {
    // Unique per-instance key so multiple instances don't clash
    const instanceId = uid();
    root.dataset.instanceId = instanceId;

    // State (hydrate from JSON defaults, then localStorage if present)
    const defaults = {
      title: (ctx.moduleJson.settings && ctx.moduleJson.settings.title) || 'Super Demo',
      color: (ctx.moduleJson.settings && ctx.moduleJson.settings.defaultColor) || '#22c55e',
      intervalMs: (ctx.moduleJson.settings && ctx.moduleJson.settings.intervalMs) || 500,
      count: 3,
      mode: 'sine',
      autoUpdate: true,
      notes: '',
      todos: [],
      data: []
    };

    const storageKey = `modules:${ctx.subdir}:${instanceId}`;
    const loadState = () => {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
        return saved ? { ...defaults, ...saved } : { ...defaults };
      } catch {
        return { ...defaults };
      }
    };
    const saveState = () => {
      try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch {}
    };

    const state = loadState();

    // Build UI
    root.innerHTML = `
      <div class="space-y-3 text-sm">
        <!-- Controls row -->
        <div class="flex flex-wrap items-center gap-2">
          <button data-act="start" class="px-2 py-1 rounded bg-green-600 hover:bg-green-700 text-white">▶️ Start</button>
          <button data-act="stop" class="px-2 py-1 rounded bg-yellow-600 hover:bg-yellow-700 text-white">⏸ Stop</button>
          <button data-act="reset" class="px-2 py-1 rounded bg-gray-600 hover:bg-gray-700 text-white">⟳ Reset</button>
          <div class="h-6 w-px bg-white/30 mx-1"></div>
          <button data-act="expand" class="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white">⬌ Expand</button>
          <button data-act="default" class="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white">⬍ Default</button>
          <div class="h-6 w-px bg-white/30 mx-1"></div>
          <button data-act="exportCsv" class="px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white">📄 CSV</button>
          <button data-act="copyJson" class="px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white">📋 Copy</button>
          <button data-act="savePng" class="px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white">🖼️ PNG</button>
          <div class="h-6 w-px bg-white/30 mx-1"></div>
          <label class="flex items-center gap-2">
            <span>Interval</span>
            <input id="sd-interval" type="range" min="100" max="2000" step="50" class="accent-current">
            <span id="sd-interval-val" class="tabular-nums"></span>ms
          </label>
          <label class="flex items-center gap-2">
            <span>Accent</span>
            <input id="sd-color" type="color" class="w-8 h-8 p-0 border rounded bg-white" />
          </label>
        </div>

        <!-- Internal tabs -->
        <div class="flex gap-2 text-xs">
          <button data-tab="overview" class="sd-tab px-2 py-1 rounded bg-black/20">Overview</button>
          <button data-tab="controls" class="sd-tab px-2 py-1 rounded bg-black/10 hover:bg-black/20">Controls</button>
          <button data-tab="chart"    class="sd-tab px-2 py-1 rounded bg-black/10 hover:bg-black/20">Chart</button>
        </div>

        <!-- Panels -->
        <div id="sd-panel-overview" class="sd-panel grid grid-cols-2 gap-3">
          <div class="col-span-2 md:col-span-1 space-y-2">
            <div><span class="opacity-80">Module:</span> <b>${ctx.moduleJson.name || ctx.subdir}</b></div>
            <div><span class="opacity-80">Subdir:</span> <code class="text-xs bg-black/20 rounded px-1">${ctx.subdir}</code></div>
            <div><span class="opacity-80">Instance:</span> <code class="text-xs bg-black/20 rounded px-1">${instanceId}</code></div>
            <div><span class="opacity-80">Attachments:</span> ${ctx.attachments.length ? ctx.attachments.map(a => `<code class="text-xs bg-black/20 rounded px-1">${a}</code>`).join(' ') : '<i>none</i>'}</div>
            <div><span class="opacity-80">Grid size:</span> <span id="sd-size">?</span></div>
            <div><span class="opacity-80">Now:</span> <span id="sd-clock" class="tabular-nums"></span></div>
            <button data-act="notify" class="px-2 py-1 rounded bg-purple-600 hover:bg-purple-700 text-white">🔔 Notify in 5s</button>
          </div>
          <div class="col-span-2 md:col-span-1 space-y-2">
            <div><span class="opacity-80">Theme vars in action:</span></div>
            <div class="rounded p-3" style="background: var(--top-bar-bg); color: var(--text-color)">top-bar sample</div>
            <div class="rounded p-3" style="background: var(--sidebar-bg); color: var(--text-color)">sidebar sample</div>
            <div class="rounded p-3" id="sd-accent-preview">accent sample</div>
          </div>
        </div>

        <div id="sd-panel-controls" class="sd-panel hidden space-y-3">
          <form id="sd-form" class="grid grid-cols-2 gap-3">
            <label class="col-span-2">
              <span class="font-medium">Title</span>
              <input name="title" type="text" class="w-full text-black p-1 rounded"/>
            </label>
            <label>
              <span class="font-medium">Count</span>
              <input name="count" type="number" min="0" step="1" class="w-full text-black p-1 rounded"/>
            </label>
            <label>
              <span class="font-medium">Mode</span>
              <select name="mode" class="w-full text-black p-1 rounded">
                <option value="sine">sine</option>
                <option value="noise">noise</option>
                <option value="mix">mix</option>
              </select>
            </label>
            <label class="col-span-2 flex items-center gap-2">
              <input name="autoUpdate" type="checkbox" class="text-black"/>
              <span>Auto update</span>
            </label>
            <label class="col-span-2">
              <span class="font-medium">Notes</span>
              <textarea name="notes" rows="3" class="w-full text-black p-1 rounded"></textarea>
            </label>

            <label class="col-span-2">
              <span class="font-medium">Pick a date (jQuery UI)</span>
              <input id="sd-datepicker" type="text" class="w-full text-black p-1 rounded" placeholder="click to open datepicker"/>
            </label>
          </form>

          <div class="space-y-2">
            <div class="font-medium">Todos</div>
            <div class="flex gap-2">
              <input id="sd-todo-input" type="text" placeholder="New todo…" class="flex-1 text-black p-1 rounded"/>
              <button data-act="addTodo" class="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white">Add</button>
            </div>
            <ul id="sd-todos" class="list-disc pl-5 space-y-1"></ul>
          </div>
        </div>

        <div id="sd-panel-chart" class="sd-panel hidden space-y-2">
          <canvas id="sd-canvas" height="220"></canvas>
          <div class="text-xs opacity-80">Resizes with the grid. Uses <code>ResizeObserver</code>.</div>
        </div>
      </div>
    `;

    // Accent color preview uses module bg + chosen accent
    const accentPreview = root.querySelector('#sd-accent-preview');
    const canvas = root.querySelector('#sd-canvas');
    const ctx2d = canvas.getContext('2d');

    // Inputs
    const $datepicker = $('#sd-datepicker'); // jQuery UI datepicker
    $datepicker.datepicker(); // demonstrate jQuery UI integration

    const elInterval = root.querySelector('#sd-interval');
    const elIntervalVal = root.querySelector('#sd-interval-val');
    const elColor = root.querySelector('#sd-color');
    const form = root.querySelector('#sd-form');
    const todosUl = root.querySelector('#sd-todos');
    const todoInput = root.querySelector('#sd-todo-input');
    const sizeEl = root.querySelector('#sd-size');
    const clockEl = root.querySelector('#sd-clock');

    // Hook to grid item & grid instance
    const itemEl = root.closest('.grid-stack-item');
    const node = itemEl && itemEl.gridstackNode;
    const grid = node && node.grid;

    // Apply initial values
    form.title.value = state.title;
    form.count.value = state.count;
    form.mode.value = state.mode;
    form.autoUpdate.checked = !!state.autoUpdate;
    form.notes.value = state.notes;
    elInterval.value = String(state.intervalMs);
    elIntervalVal.textContent = state.intervalMs;
    elColor.value = state.color;
    setStyleVars(accentPreview, { '--accent': state.color, background: 'var(--module-bg)' });

    // Render todos list
    function renderTodos() {
      todosUl.innerHTML = '';
      state.todos.forEach((t, i) => {
        const li = document.createElement('li');
        li.className = 'flex items-center gap-2';
        li.innerHTML = `<span class="flex-1">${t}</span>
          <button data-i="${i}" class="sd-del px-1 rounded bg-red-600 hover:bg-red-700 text-white text-xs">✖</button>`;
        todosUl.appendChild(li);
      });
      todosUl.querySelectorAll('.sd-del').forEach(btn => {
        btn.onclick = () => {
          const i = Number(btn.dataset.i);
          state.todos.splice(i, 1);
          saveState(); renderTodos();
        };
      });
    }
    renderTodos();

    // Internal tabs
    function showTab(name) {
      root.querySelectorAll('.sd-panel').forEach(p => p.classList.add('hidden'));
      root.querySelector(`#sd-panel-${name}`).classList.remove('hidden');
      root.querySelectorAll('.sd-tab').forEach(b => b.classList.remove('bg-black/20'));
      root.querySelector(`.sd-tab[data-tab="${name}"]`).classList.add('bg-black/20');
    }
    showTab('overview');
    root.querySelectorAll('.sd-tab').forEach(btn => {
      btn.onclick = () => showTab(btn.dataset.tab);
    });

    // Form change handling
    form.addEventListener('input', () => {
      state.title = form.title.value;
      state.count = Number(form.count.value || 0);
      state.mode = form.mode.value;
      state.autoUpdate = !!form.autoUpdate.checked;
      state.notes = form.notes.value;
      saveState();
    });

    // Controls actions
    root.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      const act = a.dataset.act;
      if (act === 'start') start();
      else if (act === 'stop') stop();
      else if (act === 'reset') { state.data = []; draw(); saveState(); }
      else if (act === 'expand') {
        if (grid && itemEl) grid.resize(itemEl, 12, Math.max(node.h, 6));
      }
      else if (act === 'default') {
        if (grid && itemEl) grid.resize(itemEl, Math.max(6, node.minW || 6), Math.max(3, node.minH || 3));
      }
      else if (act === 'exportCsv') {
        const rows = [
          ['title', state.title],
          ['count', state.count],
          ['mode', state.mode],
          ['notes', state.notes],
          ['todos', state.todos.join(' | ')]
        ];
        saveFile(`${ctx.subdir}-state.csv`, toCSV(rows), 'text/csv');
      }
      else if (act === 'copyJson') {
        navigator.clipboard?.writeText(JSON.stringify(state, null, 2));
      }
      else if (act === 'savePng') {
        // Only works on Chart tab; still fine if hidden
        const png = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = png; a.download = `${ctx.subdir}-chart.png`; a.click();
      }
      else if (act === 'addTodo') {
        const v = (todoInput.value || '').trim();
        if (!v) return;
        state.todos.push(v); todoInput.value = '';
        saveState(); renderTodos();
      }
      else if (act === 'notify') {
        const doNotify = () => setTimeout(() => {
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Super Demo', { body: 'Timer done ✅' });
          } else {
            alert('Timer done ✅');
          }
        }, 5000);
        if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission().then(doNotify);
        } else {
          doNotify();
        }
      }
    });

    // Interval + color
    elInterval.addEventListener('input', () => {
      state.intervalMs = Number(elInterval.value);
      elIntervalVal.textContent = state.intervalMs;
      saveState();
      if (running) { stop(); start(); }
    });
    elColor.addEventListener('input', () => {
      state.color = elColor.value;
      saveState();
      draw(); // update chart stroke color
      setStyleVars(accentPreview, { '--accent': state.color, background: 'var(--module-bg)' });
    });

    // Live clock
    let clockTimer = setInterval(() => { clockEl.textContent = nowISO(); }, 1000);

    // Report grid size + observe item resize
    function updateSizeLabel() {
      if (node) sizeEl.textContent = `${node.w} × ${node.h} cells`;
      else sizeEl.textContent = 'n/a';
    }
    updateSizeLabel();

    // Draw chart
    function draw() {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(100, Math.floor(rect.width * dpr));
      canvas.height = Math.max(100, Math.floor(canvas.height * dpr));
      ctx2d.scale(dpr, dpr);

      // background uses module bg & text vars
      ctx2d.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--module-bg') || '#005983';
      ctx2d.fillRect(0, 0, rect.width, canvas.height / dpr);

      // grid lines
      ctx2d.globalAlpha = 0.25;
      ctx2d.strokeStyle = '#ffffff';
      for (let x = 0; x < rect.width; x += 40) {
        ctx2d.beginPath(); ctx2d.moveTo(x, 0); ctx2d.lineTo(x, canvas.height / dpr); ctx2d.stroke();
      }
      for (let y = 0; y < canvas.height / dpr; y += 40) {
        ctx2d.beginPath(); ctx2d.moveTo(0, y); ctx2d.lineTo(rect.width, y); ctx2d.stroke();
      }
      ctx2d.globalAlpha = 1;

      // stroke color from accent
      ctx2d.strokeStyle = state.color;
      ctx2d.lineWidth = 2;

      const N = Math.max(50, Math.floor(rect.width / 6));
      while (state.data.length < N) state.data.push(0);
      if (state.data.length > N) state.data = state.data.slice(-N);

      // path
      ctx2d.beginPath();
      for (let i = 0; i < state.data.length; i++) {
        const x = (i / (N - 1)) * rect.width;
        const y = (0.5 - state.data[i] * 0.45) * (canvas.height / dpr);
        if (i === 0) ctx2d.moveTo(x, y); else ctx2d.lineTo(x, y);
      }
      ctx2d.stroke();

      // title
      ctx2d.fillStyle = '#fff';
      ctx2d.font = '12px ui-sans-serif, system-ui, sans-serif';
      ctx2d.fillText(`${state.title} — ${state.mode} — ${state.count}`, 8, 16);
    }

    // Update data
    let tickTimer = null;
    let t = 0;
    let running = false;

    function tick() {
      const rect = canvas.getBoundingClientRect();
      const N = Math.max(50, Math.floor(rect.width / 6));
      const next = (() => {
        if (state.mode === 'noise') return Math.random() * 2 - 1;
        if (state.mode === 'mix') return Math.sin(t / 10) * 0.7 + (Math.random() * 0.6 - 0.3);
        return Math.sin(t / 10);
      })();
      state.data.push(next);
      if (state.data.length > N) state.data.shift();
      t += 1;
      draw();
    }

    function start() {
      if (running) return;
      running = true;
      tick(); // immediate
      tickTimer = setInterval(tick, state.intervalMs);
    }

    function stop() {
      running = false;
      clearInterval(tickTimer);
      tickTimer = null;
    }

    // Start automatically if requested
    if (state.autoUpdate) start();

    // Resize handling: canvas & size label
    const ro = new ResizeObserver(() => { updateSizeLabel(); draw(); });
    ro.observe(itemEl || root);
    window.addEventListener('resize', draw, { passive: true });

    // Clean up if the widget DOM is removed
    const mo = new MutationObserver(() => {
      if (!document.body.contains(root)) {
        try {
          stop();
          clearInterval(clockTimer);
          ro.disconnect(); mo.disconnect();
        } catch {}
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // Nice: expose a tiny API for debugging in console
    root.__demo = { state, start, stop, draw, save: saveState };
  };
})();
