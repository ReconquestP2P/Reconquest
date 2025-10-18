# WASM Escrow API Design - Firefish Integration

## Architecture Overview

```
┌─────────────────────┐         ┌──────────────────────┐        ┌────────────────┐
│  Browser (WASM)     │         │  Express Backend     │        │  PostgreSQL    │
│  - Firefish Module  │ ◄─────► │  - Coordination      │ ◄────► │  - State Only  │
│  - Key Generation   │  REST   │  - Blockchain API    │        │  - NO KEYS     │
│  - Signing (PSBT)   │         │  - Event Logging     │        │                │
└─────────────────────┘         └──────────────────────┘        └────────────────┘
```

**Security Principle**: Private keys NEVER leave the browser. Backend only stores:
- Public keys
- Witness scripts
- Transaction hashes
- Signatures (base64)
- State metadata

---

## API Endpoints

### 1. Create Escrow Session
**POST** `/api/escrow/sessions`

Creates a new escrow session after WASM generates the address.

**Request Body:**
```json
{
  "sessionId": "uuid-v4-from-frontend",
  "loanId": 123,
  "escrowAddress": "tb1q...",
  "witnessScript": "hex-encoded-witness-script",
  "scriptHash": "sha256-hash",
  "borrowerPubkey": "hex-pubkey",
  "lenderPubkey": "hex-pubkey",  // null until lender joins
  "platformPubkey": "hex-pubkey",
  "wasmState": "base64-encoded-state-from-wasm"
}
```

**Response:**
```json
{
  "success": true,
  "session": {
    "id": 1,
    "sessionId": "uuid",
    "currentState": "initialized",
    "createdAt": "2025-10-17T23:59:00Z"
  }
}
```

---

### 2. Get Escrow Session
**GET** `/api/escrow/sessions/:sessionId`

Retrieves current escrow session state.

**Response:**
```json
{
  "session": {
    "sessionId": "uuid",
    "loanId": 123,
    "escrowAddress": "tb1q...",
    "currentState": "funded",
    "borrowerPubkey": "hex",
    "lenderPubkey": "hex",
    "platformPubkey": "hex",
    "fundingTxid": "txid",
    "fundingVout": 0,
    "fundedAmountSats": 50000000,
    "createdAt": "...",
    "updatedAt": "..."
  },
  "events": [
    {
      "eventType": "created",
      "createdAt": "...",
      "eventData": "{...}"
    },
    {
      "eventType": "funded",
      "blockchainTxid": "txid",
      "createdAt": "..."
    }
  ]
}
```

---

### 3. Submit Signatures
**POST** `/api/escrow/signatures`

WASM client submits pre-signed transaction signatures.

**Request Body:**
```json
{
  "escrowSessionId": "uuid",
  "senderRole": "borrower",
  "signatureType": "repayment",
  "signatureData": "base64-encoded-signatures"
}
```

**Response:**
```json
{
  "success": true,
  "signatureId": 42,
  "message": "Signature stored successfully"
}
```

---

### 4. Check Funding Status
**GET** `/api/escrow/funding/:address`

Polls Blockstream API to check if escrow address received Bitcoin.

**Query Parameters:**
- `expectedAmount` (optional): Amount in satoshis to verify

**Response:**
```json
{
  "funded": true,
  "txid": "blockchain-txid",
  "vout": 0,
  "amountSats": 50000000,
  "confirmations": 3,
  "blockHeight": 2500000
}
```

---

### 5. Log Escrow Event
**POST** `/api/escrow/events`

Records audit trail events for escrow lifecycle.

**Request Body:**
```json
{
  "escrowSessionId": "uuid",
  "eventType": "signature_received",
  "eventData": "{\"signatureType\": \"repayment\", \"timestamp\": 1697587200}",
  "blockchainTxid": "txid-optional"
}
```

---

### 6. Update Session State
**PATCH** `/api/escrow/sessions/:sessionId`

Updates escrow session state (used by backend workflows).

**Request Body:**
```json
{
  "currentState": "active",
  "fundingTxid": "txid",
  "fundingVout": 0,
  "fundedAmountSats": 50000000,
  "wasmState": "updated-base64-state"
}
```

---

## Blockchain Monitoring Service

### Blockstream API Integration

**Base URL**: `https://blockstream.info/testnet/api/`

**Key Endpoints Used**:
- `GET /address/:address/utxo` - Check UTXOs for funding
- `GET /tx/:txid` - Get transaction details
- `GET /tx/:txid/status` - Get confirmation status

**Polling Strategy**:
1. Frontend calls `/api/escrow/funding/:address` every 10 seconds
2. Backend caches Blockstream responses for 5 seconds
3. Once funded, update escrow session and trigger email notifications

---

## Security Considerations

✅ **What We Store**:
- Public keys (safe to expose)
- Witness scripts (contract logic)
- Transaction IDs (public blockchain data)
- Base64 signatures (needed for transaction assembly)

❌ **What We NEVER Store**:
- Private keys (xpriv, WIF)
- Seed phrases
- Unencrypted sensitive data

**WASM State Backup**: We store serialized WASM state for disaster recovery, but it's encrypted by Firefish's built-in state encryption.

---

## Example WASM Integration Flow

```javascript
// Frontend (React + Firefish WASM)
import { Firefish } from '@firefish/wasm';

// 1. Generate escrow keys in browser
const borrowerKeys = Firefish.generateKeys();
const platformKeys = Firefish.generateKeys();

// 2. Create 2-of-3 multisig address
const escrow = Firefish.createEscrow({
  parties: [borrowerKeys.pubkey, lenderKeys.pubkey, platformKeys.pubkey],
  threshold: 2,
  network: 'testnet'
});

// 3. Send to backend (NO PRIVATE KEYS!)
await fetch('/api/escrow/sessions', {
  method: 'POST',
  body: JSON.stringify({
    sessionId: crypto.randomUUID(),
    loanId: 123,
    escrowAddress: escrow.address,
    witnessScript: escrow.witnessScript,
    scriptHash: escrow.scriptHash,
    borrowerPubkey: borrowerKeys.pubkey,
    platformPubkey: platformKeys.pubkey,
    wasmState: escrow.serializeState()
  })
});

// 4. Poll for funding
const pollFunding = setInterval(async () => {
  const res = await fetch(`/api/escrow/funding/${escrow.address}`);
  const data = await res.json();
  
  if (data.funded) {
    clearInterval(pollFunding);
    alert('Escrow funded! Transaction: ' + data.txid);
  }
}, 10000);
```

---

## Database Schema

### escrow_sessions
- Stores escrow metadata and public keys
- Links to loans table via loan_id
- Tracks current workflow state

### signature_exchanges
- Stores partial signatures from borrower/lender/platform
- Used to assemble multi-sig transactions
- Tracks which signatures received

### escrow_events
- Audit log of all escrow lifecycle events
- Links blockchain transactions to escrow actions
- Debugging and compliance trail
