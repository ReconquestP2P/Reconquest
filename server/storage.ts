import { 
  users, loans, loanOffers, disputes, disputeAuditLogs, loanDocuments,
  escrowSessions, signatureExchanges, escrowEvents, preSignedTransactions, psbtTemplates,
  type User, type InsertUser, 
  type Loan, type InsertLoan, 
  type LoanOffer, type InsertLoanOffer,
  type EscrowSession, type InsertEscrowSession,
  type SignatureExchange, type InsertSignatureExchange,
  type EscrowEvent, type InsertEscrowEvent,
  type PreSignedTransaction, type InsertPreSignedTransaction,
  type Dispute, type InsertDispute,
  type DisputeAuditLog, type InsertDisputeAuditLog,
  type PsbtTemplate, type InsertPsbtTemplate,
  type LoanDocument, type InsertLoanDocument
} from "@shared/schema";
import { db } from "./db";
import { eq, or } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<User>): Promise<User | undefined>;
  getUserByVerificationToken(token: string): Promise<User | undefined>;
  getUserByPasswordResetToken(token: string): Promise<User | undefined>;
  deleteUserByEmail(email: string): Promise<boolean>;
  getAllUsers(): Promise<User[]>;

  // Loan operations
  getLoan(id: number): Promise<Loan | undefined>;
  getUserLoans(userId: number): Promise<Loan[]>;
  createLoan(loan: InsertLoan & { borrowerId: number }): Promise<Loan>;
  updateLoan(id: number, updates: Partial<Loan>): Promise<Loan | undefined>;
  getAllLoans(): Promise<Loan[]>;
  getAvailableLoans(): Promise<Loan[]>;
  getLoansWithActiveMonitoring(): Promise<Loan[]>;
  getLoansAwaitingDeposit(): Promise<Loan[]>;
  getLoansWithActiveTopUpMonitoring(): Promise<Loan[]>;
  getActiveLoansForLtvCheck(): Promise<Loan[]>;

  // Loan offer operations
  createLoanOffer(offer: InsertLoanOffer): Promise<LoanOffer>;
  getLoanOffers(loanId: number): Promise<LoanOffer[]>;
  getUserOffers(userId: number): Promise<LoanOffer[]>;
  getLoanOffer(offerId: number): Promise<LoanOffer | undefined>;
  acceptLoanOffer(offerId: number): Promise<LoanOffer>;
  updateLoanWithEscrow(loanId: number, escrowData: {
    escrowAddress: string;
    witnessScript: string;
    borrowerPubkey: string;
    lenderPubkey: string;
    platformPubkey: string;
  }): Promise<Loan>;

  // WASM Escrow Session operations
  createEscrowSession(session: InsertEscrowSession): Promise<EscrowSession>;
  getEscrowSession(sessionId: string): Promise<EscrowSession | undefined>;
  getEscrowSessionByLoanId(loanId: number): Promise<EscrowSession | undefined>;
  updateEscrowSession(sessionId: string, updates: Partial<EscrowSession>): Promise<EscrowSession | undefined>;
  
  // Signature Exchange operations
  createSignatureExchange(signature: InsertSignatureExchange): Promise<SignatureExchange>;
  getSignatureExchanges(escrowSessionId: string): Promise<SignatureExchange[]>;
  
  // Escrow Event operations
  createEscrowEvent(event: InsertEscrowEvent): Promise<EscrowEvent>;
  getEscrowEvents(escrowSessionId: string): Promise<EscrowEvent[]>;
  
  // Pre-signed Transaction operations (Firefish Ephemeral Key Model)
  storePreSignedTransaction(tx: InsertPreSignedTransaction): Promise<PreSignedTransaction>;
  getPreSignedTransactions(loanId: number, txType?: string): Promise<PreSignedTransaction[]>;
  updateTransactionBroadcastStatus(id: number, updates: {
    broadcastStatus: string;
    broadcastTxid?: string;
    broadcastedAt?: Date;
    confirmedAt?: Date;
  }): Promise<PreSignedTransaction | undefined>;

  // Dispute operations
  createDispute(dispute: InsertDispute): Promise<Dispute>;
  getDisputesByLoan(loanId: number): Promise<Dispute[]>;
  updateDispute(id: number, updates: Partial<Dispute>): Promise<Dispute | undefined>;

  // Dispute Audit Log operations
  createDisputeAuditLog(log: InsertDisputeAuditLog): Promise<DisputeAuditLog>;
  getDisputeAuditLogs(loanId: number): Promise<DisputeAuditLog[]>;

  // PSBT Template operations (Security: canonical template storage)
  storePsbtTemplate(template: InsertPsbtTemplate): Promise<PsbtTemplate>;
  getPsbtTemplate(loanId: number, txType: string): Promise<PsbtTemplate | undefined>;

  // Loan Document operations
  createLoanDocument(doc: InsertLoanDocument): Promise<LoanDocument>;
  getLoanDocuments(loanId: number): Promise<LoanDocument[]>;
  getLoanDocument(id: number): Promise<LoanDocument | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private loans: Map<number, Loan>;
  private loanOffers: Map<number, LoanOffer>;
  private disputes: Map<number, Dispute>;
  private currentUserId: number;
  private currentLoanId: number;
  private currentOfferId: number;
  private currentDisputeId: number;

  constructor() {
    this.users = new Map();
    this.loans = new Map();
    this.loanOffers = new Map();
    this.disputes = new Map();
    this.currentUserId = 1;
    this.currentLoanId = 1;
    this.currentOfferId = 1;
    this.currentDisputeId = 1;

    // Initialize with mock data
    this.initializeMockData();
  }

  private initializeMockData() {
    // Create mock users
    const mockUsers: User[] = [
      {
        id: 1,
        username: "bitcoiner1",
        email: "borrower1@example.com",
        password: "hashed_password",
        role: "borrower",
        reputation: 95,
        completedLoans: 3,
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
        passwordResetToken: null,
        passwordResetExpires: null,
        createdAt: new Date("2024-01-15"),
      },
      {
        id: 2,
        username: "investor1",
        email: "jfestrada93@gmail.com",
        password: "$2b$12$B4yjVm/9HRCQ.ezSQsX.feiCaL/usvsjMUeFLTDr8Rr/l6GZY.jGm", // test123
        role: "lender",
        reputation: 98,
        completedLoans: 15,
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
        passwordResetToken: null,
        passwordResetExpires: null,
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
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
        passwordResetToken: null,
        passwordResetExpires: null,
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
        status: "initiated",
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
        status: "funding", 
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
      emailVerified: false,
      emailVerificationToken: null,
      emailVerificationExpires: null,
      passwordResetToken: null,
      passwordResetExpires: null,
      createdAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User | undefined> {
    const existingUser = this.users.get(id);
    if (!existingUser) return undefined;
    
    const updatedUser = { ...existingUser, ...updates };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async getUserByVerificationToken(token: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.emailVerificationToken === token);
  }

  async getUserByPasswordResetToken(token: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.passwordResetToken === token);
  }

  async deleteUserByEmail(email: string): Promise<boolean> {
    const user = Array.from(this.users.values()).find(user => user.email === email);
    if (user) {
      this.users.delete(user.id);
      return true;
    }
    return false;
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
      status: "posted",
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
    return Array.from(this.loans.values()).filter(loan => 
      loan.status === "posted" || loan.status === "initiated" || loan.status === "funding"
    );
  }

  async getLoansWithActiveMonitoring(): Promise<Loan[]> {
    return Array.from(this.loans.values()).filter(loan => 
      loan.escrowMonitoringActive === true
    );
  }

  async getLoansAwaitingDeposit(): Promise<Loan[]> {
    return Array.from(this.loans.values()).filter(loan =>
      loan.escrowAddress &&
      loan.borrowerSigningComplete === true &&
      !loan.depositConfirmedAt &&
      loan.escrowState === 'escrow_created'
    );
  }

  async getLoansWithActiveTopUpMonitoring(): Promise<Loan[]> {
    return Array.from(this.loans.values()).filter(loan => 
      loan.topUpMonitoringActive === true
    );
  }

  async getActiveLoansForLtvCheck(): Promise<Loan[]> {
    return Array.from(this.loans.values()).filter(loan => 
      loan.status === 'active' && 
      loan.escrowState === 'keys_generated' &&
      loan.escrowAddress !== null
    );
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

  async getLoanOffer(offerId: number): Promise<LoanOffer | undefined> {
    return this.loanOffers.get(offerId);
  }

  async acceptLoanOffer(offerId: number): Promise<LoanOffer> {
    const offer = this.loanOffers.get(offerId);
    if (!offer) throw new Error('Offer not found');
    const updated = { ...offer, status: 'accepted' as const };
    this.loanOffers.set(offerId, updated);
    return updated;
  }

  async updateLoanWithEscrow(loanId: number, escrowData: {
    escrowAddress: string;
    witnessScript: string;
    borrowerPubkey: string;
    lenderPubkey: string;
    platformPubkey: string;
  }): Promise<Loan> {
    const loan = this.loans.get(loanId);
    if (!loan) throw new Error('Loan not found');
    const updated = {
      ...loan,
      escrowAddress: escrowData.escrowAddress,
      escrowWitnessScript: escrowData.witnessScript,
      borrowerPubkey: escrowData.borrowerPubkey,
      lenderPubkey: escrowData.lenderPubkey,
      platformPubkey: escrowData.platformPubkey,
      status: 'funding' as const
    };
    this.loans.set(loanId, updated);
    return updated;
  }

  // WASM Escrow Session Operations (Stubs - not used with MemStorage)
  async createEscrowSession(session: InsertEscrowSession): Promise<EscrowSession> {
    throw new Error('Escrow sessions not supported in MemStorage');
  }

  async getEscrowSession(sessionId: string): Promise<EscrowSession | undefined> {
    return undefined;
  }

  async getEscrowSessionByLoanId(loanId: number): Promise<EscrowSession | undefined> {
    return undefined;
  }

  async updateEscrowSession(sessionId: string, updates: Partial<EscrowSession>): Promise<EscrowSession | undefined> {
    return undefined;
  }

  async createSignatureExchange(signature: InsertSignatureExchange): Promise<SignatureExchange> {
    throw new Error('Signature exchanges not supported in MemStorage');
  }

  async getSignatureExchanges(escrowSessionId: string): Promise<SignatureExchange[]> {
    return [];
  }

  async createEscrowEvent(event: InsertEscrowEvent): Promise<EscrowEvent> {
    throw new Error('Escrow events not supported in MemStorage');
  }

  async getEscrowEvents(escrowSessionId: string): Promise<EscrowEvent[]> {
    return [];
  }

  async storePsbtTemplate(template: InsertPsbtTemplate): Promise<PsbtTemplate> {
    throw new Error('PSBT templates not supported in MemStorage');
  }

  async getPsbtTemplate(loanId: number, txType: string): Promise<PsbtTemplate | undefined> {
    return undefined;
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

  async updateUser(id: number, updates: Partial<User>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  async getUserByVerificationToken(token: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.emailVerificationToken, token));
    return user || undefined;
  }

  async getUserByPasswordResetToken(token: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.passwordResetToken, token));
    return user || undefined;
  }

  async deleteUserByEmail(email: string): Promise<boolean> {
    const deletedUsers = await db.delete(users).where(eq(users.email, email)).returning();
    return deletedUsers.length > 0;
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
    const { and } = await import('drizzle-orm');
    // Get current network type from environment
    const currentNetwork = process.env.BITCOIN_NETWORK === 'mainnet' ? 'mainnet' : 'testnet4';
    return await db
      .select()
      .from(loans)
      .where(and(
        eq(loans.status, "posted"),
        eq(loans.networkType, currentNetwork)
      ));
  }

  async getLoansWithActiveMonitoring(): Promise<Loan[]> {
    return await db
      .select()
      .from(loans)
      .where(eq(loans.escrowMonitoringActive, true));
  }

  async getLoansAwaitingDeposit(): Promise<Loan[]> {
    const { and, isNotNull, isNull } = await import('drizzle-orm');
    return await db
      .select()
      .from(loans)
      .where(
        and(
          isNotNull(loans.escrowAddress),
          eq(loans.borrowerSigningComplete, true),
          isNull(loans.depositConfirmedAt),
          eq(loans.escrowState, 'escrow_created')
        )
      );
  }

  async getLoansWithActiveTopUpMonitoring(): Promise<Loan[]> {
    return await db
      .select()
      .from(loans)
      .where(eq(loans.topUpMonitoringActive, true));
  }

  async getActiveLoansForLtvCheck(): Promise<Loan[]> {
    const { and, isNotNull, or } = await import('drizzle-orm');
    return await db
      .select()
      .from(loans)
      .where(
        and(
          eq(loans.status, 'active'),
          or(
            eq(loans.escrowState, 'keys_generated'),
            eq(loans.escrowState, 'deposit_confirmed')
          ),
          isNotNull(loans.escrowAddress)
        )
      );
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

  async getLoanOffer(offerId: number): Promise<LoanOffer | undefined> {
    const [loanOffer] = await db
      .select()
      .from(loanOffers)
      .where(eq(loanOffers.id, offerId));
    return loanOffer;
  }

  async acceptLoanOffer(offerId: number): Promise<LoanOffer> {
    const [acceptedOffer] = await db
      .update(loanOffers)
      .set({ status: 'accepted' })
      .where(eq(loanOffers.id, offerId))
      .returning();
    return acceptedOffer;
  }

  async updateLoanWithEscrow(loanId: number, escrowData: {
    escrowAddress: string;
    witnessScript: string;
    borrowerPubkey: string;
    lenderPubkey: string;
    platformPubkey: string;
  }): Promise<Loan> {
    const [updatedLoan] = await db
      .update(loans)
      .set({
        escrowAddress: escrowData.escrowAddress,
        escrowWitnessScript: escrowData.witnessScript,
        borrowerPubkey: escrowData.borrowerPubkey,
        lenderPubkey: escrowData.lenderPubkey,
        platformPubkey: escrowData.platformPubkey,
        status: 'funding'
      })
      .where(eq(loans.id, loanId))
      .returning();
    return updatedLoan;
  }

  // WASM Escrow Session Operations
  async createEscrowSession(session: InsertEscrowSession): Promise<EscrowSession> {
    const [escrowSession] = await db
      .insert(escrowSessions)
      .values(session)
      .returning();
    return escrowSession;
  }

  async getEscrowSession(sessionId: string): Promise<EscrowSession | undefined> {
    const [session] = await db
      .select()
      .from(escrowSessions)
      .where(eq(escrowSessions.sessionId, sessionId));
    return session || undefined;
  }

  async getEscrowSessionByLoanId(loanId: number): Promise<EscrowSession | undefined> {
    const [session] = await db
      .select()
      .from(escrowSessions)
      .where(eq(escrowSessions.loanId, loanId));
    return session || undefined;
  }

  async updateEscrowSession(sessionId: string, updates: Partial<EscrowSession>): Promise<EscrowSession | undefined> {
    const [session] = await db
      .update(escrowSessions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(escrowSessions.sessionId, sessionId))
      .returning();
    return session || undefined;
  }

  // Signature Exchange Operations
  async createSignatureExchange(signature: InsertSignatureExchange): Promise<SignatureExchange> {
    const [exchange] = await db
      .insert(signatureExchanges)
      .values(signature)
      .returning();
    return exchange;
  }

  async getSignatureExchanges(escrowSessionId: string): Promise<SignatureExchange[]> {
    return await db
      .select()
      .from(signatureExchanges)
      .where(eq(signatureExchanges.escrowSessionId, escrowSessionId));
  }

  // Escrow Event Operations
  async createEscrowEvent(event: InsertEscrowEvent): Promise<EscrowEvent> {
    const [escrowEvent] = await db
      .insert(escrowEvents)
      .values(event)
      .returning();
    return escrowEvent;
  }

  async getEscrowEvents(escrowSessionId: string): Promise<EscrowEvent[]> {
    return await db
      .select()
      .from(escrowEvents)
      .where(eq(escrowEvents.escrowSessionId, escrowSessionId));
  }

  // Pre-signed Transaction Operations (Firefish Ephemeral Key Model)
  async storePreSignedTransaction(tx: InsertPreSignedTransaction): Promise<PreSignedTransaction> {
    const [transaction] = await db
      .insert(preSignedTransactions)
      .values(tx)
      .returning();
    return transaction;
  }

  async getPreSignedTransactions(loanId: number, txType?: string): Promise<PreSignedTransaction[]> {
    if (txType) {
      const { and } = await import("drizzle-orm");
      return await db
        .select()
        .from(preSignedTransactions)
        .where(and(
          eq(preSignedTransactions.loanId, loanId),
          eq(preSignedTransactions.txType, txType)
        ));
    }
    return await db
      .select()
      .from(preSignedTransactions)
      .where(eq(preSignedTransactions.loanId, loanId));
  }

  async updateTransactionBroadcastStatus(
    id: number, 
    updates: {
      broadcastStatus: string;
      broadcastTxid?: string;
      broadcastedAt?: Date;
      confirmedAt?: Date;
    }
  ): Promise<PreSignedTransaction | undefined> {
    const [transaction] = await db
      .update(preSignedTransactions)
      .set(updates)
      .where(eq(preSignedTransactions.id, id))
      .returning();
    return transaction || undefined;
  }

  // Dispute Operations
  async createDispute(dispute: InsertDispute): Promise<Dispute> {
    const [newDispute] = await db.insert(disputes).values(dispute).returning();
    return newDispute;
  }

  async getDisputesByLoan(loanId: number): Promise<Dispute[]> {
    return await db.select().from(disputes).where(eq(disputes.loanId, loanId));
  }

  async updateDispute(id: number, updates: Partial<Dispute>): Promise<Dispute | undefined> {
    const [updated] = await db
      .update(disputes)
      .set(updates)
      .where(eq(disputes.id, id))
      .returning();
    return updated || undefined;
  }

  // Dispute Audit Log Operations
  async createDisputeAuditLog(log: InsertDisputeAuditLog): Promise<DisputeAuditLog> {
    const [auditLog] = await db
      .insert(disputeAuditLogs)
      .values(log)
      .returning();
    return auditLog;
  }

  async getDisputeAuditLogs(loanId: number): Promise<DisputeAuditLog[]> {
    return await db
      .select()
      .from(disputeAuditLogs)
      .where(eq(disputeAuditLogs.loanId, loanId));
  }

  // PSBT Template Operations (Security: canonical template storage)
  async storePsbtTemplate(template: InsertPsbtTemplate): Promise<PsbtTemplate> {
    const [stored] = await db.insert(psbtTemplates).values(template).returning();
    return stored;
  }

  async getPsbtTemplate(loanId: number, txType: string): Promise<PsbtTemplate | undefined> {
    const [template] = await db
      .select()
      .from(psbtTemplates)
      .where(
        eq(psbtTemplates.loanId, loanId)
      );
    
    // Filter by txType since we may need AND condition
    if (template && template.txType === txType) {
      return template;
    }
    
    // Try to find with exact txType
    const templates = await db
      .select()
      .from(psbtTemplates)
      .where(eq(psbtTemplates.loanId, loanId));
    
    return templates.find(t => t.txType === txType);
  }

  // Loan Document Operations
  async createLoanDocument(doc: InsertLoanDocument): Promise<LoanDocument> {
    const [created] = await db.insert(loanDocuments).values(doc).returning();
    return created;
  }

  async getLoanDocuments(loanId: number): Promise<LoanDocument[]> {
    return await db
      .select()
      .from(loanDocuments)
      .where(eq(loanDocuments.loanId, loanId));
  }

  async getLoanDocument(id: number): Promise<LoanDocument | undefined> {
    const [doc] = await db
      .select()
      .from(loanDocuments)
      .where(eq(loanDocuments.id, id));
    return doc;
  }
}

export const storage = new DatabaseStorage();
