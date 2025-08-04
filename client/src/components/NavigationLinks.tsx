import { Link } from "wouter";

interface NavigationLinksProps {
  className?: string;
}

export default function NavigationLinks({ className = "" }: NavigationLinksProps) {
  const links = [
    { href: "/", label: "Home", description: "COS Check by AI homepage" },
    { href: "/dashboard", label: "COS Check", description: "Upload and verify your Certificate of Sponsorship" },
    { href: "/cos-check-ai.html", label: "AI Guide", description: "Learn about check by AI technology" },
    { href: "/cos-guide.html", label: "COS Guide", description: "Certificate of Sponsorship verification guide" },
  ];

  return (
    <nav className={className} aria-label="Main navigation">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {links.map((link) => (
          <Link key={link.href} href={link.href}>
            <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-shadow border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600">
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                {link.label}
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                {link.description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </nav>
  );
}