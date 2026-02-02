import { lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

// Lazy load all routes for better performance
const Home = lazy(() => import("@/pages/home"));
const LoginPage = lazy(() => import("@/pages/login"));
const SimpleAdmin = lazy(() => import("@/pages/SimpleAdmin"));
const DashboardPage = lazy(() => import("@/pages/dashboard"));
const Pricing = lazy(() => import("@/pages/Pricing"));
const CheckoutSuccess = lazy(() => import("@/pages/CheckoutSuccess"));
const Submit = lazy(() => import("@/pages/Submit"));
const NotFound = lazy(() => import("@/pages/not-found"));

// Minimal loading component for route transitions
function RouteLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-900 dark:to-gray-800">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600 dark:text-gray-400">Loading...</p>
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
        <Route path="/pricing" component={Pricing} />
        <Route path="/checkout/success" component={CheckoutSuccess} />
        <Route path="/submit" component={Submit} />
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
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
