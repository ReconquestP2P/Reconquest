# Reconquest - Bitcoin-Backed Lending Platform

## Overview
Reconquest is a full-stack web application for peer-to-peer Bitcoin-backed lending. It connects borrowers with lenders, enabling Bitcoin as collateral for stablecoin loans and providing lenders with competitive returns. The project aims to create a global marketplace for Bitcoin-backed loans within decentralized finance.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack Query
- **UI Framework**: Radix UI components with shadcn/ui
- **Styling**: Tailwind CSS
- **Build Tool**: Vite

### Backend
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ES modules)
- **API Design**: RESTful API (JSON)
- **Database**: PostgreSQL (Drizzle ORM)
- **Deployment**: Optimized for Replit, production build via Vite/ESBuild

### Data Storage
- **Primary Database**: PostgreSQL via Neon serverless
- **ORM**: Drizzle with Zod for schema validation
- **Migration**: Drizzle Kit

### Key Features
- **Bitcoin Price Integration**: Real-time BTC price data (USD/EUR) via CoinGecko API.
- **User & Loan Management**: CRUD operations for users, loans, and loan offers.
- **Financial Tools**: Loan calculator, interactive interest rate sliders.
- **Authentication**: Secure login/signup with JWT tokens, 7-day persistent sessions, password strength, email verification, and password reset.
- **Admin Dashboard**: User/loan management, email notification status, and user registration tracking.
- **Email System**: Comprehensive email notifications for users and admin.
- **UI/UX**: Responsive design, dedicated borrower/lender dashboards, "How it works" section, FAQs, About page, and consistent branding.
- **Gamification**: Blockchain-themed achievement badge system.
- **Bitcoin Multisig Escrow**: Automated 2-of-3 multisig Bitcoin testnet escrow address generation.
- **Ephemeral Key Model**: Maximum security Bitcoin key management where private keys are generated client-side, used to pre-sign recovery transactions, then immediately discarded from memory. Users NEVER see their private keys.
- **Deterministic Outcome Engine**: A pure function maps objective facts to one of the pre-signed transaction types (COOPERATIVE_CLOSE, DEFAULT, LIQUIDATION, CANCELLATION, RECOVERY, UNDER_REVIEW) for fair and transparent dispute resolution.

### Security Architecture - Firefish Model
- **PIN-Based Deterministic Key Derivation**: Users create a secret PIN that derives their Bitcoin key using PBKDF2 (100,000 iterations). The same PIN always regenerates the same key for a given loan/user/role combination.
- **Key Derivation Formula**: `PBKDF2(SHA256, PIN, salt="reconquest:{loanId}:{userId}:{role}:escrow-key-v1", iterations=100000, keyLen=32)`
- **Ephemeral Key Model**: Private keys are derived from PIN, used to sign transactions, then immediately wiped from memory. Keys are NEVER stored or displayed. Users download pre-signed recovery transaction files, not private keys.
- **Signing Library Compatibility**: `@noble/secp256k1` for key derivation and signing, `tiny-secp256k1` for Bitcoin transaction signing to ensure compatibility with Bitcoin Core.
- **Bitcoin Testnet Integration**: Real Bitcoin RPC support for multisig, pre-signed transaction building, and broadcasting to the testnet.

### Key Ceremony & Multisig Creation (3-Phase Firefish Model)

**Phase 1 - Key Ceremony (before deposit):**
- Lender creates passphrase → derives pubkey → registers funding commitment
- Borrower creates passphrase → derives pubkey → escrow created with 3 unique keys
- Private keys are NOT stored - only pubkeys registered
- Passphrase deterministically derives the same key via PBKDF2 (100k iterations)

**Phase 2 - Deposit:**
- Borrower deposits BTC to escrow address
- No signing happens yet (requires UTXO to exist first)

**Phase 3 - Signing Ceremony (after deposit):**
- Both parties re-enter their SAME passphrase
- `deriveKeyFromPin()` re-derives the SAME key (deterministic)
- Signs ALL PSBTs (recovery, cooperative_close, default)
- Private key wiped from memory immediately after signing
- Signed PSBTs stored on server + downloaded as recovery file

**Critical Security Properties:**
- **Mandatory Key Ceremony**: ALL 3 public keys (borrower, lender, platform) validated as UNIQUE
- **Uniqueness Validation**: `validateKeysAreUnique()` in BitcoinEscrowService prevents fund lockup
- **2-of-3 Spending**: Any 2 signatures (platform+lender OR platform+borrower) can spend funds
- **Deterministic Keys**: Same passphrase → same key → keys match escrow witness script
- **Key Never Stored**: Only re-derived when needed, wiped immediately after use

### Key Files for Firefish Implementation
- `client/src/lib/deterministic-key.ts`: PIN-based key derivation using PBKDF2
- `client/src/components/lender-funding-modal.tsx`: Lender PIN creation and key generation
- `client/src/components/deposit-instructions-card.tsx`: Borrower PIN creation and key generation
- `client/src/components/signing-ceremony-modal.tsx`: PIN-based transaction signing

### Loan Flow
The platform facilitates loan creation, lender commitment, borrower collateral deposit, and a dual key generation/transaction signing process where both parties generate ephemeral keys and download pre-signed recovery plans. The repayment flow involves cryptographic verification of both borrower and lender pre-signed transactions before broadcasting to the Bitcoin testnet.

### Dispute Resolution & Fair Split
- **2-of-3 Multisig Requirement**: Dispute resolution requires signatures from both platform AND lender (or borrower) to spend escrow funds.
- **Pending Resolution Flow**:
  1. Admin reviews dispute and selects decision (LENDER_WINS, BORROWER_WINS, TIMEOUT_DEFAULT)
  2. Platform creates and signs a PSBT with the fair split distribution
  3. PSBT is stored in loan record with `disputeStatus: 'pending_lender_signature'`
  4. Lender receives email notification with distribution breakdown
  5. Lender views pending resolution in dashboard "Resolutions" tab
  6. Lender downloads PSBT, signs with their wallet (e.g., Sparrow), and submits signed PSBT
  7. Platform combines signatures (2-of-3) and broadcasts to Bitcoin testnet
  8. Both parties receive email confirmation with transaction link
- **Fair Split Formula**: Based on Firefish distribution rules - lender receives debt (principal + interest) in BTC equivalent, borrower receives remainder minus network fees
- **Schema fields for pending resolutions**: `pendingResolutionPsbt`, `pendingResolutionDecision`, `pendingResolutionLenderSats`, `pendingResolutionBorrowerSats`, `pendingResolutionBtcPrice`, `pendingResolutionCreatedAt`, `lenderSignatureHex`, `lenderSignedAt`

### LTV Monitoring & Collateral Top-Up
- **Automated LTV Monitoring**: Every 60 seconds, the system checks all active loans' LTV ratios using real-time EUR prices.
- **Two-Tier Warning System**: 
  - 75% LTV: Early warning email sent to borrower only
  - 85% LTV: Critical warning email sent to both borrower and lender
  - 95% LTV: Automatic liquidation triggered
- **Collateral Top-Up Flow**: Borrowers can add collateral to the same escrow address. After sending BTC, they confirm the amount via the dashboard modal. The BlockchainMonitor verifies the deposit requires REQUIRED_CONFIRMATIONS before updating collateralBtc.
- **Schema fields for top-ups**: pendingTopUpBtc, topUpRequestedAt, topUpConfirmedAt, topUpMonitoringActive, previousCollateralBtc

## External Dependencies

- **Database**: Neon (PostgreSQL)
- **API**: CoinGecko API (for Bitcoin price data)
- **Email Service**: Resend
- **Validation**: Zod
- **Development Environment**: Replit
- **Bitcoin Integration**: `tiny-secp256k1` (for ECDSA signing), `@noble/secp256k1` (for key generation and hashing).
- **Bitcoin RPC**: Bitcoin Core (for testnet interactions)