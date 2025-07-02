export interface ILtvValidationService {
  validateLoanRequest(collateralBtc: number, loanAmount: number, btcPrice: number): LtvValidationResult;
  calculateRequiredCollateral(loanAmount: number, btcPrice: number): number;
  calculateMaxLoanAmount(collateralBtc: number, btcPrice: number): number;
}

export interface LtvValidationResult {
  isValid: boolean;
  ltvRatio: number;
  maxAllowedLtv: number;
  requiredCollateral?: number;
  maxLoanAmount?: number;
  errorMessage?: string;
}

/**
 * Loan-to-Value (LTV) Validation Service
 * Implements business rules for Bitcoin collateral requirements
 * Follows Single Responsibility Principle - only handles LTV calculations
 */
export class LtvValidationService implements ILtvValidationService {
  private readonly MAX_LTV_RATIO = 0.6; // 60% maximum LTV
  private readonly MIN_LTV_RATIO = 0.1; // 10% minimum LTV

  /**
   * Validates a loan request against LTV requirements
   */
  validateLoanRequest(collateralBtc: number, loanAmount: number, btcPrice: number): LtvValidationResult {
    // Input validation
    if (collateralBtc <= 0) {
      return {
        isValid: false,
        ltvRatio: 0,
        maxAllowedLtv: this.MAX_LTV_RATIO,
        errorMessage: 'Collateral amount must be greater than 0'
      };
    }

    if (loanAmount <= 0) {
      return {
        isValid: false,
        ltvRatio: 0,
        maxAllowedLtv: this.MAX_LTV_RATIO,
        errorMessage: 'Loan amount must be greater than 0'
      };
    }

    if (btcPrice <= 0) {
      return {
        isValid: false,
        ltvRatio: 0,
        maxAllowedLtv: this.MAX_LTV_RATIO,
        errorMessage: 'Invalid Bitcoin price'
      };
    }

    // Calculate collateral value in USD
    const collateralValue = collateralBtc * btcPrice;
    
    // Calculate LTV ratio
    const ltvRatio = loanAmount / collateralValue;

    // Validate against limits
    if (ltvRatio > this.MAX_LTV_RATIO) {
      const requiredCollateral = this.calculateRequiredCollateral(loanAmount, btcPrice);
      return {
        isValid: false,
        ltvRatio,
        maxAllowedLtv: this.MAX_LTV_RATIO,
        requiredCollateral,
        errorMessage: `LTV ratio ${(ltvRatio * 100).toFixed(1)}% exceeds maximum ${(this.MAX_LTV_RATIO * 100)}%. Required collateral: ${requiredCollateral.toFixed(8)} BTC`
      };
    }

    if (ltvRatio < this.MIN_LTV_RATIO) {
      const maxLoanAmount = this.calculateMaxLoanAmount(collateralBtc, btcPrice);
      return {
        isValid: false,
        ltvRatio,
        maxAllowedLtv: this.MAX_LTV_RATIO,
        maxLoanAmount,
        errorMessage: `LTV ratio ${(ltvRatio * 100).toFixed(1)}% is below minimum ${(this.MIN_LTV_RATIO * 100)}%. Maximum loan amount: $${maxLoanAmount.toFixed(2)}`
      };
    }

    // Valid loan request
    return {
      isValid: true,
      ltvRatio,
      maxAllowedLtv: this.MAX_LTV_RATIO
    };
  }

  /**
   * Calculates the minimum required collateral for a given loan amount
   */
  calculateRequiredCollateral(loanAmount: number, btcPrice: number): number {
    return loanAmount / (btcPrice * this.MAX_LTV_RATIO);
  }

  /**
   * Calculates the maximum loan amount for given collateral
   */
  calculateMaxLoanAmount(collateralBtc: number, btcPrice: number): number {
    const collateralValue = collateralBtc * btcPrice;
    return collateralValue * this.MAX_LTV_RATIO;
  }
}