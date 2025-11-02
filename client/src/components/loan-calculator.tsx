import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatBTC, calculateCollateral } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import * as Firefish from "@/lib/firefish-wasm-mock";
import { Copy, Eye, EyeOff, AlertTriangle, Check } from "lucide-react";

export default function LoanCalculator() {
  const [amount, setAmount] = useState("25000");
  const [currency, setCurrency] = useState("EUR");
  const [term, setTerm] = useState("6");
  const [interestRate, setInterestRate] = useState(6);
  const [borrowerKeys, setBorrowerKeys] = useState<Firefish.KeyPair | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [privateKeyCopied, setPrivateKeyCopied] = useState(false);
  const [loanCreated, setLoanCreated] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: btcPrice } = useQuery({
    queryKey: ["/api/btc-price"],
  });

  const createLoanMutation = useMutation({
    mutationFn: async () => {
      // Generate Bitcoin keypair for escrow
      const keys = Firefish.generateKeys();
      setBorrowerKeys(keys);
      
      return await apiRequest("/api/loans", "POST", {
        amount: loanAmount.toString(),
        currency,
        termMonths: parseInt(term),
        interestRate: interestRate.toString(),
        borrowerPubkey: keys.publicKey
      });
    },
    onSuccess: () => {
      setLoanCreated(true);
      toast({
        title: "Loan Request Created",
        description: "Your loan request has been submitted successfully. Save your Bitcoin private key below!",
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

  const copyPrivateKey = () => {
    if (borrowerKeys) {
      navigator.clipboard.writeText(borrowerKeys.privateKey);
      setPrivateKeyCopied(true);
      toast({
        title: "Private Key Copied",
        description: "Your private key has been copied to clipboard.",
      });
      setTimeout(() => setPrivateKeyCopied(false), 2000);
    }
  };

  const handleNewLoanRequest = () => {
    setBorrowerKeys(null);
    setLoanCreated(false);
    setPrivateKeyCopied(false);
    setShowPrivateKey(false);
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

  // Show private key warning after loan creation
  if (loanCreated && borrowerKeys) {
    return (
      <Card className="border-orange-500 border-2 shadow-lg">
        <CardHeader className="bg-orange-50">
          <CardTitle className="text-lg font-semibold text-gray-900 flex items-center">
            <AlertTriangle className="h-5 w-5 text-orange-600 mr-2" />
            CRITICAL: Save Your Bitcoin Private Key
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>⚠️ This is shown only ONCE!</AlertTitle>
            <AlertDescription>
              Your Bitcoin private key is required to access your collateral. If you lose it, your Bitcoin will be permanently locked. Save it securely NOW.
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            <Label className="text-sm font-medium">Your Bitcoin Public Key</Label>
            <div className="bg-gray-50 p-3 rounded font-mono text-xs break-all border">
              {borrowerKeys.publicKey}
            </div>

            <Label className="text-sm font-medium text-red-600">Your Bitcoin Private Key 🔐</Label>
            <div className="relative">
              <div className="bg-red-50 border-2 border-red-200 p-3 rounded font-mono text-xs break-all">
                {showPrivateKey ? borrowerKeys.privateKey : '•'.repeat(64)}
              </div>
              <div className="absolute top-2 right-2 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowPrivateKey(!showPrivateKey)}
                  data-testid="button-toggle-private-key"
                >
                  {showPrivateKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={copyPrivateKey}
                  data-testid="button-copy-private-key"
                >
                  {privateKeyCopied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          <Alert className="bg-blue-50 border-blue-200">
            <AlertDescription className="text-sm space-y-2">
              <p className="font-semibold">Next Steps:</p>
              <ol className="list-decimal ml-4 space-y-1">
                <li>Copy and save your private key in a secure location (password manager, encrypted file)</li>
                <li>Wait for a lender to fund your loan</li>
                <li>When matched, you'll send Bitcoin to the escrow address</li>
                <li>You'll need this private key to reclaim your collateral after repaying the loan</li>
              </ol>
            </AlertDescription>
          </Alert>

          <Button
            onClick={handleNewLoanRequest}
            className="w-full"
            data-testid="button-create-another-loan"
          >
            Create Another Loan Request
          </Button>
        </CardContent>
      </Card>
    );
  }

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
                  className="bg-primary hover:bg-primary/90 text-black px-8 py-3"
                  disabled={!loanAmount || loanAmount <= 0}
                >
                  Publish New Loan
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
