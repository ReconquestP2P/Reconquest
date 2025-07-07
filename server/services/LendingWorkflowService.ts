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

      // Notify admin about new loan posting
      await this.notifyAdminOfNewLoan(loan);

      // Send email notification to borrower with escrow instructions
      await this.notifyBorrowerOfEscrowGeneration(loan, escrowAddress, collateralBtc);

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

      // Notify admin about loan funding process
      await this.notifyAdminOfLoanFunding(loan);

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
      // Notify admin about funding attempt
      await this.notifyAdminOfFundingAttempt(loan, lenderId);
      
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
   * Email notification for borrower when escrow address is generated
   */
  private async notifyBorrowerOfEscrowGeneration(loan: Loan, escrowAddress: string, collateralBtc: number): Promise<void> {
    try {
      const borrower = await this.storage.getUser(loan.borrowerId);
      
      if (borrower?.email) {
        await sendEmail({
          to: borrower.email,
          from: 'onboarding@resend.dev',
          subject: '🔐 Bitcoin Escrow Address Generated - Deposit Required',
          html: `
            <h2>Your loan has been funded! Time to deposit collateral.</h2>
            <p>Hello ${borrower.username},</p>
            <p>Great news! A lender has agreed to fund your ${loan.amount} ${loan.currency} loan request.</p>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #d4af37;">Next Step: Deposit Bitcoin Collateral</h3>
              <p><strong>Bitcoin Address:</strong></p>
              <code style="background: #fff; padding: 10px; display: block; border: 1px solid #ddd; border-radius: 4px; font-family: monospace;">${escrowAddress}</code>
              <p><strong>Amount to Send:</strong> ${collateralBtc} BTC</p>
              <p><strong>Network:</strong> Bitcoin Testnet</p>
            </div>
            
            <p><strong>Loan Details:</strong></p>
            <ul>
              <li><strong>Loan Amount:</strong> ${loan.amount} ${loan.currency}</li>
              <li><strong>Interest Rate:</strong> ${loan.interestRate}% per year</li>
              <li><strong>Term:</strong> ${loan.termMonths} months</li>
              <li><strong>Collateral Required:</strong> ${collateralBtc} BTC</li>
            </ul>
            
            <p>Once you send the Bitcoin to the escrow address above, the lender will transfer the ${loan.currency} to your account.</p>
            
            <p><strong>Important:</strong> Only send Bitcoin to this exact address. Do not send any other cryptocurrency.</p>
            
            <p>Best regards,<br>The Reconquest Team</p>
          `
        });
        console.log(`📧 Escrow instructions sent to borrower: ${borrower.email}`);
      }
    } catch (error) {
      console.error('Error sending escrow notification to borrower:', error);
    }
  }

  /**
   * Email notification for admin when a new loan is posted
   */
  private async notifyAdminOfNewLoan(loan: Loan): Promise<void> {
    try {
      const user = await this.storage.getUser(loan.borrowerId);
      if (!user) return;

      await sendEmail({
        to: "admin.reconquest@protonmail.com",
        from: "noreply@reconquest.app",
        subject: `🆕 New Loan Posted - Loan #${loan.id}`,
        html: `
          <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
            <div style="background: linear-gradient(135deg, #FFD700 0%, #4A90E2 100%); padding: 20px; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; text-align: center;">New Loan Posted</h1>
            </div>
            
            <div style="background: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <h2 style="color: #333; margin-top: 0;">New Loan Request</h2>
              
              <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #333; margin-top: 0;">Loan Details</h3>
                <p><strong>Loan ID:</strong> #${loan.id}</p>
                <p><strong>Borrower:</strong> ${user.username} (${user.email})</p>
                <p><strong>Amount Requested:</strong> $${loan.amount}</p>
                <p><strong>Interest Rate:</strong> ${loan.interestRate}%</p>
                <p><strong>Term:</strong> ${loan.termDays} days</p>
                <p><strong>Status:</strong> ${loan.status}</p>
                <p><strong>Collateral Required:</strong> ${loan.collateralBtc} BTC</p>
              </div>
              
              <div style="background: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; color: #0c5460;">
                  <strong>New Activity:</strong> A borrower has posted a new loan request and is looking for funding.
                </p>
              </div>
              
              <div style="text-align: center; margin-top: 30px;">
                <p style="color: #666; margin: 0;">This is an automated notification from Reconquest Admin System</p>
              </div>
            </div>
          </div>
        `
      });
    } catch (error) {
      console.error("Failed to send admin new loan notification:", error);
    }
  }

  /**
   * Email notification for admin when a user initiates loan funding
   */
  private async notifyAdminOfFundingAttempt(loan: Loan, lenderId: number): Promise<void> {
    try {
      const borrower = await this.storage.getUser(loan.borrowerId);
      const lender = await this.storage.getUser(lenderId);
      if (!borrower || !lender) return;

      await sendEmail({
        to: "admin.reconquest@protonmail.com",
        from: "noreply@reconquest.app",
        subject: `💰 Loan Funding Initiated - Loan #${loan.id}`,
        html: `
          <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
            <div style="background: linear-gradient(135deg, #FFD700 0%, #4A90E2 100%); padding: 20px; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; text-align: center;">Loan Funding Initiated</h1>
            </div>
            
            <div style="background: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <h2 style="color: #333; margin-top: 0;">Funding Activity</h2>
              
              <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #333; margin-top: 0;">Loan Details</h3>
                <p><strong>Loan ID:</strong> #${loan.id}</p>
                <p><strong>Borrower:</strong> ${borrower.username} (${borrower.email})</p>
                <p><strong>Lender:</strong> ${lender.username} (${lender.email})</p>
                <p><strong>Amount:</strong> $${loan.amount}</p>
                <p><strong>Interest Rate:</strong> ${loan.interestRate}%</p>
                <p><strong>Term:</strong> ${loan.termDays} days</p>
                <p><strong>Collateral:</strong> ${loan.collateralBtc} BTC</p>
              </div>
              
              <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; color: #856404;">
                  <strong>Funding Activity:</strong> A lender has clicked to fund this loan and the funding process has begun.
                </p>
              </div>
              
              <div style="text-align: center; margin-top: 30px;">
                <p style="color: #666; margin: 0;">This is an automated notification from Reconquest Admin System</p>
              </div>
            </div>
          </div>
        `
      });
    } catch (error) {
      console.error("Failed to send admin funding attempt notification:", error);
    }
  }

  /**
   * Email notification for admin when loan funding begins
   */
  private async notifyAdminOfLoanFunding(loan: Loan): Promise<void> {
    try {
      const user = await this.storage.getUser(loan.borrowerId);
      if (!user) return;

      await sendEmail({
        to: "admin.reconquest@protonmail.com",
        from: "noreply@reconquest.app",
        subject: `🔄 Loan Funding Alert - Loan #${loan.id}`,
        html: `
          <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
            <div style="background: linear-gradient(135deg, #FFD700 0%, #4A90E2 100%); padding: 20px; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; text-align: center;">Loan Funding Alert</h1>
            </div>
            
            <div style="background: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <h2 style="color: #333; margin-top: 0;">Loan Being Funded</h2>
              
              <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #333; margin-top: 0;">Loan Details</h3>
                <p><strong>Loan ID:</strong> #${loan.id}</p>
                <p><strong>Borrower:</strong> ${user.username} (${user.email})</p>
                <p><strong>Amount:</strong> $${loan.amount}</p>
                <p><strong>Interest Rate:</strong> ${loan.interestRate}%</p>
                <p><strong>Term:</strong> ${loan.termDays} days</p>
                <p><strong>Status:</strong> ${loan.status}</p>
                <p><strong>Collateral Required:</strong> ${loan.collateralBtc} BTC</p>
              </div>
              
              <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; color: #856404;">
                  <strong>Action Required:</strong> Monitor this loan as it progresses through the funding process.
                </p>
              </div>
              
              <div style="text-align: center; margin-top: 30px;">
                <p style="color: #666; margin: 0;">This is an automated notification from Reconquest Admin System</p>
              </div>
            </div>
          </div>
        `
      });
    } catch (error) {
      console.error("Failed to send admin funding notification:", error);
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
      from: 'onboarding@resend.dev',
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
      from: 'onboarding@resend.dev',
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