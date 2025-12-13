import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { generateAndSignTransactions, downloadSignedTransactions } from "@/lib/ephemeral-signer";
import { Download, Key, Shield, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { Loan } from "@shared/schema";

interface BorrowerKeyGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  loan: Loan;
  onSuccess: () => void;
}

export default function BorrowerKeyGenerationModal({
  isOpen,
  onClose,
  loan,
  onSuccess,
}: BorrowerKeyGenerationModalProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<'ready' | 'generating' | 'success'>('ready');

  const handleGenerateKeys = async () => {
    setStep('generating');

    try {
      console.log('🔑 Borrower generating public key for loan:', loan.id);

      // For now, only generate public key (not signed transactions)
      // Signed transactions will be generated after lender funds and escrow is created
      const result = await generateAndSignTransactions({
        loanId: loan.id,
        role: 'borrower',
        escrowAddress: loan.escrowAddress, // Will be undefined initially, filled when lender funds
        loanAmount: parseFloat(loan.amount),
        collateralBtc: parseFloat(loan.collateralBtc || '0'),
        currency: loan.currency,
        term: loan.termMonths,
      });

      console.log('✅ Borrower keys generated:', {
        pubkey: result.publicKey,
        transactionsSigned: result.signedTransactions.length,
      });

      // Only download and store if we have signed transactions (escrow exists)
      if (result.signedTransactions && result.signedTransactions.length > 0) {
        // Download signed transactions (user's recovery method)
        downloadSignedTransactions(loan.id, 'borrower', result);

        // Store signed transactions in database (for later broadcast)
        for (const signedTx of result.signedTransactions) {
          await apiRequest(`/api/loans/${loan.id}/transactions/store`, 'POST', {
            partyRole: 'borrower',
            partyPubkey: result.publicKey,
            txType: signedTx.type,
            psbt: signedTx.psbt,
            signature: signedTx.signature,
            txHash: signedTx.txHash,
            validAfter: signedTx.validAfter,
          });
        }

        console.log(`💾 Stored ${result.signedTransactions.length} signed transactions in database`);
      } else {
        console.log('ℹ️ No signed transactions generated yet (escrow will be created when lender funds)');
      }

      // Update loan with borrower pubkey (private key already wiped from memory)
      await apiRequest(`/api/loans/${loan.id}/borrower-keys`, 'PATCH', {
        borrowerPubkey: result.publicKey,
      });

      console.log('✅ Loan updated with borrower pubkey');

      setStep('success');

      toast({
        title: "Public Key Generated! 🔐",
        description: "Your loan is now ready for lenders. You'll generate recovery transactions after a lender funds your loan.",
      });
    } catch (error) {
      console.error('❌ Failed to generate borrower keys:', error);
      setStep('ready');
      
      toast({
        title: "Key Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate keys. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleComplete = () => {
    onSuccess();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            Generate Security Keys
          </DialogTitle>
          <DialogDescription>
            Create ephemeral Bitcoin keys to secure your loan collateral
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Security Explanation */}
          <Alert className="bg-blue-50 border-blue-200">
            <Shield className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-sm space-y-2">
              <p className="font-semibold text-blue-900">Reconquest Ephemeral Key Model</p>
              <ul className="list-disc ml-4 space-y-1 text-blue-800">
                <li>Keys are generated in your browser and immediately discarded</li>
                <li>You will download pre-signed recovery transactions (NOT private keys)</li>
                <li>If the platform disappears, you can broadcast these transactions to recover your Bitcoin</li>
                <li>Your private keys are NEVER stored or transmitted</li>
              </ul>
            </AlertDescription>
          </Alert>

          {/* Loan Details */}
          <div className="bg-gray-50 p-4 rounded-lg space-y-2">
            <h4 className="font-semibold text-sm text-gray-700">Loan Details</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-600">Amount:</span>
                <span className="ml-2 font-semibold">{loan.currency} {parseFloat(loan.amount).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-gray-600">Collateral:</span>
                <span className="ml-2 font-semibold">{parseFloat(loan.collateralBtc).toFixed(8)} BTC</span>
              </div>
              <div>
                <span className="text-gray-600">Interest Rate:</span>
                <span className="ml-2 font-semibold">{loan.interestRate}% p.a.</span>
              </div>
              <div>
                <span className="text-gray-600">Term:</span>
                <span className="ml-2 font-semibold">{loan.termMonths} months</span>
              </div>
            </div>
          </div>

          {/* Step indicator */}
          {step === 'ready' && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Important:</strong> After generating keys, you will download a recovery file. Keep this file safe - you'll need it to recover your Bitcoin if anything goes wrong.
              </AlertDescription>
            </Alert>
          )}

          {step === 'generating' && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-sm text-gray-600">Generating ephemeral keys and signing transactions...</p>
              <p className="text-xs text-gray-500">This may take a few seconds</p>
            </div>
          )}

          {step === 'success' && (
            <div className="space-y-4">
              <div className="flex items-center justify-center py-6">
                <CheckCircle2 className="h-16 w-16 text-green-500" />
              </div>
              <Alert className="bg-green-50 border-green-200">
                <Download className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-sm text-green-800">
                  <strong>Success!</strong> Your recovery file has been downloaded. Your loan request is now ready for lenders to fund.
                </AlertDescription>
              </Alert>
              <Alert className="bg-orange-50 border-orange-200">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                <AlertDescription className="text-sm text-orange-800">
                  <strong>Keep your recovery file safe!</strong> You'll need it to recover your Bitcoin collateral if the platform becomes unavailable.
                </AlertDescription>
              </Alert>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          {step === 'ready' && (
            <>
              <Button
                variant="outline"
                onClick={onClose}
                data-testid="button-cancel-key-generation"
              >
                Cancel
              </Button>
              <Button
                onClick={handleGenerateKeys}
                className="bg-primary hover:bg-primary/90"
                data-testid="button-generate-borrower-keys"
              >
                <Key className="h-4 w-4 mr-2" />
                Generate Keys & Sign Transactions
              </Button>
            </>
          )}

          {step === 'generating' && (
            <Button disabled className="bg-primary/50">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating...
            </Button>
          )}

          {step === 'success' && (
            <Button
              onClick={handleComplete}
              className="bg-green-600 hover:bg-green-700"
              data-testid="button-complete-borrower-keys"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Complete
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
