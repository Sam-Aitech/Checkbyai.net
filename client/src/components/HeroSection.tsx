import { useState, useEffect, Suspense, lazy } from 'react'
import { useSpring, animated } from '@react-spring/web'
import { useInView } from 'react-intersection-observer'
import { Shield, Zap, Lock, Award, ArrowRight, Play, User, CreditCard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Link } from 'wouter'
import GoogleLoginButton from '@/components/GoogleLoginButton'
import NavigationLinks from '@/components/NavigationLinks'
import CreditCounter from '@/components/CreditCounter'
import Footer from '@/components/Footer'

// Lazy load the 3D scene for better performance with fallback
const ThreeScene = lazy(() => import('./ThreeScene'))
const AnimatedBackground = lazy(() => import('./AnimatedBackground'))
const Enhanced3DDemo = lazy(() => import('./Enhanced3DDemo'))

interface FeatureCardProps {
  icon: React.ReactNode
  title: string
  description: string
  delay: number
}

function FeatureCard({ icon, title, description, delay }: FeatureCardProps) {
  const [ref, inView] = useInView({
    triggerOnce: true,
    threshold: 0.1,
  })

  const animation = useSpring({
    opacity: inView ? 1 : 0,
    transform: inView ? 'translateY(0px)' : 'translateY(50px)',
    delay: delay,
    config: { mass: 1, tension: 280, friction: 60 },
  })

  return (
    <animated.div
      ref={ref}
      style={animation}
      className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300 border border-gray-200 dark:border-gray-700"
    >
      <div className="flex items-center mb-4">
        <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg mr-4">
          {icon}
        </div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
          {title}
        </h3>
      </div>
      <p className="text-gray-600 dark:text-gray-300 leading-relaxed" dangerouslySetInnerHTML={{ __html: description }}>
      </p>
    </animated.div>
  )
}

interface StatCardProps {
  number: string
  label: string
  delay: number
}

function StatCard({ number, label, delay }: StatCardProps) {
  const [ref, inView] = useInView({
    triggerOnce: true,
    threshold: 0.1,
  })

  const { value } = useSpring({
    value: inView ? parseFloat(number) : 0,
    delay: delay,
    config: { mass: 1, tension: 280, friction: 60 },
  })

  return (
    <animated.div
      ref={ref}
      className="text-center p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg"
    >
      <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-2">
        {Math.floor(parseFloat(number))}
        {number.includes('.') && `.${number.split('.')[1]}`}
        {number.includes('%') && '%'}
        {number.includes('+') && '+'}
      </div>
      <div className="text-gray-600 dark:text-gray-300 text-sm font-medium">
        {label}
      </div>
    </animated.div>
  )
}

function LoadingFallback() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-800 dark:to-gray-900">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600 dark:text-gray-300">Loading 3D Experience...</p>
      </div>
    </div>
  )
}

interface HeroSectionProps {
  onStartVerification?: () => void;
}

export default function HeroSection({ onStartVerification }: HeroSectionProps) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [showDemo, setShowDemo] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 500)
    return () => clearTimeout(timer)
  }, [])

  const heroAnimation = useSpring({
    opacity: isLoaded ? 1 : 0,
    transform: isLoaded ? 'translateY(0px)' : 'translateY(30px)',
    config: { mass: 1, tension: 280, friction: 60 },
  })

  const [statsRef, statsInView] = useInView({
    triggerOnce: true,
    threshold: 0.1,
  })

  return (
    <>
      {/* Enhanced 3D Demo Modal */}
      {showDemo && (
        <Suspense fallback={<LoadingFallback />}>
          <Enhanced3DDemo 
            isVisible={showDemo} 
            onClose={() => setShowDemo(false)}
            onTryFreeCheck={() => {
              setShowDemo(false);
              window.location.href = '/dashboard';
            }}
          />
        </Suspense>
      )}
      
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Hero Section */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 to-purple-600/10 dark:from-blue-600/5 dark:to-purple-600/5"></div>
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center min-h-screen py-20">
            {/* Left Content */}
            <animated.div style={heroAnimation} className="space-y-8">
              <div className="inline-flex items-center px-4 py-2 bg-blue-100 dark:bg-blue-900 rounded-full text-blue-800 dark:text-blue-200 text-sm font-medium">
                <Shield className="w-4 h-4 mr-2" />
                UK Immigration Document Verification
              </div>
              
              <h1 className="text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white leading-tight">
                Verify Your UK Certificate of Sponsorship is 
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
                  {' '}Genuine
                </span>
              </h1>
              
              <p className="text-xl text-gray-600 dark:text-gray-300 leading-relaxed max-w-2xl">
                Free AI-powered verification for UK Skilled Worker visa applicants. Our advanced system checks your CoS document against Home Office standards to detect fake or edited documents with 99.9% accuracy. Trusted by UK employers and immigration advisors.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <Button 
                  size="lg" 
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-3 rounded-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-300"
                  onClick={onStartVerification}
                >
                  Verify Your CoS Now
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
                
                <Button 
                  variant="outline" 
                  size="lg"
                  className="border-2 border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900 px-8 py-3 rounded-lg font-semibold transition-all duration-300"
                  onClick={() => setShowDemo(true)}
                >
                  <Play className="mr-2 w-5 h-5" />
                  Watch Demo
                </Button>

                <CreditCounter />

                <Link href="/pricing">
                  <Button 
                    variant="outline" 
                    size="lg"
                    className="border-2 border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-600 dark:text-blue-400 dark:hover:bg-blue-900/30 px-6 py-3 rounded-lg font-semibold transition-all duration-300"
                  >
                    <CreditCard className="mr-2 w-5 h-5" />
                    Get Credits
                  </Button>
                </Link>

              </div>
              

              
              <div className="flex items-center space-x-6 pt-4">
                <div className="flex items-center text-gray-600 dark:text-gray-300">
                  <Award className="w-5 h-5 mr-2 text-yellow-500" />
                  <span className="text-sm font-medium">99.8% Accuracy</span>
                </div>
                <div className="flex items-center text-gray-600 dark:text-gray-300">
                  <Zap className="w-5 h-5 mr-2 text-green-500" />
                  <span className="text-sm font-medium">Sub-second Processing</span>
                </div>
                <div className="flex items-center text-gray-600 dark:text-gray-300">
                  <Lock className="w-5 h-5 mr-2 text-red-500" />
                  <span className="text-sm font-medium">Bank-grade Security</span>
                </div>
              </div>
            </animated.div>
            
            {/* Right Animated Scene */}
            <div className="lg:h-[600px] h-[400px] relative">
              <Suspense fallback={<LoadingFallback />}>
                <AnimatedBackground />
              </Suspense>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-20 bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Why UK Visa Applicants Trust Check By AI
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
              The UK's most trusted <a href="/cos-guide.html" className="text-blue-600 hover:text-blue-700 underline">Certificate of Sponsorship verification platform</a> for Skilled Worker visas. Our AI verifies your CoS meets <a href="/dashboard" className="text-blue-600 hover:text-blue-700 underline">Home Office standards</a> before you apply.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard
              icon={<Shield className="w-8 h-8 text-blue-600" />}
              title="UK Home Office Compliance"
              description="Our AI analyzes your Certificate of Sponsorship against official UK Home Office document patterns. <a href='/cos-check-ai.html' class='text-blue-600 hover:text-blue-700 underline'>Detect fake CoS documents</a> before submitting your Skilled Worker visa application."
              delay={0}
            />
            
            <FeatureCard
              icon={<Zap className="w-8 h-8 text-green-600" />}
              title="Instant UK CoS Verification"
              description="Get <a href='/dashboard' class='text-blue-600 hover:text-blue-700 underline'>verification results</a> in seconds. Perfect for UK employers checking sponsor licence documents or visa applicants verifying their Certificate of Sponsorship authenticity."
              delay={200}
            />
            
            <FeatureCard
              icon={<Lock className="w-8 h-8 text-red-600" />}
              title="UK Data Protection Standards"
              description="Your <a href='/cos-guide.html' class='text-blue-600 hover:text-blue-700 underline'>Certificate of Sponsorship</a> is processed securely with UK data protection compliance. Documents are deleted immediately after verification - no storage, no exposure."
              delay={400}
            />
          </div>
        </div>
      </div>

      {/* Statistics Section */}
      <div className="py-20 bg-gray-50 dark:bg-gray-900" ref={statsRef}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Trusted Across the United Kingdom
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Real performance metrics from <a href="/dashboard" className="text-blue-600 hover:text-blue-700 underline">UK CoS verification</a> deployments
            </p>
          </div>
          
          <div className="grid md:grid-cols-4 gap-8">
            <StatCard number="99.8" label="Accuracy Rate" delay={0} />
            <StatCard number="800+" label="Docs per Second" delay={200} />
            <StatCard number="0.001" label="Average Response Time (s)" delay={400} />
            <StatCard number="10000+" label="Documents Verified" delay={600} />
          </div>
        </div>
      </div>
      
      {/* Quick Navigation Section */}
      <div className="py-16 bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              UK CoS Verification Resources
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300">
              Explore our <a href="/cos-check-ai.html" className="text-blue-600 hover:text-blue-700 underline">UK visa verification tools</a> and <a href="/cos-guide.html" className="text-blue-600 hover:text-blue-700 underline">Home Office compliance guides</a> for Certificate of Sponsorship
            </p>
          </div>
          <NavigationLinks className="max-w-4xl mx-auto" />
        </div>
      </div>
      
      {/* Footer */}
      <Footer />
    </div>
    </>
  )
}