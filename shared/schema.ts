import { pgTable, text, serial, integer, decimal, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("user"), // user (can both borrow and lend)
  reputation: integer("reputation").notNull().default(0),
  completedLoans: integer("completed_loans").notNull().default(0),
  emailVerified: boolean("email_verified").notNull().default(false),
  emailVerificationToken: text("email_verification_token"),
  emailVerificationExpires: timestamp("email_verification_expires"),
  passwordResetToken: text("password_reset_token"),
  passwordResetExpires: timestamp("password_reset_expires"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const loans = pgTable("loans", {
  id: serial("id").primaryKey(),
  borrowerId: integer("borrower_id").notNull(),
  lenderId: integer("lender_id"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USDC"),
  interestRate: decimal("interest_rate", { precision: 5, scale: 2 }).notNull(),
  termMonths: integer("term_months").notNull(),
  collateralBtc: decimal("collateral_btc", { precision: 10, scale: 8 }).notNull(),
  ltvRatio: decimal("ltv_ratio", { precision: 5, scale: 2 }).notNull(),
  purpose: text("purpose"),
  status: text("status").notNull().default("posted"), // posted, funding, initiated, active, completed, defaulted
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  fundedAt: timestamp("funded_at"),
  dueDate: timestamp("due_date"),
  repaidAt: timestamp("repaid_at"),
  
  // Enhanced Bitcoin Escrow Fields (Firefish-inspired)
  escrowAddress: text("escrow_address"),
  escrowRedeemScript: text("escrow_redeem_script"),
  escrowWitnessScript: text("escrow_witness_script"), // P2WSH witness script
  escrowScriptHash: text("escrow_script_hash"),
  
  // Key Pair Data (ENCRYPTED in production - store encrypted WIF)
  borrowerPubkey: text("borrower_pubkey"),
  borrowerPrivateKeyWif: text("borrower_private_key_wif"), // Store encrypted!
  borrowerAddress: text("borrower_address"),
  lenderPubkey: text("lender_pubkey"),
  lenderPrivateKeyWif: text("lender_private_key_wif"), // Store encrypted!
  lenderAddress: text("lender_address"),
  platformPubkey: text("platform_pubkey"),
  
  // Pre-Signed Transaction Hashes
  repaymentTxHash: text("repayment_tx_hash"), // Pre-signed repayment transaction
  defaultTxHash: text("default_tx_hash"), // Pre-signed default transaction
  liquidationTxHash: text("liquidation_tx_hash"), // Pre-signed liquidation transaction
  recoveryTxHash: text("recovery_tx_hash"), // Time-locked recovery transaction
  
  // Funding Transaction Data
  escrowTxHash: text("escrow_tx_hash"), // Funding transaction hash
  fundingVout: integer("funding_vout"), // Output index in funding TX
  fundedAmountSats: integer("funded_amount_sats"), // Amount funded in satoshis
  
  // Escrow State Management
  escrowState: text("escrow_state"), // initialized, waiting_for_funding, funded, transactions_signed, active, repaid, defaulted, liquidated, recovered
  escrowContractJson: text("escrow_contract_json"), // Full contract data as JSON backup
  
  // Workflow Flags
  fiatTransferConfirmed: boolean("fiat_transfer_confirmed").default(false),
  borrowerConfirmedReceipt: boolean("borrower_confirmed_receipt").default(false),
  loanStartedAt: timestamp("loan_started_at"),
});

export const loanOffers = pgTable("loan_offers", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").notNull(),
  lenderId: integer("lender_id").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  interestRate: decimal("interest_rate", { precision: 5, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"), // pending, accepted, rejected
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userAchievements = pgTable("user_achievements", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  achievementId: text("achievement_id").notNull(),
  unlockedAt: timestamp("unlocked_at").notNull().defaultNow(),
  progress: integer("progress").notNull().default(0),
  blockchainTxHash: text("blockchain_tx_hash"),
  blockHeight: integer("block_height"),
  blockchainTimestamp: timestamp("blockchain_timestamp"),
});



export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertLoanSchema = createInsertSchema(loans).omit({
  id: true,
  borrowerId: true,
  lenderId: true,
  status: true,
  requestedAt: true,
  fundedAt: true,
  repaidAt: true,
  collateralBtc: true,
  ltvRatio: true,
  dueDate: true,
  escrowAddress: true,
  escrowRedeemScript: true,
  borrowerPubkey: true,
  lenderPubkey: true,
  platformPubkey: true,
  escrowTxHash: true,
  fiatTransferConfirmed: true,
  borrowerConfirmedReceipt: true,
  loanStartedAt: true,
});

export const insertLoanOfferSchema = createInsertSchema(loanOffers).omit({
  id: true,
  lenderId: true,
  status: true,
  createdAt: true,
});

export const insertUserAchievementSchema = createInsertSchema(userAchievements).omit({
  id: true,
  unlockedAt: true,
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Loan = typeof loans.$inferSelect;
export type InsertLoan = z.infer<typeof insertLoanSchema>;
export type LoanOffer = typeof loanOffers.$inferSelect;
export type InsertLoanOffer = z.infer<typeof insertLoanOfferSchema>;
export type UserAchievement = typeof userAchievements.$inferSelect;
export type InsertUserAchievement = z.infer<typeof insertUserAchievementSchema>;
