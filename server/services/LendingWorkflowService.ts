import { IBitcoinEscrowService } from './BitcoinEscrowService';
import { ILtvValidationService, LtvValidationResult } from './LtvValidationService';
import { IStorage } from '../storage';
import { Loan } from '@shared/schema';
import { sendEmail } from '../email';

export interface ILendingWorkflowService {
  initiateLoan(borrowerId: number, collateralBtc: number, loanAmount: number): Promise<LoanInitiationResult>;
  processEscrowDeposit(loanId: number): Promise<EscrowProcessResult>;
  confirmFiatTransfer(loanId: number, lenderId: number): Promise<void>;
  confirmBorrowerReceipt(loanId: number): Promise<void>;
  startLoanCountdown(loanId: number): Promise<void>;
}

export interface LoanInitiationResult {
  success: boolean;
  loanId?: number;
  escrowAddress?: string;
  ltvValidation: LtvValidationResult;
  errorMessage?: string;
}

export interface EscrowProcessResult {
  success: boolean;
  txHash?: string;
  transactionUrl?: string;
  errorMessage?: string;
}

/**
 * Lending Workflow Service - Orchestrates the complete Bitcoin-backed lending process
 * Follows SOLID principles:
 * - Single Responsibility: Manages lending workflow coordination
 * - Open/Closed: Extensible for new workflow steps
 * - Liskov Substitution: Uses interfaces for all dependencies
 * - Interface Segregation: Small, focused interfaces
 * - Dependency Inversion: Depends on abstractions, not concretions
 */
export class LendingWorkflowService implements ILendingWorkflowService {
  constructor(
    private readonly storage: IStorage,
    private readonly bitcoinEscrow: IBitcoinEscrowService,
    private readonly ltvValidator: ILtvValidationService,
    private readonly getCurrentBtcPrice: () => Promise<number>
  ) {}

  /**
   * Step 1: Initiate a new loan request with LTV validation
   */
  async initiateLoan(borrowerId: number, collateralBtc: number, loanAmount: number): Promise<LoanInitiationResult> {
    try {
      // Get current Bitcoin price
      const btcPrice = await this.getCurrentBtcPrice();
      
      // Validate LTV ratio
      const ltvValidation = this.ltvValidator.validateLoanRequest(collateralBtc, loanAmount, btcPrice);
      
      if (!ltvValidation.isValid) {
        return {
          success: false,
          ltvValidation,
          errorMessage: ltvValidation.errorMessage
        };
      }

      // Generate escrow address
      const escrowAddress = await this.bitcoinEscrow.generateEscrowAddress();

      // Create loan record
      const loan = await this.storage.createLoan({
        borrowerId,
        amount: loanAmount.toString(),
        currency: 'USDC',
        interestRate: '12.00', // Default interest rate for POC
        termMonths: 12, // Default term for POC
        collateralBtc: collateralBtc.toString(),
        ltvRatio: ltvValidation.ltvRatio.toString(),
        purpose: 'Bitcoin-backed loan',
        escrowAddress,
        fiatTransferConfirmed: false,
        borrowerConfirmedReceipt: false
      });

      console.log(`Loan ${loan.id} initiated for borrower ${borrowerId}`);
      console.log(`Escrow address: ${escrowAddress}`);
      console.log(`LTV ratio: ${(ltvValidation.ltvRatio * 100).toFixed(1)}%`);

      return {
        success: true,
        loanId: loan.id,
        escrowAddress,
        ltvValidation
      };

    } catch (error) {
      console.error('Error initiating loan:', error);
      return {
        success: false,
        ltvValidation: { isValid: false, ltvRatio: 0, maxAllowedLtv: 0.6 },
        errorMessage: 'Failed to initiate loan request'
      };
    }
  }

  /**
   * Step 2: Process Bitcoin deposit to escrow and notify lender
   */
  async processEscrowDeposit(loanId: number): Promise<EscrowProcessResult> {
    try {
      const loan = await this.storage.getLoan(loanId);
      if (!loan || !loan.escrowAddress) {
        return {
          success: false,
          errorMessage: 'Loan or escrow address not found'
        };
      }

      // Verify Bitcoin transaction
      const collateralBtc = parseFloat(loan.collateralBtc);
      const verification = await this.bitcoinEscrow.verifyTransaction(loan.escrowAddress, collateralBtc);

      if (!verification.verified || !verification.txHash) {
        return {
          success: false,
          errorMessage: 'Bitcoin transaction verification failed'
        };
      }

      // Update loan status
      await this.storage.updateLoan(loanId, {
        status: 'escrow_pending',
        escrowTxHash: verification.txHash
      });

      // Get transaction URL
      const transactionUrl = this.bitcoinEscrow.getTransactionUrl(verification.txHash);

      // Notify potential lenders
      await this.notifyLendersOfEscrow(loan, verification.txHash, transactionUrl);

      console.log(`Escrow processed for loan ${loanId}, TxHash: ${verification.txHash}`);

      return {
        success: true,
        txHash: verification.txHash,
        transactionUrl
      };

    } catch (error) {
      console.error('Error processing escrow deposit:', error);
      return {
        success: false,
        errorMessage: 'Failed to process escrow deposit'
      };
    }
  }

  /**
   * Step 3: Lender confirms fiat transfer to borrower
   */
  async confirmFiatTransfer(loanId: number, lenderId: number): Promise<void> {
    const loan = await this.storage.updateLoan(loanId, {
      lenderId,
      fiatTransferConfirmed: true,
      fundedAt: new Date()
    });

    if (loan) {
      await this.notifyBorrowerOfFiatTransfer(loan);
      console.log(`Fiat transfer confirmed for loan ${loanId} by lender ${lenderId}`);
    }
  }

  /**
   * Step 4: Borrower confirms receipt of fiat payment
   */
  async confirmBorrowerReceipt(loanId: number): Promise<void> {
    await this.storage.updateLoan(loanId, {
      borrowerConfirmedReceipt: true
    });

    console.log(`Borrower confirmed receipt for loan ${loanId}`);
    
    // Start loan countdown
    await this.startLoanCountdown(loanId);
  }

  /**
   * Step 5: Start the loan countdown timer
   */
  async startLoanCountdown(loanId: number): Promise<void> {
    const loan = await this.storage.updateLoan(loanId, {
      status: 'active',
      loanStartedAt: new Date(),
      dueDate: new Date(Date.now() + (365 * 24 * 60 * 60 * 1000)) // 1 year from now
    });

    if (loan) {
      await this.notifyLoanActivation(loan);
      console.log(`Loan ${loanId} is now active with countdown started`);
    }
  }

  /**
   * Email notification for lenders when escrow is confirmed
   */
  private async notifyLendersOfEscrow(loan: Loan, txHash: string, transactionUrl: string): Promise<void> {
    const emailHtml = `
      <h2>New Loan Available for Funding</h2>
      <p>A borrower has deposited ${loan.collateralBtc} BTC as collateral for a $${loan.amount} loan.</p>
      <p><strong>Transaction Hash:</strong> ${txHash}</p>
      <p><strong>View Transaction:</strong> <a href="${transactionUrl}">Testnet Explorer</a></p>
      <p><strong>LTV Ratio:</strong> ${(parseFloat(loan.ltvRatio) * 100).toFixed(1)}%</p>
      <p><strong>Interest Rate:</strong> ${loan.interestRate}%</p>
      <p>The Bitcoin is now secured in escrow and ready for lending.</p>
    `;

    // In production, would send to registered lenders
    await sendEmail({
      to: 'lender@example.com',
      from: 'noreply@reconquest.com',
      subject: 'New Bitcoin-Backed Loan Available',
      html: emailHtml
    });
  }

  /**
   * Email notification for borrower to confirm fiat receipt
   */
  private async notifyBorrowerOfFiatTransfer(loan: Loan): Promise<void> {
    const borrower = await this.storage.getUser(loan.borrowerId);
    if (!borrower) return;

    const emailHtml = `
      <h2>Fiat Transfer Completed</h2>
      <p>Hi ${borrower.username},</p>
      <p>Your lender has confirmed they've sent $${loan.amount} to you.</p>
      <p>Please confirm receipt of the funds to activate your loan.</p>
      <p><strong>Loan ID:</strong> ${loan.id}</p>
      <p><strong>Amount:</strong> $${loan.amount}</p>
      <p><strong>Collateral:</strong> ${loan.collateralBtc} BTC</p>
    `;

    await sendEmail({
      to: borrower.email,
      from: 'noreply@reconquest.com',
      subject: 'Please Confirm Receipt of Loan Funds',
      html: emailHtml
    });
  }

  /**
   * Email notification when loan becomes active
   */
  private async notifyLoanActivation(loan: Loan): Promise<void> {
    const borrower = await this.storage.getUser(loan.borrowerId);
    if (!borrower || !loan.lenderId) return;

    const lender = await this.storage.getUser(loan.lenderId);
    if (!lender) return;

    const emailHtml = `
      <h2>Loan Activated</h2>
      <p>Loan ${loan.id} is now active!</p>
      <p><strong>Amount:</strong> $${loan.amount}</p>
      <p><strong>Due Date:</strong> ${loan.dueDate?.toLocaleDateString()}</p>
      <p>The countdown has begun. Make sure to repay on time to avoid liquidation.</p>
    `;

    // Notify both parties
    await Promise.all([
      sendEmail({
        to: borrower.email,
        from: 'noreply@reconquest.com',
        subject: 'Your Loan is Now Active',
        html: emailHtml
      }),
      sendEmail({
        to: lender.email,
        from: 'noreply@reconquest.com',
        subject: 'Loan Successfully Funded',
        html: emailHtml
      })
    ]);
  }
}