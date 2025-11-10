import { beforeEach, afterEach } from 'vitest';

// Global test setup
beforeEach(() => {
  // Reset environment variables
  process.env.NODE_ENV = 'test';
});

afterEach(() => {
  // Cleanup after each test
});
