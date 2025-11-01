import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { TrendingUp, DollarSign, PiggyBank, Percent, RefreshCw, Trophy } from "lucide-react";
import StatsCard from "@/components/stats-card";
import LoanCard from "@/components/loan-card";
import LenderFundingModal from "@/components/lender-funding-modal";
import { AchievementsDashboard } from "@/components/achievements-dashboard";
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
  
  // Funding modal state
  const [fundingModalOpen, setFundingModalOpen] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);

  // Get actual authenticated user ID
  const userId = user?.id ?? 0;

  const { data: userLoans = [], isLoading: loansLoading } = useQuery<any[]>({
    queryKey: [`/api/users/${userId}/loans/enriched`],
  });

  const { data: allLoans = [], isLoading: availableLoading } = useQuery<Loan[]>({
    queryKey: ["/api/loans"],
  });

  const lenderLoans = userLoans.filter(loan => loan.lenderId === userId);
  const activeInvestments = lenderLoans.filter(loan => loan.status === "active");
  
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

    return filtered;
  }, [allLoans, statusFilter, minAmount, maxAmount, selectedCurrency, selectedTerms]);

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

  return (
    <FirefishWASMProvider>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Lender Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-300 mt-2">Invest in Bitcoin-secured loans and earn fixed returns</p>
        </div>

        <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pending-transfers">Pending Transfers</TabsTrigger>
          <TabsTrigger value="loans">Available Loans</TabsTrigger>
          <TabsTrigger value="achievements">Achievements</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
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
              value={formatCurrency(totalInvested)}
              icon={DollarSign}
              iconColor="text-green-600"
            />
            <StatsCard
              title="Interest Earned"
              value={formatCurrency(interestEarned)}
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
              {lenderLoans.filter(loan => loan.status === "funding").length > 0 ? (
                <div className="space-y-4">
                  {lenderLoans.filter(loan => loan.status === "funding").map((loan) => (
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
                              href={`https://blockstream.info/testnet/address/${loan.escrowAddress}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              🔍 Verify on Blockchain →
                            </a>
                          </div>

                          {/* Bank Account Details */}
                          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-300 dark:border-yellow-800">
                            <h4 className="font-semibold mb-3 text-yellow-800 dark:text-yellow-200">
                              📤 Send Funds To:
                            </h4>
                            {loan.borrower?.bankAccountHolder || loan.borrower?.bankAccountNumber ? (
                              <div className="grid grid-cols-2 gap-3 text-sm">
                                {loan.borrower?.bankAccountHolder && (
                                  <div>
                                    <p className="text-muted-foreground">Account Holder</p>
                                    <p className="font-medium">{loan.borrower.bankAccountHolder}</p>
                                  </div>
                                )}
                                {loan.borrower?.bankAccountNumber && (
                                  <div>
                                    <p className="text-muted-foreground">Account Number</p>
                                    <p className="font-medium font-mono">{loan.borrower.bankAccountNumber}</p>
                                  </div>
                                )}
                                {loan.borrower?.bankName && (
                                  <div>
                                    <p className="text-muted-foreground">Bank Name</p>
                                    <p className="font-medium">{loan.borrower.bankName}</p>
                                  </div>
                                )}
                                {loan.borrower?.bankRoutingNumber && (
                                  <div>
                                    <p className="text-muted-foreground">Routing/SWIFT</p>
                                    <p className="font-medium font-mono">{loan.borrower.bankRoutingNumber}</p>
                                  </div>
                                )}
                                {loan.borrower?.bankCountry && (
                                  <div>
                                    <p className="text-muted-foreground">Country</p>
                                    <p className="font-medium">{loan.borrower.bankCountry}</p>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded border border-red-200 dark:border-red-800">
                                <p className="text-sm text-red-600 dark:text-red-400">
                                  ⚠️ Borrower has not provided bank account details yet
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Please contact the borrower ({loan.borrower?.email}) to provide their bank information
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Action Button */}
                          <div className="pt-2">
                            <Button 
                              className="w-full bg-gradient-to-r from-yellow-500 to-blue-500 hover:from-yellow-600 hover:to-blue-600 text-white"
                              data-testid={`button-confirm-transfer-${loan.id}`}
                            >
                              ✓ I've Sent the Funds
                            </Button>
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
                    <div className="space-y-4">
                      {filteredLoans.map((loan) => (
                        <LoanCard
                          key={loan.id}
                          loan={loan}
                          onFund={handleFundLoan}
                          showFundButton={statusFilter === "available"}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

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
          loanId={selectedLoan.id}
          loanAmount={selectedLoan.amount}
          currency={selectedLoan.currency}
        />
      )}
    </FirefishWASMProvider>
  );
}
