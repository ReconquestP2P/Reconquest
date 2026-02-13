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
- **Admin Authentication**: Secure admin login requires email-based OTP verification. Only admin@reconquestp2p.com can access admin features - a 6-digit code is sent to the admin email on each login attempt.
- **Admin Dashboard**: User/loan management, email notification status, and user registration tracking.
- **Email System**: Comprehensive email notifications for users and admin.
- **UI/UX**: Responsive design, dedicated borrower/lender dashboards, "How it works" section, FAQs, About page, and consistent branding.
- **Gamification**: Blockchain-themed achievement badge system.
- **Bitcoin Multisig Escrow**: Automated 3-of-3 multisig Bitcoin testnet escrow address generation.
- **Bitcoin-Blind Lender Design**: Lenders NEVER handle Bitcoin keys - platform operates their escrow position.
- **Deterministic Outcome Engine**: A pure function maps objective facts to one of the pre-signed transaction types for fair and transparent dispute resolution.
- **Automatic Collateral Release**: When loans are repaid, collateral is automatically released to borrowers using pre-signed PSBTs with platform co-signing.

### Security Architecture - Bitcoin-Blind Lender Model

**CRITICAL DESIGN PRINCIPLE**: Lenders are completely Bitcoin-blind. They only interact with fiat currency.

**3-of-3 Multisig Keys:**
1. **Borrower Key** (client-generated): User creates passphrase → PBKDF2 derives key
2. **Platform Key** (platform-controlled): Platform's own signing key
3. **Lender Key** (platform-operated): Platform generates and controls on behalf of lender

**Why Bitcoin-Blind Lenders?**
- Lenders only move fiat currency (EUR/USD bank transfers)
- Platform handles all Bitcoin complexity for them
- Eliminates lender key ceremony friction
- Platform signs with BOTH platform key AND lender key after fiat verification
- Not custodial - platform is already trusted escrow partner

**Borrower Key Derivation (unchanged):**
- `PBKDF2(SHA256, passphrase, salt="reconquest:{loanId}:{userId}:borrower:escrow-key-v1", iterations=100000, keyLen=32)`
- Ephemeral key model: derived, used to sign, immediately wiped

**Lender Key (platform-operated):**
- Generated server-side using `crypto.randomBytes(32)`
- Private key encrypted with AES-256-GCM before storage
- Stored in `lenderPrivateKeyEncrypted` column
- Platform decrypts and signs when lender confirms fiat transfers

### Key Ceremony Flow (Simplified Bitcoin-Blind Model)

**Phase 1 - Lender Commitment:**
- Lender reviews loan terms and confirms investment
- NO passphrase creation, NO key ceremony
- Platform generates lender key and stores encrypted private key
- Lender only commits to transfer fiat

**Phase 2 - Borrower Key Ceremony:**
- Borrower creates passphrase → derives pubkey
- Platform creates 3-of-3 escrow with: borrower pubkey + platform-generated lender pubkey + platform pubkey
- All 3 keys validated as unique to prevent fund lockup

**Phase 3 - Deposit:**
- Borrower deposits BTC to escrow address
- Platform monitors deposit confirmation

**Phase 4 - Borrower Signing Ceremony (after deposit confirmed):**
- Borrower re-enters passphrase to re-derive key
- Signs 3 pre-defined PSBTs: REPAYMENT, DEFAULT_LIQUIDATION, BORROWER_RECOVERY
- Private key wiped from memory
- Security validations: PSBT witness script must match escrow, borrower signature verified
- API endpoint: POST /api/loans/:id/sign-templates

**Phase 5 - Loan Activation:**
- Lender transfers fiat to borrower (off-chain)
- Lender confirms transfer in dashboard
- Platform activates loan

**Spending Flow:**
- Cooperative Close: Borrower signs + Platform signs (with platform + lender keys) = 3 signatures
- Default: Platform signs (with both keys) after lender confirms non-payment
- Recovery: Borrower can recover after timelock if platform disappears

### Key Files for Implementation
- `server/services/BitcoinEscrowService.ts`: 3-of-3 multisig creation, lender key generation
- `server/services/EncryptionService.ts`: AES-256-GCM encryption for lender private keys
- `server/services/AutoCollateralReleaseService.ts`: Automatic collateral release on loan repayment
- `server/services/CollateralReleaseService.ts`: PSBT co-signing and broadcast for collateral release
- `client/src/lib/deterministic-key.ts`: Borrower PBKDF2 key derivation
- `client/src/components/lender-funding-modal.tsx`: Simple lender commitment (no key ceremony)
- `client/src/components/deposit-instructions-card.tsx`: Borrower passphrase creation
- `client/src/components/signing-ceremony-modal.tsx`: Borrower-only transaction signing
- `client/src/components/collateral-release-status.tsx`: UI for collateral release status
- `bitcoin_escrow.py`: Python script for 3-of-3 P2WSH multisig address creation

### Schema Fields for Bitcoin-Blind Lender
- `lenderPubkey`: Platform-generated public key (lender never sees this)
- `lenderPrivateKeyEncrypted`: AES-256-GCM encrypted private key for platform signing
- `platformPubkey`: Platform's own public key
- `borrowerPubkey`: Borrower-generated public key
- `lenderDefaultPreference`: `'btc'` or `'eur'` - how lender wants to receive BTC in case of default/liquidation
- `lenderBtcAddress`: BTC address locked per-loan at funding time (not from profile, for security)

### Lender Default Repayment Preference
- When a lender funds a loan, they choose how to receive their share if the borrower defaults:
  - **EUR (default)**: BTC is sent to the platform address (`PLATFORM_BTC_ADDRESS` env var), platform sells on market and transfers EUR to lender's bank
  - **BTC**: BTC is sent directly to the lender's BTC address entered at funding time (locked per-loan for security)
- **Per-Loan Address Security**: The BTC address is entered fresh when funding each loan and permanently locked to that loan. Even if a lender's profile is compromised, existing loan addresses cannot be changed. Legacy fallback: if `loan.lenderBtcAddress` is null, falls back to `lender.btcAddress` from profile.
- This preference affects: fair split resolution, auto-liquidation, and default transaction execution
- The admin split preview shows which address will receive the lender's share and why
- `PLATFORM_BTC_ADDRESS` environment variable must be set for EUR preference to work

### Security Constraints

**No Platform-Only Spend Path:**
- Platform can ONLY sign predefined transaction templates
- No arbitrary transactions can be created after loan setup
- All spends must match one of three valid types: REPAYMENT, DEFAULT_LIQUIDATION, BORROWER_RECOVERY

**Predefined Transaction Templates:**
1. **REPAYMENT** - Happy path: borrower repays loan, collateral returned to borrower
2. **DEFAULT_LIQUIDATION** - Borrower defaults: lender receives owed amount, borrower gets remainder  
3. **BORROWER_RECOVERY** - Time-locked emergency recovery if platform fails

**Key Storage Security:**
- Lender private keys NEVER returned via API, logged, or exposed to browser
- Encryption isolated in `EncryptionService` for easy HSM/KMS swap
- `ResponseSanitizer` strips sensitive fields from all API responses

**Audit Logging:**
- Structured JSON logging for all signing operations
- Logs include: loan ID, escrow UTXO, transaction type, signing party, success/failure
- NEVER logs private keys or key material - only events and outcomes
- Admin endpoint: `GET /api/security/audit-logs/:loanId`

**Borrower Non-Custody Verification:**
- Borrower private keys and passphrases NEVER sent to backend
- Key derivation happens client-side only (PBKDF2 in browser)
- Server receives only: public keys and pre-signed PSBTs
- Verification endpoint: `GET /api/security/verify-borrower-non-custody`

**Key Files for Security:**
- `server/services/PsbtCreatorService.ts`: Creates real Bitcoin PSBTs, validates signatures and witness scripts
- `server/services/CollateralReleaseService.ts`: PSBT validation before platform co-signing
- `server/services/TransactionTemplateService.ts`: Enforces predefined transaction paths
- `server/services/EscrowSigningService.ts`: Constrained signing with audit logging
- `server/services/ResponseSanitizer.ts`: Strips sensitive data from API responses
- `server/services/EncryptionService.ts`: Isolated encryption for HSM migration

**Pre-Signed Transaction Security:**
- PSBTs only accepted after escrow deposit confirmed (verified fundingTxid)
- Witness script validation: PSBT input must match loan's escrow script
- Borrower signature required: Invalid/unsigned PSBTs are rejected
- Co-signing validation: CollateralReleaseService verifies borrower signature before adding platform signatures

### Dispute Resolution & Fair Split
- **3-of-3 Multisig Requirement**: All spending requires all 3 signatures (borrower + platform + lender key)
- **Platform Authority**: Platform controls lender key, so platform + borrower OR platform alone (with lender key) can spend
- **Fair Split Formula**: Based on Firefish distribution rules
- **Schema fields for pending resolutions**: `pendingResolutionPsbt`, `pendingResolutionDecision`, `pendingResolutionLenderSats`, `pendingResolutionBorrowerSats`, `pendingResolutionBtcPrice`, `pendingResolutionCreatedAt`

### LTV Monitoring & Collateral Top-Up
- **Automated LTV Monitoring**: Every 60 seconds, the system checks all active loans' LTV ratios using real-time EUR prices.
- **Two-Tier Warning System**: 
  - 75% LTV: Early warning email sent to borrower only
  - 85% LTV: Critical warning email sent to both borrower and lender
  - 95% LTV: Automatic liquidation triggered
- **Collateral Top-Up Flow**: Borrowers can add collateral to the same escrow address.
- **Schema fields for top-ups**: pendingTopUpBtc, topUpRequestedAt, topUpConfirmedAt, topUpMonitoringActive, previousCollateralBtc

### Automatic Liquidation (Bitcoin-Blind Lender Model)
- **Platform controls 2 of 3 keys**: platform key + platform-operated lender key
- **No borrower participation needed**: Liquidation happens automatically to protect lender
- **Signing flow**: Platform decrypts lender private key → signs with platform key → signs with lender key → broadcasts
- **Collateral released to lender's BTC address**: Stored in user record
- **Key file**: `server/services/CollateralReleaseService.ts` - `releaseCollateralToAddress()` function

### Admin Stress Testing
- **Endpoint**: `POST /api/admin/ltv/stress-test` - Simulates price drops for testing LTV triggers
- **Parameters**: `{ priceDropPercent: number }` or `{ clear: true }` to reset
- **Returns**: Real vs stressed prices, LTV results for all active loans
- **Purpose**: Test email notifications and liquidation triggers before production

## Documentation

- **Pre-Signed Transactions**: See `docs/PRE_SIGNED_TRANSACTIONS.md` for complete documentation of the pre-signed transaction system, including API endpoints, security architecture, and troubleshooting guide.

## External Dependencies

- **Database**: Neon (PostgreSQL)
- **API**: CoinGecko API (for Bitcoin price data)
- **Email Service**: Resend
- **Validation**: Zod
- **Development Environment**: Replit
- **Bitcoin Integration**: `tiny-secp256k1` (for ECDSA signing), `@noble/secp256k1` (for key generation and hashing)
- **Bitcoin RPC**: Bitcoin Core (for testnet4 interactions)
- **Encryption**: Node.js crypto (AES-256-GCM for lender private key storage)
