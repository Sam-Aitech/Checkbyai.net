import { useState, useEffect } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Upload, CheckCircle, Loader2, FileText, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import SEOHead from '@/components/SEOHead';
import PageLayout from '@/components/PageLayout';

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
      if (file.type !== 'application/pdf') {
        toast({
          title: 'Invalid File',
          description: 'Please upload a PDF file',
          variant: 'destructive',
        });
        return;
      }
      setCosFile(file);
    }
  };

  const handleSupportingFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + supportingFiles.length > 5) {
      toast({
        title: 'Too Many Files',
        description: 'Maximum 5 supporting documents allowed',
        variant: 'destructive',
      });
      return;
    }
    setSupportingFiles([...supportingFiles, ...files]);
  };

  const onSubmit = (data: QuestionnaireFormData) => {
    if (!cosFile) {
      toast({
        title: 'CoS Document Required',
        description: 'Please upload your Certificate of Sponsorship document',
        variant: 'destructive',
      });
      return;
    }
    submitMutation.mutate(data);
  };

  if (!sessionId) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-900 dark:to-gray-800">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <AlertCircle className="w-6 h-6" />
                Invalid Session
              </CardTitle>
              <CardDescription>
                No payment session found. Please complete your purchase first.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setLocation('/pricing')} className="w-full">
                Go to Pricing
              </Button>
            </CardContent>
          </Card>
        </div>
      </PageLayout>
    );
  }

  if (isLoading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-900 dark:to-gray-800">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">Loading your submission...</p>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error || !submission) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-900 dark:to-gray-800">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <AlertCircle className="w-6 h-6" />
                Error Loading Submission
              </CardTitle>
              <CardDescription>
                We couldn't find your submission. Please try again or contact support.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setLocation('/pricing')} className="w-full">
                Go to Pricing
              </Button>
            </CardContent>
          </Card>
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
        <div className="flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-900 dark:to-gray-800 p-4">
          <Card className="max-w-lg text-center">
            <CardHeader>
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <CardTitle className="text-2xl text-green-700 dark:text-green-400">
                Submission Complete!
              </CardTitle>
              <CardDescription className="text-lg">
                Thank you for your submission. Our expert team will review your documents.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Submission ID</p>
                <p className="font-mono text-lg font-semibold">{submission.id}</p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg text-left">
                <h4 className="font-semibold mb-2">What happens next?</h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                  <li>• Our experts will review your documents within 24-48 hours</li>
                  <li>• You will receive an email with your detailed verification report</li>
                  {submission.packageType === 'full' && (
                    <li>• We will contact you to arrange a phone consultation if requested</li>
                  )}
                </ul>
              </div>
              <Button onClick={() => setLocation('/')} variant="outline" className="w-full">
                Return to Home
              </Button>
            </CardContent>
          </Card>
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
      
      <div className="bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl">Complete Your Submission</CardTitle>
                  <CardDescription>
                    Please provide details about your CoS and upload your documents
                  </CardDescription>
                </div>
                <Badge variant={submission.packageType === 'full' ? 'default' : 'secondary'}>
                  {submission.packageType === 'full' ? 'Full Package' : 'Normal'}
                </Badge>
              </div>
            </CardHeader>
          </Card>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">1. About Your Application</CardTitle>
                  <CardDescription>
                    Tell us about how you applied and any communications you received
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
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
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">2. Job Details</CardTitle>
                  <CardDescription>
                    Information about the position and employer
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
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
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">3. Upload Documents</CardTitle>
                  <CardDescription>
                    Upload your Certificate of Sponsorship and any supporting documents
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Certificate of Sponsorship (PDF) <span className="text-red-500">*</span>
                    </label>
                    <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center hover:border-blue-500 transition-colors">
                      {cosFile ? (
                        <div className="flex items-center justify-center gap-3">
                          <FileText className="w-8 h-8 text-blue-600" />
                          <div className="text-left">
                            <p className="font-medium">{cosFile.name}</p>
                            <p className="text-sm text-gray-500">
                              {(cosFile.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setCosFile(null)}
                          >
                            Remove
                          </Button>
                        </div>
                      ) : (
                        <label className="cursor-pointer">
                          <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                          <p className="text-gray-600 dark:text-gray-400">
                            Click to upload your CoS document
                          </p>
                          <p className="text-sm text-gray-400">PDF only, max 10MB</p>
                          <input
                            type="file"
                            accept=".pdf"
                            onChange={handleCosFileChange}
                            className="hidden"
                            data-testid="input-cos-file"
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Supporting Documents (Optional)
                    </label>
                    <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center hover:border-blue-500 transition-colors">
                      {supportingFiles.length > 0 ? (
                        <div className="space-y-2">
                          {supportingFiles.map((file, idx) => (
                            <div key={idx} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 p-2 rounded">
                              <span className="text-sm truncate">{file.name}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSupportingFiles(supportingFiles.filter((_, i) => i !== idx));
                                }}
                              >
                                Remove
                              </Button>
                            </div>
                          ))}
                          {supportingFiles.length < 5 && (
                            <label className="cursor-pointer block mt-2 text-blue-600 hover:underline">
                              + Add more files
                              <input
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png"
                                multiple
                                onChange={handleSupportingFilesChange}
                                className="hidden"
                              />
                            </label>
                          )}
                        </div>
                      ) : (
                        <label className="cursor-pointer">
                          <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                          <p className="text-gray-600 dark:text-gray-400">
                            Upload emails, letters, or other documents
                          </p>
                          <p className="text-sm text-gray-400">PDF, JPG, PNG - max 5 files</p>
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            multiple
                            onChange={handleSupportingFilesChange}
                            className="hidden"
                            data-testid="input-supporting-files"
                          />
                        </label>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">4. Additional Notes</CardTitle>
                </CardHeader>
                <CardContent>
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
                </CardContent>
              </Card>

              <Button
                type="submit"
                size="lg"
                className="w-full py-6 text-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                disabled={submitMutation.isPending}
                data-testid="button-submit"
              >
                {submitMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Submitting...
                  </span>
                ) : (
                  'Submit for Expert Review'
                )}
              </Button>
            </form>
          </Form>
        </div>

      </div>
    </PageLayout>
  );
}
