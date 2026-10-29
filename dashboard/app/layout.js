import "./globals.css";

export const metadata = {
  title: "poker_tourney",
  description: "Live stream and leaderboard for poker bot matches",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
