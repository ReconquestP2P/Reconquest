import type { IStorage } from '../storage';
import type { Loan } from '@shared/schema';

interface UTXOResponse {
  txid: string;
  vout: number;
  value: number;
  confirmations: number;
  scriptPubKey?: string;
}

const REQUIRED_CONFIRMATIONS = 1;
const POLLING_INTERVAL_MS = 30000; // 30 seconds

export class BlockchainMonitoringService {
  private pollingInterval: NodeJS.Timeout | null = null;
  private isPolling = false;

  constructor(private storage: IStorage) {}

  async startMonitoring(): Promise<void> {
    if (this.pollingInterval) {
      console.log('[BlockchainMonitor] Already running');
      return;
    }

    console.log('[BlockchainMonitor] Starting blockchain monitoring service');
    
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

    await this.pollPendingDeposits();
  }

  stopMonitoring(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      console.log('[BlockchainMonitor] Stopped monitoring');
    }
  }

  async registerLoanForMonitoring(loanId: number, txid?: string): Promise<void> {
    console.log(`[BlockchainMonitor] Registering loan ${loanId} for monitoring${txid ? ` with txid ${txid}` : ''}`);
    
    await this.storage.updateLoan(loanId, {
      escrowMonitoringActive: true,
      btcDepositNotifiedAt: new Date(),
      depositTxid: txid || null,
      escrowState: 'deposit_pending',
    });
  }

  private async pollPendingDeposits(): Promise<void> {
    const loansToMonitor = await this.storage.getLoansWithActiveMonitoring();
    
    if (loansToMonitor.length === 0) {
      return;
    }

    console.log(`[BlockchainMonitor] Checking ${loansToMonitor.length} loans for deposits`);

    for (const loan of loansToMonitor) {
      try {
        await this.checkLoanDeposit(loan);
      } catch (error) {
        console.error(`[BlockchainMonitor] Error checking loan ${loan.id}:`, error);
      }
    }
  }

  private async checkLoanDeposit(loan: Loan): Promise<void> {
    if (!loan.escrowAddress) {
      console.log(`[BlockchainMonitor] Loan ${loan.id} has no escrow address`);
      return;
    }

    const requiredSats = Math.ceil(parseFloat(String(loan.collateralBtc)) * 100000000);
    
    console.log(`[BlockchainMonitor] Checking escrow ${loan.escrowAddress} for loan ${loan.id}, need ${requiredSats} sats`);

    const utxo = await this.fetchEscrowUTXO(loan.escrowAddress, requiredSats);
    
    await this.storage.updateLoan(loan.id, {
      lastMonitorCheckAt: new Date(),
    });

    if (!utxo) {
      console.log(`[BlockchainMonitor] No qualifying UTXO found for loan ${loan.id}`);
      return;
    }

    console.log(`[BlockchainMonitor] Found UTXO for loan ${loan.id}: ${utxo.txid}:${utxo.vout} with ${utxo.confirmations} confirmations`);

    await this.storage.updateLoan(loan.id, {
      depositTxid: utxo.txid,
      depositConfirmations: utxo.confirmations,
      fundingTxid: utxo.txid,
      fundingVout: utxo.vout,
      fundedAmountSats: utxo.value,
    });

    if (utxo.confirmations >= REQUIRED_CONFIRMATIONS) {
      console.log(`[BlockchainMonitor] Loan ${loan.id} deposit CONFIRMED with ${utxo.confirmations} confirmations!`);
      await this.handleDepositConfirmed(loan, utxo);
    }
  }

  private async fetchEscrowUTXO(address: string, minSats: number): Promise<UTXOResponse | null> {
    try {
      const response = await fetch(`https://mempool.space/testnet4/api/address/${address}/utxo`);
      
      if (!response.ok) {
        console.error(`[BlockchainMonitor] Mempool API error: ${response.status}`);
        return null;
      }

      const utxos: Array<{
        txid: string;
        vout: number;
        value: number;
        status: { confirmed: boolean; block_height?: number };
      }> = await response.json();

      if (utxos.length === 0) {
        return null;
      }

      const blockHeightRes = await fetch('https://mempool.space/testnet4/api/blocks/tip/height');
      const currentHeight = blockHeightRes.ok ? await blockHeightRes.json() : 0;

      for (const utxo of utxos) {
        if (utxo.value >= minSats) {
          const confirmations = utxo.status.confirmed && utxo.status.block_height 
            ? currentHeight - utxo.status.block_height + 1 
            : 0;

          return {
            txid: utxo.txid,
            vout: utxo.vout,
            value: utxo.value,
            confirmations,
          };
        }
      }

      return null;
    } catch (error) {
      console.error('[BlockchainMonitor] Error fetching UTXO:', error);
      return null;
    }
  }

  private async handleDepositConfirmed(loan: Loan, utxo: UTXOResponse): Promise<void> {
    console.log(`[BlockchainMonitor] Processing confirmed deposit for loan ${loan.id}`);

    await this.storage.updateLoan(loan.id, {
      escrowMonitoringActive: false,
      depositConfirmedAt: new Date(),
      escrowState: 'deposit_confirmed',
      status: 'awaiting_signatures',
    });

    console.log(`[BlockchainMonitor] Loan ${loan.id} updated to awaiting_signatures - ready for signing ceremony`);
  }

  async manualCheck(loanId: number): Promise<{ found: boolean; confirmations: number; message: string }> {
    const loan = await this.storage.getLoan(loanId);
    if (!loan || !loan.escrowAddress) {
      return { found: false, confirmations: 0, message: 'Loan not found or no escrow address' };
    }

    const requiredSats = Math.ceil(parseFloat(String(loan.collateralBtc)) * 100000000);
    const utxo = await this.fetchEscrowUTXO(loan.escrowAddress, requiredSats);

    if (!utxo) {
      return { found: false, confirmations: 0, message: 'No deposit found yet' };
    }

    if (utxo.confirmations >= REQUIRED_CONFIRMATIONS) {
      await this.handleDepositConfirmed(loan, utxo);
      return { 
        found: true, 
        confirmations: utxo.confirmations, 
        message: `Deposit confirmed with ${utxo.confirmations} confirmations! Ready for signing ceremony.` 
      };
    }

    return { 
      found: true, 
      confirmations: utxo.confirmations, 
      message: `Deposit found but waiting for confirmations (${utxo.confirmations}/${REQUIRED_CONFIRMATIONS})` 
    };
  }
}
