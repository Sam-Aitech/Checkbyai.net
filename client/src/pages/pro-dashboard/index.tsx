/**
 * Pro Dashboard Shell
 * Persistent nav chrome (desktop sidebar + mobile bottom nav) shared by every
 * /pro-dashboard/* sub-page. Each sub-page is its own lazy-loaded route
 * (client/src/App.tsx) and wraps its content in <Shell active="...">.
 *
 * Design: Stitch MCP — CheckByAI Pro DS (dark, Geist, violet #7C3AED)
 */
import { useState, useEffect, type ReactNode, type CSSProperties } from "react";
import { useLocation, Link } from "wouter";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { TIER_LABELS } from "@shared/planTiers";
import logoImg from "@assets/logo_material.png";
import {
  LayoutDashboard, Building2, Briefcase, Bell, History as HistoryIcon,
  UserCircle2, HelpCircle, LogOut, Crown, Menu, X, ChevronRight,
  type LucideIcon,
} from "lucide-react";

// ─── Design tokens — maps to site CSS variables, shared by every sub-page ─────
export const T = {
  bg:           "var(--background)",
  sidebar:      "var(--card)",
  card:         "var(--card)",
  border:       "var(--border)",
  violet:       "var(--primary)",
  violetDim:    "color-mix(in srgb, var(--primary) 8%, transparent)",
  violetBorder: "color-mix(in srgb, var(--primary) 22%, transparent)",
  indigo:       "var(--primary)",
  text:         "var(--foreground)",
  sub:          "var(--muted-foreground)",
  muted:        "var(--muted-foreground)",
  activeText:   "var(--primary)",
  emerald:      "#10B981",
  amber:        "#F59E0B",
  red:          "#EF4444",
  cyan:         "#06B6D4",
} as const;

export const cardStyle: CSSProperties = {
  background: "var(--card)",
  border: `1px solid var(--border)`,
  borderRadius: 16,
  boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.06)",
};

export type Tab = "overview" | "monitor" | "jobs" | "alerts" | "history" | "support" | "account";

export const NAV: Array<{ id: Tab; label: string; path: string; Icon: LucideIcon }> = [
  { id: "overview", label: "Overview", path: "/pro-dashboard",         Icon: LayoutDashboard },
  { id: "monitor",  label: "Monitor",  path: "/pro-dashboard/monitor", Icon: Building2 },
  { id: "jobs",     label: "Jobs",     path: "/pro-dashboard/jobs",    Icon: Briefcase },
  { id: "alerts",   label: "Alerts",   path: "/pro-dashboard/alerts",  Icon: Bell },
  { id: "history",  label: "History",  path: "/pro-dashboard/history", Icon: HistoryIcon },
  { id: "support",  label: "Support",  path: "/pro-dashboard/support", Icon: HelpCircle },
  { id: "account",  label: "Account",  path: "/pro-dashboard/account", Icon: UserCircle2 },
];

// Mobile bottom nav is intentionally limited to Home/Monitor/Jobs/Alerts —
// History/Support/Account live behind the Account entry point instead.
const MOBILE_NAV_IDS: Tab[] = ["overview", "monitor", "jobs", "alerts"];

function PlanPill({ tier }: { tier: string }) {
  return (
    <span style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99, display: "inline-flex", alignItems: "center", gap: 4, boxShadow: "0 2px 8px color-mix(in srgb, var(--primary) 28%, transparent)" }}>
      <Crown style={{ width: 11, height: 11 }} />
      {TIER_LABELS[tier as keyof typeof TIER_LABELS] || tier}
    </span>
  );
}

interface ShellProps { active: Tab; children: ReactNode }

export function Shell({ active, children }: ShellProps) {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading, isAuthenticated, tier } = useAuth();
  const { toast } = useToast();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) setLocation("/login");
  }, [authLoading, isAuthenticated, setLocation]);

  const handleLogout = async () => {
    try { await apiRequest("POST", "/api/auth/logout"); setLocation("/"); window.location.reload(); }
    catch { toast({ title: "Logout failed", variant: "destructive" }); }
  };

  if (authLoading) {
    return (
      <div style={{ background: "var(--background)", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--primary)", margin: "0 auto 14px", animation: reducedMotion ? "none" : "pulse 1.5s infinite" }} />
          <p style={{ fontSize: 14, color: T.muted }}>Loading your dashboard…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null; // redirecting to /login

  const initials = `${user?.firstName?.[0] || ""}${user?.lastName?.[0] || ""}` || user?.email?.[0]?.toUpperCase() || "U";
  const fullName = user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.email?.split("@")[0] || "User";

  const Sidebar = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", userSelect: "none" }}>
      <div style={{ padding: "18px 16px 14px", borderBottom: `1px solid ${T.border}` }}>
        <img src={logoImg} alt="CheckByAI" style={{ height: 32, objectFit: "contain" }} />
      </div>

      <nav style={{ flex: 1, padding: "10px 8px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
        {NAV.map(({ id, label, path, Icon }) => {
          const isActive = active === id;
          return (
            <Link key={id} href={path} onClick={() => setDrawerOpen(false)}
              style={{
                display: "flex", alignItems: "center", gap: 11, padding: "9px 12px",
                borderRadius: 10, textDecoration: "none", width: "100%", boxSizing: "border-box",
                background: isActive ? T.violetDim : "transparent",
                borderLeft: isActive ? `3px solid ${T.violet}` : "3px solid transparent",
                color: isActive ? T.activeText : T.muted,
              }}
            >
              <Icon className="w-4 h-4" style={{ color: isActive ? T.activeText : T.muted, flexShrink: 0 }} />
              <span style={{ fontSize: 14, fontWeight: isActive ? 600 : 400 }}>{label}</span>
              {isActive && <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.violet, marginLeft: "auto", flexShrink: 0 }} />}
            </Link>
          );
        })}
      </nav>

      <div style={{ padding: "12px 8px", borderTop: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 6 }}>
        <Link href="/pro-dashboard/account" onClick={() => setDrawerOpen(false)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", textDecoration: "none" }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "var(--primary-foreground)", flexShrink: 0 }}>{initials}</div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fullName}</p>
            <PlanPill tier={tier} />
          </div>
        </Link>
        <button onClick={handleLogout} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 10, border: "none", cursor: "pointer", width: "100%", background: "transparent", color: T.muted, fontSize: 13 }}>
          <LogOut style={{ width: 14, height: 14 }} /> Sign out
        </button>
      </div>
    </div>
  );

  const activeLabel = NAV.find((n) => n.id === active)?.label || "Dashboard";
  const content = reducedMotion ? (
    <div>{children}</div>
  ) : (
    <AnimatePresence mode="wait">
      <motion.div key={active} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18, ease: "easeOut" }}>
        {children}
      </motion.div>
    </AnimatePresence>
  );

  return (
    <div style={{ background: T.bg, height: "100vh", overflow: "hidden", display: "flex", fontFamily: "system-ui,-apple-system,'Segoe UI',sans-serif" }}>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col" style={{ width: 260, flexShrink: 0, background: T.sidebar, borderRight: `1px solid ${T.border}`, height: "100%" }}>
        {Sidebar}
      </aside>

      {/* Mobile drawer overlay */}
      <AnimatePresence>
        {drawerOpen && <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
            onClick={() => setDrawerOpen(false)} />
          <motion.aside initial={{ x: reducedMotion ? 0 : -264 }} animate={{ x: 0 }} exit={{ x: reducedMotion ? 0 : -264 }} transition={{ type: "spring", stiffness: 140, damping: 20 }}
            style={{ position: "fixed", left: 0, top: 0, bottom: 0, width: 260, zIndex: 50, background: T.sidebar, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column" }}>
            <button onClick={() => setDrawerOpen(false)} style={{ position: "absolute", top: 14, right: 14, background: "var(--secondary)", border: "none", borderRadius: 8, padding: 6, cursor: "pointer", color: "var(--muted-foreground)" }}>
              <X style={{ width: 14, height: 14 }} />
            </button>
            {Sidebar}
          </motion.aside>
        </>}
      </AnimatePresence>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        <header style={{ height: 54, flexShrink: 0, background: "var(--card)", borderBottom: `1px solid var(--border)`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button className="lg:hidden" onClick={() => setDrawerOpen(true)} style={{ background: "var(--secondary)", border: "none", borderRadius: 8, padding: 7, cursor: "pointer", color: "var(--muted-foreground)", display: "flex" }}>
              <Menu style={{ width: 16, height: 16 }} />
            </button>
            <div className="hidden sm:flex" style={{ alignItems: "center", gap: 6, fontSize: 13, color: T.muted }}>
              <span>Dashboard</span>
              <ChevronRight style={{ width: 12, height: 12, opacity: 0.5 }} />
              <span style={{ color: T.text, fontWeight: 500 }}>{activeLabel}</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="hidden sm:block"><PlanPill tier={tier} /></div>
            <Link href="/pro-dashboard/account" aria-label="Account" style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "var(--primary-foreground)", flexShrink: 0, textDecoration: "none" }}>{initials}</Link>
          </div>
        </header>

        {/* Content — bottom padding keeps CTAs clear of the fixed mobile bottom nav */}
        <main style={{ flex: 1, overflowY: "auto", padding: "24px 24px 96px", background: T.bg }}>
          {content}
        </main>
      </div>

      {/* Mobile bottom nav — Home / Monitor / Jobs / Alerts only, 44px+ targets */}
      <nav className="lg:hidden" style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 30, height: 60, background: "var(--card)", backdropFilter: "blur(16px)", borderTop: `1px solid var(--border)`, display: "flex", alignItems: "stretch", justifyContent: "space-around", padding: "0 4px" }}>
        {NAV.filter((n) => MOBILE_NAV_IDS.includes(n.id)).map(({ id, label, path, Icon }) => {
          const isActive = active === id;
          return (
            <Link key={id} href={path}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, flex: 1, minWidth: 44, minHeight: 44, textDecoration: "none", color: isActive ? T.activeText : T.muted, position: "relative" }}>
              <Icon className="w-5 h-5" style={{ color: isActive ? T.activeText : T.muted }} />
              <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 400 }}>{label}</span>
              {isActive && <span style={{ position: "absolute", bottom: -2, width: 4, height: 4, borderRadius: "50%", background: T.violet }} />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
