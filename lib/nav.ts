export type NavItem = {
  href: string;
  label: string;
  group: "Workspace" | "Research & Simulation" | "Intelligence" | "Account";
  icon: string;
  beta?: boolean;
};

/*
 * The 16 authenticated destinations (amendment: 16 implemented explicitly).
 * ALL of them are visible in the sidebar immediately after login — none is
 * hidden behind a waitlist, upgrade wall, or coming-soon tile.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/command-center", label: "Command Center", group: "Workspace", icon: "gauge" },
  { href: "/market-pulse", label: "Live Market Pulse", group: "Workspace", icon: "activity" },
  { href: "/agent-council", label: "Agent Council", group: "Workspace", icon: "users" },
  { href: "/decision-ledger", label: "Decision Ledger", group: "Workspace", icon: "book-open" },
  { href: "/scenario-lab", label: "Scenario Lab", group: "Research & Simulation", icon: "flask-conical" },
  { href: "/strategy-arena", label: "Strategy Arena", group: "Research & Simulation", icon: "swords" },
  { href: "/paper-trading", label: "Paper Trading", group: "Research & Simulation", icon: "notebook-pen" },
  { href: "/portfolio-guardian", label: "Portfolio Guardian", group: "Research & Simulation", icon: "shield" },
  { href: "/catalyst-intelligence", label: "Catalyst Intelligence", group: "Research & Simulation", icon: "zap" },
  { href: "/market-memory", label: "Market Memory", group: "Intelligence", icon: "brain" },
  { href: "/performance-lab", label: "Performance Lab", group: "Intelligence", icon: "line-chart" },
  { href: "/evidence-graph", label: "Evidence Graph", group: "Intelligence", icon: "git-branch" },
  { href: "/forensics", label: "Wallet Forensics", group: "Intelligence", icon: "microscope" },
  { href: "/watchlists", label: "Watchlists", group: "Account", icon: "eye" },
  { href: "/risk-preferences", label: "Risk Preferences", group: "Account", icon: "sliders-horizontal" },
  { href: "/settings", label: "Settings / Profile", group: "Account", icon: "settings" },
];

export const NAV_GROUPS: NavItem["group"][] = [
  "Workspace",
  "Research & Simulation",
  "Intelligence",
  "Account",
];
