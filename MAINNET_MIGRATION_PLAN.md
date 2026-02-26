# Mainnet Migration Plan

> **STATUS: PRE-MIGRATION AUDIT — No code changes made yet.**
> Initially generated from a full codebase audit on 2026-02-21.
> Cross-referenced with Replit AI analysis on 2026-02-21 — gaps and corrections documented throughout.
> Work through each section in order. Check off items as they are completed and verified.

---

## How to Use This Document

- Work top-to-bottom within each section — later items often depend on earlier ones.
- Each item shows: file path, line number, current value, and required change.
- Items marked **[BLOCKER]** will cause incorrect or broken behaviour on mainnet even if all env vars are set correctly — these require code changes.
- Items marked **[ENV]** are fixed purely by setting environment variables — no code change needed.
- Items marked **[OPERATIONAL]** are process/configuration decisions, not code changes.
- Items marked **[TEST-ONLY]** are in scripts never executed by the production server — lower urgency.
- Items marked **⚠️ REPLIT CLAIM INCORRECT** flag places where the Replit analysis was wrong.

---

## Section 1 — Network Config

Flags, identifiers, and code logic that hardcode or default to testnet.

---

### 1.1 — `bitcoin-broadcast.ts` — Hardcoded `bitcoin.networks.testnet` [BLOCKER]

These three lines use the bitcoinjs-lib testnet network object for address encoding/decoding.
On mainnet they will fail to decode `bc1...` outputs and may silently produce wrong addresses.
They must be replaced with a dynamic call to the network config (e.g. `getNetworkParams().networkParams`).

> ⚠️ **REPLIT CLAIM INCORRECT:** Replit's summary says "Network selector & config: Already built — Just set env var." This is wrong. These three lines are hardcoded and are NOT controlled by the `BITCOIN_NETWORK` environment variable. They require code changes.

| # | File | Line | Current value | Change to |
|---|---|---|---|---|
| 1.1a | `server/services/bitcoin-broadcast.ts` | 154 | `const network = bitcoin.networks.testnet;` | `const network = getNetworkParams().networkParams;` |
| 1.1b | `server/services/bitcoin-broadcast.ts` | 396 | `const network = bitcoin.networks.testnet;` | `const network = getNetworkParams().networkParams;` |
| 1.1c | `server/services/bitcoin-broadcast.ts` | 501 | `const network = bitcoin.networks.testnet;` | `const network = getNetworkParams().networkParams;` |

---

### 1.2 — `escrow-setup.tsx` — Hardcoded `network: 'testnet'` passed to WASM [BLOCKER]

The WASM escrow library receives a literal `'testnet'` string regardless of server-side config.
It will generate `tb1...` addresses on mainnet until this is changed.

> ⚠️ **REPLIT CLAIM INCORRECT:** Replit's summary says setting `BITCOIN_NETWORK=mainnet` flips address generation. It does not — this is a client-side hardcoded string that the env var has no effect on.

| # | File | Line | Current value | Change to |
|---|---|---|---|---|
| 1.2 | `client/src/components/escrow-setup.tsx` | 75 | `network: 'testnet'` | `network: 'mainnet'` (or derive dynamically from `GET /api/network-info`) |

---

### 1.3 — `use-firefish-wasm.ts` — Default fallback to `'testnet'` [BLOCKER]

When a caller omits the `network` param the WASM hook silently defaults to testnet.
Even after fixing 1.2, this fallback is a safety net that must also be corrected.

> ⚠️ **REPLIT CLAIM INCORRECT:** Same issue as 1.2 — not controlled by env var.

| # | File | Line | Current value | Change to |
|---|---|---|---|---|
| 1.3 | `client/src/hooks/use-firefish-wasm.ts` | 168 | `params.network \|\| 'testnet'` | `params.network \|\| 'mainnet'` |

---

### 1.4 — `bitcoin-network-selector.ts` — `DEFAULT_NETWORK` is `'testnet4'`

This default is the last-resort fallback when `BITCOIN_NETWORK` is not set.
Setting the env var (Section 4) is the primary fix. This line is a defensive backstop.

| # | File | Line | Current value | Change to |
|---|---|---|---|---|
| 1.4 | `server/services/bitcoin-network-selector.ts` | 22 | `DEFAULT_NETWORK: NetworkType = 'testnet4'` | Consider `throw new Error(...)` on missing env var in production instead of silently defaulting |

---

### 1.5 — `bitcoin-rpc-client.ts` — Default `network` field is `'testnet'` [ENV]

Reads from env var; no code change required if `BITCOIN_NETWORK` is set.

| # | File | Line | Current value | Change to |
|---|---|---|---|---|
| 1.5 | `server/services/bitcoin-rpc-client.ts` | 53 | `process.env.BITCOIN_NETWORK \|\| 'testnet'` | Set `BITCOIN_NETWORK=mainnet` in env (see Section 4) |

---

### 1.6 — `routes.ts` — Network ternaries that default to `'testnet4'` [ENV]

These work correctly once `BITCOIN_NETWORK=mainnet` is set. No code change required,
but documented here so the pattern is understood.

| # | File | Line | Current value | Notes |
|---|---|---|---|---|
| 1.6a | `server/routes.ts` | 1319 | `BITCOIN_NETWORK === 'mainnet' ? 'mainnet' : 'testnet4'` | ✅ Correct when env var set |
| 1.6b | `server/routes.ts` | 1564 | `BITCOIN_NETWORK !== 'mainnet'` → prefix `'tb1'` | ✅ Correct when env var set |
| 1.6c | `server/routes.ts` | 3223–3224 | `ALLOW_TIMELOCK_BYPASS` when `BITCOIN_NETWORK === 'testnet4'` | ✅ Bypass disabled on mainnet automatically |

---

### 1.7 — `storage.ts` — Network ternary defaults to `'testnet4'` [ENV]

Same pattern as 1.6. Works correctly when env var is set.

| # | File | Line | Current value | Notes |
|---|---|---|---|---|
| 1.7 | `server/storage.ts` | 614 | `BITCOIN_NETWORK === 'mainnet' ? 'mainnet' : 'testnet4'` | ✅ Correct when env var set |

---

### 1.8 — `firefish-wasm-mock.ts` — Mock address generator uses network flag

The mock generates `tb1q...` addresses when `config.network === 'testnet'`. Confirm this
mock is only used in development/test, not in any production code path.

| # | File | Line | Current value | Change to |
|---|---|---|---|---|
| 1.8 | `client/src/lib/firefish-wasm-mock.ts` | 110–112 | `config.network === 'testnet' ? \`tb1q...\` : \`bc1q...\`` | ✅ Already conditional — verify mock is never loaded in the production build |

---

### 1.9 — Email templates — Hardcoded "TESTNET" strings in user-facing emails [BLOCKER]

> **Added from Replit analysis — missed in initial audit.**

Two places in server-side email/notification code hardcode the word "testnet" in copy that
is sent directly to users. On mainnet, the second instance actively tells users *not* to
send real BTC, which would cause loan failures.

| # | File | Line | Current value | Change to |
|---|---|---|---|---|
| 1.9a | `server/email.ts` | 185 | `"This is a Bitcoin TESTNET address (for testing purposes only)"` | Make conditional: show on testnet only, remove entirely on mainnet |
| 1.9b | `server/services/LendingWorkflowService.ts` | 360 | `"<p><strong>Network:</strong> Bitcoin Testnet</p>"` | Replace with dynamic network name from config |
| 1.9c | `server/services/LendingWorkflowService.ts` | 361 | `"⚠️ This is a Bitcoin testnet Native SegWit address. Do not send mainnet Bitcoin to this address."` | Remove entirely on mainnet — this will actively block users from funding |

---

### 1.10 — UI text — User-facing strings that reference testnet

| # | File | Line | Current value | Change to |
|---|---|---|---|---|
| 1.10a | `client/src/lib/key-vault.ts` | 240 | Recovery instructions reference "testnet4" wallet | Update to be network-agnostic |
| 1.10b | `client/src/components/deposit-instructions-card.tsx` | 318 | Placeholder `"tb1q... (testnet) or bc1q... (mainnet)"` | On mainnet, simplify to `"bc1q... (your Bitcoin mainnet address)"` |

---

## Section 2 — Bitcoin Addresses

Hardcoded `tb1q...` testnet addresses in production and example code.

---

### 2.1 — `bitcoin-broadcast.ts` — WASM-generated address handling [BLOCKER]

Covered by fix 1.1a–c. Once `bitcoin.networks.testnet` is replaced with dynamic params,
the address encode/decode will produce mainnet addresses automatically.

---

### 2.2 — `routes.ts` — Address prefix validator [ENV]

Already dynamic — works correctly when `BITCOIN_NETWORK=mainnet` is set (see 1.6b).
No code change required.

| # | File | Line | Current value | Notes |
|---|---|---|---|---|
| 2.2 | `server/routes.ts` | 1565 | `isTestnet ? 'tb1' : 'bc1'` | ✅ Correct when env var set |

---

### 2.3 — `bitcoin_escrow.py` — CLI argument defaults to testnet address [TEST-ONLY]

Python CLI tool defaults. These are example/default values for the command-line tool,
not used by the production server. Remove the defaults so mainnet runs require explicit addresses.

| # | File | Line | Current value | Change to |
|---|---|---|---|---|
| 2.3a | `bitcoin_escrow.py` | 742 | `default='tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'` | Remove default (require explicit argument) |
| 2.3b | `bitcoin_escrow.py` | 749 | `default='tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7'` | Remove default (require explicit argument) |

---

### 2.4 — `bitcoin_escrow_enhanced.py` — Hardcoded testnet addresses in demo function [TEST-ONLY]

Demo/example function at the bottom of the file. Not called by the production server.

| # | File | Lines | Current value | Change to |
|---|---|---|---|---|
| 2.4a | `bitcoin_escrow_enhanced.py` | 434, 456 | `borrower_return_address="tb1qw508d6..."` | Replace with `bc1...` mainnet example or remove defaults |
| 2.4b | `bitcoin_escrow_enhanced.py` | 435, 457 | `lender_return_address="tb1qrp33g0..."` | Replace with `bc1...` mainnet example or remove defaults |

---

### 2.5 — `TransactionTemplateService.ts` — Hardcoded testnet addresses in test fixture [TEST-ONLY]

These appear in a test/example fixture inside the service. Confirm they are only reachable
from test paths and not from any production API endpoint.

| # | File | Line | Current value | Change to |
|---|---|---|---|---|
| 2.5a | `server/services/TransactionTemplateService.ts` | 583 | `borrowerAddress: 'tb1qw508d6...'` | Replace with `bc1...` mainnet example or guard with `if (process.env.NODE_ENV === 'test')` |
| 2.5b | `server/services/TransactionTemplateService.ts` | 584 | `lenderAddress: 'tb1qrp33g0...'` | Replace with `bc1...` mainnet example or guard with `if (process.env.NODE_ENV === 'test')` |

---

### 2.6 — `test-outcome-engine.ts` — Hardcoded testnet escrow address [TEST-ONLY]

| # | File | Line | Current value | Change to |
|---|---|---|---|---|
| 2.6 | `server/test-outcome-engine.ts` | 31 | `escrowAddress: 'tb1q33z96z...'` | Replace with `bc1...` mainnet address or mark file as test-only and exclude from build |

---

### 2.7 — Test files — `tb1q...` addresses in unit tests [TEST-ONLY]

Unit tests use testnet addresses as mock data. These do not need to change for mainnet
deployment but will fail if tests are ever run against a live mainnet node.

| # | File | Lines | Current value | Notes |
|---|---|---|---|---|
| 2.7a | `server/__tests__/BitcoinEscrowService.test.ts` | 28, 39 | `'tb1qw508d6...'` | Test-only — acceptable for unit tests |
| 2.7b | `server/__tests__/LendingWorkflowService.test.ts` | 179, 220, 245, 269 | `'tb1qtest123'` | Test-only — acceptable for unit tests |

---

## Section 3 — API Endpoints

Hardcoded testnet URLs that must point to mainnet equivalents.

---

### 3.1 — `collateral-release-status.tsx` — Hardcoded `mempool.space/testnet4/tx/` link [BLOCKER]

This frontend component builds its explorer link from a literal string rather than the
`useNetworkExplorer` hook. Mainnet txids will link to the wrong explorer.

> ⚠️ **REPLIT CLAIM INCORRECT:** Replit says setting `BITCOIN_NETWORK=mainnet` "flips explorer URLs." It does not fix this line — it is a hardcoded string in client-side code, completely unaffected by the server env var.

| # | File | Line | Current value | Change to |
|---|---|---|---|---|
| 3.1 | `client/src/components/collateral-release-status.tsx` | 106 | `` `https://mempool.space/testnet4/tx/${txid}` `` | Use `useNetworkExplorer` hook: `getTxUrl(txid)` |

---

### 3.2 — `routes.ts` — Hardcoded `mempool.space/testnet4/tx/` in API response [BLOCKER]

The collateral release status API endpoint returns a hardcoded testnet4 URL to the frontend.
This is server-side code but also not controlled by `BITCOIN_NETWORK` — it is a literal string.

> ⚠️ **REPLIT CLAIM INCORRECT:** Same issue as 3.1 — this hardcoded string is not affected by the env var.

| # | File | Line | Current value | Change to |
|---|---|---|---|---|
| 3.2 | `server/routes.ts` | 6450 | `` `https://mempool.space/testnet4/tx/${loan.collateralReleaseTxid}` `` | Use `getExplorerUrl('tx', loan.collateralReleaseTxid)` from `bitcoin-network-selector.ts` |

---

### 3.3 — `testnet4-config.ts` — All API URLs are testnet4 [ENV — via network selector]

This file is correct as-is. The network selector picks `mainnet-config.ts` instead when
`BITCOIN_NETWORK=mainnet`. No change needed to this file.

| # | File | Lines | Current value | Notes |
|---|---|---|---|---|
| 3.3 | `server/services/testnet4-config.ts` | 18–28 | `mempool.space/testnet4/api/...` | ✅ Only used when BITCOIN_NETWORK=testnet4 |

---

### 3.4 — `mainnet-config.ts` — Mainnet API URLs [VERIFY]

Verify the mainnet config URLs are correct before go-live.

| # | File | Line | Current value | Expected |
|---|---|---|---|---|
| 3.4a | `server/services/mainnet-config.ts` | 21 | `https://mempool.space/api` | ✅ Correct mainnet base URL |
| 3.4b | `server/services/mainnet-config.ts` | 37 | `bech32: 'bc'` | ✅ Correct mainnet bech32 prefix |
| 3.4c | `server/services/mainnet-config.ts` | 39 | `public: 0x0488B21E` (xpub) | ✅ Correct mainnet BIP32 version |
| 3.4d | `server/services/mainnet-config.ts` | 40 | `private: 0x0488ADE4` (xprv) | ✅ Correct mainnet BIP32 version |

---

### 3.5 — Test / demo scripts — hardcoded testnet explorer URLs [TEST-ONLY]

Not reachable from production. Archive or update after mainnet launch.

| # | File | Line | Current value | Notes |
|---|---|---|---|---|
| 3.5a | `server/testnet-broadcast-real.test-only.ts` | 41 | `mempool.space/testnet4/api/address/` | Test-only |
| 3.5b | `server/testnet-broadcast-real.test-only.ts` | 50 | `mempool.space/testnet4/api/tx` | Test-only |
| 3.5c | `server/testnet-broadcast-real.test-only.ts` | 232, 240 | `mempool.space/testnet/tx/` and `mempool.space/testnet/api/tx/` | Test-only (also internally inconsistent: mixes testnet and testnet4 URLs) |
| 3.5d | `server/testnet-broadcast-real.test-only.ts` | 258 | `mempool.space/testnet4/tx/` | Test-only |
| 3.5e | `server/testnet4-e2e.ts` | 414, 464 | `mempool.space/testnet4` faucet link | Test-only |
| 3.5f | `server/testnet-real-e2e.ts` | 186 | `mempool.space/testnet4/api/tx` | Test-only |
| 3.5g | `test_multisig_demo.py` | 86, 130 | `blockstream.info/testnet/address/` | Test-only |
| 3.5h | `spend_from_multisig.py` | 28 | `blockstream.info/testnet/address/` | Test-only |

---

### 3.6 — Test files — `blockstream.info/testnet/tx/` in unit test assertions [TEST-ONLY]

| # | File | Line | Current value | Notes |
|---|---|---|---|---|
| 3.6a | `server/__tests__/BitcoinEscrowService.test.ts` | 56, 67 | `blockstream.info/testnet/tx/` | Update assertions if tests are run against mainnet |
| 3.6b | `server/__tests__/LendingWorkflowService.test.ts` | 186 | `blockstream.info/testnet/tx/` | Update assertions if tests are run against mainnet |

---

## Section 4 — Environment Variables

Every environment variable that must be set or changed for mainnet.
These are set in Replit Secrets (production) and `.env` (local development).

---

### 4.1 — Primary network switch

| Variable | Current value | Required value | Where set |
|---|---|---|---|
| `BITCOIN_NETWORK` | Not set (defaults to `testnet4`) | `mainnet` | Replit Secrets |

**What setting this variable DOES fix:**
- `bitcoin-network-selector.ts` returns mainnet config
- `mainnet-config.ts` is used (mempool.space mainnet API, bech32 `bc`, BIP32 xpub/xprv)
- Address prefix validation requires `bc1...` instead of `tb1...`
- Timelock bypass is disabled automatically
- Mainnet safety limits are enforced
- Fee estimator uses mainnet fallback rates

**What setting this variable does NOT fix (code changes required):**
- `bitcoin-broadcast.ts:154, 396, 501` — `bitcoin.networks.testnet` (items 1.1a–c)
- `escrow-setup.tsx:75` — `network: 'testnet'` hardcoded (item 1.2)
- `use-firefish-wasm.ts:168` — `|| 'testnet'` fallback (item 1.3)
- `collateral-release-status.tsx:106` — hardcoded `testnet4` explorer URL (item 3.1)
- `routes.ts:6450` — hardcoded `testnet4` explorer URL (item 3.2)
- `email.ts:185` and `LendingWorkflowService.ts:361` — hardcoded "TESTNET" email copy (items 1.9a–c)

---

### 4.2 — Bitcoin RPC node

| Variable | Current default | Required value | Source line |
|---|---|---|---|
| `BITCOIN_RPC_URL` | `http://localhost:18332` | `http://localhost:8332` | `bitcoin-rpc-client.ts:50` |
| `BITCOIN_RPC_USER` | `bitcoin` | Set to real node user | `bitcoin-rpc-client.ts:51` |
| `BITCOIN_RPC_PASS` | `password` | Set to real node password | `bitcoin-rpc-client.ts:52` |

Note: Port `18332` is the Bitcoin testnet RPC port. Port `8332` is mainnet.
If using mempool.space API only (no local node), these can remain unset — the app falls back to the public API.

---

### 4.3 — Platform signing key [CRITICAL]

| Variable | Current value | Required value | Source |
|---|---|---|---|
| `PLATFORM_SIGNING_KEY` | Testnet key (per `MAINNET_LAUNCH_CHECKLIST.md:13`) | New mainnet key — generate fresh, never used on testnet | Replit Secrets |

The platform private key is used to derive the platform public key embedded in every escrow's
2-of-3 multisig script. Using the testnet key on mainnet would generate a different public key
and break all escrow address generation.

**The mainnet key must be brand new** — do not reuse the testnet key or any key that has ever
been stored on an internet-connected machine. Generate it on an air-gapped machine if possible.

Steps:
1. Generate a new 32-byte (64-char hex) private key using a cryptographically secure method.
2. Derive the corresponding compressed public key — record it separately.
3. Store the private key in Replit Secrets as `PLATFORM_SIGNING_KEY`.
4. Back it up in a secure offline location — losing it means being unable to co-sign any active loan.
5. On first mainnet escrow creation, verify the generated escrow address starts with `bc1`.

---

### 4.4 — Platform encryption key [CRITICAL]

> **Added from Replit analysis — missed in initial audit.**

| Variable | Current value | Required value | Source |
|---|---|---|---|
| `PLATFORM_ENCRYPTION_KEY` | Not set — falls back to hardcoded string | 32-byte (base64) randomly generated key | `EncryptionService.ts:15–21` |

**Why this is critical:** `EncryptionService.ts` encrypts every lender's platform-operated
private key before storing it in the database. When `PLATFORM_ENCRYPTION_KEY` is not set,
the service falls back to a deterministic key derived from the hardcoded string
`reconquest-testnet-dev-key-v1` (line 20). This string is in the public GitHub repository.
On mainnet, anyone who reads the source code could decrypt every lender key stored in the database.

The warning log `"[EncryptionService] WARNING: Using fallback encryption key"` **must never
appear** in production logs. If it does, the system is using the insecure fallback.

Steps:
1. Generate a random 32-byte key: `openssl rand -base64 32`
2. Store it in Replit Secrets as `PLATFORM_ENCRYPTION_KEY`.
3. Back it up securely — losing it means being unable to decrypt any existing lender key in the database, which would lock all active loans.
4. Verify on startup that the warning log does NOT appear.

---

### 4.5 — Platform BTC address [CRITICAL]

> **Added from Replit analysis — missed in initial audit.**

| Variable | Current value | Required value | Source |
|---|---|---|---|
| `PLATFORM_BTC_ADDRESS` | Not set (empty string fallback) | A real mainnet `bc1...` address you control | `routes.ts:1648`, `LtvMonitoringService.ts:257` |

**Why this is critical:** When a lender's default preference is `'eur'`, the collateral on
default/liquidation is sent to this platform address for fiat conversion before being paid
out to the lender. It is referenced in 5+ places across `routes.ts` and `LtvMonitoringService.ts`.

If this is not set and a loan defaults:
- The PSBT template generation will fail with HTTP 400 (`"PLATFORM_BTC_ADDRESS env var"`)
- The LTV monitor will skip the liquidation entirely and send an emergency email alert
- The loan will be in limbo — past the liquidation threshold but unresolvable

Steps:
1. Generate or designate a mainnet `bc1...` address you control.
2. Store it in Replit Secrets as `PLATFORM_BTC_ADDRESS`.
3. Verify the address is a valid mainnet bech32 address before setting it.

---

### 4.6 — Safety limit overrides (optional)

These are already set to conservative mainnet defaults in `mainnet-safety-limits.ts`.
Only change them after discussion with stakeholders.

| Variable | Current default | Notes |
|---|---|---|
| `MAX_LOAN_AMOUNT_USD` | `10000` | Maximum loan value in USD |
| `MAX_BTC_COLLATERAL` | `0.2` | Maximum BTC per loan |
| `MAX_LOANS_PER_DAY` | `10` | Rolling 24-hour limit |
| `MAX_TOTAL_ACTIVE_BTC` | `2.0` | Total BTC across all active loans |
| `OVERRIDE_SAFETY_LIMITS` | `false` | Never set to `true` in production |

---

### 4.7 — Application URL

| Variable | Current value | Required value |
|---|---|---|
| `APP_URL` | `https://www.reconquestp2p.com` (per `email.ts:250`) | ✅ Already set to production URL — verify |

---

## Section 5 — Security Checks

Things that MUST be verified before going live. These are not code changes — they are
verification steps that require human review or live testing.

---

### 5.1 — Platform signing key verification [CRITICAL]

- [ ] New mainnet `PLATFORM_SIGNING_KEY` generated securely (air-gapped if possible)
- [ ] Derive the 33-byte compressed public key from it — confirm it starts with `02` or `03` and is 66 hex chars
- [ ] Key stored in Replit Secrets and backed up offline
- [ ] Create a test escrow on mainnet staging — verify the escrow address starts with `bc1`
- [ ] Confirm the same public key is embedded in the returned `witnessScript`

---

### 5.2 — Platform encryption key verification [CRITICAL]

- [ ] `PLATFORM_ENCRYPTION_KEY` set to a fresh randomly generated 32-byte base64 key
- [ ] Key stored in Replit Secrets and backed up offline
- [ ] On server startup, confirm the log line `"[EncryptionService] WARNING: Using fallback encryption key"` does NOT appear
- [ ] Create a test lender key encryption/decryption cycle — confirm it works with the new key

---

### 5.3 — No testnet key material in production secrets

- [ ] Confirm `PLATFORM_SIGNING_KEY` in Replit Secrets has been replaced (old testnet key began `18a4153911...` per the launch checklist)
- [ ] Confirm `PLATFORM_ENCRYPTION_KEY` is set to a new key, not the hardcoded `reconquest-testnet-dev-key-v1` fallback
- [ ] Confirm `BITCOIN_NETWORK=mainnet` is in Replit Secrets, not `testnet4`

---

### 5.4 — Platform BTC address configured

- [ ] `PLATFORM_BTC_ADDRESS` set to a valid mainnet `bc1...` address
- [ ] Test: trigger PSBT template generation on a loan with `lenderDefaultPreference='eur'` — confirm it does not return a 400 error about missing platform address
- [ ] Confirm the address actually receives funds when tested with a small amount

---

### 5.5 — Timelock enforcement

On mainnet, `ALLOW_TIMELOCK_BYPASS` in `server/routes.ts:3223` must evaluate to `false`.
It is `true` when `NODE_ENV === 'development'` OR `BITCOIN_NETWORK === 'testnet4'`.

- [ ] Confirm `NODE_ENV=production` in Replit production environment
- [ ] Confirm `BITCOIN_NETWORK=mainnet` (not `testnet4`)
- [ ] Test: attempt a recovery transaction before timelock expires — confirm it returns HTTP 403

---

### 5.6 — Address validation rejects testnet addresses

The route at `server/routes.ts:1564–1566` rejects addresses that don't match the current
network prefix.

- [ ] Test: submit a loan deposit with a `tb1...` borrower return address — confirm rejection
- [ ] Test: submit with a valid `bc1...` address — confirm it is accepted

---

### 5.7 — Mainnet safety limits are active

`mainnet-safety-limits.ts` only enforces limits when `network === 'mainnet'`.

- [ ] Confirm `isMainnet()` returns `true` in production logs on startup
- [ ] Test: attempt to create a loan exceeding `MAX_LOAN_AMOUNT_USD` — confirm rejection
- [ ] Test: attempt to create a loan exceeding `MAX_BTC_COLLATERAL` — confirm rejection

---

### 5.8 — Bitcoin broadcast service uses correct network params

After fixing items 1.1a–c:

- [ ] Code review: confirm all three `bitcoin.networks.testnet` lines are replaced
- [ ] Test: sign a collateral release PSBT — confirm the decoded output address is a valid `bc1...` address
- [ ] Test: broadcast a transaction to mainnet mempool — confirm it is accepted

---

### 5.9 — Explorer links point to mainnet

After fixing items 3.1 and 3.2:

- [ ] Submit a loan deposit and verify all UI explorer links point to `https://mempool.space/...` (no `/testnet4/`)
- [ ] Check email notifications — confirm transaction URLs use `mempool.space` mainnet
- [ ] Trigger a collateral release — confirm the status component links to `https://mempool.space/tx/{txid}`

---

### 5.10 — Email templates contain no testnet warnings

After fixing items 1.9a–c:

- [ ] Trigger the deposit instruction email — confirm it no longer says "TESTNET address"
- [ ] Confirm the "Do not send mainnet Bitcoin to this address" warning is gone
- [ ] Confirm the network label in the email body shows "Bitcoin Mainnet" or is omitted

---

### 5.11 — Fee rates are mainnet-appropriate

- [ ] Confirm the fee estimator is returning reasonable mainnet sat/vB rates (not testnet fallback of 2 sat/vB)
- [ ] Mainnet fallback in `fee-estimator.ts` is 20/10/5/2/1 sat/vB — verify these are acceptable for the loan duration

---

### 5.12 — Private key custody (client-side only)

- [ ] Confirm no private key material is logged server-side
- [ ] Confirm no private key material appears in any API response
- [ ] Confirm the WASM module is the only code that handles raw private keys
- [ ] Review browser devtools: confirm keys are not persisted to `localStorage` or `sessionStorage` in the production build

---

### 5.13 — RPC node sync (if using local node)

If `BITCOIN_RPC_URL` points to a local Bitcoin Core node:

- [ ] Confirm `bitcoin-cli getblockchaininfo` shows `"chain": "main"`
- [ ] Confirm node is fully synced (headers == blocks)
- [ ] Confirm `txindex=1` is set in `bitcoin.conf` if transaction lookup is needed

---

## Section 6 — Operational Items

> **Added from Replit analysis — missed in initial audit.**
> These are not code changes but decisions and processes that must be resolved before launch.

---

### 6.1 — Database: testnet loan data must not bleed into mainnet views [OPERATIONAL]

The database currently contains testnet loans with testnet escrow addresses, testnet PSBTs,
and testnet transaction IDs. When the app runs on mainnet, these must not appear in dashboards,
loan listings, or admin views.

The `networkType` column already exists in the schema and defaults to `testnet4`. New mainnet
loans will be tagged `mainnet`. The filtering must be confirmed to be active everywhere.

Options (choose one before launch):
- **Option A (Recommended):** Verify all dashboard/listing queries filter by `networkType = currentNetwork`. Old testnet loans stay in the DB, just hidden.
- **Option B:** Start with a fresh database for mainnet launch (cleanest, but loses test history).
- **Option C:** Archive testnet data to a backup table before launch.

Action items:
- [ ] Audit all queries in `storage.ts` and `routes.ts` that return loan lists — confirm they filter by `networkType`
- [ ] Check the admin dashboard — confirm testnet loans do not appear when `BITCOIN_NETWORK=mainnet`
- [ ] Check the borrower/lender dashboards — confirm the same
- [ ] Decide on Option A/B/C and execute before launch

---

### 6.2 — LTV monitoring and auto-liquidation: review thresholds before go-live [OPERATIONAL]

The LTV monitor runs every 60 seconds and uses real EUR/BTC prices. On mainnet, an
auto-liquidation means real BTC moves. The current thresholds should be explicitly reviewed.

- [ ] Review liquidation thresholds (75%, 85%, 95% LTV) — confirm they are appropriate for launch
- [ ] Consider requiring manual approval for the first N mainnet liquidations before enabling fully automatic liquidation
- [ ] Confirm the admin stress-test endpoint (`/api/admin/stress-test` or similar) is secured or disabled on mainnet — it should not be callable by non-admin users in production
- [ ] Test the complete liquidation flow end-to-end on a test loan before enabling on mainnet
- [ ] Confirm `PLATFORM_BTC_ADDRESS` is set (see 4.5) so the LTV monitor does not silently skip liquidations

---

### 6.3 — Collateral release cron: decide automatic vs manual [OPERATIONAL]

The auto-release cron job in `routes.ts` is currently commented out and relies on manual
admin trigger or lender receipt confirmation.

- [ ] Decide: enable automatic collateral release on mainnet, or keep it manual?
- [ ] If enabling: uncomment the cron, test thoroughly, and document the release conditions
- [ ] If keeping manual: document the admin workflow for releasing collateral so it is not missed
- [ ] Either way: test the complete collateral release flow end-to-end before launch

---

### 6.4 — Admin accounts and access control [OPERATIONAL]

- [ ] Confirm all admin accounts have strong passwords
- [ ] Confirm OTP/2FA is enabled for all admin accounts
- [ ] Confirm database backups are configured and tested
- [ ] Document recovery procedures: what happens if `PLATFORM_SIGNING_KEY` is lost? If `PLATFORM_ENCRYPTION_KEY` is lost?

---

## Section 7 — Testing Plan

Ordered verification steps to confirm the migration is correct. Run these in sequence
after all code changes and env var updates from Sections 1–4 are complete.

---

### 7.1 — Environment variable smoke test

**Goal:** Confirm the server boots on mainnet config with no fallback warnings.

Steps:
1. Start the server with all mainnet env vars set.
2. Check startup logs — confirm the red mainnet banner from `bitcoin-network-selector.ts:100–108` appears.
3. Confirm `"[EncryptionService] WARNING: Using fallback encryption key"` does NOT appear.
4. Call `GET /api/network-info` — confirm response contains:
   - `"network": "mainnet"`
   - `"isMainnet": true`
   - `"bech32Prefix": "bc"`
   - `"explorerBaseUrl"` containing `mempool.space` without `/testnet4/`

Expected log: `🔴 BITCOIN NETWORK: MAINNET`

---

### 7.2 — Address generation test

**Goal:** Confirm WASM generates `bc1...` escrow addresses, not `tb1...`.

Steps:
1. Create a new loan as a borrower.
2. Proceed through the key generation / signing ceremony flow.
3. Inspect the escrow address returned — it **must** start with `bc1`.
4. Paste the address into `https://mempool.space/address/<address>` — it should resolve as a valid mainnet P2WSH address.

---

### 7.3 — Address validation test

**Goal:** Confirm the server rejects testnet addresses on mainnet.

Steps:
1. In the deposit instructions flow, enter a `tb1...` borrower return address.
2. Submit — confirm the server returns an error like `"Address must start with bc1"`.
3. Enter a valid `bc1...` address — confirm it is accepted.

---

### 7.4 — API endpoint test

**Goal:** Confirm all blockchain API calls go to mainnet mempool.space.

Steps:
1. Enable HTTP request logging or use browser devtools network tab.
2. Trigger a UTXO check on an escrow address.
3. Confirm the outgoing request URL is `https://mempool.space/api/address/{address}/utxo` (no `/testnet4/`).
4. Confirm a fee estimate request hits `https://mempool.space/api/v1/fees/recommended`.

---

### 7.5 — Explorer link test

**Goal:** Confirm all explorer links in the UI and emails point to mainnet.

Steps:
1. Complete a full loan deposit flow.
2. Check the funding tracker — the "View on Explorer" link must point to `https://mempool.space/address/bc1...`.
3. Check email notifications — confirm transaction URLs use `mempool.space` without `/testnet4/`.
4. Trigger a collateral release — confirm the status component links to `https://mempool.space/tx/{txid}`.

---

### 7.6 — Email content test

**Goal:** Confirm email templates contain no testnet warnings that would confuse mainnet users.

Steps:
1. Trigger the deposit instructions email on a test loan.
2. Confirm the email does NOT contain any of:
   - "TESTNET"
   - "Do not send mainnet Bitcoin to this address"
   - "Bitcoin Testnet"
3. Confirm the escrow address in the email starts with `bc1`.

---

### 7.7 — Timelock enforcement test

**Goal:** Confirm timelocks are enforced and cannot be bypassed.

Steps:
1. Create a loan with a future timelock date.
2. Attempt to trigger recovery before the timelock expires.
3. Confirm the response is HTTP 403 with a message indicating the timelock has not expired.
4. Check the `daysRemaining` value in the response is correct.

---

### 7.8 — Safety limits test

**Goal:** Confirm mainnet safety limits reject oversized loans.

Steps:
1. Attempt to create a loan with `loanAmount > MAX_LOAN_AMOUNT_USD` (default: $10,000).
2. Confirm the server returns a 400-level error.
3. Attempt to create a loan with `collateralBtc > MAX_BTC_COLLATERAL` (default: 0.2 BTC).
4. Confirm the server returns a 400-level error.

---

### 7.9 — Dashboard data isolation test

**Goal:** Confirm testnet loans do not appear in mainnet views.

Steps:
1. Boot the server with `BITCOIN_NETWORK=mainnet`.
2. Check the admin dashboard, borrower dashboard, and lender dashboard.
3. Confirm no testnet loans (with `tb1...` addresses or `networkType=testnet4`) are visible.
4. Create a new mainnet loan — confirm it appears in all relevant views.

---

### 7.10 — Full end-to-end mainnet flow (final gate)

**Goal:** Confirm a complete loan lifecycle works on mainnet with real (small) funds.

Steps:
1. Create a loan offer as a lender.
2. Accept the loan as a borrower.
3. Generate escrow — confirm `bc1...` address, witness script, and PSBTs are produced.
4. Deposit a very small amount of mainnet BTC to the escrow address (e.g. 0.0001 BTC).
5. Confirm the funding tracker detects the deposit and shows confirmations.
6. Confirm 3-confirmation threshold is met and loan status updates.
7. Trigger collateral release — confirm the signed PSBT is broadcast to mainnet.
8. Confirm the collateral arrives at the borrower return address.
9. Check the full transaction on `https://mempool.space/tx/{txid}`.

---

## Master Checklist

### Code Changes (Blockers — must fix before any mainnet transaction)

- [ ] `server/services/bitcoin-broadcast.ts:154` — replace `bitcoin.networks.testnet`
- [ ] `server/services/bitcoin-broadcast.ts:396` — replace `bitcoin.networks.testnet`
- [ ] `server/services/bitcoin-broadcast.ts:501` — replace `bitcoin.networks.testnet`
- [ ] `client/src/components/escrow-setup.tsx:75` — replace `network: 'testnet'`
- [ ] `client/src/hooks/use-firefish-wasm.ts:168` — replace `|| 'testnet'` fallback
- [ ] `client/src/components/collateral-release-status.tsx:106` — replace hardcoded testnet4 explorer URL
- [ ] `server/routes.ts:6450` — replace hardcoded testnet4 explorer URL
- [ ] `server/email.ts:185` — remove/conditionalise "TESTNET address" warning
- [ ] `server/services/LendingWorkflowService.ts:360–361` — remove testnet network label and "do not send mainnet BTC" warning

### Environment Variables (must set before launch)

- [ ] `BITCOIN_NETWORK=mainnet`
- [ ] `PLATFORM_SIGNING_KEY=<new mainnet key — never used on testnet>`
- [ ] `PLATFORM_ENCRYPTION_KEY=<32-byte base64 randomly generated key>`
- [ ] `PLATFORM_BTC_ADDRESS=<real mainnet bc1... address you control>`
- [ ] `BITCOIN_RPC_URL=http://localhost:8332` (if using local node)
- [ ] `BITCOIN_RPC_USER=<secure value>` (if using local node)
- [ ] `BITCOIN_RPC_PASS=<secure value>` (if using local node)

### Operational Decisions (must resolve before launch)

- [ ] Database testnet data strategy decided and implemented (Section 6.1)
- [ ] LTV liquidation thresholds reviewed and confirmed (Section 6.2)
- [ ] Collateral release cron: automatic vs manual decided (Section 6.3)
- [ ] Admin accounts secured with 2FA (Section 6.4)
- [ ] Database backup configured and tested (Section 6.4)
- [ ] Key loss recovery procedures documented (Section 6.4)

---

| Category | Items | Status |
|---|---|---|
| Code blockers | 9 | ⬜ Not started |
| Environment variables | 7 | ⬜ Not started |
| Security verifications | 13 | ⬜ Not started |
| Operational decisions | 6 | ⬜ Not started |
| Test-only / post-launch | ~15 | ⬜ Defer |

---

*Document created: 2026-02-21*
*Cross-referenced with Replit AI analysis: 2026-02-21*
*Four items added from Replit analysis (4.4, 4.5, 1.9, Section 6); three Replit claims corrected (1.1, 1.2/1.3, 3.1/3.2).*
