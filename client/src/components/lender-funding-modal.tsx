import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import * as Firefish from "@/lib/firefish-wasm-mock";
import { storeSecureBitcoinKeys } from "@/lib/secure-bitcoin-storage";
import { Loader2, Shield, CheckCircle } from "lucide-react";

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
  
  const [step, setStep] = useState<'confirm' | 'generating' | 'funded'>('confirm');
  const [isGeneratingKeys, setIsGeneratingKeys] = useState(false);

  const fundLoan = useMutation({
    mutationFn: async (data: { lenderPubkey: string }) => {
      const response = await apiRequest(`/api/loans/${loanId}/fund`, "POST", {
        lenderPubkey: data.lenderPubkey
      });
      const loan = await response.json();
      return loan;
    },
    onSuccess: (loan: any) => {
      setStep('funded');
      toast({
        title: "Loan Funded Successfully",
        description: "🔐 You are now the lender for this loan. Your Bitcoin keys are encrypted and stored securely.",
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

  const handleGenerateKeysAndFund = async () => {
    setIsGeneratingKeys(true);
    setStep('generating');
    
    try {
      // Generate Bitcoin keys client-side
      const keys = Firefish.generateKeys();
      
      // Store keys ENCRYPTED (user never sees private key!)
      await storeSecureBitcoinKeys(loanId, keys);
      
      console.log("🔐 Bitcoin keys generated and encrypted successfully (never displayed)");
      
      // Submit public key to backend
      fundLoan.mutate({ lenderPubkey: keys.publicKey });
    } catch (error) {
      console.error('Failed to generate and store keys:', error);
      toast({
        title: "Error",
        description: "Failed to generate secure Bitcoin keys. Please try again.",
        variant: "destructive",
      });
      setStep('confirm');
    } finally {
      setIsGeneratingKeys(false);
    }
  };

  const handleClose = () => {
    setStep('confirm');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        {step === 'confirm' && (
          <>
            <DialogHeader>
              <DialogTitle>Fund Loan - Secure Escrow</DialogTitle>
              <DialogDescription>
                You are about to fund a loan for {loanAmount} {currency}. Your Bitcoin keys will be generated securely.
              </DialogDescription>
            </DialogHeader>
            
            <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
              <Shield className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-sm space-y-2">
                <p className="font-semibold">How It Works:</p>
                <ol className="list-decimal ml-4 space-y-1">
                  <li>Bitcoin keypair generated in your browser (client-side)</li>
                  <li>Private key encrypted with Web Crypto API and stored locally</li>
                  <li>Your private key is NEVER displayed or sent to our servers</li>
                  <li>2-of-3 multisig escrow created with you, borrower, and platform</li>
                </ol>
              </AlertDescription>
            </Alert>

            <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-sm">
                <p className="font-semibold">🔐 Firefish Security Model</p>
                <p className="mt-1">Following best practices from Firefish platform, your private keys are encrypted and never shown to you. This protects against accidental exposure, screenshots, and malware.</p>
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
                onClick={handleGenerateKeysAndFund}
                className="flex-1"
                disabled={isGeneratingKeys}
                data-testid="button-generate-lender-keys"
              >
                {isGeneratingKeys ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating Secure Keys...
                  </>
                ) : (
                  '🔐 Generate Keys & Fund Loan'
                )}
              </Button>
            </div>
          </>
        )}

        {step === 'generating' && (
          <>
            <DialogHeader>
              <DialogTitle>Generating Secure Bitcoin Keys...</DialogTitle>
              <DialogDescription>
                Please wait while we generate and encrypt your Bitcoin keys.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
              <p className="text-sm text-muted-foreground">Encrypting your keys with Web Crypto API...</p>
            </div>
          </>
        )}

        {step === 'funded' && (
          <>
            <DialogHeader>
              <DialogTitle className="text-green-600">✅ Loan Funded Successfully</DialogTitle>
              <DialogDescription>
                Your Bitcoin keys are encrypted and stored securely. The escrow address is being created.
              </DialogDescription>
            </DialogHeader>

            <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
              <Shield className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-sm">
                <p className="font-semibold">🔐 Keys Secured</p>
                <p className="mt-1">Your private keys are encrypted and stored locally. They will never be displayed for your security.</p>
              </AlertDescription>
            </Alert>

            <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
              <AlertDescription className="text-sm space-y-2">
                <p className="font-semibold">Next Steps:</p>
                <ol className="list-decimal ml-4 space-y-1">
                  <li>The borrower will deposit Bitcoin to the escrow address</li>
                  <li>Once confirmed, you'll receive their bank details</li>
                  <li>Transfer the fiat amount to the borrower</li>
                  <li>After loan repayment, your keys will automatically sign transactions</li>
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
