import { useState, useEffect, Suspense, lazy } from 'react'
import { useSpring, animated } from '@react-spring/web'
import { useInView } from 'react-intersection-observer'
import { Shield, Zap, Lock, Award, ArrowRight, Play, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import GoogleLoginButton from '@/components/GoogleLoginButton'
import NavigationLinks from '@/components/NavigationLinks'

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
                COS Check by AI - Advanced Verification
              </div>
              
              <h1 className="text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white leading-tight">
                COS Check by AI - 
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
                  {' '}Check by AI Technology
                </span>
              </h1>
              
              <p className="text-xl text-gray-600 dark:text-gray-300 leading-relaxed max-w-2xl">
                <a href="/cos-check-ai.html" className="text-blue-600 hover:text-blue-700 underline">COS check by AI</a> - Official Certificate of Sponsorship verification service powered by advanced artificial intelligence. <a href="/dashboard" className="text-blue-600 hover:text-blue-700 underline">Check by AI technology</a> using machine learning algorithms to detect fake or edited COS documents with 99.9% accuracy and instant results.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <Button 
                  size="lg" 
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-3 rounded-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-300"
                  onClick={onStartVerification}
                >
                  Start COS Check by AI
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

                <Dialog>
                  <DialogTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="lg"
                      className="border-2 border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800 px-8 py-3 rounded-lg font-semibold transition-all duration-300"
                    >
                      <User className="mr-2 w-5 h-5" />
                      Sign In
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Sign in to your account</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <GoogleLoginButton size="lg" className="w-full" />
                      <Button
                        variant="outline"
                        size="lg"
                        className="w-full"
                        onClick={() => window.location.href = "/api/login"}
                      >
                        Continue with Replit
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
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
              Why Choose COS Check by AI?
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
              The most trusted <a href="/cos-guide.html" className="text-blue-600 hover:text-blue-700 underline">Certificate of Sponsorship verification platform</a> powered by artificial intelligence. Advanced AI technology meets enterprise-grade security to deliver unmatched <a href="/dashboard" className="text-blue-600 hover:text-blue-700 underline">COS document authentication</a> capabilities with check by AI precision.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard
              icon={<Shield className="w-8 h-8 text-blue-600" />}
              title="COS Check by AI Verification"
              description="Advanced AI machine learning algorithms analyze Certificate of Sponsorship metadata, patterns, and structure to detect fake COS documents with 99.9% accuracy using <a href='/cos-check-ai.html' class='text-blue-600 hover:text-blue-700 underline'>check by AI technology</a>."
              delay={0}
            />
            
            <FeatureCard
              icon={<Zap className="w-8 h-8 text-green-600" />}
              title="Instant COS Check by AI Results"
              description="Process COS documents instantly with AI-powered sub-second response times. Get immediate <a href='/dashboard' class='text-blue-600 hover:text-blue-700 underline'>verification results</a> for your Certificate of Sponsorship authenticity using advanced check by AI algorithms."
              delay={200}
            />
            
            <FeatureCard
              icon={<Lock className="w-8 h-8 text-red-600" />}
              title="Secure AI COS Processing"
              description="Bank-grade encryption and secure AI data handling ensure your <a href='/cos-guide.html' class='text-blue-600 hover:text-blue-700 underline'>Certificate of Sponsorship documents</a> are processed with maximum security and privacy using check by AI technology."
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
              Trusted by Organizations Worldwide
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Real performance metrics from real-world <a href="/dashboard" className="text-blue-600 hover:text-blue-700 underline">COS check by AI deployment</a>
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
              Explore COS Check by AI Services
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300">
              Discover all our <a href="/cos-check-ai.html" className="text-blue-600 hover:text-blue-700 underline">AI-powered verification tools</a> and <a href="/cos-guide.html" className="text-blue-600 hover:text-blue-700 underline">resources</a> for Certificate of Sponsorship checking
            </p>
          </div>
          <NavigationLinks className="max-w-4xl mx-auto" />
        </div>
      </div>
    </div>
    </>
  )
}