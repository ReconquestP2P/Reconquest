import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "wouter";
import { Mail, ArrowLeft, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const resetPasswordMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to send reset email");
      }
      return response.json();
    },
    onSuccess: () => {
      setEmailSent(true);
      toast({ title: "Reset email sent!", description: "Check your email for password reset instructions." });
    },
    onError: (error: Error) => {
      toast({ title: "Reset failed", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    if (!email) newErrors.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = "Please enter a valid email address";
    setErrors(newErrors);
    if (Object.keys(newErrors).length === 0) resetPasswordMutation.mutate(email);
  };

  if (emailSent) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-lg p-8 text-center space-y-6">
          <div className="space-y-3">
            <div className="mx-auto w-12 h-12 bg-green-900/40 border border-green-700/50 rounded-full flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold text-white">Check Your Email</h2>
            <p className="text-neutral-400 text-sm">
              We've sent password reset instructions to your email address.
            </p>
          </div>
          <p className="text-sm text-neutral-500">
            If you don't see the email, check your spam folder or try again.
          </p>
          <div className="space-y-2">
            <Button onClick={() => setEmailSent(false)} variant="outline"
              className="w-full rounded-none border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white bg-transparent">
              Send Another Email
            </Button>
            <Link href="/login" className="block">
              <Button variant="ghost" className="w-full rounded-none text-neutral-500 hover:text-white hover:bg-neutral-800">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Login
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-lg p-8 space-y-6">
        <div className="text-center space-y-3">
          <div className="mx-auto w-12 h-12 bg-[#f97316]/10 border border-[#f97316]/30 rounded-full flex items-center justify-center">
            <Mail className="h-6 w-6 text-[#f97316]" />
          </div>
          <h2 className="text-2xl font-bold text-white">Reset Your Password</h2>
          <p className="text-sm text-neutral-400">
            Enter your email address and we'll send you a link to reset your password.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-white text-sm font-medium">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="Enter your email address"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors({});
              }}
              className={`bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-500 focus:border-[#f97316] focus:ring-0 ${errors.email ? "border-red-500" : ""}`}
            />
            {errors.email && <p className="text-sm text-red-500">{errors.email}</p>}
          </div>

          <Button type="submit"
            className="w-full bg-[#f97316] hover:bg-[#ea580c] text-white font-semibold rounded-none h-11 border-0"
            disabled={resetPasswordMutation.isPending}
          >
            {resetPasswordMutation.isPending ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                <span>Sending...</span>
              </div>
            ) : "Send Reset Link"}
          </Button>
        </form>

        <div className="text-center space-y-2">
          <p className="text-sm text-neutral-400">
            Remember your password?{" "}
            <Link href="/login" className="text-[#f97316] hover:text-[#ea580c] font-medium transition-colors">
              Back to login
            </Link>
          </p>
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-300 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
