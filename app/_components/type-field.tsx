"use client";

import { useEffect, useRef } from "react";

const GLYPHS = ["A", "a", "e", "g", "R", "&", "¶", "§", "*", "fi", "ç", "À"];
const INK = "26,26,46";      // brand-primary rgb
const GOLD = "201,168,76";   // brand-gold rgb
const CMYK = ["0,159,227", "230,0,126", "255,213,0", "26,26,46"];

type P = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ox: number;
  oy: number;
  rot: number;
  vr: number;
  kind: "glyph" | "crop" | "cmyk";
  glyph?: string;
  size: number;
  color: string;
  alpha: number;
};

export default function TypeField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let raf = 0;
    let running = true;
    const mouse = { x: -9999, y: -9999 };
    let parts: P[] = [];

    const seed = () => {
      w = canvas.offsetWidth;
      h = canvas.offsetHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.max(90, Math.min(220, Math.round((w * h) / 9000)));
      parts = Array.from({ length: n }, () => {
        const r = Math.random();
        const kind: P["kind"] = r < 0.7 ? "glyph" : r < 0.85 ? "crop" : "cmyk";
        const gold = Math.random() < 0.18;
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.16,
          vy: (Math.random() - 0.5) * 0.16,
          ox: 0,
          oy: 0,
          rot: Math.random() * Math.PI * 2,
          vr: (Math.random() - 0.5) * 0.004,
          kind,
          glyph: GLYPHS[(Math.random() * GLYPHS.length) | 0],
          size: kind === "cmyk" ? 3 + Math.random() * 2 : 10 + Math.random() * 14,
          color: kind === "cmyk" ? CMYK[(Math.random() * 4) | 0] : gold ? GOLD : INK,
          alpha: kind === "cmyk" ? 0.3 : 0.08 + Math.random() * 0.14,
        };
      });
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        if (!reduced) {
          p.x += p.vx;
          p.y += p.vy;
          p.rot += p.vr;
          if (p.x < -30) p.x = w + 30;
          if (p.x > w + 30) p.x = -30;
          if (p.y < -30) p.y = h + 30;
          if (p.y > h + 30) p.y = -30;
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const d = Math.hypot(dx, dy);
          const R = 130;
          let px = 0;
          let py = 0;
          if (d < R && d > 0.01) {
            const f = ((R - d) / R) ** 2 * 42;
            px = (dx / d) * f;
            py = (dy / d) * f;
          }
          p.ox += (px - p.ox) * 0.12;
          p.oy += (py - p.oy) * 0.12;
        }
        ctx.save();
        ctx.translate(p.x + p.ox, p.y + p.oy);
        ctx.rotate(p.rot);
        ctx.globalAlpha = p.alpha;
        if (p.kind === "glyph") {
          ctx.fillStyle = `rgb(${p.color})`;
          ctx.font = `${p.size}px var(--font-fraunces), Georgia, serif`;
          ctx.fillText(p.glyph!, 0, 0);
        } else if (p.kind === "crop") {
          ctx.strokeStyle = `rgb(${p.color})`;
          ctx.lineWidth = 1;
          const s = p.size * 0.5;
          ctx.beginPath();
          ctx.moveTo(-s, 0);
          ctx.lineTo(-s * 0.3, 0);
          ctx.moveTo(0, -s);
          ctx.lineTo(0, -s * 0.3);
          ctx.stroke();
        } else {
          ctx.fillStyle = `rgb(${p.color})`;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        }
        ctx.restore();
      }
      if (running && !reduced) raf = requestAnimationFrame(draw);
    };

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    };
    const onLeaveViewport = () => {
      mouse.x = -9999;
      mouse.y = -9999;
    };
    const onResize = () => {
      seed();
      if (reduced) draw();
    };
    const onVis = () => {
      const wasRunning = running;
      running = !document.hidden;
      if (running && !reduced && !wasRunning) raf = requestAnimationFrame(draw);
      else if (!running) cancelAnimationFrame(raf);
    };

    seed();
    draw();
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onMove);
    document.addEventListener("pointerleave", onLeaveViewport);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      running = false;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeaveViewport);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className ?? ""}`}
    />
  );
}
