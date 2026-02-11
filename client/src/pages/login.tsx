import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, KeyRound, ArrowLeft, CheckCircle } from "lucide-react";
import PageLayout from "@/components/PageLayout";
import SEOHead from "@/components/SEOHead";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [isLoading, setIsLoading] = useState(false);

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

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/email/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
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
      
      setLocation("/dashboard");
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-slate-900 to-gray-800 p-4">
        <Card className="w-full max-w-md shadow-2xl border-gray-700">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-6">
              <img 
                src="/checkbyai-logo.png" 
                alt="CheckByAi.net Logo - AI-powered Certificate of Sponsorship Verification" 
                className="h-16 w-auto sm:h-20"
                width="80"
                height="80"
                loading="eager"
              />
            </div>
            <CardTitle className="text-2xl font-bold">Welcome to Check By AI</CardTitle>
            <CardDescription>
              {step === "email" 
                ? "Enter your email to receive a verification code" 
                : "Enter the 6-digit code sent to your email"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {step === "email" ? (
              <form onSubmit={handleSendOTP} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="pl-10"
                      data-testid="input-email"
                    />
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold shadow-lg" 
                  disabled={isLoading}
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
            ) : (
              <form onSubmit={handleVerifyOTP} className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Code sent to <strong className="text-white">{email}</strong></span>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="otp">Verification Code</Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="otp"
                      type="text"
                      placeholder="123456"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      required
                      maxLength={6}
                      className="pl-10 text-center text-2xl tracking-widest font-mono"
                      data-testid="input-otp"
                    />
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold shadow-lg" 
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
                      Verify & Login
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
                    className="text-gray-400 hover:text-white flex items-center gap-1"
                    data-testid="button-back-to-email"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    Change email
                  </button>
                  <button 
                    type="button"
                    onClick={handleResendCode}
                    disabled={isLoading}
                    className="text-blue-400 hover:text-blue-300"
                    data-testid="button-resend-code"
                  >
                    Resend code
                  </button>
                </div>
              </form>
            )}

            <p className="text-xs text-center text-gray-500">
              By continuing, you agree to our Terms of Service and Privacy Policy
            </p>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
