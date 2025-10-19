import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Coins, DollarSign, Bitcoin, TrendingUp, Trophy } from "lucide-react";
import StatsCard from "@/components/stats-card";
import LoanCalculator from "@/components/loan-calculator";
import { AchievementsDashboard } from "@/components/achievements-dashboard";
import EscrowSetup from "@/components/escrow-setup";
import FundingTracker from "@/components/funding-tracker";
import { FirefishWASMProvider } from "@/contexts/FirefishWASMContext";
import { formatCurrency, formatBTC, formatPercentage, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { Loan } from "@shared/schema";

export default function BorrowerDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Mock user ID - in real app, get from authentication
  const userId = 1;

  const { data: userLoans = [], isLoading } = useQuery<Loan[]>({
    queryKey: ["/api/users", userId, "loans"],
  });

  const borrowerLoans = userLoans.filter(loan => loan.borrowerId === userId);
  const activeLoans = borrowerLoans.filter(loan => loan.status === "active");
  
  const totalBorrowed = activeLoans.reduce((sum, loan) => sum + parseFloat(loan.amount), 0);
  const totalCollateral = activeLoans.reduce((sum, loan) => sum + parseFloat(loan.collateralBtc), 0);
  const avgLTV = activeLoans.length > 0 
    ? activeLoans.reduce((sum, loan) => sum + parseFloat(loan.ltvRatio), 0) / activeLoans.length 
    : 0;

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

        <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="loans">Loans</TabsTrigger>
          <TabsTrigger value="escrow">Escrow</TabsTrigger>
          <TabsTrigger value="achievements">Achievements</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
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
              <CardTitle>Your Active Loans</CardTitle>
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
          {/* Escrow Management for Borrowers */}
          <Card>
            <CardHeader>
              <CardTitle>Bitcoin Collateral Management</CardTitle>
              <p className="text-sm text-muted-foreground">
                Manage Bitcoin escrow for your funded loans
              </p>
            </CardHeader>
            <CardContent>
              {borrowerLoans.filter(loan => loan.status === 'escrow_pending' || loan.status === 'active').length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">
                    No loans requiring escrow setup. Wait for a lender to accept your loan request.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {borrowerLoans
                    .filter(loan => loan.status === 'escrow_pending' || loan.status === 'active')
                    .map((loan) => (
                      <div key={loan.id} className="border rounded-lg p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold">Loan #{loan.id}</h3>
                            <p className="text-sm text-muted-foreground">
                              Borrowed: {formatCurrency(parseFloat(loan.amount))} · {loan.termMonths} months · {formatPercentage(loan.interestRate)} APY
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Required Collateral</p>
                            <p className="font-semibold text-orange-600">{parseFloat(loan.collateralBtc).toFixed(8)} BTC</p>
                          </div>
                        </div>

                        {loan.status === 'escrow_pending' && !loan.escrowAddress && (
                          <EscrowSetup
                            loanId={loan.id}
                            role="borrower"
                            onEscrowCreated={(sessionId, address) => {
                              toast({
                                title: 'Escrow Created',
                                description: `Send Bitcoin to: ${address.slice(0, 20)}...`,
                              });
                              queryClient.invalidateQueries({ queryKey: ["/api/users", userId, "loans"] });
                            }}
                          />
                        )}

                        {loan.escrowAddress && (
                          <FundingTracker
                            escrowAddress={loan.escrowAddress}
                            expectedAmountBTC={parseFloat(loan.collateralBtc)}
                            autoStart={loan.status === 'escrow_pending'}
                            onFunded={(txid, confirmations) => {
                              toast({
                                title: 'Collateral Confirmed',
                                description: `Your loan is now active! TXID: ${txid.slice(0, 20)}...`,
                              });
                              queryClient.invalidateQueries({ queryKey: ["/api/users", userId, "loans"] });
                            }}
                          />
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
