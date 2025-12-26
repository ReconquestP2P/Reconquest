import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shield, Download, Lock, AlertTriangle, CheckCircle2, Key, Loader2 } from 'lucide-react';
import { deriveKeyFromPin, verifyPinProducesKey, hexToBytes } from '@/lib/deterministic-key';
import { downloadSignedTransactions, createSignedTransactionBackup } from '@/lib/ephemeral-signer';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import * as secp256k1 from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha2.js';
import { hmac } from '@noble/hashes/hmac.js';

secp256k1.hashes.sha256 = (msg: Uint8Array): Uint8Array => sha256(msg);
secp256k1.hashes.hmacSha256 = (key: Uint8Array, ...msgs: Uint8Array[]): Uint8Array => {
  const concatenated = secp256k1.etc.concatBytes(...msgs);
  return hmac(sha256, key, concatenated);
};

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

interface SignedTransaction {
  type: 'recovery' | 'cooperative_close' | 'default';
  psbt: string;
  signature: string;
  txHash: string;
  validAfter?: number;
}

export function SigningCeremonyModal({ isOpen, onClose, loan, role, userId }: SigningCeremonyModalProps) {
  const [step, setStep] = useState<'intro' | 'pin' | 'generating' | 'complete'>('intro');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [transactionsGenerated, setTransactionsGenerated] = useState(false);
  const { toast } = useToast();

  const handleProceedToPin = () => {
    setStep('pin');
  };

  const handleSignWithPin = async () => {
    if (!loan.escrowAddress) {
      toast({
        title: "Error",
        description: "Escrow address not available yet",
        variant: "destructive",
      });
      return;
    }

    if (pin.length < 8) {
      setPinError('Passphrase must be at least 8 characters');
      return;
    }

    setPinError(null);
    setStep('generating');

    try {
      console.log(`Starting PIN-based signing for ${role}...`);
      
      const { privateKey, publicKey } = deriveKeyFromPin(loan.id, userId, role, pin);
      
      console.log(`Key derived from PIN, public key: ${publicKey.slice(0, 20)}...`);
      
      const signedTransactions: SignedTransaction[] = [];
      
      if (role === 'borrower') {
        const borrowerGracePeriodDays = 14;
        const borrowerTimelock = (loan.termMonths * 30 + borrowerGracePeriodDays) * 24 * 60 * 60;
        
        const recoveryPsbt = await fetchPSBTTemplate(loan.id, 'recovery');
        if (recoveryPsbt) {
          const messageHash = sha256(new TextEncoder().encode(recoveryPsbt.psbtBase64));
          const signature = await secp256k1.sign(messageHash, privateKey);
          const sigHex = serializeSignature(signature);
          
          signedTransactions.push({
            type: 'recovery',
            psbt: recoveryPsbt.psbtBase64,
            signature: sigHex,
            txHash: recoveryPsbt.txHash,
            validAfter: Date.now() + (borrowerTimelock * 1000),
          });
        }
      }
      
      const cooperativePsbt = await fetchPSBTTemplate(loan.id, 'cooperative_close');
      if (cooperativePsbt) {
        const messageHash = sha256(new TextEncoder().encode(cooperativePsbt.psbtBase64));
        const signature = await secp256k1.sign(messageHash, privateKey);
        const sigHex = serializeSignature(signature);
        
        signedTransactions.push({
          type: 'cooperative_close',
          psbt: cooperativePsbt.psbtBase64,
          signature: sigHex,
          txHash: cooperativePsbt.txHash,
        });
      }
      
      if (role === 'lender') {
        const lenderTimelock = loan.termMonths * 30 * 24 * 60 * 60;
        
        const defaultPsbt = await fetchPSBTTemplate(loan.id, 'default');
        if (defaultPsbt) {
          const messageHash = sha256(new TextEncoder().encode(defaultPsbt.psbtBase64));
          const signature = await secp256k1.sign(messageHash, privateKey);
          const sigHex = serializeSignature(signature);
          
          signedTransactions.push({
            type: 'default',
            psbt: defaultPsbt.psbtBase64,
            signature: sigHex,
            txHash: defaultPsbt.txHash,
            validAfter: Date.now() + (lenderTimelock * 1000),
          });
        }
      }
      
      privateKey.fill(0);
      console.log('Private key wiped from memory');
      
      if (signedTransactions.length === 0) {
        throw new Error('UTXO_NOT_FOUND: The escrow address has not been funded yet.');
      }
      
      console.log(`Signed ${signedTransactions.length} transactions`);
      
      for (const tx of signedTransactions) {
        await apiRequest(`/api/loans/${loan.id}/transactions/store`, 'POST', {
          partyRole: role,
          partyPubkey: publicKey,
          txType: tx.type,
          psbt: tx.psbt,
          signature: tx.signature,
          txHash: tx.txHash,
          validAfter: tx.validAfter,
        });
      }
      
      console.log('All transactions stored on platform');
      
      const result = { publicKey, signedTransactions };
      downloadSignedTransactions(loan.id, role, result);
      
      console.log('Recovery file downloaded');
      
      const response = await apiRequest(`/api/loans/${loan.id}/complete-signing`, 'POST', { role });
      const data = await response.json();
      
      setTransactionsGenerated(true);
      setStep('complete');
      
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/loans`] });
      
      toast({
        title: data.loanActivated ? "Loan Activated!" : "Signing Complete!",
        description: data.message,
      });

    } catch (error: any) {
      console.error("Error signing with PIN:", error);
      
      const errorMsg = error?.message || '';
      if (errorMsg.includes('UTXO_NOT_FOUND') || errorMsg.includes('escrow has been funded')) {
        toast({
          title: "Waiting for Bitcoin Deposit",
          description: "The escrow address hasn't been funded yet. Please deposit the Bitcoin collateral first.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to sign transactions. Please check your PIN and try again.",
          variant: "destructive",
        });
      }
      setStep('pin');
    }
  };

  const handleClose = () => {
    setStep('intro');
    setPin('');
    setPinError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Sign Transactions
          </DialogTitle>
          <DialogDescription>
            Firefish Security Model - Sign with your PIN
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {step === 'intro' && (
            <>
              <Alert>
                <Lock className="h-4 w-4" />
                <AlertDescription>
                  <strong>Deterministic Key Signing:</strong> Your PIN will regenerate your Bitcoin key, sign all required transactions, then the key is wiped from memory.
                </AlertDescription>
              </Alert>

              <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                <h3 className="font-semibold text-sm">What Will Happen:</h3>
                <ol className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="font-bold text-primary">1.</span>
                    <span><strong>Enter PIN:</strong> The same PIN you created during key ceremony</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-primary">2.</span>
                    <span><strong>Derive Key:</strong> Your Bitcoin key is regenerated from your PIN</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-primary">3.</span>
                    <span><strong>Sign Transactions:</strong> Pre-sign all required transactions</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-primary">4.</span>
                    <span><strong>Wipe Key:</strong> Private key wiped from memory</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-primary">5.</span>
                    <span><strong>Download Recovery:</strong> Pre-signed transactions saved to your device</span>
                  </li>
                </ol>
              </div>

              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Important:</strong> You must use the same PIN you created when committing to this loan.
                </AlertDescription>
              </Alert>

              <div className="pt-4">
                <Button 
                  onClick={handleProceedToPin}
                  className="w-full"
                  size="lg"
                  data-testid={`button-proceed-to-pin-${role}`}
                >
                  <Key className="h-4 w-4 mr-2" />
                  Enter PIN to Sign
                </Button>
              </div>
            </>
          )}

          {step === 'pin' && (
            <>
              <Alert className="bg-amber-50 dark:bg-amber-900/20 border-amber-200">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-sm">
                  <p className="font-semibold">Enter Your Escrow PIN</p>
                  <p className="mt-1">This must be the same PIN you created when committing to fund this loan.</p>
                </AlertDescription>
              </Alert>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signingPin">Your Escrow PIN</Label>
                  <Input
                    id="signingPin"
                    type="password"
                    placeholder="Enter your PIN..."
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    data-testid="input-signing-pin"
                  />
                </div>
                
                {pinError && (
                  <p className="text-sm text-red-500" data-testid="text-pin-error">{pinError}</p>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <Button 
                  onClick={() => setStep('intro')}
                  variant="outline"
                  data-testid="button-back-to-intro"
                >
                  Back
                </Button>
                <Button 
                  onClick={handleSignWithPin}
                  className="flex-1"
                  disabled={pin.length < 8}
                  data-testid={`button-sign-with-pin-${role}`}
                >
                  <Lock className="h-4 w-4 mr-2" />
                  Sign Transactions
                </Button>
              </div>
            </>
          )}

          {step === 'generating' && (
            <div className="py-8 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold">Signing Transactions...</h3>
                <p className="text-sm text-muted-foreground">
                  Deriving key from PIN and signing transactions
                </p>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Deriving Bitcoin key from PIN...</p>
                <p>Signing transactions...</p>
                <p>Wiping key from memory...</p>
                <p>Downloading recovery file...</p>
              </div>
            </div>
          )}

          {step === 'complete' && (
            <div className="py-6 space-y-4">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/20 mb-4">
                  <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-500" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Transactions Signed!</h3>
                <p className="text-sm text-muted-foreground">
                  Your recovery file has been downloaded
                </p>
              </div>

              <Alert className="bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800">
                <Download className="h-4 w-4 text-green-600 dark:text-green-500" />
                <AlertDescription className="text-green-800 dark:text-green-400">
                  <strong>File Downloaded:</strong> <code>reconquest-{role}-loan{loan.id}-recovery.json</code>
                  <br />
                  <span className="text-xs">Keep this file safe for fund recovery.</span>
                </AlertDescription>
              </Alert>

              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <h4 className="font-semibold text-sm">Security Completed:</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>Key derived from PIN</li>
                  <li>Transactions pre-signed</li>
                  <li>Private key discarded from memory</li>
                  <li>Recovery file downloaded</li>
                </ul>
              </div>

              <Button 
                onClick={handleClose}
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

async function fetchPSBTTemplate(loanId: number, txType: string): Promise<{
  psbtBase64: string;
  txHash: string;
  outputAddress: string;
  outputValue: number;
  fee: number;
} | null> {
  try {
    const token = localStorage.getItem('auth_token');
    const response = await fetch(`/api/loans/${loanId}/psbt-template?txType=${txType}`, {
      credentials: 'include',
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
      },
    });
    
    if (!response.ok) {
      console.warn(`Failed to fetch PSBT template: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    return {
      psbtBase64: data.psbtBase64,
      txHash: data.txHash,
      outputAddress: data.outputAddress,
      outputValue: data.outputValue,
      fee: data.fee,
    };
  } catch (error) {
    console.warn('Error fetching PSBT template:', error);
    return null;
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function serializeSignature(signature: any): string {
  if (typeof signature === 'string') {
    return signature;
  }
  
  if (signature instanceof Uint8Array) {
    return bytesToHex(signature);
  }
  
  if (typeof signature.toCompactHex === 'function') {
    return signature.toCompactHex();
  }
  
  if (typeof signature.toCompactRawBytes === 'function') {
    return bytesToHex(signature.toCompactRawBytes());
  }
  
  if (signature.r !== undefined && signature.s !== undefined) {
    const rHex = signature.r.toString(16).padStart(64, '0');
    const sHex = signature.s.toString(16).padStart(64, '0');
    return rHex + sHex;
  }
  
  console.error('Unable to serialize signature:', signature);
  throw new Error('Invalid signature format');
}
