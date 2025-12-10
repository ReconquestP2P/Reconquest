/**
 * Deterministic Outcome Engine
 * 
 * Pure function that maps loan facts → LoanOutcome
 * The platform NEVER "chooses a side" - outcomes are determined by hard-coded rules
 * based on objective evidence: due dates, payment confirmation, collateral prices
 */

import type { Loan, LoanOutcome, DisputeEvidence } from '@shared/schema';

export interface OutcomeDecision {
  outcome: LoanOutcome;
  ruleFired: string;
  txTypeToUse: 'repayment' | 'default' | 'liquidation' | 'cancellation' | 'recovery' | null;
  reasoning: string;
}

/**
 * Deterministic outcome decision function
 * 
 * RULES (in priority order):
 * 1. If lender never funded the loan → CANCELLATION
 * 2. If collateral price dropped below liquidation threshold → LIQUIDATION
 * 3. If past due date AND lender not paid → DEFAULT
 * 4. If lender confirmed payment received → COOPERATIVE_CLOSE
 * 5. Otherwise → UNDER_REVIEW (insufficient evidence)
 * 
 * @param loan - The loan record
 * @param evidence - Objective evidence about the loan state
 * @param now - Current timestamp (injected for testability)
 * @returns OutcomeDecision with outcome, rule, and transaction type
 */
export function decideLoanOutcome(
  loan: Loan,
  evidence: DisputeEvidence,
  now: Date = new Date()
): OutcomeDecision {
  
  // RULE 1: Lender never funded the loan → CANCELLATION
  // If the loan was never funded, borrower can reclaim any collateral deposited
  if (!evidence.lenderFunded) {
    return {
      outcome: 'CANCELLATION',
      ruleFired: 'RULE_1_LENDER_NEVER_FUNDED',
      txTypeToUse: 'cancellation',
      reasoning: 'Lender never funded the loan. Borrower collateral (if any) should be returned.',
    };
  }

  // RULE 2: Price below liquidation threshold → LIQUIDATION
  // If BTC price has dropped below the liquidation threshold, trigger liquidation
  const collateralValueUsd = evidence.collateralBtc * evidence.currentBtcPriceUsd;
  if (collateralValueUsd < evidence.liquidationThresholdUsd) {
    return {
      outcome: 'LIQUIDATION',
      ruleFired: 'RULE_2_PRICE_BELOW_LIQUIDATION',
      txTypeToUse: 'liquidation',
      reasoning: `Collateral value ($${collateralValueUsd.toFixed(2)}) dropped below liquidation threshold ($${evidence.liquidationThresholdUsd.toFixed(2)}). Liquidating to protect lender.`,
    };
  }

  // RULE 3: Past due date AND lender not paid → DEFAULT
  // If the loan is overdue and borrower hasn't paid, trigger default
  if (evidence.dueDate && now > evidence.dueDate && !evidence.lenderConfirmedPaid) {
    const daysOverdue = Math.floor((now.getTime() - evidence.dueDate.getTime()) / (1000 * 60 * 60 * 24));
    return {
      outcome: 'DEFAULT',
      ruleFired: 'RULE_3_PAST_DUE_UNPAID',
      txTypeToUse: 'default',
      reasoning: `Loan is ${daysOverdue} days overdue and lender has not confirmed payment. Collateral transferred to lender.`,
    };
  }

  // RULE 4: Lender confirmed payment received → COOPERATIVE_CLOSE
  // Normal successful loan completion
  if (evidence.lenderConfirmedPaid) {
    return {
      outcome: 'COOPERATIVE_CLOSE',
      ruleFired: 'RULE_4_LENDER_CONFIRMED_PAID',
      txTypeToUse: 'repayment',
      reasoning: 'Lender confirmed receipt of loan repayment. Collateral returned to borrower.',
    };
  }

  // RULE 5: Borrower confirmed they repaid but lender hasn't confirmed yet
  // Still under review - need lender confirmation
  if (evidence.borrowerConfirmedReceipt && !evidence.lenderConfirmedPaid) {
    // Check if we're past due date - if so, need to investigate
    if (evidence.dueDate && now > evidence.dueDate) {
      // Past due but borrower claims paid - needs manual review
      return {
        outcome: 'UNDER_REVIEW',
        ruleFired: 'RULE_5_DISPUTED_PAYMENT_CLAIM',
        txTypeToUse: null, // No transaction for UNDER_REVIEW - dispute remains pending
        reasoning: 'Borrower claims payment was made but lender has not confirmed. Past due date - requires investigation.',
      };
    }
  }

  // DEFAULT: Insufficient evidence to decide
  return {
    outcome: 'UNDER_REVIEW',
    ruleFired: 'RULE_0_INSUFFICIENT_EVIDENCE',
    txTypeToUse: null, // No transaction for UNDER_REVIEW - dispute remains pending
    reasoning: 'Loan is not yet due and no clear resolution criteria met. Keeping under review.',
  };
}

/**
 * Map outcome to the corresponding pre-signed transaction hex field
 * Returns null for UNDER_REVIEW outcomes (txType === null)
 */
export function getTransactionHexForOutcome(
  loan: Loan,
  txType: OutcomeDecision['txTypeToUse']
): string | null {
  if (txType === null) {
    return null; // No transaction for UNDER_REVIEW - dispute remains pending
  }
  
  switch (txType) {
    case 'repayment':
      return loan.txRepaymentHex;
    case 'default':
      return loan.txDefaultHex;
    case 'liquidation':
      return loan.txLiquidationHex;
    case 'cancellation':
      return loan.txCancellationHex;
    case 'recovery':
      return loan.txRecoveryHex;
    default:
      return null;
  }
}

/**
 * Build evidence from loan and external data
 */
export function buildEvidenceFromLoan(
  loan: Loan,
  currentBtcPriceUsd: number
): DisputeEvidence {
  // Calculate liquidation threshold (typically 110% of loan amount for safety)
  // This is a simplified calculation - in production would be more sophisticated
  const loanAmountUsd = parseFloat(loan.amount);
  const liquidationThresholdUsd = loanAmountUsd * 1.1; // 110% of loan amount
  
  return {
    lenderFunded: loan.lenderId !== null && loan.fundedAt !== null,
    lenderConfirmedPaid: loan.fiatTransferConfirmed === true,
    borrowerConfirmedReceipt: loan.borrowerConfirmedReceipt === true,
    currentBtcPriceUsd,
    liquidationThresholdUsd,
    collateralBtc: parseFloat(loan.collateralBtc),
    dueDate: loan.dueDate,
    loanStatus: loan.status,
    escrowState: loan.escrowState,
  };
}
