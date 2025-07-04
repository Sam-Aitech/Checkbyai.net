import { useState } from 'react';

interface VerificationResult {
  type: 'Genuine' | 'Edited' | 'Fake';
  confidence: number;
  mismatchedFields?: string[];
}

export default function FileUploadSimple() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const selectedFile = e.dataTransfer.files[0];
      processFile(selectedFile);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      processFile(selectedFile);
    }
  };

  const processFile = (selectedFile: File) => {
    if (selectedFile.type !== 'application/pdf') {
      setError('Please upload a valid PDF file.');
      return;
    }
    
    setFile(selectedFile);
    setError('');
    setResult(null);
    
    // Start verification immediately
    verifyDocument(selectedFile);
  };

  const verifyDocument = async (selectedFile: File) => {
    setLoading(true);
    setError('');
    
    try {
      const formData = new FormData();
      formData.append('file', selectedFile, selectedFile.name);
      
      const response = await fetch('/api/verify', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Verification failed: ${errorData.error || 'Unknown error'}`);
      }
      
      const data = await response.json();
      
      // Transform backend response
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
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <div 
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging 
            ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' 
            : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
        }`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
          <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        
        <h3 className="mt-2 text-lg font-medium text-gray-900 dark:text-gray-100">Upload COS Document</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Drag and drop your PDF file here, or click to select</p>
        
        <input 
          type="file" 
          accept=".pdf" 
          onChange={handleFileChange}
          className="hidden"
          id="file-upload-simple"
        />
        
        <label 
          htmlFor="file-upload-simple"
          className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 cursor-pointer"
        >
          Select PDF File
        </label>
      </div>
      
      {file && (
        <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <svg className="h-5 w-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="ml-2 text-sm text-gray-900 dark:text-gray-100 truncate">{file.name}</span>
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {(file.size / 1024).toFixed(1)} KB
            </div>
          </div>
        </div>
      )}
      
      {error && (
        <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/30 border-l-4 border-red-500 text-red-700 dark:text-red-400">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {loading && (
        <div className="mt-6 flex justify-center items-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
          <span className="ml-3 text-gray-600 dark:text-gray-400">Analyzing document...</span>
        </div>
      )}

      {result && (
        <div className="mt-6 p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Verification Result</h3>
          
          <div className="flex items-center gap-3 mb-4">
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              result.type === 'Genuine' 
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                : result.type === 'Edited'
                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
            }`}>
              {result.type}
            </div>
            <span className="text-gray-600 dark:text-gray-400">
              Confidence: {result.confidence?.toFixed(1)}%
            </span>
          </div>

          {result.mismatchedFields && result.mismatchedFields.length > 0 && (
            <div className="mb-4">
              <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Issues detected:</h4>
              <ul className="list-disc list-inside text-gray-600 dark:text-gray-400">
                {result.mismatchedFields.map((field: string, index: number) => (
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