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
    console.log('=== DASHBOARD HANDLEFILEUPLOAD DEBUG ===');
    console.log('Received file in handleFileUpload:', uploadedFile);
    console.log('File instanceof File:', uploadedFile instanceof File);
    console.log('File constructor:', uploadedFile.constructor.name);
    console.log('File keys:', Object.keys(uploadedFile));
    
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
      
      console.log('=== DASHBOARD FILE UPLOAD DEBUG ===');
      console.log('File object:', documentFile);
      console.log('File name:', documentFile.name);
      console.log('File size:', documentFile.size);
      console.log('File type:', documentFile.type);
      console.log('File instanceof File:', documentFile instanceof File);
      
      // Validate the file object before proceeding
      if (!documentFile.name || !documentFile.size || !documentFile.type) {
        throw new Error('Invalid file object - missing required properties');
      }

      // Create form data
      const formData = new FormData();
      formData.append('file', documentFile, documentFile.name);
      
      // Debug: Log FormData contents
      console.log('FormData has file:', formData.has('file'));
      const fileEntry = formData.get('file');
      console.log('File entry:', fileEntry);
      console.log('File entry type:', typeof fileEntry);
      console.log('File entry instanceof File:', fileEntry instanceof File);
      
      // Additional validation
      if (!formData.has('file') || !fileEntry) {
        throw new Error('Failed to add file to FormData');
      }
      
      // Call backend verification API (don't set Content-Type, let browser set it for multipart)
      const response = await fetch('/api/verify', {
        method: 'POST',
        body: formData,
        // Don't set Content-Type header, browser will set it automatically with boundary
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