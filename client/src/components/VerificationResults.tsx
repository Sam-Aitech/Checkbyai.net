interface VerificationResultsProps {
  result: {
    type: 'Genuine' | 'Edited' | 'Fake';
    confidence: number;
    mismatchedFields?: string[];
  };
}

export default function VerificationResults({ result }: VerificationResultsProps) {
  const getResultColor = () => {
    switch (result.type) {
      case 'Genuine':
        return 'bg-green-50 border-green-200 text-green-800';
      case 'Edited':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      case 'Fake':
        return 'bg-red-50 border-red-200 text-red-800';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-800';
    }
  };

  const getBadgeColor = () => {
    switch (result.type) {
      case 'Genuine':
        return 'bg-green-100 text-green-800';
      case 'Edited':
        return 'bg-yellow-100 text-yellow-800';
      case 'Fake':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className={`border-l-4 ${getResultColor()} p-6 rounded-lg dark:bg-gray-800 dark:border-gray-600`}>
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold dark:text-gray-100">Verification Result</h3>
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getBadgeColor()}`}>
          {result.type}
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
            {result.type === 'Genuine' && "The document's metadata matches our verified templates. It appears to be an authentic document."}
            {result.type === 'Edited' && "The document's metadata partially matches our verified templates. It may have been altered but retains some original properties."}
            {result.type === 'Fake' && "The document's metadata does not match any of our verified templates. It may have been fabricated or heavily altered."}
          </p>
        </div>
      </div>
    </div>
  );
}
