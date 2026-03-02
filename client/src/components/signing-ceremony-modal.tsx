import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shield, Download, Lock, AlertTriangle, CheckCircle2, Key, Loader2, Upload } from 'lucide-react';
import { deriveKeyFromPin, hexToBytes } from '@/lib/deterministic-key';
import { downloadSignedTransactions } from '@/lib/ephemeral-signer';
import { retrieveKey, deleteKey, parseRecoveryBundle, storeKey } from '@/lib/key-vault';
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
  type: 'repayment' | 'default' | 'liquidation' | 'recovery';
  psbt: string;
  signature: string;
  txHash: string;
  validAfter?: number;
}

interface SigningProgress {
  repayment: 'pending' | 'signing' | 'signed' | 'error';
  default: 'pending' | 'signing' | 'signed' | 'error';
  liquidation: 'pending' | 'signing' | 'signed' | 'error';
  recovery: 'pending' | 'signing' | 'signed' | 'error';
}

export function SigningCeremonyModal({ isOpen, onClose, loan, role, userId }: SigningCeremonyModalProps) {
  const [step, setStep] = useState<'checking' | 'intro' | 'passphrase' | 'recovery' | 'generating' | 'complete'>('checking');
  const [passphrase, setPassphrase] = useState('');
  const [passphraseError, setPassphraseError] = useState<string | null>(null);
  const [recoveryPassphrase, setRecoveryPassphrase] = useState('');
  const [recoveryFile, setRecoveryFile] = useState<File | null>(null);
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [transactionsGenerated, setTransactionsGenerated] = useState(false);
  const [signingProgress, setSigningProgress] = useState<SigningProgress>({
    repayment: 'pending',
    default: 'pending',
    liquidation: 'pending',
    recovery: 'pending'
  });
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      checkForStoredKey();
    }
  }, [isOpen, loan.id, role]);

  const checkForStoredKey = async () => {
    setStep('checking');
    try {
      const storedKey = await retrieveKey(loan.id, role);
      setHasStoredKey(!!storedKey);
      setStep('intro');
    } catch (e) {
      console.error('Error checking for stored key:', e);
      setHasStoredKey(false);
      setStep('intro');
    }
  };

  const handleSignWithStoredKey = async () => {
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
      console.log(`Starting signing with stored key for ${role}...`);
      
      const storedKey = await retrieveKey(loan.id, role);
      if (!storedKey) {
        toast({
          title: "Key Not Found",
          description: "Please enter your passphrase to regenerate your key.",
          variant: "destructive",
        });
        setStep('passphrase');
        return;
      }
      
      const { privateKey, publicKey } = storedKey;
      console.log(`Retrieved key from vault, public key: ${publicKey.slice(0, 20)}...`);
      
      await signTransactions(privateKey, publicKey);
      
    } catch (error: any) {
      console.error("Error signing with stored key:", error);
      handleSigningError(error);
    }
  };

  const handleSignWithPassphrase = async () => {
    if (!loan.escrowAddress) {
      toast({
        title: "Error",
        description: "Escrow address not available yet",
        variant: "destructive",
      });
      return;
    }

    if (passphrase.length < 8) {
      setPassphraseError('Passphrase must be at least 8 characters');
      return;
    }

    setPassphraseError(null);
    setStep('generating');

    try {
      console.log(`Starting signing with passphrase for ${role}...`);
      
      const { privateKey, publicKey } = deriveKeyFromPin(loan.id, userId, role, passphrase);
      console.log(`Key derived from passphrase, public key: ${publicKey.slice(0, 20)}...`);
      
      await signTransactions(privateKey, publicKey);
      
    } catch (error: any) {
      console.error("Error signing with passphrase:", error);
      handleSigningError(error);
    }
  };

  const handleRecoveryFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setRecoveryFile(file);
    }
  };

  const handleRecoveryFileDecrypt = async () => {
    if (!recoveryFile) return;

    if (recoveryPassphrase.length < 8) {
      setPassphraseError('Passphrase must be at least 8 characters');
      return;
    }

    setPassphraseError(null);

    try {
      const text = await recoveryFile.text();
      const bundle = await parseRecoveryBundle(text, recoveryPassphrase);
      
      if (!bundle) {
        toast({
          title: "Decryption Failed",
          description: "Could not decrypt recovery file. Please check your passphrase.",
          variant: "destructive",
        });
        return;
      }

      if (bundle.loanId !== loan.id || bundle.role !== role) {
        toast({
          title: "Wrong Recovery File",
          description: `This file is for loan #${bundle.loanId} (${bundle.role}), but you need loan #${loan.id} (${role}).`,
          variant: "destructive",
        });
        return;
      }

      await storeKey(loan.id, role, bundle.privateKey, bundle.publicKey);
      setHasStoredKey(true);
      setRecoveryFile(null);
      setRecoveryPassphrase('');
      
      toast({
        title: "Recovery File Loaded",
        description: "Your key has been restored. You can now sign transactions.",
      });
      setStep('intro');
      
    } catch (error) {
      console.error('Error loading recovery file:', error);
      toast({
        title: "Error",
        description: "Failed to load recovery file. Check your passphrase.",
        variant: "destructive",
      });
    }
  };

  const signTransactions = async (privateKey: Uint8Array, publicKey: string) => {
    setSigningProgress({
      repayment: 'pending',
      default: 'pending',
      liquidation: 'pending',
      recovery: 'pending'
    });

    const signedTransactions: SignedTransaction[] = [];
    const signedPsbts: Array<{ type: string; psbtBase64: string; signature: string; txHash: string }> = [];

    if (role === 'borrower') {
      const txTypes: Array<'repayment' | 'default' | 'liquidation' | 'recovery'> = ['repayment', 'default', 'liquidation', 'recovery'];

      for (const txType of txTypes) {
        try {
          setSigningProgress(prev => ({ ...prev, [txType]: 'signing' }));

          const psbtData = await fetchPSBTTemplate(loan.id, txType);
          if (psbtData) {
            const signedPsbtBase64 = await signPsbtWithKey(
              psbtData.psbtBase64,
              privateKey,
              publicKey
            );

            signedTransactions.push({
              type: txType,
              psbt: signedPsbtBase64,
              signature: 'embedded_in_psbt',
              txHash: psbtData.txHash,
            });

            signedPsbts.push({
              type: txType,
              psbtBase64: signedPsbtBase64,
              signature: 'embedded_in_psbt',
              txHash: psbtData.txHash,
            });

            setSigningProgress(prev => ({ ...prev, [txType]: 'signed' }));
            console.log(`✓ Signed ${txType} with Bitcoin BIP143 sighash`);
          } else {
            console.warn(`No PSBT template found for ${txType}`);
            setSigningProgress(prev => ({ ...prev, [txType]: 'error' }));
          }
        } catch (err: any) {
          console.error(`Error signing ${txType}:`, err);
          setSigningProgress(prev => ({ ...prev, [txType]: 'error' }));
        }
      }

      // Wipe private key immediately after all signing is done
      privateKey.fill(0);
      console.log('Private key wiped from memory');

      if (signedPsbts.length === 0) {
        throw new Error('No PSBT templates found. Ensure your deposit has confirmed and try again.');
      }

      console.log(`Submitting ${signedPsbts.length} properly signed PSBTs to server`);

      const submitResponse = await apiRequest(`/api/loans/${loan.id}/sign-templates`, 'POST', {
        signedPsbts,
      });

      const submitData = await submitResponse.json();

      if (!submitData.success) {
        const rejectedReason = submitData.rejected?.[0]?.reason;
        throw new Error(rejectedReason || submitData.message || 'Server rejected signed PSBTs');
      }

      if ((submitData.stored?.length ?? 0) === 0) {
        throw new Error('No PSBTs were accepted. Check the browser console for details.');
      }

      console.log(`Server accepted ${submitData.stored.length} signed PSBTs`);

      // Download recovery file (contains signed PSBTs for offline recovery)
      const result = { publicKey, signedTransactions };
      downloadSignedTransactions(loan.id, role, result);
      console.log('Recovery file downloaded');
    } else {
      // Wipe private key for non-borrower roles too
      privateKey.fill(0);
    }

    // Mark signing ceremony complete
    const response = await apiRequest(`/api/loans/${loan.id}/complete-signing`, 'POST', { role });
    const data = await response.json();

    setTransactionsGenerated(true);
    setStep('complete');

    queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/loans`] });

    toast({
      title: data.loanActivated ? "Loan Activated!" : "Signing Complete!",
      description: data.message,
    });
  };

  const handleSigningError = (error: any) => {
    const errorMsg = error?.message || '';
    console.error('[SigningCeremony] Error:', errorMsg);
    
    if (errorMsg.includes('UTXO_NOT_FOUND') || errorMsg.includes('No PSBT templates found')) {
      toast({
        title: "PSBT Templates Not Found",
        description: "The transaction templates couldn't be loaded. Please refresh and try again.",
        variant: "destructive",
      });
    } else if (errorMsg.includes('Failed to submit')) {
      toast({
        title: "Submission Failed",
        description: errorMsg,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Signing Error",
        description: errorMsg || "Failed to sign transactions. Please try again.",
        variant: "destructive",
      });
    }
    setStep('intro');
  };

  const handleClose = () => {
    setStep('checking');
    setPassphrase('');
    setPassphraseError(null);
    // Refresh loan data to show updated escrow address and status
    queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/loans`] });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            🔐 Sign Pre-Authorized Transactions
          </DialogTitle>
          <DialogDescription>
            For security, you need to sign 4 pre-authorized transactions that protect your collateral.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {step === 'checking' && (
            <div className="py-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="text-sm text-muted-foreground mt-2">Checking for saved key...</p>
            </div>
          )}

          {step === 'intro' && (
            <>
              <Alert>
                <Lock className="h-4 w-4" />
                <AlertDescription>
                  {hasStoredKey ? (
                    <span><strong>Key Found:</strong> Your key is saved on this device. Click below to sign transactions.</span>
                  ) : (
                    <span><strong>Key Not Found:</strong> Enter your passphrase to regenerate your key, or upload your recovery file.</span>
                  )}
                </AlertDescription>
              </Alert>

              <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                <h3 className="font-semibold text-sm">🔐 Sign 4 Pre-Authorized Transactions:</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">✅</span>
                    <span><strong>Repayment:</strong> Get collateral back when you repay the loan</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">⚠️</span>
                    <span><strong>Default:</strong> Lender claims collateral if you don't repay</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📊</span>
                    <span><strong>Liquidation:</strong> Automatic if collateral value drops too low</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🔓</span>
                    <span><strong>Recovery:</strong> Emergency claim after 30 days if platform fails</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  These pre-signed transactions protect your Bitcoin collateral and ensure fair outcomes.
                </p>
              </div>

              <div className="pt-4 space-y-3">
                {hasStoredKey ? (
                  <Button 
                    onClick={handleSignWithStoredKey}
                    className="w-full"
                    size="lg"
                    data-testid={`button-sign-with-stored-key-${role}`}
                  >
                    <Key className="h-4 w-4 mr-2" />
                    Sign Transactions
                  </Button>
                ) : (
                  <>
                    <Button 
                      onClick={() => setStep('passphrase')}
                      className="w-full"
                      size="lg"
                      data-testid={`button-enter-passphrase-${role}`}
                    >
                      <Key className="h-4 w-4 mr-2" />
                      Enter Passphrase
                    </Button>
                    <Button 
                      onClick={() => setStep('recovery')}
                      variant="outline"
                      className="w-full"
                      data-testid={`button-upload-recovery-${role}`}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Recovery File
                    </Button>
                  </>
                )}
              </div>
            </>
          )}

          {step === 'passphrase' && (
            <>
              <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200">
                <Shield className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-sm">
                  <p>Enter the same passphrase you created during the key ceremony. This will regenerate your key for signing.</p>
                </AlertDescription>
              </Alert>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signingPassphrase">Your Escrow Passphrase</Label>
                  <Input
                    id="signingPassphrase"
                    type="password"
                    placeholder="Enter your passphrase..."
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    data-testid="input-signing-passphrase"
                  />
                </div>
                
                {passphraseError && (
                  <p className="text-sm text-red-500" data-testid="text-passphrase-error">{passphraseError}</p>
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
                  onClick={handleSignWithPassphrase}
                  className="flex-1"
                  disabled={passphrase.length < 8}
                  data-testid={`button-sign-with-passphrase-${role}`}
                >
                  <Lock className="h-4 w-4 mr-2" />
                  Sign Transactions
                </Button>
              </div>
            </>
          )}

          {step === 'recovery' && (
            <>
              <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200">
                <Upload className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-sm">
                  <p>Upload your recovery file and enter your passphrase to decrypt it.</p>
                </AlertDescription>
              </Alert>

              <div className="space-y-4">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleRecoveryFileSelect}
                    className="hidden"
                    id="recovery-file-input"
                    data-testid="input-recovery-file"
                  />
                  <label htmlFor="recovery-file-input" className="cursor-pointer">
                    {recoveryFile ? (
                      <>
                        <CheckCircle2 className="h-8 w-8 mx-auto text-green-500 mb-2" />
                        <p className="text-sm font-medium">{recoveryFile.name}</p>
                        <p className="text-xs text-muted-foreground mt-1">Click to change file</p>
                      </>
                    ) : (
                      <>
                        <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                        <p className="text-sm text-muted-foreground">Click to upload recovery file</p>
                        <p className="text-xs text-muted-foreground mt-1">reconquest-{role}-recovery-loan-{loan.id}.json</p>
                      </>
                    )}
                  </label>
                </div>

                {recoveryFile && (
                  <div className="space-y-2">
                    <Label htmlFor="recoveryPassphrase">Enter Passphrase to Decrypt</Label>
                    <Input
                      id="recoveryPassphrase"
                      type="password"
                      placeholder="Enter your passphrase..."
                      value={recoveryPassphrase}
                      onChange={(e) => setRecoveryPassphrase(e.target.value)}
                      data-testid="input-recovery-passphrase"
                    />
                  </div>
                )}

                {passphraseError && (
                  <p className="text-sm text-red-500">{passphraseError}</p>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <Button 
                  onClick={() => {
                    setStep('intro');
                    setRecoveryFile(null);
                    setRecoveryPassphrase('');
                    setPassphraseError(null);
                  }}
                  variant="outline"
                  data-testid="button-back-from-recovery"
                >
                  Back
                </Button>
                {recoveryFile && (
                  <Button 
                    onClick={handleRecoveryFileDecrypt}
                    className="flex-1"
                    disabled={recoveryPassphrase.length < 8}
                    data-testid="button-decrypt-recovery"
                  >
                    <Lock className="h-4 w-4 mr-2" />
                    Decrypt & Load Key
                  </Button>
                )}
              </div>
            </>
          )}

          {step === 'generating' && (
            <div className="py-6 space-y-4">
              <div className="text-center mb-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                  <Lock className="h-8 w-8 text-primary" />
                </div>
                <h3 className="font-semibold mt-2">Signing Pre-Authorized Transactions</h3>
                <p className="text-sm text-muted-foreground">
                  Sign 4 pre-authorized transactions to protect your collateral
                </p>
              </div>
              
              <div className="space-y-3 bg-muted/50 p-4 rounded-lg">
                {[
                  { type: 'repayment' as const, icon: '✅', label: 'Repayment', desc: 'Get collateral back when you repay' },
                  { type: 'default' as const, icon: '⚠️', label: 'Default', desc: 'Lender claims if you don\'t repay' },
                  { type: 'liquidation' as const, icon: '📊', label: 'Liquidation', desc: 'If collateral value drops too low' },
                  { type: 'recovery' as const, icon: '🔓', label: 'Recovery', desc: 'Emergency claim after 30 days' },
                ].map(({ type, icon, label, desc }) => (
                  <div key={type} className="flex items-center justify-between p-2 rounded bg-background/50">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{icon}</span>
                      <div>
                        <p className="font-medium text-sm">{label}</p>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {signingProgress[type] === 'pending' && (
                        <span className="text-xs text-muted-foreground">Waiting</span>
                      )}
                      {signingProgress[type] === 'signing' && (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      )}
                      {signingProgress[type] === 'signed' && (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      )}
                      {signingProgress[type] === 'error' && (
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
              
              <Alert className="bg-amber-50 dark:bg-amber-900/20 border-amber-200">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-sm">
                  <strong>Remember your passphrase!</strong> It's needed for emergency recovery if the platform becomes unavailable.
                </AlertDescription>
              </Alert>
            </div>
          )}

          {step === 'complete' && (
            <div className="py-6 space-y-4">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/20 mb-4">
                  <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-500" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Signing Complete!</h3>
                <p className="text-sm text-muted-foreground">
                  Your recovery file has been downloaded
                </p>
              </div>

              <Alert className="bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800">
                <Download className="h-4 w-4 text-green-600 dark:text-green-500" />
                <AlertDescription className="text-green-800 dark:text-green-400">
                  <strong>File Downloaded:</strong> <code>reconquest-{role}-loan{loan.id}-recovery.json</code>
                </AlertDescription>
              </Alert>

              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Keep this file safe!</strong> It contains your pre-signed transactions for emergency recovery.
                </AlertDescription>
              </Alert>

              <Button 
                onClick={handleClose}
                className="w-full"
                data-testid="button-close-complete"
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

async function fetchPSBTTemplate(loanId: number, txType: string): Promise<{ psbtBase64: string; txHash: string } | null> {
  try {
    // Use psbt-templates (plural) endpoint which supports placeholder UTXOs for pre-signing
    // This allows signing BEFORE deposit, as per P2WSH signing behavior
    const response = await apiRequest(`/api/loans/${loanId}/psbt-templates`, 'GET');
    const data = await response.json();
    
    // Response format: { loanId, escrowAddress, templates: [...], instructions }
    const templates = data.templates || [];
    
    // Map txType to the template type format used by the endpoint
    const typeMap: Record<string, string> = {
      'repayment': 'REPAYMENT',
      'default': 'DEFAULT_LIQUIDATION',
      'liquidation': 'DEFAULT_LIQUIDATION',
      'recovery': 'BORROWER_RECOVERY'
    };
    const targetType = typeMap[txType] || txType.toUpperCase();
    
    // Find the matching template from the templates array
    const template = templates.find((t: any) => 
      t.type === targetType || 
      t.type?.includes(txType.toUpperCase()) ||
      t.type?.toUpperCase() === txType.toUpperCase()
    );
    
    if (template?.psbtBase64) {
      console.log(`Found PSBT template for ${txType}:`, template.type);
      return {
        psbtBase64: template.psbtBase64,
        txHash: template.txHash || '',
      };
    }
    console.warn(`No matching template found for ${txType}, available types:`, templates.map((t: any) => t.type));
    return null;
  } catch (e) {
    console.error(`Error fetching PSBT template for ${txType}:`, e);
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

/**
 * Serialize signature to DER format for Bitcoin transactions
 * DER format: 30 <len> 02 <r_len> <r> 02 <s_len> <s>
 */
function serializeSignatureDER(signature: any): string {
  let rHex: string;
  let sHex: string;
  
  // Extract r and s values
  if (signature.r !== undefined && signature.s !== undefined) {
    rHex = signature.r.toString(16).padStart(64, '0');
    sHex = signature.s.toString(16).padStart(64, '0');
  } else if (typeof signature.toCompactRawBytes === 'function') {
    const compact = signature.toCompactRawBytes();
    rHex = bytesToHex(compact.slice(0, 32));
    sHex = bytesToHex(compact.slice(32, 64));
  } else if (signature instanceof Uint8Array && signature.length === 64) {
    rHex = bytesToHex(signature.slice(0, 32));
    sHex = bytesToHex(signature.slice(32, 64));
  } else {
    throw new Error('Cannot extract r/s from signature');
  }
  
  // Remove leading zeros but keep at least one byte
  rHex = rHex.replace(/^(00)+/, '') || '00';
  sHex = sHex.replace(/^(00)+/, '') || '00';
  
  // Add leading 00 if high bit is set (to indicate positive number)
  if (parseInt(rHex[0], 16) >= 8) {
    rHex = '00' + rHex;
  }
  if (parseInt(sHex[0], 16) >= 8) {
    sHex = '00' + sHex;
  }
  
  // Pad to even length
  if (rHex.length % 2 !== 0) rHex = '0' + rHex;
  if (sHex.length % 2 !== 0) sHex = '0' + sHex;
  
  const rLen = (rHex.length / 2).toString(16).padStart(2, '0');
  const sLen = (sHex.length / 2).toString(16).padStart(2, '0');
  
  // Build DER: 30 <total_len> 02 <r_len> <r> 02 <s_len> <s>
  const innerContent = '02' + rLen + rHex + '02' + sLen + sHex;
  const totalLen = (innerContent.length / 2).toString(16).padStart(2, '0');
  
  return '30' + totalLen + innerContent;
}

// ================================================================
// Bitcoin PSBT Signing — pure JS, no Buffer or WASM needed
// Implements BIP143 P2WSH sighash for Segwit inputs
// ================================================================

interface PsbtEntry { key: Uint8Array; value: Uint8Array; }
interface ParsedPsbt {
  globalEntries: PsbtEntry[];
  inputEntries: PsbtEntry[][];
  outputEntries: PsbtEntry[][];
}

function concatU8(...arrays: Uint8Array[]): Uint8Array {
  const len = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

function writeVI(n: number): Uint8Array {
  if (n < 0xfd) return new Uint8Array([n]);
  if (n < 0x10000) return new Uint8Array([0xfd, n & 0xff, (n >> 8) & 0xff]);
  return new Uint8Array([0xfe, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]);
}

function readVI(buf: Uint8Array, pos: number): [number, number] {
  const f = buf[pos];
  if (f < 0xfd) return [f, pos + 1];
  if (f === 0xfd) return [buf[pos + 1] | (buf[pos + 2] << 8), pos + 3];
  const v = new DataView(buf.buffer, buf.byteOffset + pos + 1, 4);
  return [v.getUint32(0, true), pos + 5];
}

function le32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, true);
  return b;
}

function le64(n: bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
}

function dsha256(data: Uint8Array): Uint8Array {
  return sha256(sha256(data));
}

function parsePsbtBinary(bytes: Uint8Array): ParsedPsbt {
  if (bytes[0] !== 0x70 || bytes[1] !== 0x73 || bytes[2] !== 0x62 ||
      bytes[3] !== 0x74 || bytes[4] !== 0xff) {
    throw new Error('Invalid PSBT magic bytes');
  }
  let pos = 5;

  function readEntry(): PsbtEntry | null {
    const [keyLen, p1] = readVI(bytes, pos); pos = p1;
    if (keyLen === 0) return null;
    const key = bytes.slice(pos, pos + keyLen); pos += keyLen;
    const [valLen, p2] = readVI(bytes, pos); pos = p2;
    const value = bytes.slice(pos, pos + valLen); pos += valLen;
    return { key, value };
  }

  const globalEntries: PsbtEntry[] = [];
  while (true) { const e = readEntry(); if (!e) break; globalEntries.push(e); }

  const unsignedTxEntry = globalEntries.find(e => e.key[0] === 0x00);
  if (!unsignedTxEntry) throw new Error('No unsigned tx in PSBT');
  const tx = unsignedTxEntry.value;

  let tp = 4;
  const [nIn, tp2] = readVI(tx, tp); tp = tp2;
  for (let i = 0; i < nIn; i++) {
    tp += 36;
    const [sl, tp3] = readVI(tx, tp); tp = tp3 + sl + 4;
  }
  const [nOut, tp4] = readVI(tx, tp); tp = tp4;

  const inputEntries: PsbtEntry[][] = [];
  for (let i = 0; i < nIn; i++) {
    const entries: PsbtEntry[] = [];
    while (true) { const e = readEntry(); if (!e) break; entries.push(e); }
    inputEntries.push(entries);
  }

  const outputEntries: PsbtEntry[][] = [];
  for (let i = 0; i < nOut; i++) {
    const entries: PsbtEntry[] = [];
    while (true) { const e = readEntry(); if (!e) break; entries.push(e); }
    outputEntries.push(entries);
  }

  return { globalEntries, inputEntries, outputEntries };
}

function encodePsbtBinary(parsed: ParsedPsbt): string {
  const magic = new Uint8Array([0x70, 0x73, 0x62, 0x74, 0xff]);
  const sep = new Uint8Array([0x00]);
  function encEntry(e: PsbtEntry): Uint8Array {
    return concatU8(writeVI(e.key.length), e.key, writeVI(e.value.length), e.value);
  }
  const parts: Uint8Array[] = [magic];
  for (const e of parsed.globalEntries) parts.push(encEntry(e));
  parts.push(sep);
  for (const inpEntries of parsed.inputEntries) {
    for (const e of inpEntries) parts.push(encEntry(e));
    parts.push(sep);
  }
  for (const outEntries of parsed.outputEntries) {
    for (const e of outEntries) parts.push(encEntry(e));
    parts.push(sep);
  }
  const raw = concatU8(...parts);
  return btoa(String.fromCharCode(...raw));
}

function computeBip143Sighash(parsed: ParsedPsbt, inputIndex: number): Uint8Array {
  const tx = parsed.globalEntries.find(e => e.key[0] === 0x00)!.value;
  const inpEntries = parsed.inputEntries[inputIndex];

  const witnessUtxoEntry = inpEntries.find(e => e.key[0] === 0x01);
  const witnessScriptEntry = inpEntries.find(e => e.key[0] === 0x05);
  if (!witnessUtxoEntry) throw new Error('PSBT input missing witnessUtxo (key 0x01)');
  if (!witnessScriptEntry) throw new Error('PSBT input missing witnessScript (key 0x05)');

  const witnessUtxoVal = new DataView(
    witnessUtxoEntry.value.buffer, witnessUtxoEntry.value.byteOffset, 8
  ).getBigUint64(0, true);
  const witnessScript = witnessScriptEntry.value;

  let tp = 0;
  const nVer = tx.slice(tp, tp + 4); tp += 4;
  const [nIn, tp2] = readVI(tx, tp); tp = tp2;

  const inputs: { op: Uint8Array; seq: Uint8Array }[] = [];
  for (let i = 0; i < nIn; i++) {
    const op = tx.slice(tp, tp + 36); tp += 36;
    const [sl, tp3] = readVI(tx, tp); tp = tp3 + sl;
    const seq = tx.slice(tp, tp + 4); tp += 4;
    inputs.push({ op, seq });
  }

  const [nOut, tp4] = readVI(tx, tp); tp = tp4;
  const outChunks: Uint8Array[] = [];
  for (let i = 0; i < nOut; i++) {
    const val8 = tx.slice(tp, tp + 8); tp += 8;
    const [sl, tp5] = readVI(tx, tp);
    const sc = tx.slice(tp5, tp5 + sl);
    outChunks.push(concatU8(val8, writeVI(sl), sc));
    tp = tp5 + sl;
  }
  const nLock = tx.slice(tp, tp + 4);

  const hashPrevouts = dsha256(concatU8(...inputs.map(i => i.op)));
  const hashSequence = dsha256(concatU8(...inputs.map(i => i.seq)));
  const hashOutputs  = dsha256(concatU8(...outChunks));
  const scriptCode   = concatU8(writeVI(witnessScript.length), witnessScript);

  const preimage = concatU8(
    nVer, hashPrevouts, hashSequence,
    inputs[inputIndex].op,
    scriptCode,
    le64(witnessUtxoVal),
    inputs[inputIndex].seq,
    hashOutputs, nLock,
    le32(1)
  );

  return dsha256(preimage);
}

async function signPsbtWithKey(
  psbtBase64: string,
  privateKeyBytes: Uint8Array,
  publicKeyHex: string,
  inputIndex = 0
): Promise<string> {
  const bytes = Uint8Array.from(atob(psbtBase64), c => c.charCodeAt(0));
  const parsed = parsePsbtBinary(bytes);
  const sighash = computeBip143Sighash(parsed, inputIndex);

  const sig = await secp256k1.sign(sighash, privateKeyBytes, { prehash: false, lowS: true });

  const derHex = serializeSignatureDER(sig);
  const derBytes = hexToBytes(derHex);
  const sigWithType = concatU8(derBytes, new Uint8Array([0x01]));

  const pubkeyBytes = hexToBytes(publicKeyHex);
  const sigKey = concatU8(new Uint8Array([0x02]), pubkeyBytes);

  const filtered = parsed.inputEntries[inputIndex].filter(
    e => !(e.key.length === 34 && e.key[0] === 0x02)
  );
  filtered.push({ key: sigKey, value: sigWithType });
  parsed.inputEntries[inputIndex] = filtered;

  return encodePsbtBinary(parsed);
}

export default SigningCeremonyModal;
