---
name: prelaunch-test-runner
description: >
  Activated when the user says "run pre-launch tests", "test mainnet migration",
  "verify mainnet is working", "run the testing plan", "7.1", "7.2", or asks
  to verify any of the 10 test steps before going live. Walks through all
  10 ordered verification steps from Section 7 of the Reconquest mainnet
  migration plan. Must only be run AFTER all 9 code blockers are fixed and
  all 7 environment variables are set.
allowed-tools: Read, Bash(curl:*), Bash(grep:*), Bash(node:*), Bash(npm:*)
---

# Pre-Launch Test Runner Skill

You are the final gatekeeper before Reconquest goes live on Bitcoin mainnet.
Run these 10 tests in exact order — each one builds on the previous.

Before starting, confirm with the user:
1. All 9 code blockers from the migration plan are fixed (network-blocker-fixer skill)
2. All 7 environment variables are set in Replit Secrets (env-vars-checker skill)
3. All 13 security checks are passed (security-verifier skill)

If any of the above are not done → STOP and redirect to the appropriate skill first.

---

## TEST 7.1 — Environment Variable Smoke Test

**Goal:** Server boots on mainnet config with no fallback warnings.

```bash
# Call the network info endpoint
curl -s http://localhost:5000/api/network-info | node -e "
const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  const data = JSON.parse(chunks.join(''));
  console.log('network:', data.network, data.network === 'mainnet' ? '✅' : '❌ WRONG');
  console.log('isMainnet:', data.isMainnet, data.isMainnet === true ? '✅' : '❌ WRONG');
  console.log('bech32Prefix:', data.bech32Prefix, data.bech32Prefix === 'bc' ? '✅' : '❌ WRONG');
  const url = data.explorerBaseUrl || '';
  console.log('explorerBaseUrl has no testnet4:', !url.includes('testnet4') ? '✅' : '❌ STILL HAS testnet4');
});
"
Also check server startup logs for:

✅ Must see: 🔴 BITCOIN NETWORK: MAINNET

❌ Must NOT see: [EncryptionService] WARNING: Using fallback encryption key

TEST 7.2 — Address Generation Test
Goal: WASM generates bc1... escrow addresses, not tb1....

Manual steps (cannot be automated — requires UI interaction):

Open the app in browser

Create a new loan as a borrower

Proceed through the key generation / escrow setup flow

Inspect the escrow address shown on screen

Expected: address starts with bc1 (exactly 62 characters)
Failure: address starts with tb1 → blocker 1.2 or 1.3 not fixed

Verification:

bash
# After creating a test loan, query the DB for the escrow address
curl -s http://localhost:5000/api/loans?status=funding | node -e "
const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  const loans = JSON.parse(chunks.join(''));
  loans.forEach(l => {
    if (l.escrowAddress) {
      const ok = l.escrowAddress.startsWith('bc1');
      console.log('Loan', l.id, '- escrow:', l.escrowAddress.substring(0,10) + '...', ok ? '✅' : '❌ TESTNET ADDRESS');
    }
  });
});
"
TEST 7.3 — Address Validation Test
Goal: Server rejects testnet addresses on mainnet.

bash
# Test 1: submit a tb1 address — must be rejected
curl -s -X POST http://localhost:5000/api/loans/1/deposit-address \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"borrowerReturnAddress":"tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"}' \
  | node -e "
    const chunks = [];
    process.stdin.on('data', c => chunks.push(c));
    process.stdin.on('end', () => {
      const r = JSON.parse(chunks.join(''));
      const rejected = r.error && (r.error.includes('bc1') || r.error.includes('mainnet') || r.error.includes('prefix'));
      console.log('Testnet address rejected:', rejected ? '✅' : '❌ NOT REJECTED — validation broken');
    });
  "
TEST 7.4 — API Endpoint Network Test
Goal: All blockchain API calls go to mainnet mempool.space — no testnet4 in URLs.

bash
# Scan the entire server codebase for any remaining testnet4 API URLs
# that would be called at runtime (not test-only files)
grep -rn "mempool.space/testnet4\|blockstream.info/testnet" server/ \
  --include="*.ts" \
  --exclude-dir="__tests__" \
  | grep -v "test-only\|\.test\.\|testnet-broadcast\|testnet4-e2e\|testnet-real"
Expected: no output (all testnet4 URLs are in test-only files, not production code).

TEST 7.5 — Explorer Link Test
Goal: All explorer links in the UI point to mainnet mempool.space.

bash
# Check frontend components for any remaining testnet4 explorer links
grep -rn "testnet4\|blockstream.info/testnet" client/src/ --include="*.tsx" --include="*.ts"
Expected: no output.

Also check the API response at routes.ts:6450 (after fix):

bash
grep -n "testnet4" server/routes.ts | grep -v "//\|test\|BITCOIN_NETWORK"
Expected: no output (or only commented-out lines).

TEST 7.6 — Email Content Test
Goal: Email templates contain no testnet warnings.

bash
# Check server-side email templates
grep -rn "TESTNET\|testnet\|Do not send mainnet\|testnet4" server/email.ts server/services/LendingWorkflowService.ts \
  | grep -v "//\|isTestnet\|!isMainnet\|conditional"
Expected: no unconditional testnet strings remaining.

Manual step: trigger a deposit instructions email on a test loan and read it.
Confirm it does NOT contain:

"TESTNET address"

"Do not send mainnet Bitcoin to this address"

"Bitcoin Testnet"

Any tb1... address

TEST 7.7 — Timelock Enforcement Test
Goal: Timelocks cannot be bypassed on mainnet.

bash
# Confirm bypass is disabled
grep -n "ALLOW_TIMELOCK_BYPASS" server/routes.ts
The bypass must evaluate to false when:

NODE_ENV=production

BITCOIN_NETWORK=mainnet

Manual test: attempt a recovery transaction before timelock expires → must return HTTP 403.

TEST 7.8 — Safety Limits Test
Goal: Mainnet safety limits reject oversized loans.

bash
# Confirm limits are loaded
curl -s http://localhost:5000/api/network-info | node -e "
const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  const data = JSON.parse(chunks.join(''));
  console.log('Safety limits active:', data.isMainnet ? '✅' : '❌');
});
"
Manual test:

Try to create a loan above $10,000 → must be rejected

Try to create a loan above 0.2 BTC collateral → must be rejected

TEST 7.9 — Dashboard Data Isolation Test
Goal: Testnet loans do not appear in mainnet dashboards.

bash
# Check that loan queries filter by networkType
grep -n "networkType\|network_type" server/storage.ts | head -20
grep -n "networkType\|network_type" server/routes.ts | head -20
Expected: loan list queries include a networkType filter.

Manual test:

Boot with BITCOIN_NETWORK=mainnet

Check admin dashboard — no tb1... addresses should appear

Check borrower/lender dashboards — same

Create a new mainnet loan — it should appear

TEST 7.10 — Full End-to-End Mainnet Flow [FINAL GATE]
Goal: Complete loan lifecycle works on mainnet with real (tiny) funds.

⚠️ This test uses real Bitcoin. Use the smallest possible amount (0.0001 BTC).

Steps (manual — walk the user through each one):

Create a loan offer as a lender

Accept the loan as a borrower

Generate escrow → confirm bc1... address and PSBTs are produced

Deposit 0.0001 BTC to the escrow address

Confirm the funding tracker detects the deposit

Confirm 3-confirmation threshold is met and loan status updates

Trigger collateral release

Confirm signed PSBT is broadcast to mainnet

Confirm collateral arrives at borrower return address

Verify the transaction at https://mempool.space/tx/{txid}

This is the only test that cannot be automated. Walk through it together with the user.

Final Report Template
After all tests, output this summary:

text
RECONQUEST MAINNET MIGRATION — TEST RESULTS
============================================
7.1 Env smoke test:          [ ✅ / ❌ ]
7.2 Address generation:      [ ✅ / ❌ ]
7.3 Address validation:      [ ✅ / ❌ ]
7.4 API endpoints:           [ ✅ / ❌ ]
7.5 Explorer links:          [ ✅ / ❌ ]
7.6 Email content:           [ ✅ / ❌ ]
7.7 Timelock enforcement:    [ ✅ / ❌ ]
7.8 Safety limits:           [ ✅ / ❌ ]
7.9 Data isolation:          [ ✅ / ❌ ]
7.10 End-to-end flow:        [ ✅ / ❌ ]

RESULT: X/10 passed

RECOMMENDATION: [ GO LIVE / DO NOT GO LIVE — fix items above first ]
Do not output "GO LIVE" unless all 10 tests pass.