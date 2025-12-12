/**
 * Bitcoin Testnet4 Configuration
 * 
 * Testnet4 is the newest Bitcoin testnet, launched in 2024.
 * It has stricter rules and is supported by Sparrow 2.3.1.
 * 
 * Key differences from Testnet3:
 * - Address prefix: tb1 (same as testnet3 for bech32)
 * - P2SH prefix: 2 (same as testnet3)
 * - Block explorer: mempool.space/testnet4
 */

export const TESTNET4_CONFIG = {
  network: 'testnet4',
  
  // Mempool.space Testnet4 API endpoints
  api: {
    baseUrl: 'https://mempool.space/testnet4/api',
    addressUtxo: (address: string) => `https://mempool.space/testnet4/api/address/${address}/utxo`,
    broadcastTx: 'https://mempool.space/testnet4/api/tx',
    txInfo: (txid: string) => `https://mempool.space/testnet4/api/tx/${txid}`,
    addressInfo: (address: string) => `https://mempool.space/testnet4/api/address/${address}`,
  },
  
  // Block explorer URLs for verification
  explorer: {
    address: (address: string) => `https://mempool.space/testnet4/address/${address}`,
    tx: (txid: string) => `https://mempool.space/testnet4/tx/${txid}`,
  },
  
  // Bitcoin network parameters for Testnet4
  // (Same as Testnet3 for address encoding)
  networkParams: {
    messagePrefix: '\x18Bitcoin Signed Message:\n',
    bech32: 'tb',
    bip32: {
      public: 0x043587cf,
      private: 0x04358394,
    },
    pubKeyHash: 0x6f,
    scriptHash: 0xc4,
    wif: 0xef,
  },
  
  // Dust limit in satoshis
  dustLimit: 546,
  
  // Default fee rate (sat/vB) - can be fetched dynamically
  defaultFeeRate: 2,
};

export type Testnet4Config = typeof TESTNET4_CONFIG;
