"use client";

import { motion } from "framer-motion";
import { usePathname } from "next/navigation";

/*
 * Route transition: every authenticated navigation remounts this template,
 * giving a smooth, fast fade+rise. Deliberately subtle so it never delays
 * interaction with financial data. Reduced-motion is honored by framer-motion.
 */
export default function WorkspaceTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
