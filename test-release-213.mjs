import { releaseCollateral } from './server/services/CollateralReleaseService.ts';
import { storage } from './server/storage.ts';

console.log('Attempting collateral release for loan #213 (legacy borrower+lender path)...');
const result = await releaseCollateral(storage, 213);
console.log('Result:', JSON.stringify(result, null, 2));
