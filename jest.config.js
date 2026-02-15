export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  roots: ['<rootDir>/server', '<rootDir>/shared'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        types: ['jest', 'node'],
        module: 'ESNext',
        moduleResolution: 'bundler',
        esModuleInterop: true,
        allowImportingTsExtensions: true,
        paths: {
          '@shared/*': ['./shared/*'],
        },
      },
    }],
  },
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/shared/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/server/__tests__/setup.ts'],
};
