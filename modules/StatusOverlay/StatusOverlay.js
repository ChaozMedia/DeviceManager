window.renderStatusOverlay = function(targetDiv, opts) {
  // clear default classes and styling
  targetDiv.className = '';
  targetDiv.style.position = 'relative';
  targetDiv.style.overflow = 'hidden';
  targetDiv.style.background = '#000';
  targetDiv.style.padding = '0';
  targetDiv.style.margin = '0';

  const canvas = document.createElement('canvas');
  canvas.style.position = 'absolute';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  targetDiv.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let logoWidth = 0;
  let logoHeight = 0;

  function resize() {
    canvas.width = targetDiv.clientWidth;
    canvas.height = targetDiv.clientHeight;
    ctx.font = 'bold 30px sans-serif';
    ctx.textBaseline = 'top';
    const metrics = ctx.measureText('DVD');
    logoWidth = metrics.width;
    logoHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
  }
  resize();
  window.addEventListener('resize', resize);

  let x = (canvas.width - logoWidth) / 2;
  let y = (canvas.height - logoHeight) / 2;
  let dx = 2;
  let dy = 2;
  const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
  let colorIndex = 0;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = colors[colorIndex];
    ctx.font = 'bold 30px sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('DVD', x, y);

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
