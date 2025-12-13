import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Shield, CheckCircle } from "lucide-react";
import type { Loan } from "@shared/schema";

interface LenderFundingModalProps {
  isOpen: boolean;
  onClose: () => void;
  loan: Loan;
}

export default function LenderFundingModal({ 
  isOpen, 
  onClose, 
  loan
}: LenderFundingModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [step, setStep] = useState<'confirm' | 'generating' | 'funded'>('confirm');
  const [isGeneratingKeys, setIsGeneratingKeys] = useState(false);
  const [signedPublicKey, setSignedPublicKey] = useState<string | null>(null);

  const fundLoan = useMutation({
    mutationFn: async (data: { lenderPubkey: string }) => {
      const response = await apiRequest(`/api/loans/${loan.id}/fund`, "POST", {
        lenderPubkey: data.lenderPubkey
      });
      const loanResponse = await response.json();
      return loanResponse;
    },
    onSuccess: (loan: any) => {
      setStep('funded');
      toast({
        title: "Funding Commitment Successful! 📧",
        description: "Escrow address created. The borrower has been emailed instructions to deposit their Bitcoin collateral.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
    },
    onError: (error: any) => {
      setStep('confirm');
      setIsGeneratingKeys(false);
      
      // Parse error message from API
      let errorMessage = "Failed to fund loan. Please try again.";
      
      if (error.message) {
        if (error.message.includes("Borrower public key not found")) {
          errorMessage = "This loan cannot be funded yet. The borrower needs to generate their Bitcoin escrow keys first. Please ask the borrower to accept the loan and generate their keys.";
        } else if (error.message.includes("old system")) {
          errorMessage = "This loan was created before the ephemeral key system was implemented. It cannot be funded using the new secure escrow system.";
        } else {
          errorMessage = error.message;
        }
      }
      
      toast({
        title: "Cannot Fund Loan",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleGeneratePubkeyAndFund = async () => {
    console.log('Fund button clicked - generating lender pubkey only');
    
    setIsGeneratingKeys(true);
    setStep('generating');
    
    try {
      // Generate ONLY the public key (no transaction signing yet)
      // Private key is wiped immediately after deriving public key
      const secp256k1 = await import('@noble/secp256k1');
      
      const privKeyBytes = secp256k1.utils.randomPrivateKey();
      const pubKeyBytes = secp256k1.getPublicKey(privKeyBytes, true);
      const lenderPubkey = Buffer.from(pubKeyBytes).toString('hex');
      
      // CRITICAL: Wipe private key from memory (Firefish security model)
      privKeyBytes.fill(0);
      
      console.log("🔐 Generated lender pubkey (private key discarded):", lenderPubkey.slice(0, 20) + '...');
      
      setSignedPublicKey(lenderPubkey);
      
      // Submit public key to backend to create escrow and notify borrower
      // Transaction signing will happen AFTER borrower deposits collateral
      fundLoan.mutate({ lenderPubkey });
      
    } catch (error) {
      console.error('Failed to generate public key:', error);
      setStep('confirm');
      setIsGeneratingKeys(false);
      toast({
        title: "Error",
        description: "Failed to generate Bitcoin public key. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingKeys(false);
    }
  };

  const handleClose = () => {
    setStep('confirm');
    setSignedPublicKey(null);
    setIsGeneratingKeys(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        {step === 'confirm' && (
          <>
            <DialogHeader>
              <DialogTitle>Commit to Funding Loan</DialogTitle>
              <DialogDescription>
                You are committing to fund {loan.amount} {loan.currency}. A secure escrow address will be created for the borrower to deposit collateral.
              </DialogDescription>
            </DialogHeader>
            
            <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
              <Shield className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-sm space-y-2">
                <p className="font-semibold">📋 What Happens Next:</p>
                <ol className="list-decimal ml-4 space-y-1">
                  <li>Your Bitcoin public key is generated (private key discarded instantly)</li>
                  <li>A secure 2-of-3 multisig escrow address is created</li>
                  <li>Borrower receives email with deposit instructions</li>
                  <li>After borrower deposits BTC, you'll both sign transactions</li>
                  <li>Loan becomes active and borrower receives funds</li>
                </ol>
              </AlertDescription>
            </Alert>

            <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-sm">
                <p className="font-semibold">✅ No Transaction Signing Yet</p>
                <p className="mt-1">At this stage, we're only creating the escrow address. Reconquest's ephemeral key signing happens AFTER the borrower deposits collateral, ensuring maximum security.</p>
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
                onClick={handleGeneratePubkeyAndFund}
                className="flex-1"
                disabled={isGeneratingKeys}
                data-testid="button-commit-funding"
              >
                {isGeneratingKeys ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Escrow...
                  </>
                ) : (
                  '✅ Commit to Fund Loan'
                )}
              </Button>
            </div>
          </>
        )}

        {step === 'generating' && (
          <>
            <DialogHeader>
              <DialogTitle>Creating Escrow Address...</DialogTitle>
              <DialogDescription>
                Generating your Bitcoin public key and creating secure multisig escrow.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
              <p className="text-sm text-muted-foreground">Creating escrow address...</p>
              <p className="text-xs text-muted-foreground">Borrower will be emailed deposit instructions</p>
            </div>
          </>
        )}

        {step === 'funded' && (
          <>
            <DialogHeader>
              <DialogTitle className="text-green-600">✅ Funding Committed Successfully</DialogTitle>
              <DialogDescription>
                Escrow created. The borrower has been notified to deposit their Bitcoin collateral.
              </DialogDescription>
            </DialogHeader>

            <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-sm">
                <p className="font-semibold">📧 Borrower Notified</p>
                <p className="mt-1">The borrower received an email with:</p>
                <ul className="list-disc ml-4 mt-2 space-y-1">
                  <li>Bitcoin testnet escrow address</li>
                  <li>Exact amount of BTC to deposit ({loan.collateralBtc} BTC)</li>
                  <li>Step-by-step deposit instructions</li>
                </ul>
              </AlertDescription>
            </Alert>

            <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
              <AlertDescription className="text-sm space-y-2">
                <p className="font-semibold">Next Steps:</p>
                <ol className="list-decimal ml-4 space-y-1">
                  <li>Borrower deposits {loan.collateralBtc} BTC to escrow address</li>
                  <li>Borrower clicks "Confirm Deposit" in their dashboard</li>
                  <li>You and borrower will both generate ephemeral keys and sign transactions</li>
                  <li>Loan becomes active and borrower receives {loan.amount} {loan.currency}</li>
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
