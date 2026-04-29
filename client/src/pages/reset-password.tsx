import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useLocation } from "wouter";
import { Shield, ArrowLeft, Eye, EyeOff, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import PasswordStrengthMeter from "@/components/password-strength-meter";

export default function ResetPassword() {
  const [formData, setFormData] = useState({ password: "", confirmPassword: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isPasswordValid, setIsPasswordValid] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [resetComplete, setResetComplete] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    const tokenParam = new URLSearchParams(window.location.search).get("token");
    if (!tokenParam) {
      toast({ title: "Invalid reset link", description: "This password reset link is invalid or expired.", variant: "destructive" });
      navigate("/forgot-password");
    } else {
      setToken(tokenParam);
    }
  }, [navigate, toast]);

  const resetPasswordMutation = useMutation({
    mutationFn: async (data: { token: string; password: string }) => {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to reset password");
      }
      return response.json();
    },
    onSuccess: () => {
      setResetComplete(true);
      toast({ title: "Password reset successful!", description: "Your password has been updated. You can now log in." });
    },
    onError: (error: Error) => {
      toast({ title: "Reset failed", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    if (!formData.password) newErrors.password = "Password is required";
    else if (!isPasswordValid) newErrors.password = "Password does not meet security requirements";
    if (!formData.confirmPassword) newErrors.confirmPassword = "Please confirm your password";
    else if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = "Passwords do not match";
    setErrors(newErrors);
    if (Object.keys(newErrors).length === 0 && token) resetPasswordMutation.mutate({ token, password: formData.password });
  };

  const inputClass = (field: string) =>
    `bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-500 focus:border-[#f97316] focus:ring-0 ${errors[field] ? "border-red-500" : ""}`;

  if (resetComplete) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-lg p-8 text-center space-y-6">
          <div className="space-y-3">
            <div className="mx-auto w-12 h-12 bg-green-900/40 border border-green-700/50 rounded-full flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold text-white">Password Reset Complete</h2>
            <p className="text-sm text-neutral-400">Your password has been successfully updated.</p>
          </div>
          <Link href="/login">
            <Button className="w-full bg-[#f97316] hover:bg-[#ea580c] text-white rounded-none h-11 border-0">
              Continue to Login
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-lg p-8 space-y-6">
        <div className="text-center space-y-3">
          <div className="mx-auto w-12 h-12 bg-[#f97316]/10 border border-[#f97316]/30 rounded-full flex items-center justify-center">
            <Shield className="h-6 w-6 text-[#f97316]" />
          </div>
          <h2 className="text-2xl font-bold text-white">Create New Password</h2>
          <p className="text-sm text-neutral-400">Enter your new password below to complete the reset process.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password" className="text-white text-sm font-medium">New Password</Label>
            <div className="relative">
              <Input id="password" type={showPassword ? "text" : "password"} placeholder="Enter your new password"
                value={formData.password}
                onChange={(e) => { setFormData(p => ({ ...p, password: e.target.value })); if (errors.password) setErrors(p => ({ ...p, password: "" })); }}
                className={inputClass("password") + " pr-10"}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition-colors">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <p className="text-sm text-red-500">{errors.password}</p>}
            <PasswordStrengthMeter password={formData.password} onStrengthChange={(_, isValid) => setIsPasswordValid(isValid)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-white text-sm font-medium">Confirm New Password</Label>
            <div className="relative">
              <Input id="confirmPassword" type={showConfirmPassword ? "text" : "password"} placeholder="Confirm your new password"
                value={formData.confirmPassword}
                onChange={(e) => { setFormData(p => ({ ...p, confirmPassword: e.target.value })); if (errors.confirmPassword) setErrors(p => ({ ...p, confirmPassword: "" })); }}
                className={inputClass("confirmPassword") + " pr-10"}
              />
              <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition-colors">
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.confirmPassword && <p className="text-sm text-red-500">{errors.confirmPassword}</p>}
          </div>

          <Button type="submit"
            className="w-full bg-[#f97316] hover:bg-[#ea580c] text-white font-semibold rounded-none h-11 border-0"
            disabled={resetPasswordMutation.isPending}
          >
            {resetPasswordMutation.isPending ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                <span>Updating...</span>
              </div>
            ) : "Update Password"}
          </Button>
        </form>

        <div className="text-center">
          <Link href="/login" className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-300 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
