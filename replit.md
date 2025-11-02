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
- **Financial Tools**: Loan calculator, interactive interest rate sliders, and financial metrics.
- **Authentication**: Secure login/signup with JWT tokens, 7-day persistent sessions, password strength, email verification, and password reset.
- **Admin Dashboard**: User/loan management, email notification status, and user registration tracking.
- **Email System**: Comprehensive email notifications for users and admin (welcome, loan updates, password resets).
- **UI/UX**: Responsive design, dedicated borrower/lender dashboards, "How it works" section, FAQs, About page, and consistent branding.
- **Gamification**: Blockchain-themed achievement badge system.
- **Bitcoin Multisig Escrow**: Automated 2-of-3 multisig Bitcoin testnet escrow address generation for secure collateral handling.
- **Firefish Ephemeral Key Model**: Maximum security Bitcoin key management where private keys are generated client-side, used to pre-sign recovery transactions, then immediately discarded from memory. Users NEVER see their private keys. Instead, they download pre-signed recovery transactions that can be broadcast if the platform disappears.

## External Dependencies

- **Database**: Neon (PostgreSQL)
- **API**: CoinGecko API (for Bitcoin price data)
- **Email Service**: Resend
- **Validation**: Zod
- **Development Environment**: Replit
- **Bitcoin Integration**: @noble/secp256k1 for cryptographic key generation and ECDSA signing.

## Security Architecture

### Firefish Ephemeral Key Model (November 2024)
**CRITICAL SECURITY REQUIREMENT**: Private keys must NEVER be stored or displayed to users.

**How It Works:**
1. **Key Generation**: When creating a loan or funding as a lender, Bitcoin keypair is generated client-side using @noble/secp256k1
2. **Transaction Pre-Signing**: Immediately after generation, the private key is used to sign:
   - Recovery transaction (borrower can broadcast if platform disappears)
   - Cooperative close transaction (normal loan repayment)
   - Default transaction (lender protection if borrower defaults)
3. **Key Disposal**: Private key is wiped from memory using `Uint8Array.fill(0)` in finally blocks
4. **User Download**: Pre-signed transactions downloaded as JSON file (NOT private keys)
5. **Recovery**: If platform disappears, user broadcasts pre-signed recovery transaction

**Key Files:**
- `client/src/lib/ephemeral-signer.ts`: Ephemeral key manager with memory wiping
- `client/src/lib/transactions/`: Transaction template builders (recovery, cooperative close, default)

**Security Properties:**
- Private keys exist for ~1 second during signing
- Keys never stored (not in localStorage, not in sessionStorage, not anywhere)
- Keys never displayed in UI (no modal, no input field, no console.log)
- Keys wiped from memory immediately after use
- Users download signed transactions, not keys
- If platform disappears, recovery transaction ensures fund recovery

## Repayment Flow (Cooperative Close Broadcast)

### How Loan Repayment Works (November 2024)
1. **Borrower confirms fiat payment**: Borrower transfers loan principal + interest to lender via bank transfer
2. **Borrower triggers repayment**: Clicks "Repay Loan" button in borrower dashboard
3. **Backend signature aggregation**: 
   - Platform retrieves borrower's pre-signed cooperative_close transaction (stored when loan created)
   - Platform retrieves lender's pre-signed cooperative_close transaction (stored when loan funded)
   - Platform generates its own signature (3rd party in 2-of-3 multisig)
4. **Transaction broadcast**: Combined transaction broadcast to Bitcoin testnet
5. **Collateral return**: Bitcoin collateral automatically sent back to borrower's address
6. **Loan completion**: Loan status updated to "completed"

### Key Components:
- **Backend**: `server/services/bitcoin-broadcast.ts` - Signature aggregation & broadcasting
- **Database**: `pre_signed_transactions` table - Stores all party signatures
- **API**: `POST /api/loans/:id/cooperative-close` - Triggers broadcast
- **Frontend**: `client/src/components/repayment-modal.tsx` - User interface
- **Storage**: Transactions auto-stored when ephemeral keys generated