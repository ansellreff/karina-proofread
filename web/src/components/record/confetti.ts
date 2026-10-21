/**
 * A short burst of confetti over the page (Proofread record celebrations). One canvas, removed when done; nothing
 * happens for people who turned animation off (prefers-reduced-motion). No library.
 */
export function confetti({ colors, pieces = 140, duration = 2600 }: { colors: string[]; pieces?: number; duration?: number }) {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.dataset.confetti = "";
  Object.assign(canvas.style, { position: "fixed", inset: "0", width: "100vw", height: "100vh", pointerEvents: "none", zIndex: "60" });
  document.body.appendChild(canvas);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = (canvas.width = window.innerWidth * dpr);
  const h = (canvas.height = window.innerHeight * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas.remove();
  // two cannons from the lower corners, aimed up and inwards
  const parts = Array.from({ length: pieces }, (_, i) => {
    const left = i % 2 === 0;
    const angle = (left ? -60 : -120) * (Math.PI / 180) + (Math.random() - 0.5) * 0.7;
    const speed = (14 + Math.random() * 12) * dpr;
    return {
      x: left ? w * 0.08 : w * 0.92,
      y: h * 0.95,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: (5 + Math.random() * 6) * dpr,
      spin: Math.random() * Math.PI,
      vspin: (Math.random() - 0.5) * 0.3,
      color: colors[i % colors.length],
      round: Math.random() < 0.3,
    };
  });
  const start = performance.now();
  const frame = (t: number) => {
    const elapsed = t - start;
    ctx.clearRect(0, 0, w, h);
    const fade = Math.max(0, 1 - Math.max(0, elapsed - duration * 0.6) / (duration * 0.4));
    for (const p of parts) {
      p.vy += 0.42 * dpr; // gravity
      p.vx *= 0.99;
      p.vy *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.spin += p.vspin;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.spin);
      ctx.fillStyle = p.color;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (elapsed < duration) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

/** A CSS variable's colour (confetti is drawn on a canvas, which can't read var()). */
export const cssColor = (name: string) => (typeof window === "undefined" ? "#e2a72e" : getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#e2a72e");
