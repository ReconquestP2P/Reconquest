# Mainnet Launch Checklist

## Pre-Launch Environment Variables

### ⚠️ CHANGE THESE IN REPLIT SECRETS BEFORE MAINNET LAUNCH:

1. **BITCOIN_NETWORK**
   - Current: `testnet`
   - Change to: `mainnet`
   - When: Immediately before launch

2. **PLATFORM_SIGNING_KEY**
   - Current: `18a4153911af2d3351fefe3fa37246cd...` (TESTNET KEY)
   - Change to: [GET FROM BITWARDEN - Mainnet platform private key]
   - Location: Replit Secrets panel
   - When: Immediately before launch
   - **CRITICAL**: The mainnet PUBLIC key `03b017b2eabe5408228080931b2aab9f5d683c80d82768a05a361d6b0c41fbb782` is already configured in `BitcoinEscrowService.ts`

3. **BITCOIN_RPC_URL**
   - Current: `http://127.0.0.1:18332` (testnet port)
   - Change to: `http://127.0.0.1:8332` (mainnet port)
   - When: After mainnet Bitcoin Core node is synced

### ✅ Already Configured Correctly:
- `MAX_LOAN_AMOUNT_USD=10000` - Safety limit for initial launch
- `MAX_BTC_COLLATERAL=0.2` - Max 0.2 BTC per loan
- `MAX_LOANS_PER_DAY=10` - Rate limiting
- `MAX_TOTAL_ACTIVE_BTC=2.0` - Platform-wide limit

---

## Launch Steps

### Phase 1: Infrastructure Preparation
- [ ] Sync mainnet Bitcoin Core node (or configure external mainnet RPC)
- [ ] Verify RPC credentials work with mainnet node
- [ ] Backup all testnet data (already archived in `loans_testnet_archive`)

### Phase 2: Environment Variables
- [ ] Update `BITCOIN_NETWORK` to `mainnet` in Replit Secrets
- [ ] Update `PLATFORM_SIGNING_KEY` with mainnet private key from Bitwarden
- [ ] Update `BITCOIN_RPC_URL` to mainnet port (8332)

### Phase 3: Application Restart
- [ ] Restart Replit application
- [ ] Verify `/api/network/info` returns `network: "mainnet"`
- [ ] Verify `/api/network/status` shows mainnet configuration
- [ ] Check server logs for any errors

### Phase 4: Validation Testing
- [ ] Test Python script generates `bc1...` addresses (not `tb1...`)
  ```bash
  python3 bitcoin_escrow.py --network mainnet --confirm-mainnet \
    --borrower-pubkey [test] --investor-pubkey [test] --platform-pubkey [test]
  ```
- [ ] Test address validation endpoint rejects testnet addresses
  ```bash
  curl /api/network/validate-address/tb1qtest...
  # Should return: "valid": false
  ```
- [ ] Verify explorer links use `mempool.space` (not `mempool.space/testnet4`)

### Phase 5: First Mainnet Transaction (Manual Monitoring)
- [ ] Create test loan with small amount (~$100)
- [ ] Verify escrow address starts with `bc1`
- [ ] Fund with minimal BTC (0.001 BTC)
- [ ] Monitor first 3 mainnet transactions manually before automated flow
- [ ] Verify collateral release works correctly

---

## Safety Measures Active

| Feature | Status | Description |
|---------|--------|-------------|
| Loan Amount Limit | ✅ | Max $10,000 per loan |
| BTC Collateral Limit | ✅ | Max 0.2 BTC per loan |
| Daily Loan Limit | ✅ | Max 10 loans per day |
| Total Active BTC | ✅ | Max 2.0 BTC across all escrows |
| Address Validation | ✅ | Rejects wrong-network addresses |
| Override Capability | ⚠️ | `OVERRIDE_SAFETY_LIMITS=false` |

---

## Rollback Plan

If issues occur after mainnet launch:

1. **Immediate**: Set `BITCOIN_NETWORK=testnet` to prevent new mainnet transactions
2. **Do NOT** change `PLATFORM_SIGNING_KEY` - existing escrows need it
3. Contact users with active mainnet loans
4. Investigate issue in testnet mode
5. Only resume mainnet after fix is verified

---

## Post-Launch Monitoring

### First 24 Hours
- [ ] Monitor all loan creations
- [ ] Verify all escrow addresses are `bc1...` format
- [ ] Check email notifications include correct mainnet explorer links
- [ ] Monitor LTV calculations use correct BTC price

### First Week
- [ ] Review all completed transactions
- [ ] Verify collateral releases work correctly
- [ ] Check dispute resolution flow (if any)
- [ ] Gradually increase limits if stable

---

## Contact Information

- **Platform Admin**: admin@reconquestp2p.com
- **Bitwarden Vault**: Contains mainnet platform signing key
- **Bitcoin Node**: [Configure RPC details here]

---

*Last Updated: January 2026*
*Prepared for Reconquest Mainnet Migration*
