window.renderStatusOverlay = function(targetDiv, opts) {
  // clear default classes and styling
  targetDiv.className = '';
  targetDiv.style.position = 'relative';
  targetDiv.style.overflow = 'hidden';
  targetDiv.style.background = '#000';

  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  targetDiv.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = targetDiv.clientWidth;
    canvas.height = targetDiv.clientHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  let x = canvas.width / 4;
  let y = canvas.height / 4;
  let dx = 2;
  let dy = 2;
  const logoWidth = 80;
  const logoHeight = 40;
  const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
  let colorIndex = 0;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = colors[colorIndex];
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText('DVD', x, y + 30); // text baseline at bottom

    x += dx;
    y += dy;

    let hitEdge = false;
    if (x <= 0 || x + logoWidth >= canvas.width) {
      dx = -dx + (Math.random() - 0.5);
      hitEdge = true;
    }
    if (y <= 0 || y + logoHeight >= canvas.height) {
      dy = -dy + (Math.random() - 0.5);
      hitEdge = true;
    }
    if (hitEdge) {
      colorIndex = (colorIndex + 1) % colors.length;
    }

    requestAnimationFrame(draw);
  }
  draw();
};
