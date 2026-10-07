const COLORS = [
  "#c2410c",
  "#facc15",
  "#16a34a",
  "#dc2626",
  "#0ea5e9",
  "#f5f5f4",
];
const DURATION_MS = 2800;

/**
 * Dependency-free confetti burst on a throwaway full-screen canvas. Honors
 * prefers-reduced-motion. Returns a cleanup that stops the animation and
 * removes the canvas, so it is safe to call from a React effect.
 */
export function burstConfetti(): () => void {
  if (
    typeof document === "undefined" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    return () => {};
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:100";
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  const context = canvas.getContext("2d");
  if (!context) return () => {};
  document.body.appendChild(canvas);
  context.scale(dpr, dpr);
  const pieces = Array.from({ length: 140 }, () => ({
    x: window.innerWidth / 2,
    y: window.innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 16,
    vy: -Math.random() * 14 - 4,
    size: 6 + Math.random() * 6,
    spin: Math.random() * Math.PI,
    spinSpeed: (Math.random() - 0.5) * 0.4,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  }));
  const startedAt = performance.now();
  let frame = 0;
  const draw = (now: number) => {
    const age = now - startedAt;
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    context.globalAlpha = Math.max(0, 1 - Math.max(0, age - 1800) / 1000);
    for (const piece of pieces) {
      piece.vy += 0.35;
      piece.vx *= 0.99;
      piece.x += piece.vx;
      piece.y += piece.vy;
      piece.spin += piece.spinSpeed;
      context.save();
      context.translate(piece.x, piece.y);
      context.rotate(piece.spin);
      context.fillStyle = piece.color;
      context.fillRect(
        -piece.size / 2,
        -piece.size / 4,
        piece.size,
        piece.size / 2,
      );
      context.restore();
    }
    if (age < DURATION_MS) frame = requestAnimationFrame(draw);
    else canvas.remove();
  };
  frame = requestAnimationFrame(draw);
  return () => {
    cancelAnimationFrame(frame);
    canvas.remove();
  };
}
