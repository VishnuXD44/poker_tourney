"use client";

import { useState, useEffect, useCallback } from "react";
import { io } from "socket.io-client";
import LiveTable from "@/components/LiveTable";
import Leaderboard from "@/components/Leaderboard";
import NewMatchForm from "@/components/NewMatchForm";
import BotUploadPanel from "@/components/BotUploadPanel";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3000";

export default function DashboardPage() {
  const [bots, setBots] = useState([]);
  const [socket, setSocket] = useState(null);
  const [matchUpdate, setMatchUpdate] = useState(null);
  const [connected, setConnected] = useState(false);
  const [constraints, setConstraints] = useState(null);

  const loadBots = useCallback(
    () =>
      fetch(`${API_URL}/api/bots`)
        .then((res) => res.json())
        .then((data) => setBots(Array.isArray(data) ? data : []))
        .catch(() => setBots([])),
    []
  );

  useEffect(() => {
    loadBots();
    fetch(`${API_URL}/api/bots/constraints`)
      .then((res) => res.json())
      .then((data) => setConstraints(data))
      .catch(() => setConstraints(null));
  }, [loadBots]);

  useEffect(() => {
    const s = io(SOCKET_URL, { autoConnect: true });
    s.on("connect", () => setConnected(true));
    s.on("disconnect", () => setConnected(false));
    s.on("MATCH_UPDATE", (payload) => setMatchUpdate(payload));
    setSocket(s);
    return () => s.disconnect();
  }, []);

  const startMatch = (payload) => {
    if (!socket?.connected) return;
    socket.emit("new_match", payload, (ack) => {
      if (ack?.error) console.error(ack.error);
    });
  };

  return (
    <div className="max-w-6xl mx-auto p-6" style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}>
      <a
        href="#main-content"
        className="absolute -top-12 left-4 px-4 py-2 bg-[#1a2744] text-[#e8c547] font-semibold rounded-lg z-50 focus:top-4 focus:outline focus:ring-2 focus:ring-[#b8860b] focus:ring-offset-2 transition-[top]"
      >
        Skip to main content
      </a>
      <header
        className="text-center mb-8 p-8 rounded-xl border shadow-sm"
        style={{
          background: "#ffffff",
          borderColor: "#e2dfda",
          boxShadow: "0 4px 12px rgba(26,39,68,0.06)",
        }}
      >
        <h1
          className="text-3xl font-bold tracking-tight"
          style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: "#1a2744" }}
        >
          Poker Bot Competition
        </h1>
        <div
          className="w-16 h-0.5 mx-auto mt-2 rounded-full"
          style={{ background: "linear-gradient(90deg, #b8860b 0%, #d4af37 100%)" }}
          aria-hidden
        />
        <p className="text-sm mt-3 font-medium" style={{ color: "#5c6577" }}>
          Live stream & leaderboard
        </p>
        <div className="mt-2 flex items-center justify-center gap-2">
          <span
            className="h-2 w-2 rounded-full flex-shrink-0"
            style={{ background: connected ? "#276749" : "#c53030" }}
          />
          <span className="text-xs" style={{ color: "#5c6577" }}>
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </header>

      <main id="main-content" className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <BotUploadPanel apiUrl={API_URL} constraints={constraints} bots={bots} onBotUploaded={loadBots} />
          <NewMatchForm bots={bots} onRunMatch={startMatch} disabled={!connected} update={matchUpdate} />
          <LiveTable update={matchUpdate} />
        </div>
        <div>
          <Leaderboard update={matchUpdate} />
        </div>
      </main>
      <footer
        className="mt-10 pt-6 border-t text-center"
        style={{ borderColor: "#e2dfda" }}
      >
        <p className="text-base font-semibold" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: "#1a2744" }}>
          Poker Bot Competition
        </p>
        <p className="text-sm mt-1" style={{ color: "#5c6577" }}>
          Live stream & leaderboard
        </p>
      </footer>
    </div>
  );
}
