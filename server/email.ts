import { Resend } from 'resend';
import { getExplorerUrl } from './services/bitcoin-network-selector.js';

if (!process.env.RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY environment variable must be set");
}

const resend = new Resend(process.env.RESEND_API_KEY);

interface EmailParams {
  to: string;
  from: string;
  subject: string;
  html: string;
}

// Helper function to add delay between emails to respect rate limits
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function sendEmail(params: EmailParams): Promise<boolean> {
  try {
    console.log(`Attempting to send email to: ${params.to}, subject: ${params.subject}`);
    
    const { data, error } = await resend.emails.send({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    });

    if (error) {
      console.error('Resend email error:', error);
      // If rate limited, wait and retry once
      if (error.name === 'rate_limit_exceeded') {
        console.log('Rate limited, waiting 3 seconds and retrying...');
        await delay(3000);
        
        const { data: retryData, error: retryError } = await resend.emails.send({
          from: params.from,
          to: [params.to],
          subject: params.subject,
          html: params.html,
        });
        
        if (retryError) {
          console.error('Resend email retry failed:', retryError);
          return false;
        }
        
        console.log('Email sent successfully on retry:', retryData?.id);
        return true;
      }
      return false;
    }

    console.log('Email sent successfully:', data?.id, 'to:', params.to);
    console.log('Full Resend response:', JSON.stringify(data));
    // Add small delay after successful send to prevent rate limiting
    await delay(600); // 600ms delay = ~1.6 requests per second, under the 2/sec limit
    return true;
  } catch (error) {
    console.error('Resend email error:', error);
    return false;
  }
}

// Get public logo URL for emails
function getLogoUrl(): string {
  const appUrl = process.env.APP_URL || 'https://www.reconquestp2p.com';
  return `${appUrl}/logo.png`;
}

// Create email header with logo
function getEmailHeader(): string {
  const logoUrl = getLogoUrl();
  return `<img src="${logoUrl}" alt="Reconquest Logo" style="width: 250px; height: auto; margin-bottom: 20px;" />`;
}

// Get base URL for dashboard links
export function getBaseUrl(): string {
  return process.env.APP_URL || 'https://www.reconquestp2p.com';
}

// Create a properly branded email template with logo and optional dashboard button
export function createBrandedEmailHtml(params: {
  title: string;
  greeting?: string;
  content: string;
  buttonText?: string;
  buttonUrl?: string;
  footer?: string;
}): string {
  const { title, greeting, content, buttonText, buttonUrl, footer } = params;
  const logoUrl = getLogoUrl();
  
  const buttonHtml = buttonText && buttonUrl ? `
    <div style="text-align: center; margin: 30px 0;">
      <a href="${buttonUrl}" style="display: inline-block; background: linear-gradient(135deg, #D4AF37 0%, #4A90E2 100%); color: #fff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">
        ${buttonText}
      </a>
    </div>
  ` : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
      <div style="background-color: #fff; border-radius: 8px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="${logoUrl}" alt="Reconquest" style="max-width: 200px; height: auto;" />
        </div>
        
        <h2 style="color: #1a1a1a; margin-top: 20px; font-size: 24px; font-weight: 600;">${title}</h2>
        
        ${greeting ? `<p style="font-size: 16px; color: #333; margin-top: 20px;">${greeting}</p>` : ''}
        
        <div style="font-size: 15px; color: #555; line-height: 1.7;">
          ${content}
        </div>
        
        ${buttonHtml}
        
        <p style="font-size: 14px; color: #7F8C8D; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          ${footer || '<strong>— The Reconquest Team 👑</strong><br><br>Questions? Contact us at <a href="mailto:admin@reconquestp2p.com" style="color: #D4AF37;">admin@reconquestp2p.com</a>'}
        </p>
      </div>
    </body>
    </html>
  `;
}

export async function sendBorrowerDepositNotification(params: {
  to: string;
  borrowerName: string;
  loanId: number;
  loanAmount: string;
  currency: string;
  collateralBtc: string;
  escrowAddress: string;
  dashboardUrl: string;
}): Promise<boolean> {
  const { to, borrowerName, loanId, loanAmount, currency, collateralBtc, escrowAddress, dashboardUrl } = params;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
      <div style="background-color: #fff; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        ${getEmailHeader()}
        
        <h2 style="color: #2C3E50; margin-top: 0;">🎉 Your Loan Has Been Funded!</h2>
        
        <p style="font-size: 16px; color: #555;">Hi ${borrowerName},</p>
        
        <p style="font-size: 16px; color: #555;">Great news! A lender has committed to fund your loan request.</p>
        
        <div style="background-color: #E8F8F5; border-left: 4px solid #27AE60; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <h3 style="margin-top: 0; color: #27AE60;">📋 Loan Details</h3>
          <p style="margin: 5px 0;"><strong>Loan ID:</strong> #${loanId}</p>
          <p style="margin: 5px 0;"><strong>Loan Amount:</strong> ${loanAmount} ${currency}</p>
          <p style="margin: 5px 0;"><strong>Required Collateral:</strong> ${collateralBtc} BTC</p>
        </div>

        <div style="background-color: #FEF9E7; border-left: 4px solid #F39C12; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <h3 style="margin-top: 0; color: #F39C12;">🔐 Next Step: Deposit Your Bitcoin Collateral</h3>
          
          <p style="font-size: 16px; color: #555;">To secure this loan, please deposit <strong>${collateralBtc} BTC</strong> to the following escrow address:</p>
          
          <div style="background-color: #fff; border: 2px dashed #3498DB; padding: 15px; margin: 15px 0; border-radius: 5px; word-break: break-all;">
            <p style="font-family: monospace; font-size: 14px; margin: 0; color: #2C3E50;"><strong>Bitcoin Testnet Address:</strong></p>
            <p style="font-family: monospace; font-size: 16px; margin: 10px 0; color: #E67E22; font-weight: bold;">${escrowAddress}</p>
          </div>

          <div style="background-color: #FADBD8; border-left: 4px solid #E74C3C; padding: 15px; margin: 20px 0; border-radius: 5px;">
            <h4 style="margin-top: 0; color: #E74C3C;">⚠️ Important Security Reminders</h4>
            <ul style="margin: 10px 0; padding-left: 20px; color: #555;">
              <li>This is a <strong>Bitcoin TESTNET</strong> address (for testing purposes only)</li>
              <li><strong>Double-check the address</strong> before sending - copy it carefully</li>
              <li>Send EXACTLY <strong>${collateralBtc} BTC</strong> to this address</li>
              <li>This address is a <strong>2-of-3 multisig escrow</strong> - your funds are secured by cryptography</li>
              <li><strong>Never share your private keys</strong> with anyone (Reconquest will never ask for them)</li>
            </ul>
          </div>
        </div>

        <div style="background-color: #EBF5FB; border-left: 4px solid #3498DB; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <h3 style="margin-top: 0; color: #3498DB;">📝 What Happens Next?</h3>
          <ol style="margin: 10px 0; padding-left: 20px; color: #555;">
            <li>Send ${collateralBtc} BTC to the escrow address above</li>
            <li>Wait for the Bitcoin network to confirm your transaction (usually 10-60 minutes)</li>
            <li>Go to your <a href="${dashboardUrl}" style="color: #3498DB; text-decoration: none; font-weight: bold;">Borrower Dashboard</a></li>
            <li>Click "<strong>Confirm Deposit</strong>" button next to Loan #${loanId}</li>
            <li>You and the lender will then generate your security keys</li>
            <li>Your loan will become active and you'll receive the ${loanAmount} ${currency}</li>
          </ol>
        </div>

        <div style="text-align: center; margin-top: 30px;">
          <a href="${dashboardUrl}" style="display: inline-block; background-color: #D4AF37; color: #000; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
            View My Dashboard →
          </a>
        </div>

        <p style="font-size: 14px; color: #7F8C8D; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ECF0F1;">
          If you have any questions or need assistance, please contact our support team.
        </p>

        <p style="font-size: 14px; color: #7F8C8D; margin-top: 10px;">
          <strong>— The Reconquest Team 👑</strong><br><br>Questions? Contact us at <a href="mailto:admin@reconquestp2p.com" style="color: #D4AF37;">admin@reconquestp2p.com</a>
        </p>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({
    to,
    from: 'Reconquest <noreply@reconquestp2p.com>',
    subject: `🎉 Your Loan #${loanId} Has Been Funded - Deposit Your Collateral`,
    html,
  });
}

export async function sendLenderFundingNotification(params: {
  to: string;
  lenderName: string;
  loanId: number;
  loanAmount: string;
  currency: string;
  interestRate: string;
  startDate: string;
  maturityDate: string;
  termMonths: number;
  dashboardUrl: string;
  escrowAddress?: string;
  collateralBtc: string;
}): Promise<boolean> {
  const { 
    to, lenderName, loanId, loanAmount, currency, interestRate, startDate, maturityDate, termMonths, dashboardUrl, escrowAddress, collateralBtc 
  } = params;

  const baseUrl = process.env.APP_URL || 'https://www.reconquestp2p.com';
  const mempoolUrl = escrowAddress ? getExplorerUrl('address', escrowAddress) : '';
  
  const formattedAmount = parseFloat(loanAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formattedInterestRate = parseFloat(interestRate).toFixed(2);

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
      <div style="background-color: #fff; border-radius: 8px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="${baseUrl}/logo.png" alt="Reconquest" style="max-width: 200px; height: auto;" />
        </div>
        
        <h2 style="color: #1a1a1a; margin-top: 20px; font-size: 24px; font-weight: 600;">Funds transfer confirmation</h2>
        
        <p style="font-size: 16px; color: #333; margin-top: 20px;">Dear ${lenderName},</p>
        
        <p style="font-size: 15px; color: #555; line-height: 1.7;">
          The borrower has successfully completed the escrow process by securely depositing their Bitcoin into a <a href="${mempoolUrl}" style="color: #E74C3C; text-decoration: none; font-weight: 600;">designated address</a>.
        </p>
        
        <p style="font-size: 15px; color: #555; line-height: 1.7;">
          You can now proceed with the bank transfer. Please follow the instructions on the platform to send the loan amount to the borrower's bank account. Once you confirm the transfer, the borrower will be notified to validate the transaction on their end.
        </p>
        
        <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 25px 0;">
          <p style="margin: 8px 0; font-size: 15px;"><strong>Loan ID:</strong> ${loanId.toString().padStart(6, '0')}</p>
          <p style="margin: 8px 0; font-size: 15px;"><strong>Loan Amount:</strong> ${formattedAmount} ${currency}</p>
          <p style="margin: 8px 0; font-size: 15px;"><strong>Collateral Deposited:</strong> ${parseFloat(collateralBtc).toFixed(8)} BTC</p>
          <p style="margin: 8px 0; font-size: 15px;"><strong>Interest Rate:</strong> ${formattedInterestRate}% p.a.</p>
          <p style="margin: 8px 0; font-size: 15px;"><strong>Term:</strong> ${termMonths} months</p>
          <p style="margin: 8px 0; font-size: 15px;"><strong>Start Date:</strong> ${startDate}</p>
          <p style="margin: 8px 0; font-size: 15px;"><strong>Maturity Date:</strong> ${maturityDate}</p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${dashboardUrl}" style="display: inline-block; background-color: #E74C3C; color: #fff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">
            Confirm transfer
          </a>
        </div>

        <p style="font-size: 14px; color: #666; line-height: 1.7; margin-top: 25px;">
          Please note that it's crucial to complete the funds transfer within the agreed-upon timeframe mentioned in the loan agreement. This ensures a smooth and efficient lending process for both parties involved.
        </p>

        <p style="font-size: 14px; color: #7F8C8D; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <strong>— The Reconquest Team 👑</strong><br><br>Questions? Contact us at <a href="mailto:admin@reconquestp2p.com" style="color: #D4AF37;">admin@reconquestp2p.com</a>
        </p>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({
    to,
    from: 'Reconquest <noreply@reconquestp2p.com>',
    subject: `👑🪙 Your Investment: Time to Transfer Your Funds`,
    html,
  });
}

export async function sendLenderKeyGenerationNotification(params: {
  to: string;
  lenderName: string;
  borrowerName: string;
  loanId: number;
  loanAmount: string;
  currency: string;
  interestRate: string;
  termMonths: number;
  collateralBtc: string;
  dashboardUrl: string;
  escrowAddress?: string;
}): Promise<boolean> {
  const { to, lenderName, borrowerName, loanId, loanAmount, currency, interestRate, termMonths, collateralBtc, dashboardUrl, escrowAddress } = params;

  const baseUrl = process.env.APP_URL || 'https://www.reconquestp2p.com';
  const mempoolUrl = escrowAddress ? getExplorerUrl('address', escrowAddress) : '';
  const formattedAmount = parseFloat(loanAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formattedInterestRate = parseFloat(interestRate).toFixed(2);

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
      <div style="background-color: #fff; border-radius: 8px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
        <div style="text-align: center; margin-bottom: 20px;">
          ${getEmailHeader()}
        </div>
        
        <h2 style="color: #1a1a1a; margin-top: 20px; font-size: 24px; font-weight: 600;">🔐 Escrow Setup In Progress</h2>
        
        <p style="font-size: 16px; color: #333; margin-top: 20px;">Hi ${lenderName},</p>
        
        <p style="font-size: 15px; color: #555; line-height: 1.7;">
          The borrower has completed their escrow key setup for Loan #${loanId}. The multisig escrow address has been created and the borrower is now preparing to deposit their Bitcoin collateral.
        </p>
        
        <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 0; font-size: 14px; color: #856404;">
            <strong>⏳ Awaiting Deposit:</strong> The escrow address is ready, but the borrower has not yet deposited their Bitcoin collateral. 
            You will receive another email once the collateral has been confirmed on the blockchain.
          </p>
        </div>
        
        <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 25px 0;">
          <p style="margin: 8px 0; font-size: 15px;"><strong>Loan ID:</strong> #${loanId}</p>
          <p style="margin: 8px 0; font-size: 15px;"><strong>Loan Amount:</strong> ${formattedAmount} ${currency}</p>
          <p style="margin: 8px 0; font-size: 15px;"><strong>Interest Rate:</strong> ${formattedInterestRate}% p.a.</p>
          <p style="margin: 8px 0; font-size: 15px;"><strong>Term:</strong> ${termMonths} months</p>
          <p style="margin: 8px 0; font-size: 15px;"><strong>Collateral:</strong> ${collateralBtc} BTC</p>
          ${mempoolUrl ? `<p style="margin: 8px 0; font-size: 15px;"><strong>Escrow Address:</strong> <a href="${mempoolUrl}" style="color: #D4AF37; text-decoration: none; font-weight: 600;">View on Mempool.space</a></p>` : ''}
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${dashboardUrl}" style="display: inline-block; background-color: #D4AF37; color: #000; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">
            📊 View Dashboard
          </a>
        </div>

        <p style="font-size: 14px; color: #666; line-height: 1.7; margin-top: 25px;">
          <strong>No action needed from you right now.</strong> We'll notify you as soon as the borrower's Bitcoin collateral is confirmed on the blockchain. 
          At that point, you'll be asked to send the loan funds.
        </p>

        <p style="font-size: 14px; color: #7F8C8D; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <strong>— The Reconquest Team 👑</strong><br><br>Questions? Contact us at <a href="mailto:admin@reconquestp2p.com" style="color: #D4AF37;">admin@reconquestp2p.com</a>
        </p>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({
    to,
    from: 'Reconquest <noreply@reconquestp2p.com>',
    subject: `🔐 Escrow Setup In Progress - Loan #${loanId}`,
    html,
  });
}

export async function sendDetailsChangeConfirmation(params: {
  to: string;
  userName: string;
  confirmUrl: string;
  changesDescription: string;
}): Promise<boolean> {
  const { to, userName, confirmUrl, changesDescription } = params;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
      <div style="background-color: #fff; border-radius: 8px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
        <div style="text-align: center; margin-bottom: 20px;">
          ${getEmailHeader()}
        </div>
        
        <h2 style="color: #1a1a1a; margin-top: 20px; font-size: 24px; font-weight: 600;">🔐 Confirm Your Personal Details Change</h2>
        
        <p style="font-size: 16px; color: #333; margin-top: 20px;">Hi ${userName},</p>
        
        <p style="font-size: 15px; color: #555; line-height: 1.7;">
          We received a request to update your personal details. For your security, please confirm this change by clicking the button below.
        </p>
        
        <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 0; font-size: 14px; color: #856404;">
            <strong>⚠️ Security Notice:</strong> If you did not request this change, please ignore this email. 
            Your account information will remain unchanged.
          </p>
        </div>
        
        <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 25px 0;">
          <h3 style="margin-top: 0; font-size: 16px; color: #333;">Requested Changes:</h3>
          <div style="font-size: 14px; color: #555;">
            ${changesDescription}
          </div>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${confirmUrl}" style="display: inline-block; background-color: #D4AF37; color: #000; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">
            ✓ Confirm Changes
          </a>
        </div>

        <p style="font-size: 14px; color: #666; line-height: 1.7; margin-top: 25px;">
          This confirmation link will expire in <strong>24 hours</strong>. After that, you'll need to request the change again.
        </p>

        <p style="font-size: 14px; color: #7F8C8D; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <strong>— The Reconquest Team 👑</strong><br><br>Questions? Contact us at <a href="mailto:admin@reconquestp2p.com" style="color: #D4AF37;">admin@reconquestp2p.com</a>
        </p>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({
    to,
    from: 'Reconquest <noreply@reconquestp2p.com>',
    subject: `🔐 Confirm Your Personal Details Change - Reconquest`,
    html,
  });
}

// Send email when top-up is detected in mempool (before confirmation)
export async function sendTopUpDetectedEmail(params: {
  borrowerEmail: string;
  borrowerName: string;
  lenderEmail: string;
  lenderName: string;
  loanId: number;
  txid: string;
  amountBtc: string;
  escrowAddress: string;
}): Promise<void> {
  const { borrowerEmail, borrowerName, lenderEmail, lenderName, loanId, txid, amountBtc, escrowAddress } = params;
  const mempoolLink = getExplorerUrl('tx', txid);
  const logoUrl = getLogoUrl();
  
  // Email to borrower
  const borrowerHtml = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="${logoUrl}" alt="Reconquest Logo" style="width: 200px; height: auto;" />
        </div>
        
        <h2 style="color: #1a1a1a; font-size: 24px; font-weight: 600;">🔄 Top-Up Detected in Mempool</h2>
        
        <p style="font-size: 16px; color: #333;">Hi ${borrowerName},</p>
        
        <p style="font-size: 15px; color: #555; line-height: 1.7;">
          Great news! We've detected your collateral top-up transaction in the Bitcoin mempool. It's now waiting to be confirmed by miners.
        </p>
        
        <div style="background-color: #e8f4fd; border-radius: 8px; padding: 20px; margin: 25px 0;">
          <h3 style="margin-top: 0; font-size: 16px; color: #333;">Transaction Details:</h3>
          <p style="margin: 5px 0; font-size: 14px; color: #555;"><strong>Loan ID:</strong> #${loanId}</p>
          <p style="margin: 5px 0; font-size: 14px; color: #555;"><strong>Amount:</strong> ${amountBtc} BTC</p>
          <p style="margin: 5px 0; font-size: 14px; color: #555;"><strong>Status:</strong> <span style="color: #f59e0b;">⏳ Awaiting Confirmation</span></p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${mempoolLink}" style="display: inline-block; background-color: #D4AF37; color: #000; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">
            🔗 View on Mempool.space
          </a>
        </div>
        
        <p style="font-size: 14px; color: #666; line-height: 1.7;">
          Once the transaction receives the required confirmations, your collateral will be automatically updated and your LTV will be recalculated.
        </p>
        
        <p style="font-size: 14px; color: #7F8C8D; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <strong>— The Reconquest Team 👑</strong><br><br>Questions? Contact us at <a href="mailto:admin@reconquestp2p.com" style="color: #D4AF37;">admin@reconquestp2p.com</a>
        </p>
      </div>
    </body>
    </html>
  `;
  
  // Email to lender
  const lenderHtml = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="${logoUrl}" alt="Reconquest Logo" style="width: 200px; height: auto;" />
        </div>
        
        <h2 style="color: #1a1a1a; font-size: 24px; font-weight: 600;">🔄 Borrower Top-Up Detected</h2>
        
        <p style="font-size: 16px; color: #333;">Hi ${lenderName},</p>
        
        <p style="font-size: 15px; color: #555; line-height: 1.7;">
          Good news! The borrower has topped up their collateral for Loan #${loanId}. The transaction is currently in the mempool awaiting confirmation.
        </p>
        
        <div style="background-color: #e8f4fd; border-radius: 8px; padding: 20px; margin: 25px 0;">
          <h3 style="margin-top: 0; font-size: 16px; color: #333;">Transaction Details:</h3>
          <p style="margin: 5px 0; font-size: 14px; color: #555;"><strong>Loan ID:</strong> #${loanId}</p>
          <p style="margin: 5px 0; font-size: 14px; color: #555;"><strong>Top-Up Amount:</strong> ${amountBtc} BTC</p>
          <p style="margin: 5px 0; font-size: 14px; color: #555;"><strong>Status:</strong> <span style="color: #f59e0b;">⏳ In Mempool</span></p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${mempoolLink}" style="display: inline-block; background-color: #D4AF37; color: #000; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">
            🔗 View on Mempool.space
          </a>
        </div>
        
        <p style="font-size: 14px; color: #666; line-height: 1.7;">
          Once confirmed, the loan's LTV ratio will be automatically recalculated with the additional collateral.
        </p>
        
        <p style="font-size: 14px; color: #7F8C8D; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <strong>— The Reconquest Team 👑</strong><br><br>Questions? Contact us at <a href="mailto:admin@reconquestp2p.com" style="color: #D4AF37;">admin@reconquestp2p.com</a>
        </p>
      </div>
    </body>
    </html>
  `;
  
  try {
    await sendEmail({
      to: borrowerEmail,
      from: 'Reconquest <noreply@reconquestp2p.com>',
      subject: `🔄 Top-Up Detected - Loan #${loanId}`,
      html: borrowerHtml,
    });
    console.log(`📧 Top-up detected email sent to borrower: ${borrowerEmail}`);
    
    await sendEmail({
      to: lenderEmail,
      from: 'Reconquest <noreply@reconquestp2p.com>',
      subject: `🔄 Borrower Top-Up Detected - Loan #${loanId}`,
      html: lenderHtml,
    });
    console.log(`📧 Top-up detected email sent to lender: ${lenderEmail}`);
  } catch (error) {
    console.error('Error sending top-up detected emails:', error);
  }
}

// Send email when top-up is fully confirmed
export async function sendTopUpConfirmedEmail(params: {
  borrowerEmail: string;
  borrowerName: string;
  lenderEmail: string;
  lenderName: string;
  loanId: number;
  txid?: string;
  amountBtc: string;
  newTotalCollateralBtc: string;
  newLtv: string;
}): Promise<void> {
  const { borrowerEmail, borrowerName, lenderEmail, lenderName, loanId, txid, amountBtc, newTotalCollateralBtc, newLtv } = params;
  const mempoolLink = txid ? getExplorerUrl('tx', txid) : null;
  const logoUrl = getLogoUrl();
  const dashboardUrl = getBaseUrl();
  
  // Email to borrower
  const borrowerHtml = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="${logoUrl}" alt="Reconquest Logo" style="width: 200px; height: auto;" />
        </div>
        
        <h2 style="color: #1a1a1a; font-size: 24px; font-weight: 600;">✅ Top-Up Confirmed!</h2>
        
        <p style="font-size: 16px; color: #333;">Hi ${borrowerName},</p>
        
        <p style="font-size: 15px; color: #555; line-height: 1.7;">
          Your collateral top-up has been confirmed on the blockchain. Your loan's collateral has been updated.
        </p>
        
        <div style="background-color: #d4edda; border-radius: 8px; padding: 20px; margin: 25px 0;">
          <h3 style="margin-top: 0; font-size: 16px; color: #155724;">Updated Loan Details:</h3>
          <p style="margin: 5px 0; font-size: 14px; color: #155724;"><strong>Loan ID:</strong> #${loanId}</p>
          <p style="margin: 5px 0; font-size: 14px; color: #155724;"><strong>Top-Up Amount:</strong> +${amountBtc} BTC</p>
          <p style="margin: 5px 0; font-size: 14px; color: #155724;"><strong>New Total Collateral:</strong> ${newTotalCollateralBtc} BTC</p>
          <p style="margin: 5px 0; font-size: 14px; color: #155724;"><strong>New LTV:</strong> ${newLtv}%</p>
        </div>
        
        ${mempoolLink ? `
        <div style="text-align: center; margin: 20px 0;">
          <a href="${mempoolLink}" style="display: inline-block; background-color: #1a73e8; color: #fff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
            🔗 View Transaction on Mempool
          </a>
        </div>
        ` : ''}
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${dashboardUrl}/borrower" style="display: inline-block; background-color: #D4AF37; color: #000; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">
            📊 View Dashboard
          </a>
        </div>
        
        <p style="font-size: 14px; color: #7F8C8D; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <strong>— The Reconquest Team 👑</strong><br><br>Questions? Contact us at <a href="mailto:admin@reconquestp2p.com" style="color: #D4AF37;">admin@reconquestp2p.com</a>
        </p>
      </div>
    </body>
    </html>
  `;
  
  // Email to lender
  const lenderHtml = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="${logoUrl}" alt="Reconquest Logo" style="width: 200px; height: auto;" />
        </div>
        
        <h2 style="color: #1a1a1a; font-size: 24px; font-weight: 600;">✅ Borrower Top-Up Confirmed</h2>
        
        <p style="font-size: 16px; color: #333;">Hi ${lenderName},</p>
        
        <p style="font-size: 15px; color: #555; line-height: 1.7;">
          The borrower's collateral top-up for Loan #${loanId} has been confirmed on the blockchain. The loan's collateral has been increased.
        </p>
        
        <div style="background-color: #d4edda; border-radius: 8px; padding: 20px; margin: 25px 0;">
          <h3 style="margin-top: 0; font-size: 16px; color: #155724;">Updated Loan Details:</h3>
          <p style="margin: 5px 0; font-size: 14px; color: #155724;"><strong>Loan ID:</strong> #${loanId}</p>
          <p style="margin: 5px 0; font-size: 14px; color: #155724;"><strong>Top-Up Amount:</strong> +${amountBtc} BTC</p>
          <p style="margin: 5px 0; font-size: 14px; color: #155724;"><strong>New Total Collateral:</strong> ${newTotalCollateralBtc} BTC</p>
          <p style="margin: 5px 0; font-size: 14px; color: #155724;"><strong>New LTV:</strong> ${newLtv}%</p>
        </div>
        
        ${mempoolLink ? `
        <div style="text-align: center; margin: 20px 0;">
          <a href="${mempoolLink}" style="display: inline-block; background-color: #1a73e8; color: #fff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
            🔗 View Transaction on Mempool
          </a>
        </div>
        ` : ''}
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${dashboardUrl}/lender" style="display: inline-block; background-color: #D4AF37; color: #000; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">
            📊 View Dashboard
          </a>
        </div>
        
        <p style="font-size: 14px; color: #7F8C8D; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <strong>— The Reconquest Team 👑</strong><br><br>Questions? Contact us at <a href="mailto:admin@reconquestp2p.com" style="color: #D4AF37;">admin@reconquestp2p.com</a>
        </p>
      </div>
    </body>
    </html>
  `;
  
  try {
    await sendEmail({
      to: borrowerEmail,
      from: 'Reconquest <noreply@reconquestp2p.com>',
      subject: `✅ Top-Up Confirmed - Loan #${loanId}`,
      html: borrowerHtml,
    });
    console.log(`📧 Top-up confirmed email sent to borrower: ${borrowerEmail}`);
    
    await sendEmail({
      to: lenderEmail,
      from: 'Reconquest <noreply@reconquestp2p.com>',
      subject: `✅ Borrower Top-Up Confirmed - Loan #${loanId}`,
      html: lenderHtml,
    });
    console.log(`📧 Top-up confirmed email sent to lender: ${lenderEmail}`);
  } catch (error) {
    console.error('Error sending top-up confirmed emails:', error);
  }
}

export async function sendPartialDepositWarningEmail(params: {
  to: string;
  borrowerName: string;
  loanId: number;
  depositedBtc: string;
  requiredBtc: string;
  shortfallBtc: string;
  escrowAddress: string;
  txid?: string;
  dashboardUrl: string;
}): Promise<boolean> {
  const { to, borrowerName, loanId, depositedBtc, requiredBtc, shortfallBtc, escrowAddress, txid, dashboardUrl } = params;

  const baseUrl = process.env.APP_URL || 'https://www.reconquestp2p.com';
  const mempoolAddressUrl = getExplorerUrl('address', escrowAddress);
  const mempoolTxUrl = txid ? getExplorerUrl('tx', txid) : '';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
      <div style="background-color: #fff; border-radius: 8px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
        <div style="text-align: center; margin-bottom: 20px;">
          ${getEmailHeader()}
        </div>
        
        <h2 style="color: #dc3545; margin-top: 20px; font-size: 24px; font-weight: 600;">⚠️ Insufficient Collateral Deposit</h2>
        
        <p style="font-size: 16px; color: #333; margin-top: 20px;">Dear ${borrowerName},</p>
        
        <p style="font-size: 15px; color: #555; line-height: 1.7;">
          We detected a Bitcoin deposit to your escrow address for <strong>Loan #${loanId.toString().padStart(6, '0')}</strong>, but the amount is <strong>less than required</strong>. Your loan cannot proceed until the full collateral amount is deposited.
        </p>
        
        <div style="background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 20px; margin: 25px 0;">
          <h3 style="margin-top: 0; font-size: 16px; color: #856404;">Deposit Details:</h3>
          <p style="margin: 8px 0; font-size: 15px; color: #856404;"><strong>Deposited:</strong> ${depositedBtc} BTC</p>
          <p style="margin: 8px 0; font-size: 15px; color: #856404;"><strong>Required:</strong> ${requiredBtc} BTC</p>
          <p style="margin: 8px 0; font-size: 15px; color: #dc3545;"><strong>Shortfall:</strong> ${shortfallBtc} BTC</p>
        </div>
        
        <div style="background-color: #e8f5e9; border-radius: 8px; padding: 20px; margin: 25px 0;">
          <h3 style="margin-top: 0; font-size: 16px; color: #2e7d32;">What to do:</h3>
          <p style="margin: 8px 0; font-size: 14px; color: #2e7d32;">
            Send an additional <strong>${shortfallBtc} BTC</strong> to the same escrow address below. Once the full amount is confirmed, your loan will proceed automatically.
          </p>
          <div style="background-color: #fff; border: 1px dashed #2e7d32; border-radius: 4px; padding: 12px; margin-top: 12px; word-break: break-all; font-family: monospace; font-size: 13px;">
            ${escrowAddress}
          </div>
        </div>
        
        ${mempoolTxUrl ? `
        <div style="text-align: center; margin: 20px 0;">
          <a href="${mempoolTxUrl}" style="display: inline-block; background-color: #6c757d; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px; margin-right: 10px;">
            View Partial Deposit TX
          </a>
          <a href="${mempoolAddressUrl}" style="display: inline-block; background-color: #1a73e8; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">
            View Escrow Address
          </a>
        </div>
        ` : `
        <div style="text-align: center; margin: 20px 0;">
          <a href="${mempoolAddressUrl}" style="display: inline-block; background-color: #1a73e8; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">
            View Escrow Address
          </a>
        </div>
        `}
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${dashboardUrl}/borrower" style="display: inline-block; background-color: #D4AF37; color: #000; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">
            Go to My Dashboard
          </a>
        </div>
        
        <p style="font-size: 14px; color: #666; line-height: 1.7; margin-top: 25px;">
          <strong>Note:</strong> If you believe this is an error, please check the transaction on the blockchain explorer. The deposit must have at least 1 confirmation to be counted.
        </p>

        <p style="font-size: 14px; color: #7F8C8D; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <strong>— The Reconquest Team 👑</strong><br><br>Questions? Contact us at <a href="mailto:admin@reconquestp2p.com" style="color: #D4AF37;">admin@reconquestp2p.com</a>
        </p>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({
    to,
    from: 'Reconquest <noreply@reconquestp2p.com>',
    subject: `⚠️ Insufficient Collateral - Loan #${loanId.toString().padStart(6, '0')} Requires More BTC`,
    html,
  });
}
