import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { sendEmail } from '../email';
import type { IStorage } from '../storage';

export class PasswordResetService {
  constructor(private storage: IStorage) {}

  async requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
    // Check if user exists
    const user = await this.storage.getUserByEmail(email);
    if (!user) {
      // Don't reveal if email exists or not for security
      return {
        success: true,
        message: "If an account with that email exists, you'll receive a password reset link."
      };
    }

    // Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour from now

    // Save reset token to user
    await this.storage.updateUser(user.id, {
      passwordResetToken: resetToken,
      passwordResetExpires: resetExpires
    });

    // Send password reset email
    try {
      console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
      console.log(`REPLIT_DEV_DOMAIN: ${process.env.REPLIT_DEV_DOMAIN}`);
      
      // Use production domain if deployed, otherwise use Replit dev domain
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : 'https://reconquestp2p.com';
      
      const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
      
      console.log(`Generated reset URL: ${resetUrl}`);
      
      await sendEmail({
        to: user.email,
        from: "noreply@reconquestp2p.com",
        subject: "🔐 Reset Your Reconquest Password",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #D4AF37 0%, #4A90E2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 28px;">🔐 Password Reset Request</h1>
            </div>
            
            <div style="background: white; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #e5e5e5;">
              <h2 style="color: #333; margin-top: 0;">Hello ${user.username},</h2>
              
              <p style="color: #666; line-height: 1.6;">
                We received a request to reset the password for your Reconquest account. If you made this request, click the button below to set a new password:
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" 
                   style="display: inline-block; background: linear-gradient(135deg, #D4AF37 0%, #4A90E2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; text-align: center; font-size: 16px;">
                  Reset Your Password
                </a>
              </div>
              
              <div style="background: #fff3cd; padding: 20px; border-left: 4px solid #ffc107; margin: 20px 0; border-radius: 4px;">
                <h3 style="color: #856404; margin-top: 0;">⚠️ Security Notice</h3>
                <ul style="color: #856404; line-height: 1.6; margin: 0; padding-left: 20px;">
                  <li>This reset link will expire in 1 hour</li>
                  <li>If you didn't request this reset, please contact us at admin@reconquestp2p.com</li>
                  <li>Your password won't change unless you click the link above</li>
                  <li>Never share this reset link with anyone</li>
                </ul>
              </div>
              
              <div style="background: #f8d7da; padding: 20px; border-left: 4px solid #dc3545; margin: 20px 0; border-radius: 4px;">
                <h3 style="color: #721c24; margin-top: 0;">🚨 Didn't Request This?</h3>
                <p style="color: #721c24; line-height: 1.6; margin: 0;">
                  If you did not request this password reset, please contact our admin team immediately at 
                  <a href="mailto:admin@reconquestp2p.com" style="color: #721c24; font-weight: bold;">admin@reconquestp2p.com</a>
                  to secure your account.
                </p>
              </div>
              
              <div style="background: #f0f9ff; padding: 20px; border-radius: 6px; margin: 20px 0;">
                <h4 style="color: #0369a1; margin: 0 0 15px 0;">💡 Account Security Tips:</h4>
                <p style="color: #0369a1; margin: 0; line-height: 1.6;">
                  • Use a strong, unique password for your Reconquest account<br>
                  • Never share your login credentials with anyone<br>
                  • Enable two-factor authentication when available
                </p>
              </div>
              
              <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 30px 0;">
              
              <p style="color: #666; font-size: 14px; line-height: 1.4;">
                If the button doesn't work, you can also copy and paste this link into your browser:<br>
                <a href="${resetUrl}" style="color: #4A90E2; word-break: break-all;">${resetUrl}</a>
              </p>
              
              <p style="color: #999; font-size: 12px; margin-top: 30px;">
                Need help? Contact our support team at 
                <a href="mailto:admin@reconquestp2p.com" style="color: #4A90E2;">admin@reconquestp2p.com</a><br><br>
                The Reconquest Team<br>
                Secure Bitcoin-Backed Lending Platform
              </p>
            </div>
          </div>
        `
      });

      console.log(`Password reset email sent successfully to: ${user.email}`);
      
    } catch (emailError) {
      console.error("Failed to send password reset email:", emailError);
      // Still return success to avoid revealing if email exists
    }

    return {
      success: true,
      message: "If an account with that email exists, you'll receive a password reset link."
    };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    // Find user by reset token
    const user = await this.storage.getUserByPasswordResetToken(token);
    
    if (!user) {
      return {
        success: false,
        message: "Invalid or expired reset token. Please request a new password reset."
      };
    }

    // Check if token has expired
    if (user.passwordResetExpires && user.passwordResetExpires < new Date()) {
      return {
        success: false,
        message: "Reset token has expired. Please request a new password reset."
      };
    }

    // Hash new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password and clear reset token
    await this.storage.updateUser(user.id, {
      password: hashedPassword,
      passwordResetToken: null,
      passwordResetExpires: null,
    });

    // Send password reset confirmation email
    try {
      await this.sendPasswordResetConfirmationEmail(user);
    } catch (emailError) {
      console.error("Failed to send password reset confirmation email:", emailError);
      // Don't fail the password reset if email fails
    }

    console.log(`Password reset completed for user: ${user.email}`);

    return {
      success: true,
      message: "Password has been reset successfully. You can now log in with your new password."
    };
  }

  private async sendPasswordResetConfirmationEmail(user: any): Promise<void> {
    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : 'https://reconquestp2p.com';
    
    const loginUrl = `${baseUrl}/login`;

    await sendEmail({
      to: user.email,
      from: "noreply@reconquestp2p.com",
      subject: "✅ Password Reset Successful - Reconquest",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #D4AF37 0%, #4A90E2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">✅ Password Reset Successful</h1>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #e5e5e5;">
            <h2 style="color: #333; margin-top: 0;">Hello ${user.username},</h2>
            
            <div style="background: #d4edda; padding: 20px; border-left: 4px solid #28a745; margin: 20px 0; border-radius: 4px;">
              <h3 style="color: #155724; margin-top: 0;">🎉 Password Successfully Updated</h3>
              <p style="color: #155724; line-height: 1.6; margin: 0;">
                Your Reconquest account password has been successfully reset and updated. You can now log in with your new password.
              </p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${loginUrl}" 
                 style="display: inline-block; background: linear-gradient(135deg, #D4AF37 0%, #4A90E2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; text-align: center; font-size: 16px;">
                Log In to Your Account
              </a>
            </div>
            
            <div style="background: #fff3cd; padding: 20px; border-left: 4px solid #ffc107; margin: 20px 0; border-radius: 4px;">
              <h3 style="color: #856404; margin-top: 0;">🔒 Account Security Reminder</h3>
              <ul style="color: #856404; line-height: 1.6; margin: 0; padding-left: 20px;">
                <li>Keep your new password secure and don't share it with anyone</li>
                <li>Consider using a password manager for better security</li>
                <li>Contact us immediately if you notice any suspicious activity</li>
              </ul>
            </div>
            
            <div style="background: #f8d7da; padding: 20px; border-left: 4px solid #dc3545; margin: 20px 0; border-radius: 4px;">
              <h3 style="color: #721c24; margin-top: 0;">🚨 Didn't Reset Your Password?</h3>
              <p style="color: #721c24; line-height: 1.6; margin: 0;">
                If you did not reset your password, your account may be compromised. Please contact our admin team immediately at 
                <a href="mailto:admin@reconquestp2p.com" style="color: #721c24; font-weight: bold;">admin@reconquestp2p.com</a>
                for urgent assistance.
              </p>
            </div>
            
            <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 30px 0;">
            
            <p style="color: #999; font-size: 12px; margin-top: 30px;">
              Questions? Contact our support team at 
              <a href="mailto:admin@reconquestp2p.com" style="color: #4A90E2;">admin@reconquestp2p.com</a><br><br>
              The Reconquest Team<br>
              Secure Bitcoin-Backed Lending Platform
            </p>
          </div>
        </div>
      `
    });

    console.log(`Password reset confirmation email sent to: ${user.email}`);
  }
}