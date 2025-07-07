import { useState } from "react";
import FileUpload from "./FileUpload";
import FileUploadSimple from "./FileUploadSimple";
import { CloudUpload, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface VerificationResult {
  type: 'Genuine' | 'Edited' | 'Fake';
  mismatchedFields?: string[];
}

export default function UserPortal() {
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const { toast } = useToast();

  const transformResult = (backendResult: any): VerificationResult => {
    // Transform backend response to match our interface
    const typeMapping: Record<string, 'Genuine' | 'Edited' | 'Fake'> = {
      'genuine': 'Genuine',
      'suspicious': 'Edited',
      'fake': 'Fake'
    };

    return {
      type: typeMapping[backendResult.result] || 'Fake',
      mismatchedFields: backendResult.mismatchedFields || []
    };
  };

  const verifyMutation = useMutation({
    mutationFn: async (file: File) => {
      console.log('UserPortal mutation disabled - using FileUpload component instead');
      // This mutation is disabled as FileUpload component handles verification directly
      throw new Error('This verification method is disabled');
    },
    onSuccess: (result) => {
      const transformedResult = transformResult(result);
      setVerificationResult(transformedResult);
      toast({
        title: "Verification Complete",
        description: `Document verified as ${transformedResult.type.toUpperCase()}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Verification Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = (file: File) => {
    console.log('UserPortal handleFileUpload - verification handled by FileUpload component');
    // File verification is now handled directly by the FileUpload component
    // No need to trigger mutation here
  };

  return (
    <div>
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Verify Certificate of Sponsorship</h2>
        <p className="text-lg text-gray-600 max-w-3xl mx-auto">
          Upload your COS document for instant verification against our database of trusted patterns. 
          Our AI-powered system analyzes PDF metadata to detect genuine, edited, or fraudulent documents.
        </p>
      </div>

      {/* Main Verification Section */}
      <div className="grid lg:grid-cols-2 gap-8 mb-12">
        {/* Upload Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="text-center mb-6">
            <CloudUpload className="h-12 w-12 text-primary mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Upload COS Document</h3>
            <p className="text-gray-600">Drag and drop your PDF file or click to browse</p>
          </div>

          <FileUploadSimple 
            onFileUpload={handleFileUpload}
            restrictToOneCheck={true}
          />
        </div>

        {/* Verification Process */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <h3 className="text-xl font-semibold text-gray-900 mb-6">Verification Process</h3>
          
          <div className="space-y-4">
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 w-8 h-8 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
                <CheckCircle className="h-4 w-4" />
              </div>
              <div>
                <h4 className="font-medium text-gray-900">Metadata Extraction</h4>
                <p className="text-sm text-gray-600">Extract XMP metadata including creation date, producer, and creator tool information</p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                verifyMutation.isPending 
                  ? 'bg-yellow-100 text-yellow-600' 
                  : 'bg-gray-100 text-gray-400'
              }`}>
                {verifyMutation.isPending ? (
                  <div className="animate-spin h-4 w-4 border-2 border-yellow-600 border-t-transparent rounded-full"></div>
                ) : (
                  <span className="text-sm font-medium">2</span>
                )}
              </div>
              <div>
                <h4 className="font-medium text-gray-900">Pattern Analysis</h4>
                <p className="text-sm text-gray-600">Compare against trusted patterns using rule-based matching and vector similarity</p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 w-8 h-8 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium">3</span>
              </div>
              <div>
                <h4 className="font-medium text-gray-900">AI Verification</h4>
                <p className="text-sm text-gray-600">ML model inference using ONNX Runtime for advanced pattern recognition</p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 w-8 h-8 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium">4</span>
              </div>
              <div>
                <h4 className="font-medium text-gray-900">Result Generation</h4>
                <p className="text-sm text-gray-600">Generate verification result and detailed analysis</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Results Section - Clean display without confidence percentages */}
      {verificationResult && (
        <div className="mt-6 p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Verification Result</h3>
          
          <div className="flex items-center gap-3 mb-4">
            <div className={`px-4 py-2 rounded-full text-base font-semibold transition-all duration-700 ease-in-out transform hover:scale-105 ${
              verificationResult.type === 'Genuine' 
                ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white shadow-lg shadow-green-500/25 animate-pulse'
                : verificationResult.type === 'Edited'
                ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white shadow-lg shadow-yellow-500/25 animate-bounce'
                : 'bg-gradient-to-r from-red-400 to-rose-500 text-white shadow-lg shadow-red-500/25 animate-pulse'
            }`}>
              {verificationResult.type}
            </div>
          </div>

          {verificationResult.mismatchedFields && verificationResult.mismatchedFields.length > 0 && (
            <div className="mb-4">
              <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Issues detected:</h4>
              <ul className="list-disc list-inside text-gray-600 dark:text-gray-400">
                {verificationResult.mismatchedFields.map((field: string, index: number) => (
                  <li key={index}>{field}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
