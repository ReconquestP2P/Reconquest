/**
 * Bitcoin Network Selector Service
 * 
 * Dynamically selects testnet or mainnet configuration based on
 * the BITCOIN_NETWORK environment variable.
 * 
 * SAFETY: Defaults to testnet if BITCOIN_NETWORK is not set.
 * 
 * Usage:
 *   BITCOIN_NETWORK=testnet  -> Uses testnet4 configuration
 *   BITCOIN_NETWORK=mainnet  -> Uses mainnet configuration
 *   (not set)                -> Defaults to testnet with warning
 */

import { TESTNET4_CONFIG, type Testnet4Config } from './testnet4-config.js';
import { MAINNET_CONFIG, type MainnetConfig } from './mainnet-config.js';

export type NetworkType = 'testnet' | 'mainnet';
export type NetworkConfig = Testnet4Config | MainnetConfig;

const ALLOWED_NETWORKS: NetworkType[] = ['testnet', 'mainnet'];
const DEFAULT_NETWORK: NetworkType = 'testnet';

let cachedNetwork: NetworkType | null = null;
let cachedConfig: NetworkConfig | null = null;
let configLogged = false;

/**
 * Validates and returns the current network from environment variable
 * Defaults to testnet if not set (safety first)
 * @throws Error if BITCOIN_NETWORK is set but invalid
 */
function resolveNetwork(): NetworkType {
  if (cachedNetwork !== null) {
    return cachedNetwork;
  }
  
  const network = process.env.BITCOIN_NETWORK;
  
  if (!network) {
    console.warn('⚠️  BITCOIN_NETWORK not set - defaulting to TESTNET for safety');
    cachedNetwork = DEFAULT_NETWORK;
    return cachedNetwork;
  }
  
  const normalizedNetwork = network.toLowerCase().trim();
  
  if (!ALLOWED_NETWORKS.includes(normalizedNetwork as NetworkType)) {
    throw new Error(
      `Invalid BITCOIN_NETWORK value: "${network}". ` +
      `Must be one of: ${ALLOWED_NETWORKS.join(', ')}`
    );
  }
  
  cachedNetwork = normalizedNetwork as NetworkType;
  return cachedNetwork;
}

/**
 * Returns the current Bitcoin network type
 * @returns 'testnet' | 'mainnet'
 */
export function getCurrentNetwork(): NetworkType {
  return resolveNetwork();
}

/**
 * Returns the appropriate network configuration based on BITCOIN_NETWORK env var
 * Results are cached for performance
 * @returns Testnet4Config or MainnetConfig
 */
export function getCurrentNetworkConfig(): NetworkConfig {
  if (cachedConfig !== null) {
    return cachedConfig;
  }
  
  const network = resolveNetwork();
  
  if (network === 'mainnet') {
    cachedConfig = MAINNET_CONFIG;
  } else {
    cachedConfig = TESTNET4_CONFIG;
  }
  
  if (!configLogged) {
    logNetworkStatus();
    configLogged = true;
  }
  
  return cachedConfig;
}

/**
 * Logs the current network status to console
 */
function logNetworkStatus(): void {
  const network = resolveNetwork();
  
  if (network === 'mainnet') {
    console.log('');
    console.log('🔴 ════════════════════════════════════════════════════════');
    console.log('🔴   BITCOIN NETWORK: MAINNET');
    console.log('🔴   ⚠️  REAL BITCOIN TRANSACTIONS ENABLED');
    console.log('🔴   API: https://mempool.space/api');
    console.log('🔴   Address Prefix: bc1');
    console.log('🔴 ════════════════════════════════════════════════════════');
    console.log('');
  } else {
    console.log('');
    console.log('🟡 ════════════════════════════════════════════════════════');
    console.log('🟡   BITCOIN NETWORK: TESTNET4');
    console.log('🟡   Safe testing mode - no real funds at risk');
    console.log('🟡   API: https://mempool.space/testnet4/api');
    console.log('🟡   Address Prefix: tb1');
    console.log('🟡 ════════════════════════════════════════════════════════');
    console.log('');
  }
}

/**
 * Returns a block explorer URL for an address or transaction
 * @param type - 'address' or 'tx'
 * @param value - The address or transaction ID
 * @returns Full explorer URL for the current network
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
  return getCurrentNetwork() === 'mainnet';
}

/**
 * Checks if currently running on testnet
 * @returns true if BITCOIN_NETWORK is 'testnet' or not set
 */
export function isTestnet(): boolean {
  return getCurrentNetwork() === 'testnet';
}

/**
 * Clears the cached configuration
 * Useful for testing or when environment changes
 */
export function clearNetworkCache(): void {
  cachedNetwork = null;
  cachedConfig = null;
  configLogged = false;
}

/**
 * Initialize and log the network configuration on startup
 * Call this once during server initialization
 */
export function initializeNetworkConfig(): NetworkConfig {
  return getCurrentNetworkConfig();
}
