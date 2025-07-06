import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import FileUploadSimple from './FileUploadSimple';

export default function COSDashboard() {
  const [showFreeCheck, setShowFreeCheck] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{type: 'Genuine' | 'Edited' | 'Fake'} | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [freeUsageCount, setFreeUsageCount] = useState(0);
  const [hasUsedFreeCheck, setHasUsedFreeCheck] = useState(false);

  // Check free usage on component mount and handle setup parameter
  useEffect(() => {
    const storedUsageCount = localStorage.getItem('cos_free_usage_count');
    const storedUsageDate = localStorage.getItem('cos_free_usage_date');
    const today = new Date().toDateString();
    
    if (storedUsageDate === today && storedUsageCount) {
      const count = parseInt(storedUsageCount, 10);
      setFreeUsageCount(count);
      setHasUsedFreeCheck(count >= 1);
    } else {
      // Reset daily usage
      localStorage.setItem('cos_free_usage_count', '0');
      localStorage.setItem('cos_free_usage_date', today);
      setFreeUsageCount(0);
      setHasUsedFreeCheck(false);
    }

    // Check if accessed via setup button
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('setup') === 'true') {
      setShowFreeCheck(true);
      // Clean up the URL parameter
      window.history.replaceState({}, '', '/dashboard');
    }
  }, []);

  const handleFileUpload = (file: File) => {
    // This will be handled by FileUploadSimple component
  };

  const handleVerificationResult = (result: any) => {
    setVerificationResult(result);
    
    // Track free usage
    if (!hasUsedFreeCheck) {
      const newCount = freeUsageCount + 1;
      setFreeUsageCount(newCount);
      setHasUsedFreeCheck(true);
      
      // Update localStorage
      localStorage.setItem('cos_free_usage_count', newCount.toString());
      localStorage.setItem('cos_free_usage_date', new Date().toDateString());
    }
  };

  const handleLoading = (loading: boolean) => {
    setIsLoading(loading);
  };

  const handleError = (error: string) => {
    console.error('Verification error:', error);
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Innovative 3D Dashboard Header */}
      <header className="relative bg-gradient-to-r from-blue-600 via-blue-700 to-purple-700 shadow-2xl sticky top-0 z-40 overflow-hidden">
        {/* Animated Background Dots */}
        <div 
          className="absolute inset-0 opacity-20"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const dots = e.currentTarget.querySelectorAll('.floating-dot');
            dots.forEach((dot, index) => {
              const delay = index * 0.1;
              const dotElement = dot as HTMLElement;
              const distance = Math.sqrt((x - dotElement.offsetLeft) ** 2 + (y - dotElement.offsetTop) ** 2);
              const scale = Math.max(0.5, 1 - distance / 500);
              dotElement.style.transform = `translate(${(x - dotElement.offsetLeft) * 0.02}px, ${(y - dotElement.offsetTop) * 0.02}px) scale(${scale}) rotateZ(${distance * 0.1}deg)`;
              dotElement.style.transitionDelay = `${delay}s`;
            });
          }}
        >
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="floating-dot absolute w-2 h-2 bg-white rounded-full animate-pulse transition-transform duration-700 ease-out"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
              }}
            />
          ))}
        </div>

        {/* 3D Geometric Shapes */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-4 left-1/4 w-8 h-8 border-2 border-white/20 rotate-45 animate-spin" style={{ animationDuration: '8s' }} />
          <div className="absolute bottom-4 right-1/3 w-6 h-6 bg-white/10 rounded-full animate-bounce" style={{ animationDelay: '2s' }} />
          <div className="absolute top-1/2 right-1/4 w-10 h-10 border border-white/15 rounded-full animate-ping" style={{ animationDelay: '1s' }} />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center space-x-4 group">
              <div className="relative">
                <div className="absolute inset-0 bg-white/20 rounded-full blur-xl group-hover:blur-2xl transition-all duration-500" />
                <div className="relative w-12 h-12 bg-gradient-to-br from-white to-blue-100 rounded-full flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-all duration-300">
                  <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              <div className="transform group-hover:translate-x-2 transition-transform duration-300">
                <h1 className="text-2xl font-bold text-white drop-shadow-lg">COS Authenticator</h1>
                <p className="text-sm text-blue-100 drop-shadow">Advanced Document Verification</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <Link href="/">
                <button className="group relative inline-flex items-center px-6 py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white font-medium hover:bg-white/20 transition-all duration-300 transform hover:-translate-y-1 hover:shadow-xl">
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                  <svg className="w-5 h-5 mr-2 transform group-hover:-translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16l-4-4m0 0l4-4m-4 4h18" />
                  </svg>
                  <span className="relative z-10">Back to Home</span>
                </button>
              </Link>
              
              <button 
                onClick={() => setShowFreeCheck(true)}
                className="group relative inline-flex items-center px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl text-white font-semibold shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 hover:scale-105"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-green-400 to-emerald-500 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <svg className="w-5 h-5 mr-2 relative z-10 transform group-hover:rotate-12 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="relative z-10">Try Free Check</span>
                <div className="absolute inset-0 rounded-xl bg-white/20 scale-0 group-hover:scale-100 transition-transform duration-500" />
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Glow Effect */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
      </header>

      {/* Innovative 3D Hero Section */}
      <section className="relative bg-gradient-to-br from-blue-600 via-purple-700 to-indigo-800 text-white text-center py-24 overflow-hidden">
        {/* 3D Floating Elements */}
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(15)].map((_, i) => (
            <div
              key={i}
              className="absolute animate-float opacity-30"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 5}s`,
                animationDuration: `${3 + Math.random() * 4}s`,
              }}
            >
              <div className="w-4 h-4 bg-gradient-to-br from-white/40 to-transparent rounded-full blur-sm" />
            </div>
          ))}
        </div>

        {/* Interactive Cursor Trail */}
        <div 
          className="absolute inset-0"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Create trailing effect
            const trail = document.createElement('div');
            trail.className = 'absolute w-3 h-3 bg-white/30 rounded-full pointer-events-none animate-ping';
            trail.style.left = x + 'px';
            trail.style.top = y + 'px';
            trail.style.transform = 'translate(-50%, -50%)';
            e.currentTarget.appendChild(trail);
            
            setTimeout(() => trail.remove(), 1000);
          }}
        />

        {/* Geometric Background */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-20 left-20 w-32 h-32 border border-white/30 rounded-full animate-spin-slow" />
          <div className="absolute bottom-20 right-20 w-24 h-24 border-2 border-white/20 rotate-45 animate-pulse" />
          <div className="absolute top-1/2 left-1/4 w-16 h-16 bg-white/10 transform rotate-12 animate-bounce" style={{ animationDelay: '1s' }} />
        </div>

        <div className="container mx-auto px-5 relative z-10">
          <div className="transform hover:scale-105 transition-transform duration-500">
            <h1 className="text-5xl md:text-7xl font-bold mb-6 font-sans bg-gradient-to-r from-white via-blue-100 to-purple-100 bg-clip-text text-transparent drop-shadow-2xl">
              Advanced COS Document Verification
            </h1>
          </div>
          <p className="text-xl md:text-2xl max-w-4xl mx-auto mb-10 text-blue-100 drop-shadow-lg leading-relaxed">
            Verify the authenticity of your Certificate of Service using PDF metadata analysis and expert verification
          </p>
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
            <button 
              onClick={() => setShowFreeCheck(true)}
              className="group relative inline-block px-10 py-5 bg-gradient-to-r from-green-500 via-emerald-600 to-green-600 text-white rounded-full font-bold text-xl transition-all duration-500 hover:shadow-2xl hover:shadow-green-500/50 transform hover:-translate-y-2 hover:scale-110"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 animate-pulse" />
              <span className="relative z-10 flex items-center">
                <svg className="w-6 h-6 mr-3 transform group-hover:rotate-12 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Check Your COS Now
              </span>
              <div className="absolute inset-0 rounded-full bg-white/20 scale-0 group-hover:scale-100 transition-transform duration-700" />
            </button>

            <button 
              onClick={() => setShowDemo(true)}
              className="group relative inline-block px-10 py-5 bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 text-white rounded-full font-bold text-xl transition-all duration-500 hover:shadow-2xl hover:shadow-purple-500/50 transform hover:-translate-y-2 hover:scale-110"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 animate-pulse" />
              <span className="relative z-10 flex items-center">
                <svg className="w-6 h-6 mr-3 transform group-hover:rotate-12 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Watch Demo
              </span>
              <div className="absolute inset-0 rounded-full bg-white/20 scale-0 group-hover:scale-100 transition-transform duration-700" />
            </button>
          </div>
        </div>
      </section>

      {/* Verification Highlight */}
      <section className="container mx-auto px-5 py-16">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-wrap">
          <div className="flex-1 min-w-[300px] bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-10">
            <svg width="400" height="300" viewBox="0 0 500 400" className="max-w-full h-auto">
              <rect x="50" y="50" width="400" height="300" rx="10" fill="#0ea5e9" fillOpacity="0.2" />
              <rect x="70" y="70" width="360" height="260" rx="5" fill="white" stroke="#0ea5e9" strokeWidth="2" />
              <path d="M100,100 L400,100" stroke="#2563eb" strokeWidth="3" strokeDasharray="5,5" />
              <circle cx="250" cy="180" r="50" fill="#10b981" fillOpacity="0.2" />
              <path d="M235,170 L265,200 L295,150" fill="none" stroke="#10b981" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
              <text x="250" y="260" textAnchor="middle" fontFamily="Poppins" fontSize="24" fill="#2563eb">Certificate of Service</text>
              <text x="250" y="290" textAnchor="middle" fontFamily="Roboto" fontSize="18" fill="#64748b">Authenticity Verified</text>
              <path d="M120,330 L380,330" stroke="#ef4444" strokeWidth="2" />
              <circle cx="150" cy="350" r="10" fill="#ef4444" />
              <circle cx="250" cy="350" r="10" fill="#f59e0b" />
              <circle cx="350" cy="350" r="10" fill="#10b981" />
              <text x="150" y="380" textAnchor="middle" fontFamily="Roboto" fontSize="14" fill="#334155">Fake</text>
              <text x="250" y="380" textAnchor="middle" fontFamily="Roboto" fontSize="14" fill="#334155">Edited</text>
              <text x="350" y="380" textAnchor="middle" fontFamily="Roboto" fontSize="14" fill="#334155">Genuine</text>
            </svg>
          </div>
          <div className="flex-1 min-w-[300px] p-12 flex flex-col justify-center">
            <h2 className="text-4xl font-bold text-gray-900 mb-5 font-sans">
              Advanced <span className="text-blue-600">PDF Metadata Analysis</span> for COS Documents
            </h2>
            <p className="text-gray-600 mb-8 text-lg">
              Our proprietary technology examines PDF metadata to detect alterations and verify the authenticity of your Certificate of Service documents.
            </p>
            
            <ul className="space-y-4 mb-8">
              <li className="flex items-center gap-4">
                <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-gray-700">Deep analysis of PDF metadata properties</span>
              </li>
              <li className="flex items-center gap-4">
                <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-gray-700">Comparison against verified genuine templates</span>
              </li>
              <li className="flex items-center gap-4">
                <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-gray-700">Detection of document alterations and tampering</span>
              </li>
              <li className="flex items-center gap-4">
                <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-gray-700">Verification of digital signatures and timestamps</span>
              </li>
            </ul>
            
            <div className="flex gap-5">
              <div className="text-center p-5 rounded-xl bg-gray-50 flex-1">
                <div className="text-3xl font-bold text-blue-600 mb-1">99.7%</div>
                <div className="text-gray-600 text-sm">Accuracy Rate</div>
              </div>
              <div className="text-center p-5 rounded-xl bg-gray-50 flex-1">
                <div className="text-3xl font-bold text-blue-600 mb-1">50k+</div>
                <div className="text-gray-600 text-sm">COS Verified</div>
              </div>
              <div className="text-center p-5 rounded-xl bg-gray-50 flex-1">
                <div className="text-3xl font-bold text-blue-600 mb-1">0.2s</div>
                <div className="text-gray-600 text-sm">Avg. Analysis Time</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section className="container mx-auto px-5 py-16">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900 mb-4 font-sans">How Our COS Verification Works</h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Three-step process to verify the authenticity of your Certificate of Service
          </p>
          <div className="w-20 h-1 bg-blue-600 mx-auto mt-4 rounded"></div>
        </div>
        
        <div className="flex flex-wrap justify-center gap-8">
          <div className="flex-1 min-w-[250px] max-w-[300px] bg-white rounded-2xl p-8 shadow-lg transition-all duration-300 hover:transform hover:-translate-y-3 hover:shadow-xl relative overflow-hidden">
            <div className="absolute top-3 right-3 text-6xl font-bold text-blue-100">1</div>
            <div className="relative">
              <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-5 text-white text-2xl">
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 className="text-2xl font-semibold mb-4 text-gray-900">Upload COS Document</h3>
              <p className="text-gray-600 mb-5">Upload your Certificate of Service in PDF format for analysis.</p>
              <button className="bg-blue-600 text-white px-6 py-2 rounded-full font-medium transition-all duration-300 hover:bg-blue-700">
                Upload PDF
              </button>
            </div>
          </div>
          
          <div className="flex-1 min-w-[250px] max-w-[300px] bg-white rounded-2xl p-8 shadow-lg transition-all duration-300 hover:transform hover:-translate-y-3 hover:shadow-xl relative overflow-hidden">
            <div className="absolute top-3 right-3 text-6xl font-bold text-blue-100">2</div>
            <div className="relative">
              <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-5 text-white text-2xl">
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 className="text-2xl font-semibold mb-4 text-gray-900">Metadata Analysis</h3>
              <p className="text-gray-600 mb-5">Our system extracts and analyzes PDF metadata for authenticity markers.</p>
              <button className="bg-blue-600 text-white px-6 py-2 rounded-full font-medium transition-all duration-300 hover:bg-blue-700">
                View Sample
              </button>
            </div>
          </div>
          
          <div className="flex-1 min-w-[250px] max-w-[300px] bg-white rounded-2xl p-8 shadow-lg transition-all duration-300 hover:transform hover:-translate-y-3 hover:shadow-xl relative overflow-hidden">
            <div className="absolute top-3 right-3 text-6xl font-bold text-blue-100">3</div>
            <div className="relative">
              <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-5 text-white text-2xl">
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 className="text-2xl font-semibold mb-4 text-gray-900">Get Verification Result</h3>
              <p className="text-gray-600 mb-5">Receive instant verification status: Genuine, Edited, or Fake.</p>
              <button className="bg-blue-600 text-white px-6 py-2 rounded-full font-medium transition-all duration-300 hover:bg-blue-700">
                Example Report
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Results Section */}
      <section className="bg-gradient-to-r from-blue-50 to-cyan-50 py-20 my-16 rounded-3xl">
        <div className="container mx-auto px-5">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4 font-sans">Verification Results</h2>
            <p className="text-xl text-gray-600">Clear, color-coded results for immediate understanding</p>
          </div>
          
          <div className="flex flex-wrap justify-center gap-8">
            <div className="w-[300px] bg-white rounded-2xl overflow-hidden shadow-lg transition-all duration-300 hover:transform hover:-translate-y-3 hover:shadow-xl">
              <div className="bg-green-500 text-white text-center py-8">
                <div className="text-5xl mb-5">
                  <svg className="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <h3 className="text-2xl font-semibold">Genuine COS</h3>
              </div>
              <div className="p-8">
                <p className="text-gray-600 mb-5">Document matches verified templates with no alterations detected.</p>
                <ul className="space-y-2">
                  <li className="flex items-center gap-3">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-700">Metadata matches genuine pattern</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-700">No tampering detected</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-700">Digital signature valid</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-700">Creation date consistent</span>
                  </li>
                </ul>
              </div>
            </div>
            
            <div className="w-[300px] bg-white rounded-2xl overflow-hidden shadow-lg transition-all duration-300 hover:transform hover:-translate-y-3 hover:shadow-xl">
              <div className="bg-yellow-500 text-white text-center py-8">
                <div className="text-5xl mb-5">
                  <svg className="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <h3 className="text-2xl font-semibold">Edited COS</h3>
              </div>
              <div className="p-8">
                <p className="text-gray-600 mb-5">Document shows signs of alteration after original creation.</p>
                <ul className="space-y-2">
                  <li className="flex items-center gap-3">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-700">Metadata inconsistencies</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-700">Modification dates detected</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-700">Content alterations found</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-700">Signature validation failed</span>
                  </li>
                </ul>
              </div>
            </div>
            
            <div className="w-[300px] bg-white rounded-2xl overflow-hidden shadow-lg transition-all duration-300 hover:transform hover:-translate-y-3 hover:shadow-xl">
              <div className="bg-red-500 text-white text-center py-8">
                <div className="text-5xl mb-5">
                  <svg className="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <h3 className="text-2xl font-semibold">Fake COS</h3>
              </div>
              <div className="p-8">
                <p className="text-gray-600 mb-5">Document is completely fabricated or doesn't match any genuine patterns.</p>
                <ul className="space-y-2">
                  <li className="flex items-center gap-3">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-700">No metadata match found</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-700">Fraudulent creation patterns</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-700">Invalid digital signature</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-700">Suspicious document structure</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="text-center py-20 bg-gradient-to-br from-blue-600 to-cyan-600 text-white rounded-3xl mx-5 my-16 relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-white bg-opacity-10 rounded-full"></div>
        <div className="absolute -bottom-16 -left-16 w-60 h-60 bg-white bg-opacity-5 rounded-full"></div>
        <div className="relative z-10 max-w-4xl mx-auto px-5">
          <h2 className="text-5xl font-bold mb-5">Ready to Verify Your COS Document?</h2>
          <p className="text-xl mb-8">
            Join thousands of professionals who trust our advanced verification technology to authenticate their Certificate of Service documents.
          </p>
          <button 
            onClick={() => setShowFreeCheck(true)}
            className="bg-white text-blue-600 text-xl font-semibold px-10 py-4 rounded-full transition-all duration-300 hover:bg-gray-100 hover:text-blue-700 hover:transform hover:-translate-y-1 shadow-lg"
          >
            Get Started Now - It's Free
          </button>
        </div>
      </section>

      {/* Free Check Modal */}
      {showFreeCheck && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Free COS Verification</h2>
                  <p className="text-gray-600 mt-1">Upload your Certificate of Service for instant verification</p>
                </div>
                <button
                  onClick={() => {
                    setShowFreeCheck(false);
                    setVerificationResult(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
                >
                  ×
                </button>
              </div>
            </div>
            
            <div className="p-6">
              {!verificationResult ? (
                <div>
                  {!hasUsedFreeCheck ? (
                    <>
                      <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </div>
                          <div>
                            <h3 className="font-semibold text-green-800">Free Verification Available</h3>
                            <p className="text-green-700 text-sm">Upload your COS document to verify its authenticity instantly</p>
                          </div>
                        </div>
                      </div>

                      <FileUploadSimple
                        onFileUpload={handleFileUpload}
                        onVerificationResult={handleVerificationResult}
                        onLoading={handleLoading}
                        onError={handleError}
                      />
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 mx-auto mb-4 bg-orange-100 rounded-full flex items-center justify-center">
                        <svg className="w-8 h-8 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 mb-2">Free Check Used</h3>
                      <p className="text-gray-600 mb-6">You've already used your free verification for today. Upgrade to Pro for unlimited checks.</p>
                      
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
                        <h4 className="font-semibold text-blue-900 mb-3">🚀 Upgrade to Pro Service</h4>
                        <ul className="text-left text-blue-800 space-y-2 mb-4">
                          <li className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Unlimited document verifications
                          </li>
                          <li className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Advanced metadata analysis
                          </li>
                          <li className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Batch document processing
                          </li>
                          <li className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Detailed verification reports
                          </li>
                        </ul>
                        <button className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
                          Upgrade to Pro - $9.99/month
                        </button>
                      </div>
                      
                      <p className="text-sm text-gray-500">Your free check will reset tomorrow. Come back then for another free verification!</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center">
                  <div className="mb-6">
                    <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                      <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Verification Complete!</h3>
                    <p className="text-gray-600">Your COS document has been analyzed</p>
                  </div>

                  <div className="mb-6">
                    <div className={`inline-block px-6 py-3 rounded-full text-lg font-semibold transition-all duration-700 ease-in-out transform hover:scale-105 ${
                      verificationResult.type === 'Genuine' 
                        ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white shadow-lg shadow-green-500/25 animate-pulse'
                        : verificationResult.type === 'Edited'
                        ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white shadow-lg shadow-yellow-500/25 animate-bounce'
                        : 'bg-gradient-to-r from-red-400 to-rose-500 text-white shadow-lg shadow-red-500/25 animate-pulse'
                    }`}>
                      {verificationResult.type}
                    </div>
                  </div>

                  <div className="space-y-3 mb-6">
                    <button
                      onClick={() => {
                        setShowFreeCheck(false);
                        setVerificationResult(null);
                      }}
                      className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                    >
                      Close
                    </button>
                  </div>

                  <div className="text-sm text-gray-500 bg-gray-50 p-4 rounded-lg">
                    <p className="font-medium mb-1">✨ Want more detailed analysis?</p>
                    <p>Upgrade to our Pro service for advanced metadata analysis, batch verification, and detailed reporting.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3D Demo Modal with Complete Visualization */}
      {showDemo && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 rounded-2xl p-8 max-w-7xl w-full max-h-[95vh] overflow-y-auto relative">
            {/* Floating Security Elements */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {[...Array(10)].map((_, i) => (
                <div
                  key={i}
                  className="absolute animate-float opacity-20"
                  style={{
                    left: `${Math.random() * 100}%`,
                    top: `${Math.random() * 100}%`,
                    animationDelay: `${Math.random() * 5}s`,
                    animationDuration: `${4 + Math.random() * 3}s`,
                  }}
                >
                  <svg className="w-6 h-6 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                </div>
              ))}
            </div>

            {/* Close Button */}
            <button
              onClick={() => setShowDemo(false)}
              className="absolute top-4 right-4 text-white hover:text-gray-300 z-10 bg-white/10 rounded-full p-2 backdrop-blur-sm"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Demo Header */}
            <div className="text-center mb-8">
              <h2 className="text-5xl font-bold text-white mb-4 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                COS Verification Demo
              </h2>
              <p className="text-blue-200 text-xl max-w-3xl mx-auto">
                Experience our comprehensive AI-powered document verification ecosystem with security-first architecture
              </p>
            </div>

            {/* Three-Section Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
              
              {/* Left: User Journey Flow */}
              <div className="space-y-6">
                <h3 className="text-2xl font-bold text-white mb-6 flex items-center">
                  <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center mr-3 animate-pulse">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  User Journey
                </h3>

                {/* User Avatar */}
                <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 transform hover:scale-105 transition-all duration-300">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center animate-pulse">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-white font-semibold">User Avatar</h4>
                      <p className="text-blue-200 text-sm">Secure authentication</p>
                    </div>
                  </div>
                </div>

                {/* Connection Arrow */}
                <div className="flex justify-center">
                  <div className="w-px h-8 bg-gradient-to-b from-blue-400 to-green-400 animate-pulse"></div>
                </div>

                {/* 3D Upload Button */}
                <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 transform hover:scale-105 transition-all duration-300">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl mx-auto mb-3 flex items-center justify-center transform rotate-3 hover:rotate-0 transition-transform duration-300 shadow-lg">
                      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <h4 className="text-white font-semibold">3D Upload Button</h4>
                    <p className="text-blue-200 text-sm">Interactive file upload</p>
                  </div>
                </div>

                {/* Connection Arrow */}
                <div className="flex justify-center">
                  <div className="w-px h-8 bg-gradient-to-b from-green-400 to-purple-400 animate-pulse"></div>
                </div>

                {/* Animated File Upload Area */}
                <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 border-dashed transform hover:scale-105 transition-all duration-300">
                  <div className="text-center py-6">
                    <div className="relative">
                      <svg className="w-12 h-12 text-blue-400 mx-auto mb-3 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-ping"></div>
                    </div>
                    <h4 className="text-white font-semibold">Animated Upload Area</h4>
                    <p className="text-blue-200 text-sm">Drag & drop with visual feedback</p>
                  </div>
                </div>

                {/* Connection Arrow */}
                <div className="flex justify-center">
                  <div className="w-px h-8 bg-gradient-to-b from-purple-400 to-pink-400 animate-pulse"></div>
                </div>

                {/* Interactive Result Display */}
                <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 transform hover:scale-105 transition-all duration-300">
                  <div className="text-center">
                    <div className="inline-block px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full text-white font-bold mb-3 animate-pulse">
                      GENUINE DOCUMENT
                    </div>
                    <h4 className="text-white font-semibold">Interactive Result Panel</h4>
                    <p className="text-blue-200 text-sm">Real-time verification display</p>
                  </div>
                </div>

                {/* Connection Arrow */}
                <div className="flex justify-center">
                  <div className="w-px h-8 bg-gradient-to-b from-pink-400 to-orange-400 animate-pulse"></div>
                </div>

                {/* Subscription CTA */}
                <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 transform hover:scale-105 transition-all duration-300">
                  <div className="text-center">
                    <button className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full text-white font-bold hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
                      Get Detailed Analysis
                    </button>
                    <p className="text-blue-200 text-sm mt-2">Subscription call-to-action</p>
                  </div>
                </div>
              </div>

              {/* Center: AI/ML Processing Pipeline */}
              <div className="space-y-4">
                <h3 className="text-2xl font-bold text-white mb-6 flex items-center">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center mr-3 animate-pulse">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  AI/ML Pipeline
                </h3>

                {/* Glowing connection lines */}
                <div className="relative">
                  {/* Metadata Extraction */}
                  <div className="bg-gradient-to-r from-blue-600/20 to-cyan-600/20 backdrop-blur-sm rounded-xl p-4 border border-blue-400/30 transform hover:scale-105 transition-all duration-300 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-400/10 to-transparent translate-x-[-100%] animate-pulse"></div>
                    <div className="flex items-center space-x-3 relative z-10">
                      <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center animate-pulse">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="font-semibold text-white">Metadata Extraction</h4>
                        <p className="text-blue-200 text-xs">PDF structure analysis</p>
                      </div>
                    </div>
                  </div>

                  {/* Glowing connection */}
                  <div className="flex justify-center py-2">
                    <div className="w-2 h-6 bg-gradient-to-b from-blue-400 to-purple-400 rounded-full animate-pulse"></div>
                  </div>

                  {/* Pattern Recognition */}
                  <div className="bg-gradient-to-r from-purple-600/20 to-pink-600/20 backdrop-blur-sm rounded-xl p-4 border border-purple-400/30 transform hover:scale-105 transition-all duration-300 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-purple-400/10 to-transparent translate-x-[-100%] animate-pulse"></div>
                    <div className="flex items-center space-x-3 relative z-10">
                      <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center animate-pulse">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="font-semibold text-white">Pattern Recognition</h4>
                        <p className="text-blue-200 text-xs">Document fingerprinting</p>
                      </div>
                    </div>
                  </div>

                  {/* Glowing connection */}
                  <div className="flex justify-center py-2">
                    <div className="w-2 h-6 bg-gradient-to-b from-purple-400 to-red-400 rounded-full animate-pulse"></div>
                  </div>

                  {/* Anomaly Detection */}
                  <div className="bg-gradient-to-r from-red-600/20 to-orange-600/20 backdrop-blur-sm rounded-xl p-4 border border-red-400/30 transform hover:scale-105 transition-all duration-300 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-red-400/10 to-transparent translate-x-[-100%] animate-pulse"></div>
                    <div className="flex items-center space-x-3 relative z-10">
                      <div className="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center animate-pulse">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="font-semibold text-white">Anomaly Detection</h4>
                        <p className="text-blue-200 text-xs">Suspicious modification detection</p>
                      </div>
                    </div>
                  </div>

                  {/* Glowing connection */}
                  <div className="flex justify-center py-2">
                    <div className="w-2 h-6 bg-gradient-to-b from-red-400 to-green-400 rounded-full animate-pulse"></div>
                  </div>

                  {/* Cross-Reference Database */}
                  <div className="bg-gradient-to-r from-green-600/20 to-teal-600/20 backdrop-blur-sm rounded-xl p-4 border border-green-400/30 transform hover:scale-105 transition-all duration-300 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-green-400/10 to-transparent translate-x-[-100%] animate-pulse"></div>
                    <div className="flex items-center space-x-3 relative z-10">
                      <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center animate-pulse">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="font-semibold text-white">Cross-Reference DB</h4>
                        <p className="text-blue-200 text-xs">Trusted pattern matching</p>
                      </div>
                    </div>
                  </div>

                  {/* Glowing connection */}
                  <div className="flex justify-center py-2">
                    <div className="w-2 h-6 bg-gradient-to-b from-green-400 to-indigo-400 rounded-full animate-pulse"></div>
                  </div>

                  {/* Result Generation */}
                  <div className="bg-gradient-to-r from-indigo-600/20 to-blue-600/20 backdrop-blur-sm rounded-xl p-4 border border-indigo-400/30 transform hover:scale-105 transition-all duration-300 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-400/10 to-transparent translate-x-[-100%] animate-pulse"></div>
                    <div className="flex items-center space-x-3 relative z-10">
                      <div className="w-10 h-10 bg-indigo-500 rounded-lg flex items-center justify-center animate-pulse">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="font-semibold text-white">Result Generation</h4>
                        <p className="text-blue-200 text-xs">Final verification report</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Expert Review System */}
              <div className="space-y-6">
                <h3 className="text-2xl font-bold text-white mb-6 flex items-center">
                  <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-full flex items-center justify-center mr-3 animate-pulse">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  Expert Review
                </h3>

                {/* Automated Analysis Result */}
                <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 transform hover:scale-105 transition-all duration-300">
                  <div className="text-center">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg mx-auto mb-3 flex items-center justify-center animate-pulse">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <h4 className="text-white font-semibold">Automated Analysis</h4>
                    <p className="text-blue-200 text-sm">AI processing complete</p>
                  </div>
                </div>

                {/* Connection Line */}
                <div className="flex justify-center">
                  <div className="w-px h-8 bg-gradient-to-b from-blue-400 to-yellow-400 animate-pulse"></div>
                </div>

                {/* Escalation Decision Node */}
                <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-yellow-400/30 transform hover:scale-105 transition-all duration-300">
                  <div className="text-center">
                    <div className="w-12 h-12 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-lg mx-auto mb-3 flex items-center justify-center animate-pulse">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <h4 className="text-white font-semibold">Escalation Decision</h4>
                    <p className="text-blue-200 text-sm">Human review needed?</p>
                  </div>
                </div>

                {/* Branching Paths */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Quick Report Path */}
                  <div className="bg-white/5 backdrop-blur-sm rounded-xl p-3 border border-green-400/30">
                    <div className="text-center">
                      <div className="w-10 h-10 bg-green-500 rounded-lg mx-auto mb-2 flex items-center justify-center animate-pulse">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                      <h5 className="text-white font-medium text-sm">Quick Report</h5>
                      <p className="text-blue-200 text-xs">Automated delivery</p>
                    </div>
                  </div>

                  {/* Human Expert Path */}
                  <div className="bg-white/5 backdrop-blur-sm rounded-xl p-3 border border-purple-400/30">
                    <div className="text-center">
                      <div className="w-10 h-10 bg-purple-500 rounded-lg mx-auto mb-2 flex items-center justify-center animate-pulse">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <h5 className="text-white font-medium text-sm">Expert Review</h5>
                      <p className="text-blue-200 text-xs">Manual verification</p>
                    </div>
                  </div>
                </div>

                {/* Connection Line */}
                <div className="flex justify-center">
                  <div className="w-px h-8 bg-gradient-to-b from-purple-400 to-blue-400 animate-pulse"></div>
                </div>

                {/* Detailed Analysis Report */}
                <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 transform hover:scale-105 transition-all duration-300">
                  <div className="text-center">
                    <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg mx-auto mb-3 flex items-center justify-center animate-pulse">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <h4 className="text-white font-semibold">Detailed Analysis</h4>
                    <p className="text-blue-200 text-sm">Comprehensive report</p>
                  </div>
                </div>

                {/* Connection Line */}
                <div className="flex justify-center">
                  <div className="w-px h-8 bg-gradient-to-b from-blue-400 to-green-400 animate-pulse"></div>
                </div>

                {/* Secure Delivery */}
                <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-green-400/30 transform hover:scale-105 transition-all duration-300">
                  <div className="text-center">
                    <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg mx-auto mb-3 flex items-center justify-center animate-pulse">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <h4 className="text-white font-semibold">Secure Delivery</h4>
                    <p className="text-blue-200 text-sm">Encrypted transmission</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Security & Trust Footer */}
            <div className="mt-8 bg-gradient-to-r from-gray-800/50 to-blue-800/50 backdrop-blur-sm rounded-xl p-6 border border-white/10">
              <h4 className="text-xl font-bold text-white mb-4 text-center flex items-center justify-center">
                <svg className="w-6 h-6 mr-2 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Security & Trust Elements
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="w-12 h-12 bg-blue-500 rounded-lg mx-auto mb-2 flex items-center justify-center animate-pulse">
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <p className="text-white text-sm font-medium">Secure File Handling</p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-green-500 rounded-lg mx-auto mb-2 flex items-center justify-center animate-pulse">
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <p className="text-white text-sm font-medium">Data Protection</p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-purple-500 rounded-lg mx-auto mb-2 flex items-center justify-center animate-pulse">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                    </svg>
                  </div>
                  <p className="text-white text-sm font-medium">Encrypted Connections</p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-indigo-500 rounded-lg mx-auto mb-2 flex items-center justify-center animate-pulse">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <p className="text-white text-sm font-medium">Privacy Policy</p>
                </div>
              </div>
            </div>

            {/* Demo Footer */}
            <div className="mt-8 text-center">
              <button 
                onClick={() => {
                  setShowDemo(false);
                  setShowFreeCheck(true);
                }}
                className="px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full text-white font-bold text-lg hover:shadow-xl hover:shadow-green-500/50 transition-all duration-300 transform hover:-translate-y-1 hover:scale-105"
              >
                <svg className="w-5 h-5 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Try It Now - Free Check
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}