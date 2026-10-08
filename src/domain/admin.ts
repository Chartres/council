// The admin bar (cost indicator + free/premium switch) is visible only to these
// emails. Not a security boundary — the gateway's `/v1/admin/usage` is the real
// door — this just decides whether the client bothers asking.
export const ADMIN_EMAILS = ['eyal.jerby@gmail.com', 'pavol@dravecky.sk']

// ponytail: VITE_E2E_ADMIN is a build-time test-only escape hatch so Playwright can
// exercise the admin bar without a real Supabase session. Never set it in the
// Cloudflare Pages project env — absent there, so it is a no-op in production.
export function isAdmin(email: string | null | undefined): boolean {
  if (import.meta.env.VITE_E2E_ADMIN === '1') return true
  return Boolean(email && ADMIN_EMAILS.includes(email))
}
