import { CheckCircle, AlertTriangle, XCircle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface VerificationResultsProps {
  result: {
    id: number;
    result: 'genuine' | 'suspicious' | 'fake';
    confidence: number;
    details: {
      metadataVerification: {
        creationDate: { status: string; score: number };
        producer: { status: string; score: number };
        creator: { status: string; score: number };
      };
      patternMatching: {
        documentStructure: number;
        formattingPatterns: number;
        vectorSimilarity: number;
      };
    };
  };
}

export default function VerificationResults({ result }: VerificationResultsProps) {
  const getResultConfig = () => {
    switch (result.result) {
      case 'genuine':
        return {
          icon: CheckCircle,
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200',
          label: 'GENUINE'
        };
      case 'suspicious':
        return {
          icon: AlertTriangle,
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-50',
          borderColor: 'border-yellow-200',
          label: 'SUSPICIOUS'
        };
      case 'fake':
        return {
          icon: XCircle,
          color: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          label: 'FAKE'
        };
    }
  };

  const config = getResultConfig();
  const Icon = config.icon;

  const handleDownloadReport = () => {
    // Generate and download detailed report
    const reportData = {
      verification_id: result.id,
      result: result.result,
      confidence: result.confidence,
      timestamp: new Date().toISOString(),
      details: result.details
    };

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `verification-report-${result.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-8">
      <h3 className="text-xl font-semibold text-gray-900 mb-6">Verification Results</h3>
      
      {/* Result Summary */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <div className={`text-center p-6 ${config.bgColor} rounded-lg border ${config.borderColor}`}>
          <div className={`w-16 h-16 ${config.color.replace('text-', 'bg-')} text-white rounded-full flex items-center justify-center mx-auto mb-4`}>
            <Icon className="h-8 w-8" />
          </div>
          <h4 className={`font-semibold ${config.color.replace('text-', 'text-')} mb-2`}>
            {config.label}
          </h4>
          <p className={`text-2xl font-bold ${config.color} mb-1`}>
            {result.confidence.toFixed(1)}%
          </p>
          <p className={`text-sm ${config.color}`}>Confidence</p>
        </div>

        <div className="text-center p-6 bg-gray-50 rounded-lg border border-gray-200 opacity-50">
          <div className="w-16 h-16 bg-yellow-500 text-white rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <h4 className="font-semibold text-yellow-700 mb-2">SUSPICIOUS</h4>
          <p className="text-2xl font-bold text-yellow-600 mb-1">--</p>
          <p className="text-sm text-yellow-600">Alternative</p>
        </div>

        <div className="text-center p-6 bg-gray-50 rounded-lg border border-gray-200 opacity-50">
          <div className="w-16 h-16 bg-red-500 text-white rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="h-8 w-8" />
          </div>
          <h4 className="font-semibold text-red-700 mb-2">FAKE</h4>
          <p className="text-2xl font-bold text-red-600 mb-1">--</p>
          <p className="text-sm text-red-600">Alternative</p>
        </div>
      </div>

      {/* Detailed Analysis */}
      <div className="bg-gray-50 rounded-lg p-6">
        <h4 className="font-medium text-gray-900 mb-4">Detailed Analysis</h4>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h5 className="font-medium text-gray-700 mb-3">Metadata Verification</h5>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Creation Date</span>
                <Badge variant="outline" className="text-green-600 border-green-200">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  {result.details.metadataVerification.creationDate.status}
                </Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Producer Tool</span>
                <Badge variant="outline" className="text-green-600 border-green-200">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  {result.details.metadataVerification.producer.status}
                </Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Creator Signature</span>
                <Badge variant="outline" className="text-green-600 border-green-200">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  {result.details.metadataVerification.creator.status}
                </Badge>
              </div>
            </div>
          </div>
          <div>
            <h5 className="font-medium text-gray-700 mb-3">Pattern Matching</h5>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Document Structure</span>
                <span className="text-green-600 font-medium">
                  {result.details.patternMatching.documentStructure.toFixed(1)}% match
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Formatting Patterns</span>
                <span className="text-green-600 font-medium">
                  {result.details.patternMatching.formattingPatterns.toFixed(1)}% match
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Vector Similarity</span>
                <span className="text-green-600 font-medium">
                  {result.details.patternMatching.vectorSimilarity.toFixed(1)}% match
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-center mt-6">
        <Button onClick={handleDownloadReport}>
          <Download className="h-4 w-4 mr-2" />
          Download Detailed Report
        </Button>
      </div>
    </div>
  );
}
