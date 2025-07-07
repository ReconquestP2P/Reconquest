# Reconquest - Bitcoin-Backed Lending Platform

## Overview

Reconquest is a full-stack web application that facilitates peer-to-peer Bitcoin-backed lending. The platform connects borrowers who need capital with lenders looking for yield opportunities. Borrowers can use their Bitcoin as collateral to secure loans in stablecoins, while lenders can earn competitive returns by funding these loans.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack Query (React Query) for server state
- **UI Framework**: Radix UI components with shadcn/ui styling system
- **Styling**: Tailwind CSS with custom design tokens
- **Build Tool**: Vite for development and production builds

### Backend Architecture
- **Runtime**: Node.js with Express server
- **Language**: TypeScript with ES modules
- **API Design**: RESTful API with JSON responses
- **Database**: PostgreSQL with Drizzle ORM
- **Database Connection**: Neon serverless PostgreSQL
- **Development Setup**: Hot reload with Vite middleware integration

### Data Storage Solutions
- **Primary Database**: PostgreSQL with persistent storage
- **ORM**: Drizzle with TypeScript-first schema definitions
- **Migration Strategy**: Drizzle Kit for schema migrations
- **Storage Implementation**: DatabaseStorage class with full CRUD operations
- **Schema Validation**: Zod integration with Drizzle for type-safe data validation
- **Connection**: Neon serverless PostgreSQL with WebSocket support

## Key Components

### Database Schema
The application uses three main entities:
1. **Users**: Stores user profiles with roles (borrower/lender), reputation scores, and completed loan history
2. **Loans**: Central entity tracking loan requests, terms, collateral, and status
3. **Loan Offers**: Enables multiple lenders to compete on loan terms

### API Endpoints
- **Bitcoin Price Oracle**: Real-time BTC price endpoint via CoinGecko API supporting USD/EUR currencies with 24h change data
- **User Management**: CRUD operations for user profiles
- **Loan Management**: Create requests, view available loans, manage loan lifecycle
- **Loan Offers**: Submit and manage competitive lending offers

### UI Components
- **Dashboard Views**: Separate interfaces for borrowers and lenders
- **Loan Calculator**: Real-time calculation of collateral requirements and terms
- **Form Components**: Type-safe forms using React Hook Form with Zod validation
- **Data Tables**: Responsive tables for loan and transaction history
- **Stats Cards**: Financial metrics and KPI displays

## Data Flow

1. **Loan Request Flow**: Borrower creates loan request → System calculates required Bitcoin collateral → Loan becomes available for lender offers
2. **Lending Flow**: Lender views available loans → Submits offer with terms → Borrower accepts offer → Loan becomes active
3. **Price Integration**: System fetches Bitcoin price data → Updates collateral calculations → Reflects in loan terms and LTV ratios

## External Dependencies

### Development Tools
- **Replit Integration**: Optimized for Replit development environment with runtime error overlay
- **Hot Reload**: Vite development server with Express middleware integration
- **Type Checking**: TypeScript compiler with strict mode enabled

### Production Dependencies
- **UI Libraries**: Comprehensive Radix UI component collection
- **Database**: Neon PostgreSQL with connection pooling
- **Validation**: Zod for runtime type validation
- **HTTP Client**: Native fetch with custom error handling

## Deployment Strategy

### Development Environment
- **Platform**: Replit with Node.js 20 runtime
- **Database**: PostgreSQL 16 module
- **Port Configuration**: Port 5000 mapped to external port 80
- **Build Process**: Parallel development server and build processes

### Production Build
- **Client Build**: Vite production build to `dist/public`
- **Server Build**: ESBuild bundling of Express server
- **Asset Serving**: Static file serving from build output
- **Environment**: NODE_ENV-based configuration switching

### Database Deployment
- **Migration Strategy**: Drizzle Kit push for schema updates
- **Connection**: Environment variable-based database URL configuration
- **Schema Location**: Centralized schema in `shared/schema.ts`

## Changelog
- June 26, 2025: Initial setup with BitLend name
- June 26, 2025: Changed application name from BitLend to BitConquer
- June 26, 2025: Added PostgreSQL database with persistent storage, replaced in-memory storage with DatabaseStorage class
- July 1, 2025: Updated branding from BitConquer to Reconquest with new logo, simplified navigation from "For Borrowers/Lenders" to "Borrow/Lend"
- July 7, 2025: Implemented real-time Bitcoin price oracle using CoinGecko API with USD/EUR support, replaced mock price data with live market data
- July 7, 2025: Implemented private admin dashboard with email-based authentication for admin.reconquest@protonmail.com, added automatic email notifications to admin when loans enter funding process

## Admin Access
- **Admin Email**: admin.reconquest@protonmail.com
- **Admin Password**: admin123
- **Dashboard Access**: /admin or /admin-dashboard routes with email + password authentication
- **Notifications**: Automatic email alerts when loans enter funding process
- **Security**: Two-factor authentication (email + password), hidden from main navigation

## User Preferences

Preferred communication style: Simple, everyday language.