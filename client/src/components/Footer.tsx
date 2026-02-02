import { SiYoutube } from 'react-icons/si';
import { Link } from 'wouter';
import { Shield } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-gradient-to-r from-[#003366] to-[#0066CC] text-white py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand Section */}
          <div className="md:col-span-2">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2 bg-white/20 rounded-lg">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-2xl font-bold">Check By AI</h3>
            </div>
            <p className="text-blue-100 mb-6 leading-relaxed">
              AI-powered Certificate of Sponsorship verification for UK visa applicants. 
              Protect yourself from CoS fraud with instant, accurate document authentication.
            </p>
            <a
              href="https://www.youtube.com/@CheckByAi"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors duration-300"
              aria-label="Visit our YouTube channel"
            >
              <SiYoutube className="w-5 h-5" />
              <span className="text-sm font-medium">YouTube Channel</span>
            </a>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-lg font-semibold mb-6 text-white">Quick Links</h4>
            <ul className="space-y-3">
              <li>
                <Link href="/" className="text-blue-100 hover:text-white transition-colors font-medium">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="text-blue-100 hover:text-white transition-colors font-medium">
                  Verify CoS
                </Link>
              </li>
              <li>
                <a href="/ai-guide" className="text-blue-100 hover:text-white transition-colors font-medium">
                  How It Works
                </a>
              </li>
              <li>
                <a href="/cos-guide" className="text-blue-100 hover:text-white transition-colors font-medium">
                  About
                </a>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-lg font-semibold mb-6 text-white">Resources</h4>
            <ul className="space-y-3">
              <li>
                <a href="/cos-guide" className="text-blue-100 hover:text-white transition-colors font-medium">
                  Verification Guide
                </a>
              </li>
              <li>
                <a href="/ai-guide" className="text-blue-100 hover:text-white transition-colors font-medium">
                  AI Technology
                </a>
              </li>
              <li>
                <a href="/pricing" className="text-blue-100 hover:text-white transition-colors font-medium">
                  Pricing
                </a>
              </li>
              <li>
                <a href="/dashboard" className="text-blue-100 hover:text-white transition-colors font-medium">
                  Get Started
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-white/20 mt-8 pt-8 text-center">
          <p className="text-blue-100 text-sm font-medium">
            © {new Date().getFullYear()} Check By AI. All rights reserved.
          </p>
          <p className="text-blue-100/80 text-xs mt-2">
            This tool provides technical analysis only and does not constitute legal or immigration advice.
          </p>
        </div>
      </div>
    </footer>
  );
}
