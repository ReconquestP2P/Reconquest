/**
 * FUNDABLE Bitcoin Testnet Escrow Address Generator
 * Uses DETERMINISTIC keys so the address stays consistent across runs
 * Fund this address with testnet BTC to test real broadcasts
 */

import * as bitcoin from 'bitcoinjs-lib';
import * as secp256k1 from '@noble/secp256k1';
import { createHash } from 'crypto';

const TESTNET = bitcoin.networks.testnet;

// DETERMINISTIC TEST KEYS (for repeatable testnet funding)
// These are derived from known seeds - NEVER use for real funds
const TEST_SEEDS = {
  borrower: 'reconquest_testnet_borrower_seed_v1',
  lender: 'reconquest_testnet_lender_seed_v1', 
  platform: 'reconquest_testnet_platform_seed_v1',
};

function deriveTestKey(seed: string): Buffer {
  return createHash('sha256').update(seed).digest();
}

function getCompressedPubkey(privateKey: Buffer): Buffer {
  const pubkeyBytes = secp256k1.getPublicKey(privateKey);
  return Buffer.from(pubkeyBytes);
}

async function generateFundableEscrow() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║      FUNDABLE BITCOIN TESTNET ESCROW ADDRESS                   ║');
  console.log('║      (Deterministic keys - same address every run)             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Derive deterministic private keys from seeds
  const borrowerPriv = deriveTestKey(TEST_SEEDS.borrower);
  const lenderPriv = deriveTestKey(TEST_SEEDS.lender);
  const platformPriv = deriveTestKey(TEST_SEEDS.platform);

  // Get compressed public keys
  const borrowerPub = getCompressedPubkey(borrowerPriv);
  const lenderPub = getCompressedPubkey(lenderPriv);
  const platformPub = getCompressedPubkey(platformPriv);

  console.log('🔑 Deterministic Test Public Keys:');
  console.log(`   Borrower:  ${borrowerPub.toString('hex')}`);
  console.log(`   Lender:    ${lenderPub.toString('hex')}`);
  console.log(`   Platform:  ${platformPub.toString('hex')}`);
  console.log('');

  // Sort pubkeys lexicographically (BIP-67)
  const pubkeys = [borrowerPub, lenderPub, platformPub].sort((a, b) => a.compare(b));

  // Create 2-of-3 multisig
  const p2ms = bitcoin.payments.p2ms({
    m: 2,
    pubkeys,
    network: TESTNET,
  });

  const p2sh = bitcoin.payments.p2sh({
    redeem: p2ms,
    network: TESTNET,
  });

  const p2wsh = bitcoin.payments.p2wsh({
    redeem: p2ms,
    network: TESTNET,
  });

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('🏦 FUND THIS ADDRESS WITH TESTNET BTC:');
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  P2SH (Legacy - works with all wallets):                         ║');
  console.log('║                                                                  ║');
  console.log(`║  ${p2sh.address}                                   ║`);
  console.log('║                                                                  ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║  P2WSH (SegWit - lower fees):                                    ║');
  console.log('║                                                                  ║');
  console.log(`║  ${p2wsh.address}║`);
  console.log('║                                                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('📋 Copy one of these addresses and send testnet BTC to it.');
  console.log('   Get free testnet BTC from: https://coinfaucet.eu/en/btc-testnet/');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('📊 ADDRESS DETAILS:');
  console.log(`   Network:       Bitcoin Testnet3`);
  console.log(`   Type:          2-of-3 Multisig`);
  console.log(`   Redeem Script: ${p2ms.output?.toString('hex').slice(0, 50)}...`);
  console.log('');

  return {
    p2sh: p2sh.address,
    p2wsh: p2wsh.address,
    pubkeys: {
      borrower: borrowerPub.toString('hex'),
      lender: lenderPub.toString('hex'),
      platform: platformPub.toString('hex'),
    },
    redeemScript: p2ms.output?.toString('hex'),
  };
}

generateFundableEscrow()
  .then((result) => {
    console.log('JSON OUTPUT:');
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(console.error);
