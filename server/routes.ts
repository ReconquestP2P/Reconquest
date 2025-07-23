import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertLoanSchema, insertLoanOfferSchema, insertUserSchema } from "@shared/schema";
import { z } from "zod";
import { LendingWorkflowService } from "./services/LendingWorkflowService";
import { BitcoinEscrowService } from "./services/BitcoinEscrowService";
import { LtvValidationService } from "./services/LtvValidationService";
import { sendEmail } from "./email";
import bcrypt from "bcryptjs";
import { EmailVerificationService } from "./services/EmailVerificationService";
import { PasswordResetService } from "./services/PasswordResetService";

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize services
  const emailVerificationService = new EmailVerificationService(storage);
  const passwordResetService = new PasswordResetService(storage);

  // Serve static logo for emails
  app.use('/public', express.static('client/public'));

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

  // Fund loan endpoint - triggers the full lending workflow
  app.post("/api/loans/:loanId/fund", async (req, res) => {
    try {
      const loanId = parseInt(req.params.loanId);
      const { lenderId } = req.body;

      if (!loanId || !lenderId) {
        return res.status(400).json({ message: "Loan ID and Lender ID are required" });
      }

      // Get the loan details
      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }

      if (loan.status !== "pending" && loan.status !== "posted" && loan.status !== "initiated" && loan.status !== "funding") {
        return res.status(400).json({ message: "Loan is not available for funding" });
      }

      // Update loan with lender and set status to escrow_pending
      const updatedLoan = await storage.updateLoan(loanId, {
        lenderId: lenderId,
        status: "escrow_pending"
      });

      if (!updatedLoan) {
        return res.status(500).json({ message: "Failed to update loan" });
      }

      // Use the existing lending workflow service
      const result = await lendingWorkflow.initiateLoan(
        updatedLoan.borrowerId,
        parseFloat(updatedLoan.collateralBtc),
        parseFloat(updatedLoan.amount)
      );

      if (result.success) {
        // Update loan with escrow address
        await storage.updateLoan(loanId, {
          escrowAddress: result.escrowAddress
        });

        res.json({
          success: true,
          message: "Loan funding initiated successfully",
          escrowAddress: result.escrowAddress,
          loanId: loanId,
          instructions: `Borrower will be notified to send ${updatedLoan.collateralBtc} BTC to escrow address: ${result.escrowAddress}`
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.errorMessage || "Failed to initiate loan"
        });
      }
    } catch (error) {
      console.error("Error funding loan:", error);
      res.status(500).json({ 
        success: false,
        message: "Internal server error while funding loan" 
      });
    }
  });

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

      // Return user without password
      const { password: _, ...userWithoutPassword } = user;
      console.log("Login successful for user:", userWithoutPassword.email);
      
      res.json({
        success: true,
        message: "Login successful",
        user: userWithoutPassword
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
        await sendEmail({
          to: "admin@reconquestp2p.com",
          from: "noreply@reconquestp2p.com",
          subject: `🔔 [ADMIN ALERT] New User Registration - ${newUser.username}`,
          html: `
            <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
              <div style="background: linear-gradient(135deg, #FFD700 0%, #4A90E2 100%); padding: 20px; border-radius: 8px 8px 0 0;">
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
                  <p style="color: #666; margin: 0;">This is an automated notification from Reconquest Admin System</p>
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

  // Get all loans
  app.get("/api/loans", async (req, res) => {
    const loans = await storage.getAllLoans();
    res.json(loans);
  });

  // Get available loans (pending status)
  app.get("/api/loans/available", async (req, res) => {
    const loans = await storage.getAvailableLoans();
    res.json(loans);
  });

  // Get user's loans (both as borrower and lender)
  app.get("/api/users/:id/loans", async (req, res) => {
    const userId = parseInt(req.params.id);
    const loans = await storage.getUserLoans(userId);
    res.json(loans);
  });

  // Create new loan request
  app.post("/api/loans", async (req, res) => {
    try {
      // Parse only the required fields from the request body
      const requestData = insertLoanSchema.parse(req.body);
      
      // Mock user ID (in real app, get from authentication)
      const borrowerId = 1;
      
      // Calculate collateral based on 2:1 ratio using real-time BTC price in loan currency
      const btcPrice = await getBtcPriceForCurrency(requestData.currency);
      const loanAmount = parseFloat(requestData.amount);
      const requiredCollateralValue = loanAmount * 2;
      const requiredBtc = (requiredCollateralValue / btcPrice).toFixed(8);
      
      const loanData = {
        ...requestData,
        borrowerId,
        collateralBtc: requiredBtc,
        ltvRatio: "50.00",
        status: "posted",
        dueDate: new Date(Date.now() + requestData.termMonths * 30 * 24 * 60 * 60 * 1000),
      };
      
      const loan = await storage.createLoan(loanData);

      // Send email notifications for new loan
      console.log(`Attempting to send email notifications for new loan #${loan.id}`);
      await sendNotificationsForNewLoan(loan, borrowerId);
      
      res.status(201).json(loan);
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

  // Fund a loan (lender accepts loan request)
  app.post("/api/loans/:id/fund", async (req, res) => {
    const loanId = parseInt(req.params.id);
    
    // Mock lender ID (in real app, get from authentication)
    const lenderId = 2;
    
    try {
      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }
      
      if (loan.status !== "pending" && loan.status !== "posted" && loan.status !== "initiated" && loan.status !== "funding") {
        return res.status(400).json({ message: "Loan is not available for funding" });
      }
      
      const updatedLoan = await storage.updateLoan(loanId, {
        lenderId,
        status: "active",
        fundedAt: new Date(),
      });

      // Notify admin about funding attempt
      if (updatedLoan) {
        await sendFundingNotification(updatedLoan, lenderId);
      }
      
      res.json(updatedLoan);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create loan offer
  app.post("/api/loan-offers", async (req, res) => {
    try {
      const validatedData = insertLoanOfferSchema.parse(req.body);
      
      // Mock lender ID (in real app, get from authentication)
      const lenderId = 2;
      
      const offer = await storage.createLoanOffer({
        ...validatedData,
        lenderId,
      });

      // Notify admin about funding attempt
      const loan = await storage.getLoan(validatedData.loanId);
      if (loan) {
        await sendFundingNotification(loan, lenderId);
      }
      
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
  async function sendFundingNotification(loan: any, lenderId: number) {
    try {
      const borrower = await storage.getUser(loan.borrowerId);
      const lender = await storage.getUser(lenderId);
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
      await sendEmail({
        to: "admin@reconquestp2p.com", // Admin notification for loan posting
        from: "noreply@reconquestp2p.com",
        subject: `✅ Loan Request Posted - Loan #${loan.id}`,
        html: `
          <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
            <div style="background: linear-gradient(135deg, #FFD700 0%, #4A90E2 100%); padding: 20px; border-radius: 8px 8px 0 0;">
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
  app.post("/api/loans/bitcoin/initiate", async (req, res) => {
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
  app.post("/api/loans/:id/escrow/verify", async (req, res) => {
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
  app.post("/api/loans/:id/fiat/confirm", async (req, res) => {
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
  app.post("/api/loans/:id/receipt/confirm", async (req, res) => {
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
        
        return {
          ...loan,
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

  // Test email endpoint
  app.post("/api/test-email", async (req, res) => {
    try {
      const success = await sendEmail({
        to: "admin@reconquestp2p.com",
        from: "noreply@reconquestp2p.com",
        subject: "🔔 [ADMIN TEST] Email System Test",
        html: `
          <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
            <div style="background: linear-gradient(135deg, #FFD700 0%, #4A90E2 100%); padding: 20px; border-radius: 8px 8px 0 0;">
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

  const httpServer = createServer(app);
  return httpServer;
}
