/**
 * Bitcoin Testnet Integration Setup
 * Initialize and verify Bitcoin RPC connection with multisig + pre-signed tx generation
 */

import { getBitcoinRpcClient } from './services/bitcoin-rpc-client';
import { multisigService } from './services/multisig-service';
import { PreSignedTxBuilder } from './services/presigned-tx-builder';

export async function initializeTestnetIntegration() {
  try {
    console.log('\n🔗 Initializing Bitcoin Testnet Integration...\n');

    const rpcClient = getBitcoinRpcClient();

    // Verify RPC connectivity
    console.log('1️⃣  Verifying Bitcoin RPC connectivity...');
    const isHealthy = await rpcClient.healthCheck();

    if (!isHealthy) {
      console.warn('⚠️  Bitcoin RPC node not available - using mock mode');
      console.log('   To enable real testnet:');
      console.log('   - Set BITCOIN_RPC_URL (e.g., http://localhost:18332)');
      console.log('   - Set BITCOIN_RPC_USER and BITCOIN_RPC_PASS');
      console.log('   - Set BITCOIN_NETWORK (testnet or regtest)\n');
      return { ready: false, mode: 'mock' };
    }

    console.log('✅ Bitcoin RPC connected\n');

    // Verify multisig service
    console.log('2️⃣  Verifying multisig address generation...');
    const setupReady = await multisigService.verifySetup();

    if (!setupReady) {
      console.error('❌ Multisig service verification failed');
      return { ready: false, mode: 'mock' };
    }

    console.log('✅ Multisig service ready\n');

    // Verify ephemeral key generation
    console.log('3️⃣  Verifying ephemeral key generation...');
    const { publicKey, privateKey } = PreSignedTxBuilder.generateEphemeralKeypair();
    PreSignedTxBuilder.wipeKey(privateKey);
    console.log('✅ Ephemeral key generation ready\n');

    console.log('✅ Bitcoin Testnet Integration Initialized\n');

    return {
      ready: true,
      mode: 'testnet',
      rpcUrl: process.env.BITCOIN_RPC_URL,
      network: process.env.BITCOIN_NETWORK || 'testnet',
    };
  } catch (error) {
    console.error('❌ Testnet integration initialization failed:', error);
    return { ready: false, mode: 'mock', error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Initialize on server start
export const testnetStatus = initializeTestnetIntegration();
