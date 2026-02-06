import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shield, Lock, CheckCircle2, Loader2, AlertTriangle, ExternalLink, Key } from 'lucide-react';
import { deriveKeyFromPin } from '@/lib/deterministic-key';
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

interface CollateralRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  loan: {
    id: number;
    borrowerId: number;
    borrowerPubkey?: string | null;
    escrowAddress?: string | null;
    collateralBtc?: string | null;
  };
  userId: number;
}

type Step = 'intro' | 'passphrase' | 'signing' | 'broadcasting' | 'success' | 'error';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

function serializeSignatureDER(signature: any): string {
  let rHex: string;
  let sHex: string;

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

  rHex = rHex.replace(/^(00)+/, '') || '00';
  sHex = sHex.replace(/^(00)+/, '') || '00';

  if (parseInt(rHex[0], 16) >= 8) rHex = '00' + rHex;
  if (parseInt(sHex[0], 16) >= 8) sHex = '00' + sHex;

  if (rHex.length % 2 !== 0) rHex = '0' + rHex;
  if (sHex.length % 2 !== 0) sHex = '0' + sHex;

  const rLen = (rHex.length / 2).toString(16).padStart(2, '0');
  const sLen = (sHex.length / 2).toString(16).padStart(2, '0');

  const innerContent = '02' + rLen + rHex + '02' + sLen + sHex;
  const totalLen = (innerContent.length / 2).toString(16).padStart(2, '0');

  return '30' + totalLen + innerContent;
}

export function CollateralRecoveryModal({ isOpen, onClose, loan, userId }: CollateralRecoveryModalProps) {
  const [step, setStep] = useState<Step>('intro');
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState('');
  const [txid, setTxid] = useState('');
  const [broadcastUrl, setBroadcastUrl] = useState('');
  const [txDetails, setTxDetails] = useState<any>(null);
  const { toast } = useToast();

  const resetState = () => {
    setStep('intro');
    setPassphrase('');
    setError('');
    setTxid('');
    setBroadcastUrl('');
    setTxDetails(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleStartRecovery = () => {
    setStep('passphrase');
  };

  const handleSignAndBroadcast = async () => {
    if (!passphrase.trim()) {
      setError('Please enter your passphrase');
      return;
    }

    setError('');
    setStep('signing');

    try {
      const { privateKey, publicKey } = deriveKeyFromPin(loan.id, userId, 'borrower', passphrase);

      if (loan.borrowerPubkey && publicKey.toLowerCase() !== loan.borrowerPubkey.toLowerCase()) {
        privateKey.fill(0);
        setError('Wrong passphrase - the derived key does not match. Please try again with the passphrase you used when setting up the escrow.');
        setStep('passphrase');
        return;
      }

      const sighashRes = await apiRequest(`/api/loans/${loan.id}/recovery-sighash`, 'POST');
      const sighashData = await sighashRes.json();

      if (!sighashData.success) {
        privateKey.fill(0);
        setError(sighashData.error || 'Failed to prepare recovery transaction');
        setStep('error');
        return;
      }

      setTxDetails(sighashData.txDetails);

      const signatures: string[] = [];
      for (const sighashHex of sighashData.sighashes) {
        const sighashBytes = hexToBytes(sighashHex);
        const sig = await secp256k1.sign(sighashBytes, privateKey, { lowS: true, prehash: false });
        const derSig = serializeSignatureDER(sig);
        signatures.push(derSig);
      }

      privateKey.fill(0);

      setStep('broadcasting');

      const broadcastRes = await apiRequest(`/api/loans/${loan.id}/recovery-broadcast`, 'POST', {
        signatures,
      });
      const broadcastData = await broadcastRes.json();

      if (broadcastData.success) {
        setTxid(broadcastData.txid);
        setBroadcastUrl(broadcastData.broadcastUrl || '');
        setStep('success');
        queryClient.invalidateQueries({ queryKey: ['/api/loans'] });
        queryClient.invalidateQueries({ queryKey: ['/api/loans', loan.id] });
      } else {
        setError(broadcastData.error || 'Failed to broadcast recovery transaction');
        setStep('error');
      }
    } catch (err: any) {
      console.error('Recovery error:', err);
      setError(err.message || 'An unexpected error occurred');
      setStep('error');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-amber-500" />
            Collateral Recovery - Loan #{loan.id}
          </DialogTitle>
          <DialogDescription>
            Recover your Bitcoin collateral using your original passphrase
          </DialogDescription>
        </DialogHeader>

        {step === 'intro' && (
          <div className="space-y-4">
            <Alert className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800 dark:text-amber-200">
                This recovery process requires the passphrase you created when you set up the escrow for this loan.
                Your private key will be derived in your browser and never sent to the server.
              </AlertDescription>
            </Alert>

            <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <p className="font-medium text-gray-900 dark:text-gray-100">How this works:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>You enter your original passphrase</li>
                <li>Your browser re-derives your private key (stays in browser)</li>
                <li>The server prepares the transaction and computes what needs signing</li>
                <li>Your browser signs the transaction locally</li>
                <li>The signed transaction is broadcast to release your collateral</li>
              </ol>
            </div>

            {loan.collateralBtc && (
              <div className="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg text-sm">
                <span className="text-gray-500">Collateral to recover:</span>
                <span className="ml-2 font-mono font-medium">{loan.collateralBtc} BTC</span>
              </div>
            )}

            <Button onClick={handleStartRecovery} className="w-full">
              <Key className="h-4 w-4 mr-2" />
              Start Recovery
            </Button>
          </div>
        )}

        {step === 'passphrase' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recovery-passphrase">
                <Lock className="h-4 w-4 inline mr-1" />
                Enter your escrow passphrase
              </Label>
              <Input
                id="recovery-passphrase"
                type="password"
                placeholder="Enter the passphrase you used during escrow setup"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSignAndBroadcast()}
                autoFocus
              />
              <p className="text-xs text-gray-500">
                This is the same passphrase you entered when you first set up the escrow for loan #{loan.id}.
              </p>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('intro')} className="flex-1">
                Back
              </Button>
              <Button
                onClick={handleSignAndBroadcast}
                disabled={!passphrase.trim()}
                className="flex-1"
              >
                <Shield className="h-4 w-4 mr-2" />
                Sign & Recover
              </Button>
            </div>
          </div>
        )}

        {step === 'signing' && (
          <div className="space-y-4 text-center py-6">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-amber-500" />
            <div>
              <p className="font-medium">Signing recovery transaction...</p>
              <p className="text-sm text-gray-500 mt-1">
                Deriving your key and signing the transaction in your browser
              </p>
            </div>
          </div>
        )}

        {step === 'broadcasting' && (
          <div className="space-y-4 text-center py-6">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-500" />
            <div>
              <p className="font-medium">Broadcasting transaction...</p>
              <p className="text-sm text-gray-500 mt-1">
                Submitting the signed transaction to the Bitcoin network
              </p>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="space-y-4">
            <div className="text-center py-4">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
              <p className="font-medium text-lg text-green-700 dark:text-green-400">
                Collateral Recovery Successful!
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Your Bitcoin collateral has been released and is being sent to your wallet.
              </p>
            </div>

            {txDetails && (
              <div className="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Amount recovered:</span>
                  <span className="font-mono">{(txDetails.outputValue / 100000000).toFixed(8)} BTC</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Network fee:</span>
                  <span className="font-mono">{txDetails.fee} sats</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Destination:</span>
                  <span className="font-mono text-xs">{txDetails.destinationAddress?.slice(0, 20)}...</span>
                </div>
              </div>
            )}

            {txid && (
              <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">Transaction ID:</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-green-100 dark:bg-green-900/40 px-2 py-1 rounded break-all flex-1">
                    {txid}
                  </code>
                  {broadcastUrl && (
                    <a
                      href={broadcastUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-600 hover:text-green-700 dark:text-green-400 shrink-0"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>
            )}

            <Button onClick={handleClose} className="w-full">
              Done
            </Button>
          </div>
        )}

        {step === 'error' && (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Cancel
              </Button>
              <Button onClick={() => { setError(''); setStep('passphrase'); }} className="flex-1">
                Try Again
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
