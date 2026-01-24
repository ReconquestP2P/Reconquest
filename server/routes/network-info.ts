/**
 * Network Info API Routes
 * 
 * Provides server-side network configuration for the frontend.
 * This keeps network selection logic server-side for security,
 * ensuring clients never need to know about environment variables.
 */

import { Router, Request, Response } from 'express';
import { 
  getExplorerUrl, 
  getCurrentNetwork, 
  getNetworkParams 
} from '../services/bitcoin-network-selector.js';

const router = Router();

/**
 * GET /api/network/info
 * Returns the current Bitcoin network configuration
 */
router.get('/info', (_req: Request, res: Response) => {
  try {
    const network = getCurrentNetwork();
    const params = getNetworkParams();
    
    res.json({
      network,
      isMainnet: network === 'mainnet',
      addressPrefix: params.bech32, // 'bc' for mainnet, 'tb' for testnet
    });
  } catch (error: any) {
    console.error('[NetworkInfo] Error getting network info:', error);
    res.status(500).json({ error: 'Failed to get network info' });
  }
});

/**
 * GET /api/network/address-prefix
 * Returns the expected address prefix for the current network
 */
router.get('/address-prefix', (_req: Request, res: Response) => {
  try {
    const network = getCurrentNetwork();
    const params = getNetworkParams();
    
    // Full prefix for native segwit addresses
    const fullPrefix = network === 'mainnet' ? 'bc1' : 'tb1';
    
    res.json({
      prefix: fullPrefix,
      bech32: params.bech32, // 'bc' or 'tb'
      network,
    });
  } catch (error: any) {
    console.error('[NetworkInfo] Error getting address prefix:', error);
    res.status(500).json({ error: 'Failed to get address prefix' });
  }
});

/**
 * GET /api/network/explorer/:type/:value
 * Returns the block explorer URL for an address or transaction
 * 
 * @param type - Either 'address' or 'tx'
 * @param value - The Bitcoin address or transaction ID
 */
router.get('/explorer/:type/:value', (req: Request, res: Response) => {
  try {
    const { type, value } = req.params;
    
    // Validate type parameter
    if (type !== 'address' && type !== 'tx') {
      return res.status(400).json({ 
        error: 'Invalid type. Must be "address" or "tx"' 
      });
    }
    
    // Basic validation for value
    if (!value || value.length < 10) {
      return res.status(400).json({ 
        error: 'Invalid value. Address or transaction ID too short' 
      });
    }
    
    const network = getCurrentNetwork();
    const explorerUrl = getExplorerUrl(type, value);
    
    res.json({
      explorerUrl,
      network,
      type,
      value,
    });
  } catch (error: any) {
    console.error('[NetworkInfo] Error generating explorer URL:', error);
    res.status(500).json({ error: 'Failed to generate explorer URL' });
  }
});

export default router;
