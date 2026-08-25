import React, { useEffect, useMemo, useState } from "react";
import { Upload, Link2, FileText, Trash2, Database, AlertTriangle, Check, GitBranch, Loader2, Sparkles, RefreshCw, Zap, BookOpen, ChevronRight, ChevronDown, HelpCircle } from "lucide-react";
import { useAppStore } from "../stores/app-store";
import {
  listKB,
  addKB,
  removeKB,
  allowedNamespacesFor,
  namespaceLabel,
} from "../../shared/utils/kb-storage";
import { indexEntry, reindexAll, dropEntryFromIndex, onIndexProgress, runWikiLint } from "../../shared/utils/kb-indexer";
import { computeWikiIndex } from "../../shared/utils/wiki-index";
import { fetchUrlContent } from "../../shared/utils/url-fetcher";
import { loadSampleData, hasSampleDataLoaded } from "../../shared/utils/sample-data";
import type { KBEntry, KBIndexStatus, KBNamespace, WikiBuildStatus, WikiPage } from "../../shared/types";

type Mode = "text" | "file" | "url" | "git";

const CLIENT_PARSEABLE = [".txt", ".md", ".markdown", ".csv", ".json"];

export function KnowledgeBasePanel() {
  const { user } = useAppStore();
  const [entries, setEntries] = useState<KBEntry[]>([]);
  const [mode, setMode] = useState<Mode>("text");
  const [namespace, setNamespace] = useState<KBNamespace | "">("");
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [gitUrl, setGitUrl] = useState("");
  const [gitBranch, setGitBranch] = useState("main");
  const [gitPath, setGitPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  useEffect(() => {
    listKB().then(setEntries);
    // Re-pull on every indexer status change so the pill flips live.
    const off = onIndexProgress(() => { void listKB().then(setEntries); });
    // Re-pull on direct writes to chrome.storage.local: handles paths that
    // skip the indexer entirely (sample-data fixtures, manual addKB calls
    // from sibling panels, etc.). Without this the panel can show a stale
    // empty list after demo data is loaded via the empty-state CTA.
    const onStorageChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === "local" && "clientlens_kb" in changes) {
        void listKB().then(setEntries);
      }
    };
    try { chrome.storage?.onChanged?.addListener(onStorageChanged); } catch { /* non-extension env */ }
    return () => {
      off();
      try { chrome.storage?.onChanged?.removeListener(onStorageChanged); } catch { /* noop */ }
    };
  }, []);

  if (!user || user.role === "sales_rep" || user.role === "viewer") return null;

  const allowed = allowedNamespacesFor(user.role);
  if (allowed.length === 0) return null;

  async function refresh() {
    setEntries(await listKB());
  }

  async function handleAddText() {
    if (!user || !namespace || !name.trim() || !text.trim()) return;
    setBusy(true);
    const id = crypto.randomUUID();
    await addKB({
      id,
      name: name.trim(),
      namespace: namespace as KBNamespace,
      source_type: "text",
      content: text,
      status: "ready",
      uploaded_by: user.email,
      uploaded_by_role: user.role,
      uploaded_at: new Date().toISOString(),
      index_status: "pending",
    });
    setName("");
    setText("");
    setFlash("Added");
    setTimeout(() => setFlash(null), 1500);
    await refresh();
    void indexEntry(id);
    setBusy(false);
  }

  async function handleAddUrl() {
    if (!user || !namespace || !url.trim()) return;
    setBusy(true);
    setFlash("Fetching…");
    try {
      const fetched = await fetchUrlContent(url.trim());
      const id = crypto.randomUUID();
      await addKB({
        id,
        name: name.trim() || fetched.title,
        namespace: namespace as KBNamespace,
        source_type: "url",
        url: fetched.url,
        content: fetched.text,
        status: "ready",
        status_reason: fetched.truncated ? "Truncated to 200KB" : undefined,
        uploaded_by: user.email,
        uploaded_by_role: user.role,
        uploaded_at: fetched.fetched_at,
        index_status: "pending",
      });
      setUrl("");
      setName("");
      setFlash(fetched.truncated ? "Added (truncated to 200KB)" : "Added");
      setTimeout(() => setFlash(null), 1800);
      await refresh();
      void indexEntry(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFlash(`Fetch failed: ${msg}`);
      setTimeout(() => setFlash(null), 4000);
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !user || !namespace) return;
    setBusy(true);
    const newIds: string[] = [];
    for (const file of files) {
      const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
      const parseable = CLIENT_PARSEABLE.includes(ext);

      let content = "";
      let status: KBEntry["status"] = "ready";
      let status_reason: string | undefined;

      if (parseable) {
        content = await file.text();
      } else {
        status = "pending_parse";
        status_reason = `${ext.toUpperCase()} requires backend text extraction`;
      }

      const id = crypto.randomUUID();
      await addKB({
        id,
        name: files.length === 1 && name.trim() ? name.trim() : file.name,
        namespace: namespace as KBNamespace,
        source_type: "file",
        content,
        file_type: ext,
        file_size: file.size,
        status,
        status_reason,
        uploaded_by: user.email,
        uploaded_by_role: user.role,
        uploaded_at: new Date().toISOString(),
        // Only client-parsed files have content to embed; backend-pending
        // ones are queued but will index as zero-chunk until they're parsed.
        index_status: parseable ? "pending" : undefined,
      });
      if (parseable) newIds.push(id);
    }
    e.target.value = "";
    setName("");
    setFlash(`Uploaded ${files.length} file${files.length > 1 ? "s" : ""}`);
    setTimeout(() => setFlash(null), 1500);
    await refresh();
    for (const id of newIds) void indexEntry(id);
    setBusy(false);
  }

  async function handleAddGit() {
    if (!user || !namespace || !gitUrl.trim()) return;
    setBusy(true);
    const repoName = gitUrl.trim().replace(/\.git$/, "").split("/").slice(-2).join("/");
    await addKB({
      id: crypto.randomUUID(),
      name: name.trim() || `${repoName}${gitPath ? ` /${gitPath}` : ""}`,
      namespace: namespace as KBNamespace,
      source_type: "git",
      url: gitUrl.trim(),
      content: "",
      status: "pending_parse",
      status_reason: `Git repo (${gitBranch}${gitPath ? ` /${gitPath}` : ""}), backend will clone & index`,
      uploaded_by: user.email,
      uploaded_by_role: user.role,
      uploaded_at: new Date().toISOString(),
    });
    setGitUrl("");
    setGitPath("");
    setName("");
    setFlash("Added");
    setTimeout(() => setFlash(null), 1500);
    await refresh();
    setBusy(false);
  }

  async function handleRemove(id: string) {
    await removeKB(id);
    void dropEntryFromIndex(id);
    await refresh();
  }

  async function handleReindexAll() {
    setBusy(true);
    setFlash("Re-indexing…");
    const n = await reindexAll();
    setFlash(n === 0 ? "Nothing to index" : `Queued ${n} entr${n === 1 ? "y" : "ies"}`);
    setTimeout(() => setFlash(null), 2200);
    await refresh();
    setBusy(false);
  }

  async function handleLintWiki() {
    setBusy(true);
    setFlash("Auditing wiki for contradictions…");
    try {
      const { checked, flagged } = await runWikiLint();
      setFlash(
        flagged === 0
          ? `Lint clean across ${checked} page${checked === 1 ? "" : "s"}`
          : `${flagged} contradiction${flagged === 1 ? "" : "s"} flagged across ${checked} page${checked === 1 ? "" : "s"}`,
      );
      setTimeout(() => setFlash(null), 3500);
    } catch (err) {
      setFlash(`Lint failed: ${err instanceof Error ? err.message : String(err)}`);
      setTimeout(() => setFlash(null), 4000);
    }
    await refresh();
    setBusy(false);
  }

  const wikiIndex = useMemo(() => computeWikiIndex(entries), [entries]);

  const canSubmit =
    !!namespace &&
    ((mode === "text" && name.trim() && text.trim()) ||
      (mode === "url" && url.trim()) ||
      (mode === "git" && gitUrl.trim()));

  return (
    <div className="bg-[var(--surface-1)] border border-[var(--line-2)] rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database size={14} className="text-[var(--brand-orange)]" />
          <h3 className="text-sm font-semibold text-[var(--ink)]">Knowledge Base</h3>
        </div>
        <span className="text-[10px] text-[var(--ink-4)] uppercase tracking-wide">{user.role}</span>
      </div>

      <p className="text-[11px] text-[var(--ink-4)] -mt-2">
        Source of truth for the agent council. Everything generated is grounded here.
      </p>

      {/* Mode tabs */}
      <div className="grid grid-cols-4 gap-1 bg-[var(--surface-2)] rounded-lg p-1">
        {(["text", "file", "url", "git"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`py-1.5 rounded-md text-[11px] font-medium transition-colors ${
              mode === m
                ? "bg-[var(--surface-3)] text-[var(--ink)]"
                : "text-[var(--ink-4)] hover:text-[var(--ink-2)]"
            }`}
          >
            {m === "text" && "Paste"}
            {m === "file" && "Files"}
            {m === "url" && "Link"}
            {m === "git" && "Git repo"}
          </button>
        ))}
      </div>

      {/* Namespace */}
      <label className="block space-y-1">
        <span className="text-xs text-[var(--ink-3)] font-medium">Category</span>
        <select
          value={namespace}
          onChange={(e) => setNamespace(e.target.value as KBNamespace | "")}
          className="input"
        >
          <option value="">Select a category…</option>
          {allowed.map((ns) => (
            <option key={ns} value={ns}>{namespaceLabel(ns)}</option>
          ))}
        </select>
      </label>

      {/* Name */}
      <label className="block space-y-1">
        <span className="text-xs text-[var(--ink-3)] font-medium">
          Name {mode === "file" && <span className="text-[var(--ink-4)]">(optional, uses filename)</span>}
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. FMCG One-Pager v3"
          className="input"
        />
      </label>

      {mode === "text" && (
        <label className="block space-y-1">
          <span className="text-xs text-[var(--ink-3)] font-medium">Content</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste the source material here: claims, numbers, positioning, anything reps should cite."
            rows={5}
            className="input resize-none"
          />
        </label>
      )}

      {mode === "url" && (
        <label className="block space-y-1">
          <span className="text-xs text-[var(--ink-3)] font-medium">URL</span>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://clientlens.com/…"
            className="input"
          />
          <span className="block text-[10px] text-[var(--ink-4)] leading-snug mt-1">
            Page content is fetched and cleaned in your browser. Capped at 200KB. Sites that block bots may return empty, paste as text instead if so.
          </span>
        </label>
      )}

      {mode === "file" && (
        <label className="block space-y-1">
          <span className="text-xs text-[var(--ink-3)] font-medium">Files <span className="text-[var(--ink-4)]">(multiple OK)</span></span>
          <input
            type="file"
            accept=".txt,.md,.markdown,.csv,.json,.pdf,.docx,.pptx,.xlsx,.html"
            onChange={handleFile}
            disabled={!namespace || busy}
            multiple
            className="block w-full text-xs text-[var(--ink-3)] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-[var(--line)] file:bg-[var(--surface-2)] file:text-[var(--ink-2)] file:text-xs file:font-medium hover:file:bg-[var(--surface-3)] file:cursor-pointer cursor-pointer"
          />
          <span className="block text-[10px] text-[var(--ink-4)]">
            .txt / .md / .csv / .json parsed in-browser. .pdf / .docx / .pptx stored and parsed by backend.
          </span>
        </label>
      )}

      {mode === "git" && (
        <div className="space-y-1.5">
          <label className="block space-y-1">
            <span className="text-xs text-[var(--ink-3)] font-medium">Git repo URL</span>
            <input
              type="url"
              value={gitUrl}
              onChange={(e) => setGitUrl(e.target.value)}
              placeholder="https://github.com/your-org/sales-kit"
              className="input"
            />
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="block space-y-1">
              <span className="text-xs text-[var(--ink-3)] font-medium">Branch</span>
              <input
                type="text"
                value={gitBranch}
                onChange={(e) => setGitBranch(e.target.value)}
                placeholder="main"
                className="input"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-[var(--ink-3)] font-medium">Subpath <span className="text-[var(--ink-4)]">(opt)</span></span>
              <input
                type="text"
                value={gitPath}
                onChange={(e) => setGitPath(e.target.value)}
                placeholder="docs/"
                className="input"
              />
            </label>
          </div>
          <div className="flex items-start gap-1.5 bg-[var(--surface-2)] border border-[var(--signal-warn)] rounded px-2 py-1.5">
            <AlertTriangle size={11} className="text-[var(--signal-warn)] mt-0.5 shrink-0" />
            <span className="block text-[10px] text-[var(--ink-3)] leading-snug">
              Backend git indexer is not live yet. Entry will save but agents will skip it until a sync runs.
            </span>
          </div>
        </div>
      )}

      {mode !== "file" && (
        <button
          onClick={mode === "text" ? handleAddText : mode === "url" ? handleAddUrl : handleAddGit}
          disabled={!canSubmit || busy}
          className="w-full py-2 bg-[var(--brand-orange)] hover:bg-[var(--brand-orange-hover)] disabled:bg-[var(--surface-3)] disabled:text-[var(--ink-5)] text-[#0A0A0A] font-semibold rounded-lg text-xs transition-all flex items-center justify-center gap-1.5"
        >
          {mode === "text" ? <FileText size={12} /> : mode === "url" ? <Link2 size={12} /> : <GitBranch size={12} />}
          Add to KB
        </button>
      )}

      {flash && (
        <div className="flex items-center gap-1.5 text-[var(--ink-3)] text-xs">
          <Check size={12} /> {flash}
        </div>
      )}

      {/* Existing entries */}
      <div className="pt-3 border-t border-[var(--line-2)] space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wide text-[var(--ink-4)]">
            {entries.length} entries · {entries.filter((e) => e.index_status === "ready").length}/{entries.filter((e) => e.content).length} indexed · {wikiIndex.ready_pages} wiki pages
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReindexAll}
              disabled={busy || entries.length === 0}
              className="flex items-center gap-1 text-[10px] text-[var(--ink-4)] hover:text-[var(--ink)] disabled:text-[var(--ink-5)] transition-colors"
              title="Re-embed any entries that aren't indexed yet"
            >
              <RefreshCw size={10} /> Re-index
            </button>
            <button
              onClick={handleLintWiki}
              disabled={busy || wikiIndex.ready_pages < 2}
              className="flex items-center gap-1 text-[10px] text-[var(--ink-4)] hover:text-[var(--ink)] disabled:text-[var(--ink-5)] transition-colors"
              title="Re-audit the whole wiki for contradictions across pages"
            >
              <Zap size={10} /> Lint wiki
            </button>
          </div>
        </div>

        {/* Cross-cutting wiki signals: only shown when there's actually
            something interesting to surface. */}
        {(wikiIndex.contradictions.length > 0 || wikiIndex.concepts.length > 0) && (
          <div className="bg-[var(--surface-2)] border border-[var(--line-2)] rounded-lg p-2 space-y-1.5">
            {wikiIndex.contradictions.length > 0 && (
              <div className="flex items-start gap-1.5">
                <AlertTriangle size={11} className="text-[var(--signal-warn)] mt-0.5 shrink-0" />
                <div className="text-[10px] text-[var(--ink-3)] leading-snug">
                  <span className="font-medium">{wikiIndex.contradictions.length} cross-page contradiction{wikiIndex.contradictions.length === 1 ? "" : "s"}.</span>{" "}
                  {wikiIndex.contradictions.slice(0, 2).map((c, i) => (
                    <span key={i} className="block text-[var(--ink-4)] mt-0.5">
                      “{c.entry_name}” ↔ “{c.with_entry_name ?? "an unnamed entry"}”: {c.note}
                    </span>
                  ))}
                  {wikiIndex.contradictions.length > 2 && (
                    <span className="block text-[var(--ink-4)] mt-0.5">+{wikiIndex.contradictions.length - 2} more</span>
                  )}
                </div>
              </div>
            )}
            {wikiIndex.concepts.length > 0 && (
              <div className="flex items-start gap-1.5">
                <BookOpen size={11} className="text-[var(--brand-orange)] mt-0.5 shrink-0" />
                <div className="text-[10px] text-[var(--ink-3)] leading-snug">
                  <span className="text-[var(--ink-4)]">Top concepts:</span>{" "}
                  {wikiIndex.concepts.slice(0, 6).map((c, i) => (
                    <span key={c.name}>
                      {i > 0 ? ", " : ""}
                      <span className="text-[var(--ink-3)]">{c.name}</span>
                      <span className="text-[var(--ink-4)]"> ({c.entry_ids.length})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {entries.length === 0 ? (
          <KBEmptyState />
        ) : (
        <ul className="space-y-1.5 max-h-60 overflow-y-auto">
          {entries.map((e) => {
            const isOpen = expanded.has(e.id);
            const hasWiki = !!e.wiki_page;
            return (
              <li
                key={e.id}
                className="bg-[var(--surface-2)] border border-[var(--line-2)] rounded-lg px-2.5 py-2"
              >
                <div className="flex items-start gap-2">
                  <button
                    onClick={() => hasWiki && toggleExpanded(e.id)}
                    disabled={!hasWiki}
                    className="shrink-0 mt-0.5 text-[var(--ink-4)] hover:text-[var(--ink)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    aria-label={isOpen ? "Collapse" : "Expand"}
                    title={hasWiki ? (isOpen ? "Collapse wiki" : "Expand wiki") : "Wiki not built yet"}
                  >
                    {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                  <div className="shrink-0 mt-0.5">
                    {e.source_type === "file" && <Upload size={12} className="text-[var(--ink-4)]" />}
                    {e.source_type === "url" && <Link2 size={12} className="text-[var(--ink-4)]" />}
                    {e.source_type === "text" && <FileText size={12} className="text-[var(--ink-4)]" />}
                    {e.source_type === "git" && <GitBranch size={12} className="text-[var(--ink-4)]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--ink-2)] font-medium truncate">{e.name}</p>
                    <p className="text-[10px] text-[var(--ink-4)]">
                      {namespaceLabel(e.namespace)} · {e.uploaded_by_role}
                    </p>
                    {e.status !== "ready" && (
                      <p className="text-[10px] text-[var(--ink-3)] flex items-center gap-1 mt-0.5">
                        <AlertTriangle size={10} /> {e.status_reason || "pending"}
                      </p>
                    )}
                    {e.status === "ready" && e.content && (
                      <p className="text-[10px] flex items-center gap-2 mt-0.5">
                        <IndexStatusPill status={e.index_status} chunks={e.index_chunk_count} error={e.index_error} />
                        <WikiStatusPill status={e.wiki_status} error={e.wiki_error} />
                      </p>
                    )}
                    {e.wiki_page?.tldr && (
                      <p className="text-[10px] text-[var(--ink-3)] leading-snug mt-1 italic">
                        {e.wiki_page.tldr}
                      </p>
                    )}
                    {!isOpen && e.wiki_page?.contradictions && e.wiki_page.contradictions.length > 0 && (
                      <p className="text-[10px] text-[var(--ink-3)] mt-1 flex items-start gap-1">
                        <AlertTriangle size={10} className="mt-0.5 shrink-0" />
                        <span>Conflicts with “{e.wiki_page.contradictions[0].with_entry_name ?? "an unnamed entry"}”: {e.wiki_page.contradictions[0].note}</span>
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemove(e.id)}
                    className="shrink-0 text-[var(--ink-4)] hover:text-[var(--signal-error)] transition-colors"
                    aria-label="Remove"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                {isOpen && e.wiki_page && <WikiReader page={e.wiki_page} />}
              </li>
            );
          })}
        </ul>
        )}
      </div>
    </div>
  );
}

function IndexStatusPill({ status, chunks, error }: { status?: KBIndexStatus; chunks?: number; error?: string }) {
  if (!status || status === "pending") {
    return <span className="text-[var(--ink-4)] flex items-center gap-1"><Sparkles size={9} /> Awaiting index</span>;
  }
  if (status === "indexing") {
    return <span className="text-[var(--ink-3)] flex items-center gap-1"><Loader2 size={9} className="animate-spin" /> Indexing…</span>;
  }
  if (status === "failed") {
    return <span className="text-[var(--signal-error)] flex items-center gap-1" title={error}><AlertTriangle size={9} /> Index failed</span>;
  }
  return <span className="text-[var(--ink-3)] flex items-center gap-1"><Check size={9} /> Indexed{chunks ? ` · ${chunks} chunk${chunks === 1 ? "" : "s"}` : ""}</span>;
}

function WikiStatusPill({ status, error }: { status?: WikiBuildStatus; error?: string }) {
  if (!status || status === "pending") {
    return <span className="text-[var(--ink-4)] flex items-center gap-1"><BookOpen size={9} /> Wiki queued</span>;
  }
  if (status === "building") {
    return <span className="text-[var(--ink-3)] flex items-center gap-1"><Loader2 size={9} className="animate-spin" /> Wiki…</span>;
  }
  if (status === "failed") {
    return <span className="text-[var(--signal-error)] flex items-center gap-1" title={error}><AlertTriangle size={9} /> Wiki failed</span>;
  }
  return <span className="text-[var(--ink-3)] flex items-center gap-1"><BookOpen size={9} /> Wiki ready</span>;
}

function WikiReader({ page }: { page: WikiPage }) {
  return (
    <div className="mt-2 ml-5 pl-3 border-l border-[var(--line)] space-y-2.5">
      <div className="flex items-center gap-2 text-[10px]">
        <span className="text-[var(--ink-3)] font-medium uppercase tracking-wide">{page.type.replace(/_/g, " ")}</span>
        <span className="text-[var(--ink-5)]">·</span>
        <span className={
          page.confidence === "high" ? "text-[var(--ink-3)]" :
          page.confidence === "low" ? "text-[var(--ink-3)]" : "text-[var(--ink-4)]"
        }>{page.confidence} confidence</span>
        {page.generated_at && (
          <>
            <span className="text-[var(--ink-5)]">·</span>
            <span className="text-[var(--ink-4)]">{new Date(page.generated_at).toLocaleDateString()}</span>
          </>
        )}
      </div>

      {page.body_markdown && (
        <div>
          <div className="text-[9px] uppercase tracking-wide text-[var(--ink-4)] mb-1">Body</div>
          <pre className="text-[11px] text-[var(--ink-3)] leading-relaxed whitespace-pre-wrap font-sans bg-[var(--surface-1)] rounded p-2 max-h-64 overflow-y-auto">
            {page.body_markdown}
          </pre>
        </div>
      )}

      {page.concepts.length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-wide text-[var(--ink-4)] mb-1">Concepts</div>
          <div className="flex flex-wrap gap-1">
            {page.concepts.map((c) => (
              <span key={c} className="text-[10px] text-[var(--ink-3)] bg-[var(--surface-3)] border border-[var(--line)] rounded px-1.5 py-0.5">{c}</span>
            ))}
          </div>
        </div>
      )}

      {page.tags.length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-wide text-[var(--ink-4)] mb-1">Tags</div>
          <div className="flex flex-wrap gap-1">
            {page.tags.map((t) => (
              <span key={t} className="text-[10px] text-[var(--ink-3)] bg-[var(--surface-2)] border border-[var(--line)] rounded px-1.5 py-0.5">{t}</span>
            ))}
          </div>
        </div>
      )}

      {page.claims.length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-wide text-[var(--ink-4)] mb-1">Claims</div>
          <ul className="space-y-1">
            {page.claims.map((c, i) => (
              <li key={i} className="text-[11px] text-[var(--ink-3)] leading-snug flex items-start gap-1.5">
                <span className="text-[9px] text-[var(--ink-4)] uppercase mt-0.5 shrink-0 w-14">{c.kind}</span>
                <span>{c.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {page.data_gaps.length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-wide text-[var(--ink-4)] mb-1 flex items-center gap-1">
            <HelpCircle size={9} /> Data gaps
          </div>
          <ul className="space-y-0.5">
            {page.data_gaps.map((g, i) => (
              <li key={i} className="text-[11px] text-[var(--ink-3)] leading-snug">• {g}</li>
            ))}
          </ul>
        </div>
      )}

      {page.contradictions.length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-wide text-[var(--ink-3)] mb-1 flex items-center gap-1">
            <AlertTriangle size={9} /> Contradictions ({page.contradictions.length})
          </div>
          <ul className="space-y-1.5">
            {page.contradictions.map((c, i) => (
              <li key={i} className="text-[11px] text-[var(--ink-3)] bg-[var(--surface-2)] border border-[var(--signal-warn)] rounded p-1.5 leading-snug">
                <div className="text-[var(--ink-3)] mb-0.5">vs. “{c.with_entry_name ?? c.with_entry_id}”</div>
                <div className="text-[var(--ink-4)]"><span className="text-[var(--ink-4)]">this:</span> {c.my_claim}</div>
                <div className="text-[var(--ink-4)]"><span className="text-[var(--ink-4)]">other:</span> {c.their_claim}</div>
                <div className="text-[var(--ink-3)] mt-0.5 italic">{c.note}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// #92: empty-state card shown when the KB has zero entries. Replaces the
// previous one-line italic placeholder. Surfaces both the primary "add
// entry" intent and the secondary "try sample data" path so first-time
// reps don't sit on an empty surface wondering what to do.
function KBEmptyState() {
  const [loading, setLoading] = useState(false);
  const [hasDemo, setHasDemo] = useState(false);
  useEffect(() => {
    hasSampleDataLoaded().then(setHasDemo).catch(() => setHasDemo(false));
  }, []);
  async function loadDemo() {
    setLoading(true);
    try {
      await loadSampleData();
      setHasDemo(true);
      // Force a panel refresh: caller's useEffect on kbCount won't fire
      // without a re-render trigger, but the parent reads listKB on mount
      // and on KB-write events, so we let normal store-change propagation
      // handle the UI update.
    } finally {
      setLoading(false);
    }
  }
  return (
    <div
      className="px-3 py-6 flex flex-col items-center text-center gap-2 my-2"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--line-2)",
        borderRadius: 8,
      }}
    >
      <div
        className="flex items-center justify-center"
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: "var(--surface-2)",
          color: "var(--brand-orange)",
        }}
      >
        <Database size={16} />
      </div>
      <h3 className="display-heading" style={{ color: "var(--ink)", fontSize: 14, margin: 0 }}>
        Your sales playbook lives here
      </h3>
      <p style={{ color: "var(--ink-3)", fontSize: 12, maxWidth: 320, lineHeight: 1.45 }}>
        The agent council uses these entries to ground every pitch. Add a doc,
        paste a URL, or paste raw text via the form below.
      </p>
      {!hasDemo && (
        <button
          type="button"
          onClick={loadDemo}
          disabled={loading}
          className="mt-1 text-[11px] font-semibold disabled:opacity-50"
          style={{ color: "var(--brand-orange)", background: "transparent", border: "none" }}
        >
          {loading ? "Loading sample data…" : "Try Wingman with sample data →"}
        </button>
      )}
    </div>
  );
}
