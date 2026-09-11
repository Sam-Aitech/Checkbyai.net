import { useState, useEffect, type ReactNode } from 'react';
import { Link } from 'wouter';
import { Lock, Crown, CheckCircle, ShieldAlert, LogIn } from 'lucide-react';
import { unwrapApiEnvelope } from '@/lib/apiEnvelope';
import { getVerificationResultTone, verificationToneBadgeClasses } from '@/lib/verificationResultTone';

interface AccessDeniedCardProps {
  title: string;
  message: string;
  children: ReactNode;
}

function AccessDeniedCard({ title, message, children }: Readonly<AccessDeniedCardProps>) {
  return (
    <div className="w-full border border-warning/20 rounded-xl p-6 bg-warning/10 text-center space-y-4">
      <div className="flex justify-center">
        <ShieldAlert className="w-10 h-10 text-warning" />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground">{message}</p>
      {children}
    </div>
  );
}

interface VerificationResult {
  type: 'genuine' | 'suspicious' | 'fake';
  confidence: number;
  mismatchedFields?: string[];
  checks?: Array<{
    name: string;
    passed: boolean;
    severity: 'critical' | 'warning' | 'info';
    message: string;
  }>;
  receiptId?: string;
  documentHash?: string;
  metadata?: Record<string, any>;
  verificationId?: number;
  cosCheck?: import('../../../shared/mis-types').COSCheckResult | null;
}

interface FileUploadSimpleProps {
  onFileUpload?: (file: File) => void;
  onVerificationResult?: (result: VerificationResult) => void;
  onLoading?: (loading: boolean) => void;
  onError?: (error: string) => void;
  restrictToOneCheck?: boolean; // New prop to control restriction
  isAdmin?: boolean; // New prop to identify admin users
}

export default function FileUploadSimple({ 
  onFileUpload, 
  onVerificationResult, 
  onLoading, 
  onError,
  restrictToOneCheck = true, // Default to restricted
  isAdmin = false // Default to non-admin
}: FileUploadSimpleProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasUsedFreeCheck, setHasUsedFreeCheck] = useState(false);
  const [verificationCount, setVerificationCount] = useState(0);
  const [accessDenied, setAccessDenied] = useState<'login' | 'upgrade' | false>(false);

  // Check usage on component mount
  useEffect(() => {
    // Admin users bypass restrictions
    if (!restrictToOneCheck || isAdmin) return;
    
    const today = new Date().toDateString();
    const storedDate = localStorage.getItem('lastVerificationDate');
    const storedCount = parseInt(localStorage.getItem('verificationsToday') || '0');
    
    if (storedDate === today) {
      setVerificationCount(storedCount);
      setHasUsedFreeCheck(storedCount >= 1);
    } else {
      // Reset for new day
      localStorage.setItem('lastVerificationDate', today);
      localStorage.setItem('verificationsToday', '0');
      setVerificationCount(0);
      setHasUsedFreeCheck(false);
    }
  }, [restrictToOneCheck, isAdmin]);

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
    // Check if user has already used their free verification (skip for admin)
    if (restrictToOneCheck && hasUsedFreeCheck && !isAdmin) {
      setError('You have already used your free verification for today. Upgrade to Pro for unlimited checks.');
      return;
    }

    if (selectedFile.type !== 'application/pdf') {
      const errorMsg = 'Please upload a valid PDF file.';
      setError(errorMsg);
      onError?.(errorMsg);
      return;
    }
    
    setFile(selectedFile);
    setError('');
    setResult(null);
    
    // Call onFileUpload callback
    onFileUpload?.(selectedFile);
    
    // Start verification immediately
    verifyDocument(selectedFile);
  };

  const verifyDocument = async (selectedFile: File) => {
    setLoading(true);
    setError('');
    onLoading?.(true);
    
    try {
      const formData = new FormData();
      formData.append('file', selectedFile, selectedFile.name);
      
      const response = await fetch('/api/verify', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Access denied — show a login/upgrade card instead of a raw error
        if (response.status === 403 && errorData.code === 'beta_login_required') {
          setAccessDenied('login');
          return;
        }
        if (response.status === 403 && errorData.code === 'cos_access_denied') {
          setAccessDenied('upgrade');
          return;
        }

        // Handle daily limit (429) with helpful message
        if (response.status === 429 && errorData.daysRemaining) {
          const message = `You can only verify one document every 7 days. Please try again in ${errorData.daysRemaining} day${errorData.daysRemaining > 1 ? 's' : ''} (${errorData.hoursRemaining} hours).`;
          throw new Error(message);
        }

        if (response.status === 429) {
          throw new Error('Daily verification limit reached. Upgrade your plan for more checks.');
        }

        throw new Error(`Verification failed: ${errorData.error || errorData.message || 'Unknown error'}`);
      }
      
      const envelope = await response.json();
      const data = unwrapApiEnvelope<Record<string, any>>(envelope);

      // Transform backend response
      const typeMapping: Record<string, 'genuine' | 'suspicious' | 'fake'> = {
        'genuine': 'genuine',
        'suspicious': 'suspicious',
        'fake': 'fake'
      };

      const transformedResult: VerificationResult = {
        type: typeMapping[data.result] || 'fake',
        confidence: (data.confidence || 0) / 100,
        mismatchedFields: data.mismatchedFields || [],
        checks: data.checks || [],
        receiptId: data.receiptId,
        documentHash: data.documentHash,
        metadata: data.metadata || {},
        verificationId: data.id,
        cosCheck: data.cosCheck ?? null,
      };

      setResult(transformedResult);
      onVerificationResult?.(transformedResult);
      
      // Update usage tracking after successful verification (skip for admin)
      if (restrictToOneCheck && !isAdmin) {
        const newCount = verificationCount + 1;
        setVerificationCount(newCount);
        setHasUsedFreeCheck(newCount >= 1);
        
        // Store in localStorage
        const today = new Date().toDateString();
        localStorage.setItem('lastVerificationDate', today);
        localStorage.setItem('verificationsToday', newCount.toString());
      }
      
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Verification failed';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      setLoading(false);
      onLoading?.(false);
    }
  };

  // Show a login or upgrade card when the backend denies access, instead of
  // a raw error toast that dead-ends anonymous/unentitled users.
  if (accessDenied === 'login') {
    return (
      <AccessDeniedCard
        title="Log In to Verify Your Document"
        message="CoS Check is in closed beta — log in or create an account to run this verification."
      >
        <div className="flex justify-center">
          <Link
            href={`/login?redirect=${encodeURIComponent(window.location.pathname)}`}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <LogIn className="w-4 h-4" />
            Log In / Sign Up
          </Link>
        </div>
      </AccessDeniedCard>
    );
  }

  if (accessDenied === 'upgrade') {
    return (
      <AccessDeniedCard
        title="COS Check Access Required"
        message="Your account doesn't yet have COS Check access. Upgrade your plan to unlock instant verification."
      >
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/cos-pricing"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Crown className="w-4 h-4" />
            View COS Check Plans
          </Link>
          <a
            href="mailto:support@checkbyai.net?subject=COS%20Check%20Access%20Request"
            className="inline-flex items-center justify-center px-5 py-2.5 border border-border text-foreground text-sm font-semibold rounded-lg hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Request Access
          </a>
        </div>
      </AccessDeniedCard>
    );
  }

  // Show restriction overlay if user has used their free check (skip for admin)
  if (restrictToOneCheck && hasUsedFreeCheck && !result && !isAdmin) {
    return (
      <div className="w-full">
        <div className="border-2 border-dashed border-border rounded-lg p-6 sm:p-8 text-center min-h-[160px] sm:min-h-[200px] flex flex-col justify-center bg-muted/50 relative">
          <div className="absolute inset-0 bg-muted rounded-lg opacity-90 flex items-center justify-center">
            <div className="text-center space-y-4 p-6">
              <div className="flex justify-center">
                <Lock className="w-12 h-12 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Free Check Used</h3>
                <p className="text-sm text-muted-foreground mb-4">You've already used your free document verification today.</p>
              </div>
              <div className="space-y-3">
                <div className="bg-primary text-primary-foreground p-4 rounded-lg">
                  <div className="flex items-center justify-center mb-2">
                    <Crown className="w-5 h-5 mr-2" />
                    <span className="font-semibold">Upgrade to Pro</span>
                  </div>
                  <p className="text-sm opacity-90 mb-3">Get unlimited document verifications, priority support, and advanced analytics</p>
                  <Link href="/cos-pricing" className="inline-block bg-background text-primary px-4 py-2 rounded-md font-medium hover:bg-background/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                    Upgrade Now
                  </Link>
                </div>
                <p className="text-xs text-muted-foreground">
                  Your free check will reset tomorrow
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Usage indicator for restricted mode */}
      {restrictToOneCheck && !isAdmin && (
        <div className="mb-4 p-3 bg-info/10 border border-info/20 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <CheckCircle className="w-4 h-4 text-info mr-2" />
              <span className="text-sm font-medium text-info">
                Free User
              </span>
            </div>
            <div className="text-sm text-info">
              {hasUsedFreeCheck ? '0/1' : '1/1'} checks remaining today
            </div>
          </div>
        </div>
      )}

      {/* Admin indicator */}
      {isAdmin && (
        <div className="mb-4 p-3 bg-success/10 border border-success/20 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Crown className="w-4 h-4 text-success mr-2" />
              <span className="text-sm font-medium text-success">
                Admin User
              </span>
            </div>
            <div className="text-sm text-success">
              Unlimited verifications
            </div>
          </div>
        </div>
      )}

      <div
        className={`border-2 border-dashed rounded-lg p-6 sm:p-8 text-center transition-all duration-200 min-h-[160px] sm:min-h-[200px] flex flex-col justify-center ${
          isDragging
            ? 'border-primary/60 bg-primary/5 scale-[1.02]'
            : 'border-border hover:border-border-strong active:scale-[0.98]'
        }`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <svg className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground" stroke="currentColor" fill="none" viewBox="0 0 48 48">
          <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        <h3 className="mt-2 text-base sm:text-lg font-medium text-foreground">Upload Document</h3>
        <p className="mt-1 text-sm text-muted-foreground px-2">
          <span className="hidden sm:inline">Drag and drop your PDF file here, or click to select</span>
          <span className="sm:hidden">Tap to select your PDF file</span>
        </p>

        <input
          type="file"
          accept=".pdf"
          onChange={handleFileChange}
          className="peer sr-only"
          id="file-upload-simple"
        />

        <label
          htmlFor="file-upload-simple"
          className="mt-4 inline-flex items-center px-4 sm:px-6 py-3 sm:py-2 border border-transparent text-sm sm:text-base font-medium rounded-lg shadow-sm text-primary-foreground bg-primary hover:bg-primary/90 active:bg-primary/80 cursor-pointer touch-manipulation transition-colors peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2"
        >
          Select PDF File
        </label>

        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <svg className="h-4 w-4 text-success flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span>Your document is <strong>deleted immediately</strong> after verification. We never store files.</span>
        </div>
      </div>
      
      {file && (
        <div className="mt-4 p-4 bg-muted rounded-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <svg className="h-5 w-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="ml-2 text-sm text-foreground truncate">{file.name}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              {(file.size / 1024).toFixed(1)} KB
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 bg-destructive/10 border-l-4 border-destructive text-destructive" role="alert">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {loading && (
        <div className="mt-6 flex justify-center items-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
          <span className="ml-3 text-muted-foreground">Analyzing document...</span>
        </div>
      )}

      {result && (
        <div className="mt-6 p-6 bg-card rounded-lg border border-border">
          <h3 className="text-lg font-semibold mb-4 text-foreground">Verification Result</h3>

          <div className="flex items-center gap-3 mb-4">
            <div className={`px-4 py-2 rounded-full text-base font-semibold border animate-in fade-in zoom-in-95 duration-200 ${verificationToneBadgeClasses[getVerificationResultTone(result.type)]}`}>
              {result.type}
            </div>
          </div>

          {result.mismatchedFields && result.mismatchedFields.length > 0 && (
            <div className="mb-4">
              <h4 className="font-medium text-foreground mb-2">Issues detected:</h4>
              <ul className="list-disc list-inside text-muted-foreground">
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