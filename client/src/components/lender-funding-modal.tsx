import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Shield, CheckCircle, Key, Download } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { deriveKeyFromPin } from "@/lib/deterministic-key";
import { storeKey, createRecoveryBundle } from "@/lib/key-vault";
import type { Loan } from "@shared/schema";

interface LenderFundingModalProps {
  isOpen: boolean;
  onClose: () => void;
  loan: Loan;
  userId: number;
}

export default function LenderFundingModal({ 
  isOpen, 
  onClose, 
  loan,
  userId
}: LenderFundingModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [step, setStep] = useState<'confirm' | 'generating' | 'funded'>('confirm');
  const [isGeneratingKeys, setIsGeneratingKeys] = useState(false);
  const [recoveryBundle, setRecoveryBundle] = useState<string | null>(null);

  const fundLoan = useMutation({
    mutationFn: async (data: { lenderPubkey: string; plannedStartDate: string; plannedEndDate: string }) => {
      const response = await apiRequest(`/api/loans/${loan.id}/fund`, "POST", {
        lenderPubkey: data.lenderPubkey,
        plannedStartDate: data.plannedStartDate,
        plannedEndDate: data.plannedEndDate
      });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
    },
    onError: (error: any) => {
      setStep('confirm');
      setIsGeneratingKeys(false);
      
      toast({
        title: "Cannot Fund Loan",
        description: error.message || "Failed to fund loan. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleKeyCeremony = async () => {
    setIsGeneratingKeys(true);
    setStep('generating');
    
    try {
      console.log("Starting Firefish key ceremony for lender (Phase 1 - Key Generation)...");
      
      const randomSecret = crypto.getRandomValues(new Uint8Array(32));
      const secretHex = Array.from(randomSecret).map(b => b.toString(16).padStart(2, '0')).join('');
      
      const { privateKey, publicKey } = deriveKeyFromPin(loan.id, userId, 'lender', secretHex);
      
      console.log(`Generated lender pubkey: ${publicKey.slice(0, 20)}...`);
      
      await storeKey(loan.id, 'lender', privateKey, publicKey);
      console.log("Private key stored securely in browser vault");
      
      const bundle = createRecoveryBundle(
        loan.id, 
        'lender', 
        privateKey, 
        publicKey, 
        loan.escrowAddress || 'pending'
      );
      setRecoveryBundle(bundle);
      
      privateKey.fill(0);
      console.log("Private key wiped from working memory");
      
      const startDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const endDate = new Date(startDate.getTime() + loan.termMonths * 30 * 24 * 60 * 60 * 1000);
      
      await fundLoan.mutateAsync({ 
        lenderPubkey: publicKey,
        plannedStartDate: startDate.toISOString(),
        plannedEndDate: endDate.toISOString()
      });
      
      setStep('funded');
      
      toast({
        title: "Funding Commitment Complete!",
        description: "Key registered. Waiting for borrower to provide their key and deposit BTC.",
      });
      
    } catch (error) {
      console.error('Key ceremony failed:', error);
      setStep('confirm');
      setIsGeneratingKeys(false);
    } finally {
      setIsGeneratingKeys(false);
    }
  };

  const downloadRecoveryBundle = () => {
    if (!recoveryBundle) return;
    
    const blob = new Blob([recoveryBundle], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reconquest-lender-recovery-loan-${loan.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Recovery File Downloaded",
      description: "Keep this file safe - you'll need it to sign from another device.",
    });
  };

  const handleClose = () => {
    setStep('confirm');
    setIsGeneratingKeys(false);
    setRecoveryBundle(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        {step === 'confirm' && (
          <>
            <DialogHeader>
              <DialogTitle>Investment Details</DialogTitle>
              <DialogDescription>
                You are committing to fund {loan.amount} {loan.currency}. A secure escrow address will be created.
              </DialogDescription>
            </DialogHeader>

            <div className="bg-gray-50 dark:bg-gray-900/30 rounded-lg p-4 space-y-4">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-muted-foreground">Amount to invest</p>
                  <p className="text-lg font-semibold" data-testid="text-invest-amount">
                    {loan.currency} {formatCurrency(parseFloat(loan.amount)).replace('€', '').replace('$', '')}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Period</p>
                  <p className="text-lg font-semibold" data-testid="text-period">
                    {loan.termMonths} months
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-muted-foreground">Interest rate (p.a.)</p>
                  <p className="text-lg font-semibold" data-testid="text-interest-rate">
                    {parseFloat(loan.interestRate).toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">You will earn</p>
                  <p className="text-lg font-semibold text-green-600" data-testid="text-earnings">
                    {loan.currency} {formatCurrency(
                      parseFloat(loan.amount) * (parseFloat(loan.interestRate) / 100) * (loan.termMonths / 12)
                    ).replace('€', '').replace('$', '')}
                  </p>
                </div>
              </div>
            </div>
            
            <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
              <Shield className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-sm space-y-2">
                <p className="font-semibold">Firefish Security Model:</p>
                <ul className="list-disc ml-4 space-y-1">
                  <li>Your Bitcoin key will be generated and stored securely in your browser</li>
                  <li>You'll download a recovery file for backup</li>
                  <li>After the borrower deposits BTC, you'll complete the signing ceremony</li>
                </ul>
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
                onClick={handleKeyCeremony}
                className="flex-1"
                disabled={isGeneratingKeys}
                data-testid="button-generate-key"
              >
                {isGeneratingKeys ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating Key...
                  </>
                ) : (
                  <>
                    <Key className="mr-2 h-4 w-4" />
                    Generate Key & Commit
                  </>
                )}
              </Button>
            </div>
          </>
        )}

        {step === 'generating' && (
          <>
            <DialogHeader>
              <DialogTitle>Generating Your Key...</DialogTitle>
              <DialogDescription>
                Creating secure Bitcoin key for escrow
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
              <div className="text-sm text-muted-foreground space-y-1 text-center">
                <p>Generating cryptographic key pair...</p>
                <p>Storing securely in browser...</p>
              </div>
            </div>
          </>
        )}

        {step === 'funded' && (
          <>
            <DialogHeader>
              <DialogTitle className="text-green-600">Key Ceremony Complete!</DialogTitle>
              <DialogDescription>
                Your funding commitment is registered. Waiting for borrower.
              </DialogDescription>
            </DialogHeader>

            <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-sm">
                <p className="font-semibold">Phase 1 Complete</p>
                <ul className="list-disc ml-4 mt-2 space-y-1">
                  <li>Your Bitcoin key has been generated</li>
                  <li>Your public key is registered with the platform</li>
                  <li>Private key stored securely in your browser</li>
                </ul>
              </AlertDescription>
            </Alert>

            <Alert className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
              <Download className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-sm">
                <p className="font-semibold">Download Recovery File (Recommended)</p>
                <p className="mt-1">If you need to sign from another device, you'll need this file.</p>
              </AlertDescription>
            </Alert>

            <div className="flex gap-3">
              <Button 
                onClick={downloadRecoveryBundle}
                variant="outline"
                className="flex-1"
                data-testid="button-download-recovery"
              >
                <Download className="mr-2 h-4 w-4" />
                Download Recovery File
              </Button>
              <Button 
                onClick={handleClose}
                className="flex-1"
                data-testid="button-close-success"
              >
                Close
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
