import { useState, useEffect, Suspense, lazy } from 'react'
import { motion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import { Shield, Zap, Lock, Award, ArrowRight, Play, Bell, Activity, CheckCircle, XCircle, Timer, FileSearch, Wifi, AlertTriangle, ShieldCheck, Eye, Building2, Search, ChevronRight, MapPin, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Link, useLocation } from 'wouter'
import logoImg from "@assets/Checkbyai.net_(250_x_80_px)_(1)_1770958528706.png"
import CreditCounter from '@/components/CreditCounter'
import Footer from '@/components/Footer'
import LandingDigest from '@/components/LandingDigest'

const AnimatedBackground = lazy(() => import('./AnimatedBackground'))
const Enhanced3DDemo = lazy(() => import('./Enhanced3DDemo'))

const spring = { type: "spring" as const, stiffness: 100, damping: 15 }
const springGentle = { type: "spring" as const, stiffness: 80, damping: 18 }

function FeatureCard({ icon, title, description, index }: { icon: React.ReactNode; title: string; description: string; index: number }) {
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.15 })
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 40 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ ...spring, delay: index * 0.12 }} className="group theme-card p-8 overflow-hidden">
      <div className="relative z-10">
        <div className="mb-6 inline-flex items-center justify-center w-12 h-12 bg-primary/10 rounded-xl">{icon}</div>
        <h3 className="text-lg editorial-subheading text-foreground mb-3">{title}</h3>
        <p className="text-sm editorial-body text-muted-foreground">{description}</p>
      </div>
    </motion.div>
  )
}

function LoadingFallback() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-primary/5">
      <div className="text-center">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">Loading</p>
      </div>
    </div>
  )
}

interface HeroSectionProps {
  onStartVerification?: () => void;
}

interface FreeSearchResult {
  fingerprint: string;
  organisationName: string;
  townCity: string | null;
  typeRating: string | null;
  route: string | null;
  status: string;
  matchScore: number;
}

export default function HeroSection({ onStartVerification }: HeroSectionProps) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [showDemo, setShowDemo] = useState(false)
  const [, setLocation] = useLocation()
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<FreeSearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchLimitReached, setSearchLimitReached] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  useEffect(() => {
    setIsLoaded(true)
  }, [])

  const handleSearchSubmit = async () => {
    if (searchQuery.trim().length < 3) return;
    setSearchLoading(true);
    setSearchResults([]);
    setSearchLimitReached(false);
    setHasSearched(true);
    try {
      const res = await fetch(`/api/sponsors/free-search?q=${encodeURIComponent(searchQuery.trim())}`);
      const data = await res.json();
      if (res.status === 429 && data.limitReached) {
        setSearchLimitReached(true);
      } else if (res.ok) {
        setSearchResults(data.results || []);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }

  return (
    <>
      {showDemo && (
        <Suspense fallback={<LoadingFallback />}>
          <Enhanced3DDemo
            isVisible={showDemo}
            onClose={() => setShowDemo(false)}
            onTryFreeCheck={() => { setShowDemo(false); window.location.href = '/dashboard'; }}
          />
        </Suspense>
      )}

    <div className="min-h-screen bg-background">
      <div className="bg-red-700 text-white">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-center gap-2 text-center">
          <Activity className="w-4 h-4 shrink-0 animate-pulse" />
          <p className="text-xs sm:text-sm font-medium">
            <span className="font-bold">URGENT:</span> 3 sponsor licences revoked in the last 48 hours. Are you monitoring your employer?
          </p>
        </div>
      </div>

      <div className="relative overflow-hidden">
        <div className="theme-gradient pb-32 pt-6">
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
            <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-white/5 rounded-full blur-3xl" />
          </div>

          <div className="relative z-10 max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
            <nav className="flex justify-between items-center py-4 mb-6">
              <Link href="/" className="flex items-center gap-2.5">
                <img src={logoImg} alt="CheckByAi.net" className="h-9 w-auto" width={250} height={80} />
              </Link>
              <div className="hidden md:flex items-center gap-1">
                {[
                  { href: "/dashboard", label: "Verify CoS" },
                  { href: "/pricing", label: "Pricing" },
                  { href: "/sponsor-monitor", label: "Sponsor Monitor" },
                  { href: "/cos-guide", label: "CoS Guide" },
                  { href: "/technology", label: "Technology" },
                  { href: "/api-docs", label: "API" },
                ].map((link) => (
                  <Link key={link.href} href={link.href} className="px-4 py-2 text-sm text-white/70 hover:text-white font-medium rounded-full hover:bg-white/10 transition-all duration-200">{link.label}</Link>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Link href="/sponsor-monitor">
                  <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-full px-5 font-bold text-sm shadow-lg shadow-emerald-500/20 hidden sm:flex">
                    <Bell className="w-3.5 h-3.5 mr-1.5" />Get Alerts
                  </Button>
                </Link>
                <Link href="/login">
                  <Button size="sm" variant="outline" className="border-white/30 text-white hover:bg-white/10 rounded-full px-5 font-semibold text-sm bg-transparent">Sign In</Button>
                </Link>
              </div>
            </nav>

            <div className="grid lg:grid-cols-2 gap-16 items-center min-h-[70vh] py-8">
              <div className="space-y-7">
                <motion.div initial={{ opacity: 0, x: -20 }} animate={isLoaded ? { opacity: 1, x: 0 } : {}} transition={{ ...springGentle, delay: 0.1 }}>
                  <span className="inline-flex items-center gap-2 text-red-300 text-xs font-bold bg-red-500/20 px-4 py-2 rounded-full backdrop-blur-sm tracking-wider uppercase">
                    <Activity className="w-3.5 h-3.5 animate-pulse" />
                    UK Home Office Register Monitor
                  </span>
                </motion.div>

                <motion.h1 initial={{ opacity: 0, y: 30 }} animate={isLoaded ? { opacity: 1, y: 0 } : {}} transition={{ ...spring, delay: 0.2 }} className="text-4xl sm:text-5xl lg:text-[3.4rem] editorial-heading text-white leading-[1.1]">
                  Your Sponsor Was Revoked{' '}
                  <span className="text-red-400">Last Night.</span>
                  <br />
                  <span className="text-white/80">Nobody Told You.</span>
                </motion.h1>

                <motion.p initial={{ opacity: 0, y: 20 }} animate={isLoaded ? { opacity: 1, y: 0 } : {}} transition={{ ...springGentle, delay: 0.35 }} className="text-base text-white/70 max-w-lg leading-relaxed">
                  The Home Office updates the register at midnight. They do not email you. We check every night and alert you within 30 minutes by WhatsApp, Email, and SMS.
                </motion.p>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={isLoaded ? { opacity: 1, y: 0 } : {}} transition={{ ...spring, delay: 0.45 }} className="flex flex-col sm:flex-row gap-3">
                  <Link href="/pricing">
                    <Button size="lg" className="bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-3 rounded-full font-bold shadow-xl shadow-emerald-500/20 transition-all duration-200 w-full sm:w-auto">
                      <ShieldCheck className="mr-2 w-5 h-5" />
                      Protect My Visa
                      <span className="ml-2 text-sm font-normal text-emerald-200">from £24.99/mo</span>
                    </Button>
                  </Link>
                  <Button variant="outline" size="lg" className="border-white/30 text-white hover:bg-white/10 rounded-full px-6 py-3 font-semibold transition-all duration-200 bg-transparent" onClick={onStartVerification}>
                    <Play className="mr-2 w-4 h-4" />
                    Verify a Document
                  </Button>
                </motion.div>

                <CreditCounter />

                <motion.div initial={{ opacity: 0 }} animate={isLoaded ? { opacity: 1 } : {}} transition={{ ...springGentle, delay: 0.6 }} className="flex items-center gap-6 pt-1 flex-wrap">
                  {[
                    { icon: <Timer className="w-4 h-4" />, label: "Alerts in 30 min" },
                    { icon: <Eye className="w-4 h-4" />, label: "47,823 sponsors tracked" },
                    { icon: <Lock className="w-4 h-4" />, label: "UK GDPR" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-white/60">
                      {item.icon}
                      <span className="text-xs font-medium">{item.label}</span>
                    </div>
                  ))}
                </motion.div>
              </div>

              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={isLoaded ? { opacity: 1, scale: 1 } : {}} transition={{ ...springGentle, delay: 0.3 }} className="lg:h-[480px] h-[320px] relative rounded-2xl overflow-hidden shadow-2xl shadow-black/20 border border-white/10">
                <Suspense fallback={<LoadingFallback />}><AnimatedBackground /></Suspense>
              </motion.div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border-y border-slate-700 -mt-16 relative z-10">
          <div className="max-w-5xl mx-auto px-4 py-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-0 sm:divide-x sm:divide-slate-700 text-center">
              <div className="px-4">
                <p className="text-2xl font-bold text-white">47,823</p>
                <p className="text-xs text-slate-400 mt-0.5">Companies checked last night</p>
              </div>
              <div className="px-4">
                <p className="text-2xl font-bold text-red-400">3 downgraded, 1 revoked</p>
                <p className="text-xs text-slate-400 mt-0.5">Changes detected</p>
              </div>
              <div className="px-4">
                <p className="text-2xl font-bold text-emerald-400">04:32 AM GMT</p>
                <p className="text-xs text-slate-400 mt-0.5">Alerts sent to 847 subscribers</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <LandingDigest />

      <section className="py-16 sm:py-20 bg-background">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <span className="inline-flex items-center gap-2 text-xs font-bold tracking-wider uppercase text-red-600 dark:text-red-400 mb-4">
            <AlertTriangle className="w-4 h-4" /> Is Your Employer Still Licensed?
          </span>
          <h2 className="text-3xl sm:text-4xl editorial-subheading text-foreground mb-3">
            Check Your Sponsor Right Now
          </h2>
          <p className="text-base text-muted-foreground mb-8 max-w-xl mx-auto">
            Search the official UK Home Office Register of Licensed Sponsors. Free, instant, no login required to search.
          </p>
          <div className="relative max-w-lg mx-auto mb-4">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Type your employer name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearchSubmit()}
              className="pl-11 h-14 text-base border-2 border-slate-200 dark:border-slate-700 focus-visible:ring-emerald-500 focus-visible:border-emerald-500 rounded-xl"
            />
            <Button onClick={handleSearchSubmit} disabled={searchQuery.trim().length < 3 || searchLoading} className="absolute right-2 top-1/2 -translate-y-1/2 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 rounded-lg px-4 h-10">
              {searchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
            </Button>
          </div>

          {searchLoading && (
            <div className="flex justify-center py-6">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {searchLimitReached && (
            <div className="max-w-lg mx-auto mt-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-5 text-center">
              <Lock className="w-8 h-8 text-amber-500 mx-auto mb-3" />
              <h3 className="font-bold text-foreground mb-1">Free search limit reached</h3>
              <p className="text-sm text-muted-foreground mb-4">
                You've used your free search for today. Subscribe to the Notification Engine for unlimited searches and real-time alerts when your sponsor's licence changes.
              </p>
              <Link href="/pricing">
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full px-6 font-bold">
                  <Bell className="w-4 h-4 mr-2" />View Plans from £24.99/mo
                </Button>
              </Link>
            </div>
          )}

          {!searchLoading && !searchLimitReached && hasSearched && searchResults.length === 0 && (
            <p className="text-sm text-muted-foreground mt-4">No sponsors found matching your search. Try a different name.</p>
          )}

          {!searchLoading && searchResults.length > 0 && (
            <div className="max-w-lg mx-auto mt-4 text-left space-y-2">
              {searchResults.map((r) => {
                const isActive = r.status !== "NOT_LISTED";
                const rating = (r.typeRating || "").toLowerCase();
                const isBRated = rating.includes("b rating") || rating.includes("b-rating") || rating === "b";
                return (
                  <div key={r.fingerprint} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground text-sm truncate">{r.organisationName}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        {r.townCity && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{r.townCity}</span>}
                        {r.route && <span>{r.route}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isActive ? (
                        <Badge className="bg-emerald-600 text-white border-emerald-700 rounded-full text-[11px] font-bold px-2.5">
                          <CheckCircle className="w-3 h-3 mr-1" />Active
                        </Badge>
                      ) : (
                        <Badge className="bg-red-600 text-white border-red-700 rounded-full text-[11px] font-bold px-2.5">
                          <XCircle className="w-3 h-3 mr-1" />Revoked
                        </Badge>
                      )}
                      {isBRated && (
                        <Badge className="bg-amber-500 text-white border-amber-600 rounded-full text-[11px] font-bold px-2.5">
                          <AlertTriangle className="w-3 h-3 mr-1" />B-Rated
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="text-center pt-3">
                <p className="text-xs text-muted-foreground mb-2">Want to get alerts when this sponsor's status changes?</p>
                <Link href="/pricing">
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full px-5 font-bold text-xs">
                    <Bell className="w-3.5 h-3.5 mr-1.5" />Get Instant Alerts
                  </Button>
                </Link>
              </div>
            </div>
          )}

          {!hasSearched && (
            <p className="text-xs text-muted-foreground">
              One free search per day. No login required.{" "}
              <Link href="/pricing" className="text-primary font-semibold hover:underline">Subscribe for unlimited searches and alerts</Link>
            </p>
          )}
        </div>
      </section>

      <section className="py-16 sm:py-20 bg-slate-50 dark:bg-slate-950/50">
        <div className="max-w-5xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="editorial-caption text-emerald-600 dark:text-emerald-400 block mb-4">Why You Need Alerts</span>
            <h2 className="text-3xl sm:text-4xl editorial-subheading text-foreground mb-4">
              The Home Office Will Not Warn You
            </h2>
            <p className="text-base editorial-body text-muted-foreground">
              When a sponsor licence is revoked, your visa application is silently rejected. We make sure you know first.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <Card className="border-slate-200 dark:border-slate-800">
              <CardContent className="py-8 px-6">
                <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-5"><Timer className="w-6 h-6 text-red-600" /></div>
                <h3 className="text-lg font-bold text-foreground mb-3">The 12-Hour Advantage</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">The register updates at midnight. Letters are posted at 9 AM. Our WhatsApp alert hits your phone at 00:30. You have half a day to pivot before your employer even knows.</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 dark:border-slate-800">
              <CardContent className="py-8 px-6">
                <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-5"><FileSearch className="w-6 h-6 text-amber-600" /></div>
                <h3 className="text-lg font-bold text-foreground mb-3">Spot Warning Signs Early</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">We track 90 days of history. See if your employer was downgraded to B-rating last month. A downgrade often comes before a full revocation.</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 dark:border-slate-800">
              <CardContent className="py-8 px-6">
                <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-5"><Wifi className="w-6 h-6 text-blue-600" /></div>
                <h3 className="text-lg font-bold text-foreground mb-3">Triple-Channel Reliability</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">We send Email + WhatsApp + SMS simultaneously. If one channel fails, the others get through. This alert is too important to miss.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-12 bg-background border-y border-border/50">
        <div className="max-w-4xl mx-auto px-6">
          <div className="bg-slate-900 dark:bg-slate-800 text-white rounded-xl p-4 mb-8 flex items-start gap-3">
            <Activity className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5 animate-pulse" />
            <p className="text-sm">
              <span className="font-bold text-emerald-400">Recent alert:</span>{" "}
              Alert sent to 43 users monitoring 'TechSolutions Ltd' on 14 Jan at 00:33 AM. Licence downgraded from A to B-Rating.
            </p>
          </div>
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <CardContent className="py-8">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-xl font-bold text-primary">R</span>
                </div>
                <div>
                  <blockquote className="text-foreground text-sm sm:text-base italic leading-relaxed mb-3">
                    "I got the alert at midnight. My employer got the suspension email at 9 AM. I had already applied for a new job. That subscription saved my 5-year UK career."
                  </blockquote>
                  <p className="text-xs text-muted-foreground font-medium">Rahul K., Skilled Worker Visa Holder</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="py-16 sm:py-20 bg-background">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-foreground mb-2">Choose Your Protection Level</h2>
          <p className="text-center text-muted-foreground mb-12">Keep your visa safe. Cancel anytime.</p>

          <div className="grid md:grid-cols-3 gap-5">
            <Card className="border-amber-300/50 bg-amber-50/30 dark:bg-amber-950/10 dark:border-amber-800/30 opacity-80">
              <CardContent className="py-6">
                <p className="text-xs font-bold uppercase tracking-wider text-amber-600 mb-2">Search Only</p>
                <p className="text-3xl font-extrabold text-foreground mb-1">Free</p>
                <p className="text-xs text-muted-foreground mb-6">No protection</p>
                <ul className="space-y-2.5 text-sm mb-6">
                  <li className="flex items-center gap-2 text-muted-foreground"><CheckCircle className="w-4 h-4 text-amber-500" />Check today's status</li>
                  <li className="flex items-center gap-2 text-muted-foreground/60"><Lock className="w-4 h-4 text-slate-300 dark:text-slate-600" /><span className="line-through">No alerts</span></li>
                  <li className="flex items-center gap-2 text-muted-foreground/60"><Lock className="w-4 h-4 text-slate-300 dark:text-slate-600" /><span className="line-through">No history</span></li>
                  <li className="flex items-center gap-2 text-muted-foreground/60"><Lock className="w-4 h-4 text-slate-300 dark:text-slate-600" /><span className="line-through">No monitoring</span></li>
                </ul>
                <Button variant="outline" disabled className="w-full opacity-60">Free Plan</Button>
              </CardContent>
            </Card>

            <Card className="border-emerald-500 dark:border-emerald-400 ring-2 ring-emerald-500/30 relative shadow-lg shadow-emerald-500/10">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2"><Badge className="bg-emerald-600 text-white font-bold text-[10px] uppercase tracking-wider px-3 py-1 shadow-sm">Best Value</Badge></div>
              <CardContent className="py-6">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 mb-2">Starter</p>
                <div className="mb-1"><span className="text-3xl font-extrabold text-foreground">£24.99</span><span className="text-sm text-muted-foreground">/month</span></div>
                <p className="text-xs text-muted-foreground mb-6">£239.99/year (save 20%)</p>
                <ul className="space-y-2.5 text-sm mb-6">
                  <li className="flex items-center gap-2 text-foreground"><CheckCircle className="w-4 h-4 text-emerald-500" />Monitor 2 companies</li>
                  <li className="flex items-center gap-2 text-foreground"><CheckCircle className="w-4 h-4 text-emerald-500" />Email + WhatsApp alerts</li>
                  <li className="flex items-center gap-2 text-foreground"><CheckCircle className="w-4 h-4 text-emerald-500" />30-day history</li>
                  <li className="flex items-center gap-2 text-foreground"><CheckCircle className="w-4 h-4 text-emerald-500" />Same-day alerts (6 PM)</li>
                </ul>
                <Link href="/pricing"><Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-5 text-base shadow-md"><Zap className="w-4 h-4 mr-2" />Get Instant Alerts</Button></Link>
              </CardContent>
            </Card>

            <Card className="border-slate-300 dark:border-slate-700">
              <CardContent className="py-6">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">Pro</p>
                <div className="mb-1"><span className="text-3xl font-extrabold text-foreground">£49.99</span><span className="text-sm text-muted-foreground">/month</span></div>
                <p className="text-xs text-muted-foreground mb-6">£479.99/year (save 20%)</p>
                <ul className="space-y-2.5 text-sm mb-6">
                  <li className="flex items-center gap-2 text-foreground"><CheckCircle className="w-4 h-4 text-slate-600 dark:text-slate-400" />Monitor 5 companies</li>
                  <li className="flex items-center gap-2 text-foreground"><CheckCircle className="w-4 h-4 text-slate-600 dark:text-slate-400" />Email + WhatsApp + SMS</li>
                  <li className="flex items-center gap-2 text-foreground"><CheckCircle className="w-4 h-4 text-slate-600 dark:text-slate-400" />90-day history</li>
                  <li className="flex items-center gap-2 text-foreground"><CheckCircle className="w-4 h-4 text-slate-600 dark:text-slate-400" />Immediate alerts</li>
                </ul>
                <Link href="/pricing"><Button variant="outline" className="w-full font-bold py-5 text-base">Get Pro Protection</Button></Link>
              </CardContent>
            </Card>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">Cancel anytime. 30-day money-back guarantee.</p>
        </div>
      </section>

      <section className="py-16 sm:py-20 bg-slate-50 dark:bg-slate-950/50">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-foreground mb-10">Common Questions</h2>
          <Accordion type="single" collapsible className="space-y-2">
            <AccordionItem value="q1" className="border rounded-xl px-4 bg-white dark:bg-slate-900">
              <AccordionTrigger className="text-sm font-semibold text-foreground hover:no-underline py-4">What if my company is revoked while I sleep?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground pb-4">You wake up to our alert, not a rejection letter. You can immediately stop your visa application or find new employment before the Home Office processes your case.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="q2" className="border rounded-xl px-4 bg-white dark:bg-slate-900">
              <AccordionTrigger className="text-sm font-semibold text-foreground hover:no-underline py-4">Is this legal and official?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground pb-4">We monitor the official public register published by the UK Home Office. We are not affiliated with the Home Office, which is why we can alert you faster than their bureaucratic process.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="q3" className="border rounded-xl px-4 bg-white dark:bg-slate-900">
              <AccordionTrigger className="text-sm font-semibold text-foreground hover:no-underline py-4">Can I just check myself for free?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground pb-4">Yes, but you must remember to check every single night. Most people check once, forget, and find out too late. Our service is insurance against forgetfulness.</AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>

      <section className="py-16 sm:py-20 bg-background border-t border-border/50">
        <div className="max-w-5xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="editorial-caption text-primary block mb-4">Also Available</span>
            <h2 className="text-3xl sm:text-4xl editorial-subheading text-foreground mb-4">
              AI Certificate of Sponsorship Verification
            </h2>
            <p className="text-base editorial-body text-muted-foreground">
              Received a CoS from your employer? Upload it to check if it is genuine, edited, or fabricated. AI forensic analysis against Home Office standards.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-10">
            <FeatureCard icon={<Shield className="w-5 h-5 text-primary" />} title="Home Office Compliance" description="Our AI analyzes your Certificate of Sponsorship against official document patterns. Detect fake CoS documents before submitting your visa." index={0} />
            <FeatureCard icon={<Zap className="w-5 h-5 text-primary" />} title="Instant Verification" description="Get results in seconds. Upload your document and know immediately if it matches genuine Home Office formatting and metadata." index={1} />
            <FeatureCard icon={<Lock className="w-5 h-5 text-primary" />} title="UK Data Protection" description="Processed under UK GDPR. We analyze metadata only. Documents are permanently deleted after verification. No data stored." index={2} />
          </div>

          <div className="text-center">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-3 rounded-full font-semibold shadow-lg transition-all duration-200" onClick={onStartVerification}>
                Verify a Document
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
              <Button variant="outline" size="lg" className="rounded-full px-6 py-3 font-semibold transition-all duration-200" onClick={() => setShowDemo(true)}>
                <Play className="mr-2 w-4 h-4" />Watch Demo
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-950 text-white py-16">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">Do Not Wait For The Letter</h2>
          <p className="text-slate-300 mb-8 max-w-lg mx-auto">Get instant alerts when a sponsor licence changes. Protect your visa, your career, and your future in the UK.</p>
          <Link href="/pricing">
            <Button size="lg" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base px-10 py-6 rounded-xl shadow-lg shadow-emerald-500/20">
              <ShieldCheck className="w-5 h-5 mr-2" />Start Monitoring Now
            </Button>
          </Link>
          <p className="text-xs text-slate-500 mt-4">From 82p per day. Cancel anytime.</p>
        </div>
      </section>

      <Footer />
    </div>
    </>
  )
}
