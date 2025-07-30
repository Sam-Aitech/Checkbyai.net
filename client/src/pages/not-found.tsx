import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import SEOHead from "@/components/SEOHead";

export default function NotFound() {
  const notFoundSEO = {
    title: "Page Not Found - Document Authenticator",
    description: "The page you're looking for doesn't exist. Return to Document Authenticator to verify your documents with AI-powered technology.",
    keywords: "404, page not found, document verification",
    canonicalUrl: "https://document-authenticator.replit.app/404"
  };

  return (
    <>
      <SEOHead {...notFoundSEO} />
      <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6">
            <div className="flex mb-4 gap-2">
              <AlertCircle className="h-8 w-8 text-red-500" />
              <h1 className="text-2xl font-bold text-gray-900">404 Page Not Found</h1>
            </div>

            <p className="mt-4 text-sm text-gray-600 mb-6">
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
    </>
  );
}
