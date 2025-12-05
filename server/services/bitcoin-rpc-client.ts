/**
 * Bitcoin RPC Client - Connects to Bitcoin testnet node
 * Handles multisig address creation, transaction signing, and broadcasting
 */

import axios, { AxiosInstance } from 'axios';

export interface RpcRequest {
  jsonrpc: string;
  id: string;
  method: string;
  params: any[];
}

export interface RpcResponse {
  result?: any;
  error?: {
    code: number;
    message: string;
  };
  id: string;
}

export interface MultisigInfo {
  address: string;
  redeemScript: string;
  scriptHash: string;
}

export interface TransactionInput {
  txid: string;
  vout: number;
  scriptPubKey: string;
  amount: number;
}

export interface SignedTransaction {
  hex: string;
  complete: boolean;
}

export class BitcoinRpcClient {
  private client: AxiosInstance;
  private rpcUrl: string;
  private rpcUser: string;
  private rpcPass: string;
  private network: string;

  constructor() {
    this.rpcUrl = process.env.BITCOIN_RPC_URL || 'http://localhost:18332';
    this.rpcUser = process.env.BITCOIN_RPC_USER || 'bitcoin';
    this.rpcPass = process.env.BITCOIN_RPC_PASS || 'password';
    this.network = process.env.BITCOIN_NETWORK || 'testnet';

    // Create axios client with Basic Auth
    this.client = axios.create({
      baseURL: this.rpcUrl,
      auth: {
        username: this.rpcUser,
        password: this.rpcPass,
      },
      timeout: 30000,
    });

    console.log(`🔗 Bitcoin RPC Client initialized (${this.network})`);
  }

  /**
   * Make RPC call to Bitcoin node
   */
  private async call(method: string, params: any[] = []): Promise<any> {
    try {
      const response = await this.client.post<RpcResponse>('/', {
        jsonrpc: '2.0',
        id: Date.now().toString(),
        method,
        params,
      });

      if (response.data.error) {
        throw new Error(`RPC Error: ${response.data.error.message}`);
      }

      return response.data.result;
    } catch (error) {
      console.error(`❌ RPC call failed: ${method}`, error);
      throw error;
    }
  }

  /**
   * Create 2-of-3 multisig address for escrow
   * pubkeys: [borrowerPub, lenderPub, platformPub]
   */
  async createMultisigAddress(
    borrowerPubkey: string,
    lenderPubkey: string,
    platformPubkey: string
  ): Promise<MultisigInfo> {
    try {
      console.log('🔐 Creating 2-of-3 multisig address...');

      // Create multisig address (2 of 3 required)
      const result = await this.call('createmultisig', [
        2,
        [borrowerPubkey, lenderPubkey, platformPubkey],
      ]);

      const scriptHash = result.scriptHash || '';
      const redeemScript = result.redeemScript || '';
      const address = result.address || '';

      console.log(`✅ Multisig address created: ${address}`);
      console.log(`   RedeemScript: ${redeemScript.slice(0, 50)}...`);

      return {
        address,
        redeemScript,
        scriptHash,
      };
    } catch (error) {
      console.error('Failed to create multisig address:', error);
      throw error;
    }
  }

  /**
   * Get UTXO (unspent transaction output) for address
   */
  async getUtxos(address: string): Promise<any[]> {
    try {
      console.log(`📋 Fetching UTXOs for ${address.slice(0, 20)}...`);

      // Use listunspent to find UTXOs
      const utxos = await this.call('listunspent', [
        0, // min confirmations
        9999999, // max confirmations
        [address], // addresses to search
      ]);

      console.log(`✅ Found ${utxos.length} UTXOs`);
      return utxos;
    } catch (error) {
      console.error('Failed to get UTXOs:', error);
      throw error;
    }
  }

  /**
   * Get balance for address
   */
  async getBalance(address: string): Promise<number> {
    try {
      const utxos = await this.getUtxos(address);
      const balance = utxos.reduce((sum, utxo) => sum + (utxo.amount || 0), 0);
      console.log(`💰 Balance for ${address.slice(0, 20)}...: ${balance} BTC`);
      return balance;
    } catch (error) {
      console.error('Failed to get balance:', error);
      throw error;
    }
  }

  /**
   * Create and sign a transaction (PSBT)
   */
  async createSignedTransaction(
    inputs: TransactionInput[],
    outputs: { [address: string]: number },
    redeemScript: string
  ): Promise<SignedTransaction> {
    try {
      console.log('📝 Creating PSBT...');

      // Create PSBT
      const psbtHex = await this.call('createpsbt', [inputs, outputs]);

      console.log(`✅ PSBT created: ${psbtHex.slice(0, 50)}...`);

      return {
        hex: psbtHex,
        complete: false,
      };
    } catch (error) {
      console.error('Failed to create transaction:', error);
      throw error;
    }
  }

  /**
   * Broadcast transaction to network
   */
  async broadcastTransaction(txHex: string): Promise<string> {
    try {
      console.log('📡 Broadcasting transaction to testnet...');

      const txid = await this.call('sendrawtransaction', [txHex]);

      console.log(`✅ Transaction broadcast! TXID: ${txid}`);
      return txid;
    } catch (error) {
      console.error('Failed to broadcast transaction:', error);
      throw error;
    }
  }

  /**
   * Get transaction details
   */
  async getTransaction(txid: string): Promise<any> {
    try {
      console.log(`📊 Fetching transaction ${txid.slice(0, 20)}...`);

      const tx = await this.call('gettransaction', [txid]);

      console.log(`✅ Transaction found: ${tx.confirmations} confirmations`);
      return tx;
    } catch (error) {
      console.error('Failed to get transaction:', error);
      throw error;
    }
  }

  /**
   * Get current network info
   */
  async getNetworkInfo(): Promise<any> {
    try {
      const info = await this.call('getnetworkinfo', []);
      console.log(`✅ Network: ${this.network}, Connected peers: ${info.connections}`);
      return info;
    } catch (error) {
      console.error('Failed to get network info:', error);
      throw error;
    }
  }

  /**
   * Get blockchain info
   */
  async getBlockchainInfo(): Promise<any> {
    try {
      const info = await this.call('getblockchaininfo', []);
      console.log(
        `✅ Blockchain synced: ${info.verificationprogress * 100}%, Height: ${info.blocks}`
      );
      return info;
    } catch (error) {
      console.error('Failed to get blockchain info:', error);
      throw error;
    }
  }

  /**
   * Decode PSBT (Partially Signed Bitcoin Transaction)
   */
  async decodePsbt(psbtHex: string): Promise<any> {
    try {
      const decoded = await this.call('decodepsbt', [psbtHex]);
      console.log(`✅ PSBT decoded`);
      return decoded;
    } catch (error) {
      console.error('Failed to decode PSBT:', error);
      throw error;
    }
  }

  /**
   * Verify network connectivity
   */
  async healthCheck(): Promise<boolean> {
    try {
      const info = await this.getBlockchainInfo();
      return info.blocks > 0;
    } catch (error) {
      console.error('❌ Bitcoin RPC health check failed:', error);
      return false;
    }
  }
}

// Singleton instance
let clientInstance: BitcoinRpcClient | null = null;

export function getBitcoinRpcClient(): BitcoinRpcClient {
  if (!clientInstance) {
    clientInstance = new BitcoinRpcClient();
  }
  return clientInstance;
}
