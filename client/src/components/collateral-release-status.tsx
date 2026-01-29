import { useQuery, useMutation } from "@tanstack/react-query";
import { ExternalLink, CheckCircle, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ReleaseStatusProps {
  loanId: number;
  status: string;
  collateralReleased?: boolean;
  collateralReleaseTxid?: string | null;
  collateralReleasedAt?: string | null;
  collateralReleaseError?: string | null;
}

export function CollateralReleaseStatus({
  loanId,
  status,
  collateralReleased,
  collateralReleaseTxid,
  collateralReleasedAt,
  collateralReleaseError
}: ReleaseStatusProps) {
  const { toast } = useToast();
  
  const { data: releaseStatus } = useQuery({
    queryKey: [`/api/loans/${loanId}/release-status`],
    enabled: status === 'repaid',
    refetchInterval: collateralReleased ? false : 30000
  });
  
  const triggerRelease = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/loans/${loanId}/auto-release`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Collateral Released",
          description: `Transaction ID: ${data.txid?.slice(0, 16)}...`
        });
        queryClient.invalidateQueries({ queryKey: ['/api/loans'] });
        queryClient.invalidateQueries({ queryKey: ['/api/loans', loanId] });
      } else {
        toast({
          title: "Release Failed",
          description: data.error,
          variant: "destructive"
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });
  
  const isReleased = releaseStatus?.collateralReleased || collateralReleased;
  const txid = releaseStatus?.collateralReleaseTxid || collateralReleaseTxid;
  const error = releaseStatus?.collateralReleaseError || collateralReleaseError;
  
  if (status !== 'repaid') {
    return null;
  }
  
  if (isReleased && txid) {
    return (
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 rounded-lg">
        <div className="flex items-start gap-3">
          <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-green-800 dark:text-green-200">
              Collateral Returned Successfully!
            </p>
            <p className="text-sm text-green-600 dark:text-green-400 mt-1">
              Your Bitcoin collateral has been released to your wallet.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <code className="text-xs bg-green-100 dark:bg-green-900/40 px-2 py-1 rounded break-all">
                {txid}
              </code>
              <a
                href={`https://mempool.space/testnet4/tx/${txid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-600 hover:text-green-700 dark:text-green-400"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 rounded-lg">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800 dark:text-red-200">
              Collateral Release Failed
            </p>
            <p className="text-sm text-red-600 dark:text-red-400 mt-1">
              {error}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => triggerRelease.mutate()}
              disabled={triggerRelease.isPending}
              className="mt-3"
            >
              {triggerRelease.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Retrying...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry Release
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-4 rounded-lg">
      <div className="flex items-start gap-3">
        <Loader2 className="h-5 w-5 text-yellow-600 dark:text-yellow-400 animate-spin mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
            Collateral Release Pending
          </p>
          <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">
            Your Bitcoin collateral will be automatically returned within 5 minutes.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => triggerRelease.mutate()}
            disabled={triggerRelease.isPending}
            className="mt-3"
          >
            {triggerRelease.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Release Now
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
