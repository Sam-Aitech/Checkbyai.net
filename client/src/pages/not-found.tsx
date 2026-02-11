import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import SEOHead from "@/components/SEOHead";
import PageLayout from "@/components/PageLayout";

export default function NotFound() {
  const notFoundSEO = {
    title: "Page Not Found | Check By AI",
    description: "The page you're looking for doesn't exist. Return to Check By AI to verify your documents with AI-powered technology.",
    keywords: "404, page not found, document verification",
    canonicalUrl: "https://checkbyai.net/404"
  };

  return (
    <PageLayout>
      <SEOHead {...notFoundSEO} />
      <div className="w-full flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-20">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6">
            <div className="flex mb-4 gap-2">
              <AlertCircle className="h-8 w-8 text-red-500" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">404 Page Not Found</h1>
            </div>

            <p className="mt-4 text-sm text-gray-600 dark:text-gray-400 mb-6">
              The page you're looking for doesn't exist or has been moved.
            </p>

            <Link href="/">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white w-full">
                <Home className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
