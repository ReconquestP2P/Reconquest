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
import { generatePublicKeyFromPin } from "@/lib/deterministic-key";
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
  
  const [step, setStep] = useState<'confirm' | 'pin' | 'generating' | 'funded'>('confirm');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
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
      setStep('pin');
      setIsGeneratingKeys(false);
      
      toast({
        title: "Cannot Fund Loan",
        description: error.message || "Failed to fund loan. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleProceedToPin = () => {
    setStep('pin');
  };

  const handleKeyCeremony = async () => {
    setPinError(null);
    
    if (pin.length < 8) {
      setPinError('Passphrase must be at least 8 characters for security');
      return;
    }
    
    if (!/[a-zA-Z]/.test(pin) || !/[0-9]/.test(pin)) {
      setPinError('Passphrase must contain both letters and numbers');
      return;
    }
    
    if (pin !== confirmPin) {
      setPinError('Passphrases do not match');
      return;
    }
    
    setIsGeneratingKeys(true);
    setStep('generating');
    
    try {
      console.log("Starting Firefish key ceremony for lender (Phase 1 - Key Derivation)...");
      
      const publicKeyHex = generatePublicKeyFromPin(loan.id, userId, 'lender', pin);
      console.log(`Derived lender pubkey: ${publicKeyHex.slice(0, 20)}...`);
      console.log("Private key NOT stored - will be re-derived from passphrase after deposit for signing.");
      
      const startDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const endDate = new Date(startDate.getTime() + loan.termMonths * 30 * 24 * 60 * 60 * 1000);
      
      await fundLoan.mutateAsync({ 
        lenderPubkey: publicKeyHex,
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
      setStep('pin');
      setIsGeneratingKeys(false);
    } finally {
      setIsGeneratingKeys(false);
    }
  };

  const handleClose = () => {
    setStep('confirm');
    setPin('');
    setConfirmPin('');
    setPinError(null);
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
                <p className="font-semibold">Firefish Security Model (3 Phases):</p>
                <ol className="list-decimal ml-4 space-y-1">
                  <li><strong>Key Ceremony</strong> - Create passphrase → derive pubkey → register commitment</li>
                  <li><strong>Deposit</strong> - Borrower sends BTC to escrow address</li>
                  <li><strong>Signing Ceremony</strong> - Re-enter passphrase → sign ALL transactions → key wiped</li>
                </ol>
                <p className="text-xs text-muted-foreground mt-2">
                  Your passphrase deterministically derives your key. The same passphrase always produces the same key.
                </p>
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
                onClick={handleProceedToPin}
                className="flex-1"
                data-testid="button-continue-to-pin"
              >
                Continue
              </Button>
            </div>
          </>
        )}

        {step === 'pin' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Create Your Escrow Passphrase
              </DialogTitle>
              <DialogDescription>
                This passphrase derives your Bitcoin key. You'll use it again after deposit to sign transactions.
              </DialogDescription>
            </DialogHeader>

            <Alert className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-sm">
                <p className="font-semibold">Remember your passphrase!</p>
                <p className="mt-1">Write it down securely. You'll need it again for the signing ceremony after the borrower deposits BTC.</p>
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pin">Create Passphrase (min 8 chars, letters + numbers)</Label>
                <Input
                  id="pin"
                  type="password"
                  placeholder="Enter your secret passphrase..."
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  data-testid="input-pin"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="confirmPin">Confirm Passphrase</Label>
                <Input
                  id="confirmPin"
                  type="password"
                  placeholder="Confirm your passphrase..."
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  data-testid="input-confirm-pin"
                />
              </div>
              
              {pinError && (
                <p className="text-sm text-red-500" data-testid="text-pin-error">{pinError}</p>
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
                disabled={isGeneratingKeys || pin.length < 8}
                data-testid="button-generate-key"
              >
                {isGeneratingKeys ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Registering Key...
                  </>
                ) : (
                  <>
                    <Lock className="mr-2 h-4 w-4" />
                    Register Funding Commitment
                  </>
                )}
              </Button>
            </div>
          </>
        )}

        {step === 'generating' && (
          <>
            <DialogHeader>
              <DialogTitle>Registering Key...</DialogTitle>
              <DialogDescription>
                Deriving your Bitcoin key and registering your funding commitment
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
              <div className="text-sm text-muted-foreground space-y-1 text-center">
                <p>Deriving Bitcoin key from passphrase...</p>
                <p>Registering your commitment...</p>
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
                  <li>Your key was derived from your passphrase</li>
                  <li>Your public key was registered</li>
                  <li>Private key NOT stored (only you can re-derive it)</li>
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
                  <li>You'll complete the <strong>Signing Ceremony</strong> to pre-sign all transactions</li>
                </ol>
              </AlertDescription>
            </Alert>

            <Alert className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-sm">
                <p className="font-semibold">Remember your passphrase!</p>
                <p className="mt-1">You'll need it again for the signing ceremony after the borrower deposits BTC.</p>
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
