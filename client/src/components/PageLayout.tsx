import { Link, useLocation } from "wouter";
import { Menu, X } from "lucide-react";
import UserProfile from "./UserProfile";
import Footer from "./Footer";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import logoImg from "@assets/logo_material.png";

interface PageLayoutProps {
  children: React.ReactNode;
  hideNav?: boolean;
  hideFooter?: boolean;
}

const navLinks = [
  { href: "/dashboard", label: "Verify CoS" },
  { href: "/pricing", label: "Pricing" },
  { href: "/ai-guide", label: "AI Guide" },
  { href: "/cos-guide", label: "CoS Guide" },
  { href: "/technology", label: "Technology" },
  { href: "/sponsors",        label: "Sponsor Register" },
  { href: "/sponsor-monitor", label: "Sponsor Monitor" },
  { href: "/api-docs", label: "API" },
];

export default function PageLayout({ children, hideNav = false, hideFooter = false }: PageLayoutProps) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {!hideNav && (
        <nav className="sticky top-0 z-50 bg-white/80 dark:bg-background/80 backdrop-blur-xl border-b border-border/50">
          <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
            <div className="flex justify-between items-center h-16">
              <Link href="/" className="flex items-center shrink-0">
                <img src={logoImg} alt="CheckByAi.net" className="h-10 sm:h-12 w-auto object-contain" />
              </Link>

              <div className="hidden lg:flex items-center gap-2">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`px-4 py-2 text-sm font-medium transition-all duration-200 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                      location === link.href
                        ? "text-primary bg-primary/20 font-semibold"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center mr-2">
                  <Link href="/pricing" className="px-5 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary/90 rounded-full shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
                    Get Alerts
                  </Link>
                </div>
                <UserProfile />
                <button
                  className="lg:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  onClick={() => setMobileOpen(!mobileOpen)}
                  aria-label="Toggle navigation menu"
                >
                  {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>

          <AnimatePresence>
            {mobileOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 100, damping: 15 }}
                className="lg:hidden border-t border-border/50 bg-white/95 dark:bg-background/95 backdrop-blur-xl overflow-hidden"
              >
                <div className="px-6 py-4 space-y-1">
                  {navLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMobileOpen(false)}
                      className={`block px-4 py-3 text-sm font-medium rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                        location === link.href
                          ? "text-primary bg-primary/20 font-semibold"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      {link.label}
                    </Link>
                  ))}
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
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
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
