module.exports = {
  testEnvironment: 'node',
  collectCoverage: true,
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'main.js',
    'scripts/mas-publish-pipeline.js'
  ],
  coverageThreshold: {
    global: {
      branches: 3,
      functions: 8,
      lines: 4,
      statements: 4
    }
  },
  modulePathIgnorePatterns: ['/dist/'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/build/'],
  testMatch: ['**/__tests__/**/*.test.js']
};
