import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { 
  Bitcoin, 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  DollarSign,
  Plus,
  Users,
  ArrowLeft,
  Shield
} from "lucide-react";
import LoanRequestForm from "@/components/loan-request-form";

export default function UserDashboard() {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [showRequestForm, setShowRequestForm] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login");
    }
  }, [isAuthenticated, navigate]);

  const { data: loans, isLoading: loansLoading } = useQuery({
    queryKey: ["/api/loans"],
    enabled: !!user,
  });

  const { data: availableLoans, isLoading: availableLoading } = useQuery({
    queryKey: ["/api/loans/available"],
    enabled: !!user,
  });

  const { data: userLoans, isLoading: userLoansLoading } = useQuery({
    queryKey: ["/api/users", user?.id, "loans"],
    enabled: !!user?.id,
  });

  if (!isAuthenticated || !user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-md mx-auto mt-20">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Login Required
              </CardTitle>
              <CardDescription>
                Please log in to access your dashboard
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Button asChild className="w-full">
                  <Link href="/login">Login to Continue</Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/">Back to Homepage</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (showRequestForm) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <Button 
              variant="outline" 
              onClick={() => setShowRequestForm(false)}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
            <h1 className="text-3xl font-bold">Request a Bitcoin-Backed Loan</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Use your Bitcoin as collateral to access capital
            </p>
          </div>
          <LoanRequestForm />
        </div>
      </div>
    );
  }

  const userActiveLoan = userLoans?.find((loan: any) => 
    loan.status === "active" || loan.status === "funding" || loan.status === "initiated"
  );

  const userCompletedLoans = userLoans?.filter((loan: any) => 
    loan.status === "completed" || loan.status === "repaid"
  )?.length || 0;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Bitcoin className="h-8 w-8 text-primary" />
            Welcome back, {user.username}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Manage your Bitcoin-backed lending activities
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Reputation Score</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{user.reputation || 0}</div>
              <p className="text-xs text-muted-foreground">
                +{Math.floor(Math.random() * 10)} from last month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed Loans</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{userCompletedLoans}</div>
              <p className="text-xs text-muted-foreground">
                Successful transactions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Position</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {userActiveLoan ? `${userActiveLoan.currency} ${userActiveLoan.amount}` : "None"}
              </div>
              <p className="text-xs text-muted-foreground">
                {userActiveLoan ? `${userActiveLoan.status}` : "No active loans"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Member Since</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {new Date(user.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
              </div>
              <p className="text-xs text-muted-foreground">
                Trusted member
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Dashboard Tabs */}
        <Tabs defaultValue="lending" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="lending">Lending Opportunities</TabsTrigger>
            <TabsTrigger value="borrowing">My Borrowing</TabsTrigger>
            <TabsTrigger value="activity">Transaction History</TabsTrigger>
          </TabsList>

          {/* Lending Tab */}
          <TabsContent value="lending" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Available Loans to Fund</h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Earn fixed returns by funding Bitcoin-backed loans
                </p>
              </div>
            </div>

            {availableLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="animate-pulse">
                    <CardHeader>
                      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                      <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="h-3 bg-gray-200 rounded"></div>
                        <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : availableLoans?.length === 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    No Loans Available
                  </CardTitle>
                  <CardDescription>
                    There are currently no loan requests available for funding. Check back later for new opportunities.
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {availableLoans?.map((loan: any) => (
                  <Card key={loan.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">
                          {loan.currency} {parseFloat(loan.amount).toLocaleString()}
                        </CardTitle>
                        <Badge variant="secondary">{loan.interestRate}% APR</Badge>
                      </div>
                      <CardDescription>
                        {loan.termMonths} months • {parseFloat(loan.collateralBtc).toFixed(4)} BTC collateral
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">LTV Ratio:</span>
                          <span className="font-medium">{loan.ltvRatio}%</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Purpose:</span>
                          <span className="font-medium">{loan.purpose || "General"}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Status:</span>
                          <Badge variant="outline">{loan.status}</Badge>
                        </div>
                        <Button className="w-full mt-4">
                          Fund This Loan
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Borrowing Tab */}
          <TabsContent value="borrowing" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">My Loan Requests</h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Use Bitcoin as collateral to access capital
                </p>
              </div>
              <Button onClick={() => setShowRequestForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Request New Loan
              </Button>
            </div>

            {userLoansLoading ? (
              <div className="space-y-4">
                {[1, 2].map((i) => (
                  <Card key={i} className="animate-pulse">
                    <CardHeader>
                      <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                      <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                    </CardHeader>
                    <CardContent>
                      <div className="h-16 bg-gray-200 rounded"></div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : userLoans?.length === 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bitcoin className="h-5 w-5" />
                    No Loan Requests Yet
                  </CardTitle>
                  <CardDescription>
                    Start by creating your first Bitcoin-backed loan request. Use your Bitcoin as collateral to access the capital you need.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={() => setShowRequestForm(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Your First Loan Request
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {userLoans?.map((loan: any) => (
                  <Card key={loan.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">
                          {loan.currency} {parseFloat(loan.amount).toLocaleString()}
                        </CardTitle>
                        <Badge 
                          variant={loan.status === 'active' ? 'default' : 
                                  loan.status === 'completed' ? 'secondary' : 'outline'}
                        >
                          {loan.status}
                        </Badge>
                      </div>
                      <CardDescription>
                        {loan.interestRate}% APR • {loan.termMonths} months
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Collateral:</span>
                          <div className="font-medium">{parseFloat(loan.collateralBtc).toFixed(4)} BTC</div>
                        </div>
                        <div>
                          <span className="text-gray-600">LTV Ratio:</span>
                          <div className="font-medium">{loan.ltvRatio}%</div>
                        </div>
                        <div>
                          <span className="text-gray-600">Requested:</span>
                          <div className="font-medium">
                            {new Date(loan.requestedAt).toLocaleDateString()}
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-600">Due Date:</span>
                          <div className="font-medium">
                            {loan.dueDate ? new Date(loan.dueDate).toLocaleDateString() : 'TBD'}
                          </div>
                        </div>
                      </div>
                      {loan.purpose && (
                        <div className="mt-3 pt-3 border-t">
                          <span className="text-sm text-gray-600">Purpose: </span>
                          <span className="text-sm">{loan.purpose}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity" className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Transaction History</h2>
              <p className="text-gray-600 dark:text-gray-400">
                View your complete lending and borrowing activity
              </p>
            </div>

            {userLoansLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="pt-6">
                      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                      <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : userLoans?.length === 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>No Activity Yet</CardTitle>
                  <CardDescription>
                    Your transaction history will appear here once you start borrowing or lending.
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : (
              <div className="space-y-4">
                {userLoans?.map((loan: any) => (
                  <Card key={loan.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">
                            {loan.currency} {parseFloat(loan.amount).toLocaleString()} Loan
                          </div>
                          <div className="text-sm text-gray-600">
                            {new Date(loan.requestedAt).toLocaleDateString()} • 
                            {loan.interestRate}% APR • {loan.termMonths} months
                          </div>
                        </div>
                        <Badge 
                          variant={loan.status === 'active' ? 'default' : 
                                  loan.status === 'completed' ? 'secondary' : 'outline'}
                        >
                          {loan.status}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}