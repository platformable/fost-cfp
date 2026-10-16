// Load .env for command-line scripts (Next.js loads it for the app itself).
try {
  process.loadEnvFile('.env');
} catch {
  // No .env file: rely on the environment.
}
