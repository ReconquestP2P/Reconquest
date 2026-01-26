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
    const signedTransactions: SignedTransaction[] = [];
    const signatures: Record<string, string> = {};
    
    // Reset progress
    setSigningProgress({
      repayment: 'pending',
      default: 'pending',
      liquidation: 'pending',
      recovery: 'pending'
    });
    
    // Borrowers sign all 4 transaction types
    if (role === 'borrower') {
      const txTypes: Array<'repayment' | 'default' | 'liquidation' | 'recovery'> = ['repayment', 'default', 'liquidation', 'recovery'];
      
      for (const txType of txTypes) {
        try {
          setSigningProgress(prev => ({ ...prev, [txType]: 'signing' }));
          
          const psbtData = await fetchPSBTTemplate(loan.id, txType);
          if (psbtData) {
            // Sign the PSBT content
            const messageHash = sha256(new TextEncoder().encode(psbtData.psbtBase64));
            const signature = await secp256k1.sign(messageHash, privateKey);
            
            // Convert to DER format for the new API
            const derSig = serializeSignatureDER(signature);
            signatures[txType] = derSig;
            
            signedTransactions.push({
              type: txType,
              psbt: psbtData.psbtBase64,
              signature: derSig,
              txHash: psbtData.txHash,
            });
            
            setSigningProgress(prev => ({ ...prev, [txType]: 'signed' }));
            console.log(`✓ Signed ${txType} transaction`);
          } else {
            console.warn(`No PSBT found for ${txType}`);
            setSigningProgress(prev => ({ ...prev, [txType]: 'error' }));
          }
        } catch (err) {
          console.error(`Error signing ${txType}:`, err);
          setSigningProgress(prev => ({ ...prev, [txType]: 'error' }));
        }
      }
    }
    
    // Wipe private key immediately after signing
    privateKey.fill(0);
    console.log('Private key wiped from memory');
    
    if (Object.keys(signatures).length === 0) {
      throw new Error('UTXO_NOT_FOUND: The escrow address has not been funded yet.');
    }
    
    console.log(`Signed ${Object.keys(signatures).length} transactions`);
    
    // Submit all signatures to the new API endpoint
    try {
      const submitResponse = await apiRequest(`/api/loans/${loan.id}/submit-signatures`, 'POST', {
        signatures,
        borrowerPubkey: publicKey
      });
      
      const submitData = await submitResponse.json();
      
      if (!submitData.success) {
        throw new Error(submitData.error || 'Failed to submit signatures');
      }
      
      console.log('All signatures submitted to platform');
    } catch (err: any) {
      console.error('Error submitting signatures:', err);
      throw new Error(`Failed to submit signatures: ${err.message}`);
    }
    
    // Download recovery file
    const result = { publicKey, signedTransactions };
    downloadSignedTransactions(loan.id, role, result);
    console.log('Recovery file downloaded');
    
    // Complete signing ceremony
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
    if (errorMsg.includes('UTXO_NOT_FOUND') || errorMsg.includes('escrow has been funded')) {
      toast({
        title: "Waiting for Bitcoin Deposit",
        description: "The escrow address hasn't been funded yet. Please deposit the Bitcoin collateral first.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Error",
        description: "Failed to sign transactions. Please try again.",
        variant: "destructive",
      });
    }
    setStep('intro');
  };

  const handleClose = () => {
    setStep('checking');
    setPassphrase('');
    setPassphraseError(null);
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
    const response = await apiRequest(`/api/loans/${loanId}/psbt-template?txType=${txType}`, 'GET');
    const data = await response.json();
    
    if (data.psbtBase64) {
      return {
        psbtBase64: data.psbtBase64,
        txHash: data.txHash || '',
      };
    }
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

export default SigningCeremonyModal;
