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

export async function sendEmail(params: EmailParams): Promise<boolean> {
  try {
    const { data, error } = await resend.emails.send({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    });

    if (error) {
      console.error('Resend email error:', error);
      // Don't fail the signup process for email issues
      return false;
    }

    console.log('Email sent successfully:', data?.id);
    return true;
  } catch (error) {
    console.error('Resend email error:', error);
    return false;
  }
}

// Create logo data URI from PNG file with size optimization for emails
function getLogoDataURI(): string {
  try {
    const logoPath = join(process.cwd(), 'attached_assets', 'Reconquest logo_1751398567900.png');
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

export function createWelcomeEmail(name: string, email: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to Reconquest</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
${getEmailHeader()}
        <h1 style="color: #D4AF37; margin-bottom: 10px;">Welcome to Reconquest</h1>
        <p style="color: #5DADE2; font-size: 18px; margin: 0;">World's #1 Marketplace for Bitcoin-Backed Loans</p>
      </div>
      
      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="color: #333; margin-top: 0;">Thank you for joining our waitlist!</h2>
        <p>Hi ${name ? name : 'there'},</p>
        <p>We're excited to have you on board! You've successfully joined the Reconquest waitlist and you'll be among the first to access our Bitcoin-backed lending platform.</p>
      </div>
      
      <div style="margin-bottom: 20px;">
        <h3 style="color: #D4AF37;">What happens next?</h3>
        <ul style="padding-left: 20px;">
          <li>We'll notify you as soon as the platform launches</li>
          <li>You'll get early access to our lending marketplace</li>
          <li>Exclusive updates on new features and improvements</li>
        </ul>
      </div>
      
      <div style="background: #e8f4f8; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
        <p style="margin: 0; font-size: 14px; color: #666;">
          <strong>Your signup details:</strong><br>
          Email: ${email}<br>
          Date: ${new Date().toLocaleDateString()}
        </p>
      </div>
      
      <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
        <p style="color: #666; font-size: 14px;">
          Thanks for choosing Reconquest<br>
          The Future of Bitcoin-Backed Lending
        </p>
      </div>
    </body>
    </html>
  `;
}

export function createAdminNotificationEmail(signup: any): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Waitlist Signup - Reconquest</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
${getEmailHeader()}
        <h1 style="color: #D4AF37; margin-bottom: 10px;">New Waitlist Signup</h1>
        <p style="color: #5DADE2; font-size: 16px; margin: 0;">Reconquest Platform</p>
      </div>
      
      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
        <h2 style="color: #333; margin-top: 0;">Signup Details</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; width: 30%;">Email:</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${signup.email}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold;">Name:</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${signup.name || 'Not provided'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold;">Interest:</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${signup.interest}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold;">Message:</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${signup.message || 'No message'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold;">Date:</td>
            <td style="padding: 8px 0;">${new Date().toLocaleString()}</td>
          </tr>
        </table>
      </div>
    </body>
    </html>
  `;
}