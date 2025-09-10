window.renderPhysicsCircle = function(targetDiv) {
  // Clear GridStack styling and ensure the container fills its cell
  targetDiv.className = '';
  targetDiv.innerHTML = '';
  targetDiv.style.position = 'relative';
  targetDiv.style.overflow = 'hidden';
  targetDiv.style.width = '100%';
  targetDiv.style.height = '100%';
  targetDiv.style.background = 'var(--module-bg, #fff)';
  targetDiv.style.border = '1px solid var(--module-border-color, #e5e7eb)';
  targetDiv.style.borderRadius = 'var(--module-border-radius, 1.25rem)';
  targetDiv.style.boxSizing = 'border-box';

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
  ball.style.background = 'var(--text-color, #111827)';
  ball.style.border = '1px solid var(--module-border-color, #e5e7eb)';
  ball.style.boxSizing = 'border-box';
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
