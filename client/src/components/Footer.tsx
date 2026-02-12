import { SiYoutube } from 'react-icons/si';
import { Link } from 'wouter';
import { Shield } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="theme-gradient text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/10" />
      <div className="relative z-10 max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
        <div className="py-16 grid grid-cols-1 md:grid-cols-4 gap-12">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5 mb-6">
              <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
                <Shield className="w-4 h-4" />
              </div>
              <span className="text-lg font-bold tracking-tight">Check By AI</span>
            </div>
            <p className="text-sm editorial-body text-white/70 mb-8 max-w-md">
              AI-powered Certificate of Sponsorship verification for UK visa applicants. 
              Protect yourself from CoS fraud with instant, accurate document authentication.
            </p>
            <a
              href="https://www.youtube.com/@CheckByAi"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 rounded-full text-xs font-medium tracking-wide transition-colors"
              aria-label="Visit our YouTube channel"
            >
              <SiYoutube className="w-4 h-4" />
              YouTube Channel
            </a>
          </div>

          <div>
            <h4 className="editorial-caption mb-6 text-white/50">Quick Links</h4>
            <ul className="space-y-3">
              {[
                { href: "/", label: "Home" },
                { href: "/dashboard", label: "Verify CoS" },
                { href: "/pricing", label: "Pricing" },
                { href: "/history", label: "Verification History" },
              ].map(link => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-white/70 hover:text-white transition-colors font-medium">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="editorial-caption mb-6 text-white/50">Resources</h4>
            <ul className="space-y-3">
              {[
                { href: "/ai-guide", label: "AI Guide" },
                { href: "/cos-guide", label: "CoS Guide" },
                { href: "/technology", label: "Our Technology" },
                { href: "/api-docs", label: "API Documentation" },
              ].map(link => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-white/70 hover:text-white transition-colors font-medium">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 py-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <div>
              <h5 className="editorial-caption mb-3 text-white/40">Data Protection</h5>
              <p className="text-xs text-white/40 leading-relaxed">
                Compliant with UK GDPR and the Data Protection Act 2018. We process document metadata only. 
                Original documents are deleted immediately after verification. Free users: results are removed 
                when you leave the site. Paid account holders: only verification results are retained, never 
                original documents. You have the right to request erasure of your data at any time.
              </p>
            </div>
            <div className="md:text-right">
              <h5 className="editorial-caption mb-3 text-white/40">Legal</h5>
              <p className="text-xs text-white/40 leading-relaxed">
                This tool provides technical analysis only and does not constitute legal or immigration advice.
                Processing is carried out under Article 6(1)(f) UK GDPR (legitimate interests) for fraud 
                prevention purposes. For data subject requests, contact us via the admin portal.
              </p>
            </div>
          </div>
          <div className="text-center">
            <p className="text-xs text-white/30 font-medium tracking-wide">
              &copy; {new Date().getFullYear()} Check By AI. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
