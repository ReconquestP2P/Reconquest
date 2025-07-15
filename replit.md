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
- **Bitcoin Price API**: Real-time BTC price endpoint via CoinGecko API supporting USD/EUR currencies with 24h change data (displayed in navigation)
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
- July 7, 2025: Added comprehensive email notification system: alerts when new loans are posted and when users initiate loan funding (currently sent to jfestrada93@gmail.com due to Resend email verification requirements)
- July 7, 2025: Added 9-month loan term option to complement existing 3, 6, 12, 18 month terms
- July 7, 2025: Removed CHF currency option, platform now supports USDC and EUR only
- July 7, 2025: Fixed email notification templates to display correct collateral amounts and loan terms (termMonths instead of termDays), improved currency formatting
- July 7, 2025: Fixed Fund Loan button visibility issue - buttons now appear for all fundable loan statuses (posted, initiated, funding) instead of only posted loans
- July 8, 2025: Implemented currency-specific BTC price calculations - EUR loans now use BTC/EUR pricing (~€92,400) and USDC loans use BTC/USD pricing (~$108,500) for more accurate collateral requirements
- July 8, 2025: Fixed email notification currency display - all templates now show correct currency symbols (USDC/EUR) instead of hardcoded dollar signs
- July 8, 2025: Fixed loan calculator frontend to use currency-specific BTC prices - EUR 93,000 loan now correctly requires 2.0 BTC collateral (using €92,800 price) instead of 1.7 BTC (was using $108,900 USD price)
- July 8, 2025: Updated "How it works" section on homepage - restructured borrower workflow (offer terms first, wait for lender, then deposit collateral) and lender workflow (browse, pick loan, send funds)
- July 8, 2025: Expanded "How it works" to 4-step process for both borrowers and lenders, added "Receive Funds" step for borrowers and "Earn Yield" step for lenders
- July 8, 2025: Updated step titles and fixed circle sizing consistency - replaced dollar icon with cash emoji for lenders, ensured all numbered circles have identical dimensions
- July 8, 2025: Added comprehensive FAQs section after "How it works" with 8 essential questions covering general information and borrowing/lending specifics
- July 8, 2025: Enhanced FAQs with "Why Reconquest?" as first question emphasizing platform security and Fixed Yield messaging for lenders
- July 8, 2025: Redesigned FAQs into horizontal accordion layout with General and Safety sections, added recovery transaction explanation and updated LTV monitoring to 95% threshold
- July 8, 2025: Added "Who is the Liquidator?" FAQ explaining Self-Liquidation and Reconquest Liquidation modes for investor flexibility
- July 8, 2025: Added "Receiving & Repaying Loans" FAQ section with payment timing expectations and dispute resolution procedures
- July 8, 2025: Expanded "Receiving & Repaying Loans" section with 8 additional repayment questions covering loan obligations, early repayment, and default scenarios
- July 8, 2025: Added contact section at bottom of homepage with admin email (admin.reconquest@protonmail.com) for user support
- July 9, 2025: Created dedicated About page (/about) with manifesto content, removed About section from homepage scroll, added About link to main navigation header for separate page access
- July 9, 2025: Updated homepage hero with new slogan "The Future of Lending Is Bitcoin-Backed" and changed main title to "The Global Marketplace for Bitcoin-Backed Loans"
- July 9, 2025: Updated logo across entire application to new version with enhanced blue and gold coloring
- July 9, 2025: Standardized all call-to-action buttons to consistent "Start Borrowing" and "Start Lending" text throughout homepage and About page
- July 9, 2025: Implemented secure password strength meter with visual cryptographic metaphors for user authentication, including real-time strength analysis and security tips
- July 9, 2025: Fixed critical mobile navigation issue - added responsive hamburger menu so users can access Borrow, Lend, About, FAQs options on mobile devices
- July 9, 2025: Updated navigation buttons with blue-to-yellow gradient styling and increased spacing for better visual appeal per user request
- July 9, 2025: Fixed mobile navigation issues - logo now properly navigates to homepage and "How it Works" button correctly scrolls to homepage section
- July 9, 2025: Updated About page manifesto text to strengthen the message about reclaiming what's been taken from us
- July 9, 2025: Updated navigation button colors - Login uses blue to yellow gradient, Sign Up uses black to yellow gradient for striking visual differentiation and premium appeal
- July 9, 2025: Updated "Start Lending" buttons with dark background and gold letters for elegant contrast with yellow "Start Borrowing" buttons
- July 9, 2025: Implemented comprehensive gamified achievement badge system with blockchain-themed rewards (Genesis Block, Chain Builder, Bitcoin Whale, etc.) and animated unlock celebrations with confetti and blockchain block animations
- July 11, 2025: Updated admin contact email from admin.reconquest@protonmail.com to admin@reconquestp2p.com throughout the application (homepage, admin dashboard, email notifications, welcome emails) to reflect new professional domain acquisition
- July 13, 2025: Updated all email "from" addresses from onboarding@resend.dev to noreply@reconquestp2p.com across all email services for professional domain consistency
- July 13, 2025: Consolidated all business notifications to admin@reconquestp2p.com, removing all references to jfestrada93@gmail.com for centralized admin communication
- July 13, 2025: Implemented complete admin email notification system - 3 scenarios covered: new user registrations, new loan publications, and loan funding attempts, all sent to admin@reconquestp2p.com
- July 13, 2025: Successfully deployed project to Replit and configured custom domain - website accessible at reconquestp2p.com with DNS propagation in progress for www subdomain
- July 13, 2025: Completed professional email domain verification - reconquestp2p.com domain verified in Resend with SPF, DKIM, and DMARC records, all admin notifications now sent from noreply@reconquestp2p.com to admin@reconquestp2p.com
- July 13, 2025: Resolved SSL certificate issue for www.reconquestp2p.com by implementing URL redirect from www to root domain via Namecheap, providing seamless HTTPS coverage and following industry standard practices
- July 15, 2025: Implemented secure authentication flow - Start Borrowing/Start Lending buttons now redirect to login/signup instead of direct dashboard access, created comprehensive login page with form validation and password visibility toggle, updated navigation to hide Borrow/Lend menus for non-authenticated users showing only How it Works and About for visitors
- July 15, 2025: Enhanced admin dashboard with user management tracking - added dedicated Users Management tab alongside Loans Management, implemented /api/admin/users endpoint, admin can now monitor user registrations with detailed table showing usernames, emails, roles, and registration dates, expanded stats cards to include total registered users count
- July 15, 2025: Replaced interest rate text inputs with interactive sliders - implemented 0-25% range with 0.5% increments to prevent user input errors from decimal point confusion, updated both loan calculator and loan request form with real-time percentage display and visual slider controls
- July 15, 2025: Completed authentication flow with smart navigation - implemented full logout functionality, added `/api/auth/logout` endpoint, "Start Borrowing/Lending" buttons now route authenticated users directly to dashboards instead of login page, fixed "How it Works" navigation to prevent unintended logout by using smooth scroll on homepage and controlled navigation for other pages

## Admin Access
- **Admin Email**: admin@reconquestp2p.com
- **Admin Password**: admin123
- **Dashboard Access**: /admin or /admin-dashboard routes with email + password authentication
- **Notifications**: Email alerts sent to admin@reconquestp2p.com
- **Email Types**: [ADMIN ALERT] for admin notifications, standard subject for borrower notifications
- **Security**: Two-factor authentication (email + password), hidden from main navigation

## Email System Status
- **Current Setup**: Resend API with custom domain reconquestp2p.com
- **Admin Email**: admin@reconquestp2p.com (professional domain)
- **Domain Status**: DNS records configured, verification pending (24-48 hour propagation)
- **Production Note**: Email API functional, domain verification completing for professional delivery

## User Preferences

Preferred communication style: Simple, everyday language.