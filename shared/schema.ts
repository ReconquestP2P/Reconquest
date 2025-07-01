import { pgTable, text, serial, integer, decimal, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("borrower"), // borrower, lender
  reputation: integer("reputation").notNull().default(0),
  completedLoans: integer("completed_loans").notNull().default(0),
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
  status: text("status").notNull().default("pending"), // pending, active, completed, defaulted
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  fundedAt: timestamp("funded_at"),
  dueDate: timestamp("due_date"),
  repaidAt: timestamp("repaid_at"),
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

export const signups = pgTable("signups", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name"),
  interest: text("interest").notNull(), // borrower, lender, both
  message: text("message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
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
});

export const insertLoanOfferSchema = createInsertSchema(loanOffers).omit({
  id: true,
  status: true,
  createdAt: true,
});

export const insertSignupSchema = createInsertSchema(signups).omit({
  id: true,
  createdAt: true,
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Loan = typeof loans.$inferSelect;
export type InsertLoan = z.infer<typeof insertLoanSchema>;
export type LoanOffer = typeof loanOffers.$inferSelect;
export type InsertLoanOffer = z.infer<typeof insertLoanOfferSchema>;
export type Signup = typeof signups.$inferSelect;
export type InsertSignup = z.infer<typeof insertSignupSchema>;
