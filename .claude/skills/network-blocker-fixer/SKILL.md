---
name: network-blocker-fixer
description: >
  Activated when the user mentions fixing testnet blockers, migrating to mainnet,
  hardcoded testnet strings, bitcoin.networks.testnet, escrow-setup network param,
  use-firefish-wasm network fallback, or any of the 9 code blockers from the
  mainnet migration plan. Knows the exact file paths and line numbers for all
  9 blockers in the Reconquest project.
---

# Network Blocker Fixer Skill

You are helping fix the 9 code-level BLOCKER items that must be resolved before
Reconquest can go live on Bitcoin mainnet. These are hardcoded testnet strings
that are NOT fixed by setting the BITCOIN_NETWORK environment variable — they
require actual code changes.

## The 9 Blockers — Exact Locations

### BLOCKER GROUP 1 — bitcoin-broadcast.ts (3 fixes, same pattern)
File: `server/services/bitcoin-broadcast.ts`
- Line 154: `const network = bitcoin.networks.testnet;`
- Line 396: `const network = bitcoin.networks.testnet;`
- Line 501: `const network = bitcoin.networks.testnet;`

Fix for all three:
```ts
import { getNetworkParams } from './bitcoin-network-selector';
const network = getNetworkParams().networkParams;
Important: getNetworkParams is already in the codebase — do not create a new function.
Apply the same fix to all three lines. Do not change anything else in the file.

BLOCKER GROUP 2 — escrow-setup.tsx (client-side WASM network param)
File: client/src/components/escrow-setup.tsx

Line 75: network: 'testnet'

Fix: Replace with a dynamic value fetched from the server.
The app already has a GET /api/network-info endpoint that returns
{ network: 'mainnet' | 'testnet4', isMainnet: boolean, bech32Prefix: string }.

Recommended fix:

Add a query using TanStack Query to fetch /api/network-info at component mount

Use the returned network value instead of the hardcoded string

Show a loading state while the network info is being fetched

If fetch fails, default to throwing an error — never silently fall back to testnet

BLOCKER GROUP 3 — use-firefish-wasm.ts (silent testnet fallback)
File: client/src/hooks/use-firefish-wasm.ts

Line 168: params.network || 'testnet'

Fix:

ts
// Before:
params.network || 'testnet'

// After:
params.network || (() => { throw new Error('[use-firefish-wasm] network param is required — do not allow silent testnet fallback'); })()
This ensures no caller can accidentally use the wrong network.

BLOCKER GROUP 4 — collateral-release-status.tsx (hardcoded explorer URL)
File: client/src/components/collateral-release-status.tsx

Line 106: https://mempool.space/testnet4/tx/${txid}

Fix: Use the existing useNetworkExplorer hook.

ts
// Before:
`https://mempool.space/testnet4/tx/${txid}`

// After:
const { getTxUrl } = useNetworkExplorer();
getTxUrl(txid)
The useNetworkExplorer hook is already in the codebase — do not create a new one.

BLOCKER GROUP 5 — routes.ts (hardcoded explorer URL in API response)
File: server/routes.ts

Line 6450: https://mempool.space/testnet4/tx/${loan.collateralReleaseTxid}

Fix: Use the existing helper from bitcoin-network-selector.ts.

ts
// Before:
`https://mempool.space/testnet4/tx/${loan.collateralReleaseTxid}`

// After:
import { getExplorerUrl } from './services/bitcoin-network-selector';
getExplorerUrl('tx', loan.collateralReleaseTxid)
BLOCKER GROUP 6 — email.ts + LendingWorkflowService.ts (email copy)
These tell users NOT to send real BTC — they will break the mainnet loan flow.

File: server/email.ts

Line 185: "This is a Bitcoin TESTNET address (for testing purposes only)"
Fix: Wrap in a conditional — only include on testnet:

ts
const networkWarning = isTestnet
  ? `<p>⚠️ This is a Bitcoin TESTNET address (for testing purposes only)</p>`
  : '';
File: server/services/LendingWorkflowService.ts

Line 360: "<p><strong>Network:</strong> Bitcoin Testnet</p>"
Fix: Replace with dynamic value:

ts
`<p><strong>Network:</strong> Bitcoin ${isMainnet ? 'Mainnet' : 'Testnet'}</p>`
Line 361: "⚠️ This is a Bitcoin testnet Native SegWit address. Do not send mainnet Bitcoin to this address."
Fix: Remove this line entirely on mainnet — wrap with:

ts
${!isMainnet ? `<p>⚠️ This is a Bitcoin testnet address. Do not send mainnet Bitcoin.</p>` : ''}
Rules When Applying These Fixes
Always read the full file before editing — understand the surrounding context

Only change the exact lines described above — do not refactor anything else

After each fix, grep the file for any remaining testnet strings and flag them

Never introduce a new || 'testnet' fallback anywhere

After all fixes, confirm with the user before writing any file

Verification After Each Fix
After fixing bitcoin-broadcast.ts:

Grep: grep -n "bitcoin.networks.testnet" server/services/bitcoin-broadcast.ts

Expected result: no matches

After fixing escrow-setup.tsx:

Grep: grep -n "testnet" client/src/components/escrow-setup.tsx

Expected result: no hardcoded 'testnet' string remaining

After fixing use-firefish-wasm.ts:

Grep: grep -n "|| 'testnet'" client/src/hooks/use-firefish-wasm.ts

Expected result: no matches

After fixing collateral-release-status.tsx:

Grep: grep -n "testnet4" client/src/components/collateral-release-status.tsx

Expected result: no matches

After fixing routes.ts line 6450:

Grep: grep -n "testnet4/tx" server/routes.ts

Expected result: no matches (or only in comments)

After fixing email.ts and LendingWorkflowService.ts:

Grep: grep -rn "TESTNET address\|testnet Native SegWit\|Do not send mainnet Bitcoin" server/

Expected result: no matches