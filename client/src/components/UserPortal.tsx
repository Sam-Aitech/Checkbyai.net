import { useState, useEffect } from "react";
import FileUpload from "./FileUpload";
import FileUploadSimple from "./FileUploadSimple";
import { CloudUpload, CheckCircle, AlertTriangle, XCircle, Clock, Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface VerificationResult {
  type: 'Genuine' | 'Edited' | 'Fake';
  mismatchedFields?: string[];
}

export default function UserPortal() {
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [verificationSteps, setVerificationSteps] = useState([
    { id: 1, title: "Metadata Extraction", description: "Extract XMP metadata including creation date, producer, and creator tool information", status: "pending" },
    { id: 2, title: "Pattern Analysis", description: "Compare against trusted patterns using rule-based matching and vector similarity", status: "pending" },
    { id: 3, title: "AI Verification", description: "ML model inference using ONNX Runtime for advanced pattern recognition", status: "pending" },
    { id: 4, title: "Result Generation", description: "Generate verification result and detailed analysis", status: "pending" }
  ]);
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

  // Animate verification steps
  const animateVerificationSteps = async () => {
    setLoading(true);
    setCurrentStep(0);
    
    // Reset all steps to pending
    setVerificationSteps(prev => prev.map(step => ({ ...step, status: "pending" })));
    
    // Animate through each step
    for (let i = 0; i < verificationSteps.length; i++) {
      setCurrentStep(i);
      
      // Set current step to processing
      setVerificationSteps(prev => prev.map((step, index) => 
        index === i ? { ...step, status: "processing" } : step
      ));
      
      // Wait for animation
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Set current step to completed
      setVerificationSteps(prev => prev.map((step, index) => 
        index === i ? { ...step, status: "completed" } : step
      ));
      
      // Wait before next step
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    setLoading(false);
  };

  const handleFileUpload = async (file: File) => {
    console.log('UserPortal handleFileUpload - starting verification animation');
    
    // Start the animation and real verification simultaneously
    const animationPromise = animateVerificationSteps();
    const verificationPromise = verifyMutation.mutateAsync(file);
    
    // Wait for both to complete
    try {
      await Promise.all([animationPromise, verificationPromise]);
    } catch (error) {
      console.error('Verification failed:', error);
      setLoading(false);
    }
  };

  const handleVerificationResult = (result: VerificationResult) => {
    setVerificationResult(result);
  };

  const handleLoading = (isLoading: boolean) => {
    if (!isLoading && verificationResult) {
      // Animation will be handled by animateVerificationSteps
    }
  };

  const handleError = (error: string) => {
    setLoading(false);
    toast({
      title: "Verification Error",
      description: error,
      variant: "destructive"
    });
  };

  return (
    <div>
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Verify Document Authenticity</h2>
        <p className="text-lg text-gray-600 max-w-3xl mx-auto">
          Upload your document for instant verification against our database of trusted patterns. 
          Our AI-powered system analyzes PDF metadata to detect genuine, edited, or fraudulent documents.
        </p>
      </div>

      {/* Main Verification Section */}
      <div className="grid lg:grid-cols-2 gap-8 mb-12">
        {/* Upload Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="text-center mb-6">
            <CloudUpload className="h-12 w-12 text-primary mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Upload Document</h3>
            <p className="text-gray-600">Drag and drop your PDF file or click to browse</p>
          </div>

          <FileUploadSimple 
            onFileUpload={handleFileUpload}
            onVerificationResult={handleVerificationResult}
            onLoading={handleLoading}
            onError={handleError}
            restrictToOneCheck={true}
          />
        </div>

        {/* Verification Process */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <h3 className="text-xl font-semibold text-gray-900 mb-6">Verification Process</h3>
          
          <div className="space-y-4">
            {verificationSteps.map((step, index) => (
              <div key={step.id} className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500 ${
                    step.status === 'completed' 
                      ? 'bg-green-500 text-white scale-110' 
                      : step.status === 'processing'
                      ? 'bg-blue-500 text-white animate-pulse'
                      : 'bg-gray-200 text-gray-500'
                  }`}>
                    {step.status === 'completed' ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : step.status === 'processing' ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Clock className="w-5 h-5" />
                    )}
                  </div>
                </div>
                
                <div className="flex-grow">
                  <div className="flex items-center justify-between">
                    <h4 className={`font-medium transition-colors duration-300 ${
                      step.status === 'completed' ? 'text-green-700' : 
                      step.status === 'processing' ? 'text-blue-700' : 'text-gray-700'
                    }`}>
                      {step.title}
                    </h4>
                    {step.status === 'completed' && (
                      <span className="text-green-600 text-sm font-medium animate-fadeIn">✓ Complete</span>
                    )}
                    {step.status === 'processing' && (
                      <span className="text-blue-600 text-sm font-medium animate-pulse">Processing...</span>
                    )}
                  </div>
                  <p className={`text-sm mt-1 transition-colors duration-300 ${
                    step.status === 'completed' ? 'text-green-600' : 
                    step.status === 'processing' ? 'text-blue-600' : 'text-gray-500'
                  }`}>
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Results Section */}
          {!loading && verificationResult && (
            <div className="mt-8 pt-6 border-t border-gray-200">
              <h4 className="text-lg font-semibold text-gray-900 mb-4">Verification Results</h4>
              <div className={`p-6 rounded-lg border-2 ${
                verificationResult.type === 'Genuine' 
                  ? 'bg-green-50 border-green-200' 
                  : verificationResult.type === 'Edited'
                  ? 'bg-yellow-50 border-yellow-200'
                  : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-center space-x-3">
                  {verificationResult.type === 'Genuine' && <CheckCircle className="h-8 w-8 text-green-600" />}
                  {verificationResult.type === 'Edited' && <AlertTriangle className="h-8 w-8 text-yellow-600" />}
                  {verificationResult.type === 'Fake' && <XCircle className="h-8 w-8 text-red-600" />}
                  
                  <div>
                    <h5 className="text-lg font-semibold">
                      Document is {verificationResult.type}
                    </h5>
                    <p className="text-sm text-gray-600">
                      {verificationResult.type === 'Genuine' && 'This document appears to be authentic'}
                      {verificationResult.type === 'Edited' && 'This document may have been modified'}
                      {verificationResult.type === 'Fake' && 'This document appears to be fraudulent'}
                    </p>
                  </div>
                </div>
                
                {verificationResult.mismatchedFields && verificationResult.mismatchedFields.length > 0 && (
                  <div className="mt-4">
                    <h6 className="font-medium text-gray-900 mb-2">Mismatched Fields:</h6>
                    <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                      {verificationResult.mismatchedFields.map((field, index) => (
                        <li key={index}>{field}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
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
