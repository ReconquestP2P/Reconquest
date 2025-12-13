import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
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

interface AdminStats {
  totalLoans: number;
  activeLoans: number;
  totalVolume: number;
  averageLtv: number;
}

interface LoanWithLtv extends Loan {
  currentLtv?: number;
  ltvStatus?: "healthy" | "warning" | "critical";
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
  
  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    setIsAuthenticated(false);
    setAdminEmail("");
    setAdminPassword("");
  };

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
                            <a 
                              href={`https://blockstream.info/testnet/address/${loan.escrowAddress}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              🔍 View on Blockchain
                            </a>
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
                Dispute Resolution
              </CardTitle>
              <CardDescription>
                Resolve disputes by selecting a deterministic outcome. Each decision maps to a pre-signed transaction.
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
                      <TableHead>Collateral</TableHead>
                      <TableHead>Dispute Type</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {disputes?.map((loan) => (
                      <TableRow key={loan.id}>
                        <TableCell className="font-medium">#{loan.id}</TableCell>
                        <TableCell>{loan.borrowerId}</TableCell>
                        <TableCell>{loan.lenderId || "N/A"}</TableCell>
                        <TableCell>{formatCurrency(Number(loan.amount))} {loan.currency}</TableCell>
                        <TableCell>{Number(loan.collateralBtc).toFixed(4)} BTC</TableCell>
                        <TableCell>
                          <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                            {loan.dispute?.disputeType || "under_review"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2 flex-wrap">
                            {(["BORROWER_WINS", "LENDER_WINS", "TIMEOUT_DEFAULT"] as DisputeDecision[]).map((decision) => (
                              <AlertDialog key={decision}>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant={decision === "BORROWER_WINS" ? "default" : decision === "LENDER_WINS" ? "secondary" : "outline"}
                                    data-testid={`button-resolve-${loan.id}-${decision}`}
                                    disabled={resolveDisputeMutation.isPending}
                                  >
                                    {DECISION_LABELS[decision].icon} {DECISION_LABELS[decision].title}
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle className="flex items-center gap-2">
                                      <AlertTriangle className="h-5 w-5 text-yellow-500" />
                                      Confirm Dispute Resolution
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      <div className="space-y-3">
                                        <p>You are about to resolve dispute for <strong>Loan #{loan.id}</strong>.</p>
                                        <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                                          <p className="font-semibold">{DECISION_LABELS[decision].icon} {DECISION_LABELS[decision].title}</p>
                                          <p className="text-sm text-muted-foreground">{DECISION_LABELS[decision].description}</p>
                                        </div>
                                        <p className="text-red-600 dark:text-red-400 font-medium">
                                          This action will broadcast a Bitcoin transaction and cannot be undone.
                                        </p>
                                      </div>
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => resolveDisputeMutation.mutate({ loanId: loan.id, decision })}
                                      className="bg-red-600 hover:bg-red-700"
                                    >
                                      Confirm Resolution
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
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