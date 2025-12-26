import crypto from 'crypto';

/**
 * EncryptionService - Secure key encryption for platform-operated keys
 * 
 * Uses AES-256-GCM for authenticated encryption.
 * In production, replace ENCRYPTION_KEY with HSM/KMS.
 */
export class EncryptionService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 12;
  private static readonly AUTH_TAG_LENGTH = 16;
  
  private static getEncryptionKey(): Buffer {
    const key = process.env.PLATFORM_ENCRYPTION_KEY;
    if (!key) {
      // For development/testnet, generate a deterministic key from environment
      // In production, this MUST come from HSM/KMS
      console.warn('[EncryptionService] WARNING: Using fallback encryption key. Set PLATFORM_ENCRYPTION_KEY in production.');
      const fallbackKey = crypto.createHash('sha256').update('reconquest-testnet-dev-key-v1').digest();
      return fallbackKey;
    }
    
    // Key should be base64-encoded 32 bytes
    const keyBuffer = Buffer.from(key, 'base64');
    if (keyBuffer.length !== 32) {
      throw new Error('PLATFORM_ENCRYPTION_KEY must be 32 bytes (256 bits) base64-encoded');
    }
    return keyBuffer;
  }

  /**
   * Encrypt a private key for secure storage
   * Returns base64-encoded: IV + AuthTag + Ciphertext
   */
  static encrypt(plaintext: string): string {
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(this.IV_LENGTH);
    
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();
    
    // Combine: IV + AuthTag + Ciphertext
    const combined = Buffer.concat([iv, authTag, encrypted]);
    return combined.toString('base64');
  }

  /**
   * Decrypt a private key from storage
   * Expects base64-encoded: IV + AuthTag + Ciphertext
   */
  static decrypt(encryptedData: string): string {
    const key = this.getEncryptionKey();
    const combined = Buffer.from(encryptedData, 'base64');
    
    // Extract components
    const iv = combined.subarray(0, this.IV_LENGTH);
    const authTag = combined.subarray(this.IV_LENGTH, this.IV_LENGTH + this.AUTH_TAG_LENGTH);
    const ciphertext = combined.subarray(this.IV_LENGTH + this.AUTH_TAG_LENGTH);
    
    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);
    
    return decrypted.toString('utf8');
  }

  /**
   * Verify encryption/decryption works correctly
   */
  static verify(): boolean {
    try {
      const testData = 'test-private-key-verification';
      const encrypted = this.encrypt(testData);
      const decrypted = this.decrypt(encrypted);
      return decrypted === testData;
    } catch (error) {
      console.error('[EncryptionService] Verification failed:', error);
      return false;
    }
  }
}
