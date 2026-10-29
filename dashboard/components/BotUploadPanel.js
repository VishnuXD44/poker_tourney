"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Panel from "./Panel";

const ACCEPTED_EXTENSIONS = [".cpp", ".cc", ".cxx"];

function nameFromFilename(filename) {
  if (!filename || typeof filename !== "string") return "";
  const base = filename.replace(/\.[^.]+$/, "").trim();
  return base.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || base;
}

export default function BotUploadPanel({ apiUrl, authHeaders = {}, constraints, bots, onBotUploaded }) {
  const [botName, setBotName] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileInput = useRef(null);

  useEffect(() => {
    if (file && !botName.trim()) setBotName(nameFromFilename(file.name));
  }, [file]);

  const canUpload = useMemo(() => {
    if (!file || uploading) return false;
    const fileName = (file.name || "").toLowerCase();
    return ACCEPTED_EXTENSIONS.some((ext) => fileName.endsWith(ext));
  }, [file, uploading]);

  const upload = async () => {
    if (!canUpload || !file) return;
    const nameToSend = botName.trim() || nameFromFilename(file.name) || file.name || "Unnamed Bot";
    setUploading(true);
    setError("");
    setSuccess("");
    try {
      const code = await file.text();
      const res = await fetch(`${apiUrl}/api/bots`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          name: nameToSend,
          filename: file.name,
          code,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || "Upload failed");
      }
      setSuccess(`compiled and registered ${payload.name}`);
      setBotName("");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      onBotUploaded?.(payload);
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Panel index="04" title="bots" aside={`${bots.length} registered`}>
      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <p className="label mb-3">upload c++ bot</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label">name</span>
              <input
                type="text"
                value={botName}
                onChange={(e) => setBotName(e.target.value)}
                placeholder="river_shark"
                className="field"
              />
            </label>
            <label className="block">
              <span className="label">source file</span>
              <span className="field flex items-center justify-between gap-2 cursor-pointer hover:border-hi">
                <span className={`truncate ${file ? "text-ink" : "text-muted"}`}>{file ? file.name : "choose .cpp"}</span>
                <span className="text-muted" aria-hidden>↑</span>
              </span>
              <input
                ref={fileInput}
                type="file"
                accept=".cpp,.cc,.cxx"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="sr-only"
              />
            </label>
          </div>

          <button type="button" onClick={upload} disabled={!canUpload} className="btn mt-4">
            {uploading ? "compiling…" : "upload + verify"}
          </button>

          {error && (
            <pre className="mt-3 text-xs text-danger whitespace-pre-wrap max-h-48 overflow-y-auto">error: {error}</pre>
          )}
          {success && <p className="mt-3 text-xs">ok: {success}</p>}

          <dl className="mt-6 text-xs grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            <dt className="text-muted">max size</dt>
            <dd>{constraints?.maxCodeLength?.toLocaleString() ?? "…"} chars</dd>
            <dt className="text-muted">extensions</dt>
            <dd>{(constraints?.allowedExtensions || ACCEPTED_EXTENSIONS).join(" ")}</dd>
            <dt className="text-muted">timeout</dt>
            <dd>{constraints?.protocol?.timeoutMs ?? "…"} ms / action</dd>
            <dt className="text-muted">output</dt>
            <dd className="text-muted break-words">{constraints?.protocol?.output ?? "one json line with an action"}</dd>
          </dl>
        </div>

        <div>
          <p className="label mb-3">registered</p>
          {bots.length === 0 ? (
            <p className="text-xs text-muted">no bots uploaded yet.</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto divide-y divide-line border-y border-line">
              {bots.map((bot) => (
                <li key={bot.id} className="py-2 text-sm flex justify-between gap-3">
                  <span className="truncate">
                    <span className="text-muted mr-3">{String(bot.id).padStart(2, "0")}</span>
                    {bot.name}
                  </span>
                  <span className="text-xs text-muted truncate">{bot.filename || "uploaded.cpp"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  );
}
