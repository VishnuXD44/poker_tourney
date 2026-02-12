"use client";

import { useEffect, useMemo, useState } from "react";

const ACCEPTED_EXTENSIONS = [".cpp", ".cc", ".cxx"];

function nameFromFilename(filename) {
  if (!filename || typeof filename !== "string") return "";
  const base = filename.replace(/\.[^.]+$/, "").trim();
  return base.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || base;
}

export default function BotUploadPanel({ apiUrl, constraints, bots, onBotUploaded }) {
  const [botName, setBotName] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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
        headers: { "Content-Type": "application/json" },
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
      setSuccess(`Uploaded and verified: ${payload.name}`);
      setBotName("");
      setFile(null);
      onBotUploaded?.(payload);
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const cardStyle = {
    background: "#ffffff",
    border: "1px solid #e2dfda",
    boxShadow: "0 4px 12px rgba(26,39,68,0.06)",
  };

  return (
    <section className="rounded-xl p-6" style={cardStyle}>
      <h2 className="text-lg font-bold mb-1" style={{ color: "#1a2744" }}>Upload C++ Bot</h2>
      <p className="text-sm text-[#5c6577] mb-4">
        Upload a C++ source bot. We validate constraints, compile it, and use the executable during matches.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-[#1a2744]">Bot name</label>
          <input
            type="text"
            value={botName}
            onChange={(e) => setBotName(e.target.value)}
            placeholder="RiverShark"
            className="w-full mt-1 px-3 py-2 rounded-lg bg-[#fafaf9] border border-[#e2dfda] text-sm text-[#1a2744] focus:border-[#b8860b] focus:ring-2 focus:ring-[#b8860b]/15 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#1a2744]">C++ source file</label>
          <input
            type="file"
            accept=".cpp,.cc,.cxx"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full mt-1 px-3 py-2 rounded-lg bg-[#fafaf9] border border-[#e2dfda] text-sm text-[#1a2744]"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={upload}
        disabled={!canUpload}
        className="mt-4 w-full py-3 rounded-lg font-semibold border disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm hover:opacity-95"
        style={{
          background: "linear-gradient(180deg, #d4af37 0%, #b8860b 100%)",
          color: "#1a2744",
          borderColor: "#9a7b2e",
        }}
      >
        {uploading ? "Verifying and compiling..." : "Upload + Verify Bot"}
      </button>

      {error && (
        <div className="mt-3 rounded-lg p-3 text-sm" style={{ background: "rgba(197,48,48,0.1)", border: "1px solid rgba(197,48,48,0.3)", color: "#c53030" }}>
          {error}
        </div>
      )}
      {success && (
        <div className="mt-3 rounded-lg p-3 text-sm" style={{ background: "rgba(39,103,73,0.1)", border: "1px solid rgba(39,103,73,0.25)", color: "#276749" }}>
          {success}
        </div>
      )}

      <div className="mt-4 rounded-lg p-4 bg-[#fafaf9] border border-[#e2dfda]">
        <p className="text-sm font-semibold text-[#1a2744] mb-2">Engine constraints</p>
        <ul className="text-xs text-[#5c6577] space-y-1">
          <li>Max source length: {constraints?.maxCodeLength ?? "..."}</li>
          <li>Allowed extensions: {(constraints?.allowedExtensions || ACCEPTED_EXTENSIONS).join(", ")}</li>
          <li>Action timeout: {constraints?.protocol?.timeoutMs ?? "..."} ms</li>
          <li>Output format: {constraints?.protocol?.output ?? "JSON line with action"}</li>
        </ul>
      </div>

      <div className="mt-4">
        <p className="text-sm font-semibold text-[#1a2744] mb-2">Registered bots ({bots.length})</p>
        <div className="max-h-40 overflow-y-auto space-y-2">
          {bots.length === 0 ? (
            <p className="text-xs text-[#5c6577]">No uploaded bots yet.</p>
          ) : (
            bots.map((bot) => (
              <div key={bot.id} className="rounded-lg bg-[#fafaf9] border border-[#e2dfda] px-3 py-2 text-sm text-[#1a2744] flex justify-between gap-3">
                <span className="truncate">{bot.name}</span>
                <span className="text-xs text-[#5c6577]">{bot.filename || "uploaded.cpp"}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
