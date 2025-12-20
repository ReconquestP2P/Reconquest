import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Coins, Bitcoin, TrendingUp, Trophy, RefreshCw, Euro } from "lucide-react";
import { Button } from "@/components/ui/button";
import StatsCard from "@/components/stats-card";
import LoanCalculator from "@/components/loan-calculator";
import { AchievementsDashboard } from "@/components/achievements-dashboard";
import EscrowSetup from "@/components/escrow-setup";
import FundingTracker from "@/components/funding-tracker";
import RepaymentModal from "@/components/repayment-modal";
import DepositInstructionsCard from "@/components/deposit-instructions-card";
import { SigningCeremonyModal } from "@/components/signing-ceremony-modal";
import { LtvBatteryIndicator } from "@/components/ltv-battery-indicator";
import { FirefishWASMProvider } from "@/contexts/FirefishWASMContext";
import { formatCurrency, formatBTC, formatPercentage, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
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
  // Only show loans as "active" if BOTH lender confirmed fiat sent AND borrower confirmed receipt
  const activeLoans = borrowerLoans.filter((loan: any) => 
    loan.status === "active" && 
    loan.fiatTransferConfirmed === true && 
    loan.borrowerConfirmedReceipt === true
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

  // Filter loans where lender has sent funds but borrower hasn't confirmed receipt
  const pendingReceiptLoans = borrowerLoans.filter(
    (loan: any) => loan.fiatTransferConfirmed === true && loan.borrowerConfirmedReceipt !== true
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-blue-100 text-blue-800">Active</Badge>;
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

  return (
    <FirefishWASMProvider>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Borrower Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-300 mt-2">Manage your Bitcoin-backed loans and track your portfolio</p>
        </div>

        <Tabs defaultValue="request" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="request">Request Loan</TabsTrigger>
          <TabsTrigger value="escrow">Escrow Pending</TabsTrigger>
          <TabsTrigger value="recovery">Recovery Plan</TabsTrigger>
          <TabsTrigger value="confirm-funds">Confirm Funds</TabsTrigger>
          <TabsTrigger value="loans">Active Loans</TabsTrigger>
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
            <LoanCalculator />
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
                              Once confirmed, your loan will become active and the repayment countdown begins.
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
                      {activeLoans.map((loan) => (
                        <TableRow key={loan.id}>
                          <TableCell className="font-medium">#{loan.id}</TableCell>
                          <TableCell>{formatCurrency(loan.amount, loan.currency)}</TableCell>
                          <TableCell>{formatBTC(loan.collateralBtc)}</TableCell>
                          <TableCell>{formatPercentage(loan.interestRate)}</TableCell>
                          <TableCell><LtvBatteryIndicator ltv={calculateCurrentLtv(loan)} size="sm" /></TableCell>
                          <TableCell>
                            {loan.dueDate ? formatDate(loan.dueDate) : "TBD"}
                          </TableCell>
                          <TableCell>{getStatusBadge(loan.status)}</TableCell>
                          <TableCell>
                            <Button
                              onClick={() => setRepayingLoan(loan)}
                              size="sm"
                              className="bg-green-600 hover:bg-green-700"
                              data-testid={`button-repay-loan-${loan.id}`}
                            >
                              Repay Loan
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
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
                  <p className="text-sm text-muted-foreground">
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
              {borrowerLoans.filter(loan => (loan.escrowState === 'escrow_created' || loan.status === 'funded') && loan.escrowState !== 'deposit_confirmed').length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">
                    No loans awaiting BTC deposit. Once a lender commits to fund your loan request, it will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {borrowerLoans
                    .filter(loan => (loan.escrowState === 'escrow_created' || loan.status === 'funded') && loan.escrowState !== 'deposit_confirmed')
                    .map((loan) => (
                      <DepositInstructionsCard key={loan.id} loan={loan} userId={userId} />
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recovery" className="space-y-6">
          <Card className="border-purple-200 dark:border-purple-800">
            <CardHeader className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/30">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  🔐 Generate Recovery Plan (Firefish Security)
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  className="flex items-center gap-2"
                  data-testid="button-refresh-recovery"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Complete the signing ceremony to activate your loan. Your private key will be generated, used to sign transactions, then <strong>immediately discarded</strong> for maximum security.
              </p>
            </CardHeader>
            <CardContent className="pt-6">
              {borrowerLoans.filter(loan => loan.depositConfirmedAt && !loan.borrowerKeysGeneratedAt).length > 0 ? (
                <div className="space-y-4">
                  {borrowerLoans
                    .filter(loan => loan.depositConfirmedAt && !loan.borrowerKeysGeneratedAt)
                    .map((loan) => (
                      <div key={loan.id} className="border border-purple-200 dark:border-purple-800 rounded-lg p-4 bg-gradient-to-br from-purple-50/50 to-indigo-50/50 dark:from-purple-950/20 dark:to-indigo-950/20">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold">Loan #{loan.id}</h3>
                            <p className="text-sm text-muted-foreground">
                              {formatCurrency(parseFloat(loan.amount), loan.currency)} · {loan.termMonths} months
                            </p>
                            {loan.lenderKeysGeneratedAt && (
                              <Badge className="mt-2 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                                ✓ Lender Signed
                              </Badge>
                            )}
                          </div>
                          <Button
                            onClick={() => setSigningLoan(loan)}
                            className="bg-purple-600 hover:bg-purple-700"
                            data-testid={`button-generate-recovery-borrower-${loan.id}`}
                          >
                            🔐 Generate Recovery Plan
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">
                    No loans awaiting recovery plan generation. Once your BTC deposit is confirmed, you can generate your recovery plan here.
                  </p>
                </div>
              )}
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
      </div>
    </FirefishWASMProvider>
  );
}
