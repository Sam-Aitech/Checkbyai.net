import { useRef, useState } from "react";
import { Loader2, Mail, ArrowLeft, CheckCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Turnstile } from "@marsidev/react-turnstile";

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

interface InlineEmailCheckoutProps {
  onVerified: () => void;
  onCancel: () => void;
}

export default function InlineEmailCheckout({ onVerified, onCancel }: InlineEmailCheckoutProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<any>(null);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setError("Please complete the CAPTCHA");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/email/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, ...(turnstileToken ? { turnstileToken } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) {
        turnstileRef.current?.reset();
        setTurnstileToken(null);
        throw new Error(data.message || "Failed to send verification code");
      }
      setStep("otp");
    } catch (err: any) {
      setError(err.message || "Failed to send verification code");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!code || code.length !== 6) {
      setError("Enter the 6-digit code from your email");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/email/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Invalid verification code");
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Verified", description: "Continuing to checkout..." });
      onVerified();
    } catch (err: any) {
      setError(err.message || "Invalid or expired code");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="inline-email-checkout">
      <AnimatePresence mode="wait">
        {step === "email" ? (
          <motion.form
            key="email-step"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 100, damping: 15 }}
            onSubmit={handleSendOtp}
            className="space-y-2.5"
          >
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 rounded-xl"
                autoFocus
                aria-label="Email address"
                data-testid="inline-checkout-email"
              />
            </div>

            {TURNSTILE_SITE_KEY && (
              <div className="flex justify-center">
                <Turnstile
                  ref={turnstileRef}
                  siteKey={TURNSTILE_SITE_KEY}
                  onSuccess={setTurnstileToken}
                  onExpire={() => setTurnstileToken(null)}
                  onError={() => setTurnstileToken(null)}
                  options={{ theme: "auto", size: "compact" }}
                />
              </div>
            )}

            {error && <p className="text-xs text-red-500">{error}</p>}

            <div className="flex gap-2">
              <Button
                type="submit"
                className="flex-1 rounded-full font-semibold"
                disabled={isLoading || (!!TURNSTILE_SITE_KEY && !turnstileToken)}
                data-testid="inline-checkout-send"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send code"}
              </Button>
              <Button type="button" variant="outline" className="rounded-full" onClick={onCancel}>
                Cancel
              </Button>
            </div>
          </motion.form>
        ) : (
          <motion.form
            key="otp-step"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 100, damping: 15 }}
            onSubmit={handleVerifyOtp}
            className="space-y-2.5"
          >
            <p className="text-xs text-muted-foreground">Code sent to <strong className="text-foreground">{email}</strong></p>
            <Input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="rounded-xl text-center tracking-[0.3em] font-mono"
              autoFocus
              aria-label="Verification code"
              data-testid="inline-checkout-code"
            />

            {error && <p className="text-xs text-red-500">{error}</p>}

            <div className="flex gap-2">
              <Button
                type="submit"
                className="flex-1 rounded-full font-semibold"
                disabled={isLoading || code.length !== 6}
                data-testid="inline-checkout-verify"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle className="h-4 w-4 mr-1.5" />Verify</>}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => { setStep("email"); setCode(""); setError(null); }}
                aria-label="Change email"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
