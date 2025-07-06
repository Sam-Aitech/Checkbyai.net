import { useState } from "react";
import { Link } from "wouter";
import { Shield, ArrowLeft, FileCheck, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import FileUploadSimple from "@/components/FileUploadSimple";
import VerificationResults from "@/components/VerificationResults";

export default function VerifyPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = async (file: File) => {
    setIsLoading(true);
    setError(null);
    setVerificationResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/verify-cos', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Verification failed: ${response.statusText}`);
      }

      const result = await response.json();
      setVerificationResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    setIsLoading(false);
  };

  const resetVerification = () => {
    setVerificationResult(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Link href="/">
                <Button variant="ghost" size="sm" className="text-gray-600 hover:text-blue-600">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Home
                </Button>
              </Link>
              
              <div className="flex items-center space-x-2">
                <Shield className="text-blue-600 text-xl" />
                <h1 className="text-lg font-bold text-gray-900 dark:text-white">Document Verification</h1>
              </div>
            </div>
            
            <Link href="/dashboard">
              <Button variant="outline" size="sm">
                View Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Certificate of Sponsorship Verification
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Upload your COS document to verify its authenticity using our AI-powered analysis system
          </p>
        </div>

        {/* Verification Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-3">
              <FileCheck className="w-8 h-8 text-green-600" />
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">Genuine</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Authentic documents</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="w-8 h-8 text-yellow-600" />
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">Edited</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Modified content</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-3">
              <XCircle className="w-8 h-8 text-red-600" />
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">Fake</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Fraudulent documents</p>
              </div>
            </div>
          </div>
        </div>

        {/* File Upload or Results */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
          {!verificationResult && !error ? (
            <div className="p-8">
              <FileUploadSimple
                onFileUpload={handleFileUpload}
                onLoading={setIsLoading}
                onError={handleError}
              />
            </div>
          ) : null}

          {error && (
            <div className="p-8 text-center">
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
                <XCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-red-900 dark:text-red-300 mb-2">
                  Verification Failed
                </h3>
                <p className="text-red-700 dark:text-red-400 mb-4">{error}</p>
                <Button onClick={resetVerification} variant="outline">
                  Try Again
                </Button>
              </div>
            </div>
          )}

          {verificationResult && (
            <div className="p-8">
              <VerificationResults result={verificationResult} />
              <div className="mt-6 text-center">
                <Button onClick={resetVerification} className="mr-4">
                  Verify Another Document
                </Button>
                <Link href="/dashboard">
                  <Button variant="outline">
                    View Dashboard
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Information Section */}
        <div className="mt-12 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
          <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-300 mb-3">
            How Our Verification Works
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-800 dark:text-blue-300">
            <div>
              <h4 className="font-medium mb-2">AI Analysis</h4>
              <p>Advanced machine learning algorithms analyze document metadata, structure, and patterns.</p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Pattern Matching</h4>
              <p>Compare against our database of trusted document patterns and signatures.</p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Security Validation</h4>
              <p>Multi-layer security checks to detect tampering and unauthorized modifications.</p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Confidence Scoring</h4>
              <p>Get detailed confidence scores and analysis breakdown for each verification.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}