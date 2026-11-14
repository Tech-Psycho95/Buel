"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";
import { IntelCanvas } from "./intel-canvas";

/*
 * Client boundary for the WebGL hero. Falls back to the 2D canvas
 * visualization while the three.js chunk loads or if WebGL is unavailable —
 * the hero is never blank.
 */

const HeroScene = dynamic(() => import("./hero-scene"), {
  ssr: false,
  loading: () => <IntelCanvas className="absolute inset-0 h-full w-full" />,
});

class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    // WebGL context creation or shader failure — fall back silently.
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function HeroVisual({ className = "" }: { className?: string }) {
  return (
    <div className={`absolute inset-0 ${className}`}>
      <SceneBoundary fallback={<IntelCanvas className="absolute inset-0 h-full w-full" />}>
        <HeroScene />
      </SceneBoundary>
    </div>
  );
}
