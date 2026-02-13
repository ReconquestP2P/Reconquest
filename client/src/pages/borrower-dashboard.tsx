import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Coins, Bitcoin, TrendingUp, Trophy, RefreshCw, Euro, Upload, Loader2, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import StatsCard from "@/components/stats-card";
import LoanCalculator from "@/components/loan-calculator";
import { AchievementsDashboard } from "@/components/achievements-dashboard";
import EscrowSetup from "@/components/escrow-setup";
import FundingTracker from "@/components/funding-tracker";
import RepaymentModal from "@/components/repayment-modal";
import DepositInstructionsCard from "@/components/deposit-instructions-card";
import { SigningCeremonyModal } from "@/components/signing-ceremony-modal";
import { LtvBatteryIndicator } from "@/components/ltv-battery-indicator";
import { LoanDocuments } from "@/components/loan-documents";
import { FirefishWASMProvider } from "@/contexts/FirefishWASMContext";
import { formatCurrency, formatBTC, formatPercentage, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { AddressLink, TxLink } from "@/components/explorer-link";
import { CollateralReleaseStatus } from "@/components/collateral-release-status";
import type { Loan } from "@shared/schema";

export default function BorrowerDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Get actual authenticated user ID
  const userId = user?.id ?? 0;

  // Track loans where user clicked "I've Sent BTC" to prevent double-clicking
  const [confirmedLoanIds, setConfirmedLoanIds] = useState<Set<number>>(new Set());
  
  // Track which loan to repay
  const [repayingLoan, setRepayingLoan] = useState<Loan | null>(null);
  
  // Track which loan needs signing ceremony
  const [signingLoan, setSigningLoan] = useState<Loan | null>(null);
  
  // Track which loan needs top-up confirmation
  const [topUpLoan, setTopUpLoan] = useState<Loan | null>(null);
  const [topUpAmount, setTopUpAmount] = useState<string>("");
  
  // Track which loan's collateral history is expanded
  const [expandedCollateralLoanId, setExpandedCollateralLoanId] = useState<number | null>(null);

  const { data: userLoans = [], isLoading } = useQuery<Loan[]>({
    queryKey: [`/api/users/${userId}/loans`],
  });

  // Fetch current BTC price for dynamic LTV calculation
  const { data: btcPriceData } = useQuery<{ usd: number; eur: number }>({
    queryKey: ["/api/btc-price"],
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Helper function to calculate current LTV based on live BTC price
  const calculateCurrentLtv = (loan: any): number => {
    if (!btcPriceData || !loan.collateralBtc) return parseFloat(loan.ltvRatio) || 50;
    
    const collateralBtc = parseFloat(loan.collateralBtc);
    const loanAmount = parseFloat(loan.amount);
    const interestRate = parseFloat(loan.interestRate) / 100;
    const termMonths = loan.termMonths || 12;
    
    // Loan value includes principal + interest
    const loanValueWithInterest = loanAmount * (1 + interestRate * (termMonths / 12));
    
    // Get price in loan currency (EUR or USD)
    const btcPrice = loan.currency === 'EUR' ? btcPriceData.eur : btcPriceData.usd;
    const collateralValue = collateralBtc * btcPrice;
    
    if (collateralValue <= 0) return 100;
    
    const ltv = (loanValueWithInterest / collateralValue) * 100;
    return Math.min(Math.max(ltv, 0), 100); // Clamp between 0-100
  };

  const borrowerLoans = userLoans.filter(loan => loan.borrowerId === userId);
  // Show loans as "active" if fully active OR awaiting lender confirmation of repayment
  // Also include completed loans with unreleased collateral so borrower can trigger recovery
  const activeLoans = borrowerLoans.filter((loan: any) => 
    (loan.status === "active" && 
    loan.fiatTransferConfirmed === true && 
    loan.borrowerConfirmedReceipt === true) ||
    loan.status === "repayment_pending" ||
    loan.status === "repaid" ||
    (loan.status === "completed" && !loan.collateralReleased)
  );
  
  const totalBorrowed = activeLoans.reduce((sum, loan) => sum + parseFloat(loan.amount), 0);
  const totalCollateral = activeLoans.reduce((sum, loan) => sum + parseFloat(loan.collateralBtc), 0);
  const avgLTV = activeLoans.length > 0 
    ? activeLoans.reduce((sum, loan) => sum + parseFloat(loan.ltvRatio), 0) / activeLoans.length 
    : 0;

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/loans`] });
    toast({
      title: "Refreshed",
      description: "Your loans have been updated.",
    });
  };

  const confirmBtcSent = useMutation({
    mutationFn: async (loanId: number) => {
      const res = await fetch(`/api/loans/${loanId}/confirm-btc-sent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        },
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText);
      }
      return res.json();
    },
    onMutate: async (loanId: number) => {
      // Immediately mark this loan as confirmed in local state
      setConfirmedLoanIds(prev => new Set(prev).add(loanId));
    },
    onSuccess: (data, loanId) => {
      toast({
        title: "✅ Confirmation Sent!",
        description: "Admin has been notified to verify your BTC deposit.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/loans`] });
    },
    onError: (error: Error, loanId) => {
      // Remove from confirmed set if error occurs
      setConfirmedLoanIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(loanId);
        return newSet;
      });
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation for confirming receipt of fiat funds from lender
  const confirmReceiptMutation = useMutation({
    mutationFn: async (loanId: number) => {
      return apiRequest(`/api/loans/${loanId}/receipt/confirm`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/loans`] });
      toast({
        title: "✅ Funds Received Confirmed!",
        description: "Your loan is now active. The countdown has started.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to confirm receipt",
        variant: "destructive",
      });
    },
  });

  // Mutation for confirming collateral top-up sent
  const confirmTopUpMutation = useMutation({
    mutationFn: async ({ loanId, topUpAmountBtc }: { loanId: number; topUpAmountBtc: string }) => {
      const res = await fetch(`/api/loans/${loanId}/confirm-topup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        },
        body: JSON.stringify({ topUpAmountBtc }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: 'Failed to confirm top-up' }));
        throw new Error(errorData.message);
      }
      return res.json();
    },
    onSuccess: (data) => {
      setTopUpLoan(null);
      setTopUpAmount("");
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/loans`] });
      toast({
        title: "✅ Top-Up Recorded!",
        description: `We're monitoring the blockchain for your ${data.pendingTopUpBtc} BTC deposit. Your LTV will update once confirmed.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Filter loans where lender has sent funds but borrower hasn't confirmed receipt
  const pendingReceiptLoans = borrowerLoans.filter(
    (loan: any) => loan.fiatTransferConfirmed === true && loan.borrowerConfirmedReceipt !== true
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-blue-100 text-blue-800">Active</Badge>;
      case "repayment_pending":
        return <Badge className="bg-orange-100 text-orange-800">Awaiting Lender Confirmation</Badge>;
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      case "completed":
        return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case "defaulted":
        return <Badge className="bg-red-100 text-red-800">Defaulted</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };


  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse space-y-8">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Check if user is admin - admins cannot participate in loan flows
  const isAdmin = user?.role === 'admin';

  return (
    <FirefishWASMProvider>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Borrower Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-300 mt-2">Manage your Bitcoin-backed loans and track your portfolio</p>
        </div>

        {/* Admin Warning Banner */}
        {isAdmin && (
          <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-3">
            <Coins className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-amber-800 dark:text-amber-200">Admin Account - View Only Mode</h3>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                Admin accounts cannot participate in loans as borrowers. You can view loan data for oversight purposes only.
                To request loans, please use a regular user account.
              </p>
            </div>
          </div>
        )}

        <Tabs defaultValue="request" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="request">Request Loan</TabsTrigger>
          <TabsTrigger value="escrow">Escrow Pending</TabsTrigger>
          <TabsTrigger value="confirm-funds">Confirm Funds</TabsTrigger>
          <TabsTrigger value="loans">Active Loans</TabsTrigger>
          <TabsTrigger value="history">Loan History</TabsTrigger>
          <TabsTrigger value="achievements">Achievements</TabsTrigger>
        </TabsList>

        <TabsContent value="request" className="space-y-6">
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              className="flex items-center gap-2"
              data-testid="button-refresh-request"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <StatsCard
              title="Active Loans"
              value={activeLoans.length.toString()}
              icon={Coins}
              iconColor="text-primary"
            />
            <StatsCard
              title="Total Borrowed"
              value={formatCurrency(totalBorrowed, "EUR")}
              icon={Euro}
              iconColor="text-secondary"
            />
            <StatsCard
              title="BTC Collateral"
              value={formatBTC(totalCollateral)}
              icon={Bitcoin}
              iconColor="text-orange-500"
            />
            <StatsCard
              title="Avg. LTV Ratio"
              value={formatPercentage(avgLTV)}
              icon={TrendingUp}
              iconColor="text-green-600"
              valueColor="text-green-600"
            />
          </div>

          {/* Loan Calculator */}
          <div className="mt-8">
            <LoanCalculator disabled={isAdmin} />
          </div>
        </TabsContent>

        <TabsContent value="confirm-funds" className="space-y-6">
          <Card className="border-green-200 dark:border-green-800">
            <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Euro className="h-6 w-6 text-green-600" />
                  <CardTitle>Confirm Receipt of Funds</CardTitle>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  className="flex items-center gap-2"
                  data-testid="button-refresh-confirm-funds"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                The lender has sent funds to your bank account. Please confirm receipt to activate your loan.
              </p>
            </CardHeader>
            <CardContent className="pt-6">
              {pendingReceiptLoans.length > 0 ? (
                <div className="space-y-4">
                  {pendingReceiptLoans.map((loan: any) => (
                    <Card key={loan.id} className="border-2 border-green-200 dark:border-green-800">
                      <CardContent className="p-6">
                        <div className="space-y-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="text-lg font-semibold">Loan #{loan.id.toString().padStart(6, '0')}</h3>
                              <p className="text-sm text-muted-foreground">
                                Lender has confirmed they transferred funds
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-2xl font-bold text-green-600">
                                {formatCurrency(Number(loan.amount), "EUR")}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {parseFloat(loan.interestRate).toFixed(2)}% APY
                              </p>
                            </div>
                          </div>

                          <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-green-600 dark:text-green-400 font-semibold">✓ Lender Sent Funds</span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Check your bank account for a transfer of {formatCurrency(Number(loan.amount), "EUR")} 
                              with reference "Loan #{loan.id.toString().padStart(6, '0')}"
                            </p>
                          </div>

                          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-300 dark:border-yellow-800">
                            <p className="text-sm text-yellow-800 dark:text-yellow-200">
                              ⚠️ <strong>Important:</strong> Only confirm if you have received the funds in your bank account.
                            </p>
                          </div>

                          <Button 
                            onClick={() => confirmReceiptMutation.mutate(loan.id)}
                            disabled={confirmReceiptMutation.isPending}
                            className="w-full bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white"
                            data-testid={`button-confirm-receipt-${loan.id}`}
                          >
                            {confirmReceiptMutation.isPending ? "Confirming..." : "✓ I've Received the Funds"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">No pending fund confirmations</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    When a lender transfers funds to your bank account, you'll confirm receipt here.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="loans" className="space-y-6">
          {/* Active Loans Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Your Active Loans</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  className="flex items-center gap-2"
                  data-testid="button-refresh-loans"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {activeLoans.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">No active loans. Once you deposit BTC and the lender transfers funds, your loan will appear here.</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Loan ID</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Collateral</TableHead>
                          <TableHead>Interest Rate</TableHead>
                          <TableHead>LTV</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activeLoans.map((loan: any) => {
                          const isExpanded = expandedCollateralLoanId === loan.id;
                          const deposits = [];
                          
                          // Calculate original deposit
                          const currentCollateral = parseFloat(loan.collateralBtc || 0);
                          const previousCollateral = parseFloat(loan.previousCollateralBtc || 0);
                          const pendingTopUp = parseFloat(loan.pendingTopUpBtc || 0);
                          
                          // Original deposit (if we have previous, calculate; otherwise use current minus pending)
                          if (previousCollateral > 0) {
                            deposits.push({
                              type: 'Initial Deposit',
                              amount: previousCollateral,
                              txid: loan.depositTxid,
                              status: 'confirmed',
                              date: loan.depositConfirmedAt
                            });
                            // Top-up that was confirmed
                            if (currentCollateral > previousCollateral) {
                              deposits.push({
                                type: 'Top-Up',
                                amount: currentCollateral - previousCollateral,
                                txid: loan.topUpTxid,
                                status: 'confirmed',
                                date: loan.topUpConfirmedAt
                              });
                            }
                          } else {
                            // No previous collateral, just show current
                            deposits.push({
                              type: 'Initial Deposit',
                              amount: currentCollateral,
                              txid: loan.depositTxid,
                              status: 'confirmed',
                              date: loan.depositConfirmedAt
                            });
                          }
                          
                          // Add pending top-up if monitoring
                          if (loan.topUpMonitoringActive && pendingTopUp > 0) {
                            deposits.push({
                              type: 'Pending Top-Up',
                              amount: pendingTopUp,
                              txid: loan.topUpTxid,
                              status: loan.topUpDetectedInMempoolAt ? 'mempool' : 'pending',
                              date: loan.topUpRequestedAt
                            });
                          }
                          
                          return (
                            <>
                              <TableRow key={loan.id}>
                                <TableCell className="font-medium">
                                  <button
                                    onClick={() => setExpandedCollateralLoanId(isExpanded ? null : loan.id)}
                                    className="flex items-center gap-1 hover:text-blue-600 transition-colors"
                                    data-testid={`toggle-collateral-${loan.id}`}
                                  >
                                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                    #{loan.id}
                                  </button>
                                </TableCell>
                                <TableCell>{formatCurrency(loan.amount, loan.currency)}</TableCell>
                                <TableCell>
                                  {loan.escrowAddress ? (
                                    <AddressLink 
                                      address={loan.escrowAddress}
                                      className="text-blue-500 hover:text-blue-700"
                                      displayText={`${parseFloat(loan.collateralBtc || 0).toFixed(8)} BTC`}
                                      testId={`link-escrow-${loan.id}`}
                                    />
                                  ) : (
                                    formatBTC(loan.collateralBtc)
                                  )}
                                </TableCell>
                                <TableCell>{formatPercentage(loan.interestRate)}</TableCell>
                                <TableCell><LtvBatteryIndicator ltv={calculateCurrentLtv(loan)} size="sm" /></TableCell>
                                <TableCell>
                                  {loan.dueDate ? formatDate(loan.dueDate) : "TBD"}
                                </TableCell>
                                <TableCell>{getStatusBadge(loan.status)}</TableCell>
                                <TableCell>
                                  {loan.status === 'repaid' ? (
                                    <Badge variant="secondary" className="bg-green-100 text-green-700">
                                      Repaid
                                    </Badge>
                                  ) : (
                                    <Button
                                      onClick={() => setRepayingLoan(loan)}
                                      size="sm"
                                      className="bg-green-600 hover:bg-green-700"
                                      data-testid={`button-repay-loan-${loan.id}`}
                                    >
                                      Repay Loan
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                              
                              {/* Collateral Release Status for repaid/completed loans */}
                              {(loan.status === 'repaid' || (loan.status === 'completed' && !loan.collateralReleased)) && (
                                <TableRow className="bg-gray-50 dark:bg-gray-900/50">
                                  <TableCell colSpan={8} className="p-4">
                                    <CollateralReleaseStatus
                                      loanId={loan.id}
                                      status={loan.status}
                                      collateralReleased={loan.collateralReleased}
                                      collateralReleaseTxid={loan.collateralReleaseTxid}
                                      collateralReleasedAt={loan.collateralReleasedAt}
                                      collateralReleaseError={loan.collateralReleaseError}
                                      loan={loan}
                                      userId={userId}
                                    />
                                  </TableCell>
                                </TableRow>
                              )}
                              
                              {/* Collateral Deposit History (expandable) */}
                              {isExpanded && (
                                <TableRow className="bg-gray-50 dark:bg-gray-900/50">
                                  <TableCell colSpan={8} className="p-4">
                                    <div className="space-y-3">
                                      <h4 className="font-semibold text-sm flex items-center gap-2">
                                        <Bitcoin className="h-4 w-4 text-orange-500" />
                                        Collateral Deposit History
                                      </h4>
                                      <div className="bg-white dark:bg-gray-800 rounded-lg border overflow-hidden">
                                        <table className="w-full text-sm">
                                          <thead className="bg-gray-100 dark:bg-gray-700">
                                            <tr>
                                              <th className="text-left p-2 font-medium">Type</th>
                                              <th className="text-left p-2 font-medium">Amount</th>
                                              <th className="text-left p-2 font-medium">Status</th>
                                              <th className="text-left p-2 font-medium">Transaction</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {deposits.map((deposit, idx) => (
                                              <tr key={idx} className="border-t border-gray-100 dark:border-gray-700">
                                                <td className="p-2">
                                                  <span className={deposit.type === 'Top-Up' || deposit.type === 'Pending Top-Up' ? 'text-amber-600 font-medium' : ''}>
                                                    {deposit.type}
                                                  </span>
                                                </td>
                                                <td className="p-2 font-mono">{deposit.amount.toFixed(8)} BTC</td>
                                                <td className="p-2">
                                                  {deposit.status === 'confirmed' && (
                                                    <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                                                      ✓ Confirmed
                                                    </Badge>
                                                  )}
                                                  {deposit.status === 'mempool' && (
                                                    <Badge variant="secondary" className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
                                                      ⏳ In Mempool
                                                    </Badge>
                                                  )}
                                                  {deposit.status === 'pending' && (
                                                    <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                                                      🔍 Monitoring
                                                    </Badge>
                                                  )}
                                                </td>
                                                <td className="p-2">
                                                  {deposit.txid ? (
                                                    <TxLink 
                                                      txid={deposit.txid}
                                                      className="text-blue-500 hover:text-blue-700 flex items-center gap-1 font-mono text-xs"
                                                      testId={`link-tx-${loan.id}-${idx}`}
                                                    />
                                                  ) : (
                                                    <span className="text-gray-400 text-xs">-</span>
                                                  )}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                      
                                      {/* Quick link to full escrow address */}
                                      <div className="flex items-center gap-2 text-xs text-gray-500">
                                        <span>Escrow Address:</span>
                                        {loan.escrowAddress && (
                                          <AddressLink 
                                            address={loan.escrowAddress}
                                            className="text-blue-500 hover:text-blue-700 flex items-center gap-1 font-mono"
                                          />
                                        )}
                                      </div>
                                      
                                      {/* Loan Documents */}
                                      <LoanDocuments loanId={loan.id} userRole="borrower" canUpload={true} />
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )}
                            </>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Top-Up Collateral Section - Shows when any loan has elevated LTV */}
                  {activeLoans.some((loan: any) => calculateCurrentLtv(loan) >= 75) && (
                    <div className="mt-6 border-t pt-6">
                      <h3 className="text-lg font-semibold text-amber-600 dark:text-amber-400 mb-4 flex items-center gap-2">
                        ⚠️ Top-Up Collateral
                      </h3>
                      <div className="space-y-4">
                        {activeLoans
                          .filter((loan: any) => calculateCurrentLtv(loan) >= 75)
                          .map((loan: any) => {
                            const currentLtv = calculateCurrentLtv(loan);
                            const isUrgent = currentLtv >= 85;
                            return (
                              <div
                                key={loan.id}
                                className={`p-4 rounded-lg border-2 ${
                                  isUrgent
                                    ? 'bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-700'
                                    : 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-3">
                                  <span className="font-semibold">Loan #{loan.id}</span>
                                  <Badge variant={isUrgent ? "destructive" : "secondary"}>
                                    {currentLtv.toFixed(1)}% LTV
                                  </Badge>
                                </div>
                                <p className={`text-sm mb-3 ${isUrgent ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>
                                  {isUrgent
                                    ? '🔴 URGENT: Your collateral is at risk. Add more BTC immediately to avoid automatic liquidation at 95% LTV.'
                                    : '⚠️ Your LTV is rising. Consider adding more collateral to protect your position.'}
                                </p>
                                <div className="bg-white dark:bg-gray-900 p-3 rounded border mb-3">
                                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Send additional BTC to this address:</p>
                                  <code className="text-xs break-all text-blue-600 dark:text-blue-400 block p-2 bg-blue-50 dark:bg-blue-950/30 rounded" data-testid={`topup-address-${loan.id}`}>
                                    {loan.escrowAddress || 'Address not available'}
                                  </code>
                                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                                    This is the same escrow address used for your initial collateral deposit.
                                  </p>
                                </div>
                                
                                {/* Show pending top-up status or confirm button */}
                                {loan.topUpMonitoringActive ? (
                                  <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded border border-blue-200 dark:border-blue-800">
                                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                                    <span className="text-sm text-blue-700 dark:text-blue-300">
                                      Monitoring for your {parseFloat(String(loan.pendingTopUpBtc || 0)).toFixed(6)} BTC deposit...
                                    </span>
                                  </div>
                                ) : (
                                  <Button
                                    onClick={() => setTopUpLoan(loan)}
                                    className="w-full bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600"
                                    data-testid={`button-confirm-topup-${loan.id}`}
                                  >
                                    <Upload className="h-4 w-4 mr-2" />
                                    I've Sent Additional BTC
                                  </Button>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="escrow" className="space-y-6">
          {/* Escrow Pending - Matched Loans Awaiting BTC Deposit */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Loans Matched - Awaiting BTC Deposit</CardTitle>
                  <p className="text-sm text-muted-foreground mt-2">
                    Your loan has been matched with a lender! Deposit Bitcoin to the escrow address below to activate your loan.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  className="flex items-center gap-2"
                  data-testid="button-refresh-escrow"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {borrowerLoans.filter(loan => (loan.escrowState === 'escrow_created' || loan.escrowState === 'awaiting_borrower_key' || loan.status === 'funded') && loan.escrowState !== 'deposit_confirmed').length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">
                    No loans awaiting BTC deposit. Once a lender commits to fund your loan request, it will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {borrowerLoans
                    .filter(loan => (loan.escrowState === 'escrow_created' || loan.escrowState === 'awaiting_borrower_key' || loan.status === 'funded') && loan.escrowState !== 'deposit_confirmed')
                    .map((loan) => (
                      <DepositInstructionsCard key={loan.id} loan={loan} userId={userId} />
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Loan History</CardTitle>
              <p className="text-sm text-muted-foreground">
                Your completed, defaulted, and recovered loans.
              </p>
            </CardHeader>
            <CardContent>
              {(() => {
                const closedLoans = borrowerLoans.filter((loan: any) => 
                  (loan.status === 'completed' && loan.collateralReleased) ||
                  loan.status === 'defaulted' ||
                  loan.status === 'recovered' ||
                  loan.status === 'cancelled'
                );
                if (closedLoans.length === 0) {
                  return (
                    <div className="text-center py-8">
                      <p className="text-gray-500 dark:text-gray-400">No past loans yet.</p>
                    </div>
                  );
                }
                return (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Loan ID</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Collateral</TableHead>
                        <TableHead>Interest Rate</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Collateral Status</TableHead>
                        <TableHead>Resolved</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {closedLoans.map((loan: any) => (
                        <TableRow key={loan.id}>
                          <TableCell className="font-medium">#{loan.id}</TableCell>
                          <TableCell>{loan.currency === 'EUR' ? '€' : '$'}{parseFloat(loan.amount).toLocaleString()}</TableCell>
                          <TableCell>
                            {loan.collateralBtc ? `${parseFloat(loan.collateralBtc).toFixed(8)} BTC` : '—'}
                          </TableCell>
                          <TableCell>{loan.interestRate}%</TableCell>
                          <TableCell>{getStatusBadge(loan.status)}</TableCell>
                          <TableCell>
                            {loan.collateralReleased && loan.escrowState === 'liquidated' ? (
                              <Badge className="bg-red-100 text-red-800">Liquidated</Badge>
                            ) : loan.collateralReleased ? (
                              <Badge className="bg-green-100 text-green-800">Released</Badge>
                            ) : loan.status === 'cancelled' ? (
                              <Badge variant="outline">No Escrow</Badge>
                            ) : loan.status === 'defaulted' ? (
                              <Badge className="bg-orange-100 text-orange-800">In Dispute</Badge>
                            ) : (
                              <Badge variant="outline">Pending</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {loan.disputeResolvedAt
                              ? new Date(loan.disputeResolvedAt).toLocaleDateString()
                              : loan.collateralReleasedAt
                              ? new Date(loan.collateralReleasedAt).toLocaleDateString()
                              : loan.repaidAt
                              ? new Date(loan.repaidAt).toLocaleDateString()
                              : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="achievements" className="space-y-6">
          <AchievementsDashboard userId={userId} />
        </TabsContent>
      </Tabs>

      {/* Repayment Modal */}
      {repayingLoan && (
        <RepaymentModal
          isOpen={!!repayingLoan}
          onClose={() => setRepayingLoan(null)}
          loan={repayingLoan}
        />
      )}

      {/* Signing Ceremony Modal */}
      {signingLoan && (
        <SigningCeremonyModal
          isOpen={!!signingLoan}
          onClose={() => setSigningLoan(null)}
          loan={{
            id: signingLoan.id,
            amount: signingLoan.amount,
            currency: signingLoan.currency,
            collateralBtc: signingLoan.collateralBtc,
            termMonths: signingLoan.termMonths,
            escrowAddress: signingLoan.escrowAddress,
          }}
          role="borrower"
          userId={userId}
        />
      )}

      {/* Top-Up Confirmation Dialog */}
      <Dialog open={!!topUpLoan} onOpenChange={(open) => { if (!open) { setTopUpLoan(null); setTopUpAmount(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bitcoin className="h-5 w-5 text-amber-600" />
              Confirm Collateral Top-Up
            </DialogTitle>
            <DialogDescription>
              Tell us how much BTC you sent to your escrow address. We'll monitor the blockchain and update your LTV once the deposit is confirmed.
            </DialogDescription>
          </DialogHeader>
          
          {topUpLoan && (
            <div className="space-y-4 py-4">
              <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600 dark:text-gray-400">Loan</span>
                  <span className="font-medium">#{topUpLoan.id}</span>
                </div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600 dark:text-gray-400">Current Collateral</span>
                  <span className="font-medium">{formatBTC(topUpLoan.collateralBtc)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Current LTV</span>
                  <span className="font-medium text-amber-600">{calculateCurrentLtv(topUpLoan).toFixed(1)}%</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="topup-amount">Amount Sent (BTC)</Label>
                <Input
                  id="topup-amount"
                  type="number"
                  step="0.00000001"
                  min="0.00001"
                  placeholder="e.g., 0.05"
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  data-testid="input-topup-amount"
                />
                <p className="text-xs text-gray-500">
                  Enter the exact amount you sent to the escrow address.
                </p>
              </div>

              {topUpAmount && parseFloat(topUpAmount) > 0 && (
                <div className="bg-green-50 dark:bg-green-950/30 p-3 rounded-lg border border-green-200 dark:border-green-800">
                  <p className="text-sm text-green-700 dark:text-green-300">
                    <strong>After confirmation:</strong>
                  </p>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-green-600 dark:text-green-400">New Collateral</span>
                    <span className="font-medium">{(parseFloat(topUpLoan.collateralBtc) + parseFloat(topUpAmount)).toFixed(8)} BTC</span>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setTopUpLoan(null); setTopUpAmount(""); }}
              data-testid="button-cancel-topup"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (topUpLoan && topUpAmount) {
                  confirmTopUpMutation.mutate({ 
                    loanId: topUpLoan.id, 
                    topUpAmountBtc: topUpAmount 
                  });
                }
              }}
              disabled={!topUpAmount || parseFloat(topUpAmount) <= 0 || confirmTopUpMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700"
              data-testid="button-submit-topup"
            >
              {confirmTopUpMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Recording...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Confirm Top-Up
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </FirefishWASMProvider>
  );
}
