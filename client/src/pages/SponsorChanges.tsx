import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowDown, ArrowUp, XCircle, PlusCircle, Route, Calendar, Building2, Loader2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import PageLayout from "@/components/PageLayout";
import SEOHead from "@/components/SEOHead";

interface SponsorChange {
  id: number;
  organisationName: string;
  changeType: string;
  previousValue: string | null;
  newValue: string | null;
  detectedAt: string;
  snapshotDate: string;
}

interface ChangesResponse {
  changes: SponsorChange[];
  grouped: Record<string, SponsorChange[]>;
  totalCount: number;
}

const changeConfig: Record<string, { label: string; icon: any; color: string; bg: string; border: string }> = {
  REMOVED: { label: "Removed", icon: XCircle, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/30", border: "border-red-200 dark:border-red-800" },
  ADDED: { label: "Added", icon: PlusCircle, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/30", border: "border-blue-200 dark:border-blue-800" },
  DOWNGRADED: { label: "Downgraded", icon: ArrowDown, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/30", border: "border-orange-200 dark:border-orange-800" },
  UPGRADED: { label: "Upgraded", icon: ArrowUp, color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-950/30", border: "border-green-200 dark:border-green-800" },
  ROUTE_CHANGE: { label: "Route Changed", icon: Route, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-950/30", border: "border-purple-200 dark:border-purple-800" },
};

function ChangeCard({ change }: { change: SponsorChange }) {
  const config = changeConfig[change.changeType] || changeConfig.ADDED;
  const Icon = config.icon;

  return (
    <div className={`flex items-start gap-3 p-4 rounded-lg border ${config.bg} ${config.border}`}>
      <div className={`mt-0.5 ${config.color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">{change.organisationName}</span>
          <Badge variant="outline" className={`text-xs ${config.color} ${config.border}`}>{config.label}</Badge>
        </div>
        {(change.previousValue || change.newValue) && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {change.previousValue && change.newValue
              ? `${change.previousValue} → ${change.newValue}`
              : change.newValue
                ? `Now: ${change.newValue}`
                : `Was: ${change.previousValue}`
            }
          </p>
        )}
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          {change.detectedAt ? new Date(change.detectedAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
        </p>
      </div>
    </div>
  );
}

export default function SponsorChanges() {
  const { data, isLoading, error } = useQuery<ChangesResponse>({
    queryKey: ["/api/sponsor-changes"],
    refetchInterval: 60000,
  });

  const sortedDates = data?.grouped ? Object.keys(data.grouped).sort((a, b) => b.localeCompare(a)) : [];

  return (
    <PageLayout>
      <SEOHead
        title="Sponsor Licence Changes | CheckByAI"
        description="Track recent changes to the UK Home Office Register of Licensed Sponsors. See which companies have been added, removed, upgraded, or downgraded in the last 7 days."
        canonicalUrl="https://checkbyai.net/sponsor-changes"
        ogTitle="UK Sponsor Licence Changes: Last 7 Days"
        ogDescription="Real-time monitoring of the UK sponsor licence register. Stay informed about companies being added, removed, or having their licence status changed."
        structuredData={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "UK Sponsor Licence Changes",
          description: "Track recent changes to the UK Home Office Register of Licensed Sponsors over the last 7 days.",
          url: "https://checkbyai.net/sponsor-changes",
          isPartOf: { "@type": "WebSite", name: "CheckByAI", url: "https://checkbyai.net" },
        }}
      />

      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Building2 className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Sponsor Licence Changes</h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Recent changes detected in the UK Home Office Register of Licensed Sponsors over the last 7 days.
            Data sourced from <a href="https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers" target="_blank" rel="noopener noreferrer" className="text-primary underline hover:no-underline">gov.uk</a>.
          </p>
        </div>

        {isLoading && (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <Card key={i}>
                <CardHeader><Skeleton className="h-6 w-40" /></CardHeader>
                <CardContent className="space-y-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {error && (
          <Card className="border-red-200 dark:border-red-800">
            <CardContent className="p-6 text-center">
              <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
              <p className="text-gray-600 dark:text-gray-400">Failed to load sponsor changes. Please try again later.</p>
            </CardContent>
          </Card>
        )}

        {data && data.totalCount === 0 && !isLoading && (
          <Card>
            <CardContent className="p-8 text-center">
              <Building2 className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">No changes detected</h3>
              <p className="text-gray-500 dark:text-gray-400">No sponsor licence changes have been detected in the last 7 days. This is normal: changes typically occur a few times per week.</p>
            </CardContent>
          </Card>
        )}

        {data && sortedDates.length > 0 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {data.totalCount} change{data.totalCount !== 1 ? "s" : ""} across {sortedDates.length} day{sortedDates.length !== 1 ? "s" : ""}
              </p>
              <Badge variant="outline" className="text-xs">
                <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Live updates
              </Badge>
            </div>

            {sortedDates.map(dateKey => {
              const dayChanges = data.grouped[dateKey];
              const formattedDate = new Date(dateKey + "T00:00:00").toLocaleDateString("en-GB", {
                weekday: "long", day: "numeric", month: "long", year: "numeric"
              });

              const summary: Record<string, number> = {};
              for (const c of dayChanges) {
                summary[c.changeType] = (summary[c.changeType] || 0) + 1;
              }

              return (
                <Card key={dateKey}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        {formattedDate}
                      </CardTitle>
                      <div className="flex gap-1.5 flex-wrap">
                        {Object.entries(summary).map(([type, count]) => {
                          const cfg = changeConfig[type];
                          return cfg ? (
                            <Badge key={type} variant="outline" className={`text-xs ${cfg.color} ${cfg.border}`}>
                              {cfg.label}: {count}
                            </Badge>
                          ) : null;
                        })}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {dayChanges.map(change => (
                      <ChangeCard key={change.id} change={change} />
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <div className="mt-8 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-800 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Want to get notified when a specific company's status changes?{" "}
            <a href="/sponsor-monitor" className="text-primary font-medium underline hover:no-underline">
              Set up a watch on Sponsor Monitor
            </a>
          </p>
        </div>
      </div>
    </PageLayout>
  );
}
