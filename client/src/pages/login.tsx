import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, useLocation } from "wouter";
import { Shield, Mail, User, ArrowLeft, Eye, EyeOff, KeyRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

export default function Login() {
  const [formData, setFormData] = useState({
    email: "",
    password: ""
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { login, verifyAdminOtp } = useAuth();

  // Admin OTP state
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");

  const loginMutation = useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const result = await login(credentials.email, credentials.password);
      if (!result.success) {
        throw new Error('Invalid credentials');
      }
      return result;
    },
    onSuccess: (result) => {
      if (result.requiresOtp) {
        // Admin login - need OTP verification
        setAdminEmail(result.email || formData.email);
        setShowOtpInput(true);
        toast({
          title: "Verification Code Sent",
          description: "Check your email for the 6-digit login code.",
        });
      } else {
        // Normal login success
        toast({
          title: "Welcome back!",
          description: "You have successfully logged in.",
        });
        navigate("/");
      }
    },
    onError: (error: Error) => {
      if (error.message.startsWith('EMAIL_VERIFICATION_REQUIRED:')) {
        toast({
          title: "Email Verification Required",
          description: error.message.replace('EMAIL_VERIFICATION_REQUIRED: ', ''),
          variant: "destructive",
        });
      } else {
        toast({
          title: "Login failed",
          description: error.message || "Invalid email or password. Please try again.",
          variant: "destructive",
        });
      }
    },
  });

  const otpMutation = useMutation({
    mutationFn: async (data: { email: string; otpCode: string }) => {
      const success = await verifyAdminOtp(data.email, data.otpCode);
      if (!success) {
        throw new Error('Verification failed');
      }
      return success;
    },
    onSuccess: () => {
      toast({
        title: "Welcome, Admin!",
        description: "You have successfully logged in.",
      });
      navigate("/admin");
    },
    onError: (error: Error) => {
      toast({
        title: "Verification Failed",
        description: error.message || "Invalid or expired code. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.email) {
      newErrors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!formData.password) {
      newErrors.password = "Password is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      loginMutation.mutate(formData);
    }
  };

  const handleOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.length === 6) {
      otpMutation.mutate({ email: adminEmail, otpCode });
    } else {
      toast({
        title: "Invalid Code",
        description: "Please enter the 6-digit code from your email.",
        variant: "destructive",
      });
    }
  };

  const handleBackToLogin = () => {
    setShowOtpInput(false);
    setOtpCode("");
    setAdminEmail("");
  };

  // Show OTP verification form for admin
  if (showOtpInput) {
    return (
      <div className="min-h-screen bg-gradient-hero dark:bg-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold flex items-center justify-center gap-2">
              <KeyRound className="h-6 w-6 text-primary" />
              Admin Verification
            </CardTitle>
            <CardDescription>
              Enter the 6-digit code sent to your admin email
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleOtpSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="otpCode" className="flex items-center">
                  <Shield className="h-4 w-4 mr-2" />
                  Verification Code
                </Label>
                <Input
                  id="otpCode"
                  type="text"
                  placeholder="Enter 6-digit code"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="text-center text-2xl tracking-widest font-mono"
                  maxLength={6}
                  autoFocus
                />
                <p className="text-sm text-gray-500 text-center">
                  Code sent to {adminEmail}
                </p>
              </div>

              <Button 
                type="submit" 
                className="w-full bg-primary hover:bg-primary/90 text-black"
                disabled={otpMutation.isPending || otpCode.length !== 6}
              >
                {otpMutation.isPending ? (
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black"></div>
                    <span>Verifying...</span>
                  </div>
                ) : (
                  "Verify & Login"
                )}
              </Button>

              <p className="text-sm text-gray-500 text-center">
                Code expires in 5 minutes
              </p>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={handleBackToLogin}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Login
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-hero dark:bg-gray-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold flex items-center justify-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Welcome Back
          </CardTitle>
          <CardDescription>
            Log in to your Reconquest account to access Bitcoin-backed lending
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Field */}
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center">
                <Mail className="h-4 w-4 mr-2" />
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={formData.email}
                onChange={(e) => handleInputChange("email", e.target.value)}
                className={errors.email ? "border-red-500" : ""}
              />
              {errors.email && (
                <p className="text-sm text-red-600">{errors.email}</p>
              )}
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <Label htmlFor="password" className="flex items-center">
                <Shield className="h-4 w-4 mr-2" />
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={(e) => handleInputChange("password", e.target.value)}
                  className={errors.password ? "border-red-500 pr-10" : "pr-10"}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {errors.password && (
                <p className="text-sm text-red-600">{errors.password}</p>
              )}
            </div>

            {/* Forgot Password Link */}
            <div className="text-right">
              <Link href="/forgot-password" className="text-sm text-primary hover:underline">
                Forgot your password?
              </Link>
            </div>

            {/* Submit Button */}
            <Button 
              type="submit" 
              className="w-full bg-primary hover:bg-primary/90 text-black"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black"></div>
                  <span>Logging in...</span>
                </div>
              ) : (
                "Log In"
              )}
            </Button>
          </form>

          {/* Footer Links */}
          <div className="mt-6 text-center space-y-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Don't have an account?{" "}
              <Link href="/signup" className="text-primary hover:underline font-medium">
                Sign up here
              </Link>
            </p>
            <Link href="/" className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to homepage
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
