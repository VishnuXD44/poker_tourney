"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { io } from "socket.io-client";
import LiveTable from "@/components/LiveTable";
import Leaderboard from "@/components/Leaderboard";
import NewMatchForm from "@/components/NewMatchForm";
import BotUploadPanel from "@/components/BotUploadPanel";

import { API_URL, SOCKET_URL, API_TOKEN, AUTH_HEADERS } from "@/lib/api";

export default function DashboardPage() {
  const [bots, setBots] = useState([]);
  const [socket, setSocket] = useState(null);
  const [matchUpdate, setMatchUpdate] = useState(null);
  const [connected, setConnected] = useState(false);
  const [constraints, setConstraints] = useState(null);
  const currentMatchId = useRef(null);

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
    const s = io(SOCKET_URL, { autoConnect: true, auth: API_TOKEN ? { token: API_TOKEN } : {} });
    s.on("connect", () => setConnected(true));
    s.on("disconnect", () => setConnected(false));
    s.on("MATCH_UPDATE", (payload) => {
      if (payload?.matchId === currentMatchId.current) setMatchUpdate(payload);
    });
    setSocket(s);
    return () => s.disconnect();
  }, []);

  const startMatch = (payload) => {
    if (!socket?.connected) return;
    socket.emit("new_match", payload, (ack) => {
      if (ack?.error) {
        setMatchUpdate({ type: "MATCH_ERROR", error: ack.error });
        return;
      }
      currentMatchId.current = ack?.matchId ?? null;
      setMatchUpdate(null);
    });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <a
        href="#main-content"
        className="absolute -top-12 left-4 px-3 py-2 bg-ink text-surface text-xs uppercase tracking-widest rounded z-50 focus:top-4 transition-[top]"
      >
        Skip to main content
      </a>
      <header className="flex flex-wrap items-end justify-between gap-4 mb-10 pb-5 border-b border-line">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">poker_tourney</h1>
          <p className="text-xs text-muted mt-1">texas hold&apos;em · c++ bot arena</p>
        </div>
        <div className="flex items-center gap-6 text-xs">
          <Link href="/builder" className="text-muted hover:text-ink underline-offset-4 hover:underline">
            strategy builder →
          </Link>
          <p className="flex items-center gap-2" role="status">
            <span aria-hidden>{connected ? "●" : "○"}</span>
            <span className={connected ? "text-ink" : "text-muted"}>{connected ? "online" : "offline"}</span>
          </p>
        </div>
      </header>

      <main id="main-content" className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LiveTable update={matchUpdate} />
        </div>
        <div className="space-y-8">
          <NewMatchForm bots={bots} onRunMatch={startMatch} disabled={!connected} update={matchUpdate} />
          <Leaderboard update={matchUpdate} />
        </div>
        <div className="lg:col-span-3">
          <BotUploadPanel apiUrl={API_URL} authHeaders={AUTH_HEADERS} constraints={constraints} bots={bots} onBotUploaded={loadBots} />
        </div>
      </main>
      <footer className="mt-12 pt-5 border-t border-line text-xs text-muted flex justify-between">
        <span>poker_tourney</span>
        <span>{bots.length} bots registered</span>
      </footer>
    </div>
  );
}
