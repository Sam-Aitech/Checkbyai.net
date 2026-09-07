import { Upload, FileSearch, Fingerprint, CheckCircle2 } from 'lucide-react';

const STEPS = [
  {
    icon: Upload,
    title: '1. Upload',
    description: 'Upload the Certificate of Sponsorship PDF you received. It is analysed in-memory and deleted immediately after.',
  },
  {
    icon: FileSearch,
    title: '2. Structure check',
    description: 'We check for incremental updates, XMP metadata field presence and ordering, and Info/XMP consistency against genuine Home Office-issued documents.',
  },
  {
    icon: Fingerprint,
    title: '3. Editing-tool check',
    description: 'We look for signatures left by common PDF editors (Photoshop, Canva, PDF24, Smallpdf and others) that indicate the file was modified after issue.',
  },
  {
    icon: CheckCircle2,
    title: '4. Result',
    description: 'You get a genuine / suspicious / fake assessment with a confidence score and the individual checks that drove it.',
  },
];

// A synthetic example result, styled identically to FileUploadSimple's real
// result panel, so this preview matches what the product actually produces.
const SAMPLE_CHECKS = [
  { name: 'Info/XMP Consistency', passed: true },
  { name: 'XMP Field Order', passed: true },
  { name: 'Incremental Updates', passed: true },
  { name: 'Editing Tools', passed: false, detail: 'Adobe Photoshop' },
];

function formatCheckStatus(check: { passed: boolean; detail?: string }): string {
  if (check.passed) return 'Passed';
  return check.detail ? `Flagged (${check.detail})` : 'Flagged';
}

export default function CosSamplePreview() {
  return (
    <div className="mt-12 mb-12 grid lg:grid-cols-2 gap-10 items-start">
      <div>
        <ol className="space-y-4">
          {STEPS.map((step) => (
            <li key={step.title} className="flex gap-3">
              <span className="shrink-0 w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <step.icon className="w-4.5 h-4.5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">{step.title}</p>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div>
        <p className="text-sm text-muted-foreground mb-2">Sample result (synthetic example)</p>
        <div className="p-5 theme-card">
          <h3 className="text-sm font-semibold mb-3 text-foreground">Verification Result</h3>
          <div className="flex items-center gap-3 mb-4">
            <div className="px-3 py-1.5 rounded-full text-sm font-semibold bg-warning/10 text-warning border border-warning/20">
              suspicious
            </div>
            <span className="text-xs text-muted-foreground">Confidence: 62%</span>
          </div>
          <ul className="space-y-1.5">
            {SAMPLE_CHECKS.map((check) => (
              <li key={check.name} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{check.name}</span>
                <span className={check.passed ? 'text-success font-medium' : 'text-destructive font-medium'}>
                  {formatCheckStatus(check)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
