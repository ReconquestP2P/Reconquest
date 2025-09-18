import crypto from 'crypto';
import { IBitcoinEscrowService } from './BitcoinEscrowService';
import { ILtvValidationService, LtvValidationResult } from './LtvValidationService';
import { IStorage } from '../storage';
import { Loan } from '@shared/schema';
import { sendEmail } from '../email';

export interface ILendingWorkflowService {
  initiateLoan(borrowerId: number, collateralBtc: number, loanAmount: number): Promise<LoanInitiationResult>;
  acceptLoanOffer(offerId: number, borrowerPubkey: string, lenderPubkey: string): Promise<LoanMatchingResult>;
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

export interface LoanMatchingResult {
  success: boolean;
  loanId?: number;
  escrowAddress?: string;
  redeemScript?: string;
  borrowerPubkey?: string;
  lenderPubkey?: string;
  platformPubkey?: string;
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

      // Create loan record without escrow address initially
      // Real 2-of-3 multisig escrow address will be generated when lender matches
      const loan = await this.storage.createLoan({
        borrowerId,
        amount: loanAmount.toString(),
        currency: 'USDC',
        interestRate: '12.00', // Default interest rate for POC
        termMonths: 12, // Default term for POC
        purpose: 'Bitcoin-backed loan'
      });

      // Update with collateral details using updateLoan since createLoan uses restricted schema
      await this.storage.updateLoan(loan.id, {
        collateralBtc: collateralBtc.toString(),
        ltvRatio: ltvValidation.ltvRatio.toString()
      });

      console.log(`Loan ${loan.id} initiated for borrower ${borrowerId}`);
      console.log(`LTV ratio: ${(ltvValidation.ltvRatio * 100).toFixed(1)}%`);
      console.log(`Status: Awaiting lender match for escrow generation`);

      // Notify admin about new loan posting
      await this.notifyAdminOfNewLoan(loan);

      // NOTE: No escrow email sent here - will be sent when loan is funded
      // and real 2-of-3 multisig P2SH address is generated

      return {
        success: true,
        loanId: loan.id,
        escrowAddress: undefined, // Will be generated when matched
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
   * Step 1.5: Accept a loan offer and create multisig escrow address
   * This is where the magic happens - when borrower and lender match!
   */
  async acceptLoanOffer(offerId: number, borrowerPubkey: string, lenderPubkey: string): Promise<LoanMatchingResult> {
    try {
      console.log(`Processing loan offer acceptance: ${offerId}`);
      console.log(`Borrower pubkey: ${borrowerPubkey}`);
      console.log(`Lender pubkey: ${lenderPubkey}`);

      // Get the loan offer
      const offer = await this.storage.getLoanOffer(offerId);
      if (!offer) {
        return {
          success: false,
          errorMessage: 'Loan offer not found'
        };
      }

      // Get the associated loan
      const loan = await this.storage.getLoan(offer.loanId);
      if (!loan) {
        return {
          success: false,
          errorMessage: 'Associated loan not found'
        };
      }

      // Generate 2-of-3 multisig escrow address
      const escrowResult = await this.bitcoinEscrow.generateMultisigEscrowAddress(
        borrowerPubkey,
        lenderPubkey,
        undefined // Use platform's default pubkey
      );

      console.log(`Generated multisig escrow: ${escrowResult.address}`);

      // Accept the offer (marks it as accepted)
      await this.storage.acceptLoanOffer(offerId);

      // Update loan with escrow details and set lender
      const updatedLoan = await this.storage.updateLoanWithEscrow(loan.id, {
        escrowAddress: escrowResult.address,
        escrowRedeemScript: escrowResult.redeemScript,
        borrowerPubkey,
        lenderPubkey,
        platformPubkey: escrowResult.platformPubkey // Use correct platform pubkey from escrow result
      });

      // Also set the lender ID on the loan
      await this.storage.updateLoan(loan.id, { 
        lenderId: offer.lenderId,
        status: 'funding'
      });

      console.log(`Loan ${loan.id} matched! Escrow address: ${escrowResult.address}`);

      // Send notification emails
      await this.notifyBorrowerOfLoanMatching(loan, escrowResult.address);
      await this.notifyLenderOfLoanMatching(loan, escrowResult.address);
      await this.notifyAdminOfLoanMatching(loan);

      return {
        success: true,
        loanId: loan.id,
        escrowAddress: escrowResult.address,
        redeemScript: escrowResult.redeemScript,
        borrowerPubkey,
        lenderPubkey,
        platformPubkey: escrowResult.platformPubkey // Return correct platform pubkey
      };

    } catch (error: any) {
      console.error('Error accepting loan offer:', error);
      return {
        success: false,
        errorMessage: error?.message || 'Failed to accept loan offer'
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
              <p><strong>Bitcoin Testnet Escrow Address:</strong></p>
              <code style="background: #fff; padding: 10px; display: block; border: 1px solid #ddd; border-radius: 4px; font-family: monospace; word-break: break-all;">${escrowAddress}</code>
              <p><strong>Amount to Send:</strong> ${collateralBtc} BTC</p>
              <p><strong>Network:</strong> Bitcoin Testnet</p>
              <p style="color: #666; font-size: 12px; margin-top: 10px;">⚠️ This is a Bitcoin testnet Native SegWit address starting with "tb1". Lower fees, enhanced security. Do not send mainnet Bitcoin to this address.</p>
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
        to: "admin@reconquestp2p.com",
        from: "noreply@reconquestp2p.com",
        subject: `🔔 [ADMIN ALERT] New Loan Posted - Loan #${loan.id}`,
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
                <p><strong>Amount Requested:</strong> ${loan.amount} ${loan.currency}</p>
                <p><strong>Interest Rate:</strong> ${loan.interestRate}%</p>
                <p><strong>Term:</strong> ${loan.termMonths} months</p>
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
        to: "admin@reconquestp2p.com",
        from: "noreply@reconquestp2p.com",
        subject: `🔔 [ADMIN ALERT] Loan Funding Initiated - Loan #${loan.id}`,
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
                <p><strong>Amount:</strong> ${loan.amount} ${loan.currency}</p>
                <p><strong>Interest Rate:</strong> ${loan.interestRate}%</p>
                <p><strong>Term:</strong> ${loan.termMonths} months</p>
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
        to: "admin@reconquestp2p.com",
        from: "noreply@reconquestp2p.com",
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
                <p><strong>Amount:</strong> ${loan.amount} ${loan.currency}</p>
                <p><strong>Interest Rate:</strong> ${loan.interestRate}%</p>
                <p><strong>Term:</strong> ${loan.termMonths} months</p>
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
      from: 'noreply@reconquestp2p.com',
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
      from: 'noreply@reconquestp2p.com',
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
        from: 'noreply@reconquestp2p.com',
        subject: 'Your Loan is Now Active',
        html: emailHtml
      }),
      sendEmail({
        to: lender.email,
        from: 'noreply@reconquestp2p.com',
        subject: 'Loan Successfully Funded',
        html: emailHtml
      })
    ]);
  }

  /**
   * Email notification for borrower when loan is matched
   */
  async notifyBorrowerOfLoanMatching(loan: Loan, escrowAddress: string): Promise<void> {
    try {
      const borrower = await this.storage.getUser(loan.borrowerId);
      if (!borrower) return;

      await sendEmail({
        to: borrower.email,
        from: 'noreply@reconquestp2p.com',
        subject: '🎉 Your Loan Has Been Matched!',
        html: `
          <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
            <div style="background: linear-gradient(135deg, #FFD700 0%, #4A90E2 100%); padding: 20px; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; text-align: center;">Loan Matched!</h1>
            </div>
            
            <div style="background: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <h2 style="color: #333; margin-top: 0;">Great News, ${borrower.username}!</h2>
              
              <p style="color: #666; line-height: 1.6;">Your loan request has been matched with a lender. A secure 2-of-3 multisig Bitcoin escrow address has been generated.</p>
              
              <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #333; margin-top: 0;">Next Steps</h3>
                <p><strong>Escrow Address:</strong> <code style="background: #e9ecef; padding: 2px 4px; border-radius: 3px;">${escrowAddress}</code></p>
                <p><strong>Collateral Required:</strong> ${loan.collateralBtc} BTC</p>
                <p>Please deposit your Bitcoin collateral to the escrow address above. Once confirmed, your loan will be funded.</p>
              </div>
              
              <div style="background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; color: #155724;">
                  <strong>Loan Amount:</strong> ${loan.amount} ${loan.currency} at ${loan.interestRate}% for ${loan.termMonths} months
                </p>
              </div>
            </div>
          </div>
        `
      });
    } catch (error) {
      console.error("Failed to send borrower loan matching notification:", error);
    }
  }

  /**
   * Email notification for lender when loan is matched
   */
  async notifyLenderOfLoanMatching(loan: Loan, escrowAddress: string): Promise<void> {
    try {
      if (!loan.lenderId) return;
      const lender = await this.storage.getUser(loan.lenderId);
      if (!lender) return;

      await sendEmail({
        to: lender.email,
        from: 'noreply@reconquestp2p.com',
        subject: '🎯 Loan Offer Accepted!',
        html: `
          <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
            <div style="background: linear-gradient(135deg, #FFD700 0%, #4A90E2 100%); padding: 20px; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; text-align: center;">Offer Accepted!</h1>
            </div>
            
            <div style="background: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <h2 style="color: #333; margin-top: 0;">Congratulations, ${lender.username}!</h2>
              
              <p style="color: #666; line-height: 1.6;">Your loan offer has been accepted. A secure multisig escrow has been created and the borrower is preparing to deposit collateral.</p>
              
              <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #333; margin-top: 0;">Loan Details</h3>
                <p><strong>Amount:</strong> ${loan.amount} ${loan.currency}</p>
                <p><strong>Interest Rate:</strong> ${loan.interestRate}%</p>
                <p><strong>Term:</strong> ${loan.termMonths} months</p>
                <p><strong>Collateral:</strong> ${loan.collateralBtc} BTC</p>
                <p><strong>Escrow:</strong> <code style="background: #e9ecef; padding: 2px 4px; border-radius: 3px;">${escrowAddress}</code></p>
              </div>
              
              <div style="background: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; color: #0c5460;">
                  <strong>Next Step:</strong> Once the borrower deposits Bitcoin to escrow, you can proceed with fiat transfer.
                </p>
              </div>
            </div>
          </div>
        `
      });
    } catch (error) {
      console.error("Failed to send lender loan matching notification:", error);
    }
  }

  /**
   * Email notification for admin when loan is matched
   */
  async notifyAdminOfLoanMatching(loan: Loan): Promise<void> {
    try {
      const borrower = await this.storage.getUser(loan.borrowerId);
      if (!borrower || !loan.lenderId) return;
      const lender = await this.storage.getUser(loan.lenderId);
      if (!lender) return;

      await sendEmail({
        to: "admin@reconquestp2p.com",
        from: "noreply@reconquestp2p.com",
        subject: `🎯 [ADMIN ALERT] Loan Matched - Loan #${loan.id}`,
        html: `
          <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
            <div style="background: linear-gradient(135deg, #FFD700 0%, #4A90E2 100%); padding: 20px; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; text-align: center;">Loan Successfully Matched</h1>
            </div>
            
            <div style="background: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <h2 style="color: #333; margin-top: 0;">Loan Matching Success</h2>
              
              <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #333; margin-top: 0;">Match Details</h3>
                <p><strong>Loan ID:</strong> #${loan.id}</p>
                <p><strong>Borrower:</strong> ${borrower.username} (${borrower.email})</p>
                <p><strong>Lender:</strong> ${lender.username} (${lender.email})</p>
                <p><strong>Amount:</strong> ${loan.amount} ${loan.currency}</p>
                <p><strong>Interest Rate:</strong> ${loan.interestRate}%</p>
                <p><strong>Term:</strong> ${loan.termMonths} months</p>
                <p><strong>Collateral:</strong> ${loan.collateralBtc} BTC</p>
                <p><strong>Status:</strong> ${loan.status}</p>
              </div>
              
              <div style="background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; color: #155724;">
                  <strong>Multisig Created:</strong> A 2-of-3 multisig escrow address has been generated. Awaiting borrower collateral deposit.
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
      console.error("Failed to send admin loan matching notification:", error);
    }
  }
}