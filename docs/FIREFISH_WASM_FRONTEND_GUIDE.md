# Firefish WASM Frontend Integration Guide

**Last Updated**: October 19, 2025  
**Status**: ✅ Frontend Components Ready for Testing  
**Backend Status**: ✅ Production Ready

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Components](#components)
4. [Usage Examples](#usage-examples)
5. [Testing Workflow](#testing-workflow)
6. [Real Firefish WASM Integration](#real-firefish-wasm-integration)
7. [Security Features](#security-features)
8. [Troubleshooting](#troubleshooting)

---

## Overview

The Firefish WASM frontend integration enables **client-side Bitcoin escrow management** for the Reconquest lending platform. All cryptographic operations (key generation, address creation, transaction signing) happen in the user's browser via WebAssembly, ensuring private keys NEVER leave the client.

### Key Features

✅ **Client-Side Key Generation** - Bitcoin keys generated using WASM (secp256k1)  
✅ **2-of-3 Multisig Escrow** - Secure Bitcoin addresses for collateral  
✅ **Real-Time Funding Tracker** - Auto-polling Blockstream API for deposits  
✅ **Transaction Pre-Signing** - PSBT creation and signing workflow  
✅ **Key Export/Import** - Encrypted backup and recovery  
✅ **Zero Backend Key Exposure** - Private keys stay in browser memory

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (React)                         │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │ Firefish WASM    │  │ useFirefishWASM  │  │ UI Components│  │
│  │ - generateKeys() │  │ Hook             │  │ - EscrowSetup│  │
│  │ - createEscrow() │  │ - State Mgmt     │  │ - FundingTrack│ │
│  │ - signTx()       │  │ - API Calls      │  │ - TxSigning  │  │
│  └──────────────────┘  └──────────────────┘  └──────────────┘  │
│         ▲                       │                      │         │
│         │                       ▼                      ▼         │
│    Private Keys         Backend REST API       User Interface   │
│    (Browser Memory)                                              │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Express Backend (TypeScript)                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │ Escrow API       │  │ Blockchain       │  │ PostgreSQL   │  │
│  │ /escrow/sessions │  │ Monitoring       │  │ - Sessions   │  │
│  │ /escrow/funding  │  │ (Blockstream)    │  │ - Signatures │  │
│  │ /escrow/sigs     │  │                  │  │ - Events     │  │
│  └──────────────────┘  └──────────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Borrower Creates Loan** → Lender accepts → Loan status: `escrow_pending`
2. **Generate Keys** → Browser creates borrower/lender keys via WASM
3. **Create Escrow** → WASM generates 2-of-3 multisig Bitcoin address
4. **Submit to Backend** → Send public keys + address (NO private keys!)
5. **Deposit Collateral** → Borrower sends BTC to escrow address
6. **Monitor Funding** → Frontend polls backend → Backend checks Blockstream
7. **Activate Loan** → Backend confirms funding → Status: `active`
8. **Pre-Sign Transactions** → WASM creates repayment PSBTs → Submit signatures

---

## Components

### 1. Firefish WASM Mock (`client/src/lib/firefish-wasm-mock.ts`)

**Purpose**: Simulates the real Firefish WASM module for development/testing.

**Key Functions**:
```typescript
generateKeys(): KeyPair
createEscrow(config: EscrowConfig): EscrowAddress
serializeState(state: EscrowState): string
signTransaction(template: TransactionTemplate, privateKey: string): SignedTransaction
exportKeys(keys: KeyPair, password: string): string
importKeys(encrypted: string, password: string): KeyPair
```

**When to Replace**: When actual `@firefish/wasm` package is available, swap the import:
```typescript
// Current (mock)
import * as Firefish from '@/lib/firefish-wasm-mock';

// Real module
import * as Firefish from '@firefish/wasm';
```

---

### 2. FirefishWASM Context Provider (`client/src/contexts/FirefishWASMContext.tsx`)

**Purpose**: Context provider that creates a single shared `useFirefishWASM` instance for all escrow components.

**⚠️ IMPORTANT**: All escrow components must be wrapped in `<FirefishWASMProvider>` to share state.

**Usage**:
```tsx
import { FirefishWASMProvider } from '@/contexts/FirefishWASMContext';

function MyDashboard() {
  return (
    <FirefishWASMProvider>
      <EscrowSetup loanId={123} role="borrower" />
      <FundingTracker escrowAddress="tb1q..." expectedAmountBTC={0.5} />
      <TransactionSigning sessionId="uuid" role="borrower" userKeys={keys} />
    </FirefishWASMProvider>
  );
}
```

**Why This Matters**: Without the provider, each component creates its own isolated state, breaking the workflow. `EscrowSetup` would create a session that `FundingTracker` can't see.

---

### 3. useFirefishWASM Hook (`client/src/hooks/use-firefish-wasm.ts`)

**Purpose**: React hook that manages WASM lifecycle and backend communication. **Must be consumed via context.**

**State Management**:
```typescript
const {
  session,           // Current escrow session
  isLoading,         // Loading state
  error,             // Error messages

  // Key Management
  generateBorrowerKeys,
  generateLenderKeys,
  exportKeys,
  importKeys,

  // Escrow Operations
  createEscrow,
  submitToBackend,
  updateWASMState,

  // Funding Tracker
  checkFunding,
  startFundingPolling,
  stopFundingPolling,

  // Transaction Signing
  createRepaymentTx,
  signTransaction,
  submitSignature,
} = useFirefishWASM();
```

**Example Usage** (via context):
```typescript
import { useFirefishWASMContext } from '@/contexts/FirefishWASMContext';

const MyComponent = () => {
  const { generateBorrowerKeys, createEscrow, submitToBackend } = useFirefishWASMContext();

  const handleSetup = async () => {
    // Generate keys client-side
    const borrowerKeys = generateBorrowerKeys();
    const lenderKeys = generateLenderKeys();
    const platformKeys = generatePlatformKeys();

    // Create escrow address
    const session = await createEscrow({
      loanId: 123,
      borrowerKeys,
      lenderKeys,
      platformKeys,
      network: 'testnet',
    });

    // Submit to backend (only public data!)
    await submitToBackend(session);
  };
};
```

---

### 3. EscrowSetup Component (`client/src/components/escrow-setup.tsx`)

**Purpose**: UI for generating keys and creating escrow addresses.

**Features**:
- 🔑 Client-side key generation
- 👁️ Show/hide private keys toggle
- 💾 Export keys with password encryption
- 📥 Import keys from backup
- 🔐 2-of-3 multisig address creation
- ✅ Backend synchronization

**Props**:
```typescript
interface EscrowSetupProps {
  loanId: number;
  role: 'borrower' | 'lender';
  onEscrowCreated?: (sessionId: string, address: string) => void;
}
```

**Usage**:
```tsx
<EscrowSetup
  loanId={loan.id}
  role="borrower"
  onEscrowCreated={(sessionId, address) => {
    console.log('Escrow created:', address);
  }}
/>
```

**User Flow**:
1. Click "Generate Borrower Keys" → WASM creates key pair
2. (Optional) Export keys with password → Download backup file
3. Click "Create Bitcoin Escrow Address" → WASM generates multisig
4. Escrow address displayed → Automatically synced to backend

---

### 4. FundingTracker Component (`client/src/components/funding-tracker.tsx`)

**Purpose**: Monitor Bitcoin deposits to escrow addresses in real-time.

**Features**:
- 🔍 Manual funding checks
- ⏱️ Auto-polling (every 10 seconds)
- ✅ Confirmation tracking (3+ confirmations required)
- 🔗 Blockstream explorer links
- 📊 Progress bar for confirmations

**Props**:
```typescript
interface FundingTrackerProps {
  escrowAddress: string;
  expectedAmountBTC: number;
  onFunded?: (txid: string, confirmations: number) => void;
  autoStart?: boolean;
}
```

**Usage**:
```tsx
<FundingTracker
  escrowAddress="tb1q..."
  expectedAmountBTC={0.5}
  autoStart={true}
  onFunded={(txid, confirmations) => {
    toast({ title: 'Funded!', description: `TXID: ${txid}` });
  }}
/>
```

**Backend Integration**:
```
Frontend (10s polling) → GET /api/escrow/funding/:address
                       ↓
Backend → Blockstream API → Check UTXOs
                       ↓
Backend → Auto-update escrow session if funded
                       ↓
Frontend receives funding status + confirmations
```

---

### 5. TransactionSigning Component (`client/src/components/transaction-signing.tsx`)

**Purpose**: Create and sign Bitcoin transactions using WASM.

**Features**:
- 📝 Repayment transaction creation
- ✍️ PSBT signing with private keys
- 📤 Signature submission to backend
- 🔐 Client-side signing only

**Props**:
```typescript
interface TransactionSigningProps {
  sessionId: string;
  role: 'borrower' | 'lender' | 'platform';
  userKeys: KeyPair;
  loanDetails: {
    principalSats: number;
    interestSats: number;
    lenderAddress: string;
  };
  onSigned?: () => void;
}
```

**3-Step Workflow**:
1. **Create Transaction** → Generate PSBT for repayment
2. **Sign with WASM** → Add user's signature to PSBT
3. **Submit to Backend** → Store signature for 2-of-3 completion

---

## Usage Examples

### Example 1: Borrower Creates Escrow for Loan

```typescript
// In borrower-dashboard.tsx
import { FirefishWASMProvider } from '@/contexts/FirefishWASMContext';
import EscrowSetup from '@/components/escrow-setup';
import FundingTracker from '@/components/funding-tracker';

function BorrowerDashboard() {
  const [escrowAddress, setEscrowAddress] = useState<string | null>(null);

  return (
    <FirefishWASMProvider>
      <div>
      {/* Step 1: Generate escrow address */}
      {!escrowAddress && (
        <EscrowSetup
          loanId={loan.id}
          role="borrower"
          onEscrowCreated={(sessionId, address) => {
            setEscrowAddress(address);
            toast({ title: 'Escrow Ready', description: `Send BTC to ${address}` });
          }}
        />
      )}

      {/* Step 2: Monitor funding */}
      {escrowAddress && (
        <FundingTracker
          escrowAddress={escrowAddress}
          expectedAmountBTC={parseFloat(loan.collateralBtc)}
          autoStart={true}
          onFunded={(txid, confirmations) => {
            toast({ title: 'Loan Activated!', description: `${confirmations} confirmations` });
          }}
        />
      )}
      </div>
    </FirefishWASMProvider>
  );
}
```

---

### Example 2: Lender Monitors Borrower's Collateral

```typescript
// In lender-dashboard.tsx
import { FirefishWASMProvider } from '@/contexts/FirefishWASMContext';

function LenderDashboard() {
  const { data: fundedLoans } = useQuery({
    queryKey: ['/api/users', userId, 'loans'],
  });

  return (
    <FirefishWASMProvider>
      <div>
      {fundedLoans.map((loan) => (
        loan.escrowAddress ? (
          <FundingTracker
            key={loan.id}
            escrowAddress={loan.escrowAddress}
            expectedAmountBTC={parseFloat(loan.collateralBtc)}
            autoStart={loan.status === 'escrow_pending'}
          />
        ) : (
          <p>Waiting for borrower to create escrow...</p>
        )
      ))}
      </div>
    </FirefishWASMProvider>
  );
}
```

---

### Example 3: Pre-Sign Repayment Transaction

```typescript
import TransactionSigning from '@/components/transaction-signing';

function RepaymentFlow({ loan, borrowerKeys }) {
  const principalSats = parseFloat(loan.amount) * 100000000 / currentBTCPrice;
  const interestSats = principalSats * (parseFloat(loan.interestRate) / 100);

  return (
    <TransactionSigning
      sessionId={loan.escrowSessionId}
      role="borrower"
      userKeys={borrowerKeys}
      loanDetails={{
        principalSats,
        interestSats,
        lenderAddress: loan.lenderBitcoinAddress,
      }}
      onSigned={() => {
        toast({ title: 'Signature Submitted', description: 'Repayment path ready' });
      }}
    />
  );
}
```

---

## Testing Workflow

### Manual Testing Steps

#### 1. **Setup Development Environment**
```bash
# Start the application
npm run dev

# Open browser
http://localhost:5000
```

#### 2. **Create Test Loan**
1. Navigate to Borrower Dashboard
2. Click "Request New Loan" (if available)
3. Fill in loan details (amount, term, collateral)
4. Submit loan request → Status: `posted`

#### 3. **Lender Accepts Loan**
1. Navigate to Lender Dashboard
2. Find available loan in "Available Loans" tab
3. Click "Fund Loan" button
4. Backend changes status to `escrow_pending`

#### 4. **Generate Escrow Address (Borrower)**
1. Switch to Borrower Dashboard
2. Click "Escrow" tab
3. Find the funded loan
4. Click "Generate Borrower Keys"
   - ✅ Public key displayed
   - ✅ Private key hidden by default (click eye icon to show)
5. (Optional) Enter password and click "Export" → Download backup
6. Click "Create Bitcoin Escrow Address"
   - ✅ Session ID generated
   - ✅ Bitcoin address displayed (starts with `tb1q...` for testnet)
   - ✅ Backend synced (check browser console for API call)

#### 5. **Monitor Funding (Auto-Polling)**
1. FundingTracker component auto-starts
2. Check browser console: Should see polling logs every 10 seconds
3. Copy escrow address
4. Send testnet Bitcoin from a testnet faucet:
   - https://coinfaucet.eu/en/btc-testnet/
   - https://testnet-faucet.mempool.co/
5. Wait for transaction broadcast
6. FundingTracker should detect deposit:
   - "Unconfirmed" badge appears
   - Progress bar shows confirmations (0/3)
7. After 3 confirmations:
   - "Confirmed ✓" badge
   - Green success alert
   - Loan status → `active`

#### 6. **Pre-Sign Repayment Transaction**
1. Navigate to TransactionSigning component
2. Click "Create Repayment Transaction"
   - ✅ PSBT displayed
3. Click "Sign Transaction with WASM"
   - ✅ Signature generated client-side
4. Click "Submit Signature to Backend"
   - ✅ Signature stored in `signature_exchanges` table

---

### Automated E2E Testing (Playwright)

```typescript
// tests/escrow-workflow.spec.ts
import { test, expect } from '@playwright/test';

test('Complete escrow workflow', async ({ page }) => {
  // 1. Navigate to borrower dashboard
  await page.goto('http://localhost:5000/borrower-dashboard');
  
  // 2. Go to Escrow tab
  await page.click('[data-testid="trigger-escrow"]');
  
  // 3. Generate keys
  await page.click('[data-testid="button-generate-keys"]');
  await expect(page.locator('[data-testid="text-public-key"]')).toBeVisible();
  
  // 4. Create escrow
  await page.click('[data-testid="button-create-escrow"]');
  await expect(page.locator('[data-testid="text-escrow-address"]')).toBeVisible();
  
  // 5. Verify backend sync
  const address = await page.locator('[data-testid="text-escrow-address"]').textContent();
  expect(address).toMatch(/^tb1q/);
  
  // 6. Start funding tracker
  await page.click('[data-testid="button-start-tracking"]');
  await expect(page.locator('[data-testid="badge-funding-status"]')).toHaveText('Waiting for Deposit');
});
```

---

## Real Firefish WASM Integration

When the actual `@firefish/wasm` package becomes available:

### Step 1: Install Package
```bash
npm install @firefish/wasm
```

### Step 2: Update Import
```typescript
// In client/src/hooks/use-firefish-wasm.ts
// Change this:
import * as Firefish from '@/lib/firefish-wasm-mock';

// To this:
import * as Firefish from '@firefish/wasm';
```

### Step 3: Verify API Compatibility

The real Firefish WASM module should implement these interfaces:

```typescript
// Must match the mock API
interface FirefishWASM {
  generateKeys(): KeyPair;
  createEscrow(config: EscrowConfig): EscrowAddress;
  serializeState(state: EscrowState): string;
  deserializeState(encoded: string): Partial<EscrowState>;
  createRepaymentTransaction(state: EscrowState, details: LoanDetails): TransactionTemplate;
  signTransaction(template: TransactionTemplate, privateKey: string, publicKey: string): SignedTransaction;
  exportKeys(keys: KeyPair, password: string): string;
  importKeys(encrypted: string, password: string): KeyPair;
}
```

If the real module uses different function names, create an adapter:

```typescript
// client/src/lib/firefish-adapter.ts
import * as RealFirefish from '@firefish/wasm';

export const Firefish = {
  generateKeys: () => RealFirefish.newKeyPair(),
  createEscrow: (config) => RealFirefish.buildMultisig(config),
  // ... map other functions
};
```

### Step 4: Test Thoroughly
1. Run full test suite
2. Verify key generation produces valid secp256k1 keys
3. Confirm addresses are valid Bitcoin testnet/mainnet addresses
4. Test signature creation with real Bitcoin transactions

---

## Security Features

### 🔒 What's Protected

✅ **Private Keys Never Leave Browser**
- Generated in browser via WASM
- Stored in memory only (not localStorage)
- Never sent to backend APIs

✅ **Encrypted Key Exports**
- Password-based encryption (AES-256-GCM in real WASM)
- User controls backup files
- Downloadable for offline storage

✅ **Backend Can't Access Keys**
- Database stores only public keys
- API endpoints reject private key fields
- Schema validation enforces separation

✅ **Input Validation**
- All backend requests validated with Zod schemas
- Unauthorized fields rejected (400 error)
- Type-safe TypeScript throughout

### 🚨 Security Warnings

⚠️ **Key Backup is Critical**
- Users must export/backup their keys
- Lost keys = lost Bitcoin access
- No password recovery for encrypted backups

⚠️ **Testnet vs Mainnet**
- Current implementation uses Bitcoin testnet
- Switching to mainnet requires careful configuration
- Never use testnet addresses for real Bitcoin

⚠️ **Browser Security**
- WASM keys vulnerable to XSS attacks
- Use Content Security Policy (CSP) headers
- HTTPS required in production

---

## Troubleshooting

### Issue: "Keys not generating"

**Symptoms**: Click "Generate Keys" but nothing happens

**Solutions**:
1. Check browser console for errors
2. Verify Firefish WASM module loaded: `console.log(Firefish)`
3. Ensure React component mounted properly
4. Check `useFirefishWASM` hook state

---

### Issue: "Escrow address invalid format"

**Symptoms**: Address doesn't start with `tb1q` or `bc1q`

**Solutions**:
1. Check network configuration (testnet vs mainnet)
2. Verify WASM module witness script generation
3. Inspect `createEscrow()` return value
4. Validate all 3 public keys present

---

### Issue: "Funding tracker never detects deposit"

**Symptoms**: Sent BTC but tracker shows "Waiting for Deposit"

**Solutions**:
1. Verify correct escrow address used
2. Check Blockstream API status: https://blockstream.info/testnet/api/
3. Inspect browser console for API errors
4. Manually check address on explorer: `https://blockstream.info/testnet/address/<address>`
5. Ensure backend polling is working (check server logs)
6. Verify expected amount matches deposit (in satoshis)

---

### Issue: "Backend returns 403 Forbidden on escrow endpoints"

**Symptoms**: API calls fail with authorization error

**Solutions**:
1. Verify JWT token in localStorage: `localStorage.getItem('token')`
2. Check token expiration (7-day TTL)
3. Re-login to get fresh token
4. Ensure user is borrower/lender for that loan

---

### Issue: "Signatures not submitting"

**Symptoms**: `submitSignature()` fails

**Solutions**:
1. Verify transaction template created first
2. Check signature format (base64 encoded)
3. Ensure correct role ('borrower', 'lender', or 'platform')
4. Inspect network tab for request payload
5. Check backend logs for validation errors

---

## API Reference

### Backend Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/escrow/sessions` | POST | Create escrow session |
| `/api/escrow/sessions/:id` | GET | Get session state |
| `/api/escrow/sessions/:id` | PATCH | Update WASM state |
| `/api/escrow/funding/:address` | GET | Check blockchain funding |
| `/api/escrow/signatures` | POST | Submit transaction signatures |
| `/api/escrow/events` | POST | Log escrow events |

See `docs/WASM_API_DESIGN.md` for complete API specification.

---

## Next Steps

1. ✅ **Frontend Components Built** - UI ready for user testing
2. ⏳ **Integrate Real Firefish WASM** - When package available
3. ⏳ **End-to-End Testing** - Full loan → escrow → funding workflow
4. ⏳ **Production Deployment** - Switch to Bitcoin mainnet
5. ⏳ **Mobile Optimization** - Responsive design testing
6. ⏳ **Key Recovery UX** - Improve backup/restore flow

---

## Resources

- **Backend API Docs**: `docs/WASM_API_DESIGN.md`
- **Architecture Guide**: `docs/WASM_ESCROW_IMPLEMENTATION.md`
- **Project Overview**: `replit.md`
- **Blockstream API**: https://github.com/Blockstream/esplora/blob/master/API.md
- **Bitcoin Testnet Faucets**: https://coinfaucet.eu/en/btc-testnet/

---

**Questions?** Check the troubleshooting section or review the component source code. All components are heavily documented with inline comments.
