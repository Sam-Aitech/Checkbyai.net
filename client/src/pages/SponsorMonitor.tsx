import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Plus, Building2, MapPin, Star, Route, Loader2, Shield,
  AlertTriangle, Eye, Trash2, Clock, ArrowDown, ArrowUp, XCircle, PlusCircle, CalendarDays,
  Bell, Mail, MessageSquare, Phone, CheckCircle2, Send, Save, History, CheckCheck, XOctagon, Clock3,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import PageLayout from "@/components/PageLayout";
import SEOHead from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface SponsorSearchResult {
  organisationName: string;
  townCity: string;
  county: string;
  typeRating: string;
  route: string;
  matchScore: number;
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
  isActive: boolean;
  createdAt: string;
  currentStatus: {
    listed: boolean;
    typeRating: string | null;
    route: string | null;
  };
  recentChanges: SponsorChange[];
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

const springTransition = { type: "spring" as const, stiffness: 100, damping: 15 };

function getStatusBadge(currentStatus: WatchEntry["currentStatus"]) {
  if (!currentStatus.listed) {
    return (
      <motion.div layout transition={springTransition}>
        <Badge className="bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800">
          <XCircle className="w-3 h-3 mr-1" />
          Not Found
        </Badge>
      </motion.div>
    );
  }

  const rating = (currentStatus.typeRating || "").trim().toUpperCase();
  const isARated = rating === "A RATING" || rating === "A" || rating.startsWith("A RATING");
  const isBRated = rating === "B RATING" || rating === "B" || rating.startsWith("B RATING");

  if (isARated) {
    return (
      <motion.div layout transition={springTransition}>
        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800">
          <Shield className="w-3 h-3 mr-1" />
          Active, A-rated
        </Badge>
      </motion.div>
    );
  }

  if (isBRated) {
    return (
      <motion.div layout transition={springTransition}>
        <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Active, B-rated
        </Badge>
      </motion.div>
    );
  }

  return (
    <motion.div layout transition={springTransition}>
      <Badge variant="secondary">
        <Shield className="w-3 h-3 mr-1" />
        Active
      </Badge>
    </motion.div>
  );
}

function getChangeIcon(changeType: string) {
  switch (changeType) {
    case "REMOVED":
      return <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />;
    case "DOWNGRADED":
      return <ArrowDown className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
    case "UPGRADED":
      return <ArrowUp className="w-3.5 h-3.5 text-emerald-500 shrink-0" />;
    case "ADDED":
      return <PlusCircle className="w-3.5 h-3.5 text-blue-500 shrink-0" />;
    default:
      return <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
  }
}

function getChangeLabel(change: SponsorChange) {
  switch (change.changeType) {
    case "REMOVED":
      return "Removed from register";
    case "DOWNGRADED":
      return `Downgraded${change.previousValue && change.newValue ? ` from ${change.previousValue} to ${change.newValue}` : ""}`;
    case "UPGRADED":
      return `Upgraded${change.previousValue && change.newValue ? ` from ${change.previousValue} to ${change.newValue}` : ""}`;
    case "ADDED":
      return "Added to register";
    case "ROUTE_CHANGE":
      return `Route changed${change.previousValue && change.newValue ? ` from ${change.previousValue} to ${change.newValue}` : ""}`;
    default:
      return change.changeType;
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

interface TierConfig {
  plan: string;
  watchLimit: number;
  channels: string[];
  alertTiming: string;
}

function PhoneVerificationField({
  channel,
  label,
  icon: Icon,
  enabled,
  onToggle,
  phoneNumber,
  onPhoneChange,
  verified,
  channelAllowed,
  requiredPlan,
}: {
  channel: "whatsapp" | "sms";
  label: string;
  icon: typeof MessageSquare;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  phoneNumber: string;
  onPhoneChange: (v: string) => void;
  verified: boolean;
  channelAllowed: boolean;
  requiredPlan: string;
}) {
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const { toast } = useToast();

  const sendOtpMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/notification-preferences/verify-phone", {
        phone_number: phoneNumber,
        channel,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setOtpSent(true);
      setOtpCode("");
      toast({ title: "Code sent", description: data.message });
    },
    onError: (error: Error) => {
      toast({ title: "Couldn't send code", description: error.message, variant: "destructive" });
    },
  });

  const confirmOtpMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/notification-preferences/confirm-phone", {
        phone_number: phoneNumber,
        channel,
        code: otpCode,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setOtpSent(false);
      setOtpCode("");
      queryClient.invalidateQueries({ queryKey: ["/api/notification-preferences"] });
      toast({ title: "Verified", description: data.message });
    },
    onError: (error: Error) => {
      toast({ title: "Verification failed", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <Label htmlFor={`${channel}-toggle`} className="font-medium cursor-pointer">
            {label}
          </Label>
        </div>
        <Switch
          id={`${channel}-toggle`}
          checked={enabled}
          onCheckedChange={(v) => {
            if (v && !verified) {
              toast({
                title: "Verification required",
                description: `Please verify your ${channel === "whatsapp" ? "WhatsApp" : "SMS"} number before enabling this channel.`,
              });
              return;
            }
            onToggle(v);
          }}
          disabled={!channelAllowed}
        />
      </div>

      {!channelAllowed && (
        <p className="text-xs text-muted-foreground ml-7">
          Requires {requiredPlan} plan or higher.{" "}
          <a href="/pricing" className="underline hover:no-underline text-primary">
            Upgrade
          </a>
        </p>
      )}

      {channelAllowed && (
        <div className="ml-7 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              type="tel"
              placeholder="+447700900000"
              value={phoneNumber}
              onChange={(e) => onPhoneChange(e.target.value)}
              className="max-w-[220px] h-9 text-sm"
              disabled={!channelAllowed}
            />
            {verified ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4" />
                Verified
              </span>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={!phoneNumber || phoneNumber.length < 8 || sendOtpMutation.isPending}
                onClick={() => sendOtpMutation.mutate()}
                className="h-9"
              >
                {sendOtpMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                ) : (
                  <Send className="w-3.5 h-3.5 mr-1" />
                )}
                Verify
              </Button>
            )}
          </div>

          <AnimatePresence>
            {otpSent && !verified && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={springTransition}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="Enter 6-digit code"
                    value={otpCode}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                      setOtpCode(v);
                    }}
                    className="max-w-[160px] h-9 text-sm tracking-widest text-center"
                    maxLength={6}
                  />
                  <Button
                    size="sm"
                    disabled={otpCode.length !== 6 || confirmOtpMutation.isPending}
                    onClick={() => confirmOtpMutation.mutate()}
                    className="h-9"
                  >
                    {confirmOtpMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    )}
                    Confirm
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Enter the 6-digit code sent to {phoneNumber}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function SponsorMonitor() {
  const [searchQuery, setSearchQuery] = useState("");
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const debouncedQuery = useDebounce(searchQuery, 300);
  const [addedCompanies, setAddedCompanies] = useState<Set<string>>(new Set());

  const shouldSearch = debouncedQuery.trim().length >= 3 && isAuthenticated;

  const {
    data: searchResults,
    isLoading: searchLoading,
    isFetching: searchFetching,
    error: searchError,
  } = useQuery<SponsorSearchResult[]>({
    queryKey: ["/api/sponsors/search", debouncedQuery],
    queryFn: async () => {
      const res = await fetch(`/api/sponsors/search?q=${encodeURIComponent(debouncedQuery.trim())}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Search failed");
      }
      return res.json();
    },
    enabled: shouldSearch,
    staleTime: 30 * 1000,
    retry: false,
  });

  const {
    data: watches,
    isLoading: watchesLoading,
    error: watchesError,
  } = useQuery<WatchEntry[]>({
    queryKey: ["/api/watches"],
    enabled: isAuthenticated,
  });

  const activeWatches = watches?.filter((w) => w.isActive) ?? [];

  const addWatchMutation = useMutation({
    mutationFn: async (company: SponsorSearchResult) => {
      const res = await apiRequest("POST", "/api/watches", {
        organisation_name: company.organisationName,
        town_city: company.townCity,
      });
      return res.json();
    },
    onSuccess: (_data, company) => {
      setAddedCompanies((prev) => new Set(prev).add(company.organisationName));
      queryClient.invalidateQueries({ queryKey: ["/api/watches"] });
      toast({
        title: "Added to watchlist",
        description: `You'll be notified of any changes to ${company.organisationName}'s sponsor licence.`,
      });
    },
    onError: (error: Error, company) => {
      const msg = error.message || "";
      if (msg.includes("limit") || msg.includes("upgrade") || msg.includes("maximum")) {
        toast({
          title: "Watch limit reached",
          description: "You've reached the maximum number of watches for your plan. Upgrade to monitor more companies.",
          variant: "destructive",
          action: (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/pricing")}
              className="shrink-0"
            >
              Upgrade
            </Button>
          ),
        });
      } else if (msg.includes("already watching") || msg.includes("reactivated")) {
        toast({
          title: "Already watching",
          description: msg.includes("reactivated") ? "Your watch has been reactivated." : `You're already watching ${company.organisationName}.`,
        });
        setAddedCompanies((prev) => new Set(prev).add(company.organisationName));
      } else {
        toast({
          title: "Could not add to watchlist",
          description: msg || "Something went wrong. Please try again.",
          variant: "destructive",
        });
      }
    },
  });

  const removeWatchMutation = useMutation({
    mutationFn: async (watchId: number) => {
      const res = await apiRequest("DELETE", `/api/watches/${watchId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watches"] });
      toast({
        title: "Removed from watchlist",
        description: "You will no longer receive alerts for this company.",
      });
    },
    onError: () => {
      toast({
        title: "Could not remove",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAddWatch = useCallback(
    (company: SponsorSearchResult) => {
      if (!isAuthenticated) {
        setLocation("/login");
        return;
      }
      addWatchMutation.mutate(company);
    },
    [isAuthenticated, setLocation, addWatchMutation]
  );

  return (
    <PageLayout>
      <SEOHead
        title="Sponsor Licence Monitor | Instant UK Sponsor Revocation Alerts | CheckByAI"
        description="Get instant email, WhatsApp and SMS alerts when a UK sponsor licence is revoked, suspended or downgraded. Monitor the Home Office register automatically."
        canonicalUrl="https://checkbyai.net/sponsor-monitor"
        ogTitle="Sponsor Licence Monitor | Instant UK Sponsor Revocation Alerts | CheckByAI"
        ogDescription="Get instant email, WhatsApp and SMS alerts when a UK sponsor licence is revoked, suspended or downgraded. Monitor the Home Office register automatically."
        structuredData={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          "name": "Sponsor Licence Monitor",
          "description": "Real-time monitoring service for the UK Home Office Register of Licensed Sponsors. Receive instant alerts when a sponsor licence is revoked, suspended, downgraded, or upgraded.",
          "url": "https://checkbyai.net/sponsor-monitor",
          "applicationCategory": "BusinessApplication",
          "operatingSystem": "Web",
          "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "GBP",
            "description": "Free tier includes 1 company watch with email alerts"
          },
          "featureList": [
            "Daily sponsor register monitoring",
            "Email notifications for licence changes",
            "WhatsApp and SMS alerts (paid plans)",
            "Licence revocation and downgrade detection",
            "Company watchlist management",
            "Notification history and audit trail"
          ],
          "provider": {
            "@type": "Organization",
            "name": "CheckByAI",
            "url": "https://checkbyai.net"
          }
        }}
      />

      <div className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/10 mb-4">
            <Eye className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">Sponsor Monitor</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-3">
            Sponsor Licence Monitor
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Get instant alerts when a company's UK sponsor licence is revoked, suspended, or downgraded.
          </p>
        </div>

        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder="Search for a company name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-12 text-base"
          />
          {searchFetching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground animate-spin" />
          )}
        </div>

        {!isAuthenticated && !authLoading && searchQuery.trim().length >= 3 && (
          <Card className="mt-4 border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
            <CardContent className="flex items-center gap-3 py-4">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Please{" "}
                <button
                  onClick={() => setLocation("/login")}
                  className="underline font-semibold hover:no-underline"
                >
                  log in
                </button>{" "}
                to search the sponsor register and add companies to your watchlist.
              </p>
            </CardContent>
          </Card>
        )}

        {searchQuery.trim().length > 0 && searchQuery.trim().length < 3 && (
          <p className="text-sm text-muted-foreground mt-3 text-center">
            Type at least 3 characters to search
          </p>
        )}

        {searchLoading && shouldSearch && (
          <div className="mt-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-5 w-64" />
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-4 w-48" />
                    </div>
                    <Skeleton className="h-9 w-32" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {searchError && shouldSearch && (
          <Card className="mt-4 border-destructive/30 bg-destructive/5">
            <CardContent className="py-4">
              <p className="text-sm text-destructive">
                {(searchError as Error).message?.includes("503")
                  ? "The sponsor search index is being built. Please try again in a moment."
                  : "Unable to search right now. Please try again."}
              </p>
            </CardContent>
          </Card>
        )}

        {searchResults && searchResults.length === 0 && shouldSearch && !searchLoading && (
          <Card className="mt-4">
            <CardContent className="py-8 text-center">
              <Building2 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground">
                No sponsors found matching "{debouncedQuery}"
              </p>
              <p className="text-sm text-muted-foreground/60 mt-1">
                Try a different spelling or a shorter search term
              </p>
            </CardContent>
          </Card>
        )}

        {searchResults && searchResults.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-sm text-muted-foreground mb-3">
              {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} found
            </p>
            {searchResults.map((result, index) => {
              const isAdded = addedCompanies.has(result.organisationName);
              const isAdding =
                addWatchMutation.isPending &&
                addWatchMutation.variables?.organisationName === result.organisationName;

              return (
                <Card
                  key={`${result.organisationName}-${index}`}
                  className="transition-colors hover:bg-muted/30"
                >
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Building2 className="w-4 h-4 text-primary shrink-0" />
                          <h3 className="font-semibold text-foreground truncate">
                            {result.organisationName}
                          </h3>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          {result.townCity && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5" />
                              {result.townCity}
                              {result.county ? `, ${result.county}` : ""}
                            </span>
                          )}
                          {result.typeRating && (
                            <span className="inline-flex items-center gap-1">
                              <Star className="w-3.5 h-3.5" />
                              {result.typeRating}
                            </span>
                          )}
                          {result.route && (
                            <span className="inline-flex items-center gap-1">
                              <Route className="w-3.5 h-3.5" />
                              {result.route}
                            </span>
                          )}
                        </div>
                        {result.matchScore > 0 && (
                          <Badge variant="secondary" className="mt-2 text-xs">
                            {result.matchScore}% match
                          </Badge>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant={isAdded ? "secondary" : "default"}
                        disabled={isAdded || isAdding}
                        onClick={() => handleAddWatch(result)}
                        className="shrink-0"
                      >
                        {isAdding ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-1" />
                        ) : isAdded ? (
                          <Shield className="w-4 h-4 mr-1" />
                        ) : (
                          <Plus className="w-4 h-4 mr-1" />
                        )}
                        {isAdded ? "Watching" : "Add to Watchlist"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {!searchQuery && !isAuthenticated && (
          <div className="mt-12 text-center">
            <Shield className="w-12 h-12 text-primary/20 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-2">How it works</h2>
            <div className="grid sm:grid-cols-3 gap-6 mt-6 text-left">
              <div className="space-y-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                  1
                </div>
                <h3 className="font-medium text-foreground">Search</h3>
                <p className="text-sm text-muted-foreground">
                  Find your employer or any company on the UK sponsor licence register.
                </p>
              </div>
              <div className="space-y-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                  2
                </div>
                <h3 className="font-medium text-foreground">Watch</h3>
                <p className="text-sm text-muted-foreground">
                  Add companies to your watchlist. We check the register every day for changes.
                </p>
              </div>
              <div className="space-y-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                  3
                </div>
                <h3 className="font-medium text-foreground">Get Alerted</h3>
                <p className="text-sm text-muted-foreground">
                  Receive instant email alerts if a licence is revoked, downgraded, or changed.
                </p>
              </div>
            </div>
          </div>
        )}

        {isAuthenticated && (
          <div className="mt-14">
            <div className="flex items-center gap-3 mb-6">
              <Shield className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-bold text-foreground">Your Watchlist</h2>
              {activeWatches.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {activeWatches.length} compan{activeWatches.length === 1 ? "y" : "ies"}
                </Badge>
              )}
            </div>

            {watchesLoading && (
              <div className="space-y-4">
                {[1, 2].map((i) => (
                  <Card key={i}>
                    <CardContent className="py-5">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Skeleton className="h-6 w-56" />
                          <Skeleton className="h-6 w-28" />
                        </div>
                        <Skeleton className="h-4 w-36" />
                        <Skeleton className="h-4 w-44" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {watchesError && !watchesLoading && (
              <Card className="border-destructive/30 bg-destructive/5">
                <CardContent className="py-4 flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
                  <p className="text-sm text-destructive">
                    Unable to load your watchlist right now. Please try again later.
                  </p>
                </CardContent>
              </Card>
            )}

            {!watchesLoading && !watchesError && activeWatches.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={springTransition}
              >
                <Card className="border-dashed">
                  <CardContent className="py-10 text-center">
                    <Eye className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                    <h3 className="font-semibold text-foreground mb-1">No companies watched yet</h3>
                    <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                      Use the search above to find a company on the UK sponsor register and add it to your watchlist. We'll alert you if anything changes.
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            <AnimatePresence mode="popLayout">
              {activeWatches.map((watch, index) => {
                const isRemoving =
                  removeWatchMutation.isPending &&
                  removeWatchMutation.variables === watch.id;

                return (
                  <motion.div
                    key={watch.id}
                    layout
                    initial={{ opacity: 0, y: 20, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.97 }}
                    transition={{ ...springTransition, delay: index * 0.05 }}
                    className="mb-4"
                  >
                    <Card className="overflow-hidden">
                      <CardContent className="py-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-3 mb-2 flex-wrap">
                              <h3 className="text-lg font-bold text-foreground">
                                {watch.organisationName}
                              </h3>
                              {getStatusBadge(watch.currentStatus)}
                            </div>

                            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground mb-1">
                              {watch.townCity && (
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="w-3.5 h-3.5" />
                                  {watch.townCity}
                                </span>
                              )}
                              {watch.currentStatus.route && (
                                <span className="inline-flex items-center gap-1">
                                  <Route className="w-3.5 h-3.5" />
                                  {watch.currentStatus.route}
                                </span>
                              )}
                              <span className="inline-flex items-center gap-1">
                                <CalendarDays className="w-3.5 h-3.5" />
                                Watching since {formatDate(watch.createdAt)}
                              </span>
                            </div>
                          </div>

                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground hover:text-destructive shrink-0"
                            disabled={isRemoving}
                            onClick={() => removeWatchMutation.mutate(watch.id)}
                          >
                            {isRemoving ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                            <span className="sr-only">Remove</span>
                          </Button>
                        </div>

                        {watch.recentChanges.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-border/50">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                              Recent Changes
                            </p>
                            <div className="relative pl-4">
                              <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
                              <div className="space-y-3">
                                {watch.recentChanges.map((change) => (
                                  <motion.div
                                    key={change.id}
                                    initial={{ opacity: 0, x: -8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={springTransition}
                                    className="relative flex items-start gap-3"
                                  >
                                    <div className="absolute -left-4 top-0.5 w-[15px] h-[15px] rounded-full bg-background border-2 border-border flex items-center justify-center">
                                      {getChangeIcon(change.changeType)}
                                    </div>
                                    <div className="ml-4">
                                      <p className="text-sm font-medium text-foreground">
                                        {getChangeLabel(change)}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {formatDate(change.detectedAt)}
                                      </p>
                                    </div>
                                  </motion.div>
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
          </div>
        )}

        {isAuthenticated && <NotificationSettings user={user} />}

        {isAuthenticated && <NotificationHistory />}
      </div>
    </PageLayout>
  );
}

const STATUS_TO_TIER: Record<string, string> = {
  free: "free",
  starter: "starter",
  pro: "unlimited",
  unlimited: "unlimited",
  enterprise: "enterprise",
};

const TIER_CHANNELS: Record<string, string[]> = {
  free: ["email"],
  starter: ["email"],
  pro: ["email", "whatsapp"],
  unlimited: ["email", "whatsapp", "sms"],
  enterprise: ["email", "whatsapp", "sms"],
};

const TIER_ALERT_TIMING: Record<string, string> = {
  free: "Next morning (8am UTC)",
  starter: "Same day (6pm UTC)",
  pro: "Immediate",
  unlimited: "Immediate",
  enterprise: "Immediate",
};

function NotificationSettings({ user }: { user: any }) {
  const { toast } = useToast();
  const rawStatus = user?.subscriptionStatus || "free";
  const resolvedTier = STATUS_TO_TIER[rawStatus] || "free";
  const allowedChannels = TIER_CHANNELS[resolvedTier] || TIER_CHANNELS.free;
  const alertTiming = TIER_ALERT_TIMING[resolvedTier] || TIER_ALERT_TIMING.free;

  const { data: prefs, isLoading: prefsLoading } = useQuery<NotificationPrefs>({
    queryKey: ["/api/notification-preferences"],
  });

  const [emailEnabled, setEmailEnabled] = useState(true);
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [smsNumber, setSmsNumber] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    if (prefs) {
      setEmailEnabled(prefs.emailEnabled);
      setWhatsappEnabled(prefs.whatsappEnabled);
      setWhatsappNumber(prefs.whatsappNumber || "");
      setSmsEnabled(prefs.smsEnabled);
      setSmsNumber(prefs.smsNumber || "");
      setHasUnsavedChanges(false);
    }
  }, [prefs]);

  const markDirty = useCallback(() => setHasUnsavedChanges(true), []);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/notification-preferences", {
        email_enabled: emailEnabled,
        whatsapp_enabled: whatsappEnabled,
        whatsapp_number: whatsappNumber || null,
        sms_enabled: smsEnabled,
        sms_number: smsNumber || null,
      });
      return res.json();
    },
    onSuccess: () => {
      setHasUnsavedChanges(false);
      queryClient.invalidateQueries({ queryKey: ["/api/notification-preferences"] });
      toast({ title: "Preferences saved", description: "Your notification settings have been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
    },
  });

  if (prefsLoading) {
    return (
      <div className="mt-14">
        <div className="flex items-center gap-3 mb-6">
          <Bell className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">Notification Settings</h2>
        </div>
        <Card>
          <CardContent className="py-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-6 w-11 rounded-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springTransition}
      className="mt-14"
    >
      <div className="flex items-center gap-3 mb-6">
        <Bell className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold text-foreground">Notification Settings</h2>
      </div>

      <div className="flex items-center gap-2 mb-4 px-1 py-2 rounded-lg bg-muted/50 border border-border/50">
        <Clock className="w-4 h-4 text-primary flex-shrink-0" />
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Alert timing:</span>{" "}
          {alertTiming}
          {resolvedTier === "free" && (
            <span> — <a href="/pricing" className="underline hover:no-underline text-primary">upgrade for faster alerts</a></span>
          )}
          {resolvedTier === "starter" && (
            <span> — <a href="/pricing" className="underline hover:no-underline text-primary">upgrade to Pro for immediate alerts</a></span>
          )}
        </p>
      </div>

      <Card>
        <CardContent className="py-6 space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <Label htmlFor="email-toggle" className="font-medium cursor-pointer">
                  Email Notifications
                </Label>
              </div>
              <Switch
                id="email-toggle"
                checked={emailEnabled}
                onCheckedChange={(v) => {
                  setEmailEnabled(v);
                  markDirty();
                }}
              />
            </div>
            {user?.email && (
              <p className="text-xs text-muted-foreground ml-7">
                Alerts will be sent to {user.email}
              </p>
            )}
          </div>

          <div className="border-t border-border/50" />

          <PhoneVerificationField
            channel="whatsapp"
            label="WhatsApp Notifications"
            icon={MessageSquare}
            enabled={whatsappEnabled}
            onToggle={(v) => {
              setWhatsappEnabled(v);
              markDirty();
            }}
            phoneNumber={whatsappNumber}
            onPhoneChange={(v) => {
              setWhatsappNumber(v);
              markDirty();
            }}
            verified={prefs?.whatsappVerified ?? false}
            channelAllowed={allowedChannels.includes("whatsapp")}
            requiredPlan="Pro"
          />

          <div className="border-t border-border/50" />

          <PhoneVerificationField
            channel="sms"
            label="SMS Notifications"
            icon={Phone}
            enabled={smsEnabled}
            onToggle={(v) => {
              setSmsEnabled(v);
              markDirty();
            }}
            phoneNumber={smsNumber}
            onPhoneChange={(v) => {
              setSmsNumber(v);
              markDirty();
            }}
            verified={prefs?.smsVerified ?? false}
            channelAllowed={allowedChannels.includes("sms")}
            requiredPlan="Unlimited"
          />

          <div className="border-t border-border/50" />

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {hasUnsavedChanges ? "You have unsaved changes" : "All changes saved"}
            </p>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!hasUnsavedChanges || saveMutation.isPending}
              size="sm"
            >
              {saveMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <Save className="w-4 h-4 mr-1" />
              )}
              Save Preferences
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

interface NotificationHistoryEntry {
  id: number;
  channel: string;
  status: string;
  sentAt: string | null;
  organisationName: string;
  changeType: string;
  previousValue: string | null;
  newValue: string | null;
  detectedAt: string;
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
    case "sent":
    case "delivered":
      return <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><CheckCheck className="w-3 h-3" />{status === "delivered" ? "Delivered" : "Sent"}</span>;
    case "failed":
      return <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400"><XOctagon className="w-3 h-3" />Failed</span>;
    case "queued":
      return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="w-3 h-3" />Queued</span>;
    default:
      return <span className="text-xs text-muted-foreground">{status}</span>;
  }
}

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function NotificationHistory() {
  const { data: history, isLoading, error } = useQuery<NotificationHistoryEntry[]>({
    queryKey: ["/api/notifications/history"],
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springTransition}
      className="mt-14"
    >
      <div className="flex items-center gap-3 mb-6">
        <History className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold text-foreground">Notification History</h2>
      </div>

      {isLoading && (
        <Card>
          <CardContent className="py-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-5 w-16" />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {error && !isLoading && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            <p className="text-sm text-destructive">
              Unable to load notification history right now. Please try again later.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && history && history.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center">
            <Bell className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="font-semibold text-foreground mb-1">No alerts yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              We'll notify you here when something changes with your watched companies.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && history && history.length > 0 && (
        <div className="space-y-2">
          <AnimatePresence>
            {history.map((entry, index) => {
              const colors = getChangeColor(entry.changeType);
              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...springTransition, delay: index * 0.03 }}
                >
                  <Card className="overflow-hidden">
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <h4 className="font-semibold text-foreground text-sm">
                              {entry.organisationName}
                            </h4>
                            <Badge className={`text-[10px] px-1.5 py-0 ${colors.bg} ${colors.text} ${colors.border}`}>
                              {entry.changeType === "ROUTE_CHANGE" ? "Route Change" : entry.changeType.charAt(0) + entry.changeType.slice(1).toLowerCase()}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">
                            {entry.changeType === "REMOVED"
                              ? "Removed from the sponsor register"
                              : entry.changeType === "ADDED"
                                ? "Added to the sponsor register"
                                : entry.previousValue && entry.newValue
                                  ? `${entry.previousValue} → ${entry.newValue}`
                                  : entry.changeType === "DOWNGRADED"
                                    ? "Rating downgraded"
                                    : entry.changeType === "UPGRADED"
                                      ? "Rating upgraded"
                                      : "Change detected"}
                          </p>
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-xs text-muted-foreground">
                              {formatDateTime(entry.sentAt)}
                            </span>
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
