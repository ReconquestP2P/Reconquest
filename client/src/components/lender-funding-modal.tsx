import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import * as Firefish from "@/lib/firefish-wasm-mock";
import { storeBitcoinKeys } from "@/lib/bitcoin-key-storage";
import { Copy, Eye, EyeOff, AlertTriangle, Check, Loader2 } from "lucide-react";

interface LenderFundingModalProps {
  isOpen: boolean;
  onClose: () => void;
  loanId: number;
  loanAmount: string;
  currency: string;
}

export default function LenderFundingModal({ 
  isOpen, 
  onClose, 
  loanId, 
  loanAmount, 
  currency 
}: LenderFundingModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [step, setStep] = useState<'generate' | 'showKeys' | 'funded'>('generate');
  const [lenderKeys, setLenderKeys] = useState<Firefish.KeyPair | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [privateKeyCopied, setPrivateKeyCopied] = useState(false);

  const fundLoan = useMutation({
    mutationFn: async (data: { lenderPubkey: string, keys: Firefish.KeyPair }) => {
      const response = await apiRequest(`/api/loans/${loanId}/fund`, "POST", {
        lenderPubkey: data.lenderPubkey
      });
      const loan = await response.json();
      return { loan, keys: data.keys };
    },
    onSuccess: (data: any) => {
      const { loan, keys } = data;
      
      // Store lender Bitcoin keys in browser localStorage
      storeBitcoinKeys(loan.id, keys);
      
      setStep('funded');
      toast({
        title: "Loan Funded Successfully",
        description: "You are now the lender for this loan. Your Bitcoin keys are securely stored.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to fund loan. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleGenerateKeys = () => {
    const keys = Firefish.generateKeys();
    setLenderKeys(keys);
    setStep('showKeys');
  };

  const handleFundLoan = () => {
    if (!lenderKeys) return;
    fundLoan.mutate({ lenderPubkey: lenderKeys.publicKey, keys: lenderKeys });
  };

  const copyPrivateKey = () => {
    if (lenderKeys) {
      navigator.clipboard.writeText(lenderKeys.privateKey);
      setPrivateKeyCopied(true);
      toast({
        title: "Private Key Copied",
        description: "Your private key has been copied to clipboard.",
      });
      setTimeout(() => setPrivateKeyCopied(false), 2000);
    }
  };

  const handleClose = () => {
    setStep('generate');
    setLenderKeys(null);
    setShowPrivateKey(false);
    setPrivateKeyCopied(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        {step === 'generate' && (
          <>
            <DialogHeader>
              <DialogTitle>Fund Loan - Generate Bitcoin Keys</DialogTitle>
              <DialogDescription>
                You are about to fund a loan for {loanAmount} {currency}. First, generate your Bitcoin keys for the escrow.
              </DialogDescription>
            </DialogHeader>
            
            <Alert className="bg-blue-50 border-blue-200">
              <AlertDescription className="text-sm space-y-2">
                <p className="font-semibold">How It Works:</p>
                <ol className="list-decimal ml-4 space-y-1">
                  <li>Generate a Bitcoin keypair (kept in your browser only)</li>
                  <li>Save your private key securely</li>
                  <li>Complete the loan funding</li>
                  <li>A 2-of-3 multisig escrow will be created with you, the borrower, and the platform</li>
                </ol>
              </AlertDescription>
            </Alert>

            <div className="flex gap-3">
              <Button 
                onClick={handleClose} 
                variant="outline"
                data-testid="button-cancel-funding"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleGenerateKeys}
                className="flex-1"
                data-testid="button-generate-lender-keys"
              >
                Generate My Bitcoin Keys
              </Button>
            </div>
          </>
        )}

        {step === 'showKeys' && lenderKeys && (
          <>
            <DialogHeader className="bg-orange-50 -m-6 p-6 mb-4 rounded-t-lg">
              <DialogTitle className="flex items-center text-gray-900">
                <AlertTriangle className="h-5 w-5 text-orange-600 mr-2" />
                CRITICAL: Save Your Bitcoin Private Key
              </DialogTitle>
              <DialogDescription className="text-gray-700">
                This is shown only ONCE. You'll need it to access funds after loan repayment.
              </DialogDescription>
            </DialogHeader>

            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>⚠️ Save This Now!</AlertTitle>
              <AlertDescription>
                If you lose your private key, you won't be able to access your funds after the loan is repaid. Save it in a secure location.
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <Label className="text-sm font-medium">Your Bitcoin Public Key</Label>
              <div className="bg-gray-50 p-3 rounded font-mono text-xs break-all border">
                {lenderKeys.publicKey}
              </div>

              <Label className="text-sm font-medium text-red-600">Your Bitcoin Private Key 🔐</Label>
              <div className="relative">
                <div className="bg-red-50 border-2 border-red-200 p-3 rounded font-mono text-xs break-all">
                  {showPrivateKey ? lenderKeys.privateKey : '•'.repeat(64)}
                </div>
                <div className="absolute top-2 right-2 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowPrivateKey(!showPrivateKey)}
                    data-testid="button-toggle-lender-private-key"
                  >
                    {showPrivateKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={copyPrivateKey}
                    data-testid="button-copy-lender-private-key"
                  >
                    {privateKeyCopied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>

            <Alert className="bg-green-50 border-green-200">
              <AlertDescription className="text-sm">
                <p className="font-semibold mb-2">✅ I have saved my private key securely</p>
                <p className="text-xs text-gray-600">By clicking "Complete Funding", you confirm you've backed up your private key.</p>
              </AlertDescription>
            </Alert>

            <div className="flex gap-3">
              <Button 
                onClick={handleClose} 
                variant="outline"
                disabled={fundLoan.isPending}
                data-testid="button-cancel-after-keygen"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleFundLoan}
                className="flex-1"
                disabled={fundLoan.isPending}
                data-testid="button-complete-funding"
              >
                {fundLoan.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Funding...
                  </>
                ) : (
                  'Complete Funding'
                )}
              </Button>
            </div>
          </>
        )}

        {step === 'funded' && (
          <>
            <DialogHeader>
              <DialogTitle className="text-green-600">✅ Loan Funded Successfully</DialogTitle>
              <DialogDescription>
                The escrow address is being created. You can now monitor the loan status.
              </DialogDescription>
            </DialogHeader>

            <Alert className="bg-blue-50 border-blue-200">
              <AlertDescription className="text-sm space-y-2">
                <p className="font-semibold">Next Steps:</p>
                <ol className="list-decimal ml-4 space-y-1">
                  <li>The borrower will deposit Bitcoin to the escrow address</li>
                  <li>Once confirmed, you'll receive their bank details</li>
                  <li>Transfer the fiat amount to the borrower</li>
                  <li>After loan repayment, use your private key to access your share of the escrow</li>
                </ol>
              </AlertDescription>
            </Alert>

            <Button 
              onClick={handleClose}
              className="w-full"
              data-testid="button-close-success"
            >
              Close
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
