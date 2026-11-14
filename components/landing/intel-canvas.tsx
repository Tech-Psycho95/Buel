"use client";

import { useEffect, useRef } from "react";

/*
 * Original generative intelligence visualization (canvas 2D, WebGL-inspired).
 *
 * A "judge" core with orbiting agent nodes and evidence particles flowing
 * inward along curved trajectories — the pipeline, rendered as living art.
 * Mouse moves the whole system in parallax and gently repels particles.
 * DPR-aware, pauses when hidden, and renders a single static frame under
 * prefers-reduced-motion. Nothing here represents real market data.
 */

type Particle = {
  a: number; // approach angle
  r: number; // current radius
  speed: number;
  curve: number; // curvature of the inward spiral
  size: number;
  hue: "cyan" | "violet";
  wobble: number;
};

type Agent = {
  name: string;
  color: string;
  radius: number;
  speed: number;
  phase: number;
  size: number;
};

const AGENTS: Agent[] = [
  { name: "BULL", color: "#2fe0a2", radius: 0.52, speed: 0.00021, phase: 0.2, size: 5 },
  { name: "BEAR", color: "#ff6b7d", radius: 0.62, speed: 0.00016, phase: 1.9, size: 4.5 },
  { name: "RISK", color: "#ffc757", radius: 0.42, speed: 0.00026, phase: 3.6, size: 4 },
  { name: "ANALYST", color: "#a78bfa", radius: 0.7, speed: 0.00012, phase: 5.1, size: 5.5 },
];

export function IntelCanvas({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let running = true;
    let width = 0;
    let height = 0;
    let dpr = Math.min(2, window.devicePixelRatio || 1);
    let mouseX = 0.5;
    let mouseY = 0.45;
    let px = 0.5; // smoothed parallax
    let py = 0.45;

    const particles: Particle[] = [];

    function spawnParticle(p?: Particle) {
      const item: Particle =
        p ?? {
          a: Math.random() * Math.PI * 2,
          r: 1.05 + Math.random() * 0.35,
          speed: 0.00006 + Math.random() * 0.00009,
          curve: (Math.random() - 0.5) * 0.0016,
          size: 1 + Math.random() * 2,
          hue: Math.random() > 0.35 ? "cyan" : "violet",
          wobble: Math.random() * Math.PI * 2,
        };
      if (particles.length < 70) particles.push(item);
      return item;
    }

    for (let i = 0; i < 54; i++) {
      const p = spawnParticle();
      p.r = 0.15 + Math.random() * 1.2; // pre-scatter
    }

    function resize() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function drawFrame(t: number, dt: number, animate: boolean) {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2 + (px - 0.5) * 46;
      const cy = height / 2 + (py - 0.45) * 40;
      const base = Math.min(width, height);
      const coreR = base * 0.085;

      // --- ambient field dots (static constellation, faint) ---
      ctx.fillStyle = "rgba(146,178,255,0.07)";
      const cols = 14;
      const rows = Math.ceil(height / (base / cols));
      for (let gx = 0; gx <= cols; gx++) {
        for (let gy = 0; gy <= rows; gy++) {
          const gxPos = (gx / cols) * width;
          const gyPos = gy * (base / cols);
          if (Math.hypot(gxPos - cx, gyPos - cy) > base * 0.95) continue;
          ctx.fillRect(gxPos, gyPos, 1.4, 1.4);
        }
      }

      // --- core: pulsing judge rings ---
      const pulse = animate ? 0.5 + 0.5 * Math.sin(t * 0.0011) : 0.6;
      for (let ring = 0; ring < 3; ring++) {
        const rr = coreR * (1 + ring * 0.55) + pulse * 8;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(63,225,255,${0.28 - ring * 0.08})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.2);
      glow.addColorStop(0, `rgba(63,225,255,${0.3 + pulse * 0.12})`);
      glow.addColorStop(1, "rgba(63,225,255,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(237,241,250,0.9)";
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();

      // --- orbiting agents ---
      for (const agent of AGENTS) {
        const ang = animate ? t * agent.speed * 1000 * 0.02 + agent.phase : agent.phase;
        const r = base * agent.radius;
        const wob = Math.sin(t * 0.0006 + agent.phase * 3) * 12;
        const ax = cx + Math.cos(ang) * (r + wob);
        const ay = cy + Math.sin(ang) * (r + wob) * 0.72; // elliptical

        // orbit path (faint)
        ctx.beginPath();
        ctx.ellipse(cx, cy, r, r * 0.72, 0, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(146,178,255,0.07)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // link to core with a traveling pulse
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(cx, cy);
        ctx.strokeStyle = `${agent.color}22`;
        ctx.lineWidth = 1;
        ctx.stroke();
        const tt = animate ? ((t * 0.00035 + agent.phase) % 1) : 0.5;
        const pxp = ax + (cx - ax) * tt;
        const pyp = ay + (cy - ay) * tt;
        ctx.fillStyle = agent.color;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(pxp, pyp, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // node glow
        const nglow = ctx.createRadialGradient(ax, ay, 0, ax, ay, agent.size * 4);
        nglow.addColorStop(0, `${agent.color}66`);
        nglow.addColorStop(1, `${agent.color}00`);
        ctx.fillStyle = nglow;
        ctx.beginPath();
        ctx.arc(ax, ay, agent.size * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = agent.color;
        ctx.beginPath();
        ctx.arc(ax, ay, agent.size, 0, Math.PI * 2);
        ctx.fill();

        // label
        ctx.font = "600 9px var(--font-mono), monospace";
        ctx.fillStyle = `${agent.color}cc`;
        ctx.textAlign = "center";
        ctx.fillText(agent.name, ax, ay - agent.size - 8);
      }

      // --- evidence particles spiraling inward ---
      for (const p of particles) {
        if (animate) {
          p.r -= p.speed * dt;
          p.a += p.curve * dt * 0.06 + 0.0004 * dt;
          p.wobble += 0.01 * dt * 0.06;
          if (p.r < 0.12) {
            // respawn at the periphery
            p.r = 1.05 + Math.random() * 0.35;
            p.a = Math.random() * Math.PI * 2;
          }
        }
        const rr = p.r * base * 0.95;
        const wob = Math.sin(p.wobble) * 10;
        const x = cx + Math.cos(p.a) * (rr + wob) + (px - 0.5) * 20;
        const y = cy + Math.sin(p.a) * (rr + wob) * 0.74 + (py - 0.45) * 18;
        // gentle cursor repulsion
        const dxm = x - mouseX * width;
        const dym = y - mouseY * height;
        const dm = Math.hypot(dxm, dym);
        const alpha = Math.max(0.12, Math.min(0.85, 1.15 - p.r));
        if (dm < 90 && dm > 0.01) {
          const f = ((90 - dm) / 90) * 14;
          ctx.globalAlpha = alpha;
          ctx.fillStyle = p.hue === "cyan" ? "#3fe1ff" : "#a78bfa";
          ctx.beginPath();
          ctx.arc(x + (dxm / dm) * f, y + (dym / dm) * f, p.size * 0.9, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.globalAlpha = alpha;
          ctx.fillStyle = p.hue === "cyan" ? "#3fe1ff" : "#a78bfa";
          ctx.beginPath();
          ctx.arc(x, y, p.size * 0.9, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }

    function loop(t: number) {
      if (!running) return;
      const now = performance.now();
      const last = (loop as unknown as { __last?: number }).__last ?? now;
      const dt = Math.min(64, now - last);
      (loop as unknown as { __last?: number }).__last = now;
      px += (mouseX - px) * 0.04;
      py += (mouseY - py) * 0.04;
      drawFrame(t, dt, true);
      raf = requestAnimationFrame(loop);
    }

    function onMouse(e: MouseEvent) {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      mouseX = (e.clientX - rect.left) / Math.max(1, rect.width);
      mouseY = (e.clientY - rect.top) / Math.max(1, rect.height);
    }

    function onVis() {
      running = document.visibilityState === "visible";
      if (running) {
        (loop as unknown as { __last?: number }).__last = performance.now();
        raf = requestAnimationFrame(loop);
      } else {
        cancelAnimationFrame(raf);
      }
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    window.addEventListener("mousemove", onMouse, { passive: true });
    document.addEventListener("visibilitychange", onVis);

    if (reduced) {
      drawFrame(0, 0, false); // single static composition
    } else {
      raf = requestAnimationFrame(loop);
    }

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("mousemove", onMouse);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden />;
}
