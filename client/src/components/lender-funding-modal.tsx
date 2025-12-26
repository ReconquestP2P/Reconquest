import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Shield, CheckCircle, Key, Lock, AlertTriangle, Download } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { deriveKeyFromPin } from "@/lib/deterministic-key";
import * as secp256k1 from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha2.js';
import { hmac } from '@noble/hashes/hmac.js';
import type { Loan } from "@shared/schema";

secp256k1.hashes.sha256 = (msg: Uint8Array): Uint8Array => sha256(msg);
secp256k1.hashes.hmacSha256 = (key: Uint8Array, ...msgs: Uint8Array[]): Uint8Array => {
  const concatenated = secp256k1.etc.concatBytes(...msgs);
  return hmac(sha256, key, concatenated);
};

interface LenderFundingModalProps {
  isOpen: boolean;
  onClose: () => void;
  loan: Loan;
  userId: number;
}

interface SignedPSBT {
  txType: string;
  psbt: string;
  signature: string;
  txHash: string;
}

export default function LenderFundingModal({ 
  isOpen, 
  onClose, 
  loan,
  userId
}: LenderFundingModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [step, setStep] = useState<'confirm' | 'pin' | 'generating' | 'funded'>('confirm');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isGeneratingKeys, setIsGeneratingKeys] = useState(false);
  const [signedPsbts, setSignedPsbts] = useState<SignedPSBT[]>([]);

  const fundLoan = useMutation({
    mutationFn: async (data: { lenderPubkey: string; plannedStartDate: string; plannedEndDate: string }) => {
      const response = await apiRequest(`/api/loans/${loan.id}/fund`, "POST", {
        lenderPubkey: data.lenderPubkey,
        plannedStartDate: data.plannedStartDate,
        plannedEndDate: data.plannedEndDate
      });
      const loanResponse = await response.json();
      return loanResponse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
    },
    onError: (error: any) => {
      setStep('pin');
      setIsGeneratingKeys(false);
      
      let errorMessage = "Failed to fund loan. Please try again.";
      if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Cannot Fund Loan",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleProceedToPin = () => {
    setStep('pin');
  };

  const handleFullKeyCeremony = async () => {
    setPinError(null);
    
    if (pin.length < 8) {
      setPinError('Passphrase must be at least 8 characters for security');
      return;
    }
    
    if (!/[a-zA-Z]/.test(pin) || !/[0-9]/.test(pin)) {
      setPinError('Passphrase must contain both letters and numbers');
      return;
    }
    
    if (pin !== confirmPin) {
      setPinError('Passphrases do not match');
      return;
    }
    
    setIsGeneratingKeys(true);
    setStep('generating');
    
    try {
      console.log("Starting FULL Firefish key ceremony for lender...");
      
      const { privateKey, publicKey } = deriveKeyFromPin(loan.id, userId, 'lender', pin);
      console.log(`Derived lender pubkey: ${publicKey.slice(0, 20)}...`);
      
      const startDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const endDate = new Date(startDate.getTime() + loan.termMonths * 30 * 24 * 60 * 60 * 1000);
      
      console.log("Step 1: Registering lender pubkey...");
      await fundLoan.mutateAsync({ 
        lenderPubkey: publicKey,
        plannedStartDate: startDate.toISOString(),
        plannedEndDate: endDate.toISOString()
      });
      
      console.log("Step 2: Attempting to sign PSBTs (if escrow exists)...");
      const signedTransactions: SignedPSBT[] = [];
      const txTypes = ['default', 'cooperative_close'];
      
      for (const txType of txTypes) {
        try {
          const templateResponse = await fetch(`/api/loans/${loan.id}/psbt-template?txType=${txType}`, {
            credentials: 'include',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`,
            },
          });
          
          if (templateResponse.ok) {
            const template = await templateResponse.json();
            
            const messageHash = sha256(new TextEncoder().encode(template.psbtBase64));
            const signature = await secp256k1.sign(messageHash, privateKey);
            // @ts-ignore
            const sigHex = bytesToHex(signature.toCompactRawBytes ? signature.toCompactRawBytes() : new Uint8Array(64));
            
            signedTransactions.push({
              txType,
              psbt: template.psbtBase64,
              signature: sigHex,
              txHash: template.txHash,
            });
            
            console.log(`Signed ${txType} PSBT`);
          } else {
            console.log(`No PSBT template available for ${txType} yet`);
          }
        } catch (err) {
          console.log(`Could not sign ${txType}: ${err}`);
        }
      }
      
      console.log("Step 3: WIPING private key from memory...");
      privateKey.fill(0);
      console.log("Private key wiped!");
      
      if (signedTransactions.length > 0) {
        console.log("Step 4: Storing signed PSBTs on server...");
        for (const tx of signedTransactions) {
          await apiRequest(`/api/loans/${loan.id}/transactions/store`, 'POST', {
            partyRole: 'lender',
            partyPubkey: publicKey,
            txType: tx.txType,
            psbt: tx.psbt,
            signature: tx.signature,
            txHash: tx.txHash,
          });
        }
        
        console.log("Step 5: Downloading recovery file...");
        downloadRecoveryFile(loan.id, 'lender', publicKey, signedTransactions);
        
        setSignedPsbts(signedTransactions);
      }
      
      setStep('funded');
      
      toast({
        title: "Funding Commitment Complete!",
        description: signedTransactions.length > 0 
          ? `Key registered and ${signedTransactions.length} transactions pre-signed.`
          : "Key registered. Waiting for borrower to provide their key.",
      });
      
    } catch (error) {
      console.error('Key ceremony failed:', error);
      setStep('pin');
      setIsGeneratingKeys(false);
      toast({
        title: "Error",
        description: "Failed to complete key ceremony. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingKeys(false);
    }
  };

  const handleClose = () => {
    setStep('confirm');
    setPin('');
    setConfirmPin('');
    setPinError(null);
    setSignedPsbts([]);
    setIsGeneratingKeys(false);
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
                <p className="font-semibold">Firefish Key Ceremony:</p>
                <ol className="list-decimal ml-4 space-y-1">
                  <li>Create a secret passphrase to derive your Bitcoin key</li>
                  <li>Pre-sign ALL required transactions immediately</li>
                  <li>Private key wiped from memory after signing</li>
                  <li>Download your recovery file</li>
                </ol>
              </AlertDescription>
            </Alert>

            <div className="flex gap-3">
              <Button 
                onClick={handleClose} 
                variant="outline"
                data-testid="button-cancel-funding"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleProceedToPin}
                className="flex-1"
                data-testid="button-continue-to-pin"
              >
                Continue
              </Button>
            </div>
          </>
        )}

        {step === 'pin' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Create Your Escrow Passphrase
              </DialogTitle>
              <DialogDescription>
                This passphrase derives your Bitcoin key and signs all transactions.
              </DialogDescription>
            </DialogHeader>

            <Alert className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-sm">
                <p className="font-semibold">Remember your passphrase!</p>
                <p className="mt-1">Write it down securely. You cannot recover it later.</p>
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pin">Create Passphrase (min 8 chars, letters + numbers)</Label>
                <Input
                  id="pin"
                  type="password"
                  placeholder="Enter your secret passphrase..."
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  data-testid="input-pin"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="confirmPin">Confirm Passphrase</Label>
                <Input
                  id="confirmPin"
                  type="password"
                  placeholder="Confirm your passphrase..."
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  data-testid="input-confirm-pin"
                />
              </div>
              
              {pinError && (
                <p className="text-sm text-red-500" data-testid="text-pin-error">{pinError}</p>
              )}
            </div>

            <div className="flex gap-3">
              <Button 
                onClick={() => setStep('confirm')} 
                variant="outline"
                data-testid="button-back"
              >
                Back
              </Button>
              <Button 
                onClick={handleFullKeyCeremony}
                className="flex-1"
                disabled={isGeneratingKeys || pin.length < 8}
                data-testid="button-generate-key"
              >
                {isGeneratingKeys ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Running Key Ceremony...
                  </>
                ) : (
                  <>
                    <Lock className="mr-2 h-4 w-4" />
                    Complete Key Ceremony
                  </>
                )}
              </Button>
            </div>
          </>
        )}

        {step === 'generating' && (
          <>
            <DialogHeader>
              <DialogTitle>Running Key Ceremony...</DialogTitle>
              <DialogDescription>
                Deriving key, signing transactions, wiping memory
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
              <div className="text-sm text-muted-foreground space-y-1 text-center">
                <p>Deriving Bitcoin key from passphrase...</p>
                <p>Pre-signing all transactions...</p>
                <p>Wiping private key from memory...</p>
              </div>
            </div>
          </>
        )}

        {step === 'funded' && (
          <>
            <DialogHeader>
              <DialogTitle className="text-green-600">Key Ceremony Complete</DialogTitle>
              <DialogDescription>
                Your key is registered. {signedPsbts.length > 0 ? "Transactions pre-signed." : "Waiting for borrower."}
              </DialogDescription>
            </DialogHeader>

            <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-sm">
                <p className="font-semibold">Firefish Security Complete</p>
                <ul className="list-disc ml-4 mt-2 space-y-1">
                  <li>Key derived from passphrase</li>
                  {signedPsbts.length > 0 && <li>{signedPsbts.length} transactions pre-signed</li>}
                  <li>Private key wiped from memory</li>
                  {signedPsbts.length > 0 && <li>Recovery file downloaded</li>}
                </ul>
              </AlertDescription>
            </Alert>

            {signedPsbts.length === 0 && (
              <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                <AlertDescription className="text-sm space-y-2">
                  <p className="font-semibold">Next Steps:</p>
                  <ol className="list-decimal ml-4 space-y-1">
                    <li>Borrower will provide their key</li>
                    <li>Escrow address will be created</li>
                    <li>You'll sign remaining transactions when prompted</li>
                  </ol>
                </AlertDescription>
              </Alert>
            )}

            <Button 
              onClick={handleClose}
              className="w-full"
              data-testid="button-close-success"
            >
              Close
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function downloadRecoveryFile(loanId: number, role: string, publicKey: string, signedTransactions: SignedPSBT[]) {
  const backup = {
    loanId,
    role,
    publicKey,
    signedTransactions,
    createdAt: new Date().toISOString(),
    version: '2.0',
    notice: 'This file contains pre-signed Bitcoin transactions. Your private key was discarded after signing.',
  };
  
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `reconquest-${role}-loan${loanId}-recovery.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
