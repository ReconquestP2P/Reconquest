import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, CheckCircle, Copy, Building2 } from "lucide-react";
import type { Loan } from "@shared/schema";

interface RepaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  loan: Loan;
}

interface LenderBankDetails {
  iban: string | null;
  bankAccountHolder: string | null;
  bankCountry: string | null;
}

export default function RepaymentModal({ 
  isOpen, 
  onClose, 
  loan
}: RepaymentModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const userId = loan.borrowerId;
  
  const [step, setStep] = useState<'details' | 'confirming' | 'completed'>('details');

  const { data: bankDetails, isLoading: isLoadingBank } = useQuery<LenderBankDetails>({
    queryKey: ['/api/loans', loan.id, 'lender-bank-details'],
    queryFn: async () => {
      const res = await fetch(`/api/loans/${loan.id}/lender-bank-details`, {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Failed to fetch lender bank details');
      }
      return res.json();
    },
    enabled: isOpen,
  });

  const confirmRepayment = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(`/api/loans/${loan.id}/confirm-repayment`, "POST", {});
      return await response.json();
    },
    onSuccess: () => {
      setStep('completed');
      toast({
        title: "Repayment Confirmed",
        description: "Your repayment has been recorded. The lender will be notified.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/loans`] });
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loan.id}`] });
    },
    onError: (error: any) => {
      setStep('details');
      toast({
        title: "Confirmation Failed",
        description: error.message || "Failed to confirm repayment",
        variant: "destructive",
      });
    },
  });

  const handleConfirm = async () => {
    setStep('confirming');
    confirmRepayment.mutate();
  };

  const handleClose = () => {
    if (step !== 'confirming') {
      setStep('details');
      onClose();
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: `${label} copied to clipboard`,
    });
  };

  const principal = parseFloat(loan.amount);
  const interest = (principal * parseFloat(loan.interestRate)) / 100;
  const totalDue = principal + interest;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        {step === 'details' && (
          <>
            <DialogHeader>
              <DialogTitle>Repay Loan</DialogTitle>
              <DialogDescription>
                Send the repayment to the lender's bank account, then confirm below.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                <CheckCircle className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-sm space-y-2">
                  <p className="font-semibold">Repayment Summary</p>
                  <div className="space-y-1">
                    <p>Principal: {principal.toFixed(2)} {loan.currency}</p>
                    <p>Interest ({loan.interestRate}%): {interest.toFixed(2)} {loan.currency}</p>
                    <p className="font-bold text-lg">Total Due: {totalDue.toFixed(2)} {loan.currency}</p>
                  </div>
                </AlertDescription>
              </Alert>

              {isLoadingBank ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-muted-foreground">Loading lender bank details...</span>
                </div>
              ) : bankDetails?.iban ? (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                    <Building2 className="h-5 w-5" />
                    <span className="font-semibold">Lender Bank Details</span>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Account Holder:</span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium" data-testid="text-lender-account-holder">
                          {bankDetails.bankAccountHolder || 'Not provided'}
                        </span>
                        {bankDetails.bankAccountHolder && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => copyToClipboard(bankDetails.bankAccountHolder!, 'Account holder')}
                            data-testid="button-copy-account-holder"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">IBAN:</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium" data-testid="text-lender-iban">
                          {bankDetails.iban}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => copyToClipboard(bankDetails.iban!, 'IBAN')}
                          data-testid="button-copy-iban"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    {bankDetails.bankCountry && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Country:</span>
                        <span className="font-medium" data-testid="text-lender-bank-country">
                          {bankDetails.bankCountry}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <Alert className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
                  <AlertDescription className="text-sm">
                    Lender bank details are not available. Please contact the lender directly.
                  </AlertDescription>
                </Alert>
              )}
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
                onClick={handleConfirm}
                className="flex-1 bg-green-600 hover:bg-green-700"
                disabled={!bankDetails?.iban}
                data-testid="button-confirm-repayment"
              >
                I've Sent the Funds
              </Button>
            </div>
          </>
        )}

        {step === 'confirming' && (
          <>
            <DialogHeader>
              <DialogTitle>Confirming Repayment...</DialogTitle>
            </DialogHeader>

            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
              <p className="text-sm text-muted-foreground">Recording your confirmation...</p>
            </div>
          </>
        )}

        {step === 'completed' && (
          <>
            <DialogHeader>
              <DialogTitle className="text-green-600">Repayment Confirmed</DialogTitle>
              <DialogDescription>
                Your repayment has been recorded successfully.
              </DialogDescription>
            </DialogHeader>

            <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-sm space-y-2">
                <p className="font-semibold">What happens next:</p>
                <ul className="list-disc ml-4 space-y-1">
                  <li>The lender will be notified of your repayment</li>
                  <li>Once verified, your collateral will be released</li>
                  <li>You'll receive a confirmation when the loan is completed</li>
                </ul>
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
