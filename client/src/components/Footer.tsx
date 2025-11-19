import { SiYoutube } from 'react-icons/si';
import { Link } from 'wouter';

export default function Footer() {
  return (
    <footer className="bg-gray-900 dark:bg-gray-950 text-white py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand Section */}
          <div className="md:col-span-2">
            <h3 className="text-xl font-bold mb-4">Check By AI</h3>
            <p className="text-gray-400 mb-4">
              AI-powered Certificate of Sponsorship verification for UK visa applicants. 
              Protect yourself from CoS fraud with instant, accurate document authentication.
            </p>
            <div className="flex items-center space-x-4">
              <a
                href="https://www.youtube.com/@CheckByAi"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-2 text-gray-400 hover:text-red-500 transition-colors duration-300"
                aria-label="Visit our YouTube channel"
              >
                <SiYoutube className="w-6 h-6" />
                <span className="text-sm">YouTube</span>
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-lg font-semibold mb-4">Quick Links</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/" className="text-gray-400 hover:text-white transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="text-gray-400 hover:text-white transition-colors">
                  Verify CoS
                </Link>
              </li>
              <li>
                <a href="/cos-check-ai.html" className="text-gray-400 hover:text-white transition-colors">
                  How It Works
                </a>
              </li>
              <li>
                <a href="/about.html" className="text-gray-400 hover:text-white transition-colors">
                  About
                </a>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-lg font-semibold mb-4">Resources</h4>
            <ul className="space-y-2">
              <li>
                <a href="/guides/how-to-check-cos-genuine.html" className="text-gray-400 hover:text-white transition-colors">
                  Verification Guide
                </a>
              </li>
              <li>
                <a href="/guides/cos-scams-red-flags.html" className="text-gray-400 hover:text-white transition-colors">
                  Scam Red Flags
                </a>
              </li>
              <li>
                <a href="/privacy.html" className="text-gray-400 hover:text-white transition-colors">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="/data-security.html" className="text-gray-400 hover:text-white transition-colors">
                  Data Security
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-gray-800 mt-8 pt-8 text-center">
          <p className="text-gray-400 text-sm">
            © {new Date().getFullYear()} Check By AI. All rights reserved.
          </p>
          <p className="text-gray-500 text-xs mt-2">
            This tool provides technical analysis only and does not constitute legal or immigration advice.
          </p>
        </div>
      </div>
    </footer>
  );
}
