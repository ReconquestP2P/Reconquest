import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Bitcoin, CheckCircle, Clock, ExternalLink, RefreshCw } from 'lucide-react';
import { useFirefishWASMContext } from '@/contexts/FirefishWASMContext';
import { formatBTC } from '@/lib/utils';

interface FundingTrackerProps {
  escrowAddress: string;
  expectedAmountBTC: number;
  onFunded?: (txid: string, confirmations: number) => void;
  autoStart?: boolean;
}

export default function FundingTracker({
  escrowAddress,
  expectedAmountBTC,
  onFunded,
  autoStart = false,
}: FundingTrackerProps) {
  const {
    session,
    checkFunding,
    startFundingPolling,
    stopFundingPolling,
  } = useFirefishWASMContext();

  const [isPolling, setIsPolling] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  const fundingStatus = session?.fundingStatus;
  const isFunded = fundingStatus?.funded ?? false;
  const confirmations = fundingStatus?.confirmations ?? 0;
  const requiredConfirmations = 3; // Bitcoin standard for secure transactions

  // Auto-start polling if enabled
  useEffect(() => {
    if (autoStart && !isPolling && !isFunded) {
      handleStartPolling();
    }

    return () => {
      if (isPolling) {
        stopFundingPolling();
      }
    };
  }, [autoStart]);

  // Notify parent when funded
  useEffect(() => {
    if (isFunded && fundingStatus?.txid && confirmations >= requiredConfirmations) {
      onFunded?.(fundingStatus.txid, confirmations);
    }
  }, [isFunded, confirmations, fundingStatus?.txid, onFunded]);

  const handleStartPolling = () => {
    const expectedSats = Math.round(expectedAmountBTC * 100000000);
    startFundingPolling(escrowAddress);
    setIsPolling(true);
    setLastCheck(new Date());
  };

  const handleStopPolling = () => {
    stopFundingPolling();
    setIsPolling(false);
  };

  const handleManualCheck = async () => {
    const expectedSats = Math.round(expectedAmountBTC * 100000000);
    await checkFunding(escrowAddress, expectedSats);
    setLastCheck(new Date());
  };

  const getConfirmationProgress = () => {
    return Math.min((confirmations / requiredConfirmations) * 100, 100);
  };

  const getStatusBadge = () => {
    if (!isFunded) {
      return <Badge variant="secondary" data-testid="badge-funding-status">Waiting for Deposit</Badge>;
    }
    if (confirmations === 0) {
      return <Badge variant="outline" className="bg-yellow-100 text-yellow-800" data-testid="badge-funding-status">Unconfirmed</Badge>;
    }
    if (confirmations < requiredConfirmations) {
      return <Badge variant="outline" className="bg-blue-100 text-blue-800" data-testid="badge-funding-status">Confirming ({confirmations}/{requiredConfirmations})</Badge>;
    }
    return <Badge variant="default" className="bg-green-100 text-green-800" data-testid="badge-funding-status">Confirmed ✓</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bitcoin className="h-5 w-5 text-orange-500" />
              Funding Tracker
            </CardTitle>
            <CardDescription>
              Monitoring Bitcoin blockchain for deposits to escrow
            </CardDescription>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Escrow Address */}
        <div className="p-3 bg-muted rounded-lg">
          <p className="text-xs text-muted-foreground mb-1">Escrow Address</p>
          <code className="text-sm font-mono break-all" data-testid="text-tracking-address">
            {escrowAddress}
          </code>
        </div>

        {/* Expected Amount */}
        <div className="flex items-center justify-between p-3 border rounded-lg">
          <span className="text-sm text-muted-foreground">Expected Amount</span>
          <span className="font-semibold" data-testid="text-expected-amount">
            {formatBTC(expectedAmountBTC)} BTC
          </span>
        </div>

        {/* Funding Status */}
        {!isFunded && (
          <Alert>
            <Clock className="h-4 w-4" />
            <AlertTitle>Waiting for Bitcoin Deposit</AlertTitle>
            <AlertDescription>
              Send exactly {formatBTC(expectedAmountBTC)} BTC to the escrow address above.
              We'll automatically detect it on the blockchain.
            </AlertDescription>
          </Alert>
        )}

        {isFunded && fundingStatus && (
          <div className="space-y-3">
            {/* Transaction Details */}
            <div className="p-3 border rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Received Amount</span>
                <span className="font-semibold text-green-600" data-testid="text-received-amount">
                  {formatBTC((fundingStatus.amountSats || 0) / 100000000)} BTC
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Transaction ID</span>
                <a
                  href={`https://blockstream.info/testnet/tx/${fundingStatus.txid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                  data-testid="link-transaction"
                >
                  {fundingStatus.txid?.slice(0, 12)}...
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            {/* Confirmation Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Confirmations</span>
                <span className="font-semibold" data-testid="text-confirmations">
                  {confirmations} / {requiredConfirmations}
                </span>
              </div>
              <Progress value={getConfirmationProgress()} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {confirmations >= requiredConfirmations
                  ? '✓ Transaction confirmed and secure'
                  : `${requiredConfirmations - confirmations} more confirmation${requiredConfirmations - confirmations !== 1 ? 's' : ''} needed`
                }
              </p>
            </div>

            {/* Success Alert */}
            {confirmations >= requiredConfirmations && (
              <Alert className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-800 dark:text-green-200">
                  Escrow Fully Funded!
                </AlertTitle>
                <AlertDescription className="text-green-700 dark:text-green-300">
                  Your Bitcoin collateral has been confirmed on the blockchain.
                  The loan can now be activated.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* BTC Deposit Confirmation - Primary Action */}
        {!isFunded && !isPolling && (
          <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertTitle className="text-blue-800 dark:text-blue-200">
              Ready to Confirm Your Deposit?
            </AlertTitle>
            <AlertDescription className="text-blue-700 dark:text-blue-300 space-y-3">
              <p>After sending Bitcoin to the escrow address above, click the button below to start monitoring the blockchain.</p>
              <Button
                data-testid="button-confirm-deposit"
                onClick={handleStartPolling}
                className="w-full bg-gradient-to-r from-yellow-400 to-blue-500 hover:from-yellow-500 hover:to-blue-600 text-white font-bold"
                size="lg"
              >
                <Bitcoin className="mr-2 h-5 w-5" />
                ✅ I Have Deposited BTC - Confirm
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Polling Controls */}
        {(isFunded || isPolling) && (
          <div className="flex gap-2 pt-2 border-t">
            {isPolling ? (
              <Button
                data-testid="button-stop-tracking"
                onClick={handleStopPolling}
                variant="outline"
                className="flex-1"
              >
                Stop Tracking
              </Button>
            ) : (
              <Button
                data-testid="button-start-tracking"
                onClick={handleStartPolling}
                variant="default"
                className="flex-1"
                disabled={confirmations >= requiredConfirmations}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Resume Tracking
              </Button>
            )}

            <Button
              data-testid="button-check-now"
              onClick={handleManualCheck}
              variant="outline"
            >
              Check Now
            </Button>
          </div>
        )}

        {/* Last Check Timestamp */}
        {lastCheck && (
          <p className="text-xs text-center text-muted-foreground">
            Last checked: {lastCheck.toLocaleTimeString()}
            {isPolling && ' • Auto-checking every 10 seconds'}
          </p>
        )}

        {/* Blockchain Explorer Link */}
        <div className="pt-2 border-t">
          <a
            href={`https://blockstream.info/testnet/address/${escrowAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline flex items-center justify-center gap-1"
            data-testid="link-explorer"
          >
            View on Blockchain Explorer
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
