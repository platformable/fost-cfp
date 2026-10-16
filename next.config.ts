import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Produces a self-contained .next/standalone server (only the files needed at runtime),
  // which the Dockerfile copies into a small production image.
  output: 'standalone',
  // Server-only libraries that should be loaded from node_modules rather than bundled.
  serverExternalPackages: ['pg', 'exceljs'],
  poweredByHeader: false,
  webpack: (config, { nextRuntime, webpack }) => {
    // src/instrumentation.ts dynamically imports './lib/db' (pg) only when NEXT_RUNTIME === 'nodejs',
    // but in dev that guard isn't dead-code-eliminated, so webpack still tries to bundle pg for the
    // Edge copy of instrumentation.ts and fails (pg pulls in a Node-only addon plus fs/net/tls/etc.).
    // That branch never actually runs under the Edge runtime, so it's safe to skip resolving it there.
    if (nextRuntime === 'edge') {
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^\.\/lib\/(db|migrate)$/,
          contextRegExp: /src$/,
        }),
      );
    }
    return config;
  },
};

export default nextConfig;
