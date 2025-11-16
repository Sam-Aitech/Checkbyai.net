import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import FeedbackForm from "./FeedbackForm";

interface VerificationResultsProps {
  result: {
    type: 'genuine' | 'suspicious' | 'fake';
    confidence: number;
    mismatchedFields?: string[];
  };
  verificationId?: number;
}

export default function VerificationResults({ result, verificationId }: VerificationResultsProps) {
  const [showFeedback, setShowFeedback] = useState(false);
  const getResultColor = () => {
    switch (result.type) {
      case 'genuine':
        return 'bg-green-50 border-green-200 text-green-800';
      case 'suspicious':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      case 'fake':
        return 'bg-red-50 border-red-200 text-red-800';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-800';
    }
  };

  const getBadgeColor = () => {
    switch (result.type) {
      case 'genuine':
        return 'bg-green-100 text-green-800';
      case 'suspicious':
        return 'bg-yellow-100 text-yellow-800';
      case 'fake':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className={`border-l-4 ${getResultColor()} p-4 sm:p-6 rounded-lg dark:bg-gray-800 dark:border-gray-600`}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg sm:text-xl font-bold dark:text-gray-100">Verification Result</h3>
        <span className={`inline-flex items-center px-3 sm:px-2.5 py-1 sm:py-0.5 rounded-full text-sm sm:text-xs font-medium ${getBadgeColor()}`}>
          {result.type.charAt(0).toUpperCase() + result.type.slice(1)}
        </span>
      </div>
      
      <div className="mt-4 space-y-4">
        
        {result.mismatchedFields && result.mismatchedFields.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Mismatched Fields</h4>
            <ul className="mt-2 list-disc list-inside text-sm text-gray-600 dark:text-gray-300">
              {result.mismatchedFields.map((field, index) => (
                <li key={index}>{field}</li>
              ))}
            </ul>
          </div>
        )}
        
        <div className="pt-4 border-t border-gray-200 dark:border-gray-600">
          <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Analysis Details</h4>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            {result.type === 'genuine' && "The document's metadata matches our verified templates. It appears to be an authentic document."}
            {result.type === 'suspicious' && "The document's metadata partially matches our verified templates. It may have been altered but retains some original properties."}
            {result.type === 'fake' && "The document's metadata does not match any of our verified templates. It may have been fabricated or heavily altered."}
          </p>
        </div>

        {/* Feedback Section */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-600">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFeedback(!showFeedback)}
            className="w-full flex items-center justify-center space-x-2"
            data-testid="toggle-feedback"
          >
            <span>Rate this verification</span>
            {showFeedback ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
          
          {showFeedback && (
            <div className="mt-4">
              <FeedbackForm 
                verificationId={verificationId}
                onSubmitSuccess={() => setShowFeedback(false)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
