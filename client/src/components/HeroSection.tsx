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
      className="group relative p-8 bg-card brutalist-border rounded-sm grain overflow-hidden hover:border-foreground/20 transition-colors duration-300"
    >
      <div className="relative z-10">
        <div className="mb-6 inline-flex items-center justify-center w-12 h-12 brutalist-border-strong rounded-sm">
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
      className="text-center p-8 brutalist-border rounded-sm grain relative overflow-hidden"
    >
      <div className="relative z-10">
        <div className="text-4xl font-black tracking-tight text-foreground mb-1">
          {number}
        </div>
        <div className="editorial-caption text-muted-foreground">
          {label}
        </div>
      </div>
    </motion.div>
  )
}

function LoadingFallback() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-muted/30">
      <div className="text-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"
        />
        <p className="editorial-caption text-muted-foreground">Loading</p>
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
      <div className="relative grain overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.03] to-transparent dark:from-primary/[0.06]" />
        
        <div className="relative z-10 max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="grid lg:grid-cols-2 gap-16 items-center min-h-screen py-24">
            <div className="space-y-10">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={isLoaded ? { opacity: 1, x: 0 } : {}}
                transition={{ ...springGentle, delay: 0.1 }}
              >
                <span className="editorial-caption text-primary inline-flex items-center gap-2 pb-1 border-b border-primary/30">
                  <Shield className="w-3.5 h-3.5" />
                  UK Immigration Document Verification
                </span>
              </motion.div>
              
              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={isLoaded ? { opacity: 1, y: 0 } : {}}
                transition={{ ...spring, delay: 0.2 }}
                className="text-5xl sm:text-6xl lg:text-7xl editorial-heading text-foreground"
              >
                Verify Your
                <br />
                <span className="text-primary">
                  Certificate of
                  <br />
                  Sponsorship
                </span>
              </motion.h1>
              
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={isLoaded ? { opacity: 1, y: 0 } : {}}
                transition={{ ...springGentle, delay: 0.35 }}
                className="text-base editorial-body text-muted-foreground max-w-lg"
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
                  className="bg-foreground hover:bg-foreground/90 text-background px-8 py-3 rounded-sm font-semibold tracking-tight transition-all duration-200"
                  onClick={onStartVerification}
                >
                  Verify Your CoS
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
                
                <Button 
                  variant="outline" 
                  size="lg"
                  className="brutalist-border-strong rounded-sm px-6 py-3 font-semibold tracking-tight transition-all duration-200 hover:bg-foreground hover:text-background"
                  onClick={() => setShowDemo(true)}
                >
                  <Play className="mr-2 w-4 h-4" />
                  Watch Demo
                </Button>

                <Link href="/pricing">
                  <Button 
                    variant="ghost" 
                    size="lg"
                    className="rounded-sm px-6 py-3 font-medium text-muted-foreground hover:text-foreground transition-colors duration-200"
                  >
                    <CreditCard className="mr-2 w-4 h-4" />
                    Get Credits
                  </Button>
                </Link>
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
                  <div key={i} className="flex items-center gap-2 text-muted-foreground">
                    {item.icon}
                    <span className="text-xs font-medium tracking-wide">{item.label}</span>
                  </div>
                ))}
              </motion.div>
            </div>
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={isLoaded ? { opacity: 1, scale: 1 } : {}}
              transition={{ ...springGentle, delay: 0.3 }}
              className="lg:h-[560px] h-[360px] relative brutalist-border rounded-sm overflow-hidden"
            >
              <Suspense fallback={<LoadingFallback />}>
                <AnimatedBackground />
              </Suspense>
            </motion.div>
          </div>
        </div>

        <div className="editorial-divider" />
      </div>

      <section className="py-24 bg-background">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="max-w-2xl mb-16">
            <span className="editorial-caption text-muted-foreground block mb-4">Why Trust Us</span>
            <h2 className="text-3xl sm:text-4xl editorial-subheading text-foreground mb-4">
              Why UK Visa Applicants Trust Check By AI
            </h2>
            <p className="text-base editorial-body text-muted-foreground">
              The UK's most trusted <a href="/cos-guide" className="text-primary hover:underline">Certificate of Sponsorship verification platform</a> for Skilled Worker visas.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <FeatureCard
              icon={<Shield className="w-5 h-5 text-foreground" />}
              title="UK Home Office Compliance"
              description="Our AI analyzes your Certificate of Sponsorship against official UK Home Office document patterns. Detect fake CoS documents before submitting your Skilled Worker visa application."
              index={0}
            />
            <FeatureCard
              icon={<Zap className="w-5 h-5 text-foreground" />}
              title="Instant UK CoS Verification"
              description="Get verification results in seconds. Perfect for UK employers checking sponsor licence documents or visa applicants verifying their Certificate of Sponsorship authenticity."
              index={1}
            />
            <FeatureCard
              icon={<Lock className="w-5 h-5 text-foreground" />}
              title="UK Data Protection Standards"
              description="Your Certificate of Sponsorship is processed securely under UK GDPR and the Data Protection Act 2018. We process metadata only, and documents are deleted immediately after verification."
              index={2}
            />
          </div>
        </div>
      </section>

      <div className="editorial-divider" />

      <section className="py-24 bg-muted/30 grain relative overflow-hidden" ref={statsRef}>
        <div className="relative z-10 max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="max-w-2xl mb-16">
            <span className="editorial-caption text-muted-foreground block mb-4">Performance</span>
            <h2 className="text-3xl sm:text-4xl editorial-subheading text-foreground mb-4">
              Trusted Across the United Kingdom
            </h2>
            <p className="text-base editorial-body text-muted-foreground">
              Real performance metrics from <a href="/dashboard" className="text-primary hover:underline">UK CoS verification</a> deployments
            </p>
          </div>
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard number="99.8%" label="Accuracy Rate" index={0} />
            <StatCard number="800+" label="Docs per Second" index={1} />
            <StatCard number="<1ms" label="Response Time" index={2} />
            <StatCard number="10K+" label="Documents Verified" index={3} />
          </div>
        </div>
      </section>

      <div className="editorial-divider" />
      
      <section className="py-24 bg-background">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="max-w-2xl mb-16">
            <span className="editorial-caption text-muted-foreground block mb-4">Resources</span>
            <h2 className="text-3xl sm:text-4xl editorial-subheading text-foreground mb-4">
              UK CoS Verification Resources
            </h2>
            <p className="text-base editorial-body text-muted-foreground">
              Explore our <a href="/ai-guide" className="text-primary hover:underline">verification tools</a> and <a href="/cos-guide" className="text-primary hover:underline">Home Office compliance guides</a>
            </p>
          </div>
          <NavigationLinks className="max-w-4xl" />
        </div>
      </section>
      
      <Footer />
    </div>
    </>
  )
}
