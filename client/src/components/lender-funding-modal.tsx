import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { generateAndSignTransactions, downloadSignedTransactions } from "@/lib/ephemeral-signer";
import { Loader2, Shield, CheckCircle, Download } from "lucide-react";
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
        title: "Loan Funded Successfully",
        description: "🔐 Your Bitcoin keys were ephemeral and discarded. Pre-signed recovery transactions downloaded.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
    },
    onError: (error: any) => {
      setStep('confirm');
      setIsGeneratingKeys(false);
      
      toast({
        title: "Cannot Fund Loan",
        description: error.message || "Failed to fund loan. The borrower may not have submitted their Bitcoin keys yet.",
        variant: "destructive",
      });
    },
  });

  const handleGenerateKeysAndFund = async () => {
    console.log('Generate button clicked - loan data:', loan);
    
    setIsGeneratingKeys(true);
    setStep('generating');
    
    try {
      // Generate ephemeral keys and sign transactions
      // Keys are DISCARDED after signing - never stored!
      const result = await generateAndSignTransactions({
        loanId: loan.id,
        role: 'lender',
        escrowAddress: loan.escrowAddress || undefined,
        loanAmount: parseFloat(loan.amount),
        collateralBtc: parseFloat(loan.collateralBtc || '0'),
        currency: loan.currency,
        term: loan.termMonths,
      });
      
      setSignedPublicKey(result.publicKey);
      
      // Download signed transactions (user's recovery method)
      downloadSignedTransactions(loan.id, 'lender', result);
      
      console.log("🔐 Ephemeral key generated, transactions signed, key discarded");
      
      // Submit public key to backend (private key already wiped from memory)
      fundLoan.mutate({ lenderPubkey: result.publicKey });
      
    } catch (error) {
      console.error('Failed to generate and sign transactions:', error);
      setStep('confirm');
      setIsGeneratingKeys(false);
      toast({
        title: "Error",
        description: "Failed to generate ephemeral Bitcoin keys. Please try again.",
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
              <DialogTitle>Fund Loan - Ephemeral Escrow</DialogTitle>
              <DialogDescription>
                You are about to fund a loan for {loan.amount} {loan.currency}. Your Bitcoin keys will be generated and immediately discarded.
              </DialogDescription>
            </DialogHeader>
            
            <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
              <Shield className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-sm space-y-2">
                <p className="font-semibold">🔐 Firefish Ephemeral Key Model:</p>
                <ol className="list-decimal ml-4 space-y-1">
                  <li>Bitcoin keypair generated in your browser</li>
                  <li>Recovery & closing transactions pre-signed</li>
                  <li><strong>Private key immediately discarded</strong> (not stored anywhere)</li>
                  <li>Signed transactions downloaded to your device</li>
                  <li>If platform disappears, broadcast recovery transaction</li>
                </ol>
              </AlertDescription>
            </Alert>

            <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-sm">
                <p className="font-semibold">✅ Maximum Security</p>
                <p className="mt-1">Your private key exists for ~1 second, only during signing. It's never displayed, never stored, and never leaves your browser.</p>
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
                    Signing Transactions...
                  </>
                ) : (
                  '🔐 Generate & Sign (Ephemeral)'
                )}
              </Button>
            </div>
          </>
        )}

        {step === 'generating' && (
          <>
            <DialogHeader>
              <DialogTitle>Generating Ephemeral Keys & Signing...</DialogTitle>
              <DialogDescription>
                Creating keypair, signing recovery transactions, then discarding private key.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
              <p className="text-sm text-muted-foreground">Signing transactions...</p>
              <p className="text-xs text-muted-foreground">Private key will be wiped from memory immediately</p>
            </div>

            <div className="flex justify-center mt-4">
              <Button 
                onClick={handleClose} 
                variant="outline"
                data-testid="button-cancel-generating"
              >
                Cancel
              </Button>
            </div>
          </>
        )}

        {step === 'funded' && (
          <>
            <DialogHeader>
              <DialogTitle className="text-green-600">✅ Loan Funded Successfully</DialogTitle>
              <DialogDescription>
                Your recovery transactions have been downloaded. Private key was ephemeral and discarded.
              </DialogDescription>
            </DialogHeader>

            <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
              <Download className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-sm">
                <p className="font-semibold">📥 Recovery Transactions Downloaded</p>
                <p className="mt-1">Your signed transactions were saved to your downloads folder. Store this file safely - it's your recovery method if the platform disappears.</p>
                <p className="mt-2 text-xs text-muted-foreground">File: reconquest-lender-loan{loan.id}-recovery.json</p>
              </AlertDescription>
            </Alert>

            <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
              <AlertDescription className="text-sm space-y-2">
                <p className="font-semibold">Next Steps:</p>
                <ol className="list-decimal ml-4 space-y-1">
                  <li>The borrower will deposit Bitcoin to the escrow address</li>
                  <li>Once confirmed, you'll receive their bank details</li>
                  <li>Transfer the fiat amount to the borrower</li>
                  <li>After loan repayment, cooperative close transaction releases funds</li>
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
