import { useState } from 'react';
import { Bell, Zap, Loader2, ChevronDown, Mail } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { unwrapApiEnvelope } from '@/lib/apiEnvelope';
import { usePackagePrices } from '@/hooks/usePackagePrices';
import { LEGACY_PAYMENT_LINKS } from '@/lib/legacyPaymentLinks';

interface AlertAddOnModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyName: string;
  userEmail?: string;
}

const ANNUAL_PLANS = [
  { packageType: 'alert_annual', name: 'Alert Pass (Annual)', price: '£9.99', period: '/yr', description: '1 company, email + WhatsApp, same-day alerts', icon: Bell },
  { packageType: 'alert_annual_pro', name: 'Alert Pass Pro (Annual)', price: '£19.99', period: '/yr', description: 'Up to 5 companies, instant alerts + SMS', icon: Zap },
] as const;

const LEGACY_PLANS = [
  { packageType: 'notification_starter', name: 'Starter (monthly)', price: '£24.99', period: '/mo' },
  { packageType: 'notification_pro', name: 'Pro (monthly)', price: '£49.99', period: '/mo' },
] as const;

export default function AlertAddOnModal({ open, onOpenChange, companyName, userEmail }: Readonly<AlertAddOnModalProps>) {
  const { toast } = useToast();
  const { getPriceId } = usePackagePrices();
  const [loadingType, setLoadingType] = useState<string | null>(null);
  const [showMonthly, setShowMonthly] = useState(false);

  const startAnnualCheckout = async (packageType: string) => {
    const priceId = getPriceId(packageType);
    if (!priceId) {
      toast({
        title: 'Not available yet',
        description: 'This plan is not open for checkout yet. Please check back shortly.',
        variant: 'destructive',
      });
      return;
    }
    setLoadingType(packageType);
    try {
      const res = await apiRequest('POST', '/api/checkout/credits', { priceId, packageType, companyName });
      const envelope = await res.json();
      const { url } = unwrapApiEnvelope<{ url: string }>(envelope);
      window.location.href = url;
    } catch (error: any) {
      toast({ title: 'Checkout failed', description: error.message || 'Please try again.', variant: 'destructive' });
      setLoadingType(null);
    }
  };

  const startLegacyCheckout = async (packageType: string) => {
    const link = LEGACY_PAYMENT_LINKS[packageType];
    if (!link) return;
    setLoadingType(packageType);
    try {
      const res = await apiRequest('POST', '/api/checkout/sign', { packageType, companyName });
      const envelope = await res.json();
      const { clientReferenceId } = unwrapApiEnvelope<{ clientReferenceId: string }>(envelope);
      const url = `${link}?client_reference_id=${encodeURIComponent(clientReferenceId)}&prefilled_email=${encodeURIComponent(userEmail || '')}`;
      window.location.href = url;
    } catch (error: any) {
      toast({ title: 'Checkout failed', description: error.message || 'Please try again.', variant: 'destructive' });
      setLoadingType(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Get alerts for {companyName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {ANNUAL_PLANS.map((plan) => (
            <button
              type="button"
              key={plan.packageType}
              onClick={() => startAnnualCheckout(plan.packageType)}
              disabled={loadingType !== null}
              className="w-full text-left p-4 rounded-xl border-2 border-border hover:border-primary transition-colors disabled:opacity-50 flex items-start gap-3"
            >
              <plan.icon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-semibold text-foreground">{plan.name}</p>
                  <p className="font-bold text-foreground shrink-0">{plan.price}<span className="text-xs font-normal text-muted-foreground">{plan.period}</span></p>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{plan.description}</p>
              </div>
              {loadingType === plan.packageType && <Loader2 className="w-4 h-4 animate-spin shrink-0 mt-0.5" />}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setShowMonthly((v) => !v)}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground py-1"
          >
            Prefer to pay monthly instead? <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showMonthly ? 'rotate-180' : ''}`} />
          </button>

          {showMonthly && (
            <div className="space-y-2 pt-1">
              {LEGACY_PLANS.map((plan) => (
                <button
                  type="button"
                  key={plan.packageType}
                  onClick={() => startLegacyCheckout(plan.packageType)}
                  disabled={loadingType !== null}
                  className="w-full text-left p-3 rounded-lg border border-border hover:border-primary/50 transition-colors disabled:opacity-50 flex items-center justify-between text-sm"
                >
                  <span className="text-foreground">{plan.name}</span>
                  <span className="text-muted-foreground">{plan.price}{plan.period}</span>
                </button>
              ))}
            </div>
          )}

          <p className="text-xs text-center text-muted-foreground pt-2 border-t border-border">
            Managing sponsored employees at scale?{' '}
            <a href="mailto:support@checkbyai.net?subject=Enterprise%20Plan%20Enquiry" className="underline font-medium text-foreground inline-flex items-center gap-1">
              <Mail className="w-3 h-3" />Contact Sales for Enterprise
            </a>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
