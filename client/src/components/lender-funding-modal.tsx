import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Shield, CheckCircle, Key, Lock, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { deriveKeyFromPin } from "@/lib/deterministic-key";
import { storeKeyOnServer } from "@/lib/key-vault";
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
  
  const [step, setStep] = useState<'confirm' | 'passphrase' | 'generating' | 'funded'>('confirm');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [passphraseError, setPassphraseError] = useState<string | null>(null);
  const [isGeneratingKeys, setIsGeneratingKeys] = useState(false);

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
      setStep('passphrase');
      setIsGeneratingKeys(false);
      
      toast({
        title: "Cannot Fund Loan",
        description: error.message || "Failed to fund loan. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleProceedToPassphrase = () => {
    setStep('passphrase');
  };

  const handleKeyCeremony = async () => {
    setPassphraseError(null);
    
    if (passphrase.length < 8) {
      setPassphraseError('Passphrase must be at least 8 characters');
      return;
    }
    
    if (passphrase !== confirmPassphrase) {
      setPassphraseError('Passphrases do not match');
      return;
    }
    
    setIsGeneratingKeys(true);
    setStep('generating');
    
    try {
      console.log("Starting Firefish key ceremony for lender (Phase 1 - Key Generation)...");
      
      const { privateKey, publicKey } = deriveKeyFromPin(loan.id, userId, 'lender', passphrase);
      
      console.log(`Derived lender pubkey: ${publicKey.slice(0, 20)}...`);
      
      const stored = await storeKeyOnServer(loan.id, 'lender', privateKey, publicKey, passphrase);
      if (!stored) {
        throw new Error("Failed to store encrypted key on server");
      }
      console.log("Encrypted key stored securely on server");
      
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
      setStep('passphrase');
      setIsGeneratingKeys(false);
    } finally {
      setIsGeneratingKeys(false);
    }
  };

  const handleClose = () => {
    setStep('confirm');
    setPassphrase('');
    setConfirmPassphrase('');
    setPassphraseError(null);
    setIsGeneratingKeys(false);
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
                <p className="font-semibold">Secure 2-of-3 Multisig Escrow:</p>
                <ul className="list-disc ml-4 space-y-1">
                  <li>Your Bitcoin key will be generated from a passphrase you create</li>
                  <li>Your encrypted key is stored securely on the server</li>
                  <li>Just remember your passphrase - no files to download</li>
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
                onClick={handleProceedToPassphrase}
                className="flex-1"
                data-testid="button-continue-to-passphrase"
              >
                Continue
              </Button>
            </div>
          </>
        )}

        {step === 'passphrase' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Create Your Escrow Passphrase
              </DialogTitle>
              <DialogDescription>
                This passphrase derives your Bitcoin key. You only need to enter it once.
              </DialogDescription>
            </DialogHeader>

            <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
              <Shield className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-sm">
                <p>Your passphrase encrypts your key on our server. You'll only need to enter it when signing transactions.</p>
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="passphrase">Create Passphrase (min 8 characters)</Label>
                <Input
                  id="passphrase"
                  type="password"
                  placeholder="Enter your secret passphrase..."
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  data-testid="input-passphrase"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="confirmPassphrase">Confirm Passphrase</Label>
                <Input
                  id="confirmPassphrase"
                  type="password"
                  placeholder="Confirm your passphrase..."
                  value={confirmPassphrase}
                  onChange={(e) => setConfirmPassphrase(e.target.value)}
                  data-testid="input-confirm-passphrase"
                />
              </div>
              
              {passphraseError && (
                <p className="text-sm text-red-500" data-testid="text-passphrase-error">{passphraseError}</p>
              )}
            </div>

            <div className="flex gap-3">
              <Button 
                onClick={() => setStep('confirm')} 
                variant="outline"
                data-testid="button-back"
              >
                Back
              </Button>
              <Button 
                onClick={handleKeyCeremony}
                className="flex-1"
                disabled={isGeneratingKeys || passphrase.length < 8}
                data-testid="button-generate-key"
              >
                {isGeneratingKeys ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating Key...
                  </>
                ) : (
                  <>
                    <Lock className="mr-2 h-4 w-4" />
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
                <p>Deriving key from passphrase (PBKDF2)...</p>
                <p>Encrypting and storing on server...</p>
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
                  <li>Your Bitcoin key has been generated from your passphrase</li>
                  <li>Your public key is registered with the platform</li>
                  <li>Your encrypted key is stored securely on our server</li>
                </ul>
              </AlertDescription>
            </Alert>

            <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
              <AlertDescription className="text-sm space-y-2">
                <p className="font-semibold">Next Steps:</p>
                <ol className="list-decimal ml-4 space-y-1">
                  <li>Borrower will complete their key ceremony</li>
                  <li>Escrow address will be created</li>
                  <li>Borrower will deposit BTC</li>
                  <li>You'll complete the Signing Ceremony</li>
                </ol>
              </AlertDescription>
            </Alert>

            <Alert className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-sm">
                <p className="font-semibold">Remember your passphrase!</p>
                <p className="mt-1">You'll need it when signing transactions. No files to download - just your passphrase.</p>
              </AlertDescription>
            </Alert>

            <div className="flex gap-3">
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
