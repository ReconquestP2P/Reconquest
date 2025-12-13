import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Download, Lock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { generateAndSignTransactions, downloadSignedTransactions } from '@/lib/ephemeral-signer';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface SigningCeremonyModalProps {
  isOpen: boolean;
  onClose: () => void;
  loan: {
    id: number;
    amount: string;
    currency: string;
    collateralBtc: string;
    termMonths: number;
    escrowAddress: string | null;
  };
  role: 'borrower' | 'lender';
  userId: number;
}

export function SigningCeremonyModal({ isOpen, onClose, loan, role, userId }: SigningCeremonyModalProps) {
  const [step, setStep] = useState<'intro' | 'generating' | 'complete'>('intro');
  const [transactionsGenerated, setTransactionsGenerated] = useState(false);
  const { toast } = useToast();

  const handleGenerateKeys = async () => {
    if (!loan.escrowAddress) {
      toast({
        title: "Error",
        description: "Escrow address not available yet",
        variant: "destructive",
      });
      return;
    }

    setStep('generating');

    try {
      // Generate ephemeral keys and sign all transactions
      console.log(`🔐 Starting ephemeral key generation for ${role}...`);
      
      const result = await generateAndSignTransactions({
        loanId: loan.id,
        role,
        escrowAddress: loan.escrowAddress,
        loanAmount: parseFloat(loan.amount),
        collateralBtc: parseFloat(loan.collateralBtc),
        currency: loan.currency,
        term: loan.termMonths,
      });

      console.log(`✅ Generated ${result.signedTransactions.length} signed transactions`);
      console.log(`🗑️ Private key has been wiped from memory (ephemeral key discarded)`);

      // Store each signed transaction in the backend
      for (const tx of result.signedTransactions) {
        await apiRequest(`/api/loans/${loan.id}/transactions/store`, {
          method: 'POST',
          body: JSON.stringify({
            partyRole: role,
            partyPubkey: result.publicKey,
            txType: tx.type,
            psbt: tx.psbt,
            signature: tx.signature,
            txHash: tx.txHash,
            validAfter: tx.validAfter,
          }),
        });
      }

      console.log(`📤 All transactions stored on platform`);

      // Download the signed transactions file
      downloadSignedTransactions(loan.id, role, result);

      console.log(`📥 Recovery file downloaded`);

      // Mark signing ceremony complete
      const response = await apiRequest(`/api/loans/${loan.id}/complete-signing`, {
        method: 'POST',
        body: JSON.stringify({ role }),
      });

      const data = await response.json();

      setTransactionsGenerated(true);
      setStep('complete');

      // Invalidate queries to refresh loan status
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/loans`] });

      toast({
        title: data.loanActivated ? "🎉 Loan Activated!" : "✅ Signing Complete!",
        description: data.message,
      });

    } catch (error) {
      console.error("Error generating ephemeral keys:", error);
      toast({
        title: "Error",
        description: "Failed to generate recovery plan. Please try again.",
        variant: "destructive",
      });
      setStep('intro');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Generate Recovery Plan
          </DialogTitle>
          <DialogDescription>
            Reconquest Ephemeral Key Security Model
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {step === 'intro' && (
            <>
              <Alert>
                <Lock className="h-4 w-4" />
                <AlertDescription>
                  <strong>Maximum Security Protocol:</strong> Your private key will be generated, used to sign transactions, then <strong>immediately discarded</strong> from memory. You will NEVER see or store your private key.
                </AlertDescription>
              </Alert>

              <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                <h3 className="font-semibold text-sm">What Will Happen:</h3>
                <ol className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="font-bold text-primary">1.</span>
                    <span><strong>Generate Keys:</strong> Bitcoin keypair created in your browser</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-primary">2.</span>
                    <span><strong>Sign Transactions:</strong> Pre-sign recovery, cooperative close, and {role === 'lender' ? 'default' : 'recovery'} transactions</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-primary">3.</span>
                    <span><strong>Discard Key:</strong> Private key wiped from memory using <code>Uint8Array.fill(0)</code></span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-primary">4.</span>
                    <span><strong>Download Recovery:</strong> Pre-signed transactions saved to your device (NOT private keys!)</span>
                  </li>
                </ol>
              </div>

              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Important:</strong> Save the recovery file that downloads automatically. You'll need it if the platform becomes unavailable.
                </AlertDescription>
              </Alert>

              <div className="pt-4">
                <Button 
                  onClick={handleGenerateKeys}
                  className="w-full"
                  size="lg"
                  data-testid={`button-generate-recovery-${role}`}
                >
                  <Shield className="h-4 w-4 mr-2" />
                  Generate Recovery Plan
                </Button>
              </div>
            </>
          )}

          {step === 'generating' && (
            <div className="py-8 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 animate-pulse">
                <Lock className="h-8 w-8 text-primary" />
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold">Generating Ephemeral Keys...</h3>
                <p className="text-sm text-muted-foreground">
                  Creating keypair, signing transactions, and wiping memory
                </p>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>⚡ Generating Bitcoin keypair...</p>
                <p>✍️ Pre-signing transactions...</p>
                <p>🗑️ Wiping private key from memory...</p>
                <p>📥 Downloading recovery file...</p>
              </div>
            </div>
          )}

          {step === 'complete' && (
            <div className="py-6 space-y-4">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/20 mb-4">
                  <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-500" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Recovery Plan Generated!</h3>
                <p className="text-sm text-muted-foreground">
                  Your recovery file has been downloaded
                </p>
              </div>

              <Alert className="bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800">
                <Download className="h-4 w-4 text-green-600 dark:text-green-500" />
                <AlertDescription className="text-green-800 dark:text-green-400">
                  <strong>File Downloaded:</strong> <code>reconquest-{role}-loan{loan.id}-recovery.json</code>
                  <br />
                  <span className="text-xs">Keep this file safe. You'll need it to recover funds if the platform becomes unavailable.</span>
                </AlertDescription>
              </Alert>

              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <h4 className="font-semibold text-sm">✅ Security Completed:</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>✓ Ephemeral keypair generated</li>
                  <li>✓ Transactions pre-signed</li>
                  <li>✓ Private key discarded from memory</li>
                  <li>✓ Recovery file downloaded</li>
                  <li>✓ Waiting for other party to sign...</li>
                </ul>
              </div>

              <Button 
                onClick={onClose}
                className="w-full"
                variant="outline"
                data-testid="button-close-signing-modal"
              >
                Close
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
