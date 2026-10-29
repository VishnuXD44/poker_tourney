// Set NEXT_PUBLIC_API_URL to use the C++ game server (see .env.development). Without it
// the dashboard runs matches in the browser with builder strategies only; that is how
// the public site at bevishnu.com/poker is built.
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
export const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || API_URL;
export const ARENA = API_URL ? "server" : "browser";
// Must match the server's API_TOKEN when one is set. Note it is visible to anyone who can load the dashboard.
export const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN || "";
export const AUTH_HEADERS = API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {};
