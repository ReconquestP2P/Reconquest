import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bitcoin, Copy, CheckCircle, AlertCircle, Key, Loader2, AlertTriangle, Lock, Download, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
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

interface DepositInstructionsCardProps {
  loan: Loan;
  userId: number;
}

interface SignedPSBT {
  txType: string;
  psbt: string;
  signature: string;
  txHash: string;
}

export default function DepositInstructionsCard({ loan, userId }: DepositInstructionsCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [showPinInput, setShowPinInput] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [keyCeremonyComplete, setKeyCeremonyComplete] = useState(false);
  const [signedPsbts, setSignedPsbts] = useState<SignedPSBT[]>([]);

  const confirmDeposit = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(`/api/loans/${loan.id}/confirm-deposit`, "POST", {});
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Deposit Confirmed!",
        description: "Your loan is now being processed.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/loans`] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to confirm deposit. Please try again.",
        variant: "destructive",
      });
    },
  });

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
    
    setGeneratingKey(true);
    
    try {
      console.log("Starting FULL Firefish key ceremony...");
      
      const { privateKey, publicKey } = deriveKeyFromPin(loan.id, userId, 'borrower', pin);
      console.log(`Derived borrower pubkey: ${publicKey.slice(0, 20)}...`);
      
      console.log("Step 1: Providing borrower key to create escrow...");
      const escrowResponse = await apiRequest(`/api/loans/${loan.id}/provide-borrower-key`, "POST", { 
        borrowerPubkey: publicKey 
      });
      const escrowData = await escrowResponse.json();
      
      if (!escrowData.escrowAddress) {
        throw new Error("Escrow creation failed - no address returned");
      }
      
      console.log(`Escrow created: ${escrowData.escrowAddress}`);
      
      console.log("Step 2: Fetching PSBT templates and signing ALL immediately...");
      const txTypes = ['recovery', 'cooperative_close'];
      const signedTransactions: SignedPSBT[] = [];
      
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
            console.log(`No PSBT template available for ${txType} yet (escrow not funded)`);
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
            partyRole: 'borrower',
            partyPubkey: publicKey,
            txType: tx.txType,
            psbt: tx.psbt,
            signature: tx.signature,
            txHash: tx.txHash,
          });
        }
        
        console.log("Step 5: Downloading recovery file...");
        downloadRecoveryFile(loan.id, 'borrower', publicKey, signedTransactions);
        
        setSignedPsbts(signedTransactions);
      }
      
      setKeyCeremonyComplete(true);
      setShowPinInput(false);
      setPin('');
      setConfirmPin('');
      
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/loans`] });
      
      toast({
        title: "Key Ceremony Complete!",
        description: signedTransactions.length > 0 
          ? `Escrow created and ${signedTransactions.length} transactions pre-signed. Recovery file downloaded.`
          : "Escrow created. You can now deposit BTC.",
      });
      
    } catch (error: any) {
      console.error('Key ceremony failed:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to complete key ceremony. Please try again.",
        variant: "destructive",
      });
    } finally {
      setGeneratingKey(false);
    }
  };

  const copyToClipboard = () => {
    if (loan.escrowAddress) {
      navigator.clipboard.writeText(loan.escrowAddress);
      setCopied(true);
      toast({
        title: "Copied!",
        description: "Escrow address copied to clipboard.",
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loan.escrowState === 'awaiting_borrower_key') {
    return (
      <Card className="border-purple-200 bg-purple-50 dark:bg-purple-900/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-purple-800 dark:text-purple-300">
            <Shield className="h-5 w-5" />
            Firefish Key Ceremony
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="bg-white dark:bg-gray-800 border-purple-300">
            <AlertCircle className="h-4 w-4 text-purple-600" />
            <AlertDescription className="text-sm">
              <p className="font-semibold">A lender has committed to fund your loan!</p>
              <p className="mt-1">Complete the key ceremony to create your escrow address.</p>
            </AlertDescription>
          </Alert>

          {!showPinInput ? (
            <>
              <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200">
                <AlertDescription className="text-sm space-y-2">
                  <p className="font-semibold">What happens during key ceremony:</p>
                  <ol className="list-decimal ml-4 space-y-1">
                    <li><strong>Create passphrase</strong> - Derives your Bitcoin key</li>
                    <li><strong>Create escrow</strong> - 2-of-3 multisig address generated</li>
                    <li><strong>Pre-sign ALL transactions</strong> - Recovery, cooperative close</li>
                    <li><strong>Wipe key</strong> - Private key destroyed after signing</li>
                    <li><strong>Download recovery file</strong> - Your signed transactions saved</li>
                  </ol>
                </AlertDescription>
              </Alert>

              <Button
                onClick={() => setShowPinInput(true)}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                data-testid="button-start-key-ceremony"
              >
                <Key className="h-4 w-4 mr-2" />
                Start Key Ceremony
              </Button>
            </>
          ) : (
            <>
              <Alert className="bg-amber-50 dark:bg-amber-900/20 border-amber-200">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-sm">
                  <p className="font-semibold">Remember your passphrase!</p>
                  <p className="mt-1">This passphrase derives your Bitcoin key. Write it down securely - you cannot recover it later.</p>
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
                    data-testid="input-borrower-pin"
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
                    data-testid="input-borrower-confirm-pin"
                  />
                </div>
                
                {pinError && (
                  <p className="text-sm text-red-500" data-testid="text-pin-error">{pinError}</p>
                )}
              </div>

              <div className="flex gap-3">
                <Button 
                  onClick={() => {
                    setShowPinInput(false);
                    setPin('');
                    setConfirmPin('');
                    setPinError(null);
                  }}
                  variant="outline"
                  data-testid="button-cancel-pin"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleFullKeyCeremony}
                  disabled={generatingKey || pin.length < 8}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                  data-testid="button-generate-borrower-key"
                >
                  {generatingKey ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Running Key Ceremony...
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4 mr-2" />
                      Complete Key Ceremony
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  if (!loan.escrowAddress) {
    return null;
  }

  return (
    <Card className="border-orange-200 bg-orange-50 dark:bg-orange-900/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-orange-800 dark:text-orange-300">
          <Bitcoin className="h-5 w-5" />
          Deposit Your Bitcoin Collateral
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {keyCeremonyComplete && signedPsbts.length > 0 && (
          <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-sm">
              <p className="font-semibold">Key Ceremony Complete!</p>
              <p className="mt-1">{signedPsbts.length} transactions pre-signed and stored. Recovery file downloaded.</p>
            </AlertDescription>
          </Alert>
        )}

        <Alert className="bg-white dark:bg-gray-800 border-orange-300">
          <AlertCircle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-sm">
            <p className="font-semibold">Escrow address created!</p>
            <p className="mt-1">Deposit {loan.collateralBtc} BTC to the address below.</p>
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Bitcoin Testnet Escrow Address:</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 p-3 bg-white dark:bg-gray-800 border border-gray-300 rounded-md text-sm font-mono break-all">
              {loan.escrowAddress}
            </code>
            <Button
              variant="outline"
              size="icon"
              onClick={copyToClipboard}
              data-testid="button-copy-escrow-address"
            >
              {copied ? <CheckCircle className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200">
          <AlertDescription className="text-sm space-y-2">
            <p className="font-semibold">Next Steps:</p>
            <ol className="list-decimal ml-4 space-y-1">
              <li>Send <strong>exactly {loan.collateralBtc} BTC</strong> to the address above</li>
              <li>Wait for blockchain confirmation (10-60 minutes)</li>
              <li>Click "Confirm Deposit" button below</li>
              <li>Your loan will become active</li>
            </ol>
          </AlertDescription>
        </Alert>

        <Alert className="bg-red-50 dark:bg-red-900/20 border-red-200">
          <AlertDescription className="text-sm">
            <p className="font-semibold text-red-800 dark:text-red-300">Security Reminders:</p>
            <ul className="list-disc ml-4 mt-2 space-y-1">
              <li>This is a <strong>Bitcoin TESTNET</strong> address</li>
              <li><strong>Double-check the address</strong> before sending</li>
              <li>Send <strong>exactly {loan.collateralBtc} BTC</strong></li>
            </ul>
          </AlertDescription>
        </Alert>

        <Button
          onClick={() => confirmDeposit.mutate()}
          disabled={confirmDeposit.isPending}
          className="w-full bg-orange-600 hover:bg-orange-700 text-white"
          data-testid="button-confirm-deposit"
        >
          {confirmDeposit.isPending ? "Confirming..." : "I've Deposited the BTC - Confirm"}
        </Button>
      </CardContent>
    </Card>
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
