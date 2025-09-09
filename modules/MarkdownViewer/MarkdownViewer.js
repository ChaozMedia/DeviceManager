window.renderMarkdownViewer = function(targetDiv, opts) {
  targetDiv.innerHTML = `
    <button id="openMd" class="bg-blue-600 text-white px-3 py-1 rounded mb-3">Markdown-Datei öffnen</button>
    <div id="mdContent" class="bg-gray-800 rounded p-3 mt-2"></div>
  `;
  document.getElementById('openMd').onclick = async function() {
    const [fileHandle] = await window.showOpenFilePicker({types:[{description:'Markdown', accept:{'text/markdown':['.md']}}]});
    const file = await fileHandle.getFile();
    const text = await file.text();
    document.getElementById('mdContent').innerHTML = text.replace(/</g,'&lt;').replace(/\\n/g,"<br>");
    // Optional: Mit externem Markdown-Parser noch schicker machen!
  }
}
