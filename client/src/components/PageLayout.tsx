import { Link, useLocation } from "wouter";
import { Shield, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import UserProfile from "./UserProfile";
import Footer from "./Footer";
import { useState } from "react";

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
    <div className="min-h-screen flex flex-col">
      {!hideNav && (
        <nav className="sticky top-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-14 sm:h-16">
              <Link href="/" className="flex items-center space-x-2 sm:space-x-3 shrink-0">
                <Shield className="text-blue-600 w-6 h-6 sm:w-7 sm:h-7" />
                <span className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">Check By AI</span>
              </Link>

              <div className="hidden lg:flex items-center space-x-1">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      location === link.href
                        ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30"
                        : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>

              <div className="flex items-center space-x-3">
                <UserProfile />
                <button
                  className="lg:hidden p-2 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                  onClick={() => setMobileOpen(!mobileOpen)}
                  aria-label="Toggle navigation menu"
                >
                  {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>

          {mobileOpen && (
            <div className="lg:hidden border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
              <div className="px-4 py-3 space-y-1">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={`block px-3 py-2.5 text-sm font-medium rounded-md transition-colors ${
                      location === link.href
                        ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30"
                        : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </nav>
      )}

      <main className="flex-1">{children}</main>

      {!hideFooter && <Footer />}
    </div>
  );
}
