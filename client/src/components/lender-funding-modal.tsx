import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Shield, CheckCircle, Bitcoin, Euro, AlertTriangle, ExternalLink } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
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
  
  const [step, setStep] = useState<'confirm' | 'preference' | 'processing' | 'funded'>('confirm');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [defaultPreference, setDefaultPreference] = useState<'eur' | 'btc'>('eur');
  const [confirmedBtcAddress, setConfirmedBtcAddress] = useState(false);

  const { data: userProfile } = useQuery<any>({
    queryKey: ['/api/auth/profile'],
    enabled: isOpen,
  });

  const userBtcAddress = userProfile?.btcAddress || '';

  useEffect(() => {
    if (!isOpen) {
      setStep('confirm');
      setTermsAccepted(false);
      setDefaultPreference('eur');
      setConfirmedBtcAddress(false);
    }
  }, [isOpen]);

  const fundLoan = useMutation({
    mutationFn: async () => {
      const startDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const endDate = new Date(startDate.getTime() + loan.termMonths * 30 * 24 * 60 * 60 * 1000);
      
      const response = await apiRequest(`/api/loans/${loan.id}/fund`, "POST", {
        plannedStartDate: startDate.toISOString(),
        plannedEndDate: endDate.toISOString(),
        lenderDefaultPreference: defaultPreference,
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
      setStep('preference');
      toast({
        title: "Cannot Fund Loan",
        description: error.message || "Failed to fund loan. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleContinueToPreference = () => {
    if (!termsAccepted) {
      toast({
        title: "Please Accept Terms",
        description: "You must accept the terms to proceed.",
        variant: "destructive",
      });
      return;
    }
    setStep('preference');
  };

  const handleCommitFunding = async () => {
    if (defaultPreference === 'btc' && !userBtcAddress) {
      toast({
        title: "BTC Address Required",
        description: "Please add a Bitcoin address to your profile first.",
        variant: "destructive",
      });
      return;
    }
    if (defaultPreference === 'btc' && !confirmedBtcAddress) {
      toast({
        title: "Please Confirm Address",
        description: "You must confirm your Bitcoin address is correct.",
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
    setDefaultPreference('eur');
    setConfirmedBtcAddress(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                onClick={handleContinueToPreference}
                className="flex-1"
                disabled={!termsAccepted}
                data-testid="button-continue-to-preference"
              >
                Continue
              </Button>
            </div>
          </>
        )}

        {step === 'preference' && (
          <>
            <DialogHeader>
              <DialogTitle>Default Repayment Preference</DialogTitle>
              <DialogDescription>
                If the borrower defaults and we need to liquidate or split the collateral, how would you like to receive your share?
              </DialogDescription>
            </DialogHeader>

            <RadioGroup
              value={defaultPreference}
              onValueChange={(val) => {
                setDefaultPreference(val as 'eur' | 'btc');
                setConfirmedBtcAddress(false);
              }}
              className="space-y-4"
              data-testid="radio-default-preference"
            >
              <div className={`flex items-start space-x-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                defaultPreference === 'eur' 
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
              }`}
                onClick={() => { setDefaultPreference('eur'); setConfirmedBtcAddress(false); }}
              >
                <RadioGroupItem value="eur" id="pref-eur" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="pref-eur" className="text-base font-semibold flex items-center gap-2 cursor-pointer">
                    <Euro className="h-5 w-5 text-blue-600" />
                    Receive in Euros (Recommended)
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    The platform will sell the BTC on the market and transfer the euro equivalent to your bank account. 
                    This protects you from Bitcoin price volatility during the conversion process.
                  </p>
                </div>
              </div>

              <div className={`flex items-start space-x-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                defaultPreference === 'btc' 
                  ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20' 
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
              }`}
                onClick={() => { setDefaultPreference('btc'); setConfirmedBtcAddress(false); }}
              >
                <RadioGroupItem value="btc" id="pref-btc" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="pref-btc" className="text-base font-semibold flex items-center gap-2 cursor-pointer">
                    <Bitcoin className="h-5 w-5 text-orange-500" />
                    Receive in Bitcoin
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    The BTC will be sent directly to your Bitcoin address. You are responsible for managing the received Bitcoin.
                  </p>
                </div>
              </div>
            </RadioGroup>

            {defaultPreference === 'btc' && (
              <div className="space-y-3">
                {userBtcAddress ? (
                  <>
                    <div className="p-4 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-1">Your Bitcoin address on file:</p>
                      <p className="font-mono text-sm break-all font-medium" data-testid="text-btc-address">
                        {userBtcAddress}
                      </p>
                    </div>
                    <div className="flex items-start space-x-2">
                      <Checkbox
                        id="confirmBtcAddress"
                        checked={confirmedBtcAddress}
                        onCheckedChange={(checked) => setConfirmedBtcAddress(checked === true)}
                        data-testid="checkbox-confirm-btc-address"
                      />
                      <Label htmlFor="confirmBtcAddress" className="text-sm cursor-pointer leading-snug">
                        I confirm this is the correct Bitcoin address where I want to receive my share in case of default
                      </Label>
                    </div>
                  </>
                ) : (
                  <Alert className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-sm">
                      <p className="font-semibold">No Bitcoin address found in your profile</p>
                      <p className="mt-1">
                        Please go to your <a href="/profile" className="text-blue-600 underline inline-flex items-center gap-1">
                          Profile Settings <ExternalLink className="h-3 w-3" />
                        </a> and add a Bitcoin address first, then come back to fund this loan.
                      </p>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <Button 
                onClick={() => setStep('confirm')} 
                variant="outline"
                data-testid="button-back-to-terms"
              >
                Back
              </Button>
              <Button 
                onClick={handleCommitFunding}
                className="flex-1"
                disabled={defaultPreference === 'btc' && (!userBtcAddress || !confirmedBtcAddress)}
                data-testid="button-commit-funding"
              >
                Confirm & Fund Loan
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
                  <li>Default repayment preference: <strong>{defaultPreference === 'eur' ? 'Euros (bank transfer)' : 'Bitcoin (direct)'}</strong></li>
                </ul>
              </AlertDescription>
            </Alert>

            <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
              <AlertDescription className="text-sm space-y-2">
                <p className="font-semibold">What Happens Next:</p>
                <ol className="list-decimal ml-4 space-y-1">
                  <li>Borrower deposits Bitcoin as collateral for the loan</li>
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
