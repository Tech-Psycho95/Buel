"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/*
 * Shared motion primitives (framer-motion). Respect reduced-motion globally;
 * staggered entrance for lists/cards; never animated after first mount in
 * ways that interfere with reading financial data.
 */

export function Reveal({
  children,
  delay = 0,
  y = 14,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function Stagger({
  children,
  className = "",
  gap = 0.06,
  initialDelay = 0,
}: {
  children: ReactNode;
  className?: string;
  gap?: number;
  initialDelay?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-40px" }}
      transition={{ staggerChildren: gap, delayChildren: initialDelay }}
    >
      {children}
    </motion.div>
  );
}

export const staggerItem = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};

export function StaggerItem({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={staggerItem} className={className}>
      {children}
    </motion.div>
  );
}

/** Drawer side-panel with spring entrance. */
export function MotionDrawer({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <motion.div
        className="absolute inset-0 bg-black/65 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.aside
        className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col border-l border-line bg-surface shadow-2xl"
        initial={{ x: 480 }}
        animate={{ x: 0 }}
        exit={{ x: 480 }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="text-xs text-ink-faint hover:text-ink" aria-label="Close panel">
            esc ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </motion.aside>
    </div>
  );
}

/** Modal with scale+fade. */
export function MotionModal({
  open,
  onClose,
  children,
  className = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-[10vh]">
      <motion.div
        className="absolute inset-0 bg-black/70 backdrop-blur-[3px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onClose}
      />
      <motion.div
        className={`relative w-full ${className}`}
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 26, stiffness: 320 }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/** Animated ellipsis for "agent is working" states. */
export function ThinkingDots({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} aria-label="Working">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="think-dot inline-block h-1.5 w-1.5 rounded-full bg-accent"
          style={{ animationDelay: `${i * 0.18}s` }}
        />
      ))}
    </span>
  );
}
