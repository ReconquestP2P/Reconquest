import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Bitcoin, Copy, CheckCircle, AlertCircle, Key, Loader2, Lock, Shield, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { deriveKeyFromPin } from "@/lib/deterministic-key";
import { storeKey, createRecoveryBundle } from "@/lib/key-vault";
import type { Loan } from "@shared/schema";

interface DepositInstructionsCardProps {
  loan: Loan;
  userId: number;
}

export default function DepositInstructionsCard({ loan, userId }: DepositInstructionsCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [showPassphraseInput, setShowPassphraseInput] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [passphraseError, setPassphraseError] = useState<string | null>(null);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [keyCeremonyComplete, setKeyCeremonyComplete] = useState(false);
  const [recoveryBundle, setRecoveryBundle] = useState<string | null>(null);

  const provideBorrowerKey = useMutation({
    mutationFn: async (borrowerPubkey: string) => {
      const response = await apiRequest(`/api/loans/${loan.id}/provide-borrower-key`, "POST", { 
        borrowerPubkey 
      });
      return await response.json();
    },
    onSuccess: (data) => {
      setKeyCeremonyComplete(true);
      setShowPassphraseInput(false);
      setPassphrase('');
      setConfirmPassphrase('');
      
      toast({
        title: "Key Ceremony Complete!",
        description: `Escrow address created: ${data.escrowAddress?.slice(0, 20)}...`,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/loans`] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create escrow. Please try again.",
        variant: "destructive",
      });
    },
  });

  const confirmDeposit = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(`/api/loans/${loan.id}/confirm-deposit`, "POST", {});
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Deposit Confirmed!",
        description: "Now complete the signing ceremony to pre-sign your recovery transactions.",
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

  const handleKeyCeremony = async () => {
    setPassphraseError(null);
    
    if (passphrase.length < 8) {
      setPassphraseError('Passphrase must be at least 8 characters');
      return;
    }
    
    if (passphrase !== confirmPassphrase) {
      setPassphraseError('Passphrases do not match');
      return;
    }
    
    setGeneratingKey(true);
    
    try {
      console.log("Starting Firefish key ceremony (Phase 1 - Key Generation)...");
      
      const { privateKey, publicKey } = deriveKeyFromPin(loan.id, userId, 'borrower', passphrase);
      console.log(`Derived borrower pubkey: ${publicKey.slice(0, 20)}...`);
      
      if (rememberDevice) {
        await storeKey(loan.id, 'borrower', privateKey, publicKey);
        console.log("Private key stored securely in browser vault");
      }
      
      const bundle = await createRecoveryBundle(
        loan.id, 
        'borrower', 
        privateKey, 
        publicKey, 
        loan.escrowAddress || 'pending',
        passphrase
      );
      setRecoveryBundle(bundle);
      
      privateKey.fill(0);
      console.log("Private key wiped from working memory");
      
      await provideBorrowerKey.mutateAsync(publicKey);
      
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

  const downloadRecoveryBundle = () => {
    if (!recoveryBundle) return;
    
    const blob = new Blob([recoveryBundle], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reconquest-borrower-recovery-loan-${loan.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Recovery File Downloaded",
      description: "Keep this file safe - you can use it to sign from another device.",
    });
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
            Key Ceremony - Phase 1
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

          {!showPassphraseInput ? (
            <>
              <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200">
                <AlertDescription className="text-sm space-y-3">
                  <p className="font-semibold">🔐 Create a passphrase for Loan #{loan.id}</p>
                  <p>Your passphrase creates a unique "key" that protects your Bitcoin in this loan. Think of it like a password that unlocks a safe - without it, nobody (not even us) can move your coins.</p>
                  
                  <p className="font-semibold mt-3">🔒 Your passphrase stays private</p>
                  <p>Your passphrase is used only inside your browser to create your key and is <strong>never sent to Reconquest's servers</strong>.</p>
                  
                  <p className="font-semibold mt-3">💡 Tip</p>
                  <p>Write it down somewhere safe, preferably using an offline method (pen and paper).</p>
                </AlertDescription>
              </Alert>

              <Button
                onClick={() => setShowPassphraseInput(true)}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                data-testid="button-start-key-ceremony"
              >
                <Key className="h-4 w-4 mr-2" />
                Create My Security Key
              </Button>
            </>
          ) : (
            <>
              <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200">
                <Shield className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-sm space-y-2">
                  <p className="font-semibold">🔐 Create passphrase for Loan #{loan.id}</p>
                  <p>Your passphrase is used only inside your browser and is <strong>never sent to our servers</strong>.</p>
                </AlertDescription>
              </Alert>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="passphrase">Create Passphrase (min 8 characters)</Label>
                  <Input
                    id="passphrase"
                    type="password"
                    placeholder="Enter your secret passphrase..."
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    data-testid="input-borrower-passphrase"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="confirmPassphrase">Confirm Passphrase</Label>
                  <Input
                    id="confirmPassphrase"
                    type="password"
                    placeholder="Confirm your passphrase..."
                    value={confirmPassphrase}
                    onChange={(e) => setConfirmPassphrase(e.target.value)}
                    data-testid="input-borrower-confirm-passphrase"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="rememberDevice" 
                    checked={rememberDevice}
                    onCheckedChange={(checked) => setRememberDevice(checked === true)}
                    data-testid="checkbox-remember-device"
                  />
                  <Label htmlFor="rememberDevice" className="text-sm cursor-pointer">
                    Remember key on this device (recommended)
                  </Label>
                </div>
                
                {passphraseError && (
                  <p className="text-sm text-red-500" data-testid="text-passphrase-error">{passphraseError}</p>
                )}
              </div>

              <div className="flex gap-3">
                <Button 
                  onClick={() => {
                    setShowPassphraseInput(false);
                    setPassphrase('');
                    setConfirmPassphrase('');
                    setPassphraseError(null);
                  }}
                  variant="outline"
                  data-testid="button-cancel-passphrase"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleKeyCeremony}
                  disabled={generatingKey || provideBorrowerKey.isPending || passphrase.length < 8}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                  data-testid="button-generate-borrower-key"
                >
                  {generatingKey || provideBorrowerKey.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating Escrow...
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4 mr-2" />
                      Create Escrow Address
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
          Deposit Your Bitcoin Collateral - Phase 2
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {keyCeremonyComplete && (
          <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-sm">
              <p className="font-semibold">Key Ceremony Complete!</p>
              <p className="mt-1">Escrow address created. Now deposit your BTC.</p>
            </AlertDescription>
          </Alert>
        )}

        {recoveryBundle && (
          <Button 
            onClick={downloadRecoveryBundle}
            variant="outline"
            className="w-full"
            data-testid="button-download-recovery"
          >
            <Download className="mr-2 h-4 w-4" />
            Download Recovery File (Recommended)
          </Button>
        )}

        <Alert className="bg-white dark:bg-gray-800 border-orange-300">
          <AlertCircle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-sm">
            <p className="font-semibold">Deposit {loan.collateralBtc} BTC to the escrow address below.</p>
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
              <li>Wait for blockchain confirmation</li>
              <li>Click "Confirm Deposit" below</li>
              <li>Complete the <strong>Signing Ceremony</strong> to pre-sign all recovery transactions</li>
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
