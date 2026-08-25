import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, AlertCircle, Loader2, Lock } from 'lucide-react';
import { unwrapApiEnvelope } from '@/lib/apiEnvelope';

interface FileUploadProps {
  onFileUpload: (file: File) => void;
  onVerificationResult?: (result: any) => void;
  onLoading?: (loading: boolean) => void;
  onError?: (error: string) => void;
}

const spring = { type: "spring" as const, stiffness: 100, damping: 15 };

export default function FileUpload({ onFileUpload, onVerificationResult, onLoading, onError }: FileUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const [localResult, setLocalResult] = useState<any>(null);
  const [localLoading, setLocalLoading] = useState(false);

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
    uploadAndVerify(selectedFile);
    
    if (onFileUpload) {
      onFileUpload(selectedFile);
    }
  };

  const uploadAndVerify = async (selectedFile: File) => {
    setLocalLoading(true);
    setLocalResult(null);
    setError('');
    if (onLoading) onLoading(true);
    if (onError) onError('');
    
    try {
      if (!selectedFile || selectedFile.size === 0) {
        throw new Error('No file selected');
      }

      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/verify', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Verification failed' }));
        throw new Error(errorData.error || errorData.message || `Verification failed (${response.status})`);
      }

      const envelope = await response.json();
      const data = unwrapApiEnvelope<Record<string, any>>(envelope);

      const typeMapping: Record<string, 'genuine' | 'suspicious' | 'fake'> = {
        'genuine': 'genuine',
        'suspicious': 'suspicious',
        'fake': 'fake'
      };

      const transformedResult = {
        type: typeMapping[data.result] || 'fake',
        confidence: (data.confidence || 0) / 100,
        mismatchedFields: data.mismatchedFields || []
      };

      setLocalResult(transformedResult);
      if (onVerificationResult) {
        onVerificationResult(transformedResult);
      }
      
    } catch (err) {
      console.error('Verification error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Verification failed';
      setError(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
    } finally {
      setLocalLoading(false);
      if (onLoading) onLoading(false);
    }
  };

  return (
    <div className="w-full">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
        className={`border border-border rounded-xl p-10 text-center cursor-pointer transition-all duration-200 relative overflow-hidden ${
          isDragging 
            ? 'border-primary bg-primary/[0.03] dark:bg-primary/[0.06]' 
            : 'hover:border-foreground/30'
        }`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="relative z-10">
          <div className="mx-auto w-12 h-12 flex items-center justify-center border border-border rounded-xl mb-6">
            <Upload className="w-5 h-5 text-muted-foreground" />
          </div>
          
          <h3 className="text-base editorial-subheading text-foreground mb-2">Upload Document</h3>
          <p className="text-sm text-muted-foreground mb-6">Drag and drop your PDF file here, or click to select</p>
          
          <input 
            type="file" 
            accept=".pdf" 
            onChange={handleFileChange}
            className="hidden"
            id="file-upload"
          />
          
          <label 
            htmlFor="file-upload"
            className="inline-flex items-center px-6 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-full cursor-pointer hover:bg-primary/90 transition-colors"
          >
            Select PDF File
          </label>
          
          <div className="mt-6 flex items-center justify-center gap-1.5 text-muted-foreground">
            <Lock className="w-3 h-3" />
            <p className="text-[11px] leading-relaxed">
              PDF only, max 10MB. UK GDPR compliant. Document deleted immediately after verification.
            </p>
          </div>
        </div>
      </motion.div>
      
      <AnimatePresence>
        {file && !localLoading && !localResult && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={spring}
            className="mt-3 p-4 bg-muted/50 border border-border rounded-xl overflow-hidden"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-destructive" />
                <span className="text-sm font-medium text-foreground truncate">{file.name}</span>
              </div>
              <span className="text-xs text-muted-foreground font-mono">
                {(file.size / 1024).toFixed(1)} KB
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={spring}
            className="mt-3 p-3 bg-destructive/5 border-l-2 border-destructive rounded-xl"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {localLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={spring}
            className="mt-6 flex justify-center items-center gap-3"
          >
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
            <span className="text-sm text-muted-foreground font-medium">Analyzing document...</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {localResult && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={spring}
            className="mt-6 p-6 border border-border rounded-xl"
          >
            <h3 className="text-sm editorial-subheading text-foreground mb-4">Verification Result</h3>
            
            <div className="flex items-center gap-3 mb-4">
              <span className={`editorial-caption px-3 py-1.5 rounded-full relative overflow-hidden ${
                localResult.type === 'genuine' 
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                  : localResult.type === 'suspicious'
                  ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                  : 'bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20'
              }`}>
                {localResult.type}
              </span>
            </div>

            {localResult.mismatchedFields && localResult.mismatchedFields.length > 0 && (
              <div className="mb-4">
                <h4 className="text-xs font-semibold text-foreground mb-2">Issues detected:</h4>
                <ul className="space-y-1">
                  {localResult.mismatchedFields.map((field: string, index: number) => (
                    <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-destructive mt-1">&#x2022;</span>
                      {field}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
