import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, DollarSign, PiggyBank, Percent, RefreshCw } from "lucide-react";
import StatsCard from "@/components/stats-card";
import LoanCard from "@/components/loan-card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, formatPercentage, formatDate } from "@/lib/utils";
import type { Loan } from "@shared/schema";

export default function LenderDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [termFilter, setTermFilter] = useState("all");

  // Mock user ID - in real app, get from authentication
  const userId = 2;

  const { data: userLoans = [], isLoading: loansLoading } = useQuery<Loan[]>({
    queryKey: ["/api/users", userId, "loans"],
  });

  const { data: availableLoans = [], isLoading: availableLoading } = useQuery<Loan[]>({
    queryKey: ["/api/loans", "available"],
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

  const fundLoan = useMutation({
    mutationFn: async (loanId: number) => {
      const response = await apiRequest(`/api/loans/${loanId}/fund`, "POST", {
        lenderId: 3 // Jorge's lender ID
      });
      return await response.json();
    },
    onSuccess: (data) => {
      const escrowAddr = data?.escrowAddress || 'Not available';
      toast({
        title: "Loan Funding Initiated",
        description: `Bitcoin escrow address generated: ${escrowAddr}. Borrower will be notified to deposit collateral.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", userId, "loans"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to fund loan. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Filter all available loans
  const filteredLoans = availableLoans.filter(loan => {
    if (currencyFilter !== "all" && loan.currency !== currencyFilter) return false;
    if (termFilter !== "all" && loan.termMonths !== parseInt(termFilter)) return false;
    return true;
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/loans", "available"] });
    toast({
      title: "Refreshed",
      description: "Latest loan requests have been loaded.",
    });
  };

  const handleFundLoan = (loanId: number) => {
    fundLoan.mutate(loanId);
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Lender Dashboard</h1>
        <p className="text-gray-600 mt-2">Invest in Bitcoin-secured loans and earn fixed returns</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
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

      {/* Available Loan Requests */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <CardTitle>Available Loan Requests</CardTitle>
              <span className="text-sm text-gray-500">
                ({filteredLoans.length} available)
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                className="flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
              <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All Currencies" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Currencies</SelectItem>
                  <SelectItem value="USDC">USDC</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="CHF">CHF</SelectItem>
                </SelectContent>
              </Select>
              <Select value={termFilter} onValueChange={setTermFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="All Terms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Terms</SelectItem>
                  <SelectItem value="3">3 months</SelectItem>
                  <SelectItem value="6">6 months</SelectItem>
                  <SelectItem value="12">12 months</SelectItem>
                  <SelectItem value="18">18 months</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredLoans.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No loan requests match your filters.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredLoans.map((loan) => (
                <LoanCard
                  key={loan.id}
                  loan={loan}
                  onFund={handleFundLoan}
                  showFundButton={true}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Your Investments */}
      <Card>
        <CardHeader>
          <CardTitle>Your Active Investments</CardTitle>
        </CardHeader>
        <CardContent>
          {lenderLoans.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No active investments. Fund a loan above to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Loan ID</TableHead>
                    <TableHead>Amount Invested</TableHead>
                    <TableHead>Interest Rate</TableHead>
                    <TableHead>Term</TableHead>
                    <TableHead>Expected Return</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lenderLoans.map((loan) => {
                    const principal = parseFloat(loan.amount);
                    const rate = parseFloat(loan.interestRate) / 100;
                    const expectedReturn = principal * (1 + rate * loan.termMonths / 12);
                    
                    return (
                      <TableRow key={loan.id}>
                        <TableCell className="font-medium">#{loan.id}</TableCell>
                        <TableCell>{formatCurrency(loan.amount, loan.currency)}</TableCell>
                        <TableCell>{formatPercentage(loan.interestRate)}</TableCell>
                        <TableCell>{loan.termMonths} months</TableCell>
                        <TableCell className="font-semibold text-green-600">
                          {formatCurrency(expectedReturn, loan.currency)}
                        </TableCell>
                        <TableCell>
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                            Active
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
