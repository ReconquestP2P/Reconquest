import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import * as Firefish from "@/lib/firefish-wasm-mock";
import { storeBitcoinKeys } from "@/lib/bitcoin-key-storage";
import { Copy, Eye, EyeOff, AlertTriangle, Check } from "lucide-react";

const loanRequestSchema = z.object({
  amount: z.string().min(1, "Amount is required"),
  currency: z.string().min(1, "Currency is required"),
  interestRate: z.number().min(0).max(25),
  termMonths: z.number().min(3).max(18),
  purpose: z.string().optional(),
});

type LoanRequestForm = z.infer<typeof loanRequestSchema>;

export default function LoanRequestForm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [borrowerKeys, setBorrowerKeys] = useState<Firefish.KeyPair | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [privateKeyCopied, setPrivateKeyCopied] = useState(false);
  const [loanCreated, setLoanCreated] = useState(false);

  const form = useForm<LoanRequestForm>({
    resolver: zodResolver(loanRequestSchema),
    defaultValues: {
      amount: "",
      currency: "USDC",
      interestRate: 8.5,
      termMonths: 6,
      purpose: "",
    },
  });

  const createLoan = useMutation({
    mutationFn: async (data: LoanRequestForm) => {
      const response = await apiRequest("/api/loans", "POST", {
        amount: data.amount,
        currency: data.currency,
        interestRate: data.interestRate.toString(),
        termMonths: data.termMonths,
        purpose: data.purpose
        // NO borrowerPubkey - keys generated later after matching
      });
      return await response.json();
    },
    onSuccess: (loan: any) => {
      // Reset form
      handleNewLoanRequest();
      
      toast({
        title: "Loan Request Posted",
        description: "Your loan request is now visible to lenders! You'll be notified when someone accepts it.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to submit loan request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: LoanRequestForm) => {
    // Submit loan WITHOUT keys - keys generated later after match
    createLoan.mutate(data);
  };

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
    form.reset();
  };

  // NOTE: Private key warning removed - keys are stored in localStorage
  // and will be shown in dashboard when loan is matched (status='funding')
  if (false) {
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
          Request New Loan
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Loan Amount</FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input placeholder="25000" {...field} className="pr-24" />
                      </FormControl>
                      <FormField
                        control={form.control}
                        name="currency"
                        render={({ field: currencyField }) => (
                          <Select
                            value={currencyField.value}
                            onValueChange={currencyField.onChange}
                          >
                            <SelectTrigger className="absolute right-1 top-1 w-20 h-8 border-0 bg-transparent">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="USDC">USDC</SelectItem>
                              <SelectItem value="EUR">EUR</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="termMonths"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Loan Term</FormLabel>
                    <Select
                      value={field.value.toString()}
                      onValueChange={(value) => field.onChange(parseInt(value))}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="3">3 months</SelectItem>
                        <SelectItem value="6">6 months</SelectItem>
                        <SelectItem value="9">9 months</SelectItem>
                        <SelectItem value="12">12 months</SelectItem>
                        <SelectItem value="18">18 months</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="interestRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Interest Rate: {field.value}% p.a.</FormLabel>
                    <FormControl>
                      <div className="px-3">
                        <Slider
                          value={[field.value]}
                          onValueChange={(value) => field.onChange(value[0])}
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
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div>
                <Label className="text-sm font-medium text-gray-700">
                  Required Collateral (Est.)
                </Label>
                <div className="mt-1 bg-gray-50 px-4 py-3 rounded-lg">
                  <span className="text-lg font-semibold text-gray-900">
                    {form.watch("amount") && !isNaN(parseFloat(form.watch("amount")))
                      ? `${((parseFloat(form.watch("amount")) * 2) / 67245).toFixed(8)} BTC`
                      : "0.00000000 BTC"}
                  </span>
                  <p className="text-xs text-gray-500">2:1 collateral ratio (50% LTV)</p>
                </div>
              </div>
            </div>

            <FormField
              control={form.control}
              name="purpose"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Loan Purpose (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe the purpose of your loan..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-black"
              disabled={createLoan.isPending}
            >
              {createLoan.isPending ? "Submitting..." : "Submit Loan Request"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
