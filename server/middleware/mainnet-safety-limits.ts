import { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import { getCurrentNetwork } from '../services/bitcoin-network-selector';
import { Loan } from '@shared/schema';

interface SafetyLimits {
  maxLoanAmountUsd: number;
  maxBtcCollateral: number;
  maxLoansPerDay: number;
  maxTotalActiveBtc: number;
}

function getSafetyLimits(): SafetyLimits {
  return {
    maxLoanAmountUsd: parseFloat(process.env.MAX_LOAN_AMOUNT_USD || '10000'),
    maxBtcCollateral: parseFloat(process.env.MAX_BTC_COLLATERAL || '0.2'),
    maxLoansPerDay: parseInt(process.env.MAX_LOANS_PER_DAY || '10', 10),
    maxTotalActiveBtc: parseFloat(process.env.MAX_TOTAL_ACTIVE_BTC || '2.0'),
  };
}

function isOverrideEnabled(): boolean {
  const override = process.env.OVERRIDE_SAFETY_LIMITS;
  return override === 'true' || override === '1';
}

function logSafetyEvent(event: string, details: Record<string, any>) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    type: 'MAINNET_SAFETY',
    event,
    network: getCurrentNetwork(),
    ...details
  }));
}

export async function mainnetLoanCreationLimits(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const network = getCurrentNetwork();
  
  if (network !== 'mainnet') {
    return next();
  }

  if (isOverrideEnabled()) {
    logSafetyEvent('OVERRIDE_ACTIVE', {
      warning: 'Safety limits bypassed via OVERRIDE_SAFETY_LIMITS',
      route: 'loan_creation',
      requestBody: { ...req.body, password: undefined }
    });
    return next();
  }

  const limits = getSafetyLimits();
  const { loanAmountUsd, collateralBtc } = req.body;

  if (loanAmountUsd && loanAmountUsd > limits.maxLoanAmountUsd) {
    logSafetyEvent('LIMIT_EXCEEDED', {
      limit: 'maxLoanAmountUsd',
      requested: loanAmountUsd,
      maximum: limits.maxLoanAmountUsd
    });
    
    return res.status(400).json({
      error: 'Loan amount exceeds safety limit',
      message: `For platform safety during initial mainnet launch, we have temporary limits: Maximum loan $${limits.maxLoanAmountUsd.toLocaleString()}. Contact support for larger amounts.`,
      code: 'MAINNET_SAFETY_LIMIT',
      details: {
        requested: loanAmountUsd,
        maximum: limits.maxLoanAmountUsd,
        unit: 'USD'
      }
    });
  }

  if (collateralBtc && collateralBtc > limits.maxBtcCollateral) {
    logSafetyEvent('LIMIT_EXCEEDED', {
      limit: 'maxBtcCollateral',
      requested: collateralBtc,
      maximum: limits.maxBtcCollateral
    });
    
    return res.status(400).json({
      error: 'Collateral amount exceeds safety limit',
      message: `For platform safety during initial mainnet launch, we have temporary limits: Maximum collateral ${limits.maxBtcCollateral} BTC. Contact support for larger amounts.`,
      code: 'MAINNET_SAFETY_LIMIT',
      details: {
        requested: collateralBtc,
        maximum: limits.maxBtcCollateral,
        unit: 'BTC'
      }
    });
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const allLoans: Loan[] = await storage.getAllLoans();
    const loansToday = allLoans.filter((loan: Loan) => {
      if (!loan.requestedAt) return false;
      const loanDate = new Date(loan.requestedAt);
      loanDate.setHours(0, 0, 0, 0);
      return loanDate.getTime() === today.getTime();
    });

    if (loansToday.length >= limits.maxLoansPerDay) {
      logSafetyEvent('LIMIT_EXCEEDED', {
        limit: 'maxLoansPerDay',
        currentCount: loansToday.length,
        maximum: limits.maxLoansPerDay
      });
      
      return res.status(400).json({
        error: 'Daily loan limit reached',
        message: `For platform safety during initial mainnet launch, we limit new loans to ${limits.maxLoansPerDay} per day. Please try again tomorrow or contact support.`,
        code: 'MAINNET_SAFETY_LIMIT',
        details: {
          loansToday: loansToday.length,
          maximum: limits.maxLoansPerDay
        }
      });
    }

    const activeLoans = allLoans.filter((loan: Loan) => 
      loan.status === 'active' || 
      loan.status === 'funded' || 
      loan.status === 'pending_deposit'
    );
    
    const totalActiveBtc = activeLoans.reduce((sum: number, loan: Loan) => {
      return sum + (parseFloat(loan.collateralBtc?.toString() || '0'));
    }, 0);

    const newTotalBtc = totalActiveBtc + (collateralBtc || 0);
    
    if (newTotalBtc > limits.maxTotalActiveBtc) {
      logSafetyEvent('LIMIT_EXCEEDED', {
        limit: 'maxTotalActiveBtc',
        currentTotal: totalActiveBtc,
        requested: collateralBtc,
        newTotal: newTotalBtc,
        maximum: limits.maxTotalActiveBtc
      });
      
      return res.status(400).json({
        error: 'Platform BTC capacity reached',
        message: `For platform safety during initial mainnet launch, we limit total active BTC in escrow to ${limits.maxTotalActiveBtc} BTC. Please try again later or contact support.`,
        code: 'MAINNET_SAFETY_LIMIT',
        details: {
          currentTotalBtc: totalActiveBtc,
          requestedBtc: collateralBtc,
          maximum: limits.maxTotalActiveBtc
        }
      });
    }

  } catch (error) {
    logSafetyEvent('CHECK_ERROR', {
      error: error instanceof Error ? error.message : 'Unknown error',
      route: 'loan_creation'
    });
  }

  next();
}

export async function mainnetLoanFundingLimits(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const network = getCurrentNetwork();
  
  if (network !== 'mainnet') {
    return next();
  }

  if (isOverrideEnabled()) {
    logSafetyEvent('OVERRIDE_ACTIVE', {
      warning: 'Safety limits bypassed via OVERRIDE_SAFETY_LIMITS',
      route: 'loan_funding',
      loanId: req.params.id
    });
    return next();
  }

  const limits = getSafetyLimits();
  const loanId = parseInt(req.params.id, 10);

  try {
    const loan = await storage.getLoan(loanId);
    
    if (!loan) {
      return next();
    }

    const loanAmountUsd = parseFloat(loan.amount?.toString() || '0');
    const collateralBtc = parseFloat(loan.collateralBtc?.toString() || '0');

    if (loanAmountUsd > limits.maxLoanAmountUsd) {
      logSafetyEvent('FUNDING_BLOCKED', {
        limit: 'maxLoanAmountUsd',
        loanId,
        loanAmount: loanAmountUsd,
        maximum: limits.maxLoanAmountUsd
      });
      
      return res.status(400).json({
        error: 'Loan amount exceeds funding safety limit',
        message: `This loan ($${loanAmountUsd.toLocaleString()}) exceeds our initial mainnet limit of $${limits.maxLoanAmountUsd.toLocaleString()}. Contact support for assistance.`,
        code: 'MAINNET_SAFETY_LIMIT'
      });
    }

    if (collateralBtc > limits.maxBtcCollateral) {
      logSafetyEvent('FUNDING_BLOCKED', {
        limit: 'maxBtcCollateral',
        loanId,
        collateral: collateralBtc,
        maximum: limits.maxBtcCollateral
      });
      
      return res.status(400).json({
        error: 'Collateral amount exceeds funding safety limit',
        message: `This loan's collateral (${collateralBtc} BTC) exceeds our initial mainnet limit of ${limits.maxBtcCollateral} BTC. Contact support for assistance.`,
        code: 'MAINNET_SAFETY_LIMIT'
      });
    }

  } catch (error) {
    logSafetyEvent('CHECK_ERROR', {
      error: error instanceof Error ? error.message : 'Unknown error',
      route: 'loan_funding',
      loanId
    });
  }

  next();
}

export function getMainnetSafetyStatus() {
  const network = getCurrentNetwork();
  const limits = getSafetyLimits();
  const overrideEnabled = isOverrideEnabled();

  return {
    network,
    limitsActive: network === 'mainnet' && !overrideEnabled,
    overrideEnabled,
    limits: network === 'mainnet' ? limits : null,
    message: network === 'mainnet' 
      ? (overrideEnabled 
          ? 'WARNING: Safety limits are bypassed via override' 
          : 'Mainnet safety limits active')
      : 'Testnet mode - no limits applied'
  };
}
