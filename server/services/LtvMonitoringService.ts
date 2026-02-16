/**
 * LTV Monitoring Service
 * 
 * Polls active loans periodically and checks if BTC price drop triggers liquidation.
 * When collateral value falls below the liquidation threshold (95% LTV), 
 * automatically broadcasts the liquidation transaction to send BTC to lender.
 * 
 * IMPORTANT: Loan value = Principal + Interest (not just principal)
 * Example: €10,000 loan at 10% APY for 12 months = €11,000 loan value
 */

import { storage } from '../storage';
import { getBtcPrice } from './price-service';
import { broadcastTransaction } from './bitcoin-broadcast';
import { sendEmail, createBrandedEmailHtml, getBaseUrl } from '../email';
import { getExplorerUrl } from './bitcoin-network-selector.js';
import type { Loan } from '@shared/schema';

const POLLING_INTERVAL_MS = 60000; // Check every 1 minute
const LIQUIDATION_LTV_THRESHOLD = 0.95; // 95% LTV triggers liquidation
const CRITICAL_WARNING_LTV_THRESHOLD = 0.85; // 85% LTV - borrower asked to top up, lender informed
const EARLY_WARNING_LTV_THRESHOLD = 0.75; // 75% LTV - borrower warned (early notice)

interface LtvCheckResult {
  loanId: number;
  currentLtv: number;
  collateralValueEur: number;
  loanAmountEur: number;
  btcPriceUsd: number;
  status: 'healthy' | 'early_warning' | 'critical_warning' | 'liquidation';
}

const LTV_ALERT_STEP = 5; // Only send alerts every 5% LTV increase

export class LtvMonitoringService {
  private pollingInterval: NodeJS.Timeout | null = null;
  private isPolling = false;

  /**
   * Get block explorer URL for a transaction (testnet or mainnet based on config)
   */
  private getExplorerTxUrl(txid: string): string {
    return getExplorerUrl('tx', txid);
  }

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
   * Check all active loans for LTV violations
   */
  async checkAllActiveLoans(): Promise<LtvCheckResult[]> {
    // Get current BTC price from real market data
    const priceData = await getBtcPrice();
    const btcPriceUsd = priceData.usd;

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
   * Calculate total loan value including principal + interest
   * Example: €10,000 at 10% APY for 12 months = €10,000 + €1,000 = €11,000
   */
  private calculateTotalLoanValue(loan: Loan): number {
    const principal = parseFloat(String(loan.amount));
    const interestRate = parseFloat(String(loan.interestRate)) / 100; // Convert percentage to decimal
    const termMonths = loan.termMonths || 12;
    
    // Interest = Principal × Rate × (Months / 12)
    const interest = principal * interestRate * (termMonths / 12);
    const totalValue = principal + interest;
    
    return totalValue;
  }

  /**
   * Round LTV percentage down to nearest 5% step for alert bucketing
   * e.g., 77.3% -> 75, 83.9% -> 80, 86.1% -> 85
   */
  private getLtvAlertBucket(ltvPercent: number): number {
    return Math.floor(ltvPercent / LTV_ALERT_STEP) * LTV_ALERT_STEP;
  }

  /**
   * Check a single loan's LTV and take action if needed.
   * Alerts are only sent when LTV crosses a new 5% boundary (persisted to DB).
   */
  private async checkLoanLtv(loan: Loan, btcPriceUsd: number): Promise<LtvCheckResult> {
    const collateralBtc = parseFloat(String(loan.collateralBtc));
    
    // Total loan value = principal + interest (in loan currency)
    const totalLoanValue = this.calculateTotalLoanValue(loan);
    
    // Convert BTC price to loan currency (EUR uses ~0.85 conversion from USD)
    const btcPriceInLoanCurrency = loan.currency === 'EUR' ? btcPriceUsd * 0.85 : btcPriceUsd;
    const collateralValueInLoanCurrency = collateralBtc * btcPriceInLoanCurrency;
    
    // LTV = total loan value (principal + interest) / collateral value
    const currentLtv = totalLoanValue / collateralValueInLoanCurrency;
    const currentLtvPercent = currentLtv * 100;
    const currentBucket = this.getLtvAlertBucket(currentLtvPercent);
    const lastAlertLevel = loan.lastLtvAlertLevel ?? 0;

    const result: LtvCheckResult = {
      loanId: loan.id,
      currentLtv,
      collateralValueEur: collateralValueInLoanCurrency,
      loanAmountEur: totalLoanValue,
      btcPriceUsd,
      status: 'healthy'
    };

    // Check if liquidation needed (LTV >= 95%) - always triggers regardless of alert history
    if (currentLtv >= LIQUIDATION_LTV_THRESHOLD) {
      result.status = 'liquidation';
      console.log(`🚨 [LtvMonitor] Loan #${loan.id} LIQUIDATION TRIGGERED! LTV: ${currentLtvPercent.toFixed(1)}%`);
      console.log(`   Collateral: ${collateralBtc} BTC = €${collateralValueInLoanCurrency.toFixed(2)} vs Loan Value (P+I): €${totalLoanValue.toFixed(2)}`);
      
      await this.executeLiquidation(loan, currentLtv, collateralValueInLoanCurrency, btcPriceUsd);
      await storage.updateLoan(loan.id, { lastLtvAlertLevel: 95 });
    }
    // Check if we've crossed a new 5% warning bucket since last alert
    else if (currentLtvPercent >= EARLY_WARNING_LTV_THRESHOLD * 100 && currentBucket > lastAlertLevel) {
      const isInCriticalZone = currentLtv >= CRITICAL_WARNING_LTV_THRESHOLD;
      
      if (isInCriticalZone) {
        result.status = 'critical_warning';
        console.log(`🔴 [LtvMonitor] Loan #${loan.id} CRITICAL WARNING at ${currentLtvPercent.toFixed(1)}% (bucket ${currentBucket}%, last alert at ${lastAlertLevel}%)`);
        console.log(`   Collateral: ${collateralBtc} BTC = €${collateralValueInLoanCurrency.toFixed(2)} vs Loan Value (P+I): €${totalLoanValue.toFixed(2)}`);
        
        await this.sendCriticalWarning(loan, currentLtv, collateralValueInLoanCurrency, btcPriceUsd);
      } else {
        result.status = 'early_warning';
        console.log(`⚠️ [LtvMonitor] Loan #${loan.id} EARLY WARNING at ${currentLtvPercent.toFixed(1)}% (bucket ${currentBucket}%, last alert at ${lastAlertLevel}%)`);
        console.log(`   Collateral: ${collateralBtc} BTC = €${collateralValueInLoanCurrency.toFixed(2)} vs Loan Value (P+I): €${totalLoanValue.toFixed(2)}`);
        
        await this.sendEarlyWarning(loan, currentLtv, collateralValueInLoanCurrency, btcPriceUsd);
      }

      // Persist the new alert level to DB so it survives restarts
      await storage.updateLoan(loan.id, { lastLtvAlertLevel: currentBucket });
      console.log(`   📝 Updated lastLtvAlertLevel for loan #${loan.id} to ${currentBucket}%`);
    }
    // No reset — alerts are one-way. Once a bucket level is reached, it stays recorded.
    // This ensures each 5% threshold email is sent exactly once per loan lifetime.

    return result;
  }

  /**
   * Execute liquidation - broadcast transaction sending BTC to lender
   */
  private async executeLiquidation(
    loan: Loan, 
    currentLtv: number, 
    collateralValueEur: number,
    btcPriceUsd: number
  ): Promise<void> {
    try {
      // Get lender's BTC address (per-loan, with legacy fallback to profile)
      const lender = await storage.getUser(loan.lenderId!);
      const effectiveLenderBtcAddress = loan.lenderBtcAddress || lender?.btcAddress;
      if (!effectiveLenderBtcAddress) {
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
          collateralReleased: true,
          collateralReleasedAt: new Date(),
          collateralReleaseError: null,
          disputeStatus: 'resolved',
          disputeResolvedAt: new Date(),
        });

        // Send notifications
        await this.sendLiquidationNotifications(loan, lender, currentLtv, collateralValueEur, btcPriceUsd, txid);
      } else {
        // Determine target address based on lender's default preference
        const lenderPreference = loan.lenderDefaultPreference || 'eur';
        let liquidationTargetAddress: string;
        
        if (lenderPreference === 'eur') {
          const platformBtcAddress = process.env.PLATFORM_BTC_ADDRESS || '';
          if (!platformBtcAddress) {
            console.error(`🚨 [LtvMonitor] CRITICAL: Cannot liquidate loan #${loan.id}: PLATFORM_BTC_ADDRESS not configured! Lender prefers EUR but no platform address set. Set PLATFORM_BTC_ADDRESS env var immediately.`);
            try {
              const { sendEmail } = await import('../email');
              await sendEmail({
                to: 'admin@reconquestp2p.com',
                from: 'Reconquest <noreply@reconquestp2p.com>',
                subject: `🚨 CRITICAL: Liquidation blocked - Loan #${loan.id} - Missing PLATFORM_BTC_ADDRESS`,
                html: `<p>Loan #${loan.id} has reached critical LTV and requires liquidation, but <strong>PLATFORM_BTC_ADDRESS</strong> environment variable is not set. The lender chose EUR preference, so BTC must be routed to the platform address for fiat conversion. Please set this environment variable immediately and trigger manual liquidation.</p>`,
              });
            } catch (emailErr) {
              console.error(`[LtvMonitor] Failed to send admin alert about missing PLATFORM_BTC_ADDRESS:`, emailErr);
            }
            return;
          }
          liquidationTargetAddress = platformBtcAddress;
          console.log(`[LtvMonitor] Lender prefers EUR - routing liquidation to platform address for fiat conversion`);
        } else {
          liquidationTargetAddress = effectiveLenderBtcAddress;
          console.log(`[LtvMonitor] Lender prefers BTC - routing liquidation directly to lender`);
        }
        
        console.log(`[LtvMonitor] Creating liquidation tx for loan #${loan.id} -> ${liquidationTargetAddress}`);
        
        const { releaseCollateralToAddress } = await import('./CollateralReleaseService');
        const result = await releaseCollateralToAddress(loan.id, liquidationTargetAddress);
        
        if (result.success) {
          console.log(`✅ [LtvMonitor] Liquidation successful: ${result.txid}`);
          
          // Update loan status
          await storage.updateLoan(loan.id, {
            status: 'defaulted',
            escrowState: 'liquidated',
            collateralReleased: true,
            collateralReleasedAt: new Date(),
            collateralReleaseError: null,
            disputeStatus: 'resolved',
            disputeResolvedAt: new Date(),
          });

          // Send notifications
          await this.sendLiquidationNotifications(loan, lender, currentLtv, collateralValueEur, btcPriceUsd, result.txid!);
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
    collateralValueEur: number,
    btcPriceUsd: number,
    txid: string
  ): Promise<void> {
    try {
      const borrower = await storage.getUser(loan.borrowerId);
      const collateralBtc = parseFloat(String(loan.collateralBtc));
      const loanAmount = parseFloat(String(loan.amount));
      
      // Convert BTC price to EUR (collateralValueEur is already in EUR from caller)
      const btcPriceEur = btcPriceUsd * 0.85;

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
                <li>BTC Price at Liquidation: €${btcPriceEur.toLocaleString()}</li>
                <li>Collateral Value: €${collateralValueEur.toFixed(2)}</li>
                <li>LTV at Liquidation: ${(currentLtv * 100).toFixed(1)}%</li>
              </ul>
            </div>

            <p>Your collateral has been transferred to the lender to cover the outstanding loan.</p>
            
            <p>Transaction ID: <code>${txid}</code></p>
            <p><a href="${this.getExplorerTxUrl(txid)}">View on Blockchain</a></p>
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
                <li>Your Address: ${loan.lenderBtcAddress || lender?.btcAddress || 'Platform address (EUR conversion)'}</li>
                <li>BTC Price at Liquidation: €${btcPriceEur.toLocaleString()}</li>
              </ul>
            </div>

            <p>Transaction ID: <code>${txid}</code></p>
            <p><a href="${this.getExplorerTxUrl(txid)}">View on Blockchain</a></p>
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
   * Send EARLY WARNING email (75% LTV) - Borrower only
   * Informs borrower that LTV is rising and they might be asked to top up
   */
  private async sendEarlyWarning(
    loan: Loan,
    currentLtv: number,
    collateralValueEur: number,
    btcPriceUsd: number
  ): Promise<void> {
    try {
      const borrower = await storage.getUser(loan.borrowerId);
      if (!borrower?.email) return;

      const collateralBtc = parseFloat(String(loan.collateralBtc));
      const loanAmount = parseFloat(String(loan.amount));
      const interestRate = parseFloat(String(loan.interestRate)) / 100;
      const termMonths = loan.termMonths || 12;
      const loanValueWithInterest = loanAmount * (1 + interestRate * (termMonths / 12));
      const btcPriceEur = btcPriceUsd * 0.85;
      const escrowAddress = loan.escrowAddress || 'N/A';
      
      // Calculate top-up amounts for both 75% and 50% LTV
      const targetLtv50 = 0.50;
      const requiredCollateralValue50 = loanValueWithInterest / targetLtv50;
      const additionalBtcFor50 = Math.max(0, (requiredCollateralValue50 - collateralValueEur) / btcPriceEur);

      const baseUrl = getBaseUrl();
      const borrowerHtml = createBrandedEmailHtml({
        title: '⚠️ LTV Rising - Monitor Your Loan',
        greeting: `Dear ${borrower.firstName || borrower.username},`,
        content: `
          <p>This is an early notice that the LTV on your loan #${loan.id} is rising due to a drop in Bitcoin price.</p>

          <div style="background: #FEF2F2; border: 2px solid #DC2626; padding: 15px; margin: 20px 0; border-radius: 8px;">
            <p style="margin: 0; color: #991B1B; font-weight: bold;">⚠️ IMPORTANT: After sending your top-up, you MUST log in to your Borrower Dashboard and confirm the top-up amount. If you do not confirm it on the dashboard, the system will not detect the additional collateral, and your loan may still be liquidated even though the funds are in escrow.</p>
            <div style="text-align: center; margin-top: 15px;">
              <a href="${baseUrl}/borrower" style="display: inline-block; background: #DC2626; color: #ffffff; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 16px;">Go to Borrower Dashboard</a>
            </div>
          </div>
          
          <div style="border-left: 4px solid #6B7280; padding: 15px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Current Status:</strong></p>
            <ul>
              <li>Current LTV: ${(currentLtv * 100).toFixed(1)}%</li>
              <li>Collateral Value: €${collateralValueEur.toFixed(2)}</li>
              <li>Loan Value (incl. interest): €${loanValueWithInterest.toFixed(2)}</li>
              <li>Current BTC Price: €${btcPriceEur.toFixed(0)}</li>
            </ul>
          </div>

          <p><strong>What this means:</strong></p>
          <ul>
            <li>Your loan is still within safe parameters, but the LTV is increasing.</li>
            <li>If the Bitcoin price continues to drop, you will be asked to <strong>top up your collateral</strong> at the 85% LTV level.</li>
            <li>At 95% LTV, <strong>automatic liquidation</strong> will be triggered.</li>
          </ul>

          <div style="background: #ECFDF5; border: 1px solid #10B981; padding: 15px; margin: 20px 0; border-radius: 8px;">
            <p style="margin: 0 0 10px 0; color: #065F46;"><strong>💡 Optional: Top up now to reach 50% LTV (recommended):</strong></p>
            <p style="margin: 0; color: #065F46;">Deposit <strong>${additionalBtcFor50.toFixed(6)} BTC</strong> to protect your position from future price drops.</p>
          </div>

          <div style="background: #EFF6FF; border-left: 4px solid #3B82F6; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #1E40AF;"><strong>📍 Top-Up Address:</strong></p>
            <p style="font-family: monospace; word-break: break-all; color: #1E40AF; margin-top: 10px;">${escrowAddress}</p>
            <p style="color: #1E40AF; font-size: 12px; margin-top: 5px;">This is the same escrow address used for your initial collateral deposit.</p>
          </div>
          
          <p>
            💡 No action is required now, but please monitor your loan and be prepared to add collateral or repay if the price continues to fall.
          </p>
        `
      });

      await sendEmail({
        to: borrower.email,
        from: 'Reconquest <noreply@reconquestp2p.com>',
        subject: `⚠️ LTV Rising on Loan #${loan.id} - ${(currentLtv * 100).toFixed(0)}% LTV`,
        html: borrowerHtml
      });
      console.log(`📧 [LtvMonitor] Early warning email sent to borrower: ${borrower.email}`);
    } catch (error) {
      console.error('[LtvMonitor] Error sending early warning:', error);
    }
  }

  /**
   * Send CRITICAL WARNING email (85% LTV) - Both borrower and lender
   * Borrower asked to top up, lender informed
   */
  private async sendCriticalWarning(
    loan: Loan,
    currentLtv: number,
    collateralValueEur: number,
    btcPriceUsd: number
  ): Promise<void> {
    try {
      const borrower = await storage.getUser(loan.borrowerId);
      const lender = loan.lenderId ? await storage.getUser(loan.lenderId) : null;

      const collateralBtc = parseFloat(String(loan.collateralBtc));
      const loanAmount = parseFloat(String(loan.amount));
      const interestRate = parseFloat(String(loan.interestRate)) / 100;
      const termMonths = loan.termMonths || 12;
      const loanValueWithInterest = loanAmount * (1 + interestRate * (termMonths / 12));
      const btcPriceEur = btcPriceUsd * 0.85;
      const liquidationPriceEur = (loanValueWithInterest / collateralBtc) / LIQUIDATION_LTV_THRESHOLD;
      const escrowAddress = loan.escrowAddress || 'N/A';
      
      // Calculate how much extra BTC is needed to bring LTV back to 75% (minimum safe)
      const targetLtv75 = 0.75;
      const requiredCollateralValue75 = loanValueWithInterest / targetLtv75;
      const additionalBtcFor75 = Math.max(0, (requiredCollateralValue75 - collateralValueEur) / btcPriceEur);
      
      // Calculate how much extra BTC is needed to bring LTV back to 50% (recommended safe)
      const targetLtv50 = 0.50;
      const requiredCollateralValue50 = loanValueWithInterest / targetLtv50;
      const additionalBtcFor50 = Math.max(0, (requiredCollateralValue50 - collateralValueEur) / btcPriceEur);

      // Send warning to borrower
      if (borrower?.email) {
        const criticalBaseUrl = getBaseUrl();
        const borrowerHtml = createBrandedEmailHtml({
          title: '🔴 URGENT: Top Up Collateral Required',
          greeting: `Dear ${borrower.firstName || borrower.username},`,
          content: `
            <p>Your loan #${loan.id} has reached a critical LTV level. <strong>Immediate action is required.</strong></p>

            <div style="background: #FEF2F2; border: 2px solid #DC2626; padding: 15px; margin: 20px 0; border-radius: 8px;">
              <p style="margin: 0; color: #991B1B; font-weight: bold;">⚠️ IMPORTANT: After sending your top-up, you MUST log in to your Borrower Dashboard and confirm the top-up amount. If you do not confirm it on the dashboard, the system will not detect the additional collateral, and your loan may still be liquidated even though the funds are in escrow.</p>
              <div style="text-align: center; margin-top: 15px;">
                <a href="${criticalBaseUrl}/borrower" style="display: inline-block; background: #DC2626; color: #ffffff; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 16px;">Go to Borrower Dashboard</a>
              </div>
            </div>
            
            <div style="border-left: 4px solid #6B7280; padding: 15px; margin: 20px 0;">
              <p style="margin: 0;"><strong>Critical Status:</strong></p>
              <ul>
                <li>Current LTV: <strong>${(currentLtv * 100).toFixed(1)}%</strong></li>
                <li>Collateral Value: €${collateralValueEur.toFixed(2)}</li>
                <li>Loan Value (incl. interest): €${loanValueWithInterest.toFixed(2)}</li>
                <li>Current BTC Price: €${btcPriceEur.toFixed(0)}</li>
                <li><strong>Liquidation Price: ~€${liquidationPriceEur.toFixed(0)}</strong></li>
              </ul>
            </div>

            <p><strong>Top-Up Options:</strong></p>
            <div style="background: #F0FDF4; border: 1px solid #22C55E; padding: 15px; margin: 10px 0; border-radius: 8px;">
              <p style="margin: 0 0 10px 0; color: #166534;"><strong>Minimum required (to reach 75% LTV):</strong></p>
              <p style="margin: 0; color: #166534; font-size: 18px;">Deposit at least <strong>${additionalBtcFor75.toFixed(6)} BTC</strong></p>
            </div>
            <div style="background: #ECFDF5; border: 2px solid #10B981; padding: 15px; margin: 10px 0; border-radius: 8px;">
              <p style="margin: 0 0 10px 0; color: #065F46;"><strong>✨ Recommended (to reach 50% LTV):</strong></p>
              <p style="margin: 0; color: #065F46; font-size: 18px;">Deposit <strong>${additionalBtcFor50.toFixed(6)} BTC</strong></p>
              <p style="margin: 5px 0 0 0; color: #065F46; font-size: 12px;">We strongly encourage reaching 50% LTV to avoid future liquidation risk if BTC price continues to drop.</p>
            </div>
            
            <p style="margin-top: 15px;"><strong>Or repay your loan in full:</strong> €${loanValueWithInterest.toFixed(2)}</p>

            <div style="background: #DBEAFE; border: 2px solid #2563EB; padding: 15px; margin: 20px 0; border-radius: 8px;">
              <p style="margin: 0; color: #1E40AF; font-weight: bold;">📍 Deposit Address for Top-Up:</p>
              <p style="font-family: monospace; word-break: break-all; color: #1E40AF; background: #EFF6FF; padding: 10px; margin-top: 10px; border-radius: 4px; font-size: 14px;">${escrowAddress}</p>
              <p style="color: #1E40AF; font-size: 12px; margin-top: 5px;">Send additional BTC to this address. This is the same escrow address used for your initial collateral deposit.</p>
            </div>
            
            <p style="color: #DC2626; font-weight: bold; font-size: 16px;">
              ⚠️ WARNING: If LTV reaches 95%, your collateral will be AUTOMATICALLY LIQUIDATED and sent to the lender. This action is irreversible.
            </p>
          `
        });

        await sendEmail({
          to: borrower.email,
          from: 'Reconquest <noreply@reconquestp2p.com>',
          subject: `🔴 URGENT: Top Up Required for Loan #${loan.id} - ${(currentLtv * 100).toFixed(0)}% LTV`,
          html: borrowerHtml
        });
        console.log(`📧 [LtvMonitor] Critical warning email sent to borrower: ${borrower.email}`);
      }

      // Send notification to lender (use the correct collateralValueEur - already in EUR)
      if (lender?.email) {
        const lenderHtml = createBrandedEmailHtml({
          title: '📊 LTV Alert - Borrower Asked to Top Up',
          greeting: `Dear ${lender.firstName || lender.username},`,
          content: `
            <p>We are writing to inform you that the LTV on loan #${loan.id} has reached a critical level due to a drop in Bitcoin price.</p>
            
            <div style="background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; color: #92400E;"><strong>Loan Status:</strong></p>
              <ul style="color: #92400E;">
                <li>Current LTV: <strong>${(currentLtv * 100).toFixed(1)}%</strong></li>
                <li>Collateral: ${collateralBtc.toFixed(8)} BTC (€${collateralValueEur.toFixed(2)})</li>
                <li>Loan Value (incl. interest): €${loanValueWithInterest.toFixed(2)}</li>
                <li>Liquidation Threshold: 95% LTV</li>
              </ul>
            </div>

            <p><strong>What happens next:</strong></p>
            <ul>
              <li>The borrower has been <strong>urgently notified</strong> to either top up their collateral or repay the loan in full.</li>
              <li>If the borrower does not take action and LTV reaches 95%, the collateral will be <strong>automatically liquidated</strong> and sent to your registered BTC address.</li>
              <li>This ensures full repayment of your investment regardless of the borrower's actions.</li>
            </ul>
            
            <p style="color: #059669; font-weight: bold;">
              ✓ Your investment is protected. If the borrower fails to act, you will receive ${collateralBtc.toFixed(8)} BTC automatically.
            </p>
          `
        });

        await sendEmail({
          to: lender.email,
          from: 'Reconquest <noreply@reconquestp2p.com>',
          subject: `📊 LTV Alert for Loan #${loan.id} - Borrower Asked to Top Up Collateral`,
          html: lenderHtml
        });
        console.log(`📧 [LtvMonitor] Critical warning email sent to lender: ${lender.email}`);
      }
    } catch (error) {
      console.error('[LtvMonitor] Error sending critical warning:', error);
    }
  }

  /**
   * Manual check for a specific loan (uses real market price only)
   */
  async checkSpecificLoan(loanId: number): Promise<LtvCheckResult | null> {
    const loan = await storage.getLoan(loanId);
    if (!loan) {
      console.log(`[LtvMonitor] Loan #${loanId} not found`);
      return null;
    }

    const priceData = await getBtcPrice();
    return await this.checkLoanLtv(loan, priceData.usd);
  }
}

// Singleton instance
export const ltvMonitoring = new LtvMonitoringService();
