// The app's address (production, preview or local), for links the server sends out (LINE, email)
export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3100")).replace(/\/$/, "");
}
