import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatBTC, calculateCollateral } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";

interface LoanCalculatorProps {
  disabled?: boolean;
}

export default function LoanCalculator({ disabled = false }: LoanCalculatorProps) {
  const [amount, setAmount] = useState("1000");
  const [currency, setCurrency] = useState("EUR");
  const [term, setTerm] = useState("3");
  const [interestRate, setInterestRate] = useState(5);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: btcPrice } = useQuery({
    queryKey: ["/api/btc-price"],
  });

  const createLoanMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("/api/loans", "POST", {
        amount: loanAmount.toString(),
        currency,
        termMonths: parseInt(term),
        interestRate: interestRate.toString()
        // NO borrowerPubkey - keys generated later after matching
      });
      
      return await response.json();
    },
    onSuccess: (loan: any) => {
      // Reset form to allow creating another loan
      handleNewLoanRequest();
      
      toast({
        title: "Loan Request Posted",
        description: "Your loan request is now visible to lenders! You'll be notified when someone accepts it.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users", 1, "loans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to create loan request: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleNewLoanRequest = () => {
    setAmount("25000");
    setInterestRate(6);
    setTerm("6");
  };

  const loanAmount = parseFloat(amount) || 0;
  // Use currency-specific BTC price
  const currentBtcPrice = currency === "EUR" 
    ? ((btcPrice as any)?.eur || 85000)
    : ((btcPrice as any)?.usd || 100000);
  const requiredCollateral = calculateCollateral(loanAmount, currentBtcPrice);
  
  // Simple interest calculation: Interest = Principal × Rate × Time
  // Time is in years, so divide term (months) by 12
  const annualRate = interestRate / 100;
  const timeInYears = parseInt(term) / 12;
  const totalInterest = loanAmount * annualRate * timeInYears;
  const totalRepayment = loanAmount + totalInterest;
  
  // For display purposes, show monthly breakdown even though interest is paid at end
  const monthlyPayment = totalRepayment / parseInt(term);


  return (
    <Card className="border-gray-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-gray-900">
          Loan Calculator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="amount" className="text-sm font-medium text-gray-700">
              Loan Amount
            </Label>
            <div className="relative mt-1">
              <Input
                id="amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="25000"
                className="pr-24"
              />
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="absolute right-1 top-1 w-20 h-8 border-0 bg-transparent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USDC">USDC</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="term" className="text-sm font-medium text-gray-700">
              Loan Term
            </Label>
            <Select value={term} onValueChange={setTerm}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3 months</SelectItem>
                <SelectItem value="6">6 months</SelectItem>
                <SelectItem value="9">9 months</SelectItem>
                <SelectItem value="12">12 months</SelectItem>
                <SelectItem value="18">18 months</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="interest" className="text-sm font-medium text-gray-700">
              Interest Rate: {interestRate}% p.a.
            </Label>
            <div className="mt-3 px-3">
              <Slider
                value={[interestRate]}
                onValueChange={(value) => setInterestRate(value[0])}
                min={0}
                max={25}
                step={0.5}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>0%</span>
                <span>12.5%</span>
                <span>25%</span>
              </div>
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium text-gray-700">
              Current BTC Price
            </Label>
            <div className="mt-1 p-3 bg-gray-50 rounded-lg">
              <span className="text-lg font-semibold text-gray-900">
                {currency === "EUR" ? "€" : "$"}{currentBtcPrice.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        <div className="border-t pt-6">
          <h4 className="font-semibold text-gray-900 mb-4">Calculation Results</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-orange-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">Required Collateral</p>
              <p className="text-lg font-bold text-orange-600">
                {formatBTC(requiredCollateral)}
              </p>
              <p className="text-xs text-gray-500">2:1 collateral ratio</p>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">Total Interest</p>
              <p className="text-lg font-bold text-blue-600">
                {formatCurrency(totalInterest, currency)}
              </p>
              <p className="text-xs text-gray-500">Paid at loan end</p>
            </div>

            <div className="bg-green-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">Total Repayment</p>
              <p className="text-lg font-bold text-green-600">
                {formatCurrency(monthlyPayment * parseInt(term), currency)}
              </p>
              <p className="text-xs text-gray-500">Principal + Interest</p>
            </div>
          </div>

          {/* Request Loan Button with Confirmation Dialog */}
          <div className="flex justify-center">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  size="lg" 
                  className={`bg-primary hover:bg-primary/90 text-black px-8 py-3 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  disabled={!loanAmount || loanAmount <= 0 || disabled}
                  title={disabled ? 'Admin accounts cannot request loans' : undefined}
                >
                  {disabled ? 'Admin View Only' : 'Publish New Loan'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirm Loan Request</AlertDialogTitle>
                  <AlertDialogDescription>
                    <div className="space-y-2">
                      <span>You are about to request a loan with the following terms:</span>
                      <div className="bg-gray-50 p-4 rounded-lg space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span>Loan Amount:</span>
                          <span className="font-semibold">{formatCurrency(loanAmount, currency)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Required Collateral:</span>
                          <span className="font-semibold">{formatBTC(requiredCollateral)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Term:</span>
                          <span className="font-semibold">{term} months</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Interest Rate:</span>
                          <span className="font-semibold">{interestRate}% p.a.</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Total Interest:</span>
                          <span className="font-semibold">{formatCurrency(totalInterest, currency)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Total Repayment:</span>
                          <span className="font-semibold">{formatCurrency(totalRepayment, currency)}</span>
                        </div>
                      </div>
                      <span className="text-xs text-gray-500 mt-2 block">
                        By confirming, you agree to provide the required Bitcoin collateral and accept the loan terms.
                      </span>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={() => createLoanMutation.mutate()}
                    disabled={createLoanMutation.isPending}
                    className="bg-primary hover:bg-primary/90"
                  >
                    {createLoanMutation.isPending ? "Creating..." : "Confirm Request"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
