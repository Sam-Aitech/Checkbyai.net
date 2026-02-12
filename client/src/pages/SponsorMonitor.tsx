import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Search, Plus, Building2, MapPin, Star, Route, Loader2, Shield, AlertTriangle, Eye } from "lucide-react";
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

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
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

  const addWatchMutation = useMutation({
    mutationFn: async (company: SponsorSearchResult) => {
      const res = await apiRequest("POST", "/api/watches", {
        organisation_name: company.organisationName,
        town_city: company.townCity,
      });
      return res.json();
    },
    onSuccess: (data, company) => {
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

        {!searchQuery && (
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
      </div>
    </PageLayout>
  );
}
