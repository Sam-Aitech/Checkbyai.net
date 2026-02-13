import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Plus, Building2, MapPin, Star, Route, Loader2, Shield,
  AlertTriangle, Eye, Trash2, Clock, ArrowDown, ArrowUp, XCircle, PlusCircle, CalendarDays,
  Bell, Mail, MessageSquare, Phone, CheckCircle2, Send, Save, History, CheckCheck, XOctagon, Clock3,
  ExternalLink, Linkedin, CheckCircle, FileText, Lock, X, Zap, ShieldCheck, Smartphone,
  ChevronDown, ChevronRight, Activity, Timer, FileSearch, Wifi, ArrowRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import PageLayout from "@/components/PageLayout";
import SEOHead from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface SponsorSearchResult {
  fingerprint: string;
  organisationName: string;
  townCity: string | null;
  typeRating: string | null;
  route: string | null;
  status: string;
  matchScore: number;
  historicalNames: string[];
}

interface SponsorChange {
  id: number;
  organisationName: string;
  changeType: string;
  previousValue: string | null;
  newValue: string | null;
  detectedAt: string;
  snapshotDate: string;
}

interface WatchEntry {
  id: number;
  organisationName: string;
  townCity: string | null;
  fingerprint: string | null;
  isActive: boolean;
  createdAt: string;
  currentStatus: {
    listed: boolean;
    typeRating: string | null;
    route: string | null;
    status?: string;
  };
  recentChanges: SponsorChange[];
}

interface HistoryEvent {
  id: number;
  date: string;
  event: string;
  organisationName: string;
  previousValue: string | null;
  newValue: string | null;
  snapshotDate: string;
}

interface CompanyHistoryData {
  fingerprint: string;
  currentName: string;
  townCity: string | null;
  typeRating: string | null;
  route: string | null;
  status: string;
  firstSeen: string;
  lastSeen: string;
  historicalNames: string[];
  history: HistoryEvent[];
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

const spring = { type: "spring" as const, stiffness: 100, damping: 15 };

function StatusBadge({ status, typeRating }: { status: string; typeRating: string | null }) {
  const rating = (typeRating || "").toLowerCase();
  const isBRated = rating.includes("b rating") || rating.includes("b-rating") || rating === "b";

  if (status === "NOT_LISTED") {
    return (
      <Badge className="bg-red-600 text-white border-red-700 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide">
        <XCircle className="w-3 h-3 mr-1" />
        Revoked
      </Badge>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Badge className="bg-emerald-600 text-white border-emerald-700 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide">
        <CheckCircle className="w-3 h-3 mr-1" />
        Active
      </Badge>
      {isBRated && (
        <Badge className="bg-amber-500 text-white border-amber-600 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide">
          <AlertTriangle className="w-3 h-3 mr-1" />
          B-Rated
        </Badge>
      )}
    </div>
  );
}

function getWatchStatusBadge(currentStatus: WatchEntry["currentStatus"]) {
  const canonicalStatus = currentStatus.status || (currentStatus.listed ? "ACTIVE" : "NOT_LISTED");
  return <StatusBadge status={canonicalStatus} typeRating={currentStatus.typeRating} />;
}

function getChangeIcon(changeType: string) {
  switch (changeType) {
    case "REMOVED": return <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />;
    case "DOWNGRADED": return <ArrowDown className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
    case "UPGRADED": return <ArrowUp className="w-3.5 h-3.5 text-emerald-500 shrink-0" />;
    case "ADDED": case "NEW_LICENCE": return <PlusCircle className="w-3.5 h-3.5 text-blue-500 shrink-0" />;
    case "NAME_CHANGE": return <FileText className="w-3.5 h-3.5 text-purple-500 shrink-0" />;
    default: return <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
  }
}

function getEventLabel(event: string, prev?: string | null, next?: string | null) {
  switch (event) {
    case "ADDED": case "NEW_LICENCE": return "Licence Granted";
    case "REMOVED": return "Licence Revoked / Removed from Register";
    case "DOWNGRADED": return prev && next ? `Downgraded from ${prev} to ${next}` : "Downgraded to B-Rating";
    case "UPGRADED": return prev && next ? `Upgraded from ${prev} to ${next}` : "Upgraded to A-Rating";
    case "NAME_CHANGE": return prev && next ? `Name changed from "${prev}" to "${next}"` : "Company Name Updated";
    case "ROUTE_CHANGE": return prev && next ? `Route changed from ${prev} to ${next}` : "Route Changed";
    default: return event;
  }
}

function getEventColor(event: string) {
  switch (event) {
    case "REMOVED": return "border-red-400 bg-red-50 dark:bg-red-950/30";
    case "DOWNGRADED": return "border-amber-400 bg-amber-50 dark:bg-amber-950/30";
    case "UPGRADED": return "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30";
    case "ADDED": case "NEW_LICENCE": return "border-blue-400 bg-blue-50 dark:bg-blue-950/30";
    case "NAME_CHANGE": return "border-purple-400 bg-purple-50 dark:bg-purple-950/30";
    default: return "border-gray-300 bg-gray-50 dark:bg-gray-900/30";
  }
}

interface NotificationPrefs {
  emailEnabled: boolean;
  email: string | null;
  whatsappEnabled: boolean;
  whatsappNumber: string | null;
  whatsappVerified: boolean;
  smsEnabled: boolean;
  smsNumber: string | null;
  smsVerified: boolean;
}

function PhoneVerificationField({
  channel, label, icon: Icon, enabled, onToggle, phoneNumber, onPhoneChange, verified, channelAllowed, requiredPlan,
}: {
  channel: "whatsapp" | "sms"; label: string; icon: typeof MessageSquare;
  enabled: boolean; onToggle: (v: boolean) => void; phoneNumber: string;
  onPhoneChange: (v: string) => void; verified: boolean; channelAllowed: boolean; requiredPlan: string;
}) {
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const { toast } = useToast();

  const sendOtpMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/notification-preferences/verify-phone", { phone_number: phoneNumber, channel });
      return res.json();
    },
    onSuccess: (data) => { setOtpSent(true); setOtpCode(""); toast({ title: "Code sent", description: data.message }); },
    onError: (error: Error) => { toast({ title: "Couldn't send code", description: error.message, variant: "destructive" }); },
  });

  const confirmOtpMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/notification-preferences/confirm-phone", { phone_number: phoneNumber, channel, code: otpCode });
      return res.json();
    },
    onSuccess: (data) => {
      setOtpSent(false); setOtpCode("");
      queryClient.invalidateQueries({ queryKey: ["/api/notification-preferences"] });
      toast({ title: "Verified", description: data.message });
    },
    onError: (error: Error) => { toast({ title: "Verification failed", description: error.message, variant: "destructive" }); },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <Label htmlFor={`${channel}-toggle`} className="font-medium cursor-pointer">{label}</Label>
        </div>
        <Switch id={`${channel}-toggle`} checked={enabled} onCheckedChange={(v) => {
          if (v && !verified) { toast({ title: "Verification required", description: `Please verify your ${channel === "whatsapp" ? "WhatsApp" : "SMS"} number first.` }); return; }
          onToggle(v);
        }} disabled={!channelAllowed} />
      </div>
      {!channelAllowed && (
        <p className="text-xs text-muted-foreground ml-7">
          Requires {requiredPlan} plan or higher. <a href="/pricing" className="underline hover:no-underline text-primary">Upgrade</a>
        </p>
      )}
      {channelAllowed && (
        <div className="ml-7 space-y-2">
          <div className="flex items-center gap-2">
            <Input type="tel" placeholder="+447700900000" value={phoneNumber} onChange={(e) => onPhoneChange(e.target.value)} className="max-w-[220px] h-9 text-sm" disabled={!channelAllowed} />
            {verified ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium"><CheckCircle2 className="w-4 h-4" />Verified</span>
            ) : (
              <Button size="sm" variant="outline" disabled={!phoneNumber || phoneNumber.length < 8 || sendOtpMutation.isPending} onClick={() => sendOtpMutation.mutate()} className="h-9">
                {sendOtpMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Send className="w-3.5 h-3.5 mr-1" />}Verify
              </Button>
            )}
          </div>
          <AnimatePresence>
            {otpSent && !verified && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={spring} className="overflow-hidden">
                <div className="flex items-center gap-2 mt-1">
                  <Input type="text" inputMode="numeric" placeholder="Enter 6-digit code" value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))} className="max-w-[160px] h-9 text-sm tracking-widest text-center" maxLength={6} />
                  <Button size="sm" disabled={otpCode.length !== 6 || confirmOtpMutation.isPending} onClick={() => confirmOtpMutation.mutate()} className="h-9">
                    {confirmOtpMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}Confirm
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Enter the 6-digit code sent to {phoneNumber}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function formatDate(dateStr: string) {
  try { return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return dateStr; }
}

function CompanyHistoryDialog({ fingerprint, companyName, open, onOpenChange, isFreeUser }: {
  fingerprint: string; companyName: string; open: boolean; onOpenChange: (open: boolean) => void; isFreeUser: boolean;
}) {
  const [, setLocation] = useLocation();
  const { data, isLoading, error } = useQuery<CompanyHistoryData>({
    queryKey: ["/api/sponsors", fingerprint, "history"],
    queryFn: async () => {
      const res = await fetch(`/api/sponsors/${encodeURIComponent(fingerprint)}/history`, { credentials: "include" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || "Failed to load history"); }
      return res.json();
    },
    enabled: open && !!fingerprint,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <History className="w-5 h-5 text-primary" />
            {companyName}
          </DialogTitle>
        </DialogHeader>

        {isLoading && <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}
        {error && <div className="py-4 text-center"><AlertTriangle className="w-6 h-6 text-destructive mx-auto mb-2" /><p className="text-sm text-destructive">{(error as Error).message}</p></div>}

        {data && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={data.status} typeRating={data.typeRating} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {data.townCity && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {data.townCity}</span>}
              {data.route && <span className="inline-flex items-center gap-1"><Route className="w-3.5 h-3.5" /> {data.route}</span>}
              {data.typeRating && <span className="inline-flex items-center gap-1"><Star className="w-3.5 h-3.5" /> {data.typeRating}</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <a href="https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"><ExternalLink className="w-3 h-3" /> View on Gov.uk</a>
              <a href={`https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(data.currentName)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"><Linkedin className="w-3 h-3" /> Search on LinkedIn</a>
            </div>
            {data.historicalNames && data.historicalNames.length > 0 && (
              <div className="text-xs text-muted-foreground"><span className="font-medium">Previous names:</span> {data.historicalNames.join(", ")}</div>
            )}

            <div className="border-t pt-4">
              <h4 className="text-sm font-semibold text-foreground mb-3">Event History</h4>
              {isFreeUser ? (
                <div className="relative">
                  {data.history.length > 0 && (
                    <div className="relative pl-6 opacity-30 blur-[2px] select-none pointer-events-none">
                      <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border" />
                      <div className="space-y-4">
                        {data.history.slice(0, 3).map((evt) => (
                          <div key={evt.id} className="relative">
                            <div className="absolute -left-6 top-1 w-[18px] h-[18px] rounded-full bg-background border-2 border-border flex items-center justify-center z-10">{getChangeIcon(evt.event)}</div>
                            <div className={`ml-2 p-2.5 rounded-lg border-l-2 ${getEventColor(evt.event)}`}>
                              <p className="text-sm font-medium text-foreground">{getEventLabel(evt.event, evt.previousValue, evt.newValue)}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{formatDate(evt.date || evt.snapshotDate)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 rounded-lg">
                    <Lock className="w-8 h-8 text-amber-500 mb-2" />
                    <p className="text-sm font-semibold text-foreground mb-1">History Locked</p>
                    <p className="text-xs text-muted-foreground text-center max-w-[250px] mb-3">Upgrade to Starter to see full change history and detect warning signs early.</p>
                    <Button size="sm" onClick={() => { onOpenChange(false); setLocation("/pricing"); }} className="bg-slate-900 hover:bg-slate-800 text-white">
                      <Lock className="w-3.5 h-3.5 mr-1" /> Unlock History
                    </Button>
                  </div>
                </div>
              ) : data.history.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No recorded changes yet. This company has been stable since tracking began.</p>
              ) : (
                <div className="relative pl-6">
                  <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border" />
                  <div className="space-y-4">
                    {data.history.map((evt) => (
                      <div key={evt.id} className="relative">
                        <div className="absolute -left-6 top-1 w-[18px] h-[18px] rounded-full bg-background border-2 border-border flex items-center justify-center z-10">{getChangeIcon(evt.event)}</div>
                        <div className={`ml-2 p-2.5 rounded-lg border-l-2 ${getEventColor(evt.event)}`}>
                          <p className="text-sm font-medium text-foreground">{getEventLabel(evt.event, evt.previousValue, evt.newValue)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{formatDate(evt.date || evt.snapshotDate)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StickyAlertBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="bg-red-700 text-white relative">
      <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center justify-center gap-2 text-center">
        <Activity className="w-4 h-4 shrink-0 animate-pulse" />
        <p className="text-xs sm:text-sm font-medium">
          <span className="font-bold">URGENT:</span> 3 sponsor licences revoked in the last 48 hours. Last alert sent 14 minutes ago to 847 subscribers.
        </p>
        <button onClick={() => setDismissed(true)} className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded transition-colors" aria-label="Close banner">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function HeroSection({ onScrollToSearch }: { onScrollToSearch: () => void }) {
  const [, setLocation] = useLocation();
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-900/20 via-transparent to-transparent" />
      <div className="relative max-w-4xl mx-auto px-4 py-16 sm:py-24 text-center">
        <p className="text-[11px] sm:text-xs font-bold tracking-[0.25em] uppercase text-red-400 mb-6">
          UK Home Office Register Monitor
        </p>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-[1.1] mb-6">
          You Will Only Know Your Sponsor Was Revoked{" "}
          <span className="text-red-400">After It Is Too Late</span>
        </h1>
        <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto mb-10 leading-relaxed">
          The Home Office updates the register at midnight. They do not email you. By the time the letter arrives, your visa application is already rejected. We check every night and text you instantly.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
          <Button
            size="lg"
            onClick={() => setLocation("/pricing")}
            className="bg-white text-slate-900 hover:bg-slate-100 font-bold text-base px-8 py-6 rounded-xl shadow-lg shadow-white/10 w-full sm:w-auto"
          >
            <ShieldCheck className="w-5 h-5 mr-2" />
            <span>Protect My Job Offer</span>
            <span className="ml-2 text-sm font-normal text-slate-500">from £24.99/mo</span>
          </Button>
          <Button
            size="lg"
            variant="ghost"
            onClick={onScrollToSearch}
            className="text-slate-400 hover:text-slate-200 hover:bg-white/5 font-medium text-sm px-6 py-6 rounded-xl w-full sm:w-auto border border-slate-700/50"
          >
            Or Search Free (No Alerts)
          </Button>
        </div>
      </div>
    </section>
  );
}

function ProofBar() {
  return (
    <section className="bg-slate-900 border-y border-slate-800">
      <div className="max-w-4xl mx-auto px-4 py-4">
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
            <p className="text-xs text-slate-400 mt-0.5">
              Alerts sent{" "}
              <Link href="/sponsor-changes" className="underline hover:no-underline text-slate-300">View Recent Changes</Link>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ManualVsAutomated() {
  const [, setLocation] = useLocation();
  return (
    <section className="py-16 sm:py-20 bg-slate-50 dark:bg-slate-950/50">
      <div className="max-w-4xl mx-auto px-4">
        <h2 className="text-2xl sm:text-3xl font-bold text-center text-foreground mb-4">Stop Checking Manually</h2>
        <p className="text-center text-muted-foreground mb-12 max-w-xl mx-auto">Manual checking takes 4 minutes per day. That is 24 hours per year. The Starter plan costs less than 82p per day.</p>

        <div className="grid md:grid-cols-2 gap-6">
          <Card className="border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20">
            <CardContent className="py-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/50 flex items-center justify-center"><XCircle className="w-4 h-4 text-red-600" /></div>
                <h3 className="font-bold text-foreground">The Old Way: Checking Manually</h3>
              </div>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />Download CSV from gov.uk</li>
                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />Open 40,000-row spreadsheet</li>
                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />Ctrl+F search your company</li>
                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />Repeat daily for months</li>
              </ul>
              <div className="mt-5 p-3 bg-red-100 dark:bg-red-900/30 rounded-lg border border-red-200 dark:border-red-800">
                <p className="text-sm font-bold text-red-700 dark:text-red-300">Result: You miss the change. Visa refused.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 ring-2 ring-emerald-500/20">
            <CardContent className="py-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center"><CheckCircle className="w-4 h-4 text-emerald-600" /></div>
                <h3 className="font-bold text-foreground">Your Way: Automated Alerts</h3>
              </div>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />Add company to watchlist</li>
                <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />We check every midnight</li>
                <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />WhatsApp alert at 00:35 if revoked</li>
                <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />Take action before letter arrives</li>
              </ul>
              <div className="mt-5 p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">Result: Switch employers in time. Visa saved.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="text-center mt-8">
          <Button onClick={() => setLocation("/pricing")} className="bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 font-bold px-8 py-5 rounded-xl">
            <ShieldCheck className="w-5 h-5 mr-2" />Get Automated Alerts
          </Button>
        </div>
      </div>
    </section>
  );
}

function FeatureBlocks() {
  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-4xl mx-auto px-4 space-y-12">
        <div className="grid md:grid-cols-3 gap-8">
          <Card className="border-slate-200 dark:border-slate-800">
            <CardContent className="py-6">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4"><Timer className="w-5 h-5 text-red-600" /></div>
              <h3 className="text-lg font-bold text-foreground mb-2">The 12-Hour Advantage</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                When a licence is revoked, the register updates at 00:00. Letters are posted the next morning. Our WhatsApp alert hits your phone at 00:30. You have half a day to pivot before your employer even knows.
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 dark:border-slate-800">
            <CardContent className="py-6">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-4"><FileSearch className="w-5 h-5 text-amber-600" /></div>
              <h3 className="text-lg font-bold text-foreground mb-2">See If They Were Ever Suspended</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                We keep 90 days of history. See if your employer was downgraded to B-rating last month (a warning sign). Free search only shows today's status.
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 dark:border-slate-800">
            <CardContent className="py-6">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4"><Wifi className="w-5 h-5 text-blue-600" /></div>
              <h3 className="text-lg font-bold text-foreground mb-2">Email Fails. WhatsApp Doesn't.</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                We send Email + WhatsApp + SMS simultaneously. If one fails, the others get through. You cannot afford to miss this alert.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

function SocialProof() {
  return (
    <section className="py-12 bg-slate-50 dark:bg-slate-950/50 border-y border-border/50">
      <div className="max-w-4xl mx-auto px-4">
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
  );
}

function PricingSection() {
  const [, setLocation] = useLocation();
  return (
    <section className="py-16 sm:py-20" id="pricing-section">
      <div className="max-w-4xl mx-auto px-4">
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
              <Button variant="outline" disabled className="w-full opacity-60">Current Plan</Button>
            </CardContent>
          </Card>

          <Card className="border-emerald-500 dark:border-emerald-400 ring-2 ring-emerald-500/30 relative shadow-lg shadow-emerald-500/10">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge className="bg-emerald-600 text-white font-bold text-[10px] uppercase tracking-wider px-3 py-1 shadow-sm">Best Value</Badge>
            </div>
            <CardContent className="py-6">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 mb-2">Starter</p>
              <div className="mb-1">
                <span className="text-3xl font-extrabold text-foreground">£24.99</span>
                <span className="text-sm text-muted-foreground">/month</span>
              </div>
              <p className="text-xs text-muted-foreground mb-6">£239.99/year (save 20%)</p>
              <ul className="space-y-2.5 text-sm mb-6">
                <li className="flex items-center gap-2 text-foreground"><CheckCircle className="w-4 h-4 text-emerald-500" />Monitor 2 companies</li>
                <li className="flex items-center gap-2 text-foreground"><CheckCircle className="w-4 h-4 text-emerald-500" />Email + WhatsApp alerts</li>
                <li className="flex items-center gap-2 text-foreground"><CheckCircle className="w-4 h-4 text-emerald-500" />30-day history</li>
                <li className="flex items-center gap-2 text-foreground"><CheckCircle className="w-4 h-4 text-emerald-500" />Same-day alerts (6 PM)</li>
              </ul>
              <Button onClick={() => setLocation("/pricing")} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-5 text-base shadow-md">
                <Zap className="w-4 h-4 mr-2" />Get Instant Alerts
              </Button>
            </CardContent>
          </Card>

          <Card className="border-slate-300 dark:border-slate-700">
            <CardContent className="py-6">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">Pro</p>
              <div className="mb-1">
                <span className="text-3xl font-extrabold text-foreground">£49.99</span>
                <span className="text-sm text-muted-foreground">/month</span>
              </div>
              <p className="text-xs text-muted-foreground mb-6">£479.99/year (save 20%)</p>
              <ul className="space-y-2.5 text-sm mb-6">
                <li className="flex items-center gap-2 text-foreground"><CheckCircle className="w-4 h-4 text-slate-600 dark:text-slate-400" />Monitor 5 companies</li>
                <li className="flex items-center gap-2 text-foreground"><CheckCircle className="w-4 h-4 text-slate-600 dark:text-slate-400" />Email + WhatsApp + SMS</li>
                <li className="flex items-center gap-2 text-foreground"><CheckCircle className="w-4 h-4 text-slate-600 dark:text-slate-400" />90-day history</li>
                <li className="flex items-center gap-2 text-foreground"><CheckCircle className="w-4 h-4 text-slate-600 dark:text-slate-400" />Immediate alerts</li>
              </ul>
              <Button onClick={() => setLocation("/pricing")} variant="outline" className="w-full font-bold py-5 text-base">
                Get Pro Protection
              </Button>
            </CardContent>
          </Card>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Cancel anytime. If you do not receive an alert within 30 days and want to cancel, we refund 100%.
        </p>
      </div>
    </section>
  );
}

function FAQSection() {
  return (
    <section className="py-16 sm:py-20 bg-slate-50 dark:bg-slate-950/50">
      <div className="max-w-2xl mx-auto px-4">
        <h2 className="text-2xl sm:text-3xl font-bold text-center text-foreground mb-10">What If...</h2>
        <Accordion type="single" collapsible className="space-y-2">
          <AccordionItem value="q1" className="border rounded-xl px-4 bg-white dark:bg-slate-900">
            <AccordionTrigger className="text-sm font-semibold text-foreground hover:no-underline py-4">
              What if my company is revoked while I sleep?
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground pb-4">
              You wake up to our alert, not a rejection letter. You can immediately stop your visa application or find new employment before the Home Office updates your employer.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="q2" className="border rounded-xl px-4 bg-white dark:bg-slate-900">
            <AccordionTrigger className="text-sm font-semibold text-foreground hover:no-underline py-4">
              Is this legal/official?
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground pb-4">
              We monitor the official public register published by the UK Home Office. We are not affiliated with the Home Office, which is why we can alert you faster than their bureaucratic process.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="q3" className="border rounded-xl px-4 bg-white dark:bg-slate-900">
            <AccordionTrigger className="text-sm font-semibold text-foreground hover:no-underline py-4">
              Can I just check myself for free?
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground pb-4">
              Yes, but you must remember to check every single night. Most people check once, forget, and find out too late. We are your insurance policy against forgetfulness.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </section>
  );
}

function MobileStickyBar() {
  const [, setLocation] = useLocation();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (dismissed || !visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 sm:hidden bg-slate-900 border-t border-slate-700 px-4 py-3 flex items-center justify-between gap-2 shadow-2xl">
      <Button onClick={() => setLocation("/pricing")} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-5 text-sm rounded-lg">
        <ShieldCheck className="w-4 h-4 mr-2" />Get Alerts from £24.99/mo
      </Button>
      <button onClick={() => setDismissed(true)} className="p-2 text-slate-400 hover:text-white" aria-label="Dismiss">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function SponsorMonitor() {
  const urlQ = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("q") || "" : "";
  const [searchQuery, setSearchQuery] = useState(urlQ);
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const debouncedQuery = useDebounce(searchQuery, 300);
  const [addedCompanies, setAddedCompanies] = useState<Set<string>>(new Set());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<{ fingerprint: string; name: string } | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const userPlan = user?.subscriptionStatus || "free";
  const isFreeUser = !isAuthenticated || userPlan === "free" || !userPlan;
  const shouldSearch = debouncedQuery.trim().length >= 3;
  const [freeSearchResults, setFreeSearchResults] = useState<SponsorSearchResult[]>([]);
  const [freeSearchLoading, setFreeSearchLoading] = useState(false);
  const [freeSearchLimitReached, setFreeSearchLimitReached] = useState(false);
  const [freeSearchDone, setFreeSearchDone] = useState(false);

  const scrollToSearch = useCallback(() => {
    searchRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => {
      const input = searchRef.current?.querySelector("input");
      input?.focus();
    }, 500);
  }, []);

  const {
    data: searchResults, isLoading: searchLoading, isFetching: searchFetching, error: searchError,
  } = useQuery<SponsorSearchResult[]>({
    queryKey: ["/api/sponsors/search", debouncedQuery],
    queryFn: async () => {
      const res = await fetch(`/api/sponsors/search?q=${encodeURIComponent(debouncedQuery.trim())}`, { credentials: "include" });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.message || "Search failed"); }
      return res.json();
    },
    enabled: shouldSearch && isAuthenticated,
    staleTime: 30 * 1000,
    retry: false,
  });

  useEffect(() => {
    if (!shouldSearch || isAuthenticated) {
      setFreeSearchResults([]);
      setFreeSearchDone(false);
      return;
    }
    let cancelled = false;
    const doFreeSearch = async () => {
      setFreeSearchLoading(true);
      setFreeSearchLimitReached(false);
      try {
        const res = await fetch(`/api/sponsors/free-search?q=${encodeURIComponent(debouncedQuery.trim())}`);
        if (cancelled) return;
        const data = await res.json();
        if (res.status === 429 && data.limitReached) {
          setFreeSearchLimitReached(true);
          setFreeSearchResults([]);
        } else if (res.ok) {
          setFreeSearchResults(data.results || []);
        }
      } catch {
        if (!cancelled) setFreeSearchResults([]);
      } finally {
        if (!cancelled) { setFreeSearchLoading(false); setFreeSearchDone(true); }
      }
    };
    doFreeSearch();
    return () => { cancelled = true; };
  }, [debouncedQuery, shouldSearch, isAuthenticated]);

  const {
    data: watches, isLoading: watchesLoading, error: watchesError,
  } = useQuery<WatchEntry[]>({
    queryKey: ["/api/watches"],
    enabled: isAuthenticated,
  });

  const activeWatches = watches?.filter((w) => w.isActive) ?? [];

  const addWatchMutation = useMutation({
    mutationFn: async (company: SponsorSearchResult) => {
      const res = await apiRequest("POST", "/api/watches", { organisation_name: company.organisationName, town_city: company.townCity, fingerprint: company.fingerprint });
      return res.json();
    },
    onSuccess: (_data, company) => {
      setAddedCompanies((prev) => new Set(prev).add(company.organisationName));
      queryClient.invalidateQueries({ queryKey: ["/api/watches"] });
      toast({ title: "Added to watchlist", description: `You'll be notified of any changes to ${company.organisationName}'s sponsor licence.` });
    },
    onError: (error: Error, company) => {
      const msg = error.message || "";
      if (msg.includes("Upgrade") || msg.includes("upgrade")) {
        toast({ title: "Upgrade required", description: msg, variant: "destructive", action: <Button variant="outline" size="sm" onClick={() => setLocation("/pricing")} className="shrink-0">Upgrade</Button> });
      } else if (msg.includes("limit") || msg.includes("maximum")) {
        toast({ title: "Watch limit reached", description: "Upgrade to monitor more companies.", variant: "destructive", action: <Button variant="outline" size="sm" onClick={() => setLocation("/pricing")} className="shrink-0">Upgrade</Button> });
      } else if (msg.includes("already watching") || msg.includes("reactivated")) {
        toast({ title: "Already watching", description: msg.includes("reactivated") ? "Your watch has been reactivated." : `Already watching ${company.organisationName}.` });
        setAddedCompanies((prev) => new Set(prev).add(company.organisationName));
      } else {
        toast({ title: "Could not add to watchlist", description: msg || "Something went wrong.", variant: "destructive" });
      }
    },
  });

  const removeWatchMutation = useMutation({
    mutationFn: async (watchId: number) => { const res = await apiRequest("DELETE", `/api/watches/${watchId}`); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/watches"] }); toast({ title: "Removed from watchlist", description: "You will no longer receive alerts for this company." }); },
    onError: () => { toast({ title: "Could not remove", description: "Something went wrong.", variant: "destructive" }); },
  });

  const handleAddWatch = useCallback((company: SponsorSearchResult) => {
    if (!isAuthenticated) { setLocation("/login"); return; }
    addWatchMutation.mutate(company);
  }, [isAuthenticated, setLocation, addWatchMutation]);

  const openHistory = useCallback((fingerprint: string, name: string) => {
    setHistoryTarget({ fingerprint, name });
    setHistoryOpen(true);
  }, []);

  const effectiveResults = isAuthenticated ? searchResults : freeSearchResults;
  const effectiveLoading = isAuthenticated ? searchLoading : freeSearchLoading;
  const effectiveFetching = isAuthenticated ? searchFetching : freeSearchLoading;
  const hasSearchResults = effectiveResults && effectiveResults.length > 0;

  return (
    <PageLayout hideNav hideFooter>
      <SEOHead
        title="Sponsor Licence Monitor | Instant UK Sponsor Revocation Alerts | CheckByAI"
        description="Get instant email, WhatsApp and SMS alerts when a UK sponsor licence is revoked, suspended or downgraded. Monitor the Home Office register automatically."
        canonicalUrl="https://checkbyai.net/sponsor-monitor"
        ogTitle="Sponsor Licence Monitor | Instant UK Sponsor Revocation Alerts | CheckByAI"
        ogDescription="Get instant email, WhatsApp and SMS alerts when a UK sponsor licence is revoked, suspended or downgraded."
        structuredData={{
          "@context": "https://schema.org", "@type": "WebApplication",
          "name": "Sponsor Licence Monitor",
          "description": "Real-time monitoring of the UK Home Office Register of Licensed Sponsors with instant alerts.",
          "url": "https://checkbyai.net/sponsor-monitor",
          "applicationCategory": "BusinessApplication", "operatingSystem": "Web",
          "offers": { "@type": "Offer", "price": "0", "priceCurrency": "GBP", "description": "Free search, paid alerts" },
          "provider": { "@type": "Organization", "name": "CheckByAI", "url": "https://checkbyai.net" }
        }}
      />

      <StickyAlertBanner />

      <nav className="sticky top-0 z-50 bg-slate-950/95 backdrop-blur-xl border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center"><Shield className="text-slate-900 w-3.5 h-3.5" /></div>
            <span className="text-sm font-bold text-white">Check By AI</span>
          </Link>
          <div className="hidden sm:flex items-center gap-1">
            <Link href="/dashboard" className="px-3 py-1.5 text-sm text-slate-300 hover:text-white transition-colors rounded-lg hover:bg-white/5">Verify CoS</Link>
            <Link href="/pricing" className="px-3 py-1.5 text-sm text-slate-300 hover:text-white transition-colors rounded-lg hover:bg-white/5">Pricing</Link>
            <Link href="/sponsor-monitor" className="px-3 py-1.5 text-sm text-white bg-white/10 rounded-lg font-medium">Sponsor Monitor</Link>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={scrollToSearch} className="text-slate-300 hover:text-white hover:bg-white/5 text-xs hidden sm:flex">Search Free</Button>
            <Button size="sm" onClick={() => setLocation("/pricing")} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold">
              <Bell className="w-3.5 h-3.5 mr-1" />Get Alerts
            </Button>
          </div>
        </div>
      </nav>

      <HeroSection onScrollToSearch={scrollToSearch} />
      <ProofBar />

      <section className="py-12 sm:py-16" ref={searchRef}>
        <div className="max-w-3xl mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Check Any Company Right Now (Free)</h2>
            <p className="text-muted-foreground">Search the UK Home Office Register of Licensed Sponsors</p>
          </div>

          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="e.g., 'Deloitte' or your employer name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-14 text-base border-2 border-slate-200 dark:border-slate-700 focus-visible:ring-emerald-500 focus-visible:border-emerald-500"
            />
            {effectiveFetching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground animate-spin" />}
          </div>

          {!isAuthenticated && !authLoading && freeSearchLimitReached && (
            <Card className="mt-4 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700">
              <CardContent className="py-6 text-center">
                <Lock className="w-8 h-8 text-amber-500 mx-auto mb-3" />
                <h3 className="font-bold text-foreground mb-1">Free search limit reached</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  You've used your free search for today. Subscribe to get unlimited searches and real-time alerts.
                </p>
                <div className="flex gap-3 justify-center flex-wrap">
                  <Link href="/pricing">
                    <Button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full px-5 font-bold">
                      <Bell className="w-4 h-4 mr-2" />View Plans from £24.99/mo
                    </Button>
                  </Link>
                  <Button variant="outline" onClick={() => setLocation("/login")} className="rounded-full px-5 font-semibold">
                    Sign In
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {searchQuery.trim().length > 0 && searchQuery.trim().length < 3 && (
            <p className="text-sm text-muted-foreground mt-3 text-center">Type at least 3 characters to search</p>
          )}

          {effectiveLoading && shouldSearch && (
            <div className="mt-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}><CardContent className="py-4"><div className="flex items-center justify-between"><div className="space-y-2 flex-1"><Skeleton className="h-5 w-64" /><Skeleton className="h-4 w-40" /><Skeleton className="h-4 w-48" /></div><Skeleton className="h-9 w-32" /></div></CardContent></Card>
              ))}
            </div>
          )}

          {searchError && shouldSearch && isAuthenticated && (
            <Card className="mt-4 border-destructive/30 bg-destructive/5">
              <CardContent className="py-4"><p className="text-sm text-destructive">{(searchError as Error).message?.includes("503") ? "Index is being built. Try again in a moment." : "Unable to search right now."}</p></CardContent>
            </Card>
          )}

          {effectiveResults && effectiveResults.length === 0 && shouldSearch && !effectiveLoading && !freeSearchLimitReached && (isAuthenticated || freeSearchDone) && (
            <Card className="mt-4">
              <CardContent className="py-8 text-center">
                <Building2 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-muted-foreground">No sponsors found matching "{debouncedQuery}"</p>
                <p className="text-sm text-muted-foreground/60 mt-1">Try a different spelling or a shorter search term</p>
              </CardContent>
            </Card>
          )}

          {hasSearchResults && (
            <div className="mt-4 space-y-2">
              {isFreeUser && hasSearchResults && (
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-start gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-800 dark:text-red-200">
                    <span className="font-bold">This status is live right now.</span> It can change at midnight tonight. Without monitoring, you will not know.
                  </p>
                </div>
              )}

              <p className="text-sm text-muted-foreground mb-3">
                {effectiveResults!.length} result{effectiveResults!.length !== 1 ? "s" : ""} found
              </p>
              {effectiveResults!.map((result, index) => {
                const isAdded = addedCompanies.has(result.organisationName) || activeWatches.some(w => w.organisationName === result.organisationName);
                const isAdding = addWatchMutation.isPending && addWatchMutation.variables?.organisationName === result.organisationName;

                return (
                  <Card key={`${result.fingerprint}-${index}`} className="transition-colors hover:bg-muted/30">
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <Building2 className="w-4 h-4 text-primary shrink-0" />
                            <h3 className="font-semibold text-foreground truncate">{result.organisationName}</h3>
                            <StatusBadge status={result.status} typeRating={result.typeRating} />
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                            {result.townCity && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{result.townCity}</span>}
                            {result.typeRating && <span className="inline-flex items-center gap-1"><Star className="w-3.5 h-3.5" />{result.typeRating}</span>}
                            {result.route && <span className="inline-flex items-center gap-1"><Route className="w-3.5 h-3.5" />{result.route}</span>}
                          </div>

                          {isFreeUser && (
                            <div className="mt-3 space-y-1.5">
                              <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
                                <Lock className="w-3.5 h-3.5 text-slate-400" />
                                <span>History: <span className="font-medium text-amber-600 dark:text-amber-400">Locked</span> - Upgrade to view</span>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
                                <Lock className="w-3.5 h-3.5 text-slate-400" />
                                <span>Alert Setting: <span className="font-medium text-amber-600 dark:text-amber-400">Locked</span> - Upgrade to enable</span>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
                                <Clock className="w-3.5 h-3.5 text-slate-400" />
                                <span>Next Check: Manual only</span>
                              </div>
                            </div>
                          )}

                          <div className="flex items-center gap-3 mt-2 flex-wrap">
                            {result.matchScore > 0 && <Badge variant="secondary" className="text-xs">{result.matchScore}% match</Badge>}
                            <button onClick={() => openHistory(result.fingerprint, result.organisationName)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                              {isFreeUser ? <Lock className="w-3 h-3" /> : <History className="w-3 h-3" />} View History
                            </button>
                            <a href="https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:underline"><ExternalLink className="w-3 h-3" /> Gov.uk</a>
                            <a href={`https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(result.organisationName)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:underline"><Linkedin className="w-3 h-3" /> LinkedIn</a>
                          </div>
                        </div>
                        <div className="shrink-0">
                          {isFreeUser ? (
                            <Button size="sm" onClick={() => setLocation("/pricing")} className="bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-xs font-bold">
                              <Lock className="w-3.5 h-3.5 mr-1" />Upgrade to Monitor
                            </Button>
                          ) : isAdded ? (
                            <Button size="sm" variant="secondary" disabled><Shield className="w-4 h-4 mr-1" />Watching</Button>
                          ) : (
                            <Button size="sm" variant="default" disabled={isAdding} onClick={() => handleAddWatch(result)}>
                              {isAdding ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}Add to Watchlist
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <ManualVsAutomated />
      <FeatureBlocks />
      <SocialProof />
      <PricingSection />
      <FAQSection />

      {isAuthenticated && (
        <section className="py-12 sm:py-16 bg-white dark:bg-background">
          <div className="max-w-3xl mx-auto px-4">
            <div className="flex items-center gap-3 mb-6">
              <Shield className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-bold text-foreground">Your Watchlist</h2>
              {activeWatches.length > 0 && <Badge variant="secondary" className="text-xs">{activeWatches.length} compan{activeWatches.length === 1 ? "y" : "ies"}</Badge>}
            </div>

            {isFreeUser && (
              <Card className="mb-4 border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800">
                <CardContent className="py-3 flex items-center gap-3">
                  <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    Free plan: search only. <a href="/pricing" className="underline font-semibold hover:no-underline text-primary">Upgrade to Starter</a> to add companies and receive alerts.
                  </p>
                </CardContent>
              </Card>
            )}

            {watchesLoading && (
              <div className="space-y-4">{[1, 2].map((i) => (<Card key={i}><CardContent className="py-5"><div className="space-y-3"><div className="flex items-center justify-between"><Skeleton className="h-6 w-56" /><Skeleton className="h-6 w-28" /></div><Skeleton className="h-4 w-36" /><Skeleton className="h-4 w-44" /></div></CardContent></Card>))}</div>
            )}

            {watchesError && !watchesLoading && (
              <Card className="border-destructive/30 bg-destructive/5"><CardContent className="py-4 flex items-center gap-3"><AlertTriangle className="w-5 h-5 text-destructive shrink-0" /><p className="text-sm text-destructive">Unable to load your watchlist right now.</p></CardContent></Card>
            )}

            {!watchesLoading && !watchesError && activeWatches.length === 0 && (
              <Card className="border-dashed">
                <CardContent className="py-10 text-center">
                  <Eye className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <h3 className="font-semibold text-foreground mb-1">No companies watched yet</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    {isFreeUser ? "Upgrade to a paid plan to add companies to your watchlist." : "Search above to find a company and add it to your watchlist."}
                  </p>
                  {isFreeUser && <Button variant="default" size="sm" className="mt-4" onClick={() => setLocation("/pricing")}>View Plans</Button>}
                </CardContent>
              </Card>
            )}

            <AnimatePresence mode="popLayout">
              {activeWatches.map((watch, index) => {
                const isRemoving = removeWatchMutation.isPending && removeWatchMutation.variables === watch.id;
                return (
                  <motion.div key={watch.id} layout initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.97 }} transition={{ ...spring, delay: index * 0.05 }} className="mb-4">
                    <Card className="overflow-hidden">
                      <CardContent className="py-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-3 mb-2 flex-wrap">
                              <h3 className="text-lg font-bold text-foreground">{watch.organisationName}</h3>
                              {getWatchStatusBadge(watch.currentStatus)}
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground mb-1">
                              {watch.townCity && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{watch.townCity}</span>}
                              {watch.currentStatus.route && <span className="inline-flex items-center gap-1"><Route className="w-3.5 h-3.5" />{watch.currentStatus.route}</span>}
                              <span className="inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" />Watching since {formatDate(watch.createdAt)}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-2 flex-wrap">
                              {watch.fingerprint && <button onClick={() => openHistory(watch.fingerprint!, watch.organisationName)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><History className="w-3 h-3" /> View History</button>}
                              <a href="https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:underline"><ExternalLink className="w-3 h-3" /> Gov.uk</a>
                              <a href={`https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(watch.organisationName)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:underline"><Linkedin className="w-3 h-3" /> LinkedIn</a>
                            </div>
                          </div>
                          <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive shrink-0" disabled={isRemoving} onClick={() => removeWatchMutation.mutate(watch.id)}>
                            {isRemoving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}<span className="sr-only">Remove</span>
                          </Button>
                        </div>
                        {watch.recentChanges.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-border/50">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Recent Changes</p>
                            <div className="relative pl-4">
                              <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
                              <div className="space-y-3">
                                {watch.recentChanges.map((change) => (
                                  <div key={change.id} className="relative flex items-start gap-3">
                                    <div className="absolute -left-4 top-0.5 w-[15px] h-[15px] rounded-full bg-background border-2 border-border flex items-center justify-center">{getChangeIcon(change.changeType)}</div>
                                    <div className="ml-4">
                                      <p className="text-sm font-medium text-foreground">{getEventLabel(change.changeType, change.previousValue, change.newValue)}</p>
                                      <p className="text-xs text-muted-foreground">{formatDate(change.detectedAt)}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {!isFreeUser && <NotificationSettings user={user} />}
            {!isFreeUser && <NotificationHistory />}
          </div>
        </section>
      )}

      <section className="bg-slate-950 text-white py-16">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">Do Not Wait For The Letter</h2>
          <p className="text-slate-300 mb-8 max-w-lg mx-auto">
            Get instant alerts when a sponsor licence changes. Protect your visa, your career, and your future in the UK.
          </p>
          <Button onClick={() => setLocation("/pricing")} size="lg" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base px-10 py-6 rounded-xl shadow-lg shadow-emerald-500/20">
            <ShieldCheck className="w-5 h-5 mr-2" />Start Monitoring Now
          </Button>
          <p className="text-xs text-slate-500 mt-4">From £24.99/month. Cancel anytime.</p>
        </div>
      </section>

      <footer className="bg-slate-950 border-t border-slate-800 text-slate-400 py-8">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            <span>Check By AI</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="hover:text-white transition-colors">Verify CoS</Link>
            <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
            <Link href="/sponsor-changes" className="hover:text-white transition-colors">Recent Changes</Link>
          </div>
          <p>We monitor the official UK Home Office register.</p>
        </div>
      </footer>

      <MobileStickyBar />

      {historyTarget && (
        <CompanyHistoryDialog
          fingerprint={historyTarget.fingerprint}
          companyName={historyTarget.name}
          open={historyOpen}
          isFreeUser={isFreeUser}
          onOpenChange={(open) => { setHistoryOpen(open); if (!open) setHistoryTarget(null); }}
        />
      )}
    </PageLayout>
  );
}

const STATUS_TO_TIER: Record<string, string> = { free: "free", starter: "starter", pro: "unlimited", unlimited: "unlimited", enterprise: "enterprise" };
const TIER_CHANNELS: Record<string, string[]> = { free: ["email"], starter: ["email"], pro: ["email", "whatsapp"], unlimited: ["email", "whatsapp", "sms"], enterprise: ["email", "whatsapp", "sms"] };
const TIER_ALERT_TIMING: Record<string, string> = { free: "Next morning (8am UTC)", starter: "Same day (6pm UTC)", pro: "Immediate", unlimited: "Immediate", enterprise: "Immediate" };

function NotificationSettings({ user }: { user: any }) {
  const { toast } = useToast();
  const rawStatus = user?.subscriptionStatus || "free";
  const resolvedTier = STATUS_TO_TIER[rawStatus] || "free";
  const allowedChannels = TIER_CHANNELS[resolvedTier] || TIER_CHANNELS.free;
  const alertTiming = TIER_ALERT_TIMING[resolvedTier] || TIER_ALERT_TIMING.free;

  const { data: prefs, isLoading: prefsLoading } = useQuery<NotificationPrefs>({ queryKey: ["/api/notification-preferences"] });

  const [emailEnabled, setEmailEnabled] = useState(true);
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [smsNumber, setSmsNumber] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    if (prefs) {
      setEmailEnabled(prefs.emailEnabled); setWhatsappEnabled(prefs.whatsappEnabled);
      setWhatsappNumber(prefs.whatsappNumber || ""); setSmsEnabled(prefs.smsEnabled);
      setSmsNumber(prefs.smsNumber || ""); setHasUnsavedChanges(false);
    }
  }, [prefs]);

  const markDirty = useCallback(() => setHasUnsavedChanges(true), []);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/notification-preferences", { email_enabled: emailEnabled, whatsapp_enabled: whatsappEnabled, whatsapp_number: whatsappNumber || null, sms_enabled: smsEnabled, sms_number: smsNumber || null });
      return res.json();
    },
    onSuccess: () => { setHasUnsavedChanges(false); queryClient.invalidateQueries({ queryKey: ["/api/notification-preferences"] }); toast({ title: "Preferences saved" }); },
    onError: (error: Error) => { toast({ title: "Could not save", description: error.message, variant: "destructive" }); },
  });

  if (prefsLoading) {
    return (
      <div className="mt-14">
        <div className="flex items-center gap-3 mb-6"><Bell className="w-5 h-5 text-primary" /><h2 className="text-xl font-bold text-foreground">Notification Settings</h2></div>
        <Card><CardContent className="py-6 space-y-4">{[1, 2, 3].map((i) => (<div key={i} className="flex items-center justify-between"><Skeleton className="h-5 w-40" /><Skeleton className="h-6 w-11 rounded-full" /></div>))}</CardContent></Card>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="mt-14">
      <div className="flex items-center gap-3 mb-6"><Bell className="w-5 h-5 text-primary" /><h2 className="text-xl font-bold text-foreground">Notification Settings</h2></div>
      <div className="flex items-center gap-2 mb-4 px-1 py-2 rounded-lg bg-muted/50 border border-border/50">
        <Clock className="w-4 h-4 text-primary flex-shrink-0" />
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Alert timing:</span> {alertTiming}
          {resolvedTier === "free" && <span>, <a href="/pricing" className="underline hover:no-underline text-primary">upgrade for faster alerts</a></span>}
          {resolvedTier === "starter" && <span>, <a href="/pricing" className="underline hover:no-underline text-primary">upgrade to Pro for immediate alerts</a></span>}
        </p>
      </div>
      <Card>
        <CardContent className="py-6 space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3"><Mail className="w-4 h-4 text-muted-foreground" /><Label htmlFor="email-toggle" className="font-medium cursor-pointer">Email Notifications</Label></div>
              <Switch id="email-toggle" checked={emailEnabled} onCheckedChange={(v) => { setEmailEnabled(v); markDirty(); }} />
            </div>
            {user?.email && <p className="text-xs text-muted-foreground ml-7">Alerts will be sent to {user.email}</p>}
          </div>
          <div className="border-t border-border/50" />
          <PhoneVerificationField channel="whatsapp" label="WhatsApp Notifications" icon={MessageSquare} enabled={whatsappEnabled} onToggle={(v) => { setWhatsappEnabled(v); markDirty(); }} phoneNumber={whatsappNumber} onPhoneChange={(v) => { setWhatsappNumber(v); markDirty(); }} verified={prefs?.whatsappVerified ?? false} channelAllowed={allowedChannels.includes("whatsapp")} requiredPlan="Pro" />
          <div className="border-t border-border/50" />
          <PhoneVerificationField channel="sms" label="SMS Notifications" icon={Phone} enabled={smsEnabled} onToggle={(v) => { setSmsEnabled(v); markDirty(); }} phoneNumber={smsNumber} onPhoneChange={(v) => { setSmsNumber(v); markDirty(); }} verified={prefs?.smsVerified ?? false} channelAllowed={allowedChannels.includes("sms")} requiredPlan="Unlimited" />
          <div className="border-t border-border/50" />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{hasUnsavedChanges ? "You have unsaved changes" : "All changes saved"}</p>
            <Button onClick={() => saveMutation.mutate()} disabled={!hasUnsavedChanges || saveMutation.isPending} size="sm">
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}Save Preferences
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

interface NotificationHistoryEntry {
  id: number; channel: string; status: string; sentAt: string | null;
  organisationName: string; changeType: string; previousValue: string | null; newValue: string | null; detectedAt: string;
}

function getChangeColor(changeType: string) {
  switch (changeType) {
    case "REMOVED": return { bg: "bg-red-100 dark:bg-red-950", text: "text-red-700 dark:text-red-300", border: "border-red-200 dark:border-red-800" };
    case "DOWNGRADED": return { bg: "bg-amber-100 dark:bg-amber-950", text: "text-amber-700 dark:text-amber-300", border: "border-amber-200 dark:border-amber-800" };
    case "UPGRADED": return { bg: "bg-emerald-100 dark:bg-emerald-950", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-800" };
    case "ADDED": return { bg: "bg-blue-100 dark:bg-blue-950", text: "text-blue-700 dark:text-blue-300", border: "border-blue-200 dark:border-blue-800" };
    default: return { bg: "bg-gray-100 dark:bg-gray-900", text: "text-gray-700 dark:text-gray-300", border: "border-gray-200 dark:border-gray-800" };
  }
}

function getChannelBadge(channel: string) {
  switch (channel) {
    case "email": return <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1"><Mail className="w-3 h-3" />Email</Badge>;
    case "whatsapp": return <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1"><MessageSquare className="w-3 h-3" />WhatsApp</Badge>;
    case "sms": return <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1"><Phone className="w-3 h-3" />SMS</Badge>;
    default: return <Badge variant="outline" className="text-[10px] px-1.5 py-0">{channel}</Badge>;
  }
}

function getDeliveryStatus(status: string) {
  switch (status) {
    case "sent": case "delivered": return <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><CheckCheck className="w-3 h-3" />{status === "delivered" ? "Delivered" : "Sent"}</span>;
    case "failed": return <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400"><XOctagon className="w-3 h-3" />Failed</span>;
    case "queued": return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="w-3 h-3" />Queued</span>;
    default: return <span className="text-xs text-muted-foreground">{status}</span>;
  }
}

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return "N/A";
  try { return new Date(dateStr).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return dateStr; }
}

function NotificationHistory() {
  const { data: history, isLoading, error } = useQuery<NotificationHistoryEntry[]>({ queryKey: ["/api/notifications/history"] });

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="mt-14">
      <div className="flex items-center gap-3 mb-6"><History className="w-5 h-5 text-primary" /><h2 className="text-xl font-bold text-foreground">Notification History</h2></div>

      {isLoading && (<Card><CardContent className="py-6 space-y-4">{[1, 2, 3].map((i) => (<div key={i} className="flex items-center justify-between"><div className="space-y-2 flex-1"><Skeleton className="h-4 w-48" /><Skeleton className="h-3 w-32" /></div><Skeleton className="h-5 w-16" /></div>))}</CardContent></Card>)}

      {error && !isLoading && (<Card className="border-destructive/30 bg-destructive/5"><CardContent className="py-4 flex items-center gap-3"><AlertTriangle className="w-5 h-5 text-destructive shrink-0" /><p className="text-sm text-destructive">Unable to load notification history.</p></CardContent></Card>)}

      {!isLoading && !error && history && history.length === 0 && (
        <Card className="border-dashed"><CardContent className="py-10 text-center"><Bell className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" /><h3 className="font-semibold text-foreground mb-1">No alerts yet</h3><p className="text-sm text-muted-foreground max-w-sm mx-auto">We'll notify you here when something changes with your watched companies.</p></CardContent></Card>
      )}

      {!isLoading && !error && history && history.length > 0 && (
        <div className="space-y-2">
          <AnimatePresence>
            {history.map((entry, index) => {
              const colors = getChangeColor(entry.changeType);
              return (
                <motion.div key={entry.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: index * 0.03 }}>
                  <Card className="overflow-hidden">
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <h4 className="font-semibold text-foreground text-sm">{entry.organisationName}</h4>
                            <Badge className={`text-[10px] px-1.5 py-0 ${colors.bg} ${colors.text} ${colors.border}`}>
                              {entry.changeType === "ROUTE_CHANGE" ? "Route Change" : entry.changeType.charAt(0) + entry.changeType.slice(1).toLowerCase()}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">{getEventLabel(entry.changeType, entry.previousValue, entry.newValue)}</p>
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-xs text-muted-foreground">{formatDateTime(entry.sentAt)}</span>
                            {getChannelBadge(entry.channel)}
                            {getDeliveryStatus(entry.status)}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}
