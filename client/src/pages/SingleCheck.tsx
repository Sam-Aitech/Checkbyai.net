import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ShieldCheck, FileSearch, Building2, PoundSterling, AlertTriangle,
  CheckCircle, XCircle, Loader2, Upload, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import PageLayout from "@/components/PageLayout";
import SEOHead from "@/components/SEOHead";
import { useToast } from "@/hooks/use-toast";

interface ReportFlag {
  name: string;
  passed: boolean;
  severity: string;
  message: string;
}

interface SingleCheckReport {
  receiptId: string;
  document: {
    result: string;
    confidence: number;
    checks: ReportFlag[];
    cosCheck: { verdict: string } | null;
  };
  sponsor: {
    matched: boolean;
    sponsor: { name: string; townCity: string | null; route: string | null; status: string } | null;
    history: Array<{ changeType: string; snapshotDate: string }>;
    note: string;
  } | null;
  salary: { verdict: string; flags: ReportFlag[] } | null;
  redFlags: Array<{ name: string; message: string }>;
}

function getSessionIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("session_id");
}

function VerdictBadge({ verdict }: { verdict: string }) {
  const v = verdict.toLowerCase();
  if (v === "genuine" || v === "pass") {
    return <Badge className="bg-emerald-600 text-white"><CheckCircle className="w-3 h-3 mr-1" />{verdict.toUpperCase()}</Badge>;
  }
  if (v === "suspicious" || v === "warn") {
    return <Badge className="bg-amber-500 text-white"><AlertTriangle className="w-3 h-3 mr-1" />{verdict.toUpperCase()}</Badge>;
  }
  return <Badge className="bg-red-600 text-white"><XCircle className="w-3 h-3 mr-1" />{verdict.toUpperCase()}</Badge>;
}

export default function SingleCheck() {
  const { toast } = useToast();
  const sessionId = getSessionIdFromUrl();

  const [file, setFile] = useState<File | null>(null);
  const [sponsorName, setSponsorName] = useState("");
  const [salary, setSalary] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [report, setReport] = useState<SingleCheckReport | null>(null);

  const { data: sessionStatus, isLoading: statusLoading } = useQuery({
    queryKey: ["single-check-status", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const res = await fetch(`/api/verify/single/status/${sessionId}`);
      if (!res.ok) throw new Error("Could not check payment status");
      const json = await res.json();
      return json.data as { paid: boolean; consumed: boolean };
    },
  });

  useEffect(() => {
    if (sessionStatus && !sessionStatus.paid) {
      toast({
        title: "Payment not found",
        description: "We couldn't confirm your payment. If you were charged, contact support.",
        variant: "destructive",
      });
    }
  }, [sessionStatus, toast]);

  const startCheckout = async () => {
    setIsStartingCheckout(true);
    try {
      const res = await fetch("/api/checkout/single-check", { method: "POST" });
      if (!res.ok) throw new Error("Checkout unavailable");
      const json = await res.json();
      window.location.href = json.data.url;
    } catch {
      toast({ title: "Checkout failed", description: "Please try again in a moment.", variant: "destructive" });
      setIsStartingCheckout(false);
    }
  };

  const submitCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !sessionId) return;
    setIsSubmitting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("sessionId", sessionId);
      if (sponsorName.trim()) form.append("sponsorName", sponsorName.trim());
      if (salary.trim()) form.append("annualSalaryGbp", salary.trim());
      if (jobTitle.trim()) form.append("jobTitle", jobTitle.trim());

      const res = await fetch("/api/verify/single", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || json?.message || "Verification failed");
      setReport(json.data as SingleCheckReport);
    } catch (err: unknown) {
      toast({
        title: "Check failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const paidAndReady = !!sessionId && sessionStatus?.paid && !sessionStatus?.consumed && !report;

  return (
    <PageLayout>
      <SEOHead
        title="Single CoS Scam Check — £9.99, No Account Needed | CheckByAI"
        description="One-off Certificate of Sponsorship scam check: forensic document analysis, sponsor licence verification, and salary threshold check. Instant report, no subscription."
      />
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">

        {/* ── Report view ── */}
        {report && (
          <div className="space-y-6" data-testid="single-check-report">
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold">Your Scam Check Report</h1>
              <p className="text-sm text-muted-foreground">Receipt: {report.receiptId}</p>
            </div>

            <section className="border rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold flex items-center gap-2"><FileSearch className="w-5 h-5" /> Document forensics</h2>
                <VerdictBadge verdict={report.document.result} />
              </div>
              <p className="text-sm text-muted-foreground">Confidence: {report.document.confidence}%</p>
              <ul className="space-y-2">
                {report.document.checks.map((c, i) => (
                  <li key={i} className="text-sm flex gap-2">
                    {c.passed
                      ? <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      : <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />}
                    <span><strong>{c.name}:</strong> {c.message}</span>
                  </li>
                ))}
              </ul>
            </section>

            {report.sponsor && (
              <section className="border rounded-xl p-5 space-y-3">
                <h2 className="font-semibold flex items-center gap-2"><Building2 className="w-5 h-5" /> Sponsor licence check</h2>
                {report.sponsor.sponsor && (
                  <p className="text-sm">
                    <strong>{report.sponsor.sponsor.name}</strong>
                    {report.sponsor.sponsor.townCity ? `, ${report.sponsor.sponsor.townCity}` : ""} —{" "}
                    <VerdictBadge verdict={report.sponsor.sponsor.status === "ACTIVE" || report.sponsor.sponsor.status === "NEWLY_GRANTED" ? "PASS" : "FAIL"} />
                  </p>
                )}
                <p className="text-sm text-muted-foreground">{report.sponsor.note}</p>
              </section>
            )}

            {report.salary && (
              <section className="border rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold flex items-center gap-2"><PoundSterling className="w-5 h-5" /> Salary check</h2>
                  <VerdictBadge verdict={report.salary.verdict} />
                </div>
                <ul className="space-y-2">
                  {report.salary.flags.map((f, i) => (
                    <li key={i} className="text-sm flex gap-2">
                      {f.passed
                        ? <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        : <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />}
                      <span>{f.message}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="border rounded-xl p-5 space-y-3">
              <h2 className="font-semibold flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> Scam red flags to check yourself</h2>
              <ul className="space-y-2">
                {report.redFlags.map((f, i) => (
                  <li key={i} className="text-sm"><strong>{f.name}.</strong> {f.message}</li>
                ))}
              </ul>
            </section>

            <p className="text-xs text-muted-foreground text-center">
              Save this page or note your receipt ID. This report is guidance, not legal advice.
              Want ongoing protection? <a href="/pricing" className="underline">Get alerts if your sponsor's licence changes</a>.
            </p>
          </div>
        )}

        {/* ── Upload form (paid, not yet used) ── */}
        {paidAndReady && (
          <form onSubmit={submitCheck} className="space-y-6" data-testid="single-check-form">
            <div className="text-center space-y-2">
              <ShieldCheck className="w-10 h-10 text-emerald-600 mx-auto" />
              <h1 className="text-2xl font-bold">Payment confirmed — run your check</h1>
              <p className="text-sm text-muted-foreground">
                Upload your Certificate of Sponsorship (PDF). Add the employer name and salary for the full report.
              </p>
            </div>

            <div className="space-y-4 border rounded-xl p-5">
              <div>
                <Label htmlFor="cos-file">CoS document (PDF, max 10&nbsp;MB)</Label>
                <Input id="cos-file" type="file" accept="application/pdf"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
              </div>
              <div>
                <Label htmlFor="sponsor-name">Employer / sponsor name (as written on the CoS)</Label>
                <Input id="sponsor-name" value={sponsorName} onChange={(e) => setSponsorName(e.target.value)}
                  placeholder="e.g. Acme Care Ltd" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="salary">Annual salary (GBP)</Label>
                  <Input id="salary" type="number" min="0" value={salary} onChange={(e) => setSalary(e.target.value)}
                    placeholder="e.g. 26500" />
                </div>
                <div>
                  <Label htmlFor="job-title">Job title</Label>
                  <Input id="job-title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="e.g. Care Assistant" />
                </div>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={!file || isSubmitting}>
              {isSubmitting
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analysing…</>
                : <><Upload className="w-4 h-4 mr-2" /> Run my scam check</>}
            </Button>
            <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
              <Lock className="w-3 h-3" /> Your document is analysed in memory and deleted immediately.
            </p>
          </form>
        )}

        {/* ── Already used ── */}
        {sessionId && sessionStatus?.consumed && !report && (
          <div className="text-center space-y-4 py-12">
            <h1 className="text-2xl font-bold">This payment has already been used</h1>
            <p className="text-muted-foreground">Each £9.99 payment covers one report. Need another check?</p>
            <Button onClick={startCheckout} disabled={isStartingCheckout}>
              {isStartingCheckout && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Buy another check — £9.99
            </Button>
          </div>
        )}

        {/* ── Landing / buy ── */}
        {!sessionId && !report && (
          <div className="space-y-8">
            <div className="text-center space-y-3">
              <h1 className="text-3xl font-bold">Is your UK job offer a scam?</h1>
              <p className="text-lg text-muted-foreground">
                One payment. One complete check. No account, no subscription.
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { icon: <FileSearch className="w-6 h-6" />, title: "Document forensics", text: "AI analysis of your CoS PDF — edits, forged metadata, suspicious software." },
                { icon: <Building2 className="w-6 h-6" />, title: "Sponsor licence check", text: "Is the employer really licensed? Full register history, including removals." },
                { icon: <PoundSterling className="w-6 h-6" />, title: "Salary reality check", text: "Does the offered salary actually qualify for a UK visa?" },
              ].map((c, i) => (
                <div key={i} className="border rounded-xl p-5 space-y-2 text-center">
                  <div className="mx-auto w-fit text-blue-600">{c.icon}</div>
                  <h3 className="font-semibold">{c.title}</h3>
                  <p className="text-sm text-muted-foreground">{c.text}</p>
                </div>
              ))}
            </div>

            <div className="text-center space-y-3">
              <Button size="lg" onClick={startCheckout} disabled={isStartingCheckout} data-testid="buy-single-check">
                {isStartingCheckout && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Check my offer now — £9.99
              </Button>
              <p className="text-xs text-muted-foreground">
                Secure payment via Stripe. Document deleted after analysis.
                Checking many documents? <a href="/cos-pricing" className="underline">See credit packages</a>.
              </p>
            </div>
          </div>
        )}

        {sessionId && statusLoading && (
          <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin mx-auto" /></div>
        )}
      </div>
    </PageLayout>
  );
}
