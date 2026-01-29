/**
 * Auto Collateral Release Service
 * 
 * Handles automatic release of Bitcoin collateral when a loan is repaid.
 * Uses pre-signed REPAYMENT PSBTs with platform co-signing.
 */

import { releaseCollateral, ReleaseResult } from './CollateralReleaseService.js';
import type { IStorage } from '../storage.js';

export interface AutoReleaseResult {
  success: boolean;
  processed: number;
  released: number;
  failed: number;
  results: Array<{
    loanId: number;
    success: boolean;
    txid?: string;
    error?: string;
  }>;
}

/**
 * Process a single loan for automatic collateral release
 */
export async function processLoanRelease(
  storage: IStorage,
  loanId: number
): Promise<ReleaseResult> {
  console.log(`[AutoRelease] Processing loan ${loanId}`);
  
  const loan = await storage.getLoan(loanId);
  if (!loan) {
    return { success: false, error: `Loan ${loanId} not found` };
  }
  
  // Validate loan state
  if (loan.status !== 'repaid') {
    return { success: false, error: `Loan ${loanId} is not repaid (status: ${loan.status})` };
  }
  
  if (loan.collateralReleased) {
    return { success: false, error: `Loan ${loanId} collateral already released` };
  }
  
  if (!loan.fundingTxid) {
    return { success: false, error: `Loan ${loanId} has no funding transaction` };
  }
  
  // Try to release collateral using pre-signed PSBT
  const result = await releaseCollateral(storage, loanId);
  
  if (result.success) {
    // Update loan record
    await storage.updateLoan(loanId, {
      collateralReleased: true,
      collateralReleaseTxid: result.txid,
      collateralReleasedAt: new Date(),
      collateralReleaseError: null
    });
    
    console.log(`[AutoRelease] ✅ Loan ${loanId} collateral released: ${result.txid}`);
    
    // Send notification to borrower
    await notifyBorrower(storage, loanId, result.txid!);
  } else {
    // Log error to loan record
    await storage.updateLoan(loanId, {
      collateralReleaseError: result.error || 'Unknown release error'
    });
    
    console.error(`[AutoRelease] ❌ Failed to release loan ${loanId}: ${result.error}`);
  }
  
  return result;
}

/**
 * Process all repaid loans that need collateral release
 */
export async function processRepaidLoans(storage: IStorage): Promise<AutoReleaseResult> {
  console.log('[AutoRelease] Checking for repaid loans needing collateral release...');
  
  const results: AutoReleaseResult = {
    success: true,
    processed: 0,
    released: 0,
    failed: 0,
    results: []
  };
  
  try {
    // Find loans that are:
    // 1. Repayment confirmed (status = 'repaid')
    // 2. Collateral not yet released (collateral_released = false)
    // 3. Has funding transaction (fundingTxid exists)
    const allLoans = await storage.getLoans();
    const loansToProcess = allLoans.filter(loan => 
      loan.status === 'repaid' && 
      !loan.collateralReleased && 
      loan.fundingTxid
    );
    
    if (loansToProcess.length === 0) {
      console.log('[AutoRelease] No loans pending collateral release');
      return results;
    }
    
    console.log(`[AutoRelease] Found ${loansToProcess.length} loan(s) pending release`);
    
    // Process each loan
    for (const loan of loansToProcess) {
      results.processed++;
      
      try {
        const releaseResult = await processLoanRelease(storage, loan.id);
        
        results.results.push({
          loanId: loan.id,
          success: releaseResult.success,
          txid: releaseResult.txid,
          error: releaseResult.error
        });
        
        if (releaseResult.success) {
          results.released++;
        } else {
          results.failed++;
        }
      } catch (error: any) {
        results.failed++;
        results.results.push({
          loanId: loan.id,
          success: false,
          error: error.message || 'Processing error'
        });
        console.error(`[AutoRelease] Error processing loan ${loan.id}:`, error);
      }
    }
    
    console.log(`[AutoRelease] Batch complete: ${results.released} released, ${results.failed} failed`);
    
  } catch (error: any) {
    console.error('[AutoRelease] Critical error:', error);
    results.success = false;
  }
  
  return results;
}

/**
 * Notify borrower that collateral has been returned
 */
async function notifyBorrower(storage: IStorage, loanId: number, txid: string): Promise<void> {
  try {
    const loan = await storage.getLoan(loanId);
    if (!loan || !loan.borrowerId) return;
    
    const borrower = await storage.getUser(loan.borrowerId);
    if (!borrower || !borrower.email) return;
    
    // Import email service dynamically
    const { sendEmail } = await import('./email.js');
    
    const explorerUrl = `https://mempool.space/testnet4/tx/${txid}`;
    
    await sendEmail({
      to: borrower.email,
      subject: `Collateral Released - Loan #${loanId}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #10B981;">Your Collateral Has Been Released!</h1>
          <p>Great news! Your Bitcoin collateral for Loan #${loanId} has been successfully returned to your wallet.</p>
          
          <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Transaction ID:</strong></p>
            <code style="word-break: break-all; font-size: 12px;">${txid}</code>
          </div>
          
          <p>
            <a href="${explorerUrl}" style="display: inline-block; background: #F7931A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
              View on Explorer
            </a>
          </p>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            Thank you for using Reconquest. We look forward to serving you again!
          </p>
        </div>
      `
    });
    
    console.log(`[AutoRelease] 📧 Notification sent to ${borrower.email} for loan ${loanId}`);
  } catch (error) {
    console.error(`[AutoRelease] Failed to send notification for loan ${loanId}:`, error);
    // Non-fatal - don't fail the release
  }
}

/**
 * Start the auto-release cron job (every 5 minutes)
 */
let cronInterval: NodeJS.Timeout | null = null;

export function startAutoReleaseCron(storage: IStorage): void {
  if (cronInterval) {
    console.log('[AutoRelease] Cron already running');
    return;
  }
  
  console.log('[AutoRelease] Starting auto-release cron (every 5 minutes)');
  
  // Run every 5 minutes (300000 ms)
  cronInterval = setInterval(async () => {
    console.log('[Cron] Auto-release check started');
    try {
      await processRepaidLoans(storage);
    } catch (error) {
      console.error('[Cron] Auto-release failed:', error);
    }
  }, 5 * 60 * 1000);
  
  // Also run immediately
  processRepaidLoans(storage).catch(console.error);
}

export function stopAutoReleaseCron(): void {
  if (cronInterval) {
    clearInterval(cronInterval);
    cronInterval = null;
    console.log('[AutoRelease] Cron stopped');
  }
}
