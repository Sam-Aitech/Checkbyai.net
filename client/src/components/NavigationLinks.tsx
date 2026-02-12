import { Link } from "wouter";
import { ArrowRight } from "lucide-react";

interface NavigationLinksProps {
  className?: string;
}

export default function NavigationLinks({ className = "" }: NavigationLinksProps) {
  const links = [
    { href: "/", label: "Home", description: "COS Check by AI homepage" },
    { href: "/dashboard", label: "COS Check", description: "Upload and verify your Certificate of Sponsorship" },
    { href: "/ai-guide", label: "AI Guide", description: "Learn about check by AI technology" },
    { href: "/cos-guide", label: "COS Guide", description: "Certificate of Sponsorship verification guide" },
    { href: "/technology", label: "Technology", description: "How our AI verification technology works" },
    { href: "/api-docs", label: "API Docs", description: "Integration documentation for developers" },
  ];

  return (
    <nav className={className} aria-label="Main navigation">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {links.map((link) => (
          <Link key={link.href} href={link.href}>
            <div className="group theme-card p-5 cursor-pointer">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-foreground text-sm">
                  {link.label}
                </h3>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <p className="text-xs text-muted-foreground">
                {link.description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </nav>
  );
}
