import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { RefreshCw, Shield, TrendingUp, Users, Lock, UserPlus, Calendar, Mail, Gavel, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { Loan, User, Dispute, DisputeDecision } from "@shared/schema";
import { DECISION_LABELS } from "@shared/schema";
import BitcoinPriceOracle from "@/components/bitcoin-price-oracle";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useNetworkExplorer } from "@/hooks/useNetworkExplorer";

interface AdminStats {
  totalLoans: number;
  activeLoans: number;
  totalVolume: number;
  averageLtv: number;
}

interface LoanWithLtv extends Loan {
  currentLtv?: number;
  ltvStatus?: "healthy" | "warning" | "critical";
  collateralReleaseTxid?: string | null;
}

interface LoanWithDispute extends Loan {
  dispute?: Dispute;
}

interface ResolveDisputeResult {
  success: boolean;
  txid?: string;
  decision: DisputeDecision;
  error?: string;
  auditLogId?: number;
}

interface SplitCalculation {
  totalCollateralSats: number;
  lenderPayoutSats: number;
  borrowerPayoutSats: number;
  networkFeeSats: number;
  feeRateSatVb: number;
  feeSource: 'api' | 'fallback';
  feePriority: string;
  estimatedVbytes: number;
  btcPriceEur: number;
  btcPriceUsd: number;
  debtEur: number;
  collateralValueEur: number;
  isUnderwaterLoan: boolean;
  lenderReceivesFullCollateral: boolean;
  priceTimestamp: string;
}

interface SplitPreview {
  success: boolean;
  loanId: number;
  borrowerAddress: string;
  lenderAddress: string;
  calculation: SplitCalculation;
  summary: string;
}

interface FairSplitResult {
  success: boolean;
  decision: DisputeDecision;
  calculation: SplitCalculation;
  lenderAddress: string;
  borrowerAddress: string;
  message: string;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case "posted":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    case "funding":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    case "initiated":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "active":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200";
    case "repaid":
      return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    case "defaulted":
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
  }
};

function ExplorerAddressLink({ address }: { address: string }) {
  const [explorerUrl, setExplorerUrl] = useState<string>('');
  const { getAddressUrl } = useNetworkExplorer();

  useEffect(() => {
    if (address) {
      getAddressUrl(address).then(setExplorerUrl);
    }
  }, [address, getAddressUrl]);

  return (
    <a 
      href={explorerUrl || '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
    >
      🔍 View on Blockchain
    </a>
  );
}

const getLtvColor = (ltvStatus: string) => {
  switch (ltvStatus) {
    case "healthy":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "warning":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    case "critical":
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
  }
};

export default function AdminDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [otpCode, setOtpCode] = useState("");

  const { data: adminStats, isLoading: statsLoading, refetch: refetchStats } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
    refetchInterval: 30000, // Refresh every 30 seconds
    enabled: isAuthenticated, // Only fetch when authenticated
  });

  const { data: loans, isLoading: loansLoading, refetch: refetchLoans } = useQuery<LoanWithLtv[]>({
    queryKey: ["/api/admin/loans"],
    refetchInterval: 30000, // Refresh every 30 seconds
    enabled: isAuthenticated, // Only fetch when authenticated
  });

  const { data: users, isLoading: usersLoading, refetch: refetchUsers } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    refetchInterval: 30000, // Refresh every 30 seconds
    enabled: isAuthenticated, // Only fetch when authenticated
  });

  const { data: btcPrice, refetch: refetchBtcPrice } = useQuery({
    queryKey: ["/api/btc-price"],
    refetchInterval: 30000,
    enabled: isAuthenticated,
  });

  const { data: disputes, isLoading: disputesLoading, refetch: refetchDisputes } = useQuery<LoanWithDispute[]>({
    queryKey: ["/api/admin/disputes"],
    refetchInterval: 30000,
    enabled: isAuthenticated,
  });

  const { toast } = useToast();
  const [resolvingLoanId, setResolvingLoanId] = useState<number | null>(null);
  const [splitPreview, setSplitPreview] = useState<SplitPreview | null>(null);
  const [previewingLoanId, setPreviewingLoanId] = useState<number | null>(null);

  // Refetch all admin data when authentication state changes to true
  useEffect(() => {
    if (isAuthenticated) {
      refetchStats();
      refetchLoans();
      refetchUsers();
      refetchBtcPrice();
      refetchDisputes();
    }
  }, [isAuthenticated]);

  const resolveDisputeMutation = useMutation({
    mutationFn: async ({ loanId, decision }: { loanId: number; decision: DisputeDecision }): Promise<ResolveDisputeResult> => {
      const response = await apiRequest(`/api/admin/disputes/${loanId}/resolve`, "POST", { decision });
      return response.json();
    },
    onSuccess: (data: ResolveDisputeResult) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/disputes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/loans"] });
      setResolvingLoanId(null);
      toast({
        title: data.success ? "✅ Dispute Resolved" : "⚠️ Broadcast Failed",
        description: data.success 
          ? `Decision: ${data.decision}. TXID: ${data.txid?.substring(0, 16)}...`
          : `Decision recorded. Error: ${data.error}`,
        variant: data.success ? "default" : "destructive",
      });
    },
    onError: (error: any) => {
      setResolvingLoanId(null);
      toast({
        title: "❌ Resolution Failed",
        description: error.message || "Failed to resolve dispute",
        variant: "destructive",
      });
    },
  });

  const setUnderReviewMutation = useMutation({
    mutationFn: async (loanId: number) => {
      return await apiRequest(`/api/admin/disputes/${loanId}/set-under-review`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/disputes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/loans"] });
      toast({
        title: "✅ Loan Set Under Review",
        description: "Loan is now ready for dispute resolution",
      });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Failed",
        description: error.message || "Failed to set loan under review",
        variant: "destructive",
      });
    },
  });

  const fetchSplitPreview = async (loanId: number) => {
    setPreviewingLoanId(loanId);
    try {
      const response = await apiRequest(`/api/admin/disputes/${loanId}/preview-split`, "GET");
      const data = await response.json();
      setSplitPreview(data);
    } catch (error: any) {
      toast({
        title: "❌ Failed to load split preview",
        description: error.message || "Could not calculate fair split",
        variant: "destructive",
      });
    }
    setPreviewingLoanId(null);
  };

  const fairSplitMutation = useMutation({
    mutationFn: async ({ loanId, decision }: { loanId: number; decision: DisputeDecision }): Promise<FairSplitResult> => {
      const response = await apiRequest(`/api/admin/disputes/${loanId}/resolve-fair-split`, "POST", { decision });
      return response.json();
    },
    onSuccess: (data: FairSplitResult) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/disputes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/loans"] });
      setSplitPreview(null);
      toast({
        title: "✅ Fair Split Resolved",
        description: data.message,
      });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Resolution Failed",
        description: error.message || "Failed to resolve with fair split",
        variant: "destructive",
      });
    },
  });

  const retryCollateralReleaseMutation = useMutation({
    mutationFn: async (loanId: number) => {
      const response = await apiRequest(`/api/admin/loans/${loanId}/retry-collateral-release`, "POST");
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/loans"] });
      toast({
        title: data.success ? "✅ Collateral Released" : "⚠️ Release Failed",
        description: data.success 
          ? `Sent to ${data.borrowerAddress?.substring(0, 20)}... TXID: ${data.txid?.substring(0, 16)}...`
          : data.message || "Failed to release collateral",
        variant: data.success ? "default" : "destructive",
      });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Collateral Release Failed",
        description: error.message || "Failed to release collateral",
        variant: "destructive",
      });
    },
  });

  const confirmBtcDepositMutation = useMutation({
    mutationFn: async (loanId: number) => {
      return await apiRequest(`/api/admin/loans/${loanId}/confirm-btc-deposit`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/loans"] });
      toast({
        title: "✅ BTC Deposit Confirmed",
        description: "Lender has been notified to transfer funds to borrower's bank account",
      });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Confirmation Failed",
        description: error.message || "Failed to confirm BTC deposit",
        variant: "destructive",
      });
    },
  });

  const handleRefresh = () => {
    refetchLoans();
    refetchUsers();
    refetchDisputes();
  };

  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setAuthError("");
    
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminEmail, password: adminPassword }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        setAuthError(data.message || "Login failed. Please check your credentials.");
        setIsLoggingIn(false);
        return;
      }
      
      // Check if OTP verification is required (admin login)
      if (data.requiresOtp) {
        setShowOtpInput(true);
        toast({
          title: "Verification Code Sent",
          description: "Check your email for the 6-digit login code.",
        });
        setIsLoggingIn(false);
        return;
      }
      
      // Check if user has admin role
      if (data.user?.role !== "admin") {
        setAuthError("Access denied. Admin privileges required.");
        setIsLoggingIn(false);
        return;
      }
      
      // Store the JWT token for API requests
      localStorage.setItem("auth_token", data.token);
      // Set authenticated so UI shows dashboard - useEffect will trigger refetches
      setIsAuthenticated(true);
    } catch (error: any) {
      setAuthError(error.message || "Login failed. Please try again.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setAuthError("");
    
    try {
      const response = await fetch("/api/auth/admin-verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminEmail, otpCode }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        setAuthError(data.message || "Verification failed. Please try again.");
        setIsLoggingIn(false);
        return;
      }
      
      // Store the JWT token for API requests
      localStorage.setItem("auth_token", data.token);
      // Set authenticated so UI shows dashboard
      setIsAuthenticated(true);
      toast({
        title: "Welcome, Admin!",
        description: "You have successfully logged in.",
      });
    } catch (error: any) {
      setAuthError(error.message || "Verification failed. Please try again.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleBackToLogin = () => {
    setShowOtpInput(false);
    setOtpCode("");
    setAuthError("");
  };
  
  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    setIsAuthenticated(false);
    setAdminEmail("");
    setAdminPassword("");
  };

  // Show OTP verification form
  if (!isAuthenticated && showOtpInput) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-md mx-auto mt-20">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Admin Verification
              </CardTitle>
              <CardDescription>
                Enter the 6-digit verification code sent to {adminEmail}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleOtpVerify} className="space-y-4">
                <div>
                  <Input
                    type="text"
                    placeholder="Enter 6-digit code"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full text-center text-2xl tracking-widest"
                    maxLength={6}
                    required
                  />
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  The code expires in 5 minutes
                </p>
                {authError && (
                  <p className="text-sm text-red-600 dark:text-red-400">{authError}</p>
                )}
                <Button type="submit" className="w-full" disabled={isLoggingIn || otpCode.length !== 6}>
                  {isLoggingIn ? "Verifying..." : "Verify & Login"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={handleBackToLogin}
                >
                  Back to Login
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Show login form if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-md mx-auto mt-20">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Admin Access Required
              </CardTitle>
              <CardDescription>
                Enter your admin credentials to access the dashboard
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <Input
                    type="email"
                    placeholder="Admin email address"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    className="w-full"
                    required
                  />
                </div>
                <div>
                  <Input
                    type="password"
                    placeholder="Admin password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="w-full"
                    required
                  />
                </div>
                <div className="text-right">
                  <Link href="/forgot-password" className="text-sm text-primary hover:underline">
                    Forgot your password?
                  </Link>
                </div>
                {authError && (
                  <p className="text-sm text-red-600 dark:text-red-400">{authError}</p>
                )}
                <Button type="submit" className="w-full" disabled={isLoggingIn}>
                  {isLoggingIn ? "Logging in..." : "Access Dashboard"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (statsLoading || loansLoading || usersLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Admin Dashboard</h1>
            <p className="text-muted-foreground">Monitor active loans and platform metrics</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-3">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
        
        <div className="h-64 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8 text-primary" />
            Admin Dashboard
          </h1>
          <p className="text-muted-foreground">Monitor active loans and platform metrics</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleRefresh} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button 
            onClick={handleLogout} 
            variant="destructive" 
            className="gap-2"
          >
            <Lock className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Total Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Registered users</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email Verified
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {users?.filter(user => user.emailVerified).length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {users?.filter(user => !user.emailVerified).length || 0} pending
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Total Loans
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{adminStats?.totalLoans || 0}</div>
            <p className="text-xs text-muted-foreground">All-time loans</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Active Loans
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{adminStats?.activeLoans || 0}</div>
            <p className="text-xs text-muted-foreground">Currently active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Volume</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(adminStats?.totalVolume || 0)}</div>
            <p className="text-xs text-muted-foreground">USD equivalent</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Average LTV</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{adminStats?.averageLtv?.toFixed(1) || 0}%</div>
            <p className="text-xs text-muted-foreground">Across active loans</p>
          </CardContent>
        </Card>
      </div>

      {/* Bitcoin Price Oracle */}
      <div className="mb-8">
        <BitcoinPriceOracle variant="compact" showSource={false} />
      </div>

      {/* Tabbed Interface for Loans and Users */}
      <Tabs defaultValue="escrow" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="escrow">Pending Escrow</TabsTrigger>
          <TabsTrigger value="disputes" data-testid="tab-disputes">
            <Gavel className="h-4 w-4 mr-1" />
            Disputes
            {disputes && disputes.length > 0 && (
              <Badge className="ml-2 bg-red-500 text-white">{disputes.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="loans">All Loans</TabsTrigger>
          <TabsTrigger value="users">Users Management</TabsTrigger>
        </TabsList>
        
        <TabsContent value="escrow" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pending Escrow Verification</CardTitle>
              <CardDescription>
                Loans awaiting BTC deposit confirmation - verify on blockchain before proceeding
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Loan ID</TableHead>
                      <TableHead>Borrower</TableHead>
                      <TableHead>Lender</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Collateral (BTC)</TableHead>
                      <TableHead>Escrow Address</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loans?.filter(loan => loan.status === "funding").map((loan) => (
                      <TableRow key={loan.id}>
                        <TableCell className="font-medium">#{loan.id}</TableCell>
                        <TableCell>{loan.borrowerId}</TableCell>
                        <TableCell>{loan.lenderId}</TableCell>
                        <TableCell>{formatCurrency(Number(loan.amount))} {loan.currency}</TableCell>
                        <TableCell>{Number(loan.collateralBtc).toFixed(4)} BTC</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                              {loan.escrowAddress?.substring(0, 12)}...{loan.escrowAddress?.substring(loan.escrowAddress.length - 6)}
                            </code>
                            {loan.escrowAddress && (
                              <ExplorerAddressLink address={loan.escrowAddress} />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button 
                            size="sm"
                            data-testid={`button-confirm-btc-deposit-${loan.id}`}
                            className="bg-gradient-to-r from-yellow-500 to-blue-500 hover:from-yellow-600 hover:to-blue-600 text-white"
                            onClick={() => confirmBtcDepositMutation.mutate(loan.id)}
                            disabled={confirmBtcDepositMutation.isPending}
                          >
                            {confirmBtcDepositMutation.isPending ? "Confirming..." : "✓ Confirm BTC Deposit"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              {loans?.filter(loan => loan.status === "funding").length === 0 && (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No loans pending BTC verification</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="disputes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gavel className="h-5 w-5" />
                Fair Split Dispute Resolution
              </CardTitle>
              <CardDescription>
                Resolve disputes with fair collateral distribution. Lender receives principal + interest, borrower receives remaining collateral.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Loan ID</TableHead>
                      <TableHead>Borrower</TableHead>
                      <TableHead>Lender</TableHead>
                      <TableHead>Debt (P+I)</TableHead>
                      <TableHead>Collateral</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {disputes?.map((loan) => {
                      const principal = Number(loan.amount);
                      const interestRate = Number(loan.interestRate || 0);
                      const termMonths = Number(loan.termMonths || 3);
                      const interest = principal * (interestRate / 100) * (termMonths / 12);
                      const totalDebt = principal + interest;
                      
                      return (
                        <TableRow key={loan.id}>
                          <TableCell className="font-medium">#{loan.id}</TableCell>
                          <TableCell>{loan.borrowerId}</TableCell>
                          <TableCell>{loan.lenderId || "N/A"}</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>{formatCurrency(totalDebt)} EUR</div>
                              <div className="text-xs text-muted-foreground">
                                P: {formatCurrency(principal)} + I: {formatCurrency(interest)}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{Number(loan.collateralBtc).toFixed(4)} BTC</TableCell>
                          <TableCell>
                            <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                              {loan.dispute?.disputeType || "under_review"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2 flex-wrap">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => fetchSplitPreview(loan.id)}
                                disabled={previewingLoanId === loan.id}
                                data-testid={`button-preview-split-${loan.id}`}
                              >
                                {previewingLoanId === loan.id ? "Loading..." : "📊 Preview Split"}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              
              {/* Split Preview Panel */}
              {splitPreview && (
                <div className="mt-6 p-4 border rounded-lg bg-gradient-to-r from-blue-50 to-green-50 dark:from-blue-950 dark:to-green-950">
                  <h3 className="font-semibold text-lg mb-2">Fair Split Preview - Loan #{splitPreview.loanId}</h3>
                  
                  <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-300 dark:border-amber-700">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <p className="text-xs font-medium text-amber-700 dark:text-amber-300 uppercase tracking-wide">Price Oracle (CoinGecko)</p>
                        <p className="text-lg font-bold text-amber-900 dark:text-amber-100">
                          1 BTC = €{splitPreview.calculation.btcPriceEur.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR / ${splitPreview.calculation.btcPriceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                        </p>
                      </div>
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        {splitPreview.calculation.priceTimestamp ? new Date(splitPreview.calculation.priceTimestamp).toLocaleString() : 'N/A'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                      <p className="text-sm text-muted-foreground">Total Collateral</p>
                      <p className="text-xl font-bold">{(splitPreview.calculation.totalCollateralSats / 100_000_000).toFixed(8)} BTC</p>
                      <p className="text-sm text-muted-foreground">≈ €{splitPreview.calculation.collateralValueEur.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR</p>
                    </div>
                    <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                      <p className="text-sm text-muted-foreground">Debt Owed (P+I)</p>
                      <p className="text-xl font-bold">{formatCurrency(splitPreview.calculation.debtEur)} EUR</p>
                      <p className="text-sm text-muted-foreground">= {(splitPreview.calculation.debtEur / splitPreview.calculation.btcPriceEur).toFixed(8)} BTC</p>
                    </div>
                    <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                      <p className="text-sm text-muted-foreground">Network Fee (to miners, est.)</p>
                      <p className="text-xl font-bold">{splitPreview.calculation.networkFeeSats.toLocaleString()} sats</p>
                      <p className="text-sm text-muted-foreground">≈ €{(splitPreview.calculation.networkFeeSats / 100_000_000 * splitPreview.calculation.btcPriceEur).toFixed(2)} EUR</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {splitPreview.calculation.feeRateSatVb} sat/vB × {splitPreview.calculation.estimatedVbytes} vB
                        {splitPreview.calculation.feeSource === 'api' ? (
                          <span className="ml-1 text-green-600 dark:text-green-400">(live from mempool.space)</span>
                        ) : (
                          <span className="ml-1 text-amber-600 dark:text-amber-400">(fallback estimate)</span>
                        )}
                      </p>
                    </div>
                  </div>
                  
                  {splitPreview.calculation.isUnderwaterLoan && (
                    <div className="mb-4 p-3 bg-red-100 dark:bg-red-900 rounded-lg">
                      <p className="text-red-800 dark:text-red-200 font-medium">
                        ⚠️ Underwater Loan: Collateral value is less than debt. Lender receives full collateral.
                      </p>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="p-4 bg-blue-100 dark:bg-blue-900 rounded-lg border-2 border-blue-300 dark:border-blue-700">
                      <p className="text-sm font-medium text-blue-800 dark:text-blue-200">💰 Lender Receives</p>
                      <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                        {(splitPreview.calculation.lenderPayoutSats / 100_000_000).toFixed(8)} BTC
                      </p>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        ({splitPreview.calculation.lenderPayoutSats.toLocaleString()} sats)
                      </p>
                      <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mt-1">
                        ≈ €{(splitPreview.calculation.lenderPayoutSats / 100_000_000 * splitPreview.calculation.btcPriceEur).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        To: {splitPreview.lenderAddress?.substring(0, 20)}...
                      </p>
                    </div>
                    <div className="p-4 bg-green-100 dark:bg-green-900 rounded-lg border-2 border-green-300 dark:border-green-700">
                      <p className="text-sm font-medium text-green-800 dark:text-green-200">✅ Borrower Receives</p>
                      <p className="text-2xl font-bold text-green-900 dark:text-green-100">
                        {(splitPreview.calculation.borrowerPayoutSats / 100_000_000).toFixed(8)} BTC
                      </p>
                      <p className="text-sm text-green-700 dark:text-green-300">
                        ({splitPreview.calculation.borrowerPayoutSats.toLocaleString()} sats)
                      </p>
                      <p className="text-sm font-medium text-green-800 dark:text-green-200 mt-1">
                        ≈ €{(splitPreview.calculation.borrowerPayoutSats / 100_000_000 * splitPreview.calculation.btcPriceEur).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        To: {splitPreview.borrowerAddress?.substring(0, 20)}...
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 flex-wrap">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          className="bg-red-600 hover:bg-red-700"
                          data-testid={`button-fair-split-defaulted-${splitPreview.loanId}`}
                        >
                          ⚠️ Borrower Defaulted (Fair Split)
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Confirm Fair Split - Borrower Defaulted</AlertDialogTitle>
                          <AlertDialogDescription>
                            <div className="space-y-2">
                              <p>Lender receives: <strong>{(splitPreview.calculation.lenderPayoutSats / 100_000_000).toFixed(8)} BTC</strong> (debt repayment)</p>
                              <p>Borrower receives: <strong>{(splitPreview.calculation.borrowerPayoutSats / 100_000_000).toFixed(8)} BTC</strong> (remaining collateral)</p>
                              <p className="text-red-600 font-medium mt-2">This action cannot be undone.</p>
                            </div>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => fairSplitMutation.mutate({ loanId: splitPreview.loanId, decision: 'BORROWER_DEFAULTED' })}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Confirm Fair Split
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          className="bg-green-600 hover:bg-green-700"
                          data-testid={`button-fair-split-not-defaulted-${splitPreview.loanId}`}
                        >
                          ✅ Borrower Not Defaulted (Full Refund)
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Confirm Full Refund - Borrower Not Defaulted</AlertDialogTitle>
                          <AlertDialogDescription>
                            <div className="space-y-2">
                              <p>Borrower receives: <strong>100% of collateral</strong> (minus network fee)</p>
                              <p>Lender receives: <strong>0 BTC</strong></p>
                              <p className="text-red-600 font-medium mt-2">This action cannot be undone.</p>
                            </div>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => fairSplitMutation.mutate({ loanId: splitPreview.loanId, decision: 'BORROWER_NOT_DEFAULTED' })}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            Confirm Borrower Refund
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    
                    <Button 
                      variant="outline" 
                      onClick={() => setSplitPreview(null)}
                    >
                      Close Preview
                    </Button>
                  </div>
                </div>
              )}
              
              {(!disputes || disputes.length === 0) && (
                <div className="text-center py-8">
                  <Gavel className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No disputes currently under review</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Disputes will appear here when loans are flagged for resolution.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Testing section - Set loans under review */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Testing: Set Loan Under Review</CardTitle>
              <CardDescription>For testing purposes, set an active loan to under_review status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {loans?.filter(l => l.status === "active" && l.disputeStatus !== "under_review").slice(0, 3).map((loan) => (
                  <Button
                    key={loan.id}
                    size="sm"
                    variant="outline"
                    data-testid={`button-set-under-review-${loan.id}`}
                    onClick={() => setUnderReviewMutation.mutate(loan.id)}
                    disabled={setUnderReviewMutation.isPending}
                  >
                    Set Loan #{loan.id} Under Review
                  </Button>
                ))}
                {(!loans || loans.filter(l => l.status === "active" && l.disputeStatus !== "under_review").length === 0) && (
                  <p className="text-sm text-muted-foreground">No eligible loans to set under review</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="loans" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Loans Monitor</CardTitle>
              <CardDescription>
                Real-time monitoring of loan status and LTV ratios
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Loan ID</TableHead>
                      <TableHead>Borrower</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Collateral (BTC)</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Current LTV</TableHead>
                      <TableHead>Interest Rate</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loans?.map((loan) => (
                      <TableRow key={loan.id}>
                        <TableCell className="font-medium">#{loan.id}</TableCell>
                        <TableCell>{loan.borrowerId}</TableCell>
                        <TableCell>{formatCurrency(Number(loan.amount))}</TableCell>
                        <TableCell>{Number(loan.collateralBtc).toFixed(4)} BTC</TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(loan.status)}>
                            {loan.status.charAt(0).toUpperCase() + loan.status.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {loan.status === "initiated" || loan.status === "active" ? (
                            <div className="flex items-center gap-2">
                              <Badge className={getLtvColor(loan.ltvStatus || "healthy")}>
                                {loan.currentLtv?.toFixed(1) || 0}%
                              </Badge>
                              {loan.ltvStatus === "critical" && (
                                <span className="text-xs text-red-600 dark:text-red-400">
                                  ⚠️ Risk
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-500">N/A</span>
                          )}
                        </TableCell>
                        <TableCell>{loan.interestRate}%</TableCell>
                        <TableCell>
                          {new Date(loan.requestedAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {loan.status === "completed" && !loan.collateralReleaseTxid && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-orange-600 border-orange-600 hover:bg-orange-50"
                              onClick={() => retryCollateralReleaseMutation.mutate(loan.id)}
                              disabled={retryCollateralReleaseMutation.isPending}
                              data-testid={`button-retry-release-${loan.id}`}
                            >
                              {retryCollateralReleaseMutation.isPending ? (
                                <RefreshCw className="h-4 w-4 animate-spin mr-1" />
                              ) : (
                                <Lock className="h-4 w-4 mr-1" />
                              )}
                              Retry Release
                            </Button>
                          )}
                          {loan.status === "completed" && loan.collateralReleaseTxid && (
                            <Badge className="bg-green-100 text-green-800">
                              Released
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              {loans?.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No active loans to display</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User Registrations</CardTitle>
              <CardDescription>
                Track user registrations and monitor platform growth
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User ID</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Email Status</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Registered</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users?.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">#{user.id}</TableCell>
                        <TableCell>{user.username}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Badge className={user.emailVerified 
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" 
                            : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                          }>
                            {user.emailVerified ? "✅ Verified" : "❌ Pending"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={user.role === "lender" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"}>
                            {user.role?.charAt(0).toUpperCase() + user.role?.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {new Date(user.createdAt).toLocaleDateString()}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              {users?.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No users registered yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}