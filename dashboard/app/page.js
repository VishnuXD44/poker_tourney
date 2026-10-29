"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import LiveTable from "@/components/LiveTable";
import Leaderboard from "@/components/Leaderboard";
import NewMatchForm from "@/components/NewMatchForm";
import BotUploadPanel from "@/components/BotUploadPanel";
import MyBotsPanel from "@/components/MyBotsPanel";
import { API_URL, SOCKET_URL, API_TOKEN, AUTH_HEADERS, ARENA } from "@/lib/api";
import { HOUSE_BOTS, loadMyBots } from "@/lib/myBots";
import { runLocalMatch } from "@/lib/localArena";

/** Bots, connection state and match control for the C++ game server. */
function useServerArena(enabled, onUpdate) {
  const [bots, setBots] = useState([]);
  const [connected, setConnected] = useState(false);
  const [constraints, setConstraints] = useState(null);
  const socketRef = useRef(null);
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
    if (!enabled) return;
    loadBots();
    fetch(`${API_URL}/api/bots/constraints`)
      .then((res) => res.json())
      .then((data) => setConstraints(data))
      .catch(() => setConstraints(null));
  }, [enabled, loadBots]);

  useEffect(() => {
    if (!enabled) return;
    let socket;
    let cancelled = false;
    // Loaded on demand so the browser-only build doesn't ship socket.io.
    import("socket.io-client").then(({ io }) => {
      if (cancelled) return;
      socket = io(SOCKET_URL, { autoConnect: true, auth: API_TOKEN ? { token: API_TOKEN } : {} });
      socket.on("connect", () => setConnected(true));
      socket.on("disconnect", () => setConnected(false));
      socket.on("MATCH_UPDATE", (payload) => {
        if (payload?.matchId === currentMatchId.current) onUpdate(payload);
      });
      socketRef.current = socket;
    });
    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, [enabled, onUpdate]);

  const startMatch = (payload) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.emit("new_match", payload, (ack) => {
      if (ack?.error) {
        onUpdate({ type: "MATCH_ERROR", error: ack.error });
        return;
      }
      currentMatchId.current = ack?.matchId ?? null;
      onUpdate(null);
    });
  };

  return { bots, connected, constraints, loadBots, startMatch };
}

/** House bots plus this browser's saved strategies; matches run on this page. */
function useBrowserArena(enabled, onUpdate) {
  const [myBots, setMyBots] = useState([]);
  const abortRef = useRef(null);

  const loadBots = useCallback(() => setMyBots(loadMyBots()), []);
  useEffect(() => {
    if (enabled) loadBots();
  }, [enabled, loadBots]);
  useEffect(() => () => abortRef.current?.abort(), []);

  // Memoised: NewMatchForm re-filters its selection whenever this array changes.
  const bots = useMemo(() => [...myBots, ...HOUSE_BOTS], [myBots]);

  const startMatch = ({ botIds, ...options }) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    onUpdate(null);
    const seated = botIds.map((id) => bots.find((b) => b.id === id)).filter(Boolean);
    runLocalMatch(seated, options, onUpdate, controller.signal).catch((err) =>
      onUpdate({ type: "MATCH_ERROR", error: err.message || "match failed" })
    );
  };

  return { bots, myBots, connected: true, loadBots, startMatch };
}

export default function DashboardPage() {
  const [matchUpdate, setMatchUpdate] = useState(null);
  const server = useServerArena(ARENA === "server", setMatchUpdate);
  const browser = useBrowserArena(ARENA === "browser", setMatchUpdate);
  const arena = ARENA === "server" ? server : browser;

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
          <p className="text-xs text-muted mt-1">
            texas hold&apos;em · {ARENA === "server" ? "c++ bot arena" : "build a bot, watch it play"}
          </p>
        </div>
        <div className="flex items-center gap-6 text-xs">
          <Link href="/builder" className="text-muted hover:text-ink underline-offset-4 hover:underline">
            strategy builder →
          </Link>
          {ARENA === "server" ? (
            <p className="flex items-center gap-2" role="status">
              <span aria-hidden>{arena.connected ? "●" : "○"}</span>
              <span className={arena.connected ? "text-ink" : "text-muted"}>{arena.connected ? "online" : "offline"}</span>
            </p>
          ) : (
            <p className="text-muted">runs in your browser</p>
          )}
        </div>
      </header>

      <main id="main-content" className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LiveTable update={matchUpdate} />
        </div>
        <div className="space-y-8">
          <NewMatchForm bots={arena.bots} onRunMatch={arena.startMatch} disabled={!arena.connected} update={matchUpdate} />
          <Leaderboard update={matchUpdate} />
        </div>
        <div className="lg:col-span-3">
          {ARENA === "server" ? (
            <BotUploadPanel
              apiUrl={API_URL}
              authHeaders={AUTH_HEADERS}
              constraints={server.constraints}
              bots={server.bots}
              onBotUploaded={server.loadBots}
            />
          ) : (
            <MyBotsPanel myBots={browser.myBots} onChange={browser.loadBots} />
          )}
        </div>
      </main>
      <footer className="mt-12 pt-5 border-t border-line text-xs text-muted flex justify-between">
        <span>poker_tourney</span>
        <span>{arena.bots.length} bots {ARENA === "server" ? "registered" : "available"}</span>
      </footer>
    </div>
  );
}
