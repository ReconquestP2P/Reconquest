import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { TrendingUp, Euro, PiggyBank, Percent, RefreshCw, Trophy, ArrowUpDown, ArrowUp, ArrowDown, Bitcoin, ExternalLink, ChevronUp, ChevronDown, AlertCircle, FileSignature, Shield, CheckCircle } from "lucide-react";
import StatsCard from "@/components/stats-card";
import LoanCard from "@/components/loan-card";
import LenderFundingModal from "@/components/lender-funding-modal";
import { SigningCeremonyModal } from "@/components/signing-ceremony-modal";
import { AchievementsDashboard } from "@/components/achievements-dashboard";
import { LtvBatteryIndicator } from "@/components/ltv-battery-indicator";
import EscrowSetup from "@/components/escrow-setup";
import FundingTracker from "@/components/funding-tracker";
import { FirefishWASMProvider } from "@/contexts/FirefishWASMContext";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, formatPercentage, formatDate } from "@/lib/utils";
import type { Loan } from "@shared/schema";

export default function LenderDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [termFilter, setTermFilter] = useState("all");
  
  // Advanced filter states
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [amountRange, setAmountRange] = useState([0]);
  const [statusFilter, setStatusFilter] = useState("available"); // "available" or "matched"
  const [selectedTerms, setSelectedTerms] = useState<number[]>([]);
  const [selectedCurrency, setSelectedCurrency] = useState("all");
  
  // Sorting state
  const [sortField, setSortField] = useState<"amount" | "period" | "yield">("amount");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  
  // Funding modal state
  const [fundingModalOpen, setFundingModalOpen] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  
  // Signing ceremony modal state
  const [signingLoan, setSigningLoan] = useState<Loan | null>(null);
  
  // Active loan details modal state
  const [activeDetailLoan, setActiveDetailLoan] = useState<any | null>(null);
  
  // Expandable collateral history state
  const [expandedCollateralLoanId, setExpandedCollateralLoanId] = useState<number | null>(null);

  // Get actual authenticated user ID
  const userId = user?.id ?? 0;

  const { data: userLoans = [], isLoading: loansLoading } = useQuery<any[]>({
    queryKey: [`/api/users/${userId}/loans/enriched`],
  });

  const { data: allLoans = [], isLoading: availableLoading } = useQuery<Loan[]>({
    queryKey: ["/api/loans"],
  });

  // Fetch current BTC price for dynamic LTV calculation
  const { data: btcPriceData } = useQuery<{ usd: number; eur: number }>({
    queryKey: ["/api/btc-price"],
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Fetch pending resolutions for dispute signing
  interface PendingResolution {
    loanId: number;
    decision: string;
    lenderPayoutSats: number;
    borrowerPayoutSats: number;
    btcPriceEur: number;
    psbtBase64: string;
    createdAt: string;
    lenderPubkey: string;
    escrowAddress: string;
    lenderAddress: string;
    borrowerAddress: string;
  }
  
  const { data: pendingResolutionsData, isLoading: resolutionsLoading } = useQuery<{ success: boolean; pendingResolutions: PendingResolution[] }>({
    queryKey: ["/api/lender/pending-resolutions"],
    refetchInterval: 30000,
  });
  
  const pendingResolutions = pendingResolutionsData?.pendingResolutions || [];

  // Mutation for signing resolution PSBT
  const signResolutionMutation = useMutation({
    mutationFn: async ({ loanId, signedPsbtBase64 }: { loanId: number; signedPsbtBase64: string }) => {
      return apiRequest(`/api/lender/sign-resolution/${loanId}`, "POST", { signedPsbtBase64 });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/lender/pending-resolutions"] });
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/loans/enriched`] });
      setSigningResolution(null);
      toast({
        title: "Transaction Broadcast!",
        description: `Your signature completed the resolution. TXID: ${data.txid?.substring(0, 16)}...`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Signing Failed",
        description: error.message || "Failed to complete resolution signing",
        variant: "destructive",
      });
    },
  });
  
  // State for signing modal
  const [signingResolution, setSigningResolution] = useState<PendingResolution | null>(null);

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

  const lenderLoans = userLoans.filter(loan => loan.lenderId === userId);
  
  // Only show loans as "active" if BOTH lender confirmed fiat sent AND borrower confirmed receipt
  const activeInvestments = lenderLoans.filter(loan => 
    loan.status === "active" && 
    loan.fiatTransferConfirmed === true && 
    loan.borrowerConfirmedReceipt === true
  );

  // Mutation for confirming fiat transfer sent
  const confirmFiatMutation = useMutation({
    mutationFn: async (loanId: number) => {
      return apiRequest(`/api/loans/${loanId}/fiat/confirm`, "POST", { lenderId: userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/loans/enriched`] });
      toast({
        title: "Funds Transfer Confirmed",
        description: "The borrower will be notified to confirm receipt of the funds.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to confirm transfer",
        variant: "destructive",
      });
    },
  });
  
  const totalInvested = activeInvestments.reduce((sum, loan) => sum + parseFloat(loan.amount), 0);
  const avgAPY = activeInvestments.length > 0 
    ? activeInvestments.reduce((sum, loan) => sum + parseFloat(loan.interestRate), 0) / activeInvestments.length 
    : 0;

  // Calculate interest earned (simplified calculation)
  const interestEarned = activeInvestments.reduce((sum, loan) => {
    const principal = parseFloat(loan.amount);
    const rate = parseFloat(loan.interestRate) / 100;
    const months = loan.termMonths;
    return sum + (principal * rate * months / 12);
  }, 0);

  // Filter and search logic
  const filteredLoans = useMemo(() => {
    let filtered = allLoans;

    // CRITICAL: Exclude loans created by the current user (prevent self-funding)
    filtered = filtered.filter(loan => loan.borrowerId !== userId);

    // Filter by status
    if (statusFilter === "available") {
      filtered = filtered.filter(loan => 
        loan.status === "posted"
      );
    } else if (statusFilter === "matched") {
      filtered = filtered.filter(loan => 
        loan.status === "escrow_pending" || 
        loan.status === "active" || 
        loan.status === "completed"
      );
    }

    // Filter by amount range
    if (minAmount) {
      filtered = filtered.filter(loan => parseFloat(loan.amount) >= parseFloat(minAmount));
    }
    if (maxAmount) {
      filtered = filtered.filter(loan => parseFloat(loan.amount) <= parseFloat(maxAmount));
    }

    // Filter by currency
    if (selectedCurrency !== "all") {
      filtered = filtered.filter(loan => loan.currency === selectedCurrency);
    }

    // Filter by terms
    if (selectedTerms.length > 0) {
      filtered = filtered.filter(loan => selectedTerms.includes(loan.termMonths));
    }

    // Sort loans
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "amount":
          comparison = parseFloat(a.amount) - parseFloat(b.amount);
          break;
        case "period":
          comparison = a.termMonths - b.termMonths;
          break;
        case "yield":
          comparison = parseFloat(a.interestRate) - parseFloat(b.interestRate);
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return filtered;
  }, [allLoans, statusFilter, minAmount, maxAmount, selectedCurrency, selectedTerms, sortField, sortDirection]);

  // Helper functions for filter controls
  const handleTermToggle = (term: number) => {
    setSelectedTerms(prev => 
      prev.includes(term) 
        ? prev.filter(t => t !== term)
        : [...prev, term]
    );
  };

  const resetFilters = () => {
    setMinAmount("");
    setMaxAmount("");
    setAmountRange([0]);
    setStatusFilter("available");
    setSelectedTerms([]);
    setSelectedCurrency("all");
  };

  const handleSort = (field: "amount" | "period" | "yield") => {
    if (sortField === field) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const SortIcon = ({ field }: { field: "amount" | "period" | "yield" }) => {
    if (sortField !== field) return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />;
    return sortDirection === "asc" 
      ? <ArrowUp className="h-4 w-4 ml-1 text-primary" />
      : <ArrowDown className="h-4 w-4 ml-1 text-primary" />;
  };

  const handleFundLoan = (loanId: number) => {
    const loan = allLoans.find(l => l.id === loanId);
    if (loan) {
      setSelectedLoan(loan);
      setFundingModalOpen(true);
    }
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
    queryClient.invalidateQueries({ queryKey: ["/api/loans", "available"] });
    toast({
      title: "Refreshed",
      description: "Latest loan requests have been loaded.",
    });
  };



  if (loansLoading || availableLoading) {
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Lender Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-300 mt-2">Invest in Bitcoin-secured loans and earn fixed returns</p>
        </div>

        {/* Admin Warning Banner */}
        {isAdmin && (
          <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-amber-800 dark:text-amber-200">Admin Account - View Only Mode</h3>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                Admin accounts cannot participate in loans as lenders. You can view loan data for oversight purposes only.
                To invest in loans, please use a regular user account.
              </p>
            </div>
          </div>
        )}

        {/* Pending Resolutions Alert - Bitcoin-Blind Lender */}
        {pendingResolutions.length > 0 && (
          <div className="mb-6 p-4 bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-400 dark:border-orange-600 rounded-lg" data-testid="pending-resolutions-alert">
            <div className="flex items-start gap-3">
              <FileSignature className="h-6 w-6 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-orange-800 dark:text-orange-200 text-lg">
                  Action Required: Confirm Resolution
                </h3>
                <p className="text-sm text-orange-700 dark:text-orange-300 mt-1 mb-4">
                  A dispute has been resolved. Please review and confirm the distribution of collateral.
                </p>
                <div className="space-y-3">
                  {pendingResolutions.map((resolution) => (
                    <div 
                      key={resolution.loanId}
                      className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-orange-200 dark:border-orange-700"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold">Loan #{resolution.loanId.toString().padStart(6, '0')}</p>
                          <p className="text-sm text-muted-foreground">
                            Decision: <span className="font-medium text-orange-600">{resolution.decision}</span>
                          </p>
                          <p className="text-sm text-green-600 font-medium mt-1">
                            Your Payout: {(resolution.lenderPayoutSats / 100_000_000).toFixed(8)} BTC 
                            (€{(resolution.lenderPayoutSats / 100_000_000 * resolution.btcPriceEur).toFixed(2)})
                          </p>
                        </div>
                        <Button
                          onClick={() => setSigningResolution(resolution)}
                          className="bg-orange-500 hover:bg-orange-600"
                          data-testid={`button-confirm-resolution-${resolution.loanId}`}
                        >
                          <FileSignature className="h-4 w-4 mr-2" />
                          Confirm Resolution
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="loans">Available Loans</TabsTrigger>
          <TabsTrigger value="pending-transfers">Pending Transfers</TabsTrigger>
          <TabsTrigger value="active">Active Loans</TabsTrigger>
          <TabsTrigger value="achievements">Achievements</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              className="flex items-center gap-2"
              data-testid="button-refresh-overview"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <StatsCard
              title="Active Investments"
              value={activeInvestments.length.toString()}
              icon={TrendingUp}
              iconColor="text-secondary"
            />
            <StatsCard
              title="Total Invested"
              value={formatCurrency(totalInvested, "EUR")}
              icon={Euro}
              iconColor="text-green-600"
            />
            <StatsCard
              title="Interest Earned"
              value={formatCurrency(interestEarned, "EUR")}
              icon={PiggyBank}
              iconColor="text-primary"
              valueColor="text-green-600"
            />
            <StatsCard
              title="Avg. APY"
              value={formatPercentage(avgAPY)}
              icon={Percent}
              iconColor="text-secondary"
              valueColor="text-secondary"
            />
          </div>
        </TabsContent>

        <TabsContent value="pending-transfers" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Pending Fund Transfers</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  BTC deposits confirmed - send fiat funds to borrowers' bank accounts
                </p>
              </div>
              <Button 
                onClick={handleRefresh} 
                variant="outline" 
                size="sm" 
                className="gap-2"
                data-testid="button-refresh-transfers"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </CardHeader>
            <CardContent>
              {lenderLoans.filter(loan => 
                loan.depositConfirmedAt && 
                loan.borrowerKeysGeneratedAt && 
                loan.lenderPubkey &&  // Bitcoin-blind: platform generates lender key at funding
                loan.status !== 'completed' &&
                !loan.borrowerConfirmedReceipt
              ).length > 0 ? (
                <div className="space-y-4">
                  {lenderLoans.filter(loan => 
                    loan.depositConfirmedAt && 
                    loan.borrowerKeysGeneratedAt && 
                    loan.lenderPubkey &&  // Bitcoin-blind: platform generates lender key at funding
                    loan.status !== 'completed' &&
                    !loan.borrowerConfirmedReceipt
                  ).map((loan) => (
                    <Card key={loan.id} className="border-2 border-yellow-200 dark:border-yellow-800">
                      <CardContent className="p-6">
                        <div className="space-y-4">
                          {/* Loan Header */}
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="text-lg font-semibold">Loan #{loan.id.toString().padStart(6, '0')}</h3>
                              <p className="text-sm text-muted-foreground">
                                Bitcoin escrow confirmed - awaiting your bank transfer
                              </p>
                              <div className="flex gap-4 mt-2 text-sm">
                                <span className="text-muted-foreground">
                                  📅 Start: <span className="font-medium text-foreground">{loan.loanStartedAt ? formatDate(loan.loanStartedAt) : 'Pending'}</span>
                                </span>
                                <span className="text-muted-foreground">
                                  🏁 End: <span className="font-medium text-foreground">{loan.dueDate ? formatDate(loan.dueDate) : 'Pending'}</span>
                                </span>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-2xl font-bold text-green-600">
                                {formatCurrency(Number(loan.amount))} {loan.currency}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {parseFloat(loan.interestRate).toFixed(2)}% APY
                              </p>
                            </div>
                          </div>

                          {/* Escrow Verification */}
                          <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-green-600 dark:text-green-400 font-semibold">✓ Bitcoin Deposited</span>
                            </div>
                            <p className="text-sm text-muted-foreground mb-2">
                              Borrower deposited {Number(loan.collateralBtc).toFixed(4)} BTC to escrow address
                            </p>
                            <a 
                              href={`https://mempool.space/testnet4/address/${loan.escrowAddress}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                              data-testid={`link-mempool-${loan.id}`}
                            >
                              🔍 View on Mempool →
                            </a>
                          </div>

                          {/* Bank Account Details */}
                          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-300 dark:border-yellow-800">
                            <h4 className="font-semibold mb-3 text-yellow-800 dark:text-yellow-200">
                              📤 Send Funds To:
                            </h4>
                            {(loan.borrower?.bankAccountHolder && loan.borrower?.iban) ? (
                              <div className="space-y-3 text-sm">
                                <div>
                                  <p className="text-muted-foreground">Account Holder</p>
                                  <p className="font-medium text-base">{loan.borrower.bankAccountHolder}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">IBAN</p>
                                  <p className="font-medium font-mono text-base">{loan.borrower.iban}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Reference</p>
                                  <p className="font-medium font-mono text-base">Loan #{String(loan.id).padStart(6, '0')}</p>
                                </div>
                              </div>
                            ) : (
                              <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded border border-red-200 dark:border-red-800">
                                <p className="text-sm text-red-600 dark:text-red-400">
                                  ⚠️ Borrower has not provided bank account details yet
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  The borrower needs to update their bank details in their account settings before you can proceed.
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Action Button */}
                          <div className="pt-2">
                            {loan.fiatTransferConfirmed ? (
                              <div className="w-full text-center py-3 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg font-medium">
                                ✓ Funds Sent - Awaiting Borrower Confirmation
                              </div>
                            ) : (
                              <Button 
                                onClick={() => confirmFiatMutation.mutate(loan.id)}
                                disabled={confirmFiatMutation.isPending}
                                className="w-full bg-gradient-to-r from-yellow-500 to-blue-500 hover:from-yellow-600 hover:to-blue-600 text-white"
                                data-testid={`button-confirm-transfer-${loan.id}`}
                              >
                                {confirmFiatMutation.isPending ? "Confirming..." : "✓ I've Sent the Funds"}
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">No pending fund transfers</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Funded loans will appear here once borrowers deposit BTC to escrow
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

        </TabsContent>

        <TabsContent value="loans" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Filter Panel */}
            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Filters</CardTitle>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={resetFilters}
                      className="text-xs"
                    >
                      Reset
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Period Filter */}
                  <div>
                    <Label className="text-sm font-medium text-gray-600">Period</Label>
                    <div className="space-y-2 mt-2">
                      {[3, 6, 9, 12, 18].map((term) => (
                        <div key={term} className="flex items-center space-x-2">
                          <Checkbox
                            id={`term-${term}`}
                            checked={selectedTerms.includes(term)}
                            onCheckedChange={() => handleTermToggle(term)}
                          />
                          <Label 
                            htmlFor={`term-${term}`}
                            className="text-sm font-normal"
                          >
                            {term} months
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Currency Filter */}
                  <div>
                    <Label className="text-sm font-medium text-gray-600">Currency</Label>
                    <RadioGroup 
                      value={selectedCurrency} 
                      onValueChange={setSelectedCurrency}
                      className="mt-2"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="all" id="curr-all" />
                        <Label htmlFor="curr-all" className="text-sm">All</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="EUR" id="curr-eur" />
                        <Label htmlFor="curr-eur" className="text-sm">EUR</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="USDC" id="curr-usdc" />
                        <Label htmlFor="curr-usdc" className="text-sm">USDC</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {/* Loan Amount Filter */}
                  <div>
                    <Label className="text-sm font-medium text-gray-600">Loan amount (from - to)</Label>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <Input
                        type="number"
                        placeholder="5000"
                        value={minAmount}
                        onChange={(e) => setMinAmount(e.target.value)}
                        className="text-center"
                      />
                      <Input
                        type="number"
                        placeholder="50000"
                        value={maxAmount}
                        onChange={(e) => setMaxAmount(e.target.value)}
                        className="text-center"
                      />
                    </div>
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>1000</span>
                        <span>100000</span>
                      </div>
                      <Slider
                        value={amountRange}
                        onValueChange={setAmountRange}
                        max={100000}
                        min={1000}
                        step={1000}
                        className="w-full"
                      />
                    </div>
                  </div>

                  {/* Status Filter */}
                  <div>
                    <Label className="text-sm font-medium text-gray-600">Status</Label>
                    <RadioGroup 
                      value={statusFilter} 
                      onValueChange={setStatusFilter}
                      className="mt-2"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="available" id="status-available" />
                        <Label htmlFor="status-available" className="text-sm">Available</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="matched" id="status-matched" />
                        <Label htmlFor="status-matched" className="text-sm">Matched</Label>
                      </div>
                    </RadioGroup>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Loans List */}
            <div className="lg:col-span-3">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                      <CardTitle>
                        {statusFilter === "available" ? "Available Loan Requests" : "Matched Loans"}
                      </CardTitle>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        ({filteredLoans.length} {statusFilter})
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRefresh}
                      className="flex items-center gap-2"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Refresh
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {filteredLoans.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-gray-500 dark:text-gray-400">
                        No loan requests match your filters.
                      </p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead 
                            className="cursor-pointer hover:bg-muted/50 select-none"
                            onClick={() => handleSort("amount")}
                            data-testid="sort-amount"
                          >
                            <div className="flex items-center">
                              Loan Amount
                              <SortIcon field="amount" />
                            </div>
                          </TableHead>
                          <TableHead 
                            className="cursor-pointer hover:bg-muted/50 select-none"
                            onClick={() => handleSort("period")}
                            data-testid="sort-period"
                          >
                            <div className="flex items-center">
                              Period
                              <SortIcon field="period" />
                            </div>
                          </TableHead>
                          <TableHead 
                            className="cursor-pointer hover:bg-muted/50 select-none"
                            onClick={() => handleSort("yield")}
                            data-testid="sort-yield"
                          >
                            <div className="flex items-center">
                              Interest Rate
                              <SortIcon field="yield" />
                            </div>
                          </TableHead>
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredLoans.map((loan) => (
                          <TableRow key={loan.id} data-testid={`loan-row-${loan.id}`}>
                            <TableCell className="font-medium">
                              {loan.currency} {formatCurrency(parseFloat(loan.amount)).replace('€', '').replace('$', '')}
                            </TableCell>
                            <TableCell>{loan.termMonths} months</TableCell>
                            <TableCell>{parseFloat(loan.interestRate).toFixed(1)}%</TableCell>
                            <TableCell>
                              {statusFilter === "available" ? (
                                <Button
                                  variant="link"
                                  className={`text-primary p-0 h-auto ${isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
                                  onClick={() => !isAdmin && handleFundLoan(loan.id)}
                                  disabled={isAdmin}
                                  title={isAdmin ? 'Admin accounts cannot fund loans' : undefined}
                                  data-testid={`button-fund-loan-${loan.id}`}
                                >
                                  {isAdmin ? 'View only' : 'Investment details'}
                                </Button>
                              ) : (
                                <span className="text-sm text-muted-foreground">View details</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

        </TabsContent>

        <TabsContent value="active" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>My Investments</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Track the status and details of your investments
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  className="flex items-center gap-2"
                  data-testid="button-refresh-active"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {lenderLoans.filter(loan => loan.status === 'active' || loan.status === 'repayment_pending').length > 0 ? (
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
                    {lenderLoans
                      .filter(loan => loan.status === 'active' || loan.status === 'repayment_pending')
                      .map((loan) => {
                        const startDate = loan.activatedAt ? new Date(loan.activatedAt) : new Date();
                        const maturityDate = new Date(startDate.getTime() + loan.termMonths * 30 * 24 * 60 * 60 * 1000);
                        const isExpanded = expandedCollateralLoanId === loan.id;
                        
                        const deposits: Array<{type: string; amount: number; txid: string | null; status: string}> = [];
                        const currentCollateral = parseFloat(loan.collateralBtc || '0');
                        const previousCollateral = parseFloat(loan.previousCollateralBtc || '0');
                        const pendingTopUp = parseFloat(loan.pendingTopUpBtc || '0');
                        
                        if (previousCollateral > 0) {
                          deposits.push({
                            type: 'Initial Deposit',
                            amount: previousCollateral,
                            txid: loan.depositTxid,
                            status: 'confirmed'
                          });
                          if (currentCollateral > previousCollateral) {
                            deposits.push({
                              type: 'Top-Up',
                              amount: currentCollateral - previousCollateral,
                              txid: loan.topUpTxid,
                              status: 'confirmed'
                            });
                          }
                        } else {
                          deposits.push({
                            type: 'Initial Deposit',
                            amount: currentCollateral,
                            txid: loan.depositTxid,
                            status: 'confirmed'
                          });
                        }
                        
                        if (loan.topUpMonitoringActive && pendingTopUp > 0) {
                          deposits.push({
                            type: 'Pending Top-Up',
                            amount: pendingTopUp,
                            txid: loan.topUpTxid,
                            status: loan.topUpDetectedInMempoolAt ? 'mempool' : 'pending'
                          });
                        }
                        
                        return (
                          <>
                            <TableRow key={loan.id} data-testid={`active-loan-row-${loan.id}`}>
                              <TableCell>
                                <button
                                  className="flex items-center gap-1 text-primary hover:underline font-medium"
                                  onClick={() => setExpandedCollateralLoanId(isExpanded ? null : loan.id)}
                                  data-testid={`button-expand-loan-${loan.id}`}
                                >
                                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                  #{loan.id}
                                </button>
                              </TableCell>
                              <TableCell className="font-medium">
                                {loan.currency} {formatCurrency(parseFloat(loan.amount)).replace('€', '').replace('$', '')}
                              </TableCell>
                              <TableCell>
                                <a 
                                  href={`https://mempool.space/testnet4/address/${loan.escrowAddress}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-orange-500 hover:text-orange-600 flex items-center gap-1"
                                >
                                  {parseFloat(loan.collateralBtc || 0).toFixed(8)} BTC
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </TableCell>
                              <TableCell>{parseFloat(loan.interestRate).toFixed(1)}%</TableCell>
                              <TableCell>
                                <LtvBatteryIndicator ltv={calculateCurrentLtv(loan)} size="sm" />
                              </TableCell>
                              <TableCell>
                                {maturityDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </TableCell>
                              <TableCell>
                                {loan.status === 'repayment_pending' ? (
                                  <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-100">
                                    Repayment Sent
                                  </Badge>
                                ) : (
                                  <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-100">
                                    Active
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                {loan.status === 'repayment_pending' ? (
                                  <Button
                                    size="sm"
                                    className="bg-green-600 hover:bg-green-700 text-white text-xs"
                                    onClick={async () => {
                                      try {
                                        const res = await apiRequest(`/api/loans/${loan.id}/confirm-receipt`, "POST", {});
                                        const data = await res.json();
                                        if (data.success) {
                                          toast({
                                            title: "Repayment Confirmed!",
                                            description: data.message,
                                          });
                                          queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/loans/enriched`] });
                                        }
                                      } catch (error: any) {
                                        toast({
                                          title: "Error",
                                          description: error.message || "Failed to confirm receipt",
                                          variant: "destructive",
                                        });
                                      }
                                    }}
                                    data-testid={`button-confirm-receipt-${loan.id}`}
                                  >
                                    Confirm Receipt
                                  </Button>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setActiveDetailLoan(loan)}
                                    data-testid={`button-view-active-${loan.id}`}
                                  >
                                    Details
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                            
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
                                                <span className={deposit.type.includes('Top-Up') ? 'text-amber-600 font-medium' : ''}>
                                                  {deposit.type}
                                                </span>
                                              </td>
                                              <td className="p-2 font-mono text-xs">{deposit.amount.toFixed(8)} BTC</td>
                                              <td className="p-2">
                                                {deposit.status === 'confirmed' && (
                                                  <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-xs">
                                                    Confirmed
                                                  </Badge>
                                                )}
                                                {deposit.status === 'mempool' && (
                                                  <Badge variant="secondary" className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300 text-xs">
                                                    In Mempool
                                                  </Badge>
                                                )}
                                                {deposit.status === 'pending' && (
                                                  <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 text-xs">
                                                    Monitoring
                                                  </Badge>
                                                )}
                                              </td>
                                              <td className="p-2">
                                                {deposit.txid ? (
                                                  <a
                                                    href={`https://mempool.space/testnet4/tx/${deposit.txid}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-500 hover:text-blue-700 flex items-center gap-1 font-mono text-xs"
                                                  >
                                                    {deposit.txid.slice(0, 8)}...{deposit.txid.slice(-6)}
                                                    <ExternalLink className="h-3 w-3" />
                                                  </a>
                                                ) : (
                                                  <span className="text-gray-400 text-xs">-</span>
                                                )}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                    
                                    {/* Escrow Address */}
                                    {loan.escrowAddress && (
                                      <div className="text-sm text-muted-foreground">
                                        Escrow Address:{' '}
                                        <a
                                          href={`https://mempool.space/testnet4/address/${loan.escrowAddress}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-blue-500 hover:underline font-mono"
                                        >
                                          {loan.escrowAddress.slice(0, 12)}...{loan.escrowAddress.slice(-8)}
                                          <ExternalLink className="h-3 w-3 inline ml-1" />
                                        </a>
                                      </div>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </>
                        );
                      })}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">
                    No active investments yet. Complete the loan flow to see active loans here.
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
      </div>
      
      {/* Funding Modal */}
      {selectedLoan && (
        <LenderFundingModal
          isOpen={fundingModalOpen}
          onClose={() => {
            setFundingModalOpen(false);
            setSelectedLoan(null);
          }}
          loan={selectedLoan}
          userId={userId}
        />
      )}

      {/* Signing Ceremony Modal */}
      {signingLoan && (
        <SigningCeremonyModal
          isOpen={!!signingLoan}
          onClose={() => {
            setSigningLoan(null);
            queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/loans/enriched`] });
          }}
          loan={{
            id: signingLoan.id,
            amount: signingLoan.amount,
            currency: signingLoan.currency,
            collateralBtc: signingLoan.collateralBtc,
            termMonths: signingLoan.termMonths,
            escrowAddress: signingLoan.escrowAddress,
          }}
          role="lender"
          userId={userId}
        />
      )}

      {/* Active Loan Details Modal */}
      {activeDetailLoan && (
        <Dialog open={!!activeDetailLoan} onOpenChange={() => setActiveDetailLoan(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Investment Details</DialogTitle>
            </DialogHeader>
            
            {(() => {
              const loan = activeDetailLoan;
              const startDate = loan.activatedAt ? new Date(loan.activatedAt) : new Date();
              const maturityDate = new Date(startDate.getTime() + loan.termMonths * 30 * 24 * 60 * 60 * 1000);
              const daysRemaining = Math.max(0, Math.ceil((maturityDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
              const totalOwed = parseFloat(loan.amount) * (1 + (parseFloat(loan.interestRate) / 100) * (loan.termMonths / 12));
              const liquidationPrice = parseFloat(loan.collateralBtc) > 0 
                ? parseFloat(loan.amount) / parseFloat(loan.collateralBtc) 
                : 0;
              
              return (
                <div className="space-y-4">
                  {/* Header Card */}
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-lg p-4 border">
                    <div className="flex justify-between items-start">
                      <div>
                        <Badge className="bg-green-100 text-green-700 mb-2">
                          ACTIVE INVESTMENT
                        </Badge>
                        <p className="text-2xl font-bold">
                          {loan.currency} {formatCurrency(parseFloat(loan.amount)).replace('€', '').replace('$', '')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Maturity Date</p>
                        <p className="font-semibold">
                          {maturityDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                        <p className="text-sm text-muted-foreground mt-2">Period & Interest</p>
                        <p className="font-semibold">
                          {loan.termMonths} months / {parseFloat(loan.interestRate).toFixed(1)}% p.a.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Details Section */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Investment details</span>
                      <span className="font-mono text-xs">ID: {loan.id.toString().slice(0, 8)}</span>
                    </div>
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-900/30 rounded-lg p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Collateral</span>
                      <span className="font-semibold text-orange-500" data-testid="text-collateral">
                        {parseFloat(loan.collateralBtc).toFixed(5)} BTC
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Bitcoin Liquidation Price</span>
                      <span className="font-semibold text-red-500" data-testid="text-liquidation-price">
                        {loan.currency} {formatCurrency(liquidationPrice).replace('€', '').replace('$', '')}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Investment Start Date</span>
                      <span className="font-semibold" data-testid="text-start-date">
                        {startDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Days Remaining</span>
                      <span className="font-semibold" data-testid="text-days-remaining">
                        {daysRemaining}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Amount Owed</span>
                      <span className="font-semibold text-green-600" data-testid="text-amount-owed">
                        {loan.currency} {formatCurrency(totalOwed).replace('€', '').replace('$', '')}
                      </span>
                    </div>
                  </div>

                  {/* Collateral Deposit History */}
                  {(() => {
                    const deposits = [];
                    const currentCollateral = parseFloat(loan.collateralBtc || 0);
                    const previousCollateral = parseFloat(loan.previousCollateralBtc || 0);
                    const pendingTopUp = parseFloat(loan.pendingTopUpBtc || 0);
                    
                    if (previousCollateral > 0) {
                      deposits.push({
                        type: 'Initial Deposit',
                        amount: previousCollateral,
                        txid: loan.depositTxid,
                        status: 'confirmed'
                      });
                      if (currentCollateral > previousCollateral) {
                        deposits.push({
                          type: 'Top-Up',
                          amount: currentCollateral - previousCollateral,
                          txid: loan.topUpTxid,
                          status: 'confirmed'
                        });
                      }
                    } else {
                      deposits.push({
                        type: 'Initial Deposit',
                        amount: currentCollateral,
                        txid: loan.depositTxid,
                        status: 'confirmed'
                      });
                    }
                    
                    if (loan.topUpMonitoringActive && pendingTopUp > 0) {
                      deposits.push({
                        type: 'Pending Top-Up',
                        amount: pendingTopUp,
                        txid: loan.topUpTxid,
                        status: loan.topUpDetectedInMempoolAt ? 'mempool' : 'pending'
                      });
                    }
                    
                    return (
                      <div className="space-y-2">
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
                                    <span className={deposit.type.includes('Top-Up') ? 'text-amber-600 font-medium' : ''}>
                                      {deposit.type}
                                    </span>
                                  </td>
                                  <td className="p-2 font-mono text-xs">{deposit.amount.toFixed(8)} BTC</td>
                                  <td className="p-2">
                                    {deposit.status === 'confirmed' && (
                                      <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-xs">
                                        ✓ Confirmed
                                      </Badge>
                                    )}
                                    {deposit.status === 'mempool' && (
                                      <Badge variant="secondary" className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300 text-xs">
                                        ⏳ Mempool
                                      </Badge>
                                    )}
                                    {deposit.status === 'pending' && (
                                      <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 text-xs">
                                        🔍 Monitoring
                                      </Badge>
                                    )}
                                  </td>
                                  <td className="p-2">
                                    {deposit.txid ? (
                                      <a
                                        href={`https://mempool.space/testnet4/tx/${deposit.txid}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-500 hover:text-blue-700 flex items-center gap-1 font-mono text-xs"
                                      >
                                        {deposit.txid.slice(0, 6)}...
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                    ) : (
                                      <span className="text-gray-400 text-xs">-</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Escrow Link */}
                  {loan.escrowAddress && (
                    <div className="text-center">
                      <a 
                        href={`https://mempool.space/testnet4/address/${loan.escrowAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center justify-center gap-1"
                        data-testid="link-escrow-mempool"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        View Escrow on Mempool
                      </a>
                    </div>
                  )}

                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => setActiveDetailLoan(null)}
                    data-testid="button-back-to-list"
                  >
                    ← Back to list
                  </Button>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>
      )}

      {/* Resolution Confirmation Modal - Bitcoin-Blind Lender Model */}
      {signingResolution && (
        <Dialog open={!!signingResolution} onOpenChange={() => setSigningResolution(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileSignature className="h-5 w-5 text-orange-500" />
                Confirm Resolution
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  The dispute for Loan #{signingResolution.loanId.toString().padStart(6, '0')} has been resolved. 
                  By confirming, you authorize the release of collateral according to the distribution below.
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-green-50 dark:bg-green-900/30 rounded-lg border border-green-200 dark:border-green-800">
                  <p className="text-sm text-muted-foreground">Your Payout</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {(signingResolution.lenderPayoutSats / 100_000_000).toFixed(8)} BTC
                  </p>
                  <p className="text-sm text-muted-foreground">
                    (€{(signingResolution.lenderPayoutSats / 100_000_000 * signingResolution.btcPriceEur).toFixed(2)})
                  </p>
                  <p className="text-xs text-muted-foreground mt-2 font-mono break-all">
                    → {signingResolution.lenderAddress}
                  </p>
                </div>
                <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border">
                  <p className="text-sm text-muted-foreground">Borrower Receives</p>
                  <p className="text-2xl font-bold">
                    {(signingResolution.borrowerPayoutSats / 100_000_000).toFixed(8)} BTC
                  </p>
                  <p className="text-sm text-muted-foreground">
                    (€{(signingResolution.borrowerPayoutSats / 100_000_000 * signingResolution.btcPriceEur).toFixed(2)})
                  </p>
                  <p className="text-xs text-muted-foreground mt-2 font-mono break-all">
                    → {signingResolution.borrowerAddress}
                  </p>
                </div>
              </div>
              
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border">
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Secure Platform Signing</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Your confirmation authorizes the platform to complete the transaction on your behalf. 
                      No Bitcoin wallet or keys required.
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => setSigningResolution(null)}
                  data-testid="button-cancel-signing"
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-orange-500 hover:bg-orange-600"
                  disabled={signResolutionMutation.isPending}
                  onClick={() => {
                    // Bitcoin-blind lender: No PSBT needed, platform signs with controlled lender key
                    signResolutionMutation.mutate({
                      loanId: signingResolution.loanId,
                      signedPsbtBase64: "PLATFORM_CONTROLLED_SIGNING",
                    });
                  }}
                  data-testid="button-confirm-resolution"
                >
                  {signResolutionMutation.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Confirm & Release Funds
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </FirefishWASMProvider>
  );
}
