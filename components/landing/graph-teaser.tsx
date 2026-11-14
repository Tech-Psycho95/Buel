"use client";

import { motion } from "framer-motion";
import { Card } from "@/components/ui";

/*
 * Landing teaser of the workspace Evidence Graph: a static, labeled snapshot
 * of the provenance chain (source → observations → claims → red-team → judge)
 * with draw-in edges and staggered nodes on scroll-into-view.
 */
export function GraphTeaser() {
  const obs = [64, 128, 192, 256];
  const nodes = [
    { x: 80, y: 150, label: "SOURCE", color: "#8b9ab5" },
    ...obs.map((y, i) => ({
      x: 300,
      y,
      label: ["MOMENTUM", "TREND", "VOLATILITY", "FUNDING"][i],
      color: "#3fe1ff",
    })),
    { x: 520, y: 80, label: "BULL", color: "#2fe0a2" },
    { x: 520, y: 150, label: "BEAR", color: "#ff6b7d" },
    { x: 520, y: 220, label: "RISK", color: "#ffc757" },
    { x: 700, y: 115, label: "RED-TEAM", color: "#fb7185" },
    { x: 860, y: 150, label: "JUDGE", color: "#3fe1ff" },
  ];
  const edges: Array<[number, number]> = [
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
    [1, 5],
    [2, 6],
    [4, 7],
    [5, 8],
    [6, 8],
    [7, 8],
    [8, 9],
  ];

  return (
    <Card variant="elevated" className="halo mt-12 overflow-hidden p-8">
      <svg viewBox="0 0 920 300" className="w-full" aria-hidden>
        {edges.map(([a, b], i) => (
          <motion.path
            key={i}
            d={`M ${nodes[a].x + 42} ${nodes[a].y} C ${(nodes[a].x + nodes[b].x) / 2} ${nodes[a].y}, ${(nodes[a].x + nodes[b].x) / 2} ${nodes[b].y}, ${nodes[b].x - 42} ${nodes[b].y}`}
            fill="none"
            stroke="rgba(146,178,255,0.3)"
            strokeWidth="1.1"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 + i * 0.06 }}
          />
        ))}
        {nodes.map((n, i) => (
          <motion.g
            key={i}
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08, duration: 0.4 }}
          >
            <rect
              x={n.x - 42}
              y={n.y - 14}
              width={84}
              height={28}
              rx={8}
              fill="rgba(14,21,36,0.95)"
              stroke={n.color}
              strokeOpacity="0.55"
            />
            <text
              x={n.x}
              y={n.y + 4}
              textAnchor="middle"
              fontSize="10"
              fontWeight="700"
              fill={n.color}
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {n.label}
            </text>
          </motion.g>
        ))}
      </svg>
      <p className="mt-4 text-center text-xs leading-relaxed text-ink-faint">
        In the workspace, every stored decision renders this chain interactively — hover to trace,
        click a node to inspect its evidence.
      </p>
    </Card>
  );
}
