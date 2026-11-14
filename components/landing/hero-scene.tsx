"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/*
 * HERO SCULPTURE — "the intelligence ecosystem".
 *
 * An original Three.js composition: a luminous judge core wrapped in
 * wireframe shells, four agent entities orbiting on tilted paths, evidence
 * particles streaming along curved pathways into the core, and a faint signal
 * sphere enclosing the whole ecosystem — with technical annotations rendered
 * as canvas sprite labels (no DOM overlays inside the WebGL tree, so there
 * are no React unmount races). Pointer parallax drives the camera;
 * reduced-motion renders a single still frame. Illustrative visualization
 * only — it encodes the product's structure, not live market data.
 */

const AGENT_COLORS = {
  bull: "#2fe0a2",
  bear: "#ff6b7d",
  risk: "#ffc757",
  analyst: "#a78bfa",
};

function makeGlowTexture(): THREE.Texture {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

/** Canvas-drawn label sprite (mono caps chip, optional hairline tail). */
function makeLabelTexture(text: string, color: string, tail = false): { tex: THREE.Texture; aspect: number } {
  const scale = 3; // supersample for crispness
  const font = `700 ${13 * scale}px ui-monospace, monospace`;
  const pad = 10 * scale;
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = font;
  const textW = measure.measureText(text).width;
  const w = Math.ceil(textW + pad * 2);
  const chipH = 22 * scale;
  const h = Math.ceil(chipH + (tail ? 10 * scale : 0));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  // chip background
  g.fillStyle = "rgba(4,6,11,0.74)";
  g.beginPath();
  g.roundRect(0, 0, w, chipH, 6 * scale);
  g.fill();
  g.strokeStyle = `${color}66`;
  g.lineWidth = 1.4 * scale;
  g.stroke();
  // text
  g.font = font;
  g.fillStyle = color;
  g.textBaseline = "middle";
  g.fillText(text, pad, chipH / 2 + 1 * scale);
  if (tail) {
    g.fillStyle = "rgba(99,163,222,0.5)";
    g.fillRect(w / 2 - scale, chipH + 2 * scale, 2 * scale, 7 * scale);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return { tex, aspect: w / h };
}

function SpriteLabel({
  text,
  color,
  position,
  scale = 1,
  tail = false,
}: {
  text: string;
  color: string;
  position: [number, number, number];
  scale?: number;
  tail?: boolean;
}) {
  const { tex, aspect } = useMemo(() => makeLabelTexture(text, color, tail), [text, color, tail]);
  const width = 1.05 * scale;
  return (
    <sprite position={position} scale={[width, width / aspect, 1]}>
      <spriteMaterial map={tex} transparent depthWrite={false} />
    </sprite>
  );
}

/** Fibonacci-sphere point shell — the "signal universe" backdrop. */
function SignalShell({ count }: { count: number }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = golden * i;
      arr[i * 3] = Math.cos(th) * r * 4.6;
      arr[i * 3 + 1] = y * 4.6;
      arr[i * 3 + 2] = Math.sin(th) * r * 4.6;
    }
    return arr;
  }, [count]);

  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.008;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.02}
        color="#9ab4e8"
        transparent
        opacity={0.34}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

/** Agent entity: wireframe polyhedron + glow, on a tilted orbit. */
function AgentEntity({
  name,
  color,
  shape,
  orbitRadius,
  tilt,
  speed,
  phase,
  reduced,
}: {
  name: string;
  color: string;
  shape: "octa" | "tetra" | "box" | "icosa";
  orbitRadius: number;
  tilt: number;
  speed: number;
  phase: number;
  reduced: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const label = useRef<THREE.Sprite>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const glow = useMemo(() => makeGlowTexture(), []);
  const labelTex = useMemo(() => makeLabelTexture(name, color), [name, color]);
  const { size } = useThree();
  const compact = size.width < 1024;

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (group.current) {
      const ang = reduced ? phase : t * speed + phase;
      group.current.position.set(
        Math.cos(ang) * orbitRadius,
        Math.sin(ang * 1.3 + phase) * 0.55 + tilt * 0.4,
        Math.sin(ang) * orbitRadius * 0.6,
      );
    }
    if (mesh.current && !reduced) {
      mesh.current.rotation.x = t * 0.6 + phase;
      mesh.current.rotation.y = t * 0.45;
    }
    // Label sprite stays screen-readable regardless of orbit depth.
    if (label.current) {
      const s = compact ? 0.22 : 0.3;
      label.current.scale.set(s * labelTex.aspect, s, 1);
    }
  });

  return (
    <group ref={group}>
      <mesh ref={mesh} scale={compact ? 0.16 : 0.2}>
        {shape === "octa" && <octahedronGeometry args={[1, 0]} />}
        {shape === "tetra" && <tetrahedronGeometry args={[1, 0]} />}
        {shape === "box" && <boxGeometry args={[1.2, 1.2, 1.2]} />}
        {shape === "icosa" && <icosahedronGeometry args={[1, 0]} />}
        <meshBasicMaterial color={color} wireframe transparent opacity={0.85} />
      </mesh>
      <mesh scale={compact ? 0.1 : 0.12}>
        {shape === "octa" && <octahedronGeometry args={[1, 0]} />}
        {shape === "tetra" && <tetrahedronGeometry args={[1, 0]} />}
        {shape === "box" && <boxGeometry args={[1.2, 1.2, 1.2]} />}
        {shape === "icosa" && <icosahedronGeometry args={[1, 0]} />}
        <meshBasicMaterial color={color} transparent opacity={0.5} />
      </mesh>
      <sprite scale={compact ? 0.9 : 1.2}>
        <spriteMaterial map={glow} color={color} transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>
      <sprite ref={label} position={[0, 0.3, 0]}>
        <spriteMaterial map={labelTex.tex} transparent depthWrite={false} />
      </sprite>
    </group>
  );
}

/** Evidence pathways: curved tubes + particles streaming toward the core. */
function EvidenceFlow({ reduced }: { reduced: boolean }) {
  const { size } = useThree();
  const compact = size.width < 1024;
  const CURVES = compact ? 4 : 6;
  const COUNT = compact ? 260 : 620;

  const curves = useMemo(() => {
    const list: THREE.QuadraticBezierCurve3[] = [];
    for (let i = 0; i < CURVES; i++) {
      const a = (i / CURVES) * Math.PI * 2 + 0.6;
      const start = new THREE.Vector3(
        Math.cos(a) * 4.4,
        Math.sin(a * 2.7) * 2.2,
        Math.sin(a) * 3.2,
      );
      const mid = start.clone().multiplyScalar(0.5);
      mid.y += Math.sin(a * 3.1) * 0.9;
      list.push(new THREE.QuadraticBezierCurve3(start, mid, new THREE.Vector3(0, 0, 0)));
    }
    return list;
  }, [CURVES]);

  const pointsRef = useRef<THREE.Points>(null);

  const { positions, meta, colorArray } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const meta: Array<{ curve: number; t: number; speed: number }> = [];
    const colorArray = new Float32Array(COUNT * 3);
    const cyan = new THREE.Color("#3fe1ff");
    const violet = new THREE.Color("#a78bfa");
    for (let i = 0; i < COUNT; i++) {
      meta.push({
        curve: i % curves.length,
        t: Math.random(),
        speed: 0.00006 + Math.random() * 0.00012,
      });
      const c = Math.random() > 0.3 ? cyan : violet;
      colorArray[i * 3] = c.r;
      colorArray[i * 3 + 1] = c.g;
      colorArray[i * 3 + 2] = c.b;
    }
    return { positions, meta, colorArray };
  }, [COUNT, curves]);

  const glow = useMemo(() => makeGlowTexture(), []);

  useFrame((_, dt) => {
    for (let i = 0; i < COUNT; i++) {
      const m = meta[i];
      if (!reduced) {
        m.t += m.speed * dt * 16;
        if (m.t > 1) m.t -= 1;
      }
      const p = curves[m.curve].getPoint(m.t);
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
    }
    if (pointsRef.current) {
      (pointsRef.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
  });

  return (
    <group>
      {curves.map((c, i) => (
        <mesh key={i}>
          <tubeGeometry args={[c, 40, 0.006, 6, false]} />
          <meshBasicMaterial color="#3fe1ff" transparent opacity={0.16} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      ))}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[colorArray, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.055}
          map={glow}
          vertexColors
          transparent
          opacity={0.9}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
    </group>
  );
}

/** Judge core: pulsing glow + wireframe shells + sprite annotation. */
function JudgeCore({ reduced, compact = false }: { reduced: boolean; compact?: boolean }) {
  const shell = useRef<THREE.Mesh>(null);
  const shell2 = useRef<THREE.Mesh>(null);
  const glow = useMemo(() => makeGlowTexture(), []);
  const labelTex = useMemo(() => makeLabelTexture("JUDGE CORE", "rgba(99,163,222,0.95)", true), []);
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    if (shell.current && !reduced) {
      shell.current.rotation.y += dt * 0.12;
      shell.current.rotation.x = Math.sin(t * 0.2) * 0.2;
    }
    if (shell2.current && !reduced) {
      shell2.current.rotation.y -= dt * 0.07;
      shell2.current.rotation.z += dt * 0.05;
    }
  });
  return (
    <group>
      <sprite scale={2.6}>
        <spriteMaterial map={glow} color="#3fe1ff" transparent opacity={0.4} blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>
      <mesh>
        <icosahedronGeometry args={[0.32, 1]} />
        <meshBasicMaterial color="#3fe1ff" transparent opacity={0.6} wireframe />
      </mesh>
      <mesh ref={shell}>
        <icosahedronGeometry args={[0.55, 1]} />
        <meshBasicMaterial color="#7fdcff" transparent opacity={0.22} wireframe />
      </mesh>
      <mesh ref={shell2}>
        <icosahedronGeometry args={[0.85, 0]} />
        <meshBasicMaterial color="#8f7ff7" transparent opacity={0.14} wireframe />
      </mesh>
      <sprite position={[0, 1.18, 0]} scale={[1.5, 1.5 / 1.3, 1]}>
        <spriteMaterial map={labelTex.tex} transparent depthWrite={false} />
      </sprite>
    </group>
  );
}

/** Camera pointer parallax. */
function CameraRig({ reduced }: { reduced: boolean }) {
  const { camera, size } = useThree();

  useFrame((state, dt) => {
    if (!reduced) {
      const dist = size.width < 1024 ? 10.4 : 9.2;
      camera.position.x += (state.pointer.x * 1.1 - camera.position.x) * Math.min(1, dt * 1.6);
      camera.position.y += (0.5 + state.pointer.y * 0.7 - camera.position.y) * Math.min(1, dt * 1.6);
      camera.position.z += (dist - camera.position.z) * Math.min(1, dt * 1.2);
      camera.lookAt(0, 0, 0);
    } else {
      camera.position.set(0, 0.5, size.width < 1024 ? 10.4 : 9.2);
      camera.lookAt(0, 0, 0);
    }
  });
  return null;
}

function SceneContents({ reduced }: { reduced: boolean }) {
  const { size } = useThree();
  const compact = size.width < 1024;
  // The sculpture is offset toward the lower-right so the editorial headline
  // band (upper-center) stays the dominant foreground element. Scale shrinks
  // on compact viewports so orbits never reach back into the text area.
  const offsetX = compact ? 0 : 1.4;
  const offsetY = compact ? -2.1 : -1.0;
  const sceneScale = compact ? 0.55 : 0.92;
  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[6, 4, 6]} intensity={30} color="#3fe1ff" />
      <pointLight position={[-6, -3, 4]} intensity={24} color="#8f7ff7" />
      <fog attach="fog" args={["#04060b", 9, 16]} />
      <CameraRig reduced={reduced} />
      <group position={[offsetX, offsetY, 0]} scale={sceneScale}>
        <SignalShell count={compact ? 700 : 1300} />
        <JudgeCore reduced={reduced} compact={compact} />
        <EvidenceFlow reduced={reduced} />
        <AgentEntity name="BULL · LONG" color={AGENT_COLORS.bull} shape="octa" orbitRadius={2.5} tilt={0.4} speed={0.24} phase={0.4} reduced={reduced} />
        <AgentEntity name="BEAR · SHORT" color={AGENT_COLORS.bear} shape="tetra" orbitRadius={3.1} tilt={-0.3} speed={-0.18} phase={2.1} reduced={reduced} />
        <AgentEntity name="RISK" color={AGENT_COLORS.risk} shape="box" orbitRadius={2.0} tilt={0.7} speed={0.3} phase={3.7} reduced={reduced} />
        <AgentEntity name="ANALYST" color={AGENT_COLORS.analyst} shape="icosa" orbitRadius={3.6} tilt={-0.55} speed={-0.14} phase={5.2} reduced={reduced} />
        <SpriteLabel text="EVIDENCE INBOUND →" color="rgba(146,178,255,0.7)" position={[-2.5, -1.35, 1.8]} scale={0.5} />
      </group>
    </>
  );
}

export default function HeroScene() {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 0.5, 9.2], fov: 42 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ background: "transparent" }}
    >
      <SceneContents reduced={reduced} />
    </Canvas>
  );
}
