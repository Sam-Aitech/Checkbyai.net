import { Link, useLocation } from "wouter";
import { Menu, X, LayoutDashboard, ChevronDown, Bell, Search, TrendingUp, BookOpen, Cpu, FileCheck, Code2 } from "lucide-react";
import UserProfile from "./UserProfile";
import Footer from "./Footer";
import BrandLogo from "./BrandLogo";
import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import logoImg from "@assets/logo_material.png";

interface PageLayoutProps {
  children: React.ReactNode;
  hideNav?: boolean;
  hideFooter?: boolean;
  darkNav?: boolean;
}

interface NavChild {
  href: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
}

interface NavItem {
  label: string;
  href?: string;
  children?: NavChild[];
}

const navItems: NavItem[] = [
  {
    label: "Monitor",
    children: [
      { href: "/sponsors",        label: "Sponsor Register",  desc: "Search 124,000+ licensed UK sponsors",          icon: <Search className="w-4 h-4" /> },
      { href: "/sponsor-monitor", label: "Sponsor Monitor",   desc: "Get instant alerts when a licence changes",      icon: <Bell className="w-4 h-4" /> },
      { href: "/sponsor-changes", label: "Licence Changes",   desc: "Recent additions, revocations and downgrades",   icon: <TrendingUp className="w-4 h-4" /> },
    ],
  },
  { href: "/verify-cos", label: "Verify CoS" },
  { href: "/pricing",   label: "Pricing" },
  {
    label: "Resources",
    children: [
      { href: "/cos-guide",   label: "CoS Guide",   desc: "Certificate of Sponsorship explained",   icon: <BookOpen className="w-4 h-4" /> },
      { href: "/ai-guide",    label: "AI Guide",    desc: "How our AI verification works",           icon: <Cpu className="w-4 h-4" /> },
      { href: "/technology",  label: "Technology",  desc: "The tech behind CheckByAI",               icon: <FileCheck className="w-4 h-4" /> },
      { href: "/api-docs",    label: "API Docs",    desc: "Integrate via our REST API",              icon: <Code2 className="w-4 h-4" /> },
    ],
  },
];

interface NavDropdownProps {
  item: NavItem;
  dark?: boolean;
}

function NavDropdown({ item, dark = false }: NavDropdownProps) {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const isChildActive = item.children?.some(c => location === c.href);

  return (
    <div ref={ref} className="relative">
      <button
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex items-center gap-1 px-4 py-2 text-sm font-medium rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
          dark
            ? isChildActive ? "text-white bg-white/10 font-semibold" : "text-slate-300 hover:text-white hover:bg-white/5"
            : isChildActive ? "text-primary bg-primary/10 font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-muted"
        }`}
      >
        {item.label}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.15 }}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            role="menu"
            className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 bg-white dark:bg-card rounded-xl border border-border shadow-xl shadow-black/10 overflow-hidden z-50"
          >
            <div className="p-1.5">
              {item.children?.map(child => (
                <Link
                  key={child.href}
                  href={child.href}
                  onClick={() => setOpen(false)}
                  role="menuitem"
                  className={`flex items-start gap-3 p-3 rounded-lg transition-colors group ${
                    location === child.href
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted text-foreground"
                  }`}
                >
                  <span className={`mt-0.5 shrink-0 ${location === child.href ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`}>
                    {child.icon}
                  </span>
                  <div>
                    <p className="text-sm font-semibold leading-none mb-1">{child.label}</p>
                    <p className="text-xs text-muted-foreground leading-snug">{child.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function PageLayout({ children, hideNav = false, hideFooter = false, darkNav = false }: PageLayoutProps) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const { isAuthenticated, isPro, isAdmin } = useAuth();

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!mobileOpen) return;
    if (e.key === "Escape") {
      setMobileOpen(false);
      menuButtonRef.current?.focus();
      return;
    }
    if (e.key === "Tab" && mobileMenuRef.current) {
      const focusable = mobileMenuRef.current.querySelectorAll<HTMLElement>(
        'a, button, [tabindex]:not([tabindex="-1"])'
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
  }, [mobileOpen]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (mobileOpen && mobileMenuRef.current) {
      mobileMenuRef.current.querySelector<HTMLElement>('a, button, [tabindex]:not([tabindex="-1"])')?.focus();
    }
  }, [mobileOpen]);

  const closeMobileMenu = () => {
    setMobileOpen(false);
    menuButtonRef.current?.focus();
  };

  const menuVariants = shouldReduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { height: 0, opacity: 0 }, animate: { height: "auto", opacity: 1 }, exit: { height: 0, opacity: 0 } };

  const pageVariants = shouldReduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, y: 15 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -15 } };

  const monitorGroup = navItems[0];
  const resourcesGroup = navItems[3];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {!hideNav && (
        <nav className={`sticky top-0 z-50 backdrop-blur-xl border-b ${darkNav ? "bg-slate-950/95 border-slate-800" : "bg-white/80 dark:bg-background/80 border-border/50"}`}>
          <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
            <div className="flex justify-between items-center h-16">

              {/* Logo */}
              <Link href="/" className="flex items-center shrink-0">
                {darkNav
                  ? <BrandLogo variant="dark" />
                  : <img src={logoImg} alt="CheckByAi.net" width={160} height={40} className="h-10 sm:h-12 w-auto object-contain" />}
              </Link>

              {/* Desktop nav */}
              <div className="hidden lg:flex items-center gap-1">
                {navItems.map((item) => {
                  if (item.children) return <NavDropdown key={item.label} item={item} dark={darkNav} />;
                  const isActive = location === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href!}
                      aria-current={isActive ? "page" : undefined}
                      className={`px-4 py-2 text-sm font-medium rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                        darkNav
                          ? isActive ? "text-white bg-white/10 font-semibold" : "text-slate-300 hover:text-white hover:bg-white/5"
                          : isActive ? "text-primary bg-primary/10 font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>

              {/* Right actions */}
              <div className="flex items-center gap-2">
                {isAuthenticated && (isPro || isAdmin) ? (
                  <Link
                    href="/pro-dashboard"
                    className="hidden sm:flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-full shadow-sm shadow-emerald-500/20 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    My Dashboard
                  </Link>
                ) : (
                  <>
                    <Link
                      href="/login"
                      className={`hidden sm:block px-4 py-2 text-sm font-medium rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${darkNav ? "text-slate-300 hover:text-white hover:bg-white/5" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                    >
                      Sign In
                    </Link>
                    {location !== "/pricing" && (
                      <Link
                        href="/pricing"
                        className="hidden sm:flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-full shadow-sm shadow-emerald-500/20 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                      >
                        <Bell className="w-3.5 h-3.5" />
                        Get Alerts
                      </Link>
                    )}
                  </>
                )}

                {isAuthenticated && <UserProfile />}

                <button
                  ref={menuButtonRef}
                  className={`lg:hidden p-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${darkNav ? "text-slate-300 hover:text-white hover:bg-white/5" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                  onClick={() => setMobileOpen(!mobileOpen)}
                  aria-label="Toggle navigation menu"
                  aria-expanded={mobileOpen}
                  aria-controls="mobile-nav"
                >
                  {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Mobile menu */}
          <AnimatePresence>
            {mobileOpen && (
              <motion.div
                id="mobile-nav"
                ref={mobileMenuRef}
                role="dialog"
                aria-modal="true"
                aria-label="Navigation menu"
                initial={menuVariants.initial}
                animate={menuVariants.animate}
                exit={menuVariants.exit}
                transition={shouldReduceMotion ? { duration: 0.15 } : { type: "spring", stiffness: 100, damping: 15 }}
                className={`lg:hidden border-t backdrop-blur-xl overflow-hidden ${darkNav ? "border-slate-800 bg-slate-900/95" : "border-border/50 bg-white/95 dark:bg-background/95"}`}
              >
                <div className="px-5 py-4 space-y-4">

                  {/* Monitor group */}
                  <div>
                    <p className={`text-[10px] font-bold tracking-widest uppercase px-3 mb-1 ${darkNav ? "text-slate-500" : "text-muted-foreground/50"}`}>Monitor</p>
                    {monitorGroup.children?.map(child => (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={closeMobileMenu}
                        aria-current={location === child.href ? "page" : undefined}
                        className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                          location === child.href
                            ? darkNav ? "text-white bg-white/10 font-semibold" : "text-primary bg-primary/10 font-semibold"
                            : darkNav ? "text-slate-300 hover:text-white hover:bg-white/5" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                      >
                        <span className={`shrink-0 ${darkNav ? "text-slate-400" : "text-muted-foreground"}`}>{child.icon}</span>
                        {child.label}
                      </Link>
                    ))}
                  </div>

                  {/* Standalone links */}
                  <div className={`border-t pt-3 ${darkNav ? "border-slate-800" : "border-border/50"}`}>
                    {[navItems[1], navItems[2]].map(item => (
                      <Link
                        key={item.href}
                        href={item.href!}
                        onClick={closeMobileMenu}
                        aria-current={location === item.href ? "page" : undefined}
                        className={`block px-3 py-2.5 text-sm font-medium rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                          location === item.href
                            ? darkNav ? "text-white bg-white/10 font-semibold" : "text-primary bg-primary/10 font-semibold"
                            : darkNav ? "text-slate-300 hover:text-white hover:bg-white/5" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>

                  {/* Resources group */}
                  <div className={`border-t pt-3 ${darkNav ? "border-slate-800" : "border-border/50"}`}>
                    <p className={`text-[10px] font-bold tracking-widest uppercase px-3 mb-1 ${darkNav ? "text-slate-500" : "text-muted-foreground/50"}`}>Resources</p>
                    {resourcesGroup.children?.map(child => (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={closeMobileMenu}
                        aria-current={location === child.href ? "page" : undefined}
                        className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                          location === child.href
                            ? darkNav ? "text-white bg-white/10 font-semibold" : "text-primary bg-primary/10 font-semibold"
                            : darkNav ? "text-slate-300 hover:text-white hover:bg-white/5" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                      >
                        <span className={`shrink-0 ${darkNav ? "text-slate-400" : "text-muted-foreground"}`}>{child.icon}</span>
                        {child.label}
                      </Link>
                    ))}
                  </div>

                  {/* CTA */}
                  <div className={`border-t pt-3 ${darkNav ? "border-slate-800" : "border-border/50"}`}>
                    {isAuthenticated && (isPro || isAdmin) ? (
                      <Link
                        href="/pro-dashboard"
                        onClick={closeMobileMenu}
                        className="flex items-center justify-center gap-2 w-full px-4 py-3 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-all"
                      >
                        <LayoutDashboard className="w-4 h-4" />
                        My Dashboard
                      </Link>
                    ) : (
                      <>
                        <Link
                          href="/login"
                          onClick={closeMobileMenu}
                          className={`block w-full px-4 py-2.5 text-sm font-medium text-center rounded-xl transition-colors mb-2 ${darkNav ? "text-slate-300 hover:text-white hover:bg-white/5" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                        >
                          Sign In
                        </Link>
                        {location !== "/pricing" && (
                          <Link
                            href="/pricing"
                            onClick={closeMobileMenu}
                            className="flex items-center justify-center gap-2 w-full px-4 py-3 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-all"
                          >
                            <Bell className="w-4 h-4" />
                            Get Licence Alerts
                          </Link>
                        )}
                      </>
                    )}
                  </div>

                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </nav>
      )}

      <main className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={location}
            initial={pageVariants.initial}
            animate={pageVariants.animate}
            exit={pageVariants.exit}
            transition={shouldReduceMotion ? { duration: 0.15 } : { duration: 0.3, ease: "easeOut" }}
            className="w-full h-full"
          >
            <ErrorBoundary>{children}</ErrorBoundary>
          </motion.div>
        </AnimatePresence>
      </main>

      {!hideFooter && <Footer />}
    </div>
  );
}
