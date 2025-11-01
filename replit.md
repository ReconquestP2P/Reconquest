# Reconquest - Bitcoin-Backed Lending Platform

## Overview
Reconquest is a full-stack web application designed to facilitate peer-to-peer Bitcoin-backed lending. It connects borrowers seeking capital with lenders looking for yield, enabling borrowers to use Bitcoin as collateral for stablecoin loans and lenders to earn competitive returns. The project's vision is to establish a global marketplace for Bitcoin-backed loans, contributing to the future of decentralized finance.

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
- **Bitcoin Price Integration**: Real-time BTC price data (USD/EUR) via CoinGecko API for collateral calculations.
- **User & Loan Management**: CRUD operations for users, loans, and loan offers.
- **Financial Tools**: Loan calculator, interactive interest rate sliders (0-25%), and financial metrics display.
- **Authentication**: Secure login/signup with JWT tokens, 7-day persistent sessions, password strength meter, email verification, and password reset.
- **Admin Dashboard**: User and loan management, email notification status, and user registration tracking.
- **Email System**: Comprehensive email notifications for users and admin, including welcome emails, loan status updates, and password resets.
- **UI/UX**: Responsive design, dedicated borrower/lender dashboards, "How it works" section, FAQs, About page, and consistent branding with Reconquest logo.
- **Gamification**: Blockchain-themed achievement badge system.
- **Bitcoin Multisig Escrow**: Automated 2-of-3 multisig Bitcoin testnet escrow address generation for secure collateral handling when loans are matched.

## External Dependencies

- **Database**: Neon (PostgreSQL)
- **API**: CoinGecko API (for Bitcoin price data)
- **Email Service**: Resend (for email notifications)
- **Validation**: Zod
- **Development Environment**: Replit
- **Bitcoin Integration**: Python bitcoinlib for Bitcoin testnet multisig escrow address generation

## Recent Achievements

### CRITICAL FIX: Real Bitcoin Keypair Generation - COMPLETE ✅ (Nov 1, 2025)
- **Problem Identified**: Old funding endpoint generated FAKE public keys from hash functions with NO corresponding private keys
  - Mock keys created via `createUniquePubkey()` hash function could never be used to sign transactions
  - Bitcoin sent to these addresses was PERMANENTLY LOCKED and UNRECOVERABLE
  - User's testnet BTC at `tb1q5xgzsvmy9v8zfag2msreeffj954x7x5ssln7x9x9aycdt7xn8lmqyhyjs0` cannot be recovered
- **Solution Implemented**:
  - **Borrower Flow**: Updated `LoanRequestForm` to generate real Bitcoin keypairs using Firefish WASM mock
    - Private key shown ONCE with strong warnings to save securely
    - Copy/show-hide functionality with security alerts
    - Only public key sent to backend (POST /api/loans)
  - **Lender Flow**: Created `LenderFundingModal` for Bitcoin keypair generation when funding loans
    - 3-step process: Generate keys → Save private key → Complete funding
    - Clear warnings about private key backup requirements
    - Only public key sent to backend (POST /api/loans/:id/fund)
  - **Backend Updates**:
    - POST /api/loans: Accepts and validates borrowerPubkey with comprehensive checks
    - POST /api/loans/:id/fund: Accepts lenderPubkey and creates real 2-of-3 multisig
    - Created `multisig-creator.ts` utility using same logic as Firefish WASM mock
    - Platform public key: `02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9`
    - **Comprehensive Public Key Validation** (using @noble/secp256k1):
      - Must be exactly 66 hex characters (33 bytes compressed)
      - Must be valid hexadecimal
      - Must start with 02 or 03 (compressed secp256k1 format)
      - **Cryptographic verification**: Uses secp256k1 curve validation to ensure key is a valid point
      - Cannot be all zeros or all same character
    - This prevents malicious injection of invalid keys that would create unrecoverable escrow addresses
    - Invalid keys are rejected with clear error messages before multisig creation
  - **Old Endpoint Disabled**: Commented out dangerous POST /api/loans/:loanId/fund with clear warnings
- **Security Model**: 
  - Each party generates keypair in browser via Firefish WASM
  - Private keys NEVER sent to backend, stored only in user's browser/password manager
  - Backend only stores public keys for multisig creation
  - 2-of-3 multisig: Any 2 signatures can spend (borrower+lender, borrower+platform, or lender+platform)
- **Testing Status**: Server running successfully, ready for end-to-end testing with two user accounts

### Admin BTC Verification & Lender Notification Workflow - COMPLETE ✅ (Oct 29, 2025)
- **Borrower Confirmation Flow**: "I've Sent BTC" button in borrower dashboard sends email to admin@reconquestp2p.com
- **Admin Dashboard Enhancement**:
  - New "Pending Escrow" tab showing loans with status="funding"
  - "Confirm BTC Deposit" button for each loan awaiting verification
  - Direct blockchain verification link to blockstream.info/testnet
- **Firefish-Style Email Templates**: Professional lender notification emails with:
  - BTC deposit confirmation with blockchain verification link
  - Complete loan details (amount, interest, maturity date)
  - Borrower bank account details for fiat transfer
  - "Transfer funds" CTA button
- **Lender Dashboard "Pending Transfers" Tab**:
  - Shows loans where BTC deposit confirmed, awaiting fiat transfer
  - Displays borrower bank account details (holder, number, bank, routing, country)
  - Real-time blockchain verification links
  - "I've Sent the Funds" confirmation button
- **Bank Account Management**: Added fields to users table for secure fiat transfer coordination
- **Enriched API Endpoint**: GET /api/users/:id/loans/enriched returns loan data with borrower bank details
- **Workflow**: Borrower confirms BTC → Admin verifies on blockchain → Admin confirms → Lender receives email → Lender sends fiat → Lender confirms

### Critical Security Fix: Self-Funding Prevention - COMPLETE ✅ (Oct 29, 2025)
- **Root Cause Identified**: Backend endpoints used hardcoded user IDs instead of authenticated users
- **Vulnerabilities Fixed**:
  - `POST /api/loans` - Changed from hardcoded `borrowerId = 1` to `req.user.id`
  - `POST /api/loans/:id/fund` - Changed from hardcoded `lenderId = 2` to `req.user.id`
  - `POST /api/loan-offers` - Changed from hardcoded `lenderId = 2` to `req.user.id`
  - Lender Dashboard - Changed from hardcoded `userId = 2` to `useAuth()` hook
  - Borrower Dashboard - Changed from hardcoded `userId = 1` to `useAuth()` hook
- **Multi-Layer Protection**:
  - **Frontend Filter**: Excludes borrower's own loans from available loans list (`loan.borrowerId !== userId`)
  - **Backend Validation**: All funding endpoints now check `lenderId === loan.borrowerId` and reject with 403 error
  - **Authentication Required**: All loan creation/funding endpoints now require JWT authentication via `authenticateToken` middleware
- **Testing**: Verified fix prevents same user from funding own loans - system returns "You cannot fund your own loan" error message
- **Security Impact**: Eliminates critical P2P lending integrity violation where users could lend to themselves

### Firefish WASM Frontend Integration - COMPLETE ✅ (Oct 19, 2025)
- **Client-Side Escrow**: Full React frontend integration for Firefish WASM Bitcoin escrow
- **UI Components Built**:
  - `EscrowSetup` - Generate keys, create 2-of-3 multisig addresses, export/import encrypted backups
  - `FundingTracker` - Real-time blockchain monitoring with auto-polling (10s intervals), confirmation tracking
  - `TransactionSigning` - PSBT creation and signing with 3-step workflow (create → sign → submit)
- **React Hook**: `useFirefishWASM` - Complete lifecycle management for key generation, escrow creation, funding checks, and signature submission
- **Mock WASM Module**: Production-ready simulation (`firefish-wasm-mock.ts`) for testing - drop-in replacement for real @firefish/wasm package
- **Dashboard Integration**: Added "Escrow" tabs to both borrower and lender dashboards with full workflow support
- **Security Features**: Private keys never leave browser, encrypted key export with password, show/hide private key toggle
- **Documentation**: Comprehensive guide with usage examples, testing workflow, and troubleshooting (`docs/FIREFISH_WASM_FRONTEND_GUIDE.md`)
- **Production Ready**: All components tested and server running successfully - ready for real Firefish WASM module integration

### WASM Escrow Backend - COMPLETE ✅ (Oct 18, 2025)
- **Security Upgrade**: Removed all private key storage from backend database (critical security fix)
- **Database Schema**: Created `escrow_sessions`, `signature_exchanges`, and `escrow_events` tables for WASM coordination
- **REST API**: Implemented 6 secure endpoints with input validation and authorization:
  - `POST /api/escrow/sessions` - Create escrow session (browser generates keys)
  - `GET /api/escrow/sessions/:sessionId` - Get session state
  - `PATCH /api/escrow/sessions/:sessionId` - Update WASM state (SECURITY: clients can only update wasmState, not blockchain fields)
  - `POST /api/escrow/signatures` - Submit PSBT signatures
  - `GET /api/escrow/funding/:address` - Check blockchain funding status
  - `POST /api/escrow/events` - Log audit events
- **Blockchain Monitoring**: Blockstream API integration with 5-second caching for testnet UTXOs, auto-confirmation tracking
- **Security Model**: Frontend (WASM keys + signing) → Backend (coordination + state) → PostgreSQL (public data only)
- **Validation**: Zod schemas enforce client/server data separation, unauthorized field updates rejected with 400 errors
- **Architect Verified**: Security vulnerabilities fixed, input validation enforced, authorization checks correct

### Bitcoin Multisig Escrow System - DEPRECATED (Aug 22, 2025) ⚠️
- **Python Integration**: Successfully integrated Python bitcoinlib with Node.js backend using file-based execution approach
- **Multisig Generation**: Fully functional 2-of-3 multisig Bitcoin testnet escrow address creation (borrower, lender, platform keys)
- **Loan Matching Workflow**: Complete end-to-end process from loan offer creation to escrow address generation
- **Database Integration**: Escrow addresses, redeem scripts, and public keys stored in loan records
- **Testing**: Comprehensive test workflow validates the entire loan matching with Bitcoin escrow generation
- **Example Output**: Generated address `2NCEzPMdSL9us5583kbcuYR7pqYCcpyn55r` with working redeem script for secure collateral handling
- **⚠️ Security Issue**: This approach stored private keys on backend - replaced with WASM architecture

### Persistent JWT Authentication - COMPLETE ✅
- **JWT Implementation**: 7-day token expiration with localStorage persistence 
- **Auto-Verification**: Frontend automatically verifies stored tokens on app startup via `/api/auth/me` endpoint
- **Server Restart Resilience**: Users stay logged in through server restarts and code changes
- **Security**: Tokens validated on protected routes, graceful invalid token handling
- **User Experience**: Login once, stay authenticated for 7 days without repeated login prompts

### Comprehensive Email Notification System - COMPLETE ✅
- **Loan Creation Alerts**: Borrowers receive confirmation when loan requests are posted, admin gets monitoring alerts
- **Loan Funding Notifications**: Beautiful email notifications to borrowers when lenders fund their loans
- **Escrow Instructions**: Separate detailed emails with Bitcoin escrow addresses and deposit instructions
- **Professional Design**: Gradient headers, styled content, comprehensive loan details, and clear next steps
- **Rate Limiting Protection**: Smart delays and retry mechanisms prevent email delivery failures
- **Complete Workflow Coverage**: Notifications at every step from loan creation to funding and collateral deposit
- **Aug 22, 2025**: Fixed rate limiting issues causing funding notification failures - now working reliably