window.renderPhysicsCircle = function(targetDiv) {
  // Clear GridStack styling and set up container
  targetDiv.className = '';
  targetDiv.style.position = 'relative';
  targetDiv.style.overflow = 'hidden';
  targetDiv.style.background = '#f9f9f9';

  const radius = 20;
  let x = radius;
  let y = radius;
  let vx = 0;
  let vy = 0;
  const damping = 0.98;

  const ball = document.createElement('div');
  ball.style.position = 'absolute';
  ball.style.width = ball.style.height = radius * 2 + 'px';
  ball.style.borderRadius = '50%';
  ball.style.background = '#3498db';
  targetDiv.appendChild(ball);

  let lastRect = targetDiv.getBoundingClientRect();

  function loop() {
    const rect = targetDiv.getBoundingClientRect();
    const dx = rect.left - lastRect.left;
    const dy = rect.top - lastRect.top;
    lastRect = rect;

    vx -= dx;
    vy -= dy;

    x += vx;
    y += vy;

    vx *= damping;
    vy *= damping;

    const width = targetDiv.clientWidth;
    const height = targetDiv.clientHeight;

    if (x < radius) { x = radius; vx = Math.abs(vx) * damping; }
    if (x > width - radius) { x = width - radius; vx = -Math.abs(vx) * damping; }
    if (y < radius) { y = radius; vy = Math.abs(vy) * damping; }
    if (y > height - radius) { y = height - radius; vy = -Math.abs(vy) * damping; }

    ball.style.transform = `translate(${x - radius}px, ${y - radius}px)`;

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
};
