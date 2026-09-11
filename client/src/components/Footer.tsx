import { SiYoutube } from 'react-icons/si';
import { Link } from 'wouter';
import logoImg from "@assets/logo_material.png";
import { COMPANY_DETAILS } from '@/lib/companyDetails';

export default function Footer() {
  const companyDetailLines = [
    COMPANY_DETAILS.companyNumber,
    COMPANY_DETAILS.registeredOffice,
    COMPANY_DETAILS.icoRegistration,
  ].filter((line): line is string => Boolean(line));

  return (
    <footer className="theme-gradient text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/10 to-black/50" aria-hidden="true" />
      <div className="relative z-10 container-wide">
        <div className="py-16 grid grid-cols-1 md:grid-cols-4 gap-12">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5 mb-6">
              <img src={logoImg} alt="CheckByAi.net" width={160} height={40} className="h-10 w-auto object-contain" loading="lazy" />
            </div>
            <p className="text-sm editorial-body hero-text-secondary mb-8 max-w-md">
              UK sponsor licence monitoring with instant WhatsApp, email and SMS alerts.
              Plus AI-powered Certificate of Sponsorship verification for visa applicants.
            </p>
            <a
              href="https://www.youtube.com/@CheckByAi"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] bg-white/10 hover:bg-white/20 hover:shadow-lg hover:shadow-red-500/15 rounded-full text-xs font-medium tracking-wide transition-[background-color,box-shadow] duration-200"
              aria-label="Visit our YouTube channel"
            >
              <SiYoutube className="w-4 h-4" />
              YouTube Channel
            </a>
          </div>

          <div>
            <h4 className="editorial-caption mb-6 hero-text-tertiary">Products</h4>
            <ul className="space-y-3">
              {[
                { href: "/sponsor-monitor", label: "Sponsor Monitor" },
                { href: "/pricing", label: "Alert Plans" },
                { href: "/dashboard", label: "Verify CoS" },
                { href: "/cos-pricing", label: "CoS Credits" },
                { href: "/sponsor-changes", label: "Today's Changes" },
              ].map(link => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm hero-text-secondary hover:text-white transition-colors font-medium">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="editorial-caption mb-6 hero-text-tertiary">Resources</h4>
            <ul className="space-y-3">
              {[
                { href: "/check-fake-cos", label: "Spot a Fake CoS" },
                { href: "/what-to-do-fake-cos", label: "Bought a Fake CoS?" },
                { href: "/cos-guide", label: "CoS Guide" },
                { href: "/technology", label: "Our Technology" },
                { href: "/about", label: "About Us" },
              ].map(link => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm hero-text-secondary hover:text-white transition-colors font-medium">
                    {link.label}
                  </Link>
                </li>
              ))}
              {[
                { href: "/privacy.html", label: "Privacy Policy" },
                { href: "/terms.html", label: "Terms of Service" },
                { href: "/data-security.html", label: "Data Security" },
              ].map(link => (
                <li key={link.href}>
                  <a href={link.href} className="text-sm hero-text-secondary hover:text-white transition-colors font-medium">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="pt-8 footer-divider">
          <div className={`grid grid-cols-1 gap-8 mb-8 ${companyDetailLines.length > 0 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
            {companyDetailLines.length > 0 && (
              <div>
                <h5 className="editorial-caption mb-3 hero-text-tertiary">Company Details</h5>
                <p className="text-xs hero-text-tertiary leading-relaxed">
                  {companyDetailLines.map((line, i) => (
                    <span key={line}>
                      {line}
                      {i < companyDetailLines.length - 1 && <br />}
                    </span>
                  ))}
                </p>
              </div>
            )}
            <div>
              <h5 className="editorial-caption mb-3 hero-text-tertiary">Data Protection</h5>
              <p className="text-xs hero-text-tertiary leading-relaxed">
                Compliant with UK GDPR 🇬🇧 and the Data Protection Act 2018. We process document metadata only.
                Original documents are deleted immediately after verification. Free users: results are removed
                when you leave the site. Paid account holders: only verification results are retained, never
                original documents. You have the right to request erasure of your data at any time.
              </p>
            </div>
            <div className="md:text-right">
              <h5 className="editorial-caption mb-3 hero-text-tertiary">Legal</h5>
              <p className="text-xs hero-text-tertiary leading-relaxed">
                This tool provides technical analysis only and does not constitute legal or immigration advice.
                Processing is carried out under Article 6(1)(f) UK GDPR (legitimate interests) for fraud
                prevention purposes. For data subject requests, contact us via the admin portal.
              </p>
            </div>
          </div>
          <div className="text-center space-y-2">
            <p className="text-xs hero-text-tertiary font-medium tracking-wide">
              &copy; {new Date().getFullYear()} Check By AI. All rights reserved.
            </p>
            <p className="text-xs hero-text-tertiary">
              CheckByAI is not affiliated with the UK Home Office or UK Visas and Immigration (UKVI).
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
