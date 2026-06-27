// Next.js Instrumentation Hook.
// Runs once on the server when a new Next.js server instance is bootstrapping.
// We use it to initialize Sentry's server-side SDK *after* the server env is
// available. The register() export is required by Next.js's instrumentation API.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerServerSentry } = await import("./sentry.server.config");
    await registerServerSentry();
  }
  // The browser SDK is auto-initialized by Next.js via sentry.client.config.ts,
  // so we do nothing here for the edge/webpack runtime.
}
