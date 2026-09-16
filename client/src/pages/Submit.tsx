import { useState, useEffect } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Upload, CheckCircle, Loader2, FileText, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import SEOHead from '@/components/SEOHead';
import PageLayout from '@/components/PageLayout';

const spring = { type: "spring" as const, stiffness: 100, damping: 15 };

const questionnaireSchema = z.object({
  howApplied: z.string().min(10, 'Please describe how you applied for the job'),
  emailsReceived: z.string().min(10, 'Please describe any emails received'),
  confirmationDetails: z.string().optional(),
  employerName: z.string().min(2, 'Employer name is required'),
  jobTitle: z.string().min(2, 'Job title is required'),
  cosReferenceNumber: z.string().optional(),
  additionalNotes: z.string().optional(),
});

type QuestionnaireFormData = z.infer<typeof questionnaireSchema>;

interface SubmissionData {
  id: number;
  email: string;
  packageType: 'normal' | 'full';
  paymentStatus: string;
  reviewStatus: string;
  createdAt: string;
}

export default function Submit() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const sessionId = new URLSearchParams(searchString).get('session_id');
  const { toast } = useToast();
  const [cosFile, setCosFile] = useState<File | null>(null);
  const [supportingFiles, setSupportingFiles] = useState<File[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [cosError, setCosError] = useState<string | null>(null);
  const [supportingError, setSupportingError] = useState<string | null>(null);
  const [isCosDragging, setIsCosDragging] = useState(false);

  const MAX_FILE_MB = 10;
  const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
  const SUPPORTED_PDF = ['application/pdf'];
  const SUPPORTED_SUPPORTING = ['application/pdf', 'image/jpeg', 'image/png'];

  const isPdfFile = (file: File) => SUPPORTED_PDF.includes(file.type) || /\.pdf$/i.test(file.name);
  const isSupportedSupporting = (file: File) =>
    SUPPORTED_SUPPORTING.includes(file.type) || /\.(pdf|jpe?g|png)$/i.test(file.name);
  const formatMB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

  const form = useForm<QuestionnaireFormData>({
    resolver: zodResolver(questionnaireSchema),
    defaultValues: {
      howApplied: '',
      emailsReceived: '',
      confirmationDetails: '',
      employerName: '',
      jobTitle: '',
      cosReferenceNumber: '',
      additionalNotes: '',
    },
  });

  const { data: submission, isLoading, error } = useQuery<SubmissionData>({
    queryKey: ['/api/paid/submission', sessionId],
    queryFn: async () => {
      const res = await fetch(`/api/paid/submission/${sessionId}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch submission');
      return res.json();
    },
    enabled: !!sessionId,
  });

  const submitMutation = useMutation({
    mutationFn: async (data: QuestionnaireFormData) => {
      if (!submission) throw new Error('No submission found');
      
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (value) formData.append(key, value);
      });
      
      if (cosFile) {
        formData.append('cosDocument', cosFile);
      }
      
      supportingFiles.forEach((file) => {
        formData.append('supportingDocuments', file);
      });

      const response = await fetch(`/api/paid/submit/${submission.id}`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Submission failed');
      }

      return response.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      toast({
        title: 'Submission Received',
        description: 'We have received your documents and will review them shortly.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to submit. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleCosFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!isPdfFile(file)) {
        const msg = `We got ${file.type || 'an unknown format'} — please export as PDF.`;
        setCosError(msg);
        toast({ title: 'Invalid File', description: msg, variant: 'destructive' });
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        const msg = `${file.name} is ${formatMB(file.size)} — limit is ${MAX_FILE_MB} MB. Try compressing or a photo of relevant pages.`;
        setCosError(msg);
        toast({ title: 'File too large', description: msg, variant: 'destructive' });
        return;
      }
      setCosError(null);
      setCosFile(file);
    }
  };

  const handleCosDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsCosDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (!isPdfFile(file)) {
        const msg = `We got ${file.type || 'an unknown format'} — please export as PDF.`;
        setCosError(msg);
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        setCosError(`${file.name} is ${formatMB(file.size)} — limit is ${MAX_FILE_MB} MB.`);
        return;
      }
      setCosError(null);
      setCosFile(file);
    }
  };

  const handleSupportingFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + supportingFiles.length > 5) {
      const msg = 'Maximum 5 supporting documents allowed';
      setSupportingError(msg);
      toast({ title: 'Too Many Files', description: msg, variant: 'destructive' });
      return;
    }
    const rejected: string[] = [];
    const accepted: File[] = [];
    for (const f of files) {
      if (!isSupportedSupporting(f)) { rejected.push(`${f.name}: unsupported format — use PDF/JPG/PNG`); continue; }
      if (f.size > MAX_FILE_BYTES) { rejected.push(`${f.name} is ${formatMB(f.size)} — limit ${MAX_FILE_MB} MB`); continue; }
      accepted.push(f);
    }
    if (rejected.length > 0) {
      setSupportingError(rejected.join('. '));
      toast({ title: 'Some files skipped', description: rejected.join('. '), variant: 'destructive' });
    } else {
      setSupportingError(null);
    }
    if (accepted.length > 0) setSupportingFiles([...supportingFiles, ...accepted]);
  };

  const onSubmit = (data: QuestionnaireFormData) => {
    if (!cosFile) {
      const msg = 'Please upload your Certificate of Sponsorship document';
      setCosError(msg);
      toast({ title: 'CoS Document Required', description: msg, variant: 'destructive' });
      document.getElementById('cos-file-input')?.focus();
      return;
    }
    submitMutation.mutate(data);
  };

  if (!sessionId) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center bg-background">
          <div className="max-w-md theme-card overflow-hidden">
            <div className="p-6 border-b border-border">
              <h3 className="editorial-subheading text-destructive flex items-center gap-2">
                <AlertCircle className="w-6 h-6 text-destructive" />
                Invalid Session
              </h3>
              <p className="text-muted-foreground text-sm mt-1">
                No payment session found. Please complete your purchase first.
              </p>
            </div>
            <div className="p-6">
              <Button onClick={() => setLocation('/pricing')} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 rounded-full">
                Go to Pricing
              </Button>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (isLoading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center bg-background">
          <div className="text-center" role="status" aria-live="polite">
            <Loader2 className="w-12 h-12 animate-spin text-muted-foreground mx-auto mb-4" aria-hidden="true" />
            <p className="text-muted-foreground">Loading your submission...</p>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error || !submission) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center bg-background">
          <div className="max-w-md theme-card overflow-hidden">
            <div className="p-6 border-b border-border">
              <h3 className="editorial-subheading text-destructive flex items-center gap-2">
                <AlertCircle className="w-6 h-6 text-destructive" aria-hidden="true" />
                Error Loading Submission
              </h3>
              <p className="text-muted-foreground text-sm mt-1" role="alert">
                We couldn't find your submission. Please try again or contact support.
              </p>
            </div>
            <div className="p-6 space-y-2">
              <Button onClick={() => window.location.reload()} variant="outline" className="w-full rounded-full">
                Retry
              </Button>
              <Button onClick={() => { window.location.href = 'mailto:support@checkbyai.net?subject=Submission%20not%20found'; }} variant="outline" className="w-full rounded-full">
                Contact Support
              </Button>
              <Button onClick={() => setLocation('/pricing')} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 rounded-full">
                Go to Pricing
              </Button>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (submitted) {
    return (
      <PageLayout>
        <SEOHead
          title="Submission Complete | COS Verification"
          description="Your Certificate of Sponsorship has been submitted for expert review."
        />
        <div className="flex items-center justify-center bg-background p-4">
          <div className="max-w-lg text-center theme-card overflow-hidden">
            <div className="p-6 border-b border-border">
              <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-4" />
              <h3 className="editorial-subheading text-emerald-700 dark:text-emerald-400 text-2xl">
                Submission Complete!
              </h3>
              <p className="text-muted-foreground mt-1 text-lg editorial-body">
                Thank you for your submission. Our expert team will review your documents.
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-muted/50 border border-border rounded-xl p-4">
                <p className="text-sm text-muted-foreground mb-2">Submission ID — save this for support</p>
                <p className="font-mono text-lg font-semibold">{submission.id}</p>
                <p className="text-xs text-muted-foreground mt-1">Sent to {submission.email} from noreply@checkbyai.net — check spam. If nothing arrives in 48h, contact support with this ID.</p>
              </div>
              <div className="bg-muted/50 border border-border rounded-xl p-4 text-left">
                <h4 className="font-semibold mb-2">What happens next?</h4>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li>• Our experts will review your documents within 24-48 hours</li>
                  <li>• You will receive an email with your detailed verification report</li>
                  {submission.packageType === 'full' && (
                    <li>• We will contact you to arrange a phone consultation if requested</li>
                  )}
                </ul>
              </div>
              <Button onClick={() => setLocation('/')} variant="outline" className="w-full border border-border rounded-full">
                Return to Home
              </Button>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <SEOHead
        title="Submit Your CoS for Verification | Expert Review"
        description="Complete your Certificate of Sponsorship submission for expert verification."
      />
      
      <div className="bg-background">
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          <div className="theme-card overflow-hidden mb-6">
            <div className="p-6 border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="editorial-subheading text-foreground text-2xl">Complete Your Submission</h3>
                  <p className="text-muted-foreground text-sm mt-1">
                    Please provide details about your CoS and upload your documents
                  </p>
                </div>
                <span className="editorial-caption px-2.5 py-1 rounded-full bg-primary/10 text-foreground">
                  {submission.packageType === 'full' ? 'Full Package' : 'Normal'}
                </span>
              </div>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring}
          >
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="theme-card overflow-hidden">
                  <div className="p-6 border-b border-border">
                    <h3 className="editorial-subheading text-foreground text-lg">1. About Your Application</h3>
                    <p className="text-muted-foreground text-sm mt-1">
                      Tell us about how you applied and any communications you received
                    </p>
                  </div>
                  <div className="p-6 space-y-4">
                    <FormField
                      control={form.control}
                      name="howApplied"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>How did you apply for this job?</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Describe how you found and applied for this position (e.g., job board, recruitment agency, direct application...)"
                              className="min-h-[100px]"
                              {...field}
                              data-testid="input-how-applied"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="emailsReceived"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>What emails have you received from the employer?</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Describe the emails you've received (interview invitations, job offers, CoS notification...)"
                              className="min-h-[100px]"
                              {...field}
                              data-testid="input-emails-received"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="confirmationDetails"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Any phone calls or confirmation letters?</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Describe any phone conversations or official letters you've received (optional)"
                              className="min-h-[80px]"
                              {...field}
                              data-testid="input-confirmation-details"
                            />
                          </FormControl>
                          <FormDescription>Optional but helpful for our review</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="theme-card overflow-hidden">
                  <div className="p-6 border-b border-border">
                    <h3 className="editorial-subheading text-foreground text-lg">2. Job Details</h3>
                    <p className="text-muted-foreground text-sm mt-1">
                      Information about the position and employer
                    </p>
                  </div>
                  <div className="p-6 space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="employerName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Employer Name</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Company name"
                                {...field}
                                data-testid="input-employer-name"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="jobTitle"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Job Title</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Your job title"
                                {...field}
                                data-testid="input-job-title"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="cosReferenceNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CoS Reference Number (if known)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g., AB1234567"
                              {...field}
                              data-testid="input-cos-reference"
                            />
                          </FormControl>
                          <FormDescription>Optional - found on your CoS document</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="theme-card overflow-hidden">
                  <div className="p-6 border-b border-border">
                    <h3 className="editorial-subheading text-foreground text-lg">3. Upload Documents</h3>
                    <p className="text-muted-foreground text-sm mt-1">
                      Upload your Certificate of Sponsorship and any supporting documents
                    </p>
                    <p className="text-sm mt-2 flex items-center gap-1.5 text-foreground">
                      <span aria-hidden="true">🔒</span>
                      <span>PDF only · Deleted per Data Security policy · Never stored — <a href="/data-security.html" className="underline font-medium">How we handle docs</a></span>
                    </p>
                  </div>
                  <div className="p-6 space-y-6">
                    <div>
                      <label htmlFor="cos-file-input" className="block text-sm font-medium mb-2">
                        Certificate of Sponsorship (PDF) <span className="text-destructive">*</span>
                      </label>
                      <p id="cos-hint" className="text-sm text-muted-foreground mb-2">PDF only, max 10MB. Deleted immediately after review.</p>
                      <div
                        onDragEnter={(e) => { e.preventDefault(); setIsCosDragging(true); }}
                        onDragLeave={(e) => { e.preventDefault(); setIsCosDragging(false); }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleCosDrop}
                        aria-dropeffect="copy"
                        className={`border rounded-xl p-6 text-center transition-colors ${isCosDragging ? 'border-primary bg-primary/5 border-solid' : 'border-dashed border-border hover:border-foreground/30'}`}
                      >
                        {cosFile ? (
                          <div className="flex items-center justify-center gap-3">
                            <FileText className="w-8 h-8 text-foreground" aria-hidden="true" />
                            <div className="text-left">
                              <p className="font-medium">{cosFile.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {(cosFile.size / 1024 / 1024).toFixed(2)} MB · PDF
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`Remove ${cosFile.name}`}
                              onClick={() => { setCosFile(null); setCosError(null); }}
                            >
                              Remove
                            </Button>
                          </div>
                        ) : (
                          <label htmlFor="cos-file-input" className="cursor-pointer block rounded-xl has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2">
                            <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" aria-hidden="true" />
                            <p className="text-muted-foreground">
                              Drag &amp; drop here or click to upload your CoS document
                            </p>
                            <p className="text-sm text-muted-foreground">PDF only, max 10MB</p>
                            <input
                              id="cos-file-input"
                              type="file"
                              accept=".pdf"
                              onChange={handleCosFileChange}
                              aria-describedby="cos-hint cos-error"
                              aria-required="true"
                              className="sr-only"
                              data-testid="input-cos-file"
                            />
                          </label>
                        )}
                        {cosError && (
                          <div id="cos-error" role="alert" aria-live="polite" className="mt-3 p-3 bg-destructive/10 border-l-4 border-destructive text-destructive text-sm text-left">
                            {cosError}
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <label htmlFor="supporting-files-input" className="block text-sm font-medium mb-2">
                        Supporting Documents (Optional)
                      </label>
                      <p id="supporting-hint" className="text-sm text-muted-foreground mb-2">PDF, JPG, PNG — max 5 files, 10MB each. Emails and letters are deleted after review.</p>
                      <div className="border border-solid border-border rounded-xl p-6 text-center">
                        {supportingFiles.length > 0 ? (
                          <div className="space-y-2">
                            {supportingFiles.map((file) => (
                              <div key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center justify-between bg-muted/50 rounded-xl p-2">
                                <span className="text-sm truncate">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  aria-label={`Remove ${file.name}`}
                                  onClick={() => {
                                    setSupportingFiles(supportingFiles.filter((f) => f !== file));
                                  }}
                                >
                                  Remove
                                </Button>
                              </div>
                            ))}
                            {supportingFiles.length < 5 && (
                              <label htmlFor="supporting-files-input" className="cursor-pointer block mt-2 text-foreground underline hover:underline rounded has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2">
                                + Add more files
                                <input
                                  id="supporting-files-input"
                                  type="file"
                                  accept=".pdf,.jpg,.jpeg,.png"
                                  multiple
                                  onChange={handleSupportingFilesChange}
                                  aria-describedby="supporting-hint supporting-error"
                                  className="sr-only"
                                />
                              </label>
                            )}
                          </div>
                        ) : (
                          <label htmlFor="supporting-files-input" className="cursor-pointer block rounded-xl has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2">
                            <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" aria-hidden="true" />
                            <p className="text-muted-foreground">
                              Select files to upload
                            </p>
                            <p className="text-sm text-muted-foreground">PDF, JPG, PNG - max 5 files, 10MB each</p>
                            <input
                              id="supporting-files-input"
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png"
                              multiple
                              onChange={handleSupportingFilesChange}
                              aria-describedby="supporting-hint supporting-error"
                              className="sr-only"
                              data-testid="input-supporting-files"
                            />
                          </label>
                        )}
                        {supportingError && (
                          <div id="supporting-error" role="alert" aria-live="polite" className="mt-3 p-3 bg-destructive/10 border-l-4 border-destructive text-destructive text-sm text-left">
                            {supportingError}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="theme-card overflow-hidden">
                  <div className="p-6 border-b border-border">
                    <h3 className="editorial-subheading text-foreground text-lg">4. Additional Notes</h3>
                  </div>
                  <div className="p-6">
                    <FormField
                      control={form.control}
                      name="additionalNotes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Anything else you'd like us to know?</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Any concerns, questions, or additional context..."
                              className="min-h-[80px]"
                              {...field}
                              data-testid="input-additional-notes"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="p-4 bg-info/10 border border-info/20 rounded-xl text-sm text-info">
                  Independent expert review — not the Home Office/UKVI. Does not guarantee a visa outcome. For legal advice consult an OISC-registered adviser.
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full py-6 text-lg bg-primary text-primary-foreground hover:bg-primary/90 rounded-full"
                  disabled={submitMutation.isPending}
                  data-testid="button-submit"
                >
                  {submitMutation.isPending ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin mr-2" aria-hidden="true" />
                      <span role="status" aria-live="polite">Uploading documents… do not close this page…</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5 mr-2" />
                      Submit for Review
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </motion.div>
        </div>
      </div>
    </PageLayout>
  );
}
