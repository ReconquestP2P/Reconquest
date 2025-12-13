import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, CheckCircle, AlertTriangle, Rocket } from "lucide-react";
import type { Loan } from "@shared/schema";

interface RepaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  loan: Loan;
}

export default function RepaymentModal({ 
  isOpen, 
  onClose, 
  loan
}: RepaymentModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Get user ID from loan data
  const userId = loan.borrowerId;
  
  const [step, setStep] = useState<'confirm' | 'broadcasting' | 'completed'>('confirm');

  const repayLoan = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(`/api/loans/${loan.id}/cooperative-close`, "POST", {});
      return await response.json();
    },
    onSuccess: (data: any) => {
      setStep('completed');
      toast({
        title: "Loan Repaid Successfully! 🎉",
        description: `Transaction broadcast to Bitcoin testnet. Your collateral is being returned. Txid: ${data.txid}`,
      });
      // Invalidate all relevant queries to update UI immediately
      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/loans`] });
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loan.id}`] });
    },
    onError: (error: any) => {
      setStep('confirm');
      
      let errorMessage = "Failed to broadcast repayment transaction.";
      
      if (error.message) {
        if (error.message.includes("Not enough signatures")) {
          errorMessage = "Cannot repay yet. The lender needs to generate their Bitcoin keys first. Wait for the lender to fund the loan.";
        } else {
          errorMessage = error.message;
        }
      }
      
      toast({
        title: "Repayment Failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleRepay = async () => {
    setStep('broadcasting');
    repayLoan.mutate();
  };

  const handleClose = () => {
    if (step !== 'broadcasting') {
      setStep('confirm');
      onClose();
    }
  };

  // Calculate total amount due
  const principal = parseFloat(loan.amount);
  const interest = (principal * parseFloat(loan.interestRate)) / 100;
  const totalDue = principal + interest;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        {step === 'confirm' && (
          <>
            <DialogHeader>
              <DialogTitle>Repay Loan - Cooperative Close</DialogTitle>
              <DialogDescription>
                Confirm you've transferred the fiat funds to the lender. This will broadcast the cooperative close transaction to return your Bitcoin collateral.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                <CheckCircle className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-sm space-y-2">
                  <p className="font-semibold">💰 Repayment Summary</p>
                  <div className="space-y-1">
                    <p>Principal: {principal.toFixed(2)} {loan.currency}</p>
                    <p>Interest ({loan.interestRate}%): {interest.toFixed(2)} {loan.currency}</p>
                    <p className="font-semibold">Total Due: {totalDue.toFixed(2)} {loan.currency}</p>
                  </div>
                </AlertDescription>
              </Alert>

              <Alert className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-sm space-y-2">
                  <p className="font-semibold">⚠️ Before clicking "Repay Loan":</p>
                  <ol className="list-decimal ml-4 space-y-1">
                    <li>Transfer {totalDue.toFixed(2)} {loan.currency} to the lender via bank transfer</li>
                    <li>Keep proof of transfer (bank receipt, confirmation number)</li>
                    <li>Confirm the lender has received the funds</li>
                  </ol>
                </AlertDescription>
              </Alert>

              <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                <Rocket className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-sm space-y-2">
                  <p className="font-semibold">🔐 What Happens Next:</p>
                  <ol className="list-decimal ml-4 space-y-1">
                    <li>Platform aggregates your pre-signed transaction + lender's signature + platform signature (2-of-3 multisig)</li>
                    <li>Combined transaction is broadcast to Bitcoin testnet</li>
                    <li>Your {loan.collateralBtc} BTC collateral is returned to your address</li>
                    <li>Loan marked as "completed" ✅</li>
                  </ol>
                </AlertDescription>
              </Alert>
            </div>

            <div className="flex gap-3 mt-4">
              <Button 
                onClick={handleClose} 
                variant="outline"
                data-testid="button-cancel-repayment"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleRepay}
                className="flex-1 bg-green-600 hover:bg-green-700"
                data-testid="button-confirm-repayment"
              >
                ✅ Confirm Repayment & Broadcast
              </Button>
            </div>
          </>
        )}

        {step === 'broadcasting' && (
          <>
            <DialogHeader>
              <DialogTitle>Broadcasting Transaction...</DialogTitle>
              <DialogDescription>
                Aggregating signatures and broadcasting to Bitcoin testnet.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
              <p className="text-sm text-muted-foreground">Combining borrower + lender + platform signatures...</p>
              <p className="text-xs text-muted-foreground">Broadcasting to Bitcoin testnet...</p>
            </div>
          </>
        )}

        {step === 'completed' && (
          <>
            <DialogHeader>
              <DialogTitle className="text-green-600">✅ Loan Repaid Successfully!</DialogTitle>
              <DialogDescription>
                Your cooperative close transaction has been broadcast to Bitcoin testnet.
              </DialogDescription>
            </DialogHeader>

            <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-sm space-y-2">
                <p className="font-semibold">🎉 Collateral Return In Progress</p>
                <div className="space-y-1">
                  <p>Your {loan.collateralBtc} BTC collateral is being returned</p>
                  <p className="text-xs text-muted-foreground">Transaction typically confirms in 10-60 minutes on testnet</p>
                </div>
              </AlertDescription>
            </Alert>

            <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
              <AlertDescription className="text-sm space-y-2">
                <p className="font-semibold">📋 What Just Happened:</p>
                <ol className="list-decimal ml-4 space-y-1">
                  <li>Platform collected your pre-signed transaction (from when you accepted the loan)</li>
                  <li>Platform collected lender's pre-signed transaction (from when they funded)</li>
                  <li>Platform added its own signature (2-of-3 multisig complete)</li>
                  <li>Transaction broadcast to Bitcoin testnet ✅</li>
                  <li>Your Bitcoin collateral is being sent back to you 🎉</li>
                </ol>
              </AlertDescription>
            </Alert>

            <Button 
              onClick={handleClose}
              className="w-full"
              data-testid="button-close-repayment-success"
            >
              Close
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
