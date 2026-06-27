// ═══════════════════════════════════════════════
// animations.js — Paper-mâché throw & effects
// ═══════════════════════════════════════════════

export function animateThrow(fromEl, toEl, onComplete) {
    const layer = document.getElementById('throw-layer');
    if (!layer || !fromEl || !toEl) return;

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();

    const startX = fromRect.left + fromRect.width / 2;
    const startY = fromRect.top + fromRect.height / 2;
    const endX = toRect.left + toRect.width / 2;
    const endY = toRect.top + toRect.height / 2;

    const ball = document.createElement('div');
    ball.className = 'paper-ball';
    ball.textContent = '📄';
    layer.appendChild(ball);

    // Calculate arc control point (higher arc for longer distances)
    const dx = endX - startX;
    const dy = endY - startY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const arcHeight = Math.min(dist * 0.5, 200);
    const midX = (startX + endX) / 2;
    const midY = Math.min(startY, endY) - arcHeight;

    // Animate using requestAnimationFrame for smooth arc
    const duration = 500;
    const startTime = performance.now();

    function animate(time) {
        const elapsed = time - startTime;
        const t = Math.min(elapsed / duration, 1);

        // Quadratic bezier
        const u = 1 - t;
        const x = u * u * startX + 2 * u * t * midX + t * t * endX;
        const y = u * u * startY + 2 * u * t * midY + t * t * endY;

        // Rotation
        const rotation = t * 720;
        // Scale: ramp up then down
        const scale = 0.5 + Math.sin(t * Math.PI) * 0.5 + 0.5;

        ball.style.left = `${x - 14}px`;
        ball.style.top = `${y - 14}px`;
        ball.style.transform = `rotate(${rotation}deg) scale(${scale})`;
        ball.style.opacity = t < 0.1 ? t * 10 : t > 0.85 ? (1 - t) / 0.15 : 1;

        if (t < 1) {
            requestAnimationFrame(animate);
        } else {
            ball.remove();
            onComplete?.();
        }
    }

    requestAnimationFrame(animate);
}

export function shakeElement(el) {
    if (!el) return;
    const parent = el.closest('.participant');
    if (parent) {
        parent.classList.add('hit');
        setTimeout(() => parent.classList.remove('hit'), 600);
    }
}
