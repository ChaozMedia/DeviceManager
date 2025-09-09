window.renderSampleModule = function(targetDiv, opts) {
  // Remove all classes from the container so that no default GridStack styles remain.
  targetDiv.className = '';
  
  // Now override the container's styling.
  targetDiv.style.background = '#e0f7ff';  // light blue faded background
  targetDiv.style.color = '#005983';
  targetDiv.style.borderRadius = '0';      // no rounded corners
  targetDiv.style.padding = '1rem';

  // Set the module content.
  targetDiv.innerHTML = `
    <h3>Sample Module</h3>
    <p>This module now controls its own container appearance completely.</p>
  `;
};