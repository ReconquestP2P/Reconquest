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
- **Authentication**: Secure login/signup, password strength meter, email verification, and password reset.
- **Admin Dashboard**: User and loan management, email notification status, and user registration tracking.
- **Email System**: Comprehensive email notifications for users and admin, including welcome emails, loan status updates, and password resets.
- **UI/UX**: Responsive design, dedicated borrower/lender dashboards, "How it works" section, FAQs, About page, and consistent branding with Reconquest logo.
- **Gamification**: Blockchain-themed achievement badge system.

## External Dependencies

- **Database**: Neon (PostgreSQL)
- **API**: CoinGecko API (for Bitcoin price data)
- **Email Service**: Resend (for email notifications)
- **Validation**: Zod
- **Development Environment**: Replit