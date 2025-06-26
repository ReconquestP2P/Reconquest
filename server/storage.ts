import { users, loans, loanOffers, type User, type InsertUser, type Loan, type InsertLoan, type LoanOffer, type InsertLoanOffer } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;

  // Loan operations
  getLoan(id: number): Promise<Loan | undefined>;
  getUserLoans(userId: number): Promise<Loan[]>;
  createLoan(loan: InsertLoan & { borrowerId: number }): Promise<Loan>;
  updateLoan(id: number, updates: Partial<Loan>): Promise<Loan | undefined>;
  getAllLoans(): Promise<Loan[]>;
  getAvailableLoans(): Promise<Loan[]>;

  // Loan offer operations
  createLoanOffer(offer: InsertLoanOffer): Promise<LoanOffer>;
  getLoanOffers(loanId: number): Promise<LoanOffer[]>;
  getUserOffers(userId: number): Promise<LoanOffer[]>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private loans: Map<number, Loan>;
  private loanOffers: Map<number, LoanOffer>;
  private currentUserId: number;
  private currentLoanId: number;
  private currentOfferId: number;

  constructor() {
    this.users = new Map();
    this.loans = new Map();
    this.loanOffers = new Map();
    this.currentUserId = 1;
    this.currentLoanId = 1;
    this.currentOfferId = 1;

    // Initialize with mock data
    this.initializeMockData();
  }

  private initializeMockData() {
    // Create mock users
    const mockUsers: User[] = [
      {
        id: 1,
        username: "bitcoiner1",
        email: "bitcoiner1@example.com",
        password: "hashed_password",
        role: "borrower",
        reputation: 95,
        completedLoans: 3,
        createdAt: new Date("2024-01-15"),
      },
      {
        id: 2,
        username: "investor1",
        email: "investor1@example.com",
        password: "hashed_password",
        role: "lender",
        reputation: 98,
        completedLoans: 15,
        createdAt: new Date("2023-11-20"),
      },
      {
        id: 3,
        username: "bitcoiner2",
        email: "bitcoiner2@example.com",
        password: "hashed_password",
        role: "borrower",
        reputation: 87,
        completedLoans: 1,
        createdAt: new Date("2024-03-10"),
      },
    ];

    mockUsers.forEach(user => {
      this.users.set(user.id, user);
      this.currentUserId = Math.max(this.currentUserId, user.id + 1);
    });

    // Create mock loans
    const mockLoans: Loan[] = [
      {
        id: 1,
        borrowerId: 1,
        lenderId: 2,
        amount: "25000.00",
        currency: "USDC",
        interestRate: "8.50",
        termMonths: 6,
        collateralBtc: "0.74000000",
        ltvRatio: "45.00",
        purpose: "Business expansion funding",
        status: "active",
        requestedAt: new Date("2024-12-01"),
        fundedAt: new Date("2024-12-02"),
        dueDate: new Date("2025-06-02"),
        repaidAt: null,
      },
      {
        id: 2,
        borrowerId: 1,
        lenderId: 2,
        amount: "20000.00",
        currency: "EUR",
        interestRate: "7.20",
        termMonths: 12,
        collateralBtc: "0.60000000",
        ltvRatio: "49.00",
        purpose: "Property investment",
        status: "active",
        requestedAt: new Date("2024-11-15"),
        fundedAt: new Date("2024-11-16"),
        dueDate: new Date("2025-11-16"),
        repaidAt: null,
      },
      {
        id: 3,
        borrowerId: 3,
        lenderId: null,
        amount: "30000.00",
        currency: "USDC",
        interestRate: "12.50",
        termMonths: 6,
        collateralBtc: "0.89000000",
        ltvRatio: "45.00",
        purpose: "Business expansion funding",
        status: "pending",
        requestedAt: new Date("2025-01-20"),
        fundedAt: null,
        dueDate: null,
        repaidAt: null,
      },
      {
        id: 4,
        borrowerId: 3,
        lenderId: null,
        amount: "15000.00",
        currency: "EUR",
        interestRate: "10.80",
        termMonths: 12,
        collateralBtc: "0.45000000",
        ltvRatio: "48.00",
        purpose: "Property investment down payment",
        status: "pending",
        requestedAt: new Date("2025-01-18"),
        fundedAt: null,
        dueDate: null,
        repaidAt: null,
      },
    ];

    mockLoans.forEach(loan => {
      this.loans.set(loan.id, loan);
      this.currentLoanId = Math.max(this.currentLoanId, loan.id + 1);
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.email === email);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = {
      ...insertUser,
      id,
      role: insertUser.role || "borrower",
      reputation: 0,
      completedLoans: 0,
      createdAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async getLoan(id: number): Promise<Loan | undefined> {
    return this.loans.get(id);
  }

  async getUserLoans(userId: number): Promise<Loan[]> {
    return Array.from(this.loans.values()).filter(
      loan => loan.borrowerId === userId || loan.lenderId === userId
    );
  }

  async createLoan(loanData: InsertLoan & { borrowerId: number }): Promise<Loan> {
    const id = this.currentLoanId++;
    const loan: Loan = {
      ...loanData,
      id,
      lenderId: null,
      currency: loanData.currency || "USDC",
      purpose: loanData.purpose || null,
      status: "pending",
      requestedAt: new Date(),
      fundedAt: null,
      dueDate: loanData.dueDate ?? null,
      repaidAt: null,
    };
    this.loans.set(id, loan);
    return loan;
  }

  async updateLoan(id: number, updates: Partial<Loan>): Promise<Loan | undefined> {
    const loan = this.loans.get(id);
    if (!loan) return undefined;

    const updatedLoan = { ...loan, ...updates };
    this.loans.set(id, updatedLoan);
    return updatedLoan;
  }

  async getAllLoans(): Promise<Loan[]> {
    return Array.from(this.loans.values());
  }

  async getAvailableLoans(): Promise<Loan[]> {
    return Array.from(this.loans.values()).filter(loan => loan.status === "pending");
  }

  async createLoanOffer(offer: InsertLoanOffer): Promise<LoanOffer> {
    const id = this.currentOfferId++;
    const loanOffer: LoanOffer = {
      ...offer,
      id,
      status: "pending",
      createdAt: new Date(),
    };
    this.loanOffers.set(id, loanOffer);
    return loanOffer;
  }

  async getLoanOffers(loanId: number): Promise<LoanOffer[]> {
    return Array.from(this.loanOffers.values()).filter(offer => offer.loanId === loanId);
  }

  async getUserOffers(userId: number): Promise<LoanOffer[]> {
    return Array.from(this.loanOffers.values()).filter(offer => offer.lenderId === userId);
  }
}

// Database storage implementation
export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        ...insertUser,
        role: insertUser.role || "borrower",
      })
      .returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async getLoan(id: number): Promise<Loan | undefined> {
    const [loan] = await db.select().from(loans).where(eq(loans.id, id));
    return loan || undefined;
  }

  async getUserLoans(userId: number): Promise<Loan[]> {
    return await db
      .select()
      .from(loans)
      .where(eq(loans.borrowerId, userId))
      .union(
        db.select().from(loans).where(eq(loans.lenderId, userId))
      );
  }

  async createLoan(loanData: InsertLoan & { borrowerId: number }): Promise<Loan> {
    const [loan] = await db
      .insert(loans)
      .values({
        ...loanData,
        currency: loanData.currency || "USDC",
        purpose: loanData.purpose || null,
        dueDate: loanData.dueDate ?? null,
      })
      .returning();
    return loan;
  }

  async updateLoan(id: number, updates: Partial<Loan>): Promise<Loan | undefined> {
    const [loan] = await db
      .update(loans)
      .set(updates)
      .where(eq(loans.id, id))
      .returning();
    return loan || undefined;
  }

  async getAllLoans(): Promise<Loan[]> {
    return await db.select().from(loans);
  }

  async getAvailableLoans(): Promise<Loan[]> {
    return await db
      .select()
      .from(loans)
      .where(eq(loans.status, "pending"));
  }

  async createLoanOffer(offer: InsertLoanOffer): Promise<LoanOffer> {
    const [loanOffer] = await db
      .insert(loanOffers)
      .values(offer)
      .returning();
    return loanOffer;
  }

  async getLoanOffers(loanId: number): Promise<LoanOffer[]> {
    return await db
      .select()
      .from(loanOffers)
      .where(eq(loanOffers.loanId, loanId));
  }

  async getUserOffers(userId: number): Promise<LoanOffer[]> {
    return await db
      .select()
      .from(loanOffers)
      .where(eq(loanOffers.lenderId, userId));
  }
}

export const storage = new DatabaseStorage();
