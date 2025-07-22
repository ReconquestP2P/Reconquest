import crypto from 'crypto';
import { sendEmail } from '../email';
import type { IStorage } from '../storage';

export interface IEmailVerificationService {
  generateVerificationToken(userId: number): Promise<string>;
  sendVerificationEmail(email: string, username: string, token: string): Promise<void>;
  verifyEmail(token: string): Promise<{ success: boolean; message: string; userId?: number }>;
}

export class EmailVerificationService implements IEmailVerificationService {
  constructor(private storage: IStorage) {}

  async generateVerificationToken(userId: number): Promise<string> {
    // Generate a secure random token
    const token = crypto.randomBytes(32).toString('hex');
    
    // Set expiration to 24 hours from now
    const expirationTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    // Store token in user record
    await this.storage.updateUser(userId, {
      emailVerificationToken: token,
      emailVerificationExpires: expirationTime,
    });
    
    return token;
  }

  async sendVerificationEmail(email: string, username: string, token: string): Promise<void> {
    const verificationUrl = `${process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : 'http://localhost:5000'}/verify-email?token=${token}`;
    
    await sendEmail({
      to: email,
      from: "noreply@reconquestp2p.com",
      subject: "🔐 Verify Your Email - Reconquest Account",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #D4AF37 0%, #F4E5B1 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Email Verification Required</h1>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #e5e5e5;">
            <h2 style="color: #333; margin-top: 0;">Welcome to Reconquest, ${username}!</h2>
            
            <p style="color: #666; line-height: 1.6;">
              Thank you for joining Reconquest, the global marketplace for Bitcoin-backed loans. To ensure the security of your account and start lending or borrowing, please verify your email address.
            </p>
            
            <div style="background: #f8f9fa; padding: 20px; border-left: 4px solid #D4AF37; margin: 20px 0;">
              <h3 style="color: #D4AF37; margin-top: 0;">Action Required</h3>
              <p style="color: #666; line-height: 1.6; margin-bottom: 15px;">
                Click the button below to verify your email and activate your account:
              </p>
              <a href="${verificationUrl}" 
                 style="display: inline-block; background: linear-gradient(135deg, #D4AF37 0%, #4A90E2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; text-align: center;">
                Verify Email Address
              </a>
            </div>
            
            <p style="color: #666; line-height: 1.6;">
              <strong>Security Notice:</strong> This verification link will expire in 24 hours. If you didn't create an account with Reconquest, you can safely ignore this email.
            </p>
            
            <div style="background: #f0f9ff; padding: 15px; border-radius: 6px; margin: 20px 0;">
              <h4 style="color: #0369a1; margin: 0 0 10px 0;">What happens after verification?</h4>
              <ul style="color: #0369a1; margin: 0; padding-left: 20px;">
                <li>Full access to borrowing and lending features</li>
                <li>Ability to create and fund loan requests</li>
                <li>Email notifications for loan activities</li>
                <li>Complete account security protection</li>
              </ul>
            </div>
            
            <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 30px 0;">
            
            <p style="color: #666; font-size: 14px; line-height: 1.4;">
              If the button doesn't work, you can also copy and paste this link into your browser:<br>
              <a href="${verificationUrl}" style="color: #4A90E2; word-break: break-all;">${verificationUrl}</a>
            </p>
            
            <p style="color: #999; font-size: 12px; margin-top: 30px;">
              Best regards,<br>
              The Reconquest Team<br>
              <a href="mailto:admin@reconquestp2p.com" style="color: #4A90E2;">admin@reconquestp2p.com</a>
            </p>
          </div>
        </div>
      `
    });
  }

  async verifyEmail(token: string): Promise<{ success: boolean; message: string; userId?: number }> {
    // Find user by verification token
    const user = await this.storage.getUserByVerificationToken(token);
    
    if (!user) {
      return {
        success: false,
        message: "Invalid verification token. Please request a new verification email."
      };
    }

    // Check if token has expired
    if (user.emailVerificationExpires && user.emailVerificationExpires < new Date()) {
      return {
        success: false,
        message: "Verification token has expired. Please request a new verification email."
      };
    }

    // Check if email is already verified
    if (user.emailVerified) {
      return {
        success: true,
        message: "Email is already verified. You can now log in to your account."
      };
    }

    // Verify the email
    await this.storage.updateUser(user.id, {
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null,
    });

    // Send welcome email to user after successful verification
    try {
      await sendEmail({
        to: user.email,
        from: "noreply@reconquestp2p.com",
        subject: "🎉 Welcome to Reconquest - Your Account is Verified!",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #D4AF37 0%, #4A90E2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 28px;">🎉 Welcome to Reconquest!</h1>
            </div>
            
            <div style="background: white; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #e5e5e5;">
              <h2 style="color: #333; margin-top: 0;">Your Account is Verified, ${user.username}!</h2>
              
              <p style="color: #666; line-height: 1.6;">
                Congratulations! Your email has been successfully verified and your Reconquest account is now fully activated. You can now access all platform features to start your Bitcoin-backed lending journey.
              </p>
              
              <div style="background: #d4edda; padding: 20px; border-left: 4px solid #28a745; margin: 20px 0; border-radius: 4px;">
                <h3 style="color: #155724; margin-top: 0;">✅ What you can do now:</h3>
                <ul style="color: #155724; line-height: 1.6; margin: 0; padding-left: 20px;">
                  <li><strong>Borrow:</strong> Request loans using your Bitcoin as collateral</li>
                  <li><strong>Lend:</strong> Earn fixed returns by funding loan requests</li>
                  <li><strong>Manage:</strong> Track your loan portfolio and activity</li>
                  <li><strong>Secure:</strong> Full access to all security features</li>
                </ul>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.NODE_ENV === 'production' ? 'https://reconquestp2p.com' : 'http://localhost:5000'}/login" 
                   style="display: inline-block; background: linear-gradient(135deg, #D4AF37 0%, #4A90E2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; text-align: center; font-size: 16px;">
                  Log In to Your Account
                </a>
              </div>
              
              <div style="background: #f0f9ff; padding: 20px; border-radius: 6px; margin: 20px 0;">
                <h4 style="color: #0369a1; margin: 0 0 15px 0;">🔰 Getting Started Tips:</h4>
                <p style="color: #0369a1; margin: 0; line-height: 1.6;">
                  • <strong>Borrowers:</strong> Calculate your collateral needs with our loan calculator<br>
                  • <strong>Lenders:</strong> Browse available loan requests and choose your terms<br>
                  • <strong>Security:</strong> All transactions are secured with Bitcoin smart contracts
                </p>
              </div>
              
              <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 30px 0;">
              
              <p style="color: #666; font-size: 14px; line-height: 1.4;">
                <strong>Need help?</strong> Contact our support team at 
                <a href="mailto:admin@reconquestp2p.com" style="color: #4A90E2;">admin@reconquestp2p.com</a>
              </p>
              
              <p style="color: #999; font-size: 12px; margin-top: 30px;">
                Welcome to the future of Bitcoin-backed lending,<br>
                The Reconquest Team<br>
                <a href="mailto:admin@reconquestp2p.com" style="color: #4A90E2;">admin@reconquestp2p.com</a>
              </p>
            </div>
          </div>
        `
      });
      console.log(`Welcome email sent successfully to verified user: ${user.email}`);
    } catch (emailError) {
      console.error("Failed to send welcome email to user:", emailError);
    }

    // Send admin notification about new verified user
    try {
      await sendEmail({
        to: "admin@reconquestp2p.com",
        from: "noreply@reconquestp2p.com",
        subject: `🔔 [ADMIN ALERT] Email Verification Completed - ${user.username}`,
        html: `
          <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
            <div style="background: linear-gradient(135deg, #FFD700 0%, #4A90E2 100%); padding: 20px; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; text-align: center;">Email Verified</h1>
            </div>
            
            <div style="background: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <h2 style="color: #333; margin-top: 0;">User Email Verification</h2>
              
              <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #333; margin-top: 0;">User Details</h3>
                <p><strong>Username:</strong> ${user.username}</p>
                <p><strong>Email:</strong> ${user.email}</p>
                <p><strong>Registration Date:</strong> ${user.createdAt.toLocaleDateString()}</p>
                <p><strong>Account Role:</strong> ${user.role}</p>
              </div>
              
              <p style="color: #666;">The user has successfully verified their email address and can now access all platform features.</p>
            </div>
          </div>
        `
      });
    } catch (error) {
      console.error('Failed to send admin verification notification:', error);
    }

    return {
      success: true,
      message: "Email successfully verified! You can now log in to your account.",
      userId: user.id
    };
  }
}