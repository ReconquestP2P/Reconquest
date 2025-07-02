import { BitcoinEscrowService } from '../services/BitcoinEscrowService';

describe('BitcoinEscrowService', () => {
  let escrowService: BitcoinEscrowService;

  beforeEach(() => {
    escrowService = new BitcoinEscrowService();
  });

  describe('generateEscrowAddress', () => {
    it('should generate a valid testnet address', async () => {
      const address = await escrowService.generateEscrowAddress();
      
      expect(address).toMatch(/^tb1[a-z0-9]{39,}$/);
      expect(address.length).toBeGreaterThan(40);
    });

    it('should generate unique addresses on multiple calls', async () => {
      const address1 = await escrowService.generateEscrowAddress();
      const address2 = await escrowService.generateEscrowAddress();
      
      expect(address1).not.toBe(address2);
    });
  });

  describe('verifyTransaction', () => {
    it('should verify a transaction successfully', async () => {
      const address = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';
      const expectedAmount = 1.5;
      
      const result = await escrowService.verifyTransaction(address, expectedAmount);
      
      expect(result.verified).toBe(true);
      expect(result.txHash).toBeDefined();
      expect(result.txHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle transaction verification with different amounts', async () => {
      const address = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';
      const amounts = [0.1, 0.5, 1.0, 2.5];
      
      for (const amount of amounts) {
        const result = await escrowService.verifyTransaction(address, amount);
        expect(result.verified).toBe(true);
        expect(result.txHash).toBeDefined();
      }
    });
  });

  describe('getTransactionUrl', () => {
    it('should return correct testnet block explorer URL', () => {
      const txHash = 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890';
      
      const url = escrowService.getTransactionUrl(txHash);
      
      expect(url).toBe(`https://blockstream.info/testnet/tx/${txHash}`);
    });

    it('should handle different transaction hashes', () => {
      const txHashes = [
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'
      ];
      
      txHashes.forEach(txHash => {
        const url = escrowService.getTransactionUrl(txHash);
        expect(url).toBe(`https://blockstream.info/testnet/tx/${txHash}`);
      });
    });
  });
});