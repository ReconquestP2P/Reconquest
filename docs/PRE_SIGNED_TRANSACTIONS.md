# Pre-Signed Transaction System

## Overview
The Reconquest platform uses pre-signed transactions for true non-custodial Bitcoin escrow, following the Firefish protocol architecture. This system ensures borrowers maintain full control of their collateral while enabling automated loan lifecycle management.

## Key Features
- Borrowers pre-sign 4 transactions during loan creation
- Platform adds 2nd signature only when needed (2-of-3 multisig)
- 30-day recovery timelock enables emergency withdrawals
- Backward compatible with legacy loans (no pre-signed)
- Bitcoin-blind lender model (lenders only interact with fiat)

## Transaction Types

### 1. REPAYMENT - Cooperative Close (Happy Path)
- **Triggered when:** Borrower repays loan successfully
- **Signatures needed:** 2-of-3 (borrower + platform)
- **Sends to:** Borrower's return address
- **Usage:** Automatic collateral return after loan repayment confirmed

### 2. DEFAULT - Non-Payment
- **Triggered when:** Borrower fails to repay by due date
- **Signatures needed:** 2-of-3 (lender key + platform key)
- **Sends to:** Lender's BTC address
- **Usage:** Lender claims collateral after confirmed non-payment

### 3. LIQUIDATION - LTV Breach
- **Triggered when:** Collateral value drops below 95% LTV threshold
- **Signatures needed:** 2-of-3 (lender key + platform key)
- **Sends to:** Fair split based on Firefish distribution rules
- **Usage:** Automatic protection for lender when collateral value drops

### 4. RECOVERY - Emergency Timelock
- **Triggered when:** Platform unavailable + 30 days passed
- **Signatures needed:** Borrower only (OP_CSV timelock path)
- **Sends to:** Borrower's return address
- **Usage:** True non-custodial safety net - borrower can always recover funds

## Loan Creation Flow

### Step 1: Borrower Creates Loan
- Posts loan request with terms (amount, term, interest rate)
- Status: `posted`

### Step 2: Lender Commits
- Lender reviews and funds the loan
- Platform generates lender key (Bitcoin-blind model)
- Status: `funded`
- escrowState: `awaiting_borrower_key`

### Step 3: Borrower Key Ceremony
- Borrower enters passphrase to derive their Bitcoin key
- Key derivation: PBKDF2(SHA256, passphrase, salt, 100000 iterations)
- Borrower provides Bitcoin return address
- Escrow address created (2-of-3 multisig)
- escrowState: `escrow_created`

### Step 4: Borrower Deposits BTC
- Borrower sends collateral to escrow address
- Platform monitors for deposit confirmation (1+ confirmations)
- Status: `awaiting_signatures`
- escrowState: `deposit_confirmed`

### Step 5: Signing Ceremony (After Deposit Confirmed)
- **IMPORTANT:** Signing MUST happen after deposit, not before
- Bitcoin signatures cryptographically commit to the input UTXO (txid:vout)
- PSBTs are generated with the real funding UTXO from the deposit
- Modal displays all 4 transaction types with explanations
- Borrower re-enters passphrase to re-derive key
- Client-side signing (private key never leaves browser)
- All 4 PSBTs signed in browser and submitted
- Loan updated: `borrower_signing_complete = true`
- Status: `active`

### Step 6: Loan Lifecycle
- **Repayment:** Lender confirms fiat received → Platform broadcasts pre-signed REPAYMENT
- **Default:** Grace period expires → Platform broadcasts pre-signed DEFAULT
- **Liquidation:** LTV exceeds threshold → Platform broadcasts pre-signed LIQUIDATION

### Step 7: Emergency Recovery (if needed)
- Platform unavailable for extended period
- 30-day timelock has expired
- Borrower calls: `POST /api/loans/:id/emergency-recovery`
- Downloads recovery PSBT
- Broadcasts manually using any Bitcoin wallet (Sparrow, Electrum, etc.)

## API Endpoints

### POST /api/loans/:id/provide-borrower-key
Provide borrower public key and return address, triggers escrow + PSBT generation.

**Authentication:** Required (borrower only)

**Request:**
```json
{
  "borrowerPubkey": "02e3b0c44298fc1c149afbf4c8996fb924...",
  "borrowerReturnAddress": "tb1q..."
}
```

**Response:**
```json
{
  "success": true,
  "escrowAddress": "tb1q...",
  "requiresSigning": true,
  "psbts": {
    "repayment": "cHNidP8BAF...",
    "default": "cHNidP8BAF...",
    "liquidation": "cHNidP8BAF...",
    "recovery": "cHNidP8BAF..."
  }
}
```

### POST /api/loans/:id/submit-signatures
Submit borrower signatures for all 4 pre-signed transactions.

**Authentication:** Required (borrower only)

**Rate Limit:** 5 attempts per 10 minutes per loan

**Request:**
```json
{
  "signatures": {
    "repayment": "304402201111...",
    "default": "304402203333...",
    "liquidation": "304402205555...",
    "recovery": "304402207777..."
  },
  "borrowerPubkey": "02e3b0c44..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "All signatures validated and stored",
  "signaturesAccepted": {
    "repayment": true,
    "default": true,
    "liquidation": true,
    "recovery": true
  }
}
```

### POST /api/loans/:id/emergency-recovery
Retrieve recovery PSBT for emergency self-broadcast (no auth required).

**Authentication:** None (emergency scenario)

**Rate Limit:** 10 requests/hour per loan, 50 requests/hour per IP

**Response (timelock expired):**
```json
{
  "success": true,
  "message": "Recovery transaction available for broadcast",
  "recovery": {
    "psbt": "cHNidP8BAF...",
    "txType": "recovery",
    "validAfter": "2025-12-26T01:51:08.152Z",
    "instructions": [
      "1. This PSBT contains your pre-signed recovery transaction",
      "2. The timelock has expired, so you can broadcast immediately",
      "3. Use a Bitcoin wallet to finalize and broadcast",
      "4. After 1 confirmation, your collateral is returned"
    ]
  }
}
```

**Response (timelock not expired):**
```json
{
  "error": "Recovery timelock has not expired yet",
  "validAfter": "2026-02-15T00:00:00.000Z",
  "daysRemaining": 20,
  "message": "Recovery transaction can be broadcast after..."
}
```

### GET /api/loans/:id/verify-presigned
Verify pre-signed transactions exist for a loan.

**Authentication:** Required (borrower, lender, or admin)

**Response:**
```json
{
  "loanId": 204,
  "hasPreSignedTransactions": true,
  "borrowerSigningComplete": true,
  "transactions": {
    "repayment": { "exists": true, "signed": true },
    "default": { "exists": true, "signed": true },
    "liquidation": { "exists": true, "signed": true },
    "recovery": { "exists": true, "signed": true }
  }
}
```

## Security Architecture

### Key Storage
- **Borrower Key:** Never stored - derived client-side from passphrase
- **Lender Key:** Platform-generated, encrypted with AES-256-GCM
- **Platform Key:** Stored in environment variable (PLATFORM_SIGNING_KEY)

### Key Derivation (Borrower)
```
PBKDF2(
  algorithm: SHA256,
  passphrase: user_input,
  salt: "reconquest:{loanId}:{userId}:borrower:escrow-key-v1",
  iterations: 100000,
  keyLength: 32 bytes
)
```

### Signature Validation
1. DER format validation (30 44 02 20 <r> 02 20 <s>)
2. Length check (140 hex characters = 70 bytes)
3. Loan ownership verification
4. Rate limiting (5 attempts per 10 minutes)

### Timelock Security
- Recovery transaction uses OP_CSV with 4320 blocks (~30 days)
- Prevents premature recovery while allowing emergency access
- Dev/testnet mode allows bypass for testing

## Database Schema

### pre_signed_transactions Table
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| loan_id | integer | Foreign key to loans |
| party_role | text | 'borrower' or 'lender' |
| party_pubkey | text | Public key of signing party |
| tx_type | text | 'repayment', 'default', 'liquidation', 'recovery' |
| psbt | text | Base64-encoded PSBT |
| signature | text | DER-encoded signature |
| tx_hash | text | Transaction hash for reference |
| valid_after | timestamp | Timelock expiry (recovery only) |
| broadcast_status | text | 'pending', 'signed', 'broadcast', 'confirmed' |
| broadcast_txid | text | Bitcoin txid after broadcast |
| broadcasted_at | timestamp | When transaction was broadcast |

### loans Table (New Fields)
| Column | Type | Description |
|--------|------|-------------|
| borrower_signing_complete | boolean | All 4 PSBTs signed by borrower |
| borrower_address | text | Bitcoin return address for repayment |
| tx_repayment_hex | text | Stored repayment PSBT (legacy) |
| tx_default_hex | text | Stored default PSBT (legacy) |

## Backward Compatibility

Loans created before the pre-signed system (IDs 198-204) continue to work:

1. **Detection:** Check `borrowerSigningComplete` flag
2. **Fallback:** If no pre-signed PSBTs, use legacy dynamic transaction creation
3. **Logging:** Clear `[LEGACY]` vs `[PRE-SIGNED]` log prefixes
4. **Both paths produce same result:** Collateral released to correct address

## Deployment Checklist

### Pre-Deployment
- [ ] Verify PLATFORM_SIGNING_KEY is set for mainnet
- [ ] Verify BITCOIN_NETWORK is set to 'mainnet'
- [ ] Run database migrations (npm run db:push)
- [ ] Test all 4 PSBT types generate correctly
- [ ] Test signing ceremony completes successfully

### Post-Deployment
- [ ] Monitor logs for [PRE-SIGNED] vs [LEGACY] paths
- [ ] Verify new loans show signing ceremony modal
- [ ] Test emergency recovery endpoint (with future timelock)
- [ ] Verify broadcast status updates in database

### Rollback Plan
- Pre-signed system is additive - legacy loans unaffected
- Can disable signing ceremony in frontend if issues arise
- All existing loans continue working with legacy method

## Troubleshooting

### "No pre-signed transactions found"
- Loan was created before pre-signed system
- PSBT generation failed during key ceremony
- Solution: Use legacy collateral release path

### "Borrower signature verification failed"
- Borrower used wrong passphrase
- DER format validation failed
- Solution: Re-enter correct passphrase, try again

### "Recovery timelock has not expired"
- 30-day waiting period not complete
- Solution: Wait until validAfter timestamp passes

### "Rate limit exceeded"
- Too many signing attempts (5 per 10 minutes)
- Solution: Wait for rate limit window to reset
