window.renderRecentFiles = function(targetDiv, opts) {
  targetDiv.innerHTML = `
    <button id="rf-open">Ordner wählen</button>
    <ul id="rf-list"></ul>
  `;

  document.getElementById('rf-open').addEventListener('click', async () => {
    const root = await window.showDirectoryPicker();
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

    files.sort((a, b) => b.modified - a.modified);
    const latest = files.slice(0, 5);
    const list = document.getElementById('rf-list');
    list.innerHTML = latest.map(f => {
      const date = new Date(f.modified).toLocaleString();
      return `<li>${date} – ${f.part} / ${f.serial} / ${f.name}</li>`;
    }).join('');
  });
};
