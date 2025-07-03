import { useState } from "react";
import FileUpload from "./FileUpload";
import VerificationResults from "./VerificationResults";
import { CloudUpload, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface VerificationResult {
  id: number;
  result: 'genuine' | 'suspicious' | 'fake';
  confidence: number;
  details: any;
}

export default function UserPortal() {
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const { toast } = useToast();

  const verifyMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await apiRequest('POST', '/api/verify', formData);
      return response.json();
    },
    onSuccess: (result) => {
      setVerificationResult(result);
      toast({
        title: "Verification Complete",
        description: `Document verified as ${result.result.toUpperCase()} with ${result.confidence.toFixed(1)}% confidence`,
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
    verifyMutation.mutate(file);
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

          <FileUpload
            onFileSelect={handleFileUpload}
            isLoading={verifyMutation.isPending}
            accept=".pdf"
            maxSize={10 * 1024 * 1024} // 10MB
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
                <p className="text-sm text-gray-600">Generate confidence score and detailed verification report</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Results Section */}
      {verificationResult && (
        <VerificationResults result={verificationResult} />
      )}
    </div>
  );
}
