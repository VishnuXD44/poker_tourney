import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Downloaded at build time and served from our own origin: no third-party font requests.
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-mono", display: "swap" });

const SITE = "https://bevishnu.com/poker";

export const metadata = {
  metadataBase: new URL(SITE),
  title: { default: "poker_tourney", template: "%s · poker_tourney" },
  description: "Build a Texas Hold'em bot by wiring up questions and moves, then watch it play against house bots.",
  alternates: { canonical: SITE },
  openGraph: {
    title: "poker_tourney",
    description: "Build a Texas Hold'em bot without writing code, then watch it play.",
    url: SITE,
    siteName: "bevishnu.com",
    type: "website",
  },
};

export const viewport = {
  themeColor: "#0e0f0f",
  colorScheme: "dark",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={mono.variable}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
