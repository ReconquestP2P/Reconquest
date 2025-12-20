/**
 * LTV Monitoring Service
 * 
 * Polls active loans periodically and checks if BTC price drop triggers liquidation.
 * When collateral value falls below the liquidation threshold (90% LTV), 
 * automatically broadcasts the liquidation transaction to send BTC to lender.
 */

import { storage } from '../storage';
import { getBtcPrice } from './price-service';
import { broadcastTransaction } from './bitcoin-broadcast';
import { sendEmail, createBrandedEmailHtml } from '../email';
import type { Loan } from '@shared/schema';

const POLLING_INTERVAL_MS = 60000; // Check every 1 minute
const LIQUIDATION_LTV_THRESHOLD = 0.90; // 90% LTV triggers liquidation (collateral worth only 111% of loan)
const WARNING_LTV_THRESHOLD = 0.75; // 75% LTV sends warning email

interface LtvCheckResult {
  loanId: number;
  currentLtv: number;
  collateralValueUsd: number;
  loanAmountUsd: number;
  btcPriceUsd: number;
  status: 'healthy' | 'warning' | 'liquidation';
}

// Track which loans have already received warning emails to avoid spam
const warningsSent = new Set<number>();

export class LtvMonitoringService {
  private pollingInterval: NodeJS.Timeout | null = null;
  private isPolling = false;
  private simulatedBtcPrice: number | null = null; // For testing liquidation

  /**
   * Start background LTV monitoring for all active loans
   */
  startMonitoring(): void {
    if (this.pollingInterval) {
      console.log('[LtvMonitor] Already running');
      return;
    }

    console.log('[LtvMonitor] Starting LTV monitoring service');
    
    this.pollingInterval = setInterval(async () => {
      if (this.isPolling) {
        console.log('[LtvMonitor] Previous check still running, skipping');
        return;
      }
      
      this.isPolling = true;
      try {
        await this.checkAllActiveLoans();
      } catch (error) {
        console.error('[LtvMonitor] Error during LTV check:', error);
      } finally {
        this.isPolling = false;
      }
    }, POLLING_INTERVAL_MS);

    // Run initial check after 10 seconds to let server stabilize
    setTimeout(() => this.checkAllActiveLoans().catch(console.error), 10000);
  }

  /**
   * Stop background monitoring
   */
  stopMonitoring(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      console.log('[LtvMonitor] Stopped LTV monitoring');
    }
  }

  /**
   * Set a simulated BTC price for testing liquidation
   */
  setSimulatedPrice(priceUsd: number | null): void {
    this.simulatedBtcPrice = priceUsd;
    console.log(`[LtvMonitor] Simulated BTC price set to: ${priceUsd ? `$${priceUsd}` : 'disabled (using real price)'}`);
  }

  /**
   * Get current simulated price (for admin endpoint)
   */
  getSimulatedPrice(): number | null {
    return this.simulatedBtcPrice;
  }

  /**
   * Check all active loans for LTV violations
   */
  async checkAllActiveLoans(): Promise<LtvCheckResult[]> {
    // Get current BTC price (use simulated if set, otherwise real)
    let btcPriceUsd: number;
    if (this.simulatedBtcPrice !== null) {
      btcPriceUsd = this.simulatedBtcPrice;
      console.log(`[LtvMonitor] Using SIMULATED price: $${btcPriceUsd}`);
    } else {
      const priceData = await getBtcPrice();
      btcPriceUsd = priceData.usd;
    }

    // Get all active loans (status = 'active' with collateral in escrow)
    const activeLoans = await storage.getActiveLoansForLtvCheck();
    
    if (activeLoans.length === 0) {
      return [];
    }

    console.log(`[LtvMonitor] Checking LTV for ${activeLoans.length} active loans at BTC price $${btcPriceUsd.toLocaleString()}`);

    const results: LtvCheckResult[] = [];

    for (const loan of activeLoans) {
      try {
        const result = await this.checkLoanLtv(loan, btcPriceUsd);
        results.push(result);
      } catch (error) {
        console.error(`[LtvMonitor] Error checking loan ${loan.id}:`, error);
      }
    }

    return results;
  }

  /**
   * Check a single loan's LTV and take action if needed
   */
  private async checkLoanLtv(loan: Loan, btcPriceUsd: number): Promise<LtvCheckResult> {
    const collateralBtc = parseFloat(String(loan.collateralBtc));
    const loanAmountUsd = parseFloat(String(loan.amount));
    const collateralValueUsd = collateralBtc * btcPriceUsd;
    
    // LTV = loan amount / collateral value
    // Higher LTV = more risky
    const currentLtv = loanAmountUsd / collateralValueUsd;

    const result: LtvCheckResult = {
      loanId: loan.id,
      currentLtv,
      collateralValueUsd,
      loanAmountUsd,
      btcPriceUsd,
      status: 'healthy'
    };

    // Check if liquidation needed (LTV >= 90%)
    if (currentLtv >= LIQUIDATION_LTV_THRESHOLD) {
      result.status = 'liquidation';
      console.log(`🚨 [LtvMonitor] Loan #${loan.id} LIQUIDATION TRIGGERED! LTV: ${(currentLtv * 100).toFixed(1)}%`);
      console.log(`   Collateral: ${collateralBtc} BTC = $${collateralValueUsd.toFixed(2)} vs Loan: $${loanAmountUsd}`);
      
      await this.executeLiquidation(loan, currentLtv, collateralValueUsd, btcPriceUsd);
    }
    // Check if warning needed (LTV >= 75%)
    else if (currentLtv >= WARNING_LTV_THRESHOLD) {
      result.status = 'warning';
      console.log(`⚠️ [LtvMonitor] Loan #${loan.id} LTV WARNING: ${(currentLtv * 100).toFixed(1)}%`);
      
      if (!warningsSent.has(loan.id)) {
        await this.sendLtvWarning(loan, currentLtv, collateralValueUsd, btcPriceUsd);
        warningsSent.add(loan.id);
      }
    } else {
      // Healthy - clear warning flag if it was set
      warningsSent.delete(loan.id);
    }

    return result;
  }

  /**
   * Execute liquidation - broadcast transaction sending BTC to lender
   */
  private async executeLiquidation(
    loan: Loan, 
    currentLtv: number, 
    collateralValueUsd: number,
    btcPriceUsd: number
  ): Promise<void> {
    try {
      // Get lender's BTC address
      const lender = await storage.getUser(loan.lenderId!);
      if (!lender || !lender.btcAddress) {
        console.error(`[LtvMonitor] Cannot liquidate loan #${loan.id}: Lender has no BTC address`);
        return;
      }

      // Check if we have pre-signed liquidation transaction
      if (loan.txLiquidationHex) {
        console.log(`[LtvMonitor] Broadcasting pre-signed liquidation tx for loan #${loan.id}`);
        const broadcastResult = await broadcastTransaction(loan.txLiquidationHex);
        if (!broadcastResult.success) {
          console.error(`[LtvMonitor] Broadcast failed: ${broadcastResult.error}`);
          return;
        }
        const txid = broadcastResult.txid!;
        console.log(`✅ [LtvMonitor] Liquidation broadcast successful: ${txid}`);
        
        // Update loan status
        await storage.updateLoan(loan.id, {
          status: 'defaulted',
          escrowState: 'liquidated',
          disputeStatus: 'resolved',
          disputeResolvedAt: new Date(),
        });

        // Send notifications
        await this.sendLiquidationNotifications(loan, lender, currentLtv, collateralValueUsd, btcPriceUsd, txid);
      } else {
        // No pre-signed tx - use CollateralReleaseService to create and broadcast
        console.log(`[LtvMonitor] Creating liquidation tx for loan #${loan.id} -> ${lender.btcAddress}`);
        
        // Import and use the release function (but to lender's address)
        const { releaseCollateralToAddress } = await import('./CollateralReleaseService');
        const result = await releaseCollateralToAddress(loan.id, lender.btcAddress);
        
        if (result.success) {
          console.log(`✅ [LtvMonitor] Liquidation successful: ${result.txid}`);
          
          // Update loan status
          await storage.updateLoan(loan.id, {
            status: 'defaulted',
            escrowState: 'liquidated',
            disputeStatus: 'resolved',
            disputeResolvedAt: new Date(),
          });

          // Send notifications
          await this.sendLiquidationNotifications(loan, lender, currentLtv, collateralValueUsd, btcPriceUsd, result.txid!);
        } else {
          console.error(`[LtvMonitor] Liquidation failed for loan #${loan.id}: ${result.error}`);
        }
      }
    } catch (error) {
      console.error(`[LtvMonitor] Error executing liquidation for loan #${loan.id}:`, error);
    }
  }

  /**
   * Send liquidation notifications to borrower and lender
   */
  private async sendLiquidationNotifications(
    loan: Loan,
    lender: any,
    currentLtv: number,
    collateralValueUsd: number,
    btcPriceUsd: number,
    txid: string
  ): Promise<void> {
    try {
      const borrower = await storage.getUser(loan.borrowerId);
      const collateralBtc = parseFloat(String(loan.collateralBtc));
      const loanAmount = parseFloat(String(loan.amount));

      // Email to borrower
      if (borrower?.email) {
        const borrowerHtml = createBrandedEmailHtml({
          title: '⚠️ Loan Liquidated',
          greeting: `Dear ${borrower.firstName || borrower.username},`,
          content: `
            <p>Your loan #${loan.id} has been automatically liquidated due to a significant drop in Bitcoin price.</p>
            
            <div style="background: #FEF2F2; border-left: 4px solid #EF4444; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; color: #991B1B;"><strong>Liquidation Details:</strong></p>
              <ul style="color: #991B1B;">
                <li>Loan Amount: €${loanAmount.toLocaleString()}</li>
                <li>Collateral: ${collateralBtc.toFixed(8)} BTC</li>
                <li>BTC Price at Liquidation: $${btcPriceUsd.toLocaleString()}</li>
                <li>Collateral Value: $${collateralValueUsd.toFixed(2)}</li>
                <li>LTV at Liquidation: ${(currentLtv * 100).toFixed(1)}%</li>
              </ul>
            </div>

            <p>Your collateral has been transferred to the lender to cover the outstanding loan.</p>
            
            <p>Transaction ID: <code>${txid}</code></p>
            <p><a href="https://mempool.space/testnet4/tx/${txid}">View on Blockchain</a></p>
          `
        });

        await sendEmail({
          to: borrower.email,
          from: 'Reconquest <noreply@reconquestp2p.com>',
          subject: `⚠️ Loan #${loan.id} Liquidated - Collateral Released to Lender`,
          html: borrowerHtml
        });
        console.log(`📧 [LtvMonitor] Liquidation email sent to borrower: ${borrower.email}`);
      }

      // Email to lender
      if (lender?.email) {
        const lenderHtml = createBrandedEmailHtml({
          title: '💰 Liquidation Complete - Collateral Received',
          greeting: `Dear ${lender.firstName || lender.username},`,
          content: `
            <p>Good news! Loan #${loan.id} has been liquidated due to a drop in Bitcoin price, and the collateral has been sent to your Bitcoin address.</p>
            
            <div style="background: #ECFDF5; border-left: 4px solid #10B981; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; color: #065F46;"><strong>Collateral Received:</strong></p>
              <ul style="color: #065F46;">
                <li>Amount: ${collateralBtc.toFixed(8)} BTC</li>
                <li>Your Address: ${lender.btcAddress}</li>
                <li>BTC Price at Liquidation: $${btcPriceUsd.toLocaleString()}</li>
              </ul>
            </div>

            <p>Transaction ID: <code>${txid}</code></p>
            <p><a href="https://mempool.space/testnet4/tx/${txid}">View on Blockchain</a></p>
          `
        });

        await sendEmail({
          to: lender.email,
          from: 'Reconquest <noreply@reconquestp2p.com>',
          subject: `💰 Loan #${loan.id} Liquidated - ${collateralBtc.toFixed(8)} BTC Sent to You`,
          html: lenderHtml
        });
        console.log(`📧 [LtvMonitor] Liquidation email sent to lender: ${lender.email}`);
      }
    } catch (error) {
      console.error('[LtvMonitor] Error sending liquidation notifications:', error);
    }
  }

  /**
   * Send LTV warning email to borrower
   */
  private async sendLtvWarning(
    loan: Loan,
    currentLtv: number,
    collateralValueUsd: number,
    btcPriceUsd: number
  ): Promise<void> {
    try {
      const borrower = await storage.getUser(loan.borrowerId);
      if (!borrower?.email) return;

      const collateralBtc = parseFloat(String(loan.collateralBtc));
      const loanAmount = parseFloat(String(loan.amount));
      const liquidationPrice = (loanAmount / collateralBtc) / LIQUIDATION_LTV_THRESHOLD;

      const html = createBrandedEmailHtml({
        title: '⚠️ LTV Warning - Add Collateral or Repay',
        greeting: `Dear ${borrower.firstName || borrower.username},`,
        content: `
          <p>The Bitcoin price has dropped and your loan #${loan.id} is approaching the liquidation threshold.</p>
          
          <div style="background: #FFFBEB; border-left: 4px solid #F59E0B; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #92400E;"><strong>Current Status:</strong></p>
            <ul style="color: #92400E;">
              <li>Current LTV: ${(currentLtv * 100).toFixed(1)}% (Liquidation at 90%)</li>
              <li>Collateral Value: $${collateralValueUsd.toFixed(2)}</li>
              <li>Loan Amount: €${loanAmount.toLocaleString()}</li>
              <li>Current BTC Price: $${btcPriceUsd.toLocaleString()}</li>
              <li><strong>Liquidation Price: $${liquidationPrice.toFixed(0)}</strong></li>
            </ul>
          </div>

          <p><strong>To avoid liquidation:</strong></p>
          <ul>
            <li>Repay your loan in full before the price drops further</li>
            <li>Contact support if you need assistance</li>
          </ul>
          
          <p>If BTC drops to ~$${liquidationPrice.toFixed(0)}, your collateral will be automatically liquidated.</p>
        `
      });

      await sendEmail({
        to: borrower.email,
        from: 'Reconquest <noreply@reconquestp2p.com>',
        subject: `⚠️ LTV Warning for Loan #${loan.id} - ${(currentLtv * 100).toFixed(0)}% LTV`,
        html
      });
      console.log(`📧 [LtvMonitor] LTV warning email sent to: ${borrower.email}`);
    } catch (error) {
      console.error('[LtvMonitor] Error sending LTV warning:', error);
    }
  }

  /**
   * Manual check for a specific loan (for testing)
   */
  async checkSpecificLoan(loanId: number, overridePrice?: number): Promise<LtvCheckResult | null> {
    const loan = await storage.getLoan(loanId);
    if (!loan) {
      console.log(`[LtvMonitor] Loan #${loanId} not found`);
      return null;
    }

    const btcPriceUsd = overridePrice || this.simulatedBtcPrice || (await getBtcPrice()).usd;
    return await this.checkLoanLtv(loan, btcPriceUsd);
  }
}

// Singleton instance
export const ltvMonitoring = new LtvMonitoringService();
