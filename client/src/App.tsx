import { lazy, Suspense, type ComponentType } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SocketNotificationListener } from "./hooks/useSocket";

// Vite can briefly reject a lazy module request while a development HMR update
// is invalidating the module graph. Retry once after a full reload so a
// transient stale module URL does not leave the route inside ErrorBoundary.
function lazyWithRetry<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>,
  routeKey: string,
) {
  const retryKey = `lazy-route-retry:${routeKey}`;

  return lazy(async () => {
    try {
      const module = await loader();
      sessionStorage.removeItem(retryKey);
      return module;
    } catch (error) {
      if (!sessionStorage.getItem(retryKey)) {
        sessionStorage.setItem(retryKey, "1");
        window.location.reload();
        await new Promise<never>(() => {});
      }

      sessionStorage.removeItem(retryKey);
      throw error;
    }
  });
}

// Lazy load all routes for better performance
const Home = lazyWithRetry(() => import("@/pages/home"), "home");
const LoginPage = lazyWithRetry(() => import("@/pages/login"), "login");
const SimpleAdmin = lazyWithRetry(() => import("@/pages/SimpleAdmin"), "admin");
const DashboardPage = lazyWithRetry(() => import("@/pages/dashboard"), "dashboard");
const Pricing = lazyWithRetry(() => import("@/pages/Pricing"), "pricing");
const CosPricing = lazyWithRetry(() => import("@/pages/CosPricing"), "cos-pricing");
const CheckoutSuccess = lazyWithRetry(() => import("@/pages/CheckoutSuccess"), "checkout-success");
const Submit = lazyWithRetry(() => import("@/pages/Submit"), "submit");
const AIGuide = lazyWithRetry(() => import("@/pages/AIGuide"), "ai-guide");
const COSGuide = lazyWithRetry(() => import("@/pages/COSGuide"), "cos-guide");
const Technology = lazyWithRetry(() => import("@/pages/Technology"), "technology");
const ApiDocs = lazyWithRetry(() => import("@/pages/ApiDocs"), "api-docs");
const VerificationHistory = lazyWithRetry(() => import("@/pages/VerificationHistory"), "verification-history");
const SponsorMonitor = lazyWithRetry(() => import("@/pages/SponsorMonitor"), "sponsor-monitor");
const SponsorDashboard = lazyWithRetry(() => import("@/pages/SponsorDashboard"), "sponsor-dashboard");
const SponsorChanges = lazyWithRetry(() => import("@/pages/SponsorChanges"), "sponsor-changes");
const SponsorDirectory = lazyWithRetry(() => import("@/pages/SponsorDirectory"), "sponsor-directory");
const CheckFakeCoS = lazyWithRetry(() => import("@/pages/CheckFakeCoS"), "check-fake-cos");
const WhatToDoFakeCoS = lazyWithRetry(() => import("@/pages/WhatToDoFakeCoS"), "what-to-do-fake-cos");
const About = lazyWithRetry(() => import("@/pages/About"), "about");
const ProDashboardOverview = lazyWithRetry(() => import("@/pages/pro-dashboard/Overview"), "pro-dashboard-overview");
const ProDashboardMonitor = lazyWithRetry(() => import("@/pages/pro-dashboard/Monitor"), "pro-dashboard-monitor");
const ProDashboardJobs = lazyWithRetry(() => import("@/pages/pro-dashboard/Jobs"), "pro-dashboard-jobs");
const ProDashboardAlerts = lazyWithRetry(() => import("@/pages/pro-dashboard/Alerts"), "pro-dashboard-alerts");
const ProDashboardHistory = lazyWithRetry(() => import("@/pages/pro-dashboard/History"), "pro-dashboard-history");
const ProDashboardSupport = lazyWithRetry(() => import("@/pages/pro-dashboard/Support"), "pro-dashboard-support");
const ProDashboardAccount = lazyWithRetry(() => import("@/pages/pro-dashboard/Account"), "pro-dashboard-account");
const SponsorDetail = lazyWithRetry(() => import("@/pages/SponsorDetail"), "sponsor-detail");
const ReceiptPage = lazyWithRetry(() => import("@/pages/ReceiptPage"), "receipt");
const NotFound = lazyWithRetry(() => import("@/pages/not-found"), "not-found");

// Minimal loading component for route transitions
function RouteLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center">
        <div className="w-8 h-8 bg-primary/10 rounded-xl mx-auto mb-4 animate-spin" />
        <p className="editorial-caption text-muted-foreground">Loading</p>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<RouteLoader />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/login" component={LoginPage} />
        <Route path="/admin/:domain" component={SimpleAdmin} />
        <Route path="/admin" component={SimpleAdmin} />
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/verify-cos" component={DashboardPage} />
        <Route path="/pricing" component={Pricing} />
        <Route path="/cos-pricing" component={CosPricing} />
        <Route path="/checkout/success" component={CheckoutSuccess} />
        <Route path="/submit" component={Submit} />
        <Route path="/ai-guide" component={AIGuide} />
        <Route path="/cos-guide" component={COSGuide} />
        <Route path="/technology" component={Technology} />
        <Route path="/api-docs" component={ApiDocs} />
        <Route path="/history" component={VerificationHistory} />
        <Route path="/dashboard/sponsor" component={SponsorDashboard} />
        <Route path="/sponsor-monitor" component={SponsorMonitor} />
        <Route path="/sponsor-changes" component={SponsorChanges} />
        <Route path="/sponsors" component={SponsorDirectory} />
        <Route path="/check-fake-cos" component={CheckFakeCoS} />
        <Route path="/what-to-do-fake-cos" component={WhatToDoFakeCoS} />
        <Route path="/about" component={About} />
        <Route path="/pro-dashboard" component={ProDashboardOverview} />
        <Route path="/pro-dashboard/monitor" component={ProDashboardMonitor} />
        <Route path="/pro-dashboard/jobs" component={ProDashboardJobs} />
        <Route path="/pro-dashboard/alerts" component={ProDashboardAlerts} />
        <Route path="/pro-dashboard/history" component={ProDashboardHistory} />
        <Route path="/pro-dashboard/support" component={ProDashboardSupport} />
        <Route path="/pro-dashboard/account" component={ProDashboardAccount} />
        <Route path="/sponsor/:id/:slug" component={SponsorDetail} />
        <Route path="/sponsor/:id" component={SponsorDetail} />
        <Route path="/receipt/:receiptId" component={ReceiptPage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SocketNotificationListener />
        <Toaster />
        <ErrorBoundary>
          <Router />
        </ErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
