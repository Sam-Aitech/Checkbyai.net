import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import FileUploadSimple from './FileUploadSimple';
import Enhanced3DDemo from './Enhanced3DDemo';

export default function COSDashboard() {
  const [showFreeCheck, setShowFreeCheck] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [demoStep, setDemoStep] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{type: 'Genuine' | 'Edited' | 'Fake'} | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Track free usage
  const [hasUsedFreeCheck, setHasUsedFreeCheck] = useState(false);

  // Check if user has used their free verification today
  useEffect(() => {
    const today = new Date().toDateString();
    const lastCheck = localStorage.getItem('lastFreeCheck');
    
    if (lastCheck === today) {
      setHasUsedFreeCheck(true);
    } else {
      setHasUsedFreeCheck(false);
    }
  }, []);

  const handleFileUpload = async (file: File) => {
    // Mark free check as used
    const today = new Date().toDateString();
    localStorage.setItem('lastFreeCheck', today);
    setHasUsedFreeCheck(true);
  };

  const handleVerificationResult = (result: {type: 'Genuine' | 'Edited' | 'Fake'}) => {
    setVerificationResult(result);
  };

  const handleLoading = (loading: boolean) => {
    setIsLoading(loading);
  };

  const handleError = (error: string) => {
    console.error('Verification error:', error);
  };

  // Demo animation handler
  const startDemo = () => {
    setDemoStep(0);
    setIsAnimating(true);
    
    // Step sequence timing
    const steps = [
      { delay: 1000, step: 1 }, // Document upload animation
      { delay: 3000, step: 2 }, // Metadata analysis
      { delay: 5000, step: 3 }, // AI/ML verification
      { delay: 7000, step: 4 }, // Result presentation
      { delay: 9000, step: 5 }, // Detailed analysis option
      { delay: 11000, step: 0 } // Reset to allow replay
    ];

    steps.forEach(({ delay, step }) => {
      setTimeout(() => {
        setDemoStep(step);
        if (step === 0) setIsAnimating(false);
      }, delay);
    });
  };

  const resetDemo = () => {
    setDemoStep(0);
    setIsAnimating(false);
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
                <button 
                  className="group relative inline-flex items-center px-6 py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white font-medium hover:bg-white/20 transition-all duration-300 transform hover:-translate-y-1 hover:shadow-xl"
                >
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
              onClick={startDemo}
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
      <section className="py-20 bg-white">
        <div className="container mx-auto px-5 text-center">
          <h2 className="text-4xl font-bold text-gray-900 mb-12">How COS Verification Works</h2>
          
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
                    <span className="text-gray-700">Invalid security features</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-700">Format violations detected</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Free Check Modal */}
      {showFreeCheck && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white p-6 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900">Free COS Verification</h2>
              <div className="flex items-center gap-3">
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

      {/* Enhanced 3D Demo Modal */}
      <Enhanced3DDemo 
        isVisible={showDemo}
        onClose={() => {
          setShowDemo(false);
          resetDemo();
        }}
        onTryFreeCheck={() => {
          setShowDemo(false);
          setShowFreeCheck(true);
          resetDemo();
        }}
      />
    </div>
  );
}