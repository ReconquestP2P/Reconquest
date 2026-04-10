# Reconquest - Bitcoin-Backed Lending Platform

## Overview
Reconquest is a full-stack web application designed for peer-to-peer Bitcoin-backed lending. It serves as a global marketplace within decentralized finance, connecting borrowers who use Bitcoin as collateral for stablecoin loans with lenders seeking competitive returns. The platform aims to streamline the lending process, offering financial tools, secure transactions, and a robust escrow system for Bitcoin collateral.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Design Principles
- **Bitcoin-Blind Lender Model**: Lenders interact solely with fiat currency; the platform manages all Bitcoin complexities and key ceremonies on their behalf, utilizing a 3-of-3 multisig escrow where the platform operates the lender's key.
- **Deterministic Outcome Engine**: Utilizes pure functions to map objective facts to pre-signed transaction types for transparent dispute resolution and automated collateral release.
- **No Dynamic Transaction Creation**: For security, all Bitcoin spending operations are restricted to a set of three pre-signed transaction templates (REPAYMENT, DEFAULT_LIQUIDATION, BORROWER_RECOVERY), preventing arbitrary transactions.
- **Client-Side Borrower Key Derivation**: Borrower private keys and passphrases never leave the client's browser, ensuring non-custodial handling of borrower funds.

### Frontend
- **Framework**: React 18 with TypeScript
- **UI**: Radix UI components, shadcn/ui, Tailwind CSS
- **State Management**: TanStack Query
- **Routing**: Wouter
- **Build Tool**: Vite

### Backend
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ES modules)
- **API**: RESTful JSON API
- **Database**: PostgreSQL (Drizzle ORM)
- **Deployment**: Optimized for Replit

### Key Features
- **User & Loan Management**: Comprehensive CRUD operations for users, loans, and offers.
- **Real-time Data**: Bitcoin price integration via CoinGecko API.
- **Secure Authentication**: JWT-based auth with email verification, password reset, and robust admin login with OTP.
- **Admin Dashboard**: Tools for user/loan management, email status, and registration tracking.
- **Email System**: Extensive email notifications for users and administrators.
- **UI/UX**: Responsive design with dedicated dashboards for borrowers and lenders, "How it works" section, FAQs, and consistent branding.
- **Gamification**: Blockchain-themed achievement badges.
- **Bitcoin Multisig Escrow**: Automated generation of 3-of-3 multisig Bitcoin testnet escrow addresses.
- **Automated Collateral Release**: Utilizes pre-signed PSBTs and platform co-signing for automatic collateral release upon loan repayment.
- **LTV Monitoring & Liquidation**: Real-time LTV monitoring with a two-tier warning system and automatic liquidation at 95% LTV. Borrowers can top-up collateral.
- **Lender Default Preference**: Lenders can specify whether to receive fiat (platform handles BTC sale) or BTC directly in case of loan default, with per-loan address locking for security.

### Branding
- **Logo**: Custom shield + wordmark with a sunrise gradient, available in dark and light mode variants, and optimized for email usage.

## External Dependencies

- **Database**: Neon (PostgreSQL)
- **API**: CoinGecko API
- **Email Service**: Resend
- **Validation**: Zod
- **Bitcoin Libraries**: `tiny-secp256k1`, `@noble/secp256k1`
- **Bitcoin RPC**: Bitcoin Core (for testnet interactions)
- **Encryption**: Node.js crypto (AES-256-GCM)