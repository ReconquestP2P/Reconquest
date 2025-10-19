import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Check, Key, Shield, Bitcoin, Download, Upload, Eye, EyeOff } from 'lucide-react';
import { useFirefishWASM } from '@/hooks/use-firefish-wasm';
import { useToast } from '@/hooks/use-toast';
import type { KeyPair } from '@/lib/firefish-wasm-mock';

interface EscrowSetupProps {
  loanId: number;
  role: 'borrower' | 'lender';
  onEscrowCreated?: (sessionId: string, address: string) => void;
}

export default function EscrowSetup({ loanId, role, onEscrowCreated }: EscrowSetupProps) {
  const { toast } = useToast();
  const {
    session,
    isLoading,
    error,
    generateBorrowerKeys,
    generateLenderKeys,
    generatePlatformKeys,
    createEscrow,
    submitToBackend,
    exportKeys,
    importKeys,
  } = useFirefishWASM();

  const [borrowerKeys, setBorrowerKeys] = useState<KeyPair | null>(null);
  const [lenderKeys, setLenderKeys] = useState<KeyPair | null>(null);
  const [platformKeys, setPlatformKeys] = useState<KeyPair | null>(null);
  const [showPrivateKeys, setShowPrivateKeys] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [importPassword, setImportPassword] = useState('');
  const [importData, setImportData] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  // Auto-generate platform keys (simulating platform-managed keys)
  useEffect(() => {
    if (!platformKeys) {
      setPlatformKeys(generatePlatformKeys());
    }
  }, [platformKeys, generatePlatformKeys]);

  const handleGenerateKeys = () => {
    if (role === 'borrower') {
      const keys = generateBorrowerKeys();
      setBorrowerKeys(keys);
      toast({ title: 'Keys Generated', description: 'Borrower keys created successfully' });
    } else {
      const keys = generateLenderKeys();
      setLenderKeys(keys);
      toast({ title: 'Keys Generated', description: 'Lender keys created successfully' });
    }
  };

  const handleCreateEscrow = async () => {
    if (!borrowerKeys || !platformKeys) {
      toast({ title: 'Error', description: 'Missing required keys', variant: 'destructive' });
      return;
    }

    try {
      const escrowSession = await createEscrow({
        loanId,
        borrowerKeys,
        lenderKeys: lenderKeys || null,
        platformKeys,
        network: 'testnet',
      });

      // Submit to backend
      await submitToBackend(escrowSession);

      if (onEscrowCreated) {
        onEscrowCreated(escrowSession.sessionId, escrowSession.state.address.address);
      }
    } catch (err) {
      console.error('Failed to create escrow:', err);
    }
  };

  const handleExportKeys = () => {
    const keys = role === 'borrower' ? borrowerKeys : lenderKeys;
    if (!keys || !exportPassword) {
      toast({ title: 'Error', description: 'Enter password to export keys', variant: 'destructive' });
      return;
    }

    try {
      const encrypted = exportKeys(keys, exportPassword);
      
      // Download as file
      const blob = new Blob([encrypted], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reconquest-${role}-keys-backup.txt`;
      a.click();
      URL.revokeObjectURL(url);

      toast({ title: 'Success', description: 'Keys exported - keep this file safe!' });
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  const handleImportKeys = () => {
    if (!importData || !importPassword) {
      toast({ title: 'Error', description: 'Enter encrypted data and password', variant: 'destructive' });
      return;
    }

    try {
      const keys = importKeys(importData, importPassword);
      
      if (role === 'borrower') {
        setBorrowerKeys(keys);
      } else {
        setLenderKeys(keys);
      }

      toast({ title: 'Success', description: 'Keys imported successfully' });
      setImportData('');
      setImportPassword('');
    } catch (err) {
      console.error('Import failed:', err);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
    toast({ title: 'Copied', description: `${label} copied to clipboard` });
  };

  const userKeys = role === 'borrower' ? borrowerKeys : lenderKeys;

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Firefish WASM Escrow Setup
          </CardTitle>
          <CardDescription>
            Client-side Bitcoin key generation and multisig escrow creation
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Key Management */}
      {!session && (
        <Card>
          <CardHeader>
            <CardTitle>Step 1: Generate Your Keys</CardTitle>
            <CardDescription>
              Keys are generated in your browser and NEVER sent to our servers
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs defaultValue="generate" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="generate">Generate New</TabsTrigger>
                <TabsTrigger value="import">Import Backup</TabsTrigger>
              </TabsList>

              <TabsContent value="generate" className="space-y-4">
                <Button
                  data-testid="button-generate-keys"
                  onClick={handleGenerateKeys}
                  disabled={!!userKeys || isLoading}
                  className="w-full"
                >
                  <Key className="mr-2 h-4 w-4" />
                  Generate {role === 'borrower' ? 'Borrower' : 'Lender'} Keys
                </Button>

                {userKeys && (
                  <div className="space-y-3 p-4 bg-muted rounded-lg">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold">Public Key (Safe to Share)</Label>
                      <Button
                        data-testid="button-toggle-private-keys"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowPrivateKeys(!showPrivateKeys)}
                      >
                        {showPrivateKeys ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs bg-white dark:bg-gray-800 p-2 rounded overflow-x-auto">
                        {userKeys.publicKey}
                      </code>
                      <Button
                        data-testid="button-copy-public-key"
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(userKeys.publicKey, 'Public key')}
                      >
                        {copied === 'Public key' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>

                    {showPrivateKeys && (
                      <div className="space-y-2 pt-2 border-t">
                        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                          <Shield className="h-4 w-4" />
                          <Label className="text-xs font-semibold">Private Key (NEVER SHARE!)</Label>
                        </div>
                        <code className="block text-xs bg-red-50 dark:bg-red-950 p-2 rounded overflow-x-auto">
                          {userKeys.privateKey}
                        </code>
                      </div>
                    )}

                    {/* Key Export */}
                    <div className="space-y-2 pt-2 border-t">
                      <Label className="text-sm">Backup Keys (Encrypted)</Label>
                      <div className="flex gap-2">
                        <Input
                          data-testid="input-export-password"
                          type="password"
                          placeholder="Enter password for backup"
                          value={exportPassword}
                          onChange={(e) => setExportPassword(e.target.value)}
                        />
                        <Button
                          data-testid="button-export-keys"
                          variant="outline"
                          onClick={handleExportKeys}
                          disabled={!exportPassword}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Export
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Download encrypted backup file - you'll need this to recover your keys
                      </p>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="import" className="space-y-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="import-data">Encrypted Backup Data</Label>
                    <Input
                      data-testid="input-import-data"
                      id="import-data"
                      placeholder="Paste encrypted backup"
                      value={importData}
                      onChange={(e) => setImportData(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="import-password">Backup Password</Label>
                    <Input
                      data-testid="input-import-password"
                      id="import-password"
                      type="password"
                      placeholder="Enter backup password"
                      value={importPassword}
                      onChange={(e) => setImportPassword(e.target.value)}
                    />
                  </div>

                  <Button
                    data-testid="button-import-keys"
                    onClick={handleImportKeys}
                    disabled={!importData || !importPassword}
                    className="w-full"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Import Keys
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Escrow Creation */}
      {userKeys && !session && (
        <Card>
          <CardHeader>
            <CardTitle>Step 2: Create Escrow Address</CardTitle>
            <CardDescription>
              Generate a 2-of-3 multisig Bitcoin address for secure collateral
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-muted rounded-lg">
                <Badge variant={borrowerKeys ? 'default' : 'secondary'}>
                  Borrower Key
                </Badge>
                <p className="text-xs mt-2">{borrowerKeys ? '✓ Ready' : 'Missing'}</p>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <Badge variant={lenderKeys ? 'default' : 'secondary'}>
                  Lender Key
                </Badge>
                <p className="text-xs mt-2">{lenderKeys ? '✓ Ready' : 'Optional'}</p>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <Badge variant="default">
                  Platform Key
                </Badge>
                <p className="text-xs mt-2">✓ Auto-generated</p>
              </div>
            </div>

            <Button
              data-testid="button-create-escrow"
              onClick={handleCreateEscrow}
              disabled={!borrowerKeys || !platformKeys || isLoading}
              className="w-full"
              size="lg"
            >
              <Bitcoin className="mr-2 h-5 w-5" />
              {isLoading ? 'Creating Escrow...' : 'Create Bitcoin Escrow Address'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Escrow Details */}
      {session && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Escrow Created Successfully</span>
              <Badge variant="default" data-testid="badge-escrow-status">
                {session.backendSynced ? 'Synced' : 'Local Only'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div>
                <Label className="text-sm text-muted-foreground">Session ID</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 text-sm bg-muted p-2 rounded" data-testid="text-session-id">
                    {session.sessionId}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(session.sessionId, 'Session ID')}
                  >
                    {copied === 'Session ID' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div>
                <Label className="text-sm text-muted-foreground">Bitcoin Escrow Address</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 font-mono text-lg bg-muted p-3 rounded" data-testid="text-escrow-address">
                    {session.state.address.address}
                  </code>
                  <Button
                    data-testid="button-copy-escrow-address"
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(session.state.address.address, 'Escrow address')}
                  >
                    {copied === 'Escrow address' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <Alert>
                <Bitcoin className="h-4 w-4" />
                <AlertTitle>Next Step: Fund the Escrow</AlertTitle>
                <AlertDescription>
                  Send Bitcoin to this address to secure the loan. The funding tracker will automatically detect the deposit.
                </AlertDescription>
              </Alert>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
