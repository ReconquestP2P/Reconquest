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

### Security Architecture
- **Ephemeral Key Model**: Private keys are generated client-side, used to pre-sign all necessary transactions (recovery, cooperative close, default), and then immediately wiped from memory. Keys are never stored or displayed. Users download pre-signed recovery transaction files, not private keys.
- **Signing Library Compatibility**: `tiny-secp256k1` is used for all Bitcoin transaction signing to ensure compatibility with Bitcoin Core.
- **Bitcoin Testnet Integration**: Real Bitcoin RPC support for multisig, pre-signed transaction building with ephemeral keys, and broadcasting to the testnet. Includes a graceful fallback to mock mode if RPC is unavailable.

### Loan Flow
The platform facilitates loan creation, lender commitment, borrower collateral deposit, and a dual key generation/transaction signing process where both parties generate ephemeral keys and download pre-signed recovery plans. The repayment flow involves cryptographic verification of both borrower and lender pre-signed transactions before broadcasting to the Bitcoin testnet.

## External Dependencies

- **Database**: Neon (PostgreSQL)
- **API**: CoinGecko API (for Bitcoin price data)
- **Email Service**: Resend
- **Validation**: Zod
- **Development Environment**: Replit
- **Bitcoin Integration**: `tiny-secp256k1` (for ECDSA signing), `@noble/secp256k1` (for key generation and hashing).
- **Bitcoin RPC**: Bitcoin Core (for testnet interactions)