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
    console.log(`Attempting to send email to: ${params.to}, subject: ${params.subject}`);
    
    const { data, error } = await resend.emails.send({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    });

    if (error) {
      console.error('Resend email error:', error);
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



