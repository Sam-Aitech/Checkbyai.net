import { useState } from 'react';
import FileUpload from './FileUpload';
import VerificationResults from './VerificationResults';

interface VerificationResult {
  type: 'Genuine' | 'Edited' | 'Fake';
  confidence: number;
  mismatchedFields?: string[];
}

export default function Dashboard() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFileUpload = (uploadedFile: File) => {
    setFile(uploadedFile);
    setResult(null);
    setError('');
    analyzeDocument(uploadedFile);
  };

  const analyzeDocument = async (documentFile: File) => {
    setLoading(true);
    setError('');
    
    try {
      // Validate file before upload
      if (!documentFile || documentFile.size === 0) {
        throw new Error('Invalid file selected');
      }
      
      console.log('Uploading file:', documentFile.name, 'Size:', documentFile.size, 'Type:', documentFile.type);
      
      // Create form data
      const formData = new FormData();
      formData.append('file', documentFile, documentFile.name);
      
      // Debug: Log FormData contents
      console.log('FormData has file:', formData.has('file'));
      const fileEntry = formData.get('file');
      console.log('File entry:', fileEntry);
      
      // Call backend verification API
      const response = await fetch('/api/verify', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Verification Failed ${response.status}: ${errorData.error || 'Unknown error'}`);
      }
      
      const data = await response.json();
      
      // Transform backend response to match our interface
      const typeMapping: Record<string, 'Genuine' | 'Edited' | 'Fake'> = {
        'genuine': 'Genuine',
        'suspicious': 'Edited',
        'fake': 'Fake'
      };

      const transformedResult: VerificationResult = {
        type: typeMapping[data.result] || 'Fake',
        confidence: data.confidence || 0,
        mismatchedFields: data.mismatchedFields || []
      };

      setResult(transformedResult);
    } catch (err) {
      setError('Failed to analyze document. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">Certificate of Sponsorship Verifier</h1>
      
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <h2 className="text-lg font-medium mb-4 text-gray-900 dark:text-gray-100">Upload COS Document</h2>
        <FileUpload onFileUpload={handleFileUpload} />
        
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