// Blockchain Monitoring Service for Bitcoin Testnet
// Uses mempool.space API to check transaction confirmations and UTXO status
// Includes automated background polling for pending deposits

import { storage } from '../storage';
import type { Loan } from '@shared/schema';

interface UTXO {
  txid: string;
  vout: number;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_time?: number;
  };
  value: number; // satoshis
}

interface TransactionStatus {
  confirmed: boolean;
  block_height?: number;
  block_hash?: string;
  block_time?: number;
}

interface FundingCheckResult {
  funded: boolean;
  txid?: string;
  vout?: number;
  amountSats?: number;
  confirmations?: number;
  blockHeight?: number;
}

interface DepositCheckResult {
  found: boolean;
  confirmations: number;
  message: string;
  txid?: string;
  vout?: number;
  amountSats?: number;
}

const REQUIRED_CONFIRMATIONS = 1;
const POLLING_INTERVAL_MS = 30000; // 30 seconds

export class BlockchainMonitoringService {
  // Use mempool.space testnet4 API
  private baseUrl = 'https://mempool.space/testnet4/api';
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheTTL = 5000; // 5 seconds cache
  private pollingInterval: NodeJS.Timeout | null = null;
  private isPolling = false;
  private onDepositConfirmed: ((loan: Loan, result: FundingCheckResult) => Promise<void>) | null = null;

  /**
   * Start background monitoring for all loans with active monitoring flag
   */
  startBackgroundMonitoring(onConfirmed?: (loan: Loan, result: FundingCheckResult) => Promise<void>): void {
    if (this.pollingInterval) {
      console.log('[BlockchainMonitor] Already running');
      return;
    }

    this.onDepositConfirmed = onConfirmed || null;
    console.log('[BlockchainMonitor] Starting background monitoring service');
    
    this.pollingInterval = setInterval(async () => {
      if (this.isPolling) {
        console.log('[BlockchainMonitor] Previous poll still running, skipping');
        return;
      }
      
      this.isPolling = true;
      try {
        await this.pollPendingDeposits();
      } catch (error) {
        console.error('[BlockchainMonitor] Polling error:', error);
      } finally {
        this.isPolling = false;
      }
    }, POLLING_INTERVAL_MS);

    // Run initial poll immediately
    this.pollPendingDeposits().catch(console.error);
  }

  /**
   * Stop background monitoring
   */
  stopBackgroundMonitoring(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      console.log('[BlockchainMonitor] Stopped background monitoring');
    }
  }

  /**
   * Register a loan for automated deposit monitoring
   */
  async registerLoanForMonitoring(loanId: number, txid?: string): Promise<void> {
    console.log(`[BlockchainMonitor] Registering loan ${loanId} for monitoring${txid ? ` with txid ${txid}` : ''}`);
    
    await storage.updateLoan(loanId, {
      escrowMonitoringActive: true,
      btcDepositNotifiedAt: new Date(),
      depositTxid: txid || null,
      escrowState: 'deposit_pending',
    });
  }

  /**
   * Poll all loans with active monitoring
   */
  private async pollPendingDeposits(): Promise<void> {
    const loansToMonitor = await storage.getLoansWithActiveMonitoring();
    
    if (loansToMonitor.length === 0) {
      return;
    }

    console.log(`[BlockchainMonitor] Checking ${loansToMonitor.length} loans for deposits`);

    for (const loan of loansToMonitor) {
      try {
        await this.checkAndUpdateLoanDeposit(loan);
      } catch (error) {
        console.error(`[BlockchainMonitor] Error checking loan ${loan.id}:`, error);
      }
    }
  }

  /**
   * Check a single loan's deposit status and update if confirmed
   */
  private async checkAndUpdateLoanDeposit(loan: Loan): Promise<void> {
    if (!loan.escrowAddress) {
      console.log(`[BlockchainMonitor] Loan ${loan.id} has no escrow address`);
      return;
    }

    const requiredSats = Math.ceil(parseFloat(String(loan.collateralBtc)) * 100000000);
    
    console.log(`[BlockchainMonitor] Checking escrow ${loan.escrowAddress} for loan ${loan.id}, need ${requiredSats} sats`);

    // Clear cache to get fresh data
    this.clearCache(loan.escrowAddress);
    
    const result = await this.checkAddressFunding(loan.escrowAddress, requiredSats);
    
    // Update last check timestamp
    await storage.updateLoan(loan.id, {
      lastMonitorCheckAt: new Date(),
    });

    if (!result.funded) {
      console.log(`[BlockchainMonitor] No qualifying UTXO found for loan ${loan.id}`);
      return;
    }

    console.log(`[BlockchainMonitor] Found UTXO for loan ${loan.id}: ${result.txid}:${result.vout} with ${result.confirmations} confirmations`);

    // Update deposit info
    await storage.updateLoan(loan.id, {
      depositTxid: result.txid,
      depositConfirmations: result.confirmations || 0,
      fundingTxid: result.txid,
      fundingVout: result.vout,
      fundedAmountSats: result.amountSats,
    });

    // Check if we have enough confirmations
    if ((result.confirmations || 0) >= REQUIRED_CONFIRMATIONS) {
      console.log(`[BlockchainMonitor] Loan ${loan.id} deposit CONFIRMED with ${result.confirmations} confirmations!`);
      await this.handleDepositConfirmed(loan, result);
    }
  }

  /**
   * Handle a confirmed deposit - update loan status and trigger signing ceremony
   */
  private async handleDepositConfirmed(loan: Loan, result: FundingCheckResult): Promise<void> {
    console.log(`[BlockchainMonitor] Processing confirmed deposit for loan ${loan.id}`);

    // Update loan to ready for signatures
    await storage.updateLoan(loan.id, {
      escrowMonitoringActive: false,
      depositConfirmedAt: new Date(),
      escrowState: 'deposit_confirmed',
      status: 'awaiting_signatures',
    });

    console.log(`[BlockchainMonitor] Loan ${loan.id} updated to awaiting_signatures - ready for signing ceremony`);

    // Call the callback if registered
    if (this.onDepositConfirmed) {
      try {
        await this.onDepositConfirmed(loan, result);
      } catch (error) {
        console.error(`[BlockchainMonitor] Error in onDepositConfirmed callback:`, error);
      }
    }
  }

  /**
   * Manual check for a specific loan - useful for API endpoints
   */
  async manualDepositCheck(loanId: number): Promise<DepositCheckResult> {
    const loan = await storage.getLoan(loanId);
    if (!loan || !loan.escrowAddress) {
      return { found: false, confirmations: 0, message: 'Loan not found or no escrow address' };
    }

    const requiredSats = Math.ceil(parseFloat(String(loan.collateralBtc)) * 100000000);
    
    // Clear cache to get fresh data
    this.clearCache(loan.escrowAddress);
    
    const result = await this.checkAddressFunding(loan.escrowAddress, requiredSats);

    if (!result.funded) {
      return { found: false, confirmations: 0, message: 'No deposit found yet. Waiting for Bitcoin to arrive in escrow.' };
    }

    // Update deposit info
    await storage.updateLoan(loan.id, {
      depositTxid: result.txid,
      depositConfirmations: result.confirmations || 0,
      fundingTxid: result.txid,
      fundingVout: result.vout,
      fundedAmountSats: result.amountSats,
      lastMonitorCheckAt: new Date(),
    });

    if ((result.confirmations || 0) >= REQUIRED_CONFIRMATIONS) {
      await this.handleDepositConfirmed(loan, result);
      return { 
        found: true, 
        confirmations: result.confirmations || 0, 
        message: `Deposit confirmed with ${result.confirmations} confirmations! Ready for signing ceremony.`,
        txid: result.txid,
        vout: result.vout,
        amountSats: result.amountSats
      };
    }

    return { 
      found: true, 
      confirmations: result.confirmations || 0, 
      message: `Deposit found in mempool, waiting for confirmation (${result.confirmations || 0}/${REQUIRED_CONFIRMATIONS})`,
      txid: result.txid,
      vout: result.vout,
      amountSats: result.amountSats
    };
  }

  /**
   * Check if an address has been funded
   */
  async checkAddressFunding(
    address: string,
    expectedAmount?: number
  ): Promise<FundingCheckResult> {
    const cacheKey = `address:${address}`;
    const cached = this.getFromCache(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      // Get all UTXOs for the address
      const response = await fetch(`${this.baseUrl}/address/${address}/utxo`);
      
      if (!response.ok) {
        if (response.status === 404) {
          // Address not found or has no UTXOs
          const result = { funded: false };
          this.setCache(cacheKey, result);
          return result;
        }
        throw new Error(`Blockstream API error: ${response.status}`);
      }

      const utxos: UTXO[] = await response.json();

      if (utxos.length === 0) {
        const result = { funded: false };
        this.setCache(cacheKey, result);
        return result;
      }

      // Find the largest UTXO (most likely to be the funding transaction)
      const fundingUtxo = utxos.reduce((max, utxo) => 
        utxo.value > max.value ? utxo : max
      );

      // Calculate confirmations
      let confirmations = 0;
      if (fundingUtxo.status.confirmed && fundingUtxo.status.block_height) {
        const tipResponse = await fetch(`${this.baseUrl}/blocks/tip/height`);
        const tipHeight = await tipResponse.text();
        confirmations = parseInt(tipHeight) - fundingUtxo.status.block_height + 1;
      }

      const result: FundingCheckResult = {
        funded: true,
        txid: fundingUtxo.txid,
        vout: fundingUtxo.vout,
        amountSats: fundingUtxo.value,
        confirmations,
        blockHeight: fundingUtxo.status.block_height,
      };

      this.setCache(cacheKey, result);
      return result;
    } catch (error) {
      console.error('Error checking address funding:', error);
      // Return cached data if available, even if expired
      if (cached) return cached;
      return { funded: false };
    }
  }

  /**
   * Get transaction status (confirmations, block info)
   */
  async getTransactionStatus(txid: string): Promise<TransactionStatus | null> {
    const cacheKey = `tx:${txid}`;
    const cached = this.getFromCache(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const response = await fetch(`${this.baseUrl}/tx/${txid}/status`);
      
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Blockstream API error: ${response.status}`);
      }

      const status = await response.json();
      this.setCache(cacheKey, status);
      return status;
    } catch (error) {
      console.error('Error getting transaction status:', error);
      return cached || null;
    }
  }

  /**
   * Get transaction details (including confirmations)
   */
  async getTransactionDetails(txid: string) {
    try {
      const response = await fetch(`${this.baseUrl}/tx/${txid}`);
      
      if (!response.ok) {
        throw new Error(`Blockstream API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting transaction details:', error);
      return null;
    }
  }

  /**
   * Simple caching to avoid hammering Blockstream API
   */
  private getFromCache(key: string): any | null {
    const cached = this.cache.get(key);
    
    if (!cached) return null;
    
    const age = Date.now() - cached.timestamp;
    if (age > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Clear cache for a specific address or transaction
   */
  clearCache(identifier: string): void {
    this.cache.delete(`address:${identifier}`);
    this.cache.delete(`tx:${identifier}`);
  }
}

export const blockchainMonitoring = new BlockchainMonitoringService();
