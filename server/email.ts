import { Resend } from 'resend';
import { readFileSync } from 'fs';
import { join } from 'path';

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

    console.log('Email sent successfully:', data?.id);
    // Add small delay after successful send to prevent rate limiting
    await delay(600); // 600ms delay = ~1.6 requests per second, under the 2/sec limit
    return true;
  } catch (error) {
    console.error('Resend email error:', error);
    return false;
  }
}

// Create logo data URI from PNG file with size optimization for emails
function getLogoDataURI(): string {
  try {
    const logoPath = join(process.cwd(), 'attached_assets', 'Reconquest logo 2_1752025456549.png');
    console.log('Loading logo from:', logoPath);
    const logoBuffer = readFileSync(logoPath);
    console.log('Logo loaded successfully, size:', logoBuffer.length, 'bytes');
    
    // If logo is too large (>500KB), return empty to use text fallback
    if (logoBuffer.length > 500000) {
      console.log('Logo too large for email, using text fallback');
      return '';
    }
    
    const logoBase64 = logoBuffer.toString('base64');
    return `data:image/png;base64,${logoBase64}`;
  } catch (error) {
    console.error('Failed to load logo:', error);
    return ''; // Return empty string if logo fails to load
  }
}

// Create email header with logo or text fallback
function getEmailHeader(): string {
  const logoDataURI = getLogoDataURI();
  
  if (logoDataURI) {
    return `<img src="${logoDataURI}" alt="Reconquest Logo" style="width: 250px; height: auto; margin-bottom: 20px;" />`;
  } else {
    // Fallback to styled text logo
    return `
      <div style="margin-bottom: 15px;">
        <h1 style="color: #D4AF37; font-size: 28px; font-weight: bold; margin: 0; text-shadow: 1px 1px 2px rgba(0,0,0,0.2);">
          👑 RECONQUEST
        </h1>
        <p style="color: #5DADE2; font-size: 12px; margin: 3px 0 0 0; letter-spacing: 1px;">BITCOIN LENDING PLATFORM</p>
      </div>
    `;
  }
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
          <strong>— The Reconquest Team 👑</strong>
        </p>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({
    to,
    from: 'Reconquest <noreply@reconquest.app>',
    subject: `🎉 Your Loan #${loanId} Has Been Funded - Deposit Your Collateral`,
    html,
  });
}



