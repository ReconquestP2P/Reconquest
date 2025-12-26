import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bitcoin, Copy, CheckCircle, AlertCircle, Key, Loader2, AlertTriangle, Lock, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { generatePublicKeyFromPin } from "@/lib/deterministic-key";
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
  const [showPinInput, setShowPinInput] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [keyCeremonyComplete, setKeyCeremonyComplete] = useState(false);

  const provideBorrowerKey = useMutation({
    mutationFn: async (borrowerPubkey: string) => {
      const response = await apiRequest(`/api/loans/${loan.id}/provide-borrower-key`, "POST", { 
        borrowerPubkey 
      });
      return await response.json();
    },
    onSuccess: (data) => {
      setKeyCeremonyComplete(true);
      setShowPinInput(false);
      setPin('');
      setConfirmPin('');
      
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
      console.log("Starting Firefish key ceremony (Phase 1 - Key Derivation)...");
      
      const publicKeyHex = generatePublicKeyFromPin(loan.id, userId, 'borrower', pin);
      console.log(`Derived borrower pubkey: ${publicKeyHex.slice(0, 20)}...`);
      console.log("Private key NOT stored - will be re-derived from passphrase after deposit for signing.");
      
      await provideBorrowerKey.mutateAsync(publicKeyHex);
      
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
            Firefish Key Ceremony - Phase 1
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
                  <p className="font-semibold">Firefish Security Model (3 Phases):</p>
                  <ol className="list-decimal ml-4 space-y-1">
                    <li><strong>Key Ceremony</strong> - Create passphrase → derive pubkey → create escrow</li>
                    <li><strong>Deposit</strong> - Send BTC to escrow address</li>
                    <li><strong>Signing Ceremony</strong> - Re-enter passphrase → sign ALL transactions → key wiped</li>
                  </ol>
                  <p className="text-xs text-muted-foreground mt-2">
                    Your passphrase deterministically derives your key. The same passphrase always produces the same key.
                  </p>
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
                  <p className="mt-1">You'll need it again after deposit to sign your recovery transactions.</p>
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
                  onClick={handleKeyCeremony}
                  disabled={generatingKey || provideBorrowerKey.isPending || pin.length < 8}
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

        <Alert className="bg-white dark:bg-gray-800 border-orange-300">
          <AlertCircle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-sm">
            <p className="font-semibold">Deposit {loan.collateralBtc} BTC to the escrow address below.</p>
            <p className="mt-1">After deposit confirms, you'll complete the signing ceremony.</p>
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

        <Alert className="bg-amber-50 dark:bg-amber-900/20 border-amber-200">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-sm">
            <p className="font-semibold">Remember your passphrase!</p>
            <p className="mt-1">You'll need it again for the signing ceremony after deposit.</p>
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
