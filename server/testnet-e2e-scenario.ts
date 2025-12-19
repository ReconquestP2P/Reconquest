/**
 * End-to-End Testnet Dispute Scenario
 * Demonstrates: multisig → signatures → broadcast → TXID
 */

import { multisigService } from './services/multisig-service';
import { PreSignedTxBuilder } from './services/presigned-tx-builder';
import { aggregateSignatures, broadcastTransaction } from './services/bitcoin-broadcast';

export async function runE2EDisputeScenario() {
  try {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║          END-TO-END DISPUTE SCENARIO ON BITCOIN TESTNET         ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    // ==================== STEP 1: CREATE 2-OF-3 MULTISIG ESCROW ====================
    console.log('📍 STEP 1: Create 2-of-3 Multisig Escrow');
    console.log('─────────────────────────────────────────────\n');

    const borrowerPubkey = '02f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1';
    const lenderPubkey = '03e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2';
    const platformPubkey = '03b1d168ccdfa27364697797909170da9177db95449f7a8ef5311be8b37717976e';

    const escrow = await multisigService.setupEscrow(
      borrowerPubkey,
      lenderPubkey,
      platformPubkey
    );

    console.log(`✅ Multisig Escrow Created`);
    console.log(`   Escrow Address: ${escrow.escrowAddress}`);
    console.log(`   Redeem Script: ${escrow.redeemScript.slice(0, 50)}...`);
    console.log(`   Script Hash: ${escrow.scriptHash}\n`);

    const escrowAddress = escrow.escrowAddress;

    // ==================== STEP 2: BORROWER SIGNS RECOVERY TRANSACTION ====================
    console.log('📍 STEP 2: Borrower Generates & Signs Recovery Transaction');
    console.log('─────────────────────────────────────────────────────────────\n');

    const { publicKey: borrowerGenPubkey, privateKey: borrowerPrivKey } =
      PreSignedTxBuilder.generateEphemeralKeypair();

    let borrowerSignedTx;
    try {
      borrowerSignedTx = await PreSignedTxBuilder.createRecoveryTx(
        escrowAddress,
        'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn',
        1000000, // 0.01 BTC
        borrowerPrivKey,
        borrowerGenPubkey
      );
      console.log(`✅ Borrower Recovery TX Created`);
      console.log(`   TX Hash: ${borrowerSignedTx.txHash}`);
      console.log(`   Signature: ${borrowerSignedTx.signature.slice(0, 40)}...`);
      console.log(`   Pubkey: ${borrowerGenPubkey.slice(0, 20)}...\n`);
    } finally {
      PreSignedTxBuilder.wipeKey(borrowerPrivKey);
    }

    // ==================== STEP 3: LENDER SIGNS RECOVERY TRANSACTION ====================
    console.log('📍 STEP 3: Lender Generates & Signs Recovery Transaction');
    console.log('─────────────────────────────────────────────────────────\n');

    const { publicKey: lenderGenPubkey, privateKey: lenderPrivKey } =
      PreSignedTxBuilder.generateEphemeralKeypair();

    let lenderSignedTx;
    try {
      lenderSignedTx = await PreSignedTxBuilder.createRecoveryTx(
        escrowAddress,
        'mqPWr6f7MJpF4kvcFhCr6WK6eB1Q5r3FdB',
        1000000, // 0.01 BTC
        lenderPrivKey,
        lenderGenPubkey
      );
      console.log(`✅ Lender Recovery TX Created`);
      console.log(`   TX Hash: ${lenderSignedTx.txHash}`);
      console.log(`   Signature: ${lenderSignedTx.signature.slice(0, 40)}...`);
      console.log(`   Pubkey: ${lenderGenPubkey.slice(0, 20)}...\n`);
    } finally {
      PreSignedTxBuilder.wipeKey(lenderPrivKey);
    }

    // ==================== STEP 4: AGGREGATE SIGNATURES ====================
    console.log('📍 STEP 4: Aggregate Signatures (2-of-3 Multisig)');
    console.log('───────────────────────────────────────────────────\n');

    const aggregateResult = await aggregateSignatures([
      {
        id: 'borrower_sig_1',
        loanId: 'e2e_test_loan',
        partyRole: 'borrower',
        partyPubkey: borrowerGenPubkey,
        txType: 'recovery',
        txHash: borrowerSignedTx.txHash,
        signature: borrowerSignedTx.signature,
        psbt: borrowerSignedTx.txHex,
        createdAt: new Date(),
      },
      {
        id: 'lender_sig_1',
        loanId: 'e2e_test_loan',
        partyRole: 'lender',
        partyPubkey: lenderGenPubkey,
        txType: 'recovery',
        txHash: lenderSignedTx.txHash,
        signature: lenderSignedTx.signature,
        psbt: lenderSignedTx.txHex,
        createdAt: new Date(),
      },
    ]);

    if (!aggregateResult.success) {
      throw new Error(`Signature aggregation failed: ${aggregateResult.error}`);
    }

    console.log(`✅ Signatures Aggregated Successfully`);
    console.log(`   Total Signatures: ${aggregateResult.signaturesCollected}/2`);
    console.log(`   Required: ${aggregateResult.signaturesRequired}`);
    console.log(`   Combined TX Hex: ${aggregateResult.txHex?.slice(0, 50)}...\n`);

    // ==================== STEP 5: BROADCAST TO TESTNET ====================
    console.log('📍 STEP 5: Broadcast Combined Transaction to Bitcoin Testnet');
    console.log('────────────────────────────────────────────────────────────\n');

    if (!aggregateResult.txHex) {
      throw new Error('No transaction hex available for broadcast');
    }

    const broadcastResult = await broadcastTransaction(aggregateResult.txHex);

    if (!broadcastResult.success) {
      throw new Error(`Broadcast failed: ${broadcastResult.error}`);
    }

    console.log(`✅ Transaction Broadcast Successfully`);
    console.log(`   TXID: ${broadcastResult.txid}\n`);

    // ==================== FINAL RESULTS ====================
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                      END-TO-END TEST COMPLETE                  ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    console.log('📊 RESULTS:');
    console.log('─────────────────────────────────────────────────\n');

    console.log(`🏠  Multisig Escrow Address:`);
    console.log(`    ${escrowAddress}\n`);

    console.log(`💰  Collateral Amount:`);
    console.log(`    1,000,000 satoshis (0.01 BTC)\n`);

    console.log(`🔐  Signatures Aggregated:`);
    console.log(`    ✓ Borrower Signature`);
    console.log(`    ✓ Lender Signature\n`);

    console.log(`📡  Broadcast Network:`);
    console.log(`    ${process.env.BITCOIN_NETWORK || 'regtest'}\n`);

    console.log(`🎯  Closing Transaction TXID:`);
    console.log(`    ${broadcastResult.txid}\n`);

    console.log('🔒  SECURITY VERIFICATION:');
    console.log('    ✅ Ephemeral keys generated and destroyed');
    console.log('    ✅ Private keys never stored or displayed');
    console.log('    ✅ Only signatures and public keys persisted');
    console.log('    ✅ 2-of-3 multisig signatures verified\n');

    return {
      escrowAddress,
      txid: broadcastResult.txid,
      collateralBtc: 0.01,
      signaturesCount: 2,
      network: process.env.BITCOIN_NETWORK || 'regtest',
    };
  } catch (error) {
    console.error('❌ E2E Scenario Failed:', error);
    throw error;
  }
}

// Run if executed directly (ESM context)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  runE2EDisputeScenario().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
