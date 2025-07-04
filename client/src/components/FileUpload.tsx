import { useState } from 'react';

interface FileUploadProps {
  onFileUpload: (file: File) => void;
  onVerificationResult?: (result: any) => void;
  onLoading?: (loading: boolean) => void;
  onError?: (error: string) => void;
}

export default function FileUpload({ onFileUpload, onVerificationResult, onLoading, onError }: FileUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');

  console.log('FileUpload component props:');
  console.log('  onFileUpload:', !!onFileUpload);
  console.log('  onVerificationResult:', !!onVerificationResult);
  console.log('  onLoading:', !!onLoading);
  console.log('  onError:', !!onError);

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
    console.log('=== FILEUPLOAD COMPONENT DEBUG ===');
    console.log('Processing file:', selectedFile);
    console.log('File name:', selectedFile?.name);
    console.log('File type:', selectedFile?.type);
    console.log('File size:', selectedFile?.size);
    console.log('onFileUpload callback:', !!onFileUpload);
    
    if (selectedFile.type !== 'application/pdf') {
      setError('Please upload a valid PDF file.');
      return;
    }
    
    setFile(selectedFile);
    setError('');
    
    // Always trigger verification directly
    uploadAndVerify(selectedFile);
    
    // Also trigger parent component callback for compatibility
    if (onFileUpload) {
      onFileUpload(selectedFile);
    }
  };

  const uploadAndVerify = async (selectedFile: File) => {
    console.log('=== DIRECT VERIFICATION UPLOAD ===');
    
    if (onLoading) onLoading(true);
    if (onError) onError('');
    
    try {
      // Validate file
      if (!selectedFile || selectedFile.size === 0) {
        throw new Error('Invalid file selected');
      }
      
      console.log('Uploading file:', selectedFile.name, 'Size:', selectedFile.size);
      
      // Create form data
      const formData = new FormData();
      formData.append('file', selectedFile, selectedFile.name);
      
      console.log('FormData created, has file:', formData.has('file'));
      
      // Upload to backend
      const response = await fetch('/api/verify', {
        method: 'POST',
        body: formData
      });
      
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Verification failed: ${errorData.error || 'Unknown error'}`);
      }
      
      const data = await response.json();
      console.log('Verification response:', data);
      
      // Transform backend response
      const typeMapping: Record<string, 'Genuine' | 'Edited' | 'Fake'> = {
        'genuine': 'Genuine',
        'suspicious': 'Edited',
        'fake': 'Fake'
      };

      const transformedResult = {
        type: typeMapping[data.result] || 'Fake',
        confidence: data.confidence || 0,
        mismatchedFields: data.mismatchedFields || []
      };

      if (onVerificationResult) {
        onVerificationResult(transformedResult);
      }
      
    } catch (err) {
      console.error('Verification error:', err);
      if (onError) {
        onError(err instanceof Error ? err.message : 'Verification failed');
      }
    } finally {
      if (onLoading) onLoading(false);
    }
  };

  return (
    <div className="w-full">
      <div 
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
          ${isDragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <svg 
          className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" 
          stroke="currentColor" 
          fill="none" 
          viewBox="0 0 48 48"
        >
          <path 
            d="M24 12c0-2.21-1.79-4-4-4S16 9.79 16 12s1.79 4 4 4 4-1.79 4-4zm0 12c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 12c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4z" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth="2"
          />
        </svg>
        
        <h3 className="mt-2 text-lg font-medium text-gray-900 dark:text-gray-100">Upload COS Document</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Drag and drop your PDF file here, or click to select</p>
        
        <input 
          type="file" 
          accept=".pdf" 
          onChange={handleFileChange}
          className="hidden"
          id="file-upload"
        />
        
        <label 
          htmlFor="file-upload"
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
    </div>
  );
}
