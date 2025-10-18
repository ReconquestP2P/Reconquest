// Blockchain Monitoring Service for Bitcoin Testnet
// Uses Blockstream API to check transaction confirmations and UTXO status

interface UTXO {
  txid: string;
  vout: number;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_time?: number;
  };
  value: number; // satoshis
}

interface TransactionStatus {
  confirmed: boolean;
  block_height?: number;
  block_hash?: string;
  block_time?: number;
}

interface FundingCheckResult {
  funded: boolean;
  txid?: string;
  vout?: number;
  amountSats?: number;
  confirmations?: number;
  blockHeight?: number;
}

export class BlockchainMonitoringService {
  private baseUrl = 'https://blockstream.info/testnet/api';
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheTTL = 5000; // 5 seconds cache

  /**
   * Check if an address has been funded
   */
  async checkAddressFunding(
    address: string,
    expectedAmount?: number
  ): Promise<FundingCheckResult> {
    const cacheKey = `address:${address}`;
    const cached = this.getFromCache(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      // Get all UTXOs for the address
      const response = await fetch(`${this.baseUrl}/address/${address}/utxo`);
      
      if (!response.ok) {
        if (response.status === 404) {
          // Address not found or has no UTXOs
          const result = { funded: false };
          this.setCache(cacheKey, result);
          return result;
        }
        throw new Error(`Blockstream API error: ${response.status}`);
      }

      const utxos: UTXO[] = await response.json();

      if (utxos.length === 0) {
        const result = { funded: false };
        this.setCache(cacheKey, result);
        return result;
      }

      // Find the largest UTXO (most likely to be the funding transaction)
      const fundingUtxo = utxos.reduce((max, utxo) => 
        utxo.value > max.value ? utxo : max
      );

      // Calculate confirmations
      let confirmations = 0;
      if (fundingUtxo.status.confirmed && fundingUtxo.status.block_height) {
        const tipResponse = await fetch(`${this.baseUrl}/blocks/tip/height`);
        const tipHeight = await tipResponse.text();
        confirmations = parseInt(tipHeight) - fundingUtxo.status.block_height + 1;
      }

      const result: FundingCheckResult = {
        funded: true,
        txid: fundingUtxo.txid,
        vout: fundingUtxo.vout,
        amountSats: fundingUtxo.value,
        confirmations,
        blockHeight: fundingUtxo.status.block_height,
      };

      this.setCache(cacheKey, result);
      return result;
    } catch (error) {
      console.error('Error checking address funding:', error);
      // Return cached data if available, even if expired
      if (cached) return cached;
      return { funded: false };
    }
  }

  /**
   * Get transaction status (confirmations, block info)
   */
  async getTransactionStatus(txid: string): Promise<TransactionStatus | null> {
    const cacheKey = `tx:${txid}`;
    const cached = this.getFromCache(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const response = await fetch(`${this.baseUrl}/tx/${txid}/status`);
      
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Blockstream API error: ${response.status}`);
      }

      const status = await response.json();
      this.setCache(cacheKey, status);
      return status;
    } catch (error) {
      console.error('Error getting transaction status:', error);
      return cached || null;
    }
  }

  /**
   * Get transaction details (including confirmations)
   */
  async getTransactionDetails(txid: string) {
    try {
      const response = await fetch(`${this.baseUrl}/tx/${txid}`);
      
      if (!response.ok) {
        throw new Error(`Blockstream API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting transaction details:', error);
      return null;
    }
  }

  /**
   * Simple caching to avoid hammering Blockstream API
   */
  private getFromCache(key: string): any | null {
    const cached = this.cache.get(key);
    
    if (!cached) return null;
    
    const age = Date.now() - cached.timestamp;
    if (age > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Clear cache for a specific address or transaction
   */
  clearCache(identifier: string): void {
    this.cache.delete(`address:${identifier}`);
    this.cache.delete(`tx:${identifier}`);
  }
}

export const blockchainMonitoring = new BlockchainMonitoringService();
