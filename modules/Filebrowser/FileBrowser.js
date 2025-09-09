window.renderFileBrowser = function(targetDiv, opts) {
  targetDiv.innerHTML = `<button id="open">Ordner wählen</button><div id="listing"></div>`;
  document.getElementById('open').onclick = async function() {
    let dir = await window.showDirectoryPicker();
    let listDiv = document.getElementById('listing');
    listDiv.innerHTML = '';
    for await (const e of dir.values()) {
      listDiv.innerHTML += `<div>${e.kind==='directory'?'📁':'📄'} ${e.name}</div>`;
    }
  }
}
