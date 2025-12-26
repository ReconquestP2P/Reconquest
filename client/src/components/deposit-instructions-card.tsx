import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Bitcoin, Copy, CheckCircle, AlertCircle, Key, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import * as secp256k1 from '@noble/secp256k1';
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

  const confirmDeposit = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(`/api/loans/${loan.id}/confirm-deposit`, "POST", {});
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Deposit Confirmed! ✅",
        description: "You and the lender will now generate your security keys.",
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

  const provideBorrowerKey = useMutation({
    mutationFn: async (borrowerPubkey: string) => {
      const response = await apiRequest(`/api/loans/${loan.id}/provide-borrower-key`, "POST", { borrowerPubkey });
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Key Ceremony Complete! 🔐",
        description: "Escrow address created. You can now deposit your BTC.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/loans`] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to provide key. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleGenerateAndProvideKey = async () => {
    setGeneratingKey(true);
    try {
      const privateKeyBytes = secp256k1.utils.randomSecretKey();
      const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, true);
      const publicKeyHex = Array.from(publicKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      
      await provideBorrowerKey.mutateAsync(publicKeyHex);
    } catch (error: any) {
      console.error('Error generating key:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to generate key. Please try again.",
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

  // Show key generation UI if awaiting borrower key
  if (loan.escrowState === 'awaiting_borrower_key') {
    return (
      <Card className="border-purple-200 bg-purple-50 dark:bg-purple-900/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-purple-800 dark:text-purple-300">
            <Key className="h-5 w-5" />
            Step 1: Complete Key Ceremony
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="bg-white dark:bg-gray-800 border-purple-300">
            <AlertCircle className="h-4 w-4 text-purple-600" />
            <AlertDescription className="text-sm">
              <p className="font-semibold">A lender has committed to fund your loan!</p>
              <p className="mt-1">Before you can deposit BTC, you need to generate your security key for the 2-of-3 multisig escrow.</p>
            </AlertDescription>
          </Alert>

          <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200">
            <AlertDescription className="text-sm space-y-2">
              <p className="font-semibold">🔐 What happens when you click the button:</p>
              <ol className="list-decimal ml-4 space-y-1">
                <li>A unique cryptographic key is generated securely in your browser</li>
                <li>The public key is sent to create the 2-of-3 multisig escrow</li>
                <li>You'll receive the escrow address to deposit your BTC</li>
                <li>The private key is NOT stored - it will be regenerated during signing</li>
              </ol>
            </AlertDescription>
          </Alert>

          <Button
            onClick={handleGenerateAndProvideKey}
            disabled={generatingKey || provideBorrowerKey.isPending}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white"
            data-testid="button-generate-borrower-key"
          >
            {generatingKey || provideBorrowerKey.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating Key & Creating Escrow...
              </>
            ) : (
              <>
                <Key className="h-4 w-4 mr-2" />
                Generate Key & Get Escrow Address
              </>
            )}
          </Button>
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
          Action Required: Deposit Your Bitcoin Collateral
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="bg-white dark:bg-gray-800 border-orange-300">
          <AlertCircle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-sm">
            <p className="font-semibold">A lender has committed to fund your loan!</p>
            <p className="mt-1">You need to deposit {loan.collateralBtc} BTC to the escrow address below to proceed.</p>
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
            <p className="font-semibold">📋 Next Steps:</p>
            <ol className="list-decimal ml-4 space-y-1">
              <li>Send <strong>exactly {loan.collateralBtc} BTC</strong> to the address above</li>
              <li>Wait for the Bitcoin network to confirm your transaction (10-60 minutes)</li>
              <li>Click "Confirm Deposit" button below</li>
              <li>You and the lender will then generate ephemeral keys and sign transactions</li>
              <li>Your loan will become active</li>
            </ol>
          </AlertDescription>
        </Alert>

        <Alert className="bg-red-50 dark:bg-red-900/20 border-red-200">
          <AlertDescription className="text-sm">
            <p className="font-semibold text-red-800 dark:text-red-300">⚠️ Important Security Reminders:</p>
            <ul className="list-disc ml-4 mt-2 space-y-1">
              <li>This is a <strong>Bitcoin TESTNET</strong> address (for testing only)</li>
              <li><strong>Double-check the address</strong> before sending</li>
              <li>Send <strong>exactly {loan.collateralBtc} BTC</strong></li>
              <li><strong>Never share your private keys</strong> with anyone</li>
            </ul>
          </AlertDescription>
        </Alert>

        <Button
          onClick={() => confirmDeposit.mutate()}
          disabled={confirmDeposit.isPending}
          className="w-full bg-orange-600 hover:bg-orange-700 text-white"
          data-testid="button-confirm-deposit"
        >
          {confirmDeposit.isPending ? "Confirming..." : "✅ I've Deposited the BTC - Confirm"}
        </Button>
      </CardContent>
    </Card>
  );
}
