import { useState, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, ArrowLeft, CheckCircle } from "lucide-react";
import PageLayout from "@/components/PageLayout";
import SEOHead from "@/components/SEOHead";
import { motion, AnimatePresence } from "framer-motion";
import logoImg from "@assets/logo_material.png";
import { queryClient } from "@/lib/queryClient";
import BrandLogo from "@/components/BrandLogo";
import { Turnstile } from "@marsidev/react-turnstile";

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -16 },
  transition: { type: "spring", stiffness: 100, damping: 15 },
};

// ─── Premium 6-digit OTP input component ─────────────────────────────────────
function OTPBoxes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key === 'Backspace') {
      if (value[idx]) {
        const next = value.split('');
        next[idx] = '';
        onChange(next.join(''));
      } else if (idx > 0) {
        inputsRef.current[idx - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      inputsRef.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowRight' && idx < 5) {
      inputsRef.current[idx + 1]?.focus();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, idx: number) => {
    const digit = e.target.value.replace(/\D/g, '').slice(-1);
    const chars = (value + '      ').split('').slice(0, 6);
    chars[idx] = digit;
    const newVal = chars.join('').trimEnd().slice(0, 6);
    onChange(newVal);
    if (digit && idx < 5) {
      setTimeout(() => inputsRef.current[idx + 1]?.focus(), 0);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    onChange(pasted);
    const focusIdx = Math.min(pasted.length, 5);
    setTimeout(() => inputsRef.current[focusIdx]?.focus(), 0);
  };

  return (
    <div className="flex gap-2 sm:gap-3 justify-center" data-testid="input-otp">
      {Array.from({ length: 6 }, (_, idx) => (
        <input
          key={idx}
          id={`otp-${idx}`}
          ref={(el) => { inputsRef.current[idx] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[idx] || ''}
          onChange={(e) => handleChange(e, idx)}
          onKeyDown={(e) => handleKeyDown(e, idx)}
          onPaste={idx === 0 ? handlePaste : undefined}
          onFocus={(e) => e.target.select()}
          className="otp-box"
          placeholder="·"
          autoComplete={idx === 0 ? 'one-time-code' : 'off'}
          aria-label={`OTP digit ${idx + 1}`}
        />
      ))}
    </div>
  );
}

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [isLoading, setIsLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<any>(null);

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !email.includes("@")) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      toast({
        title: "Please complete the CAPTCHA",
        description: "Verify you're human before continuing",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/email/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, turnstileToken }),
      });

      const data = await response.json();

      if (!response.ok) {
        turnstileRef.current?.reset();
        setTurnstileToken(null);
        throw new Error(data.message || "Failed to send verification code");
      }

      toast({
        title: "Code sent!",
        description: "Check your email for the 6-digit verification code",
      });
      
      setStep("otp");
    } catch (error: any) {
      toast({
        title: "Failed to send code",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!otpCode || otpCode.length !== 6) {
      toast({
        title: "Invalid code",
        description: "Please enter the 6-digit code from your email",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/email/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, code: otpCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Invalid verification code");
      }

      toast({
        title: "Welcome!",
        description: "You're now logged in.",
      });

      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });

      const params = new URLSearchParams(search);
      const redirectTo = params.get("redirect");
      const safeRedirect = redirectTo && redirectTo.startsWith("/") ? redirectTo : "/sponsor-monitor";
      setLocation(safeRedirect);
    } catch (error: any) {
      toast({
        title: "Verification failed",
        description: error.message || "Invalid or expired code",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/email/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        throw new Error("Failed to resend code");
      }

      toast({
        title: "Code resent!",
        description: "Check your email for a new verification code",
      });
    } catch (error: any) {
      toast({
        title: "Failed to resend",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PageLayout>
      <SEOHead
        title="Sign In | Check By AI"
        description="Sign in to Check By AI to verify your Certificate of Sponsorship documents. Access your verification history and manage your account."
        canonicalUrl="https://checkbyai.net/login"
      />
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 100, damping: 15 }}
          className="w-full max-w-md shimmer-border theme-card bg-card p-0"
        >
          <div className="text-center p-6 pb-0">
            <div className="flex justify-center mb-6">
              <img 
                src={logoImg} 
                alt="CheckByAi.net Logo - AI-powered Certificate of Sponsorship Verification" 
                className="h-16 w-auto sm:h-20"
                width={250}
                height={80}
                loading="eager"
              />
            </div>
            <div className="flex justify-center mt-2 mb-2">
              <BrandLogo size="lg" variant="auto" />
            </div>
            <p className="text-muted-foreground mt-2 text-sm">
              {step === "email" 
                ? "Enter your email to receive a verification code" 
                : "Enter the 6-digit code sent to your email"}
            </p>
          </div>
          <div className="p-6 space-y-6">
            <AnimatePresence mode="wait">
              {step === "email" ? (
                <motion.div
                  key="email-step"
                  initial={fadeUp.initial}
                  animate={fadeUp.animate}
                  exit={fadeUp.exit}
                  transition={fadeUp.transition}
                >
                  <form onSubmit={handleSendOTP} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email address</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="email"
                          type="email"
                          placeholder="you@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          className="pl-10 rounded-xl"
                          data-testid="input-email"
                        />
                      </div>
                    </div>

                    {TURNSTILE_SITE_KEY && (
                      <div className="flex justify-center">
                        <Turnstile
                          ref={turnstileRef}
                          siteKey={TURNSTILE_SITE_KEY}
                          onSuccess={setTurnstileToken}
                          onExpire={() => setTurnstileToken(null)}
                          onError={() => setTurnstileToken(null)}
                          options={{ theme: "auto" }}
                        />
                      </div>
                    )}

                    <Button 
                      type="submit" 
                      className="w-full bg-primary text-primary-foreground hover:bg-primary/90 rounded-full font-semibold" 
                      disabled={isLoading || (!!TURNSTILE_SITE_KEY && !turnstileToken)}
                      data-testid="button-send-otp"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Sending code...
                        </>
                      ) : (
                        <>
                          <Mail className="mr-2 h-4 w-4" />
                          Send Verification Code
                        </>
                      )}
                    </Button>
                  </form>
                </motion.div>
              ) : (
                <motion.div
                  key="otp-step"
                  initial={fadeUp.initial}
                  animate={fadeUp.animate}
                  exit={fadeUp.exit}
                  transition={fadeUp.transition}
                >
                  <form onSubmit={handleVerifyOTP} className="space-y-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                    <img src={logoImg} alt="CheckByAi" className="h-12 w-auto mb-6 object-contain" />
                      <span>Code sent to <strong className="text-foreground">{email}</strong></span>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="otp-0">Verification Code</Label>
                      <OTPBoxes value={otpCode} onChange={setOtpCode} />
                    </div>

                    <Button 
                      type="submit" 
                      className="w-full bg-primary text-primary-foreground hover:bg-primary/90 rounded-full font-semibold" 
                      disabled={isLoading || otpCode.length !== 6}
                      data-testid="button-verify-otp"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Verifying...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="mr-2 h-4 w-4" />
                          Verify &amp; Login
                        </>
                      )}
                    </Button>

                    <div className="flex items-center justify-between text-sm">
                      <button 
                        type="button"
                        onClick={() => {
                          setStep("email");
                          setOtpCode("");
                        }}
                        className="text-muted-foreground hover:text-foreground flex items-center gap-1"
                        data-testid="button-back-to-email"
                      >
                        <ArrowLeft className="h-3 w-3" />
                        Change email
                      </button>
                      <button 
                        type="button"
                        onClick={handleResendCode}
                        disabled={isLoading}
                        className="text-muted-foreground hover:text-foreground"
                        data-testid="button-resend-code"
                      >
                        Resend code
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>

            <p className="text-xs text-center text-muted-foreground">
              By continuing, you agree to our Terms of Service and Privacy Policy
            </p>
          </div>
        </motion.div>
      </div>
    </PageLayout>
  );
}
