import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";
import {
  Code,
  Terminal,
  Key,
  Zap,
  Shield,
  ArrowLeft,
  CheckCircle,
  Building2,
  Users,
  Award,
  Clock,
  Send,
  Copy,
  BookOpen,
  Server,
  Lock,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import PageLayout from "@/components/PageLayout";
import SEOHead from "@/components/SEOHead";

const spring = { type: "spring" as const, stiffness: 100, damping: 15 };

function AnimatedSection({ children, className }: { children: React.ReactNode; className?: string }) {
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.1 });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
      transition={spring}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function CodeBlock({ children, language }: { children: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <div className="absolute top-2 right-2 z-10">
        <button
          onClick={handleCopy}
          className="p-1.5 rounded-sm bg-muted-foreground/20 hover:bg-muted-foreground/30 text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
      {language && (
        <div className="absolute top-2 left-3 text-xs text-muted-foreground font-mono">{language}</div>
      )}
      <pre className="bg-foreground text-background rounded-sm p-4 pt-8 overflow-x-auto text-sm font-mono leading-relaxed">
        <code>{children}</code>
      </pre>
    </div>
  );
}

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: "bg-green-600 text-white",
    POST: "bg-blue-600 text-white",
    PUT: "bg-yellow-600 text-white",
    DELETE: "bg-red-600 text-white",
  };
  return (
    <span className={`px-2.5 py-1 rounded-sm text-xs font-bold font-mono ${colors[method] || "bg-muted-foreground text-background"}`}>
      {method}
    </span>
  );
}

const endpoints = [
  {
    method: "POST",
    path: "/api/v1/verify",
    description: "Upload and verify a CoS document. Accepts PDF or image files via multipart/form-data.",
    request: `curl -X POST https://api.checkbyai.net/api/v1/verify \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -F "file=@certificate.pdf" \\
  -F "priority=standard"`,
    response: `{
  "id": "ver_abc123def456",
  "status": "completed",
  "result": "genuine",
  "confidence": 0.97,
  "checks": [
    { "name": "format_validation", "status": "pass", "score": 0.99 },
    { "name": "content_analysis", "status": "pass", "score": 0.96 },
    { "name": "fraud_detection", "status": "pass", "score": 0.98 },
    { "name": "sponsor_verification", "status": "pass", "score": 0.95 }
  ],
  "receipt_url": "/api/v1/verification/ver_abc123def456/receipt",
  "created_at": "2026-02-11T10:30:00Z"
}`,
  },
  {
    method: "GET",
    path: "/api/v1/verification/:id",
    description: "Retrieve the full verification result by its unique ID. Useful for polling async verifications.",
    request: `curl https://api.checkbyai.net/api/v1/verification/ver_abc123def456 \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
    response: `{
  "id": "ver_abc123def456",
  "status": "completed",
  "result": "genuine",
  "confidence": 0.97,
  "checks": [
    { "name": "format_validation", "status": "pass", "score": 0.99 },
    { "name": "content_analysis", "status": "pass", "score": 0.96 },
    { "name": "fraud_detection", "status": "pass", "score": 0.98 },
    { "name": "sponsor_verification", "status": "pass", "score": 0.95 }
  ],
  "receipt_url": "/api/v1/verification/ver_abc123def456/receipt",
  "created_at": "2026-02-11T10:30:00Z"
}`,
  },
  {
    method: "GET",
    path: "/api/v1/verification/:id/receipt",
    description: "Download the verification receipt as a PDF. The receipt includes a unique reference ID, timestamp, and full verification summary for your records.",
    request: `curl https://api.checkbyai.net/api/v1/verification/ver_abc123def456/receipt \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -o receipt.pdf`,
    response: `Content-Type: application/pdf
Content-Disposition: attachment; filename="receipt_ver_abc123def456.pdf"

(Binary PDF data)`,
  },
  {
    method: "GET",
    path: "/api/v1/verifications",
    description: "List all verification history for your account. Supports pagination and filtering by status or date range.",
    request: `curl "https://api.checkbyai.net/api/v1/verifications?page=1&limit=20&status=completed" \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
    response: `{
  "data": [
    {
      "id": "ver_abc123def456",
      "status": "completed",
      "result": "genuine",
      "confidence": 0.97,
      "created_at": "2026-02-11T10:30:00Z"
    },
    {
      "id": "ver_xyz789ghi012",
      "status": "completed",
      "result": "suspicious",
      "confidence": 0.34,
      "created_at": "2026-02-10T14:15:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 47,
    "total_pages": 3
  }
}`,
  },
];

const jsExample = `import CheckByAI from '@checkbyai/sdk';

const client = new CheckByAI({
  apiKey: process.env.CHECKBYAI_API_KEY,
});

// Upload and verify a document
const result = await client.verify({
  file: fs.createReadStream('./certificate.pdf'),
  priority: 'standard',
});

console.log(result.status);     // "completed"
console.log(result.result);     // "genuine"
console.log(result.confidence); // 0.97

// Download receipt
const receipt = await client.getReceipt(result.id);
fs.writeFileSync('receipt.pdf', receipt);`;

const pythonExample = `import checkbyai

client = checkbyai.Client(api_key="YOUR_API_KEY")

# Upload and verify a document
with open("certificate.pdf", "rb") as f:
    result = client.verify(file=f, priority="standard")

print(result.status)      # "completed"
print(result.result)      # "genuine"
print(result.confidence)  # 0.97

# List verification history
history = client.verifications.list(page=1, limit=20)
for v in history.data:
    print(f"{v.id}: {v.result}")`;

const curlExample = `# Upload and verify a document
curl -X POST https://api.checkbyai.net/api/v1/verify \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -F "file=@certificate.pdf" \\
  -F "priority=standard"

# Get verification result
curl https://api.checkbyai.net/api/v1/verification/ver_abc123 \\
  -H "Authorization: Bearer YOUR_API_KEY"

# Download receipt
curl https://api.checkbyai.net/api/v1/verification/ver_abc123/receipt \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -o receipt.pdf

# List verification history
curl "https://api.checkbyai.net/api/v1/verifications?page=1&limit=20" \\
  -H "Authorization: Bearer YOUR_API_KEY"`;

export default function ApiDocs() {
  const [activeTab, setActiveTab] = useState<"javascript" | "python" | "curl">("javascript");

  return (
    <PageLayout>
      <SEOHead
        title="API Documentation | B2B Integration | Check By AI"
        description="Integrate CoS verification into your immigration consultancy or HR platform. RESTful API with real-time document analysis, webhooks, and enterprise features."
        keywords="CoS verification API, document verification integration, immigration API, HR document check API, B2B verification service"
        canonicalUrl="https://checkbyai.net/api-docs"
      />
      <div className="bg-background">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <div className="text-center mb-12">
          <div className="editorial-caption brutalist-border rounded-sm px-3 py-1.5 inline-flex items-center gap-2">
            <Code className="w-4 h-4" />
            Developer API
          </div>
          <h1 className="editorial-heading text-5xl md:text-6xl text-foreground mt-4 mb-4">
            API Documentation
          </h1>
          <p className="text-xl text-muted-foreground editorial-body max-w-2xl mx-auto">
            Integrate CoS verification into your workflows. Built for immigration consultancies, law firms, and HR platforms.
          </p>
        </div>

        <div className="grid gap-8 mb-12">
          <AnimatedSection>
            <div className="brutalist-border rounded-sm bg-card overflow-hidden">
              <div className="p-6 border-b brutalist-border">
                <div className="flex items-center gap-3">
                  <BookOpen className="w-6 h-6 text-foreground" />
                  <h2 className="editorial-subheading text-foreground">Getting Started</h2>
                </div>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <h3 className="font-semibold text-foreground mb-2">Base URL</h3>
                  <CodeBlock language="text">{`https://api.checkbyai.net/api/v1`}</CodeBlock>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                    <Key className="w-4 h-4 text-foreground" />
                    Authentication
                  </h3>
                  <p className="text-muted-foreground mb-3">
                    All API requests require an API key passed via the <code className="px-1.5 py-0.5 bg-muted rounded-sm text-sm font-mono">Authorization</code> header.
                  </p>
                  <CodeBlock language="http">{`Authorization: Bearer YOUR_API_KEY`}</CodeBlock>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-foreground" />
                    Rate Limits
                  </h3>
                  <div className="grid md:grid-cols-3 gap-3">
                    <div className="p-3 bg-muted/50 brutalist-border rounded-sm text-center">
                      <p className="text-2xl font-bold text-foreground">60</p>
                      <p className="text-sm text-muted-foreground">Requests/minute</p>
                    </div>
                    <div className="p-3 bg-muted/50 brutalist-border rounded-sm text-center">
                      <p className="text-2xl font-bold text-foreground">1,000</p>
                      <p className="text-sm text-muted-foreground">Requests/hour</p>
                    </div>
                    <div className="p-3 bg-muted/50 brutalist-border rounded-sm text-center">
                      <p className="text-2xl font-bold text-foreground">10MB</p>
                      <p className="text-sm text-muted-foreground">Max file size</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </AnimatedSection>

          <AnimatedSection>
            <div className="brutalist-border rounded-sm bg-card overflow-hidden">
              <div className="p-6 border-b brutalist-border">
                <div className="flex items-center gap-3">
                  <Server className="w-6 h-6 text-foreground" />
                  <h2 className="editorial-subheading text-foreground">Endpoints</h2>
                </div>
              </div>
              <div className="p-6 space-y-8">
                {endpoints.map((endpoint, index) => (
                  <div key={index} className={index > 0 ? "border-t brutalist-border pt-8" : ""}>
                    <div className="flex items-center gap-3 mb-2">
                      <MethodBadge method={endpoint.method} />
                      <code className="text-sm font-mono font-semibold text-foreground">{endpoint.path}</code>
                    </div>
                    <p className="text-muted-foreground mb-4">{endpoint.description}</p>

                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Request</p>
                        <CodeBlock language="bash">{endpoint.request}</CodeBlock>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Response</p>
                        <CodeBlock language="json">{endpoint.response}</CodeBlock>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </AnimatedSection>

          <AnimatedSection>
            <div className="brutalist-border rounded-sm bg-card overflow-hidden">
              <div className="p-6 border-b brutalist-border">
                <div className="flex items-center gap-3">
                  <Shield className="w-6 h-6 text-foreground" />
                  <h2 className="editorial-subheading text-foreground">Response Format</h2>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-muted-foreground">
                  All verification responses follow a consistent JSON structure with these key fields:
                </p>
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="p-3 bg-muted/50 brutalist-border rounded-sm">
                    <code className="text-sm font-mono text-foreground">status</code>
                    <p className="text-sm text-muted-foreground mt-1">Processing status: <code className="text-xs">pending</code>, <code className="text-xs">processing</code>, <code className="text-xs">completed</code>, <code className="text-xs">failed</code></p>
                  </div>
                  <div className="p-3 bg-muted/50 brutalist-border rounded-sm">
                    <code className="text-sm font-mono text-foreground">result</code>
                    <p className="text-sm text-muted-foreground mt-1">Verification outcome: <code className="text-xs">genuine</code>, <code className="text-xs">suspicious</code>, <code className="text-xs">fraudulent</code></p>
                  </div>
                  <div className="p-3 bg-muted/50 brutalist-border rounded-sm">
                    <code className="text-sm font-mono text-foreground">confidence</code>
                    <p className="text-sm text-muted-foreground mt-1">Confidence score from 0.0 to 1.0 indicating certainty of result</p>
                  </div>
                  <div className="p-3 bg-muted/50 brutalist-border rounded-sm">
                    <code className="text-sm font-mono text-foreground">checks[]</code>
                    <p className="text-sm text-muted-foreground mt-1">Array of individual checks performed with name, status, and score</p>
                  </div>
                  <div className="p-3 bg-muted/50 brutalist-border rounded-sm">
                    <code className="text-sm font-mono text-foreground">receipt_url</code>
                    <p className="text-sm text-muted-foreground mt-1">URL to download the verification receipt PDF</p>
                  </div>
                  <div className="p-3 bg-muted/50 brutalist-border rounded-sm">
                    <code className="text-sm font-mono text-foreground">created_at</code>
                    <p className="text-sm text-muted-foreground mt-1">ISO 8601 timestamp of when the verification was created</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Example Response</p>
                  <CodeBlock language="json">{`{
  "id": "ver_abc123def456",
  "status": "completed",
  "result": "genuine",
  "confidence": 0.97,
  "checks": [
    { "name": "format_validation", "status": "pass", "score": 0.99 },
    { "name": "content_analysis", "status": "pass", "score": 0.96 },
    { "name": "fraud_detection", "status": "pass", "score": 0.98 },
    { "name": "sponsor_verification", "status": "pass", "score": 0.95 }
  ],
  "receipt_url": "/api/v1/verification/ver_abc123def456/receipt",
  "created_at": "2026-02-11T10:30:00Z"
}`}</CodeBlock>
                </div>
              </div>
            </div>
          </AnimatedSection>

          <AnimatedSection>
            <div className="brutalist-border rounded-sm bg-card overflow-hidden">
              <div className="p-6 border-b brutalist-border">
                <div className="flex items-center gap-3">
                  <Terminal className="w-6 h-6 text-foreground" />
                  <h2 className="editorial-subheading text-foreground">SDKs & Libraries</h2>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-muted-foreground">
                  Get started quickly with our official SDKs or use cURL for direct API access.
                </p>

                <div className="flex gap-2 border-b brutalist-border">
                  <button
                    onClick={() => setActiveTab("javascript")}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === "javascript"
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    JavaScript / Node.js
                  </button>
                  <button
                    onClick={() => setActiveTab("python")}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === "python"
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Python
                  </button>
                  <button
                    onClick={() => setActiveTab("curl")}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === "curl"
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    cURL
                  </button>
                </div>

                {activeTab === "javascript" && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Code className="w-4 h-4 text-foreground" />
                      <p className="text-sm text-muted-foreground">Install: <code className="px-1.5 py-0.5 bg-muted rounded-sm text-xs font-mono">npm install @checkbyai/sdk</code></p>
                    </div>
                    <CodeBlock language="javascript">{jsExample}</CodeBlock>
                  </div>
                )}

                {activeTab === "python" && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Code className="w-4 h-4 text-foreground" />
                      <p className="text-sm text-muted-foreground">Install: <code className="px-1.5 py-0.5 bg-muted rounded-sm text-xs font-mono">pip install checkbyai</code></p>
                    </div>
                    <CodeBlock language="python">{pythonExample}</CodeBlock>
                  </div>
                )}

                {activeTab === "curl" && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Terminal className="w-4 h-4 text-foreground" />
                      <p className="text-sm text-muted-foreground">No installation required, use from any terminal</p>
                    </div>
                    <CodeBlock language="bash">{curlExample}</CodeBlock>
                  </div>
                )}
              </div>
            </div>
          </AnimatedSection>

          <AnimatedSection>
            <div className="brutalist-border rounded-sm bg-card overflow-hidden">
              <div className="p-6 border-b brutalist-border">
                <div className="flex items-center gap-3">
                  <Zap className="w-6 h-6 text-foreground" />
                  <h2 className="editorial-subheading text-foreground">API Pricing</h2>
                </div>
              </div>
              <div className="p-6">
                <p className="text-muted-foreground mb-6">
                  Flexible pricing designed for teams and organisations of all sizes.
                </p>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="p-6 bg-muted/50 brutalist-border rounded-sm text-center">
                    <div className="w-12 h-12 bg-muted rounded-sm flex items-center justify-center mx-auto mb-3">
                      <Zap className="w-6 h-6 text-foreground" />
                    </div>
                    <h3 className="text-lg font-bold text-foreground mb-1">Starter</h3>
                    <p className="text-3xl font-bold text-foreground mb-1">£99<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                    <p className="text-sm text-muted-foreground mb-4">100 verifications/month</p>
                    <ul className="text-sm text-left space-y-2">
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-foreground flex-shrink-0" />
                        <span className="text-muted-foreground">Full API access</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-foreground flex-shrink-0" />
                        <span className="text-muted-foreground">Email support</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-foreground flex-shrink-0" />
                        <span className="text-muted-foreground">Verification receipts</span>
                      </li>
                    </ul>
                  </div>

                  <div className="p-6 bg-muted/50 brutalist-border-strong rounded-sm text-center relative">
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="px-3 py-1 bg-foreground text-background text-xs font-bold rounded-sm">POPULAR</span>
                    </div>
                    <div className="w-12 h-12 bg-muted rounded-sm flex items-center justify-center mx-auto mb-3">
                      <Award className="w-6 h-6 text-foreground" />
                    </div>
                    <h3 className="text-lg font-bold text-foreground mb-1">Professional</h3>
                    <p className="text-3xl font-bold text-foreground mb-1">£499<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                    <p className="text-sm text-muted-foreground mb-4">1,000 verifications/month</p>
                    <ul className="text-sm text-left space-y-2">
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-foreground flex-shrink-0" />
                        <span className="text-muted-foreground">Everything in Starter</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-foreground flex-shrink-0" />
                        <span className="text-muted-foreground">Priority support</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-foreground flex-shrink-0" />
                        <span className="text-muted-foreground">Webhook notifications</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-foreground flex-shrink-0" />
                        <span className="text-muted-foreground">Bulk upload endpoint</span>
                      </li>
                    </ul>
                  </div>

                  <div className="p-6 bg-muted/50 brutalist-border rounded-sm text-center">
                    <div className="w-12 h-12 bg-muted rounded-sm flex items-center justify-center mx-auto mb-3">
                      <Building2 className="w-6 h-6 text-foreground" />
                    </div>
                    <h3 className="text-lg font-bold text-foreground mb-1">Enterprise</h3>
                    <p className="text-3xl font-bold text-foreground mb-1">Custom</p>
                    <p className="text-sm text-muted-foreground mb-4">Unlimited verifications</p>
                    <ul className="text-sm text-left space-y-2">
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-foreground flex-shrink-0" />
                        <span className="text-muted-foreground">Everything in Professional</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-foreground flex-shrink-0" />
                        <span className="text-muted-foreground">Dedicated account manager</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-foreground flex-shrink-0" />
                        <span className="text-muted-foreground">Custom SLA &amp; integrations</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-foreground flex-shrink-0" />
                        <span className="text-muted-foreground">On-premise deployment option</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </AnimatedSection>

          <AnimatedSection>
            <div className="brutalist-border rounded-sm bg-card overflow-hidden">
              <div className="p-6 border-b brutalist-border">
                <div className="flex items-center gap-3">
                  <Lock className="w-6 h-6 text-foreground" />
                  <h2 className="editorial-subheading text-foreground">Who Uses Our API?</h2>
                </div>
              </div>
              <div className="p-6">
                <div className="grid md:grid-cols-3 gap-4 mb-6">
                  <div className="p-4 bg-muted/50 brutalist-border rounded-sm text-center">
                    <Building2 className="w-8 h-8 text-foreground mx-auto mb-2" />
                    <p className="font-semibold text-foreground">Immigration Consultancies</p>
                    <p className="text-sm text-muted-foreground">Bulk verification for client portfolios</p>
                  </div>
                  <div className="p-4 bg-muted/50 brutalist-border rounded-sm text-center">
                    <Award className="w-8 h-8 text-foreground mx-auto mb-2" />
                    <p className="font-semibold text-foreground">Law Firms</p>
                    <p className="text-sm text-muted-foreground">Due diligence and compliance checks</p>
                  </div>
                  <div className="p-4 bg-muted/50 brutalist-border rounded-sm text-center">
                    <Users className="w-8 h-8 text-foreground mx-auto mb-2" />
                    <p className="font-semibold text-foreground">HR Platforms</p>
                    <p className="text-sm text-muted-foreground">Right-to-work verification at scale</p>
                  </div>
                </div>
              </div>
            </div>
          </AnimatedSection>

          <AnimatedSection>
            <div className="brutalist-border-strong rounded-sm bg-card overflow-hidden">
              <div className="p-6 border-b brutalist-border">
                <div className="flex items-center gap-3">
                  <Send className="w-6 h-6 text-foreground" />
                  <h2 className="editorial-subheading text-foreground">Get API Access</h2>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-muted-foreground">
                  Ready to integrate CoS verification into your platform? Contact our team to get your API key and start building.
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <a href="mailto:api@checkbyai.net?subject=API%20Access%20Request" className="flex-1">
                    <Button className="w-full bg-foreground text-background hover:bg-foreground/90 rounded-sm">
                      <Send className="w-4 h-4 mr-2" />
                      Request API Access
                    </Button>
                  </a>
                  <Link href="/technology">
                    <Button variant="outline" className="w-full brutalist-border text-foreground hover:bg-muted rounded-sm">
                      <ArrowRight className="w-4 h-4 mr-2" />
                      Learn About Our Technology
                    </Button>
                  </Link>
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  Typical response time: within 24 hours on business days
                </p>
              </div>
            </div>
          </AnimatedSection>
        </div>

          <div className="text-center">
            <Link href="/dashboard">
              <Button size="lg" className="bg-foreground text-background hover:bg-foreground/90 rounded-sm">
                <Shield className="w-5 h-5 mr-2" />
                Try Verification Now
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
