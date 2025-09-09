window.renderWorkorderEditable = function(targetDiv, opts) {
  // Felder (du kannst sie beliebig erweitern)
  const fields = [
    { key: "workorder", label: "Workorder", value: "" },
    { key: "reason", label: "Reason for Removal", value: "" },
    { key: "notification", label: "Notification", value: "" },
    { key: "status", label: "Status", value: "" },
    { key: "pn", label: "P/N", value: "" },
    { key: "sn", label: "S/N", value: "" },
    { key: "comments", label: "Comments", value: "" },
    { key: "repairorder", label: "Repair order", value: "" }
  ];

  function render() {
    let html = `<button id="import-csv" class="bg-blue-500 text-white px-3 py-1 rounded mb-3">Daten aus CSV importieren</button><div class="flex flex-col gap-3">`;
    for (let f of fields) {
      html += `
        <div>
          <span class="font-semibold">${f.label}: </span>
          <span class="inline-block bg-white/10 rounded px-2 py-1 cursor-pointer hover:bg-blue-600 transition"
                data-key="${f.key}" tabindex="0">${f.value ? escapeHtml(f.value) : '<span class="text-gray-300">Klicken zum Bearbeiten</span>'}</span>
        </div>
      `;
    }
    html += '</div>';
    targetDiv.innerHTML = html;

    for (let el of targetDiv.querySelectorAll('span[data-key]')) {
      el.onclick = function() { toInputField(this); };
      el.onkeydown = function(e) { if (e.key === 'Enter') toInputField(this); };
    }

    setTimeout(() => {
      const btn = targetDiv.querySelector('#import-csv');
      if (btn) btn.onclick = importCSV;
    }, 5);
  }

  async function importCSV() {
    // Datei auswählen (CSV oder TXT)
    const [fileHandle] = await window.showOpenFilePicker({
      types: [{ description: 'CSV', accept: { 'text/csv': ['.csv', '.txt'] } }]
    });
    const file = await fileHandle.getFile();
    const text = await file.text();

    // Trennzeichen automatisch erkennen
    const delim = text.includes(";") ? ";" : (text.includes("\t") ? "\t" : ",");
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return alert("Keine Daten gefunden!");
    const header = lines[0].split(delim).map(h => h.trim().replace(/^"|"$/g, ''));

    // Parse alle Zeilen zu Objekten
    const rows = lines.slice(1).map(line => {
      const cells = line.split(delim).map(c => c.trim().replace(/^"|"$/g, ''));
      const obj = {};
      header.forEach((h, i) => obj[h] = cells[i] || "");
      return obj;
    });

    // Felder für die Suche
    const notification = fields.find(f=>f.key==="notification").value.trim();
    const workorder = fields.find(f=>f.key==="workorder").value.trim();
    if (!notification && !workorder) {
      alert("Bitte zuerst Workorder oder Notification eingeben/scannen!");
      return;
    }

    // Helper für Key-Mapping (case-insensitive)
    function getValue(row, name) {
      name = name.toLowerCase().trim();
      for (let k in row) {
        if (k && k.toLowerCase().trim() === name) return row[k];
      }
      return "";
    }

    // Suche nach Notification oder Workorder
    let row = rows.find(r =>
      (notification && String(getValue(r, "MELDUNGS_NO")) === notification) ||
      (workorder && String(getValue(r, "AUFTRAGS_NO")) === workorder)
    );
    if (!row) return alert("Kein passender Datensatz gefunden!");

    // Felder ausfüllen
    fields.find(f=>f.key==="workorder").value    = getValue(row, "AUFTRAGS_NO");
    fields.find(f=>f.key==="notification").value = getValue(row, "MELDUNGS_NO");
    fields.find(f=>f.key==="status").value       = getValue(row, "AUFTRAGSSTATUS");
    fields.find(f=>f.key==="sn").value           = getValue(row, "SERIAL_NO");
    fields.find(f=>f.key==="pn").value           = getValue(row, "PART_NO");
    fields.find(f=>f.key==="repairorder").value  = getValue(row, "REPAIR_ORDER");

    render();
  }

  function toInputField(span) {
    const key = span.getAttribute('data-key');
    const f = fields.find(f => f.key === key);
    const multiline = (key === 'reason' || key === 'comments');
    const input = multiline
      ? document.createElement('textarea')
      : document.createElement('input');
    input.value = f.value;
    input.className = "bg-white text-black rounded px-2 py-1 w-full";
    input.style.minWidth = "140px";
    input.onblur = save;
    input.onkeydown = function(e) {
      if (!multiline && e.key === 'Enter') { save(); }
      if (e.key === 'Escape') render();
    };
    span.replaceWith(input);
    input.focus();
    function save() {
      f.value = input.value;
      render();
    }
  }

  function escapeHtml(str) {
    return String(str).replace(/[<>&"']/g, c => ({
      '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'
    })[c]);
  }

  render();
};
