export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
export const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3000";
// Must match the server's API_TOKEN when one is set. Note it is visible to anyone who can load the dashboard.
export const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN || "";
export const AUTH_HEADERS = API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {};
