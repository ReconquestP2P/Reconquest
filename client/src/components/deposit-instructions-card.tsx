import { useState, useEffect } from "react";
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
import { useNetworkExplorer } from "@/hooks/useNetworkExplorer";
import { SigningCeremonyModal } from "@/components/signing-ceremony-modal";
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
  const [recoveryDownloaded, setRecoveryDownloaded] = useState(false);
  const [escrowExplorerUrl, setEscrowExplorerUrl] = useState<string>('');
  const [borrowerReturnAddress, setBorrowerReturnAddress] = useState('');
  const [showSigningModal, setShowSigningModal] = useState(false);
  const [signingLoanData, setSigningLoanData] = useState<any>(null);
  
  const { getAddressUrl } = useNetworkExplorer();
  
  useEffect(() => {
    if (loan.escrowAddress) {
      getAddressUrl(loan.escrowAddress).then(setEscrowExplorerUrl);
    }
  }, [loan.escrowAddress, getAddressUrl]);

  const provideBorrowerKey = useMutation({
    mutationFn: async (params: { borrowerPubkey: string; borrowerReturnAddress?: string }) => {
      const response = await apiRequest(`/api/loans/${loan.id}/provide-borrower-key`, "POST", { 
        borrowerPubkey: params.borrowerPubkey,
        borrowerReturnAddress: params.borrowerReturnAddress 
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
      
      // NEW: Check if signing ceremony is required
      if (data.requiresSigning && data.psbts) {
        console.log('📝 PSBTs received, showing signing ceremony modal');
        setSigningLoanData({
          ...loan,
          escrowAddress: data.escrowAddress,
        });
        setShowSigningModal(true);
      }
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
    
    if (!borrowerReturnAddress || borrowerReturnAddress.trim() === '') {
      setPassphraseError('Bitcoin return address is required');
      return;
    }
    
    // Basic Bitcoin address validation (testnet or mainnet)
    const btcAddressPattern = /^(tb1|bc1|[123mn])[a-zA-HJ-NP-Z0-9]{25,62}$/;
    if (!btcAddressPattern.test(borrowerReturnAddress.trim())) {
      setPassphraseError('Please enter a valid Bitcoin address (tb1... for testnet, bc1... for mainnet)');
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
      
      await provideBorrowerKey.mutateAsync({ 
        borrowerPubkey: publicKey, 
        borrowerReturnAddress: borrowerReturnAddress || undefined 
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

  const downloadRecoveryBundle = () => {
    if (!recoveryBundle) return;
    
    const blob = new Blob([recoveryBundle], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `loan-${loan.id}-key-backup.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    setRecoveryDownloaded(true);
    
    toast({
      title: "Recovery File Downloaded",
      description: "You can now proceed to deposit your Bitcoin.",
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
          {/* Loan Info Summary */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-purple-200 dark:border-purple-700">
            <div className="flex items-center gap-2 mb-3">
              <Bitcoin className="h-5 w-5 text-amber-500" />
              <span className="font-semibold text-purple-800 dark:text-purple-300">Loan #{loan.id} Details</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-gray-500 dark:text-gray-400">Amount</p>
                <p className="font-medium">{loan.currency === 'EUR' ? '€' : '$'}{Number(loan.amount).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Term</p>
                <p className="font-medium">{loan.termMonths} months</p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Interest Rate</p>
                <p className="font-medium">{loan.interestRate}%</p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Collateral Required</p>
                <p className="font-medium text-amber-600">{Number(loan.collateralBtc).toFixed(6)} BTC</p>
              </div>
            </div>
          </div>

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

                <div className="space-y-2">
                  <Label htmlFor="borrowerReturnAddress">Bitcoin Return Address <span className="text-red-500">*</span></Label>
                  <Input
                    id="borrowerReturnAddress"
                    type="text"
                    placeholder="tb1q... (testnet) or bc1q... (mainnet)"
                    value={borrowerReturnAddress}
                    onChange={(e) => setBorrowerReturnAddress(e.target.value)}
                    data-testid="input-borrower-return-address"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Where your collateral will be returned after successful repayment. <span className="text-red-500 font-medium">Required.</span>
                  </p>
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
                  disabled={generatingKey || provideBorrowerKey.isPending || passphrase.length < 8 || !borrowerReturnAddress.trim()}
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

  if (loan.escrowAddress && !loan.borrowerSigningComplete && !recoveryBundle) {
    return (
      <>
      <Card className="border-purple-200 bg-purple-50 dark:bg-purple-900/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-purple-800 dark:text-purple-300">
            <Shield className="h-5 w-5" />
            Sign Transaction Templates - Loan #{loan.id}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-sm">
              <p className="font-semibold">Escrow address created!</p>
              <p className="mt-1">Before you can deposit BTC, you need to sign the pre-defined transaction templates that protect your collateral.</p>
            </AlertDescription>
          </Alert>

          <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-sm space-y-2">
              <p className="font-semibold">Why is this needed?</p>
              <p>These transaction templates define how your collateral can be moved — for repayment, default protection, or emergency recovery. Signing them now ensures your Bitcoin is protected before you deposit it.</p>
            </AlertDescription>
          </Alert>

          <Button
            onClick={() => {
              setSigningLoanData({
                id: loan.id,
                amount: loan.amount,
                currency: loan.currency,
                collateralBtc: loan.collateralBtc,
                termMonths: loan.termMonths,
                escrowAddress: loan.escrowAddress,
              });
              setShowSigningModal(true);
            }}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white"
          >
            <Lock className="h-4 w-4 mr-2" />
            Sign Transaction Templates
          </Button>
        </CardContent>
      </Card>
      {showSigningModal && signingLoanData && (
        <SigningCeremonyModal
          isOpen={showSigningModal}
          onClose={() => {
            setShowSigningModal(false);
          }}
          loan={{
            id: signingLoanData.id,
            amount: signingLoanData.amount,
            currency: signingLoanData.currency,
            collateralBtc: signingLoanData.collateralBtc,
            termMonths: signingLoanData.termMonths,
            escrowAddress: signingLoanData.escrowAddress,
          }}
          role="borrower"
          userId={userId}
        />
      )}
      </>
    );
  }

  if (recoveryBundle && !recoveryDownloaded) {
    return (
      <Card className="border-blue-200 bg-blue-50 dark:bg-blue-900/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-800 dark:text-blue-300">
            <Download className="h-5 w-5" />
            Download Your Recovery File
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-sm">
              <p className="font-semibold">Key Ceremony Complete!</p>
              <p className="mt-1">Your escrow address has been created for Loan #{loan.id}.</p>
            </AlertDescription>
          </Alert>

          <Alert className="bg-white dark:bg-gray-800 border-blue-300">
            <AlertDescription className="text-sm space-y-3">
              <p>The recovery file contains your encrypted private key (as borrower). Together with your passphrase, it recreates your key and would allow you to access your collateral if you ever need to.</p>
              <p>We recommend saving a backup of this file in a secure place, ideally offline.</p>
            </AlertDescription>
          </Alert>

          <Button 
            onClick={downloadRecoveryBundle}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            data-testid="button-download-recovery"
          >
            <Download className="mr-2 h-4 w-4" />
            Download Recovery File
          </Button>
        </CardContent>
      </Card>
    );
  }

  const depositDetected = loan.escrowMonitoringActive && !!loan.fundingTxid;
  const requiredSats = Math.round(parseFloat(String(loan.collateralBtc)) * 100_000_000);
  const depositedSats = loan.fundedAmountSats || 0;
  const isInsufficientDeposit = depositDetected && depositedSats > 0 && depositedSats < requiredSats;
  const shortfallBtc = isInsufficientDeposit ? ((requiredSats - depositedSats) / 100_000_000).toFixed(8) : '0';
  const depositedBtc = depositedSats > 0 ? (depositedSats / 100_000_000).toFixed(8) : '0';

  return (
    <>
    <Card className="border-orange-200 bg-orange-50 dark:bg-orange-900/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-orange-800 dark:text-orange-300">
          <Bitcoin className="h-5 w-5" />
          Deposit Your Bitcoin Collateral - Loan #{loan.id}
          {depositDetected && !isInsufficientDeposit && (
            <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-300 dark:border-green-700">
              BTC Sent
            </span>
          )}
          {isInsufficientDeposit && (
            <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-300 dark:border-red-700">
              Insufficient Deposit
            </span>
          )}
          {!depositDetected && loan.escrowMonitoringActive && (
            <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-300 dark:border-amber-700">
              Awaiting Deposit
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Loan Details:</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-gray-500">Loan Amount:</span>
            <span className="font-medium">{parseFloat(loan.amount).toLocaleString()} {loan.currency}</span>
            <span className="text-gray-500">Term:</span>
            <span className="font-medium">{loan.termMonths} months</span>
            <span className="text-gray-500">Interest Rate:</span>
            <span className="font-medium">{loan.interestRate}% p.a.</span>
            <span className="text-gray-500">Collateral Required:</span>
            <span className="font-medium">{loan.collateralBtc} BTC</span>
          </div>
        </div>

        <Alert className="bg-white dark:bg-gray-800 border-orange-300">
          <AlertCircle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-sm">
            <p className="font-semibold">Deposit {loan.collateralBtc} BTC to the escrow address below.</p>
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Bitcoin {loan.escrowAddress?.startsWith('bc1') ? 'Mainnet' : 'Testnet'} Escrow Address:</p>
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
            </ol>
          </AlertDescription>
        </Alert>

        <Alert className="bg-red-50 dark:bg-red-900/20 border-red-200">
          <AlertDescription className="text-sm">
            <p className="font-semibold text-red-800 dark:text-red-300">Security Reminders:</p>
            <ul className="list-disc ml-4 mt-2 space-y-1">
              {!loan.escrowAddress?.startsWith('bc1') && <li>This is a <strong>Bitcoin TESTNET</strong> address</li>}
              <li><strong>Double-check the address</strong> before sending</li>
              <li>Send <strong>exactly {loan.collateralBtc} BTC</strong> in a <strong>single transaction</strong></li>
              <li>If you accidentally send multiple transactions, the platform will automatically return any extra deposits to your BTC address</li>
            </ul>
          </AlertDescription>
        </Alert>

        {loan.escrowMonitoringActive ? (
          <div className="space-y-3">
            {loan.fundingTxid ? (
              <div className="space-y-2">
                {isInsufficientDeposit ? (
                  <Alert className="bg-red-50 dark:bg-red-900/20 border-red-300">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-sm space-y-2">
                      <p className="font-semibold text-red-800 dark:text-red-300">Insufficient Collateral Deposited</p>
                      <div className="grid grid-cols-2 gap-1 text-red-700 dark:text-red-400">
                        <span>Required:</span>
                        <span className="font-mono font-medium">{loan.collateralBtc} BTC</span>
                        <span>Received:</span>
                        <span className="font-mono font-medium">{depositedBtc} BTC</span>
                        <span>Shortfall:</span>
                        <span className="font-mono font-medium text-red-800 dark:text-red-300">{shortfallBtc} BTC</span>
                      </div>
                      <p className="text-red-700 dark:text-red-400 mt-2">
                        Please send the remaining <strong>{shortfallBtc} BTC</strong> to the same escrow address above to reach the required collateral amount.
                      </p>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                    <CheckCircle className="h-4 w-4 flex-shrink-0" />
                    <span>Deposit detected — awaiting blockchain confirmation</span>
                  </div>
                )}
                <div className="text-center">
                  <a 
                    href={escrowExplorerUrl || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    data-testid="link-mempool-monitor"
                  >
                    <Bitcoin className="h-4 w-4" />
                    View transaction on Mempool →
                  </a>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
                  <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                  <span>No transaction detected yet — send your BTC to the escrow address above</span>
                </div>
                <div className="text-center">
                  <a 
                    href={escrowExplorerUrl || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    data-testid="link-mempool-monitor"
                  >
                    <Bitcoin className="h-4 w-4" />
                    View escrow address on Mempool →
                  </a>
                </div>
              </div>
            )}
          </div>
        ) : (
          <Button
            onClick={() => confirmDeposit.mutate()}
            disabled={confirmDeposit.isPending}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white"
            data-testid="button-confirm-deposit"
          >
            {confirmDeposit.isPending ? "Confirming..." : "I've Deposited the BTC - Confirm"}
          </Button>
        )}
      </CardContent>
    </Card>
    
    {/* Signing Ceremony Modal - shown after PSBTs are generated */}
    {showSigningModal && signingLoanData && (
      <SigningCeremonyModal
        isOpen={showSigningModal}
        onClose={() => {
          setShowSigningModal(false);
          // Query invalidation happens inside the modal's handleClose
        }}
        loan={{
          id: signingLoanData.id,
          amount: signingLoanData.amount,
          currency: signingLoanData.currency,
          collateralBtc: signingLoanData.collateralBtc,
          termMonths: signingLoanData.termMonths,
          escrowAddress: signingLoanData.escrowAddress,
        }}
        role="borrower"
        userId={userId}
      />
    )}
    </>
  );
}
