/**
 * Multisig Service - Manages 2-of-3 multisig escrow creation and management
 * Integrates with Bitcoin RPC client
 */

import { getBitcoinRpcClient } from './bitcoin-rpc-client';
import * as secp256k1 from '@noble/secp256k1';

export interface EscrowSetup {
  escrowAddress: string;
  redeemScript: string;
  scriptHash: string;
  borrowerPubkey: string;
  lenderPubkey: string;
  platformPubkey: string;
  createdAt: Date;
}

export interface CollateralDeposit {
  txid: string;
  address: string;
  amountBtc: number;
  confirmations: number;
  status: 'pending' | 'confirmed';
}

export class MultisigService {
  private rpcClient = getBitcoinRpcClient();

  /**
   * Setup 2-of-3 multisig escrow for loan
   * Returns escrow address and scripts
   */
  async setupEscrow(
    borrowerPubkey: string,
    lenderPubkey: string,
    platformPubkey: string
  ): Promise<EscrowSetup> {
    try {
      console.log('🔐 Setting up 2-of-3 multisig escrow...');

      // Validate public keys format
      this.validatePubkey(borrowerPubkey);
      this.validatePubkey(lenderPubkey);
      this.validatePubkey(platformPubkey);

      // Create multisig address
      const multisigInfo = await this.rpcClient.createMultisigAddress(
        borrowerPubkey,
        lenderPubkey,
        platformPubkey
      );

      const escrow: EscrowSetup = {
        escrowAddress: multisigInfo.address,
        redeemScript: multisigInfo.redeemScript,
        scriptHash: multisigInfo.scriptHash,
        borrowerPubkey,
        lenderPubkey,
        platformPubkey,
        createdAt: new Date(),
      };

      console.log(`✅ Escrow setup complete`);
      console.log(`   Address: ${escrow.escrowAddress}`);
      console.log(`   Redeem Script: ${escrow.redeemScript.slice(0, 40)}...`);

      return escrow;
    } catch (error) {
      console.error('Failed to setup escrow:', error);
      throw error;
    }
  }

  /**
   * Monitor for BTC deposit to escrow address
   */
  async monitorDeposit(
    escrowAddress: string,
    expectedAmountBtc: number,
    maxWaitSeconds: number = 300
  ): Promise<CollateralDeposit | null> {
    try {
      console.log(
        `👀 Monitoring ${escrowAddress.slice(0, 20)}... for ${expectedAmountBtc} BTC deposit...`
      );

      const startTime = Date.now();
      const pollInterval = 5000; // 5 seconds

      while (Date.now() - startTime < maxWaitSeconds * 1000) {
        // Check balance
        const balance = await this.rpcClient.getBalance(escrowAddress);

        if (balance >= expectedAmountBtc) {
          // Get UTXO details
          const utxos = await this.rpcClient.getUtxos(escrowAddress);
          const deposit = utxos.find((u) => u.amount >= expectedAmountBtc);

          if (deposit) {
            console.log(`✅ Deposit confirmed! TXID: ${deposit.txid}`);

            return {
              txid: deposit.txid,
              address: escrowAddress,
              amountBtc: deposit.amount,
              confirmations: deposit.confirmations,
              status: deposit.confirmations > 0 ? 'confirmed' : 'pending',
            };
          }
        }

        // Wait before polling again
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }

      console.warn(`⚠️  Deposit timeout after ${maxWaitSeconds}s`);
      return null;
    } catch (error) {
      console.error('Failed to monitor deposit:', error);
      throw error;
    }
  }

  /**
   * Validate public key format (compressed 33 bytes = 66 hex chars)
   */
  private validatePubkey(pubkey: string): void {
    if (!pubkey.startsWith('02') && !pubkey.startsWith('03')) {
      throw new Error(`Invalid public key format: ${pubkey.slice(0, 20)}...`);
    }

    if (pubkey.length !== 66) {
      throw new Error(
        `Invalid public key length: ${pubkey.length} (expected 66)`
      );
    }
  }

  /**
   * Verify multisig setup with real network check
   */
  async verifySetup(): Promise<boolean> {
    try {
      const isHealthy = await this.rpcClient.healthCheck();

      if (!isHealthy) {
        console.error('❌ Bitcoin RPC node is not healthy');
        return false;
      }

      console.log('✅ Multisig service verified');
      return true;
    } catch (error) {
      console.error('Failed to verify setup:', error);
      return false;
    }
  }
}

export const multisigService = new MultisigService();
