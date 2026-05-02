import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import VerificationResults from "./VerificationResults";
import COSCheckPanel from "./mis/COSCheckPanel";
import COSAdminPanel from "./mis/COSAdminPanel";
import type { COSCheckResult } from "../../../shared/mis-types";

interface TabbedResult {
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
  cosCheck?: COSCheckResult | null;
}

interface VerificationResultsTabbedProps {
  result: TabbedResult;
  verificationId?: number;
  isAdmin?: boolean;
}

export default function VerificationResultsTabbed({
  result,
  verificationId,
  isAdmin,
}: VerificationResultsTabbedProps) {
  const hasCosCheck = !!result.cosCheck;

  if (!hasCosCheck) {
    return <VerificationResults result={result} verificationId={verificationId} />;
  }

  return (
    <Tabs defaultValue="verification" className="w-full">
      <TabsList className="mb-4">
        <TabsTrigger value="verification">Verification</TabsTrigger>
        <TabsTrigger value="inspector">Metadata Inspector</TabsTrigger>
      </TabsList>

      <TabsContent value="verification">
        <VerificationResults result={result} verificationId={verificationId} />
      </TabsContent>

      <TabsContent value="inspector">
        <COSCheckPanel result={result.cosCheck!} />
        {isAdmin && <COSAdminPanel result={result.cosCheck!} />}
      </TabsContent>
    </Tabs>
  );
}
