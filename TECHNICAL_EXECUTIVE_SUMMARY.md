# Reconquest - Technical Executive Summary

**One-Pager for Lanzadera Interview**

---

## What Is Reconquest?

A peer-to-peer Bitcoin-backed lending platform. Borrowers use Bitcoin as collateral to get EUR/USD loans. Lenders earn fixed returns without ever touching Bitcoin.

---

## Tech Stack Overview

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18 + TypeScript, Vite, Tailwind CSS, shadcn/ui |
| **Backend** | Node.js + Express, TypeScript, RESTful API |
| **Database** | PostgreSQL (Neon serverless), Drizzle ORM |
| **Bitcoin** | Native Bitcoin scripting, testnet4, P2WSH multisig |
| **Security** | AES-256-GCM encryption, PBKDF2 key derivation, JWT auth |

---

## Architecture Highlights

### Frontend (React + TypeScript)
- **Single Page Application** with Wouter routing
- **TanStack Query** for server state management and caching
- **Radix UI + shadcn/ui** for accessible, consistent components
- **Real-time price feeds** from CoinGecko API
- **Client-side cryptography** for borrower key derivation (never sent to server)

### Backend (Node.js + Express)
- **RESTful API** with Zod validation on all endpoints
- **Drizzle ORM** for type-safe database queries
- **Service-oriented architecture**: BitcoinEscrowService, EncryptionService, LTVMonitoringService
- **Background jobs**: LTV monitoring every 60 seconds, automatic liquidation triggers

---

## The Innovation: Bitcoin-Blind Lender Design

**Problem**: Traditional Bitcoin lending requires both parties to manage cryptographic keys, creating friction and risk for non-technical users.

**Our Solution**: Lenders never touch Bitcoin. They only transfer fiat.

### 3-of-3 Multisig Escrow

| Key | Who Controls It | Purpose |
|-----|-----------------|---------|
| **Borrower Key** | Borrower (client-side) | Derived from passphrase using PBKDF2 |
| **Platform Key** | Reconquest | Platform's signing authority |
| **Lender Key** | Reconquest (on behalf of lender) | Platform-operated, encrypted at rest |

**Why This Works**:
- Lenders only confirm bank transfers - zero crypto knowledge needed
- Platform cannot steal funds alone (needs borrower signature for normal operations)
- Borrower maintains non-custodial control of their collateral
- Emergency recovery path if platform disappears (time-locked)

---

## Ephemeral Key System (Borrower Side)

```
Passphrase → PBKDF2(SHA256, 100,000 iterations) → Private Key → Sign → Wipe
```

**Key Properties**:
- **Never stored**: Private key exists only in browser memory during signing
- **Deterministic**: Same passphrase always generates same key
- **Loan-specific salt**: `reconquest:{loanId}:{userId}:borrower:escrow-key-v1`
- **Non-custodial verification**: Server only receives public keys and pre-signed transactions

---

## Security Architecture

### What The Platform CAN Do:
- Sign **predefined transaction templates** only:
  1. **REPAYMENT** → Collateral returns to borrower
  2. **DEFAULT_LIQUIDATION** → Collateral goes to lender
  3. **BORROWER_RECOVERY** → Time-locked self-rescue

### What The Platform CANNOT Do:
- Create arbitrary transactions after loan setup
- Access borrower's passphrase or private key
- Spend funds without matching a predefined template

### Additional Security:
- **AES-256-GCM** encryption for stored lender keys
- **ResponseSanitizer** strips sensitive data from all API responses
- **Audit logging** for all signing operations (no key material logged)
- **HSM-ready**: Encryption service isolated for easy hardware security module migration

---

## LTV Monitoring & Auto-Liquidation

| LTV Threshold | Action |
|---------------|--------|
| **75%** | Early warning email to borrower |
| **85%** | Critical warning to both parties |
| **95%** | Automatic liquidation triggered |

**Process**: Real-time EUR price monitoring → LTV calculation → Email alerts → Collateral top-up option → Auto-liquidation if needed

---

## Key Metrics

- **630+ commits** in the codebase
- **TypeScript throughout** (96% of codebase)
- **Production-ready** on Bitcoin testnet4
- **Full email system** for all user notifications
- **Admin dashboard** for platform management

---

## Competitive Advantages

1. **Non-custodial for borrowers** - They control their keys
2. **Zero Bitcoin friction for lenders** - Just bank transfers
3. **Transparent dispute resolution** - Deterministic outcome engine
4. **No smart contract risk** - Native Bitcoin scripting (most battle-tested)
5. **HSM-ready security** - Enterprise-grade encryption architecture

---

## Questions They Might Ask

**Q: Is this custodial?**
A: Hybrid. Borrowers are non-custodial (they derive keys client-side). Lenders delegate key management to the platform, but funds are locked in multisig - platform alone cannot spend.

**Q: What if the platform disappears?**
A: Borrowers have a time-locked recovery path to reclaim their Bitcoin without platform participation.

**Q: Why not use smart contracts on Ethereum?**
A: Bitcoin's scripting is simpler, more battle-tested, and aligns with our target users (Bitcoiners who don't want altcoin exposure).

**Q: How do you make money?**
A: Platform fee on successful loan repayments (percentage of interest earned).

---

*Built with TypeScript, React, Node.js, PostgreSQL, and native Bitcoin scripting.*
