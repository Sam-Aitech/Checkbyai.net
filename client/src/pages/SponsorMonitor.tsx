import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Plus, Building2, MapPin, Star, Route, Loader2, Shield,
  AlertTriangle, Eye, Trash2, Clock, ArrowDown, ArrowUp, XCircle, PlusCircle, CalendarDays,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
        title="Sponsor Licence Monitor | Check By AI"
        description="Get instant alerts when a UK sponsor licence is revoked, suspended, or downgraded. Monitor companies on the Home Office register in real time."
        canonicalUrl="https://checkbyai.net/sponsor-monitor"
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
      </div>
    </PageLayout>
  );
}
