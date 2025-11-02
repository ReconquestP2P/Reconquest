import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Copy, Eye, EyeOff, AlertTriangle, Check, Key } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getBitcoinKeys } from "@/lib/bitcoin-key-storage";

interface BitcoinKeysModalProps {
  loanId: number;
  escrowAddress?: string;
  role: "borrower" | "lender";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function BitcoinKeysModal({ 
  loanId, 
  escrowAddress, 
  role, 
  open, 
  onOpenChange 
}: BitcoinKeysModalProps) {
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [privateKeyCopied, setPrivateKeyCopied] = useState(false);
  const [publicKeyCopied, setPublicKeyCopied] = useState(false);
  const { toast } = useToast();

  const storedKeys = getBitcoinKeys(loanId);

  if (!storedKeys) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bitcoin Keys Not Found</DialogTitle>
            <DialogDescription>
              We couldn't find your Bitcoin keys for this loan. They may have been cleared from your browser storage.
            </DialogDescription>
          </DialogHeader>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Important</AlertTitle>
            <AlertDescription>
              If you saved your private key when creating this loan, please use that backup.
              Without your private key, you cannot access your collateral.
            </AlertDescription>
          </Alert>
        </DialogContent>
      </Dialog>
    );
  }

  const copyPrivateKey = () => {
    navigator.clipboard.writeText(storedKeys.privateKey);
    setPrivateKeyCopied(true);
    toast({
      title: "Private Key Copied",
      description: "Your private key has been copied to clipboard.",
    });
    setTimeout(() => setPrivateKeyCopied(false), 2000);
  };

  const copyPublicKey = () => {
    navigator.clipboard.writeText(storedKeys.publicKey);
    setPublicKeyCopied(true);
    toast({
      title: "Public Key Copied",
      description: "Your public key has been copied to clipboard.",
    });
    setTimeout(() => setPublicKeyCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Your Bitcoin Keys for Loan #{loanId}
          </DialogTitle>
          <DialogDescription>
            {role === "borrower" 
              ? "Use these keys to manage your collateral in the Bitcoin escrow."
              : "Use these keys to manage your funds in the Bitcoin escrow."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>⚠️ Keep Your Private Key Secure!</AlertTitle>
            <AlertDescription>
              Your private key controls access to your Bitcoin. Never share it with anyone.
              Store it in a password manager or encrypted file.
            </AlertDescription>
          </Alert>

          {escrowAddress && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Escrow Address</Label>
              <div className="bg-blue-50 border border-blue-200 p-3 rounded font-mono text-xs break-all">
                {escrowAddress}
              </div>
              <p className="text-xs text-gray-600">
                {role === "borrower"
                  ? "Send your Bitcoin collateral to this address."
                  : "This is the multisig escrow address holding the collateral."}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-sm font-medium">Your Public Key</Label>
            <div className="relative">
              <div className="bg-gray-50 p-3 rounded font-mono text-xs break-all border pr-20">
                {storedKeys.publicKey}
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={copyPublicKey}
                className="absolute top-2 right-2"
                data-testid="button-copy-public-key"
              >
                {publicKeyCopied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-red-600">Your Private Key 🔐</Label>
            <div className="relative">
              <div className="bg-red-50 border-2 border-red-200 p-3 rounded font-mono text-xs break-all pr-24">
                {showPrivateKey ? storedKeys.privateKey : '•'.repeat(64)}
              </div>
              <div className="absolute top-2 right-2 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowPrivateKey(!showPrivateKey)}
                  data-testid="button-toggle-private-key"
                >
                  {showPrivateKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={copyPrivateKey}
                  data-testid="button-copy-private-key"
                >
                  {privateKeyCopied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          <Alert className="bg-blue-50 border-blue-200">
            <AlertDescription className="text-sm">
              <p className="font-semibold mb-2">Security Tips:</p>
              <ul className="list-disc ml-4 space-y-1">
                <li>Save your private key in multiple secure locations (password manager, encrypted USB)</li>
                <li>Never send your private key via email or messaging apps</li>
                <li>You'll need this key to {role === "borrower" ? "reclaim your collateral after repaying" : "access funds if needed"}</li>
                <li>This dialog can be reopened anytime from your dashboard</li>
              </ul>
            </AlertDescription>
          </Alert>
        </div>
      </DialogContent>
    </Dialog>
  );
}
