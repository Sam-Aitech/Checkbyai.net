import { Link, useLocation } from "wouter";
import { Menu, X, LayoutDashboard } from "lucide-react";
import UserProfile from "./UserProfile";
import Footer from "./Footer";
import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import logoImg from "@assets/logo_material.png";
import { useAuth } from "@/hooks/useAuth";

interface PageLayoutProps {
  children: React.ReactNode;
  hideNav?: boolean;
  hideFooter?: boolean;
}

const navLinks = [
  { href: "/sponsors",        label: "Sponsor Register" },
  { href: "/sponsor-monitor", label: "Sponsor Monitor" },
  { href: "/sponsor-changes", label: "Licence Changes" },
  { href: "/dashboard",       label: "Verify CoS" },
  { href: "/pricing",         label: "Pricing" },
  { href: "/ai-guide",        label: "AI Guide" },
  { href: "/cos-guide",       label: "CoS Guide" },
  { href: "/technology",      label: "Technology" },
  { href: "/api-docs",        label: "API" },
];

export default function PageLayout({ children, hideNav = false, hideFooter = false }: PageLayoutProps) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const { isAuthenticated, isPro, isAdmin } = useAuth();

  // ── Focus-trap refs ──────────────────────────────────────────────────────────
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // Close on Escape and trap Tab focus within the mobile menu
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
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }, [mobileOpen]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Move focus into the menu when it opens
  useEffect(() => {
    if (mobileOpen && mobileMenuRef.current) {
      const first = mobileMenuRef.current.querySelector<HTMLElement>(
        'a, button, [tabindex]:not([tabindex="-1"])'
      );
      first?.focus();
    }
  }, [mobileOpen]);

  const closeMobileMenu = () => {
    setMobileOpen(false);
    menuButtonRef.current?.focus();
  };

  // ── Animation variants — no movement when reduced motion is on ───────────────
  const menuVariants = shouldReduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { height: 0, opacity: 0 }, animate: { height: "auto", opacity: 1 }, exit: { height: 0, opacity: 0 } };

  const pageVariants = shouldReduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, y: 15 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -15 } };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {!hideNav && (
        <nav className="sticky top-0 z-50 bg-white/80 dark:bg-background/80 backdrop-blur-xl border-b border-border/50">
          <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
            <div className="flex justify-between items-center h-16">
              <Link href="/" className="flex items-center shrink-0">
                <img
                  src={logoImg}
                  alt="CheckByAi.net"
                  width={160}
                  height={40}
                  className="h-10 sm:h-12 w-auto object-contain"
                />
              </Link>

              <div className="hidden lg:flex items-center gap-2">
                {navLinks.filter(link => !(location === "/" && link.href === "/dashboard")).map((link) => {
                  const isActive = location === link.href;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      aria-current={isActive ? "page" : undefined}
                      className={`px-4 py-2 text-sm font-medium transition-all duration-200 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                        isActive
                          ? "text-primary bg-primary/20 font-semibold"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </div>

              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center mr-2">
                  {(isAuthenticated && (isPro || isAdmin)) ? (
                    <Link href="/pro-dashboard" className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary/90 rounded-full shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
                      <LayoutDashboard className="w-4 h-4" />
                      My Dashboard
                    </Link>
                  ) : (
                    <Link href="/pricing" className="px-5 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary/90 rounded-full shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
                      Get Alerts
                    </Link>
                  )}
                </div>
                <UserProfile />
                <button
                  ref={menuButtonRef}
                  className="lg:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
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
                className="lg:hidden border-t border-border/50 bg-white/95 dark:bg-background/95 backdrop-blur-xl overflow-hidden"
              >
                <div className="px-6 py-4 space-y-1">
                  {(isAuthenticated && (isPro || isAdmin)) && (
                    <Link
                      href="/pro-dashboard"
                      onClick={closeMobileMenu}
                      aria-current={location === "/pro-dashboard" ? "page" : undefined}
                      className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                        location === "/pro-dashboard"
                          ? "text-primary bg-primary/20"
                          : "text-primary bg-primary/10 hover:bg-primary/20"
                      }`}
                    >
                      <LayoutDashboard className="w-4 h-4" />
                      My Dashboard
                    </Link>
                  )}
                  {navLinks.filter(link => !(location === "/" && link.href === "/dashboard")).map((link) => {
                    const isActive = location === link.href;
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={closeMobileMenu}
                        aria-current={isActive ? "page" : undefined}
                        className={`block px-4 py-3 text-sm font-medium rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                          isActive
                            ? "text-primary bg-primary/20 font-semibold"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                      >
                        {link.label}
                      </Link>
                    );
                  })}
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
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {!hideFooter && <Footer />}
    </div>
  );
}
