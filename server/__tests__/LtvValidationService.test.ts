import { LtvValidationService } from '../services/LtvValidationService';

describe('LtvValidationService', () => {
  let ltvValidator: LtvValidationService;

  beforeEach(() => {
    ltvValidator = new LtvValidationService();
  });

  describe('validateLoanRequest', () => {
    const btcPrice = 67000; // $67,000 per BTC

    it('should validate a valid loan request within LTV limits', () => {
      const collateralBtc = 1.0; // 1 BTC = $67,000
      const loanAmount = 30000; // $30,000 loan = 44.8% LTV
      
      const result = ltvValidator.validateLoanRequest(collateralBtc, loanAmount, btcPrice);
      
      expect(result.isValid).toBe(true);
      expect(result.ltvRatio).toBeCloseTo(0.448, 3);
      expect(result.maxAllowedLtv).toBe(0.6);
    });

    it('should reject loan request exceeding maximum LTV', () => {
      const collateralBtc = 1.0; // 1 BTC = $67,000
      const loanAmount = 50000; // $50,000 loan = 74.6% LTV (exceeds 60% max)
      
      const result = ltvValidator.validateLoanRequest(collateralBtc, loanAmount, btcPrice);
      
      expect(result.isValid).toBe(false);
      expect(result.ltvRatio).toBeCloseTo(0.746, 3);
      expect(result.errorMessage).toContain('LTV ratio 74.6% exceeds maximum 60%');
      expect(result.requiredCollateral).toBeCloseTo(1.244, 3);
    });

    it('should reject loan request below minimum LTV', () => {
      const collateralBtc = 1.0; // 1 BTC = $67,000
      const loanAmount = 3000; // $3,000 loan = 4.5% LTV (below 10% min)
      
      const result = ltvValidator.validateLoanRequest(collateralBtc, loanAmount, btcPrice);
      
      expect(result.isValid).toBe(false);
      expect(result.ltvRatio).toBeCloseTo(0.045, 3);
      expect(result.errorMessage).toContain('LTV ratio 4.5% is below minimum 10%');
      expect(result.maxLoanAmount).toBeCloseTo(40200, 2);
    });

    it('should reject invalid collateral amount', () => {
      const result = ltvValidator.validateLoanRequest(0, 10000, btcPrice);
      
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe('Collateral amount must be greater than 0');
    });

    it('should reject invalid loan amount', () => {
      const result = ltvValidator.validateLoanRequest(1.0, 0, btcPrice);
      
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe('Loan amount must be greater than 0');
    });

    it('should reject invalid Bitcoin price', () => {
      const result = ltvValidator.validateLoanRequest(1.0, 10000, 0);
      
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe('Invalid Bitcoin price');
    });
  });

  describe('calculateRequiredCollateral', () => {
    it('should calculate correct required collateral', () => {
      const loanAmount = 30000;
      const btcPrice = 67000;
      
      const requiredCollateral = ltvValidator.calculateRequiredCollateral(loanAmount, btcPrice);
      
      // $30,000 / ($67,000 * 0.6) = 0.746 BTC
      expect(requiredCollateral).toBeCloseTo(0.746, 3);
    });
  });

  describe('calculateMaxLoanAmount', () => {
    it('should calculate correct maximum loan amount', () => {
      const collateralBtc = 1.0;
      const btcPrice = 67000;
      
      const maxLoanAmount = ltvValidator.calculateMaxLoanAmount(collateralBtc, btcPrice);
      
      // 1.0 BTC * $67,000 * 0.6 = $40,200
      expect(maxLoanAmount).toBeCloseTo(40200, 2);
    });
  });
});