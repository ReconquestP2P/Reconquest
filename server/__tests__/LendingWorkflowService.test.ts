import { LendingWorkflowService } from '../services/LendingWorkflowService';
import { BitcoinEscrowService } from '../services/BitcoinEscrowService';
import { LtvValidationService } from '../services/LtvValidationService';
import { IStorage } from '../storage';
import { Loan, User } from '@shared/schema';

// Mock implementations
class MockStorage implements IStorage {
  private loans: Map<number, Loan> = new Map();
  private users: Map<number, User> = new Map();
  private currentLoanId = 1;
  private currentUserId = 1;

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(u => u.username === username);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(u => u.email === email);
  }

  async createUser(user: any): Promise<User> {
    const newUser: User = {
      id: this.currentUserId++,
      username: user.username,
      email: user.email,
      password: user.password,
      role: user.role || 'borrower',
      reputation: 0,
      completedLoans: 0,
      createdAt: new Date()
    };
    this.users.set(newUser.id, newUser);
    return newUser;
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async getLoan(id: number): Promise<Loan | undefined> {
    return this.loans.get(id);
  }

  async getUserLoans(userId: number): Promise<Loan[]> {
    return Array.from(this.loans.values()).filter(l => l.borrowerId === userId);
  }

  async createLoan(loanData: any): Promise<Loan> {
    const newLoan: Loan = {
      id: this.currentLoanId++,
      borrowerId: loanData.borrowerId,
      lenderId: loanData.lenderId || null,
      amount: loanData.amount,
      currency: loanData.currency,
      interestRate: loanData.interestRate,
      termMonths: loanData.termMonths,
      collateralBtc: loanData.collateralBtc,
      ltvRatio: loanData.ltvRatio,
      purpose: loanData.purpose,
      status: 'pending',
      requestedAt: new Date(),
      fundedAt: null,
      dueDate: null,
      repaidAt: null,
      escrowAddress: loanData.escrowAddress,
      escrowTxHash: null,
      fiatTransferConfirmed: false,
      borrowerConfirmedReceipt: false,
      loanStartedAt: null
    };
    this.loans.set(newLoan.id, newLoan);
    return newLoan;
  }

  async updateLoan(id: number, updates: Partial<Loan>): Promise<Loan | undefined> {
    const loan = this.loans.get(id);
    if (!loan) return undefined;
    
    const updatedLoan = { ...loan, ...updates };
    this.loans.set(id, updatedLoan);
    return updatedLoan;
  }

  async getAllLoans(): Promise<Loan[]> {
    return Array.from(this.loans.values());
  }

  async getAvailableLoans(): Promise<Loan[]> {
    return Array.from(this.loans.values()).filter(l => l.status === 'pending');
  }

  async createLoanOffer(): Promise<any> { return {}; }
  async getLoanOffers(): Promise<any[]> { return []; }
  async getUserOffers(): Promise<any[]> { return []; }
  async createSignup(): Promise<any> { return {}; }
  async getAllSignups(): Promise<any[]> { return []; }
}

// Mock email service
jest.mock('../email', () => ({
  sendEmail: jest.fn().mockResolvedValue(true)
}));

describe('LendingWorkflowService', () => {
  let lendingService: LendingWorkflowService;
  let mockStorage: MockStorage;
  let mockBitcoinEscrow: BitcoinEscrowService;
  let mockLtvValidator: LtvValidationService;
  let mockGetBtcPrice: jest.Mock;

  beforeEach(() => {
    mockStorage = new MockStorage();
    mockBitcoinEscrow = new BitcoinEscrowService();
    mockLtvValidator = new LtvValidationService();
    mockGetBtcPrice = jest.fn().mockResolvedValue(67000);

    lendingService = new LendingWorkflowService(
      mockStorage,
      mockBitcoinEscrow,
      mockLtvValidator,
      mockGetBtcPrice
    );
  });

  describe('initiateLoan', () => {
    it('should successfully initiate a valid loan', async () => {
      const borrowerId = 1;
      const collateralBtc = 1.0;
      const loanAmount = 30000;

      const result = await lendingService.initiateLoan(borrowerId, collateralBtc, loanAmount);

      expect(result.success).toBe(true);
      expect(result.loanId).toBeDefined();
      expect(result.escrowAddress).toBeDefined();
      expect(result.ltvValidation.isValid).toBe(true);
      expect(result.ltvValidation.ltvRatio).toBeCloseTo(0.448, 3);
    });

    it('should reject loan with invalid LTV ratio', async () => {
      const borrowerId = 1;
      const collateralBtc = 1.0;
      const loanAmount = 50000; // Too high LTV

      const result = await lendingService.initiateLoan(borrowerId, collateralBtc, loanAmount);

      expect(result.success).toBe(false);
      expect(result.ltvValidation.isValid).toBe(false);
      expect(result.errorMessage).toContain('LTV ratio');
    });

    it('should handle Bitcoin price fetch errors', async () => {
      mockGetBtcPrice.mockRejectedValue(new Error('Price API error'));

      const result = await lendingService.initiateLoan(1, 1.0, 30000);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('Failed to initiate loan request');
    });
  });

  describe('processEscrowDeposit', () => {
    it('should successfully process escrow deposit', async () => {
      // First create a loan
      const loan = await mockStorage.createLoan({
        borrowerId: 1,
        amount: '30000',
        currency: 'USDC',
        interestRate: '12.00',
        termMonths: 12,
        collateralBtc: '1.0',
        ltvRatio: '0.448',
        purpose: 'Test loan',
        escrowAddress: 'tb1qtest123'
      });

      const result = await lendingService.processEscrowDeposit(loan.id);

      expect(result.success).toBe(true);
      expect(result.txHash).toBeDefined();
      expect(result.transactionUrl).toContain('blockstream.info/testnet/tx/');

      // Verify loan status updated
      const updatedLoan = await mockStorage.getLoan(loan.id);
      expect(updatedLoan?.status).toBe('escrow_pending');
      expect(updatedLoan?.escrowTxHash).toBeDefined();
    });

    it('should fail when loan not found', async () => {
      const result = await lendingService.processEscrowDeposit(999);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('Loan or escrow address not found');
    });
  });

  describe('confirmFiatTransfer', () => {
    it('should successfully confirm fiat transfer', async () => {
      // Create borrower and loan
      const borrower = await mockStorage.createUser({
        username: 'testborrower',
        email: 'borrower@test.com',
        password: 'password123'
      });

      const loan = await mockStorage.createLoan({
        borrowerId: borrower.id,
        amount: '30000',
        currency: 'USDC',
        interestRate: '12.00',
        termMonths: 12,
        collateralBtc: '1.0',
        ltvRatio: '0.448',
        purpose: 'Test loan',
        escrowAddress: 'tb1qtest123'
      });

      const lenderId = 2;
      await lendingService.confirmFiatTransfer(loan.id, lenderId);

      const updatedLoan = await mockStorage.getLoan(loan.id);
      expect(updatedLoan?.lenderId).toBe(lenderId);
      expect(updatedLoan?.fiatTransferConfirmed).toBe(true);
      expect(updatedLoan?.fundedAt).toBeDefined();
    });
  });

  describe('confirmBorrowerReceipt', () => {
    it('should successfully confirm borrower receipt and start countdown', async () => {
      // Create loan
      const loan = await mockStorage.createLoan({
        borrowerId: 1,
        amount: '30000',
        currency: 'USDC',
        interestRate: '12.00',
        termMonths: 12,
        collateralBtc: '1.0',
        ltvRatio: '0.448',
        purpose: 'Test loan',
        escrowAddress: 'tb1qtest123'
      });

      await lendingService.confirmBorrowerReceipt(loan.id);

      const updatedLoan = await mockStorage.getLoan(loan.id);
      expect(updatedLoan?.borrowerConfirmedReceipt).toBe(true);
      expect(updatedLoan?.status).toBe('active');
      expect(updatedLoan?.loanStartedAt).toBeDefined();
      expect(updatedLoan?.dueDate).toBeDefined();
    });
  });

  describe('startLoanCountdown', () => {
    it('should activate loan with proper due date', async () => {
      const loan = await mockStorage.createLoan({
        borrowerId: 1,
        amount: '30000',
        currency: 'USDC',
        interestRate: '12.00',
        termMonths: 12,
        collateralBtc: '1.0',
        ltvRatio: '0.448',
        purpose: 'Test loan',
        escrowAddress: 'tb1qtest123'
      });

      await lendingService.startLoanCountdown(loan.id);

      const updatedLoan = await mockStorage.getLoan(loan.id);
      expect(updatedLoan?.status).toBe('active');
      expect(updatedLoan?.loanStartedAt).toBeDefined();
      expect(updatedLoan?.dueDate).toBeDefined();

      // Due date should be approximately 1 year from now
      const oneYearFromNow = new Date(Date.now() + (365 * 24 * 60 * 60 * 1000));
      const dueDate = updatedLoan?.dueDate;
      expect(dueDate).toBeDefined();
      if (dueDate) {
        const timeDiff = Math.abs(dueDate.getTime() - oneYearFromNow.getTime());
        expect(timeDiff).toBeLessThan(60000); // Within 1 minute
      }
    });
  });

  describe('complete workflow integration', () => {
    it('should complete the entire lending workflow', async () => {
      // Create borrower and lender
      const borrower = await mockStorage.createUser({
        username: 'testborrower',
        email: 'borrower@test.com',
        password: 'password123'
      });

      const lender = await mockStorage.createUser({
        username: 'testlender',
        email: 'lender@test.com',
        password: 'password123',
        role: 'lender'
      });

      // Step 1: Initiate loan
      const initiationResult = await lendingService.initiateLoan(borrower.id, 1.0, 30000);
      expect(initiationResult.success).toBe(true);
      const loanId = initiationResult.loanId!;

      // Step 2: Process escrow deposit
      const escrowResult = await lendingService.processEscrowDeposit(loanId);
      expect(escrowResult.success).toBe(true);

      // Step 3: Confirm fiat transfer
      await lendingService.confirmFiatTransfer(loanId, lender.id);

      // Step 4: Confirm borrower receipt
      await lendingService.confirmBorrowerReceipt(loanId);

      // Verify final loan state
      const finalLoan = await mockStorage.getLoan(loanId);
      expect(finalLoan?.status).toBe('active');
      expect(finalLoan?.lenderId).toBe(lender.id);
      expect(finalLoan?.fiatTransferConfirmed).toBe(true);
      expect(finalLoan?.borrowerConfirmedReceipt).toBe(true);
      expect(finalLoan?.loanStartedAt).toBeDefined();
      expect(finalLoan?.dueDate).toBeDefined();
      expect(finalLoan?.escrowTxHash).toBeDefined();
    });
  });
});