import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileSignature, CheckCircle, AlertTriangle, Copy, Check } from 'lucide-react';
import { useFirefishWASM } from '@/hooks/use-firefish-wasm';
import { useToast } from '@/hooks/use-toast';
import { formatBTC } from '@/lib/utils';
import type { KeyPair, TransactionTemplate, SignedTransaction } from '@/lib/firefish-wasm-mock';

interface TransactionSigningProps {
  sessionId: string;
  role: 'borrower' | 'lender' | 'platform';
  userKeys: KeyPair;
  loanDetails: {
    principalSats: number;
    interestSats: number;
    lenderAddress: string;
  };
  onSigned?: () => void;
}

export default function TransactionSigning({
  sessionId,
  role,
  userKeys,
  loanDetails,
  onSigned,
}: TransactionSigningProps) {
  const { toast } = useToast();
  const {
    createRepaymentTx,
    signTransaction,
    submitSignature,
    isLoading,
  } = useFirefishWASM();

  const [txTemplate, setTxTemplate] = useState<TransactionTemplate | null>(null);
  const [signedTx, setSignedTx] = useState<SignedTransaction | null>(null);
  const [copied, setCopied] = useState(false);

  const totalAmount = loanDetails.principalSats + loanDetails.interestSats;

  const handleCreateTransaction = () => {
    const template = createRepaymentTx(loanDetails);
    if (template) {
      setTxTemplate(template);
      toast({ title: 'Success', description: 'Repayment transaction created' });
    }
  };

  const handleSign = () => {
    if (!txTemplate) {
      toast({ title: 'Error', description: 'No transaction to sign', variant: 'destructive' });
      return;
    }

    try {
      const signed = signTransaction(txTemplate, userKeys.privateKey, userKeys.publicKey);
      setSignedTx(signed);
      toast({ title: 'Success', description: 'Transaction signed locally' });
    } catch (err) {
      console.error('Signing failed:', err);
    }
  };

  const handleSubmit = async () => {
    if (!signedTx) {
      toast({ title: 'Error', description: 'No signature to submit', variant: 'destructive' });
      return;
    }

    try {
      await submitSignature(sessionId, signedTx, role);
      onSigned?.();
    } catch (err) {
      console.error('Submit failed:', err);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: 'Copied', description: 'PSBT copied to clipboard' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSignature className="h-5 w-5 text-primary" />
          Transaction Signing ({role})
        </CardTitle>
        <CardDescription>
          Pre-sign transactions for automated loan settlement
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Loan Details Summary */}
        <div className="p-3 bg-muted rounded-lg space-y-2">
          <p className="text-sm font-semibold">Repayment Details</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Principal:</span>
              <span className="ml-2 font-medium" data-testid="text-principal">
                {formatBTC(loanDetails.principalSats / 100000000)} BTC
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Interest:</span>
              <span className="ml-2 font-medium" data-testid="text-interest">
                {formatBTC(loanDetails.interestSats / 100000000)} BTC
              </span>
            </div>
            <div className="col-span-2 pt-2 border-t">
              <span className="text-muted-foreground">Total Repayment:</span>
              <span className="ml-2 font-semibold text-lg" data-testid="text-total">
                {formatBTC(totalAmount / 100000000)} BTC
              </span>
            </div>
          </div>
        </div>

        <Tabs defaultValue="create" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="create">1. Create</TabsTrigger>
            <TabsTrigger value="sign" disabled={!txTemplate}>2. Sign</TabsTrigger>
            <TabsTrigger value="submit" disabled={!signedTx}>3. Submit</TabsTrigger>
          </TabsList>

          {/* Step 1: Create Transaction */}
          <TabsContent value="create" className="space-y-4">
            <Alert>
              <AlertTitle>Create Repayment Transaction</AlertTitle>
              <AlertDescription>
                This generates a Bitcoin transaction that sends the repayment amount
                from the escrow to the lender's address.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label>Lender Address</Label>
              <Input
                data-testid="input-lender-address"
                value={loanDetails.lenderAddress}
                readOnly
                className="font-mono text-sm"
              />
            </div>

            <Button
              data-testid="button-create-transaction"
              onClick={handleCreateTransaction}
              disabled={!!txTemplate || isLoading}
              className="w-full"
            >
              {txTemplate ? 'Transaction Created ✓' : 'Create Repayment Transaction'}
            </Button>

            {txTemplate && (
              <Alert className="bg-green-50 dark:bg-green-950">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-800 dark:text-green-200">
                  Transaction Ready
                </AlertTitle>
                <AlertDescription className="text-green-700 dark:text-green-300">
                  PSBT created successfully. Proceed to signing.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          {/* Step 2: Sign Transaction */}
          <TabsContent value="sign" className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Sign with Your Private Key</AlertTitle>
              <AlertDescription>
                This operation uses your private key stored in browser memory.
                The signature proves you authorize this transaction.
              </AlertDescription>
            </Alert>

            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Signing with Public Key</p>
              <code className="text-xs font-mono break-all" data-testid="text-signing-key">
                {userKeys.publicKey}
              </code>
            </div>

            {txTemplate && (
              <div className="space-y-2">
                <Label>PSBT (Partially Signed Bitcoin Transaction)</Label>
                <div className="relative">
                  <textarea
                    data-testid="textarea-psbt"
                    value={txTemplate.psbt}
                    readOnly
                    className="w-full h-24 p-2 text-xs font-mono bg-muted rounded border resize-none"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={() => copyToClipboard(txTemplate.psbt)}
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}

            <Button
              data-testid="button-sign-transaction"
              onClick={handleSign}
              disabled={!!signedTx || isLoading}
              className="w-full"
            >
              {signedTx ? 'Signed ✓' : 'Sign Transaction with WASM'}
            </Button>

            {signedTx && (
              <Alert className="bg-green-50 dark:bg-green-950">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-800 dark:text-green-200">
                  Transaction Signed
                </AlertTitle>
                <AlertDescription className="text-green-700 dark:text-green-300">
                  Your signature has been added. Proceed to submit it to the backend.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          {/* Step 3: Submit Signature */}
          <TabsContent value="submit" className="space-y-4">
            <Alert>
              <AlertTitle>Submit to Backend</AlertTitle>
              <AlertDescription>
                Send your signature to the coordination server. The server stores
                signatures until all parties have signed (2-of-3 multisig).
              </AlertDescription>
            </Alert>

            {signedTx && (
              <div className="space-y-3">
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm font-semibold mb-2">Signature Details</p>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Role:</span>
                      <Badge variant="outline" data-testid="badge-role">{role}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Type:</span>
                      <Badge variant="outline">Repayment</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Complete:</span>
                      <span>{signedTx.complete ? 'Yes (2+ signatures)' : 'No (need more)'}</span>
                    </div>
                  </div>
                </div>

                <Button
                  data-testid="button-submit-signature"
                  onClick={handleSubmit}
                  disabled={isLoading}
                  className="w-full"
                  size="lg"
                >
                  {isLoading ? 'Submitting...' : 'Submit Signature to Backend'}
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Security Notice */}
        <Alert variant="default" className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
          <AlertDescription className="text-sm text-blue-900 dark:text-blue-100">
            🔒 <strong>Security:</strong> Your private key never leaves this browser.
            Only the signature is sent to the server.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
