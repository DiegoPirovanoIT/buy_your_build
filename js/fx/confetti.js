// Simple confetti on a full-screen canvas. Skipped with prefers-reduced-motion.
import { prefersReducedMotion } from './countUp.js';

const COLORS = ['#ff7a3d', '#3dc5ff', '#ffcf4a', '#3ddc84', '#b388ff', '#ff5a6a'];

/**
 * launchConfetti({ duration = 3500, count = 140 }) -> stop()
 * Appends a canvas to <body>; it removes itself when finished or when stop() is called.
 */
export function launchConfetti({ duration = 3500, count = 140 } = {}) {
  if (prefersReducedMotion() || typeof document === 'undefined') return () => {};
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);
  const g = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  const pieces = Array.from({ length: count }, () => ({
    x: Math.random() * canvas.width,
    y: -Math.random() * canvas.height * 0.5,
    size: (6 + Math.random() * 8) * dpr,
    vx: (Math.random() - 0.5) * 4 * dpr,
    vy: (2 + Math.random() * 4) * dpr,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  }));
  let frame = 0;
  let stopped = false;
  const start = performance.now();
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    canvas.remove();
  };
  const tick = (now) => {
    if (stopped) return;
    if (now - start > duration) { stop(); return; }
    g.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of pieces) {
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.fillStyle = p.color;
      g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      g.restore();
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return stop;
}
