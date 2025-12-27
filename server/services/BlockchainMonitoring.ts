// Blockchain Monitoring Service for Bitcoin Testnet
// Uses mempool.space API to check transaction confirmations and UTXO status
// Includes automated background polling for pending deposits

import { storage } from '../storage';
import type { Loan } from '@shared/schema';
import { sendTopUpDetectedEmail, sendTopUpConfirmedEmail, sendPartialDepositWarningEmail } from '../email';

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
   * Poll all loans with active monitoring (initial deposits + top-ups)
   */
  private async pollPendingDeposits(): Promise<void> {
    // Check for initial deposits
    const loansToMonitor = await storage.getLoansWithActiveMonitoring();
    
    if (loansToMonitor.length > 0) {
      console.log(`[BlockchainMonitor] Checking ${loansToMonitor.length} loans for deposits`);

      for (const loan of loansToMonitor) {
        try {
          await this.checkAndUpdateLoanDeposit(loan);
        } catch (error) {
          console.error(`[BlockchainMonitor] Error checking loan ${loan.id}:`, error);
        }
      }
    }
    
    // Check for top-up deposits
    const loansWithTopUps = await storage.getLoansWithActiveTopUpMonitoring();
    
    if (loansWithTopUps.length > 0) {
      console.log(`[BlockchainMonitor] Checking ${loansWithTopUps.length} loans for top-ups`);

      for (const loan of loansWithTopUps) {
        try {
          await this.checkAndUpdateTopUp(loan);
        } catch (error) {
          console.error(`[BlockchainMonitor] Error checking top-up for loan ${loan.id}:`, error);
        }
      }
    }
  }

  /**
   * Check if a loan's top-up deposit has been received and confirmed
   */
  private async checkAndUpdateTopUp(loan: Loan): Promise<void> {
    if (!loan.escrowAddress) {
      console.log(`[BlockchainMonitor] Loan ${loan.id} has no escrow address for top-up`);
      return;
    }

    const previousCollateralSats = Math.ceil(parseFloat(String(loan.previousCollateralBtc || loan.collateralBtc)) * 100000000);
    const pendingTopUpSats = Math.ceil(parseFloat(String(loan.pendingTopUpBtc || 0)) * 100000000);
    const expectedTotalSats = previousCollateralSats + pendingTopUpSats;
    
    console.log(`[BlockchainMonitor] Checking top-up for loan ${loan.id}: previous ${previousCollateralSats} sats + pending ${pendingTopUpSats} sats = expected ${expectedTotalSats} sats`);

    // Clear cache to get fresh data
    this.clearCache(loan.escrowAddress);
    
    // Get both confirmed and total (including mempool) balances
    const { totalSats: confirmedSats, minConfirmations, txids: confirmedTxids } = await this.getAddressConfirmedBalanceWithTxids(loan.escrowAddress);
    const { totalSats: mempoolSats, txids: mempoolTxids } = await this.getAddressMempoolBalance(loan.escrowAddress);
    
    const totalWithMempool = confirmedSats + mempoolSats;
    
    console.log(`[BlockchainMonitor] Loan ${loan.id} balance: confirmed ${confirmedSats} sats, mempool ${mempoolSats} sats, total ${totalWithMempool} sats`);

    // Allow for small rounding differences (up to 10 sats tolerance)
    const TOLERANCE_SATS = 10;
    const meetsExpected = (amount: number) => amount >= expectedTotalSats - TOLERANCE_SATS;

    // Check if we've detected a new top-up in mempool (but not sent email yet)
    if (!loan.topUpDetectedInMempoolAt && mempoolSats > 0 && meetsExpected(totalWithMempool)) {
      // Found new unconfirmed deposit - send detection email
      const newTxid = mempoolTxids[0]; // Get the first new txid
      console.log(`[BlockchainMonitor] 🔄 Top-up DETECTED in mempool for loan ${loan.id}! Txid: ${newTxid}`);
      
      // Get borrower and lender info for emails
      const borrower = await storage.getUser(loan.borrowerId);
      const lender = loan.lenderId ? await storage.getUser(loan.lenderId) : null;
      
      if (borrower && lender && newTxid) {
        // Send detection emails
        await sendTopUpDetectedEmail({
          borrowerEmail: borrower.email,
          borrowerName: borrower.username,
          lenderEmail: lender.email,
          lenderName: lender.username,
          loanId: loan.id,
          txid: newTxid,
          amountBtc: String(loan.pendingTopUpBtc),
          escrowAddress: loan.escrowAddress,
        });
      }
      
      // Mark as detected so we don't spam emails
      await storage.updateLoan(loan.id, {
        topUpDetectedInMempoolAt: new Date(),
        topUpTxid: newTxid,
      });
    }

    // Check if new deposits have arrived (total >= expected with tolerance) AND are confirmed
    if (meetsExpected(confirmedSats) && minConfirmations >= REQUIRED_CONFIRMATIONS) {
      const newCollateralBtc = confirmedSats / 100000000;
      const pendingTopUpBtc = parseFloat(String(loan.pendingTopUpBtc || 0));
      
      console.log(`[BlockchainMonitor] ✅ Top-up CONFIRMED for loan ${loan.id}! New collateral: ${newCollateralBtc} BTC`);
      
      // Get borrower and lender info for confirmation emails
      const borrower = await storage.getUser(loan.borrowerId);
      const lender = loan.lenderId ? await storage.getUser(loan.lenderId) : null;
      
      // Calculate new LTV using current EUR price
      const loanAmount = parseFloat(String(loan.amount));
      const interestRate = parseFloat(String(loan.interestRate));
      const interest = loanAmount * (interestRate / 100);
      const totalLoanValue = loanAmount + interest;
      
      // Fetch current BTC price in EUR
      let newLtv = "N/A";
      try {
        const priceResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur');
        const priceData = await priceResponse.json();
        const btcPriceEur = priceData.bitcoin?.eur || 0;
        if (btcPriceEur > 0) {
          const collateralValueEur = newCollateralBtc * btcPriceEur;
          const ltvPercent = (totalLoanValue / collateralValueEur) * 100;
          newLtv = ltvPercent.toFixed(1);
        }
      } catch (error) {
        console.error('Error fetching BTC price for LTV calculation:', error);
      }
      
      // Update the loan with new collateral amount
      await storage.updateLoan(loan.id, {
        collateralBtc: String(newCollateralBtc),
        topUpConfirmedAt: new Date(),
        topUpMonitoringActive: false,
        pendingTopUpBtc: null,
        previousCollateralBtc: null,
        topUpDetectedInMempoolAt: null,
        fundedAmountSats: confirmedSats,
      });
      
      // Send confirmation emails
      if (borrower && lender) {
        await sendTopUpConfirmedEmail({
          borrowerEmail: borrower.email,
          borrowerName: borrower.username,
          lenderEmail: lender.email,
          lenderName: lender.username,
          loanId: loan.id,
          txid: loan.topUpTxid || undefined,
          amountBtc: String(pendingTopUpBtc),
          newTotalCollateralBtc: String(newCollateralBtc),
          newLtv: newLtv,
        });
      }
      
      console.log(`[BlockchainMonitor] Loan ${loan.id} collateral updated from ${loan.collateralBtc} BTC to ${newCollateralBtc} BTC`);
    } else if (meetsExpected(confirmedSats)) {
      console.log(`[BlockchainMonitor] Loan ${loan.id} top-up found but awaiting confirmations (${minConfirmations}/${REQUIRED_CONFIRMATIONS})`);
    } else if (mempoolSats > 0 || meetsExpected(totalWithMempool)) {
      console.log(`[BlockchainMonitor] Loan ${loan.id} top-up in mempool, awaiting confirmation`);
    } else {
      console.log(`[BlockchainMonitor] Loan ${loan.id} top-up not yet received. Current: ${confirmedSats} sats, expected: ${expectedTotalSats} sats (tolerance: ${TOLERANCE_SATS})`);
    }
  }

  /**
   * Get the total CONFIRMED balance of an address with txids
   */
  async getAddressConfirmedBalanceWithTxids(address: string): Promise<{ totalSats: number; minConfirmations: number; txids: string[] }> {
    try {
      const response = await fetch(`${this.baseUrl}/address/${address}/utxo`);
      
      if (!response.ok) {
        if (response.status === 404) {
          return { totalSats: 0, minConfirmations: 0, txids: [] };
        }
        throw new Error(`Blockstream API error: ${response.status}`);
      }

      const utxos: UTXO[] = await response.json();

      if (utxos.length === 0) {
        return { totalSats: 0, minConfirmations: 0, txids: [] };
      }

      // Get current tip height for confirmation calculation
      const tipResponse = await fetch(`${this.baseUrl}/blocks/tip/height`);
      const tipHeight = parseInt(await tipResponse.text());

      // Only count confirmed UTXOs
      let totalSats = 0;
      let minConfirmations = Infinity;
      const txids: string[] = [];

      for (const utxo of utxos) {
        if (utxo.status.confirmed && utxo.status.block_height) {
          totalSats += utxo.value;
          const confirmations = tipHeight - utxo.status.block_height + 1;
          minConfirmations = Math.min(minConfirmations, confirmations);
          if (!txids.includes(utxo.txid)) {
            txids.push(utxo.txid);
          }
        }
      }

      if (minConfirmations === Infinity) {
        minConfirmations = 0;
      }
      
      return { totalSats, minConfirmations, txids };
    } catch (error) {
      console.error('Error getting confirmed address balance:', error);
      return { totalSats: 0, minConfirmations: 0, txids: [] };
    }
  }

  /**
   * Get the unconfirmed (mempool) balance of an address with txids
   */
  async getAddressMempoolBalance(address: string): Promise<{ totalSats: number; txids: string[] }> {
    try {
      const response = await fetch(`${this.baseUrl}/address/${address}/utxo`);
      
      if (!response.ok) {
        if (response.status === 404) {
          return { totalSats: 0, txids: [] };
        }
        throw new Error(`Blockstream API error: ${response.status}`);
      }

      const utxos: UTXO[] = await response.json();

      // Only count unconfirmed UTXOs (in mempool)
      let totalSats = 0;
      const txids: string[] = [];

      for (const utxo of utxos) {
        if (!utxo.status.confirmed) {
          totalSats += utxo.value;
          if (!txids.includes(utxo.txid)) {
            txids.push(utxo.txid);
          }
        }
      }
      
      return { totalSats, txids };
    } catch (error) {
      console.error('Error getting mempool balance:', error);
      return { totalSats: 0, txids: [] };
    }
  }

  /**
   * Get the total CONFIRMED balance of an address (only confirmed UTXOs) with confirmation count
   */
  async getAddressConfirmedBalance(address: string): Promise<{ totalSats: number; minConfirmations: number }> {
    try {
      const response = await fetch(`${this.baseUrl}/address/${address}/utxo`);
      
      if (!response.ok) {
        if (response.status === 404) {
          return { totalSats: 0, minConfirmations: 0 };
        }
        throw new Error(`Blockstream API error: ${response.status}`);
      }

      const utxos: UTXO[] = await response.json();

      if (utxos.length === 0) {
        return { totalSats: 0, minConfirmations: 0 };
      }

      // Get current tip height for confirmation calculation
      const tipResponse = await fetch(`${this.baseUrl}/blocks/tip/height`);
      const tipHeight = parseInt(await tipResponse.text());

      // Only count confirmed UTXOs and calculate their confirmations
      let totalSats = 0;
      let minConfirmations = Infinity;

      for (const utxo of utxos) {
        if (utxo.status.confirmed && utxo.status.block_height) {
          totalSats += utxo.value;
          const confirmations = tipHeight - utxo.status.block_height + 1;
          minConfirmations = Math.min(minConfirmations, confirmations);
        }
      }

      // If no confirmed UTXOs, return 0 confirmations
      if (minConfirmations === Infinity) {
        minConfirmations = 0;
      }
      
      return { totalSats, minConfirmations };
    } catch (error) {
      console.error('Error getting confirmed address balance:', error);
      return { totalSats: 0, minConfirmations: 0 };
    }
  }

  /**
   * Get the total balance of an address (sum of all UTXOs including unconfirmed)
   */
  async getAddressTotalBalance(address: string): Promise<number> {
    try {
      const response = await fetch(`${this.baseUrl}/address/${address}/utxo`);
      
      if (!response.ok) {
        if (response.status === 404) {
          return 0;
        }
        throw new Error(`Blockstream API error: ${response.status}`);
      }

      const utxos: UTXO[] = await response.json();

      if (utxos.length === 0) {
        return 0;
      }

      // Sum all UTXO values (including unconfirmed)
      const totalSats = utxos.reduce((sum, utxo) => sum + utxo.value, 0);
      
      return totalSats;
    } catch (error) {
      console.error('Error getting address balance:', error);
      return 0;
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

    // CRITICAL: Verify deposit meets minimum collateral requirement
    const depositedSats = result.amountSats || 0;
    if (depositedSats < requiredSats) {
      console.log(`[BlockchainMonitor] Loan ${loan.id} under-collateralized: deposited ${depositedSats} sats, required ${requiredSats} sats`);
      // Update with found amount but don't confirm
      await storage.updateLoan(loan.id, {
        depositTxid: result.txid,
        depositConfirmations: result.confirmations || 0,
        fundingTxid: result.txid,
        fundingVout: result.vout,
        fundedAmountSats: depositedSats,
      });
      
      // Send partial deposit warning email (only once per detected amount)
      // Don't spam - only send if we haven't already warned for this exact amount
      const previousWarningAmount = loan.partialDepositAmountSats;
      if (!loan.partialDepositWarningAt || previousWarningAmount !== depositedSats) {
        try {
          const borrower = await storage.getUser(loan.borrowerId);
          if (borrower) {
            const baseUrl = process.env.APP_URL || process.env.REPLIT_DEPLOYMENT_URL || `https://${process.env.REPLIT_DEV_DOMAIN}`;
            const depositedBtc = (depositedSats / 100000000).toFixed(8);
            const requiredBtc = (requiredSats / 100000000).toFixed(8);
            const shortfallBtc = ((requiredSats - depositedSats) / 100000000).toFixed(8);
            
            const emailSent = await sendPartialDepositWarningEmail({
              to: borrower.email,
              borrowerName: borrower.username,
              loanId: loan.id,
              depositedBtc,
              requiredBtc,
              shortfallBtc,
              escrowAddress: loan.escrowAddress!,
              txid: result.txid,
              dashboardUrl: baseUrl,
            });
            
            if (emailSent) {
              console.log(`[BlockchainMonitor] 📧 Sent partial deposit warning email to ${borrower.email} for loan ${loan.id}`);
              // Track that we've warned about this specific amount
              await storage.updateLoan(loan.id, {
                partialDepositWarningAt: new Date(),
                partialDepositAmountSats: depositedSats,
              });
            }
          }
        } catch (emailError) {
          console.error(`[BlockchainMonitor] Error sending partial deposit warning:`, emailError);
        }
      }
      return;
    }

    console.log(`[BlockchainMonitor] Found UTXO for loan ${loan.id}: ${result.txid}:${result.vout} with ${result.confirmations} confirmations, ${depositedSats} sats (required: ${requiredSats})`);

    // Update deposit info
    await storage.updateLoan(loan.id, {
      depositTxid: result.txid,
      depositConfirmations: result.confirmations || 0,
      fundingTxid: result.txid,
      fundingVout: result.vout,
      fundedAmountSats: depositedSats,
    });

    // Check if we have enough confirmations
    if ((result.confirmations || 0) >= REQUIRED_CONFIRMATIONS) {
      console.log(`[BlockchainMonitor] Loan ${loan.id} deposit CONFIRMED with ${result.confirmations} confirmations!`);
      await this.handleDepositConfirmed(loan, result);
    }
  }

  /**
   * Handle a confirmed deposit - update loan status and notify lender
   */
  private async handleDepositConfirmed(loan: Loan, result: FundingCheckResult): Promise<void> {
    console.log(`[BlockchainMonitor] Processing confirmed deposit for loan ${loan.id}`);

    // Calculate start date as +5 days from deposit confirmation
    const now = new Date();
    const loanStartDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000); // +5 days
    const loanDueDate = new Date(loanStartDate.getTime() + loan.termMonths * 30 * 24 * 60 * 60 * 1000);

    // Update loan to ready for signatures with calculated dates
    await storage.updateLoan(loan.id, {
      escrowMonitoringActive: false,
      depositConfirmedAt: now,
      escrowState: 'deposit_confirmed',
      status: 'awaiting_signatures',
      loanStartedAt: loanStartDate,
      dueDate: loanDueDate,
    });

    console.log(`[BlockchainMonitor] Loan ${loan.id} updated to awaiting_signatures`);
    console.log(`[BlockchainMonitor] 📅 Loan dates set: Start = ${loanStartDate.toISOString()}, Due = ${loanDueDate.toISOString()}`);

    // Send email notification to lender that borrower's deposit is confirmed
    if (loan.lenderId) {
      try {
        const lender = await storage.getUser(loan.lenderId);
        
        if (lender) {
          const { sendLenderFundingNotification } = await import('../email.js');
          const baseUrl = process.env.APP_URL || process.env.REPLIT_DEPLOYMENT_URL || `https://${process.env.REPLIT_DEV_DOMAIN}`;
          
          const startDate = loanStartDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
          const maturityDate = loanDueDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
          
          const emailSent = await sendLenderFundingNotification({
            to: lender.email,
            lenderName: lender.username,
            loanId: loan.id,
            loanAmount: loan.amount,
            currency: loan.currency,
            interestRate: loan.interestRate,
            startDate: startDate,
            maturityDate: maturityDate,
            termMonths: loan.termMonths,
            dashboardUrl: `${baseUrl}/lender`,
            escrowAddress: loan.escrowAddress || undefined,
            collateralBtc: loan.collateralBtc,
          });
          
          if (emailSent) {
            console.log(`[BlockchainMonitor] 📧 Sent funding notification to lender: ${lender.email}`);
          } else {
            console.error(`[BlockchainMonitor] ❌ Failed to send funding notification to lender: ${lender.email}`);
          }
        }
      } catch (emailError) {
        console.error('[BlockchainMonitor] Failed to send lender notification email:', emailError);
      }
    }

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

    const depositedSats = result.amountSats || 0;

    // Update deposit info regardless of amount
    await storage.updateLoan(loan.id, {
      depositTxid: result.txid,
      depositConfirmations: result.confirmations || 0,
      fundingTxid: result.txid,
      fundingVout: result.vout,
      fundedAmountSats: depositedSats,
      lastMonitorCheckAt: new Date(),
    });

    // CRITICAL: Check if deposit meets minimum collateral requirement
    if (depositedSats < requiredSats) {
      const shortfall = (requiredSats - depositedSats) / 100000000;
      return { 
        found: true, 
        confirmations: result.confirmations || 0, 
        message: `Deposit found but insufficient. Received ${depositedSats / 100000000} BTC, need ${requiredSats / 100000000} BTC. Please add ${shortfall.toFixed(8)} BTC more.`,
        txid: result.txid,
        vout: result.vout,
        amountSats: depositedSats
      };
    }

    if ((result.confirmations || 0) >= REQUIRED_CONFIRMATIONS) {
      await this.handleDepositConfirmed(loan, result);
      return { 
        found: true, 
        confirmations: result.confirmations || 0, 
        message: `Deposit confirmed with ${result.confirmations} confirmations! Ready for signing ceremony.`,
        txid: result.txid,
        vout: result.vout,
        amountSats: depositedSats
      };
    }

    return { 
      found: true, 
      confirmations: result.confirmations || 0, 
      message: `Deposit found in mempool, waiting for confirmation (${result.confirmations || 0}/${REQUIRED_CONFIRMATIONS})`,
      txid: result.txid,
      vout: result.vout,
      amountSats: depositedSats
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
