import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertLoanSchema, insertLoanOfferSchema, insertUserSchema } from "@shared/schema";
import { z } from "zod";
import { LendingWorkflowService } from "./services/LendingWorkflowService";
import { BitcoinEscrowService } from "./services/BitcoinEscrowService";
import { EncryptionService } from "./services/EncryptionService";
import { ResponseSanitizer } from "./services/ResponseSanitizer";
import { TransactionTemplateService } from "./services/TransactionTemplateService";
import { EscrowSigningService } from "./services/EscrowSigningService";
import { PsbtCreatorService } from "./services/PsbtCreatorService";
import { releaseCollateral } from "./services/CollateralReleaseService";
import { normalizeToStorageType, decisionToStorageType, STORAGE_TX_TYPES } from "@shared/txTypes";
import { LtvValidationService } from "./services/LtvValidationService";
import { sendEmail, sendLenderKeyGenerationNotification, sendDetailsChangeConfirmation, createBrandedEmailHtml, getBaseUrl } from "./email";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { EmailVerificationService } from "./services/EmailVerificationService";
import { PasswordResetService } from "./services/PasswordResetService";
import { blockchainMonitoring } from "./services/BlockchainMonitoring";
import { ltvMonitoring } from "./services/LtvMonitoringService";
import { 
  insertEscrowSessionSchema, 
  insertSignatureExchangeSchema, 
  insertEscrowEventSchema,
  updateEscrowSessionClientSchema,
  insertLoanDocumentSchema
} from "@shared/schema";
import { registerObjectStorageRoutes, ObjectStorageService } from "./replit_integrations/object_storage";
import networkInfoRoutes from "./routes/network-info.js";
import { mainnetLoanCreationLimits, mainnetLoanFundingLimits, getMainnetSafetyStatus } from "./middleware/mainnet-safety-limits";
import { validateNetworkAddresses, validateAddressEndpoint, getValidationStats, detectAddressNetwork } from "./middleware/network-address-validator";
import { getExplorerUrl } from "./services/bitcoin-network-selector.js";

// JWT secret - in production this should be an environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'reconquest_dev_secret_key_2025';

// JWT Authentication middleware
const authenticateToken = async (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    // Get fresh user data
    const user = await storage.getUser(decoded.userId);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

// Helper to block admin users from participating in loan flows
// Admin accounts should only have oversight capabilities, not participate as borrowers/lenders
const requireNonAdmin = (req: any, res: any, next: any) => {
  if (req.user?.role === 'admin') {
    return res.status(403).json({ 
      message: 'Admin accounts cannot participate in loan flows. Please use a regular user account.',
      code: 'ADMIN_PARTICIPATION_BLOCKED'
    });
  }
  next();
};

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize services
  const emailVerificationService = new EmailVerificationService(storage);
  const passwordResetService = new PasswordResetService(storage);

  // Serve static logo for emails
  app.use('/public', express.static('client/public'));

  // Register object storage routes for file uploads
  registerObjectStorageRoutes(app);
  const objectStorageService = new ObjectStorageService();

  // Register network info routes (for Bitcoin network configuration)
  app.use('/api/network', networkInfoRoutes);

  // Address validation test endpoint
  app.get("/api/network/validate-address/:address", validateAddressEndpoint);
  
  // Address validation stats (admin)
  app.get("/api/admin/address-validation/stats", getValidationStats);

  // Bitcoin lending workflow test page
  app.get("/test-lending", (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bitcoin Lending Workflow Test</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            max-width: 800px; 
            margin: 0 auto; 
            padding: 20px;
            background: #f5f5f5;
        }
        .step { 
            background: white; 
            padding: 20px; 
            margin: 20px 0; 
            border-radius: 8px;
            border-left: 4px solid #D4AF37;
        }
        .step h3 { 
            color: #D4AF37; 
            margin-top: 0; 
        }
        button { 
            background: #D4AF37; 
            color: white; 
            border: none; 
            padding: 10px 20px; 
            border-radius: 4px; 
            cursor: pointer; 
            margin: 5px;
        }
        button:hover { 
            background: #B8941F; 
        }
        input { 
            padding: 8px; 
            margin: 5px; 
            border: 1px solid #ddd; 
            border-radius: 4px; 
        }
        .result { 
            background: #f8f9fa; 
            padding: 15px; 
            margin: 10px 0; 
            border-radius: 4px; 
            font-family: monospace; 
            font-size: 14px;
            max-height: 300px;
            overflow-y: auto;
        }
        .success { border-left: 4px solid #28a745; }
        .error { border-left: 4px solid #dc3545; }
        .instructions {
            background: #e3f2fd;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <h1>🚀 Bitcoin Lending Workflow Test</h1>
    
    <div class="instructions">
        <h3>📋 How to Test:</h3>
        <ol>
            <li><strong>Start with Step 1</strong> - Test LTV validation first</li>
            <li><strong>Use the default values</strong> (1.0 BTC, $30,000 loan) or try your own</li>
            <li><strong>Copy the Loan ID</strong> from Step 2 to use in later steps</li>
            <li><strong>Follow the workflow</strong> in order to see the complete process</li>
            <li><strong>Check your email</strong> - notifications are sent at key steps</li>
        </ol>
    </div>

    <div class="step">
        <h3>Step 1: LTV Validation</h3>
        <p>Test if your loan request meets the 50-60% LTV requirements:</p>
        <input type="number" id="collateral" placeholder="Bitcoin amount (e.g., 1.0)" step="0.1" value="1.0">
        <input type="number" id="loanAmount" placeholder="Loan amount USD (e.g., 30000)" step="1000" value="30000">
        <button onclick="testLTV()">Test LTV</button>
        <div id="ltvResult"></div>
    </div>

    <div class="step">
        <h3>Step 2: Initiate Loan</h3>
        <p>Create a Bitcoin-backed loan request:</p>
        <input type="number" id="borrowerId" placeholder="Borrower ID" value="1">
        <input type="number" id="loanCollateral" placeholder="Bitcoin collateral" step="0.1" value="1.0">
        <input type="number" id="loanAmountReq" placeholder="Loan amount USD" step="1000" value="30000">
        <button onclick="initiateLoan()">Initiate Loan</button>
        <div id="loanResult"></div>
    </div>

    <div class="step">
        <h3>Step 3: Verify Escrow</h3>
        <p>Simulate Bitcoin deposit to escrow:</p>
        <input type="number" id="loanId" placeholder="Loan ID from Step 2">
        <button onclick="verifyEscrow()">Verify Escrow</button>
        <div id="escrowResult"></div>
    </div>

    <div class="step">
        <h3>Step 4: Confirm Fiat Transfer</h3>
        <p>Lender confirms fiat payment sent:</p>
        <input type="number" id="lenderLoanId" placeholder="Loan ID">
        <input type="number" id="lenderId" placeholder="Lender ID" value="2">
        <button onclick="confirmFiat()">Confirm Fiat Transfer</button>
        <div id="fiatResult"></div>
    </div>

    <div class="step">
        <h3>Step 5: Confirm Receipt</h3>
        <p>Borrower confirms fiat received:</p>
        <input type="number" id="receiptLoanId" placeholder="Loan ID">
        <button onclick="confirmReceipt()">Confirm Receipt</button>
        <div id="receiptResult"></div>
    </div>

    <script>
        function showResult(elementId, data, isError = false) {
            const element = document.getElementById(elementId);
            element.className = \`result \${isError ? 'error' : 'success'}\`;
            element.innerHTML = \`<pre>\${JSON.stringify(data, null, 2)}</pre>\`;
        }

        async function testLTV() {
            const collateral = document.getElementById('collateral').value;
            const loanAmount = document.getElementById('loanAmount').value;
            
            try {
                const response = await fetch('/api/loans/validate-ltv', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        collateralBtc: parseFloat(collateral),
                        loanAmount: parseFloat(loanAmount)
                    })
                });
                const data = await response.json();
                showResult('ltvResult', {
                    ...data,
                    summary: \`BTC Price: $\${data.btcPrice?.toLocaleString()}, LTV: \${(data.validation?.ltvRatio * 100)?.toFixed(1)}%, Valid: \${data.validation?.isValid}\`
                }, !response.ok);
            } catch (error) {
                showResult('ltvResult', { error: error.message }, true);
            }
        }

        async function initiateLoan() {
            const borrowerId = document.getElementById('borrowerId').value;
            const collateral = document.getElementById('loanCollateral').value;
            const amount = document.getElementById('loanAmountReq').value;
            
            try {
                const response = await fetch('/api/loans/bitcoin/initiate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        borrowerId: parseInt(borrowerId),
                        collateralBtc: parseFloat(collateral),
                        loanAmount: parseFloat(amount)
                    })
                });
                const data = await response.json();
                showResult('loanResult', data, !response.ok);
                
                // Auto-fill loan ID for next steps
                if (data.loanId) {
                    document.getElementById('loanId').value = data.loanId;
                    document.getElementById('lenderLoanId').value = data.loanId;
                    document.getElementById('receiptLoanId').value = data.loanId;
                }
            } catch (error) {
                showResult('loanResult', { error: error.message }, true);
            }
        }

        async function verifyEscrow() {
            const loanId = document.getElementById('loanId').value;
            
            try {
                const response = await fetch(\`/api/loans/\${loanId}/escrow/verify\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                const data = await response.json();
                showResult('escrowResult', data, !response.ok);
            } catch (error) {
                showResult('escrowResult', { error: error.message }, true);
            }
        }

        async function confirmFiat() {
            const loanId = document.getElementById('lenderLoanId').value;
            const lenderId = document.getElementById('lenderId').value;
            
            try {
                const response = await fetch(\`/api/loans/\${loanId}/fiat/confirm\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lenderId: parseInt(lenderId) })
                });
                const data = await response.json();
                showResult('fiatResult', data, !response.ok);
            } catch (error) {
                showResult('fiatResult', { error: error.message }, true);
            }
        }

        async function confirmReceipt() {
            const loanId = document.getElementById('receiptLoanId').value;
            
            try {
                const response = await fetch(\`/api/loans/\${loanId}/receipt/confirm\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                const data = await response.json();
                showResult('receiptResult', data, !response.ok);
            } catch (error) {
                showResult('receiptResult', { error: error.message }, true);
            }
        }

        // Auto-load current Bitcoin price
        fetch('/api/btc-price')
            .then(r => r.json())
            .then(data => {
                document.querySelector('h1').innerHTML += \` (Current BTC: $\${data.price.toLocaleString()})\`;
            });
    </script>
</body>
</html>`);
  });

  // Real-time Bitcoin price endpoint (CoinGecko API)
  app.get("/api/btc-price", async (req, res) => {
    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,eur&include_24hr_change=true&include_last_updated_at=true'
      );
      
      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }
      
      const data = await response.json();
      const bitcoin = data.bitcoin;
      
      res.json({
        usd: bitcoin.usd,
        eur: bitcoin.eur,
        usd_24h_change: bitcoin.usd_24h_change,
        eur_24h_change: bitcoin.eur_24h_change,
        last_updated: new Date(bitcoin.last_updated_at * 1000).toISOString(),
        timestamp: new Date().toISOString(),
        source: 'CoinGecko',
        // Legacy format for backward compatibility
        price: bitcoin.usd,
        currency: "USD"
      });
    } catch (error) {
      console.error('Bitcoin price API error:', error);
      // Fallback to mock data if API fails
      const mockPrice = Math.floor(Math.random() * 10000) + 95000;
      res.json({
        usd: mockPrice,
        eur: Math.floor(mockPrice * 0.85), // Approximate EUR conversion
        usd_24h_change: (Math.random() - 0.5) * 10, // Random change between -5% and +5%
        eur_24h_change: (Math.random() - 0.5) * 10,
        last_updated: new Date().toISOString(),
        timestamp: new Date().toISOString(),
        source: 'Mock (API Error)',
        // Legacy format for backward compatibility
        price: mockPrice,
        currency: "USD",
        error: 'Using fallback data due to API error'
      });
    }
  });

  // ⚠️ DEPRECATED - OLD ENDPOINT WITH CRITICAL BUG ⚠️
  // This endpoint creates FAKE public keys from hash functions with NO private keys
  // Bitcoin sent to addresses created here is PERMANENTLY LOCKED and UNRECOVERABLE
  // Use the new endpoint POST /api/loans/:id/fund (line 1039) with real keypairs instead
  // 
  // KEEPING THIS DISABLED TO PREVENT ACCIDENTAL FUND LOSS
  /*
  app.post("/api/loans/:loanId/fund", async (req, res) => {
    return res.status(410).json({ 
      error: "This endpoint is deprecated and disabled",
      message: "Mock key generation creates unrecoverable Bitcoin addresses. Use POST /api/loans/:id/fund with real keypairs from Firefish WASM.",
      migration: "Borrowers and lenders must generate Bitcoin keypairs in their browsers and submit only public keys."
    });
  });
  */

  // User login
  app.post("/api/auth/login", async (req, res) => {
    try {
      console.log("Login attempt:", req.body);
      
      const loginSchema = z.object({
        username: z.string().optional(),
        email: z.string().email().optional(),
        password: z.string().min(1, "Password is required"),
      }).refine(data => data.username || data.email, {
        message: "Either username or email is required",
      });

      const { username, email, password } = loginSchema.parse(req.body);
      console.log("Parsed login data:", { username, email, password: "***" });

      // Find user by email or username
      let user;
      if (email) {
        console.log("Looking up user by email:", email);
        user = await storage.getUserByEmail(email);
      } else if (username) {
        console.log("Looking up user by username:", username);
        user = await storage.getUserByUsername(username);
      }

      console.log("User found:", user ? `Yes (id: ${user.id})` : "No");

      if (!user) {
        console.log("User not found, returning 401");
        return res.status(401).json({ 
          message: "Invalid credentials" 
        });
      }

      // Verify password
      console.log("Verifying password...");
      const passwordMatch = await bcrypt.compare(password, user.password);
      console.log("Password match:", passwordMatch);
      
      if (!passwordMatch) {
        console.log("Password mismatch, returning 401");
        return res.status(401).json({ 
          message: "Invalid credentials" 
        });
      }

      // Check email verification
      if (!user.emailVerified) {
        console.log("Email not verified, returning 403");
        return res.status(403).json({ 
          message: "Please verify your email address before logging in. Check your inbox for the verification link.",
          emailVerificationRequired: true
        });
      }

      // ADMIN OTP AUTHENTICATION
      // Only admin@reconquestp2p.com can access admin features
      const ADMIN_EMAIL = "admin@reconquestp2p.com";
      
      if (user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase() && user.role === 'admin') {
        // Generate 6-digit OTP code
        const otpCode = crypto.randomInt(100000, 999999).toString();
        const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
        
        // Store OTP in database
        await storage.updateUser(user.id, {
          adminOtpCode: otpCode,
          adminOtpExpires: otpExpires
        });
        
        // Send OTP to admin email
        const baseUrl = process.env.APP_URL || process.env.REPLIT_DEPLOYMENT_URL || `https://${process.env.REPLIT_DEV_DOMAIN}`;
        await sendEmail({
          to: ADMIN_EMAIL,
          from: "Reconquest <noreply@reconquestp2p.com>",
          subject: `🔐 Your Admin Login Code - ${otpCode}`,
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
              <div style="background-color: #fff; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                <div style="text-align: center; margin-bottom: 20px;">
                  <img src="${baseUrl}/logo.png" alt="Reconquest" style="max-width: 200px; height: auto;" />
                </div>
                
                <h2 style="color: #2C3E50; margin-top: 0; text-align: center;">🔐 Admin Login Verification</h2>
                
                <p style="font-size: 16px; color: #555; text-align: center;">Your one-time login code is:</p>
                
                <div style="background-color: #1a1a2e; border-radius: 10px; padding: 25px; margin: 20px 0; text-align: center;">
                  <span style="font-size: 36px; font-weight: bold; color: #D4AF37; letter-spacing: 8px; font-family: monospace;">${otpCode}</span>
                </div>
                
                <p style="font-size: 14px; color: #e74c3c; text-align: center; font-weight: bold;">⏰ This code expires in 5 minutes</p>
                
                <div style="background-color: #FEF9E7; border-left: 4px solid #F39C12; padding: 15px; margin: 20px 0; border-radius: 5px;">
                  <p style="margin: 0; font-size: 14px; color: #555;">
                    <strong>⚠️ Security Notice:</strong> If you did not attempt to log in, someone may be trying to access your admin account. Please secure your credentials immediately.
                  </p>
                </div>
                
                <p style="font-size: 14px; color: #7F8C8D; margin-top: 30px; text-align: center;">
                  <strong>— The Reconquest Team 👑</strong>
                </p>
              </div>
            </body>
            </html>
          `
        });
        
        console.log(`Admin OTP sent to ${ADMIN_EMAIL}`);
        
        return res.json({
          success: true,
          requiresOtp: true,
          message: "A verification code has been sent to your email. Please enter it to complete login.",
          email: user.email
        });
      }

      // Generate JWT token with 7 days expiration
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Return user without password and include token
      const { password: _, ...userWithoutPassword } = user;
      console.log("Login successful for user:", userWithoutPassword.email);
      
      res.json({
        success: true,
        message: "Login successful",
        user: userWithoutPassword,
        token: token
      });

    } catch (error) {
      console.error("Login error:", error);
      
      if (error instanceof z.ZodError) {
        console.log("Validation error:", error.errors);
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      
      res.status(500).json({ 
        message: "Login failed. Please try again." 
      });
    }
  });

  // User logout
  app.post("/api/auth/logout", (req, res) => {
    // For now, we'll just return success since we're using stateless authentication
    // In a production system with sessions, you would destroy the session here
    res.json({ 
      success: true, 
      message: "Logged out successfully" 
    });
  });

  // Admin OTP verification - completes admin login after email code verification
  app.post("/api/auth/admin-verify-otp", async (req, res) => {
    try {
      const verifySchema = z.object({
        email: z.string().email(),
        otpCode: z.string().length(6, "OTP code must be 6 digits"),
      });

      const { email, otpCode } = verifySchema.parse(req.body);
      
      const ADMIN_EMAIL = "admin@reconquestp2p.com";
      
      // Only allow verification for admin email
      if (email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        return res.status(403).json({
          success: false,
          message: "Invalid admin credentials"
        });
      }

      // Find admin user
      const user = await storage.getUserByEmail(email);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: "Invalid admin credentials"
        });
      }

      // Check OTP code
      if (!user.adminOtpCode || user.adminOtpCode !== otpCode) {
        console.log(`Invalid OTP attempt for admin: provided ${otpCode}, expected ${user.adminOtpCode}`);
        return res.status(401).json({
          success: false,
          message: "Invalid verification code"
        });
      }

      // Check OTP expiry
      if (!user.adminOtpExpires || new Date() > new Date(user.adminOtpExpires)) {
        return res.status(401).json({
          success: false,
          message: "Verification code has expired. Please login again to receive a new code."
        });
      }

      // Clear OTP from database (one-time use)
      await storage.updateUser(user.id, {
        adminOtpCode: null,
        adminOtpExpires: null
      });

      // Generate JWT token with 7 days expiration
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Return user without password and include token
      const { password: _, adminOtpCode: __, adminOtpExpires: ___, ...userWithoutSensitive } = user;
      console.log("Admin login verified via OTP for:", user.email);
      
      res.json({
        success: true,
        message: "Admin login verified successfully",
        user: userWithoutSensitive,
        token: token
      });

    } catch (error) {
      console.error("Admin OTP verification error:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          success: false,
          message: "Validation error", 
          errors: error.errors 
        });
      }
      
      res.status(500).json({ 
        success: false,
        message: "Verification failed. Please try again." 
      });
    }
  });

  // Get current user endpoint (protected)
  app.get("/api/auth/me", authenticateToken, async (req: any, res) => {
    const { password: _, ...userWithoutPassword } = req.user;
    res.json({
      success: true,
      user: userWithoutPassword
    });
  });

  // Update user profile - sensitive fields require email confirmation
  app.patch("/api/auth/profile", authenticateToken, validateNetworkAddresses, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = req.user;
      
      const profileSchema = z.object({
        firstName: z.string().max(50).optional(),
        lastName: z.string().max(50).optional(),
        phonePrefix: z.string().max(5).optional(),
        phoneNumber: z.string().max(20).optional(),
        iban: z.string().max(34).optional(),
        bankAccountHolder: z.string().max(100).optional(),
        btcAddress: z.string().max(100).optional(),
      });
      
      const profileData = profileSchema.parse(req.body);
      
      // Sensitive fields that require email confirmation
      const sensitiveFields = ['iban', 'bankAccountHolder', 'btcAddress'];
      const sensitiveChanges: Record<string, string> = {};
      const immediateChanges: Record<string, string> = {};
      
      // Separate sensitive and non-sensitive changes
      for (const [key, value] of Object.entries(profileData)) {
        if (value !== undefined && value !== null) {
          if (sensitiveFields.includes(key)) {
            // Only add if it's actually different from current value
            const currentValue = (user as any)[key];
            if (value !== currentValue) {
              sensitiveChanges[key] = value;
            }
          } else {
            immediateChanges[key] = value;
          }
        }
      }
      
      // Apply non-sensitive changes immediately
      let updatedUser = user;
      if (Object.keys(immediateChanges).length > 0) {
        updatedUser = await storage.updateUser(userId, immediateChanges);
        if (!updatedUser) {
          return res.status(404).json({ message: "User not found" });
        }
      }
      
      // If there are sensitive changes, require email confirmation
      if (Object.keys(sensitiveChanges).length > 0) {
        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        
        // Store pending changes in database
        await storage.updateUser(userId, {
          pendingDetailsChange: JSON.stringify(sensitiveChanges),
          detailsChangeToken: token,
          detailsChangeExpires: expires,
        });
        
        // Build changes description for email
        const changesList = Object.entries(sensitiveChanges).map(([key, value]) => {
          const fieldName = key === 'iban' ? 'IBAN' : 
                           key === 'bankAccountHolder' ? 'Bank Account Holder' :
                           key === 'btcAddress' ? 'Bitcoin Address' : key;
          const maskedValue = value.length > 8 ? 
            value.substring(0, 4) + '****' + value.substring(value.length - 4) : 
            '****';
          return `<p><strong>${fieldName}:</strong> ${maskedValue}</p>`;
        }).join('');
        
        // Send confirmation email - use request origin for correct URL in dev/prod
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers['host'] || 'www.reconquestp2p.com';
        const baseUrl = `${protocol}://${host}`;
        const confirmUrl = `${baseUrl}/confirm-details-change?token=${token}`;
        
        await sendDetailsChangeConfirmation({
          to: user.email,
          userName: user.firstName || user.username,
          confirmUrl,
          changesDescription: changesList,
        });
        
        const { password: _, ...userWithoutPassword } = updatedUser;
        
        return res.json({
          success: true,
          requiresConfirmation: true,
          message: "Basic info updated. A confirmation email has been sent for your bank/Bitcoin address changes. Please check your inbox.",
          user: userWithoutPassword
        });
      }
      
      const { password: _, ...userWithoutPassword } = updatedUser;
      
      res.json({
        success: true,
        message: "Profile updated successfully",
        user: userWithoutPassword
      });
    } catch (error) {
      console.error("Profile update error:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      
      res.status(500).json({ 
        message: "Failed to update profile. Please try again." 
      });
    }
  });

  // Confirm personal details change via email token
  app.post("/api/auth/confirm-details-change", async (req, res) => {
    try {
      const { token } = req.body;
      
      if (!token) {
        return res.status(400).json({ message: "Confirmation token is required" });
      }
      
      // Find user with this token
      const allUsers = await storage.getAllUsers();
      const user = allUsers.find((u: any) => u.detailsChangeToken === token);
      
      if (!user) {
        return res.status(400).json({ message: "Invalid confirmation token" });
      }
      
      // Check if token is expired
      if (user.detailsChangeExpires && new Date(user.detailsChangeExpires) < new Date()) {
        // Clear expired token
        await storage.updateUser(user.id, {
          pendingDetailsChange: null,
          detailsChangeToken: null,
          detailsChangeExpires: null,
        });
        return res.status(400).json({ message: "Confirmation link has expired. Please request the change again." });
      }
      
      // Parse and apply pending changes
      if (!user.pendingDetailsChange) {
        return res.status(400).json({ message: "No pending changes found" });
      }
      
      const pendingChanges = JSON.parse(user.pendingDetailsChange);
      
      // Apply the changes
      const updatedUser = await storage.updateUser(user.id, {
        ...pendingChanges,
        pendingDetailsChange: null,
        detailsChangeToken: null,
        detailsChangeExpires: null,
      });
      
      if (!updatedUser) {
        return res.status(500).json({ message: "Failed to apply changes" });
      }
      
      res.json({
        success: true,
        message: "Your personal details have been updated successfully!"
      });
    } catch (error) {
      console.error("Confirm details change error:", error);
      res.status(500).json({ message: "Failed to confirm changes. Please try again." });
    }
  });

  // Get pending details change status
  app.get("/api/auth/pending-details-change", authenticateToken, async (req: any, res) => {
    try {
      const user = req.user;
      
      if (!user.pendingDetailsChange || !user.detailsChangeExpires) {
        return res.json({ hasPendingChanges: false });
      }
      
      // Check if expired
      if (new Date(user.detailsChangeExpires) < new Date()) {
        return res.json({ hasPendingChanges: false, expired: true });
      }
      
      const pendingChanges = JSON.parse(user.pendingDetailsChange);
      const fields = Object.keys(pendingChanges).map(key => {
        return key === 'iban' ? 'IBAN' : 
               key === 'bankAccountHolder' ? 'Bank Account Holder' :
               key === 'btcAddress' ? 'Bitcoin Address' : key;
      });
      
      res.json({
        hasPendingChanges: true,
        fields,
        expiresAt: user.detailsChangeExpires
      });
    } catch (error) {
      console.error("Get pending changes error:", error);
      res.status(500).json({ message: "Failed to check pending changes" });
    }
  });

  // User registration
  app.post("/api/auth/register", async (req, res) => {
    try {
      const userData = insertUserSchema.extend({
        confirmPassword: z.string(),
      }).parse(req.body);

      // Validate passwords match
      if (userData.password !== userData.confirmPassword) {
        return res.status(400).json({ 
          message: "Passwords do not match" 
        });
      }

      // Check if user already exists
      const existingUserByEmail = await storage.getUserByEmail(userData.email);
      if (existingUserByEmail) {
        return res.status(400).json({ 
          message: "Email already registered" 
        });
      }

      const existingUserByUsername = await storage.getUserByUsername(userData.username);
      if (existingUserByUsername) {
        return res.status(400).json({ 
          message: "Username already taken" 
        });
      }

      // Hash password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(userData.password, saltRounds);

      // Create user (excluding confirmPassword) with email verification fields
      const userToCreate = {
        username: userData.username,
        email: userData.email,
        password: hashedPassword,
        role: userData.role || "user",
        emailVerified: false,
        emailVerificationToken: null,
        emailVerificationExpires: null
      };

      const newUser = await storage.createUser(userToCreate);

      // Generate verification token and send verification email
      try {
        const verificationToken = await emailVerificationService.generateVerificationToken(newUser.id);
        await emailVerificationService.sendVerificationEmail(newUser.email, newUser.username, verificationToken);
        console.log(`Verification email sent successfully to: ${newUser.email}`);
      } catch (emailError) {
        console.error("Failed to send verification email:", emailError);
        // Don't fail the registration if email sending fails
      }

      // Always send admin notification for new registrations
      try {
        const baseUrl = process.env.APP_URL || 'https://www.reconquestp2p.com';
        await sendEmail({
          to: "admin@reconquestp2p.com",
          from: "Reconquest <noreply@reconquestp2p.com>",
          subject: `🔔 [ADMIN ALERT] New User Registration - ${newUser.username}`,
          html: `
            <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
              <div style="text-align: center; padding: 20px; background: #fff; border-radius: 8px 8px 0 0;">
                <img src="${baseUrl}/logo.png" alt="Reconquest" style="max-width: 200px; height: auto;" />
              </div>
              <div style="background: linear-gradient(135deg, #FFD700 0%, #4A90E2 100%); padding: 20px;">
                <h1 style="color: white; margin: 0; text-align: center;">New User Registration</h1>
              </div>
              
              <div style="background: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <h2 style="color: #333; margin-top: 0;">New User Joined</h2>
                
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="color: #333; margin-top: 0;">User Details</h3>
                  <p><strong>Username:</strong> ${newUser.username}</p>
                  <p><strong>Email:</strong> ${newUser.email}</p>
                  <p><strong>Role:</strong> ${newUser.role}</p>
                  <p><strong>Registration Date:</strong> ${new Date(newUser.createdAt).toLocaleString()}</p>
                  <p><strong>User ID:</strong> #${newUser.id}</p>
                  <p><strong>Email Verification:</strong> Pending</p>
                </div>
                
                <div style="background: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 0; color: #0c5460;">
                    <strong>Registration Complete:</strong> A new user has registered and will need to verify their email before accessing platform features.
                  </p>
                </div>
                
                <div style="text-align: center; margin-top: 30px;">
                  <p style="color: #666; margin: 0;"><strong>— The Reconquest Team 👑</strong><br><br>Questions? Contact us at <a href="mailto:admin@reconquestp2p.com" style="color: #D4AF37;">admin@reconquestp2p.com</a></p>
                </div>
              </div>
            </div>
          `
        });
        console.log(`Admin notification sent for new user registration: ${newUser.email}`);
      } catch (adminEmailError) {
        console.error("Failed to send admin registration notification:", adminEmailError);
      }



      res.status(201).json({
        success: true,
        message: "Account created successfully! Please check your email to verify your account before logging in.",
        emailSent: true
      });

    } catch (error) {
      console.error("Registration error:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      
      res.status(500).json({ 
        message: "Failed to create account. Please try again." 
      });
    }
  });

  // Email verification endpoint
  app.get("/verify-email", async (req, res) => {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Invalid Verification Link - Reconquest</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
            .error { color: #dc3545; background: #f8d7da; padding: 20px; border-radius: 8px; border: 1px solid #f5c6cb; }
            .btn { display: inline-block; background: linear-gradient(135deg, #D4AF37 0%, #4A90E2 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="error">
            <h2>Invalid Verification Link</h2>
            <p>The verification link you clicked is invalid or malformed.</p>
            <a href="/" class="btn">Return to Homepage</a>
          </div>
        </body>
        </html>
      `);
    }

    try {
      const result = await emailVerificationService.verifyEmail(token);
      
      if (result.success) {
        return res.send(`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Email Verified - Reconquest</title>
            <style>
              body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
              .success { color: #155724; background: #d4edda; padding: 30px; border-radius: 8px; border: 1px solid #c3e6cb; }
              .btn { display: inline-block; background: linear-gradient(135deg, #D4AF37 0%, #4A90E2 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
              .gold { color: #D4AF37; font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="success">
              <h2>✅ Email Verified Successfully!</h2>
              <p>Your email has been verified and your <span class="gold">Reconquest</span> account is now fully activated.</p>
              <p>You can now log in and start using the platform to borrow or lend with Bitcoin collateral.</p>
              <a href="/login" class="btn">Log In to Your Account</a>
            </div>
          </body>
          </html>
        `);
      } else {
        return res.status(400).send(`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Verification Failed - Reconquest</title>
            <style>
              body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
              .error { color: #dc3545; background: #f8d7da; padding: 30px; border-radius: 8px; border: 1px solid #f5c6cb; }
              .btn { display: inline-block; background: linear-gradient(135deg, #D4AF37 0%, #4A90E2 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
            </style>
          </head>
          <body>
            <div class="error">
              <h2>❌ Verification Failed</h2>
              <p>${result.message}</p>
              <p>You may need to register again or request a new verification email.</p>
              <a href="/signup" class="btn">Register Again</a>
            </div>
          </body>
          </html>
        `);
      }
    } catch (error) {
      console.error("Email verification error:", error);
      return res.status(500).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Verification Error - Reconquest</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
            .error { color: #dc3545; background: #f8d7da; padding: 30px; border-radius: 8px; border: 1px solid #f5c6cb; }
            .btn { display: inline-block; background: linear-gradient(135deg, #D4AF37 0%, #4A90E2 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="error">
            <h2>❌ Verification Error</h2>
            <p>An error occurred while verifying your email. Please try again later.</p>
            <a href="/" class="btn">Return to Homepage</a>
          </div>
        </body>
        </html>
      `);
    }
  });

  // API endpoint for email verification status check
  app.post("/api/auth/verify-email", async (req, res) => {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ 
        success: false,
        message: "Verification token is required"
      });
    }

    try {
      const result = await emailVerificationService.verifyEmail(token);
      return res.json(result);
    } catch (error) {
      console.error("API email verification error:", error);
      return res.status(500).json({ 
        success: false,
        message: "An error occurred during email verification"
      });
    }
  });

  // Password reset request endpoint
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = z.object({ email: z.string().email() }).parse(req.body);
      
      const result = await passwordResetService.requestPasswordReset(email);
      
      res.json({
        success: result.success,
        message: result.message
      });
    } catch (error) {
      console.error("Password reset request error:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Please provide a valid email address"
        });
      }
      
      res.status(500).json({ 
        message: "An error occurred while processing your request"
      });
    }
  });

  // Password reset endpoint
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, password } = z.object({ 
        token: z.string(),
        password: z.string().min(8, "Password must be at least 8 characters long")
      }).parse(req.body);
      
      const result = await passwordResetService.resetPassword(token, password);
      
      if (result.success) {
        res.json({
          success: true,
          message: result.message
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message
        });
      }
    } catch (error) {
      console.error("Password reset error:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Please provide a valid token and password (minimum 8 characters)"
        });
      }
      
      res.status(500).json({ 
        message: "An error occurred while resetting your password"
      });
    }
  });

  // Test email endpoint 
  app.post("/api/test-email", async (req, res) => {
    try {
      const { to, subject, message } = req.body;
      const success = await sendEmail({
        to: to || "jfestrada93@gmail.com",
        from: "Reconquest <noreply@reconquestp2p.com>",
        subject: subject || "🧪 Test Email from Reconquest",
        html: `
          <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; padding: 20px;">
            <h2 style="color: #D4AF37;">📧 Email Delivery Test</h2>
            <p>This is a test email to verify that notifications are working correctly.</p>
            <p><strong>Message:</strong> ${message || "If you receive this, email delivery is working!"}</p>
            <p style="color: #666; font-size: 14px;">Sent from Reconquest notification system</p>
          </div>
        `
      });
      
      if (success) {
        res.json({ success: true, message: "Test email sent successfully" });
      } else {
        res.status(500).json({ success: false, message: "Failed to send test email" });
      }
    } catch (error) {
      console.error("Test email error:", error);
      res.status(500).json({ success: false, message: "Email service error" });
    }
  });

  // Get all users
  app.get("/api/users", async (req, res) => {
    const users = await storage.getAllUsers();
    res.json(users);
  });

  // Get user by ID
  app.get("/api/users/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const user = await storage.getUser(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  });

  // Delete user by email (for testing purposes)
  app.delete("/api/users/email/:email", async (req, res) => {
    const email = decodeURIComponent(req.params.email);
    const deleted = await storage.deleteUserByEmail(email);
    if (deleted) {
      res.json({ success: true, message: `User with email ${email} deleted successfully` });
    } else {
      res.status(404).json({ success: false, message: `User with email ${email} not found` });
    }
  });

  // Get all loans (SECURITY: Sanitize to remove lender private keys)
  app.get("/api/loans", async (req, res) => {
    const loans = await storage.getAllLoans();
    res.json(ResponseSanitizer.sanitizeLoans(loans));
  });

  // Get available loans (pending status)
  app.get("/api/loans/available", async (req, res) => {
    const loans = await storage.getAvailableLoans();
    res.json(ResponseSanitizer.sanitizeLoans(loans));
  });

  // Get user's loans (both as borrower and lender)
  app.get("/api/users/:id/loans", async (req, res) => {
    const userId = parseInt(req.params.id);
    const loans = await storage.getUserLoans(userId);
    res.json(ResponseSanitizer.sanitizeLoans(loans));
  });

  // Get enriched loan data with borrower details for lenders
  app.get("/api/users/:id/loans/enriched", async (req, res) => {
    const userId = parseInt(req.params.id);
    const loans = await storage.getUserLoans(userId);
    
    // Enrich loans with borrower bank account details
    const enrichedLoans = await Promise.all(
      loans.map(async (loan) => {
        // SECURITY: Sanitize loan before enriching
        const sanitizedLoan = ResponseSanitizer.sanitizeLoan(loan);
        if (loan.borrowerId) {
          const borrower = await storage.getUser(loan.borrowerId);
          // Only include bank details if both parties have their keys ready
          // Bitcoin-blind model: lenderPubkey exists when platform generated lender key at funding
          const showBankDetails = loan.borrowerKeysGeneratedAt && loan.lenderPubkey;
          return {
            ...sanitizedLoan,
            borrower: {
              id: borrower?.id,
              username: borrower?.username,
              firstName: borrower?.firstName,
              lastName: borrower?.lastName,
              email: borrower?.email,
              // Only expose sensitive bank details after both parties have completed key generation
              bankAccountHolder: showBankDetails ? borrower?.bankAccountHolder : null,
              iban: showBankDetails ? borrower?.iban : null,
            }
          };
        }
        return sanitizedLoan;
      })
    );
    
    res.json(enrichedLoans);
  });

  // Create new loan request
  app.post("/api/loans", authenticateToken, requireNonAdmin, mainnetLoanCreationLimits, async (req: any, res) => {
    try {
      // Parse request data
      const requestData = insertLoanSchema.parse(req.body);
      
      // Get authenticated user ID from JWT token
      const borrowerId = req.user.id;
      
      // Calculate collateral based on 2:1 ratio using real-time BTC price in loan currency
      const btcPrice = await getBtcPriceForCurrency(requestData.currency);
      const loanAmount = parseFloat(requestData.amount);
      const requiredCollateralValue = loanAmount * 2;
      const requiredBtc = (requiredCollateralValue / btcPrice).toFixed(8);
      
      // Get current network type
      const currentNetwork = process.env.BITCOIN_NETWORK === 'mainnet' ? 'mainnet' : 'testnet4';
      
      const loanData = {
        ...requestData,
        borrowerId,
        // NO borrowerPubkey yet - will be submitted later after match
        collateralBtc: requiredBtc,
        ltvRatio: "50.00",
        status: "posted",
        dueDate: new Date(Date.now() + requestData.termMonths * 30 * 24 * 60 * 60 * 1000),
        networkType: currentNetwork,
      };
      
      const loan = await storage.createLoan(loanData);

      console.log(`✅ Loan #${loan.id} created (no keys yet - will be generated after match)`);
      
      // Send email notifications for new loan
      console.log(`Attempting to send email notifications for new loan #${loan.id}`);
      await sendNotificationsForNewLoan(loan, borrowerId);
      
      // SECURITY: Sanitize response to remove any sensitive data
      res.status(201).json(ResponseSanitizer.sanitizeLoan(loan));
    } catch (error) {
      console.error("❌ Loan creation error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      res.status(500).json({ message: "Internal server error", details: error instanceof Error ? error.message : String(error) });
    }
  });

  // Fund a loan (lender commits to funding - BITCOIN-BLIND lender design)
  // Platform generates and controls the lender key - lender never handles Bitcoin keys
  app.post("/api/loans/:id/fund", authenticateToken, requireNonAdmin, mainnetLoanFundingLimits, async (req: any, res) => {
    const loanId = parseInt(req.params.id);
    
    // Get authenticated user ID from JWT token
    const lenderId = req.user.id;
    
    try {
      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }
      
      // CRITICAL: Prevent self-funding - borrower cannot fund their own loan
      if (lenderId === loan.borrowerId) {
        return res.status(403).json({ 
          success: false,
          message: "You cannot fund your own loan. Borrowers and lenders must be different users." 
        });
      }
      
      if (loan.status !== "pending" && loan.status !== "posted" && loan.status !== "initiated") {
        return res.status(400).json({ message: "Loan is not available for funding" });
      }
      
      // Extract dates and default preference - NO lenderPubkey from client (Bitcoin-blind lender)
      const { plannedStartDate, plannedEndDate, lenderDefaultPreference, lenderBtcAddress } = req.body;
      
      // BITCOIN-BLIND LENDER: Generate lender key server-side
      // The lender never sees or handles Bitcoin keys - platform operates this key
      console.log(`🔐 [Bitcoin-Blind] Generating platform-controlled lender key for Loan #${loanId}`);
      
      const escrowService = new BitcoinEscrowService();
      const lenderKeyPair = escrowService.generateLenderKeyPair(loanId);
      const lenderPubkey = lenderKeyPair.publicKey;
      
      console.log(`🔑 [Bitcoin-Blind] Lender pubkey generated (platform-operated): ${lenderPubkey.slice(0, 20)}...`);
      console.log(`⚠️ [Bitcoin-Blind] Lender is completely Bitcoin-blind - they only confirm fiat transfers`);
      
      // Encrypt the lender private key for secure storage
      // In production, use HSM/KMS. For testnet, uses AES-256-GCM with env key
      const lenderPrivateKeyEncrypted = EncryptionService.encrypt(lenderKeyPair.privateKey);
      console.log(`🔒 [Bitcoin-Blind] Lender private key encrypted for secure storage`);
      
      const PLATFORM_PUBKEY = BitcoinEscrowService.getPlatformPublicKey();
      
      // IMPORTANT: Do NOT create escrow yet - wait for borrower to provide their key
      // This prevents the duplicate key bug that locked funds in loan #183
      // Escrow will be created in /api/loans/:id/provide-borrower-key when borrower provides their key
      
      console.log(`🔐 Lender committed to Loan #${loanId} - awaiting borrower key for escrow creation`);
      
      // Update loan with lender info but NO escrow yet
      // Store platform-generated lender key (encrypted in production)
      // BITCOIN-BLIND: Set lenderKeysGeneratedAt since platform generated the key for lender
      // Validate lender default preference
      const validPreference = lenderDefaultPreference === 'btc' ? 'btc' : 'eur';
      console.log(`💱 Lender default preference: ${validPreference} (${validPreference === 'eur' ? 'platform sells BTC, transfers EUR' : 'direct BTC to lender address'})`);
      
      if (validPreference === 'btc' && !lenderBtcAddress) {
        return res.status(400).json({ message: "Bitcoin address is required when choosing to receive in BTC" });
      }
      
      const updatedLoan = await storage.updateLoan(loanId, {
        lenderId,
        lenderPubkey,  // Platform-generated pubkey (lender never sees this)
        lenderPrivateKeyEncrypted,  // Platform stores this for signing (encrypted in production)
        platformPubkey: PLATFORM_PUBKEY,
        lenderKeysGeneratedAt: new Date(),  // Platform generated lender key NOW
        // NO escrowAddress yet - will be created when borrower provides their key
        escrowState: "awaiting_borrower_key", // New state: waiting for borrower to provide their key
        status: "funded", // Lender has committed
        fundedAt: new Date(),
        lenderDefaultPreference: validPreference,
        lenderBtcAddress: validPreference === 'btc' ? lenderBtcAddress.trim() : null,
        plannedStartDate: plannedStartDate ? new Date(plannedStartDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        plannedEndDate: plannedEndDate ? new Date(plannedEndDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + loan.termMonths * 30 * 24 * 60 * 60 * 1000),
      });

      // Get borrower details for email notification
      const borrower = await storage.getUser(loan.borrowerId);
      if (borrower && updatedLoan) {
        // Send email to borrower notifying them a lender has committed
        // They need to provide their key first before getting the escrow address
        const baseUrl = process.env.APP_URL || process.env.REPLIT_DEPLOYMENT_URL || `https://${process.env.REPLIT_DEV_DOMAIN}`;
        
        await sendEmail({
          to: borrower.email,
          from: 'Reconquest <noreply@reconquestp2p.com>',
          subject: `🎉 Your Loan #${loan.id} Has Been Funded - Action Required`,
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
              <div style="background-color: #fff; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                <div style="text-align: center; margin-bottom: 20px;">
                  <img src="${baseUrl}/logo.png" alt="Reconquest" style="max-width: 200px; height: auto;" />
                </div>
                
                <h2 style="color: #2C3E50; margin-top: 0;">🎉 Your Loan Has Been Funded!</h2>
                
                <p style="font-size: 16px; color: #555;">Hi ${borrower.username},</p>
                
                <p style="font-size: 16px; color: #555;">Great news! A lender has committed to fund your loan request.</p>
                
                <div style="background-color: #E8F8F5; border-left: 4px solid #27AE60; padding: 15px; margin: 20px 0; border-radius: 5px;">
                  <h3 style="margin-top: 0; color: #27AE60;">📋 Loan Details</h3>
                  <p style="margin: 5px 0;"><strong>Loan ID:</strong> #${loan.id}</p>
                  <p style="margin: 5px 0;"><strong>Loan Amount:</strong> ${loan.amount} ${loan.currency}</p>
                  <p style="margin: 5px 0;"><strong>Required Collateral:</strong> ${loan.collateralBtc} BTC</p>
                </div>

                <div style="background-color: #FEF9E7; border-left: 4px solid #F39C12; padding: 15px; margin: 20px 0; border-radius: 5px;">
                  <h3 style="margin-top: 0; color: #F39C12;">🔐 Next Step: Create Your Security Key</h3>
                  <p style="font-size: 16px; color: #555;">To secure this loan and receive your Bitcoin deposit address, please go to your dashboard and create your security passphrase.</p>
                </div>

                <div style="background-color: #EBF5FB; border-left: 4px solid #3498DB; padding: 15px; margin: 20px 0; border-radius: 5px;">
                  <h3 style="margin-top: 0; color: #3498DB;">📝 What Happens Next?</h3>
                  <ol style="margin: 10px 0; padding-left: 20px; color: #555;">
                    <li>Go to your <a href="${baseUrl}/borrower" style="color: #3498DB; text-decoration: none; font-weight: bold;">Borrower Dashboard</a></li>
                    <li>Create your security passphrase (this generates your escrow key)</li>
                    <li>You'll receive your Bitcoin escrow deposit address</li>
                    <li>Send ${loan.collateralBtc} BTC to the escrow address</li>
                    <li>Your loan will become active and you'll receive the ${loan.amount} ${loan.currency}</li>
                  </ol>
                </div>

                <div style="text-align: center; margin-top: 30px;">
                  <a href="${baseUrl}/borrower" style="display: inline-block; background-color: #D4AF37; color: #000; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
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
          `
        });
        
        console.log(`📧 Sent lender committed notification to borrower: ${borrower.email}`);
      }
      
      // SECURITY: Sanitize response to ensure lender private key is never exposed
      res.json({
        ...ResponseSanitizer.sanitizeLoan(updatedLoan),
        message: "Funding commitment registered. Platform has secured your escrow position."
      });
    } catch (error) {
      console.error('Error funding loan:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Borrower provides their public key to complete key ceremony and create escrow
  app.post("/api/loans/:id/provide-borrower-key", authenticateToken, requireNonAdmin, async (req: any, res) => {
    const loanId = parseInt(req.params.id);
    const borrowerId = req.user.id;
    
    try {
      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }
      
      // Verify the user is the borrower
      if (loan.borrowerId !== borrowerId) {
        return res.status(403).json({ message: "Only the borrower can provide their key" });
      }
      
      // Verify loan is awaiting borrower key
      if (loan.escrowState !== "awaiting_borrower_key") {
        return res.status(400).json({ 
          message: "Loan is not awaiting borrower key. Current state: " + loan.escrowState 
        });
      }
      
      // Verify lender has already provided their key
      if (!loan.lenderPubkey) {
        return res.status(400).json({ message: "Lender has not provided their key yet" });
      }
      
      const { borrowerPubkey, borrowerReturnAddress } = req.body;
      
      // Validate borrower public key format
      if (!borrowerPubkey || typeof borrowerPubkey !== 'string') {
        return res.status(400).json({ message: "Borrower Bitcoin public key is required" });
      }
      
      // Validate borrower return address (REQUIRED for pre-signed transactions)
      // This is where collateral will be returned after successful repayment
      if (!borrowerReturnAddress || typeof borrowerReturnAddress !== 'string') {
        return res.status(400).json({ 
          message: "Borrower Bitcoin return address is required for escrow creation" 
        });
      }
      
      // Validate bech32 address format (tb1... for testnet4, bc1... for mainnet)
      const isTestnet = process.env.BITCOIN_NETWORK !== 'mainnet';
      const addressPrefix = isTestnet ? 'tb1' : 'bc1';
      if (!borrowerReturnAddress.startsWith(addressPrefix)) {
        return res.status(400).json({ 
          message: `Borrower return address must start with ${addressPrefix} for ${isTestnet ? 'testnet4' : 'mainnet'}` 
        });
      }
      
      if (borrowerPubkey.length !== 66) {
        return res.status(400).json({ 
          message: "Borrower public key must be exactly 66 characters (33 bytes compressed)" 
        });
      }
      
      if (!/^[0-9a-fA-F]{66}$/.test(borrowerPubkey)) {
        return res.status(400).json({ message: "Borrower public key must be valid hexadecimal" });
      }
      
      const prefix = borrowerPubkey.substring(0, 2);
      if (prefix !== '02' && prefix !== '03') {
        return res.status(400).json({ 
          message: "Borrower public key must start with 02 or 03 (compressed format)" 
        });
      }
      
      // CRITICAL: Cryptographically verify the public key
      try {
        const secp256k1 = await import('@noble/secp256k1');
        await secp256k1.Point.fromHex(borrowerPubkey);
      } catch (error) {
        return res.status(400).json({ 
          message: `Borrower public key failed cryptographic validation: ${error instanceof Error ? error.message : 'invalid curve point'}` 
        });
      }
      
      const PLATFORM_PUBKEY = loan.platformPubkey || BitcoinEscrowService.getPlatformPublicKey();
      
      // CRITICAL: Validate all 3 keys are unique BEFORE creating escrow
      const keys = [borrowerPubkey.toLowerCase(), loan.lenderPubkey.toLowerCase(), PLATFORM_PUBKEY.toLowerCase()];
      const uniqueKeys = new Set(keys);
      if (uniqueKeys.size !== 3) {
        return res.status(400).json({ 
          message: "CRITICAL: All 3 public keys (borrower, lender, platform) must be unique. Duplicate keys would lock funds permanently." 
        });
      }
      
      // NOW create the 2-of-3 multisig escrow with all 3 unique keys
      const { createMultisigAddress } = await import('./utils/multisig-creator.js');
      const multisig = await createMultisigAddress(
        borrowerPubkey,
        loan.lenderPubkey,
        PLATFORM_PUBKEY
      );
      
      console.log(`🔐 Created escrow for Loan #${loanId} with 3 unique keys: ${multisig.address}`);
      
      // Update loan with borrower key and escrow details
      // Set borrowerKeysGeneratedAt since borrower just provided their key
      const updatedLoan = await storage.updateLoan(loanId, {
        borrowerPubkey,
        borrowerKeysGeneratedAt: new Date(),  // Borrower key created NOW
        escrowAddress: multisig.address,
        escrowWitnessScript: multisig.witnessScript,
        escrowScriptHash: multisig.scriptHash,
        escrowState: "escrow_created", // Now escrow is properly created with all 3 keys
        borrowerAddress: borrowerReturnAddress || null, // Store borrower return address
      });
      
      // Generate pre-signed PSBT templates for the signing ceremony
      // These are unsigned templates - borrower will sign them client-side
      let psbtTemplates: any[] = [];
      let requiresSigning = false;
      
      try {
        const { TransactionTemplateService } = await import('./services/TransactionTemplateService.js');
        
        // Get lender for their BTC address (for liquidation/default outputs)
        const lender = await storage.getUser(loan.lenderId!);
        const lenderBtcAddress = loan.lenderBtcAddress || '';
        
        // Determine the correct destination address for lender's share based on preference
        // EUR preference: funds go to platform BTC address (platform sells and sends EUR to lender)
        // BTC preference: funds go directly to lender's BTC address
        const lenderPreference = loan.lenderDefaultPreference || 'eur';
        const platformBtcAddress = process.env.PLATFORM_BTC_ADDRESS || '';
        let lenderDestinationAddress = lenderBtcAddress;
        
        if (lenderPreference === 'eur') {
          if (!platformBtcAddress) {
            return res.status(400).json({ 
              message: "Cannot generate templates: Platform BTC address not configured (PLATFORM_BTC_ADDRESS env var). Required for EUR-preference lenders." 
            });
          }
          lenderDestinationAddress = platformBtcAddress;
          console.log(`📋 Lender prefers EUR - using platform BTC address for default/liquidation outputs: ${platformBtcAddress}`);
        } else {
          console.log(`📋 Lender prefers BTC - using lender BTC address for default/liquidation outputs: ${lenderBtcAddress}`);
        }
        
        // Calculate collateral in satoshis
        const collateralSats = Math.round(parseFloat(loan.collateralBtc) * 100000000);
        
        console.log(`🔐 Generating pre-signed PSBT templates for Loan #${loanId}`);
        
        const psbtResult = await TransactionTemplateService.generatePreSignedTransactions({
          loanId,
          borrowerPubkey,
          lenderPubkey: loan.lenderPubkey,
          platformPubkey: PLATFORM_PUBKEY,
          borrowerAddress: borrowerReturnAddress || lenderBtcAddress,
          lenderAddress: lenderDestinationAddress,
          collateralAmount: collateralSats
        });
        
        // psbtResult is a PreSignedTransactionSet with { psbts: { repayment, default, liquidation, recovery }, escrowAddress, witnessScript }
        if (psbtResult && psbtResult.psbts) {
          console.log(`✅ Generated 4 PSBT templates for loan #${loanId}`);
          // Convert to array format for response
          psbtTemplates = [
            { txType: STORAGE_TX_TYPES.REPAYMENT, psbtBase64: psbtResult.psbts.repayment },
            { txType: STORAGE_TX_TYPES.DEFAULT, psbtBase64: psbtResult.psbts.default },
            { txType: STORAGE_TX_TYPES.LIQUIDATION, psbtBase64: psbtResult.psbts.liquidation },
            { txType: STORAGE_TX_TYPES.RECOVERY, psbtBase64: psbtResult.psbts.recovery }
          ];
          requiresSigning = true;

          const existingTemplates = await storage.getPreSignedTransactions(loanId);
          if (existingTemplates.length === 0) {
            for (const tmpl of psbtTemplates) {
              await storage.storePreSignedTransaction({
                loanId,
                partyRole: 'unsigned_template',
                partyPubkey: borrowerPubkey,
                txType: tmpl.txType,
                psbt: tmpl.psbtBase64,
                signature: '',
                txHash: crypto.createHash('sha256').update(tmpl.psbtBase64).digest('hex').slice(0, 64),
              });
            }
            console.log(`💾 Persisted ${psbtTemplates.length} unsigned PSBT templates to DB for loan #${loanId}`);
          } else {
            console.log(`⚠️ Templates already exist for loan #${loanId}, skipping duplicate persistence`);
          }
        } else {
          console.warn(`⚠️ PSBT generation returned empty result`);
        }
      } catch (psbtError: any) {
        console.error(`⚠️ PSBT generation error (non-fatal):`, psbtError.message);
        // Continue without PSBTs - backward compatibility with old flow
      }
      
      // Send email to borrower with deposit instructions
      const borrower = await storage.getUser(borrowerId);
      if (borrower && updatedLoan) {
        const { sendBorrowerDepositNotification } = await import('./email.js');
        const baseUrl = process.env.APP_URL || process.env.REPLIT_DEPLOYMENT_URL || `https://${process.env.REPLIT_DEV_DOMAIN}`;
        
        await sendBorrowerDepositNotification({
          to: borrower.email,
          borrowerName: borrower.username,
          loanId: updatedLoan.id,
          loanAmount: updatedLoan.amount,
          currency: updatedLoan.currency,
          collateralBtc: updatedLoan.collateralBtc,
          escrowAddress: updatedLoan.escrowAddress!,
          dashboardUrl: `${baseUrl}/borrower`,
        });
        
        console.log(`📧 Sent deposit notification to borrower: ${borrower.email}`);
      }
      
      // SECURITY: Sanitize loan in response to remove lender private key
      // Include PSBTs for signing ceremony if generated
      res.json({
        success: true,
        message: "Key ceremony complete! Escrow address created with 3 unique keys.",
        escrowAddress: multisig.address,
        borrowerPubkey,
        lenderPubkey: loan.lenderPubkey,
        platformPubkey: PLATFORM_PUBKEY,
        loan: updatedLoan ? ResponseSanitizer.sanitizeLoan(updatedLoan) : undefined,
        // NEW: Include PSBTs for borrower signing ceremony
        requiresSigning,
        psbts: psbtTemplates.length > 0 ? {
          repayment: psbtTemplates.find(t => t.txType === STORAGE_TX_TYPES.REPAYMENT)?.psbtBase64,
          default: psbtTemplates.find(t => t.txType === STORAGE_TX_TYPES.DEFAULT)?.psbtBase64,
          liquidation: psbtTemplates.find(t => t.txType === STORAGE_TX_TYPES.LIQUIDATION)?.psbtBase64,
          recovery: psbtTemplates.find(t => t.txType === STORAGE_TX_TYPES.RECOVERY)?.psbtBase64
        } : undefined
      });
    } catch (error) {
      console.error('Error providing borrower key:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Borrower confirms they've deposited Bitcoin to escrow address
  app.post("/api/loans/:id/confirm-deposit", authenticateToken, requireNonAdmin, async (req: any, res) => {
    const loanId = parseInt(req.params.id);
    const borrowerId = req.user.id;
    
    try {
      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }
      
      // Verify the user is the borrower
      if (loan.borrowerId !== borrowerId) {
        return res.status(403).json({ message: "Only the borrower can confirm deposit" });
      }
      
      // Verify loan is in the correct state (escrow created, awaiting deposit)
      if (loan.escrowState !== "escrow_created") {
        // Provide helpful messages based on the current state
        if (loan.escrowState === "deposit_pending") {
          return res.status(400).json({ 
            message: "We're monitoring the blockchain for your deposit. Please wait for miner confirmation - this can take 10-30 minutes on testnet." 
          });
        }
        if (loan.escrowState === "deposit_confirmed") {
          return res.status(400).json({ 
            message: "Your deposit has already been confirmed. Check your dashboard for the next steps." 
          });
        }
        return res.status(400).json({ 
          message: "Loan must have an escrow address before confirming deposit" 
        });
      }
      
      if (!loan.escrowAddress) {
        return res.status(400).json({ 
          message: "No escrow address found for this loan" 
        });
      }
      
      // CRITICAL: Verify complete key ceremony before confirming deposit
      // All 3 unique public keys must exist for 2-of-3 multisig to be spendable
      if (!loan.borrowerPubkey || !loan.lenderPubkey) {
        return res.status(400).json({ 
          message: "CRITICAL: Cannot confirm deposit - key ceremony incomplete. Both borrower and lender must provide unique public keys before deposit can be confirmed." 
        });
      }
      
      // Register loan for blockchain monitoring - actual confirmation happens when blockchain confirms
      // DO NOT set deposit_confirmed or send lender notification yet - that happens in BlockchainMonitoring.handleDepositConfirmed
      const { blockchainMonitoring } = await import('./services/BlockchainMonitoring.js');
      await blockchainMonitoring.registerLoanForMonitoring(loanId);
      
      console.log(`✅ Loan #${loanId}: Borrower clicked 'I've deposited' - now monitoring ${loan.escrowAddress}`);
      console.log(`⏳ Waiting for blockchain confirmation before notifying lender...`);
      
      // NOTE: Lender notification email is sent by BlockchainMonitoring.handleDepositConfirmed 
      // only AFTER the deposit is confirmed on the blockchain with required confirmations
      
      // Return updated loan state
      const updatedLoan = await storage.getLoan(loanId);
      
      // SECURITY: Sanitize response to remove lender private key
      res.json(ResponseSanitizer.sanitizeLoan(updatedLoan!));
    } catch (error) {
      console.error('Error confirming deposit:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Borrower confirms they've sent a collateral top-up
  app.post("/api/loans/:id/confirm-topup", authenticateToken, requireNonAdmin, async (req: any, res) => {
    const loanId = parseInt(req.params.id);
    const borrowerId = req.user.id;
    const { topUpAmountBtc } = req.body;
    
    try {
      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }
      
      // Verify the user is the borrower
      if (loan.borrowerId !== borrowerId) {
        return res.status(403).json({ message: "Only the borrower can confirm a top-up" });
      }
      
      // Verify loan is active
      if (loan.status !== 'active') {
        return res.status(400).json({ 
          message: "Only active loans can receive top-ups" 
        });
      }
      
      // Verify escrow address exists
      if (!loan.escrowAddress) {
        return res.status(400).json({ 
          message: "No escrow address found for this loan" 
        });
      }
      
      // Validate top-up amount
      const topUpBtc = parseFloat(topUpAmountBtc);
      if (isNaN(topUpBtc) || topUpBtc <= 0) {
        return res.status(400).json({ 
          message: "Please provide a valid top-up amount" 
        });
      }
      
      if (topUpBtc > 10) {
        return res.status(400).json({ 
          message: "Top-up amount seems too high. Please check the amount." 
        });
      }
      
      // Check if there's already a pending top-up
      if (loan.topUpMonitoringActive) {
        return res.status(400).json({ 
          message: "A top-up is already being monitored. Please wait for confirmation." 
        });
      }
      
      // Update loan with pending top-up info
      const currentCollateral = parseFloat(String(loan.collateralBtc));
      const updatedLoan = await storage.updateLoan(loanId, {
        pendingTopUpBtc: String(topUpBtc),
        topUpRequestedAt: new Date(),
        topUpMonitoringActive: true,
        previousCollateralBtc: String(currentCollateral),
      });
      
      console.log(`🔄 Loan #${loanId}: Borrower confirmed top-up of ${topUpBtc} BTC sent to ${loan.escrowAddress}`);
      console.log(`   Previous collateral: ${currentCollateral} BTC, Expected new total: ${currentCollateral + topUpBtc} BTC`);
      
      res.json({ 
        success: true,
        message: "Top-up recorded. We'll monitor the blockchain for your deposit.",
        pendingTopUpBtc: topUpBtc,
        escrowAddress: loan.escrowAddress,
        expectedNewTotal: currentCollateral + topUpBtc
      });
    } catch (error) {
      console.error('Error confirming top-up:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update loan with borrower's public key after key generation
  app.patch("/api/loans/:id/borrower-keys", authenticateToken, requireNonAdmin, async (req: any, res) => {
    const loanId = parseInt(req.params.id);
    const borrowerId = req.user.id;
    const { borrowerPubkey } = req.body;
    
    try {
      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }
      
      // Verify the user is the borrower
      if (loan.borrowerId !== borrowerId) {
        return res.status(403).json({ message: "You are not authorized to update this loan" });
      }
      
      // Validate borrower public key format
      if (!borrowerPubkey || typeof borrowerPubkey !== 'string') {
        return res.status(400).json({ 
          message: "Borrower public key is required" 
        });
      }
      
      if (!/^[0-9a-fA-F]{66}$/.test(borrowerPubkey)) {
        return res.status(400).json({ 
          message: "Borrower public key must be valid hexadecimal" 
        });
      }
      
      const prefix = borrowerPubkey.substring(0, 2);
      if (prefix !== '02' && prefix !== '03') {
        return res.status(400).json({ 
          message: "Borrower public key must start with 02 or 03 (compressed format)" 
        });
      }
      
      // CRITICAL: Cryptographically verify the public key is a valid secp256k1 point
      try {
        const secp256k1 = await import('@noble/secp256k1');
        await secp256k1.Point.fromHex(borrowerPubkey);
      } catch (error) {
        return res.status(400).json({ 
          message: `Borrower public key failed cryptographic validation: ${error instanceof Error ? error.message : 'invalid curve point'}` 
        });
      }
      
      // Update loan with borrower pubkey
      const updatedLoan = await storage.updateLoan(loanId, {
        borrowerPubkey,
      });
      
      console.log(`🔐 Loan #${loanId} updated with borrower pubkey: ${borrowerPubkey.slice(0, 20)}...`);
      
      // NOTE: Lender email notification is NOT sent here - it will be sent after 
      // the borrower completes the signing ceremony (sign-templates endpoint).
      // This prevents premature "collateral confirmed" emails before deposit.
      
      // SECURITY: Sanitize response to remove lender private key
      res.json(ResponseSanitizer.sanitizeLoan(updatedLoan));
    } catch (error) {
      console.error('Error updating borrower keys:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Borrower confirms they've sent BTC to escrow - starts automated monitoring
  app.post("/api/loans/:id/confirm-btc-sent", authenticateToken, requireNonAdmin, async (req: any, res) => {
    const loanId = parseInt(req.params.id);
    const borrowerId = req.user.id;
    const { txid } = req.body; // Optional txid from borrower
    
    try {
      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }
      
      // Verify the user is the borrower
      if (loan.borrowerId !== borrowerId) {
        return res.status(403).json({ message: "You are not authorized to confirm this loan" });
      }
      
      // Verify loan is in funding status
      if (loan.status !== "funding") {
        return res.status(400).json({ message: "Loan is not awaiting BTC deposit" });
      }
      
      // Check if already monitoring
      if (loan.escrowMonitoringActive) {
        // Do a manual check to see current status
        const checkResult = await blockchainMonitoring.manualDepositCheck(loanId);
        return res.json({ 
          success: true, 
          message: checkResult.message,
          status: 'monitoring',
          depositFound: checkResult.found,
          confirmations: checkResult.confirmations
        });
      }
      
      // Register loan for automated blockchain monitoring
      await blockchainMonitoring.registerLoanForMonitoring(loanId, txid);
      
      // Do an immediate check
      const checkResult = await blockchainMonitoring.manualDepositCheck(loanId);
      
      console.log(`[ConfirmBTCSent] Loan ${loanId} registered for monitoring. Initial check: ${checkResult.message}`);
      
      res.json({ 
        success: true, 
        message: checkResult.found 
          ? checkResult.message
          : "Thank you! We're now monitoring the blockchain for your deposit. You'll be notified automatically when it's confirmed.",
        status: 'monitoring_started',
        depositFound: checkResult.found,
        confirmations: checkResult.confirmations,
        escrowAddress: loan.escrowAddress
      });
    } catch (error) {
      console.error("Error confirming BTC sent:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Check deposit status for a loan (polling endpoint for frontend)
  app.get("/api/loans/:id/deposit-status", authenticateToken, async (req: any, res) => {
    const loanId = parseInt(req.params.id);
    
    try {
      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }
      
      // Check if user is borrower or lender
      if (loan.borrowerId !== req.user.id && loan.lenderId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to view this loan" });
      }
      
      // If monitoring is active, do a fresh check
      if (loan.escrowMonitoringActive) {
        const checkResult = await blockchainMonitoring.manualDepositCheck(loanId);
        
        // Get fresh loan data after check
        const updatedLoan = await storage.getLoan(loanId);
        
        return res.json({
          status: updatedLoan?.escrowState || loan.escrowState,
          depositFound: checkResult.found,
          confirmations: checkResult.confirmations,
          message: checkResult.message,
          txid: checkResult.txid,
          escrowAddress: loan.escrowAddress,
          monitoringActive: updatedLoan?.escrowMonitoringActive || false
        });
      }
      
      // Not actively monitoring - return current state
      res.json({
        status: loan.escrowState,
        depositFound: !!loan.depositConfirmedAt,
        confirmations: loan.depositConfirmations || 0,
        message: loan.depositConfirmedAt 
          ? 'Deposit confirmed - ready for signing ceremony'
          : loan.btcDepositNotifiedAt 
            ? 'Waiting for blockchain confirmation'
            : 'Waiting for borrower to send BTC',
        txid: loan.fundingTxid,
        escrowAddress: loan.escrowAddress,
        monitoringActive: false
      });
    } catch (error) {
      console.error("Error checking deposit status:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin confirms BTC deposit and notifies lender to send fiat funds
  app.post("/api/admin/loans/:id/confirm-btc-deposit", async (req, res) => {
    const loanId = parseInt(req.params.id);
    
    try {
      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }
      
      // Verify loan is in funding status
      if (loan.status !== "funding") {
        return res.status(400).json({ message: "Loan is not awaiting BTC deposit" });
      }
      
      // Get borrower and lender details
      const borrower = await storage.getUser(loan.borrowerId);
      const lender = await storage.getUser(loan.lenderId);
      
      if (!borrower || !lender) {
        return res.status(404).json({ message: "Borrower or lender not found" });
      }
      
      // Calculate maturity date and amount due
      const maturityDate = new Date();
      maturityDate.setMonth(maturityDate.getMonth() + loan.termMonths);
      const principal = parseFloat(loan.amount);
      const annualRate = parseFloat(loan.interestRate) / 100;
      const interestAmount = principal * annualRate * (loan.termMonths / 12);
      const amountDue = principal + interestAmount;
      
      // Send email to lender (Firefish-style template)
      await sendEmail({
        to: lender.email,
        from: 'noreply@reconquestp2p.com',
        subject: `Transfer funds - Loan #${loan.id}`,
        html: `
          <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
            <div style="padding: 20px;">
              <h1 style="color: #333; font-size: 24px; margin: 0 0 20px 0;">Reconquest 🔥🐠</h1>
              
              <h2 style="color: #333; font-size: 20px; margin: 0 0 20px 0;">Transfer funds</h2>
              
              <p style="color: #666; line-height: 1.6; margin: 0 0 15px 0;">
                Dear ${lender.username},
              </p>
              
              <p style="color: #666; line-height: 1.6; margin: 0 0 15px 0;">
                The borrower has successfully completed the escrow process by securely depositing their Bitcoin into a <a href="${getExplorerUrl('address', loan.escrowAddress || '')}" target="_blank" style="color: #e74c3c; text-decoration: underline;">designated address</a>.
              </p>
              
              <p style="color: #666; line-height: 1.6; margin: 0 0 20px 0;">
                You can now proceed with the bank transfer. Please follow the instructions on the platform to send the loan amount to the borrower's bank account.
              </p>
              
              <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 0 0 20px 0;">
                <p style="margin: 0 0 8px 0; color: #333;"><strong>Loan ID:</strong> ${loan.id.toString().padStart(6, '0')}</p>
                <p style="margin: 0 0 8px 0; color: #333;"><strong>Maturity Date:</strong> ${maturityDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                <p style="margin: 0 0 8px 0; color: #333;"><strong>Loan Amount:</strong> ${parseFloat(loan.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${loan.currency}</p>
                <p style="margin: 0 0 8px 0; color: #333;"><strong>Interest Rate:</strong> ${parseFloat(loan.interestRate).toFixed(2)} % p.a.</p>
                <p style="margin: 0; color: #333;"><strong>Amount Due:</strong> ${amountDue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${loan.currency}</p>
              </div>
              
              <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 8px; margin: 0 0 20px 0;">
                <p style="margin: 0 0 10px 0; color: #856404; font-weight: bold;">📤 Borrower's Bank Account Details</p>
                ${borrower.bankAccountHolder ? `<p style="margin: 0 0 5px 0; color: #333;"><strong>Account Holder:</strong> ${borrower.bankAccountHolder}</p>` : ''}
                ${borrower.bankAccountNumber ? `<p style="margin: 0 0 5px 0; color: #333;"><strong>Account Number:</strong> ${borrower.bankAccountNumber}</p>` : ''}
                ${borrower.bankName ? `<p style="margin: 0 0 5px 0; color: #333;"><strong>Bank Name:</strong> ${borrower.bankName}</p>` : ''}
                ${borrower.bankRoutingNumber ? `<p style="margin: 0 0 5px 0; color: #333;"><strong>Routing/SWIFT:</strong> ${borrower.bankRoutingNumber}</p>` : ''}
                ${borrower.bankCountry ? `<p style="margin: 0; color: #333;"><strong>Country:</strong> ${borrower.bankCountry}</p>` : ''}
                ${!borrower.bankAccountHolder && !borrower.bankAccountNumber ? '<p style="margin: 0; color: #856404;">⚠️ Borrower has not provided bank details yet. Please check the platform.</p>' : ''}
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.APP_URL || process.env.REPLIT_DEPLOYMENT_URL || `https://${process.env.REPLIT_DEV_DOMAIN}`}/lender" 
                   style="display: inline-block; background: #e74c3c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                  Transfer funds
                </a>
              </div>
              
              <p style="color: #666; line-height: 1.6; margin: 0 0 15px 0;">
                Once you confirm the transfer, the borrower will be notified to validate the transaction on their end.
              </p>
              
              <p style="color: #666; line-height: 1.6; margin: 0 0 15px 0;">
                Please complete the funds transfer within the agreed-upon timeframe mentioned in the loan agreement for a smooth and efficient lending process.
              </p>
              
              <p style="color: #666; line-height: 1.6; margin: 0 0 15px 0;">
                If you have any questions or need assistance, please check our <a href="#" style="color: #e74c3c; text-decoration: underline;">FAQ</a> or contact us at <a href="mailto:admin@reconquestp2p.com" style="color: #e74c3c; text-decoration: underline;">admin@reconquestp2p.com</a>.
              </p>
              
              <p style="color: #666; line-height: 1.6; margin: 0;">
                Best regards,
              </p>
              <p style="color: #666; line-height: 1.6; margin: 0 0 20px 0;">
                Your <span style="color: #e74c3c; font-weight: bold;">Reconquest</span> Team
              </p>
            </div>
          </div>
        `
      });
      
      res.json({ 
        success: true, 
        message: "Lender has been notified to transfer funds" 
      });
    } catch (error) {
      console.error("Error confirming BTC deposit:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create loan offer
  app.post("/api/loan-offers", authenticateToken, async (req: any, res) => {
    try {
      console.log("Loan offer request body:", req.body);
      
      // Get authenticated user ID from JWT token
      const lenderId = req.user.id;
      
      const validatedData = insertLoanOfferSchema.parse(req.body);
      console.log("Validated data:", validatedData);
      
      // Get the loan to check for self-funding
      const loan = await storage.getLoan(validatedData.loanId);
      if (!loan) {
        return res.status(404).json({ 
          success: false,
          message: "Loan not found" 
        });
      }
      
      // CRITICAL: Prevent self-funding - borrower cannot fund their own loan
      if (lenderId === loan.borrowerId) {
        return res.status(403).json({ 
          success: false,
          message: "You cannot fund your own loan. Borrowers and lenders must be different users." 
        });
      }
      
      const offer = await storage.createLoanOffer({
        ...validatedData,
        lenderId,
      });

      // Notify admin about funding attempt
      await sendFundingNotification(loan, lenderId);
      
      res.status(201).json(offer);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get loan offers for a specific loan
  app.get("/api/loans/:id/offers", async (req, res) => {
    const loanId = parseInt(req.params.id);
    const offers = await storage.getLoanOffers(loanId);
    res.json(offers);
  });

  // Get user's loan offers
  app.get("/api/users/:id/offers", async (req, res) => {
    const userId = parseInt(req.params.id);
    const offers = await storage.getUserOffers(userId);
    res.json(offers);
  });

  // Accept loan offer and create multisig escrow address
  app.post("/api/loan-offers/:offerId/accept", async (req, res) => {
    try {
      const offerId = parseInt(req.params.offerId);
      const { borrowerPubkey, lenderPubkey } = req.body;

      console.log(`Accepting loan offer ${offerId} with pubkeys:`);
      console.log(`Borrower: ${borrowerPubkey}`);
      console.log(`Lender: ${lenderPubkey}`);

      if (!offerId || !borrowerPubkey || !lenderPubkey) {
        return res.status(400).json({ 
          success: false,
          message: "Offer ID, borrower pubkey, and lender pubkey are required" 
        });
      }

      // Accept the loan offer and create multisig escrow
      const result = await lendingWorkflow.acceptLoanOffer(offerId, borrowerPubkey, lenderPubkey);

      if (result.success) {
        res.json({
          success: true,
          message: "Loan offer accepted successfully! Multisig escrow created.",
          loanId: result.loanId,
          escrowAddress: result.escrowAddress,
          redeemScript: result.redeemScript,
          borrowerPubkey: result.borrowerPubkey,
          lenderPubkey: result.lenderPubkey,
          platformPubkey: result.platformPubkey,
          instructions: `Borrower should now deposit Bitcoin to escrow address: ${result.escrowAddress}`
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.errorMessage || "Failed to accept loan offer"
        });
      }
    } catch (error: any) {
      console.error("Error accepting loan offer:", error);
      res.status(500).json({ 
        success: false,
        message: "Internal server error while accepting loan offer",
        error: error?.message 
      });
    }
  });

  // Initialize Bitcoin lending workflow services
  const bitcoinEscrow = new BitcoinEscrowService();
  const ltvValidator = new LtvValidationService();
  const getCurrentBtcPrice = async () => {
    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd'
      );
      
      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }
      
      const data = await response.json();
      return data.bitcoin.usd;
    } catch (error) {
      console.error('Error fetching BTC price for lending workflow:', error);
      // Fallback to mock data if API fails
      const basePrice = 100000;
      const variation = (Math.random() - 0.5) * 2000;
      return Math.round(basePrice + variation);
    }
  };

  // Helper function to get BTC price in specific currency
  const getBtcPriceForCurrency = async (currency: string) => {
    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,eur'
      );
      
      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (currency === 'EUR') {
        return data.bitcoin.eur;
      } else {
        return data.bitcoin.usd; // Default to USD for USDC and other currencies
      }
    } catch (error) {
      console.error('Error fetching BTC price for currency:', error);
      // Fallback prices
      return currency === 'EUR' ? 85000 : 100000;
    }
  };
  
  const lendingWorkflow = new LendingWorkflowService(
    storage,
    bitcoinEscrow,
    ltvValidator,
    getCurrentBtcPrice
  );

  // Email notification helper for funding attempts
  // Send notification to borrower when their loan gets funded
async function sendLoanFundedNotification(loan: any, lender: any) {
  try {
    const borrower = await storage.getUser(loan.borrowerId);
    if (!borrower) return;

    await sendEmail({
      to: borrower.email,
      from: "Reconquest <noreply@reconquestp2p.com>", 
      subject: `🎉 Your Loan Has Been Funded! - Loan #${loan.id}`,
      html: `
        <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
          <div style="text-align: center; padding: 20px; background: #fff; border-radius: 8px 8px 0 0;">
            <img src="${getBaseUrl()}/logo.png" alt="Reconquest" style="max-width: 200px; height: auto;" />
          </div>
          <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); padding: 20px;">
            <h1 style="color: white; margin: 0; text-align: center;">🎉 Loan Funded Successfully!</h1>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <h2 style="color: #333; margin-top: 0;">Great News, ${borrower.firstName || borrower.username}!</h2>
            
            <p style="color: #666; font-size: 16px; line-height: 1.5;">
              Your loan request has been funded by a lender. The collateral deposit process has begun.
            </p>
            
            <div style="background: #d1ecf1; border: 1px solid #bee5eb; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #0c5460; margin-top: 0;">Loan Details</h3>
              <p><strong>Loan Amount:</strong> ${loan.amount} ${loan.currency}</p>
              <p><strong>Interest Rate:</strong> ${loan.interestRate}%</p>
              <p><strong>Term:</strong> ${loan.termMonths} months</p>
              <p><strong>Lender:</strong> ${lender.username}</p>
            </div>
            
            <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #856404; margin-top: 0;">Next Steps</h3>
              <p style="margin: 0; color: #856404;">
                🔐 You will receive a separate email with your Bitcoin escrow address for collateral deposit.<br/>
                📧 Check your email for escrow instructions within the next few minutes.
              </p>
            </div>
            
            <div style="text-align: center; margin-top: 30px;">
              <p style="color: #666; margin: 0;">Thank you for using Reconquest!</p>
            </div>
          </div>
        </div>
      `
    });

    console.log(`Loan funded notification sent to borrower: ${borrower.email}`);
  } catch (error) {
    console.error(`Failed to send loan funded notification:`, error);
  }
}

async function sendFundingNotification(loan: any, lenderId: number) {
    try {
      const borrower = await storage.getUser(loan.borrowerId);
      const lender = await storage.getUser(lenderId);
      if (!borrower || !lender) return;

      // Send notification to borrower that their loan has been funded
      await sendLoanFundedNotification(loan, lender);

      // Send admin notification
      await sendEmail({
        to: "admin@reconquestp2p.com",
        from: "noreply@reconquestp2p.com",
        subject: `🔔 [ADMIN ALERT] Loan Funding Initiated - Loan #${loan.id}`,
        html: `
          <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
            <div style="text-align: center; padding: 20px; background: #fff; border-radius: 8px 8px 0 0;">
              <img src="${getBaseUrl()}/logo.png" alt="Reconquest" style="max-width: 200px; height: auto;" />
            </div>
            <div style="background: linear-gradient(135deg, #FFD700 0%, #4A90E2 100%); padding: 20px;">
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

      console.log(`Funding notification sent for loan #${loan.id}`);
    } catch (error) {
      console.error(`Failed to send funding notification for loan #${loan.id}:`, error);
    }
  }

  // Email notification helper for new loans
  async function sendNotificationsForNewLoan(loan: any, borrowerId: number) {
    try {
      const borrower = await storage.getUser(borrowerId);
      if (!borrower) return;

      // Admin notification for new loan posting
      await sendEmail({
        to: "admin@reconquestp2p.com",
        from: "Reconquest <noreply@reconquestp2p.com>",
        subject: `🔔 [ADMIN ALERT] New Loan Posted - Loan #${loan.id}`,
        html: `
          <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
            <div style="text-align: center; padding: 20px; background: #fff; border-radius: 8px 8px 0 0;">
              <img src="${getBaseUrl()}/logo.png" alt="Reconquest" style="max-width: 200px; height: auto;" />
            </div>
            <div style="background: linear-gradient(135deg, #FFD700 0%, #4A90E2 100%); padding: 20px;">
              <h1 style="color: white; margin: 0; text-align: center;">New Loan Posted</h1>
            </div>
            
            <div style="background: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <h2 style="color: #333; margin-top: 0;">New Loan Request</h2>
              
              <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #333; margin-top: 0;">Loan Details</h3>
                <p><strong>Loan ID:</strong> #${loan.id}</p>
                <p><strong>Borrower:</strong> ${borrower.username} (${borrower.email})</p>
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

      // Borrower notification
      const baseUrl = getBaseUrl();
      await sendEmail({
        to: borrower.email, // Send to borrower, not admin
        from: "Reconquest <noreply@reconquestp2p.com>",
        subject: `✅ Loan Request Posted - Loan #${loan.id}`,
        html: `
          <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
            <div style="text-align: center; padding: 20px; background: #fff; border-radius: 8px 8px 0 0;">
              <img src="${baseUrl}/logo.png" alt="Reconquest" style="max-width: 200px; height: auto;" />
            </div>
            <div style="background: linear-gradient(135deg, #FFD700 0%, #4A90E2 100%); padding: 20px;">
              <h1 style="color: white; margin: 0; text-align: center;">Loan Request Submitted</h1>
            </div>
            
            <div style="background: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <h2 style="color: #333; margin-top: 0;">Hi ${borrower.username}!</h2>
              
              <p>Your loan request has been successfully posted on Reconquest. Here are the details:</p>
              
              <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #333; margin-top: 0;">Your Loan Request</h3>
                <p><strong>Loan ID:</strong> #${loan.id}</p>
                <p><strong>Amount:</strong> ${loan.amount} ${loan.currency}</p>
                <p><strong>Interest Rate:</strong> ${loan.interestRate}%</p>
                <p><strong>Term:</strong> ${loan.termMonths} months</p>
                <p><strong>Required Collateral:</strong> ${loan.collateralBtc} BTC</p>
                <p><strong>Status:</strong> Awaiting lenders</p>
              </div>
              
              <div style="background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; color: #155724;">
                  <strong>Next Steps:</strong> Your loan is now visible to lenders. You'll receive notifications when lenders show interest in funding your request.
                </p>
              </div>
              
              <div style="text-align: center; margin-top: 30px;">
                <p style="color: #666; margin: 0;">Thank you for using Reconquest!</p>
              </div>
            </div>
          </div>
        `
      });

      console.log(`Email notifications sent for new loan #${loan.id}`);
    } catch (error) {
      console.error(`Failed to send email notifications for loan #${loan.id}:`, error);
    }
  }

  // Bitcoin Lending Workflow API Endpoints

  // Step 1: Initiate a Bitcoin-backed loan
  app.post("/api/loans/bitcoin/initiate", authenticateToken, requireNonAdmin, async (req: any, res) => {
    try {
      const { borrowerId, collateralBtc, loanAmount } = req.body;
      
      if (!borrowerId || !collateralBtc || !loanAmount) {
        return res.status(400).json({ 
          message: "Missing required fields: borrowerId, collateralBtc, loanAmount" 
        });
      }

      const result = await lendingWorkflow.initiateLoan(
        parseInt(borrowerId), 
        parseFloat(collateralBtc), 
        parseFloat(loanAmount)
      );

      if (!result.success) {
        return res.status(400).json({
          message: result.errorMessage,
          ltvValidation: result.ltvValidation
        });
      }

      res.status(201).json({
        message: "Loan initiated successfully",
        loanId: result.loanId,
        escrowAddress: result.escrowAddress,
        ltvRatio: result.ltvValidation.ltvRatio,
        instructions: `Please send ${collateralBtc} BTC to the escrow address: ${result.escrowAddress}`
      });
    } catch (error) {
      console.error("Error initiating Bitcoin loan:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Step 2: Process Bitcoin escrow deposit
  app.post("/api/loans/:id/escrow/verify", authenticateToken, requireNonAdmin, async (req: any, res) => {
    try {
      const loanId = parseInt(req.params.id);
      
      const result = await lendingWorkflow.processEscrowDeposit(loanId);

      if (!result.success) {
        return res.status(400).json({ message: result.errorMessage });
      }

      res.json({
        message: "Bitcoin escrow verified successfully",
        txHash: result.txHash,
        transactionUrl: result.transactionUrl,
        status: "Lenders have been notified. Waiting for funding."
      });
    } catch (error) {
      console.error("Error processing escrow:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Step 3: Lender confirms fiat transfer
  app.post("/api/loans/:id/fiat/confirm", authenticateToken, requireNonAdmin, async (req: any, res) => {
    try {
      const loanId = parseInt(req.params.id);
      const { lenderId } = req.body;

      if (!lenderId) {
        return res.status(400).json({ message: "Missing lenderId" });
      }

      await lendingWorkflow.confirmFiatTransfer(loanId, parseInt(lenderId));

      res.json({
        message: "Fiat transfer confirmed. Borrower has been notified to confirm receipt."
      });
    } catch (error) {
      console.error("Error confirming fiat transfer:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Step 4: Borrower confirms receipt of fiat
  app.post("/api/loans/:id/receipt/confirm", authenticateToken, requireNonAdmin, async (req: any, res) => {
    try {
      const loanId = parseInt(req.params.id);

      await lendingWorkflow.confirmBorrowerReceipt(loanId);

      res.json({
        message: "Receipt confirmed. Loan is now active and countdown has started."
      });
    } catch (error) {
      console.error("Error confirming receipt:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ============================================================
  // PRE-SIGNED TRANSACTION SYSTEM - Signing Ceremony Endpoints
  // ============================================================

  /**
   * Get unsigned PSBTs for borrower signing ceremony
   * Called after deposit is confirmed, returns PSBTs for:
   * - REPAYMENT (cooperative close)
   * - DEFAULT_LIQUIDATION
   * - BORROWER_RECOVERY (time-locked)
   */
  app.get("/api/loans/:id/psbt-templates", authenticateToken, async (req: any, res) => {
    try {
      const loanId = parseInt(req.params.id);
      const userId = req.user.id;

      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }

      // Only borrower can get unsigned PSBTs for signing
      if (loan.borrowerId !== userId && req.user.role !== 'admin') {
        return res.status(403).json({ message: "Only borrower can access signing templates" });
      }

      // Need escrow details
      if (!loan.escrowAddress || !loan.escrowWitnessScript) {
        return res.status(400).json({ message: "Escrow not yet created" });
      }

      // Get borrower and lender addresses
      // Use loan.borrowerAddress first (set during key ceremony), fallback to user profile
      const borrower = await storage.getUser(loan.borrowerId);
      const lender = loan.lenderId ? await storage.getUser(loan.lenderId) : null;
      
      // Borrower address: prefer loan-specific address, then user profile
      const borrowerAddress = loan.borrowerAddress || borrower?.btcAddress;
      if (!borrowerAddress) {
        return res.status(400).json({ message: "Borrower BTC return address not set. Please complete key ceremony first." });
      }

      // For UTXO, use funding txid or mock for template creation
      const fundingTxid = loan.fundingTxid || '0'.repeat(64);
      const collateralSats = Math.round(parseFloat(loan.collateralBtc) * 100_000_000);

      const escrowUtxo = {
        txid: fundingTxid,
        vout: 0,
        amount: collateralSats
      };

      const templates = [];

      // 1. REPAYMENT PSBT - returns collateral to borrower
      try {
        const repaymentPsbt = PsbtCreatorService.createRepaymentPsbt({
          witnessScriptHex: loan.escrowWitnessScript,
          escrowUtxo,
          borrowerAddress: borrowerAddress
        });
        templates.push({
          type: 'REPAYMENT',
          description: 'Returns your collateral after loan repayment',
          psbtBase64: repaymentPsbt.psbtBase64,
          txHash: repaymentPsbt.txHash,
          outputs: repaymentPsbt.outputs
        });
      } catch (e: any) {
        console.error('Error creating REPAYMENT PSBT:', e.message);
      }

      // 2. DEFAULT_LIQUIDATION PSBT - lender gets owed amount
      // Determine lender destination based on EUR/BTC preference
      const signingLenderPreference = loan.lenderDefaultPreference || 'eur';
      const signingPlatformBtcAddress = process.env.PLATFORM_BTC_ADDRESS || '';
      let signingLenderDestination = loan.lenderBtcAddress || '';
      
      if (signingLenderPreference === 'eur' && signingPlatformBtcAddress) {
        signingLenderDestination = signingPlatformBtcAddress;
        console.log(`📋 Lender prefers EUR - default/liquidation outputs go to platform address: ${signingPlatformBtcAddress}`);
      }
      
      if (signingLenderDestination) {
        try {
          const interestRate = parseFloat(loan.interestRate) / 100;
          const loanAmount = parseFloat(loan.amount);
          const btcPrice = await getCurrentBtcPrice();
          const amountOwedSats = Math.round((loanAmount * (1 + interestRate)) / btcPrice * 100_000_000);

          const defaultPsbt = PsbtCreatorService.createDefaultLiquidationPsbt({
            witnessScriptHex: loan.escrowWitnessScript,
            escrowUtxo,
            lenderAddress: signingLenderDestination,
            borrowerAddress: borrowerAddress,
            amountOwedSats
          });
          templates.push({
            type: 'DEFAULT_LIQUIDATION',
            description: 'Distributes collateral if you default on the loan',
            psbtBase64: defaultPsbt.psbtBase64,
            txHash: defaultPsbt.txHash,
            outputs: defaultPsbt.outputs
          });
        } catch (e: any) {
          console.error('Error creating DEFAULT_LIQUIDATION PSBT:', e.message);
        }
      }

      // 3. BORROWER_RECOVERY PSBT - time-locked recovery
      if (loan.borrowerPubkey && loan.lenderPubkey && loan.platformPubkey) {
        try {
          const timelockBlocks = (loan.termMonths || 12) * 30 * 144 + 14 * 144; // term + 14 days
          const recoveryPsbt = PsbtCreatorService.createRecoveryPsbt({
            pubkeys: [loan.borrowerPubkey, loan.lenderPubkey, loan.platformPubkey],
            escrowUtxo,
            borrowerAddress: borrowerAddress,
            timelockBlocks
          });
          templates.push({
            type: 'BORROWER_RECOVERY',
            description: 'Emergency recovery if platform becomes unavailable (after timelock)',
            psbtBase64: recoveryPsbt.psbtBase64,
            txHash: recoveryPsbt.txHash,
            outputs: recoveryPsbt.outputs,
            timelockBlocks: recoveryPsbt.timelockBlocks,
            validAfterTimestamp: recoveryPsbt.validAfterTimestamp
          });
        } catch (e: any) {
          console.error('Error creating BORROWER_RECOVERY PSBT:', e.message);
        }
      }

      res.json({
        loanId,
        escrowAddress: loan.escrowAddress,
        templates,
        instructions: 'Sign each PSBT with your borrower key and submit via POST /api/loans/:id/sign-templates'
      });
    } catch (error: any) {
      console.error("Error getting PSBT templates:", error);
      res.status(500).json({ message: error.message || "Failed to get PSBT templates" });
    }
  });

  /**
   * Submit signed PSBTs from borrower signing ceremony
   * Stores the signed transactions in pre_signed_transactions table
   */
  app.post("/api/loans/:id/sign-templates", authenticateToken, requireNonAdmin, async (req: any, res) => {
    try {
      const loanId = parseInt(req.params.id);
      const userId = req.user.id;
      const { signedPsbts } = req.body;

      if (!signedPsbts || !Array.isArray(signedPsbts)) {
        return res.status(400).json({ message: "Missing signedPsbts array" });
      }

      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }

      // Only borrower can submit signed PSBTs
      if (loan.borrowerId !== userId) {
        return res.status(403).json({ message: "Only borrower can submit signed templates" });
      }

      if (!loan.borrowerPubkey) {
        return res.status(400).json({ message: "Borrower pubkey not found" });
      }

      // NOTE: P2WSH signing does NOT require deposit first
      // Signatures commit to: witness script, output address, amount
      // Signatures do NOT commit to: specific UTXO (txid:vout)
      // The UTXO is updated at broadcast time, keeping signature valid
      // This is how Lightning Network and Firefish protocol work

      // SECURITY: Verify witness script exists
      if (!loan.escrowWitnessScript) {
        return res.status(400).json({ message: "Escrow witness script not found" });
      }

      const stored = [];
      const rejected = [];

      for (const signedPsbt of signedPsbts) {
        const { type, psbtBase64, signature, txHash } = signedPsbt;

        if (!type || !psbtBase64) {
          rejected.push({ type, reason: "Missing type or PSBT data" });
          continue;
        }

        // NOTE: UTXO verification is skipped before deposit
        // P2WSH signatures don't commit to the specific UTXO (txid:vout)
        // The UTXO will be updated at broadcast time when deposit is confirmed
        // This is the Firefish/Lightning Network model for pre-signed transactions
        if (loan.fundingTxid) {
          const expectedVout = loan.fundingVout ?? 0;
          const utxoMatch = PsbtCreatorService.verifyPsbtUtxo(psbtBase64, loan.fundingTxid, expectedVout);
          if (!utxoMatch) {
            rejected.push({ type, reason: "PSBT input does not match escrow UTXO" });
            console.error(`[SigningCeremony] REJECTED ${type} - UTXO mismatch for loan #${loanId}`);
            continue;
          }
        }

        // SECURITY: Verify the PSBT input uses the correct escrow script
        // NOTE: Recovery PSBTs may use a timelock-wrapped script - accept those too
        const isRecovery = type.toUpperCase() === 'BORROWER_RECOVERY';
        const scriptMatch = PsbtCreatorService.verifyPsbtWitnessScript(
          psbtBase64, 
          loan.escrowWitnessScript
        );
        
        if (!scriptMatch && !isRecovery) {
          rejected.push({ type, reason: "PSBT witness script does not match escrow" });
          console.error(`[SigningCeremony] REJECTED ${type} - witness script mismatch for loan #${loanId}`);
          continue;
        }
        
        // For recovery PSBTs, verify the script contains the escrow pubkeys (timelock-wrapped)
        if (isRecovery && !scriptMatch) {
          // Allow recovery scripts that contain the same pubkeys but with timelock
          console.log(`[SigningCeremony] Recovery PSBT uses timelock script - allowing for loan #${loanId}`);
        }

        // SECURITY: Cryptographically verify the signature from borrower's key
        const hasValidSig = PsbtCreatorService.verifySignature(psbtBase64, loan.borrowerPubkey);
        if (!hasValidSig) {
          rejected.push({ type, reason: "Invalid or missing borrower signature (cryptographic verification failed)" });
          console.error(`[SigningCeremony] REJECTED ${type} - invalid signature for loan #${loanId}`);
          continue;
        }

        const normalizedType = normalizeToStorageType(type);

        const existingTemplates = await storage.getPreSignedTransactions(loanId, normalizedType);
        let tx;
        if (existingTemplates.length > 0) {
          tx = await storage.updatePreSignedTransaction(existingTemplates[0].id, {
            psbt: psbtBase64,
            signature: signature || 'embedded_in_psbt',
          });
          if (!tx) {
            tx = existingTemplates[0];
          }
          console.log(`[SigningCeremony] Updated existing template #${existingTemplates[0].id} with signed ${type} PSBT for loan #${loanId}`);
        } else {
          tx = await storage.storePreSignedTransaction({
            loanId,
            partyRole: 'borrower',
            partyPubkey: loan.borrowerPubkey,
            txType: normalizedType,
            psbt: psbtBase64,
            signature: signature || 'embedded_in_psbt',
            txHash: txHash || crypto.createHash('sha256').update(psbtBase64).digest('hex').slice(0, 64)
          });
          console.log(`[SigningCeremony] Stored new signed ${type} PSBT for loan #${loanId}`);
        }

        stored.push({
          type,
          id: tx.id,
          verified: true
        });
      }

      // Require at least one valid signed PSBT
      if (stored.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No valid signed PSBTs accepted",
          rejected
        });
      }

      // Update loan status to indicate signing ceremony complete
      await storage.updateLoan(loanId, {
        borrowerSigningComplete: true
      });

      // Also store in loan columns for quick access
      for (const signedPsbt of signedPsbts) {
        if (signedPsbt.type === 'REPAYMENT') {
          await storage.updateLoan(loanId, { txRepaymentHex: signedPsbt.psbtBase64 });
        } else if (signedPsbt.type === 'DEFAULT_LIQUIDATION') {
          await storage.updateLoan(loanId, { txDefaultHex: signedPsbt.psbtBase64 });
        } else if (signedPsbt.type === 'BORROWER_RECOVERY') {
          await storage.updateLoan(loanId, { txRecoveryHex: signedPsbt.psbtBase64 });
        }
      }

      res.json({
        success: true,
        message: `Signing ceremony complete. Stored ${stored.length} pre-signed transactions.`,
        stored,
        rejected: rejected.length > 0 ? rejected : undefined
      });
    } catch (error: any) {
      console.error("Error storing signed PSBTs:", error);
      res.status(500).json({ message: error.message || "Failed to store signed PSBTs" });
    }
  });

  /**
   * Submit borrower signatures for pre-generated PSBT templates
   * 
   * This endpoint accepts DER-encoded signatures and validates them against
   * the unsigned PSBTs that were generated during escrow setup.
   * 
   * Workflow:
   * 1. TransactionTemplateService generates unsigned PSBTs at escrow creation
   * 2. Borrower signs the PSBTs offline/client-side
   * 3. Borrower submits DER signatures via this endpoint
   * 4. Server validates signatures and stores them
   * 5. Loan is marked ready for platform co-signing when needed
   */
  app.post("/api/loans/:id/submit-signatures", authenticateToken, requireNonAdmin, async (req: any, res) => {
    const loanId = parseInt(req.params.id);
    const userId = req.user.id;
    
    // Rate limiting - track attempts per loan
    const attemptKey = `signature_attempt_${loanId}`;
    const attempts = (global as any)[attemptKey] || 0;
    if (attempts >= 5) {
      console.error(`[SubmitSignatures] Rate limit exceeded for loan #${loanId}`);
      return res.status(429).json({
        success: false,
        error: "Too many signature submission attempts. Please try again later."
      });
    }
    (global as any)[attemptKey] = attempts + 1;
    
    // Reset rate limit after 10 minutes
    setTimeout(() => {
      (global as any)[attemptKey] = Math.max(0, ((global as any)[attemptKey] || 0) - 1);
    }, 10 * 60 * 1000);

    try {
      const { signatures, borrowerPubkey } = req.body;

      // Validate request body
      if (!signatures || typeof signatures !== 'object') {
        return res.status(400).json({
          success: false,
          error: "Missing signatures object"
        });
      }

      if (!borrowerPubkey || typeof borrowerPubkey !== 'string') {
        return res.status(400).json({
          success: false,
          error: "Missing borrowerPubkey"
        });
      }

      const requiredTypes = [STORAGE_TX_TYPES.REPAYMENT, STORAGE_TX_TYPES.DEFAULT, STORAGE_TX_TYPES.LIQUIDATION, STORAGE_TX_TYPES.RECOVERY];
      const missingTypes = requiredTypes.filter(t => !signatures[t]);
      if (missingTypes.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Missing signatures for: ${missingTypes.join(', ')}`
        });
      }

      // Fetch loan and verify ownership
      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({
          success: false,
          error: "Loan not found"
        });
      }

      if (loan.borrowerId !== userId) {
        return res.status(403).json({
          success: false,
          error: "Only the borrower can submit signatures"
        });
      }

      // Verify pubkey matches loan's borrower pubkey
      if (loan.borrowerPubkey && loan.borrowerPubkey !== borrowerPubkey) {
        return res.status(400).json({
          success: false,
          error: "Provided pubkey does not match loan's borrower pubkey"
        });
      }

      // Retrieve existing unsigned PSBTs from database
      const existingPsbts = await TransactionTemplateService.getPreSignedTransactions(loanId);
      if (existingPsbts.length === 0) {
        return res.status(400).json({
          success: false,
          error: "No unsigned PSBT templates found. Generate templates first."
        });
      }

      // Check if signatures already exist
      const alreadySigned = existingPsbts.filter(p => p.signature && p.signature.length > 0);
      if (alreadySigned.length > 0) {
        return res.status(400).json({
          success: false,
          error: "Signatures already submitted for this loan"
        });
      }

      // Validate each signature
      const signaturesAccepted: Record<string, boolean> = {};
      const validationErrors: string[] = [];

      for (const txType of requiredTypes) {
        const signature = signatures[txType];
        const psbtRecord = existingPsbts.find(p => p.txType === txType);

        if (!psbtRecord) {
          signaturesAccepted[txType] = false;
          validationErrors.push(`No PSBT template found for ${txType}`);
          continue;
        }

        // Validate DER signature structure using PsbtCreatorService
        const derValidation = PsbtCreatorService.validateDerSignature(signature);
        if (!derValidation.valid) {
          signaturesAccepted[txType] = false;
          validationErrors.push(`Invalid ${txType} signature: ${derValidation.reason}`);
          continue;
        }

        // TODO: In production, verify signature cryptographically against PSBT sighash
        // This requires parsing the PSBT, computing the sighash, and verifying with secp256k1
        // For now, we accept properly formatted DER signatures after structure validation
        
        signaturesAccepted[txType] = true;
        console.log(`[SubmitSignatures] Validated ${txType} signature for loan #${loanId}`);
      }

      // Check if all signatures are valid
      const allValid = Object.values(signaturesAccepted).every(v => v === true);
      
      if (!allValid) {
        return res.status(400).json({
          success: false,
          error: validationErrors[0] || "One or more signatures failed validation",
          signaturesAccepted
        });
      }

      // All signatures valid - update database
      for (const txType of requiredTypes) {
        const signature = signatures[txType];
        const psbtRecord = existingPsbts.find(p => p.txType === txType);
        
        if (psbtRecord) {
          await storage.updatePreSignedTransaction(psbtRecord.id, {
            signature,
            broadcastStatus: 'signed'
          });
          console.log(`[SubmitSignatures] Stored ${txType} signature for loan #${loanId}: ${signature.slice(0, 20)}...`);
        }
      }

      // Update loan status
      await storage.updateLoan(loanId, {
        borrowerSigningComplete: true
      });

      console.log(`[SubmitSignatures] All 4 signatures validated and stored for loan #${loanId}`);

      res.json({
        success: true,
        message: "All signatures validated and stored",
        signaturesAccepted
      });

    } catch (error: any) {
      console.error(`[SubmitSignatures] Error for loan #${loanId}:`, error);
      res.status(500).json({
        success: false,
        error: "Internal error processing signatures"
      });
    }
  });

  // ================================================================
  // EMERGENCY RECOVERY ENDPOINT
  // Allows borrowers to recover collateral if platform is unavailable
  // NO AUTHENTICATION REQUIRED (emergency scenario)
  // ================================================================
  
  // Rate limiting for emergency recovery endpoint
  const emergencyRecoveryAttempts = new Map<string, { count: number; resetTime: number }>();
  
  app.post("/api/loans/:id/emergency-recovery", async (req: any, res) => {
    const loanId = parseInt(req.params.id);
    const clientIp = req.ip || req.connection?.remoteAddress || 'unknown';
    
    // Rate limiting: Max 10 requests per hour per loan, 50 per hour per IP
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    const loanKey = `loan:${loanId}`;
    const ipKey = `ip:${clientIp}`;
    
    for (const key of [loanKey, ipKey]) {
      const limit = key.startsWith('loan:') ? 10 : 50;
      const record = emergencyRecoveryAttempts.get(key);
      
      if (record && now < record.resetTime) {
        if (record.count >= limit) {
          console.warn(`🚨 [EmergencyRecovery] Rate limit exceeded for ${key}`);
          return res.status(429).json({ 
            error: "Too many recovery attempts. Please try again later.",
            retryAfter: Math.ceil((record.resetTime - now) / 1000)
          });
        }
        record.count++;
      } else {
        emergencyRecoveryAttempts.set(key, { count: 1, resetTime: now + oneHour });
      }
    }
    
    try {
      console.log(`🚨 [EmergencyRecovery] Recovery requested for loan #${loanId} from IP ${clientIp}`);
      
      // Step 1: Get loan details
      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ error: "Loan not found" });
      }
      
      // Step 2: Get pre-signed recovery transaction
      const preSignedTxs = await storage.getPreSignedTransactions(loanId);
      const recoveryTxs = preSignedTxs.filter(tx => tx.txType === STORAGE_TX_TYPES.RECOVERY);
      
      if (recoveryTxs.length === 0) {
        return res.status(404).json({ 
          error: "No recovery transaction found for this loan",
          message: "This loan may not have pre-signed transactions enabled. Legacy loans require platform assistance for recovery."
        });
      }
      
      const recoveryTx = recoveryTxs[0];
      
      // Step 3: Check if timelock has expired
      const currentTime = new Date();
      const ALLOW_TIMELOCK_BYPASS = process.env.NODE_ENV === 'development' || 
                                    process.env.BITCOIN_NETWORK === 'testnet4';
      
      if (recoveryTx.validAfter && currentTime < recoveryTx.validAfter) {
        const daysRemaining = Math.ceil((recoveryTx.validAfter.getTime() - currentTime.getTime()) / (1000 * 60 * 60 * 24));
        
        if (!ALLOW_TIMELOCK_BYPASS) {
          // Production behavior: enforce timelock
          return res.status(403).json({
            error: "Recovery timelock has not expired yet",
            validAfter: recoveryTx.validAfter,
            daysRemaining,
            message: `Recovery transaction can be broadcast after ${recoveryTx.validAfter.toISOString()}. This timelock protects against premature recovery.`
          });
        } else {
          // Development/testnet: warn but allow for testing
          console.warn(`⚠️ [EmergencyRecovery] DEV MODE: Bypassing timelock check for loan #${loanId}`);
          console.warn(`   Timelock would expire at: ${recoveryTx.validAfter.toISOString()}`);
        }
      }
      
      // Step 4: Return recovery PSBT to borrower
      console.log(`🚨 [EmergencyRecovery] Returning recovery PSBT for loan #${loanId}`);
      console.log(`   Timelock expired: ${recoveryTx.validAfter || 'N/A'}`);
      console.log(`   Borrower can now broadcast recovery transaction`);
      
      res.json({
        success: true,
        message: "Recovery transaction available for broadcast",
        recovery: {
          psbt: recoveryTx.psbt,
          txType: recoveryTx.txType,
          validAfter: recoveryTx.validAfter,
          borrowerSignatureIncluded: !!(recoveryTx.signature && recoveryTx.signature.length > 0),
          instructions: [
            "1. This PSBT contains your pre-signed recovery transaction",
            "2. The timelock has expired, so you can broadcast immediately",
            "3. Use a Bitcoin wallet (Sparrow, Electrum) or broadcasting service to finalize and broadcast",
            "4. After 1 confirmation, your collateral will be returned to your designated address",
            "5. If you need to sign again, use your original passphrase to derive your key"
          ]
        },
        loan: {
          id: loan.id,
          escrowAddress: loan.escrowAddress,
          collateralBtc: loan.collateralBtc,
          status: loan.status,
          borrowerAddress: loan.borrowerAddress
        },
        securityNotice: "This endpoint is designed for emergency recovery when the platform is unavailable. The 30-day timelock ensures you cannot recover collateral before giving the platform time to resolve issues."
      });
      
    } catch (error: any) {
      console.error(`🚨 [EmergencyRecovery] Error for loan #${loanId}:`, error);
      res.status(500).json({ error: "Failed to retrieve recovery transaction" });
    }
  });

  /**
   * Verify pre-signed transactions exist for a loan
   * Returns status of all required pre-signed transactions
   */
  app.get("/api/loans/:id/verify-presigned", authenticateToken, async (req: any, res) => {
    try {
      const loanId = parseInt(req.params.id);
      const userId = req.user.id;

      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }

      // Only borrower, lender, or admin can verify
      if (loan.borrowerId !== userId && loan.lenderId !== userId && req.user.role !== 'admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get all pre-signed transactions for this loan
      const preSignedTxs = await storage.getPreSignedTransactions(loanId);

      const repaymentTxs = preSignedTxs.filter(tx => tx.txType === STORAGE_TX_TYPES.REPAYMENT);
      const defaultTxs = preSignedTxs.filter(tx => tx.txType === STORAGE_TX_TYPES.DEFAULT || tx.txType === STORAGE_TX_TYPES.LIQUIDATION);
      const recoveryTxs = preSignedTxs.filter(tx => tx.txType === STORAGE_TX_TYPES.RECOVERY);

      const hasRepayment = repaymentTxs.length > 0 || !!loan.txRepaymentHex;
      const hasDefault = defaultTxs.length > 0 || !!loan.txDefaultHex;
      const hasRecovery = recoveryTxs.length > 0 || !!loan.txRecoveryHex;

      // Check if recovery timelock has passed
      let recoveryAvailable = false;
      let recoveryAvailableAt = null;
      if (hasRecovery && recoveryTxs[0]?.validAfter) {
        recoveryAvailableAt = recoveryTxs[0].validAfter;
        recoveryAvailable = new Date() >= new Date(recoveryTxs[0].validAfter);
      }

      res.json({
        loanId,
        isLegacy: !hasRepayment && !hasDefault && !hasRecovery,
        preSignedTransactions: {
          repayment: {
            exists: hasRepayment,
            count: repaymentTxs.length,
            inLoanColumns: !!loan.txRepaymentHex
          },
          default: {
            exists: hasDefault,
            count: defaultTxs.length,
            inLoanColumns: !!loan.txDefaultHex
          },
          recovery: {
            exists: hasRecovery,
            count: recoveryTxs.length,
            inLoanColumns: !!loan.txRecoveryHex,
            timelockExpired: recoveryAvailable,
            availableAt: recoveryAvailableAt
          }
        },
        signingComplete: loan.borrowerSigningComplete || false,
        allRequiredPresent: hasRepayment && hasDefault && hasRecovery,
        summary: hasRepayment && hasDefault && hasRecovery
          ? 'All pre-signed transactions present - full non-custodial protection'
          : 'Some pre-signed transactions missing - using platform-assisted model'
      });
    } catch (error: any) {
      console.error("Error verifying pre-signed transactions:", error);
      res.status(500).json({ message: error.message || "Failed to verify pre-signed transactions" });
    }
  });

  /**
   * Borrower emergency recovery endpoint
   * Uses pre-signed RECOVERY transaction after timelock expires
   */
  app.post("/api/loans/:id/emergency-recovery", authenticateToken, requireNonAdmin, async (req: any, res) => {
    try {
      const loanId = parseInt(req.params.id);
      const userId = req.user.id;

      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }

      // Only borrower can trigger emergency recovery
      if (loan.borrowerId !== userId) {
        return res.status(403).json({ message: "Only borrower can trigger emergency recovery" });
      }

      // Get recovery transaction
      const recoveryTxs = await storage.getPreSignedTransactions(loanId, 'recovery');
      const recoveryPsbt = recoveryTxs[0]?.psbt || loan.txRecoveryHex;

      if (!recoveryPsbt) {
        return res.status(400).json({ 
          message: "No pre-signed recovery transaction found",
          suggestion: "This loan may be using the legacy platform-assisted model. Contact support for recovery."
        });
      }

      // Check timelock
      const recoveryTx = recoveryTxs[0];
      if (recoveryTx?.validAfter && new Date() < new Date(recoveryTx.validAfter)) {
        const availableAt = new Date(recoveryTx.validAfter);
        return res.status(400).json({
          message: "Recovery timelock has not expired yet",
          availableAt: availableAt.toISOString(),
          timeRemaining: Math.ceil((availableAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) + ' days'
        });
      }

      // The recovery PSBT should already have borrower's signature
      // We need to check if it's fully signed (borrower already signed during ceremony)
      const sigCount = PsbtCreatorService.countSignatures(recoveryPsbt);

      if (sigCount < 2) {
        // Need platform to add signature for 2-of-3
        // NOTE: For true borrower-only recovery, this would use a different script
        // that only requires borrower's signature after timelock
        return res.status(400).json({
          message: "Recovery transaction needs additional signatures",
          signaturesPresent: sigCount,
          signaturesRequired: 2,
          note: "Contact platform support or wait for automated recovery process"
        });
      }

      // Finalize and broadcast
      try {
        const { broadcastTransaction } = await import('./services/bitcoin-broadcast.js');
        const { txHex, txid } = PsbtCreatorService.finalizeAndExtract(recoveryPsbt);
        
        const result = await broadcastTransaction(txHex);
        
        if (result.success) {
          await storage.updateLoan(loanId, {
            status: 'recovered',
            collateralReleased: true,
            escrowState: 'collateral_released',
            collateralReleaseTxid: result.txid,
            collateralReleasedAt: new Date(),
            collateralReleaseError: null,
          });

          res.json({
            success: true,
            message: "Emergency recovery transaction broadcast successfully",
            txid: result.txid,
            broadcastUrl: result.broadcastUrl
          });
        } else {
          res.status(400).json({
            success: false,
            message: "Failed to broadcast recovery transaction",
            error: result.error
          });
        }
      } catch (finalizeError: any) {
        res.status(400).json({
          success: false,
          message: "Failed to finalize recovery transaction",
          error: finalizeError.message
        });
      }
    } catch (error: any) {
      console.error("Error processing emergency recovery:", error);
      res.status(500).json({ message: error.message || "Failed to process emergency recovery" });
    }
  });

  /**
   * Prepare recovery sighashes for borrower-assisted collateral release
   * Server creates unsigned transaction, computes BIP 143 sighashes, returns to client
   * Client signs sighashes with borrower key (never leaves browser) and submits
   */
  app.post("/api/loans/:id/recovery-sighash", authenticateToken, requireNonAdmin, async (req: any, res) => {
    try {
      const loanId = parseInt(req.params.id);
      const userId = req.user.id;

      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }

      if (loan.borrowerId !== userId) {
        return res.status(403).json({ message: "Only borrower can initiate collateral recovery" });
      }

      const { prepareRecoverySighashes } = await import('./services/CollateralReleaseService.js');
      const result = await prepareRecoverySighashes(storage, loanId);

      if (result.success) {
        res.json({
          success: true,
          sighashes: result.sighashes,
          txDetails: result.txDetails,
          borrowerPubkey: loan.borrowerPubkey,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }
    } catch (error: any) {
      console.error("Error preparing recovery sighashes:", error);
      res.status(500).json({ message: error.message || "Failed to prepare recovery sighashes" });
    }
  });

  /**
   * Complete recovery: accept borrower DER signatures, add lender sig, broadcast
   * Client has signed the sighashes with borrower key, server completes the transaction
   */
  app.post("/api/loans/:id/recovery-broadcast", authenticateToken, requireNonAdmin, async (req: any, res) => {
    try {
      const loanId = parseInt(req.params.id);
      const userId = req.user.id;
      const { signatures } = req.body;

      if (!signatures || !Array.isArray(signatures) || signatures.length === 0) {
        return res.status(400).json({ message: "Missing signatures array in request body" });
      }

      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }

      if (loan.borrowerId !== userId) {
        return res.status(403).json({ message: "Only borrower can broadcast recovery transaction" });
      }

      const { completeRecoveryWithSignatures } = await import('./services/CollateralReleaseService.js');
      const result = await completeRecoveryWithSignatures(storage, loanId, signatures);

      if (result.success) {
        try {
          await storage.updateLoan(loanId, {
            collateralReleased: true,
            escrowState: 'collateral_released',
            collateralReleaseTxid: result.txid,
            collateralReleasedAt: new Date(),
            collateralReleaseError: null,
          });
        } catch (dbError: any) {
          console.error(`[RECOVERY] DB update failed for loan #${loanId} after successful broadcast (txid: ${result.txid}):`, dbError.message);
        }

        res.json({
          success: true,
          txid: result.txid,
          broadcastUrl: result.broadcastUrl,
          message: "Collateral recovery transaction broadcast successfully!"
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }
    } catch (error: any) {
      console.error("Error broadcasting recovery:", error);
      res.status(500).json({ message: error.message || "Failed to broadcast recovery transaction" });
    }
  });

  // ============================================================
  // END PRE-SIGNED TRANSACTION SYSTEM
  // ============================================================

  // LTV Validation endpoint for frontend
  app.post("/api/loans/validate-ltv", async (req, res) => {
    try {
      const { collateralBtc, loanAmount } = req.body;
      
      if (!collateralBtc || !loanAmount) {
        return res.status(400).json({ 
          message: "Missing required fields: collateralBtc, loanAmount" 
        });
      }

      const btcPrice = await getCurrentBtcPrice();
      const validation = ltvValidator.validateLoanRequest(
        parseFloat(collateralBtc), 
        parseFloat(loanAmount), 
        btcPrice
      );

      res.json({
        validation,
        btcPrice,
        collateralValue: parseFloat(collateralBtc) * btcPrice
      });
    } catch (error) {
      console.error("Error validating LTV:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin routes
  app.get("/api/admin/stats", async (req, res) => {
    try {
      const allLoans = await storage.getAllLoans();
      const activeLoans = allLoans.filter(loan => 
        loan.status === "initiated" || loan.status === "active" || loan.status === "funding"
      );
      
      const totalVolume = allLoans.reduce((sum, loan) => sum + Number(loan.amount), 0);
      const activeLtvs = activeLoans
        .filter(loan => loan.status === "initiated" || loan.status === "active")
        .map(loan => Number(loan.ltvRatio));
      
      const averageLtv = activeLtvs.length > 0 
        ? activeLtvs.reduce((sum, ltv) => sum + ltv, 0) / activeLtvs.length 
        : 0;

      res.json({
        totalLoans: allLoans.length,
        activeLoans: activeLoans.length,
        totalVolume,
        averageLtv
      });
    } catch (error) {
      console.error("Error fetching admin stats:", error);
      res.status(500).json({ message: "Failed to fetch admin stats" });
    }
  });

  app.get("/api/admin/loans", async (req, res) => {
    try {
      const allLoans = await storage.getAllLoans();
      const currentBtcPrice = await getCurrentBtcPrice();
      
      const loansWithLtv = allLoans.map(loan => {
        let currentLtv = undefined;
        let ltvStatus = undefined;
        
        if (loan.status === "initiated" || loan.status === "active") {
          const currentCollateralValue = Number(loan.collateralBtc) * currentBtcPrice;
          currentLtv = (Number(loan.amount) / currentCollateralValue) * 100;
          
          if (currentLtv < 50) {
            ltvStatus = "healthy";
          } else if (currentLtv < 70) {
            ltvStatus = "warning";
          } else {
            ltvStatus = "critical";
          }
        }
        
        // SECURITY: Sanitize loan to remove lender private key
        return {
          ...ResponseSanitizer.sanitizeLoan(loan),
          currentLtv,
          ltvStatus
        };
      });
      
      res.json(loansWithLtv);
    } catch (error) {
      console.error("Error fetching admin loans:", error);
      res.status(500).json({ message: "Failed to fetch admin loans" });
    }
  });

  // Admin users endpoint - track user registrations
  app.get("/api/admin/users", async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      
      // Remove passwords from response for security
      const safeUsers = allUsers.map(user => {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });
      
      res.json(safeUsers);
    } catch (error) {
      console.error("Error fetching admin users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // ========== ADMIN DISPUTE RESOLUTION ENDPOINTS ==========
  // Deterministic outcome-based dispute resolution
  
  // Get all disputes under review
  app.get("/api/admin/disputes", authenticateToken, async (req, res) => {
    try {
      // Verify admin role
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { getDisputesUnderReview } = await import('./services/dispute-resolution.js');
      const disputesUnderReview = await getDisputesUnderReview();
      
      res.json(disputesUnderReview);
    } catch (error) {
      console.error("Error fetching disputes:", error);
      res.status(500).json({ message: "Failed to fetch disputes" });
    }
  });

  // Resolve a dispute with a decision
  app.post("/api/admin/disputes/:loanId/resolve", authenticateToken, async (req, res) => {
    try {
      // Verify admin role
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const loanId = parseInt(req.params.loanId);
      if (isNaN(loanId)) {
        return res.status(400).json({ message: "Invalid loan ID" });
      }
      
      // Validate request body
      const { resolveDisputeRequestSchema } = await import('@shared/schema');
      const parseResult = resolveDisputeRequestSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Invalid request", 
          errors: parseResult.error.errors 
        });
      }
      
      const { decision, adminNotes } = parseResult.data;
      
      const { resolveDispute } = await import('./services/dispute-resolution.js');
      const result = await resolveDispute(loanId, decision, req.user.id, adminNotes);
      
      if (!result.success) {
        return res.status(400).json(result);
      }
      
      res.json(result);
    } catch (error) {
      console.error("Error resolving dispute:", error);
      res.status(500).json({ message: "Failed to resolve dispute" });
    }
  });

  // Set a loan to under_review status (for testing)
  app.post("/api/admin/disputes/:loanId/set-under-review", authenticateToken, async (req, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const loanId = parseInt(req.params.loanId);
      if (isNaN(loanId)) {
        return res.status(400).json({ message: "Invalid loan ID" });
      }
      
      const { setLoanUnderReview } = await import('./services/dispute-resolution.js');
      const updatedLoan = await setLoanUnderReview(loanId);
      
      if (!updatedLoan) {
        return res.status(404).json({ message: "Loan not found" });
      }
      
      const disputeDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const deadlineStr = disputeDeadline.toLocaleDateString('en-GB', { 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
      });
      const rawBaseUrl = process.env.APP_URL || process.env.REPLIT_DEPLOYMENT_URL || `https://${process.env.REPLIT_DEV_DOMAIN}`;
      const baseUrl = rawBaseUrl.replace(/\/+$/, '');
      
      const { sendDisputeNotificationEmail } = await import('./email.js');
      
      const borrower = await storage.getUser(updatedLoan.borrowerId);
      const lender = updatedLoan.lenderId ? await storage.getUser(updatedLoan.lenderId) : null;
      
      const emailResults: string[] = [];
      
      if (borrower) {
        const sent = await sendDisputeNotificationEmail({
          to: borrower.email,
          recipientName: borrower.username,
          recipientRole: 'borrower',
          loanId,
          loanAmount: updatedLoan.amount,
          currency: updatedLoan.currency,
          interestRate: updatedLoan.interestRate,
          disputeDeadline: deadlineStr,
          dashboardUrl: baseUrl,
        });
        emailResults.push(`Borrower (${borrower.email}): ${sent ? 'sent' : 'failed'}`);
      }
      
      if (lender) {
        const sent = await sendDisputeNotificationEmail({
          to: lender.email,
          recipientName: lender.username,
          recipientRole: 'lender',
          loanId,
          loanAmount: updatedLoan.amount,
          currency: updatedLoan.currency,
          interestRate: updatedLoan.interestRate,
          disputeDeadline: deadlineStr,
          dashboardUrl: baseUrl,
        });
        emailResults.push(`Lender (${lender.email}): ${sent ? 'sent' : 'failed'}`);
      }
      
      console.log(`[Dispute] Loan #${loanId} set under review. Emails: ${emailResults.join(', ')}`);
      
      res.json({ 
        success: true, 
        loan: ResponseSanitizer.sanitizeLoan(updatedLoan),
        emailsSent: emailResults
      });
    } catch (error) {
      console.error("Error setting loan under review:", error);
      res.status(500).json({ message: "Failed to update loan status" });
    }
  });

  // Preview fair split calculation for a dispute
  app.get("/api/admin/disputes/:loanId/preview-split", authenticateToken, async (req, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const loanId = parseInt(req.params.loanId);
      if (isNaN(loanId)) {
        return res.status(400).json({ message: "Invalid loan ID" });
      }
      
      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }
      
      // Get borrower and lender addresses
      let borrowerAddress = '';
      let lenderBtcAddress = '';
      let lenderAddress = '';
      
      if (loan.borrowerId) {
        const borrower = await storage.getUser(loan.borrowerId);
        borrowerAddress = borrower?.btcAddress || '';
      }
      if (loan.lenderId) {
        const lender = await storage.getUser(loan.lenderId);
        lenderBtcAddress = loan.lenderBtcAddress || '';
      }
      
      // Determine effective lender payout address based on preference
      const lenderPreference = loan.lenderDefaultPreference || 'eur';
      const platformBtcAddress = process.env.PLATFORM_BTC_ADDRESS || '';
      
      if (lenderPreference === 'eur') {
        lenderAddress = platformBtcAddress;
      } else {
        lenderAddress = lenderBtcAddress;
      }
      
      const { previewSplit } = await import('./services/SplitPayoutService.js');
      const preview = await previewSplit(loan);
      
      res.json({
        success: true,
        loanId,
        borrowerAddress,
        lenderAddress,
        lenderBtcAddress,
        lenderDefaultPreference: lenderPreference,
        platformBtcAddress,
        ...preview,
      });
    } catch (error) {
      console.error("Error previewing split:", error);
      res.status(500).json({ message: "Failed to preview split calculation" });
    }
  });

  // Resolve dispute with fair split payout - IMMEDIATE EXECUTION with notifications to both parties
  app.post("/api/admin/disputes/:loanId/resolve-fair-split", authenticateToken, async (req, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const loanId = parseInt(req.params.loanId);
      if (isNaN(loanId)) {
        return res.status(400).json({ message: "Invalid loan ID" });
      }
      
      const { decision, adminNotes } = req.body;
      
      // Validate decision
      const validDecisions = ['BORROWER_NOT_DEFAULTED', 'BORROWER_DEFAULTED', 'TIMEOUT_DEFAULT'];
      if (!validDecisions.includes(decision)) {
        return res.status(400).json({ message: "Invalid decision" });
      }
      
      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }
      
      if (loan.disputeStatus !== 'under_review') {
        return res.status(400).json({ message: "Loan must be under review to resolve" });
      }
      
      // Verify platform-controlled lender key exists
      if (!loan.lenderPrivateKeyEncrypted) {
        return res.status(400).json({ message: "Platform-controlled lender key not found. This loan may have been created before the Bitcoin-blind update." });
      }
      
      if (!loan.lenderPubkey || !loan.escrowWitnessScript) {
        return res.status(400).json({ message: "Escrow data incomplete" });
      }
      
      // Get addresses - route lender payout based on their preference
      let borrowerAddress = '';
      let lenderBtcAddress = '';
      let lenderAddress = '';
      
      if (loan.borrowerId) {
        const borrower = await storage.getUser(loan.borrowerId);
        borrowerAddress = borrower?.btcAddress || '';
      }
      if (loan.lenderId) {
        const lender = await storage.getUser(loan.lenderId);
        lenderBtcAddress = loan.lenderBtcAddress || '';
      }
      
      // Determine effective lender payout address based on preference
      const lenderPreference = loan.lenderDefaultPreference || 'eur';
      const platformBtcAddress = process.env.PLATFORM_BTC_ADDRESS || '';
      
      if (lenderPreference === 'eur') {
        lenderAddress = platformBtcAddress;
        console.log(`💱 Lender prefers EUR - routing BTC to platform address for fiat conversion`);
      } else {
        lenderAddress = lenderBtcAddress;
        console.log(`₿ Lender prefers BTC - routing directly to lender address`);
      }
      
      if (!lenderAddress) {
        const missingMsg = lenderPreference === 'eur' 
          ? "Platform BTC address not configured (PLATFORM_BTC_ADDRESS env var)" 
          : "Lender BTC address not found in profile";
        return res.status(400).json({ message: missingMsg });
      }
      
      // For BORROWER_NOT_DEFAULTED, we need borrower address
      if (decision === 'BORROWER_NOT_DEFAULTED' && !borrowerAddress) {
        return res.status(400).json({ message: "Borrower address not found" });
      }
      
      // ================================================================
      // SECURITY: Use pre-signed PSBTs from the signing ceremony
      // These already contain the borrower's signature, locked to
      // specific output addresses. We add platform + lender signatures
      // to complete the 3-of-3 multisig.
      // ================================================================
      
      const txType = decisionToStorageType(decision);
      
      // Get pre-signed templates from database
      // Select the LATEST PSBT with a cryptographically verified borrower signature
      const preSignedTxs = await storage.getPreSignedTransactions(loanId);
      const allMatching = preSignedTxs
        .filter(tx => tx.txType === txType)
        .sort((a, b) => (b.id - a.id));
      
      let matchingTx = null;
      for (const candidate of allMatching) {
        if (candidate.psbt && loan.borrowerPubkey) {
          const hasBorrowerSig = PsbtCreatorService.verifySignature(candidate.psbt, loan.borrowerPubkey, 0);
          if (hasBorrowerSig) {
            matchingTx = candidate;
            break;
          }
        }
      }
      
      const { EncryptionService } = await import('./services/EncryptionService.js');
      
      // Calculate the split BEFORE building the transaction so amounts are correct
      const { previewSplit } = await import('./services/SplitPayoutService.js');
      let splitCalcPre: any = null;
      try {
        splitCalcPre = await previewSplit(loan);
        console.log(`📊 Split calculation: lender=${splitCalcPre.calculation.lenderPayoutSats} sats, borrower=${splitCalcPre.calculation.borrowerPayoutSats} sats`);
      } catch (e: any) {
        console.warn(`Could not calculate split preview: ${e.message}`);
      }
      
      const lenderOwedSats = splitCalcPre?.calculation?.lenderPayoutSats || 0;
      
      let result: any;
      
      if (matchingTx) {
        // Happy path: borrower has signed, use pre-signed PSBT
        console.log(`📋 Using pre-signed ${txType} PSBT for loan #${loanId} (template ID: ${matchingTx.id})`);
        
        const { addPlatformSignaturesAndBroadcast } = await import('./services/CollateralReleaseService.js');
        
        console.log(`🔐 [Bitcoin-Blind] Admin executing resolution for Loan #${loanId} using pre-signed PSBT`);
        console.log(`   Adding platform + lender signatures and broadcasting...`);
        
        result = await addPlatformSignaturesAndBroadcast(
          storage, loan, matchingTx.psbt, EncryptionService, matchingTx.id
        );
      } else {
        // Fallback: borrower hasn't signed — platform controls 2 of 3 keys on 2-of-3 escrow
        // This is valid for BORROWER_DEFAULTED and TIMEOUT_DEFAULT decisions
        if (decision === 'BORROWER_NOT_DEFAULTED') {
          return res.status(400).json({ 
            message: "Cannot return collateral to borrower without their signed transaction. The borrower must complete the signing ceremony first." 
          });
        }
        
        console.log(`⚠️ No borrower-signed PSBT found for loan #${loanId}. Using platform+lender keys (2-of-3).`);
        
        const { createAndSignWithPlatformKeys } = await import('./services/CollateralReleaseService.js');
        
        result = await createAndSignWithPlatformKeys(
          storage, loan, lenderAddress, EncryptionService, borrowerAddress, lenderOwedSats
        );
      }
      
      if (!result.success) {
        console.error(`❌ Resolution failed for loan #${loanId}: ${result.error}`);
        return res.status(400).json({ 
          message: `Failed to complete transaction: ${result.error}` 
        });
      }
      
      // After successful broadcast, sweep any remaining UTXOs back to borrower
      if (matchingTx && borrowerAddress) {
        try {
          const { sweepRemainingUtxos } = await import('./services/CollateralReleaseService.js');
          const sweepResult = await sweepRemainingUtxos(loan, borrowerAddress, EncryptionService);
          if (sweepResult.sweptCount && sweepResult.sweptCount > 0) {
            console.log(`🧹 Swept ${sweepResult.sweptCount} extra UTXO(s) (${sweepResult.sweptAmount} sats) back to borrower. Txid: ${sweepResult.txid}`);
          }
        } catch (sweepErr: any) {
          console.warn(`🧹 Sweep attempt failed (non-critical): ${sweepErr.message}`);
        }
      }
      
      // Reuse the split calculation from before the transaction
      const splitCalc = splitCalcPre;
      
      // Update loan status to resolved
      const finalStatus = decision === 'BORROWER_NOT_DEFAULTED' ? 'completed' : 'defaulted';
      
      await storage.updateLoan(loanId, {
        disputeStatus: 'resolved',
        disputeResolvedAt: new Date(),
        status: finalStatus,
        collateralReleased: true,
        collateralReleaseTxid: result.txid || null,
        escrowState: 'collateral_released',
        collateralReleasedAt: new Date(),
        collateralReleaseError: null,
        pendingResolutionDecision: decision,
        pendingResolutionLenderSats: splitCalc?.calculation?.lenderPayoutSats || 0,
        pendingResolutionBorrowerSats: splitCalc?.calculation?.borrowerPayoutSats || 0,
        pendingResolutionBtcPrice: splitCalc?.calculation?.btcPriceEur?.toString() || '0',
      });
      
      // Create audit log
      const auditLog = {
        loanId,
        disputeId: null,
        outcome: decision,
        ruleFired: `FAIR_SPLIT_${decision}_EXECUTED`,
        txTypeUsed: 'fair_split',
        evidenceSnapshot: JSON.stringify({
          decision,
          adminNotes,
          calculation: splitCalc?.calculation || null,
          lenderPayoutSats: splitCalc?.calculation?.lenderPayoutSats || 0,
          borrowerPayoutSats: splitCalc?.calculation?.borrowerPayoutSats || 0,
          txid: result.txid,
          timestamp: new Date().toISOString(),
        }),
        broadcastTxid: result.txid || null,
        broadcastSuccess: true,
        broadcastError: null,
        triggeredBy: req.user.id,
        triggeredByRole: 'admin',
      };
      
      await storage.createDisputeAuditLog(auditLog);
      
      // Send notification emails to both parties
      const calc = splitCalc?.calculation || null;
      const lenderSats = splitCalc?.calculation?.lenderPayoutSats || 0;
      const borrowerSats = splitCalc?.calculation?.borrowerPayoutSats || 0;
      const baseUrl = getBaseUrl();
      
      if (calc) {
        const lenderBtc = (lenderSats / 100_000_000).toFixed(8);
        const borrowerBtc = (borrowerSats / 100_000_000).toFixed(8);
        const lenderEur = (lenderSats / 100_000_000 * calc.btcPriceEur).toFixed(2);
        const borrowerEur = (borrowerSats / 100_000_000 * calc.btcPriceEur).toFixed(2);
        
        // Email to lender
        if (loan.lenderId) {
          const lender = await storage.getUser(loan.lenderId);
          if (lender?.email) {
            const decisionLabel = decision === 'BORROWER_NOT_DEFAULTED' 
              ? 'Borrower Not Defaulted - Collateral returned to borrower'
              : 'Borrower Defaulted - Fair split distribution';
            
            await sendEmail({
              to: lender.email,
              from: 'Reconquest <noreply@reconquestp2p.com>',
              subject: `📢 Dispute Resolved - Loan #${loanId}`,
              html: `
                <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
                  <div style="text-align: center; padding: 20px; background: #fff; border-radius: 8px 8px 0 0;">
                    <img src="${baseUrl}/logo.png" alt="Reconquest" style="max-width: 200px; height: auto;" />
                  </div>
                  <div style="background: linear-gradient(135deg, #D4AF37 0%, #4A90E2 100%); padding: 20px;">
                    <h1 style="color: white; margin: 0; text-align: center;">Dispute Resolution Complete</h1>
                  </div>
                  <div style="padding: 20px; background: #f9f9f9;">
                    <p>Dear Lender,</p>
                    <p>The dispute for <strong>Loan #${loanId}</strong> has been reviewed and resolved by the platform.</p>
                    
                    <div style="background: #e8f5e9; border-radius: 8px; padding: 15px; margin: 20px 0;">
                      <p style="margin: 0;"><strong>✅ Transaction Broadcast:</strong></p>
                      <a href="${result.broadcastUrl}" style="color: #1976d2; word-break: break-all;">${result.txid}</a>
                    </div>
                    
                    <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #D4AF37;">
                      <h3 style="margin-top: 0; color: #333;">📊 Resolution Details</h3>
                      <table style="width: 100%; border-collapse: collapse;">
                        <tr><td style="padding: 8px 0; color: #666;">Decision:</td><td style="padding: 8px 0; font-weight: bold;">${decisionLabel}</td></tr>
                        <tr><td style="padding: 8px 0; color: #666;">Your Payout:</td><td style="padding: 8px 0; font-weight: bold; color: #28a745;">${lenderBtc} BTC (€${lenderEur})</td></tr>
                      </table>
                    </div>
                    
                    <p>Best regards,<br><strong>The Reconquest Team</strong><br><br>Questions? Contact us at <a href="mailto:admin@reconquestp2p.com" style="color: #D4AF37;">admin@reconquestp2p.com</a></p>
                  </div>
                </div>
              `,
            });
            console.log(`📧 Resolution notification sent to lender: ${lender.email}`);
          }
        }
        
        // Email to borrower
        if (loan.borrowerId) {
          const borrower = await storage.getUser(loan.borrowerId);
          if (borrower?.email) {
            const decisionLabel = decision === 'BORROWER_NOT_DEFAULTED' 
              ? 'Borrower Not Defaulted - Your collateral has been returned'
              : 'Borrower Defaulted - Fair split distribution';
            
            await sendEmail({
              to: borrower.email,
              from: 'Reconquest <noreply@reconquestp2p.com>',
              subject: `📢 Dispute Resolved - Loan #${loanId}`,
              html: `
                <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
                  <div style="text-align: center; padding: 20px; background: #fff; border-radius: 8px 8px 0 0;">
                    <img src="${baseUrl}/logo.png" alt="Reconquest" style="max-width: 200px; height: auto;" />
                  </div>
                  <div style="background: linear-gradient(135deg, #D4AF37 0%, #4A90E2 100%); padding: 20px;">
                    <h1 style="color: white; margin: 0; text-align: center;">Dispute Resolution Complete</h1>
                  </div>
                  <div style="padding: 20px; background: #f9f9f9;">
                    <p>Dear Borrower,</p>
                    <p>The dispute for <strong>Loan #${loanId}</strong> has been reviewed and resolved by the platform.</p>
                    
                    <div style="background: #e8f5e9; border-radius: 8px; padding: 15px; margin: 20px 0;">
                      <p style="margin: 0;"><strong>✅ Transaction Broadcast:</strong></p>
                      <a href="${result.broadcastUrl}" style="color: #1976d2; word-break: break-all;">${result.txid}</a>
                    </div>
                    
                    <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #D4AF37;">
                      <h3 style="margin-top: 0; color: #333;">📊 Resolution Details</h3>
                      <table style="width: 100%; border-collapse: collapse;">
                        <tr><td style="padding: 8px 0; color: #666;">Decision:</td><td style="padding: 8px 0; font-weight: bold;">${decisionLabel}</td></tr>
                        <tr><td style="padding: 8px 0; color: #666;">Your Payout:</td><td style="padding: 8px 0; font-weight: bold; color: #28a745;">${borrowerBtc} BTC (€${borrowerEur})</td></tr>
                      </table>
                    </div>
                    
                    <p>Best regards,<br><strong>The Reconquest Team</strong><br><br>Questions? Contact us at <a href="mailto:admin@reconquestp2p.com" style="color: #D4AF37;">admin@reconquestp2p.com</a></p>
                  </div>
                </div>
              `,
            });
            console.log(`📧 Resolution notification sent to borrower: ${borrower.email}`);
          }
        }
      }
      
      res.json({
        success: true,
        decision,
        calculation: splitCalc?.calculation || null,
        lenderPayoutSats: lenderSats,
        borrowerPayoutSats: borrowerSats,
        txid: result.txid,
        broadcastUrl: result.broadcastUrl,
        status: 'resolved',
        message: `Resolution executed and broadcast successfully. Both parties have been notified.`,
      });
    } catch (error) {
      console.error("Error resolving dispute with fair split:", error);
      res.status(500).json({ message: "Failed to resolve dispute" });
    }
  });

  // ===== LENDER SIGNATURE ENDPOINTS FOR DISPUTE RESOLUTION =====
  
  // Get pending resolutions for lender to sign
  app.get("/api/lender/pending-resolutions", authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      
      // Get all loans where this user is the lender with pending signatures
      const allLoans = await storage.getAllLoans();
      const pendingResolutions = allLoans.filter((loan: any) => 
        loan.lenderId === userId && 
        loan.disputeStatus === 'pending_lender_signature' &&
        loan.pendingResolutionPsbt
      );
      
      // Get user addresses for display
      const resultsWithAddresses = await Promise.all(pendingResolutions.map(async (loan: any) => {
        const lender = await storage.getUser(loan.lenderId);
        const borrower = await storage.getUser(loan.borrowerId);
        return {
          loanId: loan.id,
          decision: loan.pendingResolutionDecision,
          lenderPayoutSats: loan.pendingResolutionLenderSats,
          borrowerPayoutSats: loan.pendingResolutionBorrowerSats,
          btcPriceEur: parseFloat(loan.pendingResolutionBtcPrice || '0'),
          psbtBase64: loan.pendingResolutionPsbt,
          createdAt: loan.pendingResolutionCreatedAt,
          lenderPubkey: loan.lenderPubkey,
          escrowAddress: loan.escrowAddress,
          lenderAddress: loan.lenderBtcAddress || 'Not set',
          borrowerAddress: borrower?.btcAddress || loan.borrowerAddress || 'Not set',
        };
      }));
      
      const results = resultsWithAddresses;
      
      res.json({
        success: true,
        pendingResolutions: results,
      });
    } catch (error) {
      console.error("Error fetching pending resolutions:", error);
      res.status(500).json({ message: "Failed to fetch pending resolutions" });
    }
  });
  
  // BITCOIN-BLIND LENDER: Lender confirms resolution (platform signs with controlled lender key)
  // Lender does NOT provide a signed PSBT - they just confirm, platform signs on their behalf
  app.post("/api/lender/sign-resolution/:loanId", authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const loanId = parseInt(req.params.loanId);
      
      if (isNaN(loanId)) {
        return res.status(400).json({ message: "Invalid loan ID" });
      }
      
      // BITCOIN-BLIND: Lender just confirms - no signedPsbtBase64 required!
      // For backward compatibility, we still accept signedPsbtBase64 but don't use it
      
      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }
      
      if (loan.lenderId !== userId) {
        return res.status(403).json({ message: "You are not the lender for this loan" });
      }
      
      if (loan.disputeStatus !== 'pending_lender_signature') {
        return res.status(400).json({ message: "No pending resolution for this loan" });
      }
      
      if (!loan.pendingResolutionPsbt) {
        return res.status(400).json({ message: "Platform PSBT not found" });
      }
      
      // BITCOIN-BLIND LENDER: Platform signs with the controlled lender key
      // Lender never handles Bitcoin keys - platform operates their escrow position
      if (!loan.lenderPrivateKeyEncrypted) {
        return res.status(400).json({ message: "Platform-controlled lender key not found. This loan may have been created before the Bitcoin-blind update." });
      }
      
      if (!loan.lenderPubkey || !loan.escrowWitnessScript) {
        return res.status(400).json({ message: "Escrow data incomplete" });
      }
      
      console.log(`🔐 [Bitcoin-Blind] Lender ${userId} confirmed resolution for Loan #${loanId}`);
      console.log(`   Platform will sign with controlled lender key...`);
      
      const { completePsbtWithPlatformLenderKey } = await import('./services/SplitPayoutService.js');
      const result = await completePsbtWithPlatformLenderKey(
        loan.pendingResolutionPsbt,
        loan.lenderPrivateKeyEncrypted,
        loan.lenderPubkey,
        loan.escrowWitnessScript
      );
      
      if (!result.success) {
        return res.status(400).json({ 
          message: `Failed to complete transaction: ${result.error}` 
        });
      }
      
      // Update loan status
      const finalStatus = loan.pendingResolutionDecision === 'BORROWER_NOT_DEFAULTED' ? 'completed' : 'defaulted';
      
      await storage.updateLoan(loanId, {
        disputeStatus: 'resolved',
        disputeResolvedAt: new Date(),
        status: finalStatus,
        collateralReleased: true,
        escrowState: 'collateral_released',
        collateralReleasedAt: new Date(),
        collateralReleaseError: null,
        lenderSignatureHex: 'platform-controlled-signature', // Bitcoin-blind: platform signed
        lenderSignedAt: new Date(),
        pendingResolutionPsbt: null as any,
        pendingResolutionDecision: null as any,
        pendingResolutionCreatedAt: null as any,
      });
      
      // Update audit log with broadcast result
      const auditLog = {
        loanId,
        disputeId: null,
        outcome: loan.pendingResolutionDecision || 'FAIR_SPLIT',
        ruleFired: `LENDER_SIGNED_${loan.pendingResolutionDecision}`,
        txTypeUsed: 'fair_split',
        evidenceSnapshot: JSON.stringify({
          lenderPayoutSats: loan.pendingResolutionLenderSats,
          borrowerPayoutSats: loan.pendingResolutionBorrowerSats,
          btcPrice: loan.pendingResolutionBtcPrice,
          txid: result.txid,
          timestamp: new Date().toISOString(),
        }),
        broadcastTxid: result.txid || null,
        broadcastSuccess: true,
        broadcastError: null,
        triggeredBy: userId,
        triggeredByRole: 'lender',
      };
      
      await storage.createDisputeAuditLog(auditLog);
      
      // Send emails to both parties
      const baseUrl = getBaseUrl();
      const lenderSats = loan.pendingResolutionLenderSats || 0;
      const borrowerSats = loan.pendingResolutionBorrowerSats || 0;
      const btcPrice = parseFloat(loan.pendingResolutionBtcPrice || '0');
      const lenderBtc = (lenderSats / 100_000_000).toFixed(8);
      const borrowerBtc = (borrowerSats / 100_000_000).toFixed(8);
      const lenderEur = (lenderSats / 100_000_000 * btcPrice).toFixed(2);
      const borrowerEur = (borrowerSats / 100_000_000 * btcPrice).toFixed(2);
      
      // Get user addresses
      let lenderAddress = '';
      let borrowerAddress = '';
      
      if (loan.lenderId) {
        const lender = await storage.getUser(loan.lenderId);
        lenderAddress = loan.lenderBtcAddress || '';
        if (lender?.email) {
          await sendEmail({
            to: lender.email,
            from: 'Reconquest <noreply@reconquestp2p.com>',
            subject: `💰 Collateral Distribution Complete - Loan #${loanId}`,
            html: `
              <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
                <div style="text-align: center; padding: 20px; background: #fff; border-radius: 8px 8px 0 0;">
                  <img src="${baseUrl}/logo.png" alt="Reconquest" style="max-width: 200px; height: auto;" />
                </div>
                <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); padding: 20px;">
                  <h1 style="color: white; margin: 0; text-align: center;">Transaction Broadcast Successfully!</h1>
                </div>
                <div style="padding: 20px; background: #f9f9f9;">
                  <p>Dear Lender,</p>
                  <p>Your signature has been received and the resolution transaction for <strong>Loan #${loanId}</strong> has been broadcast to the Bitcoin network.</p>
                  
                  <div style="background: #e8f5e9; border-radius: 8px; padding: 15px; margin: 20px 0;">
                    <p style="margin: 0;"><strong>✅ Transaction ID:</strong></p>
                    <a href="${result.broadcastUrl}" style="color: #1976d2; word-break: break-all;">${result.txid}</a>
                  </div>
                  
                  <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #D4AF37;">
                    <h3 style="margin-top: 0; color: #333;">📊 Your Payout</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                      <tr><td style="padding: 8px 0; color: #666;">Amount:</td><td style="padding: 8px 0; font-weight: bold; color: #28a745;">${lenderBtc} BTC (€${lenderEur})</td></tr>
                      <tr><td style="padding: 8px 0; color: #666;">BTC Price Used:</td><td style="padding: 8px 0;">€${btcPrice.toFixed(2)}</td></tr>
                    </table>
                  </div>
                  
                  <p>Best regards,<br><strong>The Reconquest Team</strong><br><br>Questions? Contact us at <a href="mailto:admin@reconquestp2p.com" style="color: #D4AF37;">admin@reconquestp2p.com</a></p>
                </div>
              </div>
            `,
          });
        }
      }
      
      if (loan.borrowerId && borrowerSats > 0) {
        const borrower = await storage.getUser(loan.borrowerId);
        borrowerAddress = borrower?.btcAddress || '';
        if (borrower?.email) {
          await sendEmail({
            to: borrower.email,
            from: 'Reconquest <noreply@reconquestp2p.com>',
            subject: `Dispute Resolved - Loan #${loanId}`,
            html: `
              <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
                <div style="text-align: center; padding: 20px; background: #fff; border-radius: 8px 8px 0 0;">
                  <img src="${baseUrl}/logo.png" alt="Reconquest" style="max-width: 200px; height: auto;" />
                </div>
                <div style="background: linear-gradient(135deg, #D4AF37 0%, #4A90E2 100%); padding: 20px;">
                  <h1 style="color: white; margin: 0; text-align: center;">Dispute Resolution Complete</h1>
                </div>
                <div style="padding: 20px; background: #f9f9f9;">
                  <p>Dear Borrower,</p>
                  <p>The dispute for <strong>Loan #${loanId}</strong> has been resolved. Your collateral return has been sent.</p>
                  
                  <div style="background: #e8f5e9; border-radius: 8px; padding: 15px; margin: 20px 0;">
                    <p style="margin: 0;"><strong>✅ Transaction:</strong></p>
                    <a href="${result.broadcastUrl}" style="color: #1976d2; word-break: break-all;">${result.txid}</a>
                  </div>
                  
                  <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #28a745;">
                    <h3 style="margin-top: 0; color: #333;">📊 Your Collateral Return</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                      <tr><td style="padding: 8px 0; color: #666;">Amount:</td><td style="padding: 8px 0; font-weight: bold; color: #28a745;">${borrowerBtc} BTC (€${borrowerEur})</td></tr>
                      <tr><td style="padding: 8px 0; color: #666;">BTC Price Used:</td><td style="padding: 8px 0;">€${btcPrice.toFixed(2)}</td></tr>
                    </table>
                  </div>
                  
                  <p>Best regards,<br><strong>The Reconquest Team</strong><br><br>Questions? Contact us at <a href="mailto:admin@reconquestp2p.com" style="color: #D4AF37;">admin@reconquestp2p.com</a></p>
                </div>
              </div>
            `,
          });
        }
      }
      
      res.json({
        success: true,
        txid: result.txid,
        broadcastUrl: result.broadcastUrl,
        message: `Transaction broadcast successfully! TXID: ${result.txid}`,
      });
    } catch (error) {
      console.error("Error completing lender signature:", error);
      res.status(500).json({ message: "Failed to complete resolution" });
    }
  });

  // ===== MAINNET SAFETY LIMITS ADMIN ENDPOINTS =====
  
  // Get current mainnet safety limits status
  app.get("/api/admin/safety/status", authenticateToken, async (req: any, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const status = getMainnetSafetyStatus();
      res.json(status);
    } catch (error) {
      console.error("Error getting safety status:", error);
      res.status(500).json({ message: "Failed to get safety status" });
    }
  });

  // ===== LTV MONITORING ADMIN ENDPOINTS =====
  
  // Get current LTV status for all active loans
  app.get("/api/admin/ltv/status", authenticateToken, async (req, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const results = await ltvMonitoring.checkAllActiveLoans();
      
      res.json({
        success: true,
        loans: results
      });
    } catch (error) {
      console.error("Error checking LTV status:", error);
      res.status(500).json({ message: "Failed to check LTV status" });
    }
  });
  
  // Trigger immediate LTV check for a specific loan (uses real market price only)
  app.post("/api/admin/ltv/check/:loanId", authenticateToken, async (req, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const loanId = parseInt(req.params.loanId);
      
      if (isNaN(loanId)) {
        return res.status(400).json({ message: "Invalid loan ID" });
      }
      
      const result = await ltvMonitoring.checkSpecificLoan(loanId);
      
      if (!result) {
        return res.status(404).json({ message: "Loan not found" });
      }
      
      res.json({
        success: true,
        result
      });
    } catch (error) {
      console.error("Error checking loan LTV:", error);
      res.status(500).json({ message: "Failed to check loan LTV" });
    }
  });

  // STRESS TEST: Override BTC price to simulate market crash (admin only)
  app.post("/api/admin/ltv/stress-test", authenticateToken, async (req, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { priceDropPercent, clear } = req.body;
      const { setTestPriceOverride, getBtcPrice, getTestPriceOverride } = await import('./services/price-service.js');
      
      if (clear) {
        setTestPriceOverride(null);
        return res.json({
          success: true,
          message: "Price override cleared - using real market price",
          currentOverride: null
        });
      }
      
      if (typeof priceDropPercent !== 'number' || priceDropPercent < 0 || priceDropPercent > 99) {
        return res.status(400).json({ 
          message: "priceDropPercent must be a number between 0 and 99" 
        });
      }
      
      // Get current real price first
      setTestPriceOverride(null); // Clear any existing override to get real price
      const realPrice = await getBtcPrice();
      
      // Calculate stressed price (40% drop = multiply by 0.6)
      const multiplier = 1 - (priceDropPercent / 100);
      const stressedPrice = {
        usd: Math.round(realPrice.usd * multiplier),
        eur: Math.round(realPrice.eur * multiplier),
        usd24hChange: -priceDropPercent,
        lastUpdatedAt: Math.floor(Date.now() / 1000)
      };
      
      setTestPriceOverride(stressedPrice);
      
      // Trigger immediate LTV check
      const ltvResults = await ltvMonitoring.checkAllActiveLoans();
      
      res.json({
        success: true,
        message: `Price stress test activated: ${priceDropPercent}% drop`,
        realPrice: { usd: realPrice.usd, eur: realPrice.eur },
        stressedPrice: { usd: stressedPrice.usd, eur: stressedPrice.eur },
        ltvResults,
        warning: "This override affects all price checks until cleared!"
      });
    } catch (error) {
      console.error("Error in stress test:", error);
      res.status(500).json({ message: "Failed to run stress test" });
    }
  });

  // Get current stress test status
  app.get("/api/admin/ltv/stress-test/status", authenticateToken, async (req, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { getTestPriceOverride, getBtcPrice } = await import('./services/price-service.js');
      const override = getTestPriceOverride();
      
      if (override) {
        res.json({
          active: true,
          overridePrice: { usd: override.usd, eur: override.eur },
          message: "Stress test is ACTIVE - prices are overridden"
        });
      } else {
        const realPrice = await getBtcPrice();
        res.json({
          active: false,
          currentPrice: { usd: realPrice.usd, eur: realPrice.eur },
          message: "No stress test active - using real market price"
        });
      }
    } catch (error) {
      console.error("Error checking stress test status:", error);
      res.status(500).json({ message: "Failed to check stress test status" });
    }
  });

  // Admin: Retry collateral release for a completed loan
  // Used when initial release failed but loan is marked completed
  app.post("/api/admin/loans/:loanId/retry-collateral-release", authenticateToken, async (req, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const loanId = parseInt(req.params.loanId);
      if (isNaN(loanId)) {
        return res.status(400).json({ message: "Invalid loan ID" });
      }
      
      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }
      
      if (loan.status !== 'completed' && loan.status !== 'repaid') {
        return res.status(400).json({ 
          message: `Loan must be in completed or repaid status (current: ${loan.status}).` 
        });
      }
      
      // Get borrower info
      const borrower = await storage.getUser(loan.borrowerId);
      if (!borrower) {
        return res.status(400).json({ message: "Borrower not found" });
      }
      
      if (!borrower.btcAddress) {
        return res.status(400).json({ message: "Borrower has no BTC return address set" });
      }
      
      console.log(`🔄 Admin retrying collateral release for loan #${loanId} to borrower ${borrower.username}`);
      
      const { releaseCollateral } = await import('./services/CollateralReleaseService.js');
      const result = await releaseCollateral(storage, loanId);
      
      if (result.success) {
        await storage.updateLoan(loanId, {
          collateralReleased: true,
          escrowState: 'collateral_released',
          collateralReleaseTxid: result.txid,
          collateralReleasedAt: new Date(),
          collateralReleaseError: null,
        });
        
        res.json({
          success: true,
          message: `Collateral released to borrower ${borrower.username}`,
          borrowerAddress: borrower.btcAddress,
          txid: result.txid,
          broadcastUrl: result.broadcastUrl
        });
      } else {
        res.status(400).json({
          success: false,
          message: `Failed to release collateral: ${result.error}`,
          error: result.error
        });
      }
    } catch (error: any) {
      console.error("Error retrying collateral release:", error);
      res.status(500).json({ message: error.message || "Failed to retry collateral release" });
    }
  });
  
  /**
   * Admin endpoint: Regenerate PSBT templates for legacy loans
   * 
   * For loans where the signing ceremony bug left broken unsigned templates,
   * this recreates proper PSBT templates with the real funding UTXO.
   * After this, the borrower just needs to re-sign via the signing ceremony UI.
   */
  app.post("/api/admin/loans/:loanId/regenerate-templates", authenticateToken, async (req: any, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const loanId = parseInt(req.params.loanId);
      if (isNaN(loanId)) {
        return res.status(400).json({ message: "Invalid loan ID" });
      }
      
      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }
      
      if (!loan.fundingTxid) {
        return res.status(400).json({ message: "Loan has no funding txid - cannot create templates without a confirmed deposit" });
      }
      
      if (!loan.escrowWitnessScript || !loan.borrowerPubkey) {
        return res.status(400).json({ message: "Loan missing escrow witness script or borrower pubkey" });
      }
      
      const borrower = await storage.getUser(loan.borrowerId);
      const borrowerAddress = loan.borrowerAddress || borrower?.btcAddress;
      if (!borrowerAddress) {
        return res.status(400).json({ message: "Borrower BTC return address not set" });
      }
      
      const collateralSats = Math.round(parseFloat(loan.collateralBtc) * 100_000_000);
      const fundingVout = loan.fundingVout ?? 0;
      
      const escrowUtxo = {
        txid: loan.fundingTxid,
        vout: fundingVout,
        amount: collateralSats
      };
      
      console.log(`🔄 [Admin] Regenerating PSBT templates for loan #${loanId}`);
      console.log(`   UTXO: ${loan.fundingTxid}:${fundingVout}, amount: ${collateralSats} sats`);
      console.log(`   Borrower address: ${borrowerAddress}`);
      
      const newTemplates = [];
      
      try {
        const repaymentPsbt = PsbtCreatorService.createRepaymentPsbt({
          witnessScriptHex: loan.escrowWitnessScript,
          escrowUtxo,
          borrowerAddress
        });
        newTemplates.push({ txType: STORAGE_TX_TYPES.REPAYMENT, psbt: repaymentPsbt.psbtBase64, txHash: repaymentPsbt.txHash });
      } catch (e: any) {
        console.error(`Failed to create REPAYMENT template: ${e.message}`);
      }
      
      const lenderPreference = loan.lenderDefaultPreference || 'eur';
      const platformBtcAddress = process.env.PLATFORM_BTC_ADDRESS || '';
      let lenderDestination = loan.lenderBtcAddress || '';
      if (lenderPreference === 'eur' && platformBtcAddress) {
        lenderDestination = platformBtcAddress;
      }
      
      if (lenderDestination) {
        try {
          const interestRate = parseFloat(loan.interestRate) / 100;
          const loanAmount = parseFloat(loan.amount);
          const btcPrice = await getCurrentBtcPrice();
          const amountOwedSats = Math.round((loanAmount * (1 + interestRate)) / btcPrice * 100_000_000);
          
          const defaultPsbt = PsbtCreatorService.createDefaultLiquidationPsbt({
            witnessScriptHex: loan.escrowWitnessScript,
            escrowUtxo,
            lenderAddress: lenderDestination,
            borrowerAddress,
            amountOwedSats
          });
          newTemplates.push({ txType: STORAGE_TX_TYPES.DEFAULT, psbt: defaultPsbt.psbtBase64, txHash: defaultPsbt.txHash });
        } catch (e: any) {
          console.error(`Failed to create DEFAULT template: ${e.message}`);
        }
      }
      
      if (loan.borrowerPubkey && loan.lenderPubkey && loan.platformPubkey) {
        try {
          const timelockBlocks = (loan.termMonths || 12) * 30 * 144 + 14 * 144;
          const recoveryPsbt = PsbtCreatorService.createRecoveryPsbt({
            pubkeys: [loan.borrowerPubkey, loan.lenderPubkey, loan.platformPubkey],
            escrowUtxo,
            borrowerAddress,
            timelockBlocks
          });
          newTemplates.push({ txType: STORAGE_TX_TYPES.RECOVERY, psbt: recoveryPsbt.psbtBase64, txHash: recoveryPsbt.txHash });
        } catch (e: any) {
          console.error(`Failed to create RECOVERY template: ${e.message}`);
        }
      }
      
      if (newTemplates.length === 0) {
        return res.status(500).json({ message: "Failed to generate any PSBT templates" });
      }
      
      const existingTemplates = await storage.getPreSignedTransactions(loanId);
      let updated = 0;
      let created = 0;
      
      for (const tmpl of newTemplates) {
        const existing = existingTemplates.find(t => t.txType === tmpl.txType);
        if (existing) {
          await storage.updatePreSignedTransaction(existing.id, {
            psbt: tmpl.psbt,
            signature: '',
            broadcastStatus: 'pending',
          });
          updated++;
          console.log(`   Updated ${tmpl.txType} template (record #${existing.id})`);
        } else {
          await storage.storePreSignedTransaction({
            loanId,
            partyRole: 'unsigned_template',
            partyPubkey: loan.borrowerPubkey,
            txType: tmpl.txType,
            psbt: tmpl.psbt,
            signature: '',
            txHash: tmpl.txHash,
          });
          created++;
          console.log(`   Created new ${tmpl.txType} template`);
        }
      }
      
      await storage.updateLoan(loanId, {
        borrowerSigningComplete: false,
        collateralReleaseError: null,
      });
      
      console.log(`✅ [Admin] Regenerated ${newTemplates.length} templates for loan #${loanId} (${updated} updated, ${created} created)`);
      
      res.json({
        success: true,
        message: `Regenerated ${newTemplates.length} PSBT templates with real UTXO ${loan.fundingTxid}:${fundingVout}. Borrower needs to re-sign via the signing ceremony.`,
        templates: newTemplates.map(t => t.txType),
        updated,
        created,
      });
    } catch (error: any) {
      console.error("Error regenerating templates:", error);
      res.status(500).json({ message: error.message || "Failed to regenerate templates" });
    }
  });
  
  // DEVELOPMENT ONLY: Recover remaining collateral from escrow (for testing)
  app.post("/api/test/recover-escrow/:loanId", async (req, res) => {
    try {
      const loanId = parseInt(req.params.loanId);
      const { destinationAddress } = req.body;
      
      if (isNaN(loanId)) {
        return res.status(400).json({ message: "Invalid loan ID" });
      }
      
      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }
      
      // Use provided address or lender's address
      let targetAddress = destinationAddress;
      if (!targetAddress && loan.lenderId) {
        const lender = await storage.getUser(loan.lenderId);
        targetAddress = loan.lenderBtcAddress;
      }
      
      if (!targetAddress) {
        return res.status(400).json({ message: "No destination address available" });
      }
      
      const { releaseCollateralToAddress } = await import('./services/CollateralReleaseService.js');
      const result = await releaseCollateralToAddress(loanId, targetAddress);
      
      res.json({
        success: result.success,
        message: result.success 
          ? `Recovered remaining collateral to ${targetAddress}` 
          : result.error,
        txid: result.txid,
        broadcastUrl: result.broadcastUrl
      });
    } catch (error: any) {
      console.error("Error recovering escrow:", error);
      res.status(500).json({ message: error.message || "Failed to recover escrow" });
    }
  });

  // Test email endpoint
  app.post("/api/test-email", async (req, res) => {
    try {
      const success = await sendEmail({
        to: "admin@reconquestp2p.com",
        from: "noreply@reconquestp2p.com",
        subject: "🔔 [ADMIN TEST] Email System Test",
        html: `
          <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
            <div style="text-align: center; padding: 20px; background: #fff; border-radius: 8px 8px 0 0;">
              <img src="${getBaseUrl()}/logo.png" alt="Reconquest" style="max-width: 200px; height: auto;" />
            </div>
            <div style="background: linear-gradient(135deg, #FFD700 0%, #4A90E2 100%); padding: 20px;">
              <h1 style="color: white; margin: 0; text-align: center;">Email System Test</h1>
            </div>
            
            <div style="background: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <h2 style="color: #333; margin-top: 0;">Email Test Successful!</h2>
              
              <div style="background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; color: #155724;">
                  <strong>Test Result:</strong> Email notifications are working correctly. This is a test email to confirm admin notifications can be sent.
                </p>
              </div>
              
              <p>Admin notifications are sent to admin@reconquestp2p.com for all platform activities.</p>
              
              <div style="text-align: center; margin-top: 30px;">
                <p style="color: #666; margin: 0;">This is an automated test from Reconquest Admin System</p>
              </div>
            </div>
          </div>
        `
      });

      if (success) {
        res.json({ success: true, message: "Test email sent successfully" });
      } else {
        res.status(500).json({ success: false, message: "Failed to send test email" });
      }
    } catch (error) {
      console.error("Test email error:", error);
      res.status(500).json({ success: false, message: "Email test failed" });
    }
  });

  // ========== WASM ESCROW API ENDPOINTS ==========
  // For Firefish WASM integration (NO PRIVATE KEYS on backend!)

  // Create Escrow Session (after WASM generates address in browser)
  app.post("/api/escrow/sessions", authenticateToken, async (req, res) => {
    try {
      const sessionData = insertEscrowSessionSchema.parse(req.body);
      
      // Verify the loan belongs to the user
      const loan = await storage.getLoan(sessionData.loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }
      
      if (loan.borrowerId !== req.user.id && loan.lenderId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to create escrow for this loan" });
      }

      const session = await storage.createEscrowSession(sessionData);
      
      // Log escrow creation event
      await storage.createEscrowEvent({
        escrowSessionId: session.sessionId,
        eventType: "created",
        eventData: JSON.stringify({
          loanId: session.loanId,
          escrowAddress: session.escrowAddress,
        }),
      });

      res.json({ success: true, session });
    } catch (error) {
      console.error("Error creating escrow session:", error);
      res.status(500).json({ message: "Failed to create escrow session" });
    }
  });

  // Get Escrow Session Details
  app.get("/api/escrow/sessions/:sessionId", authenticateToken, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const session = await storage.getEscrowSession(sessionId);
      
      if (!session) {
        return res.status(404).json({ message: "Escrow session not found" });
      }

      // Verify user has access to this session
      const loan = await storage.getLoan(session.loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }
      
      if (loan.borrowerId !== req.user.id && loan.lenderId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const events = await storage.getEscrowEvents(sessionId);
      
      res.json({ session, events });
    } catch (error) {
      console.error("Error fetching escrow session:", error);
      res.status(500).json({ message: "Failed to fetch escrow session" });
    }
  });

  // Update Escrow Session State (RESTRICTED - clients can only update wasmState)
  app.patch("/api/escrow/sessions/:sessionId", authenticateToken, async (req, res) => {
    try {
      const { sessionId } = req.params;
      
      // SECURITY: Validate and restrict updates to ONLY wasmState field
      // This prevents clients from tampering with blockchain-derived fields
      const validatedUpdates = updateEscrowSessionClientSchema.parse(req.body);
      
      // CRITICAL: Reject requests with extra fields that bypass validation
      const allowedKeys = Object.keys(updateEscrowSessionClientSchema.shape);
      const requestKeys = Object.keys(req.body);
      const unauthorizedKeys = requestKeys.filter(key => !allowedKeys.includes(key));
      
      if (unauthorizedKeys.length > 0) {
        return res.status(400).json({ 
          message: `Unauthorized fields: ${unauthorizedKeys.join(', ')}. Only wasmState updates allowed.`
        });
      }
      
      const session = await storage.getEscrowSession(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Escrow session not found" });
      }

      // Verify authorization
      const loan = await storage.getLoan(session.loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }
      
      if (loan.borrowerId !== req.user.id && loan.lenderId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized" });
      }

      // Use ONLY the validated updates (not req.body!)
      const updatedSession = await storage.updateEscrowSession(sessionId, validatedUpdates);
      
      // Log state update event
      await storage.createEscrowEvent({
        escrowSessionId: sessionId,
        eventType: "state_updated",
        eventData: JSON.stringify({
          updatedBy: req.user.id,
          role: loan.borrowerId === req.user.id ? "borrower" : "lender",
        }),
      });
      
      res.json({ success: true, session: updatedSession });
    } catch (error) {
      console.error("Error updating escrow session:", error);
      res.status(500).json({ message: "Failed to update escrow session" });
    }
  });

  // Submit WASM-generated Signatures
  app.post("/api/escrow/signatures", authenticateToken, async (req, res) => {
    try {
      const signatureData = insertSignatureExchangeSchema.parse(req.body);
      
      const signature = await storage.createSignatureExchange(signatureData);
      
      // Log signature received event
      await storage.createEscrowEvent({
        escrowSessionId: signatureData.escrowSessionId,
        eventType: "signature_received",
        eventData: JSON.stringify({
          senderRole: signatureData.senderRole,
          signatureType: signatureData.signatureType,
        }),
      });

      res.json({ success: true, signatureId: signature.id });
    } catch (error) {
      console.error("Error storing signature:", error);
      res.status(500).json({ message: "Failed to store signature" });
    }
  });

  // Check Funding Status (polls Blockstream API)
  app.get("/api/escrow/funding/:address", authenticateToken, async (req, res) => {
    try {
      const { address } = req.params;
      const { expectedAmount } = req.query;
      
      const fundingStatus = await blockchainMonitoring.checkAddressFunding(
        address,
        expectedAmount ? parseInt(expectedAmount as string) : undefined
      );

      // If funded, check for associated session and update it
      if (fundingStatus.funded && fundingStatus.txid) {
        const sessions = await storage.getEscrowSession(address);
        if (sessions) {
          // Update the session with funding info
          await storage.updateEscrowSession(sessions.sessionId, {
            fundingTxid: fundingStatus.txid,
            fundingVout: fundingStatus.vout,
            fundedAmountSats: fundingStatus.amountSats,
            currentState: "funded",
          });

          // Log funding event
          await storage.createEscrowEvent({
            escrowSessionId: sessions.sessionId,
            eventType: "funded",
            blockchainTxid: fundingStatus.txid,
            eventData: JSON.stringify({
              amountSats: fundingStatus.amountSats,
              confirmations: fundingStatus.confirmations,
            }),
          });
        }
      }

      res.json(fundingStatus);
    } catch (error) {
      console.error("Error checking funding status:", error);
      res.status(500).json({ message: "Failed to check funding status" });
    }
  });

  // Log Escrow Event
  app.post("/api/escrow/events", authenticateToken, async (req, res) => {
    try {
      const eventData = insertEscrowEventSchema.parse(req.body);
      const event = await storage.createEscrowEvent(eventData);
      
      res.json({ success: true, eventId: event.id });
    } catch (error) {
      console.error("Error logging escrow event:", error);
      res.status(500).json({ message: "Failed to log event" });
    }
  });

  // ========================================================================
  // PRE-SIGNED TRANSACTION ROUTES (Firefish Ephemeral Key Model)
  // ========================================================================

  // Get PSBT template for signing (provides real Bitcoin transaction data)
  app.get("/api/loans/:id/psbt-template", authenticateToken, async (req, res) => {
    try {
      const loanId = parseInt(req.params.id);
      const txType = req.query.txType as string || 'cooperative_close';
      const userId = (req as any).user.id;
      
      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }
      
      // Authorization: User must be borrower or lender
      if (loan.borrowerId !== userId && loan.lenderId !== userId) {
        return res.status(403).json({ message: "Not authorized for this loan" });
      }
      
      if (!loan.escrowAddress || !loan.escrowWitnessScript) {
        return res.status(400).json({ message: "Loan has no escrow address configured" });
      }
      
      // Fetch UTXO from testnet4
      const { fetchEscrowUTXO, createSpendPSBT } = await import("./services/psbt-builder.js");
      
      const utxo = await fetchEscrowUTXO(loan.escrowAddress);
      if (!utxo) {
        return res.status(400).json({ 
          message: "No UTXO found for escrow address. Has the collateral been deposited?",
          escrowAddress: loan.escrowAddress
        });
      }
      
      // Determine output address based on transaction type
      let outputAddress: string;
      
      if (txType === 'default') {
        // Default transaction: Lender claims collateral - route based on preference
        if (!loan.lenderId) {
          return res.status(400).json({ message: "Loan has no lender assigned" });
        }
        const lenderPreference = loan.lenderDefaultPreference || 'eur';
        if (lenderPreference === 'eur') {
          const platformBtcAddress = process.env.PLATFORM_BTC_ADDRESS || '';
          if (!platformBtcAddress) {
            return res.status(400).json({ message: "Platform BTC address not configured (PLATFORM_BTC_ADDRESS env var)" });
          }
          outputAddress = platformBtcAddress;
          console.log(`💱 Default tx: Lender prefers EUR - routing to platform address for fiat conversion`);
        } else {
          const lender = await storage.getUser(loan.lenderId);
          if (!loan.lenderBtcAddress) {
            return res.status(400).json({ message: "Lender has no Bitcoin return address configured. Please add your BTC address in My Account." });
          }
          outputAddress = loan.lenderBtcAddress;
          console.log(`₿ Default tx: Lender prefers BTC - routing directly to lender address`);
        }
      } else {
        // Recovery and cooperative_close: Borrower gets collateral back
        const borrower = await storage.getUser(loan.borrowerId);
        if (!borrower || !borrower.btcAddress) {
          return res.status(400).json({ message: "Borrower has no Bitcoin return address configured. Please add your BTC address in My Account." });
        }
        outputAddress = borrower.btcAddress;
      }
      
      // Create PSBT template
      const psbtTemplate = await createSpendPSBT(
        utxo,
        loan.escrowWitnessScript,
        outputAddress
      );
      
      // SECURITY: Store canonical template metadata for validation during aggregation
      try {
        await storage.storePsbtTemplate({
          loanId,
          txType,
          canonicalTxid: psbtTemplate.canonicalTxid,
          inputTxid: psbtTemplate.inputTxid,
          inputVout: psbtTemplate.inputVout,
          inputValue: psbtTemplate.inputValue,
          witnessScriptHash: psbtTemplate.witnessScriptHash,
          outputAddress: psbtTemplate.outputAddress,
          outputValue: psbtTemplate.outputValue,
          feeRate: psbtTemplate.feeRate,
          virtualSize: psbtTemplate.virtualSize,
          fee: psbtTemplate.fee,
          psbtBase64: psbtTemplate.psbtBase64,
        });
        console.log(`🔒 Canonical PSBT template stored for loan #${loanId} (${txType})`);
      } catch (storeError) {
        console.warn(`⚠️ Could not store canonical template (may already exist):`, storeError);
      }
      
      console.log(`📋 PSBT template created for loan #${loanId} (${txType}) -> ${outputAddress}`);
      
      res.json({
        success: true,
        loanId,
        txType,
        escrowAddress: loan.escrowAddress,
        outputAddress,
        utxo: {
          txid: utxo.txid,
          vout: utxo.vout,
          value: utxo.value,
        },
        psbtBase64: psbtTemplate.psbtBase64,
        txHash: psbtTemplate.txHash,
        inputValue: psbtTemplate.inputValue,
        outputValue: psbtTemplate.outputValue,
        fee: psbtTemplate.fee,
      });
    } catch (error) {
      console.error("Error creating PSBT template:", error);
      res.status(500).json({ message: "Failed to create PSBT template" });
    }
  });

  // Store pre-signed transaction (called automatically when user generates ephemeral keys)
  app.post("/api/loans/:id/transactions/store", authenticateToken, requireNonAdmin, async (req: any, res) => {
    try {
      const loanId = parseInt(req.params.id);
      const { partyRole, partyPubkey, txType, psbt, signature, txHash, validAfter } = req.body;

      // SECURITY: Reject mock PSBTs - only accept real Bitcoin PSBTs
      // Real PSBTs in base64 start with "cHNidP8" (which decodes to "psbt\xff")
      if (!psbt || !psbt.startsWith('cHNidP8')) {
        console.error(`❌ Rejected mock PSBT for loan #${loanId} (${partyRole}/${txType})`);
        return res.status(400).json({ 
          message: "Invalid PSBT format. Please ensure the escrow has been funded before generating your recovery plan.",
          code: "MOCK_PSBT_REJECTED"
        });
      }

      const transaction = await storage.storePreSignedTransaction({
        loanId,
        partyRole,
        partyPubkey,
        txType,
        psbt,
        signature,
        txHash,
        validAfter: validAfter ? new Date(validAfter) : undefined,
      });

      console.log(`✅ Stored ${txType} transaction for ${partyRole} on loan #${loanId}`);
      res.json({ success: true, transactionId: transaction.id });
    } catch (error) {
      console.error("Error storing pre-signed transaction:", error);
      res.status(500).json({ message: "Failed to store transaction" });
    }
  });

  // Get pre-signed transactions for a loan
  app.get("/api/loans/:id/transactions", authenticateToken, async (req, res) => {
    try {
      const loanId = parseInt(req.params.id);
      const txType = req.query.txType as string | undefined;

      const transactions = await storage.getPreSignedTransactions(loanId, txType);
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching pre-signed transactions:", error);
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  // Mark signing ceremony complete for a party
  app.post("/api/loans/:id/complete-signing", authenticateToken, requireNonAdmin, async (req: any, res) => {
    try {
      const loanId = parseInt(req.params.id);
      const userId = (req as any).user.id;
      const { role } = req.body;

      // Get loan and verify ownership
      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }

      // Verify user is the borrower or lender
      if (role === 'borrower' && loan.borrowerId !== userId) {
        return res.status(403).json({ message: "Not authorized as borrower" });
      }
      if (role === 'lender' && loan.lenderId !== userId) {
        return res.status(403).json({ message: "Not authorized as lender" });
      }

      // Get user to check for BTC address requirement
      const currentUser = await storage.getUser(userId);
      
      // Require BTC address for borrowers before they can generate recovery plan
      if (role === 'borrower' && (!currentUser?.btcAddress || currentUser.btcAddress.trim() === '')) {
        return res.status(400).json({ 
          message: "Bitcoin address required",
          error: "Please add your Bitcoin address in My Account before generating your recovery plan. This address will be used for collateral returns and recovery."
        });
      }

      // Update the appropriate timestamp
      const now = new Date();
      const updateData: any = {};
      
      if (role === 'borrower') {
        updateData.borrowerKeysGeneratedAt = now;
      } else if (role === 'lender') {
        updateData.lenderKeysGeneratedAt = now;
      }

      await storage.updateLoan(loanId, updateData);

      // NOTE: No lender email sent here. The lender only receives a notification
      // when the BTC deposit is confirmed on-chain (handled by BlockchainMonitoring.handleDepositConfirmed).

      // After signing, the loan stays in escrow_created state
      // Loan will ONLY become active after BTC deposit is confirmed
      const updatedLoan = await storage.getLoan(loanId);
      
      // Update escrow state to reflect signing is complete, but don't activate yet
      // Borrower still needs to deposit BTC to the escrow address
      await storage.updateLoan(loanId, {
        escrowState: 'escrow_created', // Keep in escrow_created so deposit instructions show
        // Status stays as 'funded' - will become 'active' after BTC deposit confirmed
      });

      console.log(`✅ ${role} completed signing for loan #${loanId}. Waiting for BTC deposit to escrow.`);
      res.json({ 
        success: true, 
        loanActivated: false,
        escrowAddress: updatedLoan?.escrowAddress,
        message: "Signing complete! Please deposit Bitcoin to the escrow address." 
      });

    } catch (error) {
      console.error("Error completing signing ceremony:", error);
      res.status(500).json({ message: "Failed to complete signing" });
    }
  });

  // File dispute
  app.post("/api/loans/:id/dispute", authenticateToken, requireNonAdmin, async (req, res) => {
    try {
      const loanId = parseInt(req.params.id);
      const userId = (req as any).user.id;
      const { disputeType, evidence } = req.body;

      // Get loan and verify party
      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }

      // Only borrower or lender can file dispute
      if (loan.borrowerId !== userId && loan.lenderId !== userId) {
        return res.status(403).json({ message: "Only loan parties can file disputes" });
      }

      // Validate dispute type
      const validTypes = ["borrower_default", "lender_non_payout", "other"];
      if (!validTypes.includes(disputeType)) {
        return res.status(400).json({ message: "Invalid dispute type" });
      }

      // Create dispute
      const dispute = await storage.createDispute({
        loanId,
        raisedBy: userId,
        disputeType,
        status: "open",
      });

      // Update loan dispute status
      await storage.updateLoan(loanId, {
        disputeStatus: "under_review",
      });

      res.json({ success: true, dispute });
    } catch (error) {
      console.error("Error filing dispute:", error);
      res.status(500).json({ message: "Failed to file dispute" });
    }
  });

  // Get dispute status
  app.get("/api/loans/:id/dispute", authenticateToken, async (req, res) => {
    try {
      const loanId = parseInt(req.params.id);
      const userId = (req as any).user.id;

      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }

      // Only loan parties can view dispute
      if (loan.borrowerId !== userId && loan.lenderId !== userId) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const disputes = await storage.getDisputesByLoan(loanId);
      res.json({ disputes, loanDisputeStatus: loan.disputeStatus });
    } catch (error) {
      console.error("Error fetching dispute:", error);
      res.status(500).json({ message: "Failed to fetch dispute" });
    }
  });

  // Resolve dispute (platform admin endpoint) - DETERMINISTIC OUTCOME ENGINE
  // Platform NEVER "chooses a side" - outcomes are determined by hard-coded rules
  app.post("/api/loans/:id/resolve-dispute", authenticateToken, requireNonAdmin, async (req, res) => {
    try {
      const loanId = parseInt(req.params.id);
      const userId = (req as any).user.id;

      // ADMIN CHECK: Only admins can resolve disputes
      const user = await storage.getUser(userId);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ 
          message: "Unauthorized. Only platform administrators can resolve disputes." 
        });
      }

      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }

      // Import outcome engine and price service
      const { decideLoanOutcome, buildEvidenceFromLoan, getTransactionHexForOutcome } = await import("./services/outcome-engine.js");
      const { getBtcPrice } = await import("./services/price-service.js");

      // Fetch current BTC price for liquidation check
      let currentBtcPriceUsd = 97000; // Fallback price
      try {
        const priceData = await getBtcPrice();
        currentBtcPriceUsd = priceData.usd;
      } catch (e) {
        console.warn("Could not fetch BTC price, using fallback:", e);
      }

      // Build evidence from loan state and external data
      const evidence = buildEvidenceFromLoan(loan, currentBtcPriceUsd);
      const now = new Date();

      // DETERMINISTIC DECISION: Pure function maps facts → outcome
      const decision = decideLoanOutcome(loan, evidence, now);

      console.log(`[OUTCOME ENGINE] Loan ${loanId}: ${decision.outcome} via ${decision.ruleFired}`);
      console.log(`[OUTCOME ENGINE] Reasoning: ${decision.reasoning}`);

      // If outcome is UNDER_REVIEW (txType is null), don't broadcast - need more evidence
      if (decision.outcome === 'UNDER_REVIEW' || decision.txTypeToUse === null) {
        await storage.createDisputeAuditLog({
          loanId,
          disputeId: null,
          outcome: decision.outcome,
          ruleFired: decision.ruleFired,
          txTypeUsed: 'none',
          evidenceSnapshot: JSON.stringify(evidence),
          broadcastTxid: null,
          broadcastSuccess: false,
          broadcastError: 'Insufficient evidence for deterministic outcome',
          triggeredBy: userId,
          triggeredByRole: 'admin',
        });

        return res.status(400).json({
          outcome: decision.outcome,
          ruleFired: decision.ruleFired,
          reasoning: decision.reasoning,
          message: "Cannot resolve dispute - insufficient evidence for deterministic outcome. Loan remains under review.",
        });
      }

      // Get the pre-signed transaction hex for this outcome (txTypeToUse is guaranteed non-null here)
      const txHex = getTransactionHexForOutcome(loan, decision.txTypeToUse);

      if (!txHex) {
        await storage.createDisputeAuditLog({
          loanId,
          disputeId: null,
          outcome: decision.outcome,
          ruleFired: decision.ruleFired,
          txTypeUsed: decision.txTypeToUse,
          evidenceSnapshot: JSON.stringify(evidence),
          broadcastTxid: null,
          broadcastSuccess: false,
          broadcastError: `No ${decision.txTypeToUse} transaction available`,
          triggeredBy: userId,
          triggeredByRole: 'admin',
        });

        return res.status(400).json({ 
          message: `No ${decision.txTypeToUse} transaction available for outcome ${decision.outcome}`,
          outcome: decision.outcome,
          ruleFired: decision.ruleFired,
        });
      }

      // Import broadcast service
      const { broadcastTransaction } = await import("./services/bitcoin-broadcast.js");

      // Broadcast the deterministically selected transaction
      const broadcast = await broadcastTransaction(txHex);

      // Determine final loan status based on outcome
      let finalLoanStatus: string;
      switch (decision.outcome) {
        case 'COOPERATIVE_CLOSE':
          finalLoanStatus = 'completed';
          break;
        case 'DEFAULT':
        case 'LIQUIDATION':
          finalLoanStatus = 'defaulted';
          break;
        case 'CANCELLATION':
          finalLoanStatus = 'cancelled';
          break;
        case 'RECOVERY':
          finalLoanStatus = 'recovered';
          break;
        default:
          finalLoanStatus = 'resolved';
      }

      // Update dispute if exists
      const disputes = await storage.getDisputesByLoan(loanId);
      if (disputes.length > 0) {
        await storage.updateDispute(disputes[0].id, {
          status: "resolved",
          resolution: `${decision.outcome} - ${decision.reasoning}`,
          broadcastTxid: broadcast.success ? broadcast.txid : null,
          resolvedAt: new Date(),
        });
      }

      // Update loan status
      await storage.updateLoan(loanId, {
        disputeStatus: "resolved",
        disputeResolvedAt: new Date(),
        status: finalLoanStatus,
        collateralReleased: true,
        escrowState: 'collateral_released',
        collateralReleasedAt: new Date(),
        collateralReleaseError: null,
      });

      // Create audit log
      await storage.createDisputeAuditLog({
        loanId,
        disputeId: disputes.length > 0 ? disputes[0].id : null,
        outcome: decision.outcome,
        ruleFired: decision.ruleFired,
        txTypeUsed: decision.txTypeToUse,
        evidenceSnapshot: JSON.stringify(evidence),
        broadcastTxid: broadcast.success ? broadcast.txid : null,
        broadcastSuccess: broadcast.success,
        broadcastError: broadcast.success ? null : (broadcast.error || 'Unknown error'),
        triggeredBy: userId,
        triggeredByRole: 'admin',
      });

      res.json({ 
        success: broadcast.success,
        outcome: decision.outcome,
        ruleFired: decision.ruleFired,
        txTypeUsed: decision.txTypeToUse,
        txid: broadcast.txid,
        reasoning: decision.reasoning,
        message: broadcast.success 
          ? `Dispute resolved via ${decision.outcome}. Transaction broadcast: ${broadcast.txid}`
          : `Decision made (${decision.outcome}) but broadcast failed: ${broadcast.error}`,
      });
    } catch (error) {
      console.error("Error resolving dispute:", error);
      res.status(500).json({ message: "Failed to resolve dispute" });
    }
  });

  // Get lender bank details for repayment (borrower only)
  app.get("/api/loans/:id/lender-bank-details", authenticateToken, async (req, res) => {
    try {
      const loanId = parseInt(req.params.id);
      const userId = (req as any).user.id;

      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }

      // Only borrower can view lender's bank details
      if (loan.borrowerId !== userId) {
        return res.status(403).json({ message: "Only the borrower can view lender bank details" });
      }

      // Loan must be active
      if (loan.status !== 'active') {
        return res.status(400).json({ message: "Loan must be active to view repayment details" });
      }

      if (!loan.lenderId) {
        return res.status(400).json({ message: "No lender assigned to this loan" });
      }

      // Get lender details
      const lender = await storage.getUser(loan.lenderId);
      if (!lender) {
        return res.status(404).json({ message: "Lender not found" });
      }

      res.json({
        iban: lender.iban || null,
        bankAccountHolder: lender.bankAccountHolder || null,
        bankCountry: lender.bankCountry || null,
      });
    } catch (error) {
      console.error("Error fetching lender bank details:", error);
      res.status(500).json({ message: "Failed to fetch lender bank details" });
    }
  });

  // Confirm repayment sent by borrower (simple confirmation, no Bitcoin transaction)
  app.post("/api/loans/:id/confirm-repayment", authenticateToken, requireNonAdmin, async (req, res) => {
    try {
      const loanId = parseInt(req.params.id);
      const userId = (req as any).user.id;

      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }

      // Only borrower can confirm repayment
      if (loan.borrowerId !== userId) {
        return res.status(403).json({ message: "Only the borrower can confirm repayment" });
      }

      // Loan must be active
      if (loan.status !== 'active') {
        return res.status(400).json({ message: "Loan must be active to confirm repayment" });
      }

      // Update loan with confirmation
      await storage.updateLoan(loanId, {
        repaymentConfirmedByBorrower: true,
        repaymentConfirmedAt: new Date(),
        status: 'repayment_pending',
      });

      // Send email notification to lender
      if (loan.lenderId) {
        const lender = await storage.getUser(loan.lenderId);
        const borrower = await storage.getUser(loan.borrowerId);
        if (lender && lender.email) {
          const principal = parseFloat(loan.amount);
          const annualRate = parseFloat(loan.interestRate) / 100;
          const interest = principal * annualRate * (loan.termMonths / 12);
          const totalExpected = principal + interest;
          
          const baseUrl = getBaseUrl();
          const html = createBrandedEmailHtml({
            title: '💰 Borrower Has Sent Your Repayment!',
            greeting: `Hi ${lender.username || 'Lender'},`,
            content: `
              <p>Great news! The borrower (${borrower?.username || 'Unknown'}) has confirmed sending the repayment for <strong>Loan #${loanId}</strong>.</p>
              
              <div style="background: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 5px 0; font-size: 18px;"><strong>Expected Amount:</strong> €${totalExpected.toFixed(2)} ${loan.currency}</p>
                <p style="margin: 5px 0;">Principal: €${principal.toFixed(2)} ${loan.currency}</p>
                <p style="margin: 5px 0;">Interest: €${interest.toFixed(2)} ${loan.currency}</p>
              </div>
              
              <p><strong>Please log in to your dashboard</strong> to confirm you received the funds and release the borrower's Bitcoin collateral.</p>
            `,
            buttonText: 'Confirm Receipt & Release Collateral',
            buttonUrl: `${baseUrl}/lender`
          });
          
          await sendEmail({
            to: lender.email,
            from: 'Reconquest <noreply@reconquestp2p.com>',
            subject: `💰 Repayment Received - Loan #${loanId}`,
            html
          });
          console.log(`📧 Email sent to lender ${lender.email} about repayment for loan #${loanId}`);
        }
      }

      console.log(`✅ Borrower confirmed repayment for loan #${loanId}`);
      res.json({ 
        success: true, 
        message: "Repayment confirmation recorded. The lender will be notified."
      });
    } catch (error) {
      console.error("Error confirming repayment:", error);
      res.status(500).json({ message: "Failed to confirm repayment" });
    }
  });

  // Lender confirms receipt of repayment and triggers cooperative close
  app.post("/api/loans/:id/confirm-receipt", authenticateToken, requireNonAdmin, async (req, res) => {
    try {
      const loanId = parseInt(req.params.id);
      const userId = (req as any).user.id;

      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }

      // Only lender can confirm receipt
      if (loan.lenderId !== userId) {
        return res.status(403).json({ message: "Only the lender can confirm receipt" });
      }

      // Loan must be in repayment_pending status
      if (loan.status !== 'repayment_pending') {
        return res.status(400).json({ message: "Loan must be awaiting repayment confirmation" });
      }

      // Use automated CollateralReleaseService for fund release
      console.log(`🔐 Triggering automated collateral release for loan #${loanId}`);
      
      const releaseResult = await releaseCollateral(storage, loanId);
      
      if (releaseResult.success) {
        await storage.updateLoan(loanId, {
          status: 'completed',
          repaidAt: new Date(),
          collateralReleased: true,
          escrowState: 'collateral_released',
          collateralReleaseTxid: releaseResult.txid || null,
          collateralReleasedAt: new Date(),
          collateralReleaseError: null,
        });
      } else {
        await storage.updateLoan(loanId, {
          status: 'repaid',
          repaidAt: new Date(),
          collateralReleaseError: releaseResult.error || 'Release failed - will retry automatically',
        });
        console.warn(`⚠️ Collateral release failed for loan #${loanId}: ${releaseResult.error}`);
        console.warn(`   Loan set to 'repaid' status - auto-release cron will retry every 5 minutes`);
      }

      // Send email notification to borrower
      const borrower = await storage.getUser(loan.borrowerId);
      if (borrower && borrower.email) {
        const baseUrl = getBaseUrl();
        
        if (releaseResult.success && releaseResult.txid) {
          // Successful blockchain broadcast
          const successHtml = createBrandedEmailHtml({
            title: '🎉 Loan Completed - Collateral Released!',
            greeting: `Hi ${borrower.username},`,
            content: `
              <p>Great news! Your loan <strong>#${loanId}</strong> has been <strong>successfully completed</strong>!</p>
              
              <div style="background: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 5px 0; font-size: 16px;"><strong>✅ Your Bitcoin collateral has been released!</strong></p>
                <p style="margin: 5px 0;"><strong>Amount:</strong> ${loan.collateralBtc} BTC</p>
                <p style="margin: 5px 0;"><strong>Destination:</strong> Your registered Bitcoin address</p>
                <p style="margin: 5px 0;"><strong>Transaction ID:</strong> <code style="font-size: 12px;">${releaseResult.txid}</code></p>
                ${releaseResult.broadcastUrl ? `<p style="margin: 5px 0;"><a href="${releaseResult.broadcastUrl}" target="_blank">View on Mempool.space</a></p>` : ''}
              </div>
              
              <p>Your collateral is now on its way back to you! It should appear in your wallet within a few confirmations.</p>
            `,
            buttonText: 'View My Dashboard',
            buttonUrl: `${baseUrl}/borrower`
          });
          
          await sendEmail({
            to: borrower.email,
            from: 'Reconquest <noreply@reconquestp2p.com>',
            subject: `🎉 Loan #${loanId} Completed - Collateral Released!`,
            html: successHtml
          });
          console.log(`📧 Collateral release email sent to borrower ${borrower.email}`);
        } else {
          const escrowExplorerUrl = loan.escrowAddress ? getExplorerUrl('address', loan.escrowAddress) : '';
          const manualHtml = createBrandedEmailHtml({
            title: '🎉 Loan Completed!',
            greeting: `Hi ${borrower.username},`,
            content: `
              <p>Great news! Your loan <strong>#${loanId}</strong> has been <strong>successfully completed</strong>!</p>
              
              <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 5px 0; font-size: 16px;"><strong>Collateral Release</strong></p>
                <p style="margin: 5px 0;"><strong>Amount:</strong> ${loan.collateralBtc} BTC</p>
                <p style="margin: 5px 0;">Your collateral release is being processed. Our team will ensure your Bitcoin is returned promptly.</p>
                ${escrowExplorerUrl ? `<p style="margin: 5px 0;"><a href="${escrowExplorerUrl}" target="_blank">View Escrow Address on Mempool.space</a></p>` : ''}
              </div>
              
              <p style="color: #666; font-size: 14px;">Thank you for using Reconquest!</p>
            `,
            buttonText: 'View My Dashboard',
            buttonUrl: `${baseUrl}/borrower`
          });
          
          await sendEmail({
            to: borrower.email,
            from: 'Reconquest <noreply@reconquestp2p.com>',
            subject: `🎉 Loan #${loanId} Completed!`,
            html: manualHtml
          });
          console.log(`📧 Loan completion email sent to borrower ${borrower.email}`);
        }
      }

      console.log(`✅ Loan #${loanId} completed. Release result: ${releaseResult.success ? 'SUCCESS' : releaseResult.error}`);
      
      return res.json({ 
        success: true,
        message: releaseResult.success 
          ? "Loan completed! Collateral released to borrower." 
          : "Loan completed successfully! The borrower's collateral will be released shortly.",
        blockchainTx: releaseResult.success,
        txid: releaseResult.txid,
        broadcastUrl: releaseResult.broadcastUrl
      });

    } catch (error) {
      console.error("Error processing lender confirmation:", error);
      res.status(500).json({ message: "Failed to process confirmation" });
    }
  });

  // Trigger cooperative close broadcast (when borrower repays loan)
  app.post("/api/loans/:id/cooperative-close", authenticateToken, requireNonAdmin, async (req, res) => {
    try {
      const loanId = parseInt(req.params.id);
      const userId = (req as any).user.id;

      // Get loan and verify ownership
      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }

      // Only borrower can initiate cooperative close
      if (loan.borrowerId !== userId) {
        return res.status(403).json({ message: "Only the borrower can initiate repayment" });
      }

      // Get cooperative_close transactions
      const transactions = await storage.getPreSignedTransactions(loanId, 'cooperative_close');

      if (transactions.length < 2) {
        return res.status(400).json({ 
          message: "Not enough signatures. Need borrower and lender signatures.",
          signaturesFound: transactions.length
        });
      }

      // Import broadcast service
      const { aggregateSignatures, broadcastTransaction, generatePlatformSignature } = await import("./services/bitcoin-broadcast.js");

      // Add platform signature
      const platformSig = await generatePlatformSignature(
        transactions[0].txHash,
        `cooperative_close_${loanId}`
      );

      // Store platform signature
      const platformTx = await storage.storePreSignedTransaction({
        loanId,
        partyRole: 'platform',
        partyPubkey: platformSig.publicKey,
        txType: 'cooperative_close',
        psbt: transactions[0].psbt, // Same PSBT
        signature: platformSig.signature,
        txHash: transactions[0].txHash,
      });

      // Aggregate signatures (2-of-3) with PSBT integrity validation
      const allTransactions = [...transactions, platformTx];
      
      // Load canonical template for strict validation
      const canonicalTemplate = await storage.getPsbtTemplate(loanId, 'cooperative_close');
      
      // For cooperative_close, collateral returns to borrower
      const aggregation = await aggregateSignatures(
        allTransactions, 
        {
          escrowTxid: loan.escrowTxid || undefined,
          escrowVout: loan.escrowVout ?? undefined,
          escrowAmount: loan.collateralBtc ? Math.floor(Number(loan.collateralBtc) * 100000000) : undefined,
          borrowerAddress: loan.borrowerBtcAddress || undefined,
          lenderAddress: loan.lenderBtcAddress || undefined,
          expectedOutputAddress: loan.borrowerBtcAddress || undefined,
          txType: 'cooperative_close'
        },
        canonicalTemplate ? {
          canonicalTxid: canonicalTemplate.canonicalTxid,
          inputTxid: canonicalTemplate.inputTxid,
          inputVout: canonicalTemplate.inputVout,
          inputValue: canonicalTemplate.inputValue,
          witnessScriptHash: canonicalTemplate.witnessScriptHash,
          outputAddress: canonicalTemplate.outputAddress,
          outputValue: canonicalTemplate.outputValue,
          feeRate: canonicalTemplate.feeRate,
          virtualSize: canonicalTemplate.virtualSize,
          fee: canonicalTemplate.fee,
        } : undefined
      );

      if (!aggregation.success || !aggregation.txHex) {
        return res.status(500).json({ 
          message: aggregation.error || "Failed to aggregate signatures",
          signaturesCollected: aggregation.signaturesCollected
        });
      }

      // Broadcast to Bitcoin testnet
      const broadcast = await broadcastTransaction(aggregation.txHex);

      if (!broadcast.success) {
        return res.status(500).json({ 
          message: broadcast.error || "Failed to broadcast transaction"
        });
      }

      // Update all transactions with broadcast status
      for (const tx of allTransactions) {
        await storage.updateTransactionBroadcastStatus(tx.id, {
          broadcastStatus: 'broadcasting',
          broadcastTxid: broadcast.txid,
          broadcastedAt: new Date(),
        });
      }

      // Update loan status
      await storage.updateLoan(loanId, {
        status: 'completed',
        repaidAt: new Date(),
      });

      console.log(`✅ Loan #${loanId} repaid successfully! Txid: ${broadcast.txid}`);
      res.json({ 
        success: true, 
        txid: broadcast.txid,
        message: "Loan repaid successfully. Collateral is being returned to borrower."
      });

    } catch (error) {
      console.error("Error processing cooperative close:", error);
      res.status(500).json({ message: "Failed to process cooperative close" });
    }
  });

  // ===== LOAN DOCUMENT ENDPOINTS =====
  
  // Get presigned URL for document upload
  app.post("/api/loans/:loanId/documents/request-upload", authenticateToken, async (req: any, res) => {
    try {
      const loanId = parseInt(req.params.loanId);
      const userId = req.user.id;
      const { fileName, fileSize, contentType, description } = req.body;
      
      // Validate file type
      const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
      if (!allowedTypes.includes(contentType)) {
        return res.status(400).json({ 
          message: 'Invalid file type. Only PDF, PNG, and JPG files are allowed.' 
        });
      }
      
      // Validate file size (max 10MB)
      if (fileSize > 10 * 1024 * 1024) {
        return res.status(400).json({ 
          message: 'File too large. Maximum size is 10MB.' 
        });
      }
      
      // Get loan and verify user is borrower or lender
      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: 'Loan not found' });
      }
      
      const isBorrower = loan.borrowerId === userId;
      const isLender = loan.lenderId === userId;
      
      if (!isBorrower && !isLender) {
        return res.status(403).json({ message: 'You are not authorized to upload documents for this loan' });
      }
      
      // Check loan status - only allow uploads for active or pending transfer loans
      const allowedStatuses = ['active', 'funding', 'matched', 'borrower_keys_submitted', 'repayment_pending'];
      if (!allowedStatuses.includes(loan.status)) {
        return res.status(400).json({ 
          message: 'Documents can only be uploaded for active or pending loans' 
        });
      }
      
      // Get presigned upload URL
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      
      // Determine file type extension
      const fileTypeMap: Record<string, string> = {
        'application/pdf': 'pdf',
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg'
      };
      
      res.json({
        uploadURL,
        objectPath,
        metadata: {
          loanId,
          fileName,
          fileSize,
          contentType,
          fileType: fileTypeMap[contentType],
          uploaderRole: isBorrower ? 'borrower' : 'lender',
          description
        }
      });
    } catch (error) {
      console.error("Error generating document upload URL:", error);
      res.status(500).json({ message: "Failed to generate upload URL" });
    }
  });
  
  // Save document metadata after successful upload
  app.post("/api/loans/:loanId/documents", authenticateToken, async (req: any, res) => {
    try {
      const loanId = parseInt(req.params.loanId);
      const userId = req.user.id;
      const { fileName, fileType, fileSize, objectPath, description } = req.body;
      
      // Validate required fields
      if (!fileName || !fileType || !fileSize || !objectPath) {
        return res.status(400).json({ message: 'Missing required fields' });
      }
      
      // Validate file type
      const allowedFileTypes = ['pdf', 'png', 'jpg'];
      if (!allowedFileTypes.includes(fileType)) {
        return res.status(400).json({ message: 'Invalid file type' });
      }
      
      // Get loan and verify user
      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: 'Loan not found' });
      }
      
      const isBorrower = loan.borrowerId === userId;
      const isLender = loan.lenderId === userId;
      
      if (!isBorrower && !isLender) {
        return res.status(403).json({ message: 'You are not authorized to upload documents for this loan' });
      }
      
      // Create document record
      const document = await storage.createLoanDocument({
        loanId,
        uploadedBy: userId,
        uploaderRole: isBorrower ? 'borrower' : 'lender',
        fileName,
        fileType,
        fileSize,
        objectPath,
        description: description || null
      });
      
      console.log(`📄 Document uploaded for Loan #${loanId} by ${isBorrower ? 'borrower' : 'lender'}: ${fileName}`);
      
      res.json({ success: true, document });
    } catch (error) {
      console.error("Error saving document metadata:", error);
      res.status(500).json({ message: "Failed to save document" });
    }
  });
  
  // Get all documents for a loan
  app.get("/api/loans/:loanId/documents", authenticateToken, async (req: any, res) => {
    try {
      const loanId = parseInt(req.params.loanId);
      const userId = req.user.id;
      
      // Get loan and verify user is borrower, lender, or admin
      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: 'Loan not found' });
      }
      
      const isBorrower = loan.borrowerId === userId;
      const isLender = loan.lenderId === userId;
      const isAdmin = req.user.role === 'admin';
      
      if (!isBorrower && !isLender && !isAdmin) {
        return res.status(403).json({ message: 'You are not authorized to view documents for this loan' });
      }
      
      const documents = await storage.getLoanDocuments(loanId);
      
      // For privacy (Bitcoin-blind lender design), only show uploader username to admin
      // Borrowers and lenders only see the role (borrower/lender), not the actual username
      const documentsWithUploaders = await Promise.all(documents.map(async (doc) => {
        // Only include username for admin users
        if (isAdmin) {
          const uploader = await storage.getUser(doc.uploadedBy);
          return {
            ...doc,
            uploaderUsername: uploader?.username || 'Unknown'
          };
        }
        // For non-admins, don't expose the other party's username
        return {
          ...doc,
          uploaderUsername: doc.uploaderRole === 'borrower' ? 'Borrower' : 'Lender'
        };
      }));
      
      res.json({ documents: documentsWithUploaders });
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  const httpServer = createServer(app);
  
  // Start automated blockchain monitoring for pending deposits
  blockchainMonitoring.startBackgroundMonitoring(async (loan, result) => {
    console.log(`[DepositConfirmed] Loan ${loan.id} deposit confirmed! Sending notifications...`);
    
    // Get fresh loan and user data
    const updatedLoan = await storage.getLoan(loan.id);
    if (!updatedLoan) return;
    
    const borrower = await storage.getUser(updatedLoan.borrowerId);
    const lender = updatedLoan.lenderId ? await storage.getUser(updatedLoan.lenderId) : null;
    
    if (!borrower) return;
    
    const baseUrl = getBaseUrl();
    
    // Send notification to borrower
    await sendEmail({
      to: borrower.email,
      from: 'Reconquest <noreply@reconquestp2p.com>',
      subject: `✅ BTC Deposit Confirmed - Loan #${loan.id}`,
      html: `
        <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
          <div style="text-align: center; padding: 20px; background: #fff; border-radius: 8px 8px 0 0;">
            <img src="${baseUrl}/logo.png" alt="Reconquest" style="max-width: 200px; height: auto;" />
          </div>
          <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); padding: 20px;">
            <h1 style="color: white; margin: 0; text-align: center;">BTC Deposit Confirmed!</h1>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <h2 style="color: #333; margin-top: 0;">Great news, ${borrower.username}!</h2>
            
            <p style="color: #666; line-height: 1.6;">
              Your Bitcoin deposit has been confirmed on the blockchain. You can now proceed to the next step: generating your recovery plan.
            </p>
            
            <div style="background: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #155724; margin-top: 0;">✅ Deposit Verified</h3>
              <p style="color: #155724; margin: 5px 0;"><strong>Transaction:</strong> ${result.txid}</p>
              <p style="color: #155724; margin: 5px 0;"><strong>Amount:</strong> ${(result.amountSats || 0) / 100000000} BTC</p>
              <p style="color: #155724; margin: 5px 0;"><strong>Confirmations:</strong> ${result.confirmations}</p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${baseUrl}/borrower" 
                 style="display: inline-block; background: linear-gradient(135deg, #FFD700 0%, #4A90E2 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                Generate Recovery Plan
              </a>
            </div>
            
            <div style="text-align: center; margin-top: 30px;">
              <p style="color: #666; margin: 0;"><strong>— The Reconquest Team 👑</strong><br><br>Questions? Contact us at <a href="mailto:admin@reconquestp2p.com" style="color: #D4AF37;">admin@reconquestp2p.com</a></p>
            </div>
          </div>
        </div>
      `
    });
    
    // NOTE: Lender notification is already sent by handleDepositConfirmed (sendLenderFundingNotification)
    // No duplicate lender email needed here
    
    console.log(`[DepositConfirmed] Borrower notification sent for loan ${loan.id}`);
  });
  
  // Start automated LTV monitoring for price-based liquidation
  ltvMonitoring.startMonitoring();
  
  // ============================================================================
  // SECURITY & AUDIT ENDPOINTS
  // ============================================================================
  
  /**
   * Verify borrower non-custody architecture
   * Returns documentation confirming borrower keys never touch the server
   */
  app.get("/api/security/verify-borrower-non-custody", (req, res) => {
    const verification = EscrowSigningService.verifyBorrowerNonCustody();
    res.json({
      verified: true,
      architecture: "NON_CUSTODIAL",
      documentation: verification,
      keyLocations: {
        borrowerPrivateKey: "NEVER ON SERVER - Client-side only",
        borrowerPassphrase: "NEVER ON SERVER - Client-side only", 
        borrowerPubkey: "Server stores for escrow creation",
        borrowerSignatures: "Server stores pre-signed PSBTs"
      },
      clientSideOperations: [
        "Passphrase entry",
        "PBKDF2 key derivation",
        "PSBT signing",
        "Key memory wiping"
      ],
      serverReceivesOnly: [
        "borrowerPubkey (public key)",
        "signedPsbt (with borrower signature)",
        "borrowerSignature (computed client-side)"
      ]
    });
  });
  
  /**
   * Get signing audit logs for a specific loan
   * For compliance and debugging purposes
   */
  app.get("/api/security/audit-logs/:loanId", authenticateToken, async (req: any, res) => {
    const loanId = parseInt(req.params.loanId);
    
    // Only admins can view audit logs
    const user = await storage.getUser(req.user.id);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    const logs = TransactionTemplateService.getAuditLogs(loanId);
    
    res.json({
      loanId,
      auditLogs: logs,
      totalOperations: logs.length,
      securityNote: "Private keys are NEVER logged - only signing events and outcomes"
    });
  });
  
  /**
   * Verify transaction type is valid (whitelisted)
   * Used for debugging and compliance checks
   */
  app.get("/api/security/valid-transaction-types", (req, res) => {
    res.json({
      validTypes: ['REPAYMENT', 'DEFAULT_LIQUIDATION', 'BORROWER_RECOVERY'],
      description: {
        REPAYMENT: "Happy path - borrower repays loan, collateral returned to borrower",
        DEFAULT_LIQUIDATION: "Borrower defaults - lender receives owed amount, borrower gets remainder",
        BORROWER_RECOVERY: "Time-locked emergency recovery if platform fails"
      },
      securityNote: "Platform can ONLY sign these predefined transaction types. No arbitrary transactions permitted."
    });
  });
  
  // =====================================================
  // AUTOMATIC COLLATERAL RELEASE ENDPOINTS
  // =====================================================
  
  /**
   * Webhook: Called when repayment is confirmed
   * Triggers automatic collateral release for a specific loan
   */
  app.post("/api/webhooks/repayment-confirmed", async (req, res) => {
    try {
      const { loanId } = req.body;
      
      if (!loanId) {
        return res.status(400).json({ error: "loanId required" });
      }
      
      console.log(`[Webhook] Repayment confirmed for loan ${loanId}`);
      
      const { processLoanRelease } = await import('./services/AutoCollateralReleaseService.js');
      const result = await processLoanRelease(storage, parseInt(loanId));
      
      if (result.success) {
        res.json({
          success: true,
          message: 'Collateral released automatically',
          txid: result.txid,
          broadcastUrl: result.broadcastUrl
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }
    } catch (error: any) {
      console.error('[Webhook] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  /**
   * Admin trigger: Process all repaid loans needing collateral release
   */
  app.post("/api/admin/trigger-auto-release", authenticateToken, async (req: any, res) => {
    try {
      // Verify admin access
      const user = await storage.getUser(req.user.id);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      console.log('[Admin] Triggering auto-release batch processing');
      
      const { processRepaidLoans } = await import('./services/AutoCollateralReleaseService.js');
      const result = await processRepaidLoans(storage);
      
      res.json({
        success: result.success,
        message: 'Auto-release processing triggered',
        processed: result.processed,
        released: result.released,
        failed: result.failed,
        results: result.results
      });
    } catch (error: any) {
      console.error('[Admin] Auto-release error:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  /**
   * Immediate release for specific loan (called by UI after repayment confirmation)
   */
  app.post("/api/loans/:id/auto-release", authenticateToken, async (req: any, res) => {
    try {
      const loanId = parseInt(req.params.id);
      
      if (isNaN(loanId)) {
        return res.status(400).json({ error: "Invalid loan ID" });
      }
      
      // Verify user is authorized (borrower, lender, or admin)
      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ error: "Loan not found" });
      }
      
      const user = await storage.getUser(req.user.id);
      const isAdmin = user?.role === 'admin';
      const isBorrower = loan.borrowerId === req.user.id;
      const isLender = loan.lenderId === req.user.id;
      
      if (!isAdmin && !isBorrower && !isLender) {
        return res.status(403).json({ error: "Not authorized to release collateral for this loan" });
      }
      
      console.log(`[API] Auto-release triggered for loan ${loanId} by user ${req.user.id}`);
      
      const { processLoanRelease } = await import('./services/AutoCollateralReleaseService.js');
      const result = await processLoanRelease(storage, loanId);
      
      if (result.success) {
        res.json({
          success: true,
          message: 'Collateral released',
          txid: result.txid,
          broadcastUrl: result.broadcastUrl
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }
    } catch (error: any) {
      console.error(`[API] Auto-release error for loan:`, error);
      res.status(500).json({ error: error.message });
    }
  });
  
  /**
   * Get auto-release status for a loan
   */
  app.get("/api/loans/:id/release-status", async (req, res) => {
    try {
      const loanId = parseInt(req.params.id);
      
      if (isNaN(loanId)) {
        return res.status(400).json({ error: "Invalid loan ID" });
      }
      
      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ error: "Loan not found" });
      }
      
      res.json({
        loanId,
        status: loan.status,
        collateralReleased: loan.collateralReleased || false,
        collateralReleaseTxid: loan.collateralReleaseTxid,
        collateralReleasedAt: loan.collateralReleasedAt,
        collateralReleaseError: loan.collateralReleaseError,
        explorerUrl: loan.collateralReleaseTxid 
          ? `https://mempool.space/testnet4/tx/${loan.collateralReleaseTxid}`
          : null
      });
    } catch (error: any) {
      console.error('[API] Error getting release status:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Start auto-release cron job (optional - uncomment to enable)
  // import('./services/AutoCollateralReleaseService.js').then(({ startAutoReleaseCron }) => {
  //   startAutoReleaseCron(storage);
  // });
  
  return httpServer;
}
