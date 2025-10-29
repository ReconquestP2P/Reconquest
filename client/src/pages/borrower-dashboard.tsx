import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Coins, DollarSign, Bitcoin, TrendingUp, Trophy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import StatsCard from "@/components/stats-card";
import LoanCalculator from "@/components/loan-calculator";
import { AchievementsDashboard } from "@/components/achievements-dashboard";
import EscrowSetup from "@/components/escrow-setup";
import FundingTracker from "@/components/funding-tracker";
import { FirefishWASMProvider } from "@/contexts/FirefishWASMContext";
import { formatCurrency, formatBTC, formatPercentage, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { Loan } from "@shared/schema";

export default function BorrowerDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Get actual authenticated user ID
  const userId = user?.id ?? 0;

  const { data: userLoans = [], isLoading } = useQuery<Loan[]>({
    queryKey: [`/api/users/${userId}/loans`],
  });

  const borrowerLoans = userLoans.filter(loan => loan.borrowerId === userId);
  const activeLoans = borrowerLoans.filter(loan => loan.status === "active");
  
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

  const getLTVBadge = (ltv: string) => {
    const ltvNum = parseFloat(ltv);
    if (ltvNum < 50) return <Badge className="bg-green-100 text-green-800">{formatPercentage(ltv)}</Badge>;
    if (ltvNum < 70) return <Badge className="bg-yellow-100 text-yellow-800">{formatPercentage(ltv)}</Badge>;
    return <Badge className="bg-red-100 text-red-800">{formatPercentage(ltv)}</Badge>;
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
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="request">Request Loan</TabsTrigger>
          <TabsTrigger value="escrow">Escrow Pending</TabsTrigger>
          <TabsTrigger value="loans">Active Loans</TabsTrigger>
          <TabsTrigger value="achievements">Achievements</TabsTrigger>
        </TabsList>

        <TabsContent value="request" className="space-y-6">
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
              value={formatCurrency(totalBorrowed)}
              icon={DollarSign}
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
              {borrowerLoans.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">No loans found. Create your first loan request in the Overview tab.</p>
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
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {borrowerLoans.map((loan) => (
                        <TableRow key={loan.id}>
                          <TableCell className="font-medium">#{loan.id}</TableCell>
                          <TableCell>{formatCurrency(loan.amount, loan.currency)}</TableCell>
                          <TableCell>{formatBTC(loan.collateralBtc)}</TableCell>
                          <TableCell>{formatPercentage(loan.interestRate)}</TableCell>
                          <TableCell>{getLTVBadge(loan.ltvRatio)}</TableCell>
                          <TableCell>
                            {loan.dueDate ? formatDate(loan.dueDate) : "TBD"}
                          </TableCell>
                          <TableCell>{getStatusBadge(loan.status)}</TableCell>
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
              {borrowerLoans.filter(loan => loan.status === 'funding').length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">
                    No loans awaiting BTC deposit. Once a lender accepts your loan request, it will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {borrowerLoans
                    .filter(loan => loan.status === 'funding')
                    .map((loan) => (
                      <div key={loan.id} className="border rounded-lg p-6 space-y-4 bg-gradient-to-br from-orange-50 to-blue-50 dark:from-orange-950 dark:to-blue-950">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold text-lg">Loan #{loan.id}</h3>
                            <p className="text-sm text-muted-foreground">
                              Amount: {formatCurrency(parseFloat(loan.amount), loan.currency)} · {loan.termMonths} months · {formatPercentage(loan.interestRate)} APY
                            </p>
                          </div>
                          <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100">
                            Awaiting Deposit
                          </Badge>
                        </div>

                        {loan.escrowAddress ? (
                          <>
                            <div className="bg-white dark:bg-gray-900 rounded-lg p-4 space-y-3">
                              <div>
                                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1">
                                  Bitcoin Escrow Address (Testnet)
                                </p>
                                <div className="flex items-center gap-2">
                                  <code className="text-sm bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded font-mono break-all">
                                    {loan.escrowAddress}
                                  </code>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(loan.escrowAddress!);
                                      toast({ title: "Copied!", description: "Escrow address copied to clipboard" });
                                    }}
                                    className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-xs whitespace-nowrap"
                                    data-testid={`button-copy-address-${loan.id}`}
                                  >
                                    Copy
                                  </button>
                                </div>
                              </div>

                              <div>
                                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1">
                                  Required Collateral
                                </p>
                                <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                                  {parseFloat(loan.collateralBtc).toFixed(8)} BTC
                                </p>
                              </div>

                              <div className="flex gap-2 pt-2">
                                <a
                                  href={`https://blockstream.info/testnet/address/${loan.escrowAddress}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex-1 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-center text-sm font-medium"
                                  data-testid={`link-blockstream-${loan.id}`}
                                >
                                  🔍 View on Blockchain
                                </a>
                              </div>
                            </div>

                            <FundingTracker
                              escrowAddress={loan.escrowAddress}
                              expectedAmountBTC={parseFloat(loan.collateralBtc)}
                              autoStart={true}
                              onFunded={(txid, confirmations) => {
                                toast({
                                  title: '✅ BTC Deposit Confirmed!',
                                  description: `Your loan is now active! TXID: ${txid.slice(0, 20)}...`,
                                });
                                queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/loans`] });
                              }}
                            />
                          </>
                        ) : (
                          <div className="text-center py-4 text-gray-500">
                            Generating escrow address...
                          </div>
                        )}
                      </div>
                    ))}
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
    </FirefishWASMProvider>
  );
}
