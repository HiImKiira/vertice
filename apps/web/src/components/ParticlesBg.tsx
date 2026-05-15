"use client";

import { useEffect, useRef } from "react";

/**
 * Background animado de partículas Vortex. Canvas ligero (~120 partículas)
 * con líneas entre vecinas cercanas. Se respeta prefers-reduced-motion.
 * Colores azul Vortex con cyan suave.
 */
export function ParticlesBg() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      const c = canvas;
      if (!c) return;
      w = window.innerWidth;
      h = window.innerHeight;
      c.width = w * dpr;
      c.height = h * dpr;
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      ctx!.scale(dpr, dpr);
    }
    resize();
    window.addEventListener("resize", () => {
      ctx!.setTransform(1, 0, 0, 1, 0, 0);
      resize();
    });

    const count = Math.min(140, Math.floor((w * h) / 12000));
    interface P { x: number; y: number; vx: number; vy: number; r: number; hue: number }
    const ps: P[] = [];
    for (let i = 0; i < count; i++) {
      ps.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r: Math.random() * 1.6 + 0.6,
        hue: 200 + Math.random() * 40, // 200-240 → cyan→blue
      });
    }

    const linkDist = 110;

    function tick() {
      ctx!.clearRect(0, 0, w, h);

      // dots
      for (const p of ps) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fillStyle = `hsla(${p.hue}, 85%, 65%, 0.55)`;
        ctx!.fill();
      }

      // lines between close particles
      for (let i = 0; i < ps.length; i++) {
        const a = ps[i]!;
        for (let j = i + 1; j < ps.length; j++) {
          const b = ps[j]!;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < linkDist * linkDist) {
            const alpha = (1 - Math.sqrt(d2) / linkDist) * 0.18;
            ctx!.beginPath();
            ctx!.strokeStyle = `rgba(96, 165, 250, ${alpha})`;
            ctx!.lineWidth = 0.6;
            ctx!.moveTo(a.x, a.y);
            ctx!.lineTo(b.x, b.y);
            ctx!.stroke();
          }
        }
      }

      raf = requestAnimationFrame(tick);
    }
    tick();

    return () => {
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 opacity-70"
      style={{ mixBlendMode: "screen" }}
    />
  );
}
