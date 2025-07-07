import { useState } from 'react';
import { useQuery } from "@tanstack/react-query";
import FileUploadSimple from './FileUploadSimple';

interface VerificationResult {
  type: 'Genuine' | 'Edited' | 'Fake';
  confidence: number;
  mismatchedFields?: string[];
}

export default function Dashboard() {
  const [file, setFile] = useState<File | null>(null);
  
  // Check if user is admin
  const { data: user } = useQuery({
    queryKey: ['/api/auth/user'],
    retry: false
  });
  
  const isAdmin = user?.role === 'admin';
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFileUpload = (uploadedFile: File) => {
    console.log('=== DASHBOARD HANDLEFILEUPLOAD DEBUG ===');
    console.log('Received file - now handled by FileUpload component directly');
    
    setFile(uploadedFile);
    setResult(null);
    setError('');
    // analyzeDocument is now handled directly by FileUpload component
  };

  // analyzeDocument function removed - verification now handled by FileUpload component

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-6 lg:px-8">
      <h1 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-gray-900 dark:text-gray-100 text-center sm:text-left">
        Certificate of Sponsorship Verifier
      </h1>
      
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-4 sm:p-6 mb-4 sm:mb-6">
        <h2 className="text-base sm:text-lg font-medium mb-3 sm:mb-4 text-gray-900 dark:text-gray-100 text-center sm:text-left">Upload Document</h2>
        <FileUploadSimple 
          restrictToOneCheck={!isAdmin} 
          isAdmin={isAdmin}
        />
        
        {loading && (
          <div className="mt-6 flex justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        )}
        
        {error && (
          <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/30 border-l-4 border-red-500 text-red-700 dark:text-red-400">
            <p className="text-sm">{error}</p>
          </div>
        )}
      </div>
      
      {result && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6">
          <VerificationResults result={result} />
        </div>
      )}
    </div>
  );
}