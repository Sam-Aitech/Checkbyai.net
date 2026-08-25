import { SiYoutube } from 'react-icons/si';
import { Link } from 'wouter';
import logoImg from "@assets/logo_material.png";
import { COMPANY_DETAILS } from '@/lib/companyDetails';

export default function Footer() {
  return (
    <footer className="theme-gradient text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/10" />
      <div className="relative z-10 max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
        <div className="py-16 grid grid-cols-1 md:grid-cols-4 gap-12">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5 mb-6">
              <img src={logoImg} alt="CheckByAi.net" width={160} height={40} className="h-10 sm:h-12 w-auto object-contain" loading="lazy" />
            </div>
            <p className="text-sm editorial-body text-white/70 mb-8 max-w-md">
              UK sponsor licence monitoring with instant WhatsApp, email and SMS alerts. 
              Plus AI-powered Certificate of Sponsorship verification for visa applicants.
            </p>
            <a
              href="https://www.youtube.com/@CheckByAi"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 hover:shadow-lg hover:shadow-red-500/15 rounded-full text-xs font-medium tracking-wide transition-all duration-200"
              aria-label="Visit our YouTube channel"
            >
              <SiYoutube className="w-4 h-4" />
              YouTube Channel
            </a>
          </div>

          <div>
            <h4 className="editorial-caption mb-6 text-white/65 tracking-widest">Products</h4>
            <ul className="space-y-3">
              {[
                { href: "/sponsor-monitor", label: "Sponsor Monitor" },
                { href: "/pricing", label: "Alert Plans" },
                { href: "/dashboard", label: "Verify CoS" },
                { href: "/cos-pricing", label: "CoS Credits" },
                { href: "/sponsor-changes", label: "Today's Changes" },
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
            <h4 className="editorial-caption mb-6 text-white/65 tracking-widest">Resources</h4>
            <ul className="space-y-3">
              {[
                { href: "/check-fake-cos", label: "Spot a Fake CoS" },
                { href: "/what-to-do-fake-cos", label: "Bought a Fake CoS?" },
                { href: "/cos-guide", label: "CoS Guide" },
                { href: "/technology", label: "Our Technology" },
                { href: "/about", label: "About Us" },
              ].map(link => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-white/70 hover:text-white transition-colors font-medium">
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
                  <a href={link.href} className="text-sm text-white/70 hover:text-white transition-colors font-medium">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t-0 pt-8" style={{ borderTop: '1px solid transparent', backgroundImage: 'linear-gradient(to right, transparent, rgba(255,255,255,0.1), transparent)', backgroundSize: '100% 1px', backgroundRepeat: 'no-repeat', backgroundPosition: 'top' }}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div>
              <h5 className="editorial-caption mb-3 text-white/40">Company Details</h5>
              <p className="text-xs text-white/40 leading-relaxed">
                {COMPANY_DETAILS.companyNumber}
                <br />
                {COMPANY_DETAILS.registeredOffice}
                <br />
                {COMPANY_DETAILS.icoRegistration}
              </p>
            </div>
            <div>
              <h5 className="editorial-caption mb-3 text-white/40">Data Protection</h5>
              <p className="text-xs text-white/40 leading-relaxed">
                Compliant with UK GDPR 🇬🇧 and the Data Protection Act 2018. We process document metadata only.
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
          <div className="text-center space-y-2">
            <p className="text-xs text-white/30 font-medium tracking-wide">
              &copy; {new Date().getFullYear()} Check By AI. All rights reserved.
            </p>
            <p className="text-xs text-white/25">
              CheckByAI is not affiliated with the UK Home Office or UK Visas and Immigration (UKVI).
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
