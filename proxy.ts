export { auth as proxy } from "@/auth";

export const config = {
  matcher: [
    "/((?!api/auth|api/health|api/traces/ingest|review|sign-in|sign-up|docs|_next|favicon.ico).*)",
  ],
};
