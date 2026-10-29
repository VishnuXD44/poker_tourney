"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Panel from "@/components/Panel";
import ChipStack from "@/components/Chips";
import { API_URL, AUTH_HEADERS, ARENA } from "@/lib/api";
import { saveMyBot } from "@/lib/myBots";
import {
  BUILDER_STORAGE_KEY,
  NODE_TYPES,
  NODE_W,
  PALETTE,
  TEMPLATES,
  TIER_HELP,
  TIER_NAMES,
  SCORE_NAMES,
  connect,
  decide,
  defaultParams,
  edgeKey,
  generateCpp,
  lint,
  nodeHeight,
  outPorts,
  paramValue,
  parseCard,
  portPos,
  randomName,
  randomStrategy,
} from "@/lib/strategy";

const DECK = [..."23456789TJQKA"].flatMap((r) => [..."hdcs"].map((s) => r + s));

function loadSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(BUILDER_STORAGE_KEY));
    if (saved?.graph?.nodes?.some((n) => n.type === "start")) return saved;
  } catch {}
  return null;
}

function cloneTemplate(name) {
  return JSON.parse(JSON.stringify(TEMPLATES[name]));
}

function nextId(graph) {
  const max = graph.nodes.reduce((m, n) => Math.max(m, Number(n.id.slice(1)) || 0), 0);
  return `n${max + 1}`;
}

function parseCards(text) {
  const seen = new Set();
  const cards = [];
  let bad = false;
  for (const tok of text.split(/[\s,]+/).filter(Boolean)) {
    const c = parseCard(tok);
    if (!c) bad = true;
    const key = c && `${c.r}${c.s}`;
    if (c && !seen.has(key)) {
      seen.add(key);
      cards.push(tok);
    }
  }
  return { cards, bad };
}

function edgePath(a, b) {
  const dy = Math.max(40, Math.abs(b.y - a.y) / 2);
  return `M ${a.x} ${a.y} C ${a.x} ${a.y + dy}, ${b.x} ${b.y - dy}, ${b.x} ${b.y}`;
}

/* ---------- node ---------- */

function NodeCard({ node, selected, onPath, linking, onPointerDown, onPortDown, onParam, onDelete }) {
  const t = NODE_TYPES[node.type];
  const value = paramValue(node);
  const tag = t.kind === "cond" ? "if" : t.kind === "action" ? "do" : "▶";
  const border = selected ? "var(--hi)" : onPath ? "var(--ink)" : undefined;

  return (
    <div
      data-node-id={node.id}
      onPointerDown={(e) => onPointerDown(e, node)}
      className={`node absolute select-none cursor-grab active:cursor-grabbing ${linking ? "hover:!border-hi" : ""}`}
      style={{ left: node.x, top: node.y, width: NODE_W, height: nodeHeight(node.type), borderColor: border }}
    >
      {t.kind !== "start" && <span className="port pointer-events-none" style={{ left: "50%", top: 0 }} aria-hidden />}

      {t.kind === "start" ? (
        <div className="h-full flex items-center justify-center text-xs uppercase tracking-[0.18em]">▶ start</div>
      ) : (
        <div className="px-3 pt-2 pb-3 h-full flex flex-col">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-muted">
            <span>
              <span className={onPath ? "text-ink" : ""}>{tag}</span> · {t.title}
            </span>
            <button
              type="button"
              onClick={() => onDelete(node.id)}
              className="px-1 -mr-1 hover:text-danger"
              aria-label={`delete ${t.title}`}
            >
              ×
            </button>
          </div>
          <p className="mt-1.5 text-[12px] leading-snug">
            {t.before}{" "}
            {t.param && (
              <select
                value={value}
                onChange={(e) => onParam(node.id, t.param.key, e.target.value)}
                className="node-select"
                aria-label={t.title}
              >
                {t.param.options.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            )}{" "}
            {t.after}
          </p>
        </div>
      )}

      {outPorts(node.type).map((port) => {
        const p = portPos({ ...node, x: 0, y: 0 }, port);
        return (
          <span key={port}>
            <span
              data-port={port}
              onPointerDown={(e) => onPortDown(e, node, port)}
              className="port cursor-crosshair"
              style={{ left: p.x, top: p.y }}
              title="drag to connect"
            />
            {port !== "out" && (
              <span
                className="absolute text-[10px] uppercase tracking-[0.12em] text-muted -translate-x-1/2 pointer-events-none"
                style={{ left: p.x, top: p.y + 9 }}
              >
                {port}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

/* ---------- page ---------- */

export default function BuilderPage() {
  const [graph, setGraph] = useState(() => cloneTemplate("solid player"));
  const [botName, setBotName] = useState("my_strategy");
  const [pan, setPan] = useState({ x: 40, y: 20 });
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState(null); // { node } | { edge }
  const [link, setLink] = useState(null); // { from, port, x, y } while dragging a wire
  const [test, setTest] = useState({ hole: "Ah Kd", board: "", pot: 30, toCall: 20, stack: 980, opps: 1, roll: 0.5 });
  const [showCode, setShowCode] = useState(false);
  const [upload, setUpload] = useState({ busy: false, error: "", ok: "" });
  const [loaded, setLoaded] = useState(false);
  const [undo, setUndo] = useState(null); // { graph, name } before the last randomise

  const canvasRef = useRef(null);
  const drag = useRef(null);
  const panRef = useRef(pan);
  panRef.current = pan;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  /* persistence */
  useEffect(() => {
    const saved = loadSaved();
    if (saved) {
      setGraph(saved.graph);
      if (saved.name) setBotName(saved.name);
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(BUILDER_STORAGE_KEY, JSON.stringify({ graph, name: botName }));
    } catch {}
  }, [graph, botName, loaded]);

  const toWorld = useCallback((clientX, clientY) => {
    const r = canvasRef.current.getBoundingClientRect();
    return {
      x: (clientX - r.left - panRef.current.x) / zoomRef.current,
      y: (clientY - r.top - panRef.current.y) / zoomRef.current,
    };
  }, []);

  /* one set of window listeners handles panning, node dragging and wiring */
  useEffect(() => {
    const move = (e) => {
      const d = drag.current;
      if (!d) return;
      if (d.mode === "pan") {
        setPan({ x: d.px + e.clientX - d.sx, y: d.py + e.clientY - d.sy });
      } else if (d.mode === "node") {
        const w = toWorld(e.clientX, e.clientY);
        setGraph((g) => ({
          ...g,
          nodes: g.nodes.map((n) => (n.id === d.id ? { ...n, x: Math.round(w.x - d.ox), y: Math.round(w.y - d.oy) } : n)),
        }));
      } else if (d.mode === "link") {
        const w = toWorld(e.clientX, e.clientY);
        setLink((l) => l && { ...l, x: w.x, y: w.y });
      }
    };
    const up = (e) => {
      const d = drag.current;
      drag.current = null;
      if (d?.mode !== "link") return;
      const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-node-id]");
      const to = hit?.getAttribute("data-node-id");
      if (to) setGraph((g) => connect(g, d.from, d.port, to) || g);
      setLink(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [toWorld]);

  /* zoom around a screen point (canvas-relative) */
  const zoomAt = useCallback((next, cx, cy) => {
    const z = zoomRef.current;
    const nz = Math.min(1.6, Math.max(0.35, next));
    const p = panRef.current;
    setPan({ x: cx - ((cx - p.x) * nz) / z, y: cy - ((cy - p.y) * nz) / z });
    setZoom(nz);
  }, []);
  useEffect(() => {
    const el = canvasRef.current;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(zoomRef.current * Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);
  const zoomStep = (factor) => {
    const r = canvasRef.current.getBoundingClientRect();
    zoomAt(zoomRef.current * factor, r.width / 2, r.height / 2);
  };

  /* delete key */
  useEffect(() => {
    const onKey = (e) => {
      if (!selected || !["Delete", "Backspace"].includes(e.key)) return;
      if (e.target.closest?.("input, select, textarea")) return;
      e.preventDefault();
      if (selected.node) removeNode(selected.node);
      if (selected.edge) setGraph((g) => ({ ...g, edges: g.edges.filter((x) => edgeKey(x) !== selected.edge) }));
      setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const removeNode = (id) => {
    setGraph((g) => {
      if (g.nodes.find((n) => n.id === id)?.type === "start") return g;
      return { nodes: g.nodes.filter((n) => n.id !== id), edges: g.edges.filter((e) => e.from !== id && e.to !== id) };
    });
    setSelected(null);
  };

  const addNode = (type, at) => {
    const id = nextId(graph);
    let pos = at;
    if (!pos) {
      const r = canvasRef.current.getBoundingClientRect();
      const jitter = (graph.nodes.length % 5) * 18;
      pos = toWorld(r.left + r.width / 2 - NODE_W / 2 + jitter, r.top + r.height / 3 + jitter);
    }
    setGraph((g) => ({ ...g, nodes: [...g.nodes, { id, type, x: Math.round(pos.x), y: Math.round(pos.y), p: defaultParams(type) }] }));
    setSelected({ node: id });
  };

  const fitView = (g) => {
    const r = canvasRef.current?.getBoundingClientRect();
    if (!r || !g.nodes.length) return;
    const minX = Math.min(...g.nodes.map((n) => n.x));
    const maxX = Math.max(...g.nodes.map((n) => n.x + NODE_W));
    const minY = Math.min(...g.nodes.map((n) => n.y));
    const maxY = Math.max(...g.nodes.map((n) => n.y + nodeHeight(n.type) + 24));
    const z = Math.min(1, Math.max(0.35, Math.min((r.width - 48) / (maxX - minX), (r.height - 48) / (maxY - minY))));
    setZoom(z);
    setPan({ x: Math.round(r.width / 2 - ((minX + maxX) / 2) * z), y: Math.round(24 - minY * z) });
  };

  const loadTemplate = (name) => {
    if (!name) return;
    if (graph.nodes.length > 1 && !window.confirm(`replace your strategy with "${name}"?`)) return;
    setUndo(null);
    const g = cloneTemplate(name);
    setGraph(g);
    setSelected(null);
    fitView(g);
  };

  const randomise = () => {
    setUndo((u) => u || { graph, name: botName });
    const g = randomStrategy();
    setGraph(g);
    setBotName(randomName());
    setSelected(null);
    fitView(g);
  };
  const undoRandomise = () => {
    if (!undo) return;
    setGraph(undo.graph);
    setBotName(undo.name);
    setUndo(null);
    setSelected(null);
    fitView(undo.graph);
  };

  // Centre the first graph once the canvas has a size.
  useEffect(() => {
    if (loaded) fitView(graph);
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  /* pointer handlers */
  const onCanvasDown = (e) => {
    if (e.button !== 0 || e.target.closest("[data-node-id], [data-edge], button")) return;
    setSelected(null);
    drag.current = { mode: "pan", sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
  };
  const onNodeDown = (e, node) => {
    if (e.button !== 0 || e.target.closest("select, button, [data-port]")) return;
    e.stopPropagation();
    setSelected({ node: node.id });
    const w = toWorld(e.clientX, e.clientY);
    drag.current = { mode: "node", id: node.id, ox: w.x - node.x, oy: w.y - node.y };
  };
  const onPortDown = (e, node, port) => {
    e.stopPropagation();
    e.preventDefault();
    const w = toWorld(e.clientX, e.clientY);
    drag.current = { mode: "link", from: node.id, port };
    setLink({ from: node.id, port, x: w.x, y: w.y });
  };
  const onDrop = (e) => {
    const type = e.dataTransfer.getData("application/x-strategy-node");
    if (!NODE_TYPES[type]) return;
    e.preventDefault();
    const w = toWorld(e.clientX, e.clientY);
    addNode(type, { x: w.x - NODE_W / 2, y: w.y - 20 });
  };
  const setParam = (id, key, value) =>
    setGraph((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, p: { ...n.p, [key]: value } } : n)) }));

  /* test hand */
  const hole = parseCards(test.hole);
  const board = parseCards(test.board);
  const testState = {
    pot: Number(test.pot) || 0,
    toCall: Number(test.toCall) || 0,
    currentBet: Number(test.toCall) || 0,
    minRaise: 20,
    myChips: Number(test.stack) || 0,
    myCards: hole.cards.slice(0, 2),
    communityCards: board.cards.slice(0, 5),
    opponents: Array.from({ length: Number(test.opps) || 1 }, (_, i) => ({ name: `opp${i}` })),
  };
  const result = useMemo(() => decide(graph, testState, () => test.roll), [graph, JSON.stringify(testState), test.roll]); // eslint-disable-line react-hooks/exhaustive-deps
  const onPath = new Set(result.path);
  const hotEdges = new Set(result.edges);

  const dealRandom = () => {
    const d = [...DECK].sort(() => Math.random() - 0.5);
    const nb = [0, 3, 4, 5][Math.floor(Math.random() * 4)];
    const pot = 30 + Math.floor(Math.random() * 20) * 20;
    setTest((t) => ({
      ...t,
      hole: d.slice(0, 2).join(" "),
      board: d.slice(2, 2 + nb).join(" "),
      pot,
      toCall: [0, 20, Math.round(pot / 2), pot][Math.floor(Math.random() * 4)],
      roll: Math.random(),
    }));
  };

  /* export */
  const notes = lint(graph);
  const code = useMemo(() => (showCode ? generateCpp(graph, botName) : ""), [showCode, graph, botName]);
  const fileName = `${botName.trim().replace(/[^\w-]+/g, "_") || "strategy"}.cpp`;

  const uploadBot = async () => {
    if (ARENA === "browser") {
      const saved = saveMyBot(botName, graph);
      setUpload(
        saved
          ? { busy: false, error: "", ok: `saved ${saved.name}` }
          : { busy: false, error: "couldn't save: this browser is blocking local storage", ok: "" }
      );
      return;
    }
    setUpload({ busy: true, error: "", ok: "" });
    try {
      const res = await fetch(`${API_URL}/api/bots`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...AUTH_HEADERS },
        body: JSON.stringify({ name: botName.trim() || "my strategy", filename: fileName, code: generateCpp(graph, botName) }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "upload failed");
      setUpload({ busy: false, error: "", ok: `compiled and registered ${payload.name}` });
    } catch (err) {
      setUpload({ busy: false, error: err.message || "upload failed", ok: "" });
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([generateCpp(graph, botName)], { type: "text/x-c++src" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: fileName });
    a.click();
    URL.revokeObjectURL(url);
  };

  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const linkFrom = link && byId.get(link.from);
  const describePath = result.answers.map(({ id, port }) => ({ title: NODE_TYPES[byId.get(id).type].title, ans: port }));
  const s = result.s;
  // Chips the move puts in: the call, the call plus the raise, or the whole stack.
  const chipsIn = { call: s.toCall, raise: s.toCall + (result.amount || 0), "all-in": s.myChips }[result.action] || 0;

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4 mb-8 pb-5 border-b border-line">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">strategy builder</h1>
          <p className="text-xs text-muted mt-1">wire up questions and moves · no c++ needed</p>
        </div>
        <Link href="/" className="text-xs text-muted hover:text-ink hover:underline underline-offset-4">
          ← dashboard
        </Link>
      </header>

      <main className="grid gap-6 lg:grid-cols-[220px_1fr_300px]">
        {/* palette */}
        <aside className="space-y-6 lg:max-h-[calc(100vh-180px)] lg:overflow-y-auto lg:pr-1">
          <div>
            <label className="block">
              <span className="label">start from</span>
              <select className="field" value="" onChange={(e) => loadTemplate(e.target.value)}>
                <option value="">template…</option>
                {Object.keys(TEMPLATES).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={randomise} className="btn mt-3">
              randomise ↻
            </button>
            <p className="mt-1.5 text-[11px] text-muted flex justify-between gap-2">
              <span>a fresh random strategy each click</span>
              {undo && (
                <button type="button" onClick={undoRandomise} className="hover:text-ink underline underline-offset-4">
                  undo
                </button>
              )}
            </p>
          </div>
          {PALETTE.map((group) => (
            <div key={group.group}>
              <p className="label mb-2">{group.group}</p>
              <ul className="space-y-2">
                {group.types.map((type) => {
                  const t = NODE_TYPES[type];
                  return (
                    <li key={type}>
                      <button
                        type="button"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("application/x-strategy-node", type);
                          e.dataTransfer.effectAllowed = "copy";
                        }}
                        onClick={() => addNode(type)}
                        className="w-full text-left px-3 py-2 rounded border border-line hover:border-hi focus-visible:border-hi outline-none cursor-grab transition-colors"
                      >
                        <span className="block text-xs">
                          <span className="text-muted">{t.kind === "cond" ? "if" : "do"} · </span>
                          {t.title}
                        </span>
                        <span className="block text-[11px] text-muted leading-snug mt-0.5">{t.help}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </aside>

        {/* canvas */}
        <section className="panel overflow-hidden flex flex-col min-h-[560px] lg:h-[calc(100vh-180px)]">
          <header className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 border-b border-line">
            <h2 className="text-xs uppercase tracking-[0.18em]">
              <span className="text-muted mr-3">01</span>canvas
            </h2>
            <span className="text-[11px] text-muted">
              drag blocks in · drag a ○ onto a block to wire it · del removes · drag to pan · scroll to zoom
            </span>
          </header>
          <div
            ref={canvasRef}
            onPointerDown={onCanvasDown}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className="canvas-grid relative flex-1 overflow-hidden cursor-default"
            style={{ backgroundPosition: `${pan.x}px ${pan.y}px`, backgroundSize: `${24 * zoom}px ${24 * zoom}px` }}
          >
            <div className="absolute left-0 top-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}>
              <svg className="absolute left-0 top-0 overflow-visible pointer-events-none" width="1" height="1">
                {graph.edges.map((edge) => {
                  const a = byId.get(edge.from);
                  const b = byId.get(edge.to);
                  if (!a || !b) return null;
                  const key = edgeKey(edge);
                  const d = edgePath(portPos(a, edge.port), portPos(b, "in"));
                  const hot = hotEdges.has(key);
                  const sel = selected?.edge === key;
                  return (
                    <g key={key}>
                      <path
                        d={d}
                        data-edge
                        fill="none"
                        stroke="transparent"
                        strokeWidth="14"
                        className="cursor-pointer"
                        style={{ pointerEvents: "stroke" }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setSelected({ edge: key });
                        }}
                      />
                      <path
                        d={d}
                        fill="none"
                        stroke={sel ? "var(--danger)" : hot ? "var(--ink)" : "var(--edge)"}
                        strokeWidth={hot || sel ? 2 : 1.25}
                        strokeDasharray={edge.port === "no" && !hot ? "4 4" : undefined}
                      />
                    </g>
                  );
                })}
                {linkFrom && (
                  <path d={edgePath(portPos(linkFrom, link.port), link)} fill="none" stroke="var(--hi)" strokeWidth="1.5" strokeDasharray="3 3" />
                )}
              </svg>
              {graph.nodes.map((node) => (
                <NodeCard
                  key={node.id}
                  node={node}
                  selected={selected?.node === node.id}
                  onPath={onPath.has(node.id)}
                  linking={!!link}
                  onPointerDown={onNodeDown}
                  onPortDown={onPortDown}
                  onParam={setParam}
                  onDelete={removeNode}
                />
              ))}
            </div>
            <div className="absolute right-3 bottom-3 flex gap-1.5">
              {[
                ["−", () => zoomStep(1 / 1.2), "zoom out"],
                [`${Math.round(zoom * 100)}%`, () => fitView(graph), "fit to view"],
                ["+", () => zoomStep(1.2), "zoom in"],
              ].map(([label, onClick, title]) => (
                <button
                  key={title}
                  type="button"
                  onClick={onClick}
                  title={title}
                  className="text-[11px] tabular-nums min-w-7 px-2 py-1 rounded border border-line bg-surface text-muted hover:text-ink hover:border-hi"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* test + export */}
        <aside className="space-y-6">
          <Panel index="02" title="try a hand" aside={<button type="button" onClick={dealRandom} className="hover:text-ink">deal random ↻</button>}>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="label">my cards</span>
                <input className={`field ${hole.bad ? "!border-danger" : ""}`} value={test.hole} onChange={(e) => setTest({ ...test, hole: e.target.value })} placeholder="Ah Kd" />
              </label>
              <label className="block">
                <span className="label">board</span>
                <input className={`field ${board.bad ? "!border-danger" : ""}`} value={test.board} onChange={(e) => setTest({ ...test, board: e.target.value })} placeholder="Js Th 3c" />
              </label>
              {[
                ["pot", "pot"],
                ["toCall", "to call"],
                ["stack", "my stack"],
                ["opps", "opponents"],
              ].map(([k, label]) => (
                <label key={k} className="block">
                  <span className="label">{label}</span>
                  <input type="number" min={k === "opps" ? 1 : 0} max={k === "opps" ? 8 : undefined} className="field tabular-nums" value={test[k]} onChange={(e) => setTest({ ...test, [k]: e.target.value })} />
                </label>
              ))}
            </div>

            <div className="mt-5 pt-4 border-t border-line">
              <p className="label">bot would</p>
              <p className="text-2xl font-bold uppercase tracking-tight mt-1">
                {result.action}
                {result.amount ? <span className="text-muted font-normal"> +{result.amount}</span> : null}
              </p>
              {chipsIn > 0 && (
                <div className="mt-3 flex items-end gap-3">
                  <ChipStack amount={chipsIn} size={40} maxPiles={4} />
                  <span className="text-[11px] text-muted tabular-nums pb-4">{chipsIn.toLocaleString()} in</span>
                </div>
              )}
              {result.fallback && <p className="text-[11px] text-muted mt-1">hit an open branch → check / fold</p>}
              <ol className="mt-3 text-[11px] space-y-0.5">
                {describePath.map((step, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="text-muted truncate">{step.title}?</span>
                    <span>{step.ans}</span>
                  </li>
                ))}
              </ol>
              <dl className="mt-3 text-[11px] grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted">
                <dt>street</dt>
                <dd className="text-ink">{["pre-flop", "flop", "turn", "river"][s.street]}</dd>
                <dt>hole cards</dt>
                <dd className="text-ink" title={TIER_HELP}>{TIER_NAMES[s.tier]}</dd>
                <dt>made hand</dt>
                <dd className="text-ink">{SCORE_NAMES[s.score]}{s.draw ? " + draw" : ""}</dd>
                <dt>win chance</dt>
                <dd className="text-ink">~{Math.round(s.equity * 100)}%</dd>
              </dl>
              {graph.nodes.some((n) => n.type === "chance") && (
                <button type="button" onClick={() => setTest({ ...test, roll: Math.random() })} className="mt-3 text-[11px] text-muted hover:text-ink">
                  coin flips rolled {Math.round(test.roll * 100)} · reroll ↻
                </button>
              )}
            </div>
          </Panel>

          <Panel index="03" title="send to arena">
            <label className="block">
              <span className="label">bot name</span>
              <input className="field" value={botName} onChange={(e) => setBotName(e.target.value)} maxLength={40} />
            </label>
            {notes.length > 0 && (
              <ul className="mt-3 text-[11px] text-muted space-y-0.5">
                {notes.map((n) => (
                  <li key={n}>! {n}</li>
                ))}
              </ul>
            )}
            <button type="button" onClick={uploadBot} disabled={upload.busy} className="btn mt-4">
              {upload.busy ? "compiling…" : ARENA === "browser" ? "save to arena" : "upload + verify"}
            </button>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button type="button" onClick={download} className="text-[11px] uppercase tracking-[0.12em] py-2 rounded border border-line text-muted hover:text-ink hover:border-hi">
                download .cpp
              </button>
              <button type="button" onClick={() => setShowCode(true)} className="text-[11px] uppercase tracking-[0.12em] py-2 rounded border border-line text-muted hover:text-ink hover:border-hi">
                view c++
              </button>
            </div>
            {upload.error && <pre className="mt-3 text-xs text-danger whitespace-pre-wrap max-h-40 overflow-y-auto">error: {upload.error}</pre>}
            {upload.ok && (
              <p className="mt-3 text-xs">
                ok: {upload.ok} ·{" "}
                <Link href="/" className="underline underline-offset-4">
                  run a match →
                </Link>
              </p>
            )}
          </Panel>
        </aside>
      </main>

      {showCode && (
        <div className="fixed inset-0 z-50 bg-bg/80 flex items-center justify-center p-4" onClick={() => setShowCode(false)}>
          <div className="panel w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <header className="flex items-center justify-between px-5 py-3 border-b border-line">
              <h2 className="text-xs uppercase tracking-[0.18em]">{fileName}</h2>
              <div className="flex gap-4 text-xs text-muted">
                <button type="button" onClick={() => navigator.clipboard?.writeText(code)} className="hover:text-ink">
                  copy
                </button>
                <button type="button" onClick={() => setShowCode(false)} className="hover:text-ink" aria-label="close">
                  ×
                </button>
              </div>
            </header>
            <pre className="overflow-auto p-5 text-[11px] leading-relaxed text-hi">{code}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
