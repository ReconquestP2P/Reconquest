import { db } from "./db";
import { users, loans } from "@shared/schema";

async function seed() {
  console.log("Seeding database...");

  // Insert sample users
  const sampleUsers = await db
    .insert(users)
    .values([
      {
        username: "bitcoiner1",
        email: "bitcoiner1@example.com",
        password: "hashed_password",
        role: "borrower",
        reputation: 95,
        completedLoans: 3,
      },
      {
        username: "investor1",
        email: "investor1@example.com",
        password: "hashed_password",
        role: "lender",
        reputation: 98,
        completedLoans: 15,
      },
      {
        username: "bitcoiner2",
        email: "bitcoiner2@example.com",
        password: "hashed_password",
        role: "borrower",
        reputation: 87,
        completedLoans: 1,
      },
    ])
    .returning();

  console.log("Created users:", sampleUsers);

  // Insert sample loans
  const sampleLoans = await db
    .insert(loans)
    .values([
      {
        borrowerId: sampleUsers[0].id,
        lenderId: sampleUsers[1].id,
        amount: "25000.00",
        currency: "USDC",
        interestRate: "8.50",
        termMonths: 6,
        collateralBtc: "0.74000000",
        ltvRatio: "45.00",
        purpose: "Business expansion funding",
        status: "active",
        dueDate: new Date("2025-06-02"),
      },
      {
        borrowerId: sampleUsers[0].id,
        lenderId: sampleUsers[1].id,
        amount: "20000.00",
        currency: "EUR",
        interestRate: "7.20",
        termMonths: 12,
        collateralBtc: "0.60000000",
        ltvRatio: "49.00",
        purpose: "Property investment",
        status: "active",
        dueDate: new Date("2025-11-16"),
      },
      {
        borrowerId: sampleUsers[2].id,
        amount: "30000.00",
        currency: "USDC",
        interestRate: "12.50",
        termMonths: 6,
        collateralBtc: "0.89000000",
        ltvRatio: "45.00",
        purpose: "Business expansion funding",
        status: "pending",
      },
      {
        borrowerId: sampleUsers[2].id,
        amount: "15000.00",
        currency: "EUR",
        interestRate: "10.80",
        termMonths: 12,
        collateralBtc: "0.45000000",
        ltvRatio: "48.00",
        purpose: "Property investment down payment",
        status: "pending",
      },
    ])
    .returning();

  console.log("Created loans:", sampleLoans);
  console.log("Database seeded successfully!");
}

seed().catch(console.error);