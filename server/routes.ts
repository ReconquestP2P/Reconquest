import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertLoanSchema, insertLoanOfferSchema, insertSignupSchema } from "@shared/schema";
import { z } from "zod";
import { sendEmail, createWelcomeEmail, createAdminNotificationEmail } from "./email";
import { LendingWorkflowService } from "./services/LendingWorkflowService";
import { BitcoinEscrowService } from "./services/BitcoinEscrowService";
import { LtvValidationService } from "./services/LtvValidationService";

export async function registerRoutes(app: Express): Promise<Server> {
  // Serve static logo for emails
  app.use('/public', express.static('client/public'));

  // Mock Bitcoin price endpoint
  app.get("/api/btc-price", async (req, res) => {
    // Simulate Bitcoin price with slight variations
    const basePrice = 67245;
    const variation = (Math.random() - 0.5) * 1000;
    const currentPrice = Math.round(basePrice + variation);
    
    res.json({ 
      price: currentPrice,
      timestamp: new Date().toISOString(),
      currency: "USD"
    });
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
      const validatedData = insertLoanSchema.parse(req.body);
      
      // Mock user ID (in real app, get from authentication)
      const borrowerId = 1;
      
      // Calculate collateral based on 2:1 ratio
      const btcPrice = 67245; // Mock current BTC price
      const loanAmount = parseFloat(validatedData.amount);
      const requiredCollateralValue = loanAmount * 2;
      const requiredBtc = (requiredCollateralValue / btcPrice).toFixed(8);
      
      const loanData = {
        ...validatedData,
        borrowerId,
        collateralBtc: requiredBtc,
        ltvRatio: "50.00",
        dueDate: new Date(Date.now() + validatedData.termMonths * 30 * 24 * 60 * 60 * 1000),
      };
      
      const loan = await storage.createLoan(loanData);
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
      
      if (loan.status !== "pending") {
        return res.status(400).json({ message: "Loan is not available for funding" });
      }
      
      const updatedLoan = await storage.updateLoan(loanId, {
        lenderId,
        status: "active",
        fundedAt: new Date(),
      });
      
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

  // Create signup
  app.post("/api/signups", async (req, res) => {
    try {
      console.log("Received signup request:", req.body);
      console.log("Content-Type:", req.headers['content-type']);
      
      const validatedData = insertSignupSchema.parse(req.body);
      const signup = await storage.createSignup(validatedData);
      
      // Send welcome email to user (if RESEND_API_KEY is configured)
      if (process.env.RESEND_API_KEY) {
        try {
          await sendEmail({
            to: signup.email,
            from: 'onboarding@resend.dev', // Using Resend's verified domain
            subject: 'Welcome to Reconquest - You\'re on the waitlist!',
            html: createWelcomeEmail(signup.name || '', signup.email)
          });

          // Send admin notification email
          const adminEmail = process.env.ADMIN_EMAIL || 'your-email@example.com';
          await sendEmail({
            to: adminEmail,
            from: 'onboarding@resend.dev', // Using Resend's verified domain
            subject: 'New Waitlist Signup - Reconquest',
            html: createAdminNotificationEmail(signup)
          });

          console.log('Welcome and admin notification emails sent successfully');
        } catch (emailError) {
          console.error('Email sending failed:', emailError);
          // Continue even if email fails - don't block the signup
        }
      } else {
        console.log('RESEND_API_KEY not configured, skipping email notifications');
      }
      
      // If this is a form submission (not AJAX), redirect back with success
      if (req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
        return res.redirect('/?success=true');
      }
      
      res.status(201).json(signup);
    } catch (error) {
      console.error("Signup error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get all signups (admin endpoint)
  app.get("/api/admin/signups", async (req, res) => {
    try {
      const signups = await storage.getAllSignups();
      res.json(signups);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Initialize Bitcoin lending workflow services
  const bitcoinEscrow = new BitcoinEscrowService();
  const ltvValidator = new LtvValidationService();
  const getCurrentBtcPrice = async () => {
    const basePrice = 67245;
    const variation = (Math.random() - 0.5) * 1000;
    return Math.round(basePrice + variation);
  };
  
  const lendingWorkflow = new LendingWorkflowService(
    storage,
    bitcoinEscrow,
    ltvValidator,
    getCurrentBtcPrice
  );

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

  const httpServer = createServer(app);
  return httpServer;
}
