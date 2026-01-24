/**
 * Bitcoin Mainnet Configuration
 * 
 * Production configuration for Bitcoin mainnet.
 * Uses mempool.space API for blockchain interactions.
 * 
 * CRITICAL: This is for REAL BITCOIN transactions.
 * - Address prefix: bc1 (bech32)
 * - P2SH prefix: 3
 * - Block explorer: mempool.space
 * 
 * SECURITY WARNING: Double-check all transactions before broadcasting.
 * Mainnet transactions are irreversible and involve real funds.
 */

export const MAINNET_CONFIG = {
  network: 'mainnet',
  
  // Mempool.space Mainnet API endpoints
  api: {
    baseUrl: 'https://mempool.space/api',
    addressUtxo: (address: string) => `https://mempool.space/api/address/${address}/utxo`,
    broadcastTx: 'https://mempool.space/api/tx',
    txInfo: (txid: string) => `https://mempool.space/api/tx/${txid}`,
    addressInfo: (address: string) => `https://mempool.space/api/address/${address}`,
  },
  
  // Block explorer URLs for verification
  explorer: {
    address: (address: string) => `https://mempool.space/address/${address}`,
    tx: (txid: string) => `https://mempool.space/tx/${txid}`,
  },
  
  // Bitcoin network parameters for Mainnet
  networkParams: {
    messagePrefix: '\x18Bitcoin Signed Message:\n',
    bech32: 'bc',  // MAINNET bech32 prefix
    bip32: {
      public: 0x0488B21E,   // MAINNET BIP32 public key version (xpub)
      private: 0x0488ADE4,  // MAINNET BIP32 private key version (xprv)
    },
    pubKeyHash: 0x00,  // MAINNET P2PKH prefix (addresses starting with 1)
    scriptHash: 0x05,  // MAINNET P2SH prefix (addresses starting with 3)
    wif: 0x80,         // MAINNET WIF prefix
  },
  
  // Dust limit in satoshis (same as testnet)
  dustLimit: 546,
  
  // Default fee rate (sat/vB) - should be fetched dynamically for mainnet
  // Higher default than testnet due to real network conditions
  defaultFeeRate: 10,
};

export type MainnetConfig = typeof MAINNET_CONFIG;
