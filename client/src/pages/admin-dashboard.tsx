import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, Shield, TrendingUp, Users, Lock } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { Loan } from "@shared/schema";
import BitcoinPriceOracle from "@/components/bitcoin-price-oracle";

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

  const { data: adminStats, isLoading: statsLoading } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
    refetchInterval: 30000, // Refresh every 30 seconds
    enabled: isAuthenticated, // Only fetch when authenticated
  });

  const { data: loans, isLoading: loansLoading, refetch } = useQuery<LoanWithLtv[]>({
    queryKey: ["/api/admin/loans"],
    refetchInterval: 30000, // Refresh every 30 seconds
    enabled: isAuthenticated, // Only fetch when authenticated
  });

  const { data: btcPrice } = useQuery({
    queryKey: ["/api/btc-price"],
    refetchInterval: 30000,
    enabled: isAuthenticated, // Only fetch when authenticated
  });

  const handleRefresh = () => {
    refetch();
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Check if both email and password are correct
    if (adminEmail === "admin@reconquestp2p.com" && adminPassword === "admin123") {
      setIsAuthenticated(true);
      setAuthError("");
    } else {
      setAuthError("Invalid admin credentials. Please check your email and password.");
    }
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
                <Button type="submit" className="w-full">
                  Access Dashboard
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (statsLoading || loansLoading) {
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
            onClick={() => setIsAuthenticated(false)} 
            variant="destructive" 
            className="gap-2"
          >
            <Lock className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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

      {/* Loans Table */}
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
    </div>
  );
}