name: Env Vars Checker
description: >
  Activated when the user mentions environment variables, Replit Secrets,
  PLATFORM_SIGNING_KEY, PLATFORM_ENCRYPTION_KEY, PLATFORM_BTC_ADDRESS,
  BITCOIN_NETWORK, missing env vars, production secrets, or mainnet configuration.
  Knows every required environment variable for Reconquest mainnet launch,
  what each one does, where it is read in the codebase, and what breaks if it
  is missing or wrong.
allowed-tools: Read, Grep, Bash(printenv:*), Bash(grep:*)
---

# Env Vars Checker Skill

You are helping verify and configure every environment variable required for
Reconquest to run correctly on Bitcoin mainnet. You know exactly which variables
are critical security items, which ones have dangerous fallbacks, and which files
read them.

## The 7 Required Environment Variables

### 1. BITCOIN_NETWORK [CRITICAL]
- Required value: `mainnet`
- Read in: `server/services/bitcoin-network-selector.ts` line 22
- Default if missing: `testnet4` (silent — no error thrown)
- What it controls: network config selection, address prefix validation,
  timelock bypass toggle, safety limits enforcement, fee estimator fallbacks
- What it does NOT control: the 9 hardcoded blockers (see network-blocker-fixer skill)
- Risk if missing: entire app runs on testnet config silently

### 2. PLATFORM_SIGNING_KEY [CRITICAL — SECURITY]
- Required value: A brand new 32-byte hex private key, NEVER previously used on testnet
- Read in: `server/services/BitcoinEscrowService.ts` (platform pubkey derivation)
- Default if missing: app will fail or use wrong key
- What it controls: the platform's share of every 2-of-3 multisig escrow
- Risk if wrong: every escrow address generated will be incorrect — funds unrecoverable
- Generation command: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- IMPORTANT: The old testnet key started with `18a4153911...` — confirm the new key
  does NOT start with this prefix

### 3. PLATFORM_ENCRYPTION_KEY [CRITICAL — SECURITY]
- Required value: A randomly generated 32-byte base64 key
- Read in: `server/services/EncryptionService.ts` lines 15–21
- Default if missing: falls back to hardcoded string `reconquest-testnet-dev-key-v1`
  which is PUBLIC on GitHub — anyone can decrypt all lender keys in the database
- What it controls: AES-256-GCM encryption of every lender's platform-operated private key
- Risk if missing: all lender keys in the database are readable by anyone with GitHub access
- Generation command: `openssl rand -base64 32`
- Verification: on server startup, this log must NOT appear:
  `[EncryptionService] WARNING: Using fallback encryption key`

### 4. PLATFORM_BTC_ADDRESS [CRITICAL]
- Required value: A real mainnet `bc1...` address you control
- Read in: `server/routes.ts` line 1648, `server/services/LtvMonitoringService.ts` line 257
- Default if missing: empty string — PSBT generation returns HTTP 400, liquidations silently skipped
- What it controls: destination address for collateral when lender preference is EUR
  (platform receives BTC, converts to fiat, pays lender)
- Risk if missing: any loan that hits the 95% LTV threshold cannot be liquidated —
  the loan goes into limbo with no resolution path
- Verification: must be a valid bech32 mainnet address starting with `bc1`

### 5. BITCOIN_RPC_URL [OPTIONAL — only if using local Bitcoin node]
- Required value: `http://localhost:8332` (mainnet RPC port)
- Current default: `http://localhost:18332` (testnet port)
- Read in: `server/services/bitcoin-rpc-client.ts` line 50
- If not set: app falls back to mempool.space public API (acceptable for launch)

### 6. BITCOIN_RPC_USER [OPTIONAL — only if using local Bitcoin node]
- Read in: `server/services/bitcoin-rpc-client.ts` line 51
- Default: `bitcoin` (insecure — change if using real node)

### 7. BITCOIN_RPC_PASS [OPTIONAL — only if using local Bitcoin node]
- Read in: `server/services/bitcoin-rpc-client.ts` line 52
- Default: `password` (insecure — change if using real node)

## How to Check Current State

Run these greps to audit the codebase for fallback dangers:

```bash
# Check if encryption fallback key is still in EncryptionService
grep -n "reconquest-testnet-dev-key-v1" server/services/EncryptionService.ts

# Check if network selector still silently defaults to testnet4
grep -n "DEFAULT_NETWORK" server/services/bitcoin-network-selector.ts

# Check if RPC client still defaults to testnet port
grep -n "18332" server/services/bitcoin-rpc-client.ts

# Check startup logs for the encryption warning
grep -rn "Using fallback encryption key" server/
When User Asks to Generate Keys
If the user asks how to generate the keys, provide these exact commands:

bash
# Generate PLATFORM_SIGNING_KEY (run in terminal)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate PLATFORM_ENCRYPTION_KEY (run in terminal)
openssl rand -base64 32
Then remind them:

Never paste these keys into chat

Never commit them to Git

Store them in Replit Secrets only

Back them up in a secure offline location (password manager or encrypted file)

Losing PLATFORM_ENCRYPTION_KEY means all active lender keys in the DB become unreadable

Verification Checklist
After all env vars are set, walk through these:

 GET /api/network-info returns "network": "mainnet" and "isMainnet": true

 Server startup log shows 🔴 BITCOIN NETWORK: MAINNET

 Server startup log does NOT show [EncryptionService] WARNING: Using fallback encryption key

 PLATFORM_BTC_ADDRESS is set and starts with bc1

 PLATFORM_SIGNING_KEY does NOT start with 18a4153911 (the old testnet key)

 BITCOIN_NETWORK is mainnet, not testnet4