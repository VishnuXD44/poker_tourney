"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
    <div className="px-4 sm:px-6 lg:px-10 py-6 sm:py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 mb-6 sm:mb-8">
        <h1 className="text-lg sm:text-xl font-bold tracking-tight">
          bot arena <span className="text-muted font-normal text-xs sm:text-sm ml-2">{ARENA === "server" ? "c++ bots, live" : "build a bot, watch it play"}</span>
        </h1>
        {ARENA === "server" ? (
          <p className="flex items-center gap-2 text-xs" role="status">
            <span aria-hidden>{arena.connected ? "●" : "○"}</span>
            <span className={arena.connected ? "text-ink" : "text-muted"}>{arena.connected ? "online" : "offline"}</span>
          </p>
        ) : (
          <p className="text-xs text-muted">runs in your browser</p>
        )}
      </div>

      <main id="main-content" className="grid gap-6 lg:gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="min-w-0">
          <LiveTable update={matchUpdate} />
        </div>
        <div className="space-y-8">
          <NewMatchForm bots={arena.bots} onRunMatch={arena.startMatch} disabled={!arena.connected} update={matchUpdate} />
          <Leaderboard update={matchUpdate} />
        </div>
        <div className="lg:col-span-2">
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
