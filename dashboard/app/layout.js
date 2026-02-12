import "./globals.css";

export const metadata = {
  title: "Poker Bot Dashboard",
  description: "Live stream and leaderboard for poker bot matches",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased" style={{ background: "#f6f5f3", color: "#1a2744" }}>
        {children}
      </body>
    </html>
  );
}
