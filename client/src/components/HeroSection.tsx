import { useState, useEffect, Suspense, lazy } from 'react'
import { motion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import { Shield, Zap, Lock, Award, ArrowRight, Play, CreditCard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Link } from 'wouter'
import CreditCounter from '@/components/CreditCounter'
import Footer from '@/components/Footer'
import NavigationLinks from '@/components/NavigationLinks'

const AnimatedBackground = lazy(() => import('./AnimatedBackground'))
const Enhanced3DDemo = lazy(() => import('./Enhanced3DDemo'))

const spring = { type: "spring" as const, stiffness: 100, damping: 15 }
const springGentle = { type: "spring" as const, stiffness: 80, damping: 18 }

function FeatureCard({ icon, title, description, index }: { icon: React.ReactNode; title: string; description: string; index: number }) {
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.15 })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ ...spring, delay: index * 0.12 }}
      className="group theme-card p-8 overflow-hidden"
    >
      <div className="relative z-10">
        <div className="mb-6 inline-flex items-center justify-center w-12 h-12 bg-primary/10 rounded-xl">
          {icon}
        </div>
        <h3 className="text-lg editorial-subheading text-foreground mb-3">
          {title}
        </h3>
        <p className="text-sm editorial-body text-muted-foreground">
          {description}
        </p>
      </div>
    </motion.div>
  )
}

function StatCard({ number, label, index }: { number: string; label: string; index: number }) {
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.15 })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={inView ? { opacity: 1, scale: 1 } : {}}
      transition={{ ...spring, delay: index * 0.1 }}
      className="text-center p-8"
    >
      <div className="text-4xl font-bold tracking-tight text-foreground mb-2">
        {number}
      </div>
      <div className="text-sm text-muted-foreground font-medium">
        {label}
      </div>
    </motion.div>
  )
}

function LoadingFallback() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-primary/5">
      <div className="text-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"
        />
        <p className="text-sm text-muted-foreground">Loading</p>
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
    const timer = setTimeout(() => setIsLoaded(true), 300)
    return () => clearTimeout(timer)
  }, [])

  const [statsRef, statsInView] = useInView({
    triggerOnce: true,
    threshold: 0.1,
  })

  return (
    <>
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
      
    <div className="min-h-screen bg-background">
      <div className="relative overflow-hidden">
        <div className="theme-gradient pb-32 pt-8">
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
            <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-white/5 rounded-full blur-3xl" />
          </div>

          <div className="relative z-10 max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
            <nav className="flex justify-between items-center py-4 mb-8">
              <Link href="/" className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-sm">
                  <Shield className="text-white w-5 h-5" />
                </div>
                <span className="text-white font-bold tracking-tight">Check By AI</span>
              </Link>

              <div className="hidden md:flex items-center gap-1">
                {[
                  { href: "/dashboard", label: "Verify CoS" },
                  { href: "/pricing", label: "Pricing" },
                  { href: "/ai-guide", label: "AI Guide" },
                  { href: "/cos-guide", label: "CoS Guide" },
                  { href: "/technology", label: "Technology" },
                  { href: "/api-docs", label: "API" },
                ].map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="px-4 py-2 text-sm text-white/70 hover:text-white font-medium rounded-full hover:bg-white/10 transition-all duration-200"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>

              <Link href="/login">
                <Button 
                  size="sm"
                  className="bg-white text-primary hover:bg-white/90 rounded-full px-5 font-semibold text-sm shadow-lg shadow-black/10"
                >
                  Sign up free
                </Button>
              </Link>
            </nav>

            <div className="grid lg:grid-cols-2 gap-16 items-center min-h-[70vh] py-12">
              <div className="space-y-8">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={isLoaded ? { opacity: 1, x: 0 } : {}}
                  transition={{ ...springGentle, delay: 0.1 }}
                >
                  <span className="inline-flex items-center gap-2 text-white/70 text-sm font-medium bg-white/10 px-4 py-2 rounded-full backdrop-blur-sm">
                    <Shield className="w-4 h-4" />
                    UK Immigration Document Verification
                  </span>
                </motion.div>
                
                <motion.h1
                  initial={{ opacity: 0, y: 30 }}
                  animate={isLoaded ? { opacity: 1, y: 0 } : {}}
                  transition={{ ...spring, delay: 0.2 }}
                  className="text-4xl sm:text-5xl lg:text-6xl editorial-heading text-white"
                >
                  Verify Your{' '}
                  <span className="bg-gradient-to-r from-white via-white/90 to-white/60 bg-clip-text text-transparent">
                    Certificate of Sponsorship
                  </span>
                </motion.h1>
                
                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={isLoaded ? { opacity: 1, y: 0 } : {}}
                  transition={{ ...springGentle, delay: 0.35 }}
                  className="text-base text-white/70 max-w-lg leading-relaxed"
                >
                  AI-powered forensic analysis for UK Skilled Worker visa applicants. 
                  Detect fake or edited CoS documents against Home Office standards 
                  with 99.8% accuracy.
                </motion.p>
                
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={isLoaded ? { opacity: 1, y: 0 } : {}}
                  transition={{ ...spring, delay: 0.45 }}
                  className="flex flex-col sm:flex-row gap-3"
                >
                  <Button 
                    size="lg" 
                    className="bg-white text-primary hover:bg-white/90 px-8 py-3 rounded-full font-semibold shadow-xl shadow-black/15 transition-all duration-200"
                    onClick={onStartVerification}
                  >
                    Get Started
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    size="lg"
                    className="border-white/30 text-white hover:bg-white/10 rounded-full px-6 py-3 font-semibold transition-all duration-200 bg-transparent"
                    onClick={() => setShowDemo(true)}
                  >
                    <Play className="mr-2 w-4 h-4" />
                    Watch Demo
                  </Button>
                </motion.div>

                <CreditCounter />
                
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={isLoaded ? { opacity: 1 } : {}}
                  transition={{ ...springGentle, delay: 0.6 }}
                  className="flex items-center gap-8 pt-2"
                >
                  {[
                    { icon: <Award className="w-4 h-4" />, label: "99.8% Accuracy" },
                    { icon: <Zap className="w-4 h-4" />, label: "Sub-second" },
                    { icon: <Lock className="w-4 h-4" />, label: "UK GDPR" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-white/60">
                      {item.icon}
                      <span className="text-xs font-medium">{item.label}</span>
                    </div>
                  ))}
                </motion.div>
              </div>
              
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={isLoaded ? { opacity: 1, scale: 1 } : {}}
                transition={{ ...springGentle, delay: 0.3 }}
                className="lg:h-[480px] h-[320px] relative rounded-2xl overflow-hidden shadow-2xl shadow-black/20 border border-white/10"
              >
                <Suspense fallback={<LoadingFallback />}>
                  <AnimatedBackground />
                </Suspense>
              </motion.div>
            </div>
          </div>
        </div>

        <div className="bg-background -mt-16 relative z-10 rounded-t-[2rem]">
          <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 pt-20">
            <div className="text-center mb-4">
              <span className="editorial-caption text-muted-foreground">Trusted By</span>
            </div>
            <div className="flex items-center justify-center gap-8 opacity-40 flex-wrap py-4">
              {["UK Visa Applicants", "Immigration Advisors", "HR Professionals", "Legal Firms"].map((name, i) => (
                <span key={i} className="text-sm font-semibold text-foreground tracking-wide">{name}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <section className="py-24 bg-background">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="editorial-caption text-primary block mb-4">Why Trust Us</span>
            <h2 className="text-3xl sm:text-4xl editorial-subheading text-foreground mb-4">
              Why UK Visa Applicants Trust Check By AI
            </h2>
            <p className="text-base editorial-body text-muted-foreground">
              The UK's most trusted <a href="/cos-guide" className="text-primary hover:underline">Certificate of Sponsorship verification platform</a> for Skilled Worker visas.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Shield className="w-5 h-5 text-primary" />}
              title="UK Home Office Compliance"
              description="Our AI analyzes your Certificate of Sponsorship against official UK Home Office document patterns. Detect fake CoS documents before submitting your Skilled Worker visa application."
              index={0}
            />
            <FeatureCard
              icon={<Zap className="w-5 h-5 text-primary" />}
              title="Instant UK CoS Verification"
              description="Get verification results in seconds. Perfect for UK employers checking sponsor licence documents or visa applicants verifying their Certificate of Sponsorship authenticity."
              index={1}
            />
            <FeatureCard
              icon={<Lock className="w-5 h-5 text-primary" />}
              title="UK Data Protection Standards"
              description="Your Certificate of Sponsorship is processed securely under UK GDPR and the Data Protection Act 2018. We process metadata only, and documents are deleted immediately after verification."
              index={2}
            />
          </div>
        </div>
      </section>

      <section className="py-24 theme-gradient-soft relative overflow-hidden" ref={statsRef}>
        <div className="relative z-10 max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <h2 className="text-3xl sm:text-4xl editorial-subheading text-foreground mb-4">
              We empower individuals and businesses to verify their documents with confidence.
            </h2>
            <p className="text-base editorial-body text-muted-foreground mb-6">
              Real performance metrics from <a href="/dashboard" className="text-primary hover:underline">UK CoS verification</a> deployments
            </p>
            <Link href="/dashboard">
              <Button className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 px-6 font-semibold shadow-lg">
                Get Started
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </div>
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-16">
            <StatCard number="99.8%" label="Accuracy Rate" index={0} />
            <StatCard number="800+" label="Docs per Second" index={1} />
            <StatCard number="<1ms" label="Response Time" index={2} />
            <StatCard number="10K+" label="Documents Verified" index={3} />
          </div>
        </div>
      </section>
      
      <section className="py-24 bg-background">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="editorial-caption text-primary block mb-4">Resources</span>
            <h2 className="text-3xl sm:text-4xl editorial-subheading text-foreground mb-4">
              UK CoS Verification Resources
            </h2>
            <p className="text-base editorial-body text-muted-foreground">
              Explore our <a href="/ai-guide" className="text-primary hover:underline">verification tools</a> and <a href="/cos-guide" className="text-primary hover:underline">Home Office compliance guides</a>
            </p>
          </div>
          <NavigationLinks className="max-w-4xl mx-auto" />
        </div>
      </section>
      
      <Footer />
    </div>
    </>
  )
}
