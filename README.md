# Reconquest - Bitcoin-Backed P2P Lending Platform

> A decentralized peer-to-peer lending marketplace where borrowers use Bitcoin as collateral to secure stablecoin/fiat loans, and lenders earn competitive returns.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.0+-61DAFB.svg)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20.0+-339933.svg)](https://nodejs.org/)

---

## 📋 Table of Contents

- [Vision](#-vision)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Architecture Overview](#-architecture-overview)
- [Bitcoin Escrow System](#-bitcoin-escrow-system)
- [Database Schema](#-database-schema)
- [Setup & Installation](#-setup--installation)
- [Loan Workflow](#-loan-workflow)
- [API Documentation](#-api-documentation)
- [Security Model](#-security-model)
- [File Structure](#-file-structure)
- [Testing](#-testing)
- [Deployment](#-deployment)
- [Contributing](#-contributing)

---

## 🎯 Vision

Reconquest aims to establish a **global marketplace for Bitcoin-backed loans**, contributing to the future of decentralized finance by:

- **Empowering borrowers** to unlock liquidity from Bitcoin holdings without selling
- **Enabling lenders** to earn yields by funding Bitcoin-collateralized loans
- **Ensuring security** through 2-of-3 multisig Bitcoin escrow addresses
- **Maintaining transparency** with blockchain-verifiable collateral deposits

---

## ✨ Key Features

### For Borrowers
- 💰 **Bitcoin-Backed Loans** - Use BTC as collateral for EUR/USDC loans
- 🔐 **2-of-3 Multisig Escrow** - Secure Bitcoin deposits on testnet
- 📊 **Loan Calculator** - Interactive tool with real-time BTC price feeds
- 🏦 **Bank Integration** - Direct fiat transfer coordination with lenders
- 📧 **Email Notifications** - Automated updates at every workflow step

### For Lenders
- 📈 **Competitive Yields** - Earn 0-25% APY on Bitcoin-secured loans
- 🔍 **Loan Marketplace** - Browse available loan requests with filters
- ✅ **Verified Collateral** - Admin-verified Bitcoin deposits via blockchain
- 💳 **Fiat Transfers** - Secure bank account details for fund transfers
- 🏆 **Achievement System** - Blockchain-themed gamification badges

### For Administrators
- 🛡️ **BTC Verification Dashboard** - Confirm Bitcoin deposits on blockchain
- 📊 **User Management** - Monitor registrations, loans, and email status
- 🔗 **Blockchain Links** - Direct verification via Blockstream testnet explorer
- 📨 **Email Coordination** - Trigger notifications to borrowers and lenders

### Technical Highlights
- ⚡ **Real-Time Bitcoin Pricing** - CoinGecko API integration (USD/EUR)
- 🔑 **Client-Side Cryptography** - Private keys never touch the backend
- 🔄 **Persistent Sessions** - 7-day JWT authentication with auto-verification
- 📱 **Responsive Design** - Mobile-friendly UI with dark mode support
- 🎨 **Professional UI** - shadcn/ui + Tailwind CSS components

---

## 🛠️ Tech Stack

### Frontend
- **Framework:** React 18 with TypeScript
- **Routing:** Wouter (lightweight React router)
- **State Management:** TanStack Query (React Query v5)
- **UI Library:** Radix UI + shadcn/ui components
- **Styling:** Tailwind CSS with custom theming
- **Build Tool:** Vite
- **Icons:** Lucide React + React Icons

### Backend
- **Runtime:** Node.js with Express
- **Language:** TypeScript (ES Modules)
- **Database:** PostgreSQL (Neon serverless)
- **ORM:** Drizzle ORM with Drizzle Kit migrations
- **Validation:** Zod schemas
- **Authentication:** JWT tokens (7-day expiration)

### Bitcoin Integration
- **Escrow Generation:** Python bitcoinlib (2-of-3 multisig P2WSH)
- **Blockchain Monitoring:** Blockstream API (testnet)
- **Address Type:** Native SegWit (P2WSH) - `tb1q...` (62 chars)
- **Network:** Bitcoin Testnet (migrating to mainnet)

### External Services
- **Email:** Resend API (transactional emails)
- **Price Oracle:** CoinGecko API (BTC/USD, BTC/EUR)
- **Deployment:** Replit (production-ready builds)

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Borrower   │  │   Lender    │  │   Admin Dashboard   │ │
│  │  Dashboard  │  │  Dashboard  │  │  (BTC Verification) │ │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘ │
│         │                 │                    │             │
│         └─────────────────┴────────────────────┘             │
│                           │                                  │
│                  TanStack Query (API Layer)                  │
└───────────────────────────┼──────────────────────────────────┘
                            │
                            │ REST API (JSON)
                            │
┌───────────────────────────▼──────────────────────────────────┐
│                   BACKEND (Node.js + Express)                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Routes (server/routes.ts)                │   │
│  │  /api/auth, /api/loans, /api/users, /api/escrow      │   │
│  └─────────────────────────┬────────────────────────────┘   │
│                            │                                 │
│  ┌─────────────────────────▼──────────────────────────────┐ │
│  │            Business Logic Services                      │ │
│  │  • LendingWorkflowService (loan matching & escrow)     │ │
│  │  • BitcoinEscrowService (multisig address generation)  │ │
│  │  • EmailVerificationService (user activation)          │ │
│  │  • BlockchainMonitoring (UTXO tracking)                │ │
│  └─────────────────────────┬──────────────────────────────┘ │
│                            │                                 │
│  ┌─────────────────────────▼──────────────────────────────┐ │
│  │         Storage Layer (Drizzle ORM)                     │ │
│  └─────────────────────────┬──────────────────────────────┘ │
└────────────────────────────┼────────────────────────────────┘
                             │
                             │
┌────────────────────────────▼────────────────────────────────┐
│                PostgreSQL Database (Neon)                    │
│  Tables: users, loans, loan_offers, escrow_sessions,        │
│          user_achievements, signature_exchanges              │
└──────────────────────────────────────────────────────────────┘
                             │
                             │
┌────────────────────────────▼────────────────────────────────┐
│              EXTERNAL SERVICES & INTEGRATIONS                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Bitcoin    │  │   CoinGecko  │  │  Resend Email    │  │
│  │   Testnet    │  │  Price API   │  │     Service      │  │
│  │ (Blockstream)│  │              │  │                  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## 🔐 Bitcoin Escrow System

### Overview

Reconquest uses **2-of-3 multisig P2WSH (Pay-to-Witness-Script-Hash)** escrow addresses to secure Bitcoin collateral. This means:

- **3 parties hold keys:** Borrower, Lender, Platform
- **2 signatures required** to release funds (any combination)
- **Native SegWit** for lowest transaction fees (~45% cheaper than legacy)
- **Testnet deployment** with migration path to mainnet

### Address Generation Process

```python
# When a loan is matched, Python generates the escrow address
def create_multisig_escrow(borrower_pubkey, lender_pubkey, platform_pubkey):
    # 1. Validate all 3 public keys (compressed, 33 bytes each)
    # 2. Sort keys lexicographically for deterministic addresses
    # 3. Create witness script: OP_2 <pubkey1> <pubkey2> <pubkey3> OP_3 OP_CHECKMULTISIG
    # 4. Hash script with SHA-256 (not RIPEMD160)
    # 5. Encode as Bech32 address with 'tb1' prefix (testnet)
    
    return {
        'address': 'tb1q...xyz',  # 62 characters
        'witness_script': '522102abc...53ae',  # Hex format
        'script_hash': 'abc123...',  # SHA-256 hash
        'public_keys': [...],  # All 3 pubkeys sorted
        'address_type': 'P2WSH'  # Native SegWit
    }
```

### Example Address

```
Address: tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3
Type: P2WSH (Native SegWit)
Network: Bitcoin Testnet
Participants: Borrower + Lender + Platform
Required Signatures: 2 of 3
```

### Key Management

| Component | Storage Location | Security Level |
|-----------|------------------|----------------|
| **Private Keys** | Browser memory only (WASM) | ✅ Excellent (never sent to server) |
| **Public Keys** | PostgreSQL database | ✅ Safe (public data) |
| **Witness Script** | Database (`escrowWitnessScript`) | ✅ Safe (needed for recovery) |
| **Escrow Address** | Database (`escrowAddress`) | ✅ Safe (public blockchain data) |

**Critical Security Feature:** The backend database contains **NO private keys**. All private key operations happen client-side via the Firefish WASM module (currently using mock implementation).

### Fund Recovery Process

If you need to recover Bitcoin from an escrow address:

```javascript
// 1. Retrieve from database
const loan = await db.loans.findById(loanId);
const witnessScript = loan.escrowWitnessScript;
const pubkeys = [loan.borrowerPubkey, loan.lenderPubkey, loan.platformPubkey];

// 2. Reconstruct multisig address (verify it matches)
const p2wsh = bitcoin.payments.p2wsh({
  redeem: { output: Buffer.from(witnessScript, 'hex') },
  network: bitcoin.networks.testnet
});

// 3. Build recovery transaction
const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet });
psbt.addInput({
  hash: loan.fundingTxid,
  index: loan.fundingVout,
  witnessUtxo: {
    script: p2wsh.output,
    value: loan.fundedAmountSats
  },
  witnessScript: Buffer.from(witnessScript, 'hex')
});
psbt.addOutput({
  address: recoveryAddress,
  value: loan.fundedAmountSats - 5000 // minus fee
});

// 4. Sign with 2 private keys (e.g., borrower + platform)
psbt.signInput(0, borrowerPrivateKey);
psbt.signInput(0, platformPrivateKey);

// 5. Finalize and broadcast
psbt.finalizeAllInputs();
const tx = psbt.extractTransaction();
await broadcastTransaction(tx.toHex());
```

---

## 🗄️ Database Schema

### Core Tables

#### `users`
```sql
- id (serial, PK)
- username (text, unique)
- email (text, unique)
- password (text, hashed)
- role (text, default: 'user')
- reputation (integer)
- emailVerified (boolean)
- bankAccountHolder (text) -- For fiat transfers
- bankAccountNumber (text)
- bankName (text)
- bankRoutingNumber (text)
- bankCountry (text)
- createdAt (timestamp)
```

#### `loans`
```sql
- id (serial, PK)
- borrowerId (integer, FK → users.id)
- lenderId (integer, FK → users.id)
- amount (decimal) -- Loan amount in EUR/USDC
- currency (text, default: 'USDC')
- interestRate (decimal) -- 0-25% APY
- termMonths (integer) -- 3, 6, 9, 12, 18 months
- collateralBtc (decimal) -- Required Bitcoin collateral (2:1 ratio)
- status (text) -- 'posted' → 'funding' → 'active' → 'completed'
- escrowAddress (text) -- P2WSH Bitcoin address (tb1q...)
- escrowWitnessScript (text) -- Hex-encoded multisig script
- borrowerPubkey (text) -- 66 hex chars
- lenderPubkey (text)
- platformPubkey (text)
- fundingTxid (text) -- Bitcoin transaction hash
- fundingVout (integer) -- Output index
- btcDepositNotifiedAt (timestamp) -- When borrower clicked "I've Sent BTC"
- fiatTransferConfirmed (boolean) -- Lender confirmed bank transfer
- requestedAt (timestamp)
- fundedAt (timestamp)
- dueDate (timestamp)
```

#### `loan_offers`
```sql
- id (serial, PK)
- loanId (integer, FK → loans.id)
- lenderId (integer, FK → users.id)
- amount (decimal)
- interestRate (decimal)
- status (text) -- 'pending', 'accepted', 'rejected'
- createdAt (timestamp)
```

#### `escrow_sessions`
```sql
- id (serial, PK)
- sessionId (text, unique) -- UUID from frontend
- loanId (integer, FK → loans.id)
- escrowAddress (text)
- witnessScript (text)
- scriptHash (text)
- borrowerPubkey (text)
- lenderPubkey (text)
- platformPubkey (text)
- wasmState (text) -- Serialized state from Firefish WASM
- currentState (text) -- Workflow state
- fundingTxid (text)
- createdAt (timestamp)
```

#### `user_achievements`
```sql
- id (serial, PK)
- userId (integer, FK → users.id)
- achievementId (text) -- 'first_loan', 'whale_hunter', etc.
- unlockedAt (timestamp)
- progress (integer)
- blockchainTxHash (text)
```

---

## 🚀 Setup & Installation

### Prerequisites

- Node.js 20.0+ and npm
- PostgreSQL database (or Neon serverless)
- Python 3.10+ (for Bitcoin escrow generation)
- Resend API key (for emails)

### Environment Variables

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/reconquest

# Email Service
RESEND_API_KEY=re_your_api_key_here

# JWT Secret (generate with: openssl rand -base64 32)
JWT_SECRET=your_secret_key_here

# Environment
NODE_ENV=development
```

### Installation Steps

```bash
# 1. Clone the repository
git clone https://github.com/yourorg/reconquest.git
cd reconquest

# 2. Install Node.js dependencies
npm install

# 3. Install Python dependencies (for Bitcoin escrow)
pip install bitcoinlib

# 4. Set up database schema
npm run db:push

# 5. (Optional) Seed database with test data
npm run db:seed

# 6. Start development server
npm run dev
```

The application will be available at `http://localhost:5000`.

### Database Setup

```bash
# Push schema changes to database
npm run db:push

# Generate new migration (if needed)
npm run db:generate

# View database in Drizzle Studio
npm run db:studio
```

---

## 📊 Loan Workflow

### Complete Loan Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: Borrower Creates Loan Request                      │
│  - Sets amount (EUR/USDC), term, interest rate              │
│  - Calculator shows required BTC collateral (2:1 ratio)     │
│  - Status: "posted"                                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 2: Lender Browses & Funds Loan                        │
│  - Lender views available loans in marketplace              │
│  - Clicks "Fund Loan" button                                │
│  - System prevents self-funding (borrower ≠ lender)         │
│  - Status: "posted" → "funding"                              │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 3: Multisig Escrow Address Generated                  │
│  - Python script creates 2-of-3 P2WSH address               │
│  - Public keys stored in database                           │
│  - Borrower receives email with escrow address              │
│  - Example: tb1q...xyz (62 chars, testnet)                  │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 4: Borrower Deposits Bitcoin Collateral               │
│  - Borrower sends BTC to escrow address                     │
│  - Borrower clicks "I've Sent BTC" button                   │
│  - Email sent to admin@reconquestp2p.com                    │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 5: Admin Verifies Bitcoin Deposit                     │
│  - Admin checks "Pending Escrow" tab in dashboard           │
│  - Clicks blockchain verification link (Blockstream)        │
│  - Confirms BTC deposit on-chain                            │
│  - Clicks "Confirm BTC Deposit" button                      │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 6: Lender Notified to Send Fiat                       │
│  - Lender receives email with:                              │
│    • BTC deposit confirmation                               │
│    • Borrower's bank account details                        │
│    • Loan terms and amount                                  │
│  - Lender sees "Pending Transfers" tab in dashboard         │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 7: Lender Transfers Fiat to Borrower                  │
│  - Lender sends EUR/USDC to borrower's bank account         │
│  - Lender clicks "I've Sent the Funds" button               │
│  - Status: "funding" → "active"                              │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 8: Loan Active (Repayment Period)                     │
│  - Borrower has X months to repay (principal + interest)    │
│  - Bitcoin collateral remains locked in escrow              │
│  - Status: "active"                                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 9: Loan Completion (Success or Default)               │
│  - SUCCESS: Borrower repays → BTC released to borrower      │
│  - DEFAULT: Borrower fails → BTC released to lender         │
│  - Requires 2-of-3 multisig signatures                      │
│  - Status: "active" → "completed" or "defaulted"            │
└─────────────────────────────────────────────────────────────┘
```

### Status Progression

```
posted → funding → active → completed/defaulted
  ↓         ↓         ↓           ↓
Created   Matched   Funds    Loan ends
  by      with      active
borrower  lender
```

---

## 🔌 API Documentation

### Authentication Endpoints

#### `POST /api/auth/signup`
Create a new user account.

**Request:**
```json
{
  "username": "alice",
  "email": "alice@example.com",
  "password": "SecurePass123!"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "alice",
    "email": "alice@example.com",
    "role": "user"
  }
}
```

#### `POST /api/auth/login`
Authenticate and receive JWT token.

**Request:**
```json
{
  "email": "alice@example.com",
  "password": "SecurePass123!"
}
```

#### `GET /api/auth/me`
Verify current session (requires JWT).

**Headers:**
```
Authorization: Bearer <token>
```

### Loan Endpoints

#### `GET /api/loans`
Fetch all loans (supports filtering).

**Query Parameters:**
- `status` - Filter by status (posted, funding, active)
- `borrowerId` - Filter by borrower
- `lenderId` - Filter by lender

**Response:**
```json
[
  {
    "id": 5,
    "borrowerId": 1,
    "lenderId": 2,
    "amount": "25000.00",
    "currency": "EUR",
    "interestRate": "6.00",
    "termMonths": 6,
    "collateralBtc": "0.58823529",
    "status": "funding",
    "escrowAddress": "tb1q...xyz",
    "requestedAt": "2025-11-01T10:00:00Z"
  }
]
```

#### `POST /api/loans`
Create a new loan request (requires authentication).

**Request:**
```json
{
  "amount": "25000",
  "currency": "EUR",
  "termMonths": 6,
  "interestRate": "6"
}
```

#### `POST /api/loans/:id/fund`
Fund a loan as a lender (requires authentication).

**Request:**
```json
{
  "lenderId": 2
}
```

#### `PATCH /api/loans/:id/confirm-btc`
Borrower confirms BTC deposit sent (triggers admin email).

#### `PATCH /api/loans/:id/verify-btc`
Admin verifies BTC deposit on blockchain (triggers lender email).

#### `PATCH /api/loans/:id/confirm-fiat`
Lender confirms fiat transfer sent (activates loan).

### User Endpoints

#### `GET /api/users/:id/loans`
Get all loans for a specific user.

#### `GET /api/users/:id/loans/enriched`
Get loans with enriched borrower bank account details.

**Response:**
```json
[
  {
    "id": 5,
    "amount": "25000.00",
    "borrower": {
      "username": "alice",
      "email": "alice@example.com",
      "bankAccountHolder": "Alice Smith",
      "bankAccountNumber": "DE89370400440532013000",
      "bankName": "Deutsche Bank",
      "bankCountry": "Germany"
    }
  }
]
```

### Bitcoin Endpoints

#### `GET /api/btc-price`
Fetch current Bitcoin price in USD and EUR.

**Response:**
```json
{
  "usd": 95000,
  "eur": 85000
}
```

#### `GET /api/escrow/funding/:address`
Check funding status of Bitcoin address.

**Response:**
```json
{
  "funded": true,
  "txid": "abc123...",
  "vout": 0,
  "amountSats": 200000,
  "confirmations": 3
}
```

---

## 🔒 Security Model

### Authentication
- **JWT Tokens:** 7-day expiration, stored in `localStorage`
- **Password Hashing:** bcrypt with salt rounds (10)
- **Session Persistence:** Auto-verification on app startup via `/api/auth/me`

### Bitcoin Security
- **Private Keys:** Never stored on backend (client-side WASM only)
- **Multisig Escrow:** 2-of-3 signatures required (borrower + lender + platform)
- **Public Keys:** Safe to store in database (used for address generation)
- **Witness Script:** Stored for transaction recovery

### Data Separation (Client vs Server)

| Data Type | Client | Server | Notes |
|-----------|--------|--------|-------|
| Private keys | ✅ | ❌ | Browser memory only |
| Public keys | ✅ | ✅ | Safe to store |
| Witness script | ✅ | ✅ | Needed for recovery |
| Escrow address | ✅ | ✅ | Public blockchain data |
| WASM state | ✅ | ✅ | Encrypted, no sensitive data |

### Email Security
- **Rate Limiting:** Smart delays to prevent API abuse
- **Admin Notifications:** Sent to `admin@reconquestp2p.com` only
- **No Sensitive Data:** Emails never contain private keys or passwords

### Self-Funding Prevention
- **Frontend Filter:** Excludes own loans from available loans list
- **Backend Validation:** Rejects if `lenderId === borrowerId`
- **Error Message:** "You cannot fund your own loan"

---

## 📁 File Structure

```
reconquest/
├── client/                      # Frontend (React + TypeScript)
│   ├── src/
│   │   ├── components/          # Reusable UI components
│   │   │   ├── ui/              # shadcn/ui components
│   │   │   ├── loan-calculator.tsx
│   │   │   ├── loan-card.tsx
│   │   │   ├── achievements-dashboard.tsx
│   │   │   └── ...
│   │   ├── pages/               # Route pages
│   │   │   ├── home.tsx
│   │   │   ├── login.tsx
│   │   │   ├── signup.tsx
│   │   │   ├── borrower-dashboard.tsx
│   │   │   ├── lender-dashboard.tsx
│   │   │   └── admin-dashboard.tsx
│   │   ├── hooks/               # Custom React hooks
│   │   │   ├── useAuth.tsx
│   │   │   └── use-firefish-wasm.ts
│   │   ├── lib/                 # Utilities
│   │   │   ├── firefish-wasm-mock.ts  # WASM simulation
│   │   │   ├── queryClient.ts
│   │   │   └── utils.ts
│   │   ├── App.tsx              # Main app component
│   │   └── main.tsx             # Entry point
│   └── index.html
│
├── server/                      # Backend (Node.js + Express)
│   ├── services/                # Business logic
│   │   ├── LendingWorkflowService.ts   # Loan matching
│   │   ├── BitcoinEscrowService.ts     # Multisig generation
│   │   ├── EmailVerificationService.ts
│   │   ├── BlockchainMonitoring.ts
│   │   └── ...
│   ├── __tests__/               # Jest tests
│   ├── routes.ts                # API endpoint definitions
│   ├── storage.ts               # Database abstraction layer
│   ├── db.ts                    # Drizzle database connection
│   ├── email.ts                 # Resend email service
│   └── index.ts                 # Server entry point
│
├── shared/                      # Shared types & schemas
│   └── schema.ts                # Drizzle ORM schema + Zod validation
│
├── docs/                        # Documentation
│   ├── WASM_ESCROW_IMPLEMENTATION.md
│   └── FIREFISH_WASM_FRONTEND_GUIDE.md
│
├── bitcoin_escrow.py            # Python Bitcoin escrow generator
├── replit.md                    # Project memory & changelog
├── package.json                 # Node.js dependencies
├── tsconfig.json                # TypeScript config
├── vite.config.ts               # Vite bundler config
├── tailwind.config.ts           # Tailwind CSS config
└── README.md                    # This file
```

---

## 🧪 Testing

### Run Tests

```bash
# Run all Jest tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage
```

### Test Coverage

The project includes unit tests for:
- ✅ `BitcoinEscrowService` - Multisig address generation
- ✅ `LendingWorkflowService` - Loan matching logic
- ✅ `LtvValidationService` - Loan-to-value ratio checks

### Manual Testing Workflows

#### Test Loan Creation & Matching

```javascript
// 1. Create test users
const borrower = await signup({ username: 'bob', email: 'bob@test.com', password: 'Test123!' });
const lender = await signup({ username: 'carol', email: 'carol@test.com', password: 'Test123!' });

// 2. Create loan request
const loan = await createLoan({
  amount: '10000',
  currency: 'EUR',
  termMonths: 6,
  interestRate: '8'
});

// 3. Fund loan (as lender)
await fundLoan(loan.id, lender.id);

// 4. Check escrow address generated
const updatedLoan = await getLoan(loan.id);
console.log('Escrow Address:', updatedLoan.escrowAddress); // tb1q...
```

---

## 🚀 Deployment

### Replit Deployment (Current)

The project is optimized for Replit deployment:

1. **Automatic Workflows:** `npm run dev` starts both frontend and backend
2. **Environment Secrets:** Configure `DATABASE_URL`, `RESEND_API_KEY` via Replit Secrets
3. **Database:** Uses Neon PostgreSQL (serverless, auto-scaling)
4. **Port Binding:** Frontend serves on `0.0.0.0:5000`

### Production Checklist

Before going live:

- [ ] Replace Bitcoin testnet with mainnet
- [ ] Update Blockstream links to mainnet explorer (or mempool.space)
- [ ] Replace Firefish WASM mock with real `@firefish/wasm` package
- [ ] Set up production PostgreSQL database
- [ ] Configure production email sending limits
- [ ] Add rate limiting middleware
- [ ] Enable HTTPS/TLS
- [ ] Set `NODE_ENV=production`
- [ ] Configure CORS for production domains
- [ ] Implement comprehensive error logging (e.g., Sentry)

### Environment Variables (Production)

```env
NODE_ENV=production
DATABASE_URL=postgresql://...  # Production database
RESEND_API_KEY=re_...          # Production API key
JWT_SECRET=...                 # Strong secret (64+ chars)
ADMIN_EMAIL=admin@reconquestp2p.com
FRONTEND_URL=https://reconquest.app
```

---

## 🤝 Contributing

We welcome contributions! Please follow these guidelines:

1. **Fork the repository**
2. **Create a feature branch:** `git checkout -b feature/amazing-feature`
3. **Commit your changes:** `git commit -m 'Add amazing feature'`
4. **Push to the branch:** `git push origin feature/amazing-feature`
5. **Open a Pull Request**

### Code Style

- Follow TypeScript best practices
- Use Prettier for code formatting
- Write descriptive commit messages
- Add JSDoc comments for functions
- Include tests for new features

---

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 📧 Contact

- **Project Maintainer:** Reconquest Team
- **Admin Email:** admin@reconquestp2p.com
- **Documentation:** See `/docs` directory
- **Issues:** GitHub Issues (coming soon)

---

## 🙏 Acknowledgments

- **Bitcoin Core:** For the Bitcoin protocol
- **bitcoinlib:** Python library for Bitcoin operations
- **Blockstream:** Testnet block explorer
- **CoinGecko:** Bitcoin price API
- **Resend:** Email service
- **Neon:** Serverless PostgreSQL
- **shadcn/ui:** Beautiful UI components
- **Replit:** Deployment platform

---

## 🔮 Roadmap

### Phase 1: Testnet MVP (Current)
- ✅ Loan marketplace with Bitcoin escrow
- ✅ Email notifications
- ✅ Admin BTC verification workflow
- ✅ Achievement system

### Phase 2: Production Release
- [ ] Switch to Bitcoin mainnet
- [ ] Real Firefish WASM integration
- [ ] Multi-currency support (USDT, DAI)
- [ ] Mobile app (React Native)

### Phase 3: Advanced Features
- [ ] Automated liquidation on price drops
- [ ] Lightning Network integration
- [ ] Decentralized reputation system
- [ ] Governance token

---

**Built with ❤️ for the Bitcoin community**
