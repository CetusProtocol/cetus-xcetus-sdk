/** @type import('eslint').Linter.Config */
module.exports = {
  "roots": [
    "<rootDir>/src",
    "<rootDir>/tests"
  ],
  testMatch: [
    "**/__tests__/**/*.+(ts|tsx|js)",
    "**/?(*.)+(spec|test).+(ts|tsx|js)"
  ],
  transform: {
    "^.+\\.(ts|tsx)$": "ts-jest"
  },
  globals: {
    "ts-jest": {
      tsconfig: "./tests/tsconfig.json"
    }
  },
  // testRegex: 'router.test.ts',
  testTimeout: 180*1000
}