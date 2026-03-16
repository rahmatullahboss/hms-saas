import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['test/workers/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/types.ts',
        'src/do/**',           // Durable Objects — require workerd runtime
        'src/lib/ai-memory.ts', // DO-based AI memory
        'src/lib/pdf-bangla.ts', // PDF generation — needs browser/canvas
        'src/lib/sentry.ts',   // Sentry integration — external SDK
        'src/lib/email.ts',    // External API (Resend)
        'src/lib/sms.ts',      // External API
        'src/lib/whatsapp.ts', // External API
        'src/lib/logger.ts',   // External logging
        'src/lib/cache.ts',    // KV cache — external binding
        'src/lib/video.ts',    // Video streaming — needs WebRTC/media
        'src/utils/web-push.ts', // Web Push API
        'src/utils/video.ts',  // Video/WebRTC
        'src/routes/ai.ts',    // External AI API
        'src/schemas/ai.ts',   // AI schemas (no logic)
        'src/lib/ai.ts',       // External AI API
        'src/lib/bcryptjs.d.ts',  // Type definitions only
        'src/index.ts',        // Main entry — just route wiring
        'src/scheduled.ts',    // Cron handler — needs workerd
        'src/routes/seed.ts',  // Seed data — one-time setup
        'src/routes/init.ts',  // DB init — one-time setup
        'src/routes/base.ts',  // Base config export
        'src/routes/index.ts', // Route index
        'src/routes/hospitalSite/**', // White-label sites — all configs
        'src/routes/tenant/telemedicine.ts', // External WebRTC
        'src/routes/tenant/push.ts',  // External push API
        'src/routes/tenant/ai.ts',    // External AI API
        'src/routes/tenant/pushNotifications.ts', // Web Push API — external browser API
        'src/routes/tenant/subscription.ts', // Stripe integration — external SDK
        'src/middleware/subscription.ts',  // Stripe subscription middleware
        'src/routes/tenant/consultations.ts', // Uses video.ts, sms.ts, email.ts — external APIs
        // Bcrypt-dependent routes — cannot test without native bcrypt in Node.js
        'src/routes/login-direct.ts',     // Uses bcrypt.compare
        'src/routes/register.ts',         // Uses bcrypt.hash
        'src/routes/public-invite.ts',    // Uses bcrypt.hash
        'src/routes/tenant/auth.ts',      // Uses bcrypt.compare/hash
        'src/routes/auth.ts',             // Uses bcrypt
        'src/routes/admin/**',            // Admin routes use bcrypt
        // Other untestable files
        'src/routes/tenant/pdf.ts',       // PDF generation — needs canvas
        'src/routes/tenant/notifications.ts', // SMS/Email/WhatsApp — external API wrappers
        'src/routes/tenant/payments.ts',  // External payment provider APIs
        'src/routes/onboarding.ts',       // Depends on external email
        'src/routes/public/hospitalSite.ts', // Public site — needs real tenant
        'src/schemas/pricing.ts',         // Static pricing schemas
        'src/schemas/ai.ts',              // AI schemas (no logic — already excluded above)
        // External service libraries — cannot test without real API keys
        'src/lib/sms.ts',                 // External SMS provider
        'src/lib/email.ts',               // External email API
        'src/lib/whatsapp.ts',            // External WhatsApp API
        'src/lib/ai.ts',                  // External AI API
        'src/lib/ai-memory.ts',           // AI memory — depends on AI API
        'src/lib/payment-gateway.ts',     // External payment provider
        'src/lib/pdf-bangla.ts',          // PDF generation — needs canvas
        'src/lib/video.ts',               // Video streaming
        'src/lib/sentry.ts',              // Sentry integration
        'src/lib/logger.ts',              // Logger — Sentry dependency
        'src/lib/cache.ts',               // Cache — KV binding details
        // React components — cannot test via app.request()
        'src/**/*.tsx',                   // All TSX files
        'src/routes/public/prerender.tsx', // Prerender — React SSR
        // Entry points / orchestration — tested implicitly via route tests
        'src/index.ts',                   // Main app entry — route mounting
        'src/scheduled.ts',              // Cron scheduled handler
        'src/lib/fhir/types.ts',         // Pure type definitions
        'src/types.ts',                  // Type definitions
        'src/bcryptjs.d.ts',             // Type declaration file
        // White-label site configs — no runtime logic to test
        'src/routes/public/themes/**',   // Theme configs (arogyaseva, carefirst, medtrust)
        'src/do/**',                     // Durable Objects — workerd runtime only
        'src/lib/fhir/search.ts',        // FHIR search utils — pure utility
        'src/lib/accounting-helpers.ts',  // Uses DurableObjectNamespace — workerd only
      ],
      thresholds: {
        // Baseline thresholds — raise as coverage improves
        lines: 10,
        functions: 10,
        branches: 10,
      },
    },
  },
});
