import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Shield, CheckCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { Loan } from "@shared/schema";

interface LenderFundingModalProps {
  isOpen: boolean;
  onClose: () => void;
  loan: Loan;
  userId: number;
}

/**
 * LenderFundingModal - Bitcoin-Blind Lender Design
 * 
 * CRITICAL: Lenders NEVER handle Bitcoin keys.
 * - No passphrase creation
 * - No key ceremony
 * - No transaction signing
 * 
 * Lenders only:
 * 1. Review loan terms
 * 2. Confirm fiat commitment
 * 3. Transfer fiat to borrower (off-chain)
 * 4. Confirm fiat transfer in dashboard
 * 
 * The platform generates and controls the "lender key" in the 3-of-3 multisig.
 * Platform signs with this key after verifying fiat confirmations.
 */
export default function LenderFundingModal({ 
  isOpen, 
  onClose, 
  loan,
  userId
}: LenderFundingModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [step, setStep] = useState<'confirm' | 'processing' | 'funded'>('confirm');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [understandRisks, setUnderstandRisks] = useState(false);

  const fundLoan = useMutation({
    mutationFn: async () => {
      const startDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const endDate = new Date(startDate.getTime() + loan.termMonths * 30 * 24 * 60 * 60 * 1000);
      
      const response = await apiRequest(`/api/loans/${loan.id}/fund`, "POST", {
        plannedStartDate: startDate.toISOString(),
        plannedEndDate: endDate.toISOString()
      });
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
      setStep('funded');
      toast({
        title: "Funding Commitment Complete!",
        description: data.message || "Your investment commitment is registered. Waiting for borrower to deposit Bitcoin.",
      });
    },
    onError: (error: any) => {
      setStep('confirm');
      toast({
        title: "Cannot Fund Loan",
        description: error.message || "Failed to fund loan. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleCommitFunding = async () => {
    if (!termsAccepted || !understandRisks) {
      toast({
        title: "Please Accept Terms",
        description: "You must accept the terms and acknowledge the risks to proceed.",
        variant: "destructive",
      });
      return;
    }
    
    setStep('processing');
    fundLoan.mutate();
  };

  const handleClose = () => {
    setStep('confirm');
    setTermsAccepted(false);
    setUnderstandRisks(false);
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
                <p className="font-semibold">Secure 3-of-3 Multisig Escrow:</p>
                <ul className="list-disc ml-4 space-y-1">
                  <li>Borrower deposits BTC worth {loan.collateralBtc} to secure the loan</li>
                  <li>Collateral held in secure escrow until loan is repaid</li>
                  <li>You only manage fiat transfers - no Bitcoin handling required</li>
                  <li>Automatic liquidation protection if collateral value drops</li>
                </ul>
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <div className="flex items-start space-x-2">
                <Checkbox 
                  id="termsAccepted" 
                  checked={termsAccepted}
                  onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                  data-testid="checkbox-terms"
                />
                <Label htmlFor="termsAccepted" className="text-sm cursor-pointer leading-snug">
                  I confirm I will transfer {loan.currency} {formatCurrency(parseFloat(loan.amount)).replace('€', '').replace('$', '')} to the borrower's bank account once the escrow is ready
                </Label>
              </div>
              
              <div className="flex items-start space-x-2">
                <Checkbox 
                  id="understandRisks" 
                  checked={understandRisks}
                  onCheckedChange={(checked) => setUnderstandRisks(checked === true)}
                  data-testid="checkbox-risks"
                />
                <Label htmlFor="understandRisks" className="text-sm cursor-pointer leading-snug">
                  I understand that while Bitcoin collateral secures this loan, cryptocurrency values can fluctuate and there are inherent risks
                </Label>
              </div>
            </div>

            <div className="flex gap-3">
              <Button 
                onClick={handleClose} 
                variant="outline"
                data-testid="button-cancel-funding"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleCommitFunding}
                className="flex-1"
                disabled={!termsAccepted || !understandRisks}
                data-testid="button-commit-funding"
              >
                Continue
              </Button>
            </div>
          </>
        )}

        {step === 'processing' && (
          <>
            <DialogHeader>
              <DialogTitle>Processing Your Commitment...</DialogTitle>
              <DialogDescription>
                Setting up your investment position
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
              <div className="text-sm text-muted-foreground space-y-1 text-center">
                <p>Registering your commitment...</p>
                <p>Creating escrow position...</p>
              </div>
            </div>
          </>
        )}

        {step === 'funded' && (
          <>
            <DialogHeader>
              <DialogTitle className="text-green-600 flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                Funding Commitment Complete!
              </DialogTitle>
              <DialogDescription>
                Waiting for borrower to provide their key and deposit BTC.
              </DialogDescription>
            </DialogHeader>

            <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-sm">
                <p className="font-semibold">Your commitment is confirmed!</p>
                <ul className="list-disc ml-4 mt-2 space-y-1">
                  <li>Your investment of {loan.currency} {formatCurrency(parseFloat(loan.amount)).replace('€', '').replace('$', '')} is registered</li>
                  <li>The platform has secured your position in the escrow</li>
                  <li>No Bitcoin handling required on your part</li>
                </ul>
              </AlertDescription>
            </Alert>

            <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
              <AlertDescription className="text-sm space-y-2">
                <p className="font-semibold">What Happens Next:</p>
                <ol className="list-decimal ml-4 space-y-1">
                  <li>Borrower creates their escrow key and deposits Bitcoin</li>
                  <li>You'll receive a notification when the loan is ready</li>
                  <li>Transfer fiat to borrower's bank account</li>
                  <li>Confirm the transfer in your dashboard</li>
                  <li>Loan becomes active and you start earning interest</li>
                </ol>
              </AlertDescription>
            </Alert>

            <div className="flex gap-3">
              <Button 
                onClick={handleClose}
                className="w-full"
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
