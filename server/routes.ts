import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertLoanSchema, insertLoanOfferSchema, insertSignupSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
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

  const httpServer = createServer(app);
  return httpServer;
}
