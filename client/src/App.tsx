import { lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Lazy load all routes for better performance
const Home = lazy(() => import("@/pages/home"));
const LoginPage = lazy(() => import("@/pages/login"));
const SimpleAdmin = lazy(() => import("@/pages/SimpleAdmin"));
const DashboardPage = lazy(() => import("@/pages/dashboard"));
const Pricing = lazy(() => import("@/pages/Pricing"));
const CosPricing = lazy(() => import("@/pages/CosPricing"));
const CheckoutSuccess = lazy(() => import("@/pages/CheckoutSuccess"));
const Submit = lazy(() => import("@/pages/Submit"));
const AIGuide = lazy(() => import("@/pages/AIGuide"));
const COSGuide = lazy(() => import("@/pages/COSGuide"));
const Technology = lazy(() => import("@/pages/Technology"));
const ApiDocs = lazy(() => import("@/pages/ApiDocs"));
const VerificationHistory = lazy(() => import("@/pages/VerificationHistory"));
const SponsorMonitor = lazy(() => import("@/pages/SponsorMonitor"));
const SponsorChanges = lazy(() => import("@/pages/SponsorChanges"));
const CheckFakeCoS = lazy(() => import("@/pages/CheckFakeCoS"));
const WhatToDoFakeCoS = lazy(() => import("@/pages/WhatToDoFakeCoS"));
const About = lazy(() => import("@/pages/About"));
const NotFound = lazy(() => import("@/pages/not-found"));

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
        <Route path="/admin" component={SimpleAdmin} />
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/pricing" component={Pricing} />
        <Route path="/cos-pricing" component={CosPricing} />
        <Route path="/checkout/success" component={CheckoutSuccess} />
        <Route path="/submit" component={Submit} />
        <Route path="/ai-guide" component={AIGuide} />
        <Route path="/cos-guide" component={COSGuide} />
        <Route path="/technology" component={Technology} />
        <Route path="/api-docs" component={ApiDocs} />
        <Route path="/history" component={VerificationHistory} />
        <Route path="/sponsor-monitor" component={SponsorMonitor} />
        <Route path="/sponsor-changes" component={SponsorChanges} />
        <Route path="/check-fake-cos" component={CheckFakeCoS} />
        <Route path="/what-to-do-fake-cos" component={WhatToDoFakeCoS} />
        <Route path="/about" component={About} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <ErrorBoundary>
          <Router />
        </ErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
