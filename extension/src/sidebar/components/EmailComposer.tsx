import React, { useState } from "react";
import { Mail, ArrowLeft, Zap } from "lucide-react";
import { useAppStore } from "../stores/app-store";
import { useEmailCouncil } from "../hooks/useEmailCouncil";
import { CopyButton } from "./CopyButton";
import type { EmailIntent } from "../../shared/types";

/**
 * Email Council UI surface (roadmap item, closes #48).
 *
 * Renders inside the brand-skin Generate tab when outputMode === "email".
 * Composes an EmailInput, runs the existing council pipeline via
 * useEmailCouncil, then displays the structured EmailDraft (subject, body,
 * CTA, sources) with one-click copy of subject + body.
 *
 * Intent picker exposes the full EmailIntent union from shared/types so
 * users can drive every intent the backend agent supports (intro,
 * follow_up, post_call, objection, close, custom). The issue mentions
 * "Cold intro / Follow-up / Re-engage" as the headline trio — those map
 * to intro / follow_up / post_call. The remaining three are listed below
 * the divider so the primary three stay visually surfaced.
 */

interface IntentOption {
  value: EmailIntent;
  label: string;
  hint: string;
}

const PRIMARY_INTENTS: IntentOption[] = [
  { value: "intro", label: "Cold intro", hint: "First-touch outreach to a new prospect." },
  { value: "follow_up", label: "Follow-up", hint: "Polite nudge after silence." },
  { value: "post_call", label: "Re-engage / post-call", hint: "Recap a meeting and push the next step." },
];

const SECONDARY_INTENTS: IntentOption[] = [
  { value: "objection", label: "Objection response", hint: "Address a specific concern they raised." },
  { value: "close", label: "Closing nudge", hint: "Late-stage push toward signature." },
  { value: "custom", label: "Custom", hint: "Free-form prompt — use the instruction field." },
];

const ALL_INTENTS = [...PRIMARY_INTENTS, ...SECONDARY_INTENTS];

export function EmailComposer() {
  const { emailInput, setEmailInput, lastEmail, setLastEmail, isGenerating } = useAppStore();
  const { run } = useEmailCouncil();

  const [intent, setIntent] = useState<EmailIntent>(emailInput?.intent ?? "intro");
  const [recipient, setRecipient] = useState(emailInput?.recipient_name ?? "");
  const [company, setCompany] = useState(emailInput?.company_name ?? "");
  const [persona, setPersona] = useState(emailInput?.persona_role ?? "");
  const [context, setContext] = useState(emailInput?.context ?? "");
  const [customInstruction, setCustomInstruction] = useState(emailInput?.custom_instruction ?? "");

  async function handleSubmit() {
    if (!recipient.trim() || !company.trim() || !context.trim()) return;
    setEmailInput({
      recipient_name: recipient.trim(),
      company_name: company.trim(),
      persona_role: persona.trim(),
      intent,
      context: context.trim(),
      custom_instruction: intent === "custom" ? customInstruction.trim() || undefined : undefined,
    });
    await run();
  }

  // ─── Result view ───────────────────────────────────────────────────────────
  if (lastEmail) {
    const draft = lastEmail.final_output;
    const subjectAndBody = `Subject: ${draft.subject}\n\n${draft.body}`;
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setLastEmail(null)}
            className="text-xs flex items-center gap-1"
            style={{ color: "var(--ink-4)" }}
          >
            <ArrowLeft size={12} /> New email
          </button>
          {/* Single "Copy email" affordance covers subject + body in one
              paste — matches Gmail/Outlook's compose flow. Placed in the
              top action row (not the Subject card) so users don't mistake
              it for a "copy subject only" button. */}
          <CopyButton text={subjectAndBody} label="Copy email" />
        </div>

        <div
          className="p-3 space-y-2"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--line)",
            borderRadius: 6,
          }}
        >
          <span className="eyebrow" style={{ fontSize: 9, color: "var(--ink-4)" }}>
            Subject
          </span>
          <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
            {draft.subject}
          </p>
        </div>

        <div
          className="p-3 space-y-2"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--line)",
            borderRadius: 6,
          }}
        >
          <span className="eyebrow" style={{ fontSize: 9, color: "var(--ink-4)" }}>
            Body
          </span>
          <p
            className="text-xs whitespace-pre-wrap leading-relaxed"
            style={{ color: "var(--ink-2)" }}
          >
            {draft.body}
          </p>
        </div>

        {draft.cta && (
          <div
            className="p-3 space-y-1"
            style={{
              background: "var(--accent-blue-soft)",
              border: "1px solid var(--accent-blue)",
              borderRadius: 6,
            }}
          >
            <span className="eyebrow" style={{ fontSize: 9, color: "var(--accent-blue)" }}>
              Suggested CTA
            </span>
            <p className="text-xs" style={{ color: "var(--ink-2)" }}>
              {draft.cta}
            </p>
          </div>
        )}

        {draft.tone_notes && (
          <p
            className="text-[11px] italic"
            style={{ color: "var(--ink-4)" }}
          >
            Tone: {draft.tone_notes}
          </p>
        )}

        {draft.sources_used.length > 0 && (
          <div
            className="p-3 space-y-1"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--line)",
              borderRadius: 6,
            }}
          >
            <span className="eyebrow" style={{ fontSize: 9, color: "var(--ink-4)" }}>
              Sources used ({draft.sources_used.length})
            </span>
            <ul className="text-[10px] space-y-0.5" style={{ color: "var(--ink-4)" }}>
              {draft.sources_used.slice(0, 6).map((s) => (
                <li key={s} className="truncate">{s}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // ─── Form view ─────────────────────────────────────────────────────────────
  const selected = ALL_INTENTS.find((i) => i.value === intent) ?? PRIMARY_INTENTS[0];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Mail size={14} style={{ color: "var(--brand-orange)" }} />
        <h2 className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
          Draft an email
        </h2>
      </div>

      <p className="text-[11px]" style={{ color: "var(--ink-4)" }}>
        Pick an intent, give the council the prospect + context, and it'll draft
        a grounded email with subject, body, and a suggested CTA.
      </p>

      {/* Intent pill row — primary 3 */}
      <div>
        <span className="eyebrow mb-1 block" style={{ fontSize: 9, color: "var(--ink-4)" }}>
          Intent
        </span>
        <div
          className="grid grid-cols-3 gap-1 p-1"
          style={{ background: "var(--surface-1)", border: "1px solid var(--line)", borderRadius: 6 }}
        >
          {PRIMARY_INTENTS.map((opt) => {
            const active = intent === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setIntent(opt.value)}
                className="py-1.5 text-[11px] font-semibold"
                style={{
                  background: active ? "var(--brand-orange)" : "transparent",
                  color: active ? "#0A0A0A" : "var(--ink-3)",
                  borderRadius: 4,
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Secondary intents — exposed as a dropdown so the pill row stays
            visually clean while still letting power users hit objection /
            close / custom. */}
        <label className="mt-2 flex items-center gap-2 text-[11px]" style={{ color: "var(--ink-4)" }}>
          Or:
          <select
            value={SECONDARY_INTENTS.some((o) => o.value === intent) ? intent : ""}
            onChange={(e) => e.target.value && setIntent(e.target.value as EmailIntent)}
            className="flex-1 px-2 py-1"
            style={{
              background: "var(--surface-1)",
              color: "var(--ink)",
              border: "1px solid var(--line)",
              borderRadius: 4,
              fontSize: 11,
            }}
          >
            <option value="">Other intent…</option>
            {SECONDARY_INTENTS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <p className="text-[10px] mt-1" style={{ color: "var(--ink-5)" }}>{selected.hint}</p>
      </div>

      <label className="block space-y-1">
        <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>Recipient name</span>
        <input
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="e.g. Priya Patel"
          className="input"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>Company</span>
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Acme Cloud"
            className="input"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>
            Role <span style={{ color: "var(--ink-5)" }}>(optional)</span>
          </span>
          <input
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            placeholder="VP Sales"
            className="input"
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>Context</span>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder={intentPlaceholder(intent)}
          rows={4}
          className="input resize-none"
        />
      </label>

      {intent === "custom" && (
        <label className="block space-y-1">
          <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>
            Custom instruction
          </span>
          <textarea
            value={customInstruction}
            onChange={(e) => setCustomInstruction(e.target.value)}
            placeholder='e.g. "Write a thank-you note, mention their recent product launch, keep under 80 words."'
            rows={3}
            className="input resize-none"
          />
        </label>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!recipient.trim() || !company.trim() || !context.trim() || isGenerating}
        className="w-full py-2.5 font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: "var(--brand-orange)",
          color: "#0A0A0A",
          borderRadius: 6,
        }}
      >
        <Zap size={14} /> Draft email
      </button>
    </div>
  );
}

function intentPlaceholder(intent: EmailIntent): string {
  switch (intent) {
    case "intro":
      return 'e.g. "Saw their VP Eng post about FinOps headcount on LinkedIn. We have a case study on Northwind that cut idle spend 22%."';
    case "follow_up":
      return 'e.g. "Sent the pricing doc two weeks ago. They went quiet after the security review."';
    case "post_call":
      return 'e.g. "Demo on Tuesday went well. CFO loved the budget alerts. Next step is a 14-day trial scoping call."';
    case "objection":
      return 'e.g. "They said Cast.ai already does this. Counter with our 3 case studies."';
    case "close":
      return 'e.g. "Verbal commit last week. Legal review wraps Friday. Need to nudge for signature without being pushy."';
    case "custom":
      return 'Describe the situation. Use the custom instruction field below for tone / length / specific asks.';
  }
}
