module.exports = {
  clearMocks: true,
  moduleFileExtensions: ['js', 'ts'],
  // Unit tests only; live Notion smoke script is notion.test.ts (npm start), not Jest.
  testMatch: ['**/*.spec.ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    'notion\\.test\\.ts$', // explicit: never pick up __tests__/notion.test.ts if testMatch widens
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  verbose: true
}