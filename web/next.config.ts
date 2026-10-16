import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

/**
 * The browser may only talk to this app (connect-src 'self'). Student documents never leave it from the
 * browser, even if a library tried to send telemetry. AI and OneDrive calls happen on the server, and Microsoft
 * sign-in is a plain link (a top-level navigation), so form-action stays 'self'.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' blob: data:${dev ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  // large WebAssembly bundle / PDF reader with its own worker: load them from node_modules at runtime
  serverExternalPackages: ["harper.js", "pdfjs-dist"],
  // read at runtime (not imported), so they must be bundled explicitly for Vercel: the bundled rules, AI rulebook and
  // examples (defaults until Karina saves her own in OneDrive) and pdf.js's worker and fonts (PDF uploads)
  outputFileTracingIncludes: {
    "/*": [
      "./prompts/karina-rules.json",
      "./prompts/karina-style-guide.md",
      "./prompts/karina-examples.md",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/standard_fonts/**/*",
    ],
  },
  // never ship local student data or backups, even from a build made on this computer
  outputFileTracingExcludes: {
    "/*": ["./.data/**/*", "./prompts/*.backup.*", "./e2e-shots/**/*"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
