import { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import * as Firefish from '@/lib/firefish-wasm-mock';
import type { EscrowState, KeyPair, TransactionTemplate, SignedTransaction } from '@/lib/firefish-wasm-mock';

export interface EscrowSession {
  sessionId: string;
  loanId: number;
  state: EscrowState;
  backendSynced: boolean;
  fundingStatus?: {
    funded: boolean;
    txid?: string;
    confirmations?: number;
    amountSats?: number;
  };
}

export interface UseFirefishWASMReturn {
  // State
  session: EscrowSession | null;
  isLoading: boolean;
  error: string | null;

  // Key Management
  generateBorrowerKeys: () => KeyPair;
  generateLenderKeys: () => KeyPair;
  generatePlatformKeys: () => KeyPair;
  exportKeys: (keys: KeyPair, password: string) => string;
  importKeys: (encrypted: string, password: string) => KeyPair;

  // Escrow Creation
  createEscrow: (params: {
    loanId: number;
    borrowerKeys: KeyPair;
    lenderKeys: KeyPair | null;
    platformKeys: KeyPair;
    network?: 'testnet' | 'mainnet';
  }) => Promise<EscrowSession>;

  // Backend Sync
  submitToBackend: (session: EscrowSession) => Promise<void>;
  updateWASMState: (sessionId: string, state: EscrowState) => Promise<void>;
  fetchSession: (sessionId: string) => Promise<void>;

  // Funding Tracker
  checkFunding: (address: string, expectedAmount?: number) => Promise<void>;
  startFundingPolling: (address: string, intervalMs?: number) => void;
  stopFundingPolling: () => void;

  // Transaction Signing
  createRepaymentTx: (loanDetails: {
    principalSats: number;
    interestSats: number;
    lenderAddress: string;
  }) => TransactionTemplate | null;
  signTransaction: (template: TransactionTemplate, privateKey: string, publicKey: string) => SignedTransaction;
  submitSignature: (sessionId: string, signature: SignedTransaction, role: 'borrower' | 'lender' | 'platform') => Promise<void>;

  // Utilities
  resetSession: () => void;
}

export function useFirefishWASM(): UseFirefishWASMReturn {
  const { toast } = useToast();
  const [session, setSession] = useState<EscrowSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  // ============================================================================
  // Key Management
  // ============================================================================

  const generateBorrowerKeys = useCallback((): KeyPair => {
    try {
      const keys = Firefish.generateKeys();
      console.log('[WASM] Generated borrower keys:', { publicKey: keys.publicKey });
      return keys;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate borrower keys';
      setError(message);
      toast({ title: 'Error', description: message, variant: 'destructive' });
      throw err;
    }
  }, [toast]);

  const generateLenderKeys = useCallback((): KeyPair => {
    try {
      const keys = Firefish.generateKeys();
      console.log('[WASM] Generated lender keys:', { publicKey: keys.publicKey });
      return keys;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate lender keys';
      setError(message);
      toast({ title: 'Error', description: message, variant: 'destructive' });
      throw err;
    }
  }, [toast]);

  const generatePlatformKeys = useCallback((): KeyPair => {
    try {
      const keys = Firefish.generateKeys();
      console.log('[WASM] Generated platform keys:', { publicKey: keys.publicKey });
      return keys;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate platform keys';
      setError(message);
      toast({ title: 'Error', description: message, variant: 'destructive' });
      throw err;
    }
  }, [toast]);

  const exportKeys = useCallback((keys: KeyPair, password: string): string => {
    try {
      return Firefish.exportKeys(keys, password);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to export keys';
      setError(message);
      toast({ title: 'Error', description: message, variant: 'destructive' });
      throw err;
    }
  }, [toast]);

  const importKeys = useCallback((encrypted: string, password: string): KeyPair => {
    try {
      return Firefish.importKeys(encrypted, password);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to import keys - check password';
      setError(message);
      toast({ title: 'Error', description: message, variant: 'destructive' });
      throw err;
    }
  }, [toast]);

  // ============================================================================
  // Escrow Creation
  // ============================================================================

  const createEscrow = useCallback(async (params: {
    loanId: number;
    borrowerKeys: KeyPair;
    lenderKeys: KeyPair | null;
    platformKeys: KeyPair;
    network?: 'testnet' | 'mainnet';
  }): Promise<EscrowSession> => {
    try {
      setIsLoading(true);
      setError(null);

      console.log('[WASM] Creating escrow for loan:', params.loanId);

      // Initialize escrow state using WASM
      const state = Firefish.initializeEscrowState(
        params.borrowerKeys,
        params.lenderKeys,
        params.platformKeys,
        params.network || 'testnet'
      );

      const newSession: EscrowSession = {
        sessionId: crypto.randomUUID(),
        loanId: params.loanId,
        state,
        backendSynced: false,
      };

      setSession(newSession);
      console.log('[WASM] Escrow created:', {
        sessionId: newSession.sessionId,
        address: state.address.address,
      });

      toast({
        title: 'Escrow Created',
        description: `Bitcoin address generated: ${state.address.address.slice(0, 20)}...`,
      });

      return newSession;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create escrow';
      setError(message);
      toast({ title: 'Error', description: message, variant: 'destructive' });
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // ============================================================================
  // Backend Sync
  // ============================================================================

  const submitToBackend = useCallback(async (escrowSession: EscrowSession): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);

      console.log('[API] Submitting escrow session to backend:', escrowSession.sessionId);

      const payload = {
        sessionId: escrowSession.sessionId,
        loanId: escrowSession.loanId,
        escrowAddress: escrowSession.state.address.address,
        witnessScript: escrowSession.state.address.witnessScript,
        scriptHash: escrowSession.state.address.scriptHash,
        borrowerPubkey: escrowSession.state.config.parties[0],
        lenderPubkey: escrowSession.state.config.parties[1] !== '00' ? escrowSession.state.config.parties[1] : null,
        platformPubkey: escrowSession.state.config.parties[2],
        wasmState: Firefish.serializeState(escrowSession.state),
      };

      const response = await apiRequest('/api/escrow/sessions', 'POST', payload);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to create escrow session');
      }

      setSession(prev => prev ? { ...prev, backendSynced: true } : null);

      toast({
        title: 'Success',
        description: 'Escrow session saved to backend',
      });

      console.log('[API] Escrow session created:', data.session);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit to backend';
      setError(message);
      toast({ title: 'Backend Error', description: message, variant: 'destructive' });
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const updateWASMState = useCallback(async (sessionId: string, state: EscrowState): Promise<void> => {
    try {
      setIsLoading(true);

      const payload = {
        wasmState: Firefish.serializeState(state),
      };

      const response = await apiRequest(`/api/escrow/sessions/${sessionId}`, 'PATCH', payload);
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to update WASM state');
      }

      console.log('[API] WASM state updated for session:', sessionId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update state';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchSession = useCallback(async (sessionId: string): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/escrow/sessions/${sessionId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch session');
      }

      const data = await response.json();
      console.log('[API] Fetched session:', data.session);

      // Deserialize WASM state (doesn't include private keys)
      const wasmState = data.session.wasmState 
        ? Firefish.deserializeState(data.session.wasmState)
        : null;

      // Note: Private keys are NOT in the backend response
      // User must have them stored locally or import from backup

      toast({
        title: 'Session Loaded',
        description: `Escrow session ${sessionId.slice(0, 8)}... loaded`,
      });

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch session';
      setError(message);
      toast({ title: 'Error', description: message, variant: 'destructive' });
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // ============================================================================
  // Funding Tracker
  // ============================================================================

  const checkFunding = useCallback(async (address: string, expectedAmount?: number): Promise<void> => {
    try {
      const url = `/api/escrow/funding/${address}${expectedAmount ? `?expectedAmount=${expectedAmount}` : ''}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to check funding');
      }

      const data = await response.json();
      console.log('[Blockchain] Funding check:', data);

      setSession(prev => prev ? {
        ...prev,
        fundingStatus: {
          funded: data.funded,
          txid: data.txid,
          confirmations: data.confirmations,
          amountSats: data.amountSats,
        },
      } : null);

      if (data.funded && data.confirmations > 0) {
        toast({
          title: 'Escrow Funded! 🎉',
          description: `Received ${(data.amountSats / 100000000).toFixed(8)} BTC (${data.confirmations} confirmations)`,
        });
      }

    } catch (err) {
      console.error('[Blockchain] Funding check failed:', err);
      // Don't set error state for funding checks - they're polled frequently
    }
  }, [toast]);

  const startFundingPolling = useCallback((address: string, intervalMs: number = 10000): void => {
    console.log('[Blockchain] Starting funding poll for:', address);

    // Clear existing interval
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }

    // Check immediately
    checkFunding(address);

    // Then poll every intervalMs
    const interval = setInterval(() => {
      checkFunding(address);
    }, intervalMs);

    setPollingInterval(interval);
  }, [pollingInterval, checkFunding]);

  const stopFundingPolling = useCallback((): void => {
    if (pollingInterval) {
      console.log('[Blockchain] Stopping funding poll');
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
  }, [pollingInterval]);

  // ============================================================================
  // Transaction Signing
  // ============================================================================

  const createRepaymentTx = useCallback((loanDetails: {
    principalSats: number;
    interestSats: number;
    lenderAddress: string;
  }): TransactionTemplate | null => {
    if (!session?.state) {
      setError('No active escrow session');
      return null;
    }

    try {
      const template = Firefish.createRepaymentTransaction(session.state, loanDetails);
      console.log('[WASM] Created repayment transaction:', template);
      return template;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create transaction';
      setError(message);
      toast({ title: 'Error', description: message, variant: 'destructive' });
      return null;
    }
  }, [session, toast]);

  const signTransaction = useCallback((
    template: TransactionTemplate,
    privateKey: string,
    publicKey: string
  ): SignedTransaction => {
    try {
      const signed = Firefish.signTransaction(template, privateKey, publicKey);
      console.log('[WASM] Transaction signed:', signed);
      return signed;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sign transaction';
      setError(message);
      toast({ title: 'Error', description: message, variant: 'destructive' });
      throw err;
    }
  }, [toast]);

  const submitSignature = useCallback(async (
    sessionId: string,
    signature: SignedTransaction,
    role: 'borrower' | 'lender' | 'platform'
  ): Promise<void> => {
    try {
      setIsLoading(true);

      const payload = {
        escrowSessionId: sessionId,
        senderRole: role,
        signatureType: 'repayment', // Could be 'default' or 'liquidation' too
        signatureData: btoa(JSON.stringify(signature)),
      };

      const response = await apiRequest('/api/escrow/signatures', 'POST', payload);
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to submit signature');
      }

      toast({
        title: 'Signature Submitted',
        description: `Your ${role} signature has been recorded`,
      });

      console.log('[API] Signature submitted:', payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit signature';
      setError(message);
      toast({ title: 'Error', description: message, variant: 'destructive' });
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // ============================================================================
  // Utilities
  // ============================================================================

  const resetSession = useCallback((): void => {
    setSession(null);
    setError(null);
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
    console.log('[WASM] Session reset');
  }, [pollingInterval]);

  return {
    // State
    session,
    isLoading,
    error,

    // Key Management
    generateBorrowerKeys,
    generateLenderKeys,
    generatePlatformKeys,
    exportKeys,
    importKeys,

    // Escrow Creation
    createEscrow,

    // Backend Sync
    submitToBackend,
    updateWASMState,
    fetchSession,

    // Funding Tracker
    checkFunding,
    startFundingPolling,
    stopFundingPolling,

    // Transaction Signing
    createRepaymentTx,
    signTransaction,
    submitSignature,

    // Utilities
    resetSession,
  };
}
