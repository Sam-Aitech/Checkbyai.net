import { Link, useLocation } from "wouter";
import { Shield, Menu, X } from "lucide-react";
import UserProfile from "./UserProfile";
import Footer from "./Footer";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

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
  { href: "/api-docs", label: "API" },
];

export default function PageLayout({ children, hideNav = false, hideFooter = false }: PageLayoutProps) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {!hideNav && (
        <nav className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b brutalist-border">
          <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
            <div className="flex justify-between items-center h-14">
              <Link href="/" className="flex items-center gap-2.5 shrink-0">
                <Shield className="text-primary w-5 h-5" />
                <span className="text-sm font-bold tracking-tight text-foreground">Check By AI</span>
              </Link>

              <div className="hidden lg:flex items-center gap-0.5">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`px-3 py-1.5 text-xs font-medium tracking-wide transition-colors rounded-sm ${
                      location === link.href
                        ? "text-foreground bg-muted"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <UserProfile />
                <button
                  className="lg:hidden p-2 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  onClick={() => setMobileOpen(!mobileOpen)}
                  aria-label="Toggle navigation menu"
                >
                  {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
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
                className="lg:hidden border-t brutalist-border bg-background overflow-hidden"
              >
                <div className="px-6 py-3 space-y-0.5">
                  {navLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMobileOpen(false)}
                      className={`block px-3 py-2.5 text-sm font-medium rounded-sm transition-colors ${
                        location === link.href
                          ? "text-foreground bg-muted"
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

      <main className="flex-1">{children}</main>

      {!hideFooter && <Footer />}
    </div>
  );
}
