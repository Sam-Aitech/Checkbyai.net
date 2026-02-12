import { AlertCircle, Home } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import SEOHead from "@/components/SEOHead";
import PageLayout from "@/components/PageLayout";
import { motion } from "framer-motion";

const spring = { type: "spring" as const, stiffness: 100, damping: 15 };

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
      <div className="w-full flex items-center justify-center bg-background py-20">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          className="w-full max-w-md mx-4 brutalist-border rounded-sm bg-card p-8"
        >
          <div className="flex mb-4 gap-3 items-center">
            <AlertCircle className="h-6 w-6 text-destructive flex-shrink-0" />
            <h1 className="text-2xl editorial-subheading text-foreground">404 Page Not Found</h1>
          </div>

          <p className="mt-4 text-sm text-muted-foreground editorial-body mb-6">
            The page you're looking for doesn't exist or has been moved.
          </p>

          <Link href="/">
            <motion.div whileTap={{ scale: 0.97 }}>
              <Button className="bg-foreground text-background hover:bg-foreground/90 rounded-sm w-full">
                <Home className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
            </motion.div>
          </Link>
        </motion.div>
      </div>
    </PageLayout>
  );
}
