module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  clearMocks: true,
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.spec.ts'],
};
