/**
 * Bitcoin Network Selector Service
 * 
 * Dynamically selects testnet or mainnet configuration based on
 * the BITCOIN_NETWORK environment variable.
 * 
 * This enables seamless switching between networks without code changes.
 * Simply change the environment variable to switch networks.
 * 
 * Usage:
 *   BITCOIN_NETWORK=testnet  -> Uses testnet4 configuration
 *   BITCOIN_NETWORK=mainnet  -> Uses mainnet configuration
 */

import { TESTNET4_CONFIG, type Testnet4Config } from './testnet4-config.js';
import { MAINNET_CONFIG, type MainnetConfig } from './mainnet-config.js';

export type NetworkType = 'testnet' | 'mainnet';
export type NetworkConfig = Testnet4Config | MainnetConfig;

const ALLOWED_NETWORKS: NetworkType[] = ['testnet', 'mainnet'];

/**
 * Validates and returns the current network from environment variable
 * @throws Error if BITCOIN_NETWORK is not set or invalid
 */
function validateNetwork(): NetworkType {
  const network = process.env.BITCOIN_NETWORK;
  
  if (!network) {
    throw new Error(
      'BITCOIN_NETWORK environment variable is not set. ' +
      `Must be one of: ${ALLOWED_NETWORKS.join(', ')}`
    );
  }
  
  const normalizedNetwork = network.toLowerCase().trim();
  
  if (!ALLOWED_NETWORKS.includes(normalizedNetwork as NetworkType)) {
    throw new Error(
      `Invalid BITCOIN_NETWORK value: "${network}". ` +
      `Must be one of: ${ALLOWED_NETWORKS.join(', ')}`
    );
  }
  
  return normalizedNetwork as NetworkType;
}

/**
 * Returns the current Bitcoin network type
 * @returns 'testnet' | 'mainnet'
 * @throws Error if BITCOIN_NETWORK is not set or invalid
 */
export function getCurrentNetwork(): NetworkType {
  return validateNetwork();
}

/**
 * Returns the appropriate network configuration based on BITCOIN_NETWORK env var
 * @returns Testnet4Config or MainnetConfig
 * @throws Error if BITCOIN_NETWORK is not set or invalid
 */
export function getCurrentNetworkConfig(): NetworkConfig {
  const network = validateNetwork();
  
  if (network === 'mainnet') {
    console.log('🔴 MAINNET MODE - Real Bitcoin transactions enabled');
    return MAINNET_CONFIG;
  }
  
  console.log('🟡 TESTNET MODE - Using testnet4 for testing');
  return TESTNET4_CONFIG;
}

/**
 * Returns a block explorer URL for an address or transaction
 * @param type - 'address' or 'tx'
 * @param value - The address or transaction ID
 * @returns Full explorer URL for the current network
 * @throws Error if BITCOIN_NETWORK is not set or invalid
 */
export function getExplorerUrl(type: 'address' | 'tx', value: string): string {
  const config = getCurrentNetworkConfig();
  
  if (type === 'address') {
    return config.explorer.address(value);
  }
  
  return config.explorer.tx(value);
}

/**
 * Returns the API base URL for the current network
 * @returns API base URL string
 */
export function getApiBaseUrl(): string {
  return getCurrentNetworkConfig().api.baseUrl;
}

/**
 * Returns the broadcast transaction URL for the current network
 * @returns Broadcast API URL string
 */
export function getBroadcastUrl(): string {
  return getCurrentNetworkConfig().api.broadcastTx;
}

/**
 * Returns the UTXO fetch URL for an address on the current network
 * @param address - Bitcoin address
 * @returns UTXO API URL string
 */
export function getUtxoUrl(address: string): string {
  return getCurrentNetworkConfig().api.addressUtxo(address);
}

/**
 * Returns the network parameters for bitcoinjs-lib
 * @returns Network parameters object compatible with bitcoinjs-lib
 */
export function getNetworkParams(): NetworkConfig['networkParams'] {
  return getCurrentNetworkConfig().networkParams;
}

/**
 * Checks if currently running on mainnet
 * @returns true if BITCOIN_NETWORK is 'mainnet'
 */
export function isMainnet(): boolean {
  try {
    return getCurrentNetwork() === 'mainnet';
  } catch {
    return false;
  }
}

/**
 * Checks if currently running on testnet
 * @returns true if BITCOIN_NETWORK is 'testnet'
 */
export function isTestnet(): boolean {
  try {
    return getCurrentNetwork() === 'testnet';
  } catch {
    return false;
  }
}

/**
 * Log the current network configuration on startup
 * Call this once during server initialization
 */
export function logNetworkConfiguration(): void {
  try {
    const network = getCurrentNetwork();
    const config = getCurrentNetworkConfig();
    
    console.log('════════════════════════════════════════════════════════');
    console.log(`  BITCOIN NETWORK: ${network.toUpperCase()}`);
    console.log(`  API Base URL: ${config.api.baseUrl}`);
    console.log(`  Address Prefix: ${config.networkParams.bech32}`);
    console.log(`  Default Fee Rate: ${config.defaultFeeRate} sat/vB`);
    console.log('════════════════════════════════════════════════════════');
    
    if (network === 'mainnet') {
      console.log('⚠️  WARNING: MAINNET MODE - Real funds at risk!');
      console.log('⚠️  Double-check all transactions before broadcasting.');
    }
  } catch (error) {
    console.error('❌ Bitcoin network configuration error:', error);
    throw error;
  }
}
