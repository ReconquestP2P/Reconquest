import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useLocation } from "wouter";
import { Shield, Mail, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

export default function Login() {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { login } = useAuth();

  const loginMutation = useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const result = await login(credentials.email, credentials.password);
      if (!result.success) throw new Error("Invalid credentials");
      return result;
    },
    onSuccess: (result) => {
      if (result.requiresOtp) {
        toast({ title: "Admin Login Required", description: "Please use the Admin Dashboard to log in with your admin account.", variant: "destructive" });
        navigate("/admin");
      } else {
        toast({ title: "Welcome back!", description: "You have successfully logged in." });
        navigate("/");
      }
    },
    onError: (error: Error) => {
      if (error.message.startsWith("EMAIL_VERIFICATION_REQUIRED:")) {
        toast({ title: "Email Verification Required", description: error.message.replace("EMAIL_VERIFICATION_REQUIRED: ", ""), variant: "destructive" });
      } else {
        toast({ title: "Login failed", description: error.message || "Invalid email or password. Please try again.", variant: "destructive" });
      }
    },
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.email) newErrors.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = "Please enter a valid email address";
    if (!formData.password) newErrors.password = "Password is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) loginMutation.mutate(formData);
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-lg p-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Shield className="h-6 w-6 text-[#f97316]" />
            <h1 className="text-2xl font-bold text-white">Welcome Back</h1>
          </div>
          <p className="text-sm text-neutral-400">
            Log in to your Reconquest account to access Bitcoin-backed lending
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email" className="flex items-center gap-2 text-white text-sm font-medium">
              <Mail className="h-4 w-4" />
              Email Address
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              value={formData.email}
              onChange={(e) => handleInputChange("email", e.target.value)}
              className={`bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-500 focus:border-[#f97316] focus:ring-0 ${errors.email ? "border-red-500" : ""}`}
            />
            {errors.email && <p className="text-sm text-red-500">{errors.email}</p>}
          </div>

          {/* Password */}
          <div className="space-y-2">
            <Label htmlFor="password" className="flex items-center gap-2 text-white text-sm font-medium">
              <Shield className="h-4 w-4" />
              Password
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={formData.password}
                onChange={(e) => handleInputChange("password", e.target.value)}
                className={`bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-500 focus:border-[#f97316] focus:ring-0 pr-10 ${errors.password ? "border-red-500" : ""}`}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition-colors"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <p className="text-sm text-red-500">{errors.password}</p>}
          </div>

          {/* Forgot password */}
          <div className="text-right">
            <Link href="/forgot-password" className="text-sm text-[#f97316] hover:text-[#ea580c] transition-colors">
              Forgot your password?
            </Link>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            className="w-full bg-[#f97316] hover:bg-[#ea580c] text-white font-semibold rounded-none h-11 border-0"
            disabled={loginMutation.isPending}
          >
            {loginMutation.isPending ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                <span>Logging in...</span>
              </div>
            ) : (
              "Log In"
            )}
          </Button>
        </form>

        {/* Footer */}
        <div className="text-center space-y-2">
          <p className="text-sm text-neutral-400">
            Don't have an account?{" "}
            <Link href="/signup" className="text-[#f97316] hover:text-[#ea580c] font-medium transition-colors">
              Sign up here
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
