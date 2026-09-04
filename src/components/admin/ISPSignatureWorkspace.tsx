"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FilePenLine, Plus, Send, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  signatureStateLabels,
  type ISPSignatureDraft,
  type ISPSignatureState,
  type ISPSignerStatus,
} from "@/lib/isp-signatures";

type Packet = {
  id: string;
  residentId: string;
  draft: ISPSignatureDraft;
  revision: number;
  state: ISPSignatureState;
  signerStatuses: ISPSignerStatus[];
  lastSyncedAt: string | null;
  hasSignedPDF: boolean;
  hasAuditPDF: boolean;
};
const input =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500";
const button =
  "rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed";

export default function ISPSignatureWorkspace({
  residentId,
  onFilesChanged,
}: {
  residentId: string;
  onFilesChanged: () => void;
}) {
  const [packets, setPackets] = useState<Packet[]>([]);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<{
    id: string;
    revision?: number;
    draft: ISPSignatureDraft;
  } | null>(null);
  const [goals, setGoals] = useState("");
  const [review, setReview] = useState<Packet | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [previewURL, setPreviewURL] = useState("");
  const generation = useRef(0);
  const load = useCallback(async () => {
    const current = ++generation.current;
    try {
      const response = await fetch(
        `/api/supervisor/isp-signatures?residentId=${encodeURIComponent(residentId)}`,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (current !== generation.current) return;
      setPackets(data.packets);
      setConfigured(data.configured);
      setError("");
    } catch (e) {
      if (current === generation.current)
        setError(
          e instanceof Error ? e.message : "Could not load signature requests.",
        );
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [residentId]);
  useEffect(() => {
    const lifecycle = generation;
    void load();
    return () => {
      lifecycle.current++;
    };
  }, [load]);
  useEffect(() => {
    if (!review) return;
    const controller = new AbortController();
    let objectURL = "";
    setPreviewURL("");
    setReviewed(false);
    void fetch(`/api/supervisor/isp-signatures/${review.id}/pdf`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            (await response.json()).error || "Could not load PDF.",
          );
        const blob = await response.blob();
        if (!controller.signal.aborted) {
          objectURL = URL.createObjectURL(blob);
          setPreviewURL(objectURL);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) toast.error(e.message);
      });
    return () => {
      controller.abort();
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [review]);
  function edit(packet?: Packet, copy = false) {
    const draft = packet?.draft ?? {
      title: "Individual Service Plan",
      versionLabel: "",
      effectiveDate: new Date().toLocaleDateString("en-CA"),
      preparedBy: "",
      content: "",
      goals: [],
      signers: [{ name: "", email: "", role: "" }],
    };
    setEditor({
      id: copy ? crypto.randomUUID() : (packet?.id ?? crypto.randomUUID()),
      revision: copy ? undefined : packet?.revision,
      draft: copy ? { ...draft, versionLabel: "" } : draft,
    });
    setGoals(draft.goals.join("\n"));
    setReview(null);
  }
  function change<K extends keyof ISPSignatureDraft>(
    key: K,
    value: ISPSignatureDraft[K],
  ) {
    setEditor((current) =>
      current
        ? { ...current, draft: { ...current.draft, [key]: value } }
        : null,
    );
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editor || busy) return;
    setBusy(true);
    try {
      const draft = {
        ...editor.draft,
        goals: goals
          .split("\n")
          .map((g) => g.trim())
          .filter(Boolean),
      };
      const response = await fetch(
        `/api/supervisor/isp-signatures${editor.revision ? `/${editor.id}` : ""}`,
        {
          method: editor.revision ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            editor.revision
              ? { draft, revision: editor.revision }
              : { id: editor.id, residentId, draft },
          ),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setEditor(null);
      await load();
      toast.success("ISP draft saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save ISP.");
    } finally {
      setBusy(false);
    }
  }
  async function action(
    packet: Packet,
    name: "send" | "sync" | "remind" | "cancel",
  ) {
    if (busy) return;
    if (
      name === "cancel" &&
      !window.confirm(
        "Cancel this signature request? Unsigned recipients will no longer be able to sign it.",
      )
    )
      return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/supervisor/isp-signatures/${packet.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: name, revision: packet.revision }),
        },
      );
      const data: Packet & { error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (name === "send") {
        setReview(null);
        toast.success(
          data.state === "pending"
            ? "Signature request sent."
            : "Signature status updated.",
        );
      }
      if (name === "remind")
        toast.success("Reminders requested for unsigned recipients.");
      if (data.hasSignedPDF && !packet.hasSignedPDF) onFilesChanged();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not complete action.",
      );
    } finally {
      await load();
      setBusy(false);
    }
  }
  if (loading)
    return (
      <p className="text-sm text-gray-500">Loading signature requests...</p>
    );
  return (
    <section
      className="rounded-lg border border-blue-100 bg-blue-50/30 p-4 space-y-4"
      aria-label="Prepare ISP and collect signatures"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <FilePenLine className="h-5 w-5 text-blue-600" />
            Prepare ISP & collect signatures
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            Write the plan, add everyone who needs to sign, and send a secure
            email invitation.
          </p>
        </div>
        {!editor && !review && (
          <button
            type="button"
            className={button}
            disabled={busy || !!error}
            onClick={() => edit()}
          >
            <Plus className="inline h-4 w-4 mr-1" />
            Prepare ISP
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}{" "}
          <button className="underline" onClick={() => void load()}>
            Retry
          </button>
        </p>
      )}
      {!configured && !error && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          Email signing needs administrator setup. You can prepare, save, and
          preview plans now.
        </p>
      )}
      {editor && (
        <form onSubmit={save} className="space-y-4 border-t pt-4">
          <fieldset disabled={busy} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Plan title
                <input
                  required
                  maxLength={160}
                  className={input}
                  value={editor.draft.title}
                  onChange={(e) => change("title", e.target.value)}
                />
              </label>
              <label className="text-sm">
                Version label
                <input
                  required
                  maxLength={80}
                  placeholder="Example: September 2026 review"
                  className={input}
                  value={editor.draft.versionLabel}
                  onChange={(e) => change("versionLabel", e.target.value)}
                />
              </label>
              <label className="text-sm">
                Effective date
                <input
                  required
                  type="date"
                  className={input}
                  value={editor.draft.effectiveDate}
                  onChange={(e) => change("effectiveDate", e.target.value)}
                />
              </label>
              <label className="text-sm">
                Prepared by
                <input
                  required
                  maxLength={120}
                  className={input}
                  value={editor.draft.preparedBy}
                  onChange={(e) => change("preparedBy", e.target.value)}
                />
              </label>
            </div>
            <label className="block text-sm">
              Plan and supports
              <textarea
                required
                maxLength={60000}
                rows={9}
                className={input}
                placeholder="Describe preferences, assessed needs, services, daily supports, responsibilities, and review arrangements."
                value={editor.draft.content}
                onChange={(e) => change("content", e.target.value)}
              />
            </label>
            <label className="block text-sm">
              Goals and outcomes{" "}
              <span className="text-gray-500">(one per line)</span>
              <textarea
                required
                rows={4}
                className={input}
                value={goals}
                onChange={(e) => setGoals(e.target.value)}
              />
            </label>
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">People who must sign</h4>
              <p className="text-xs text-gray-600">
                Add the individual, representative, service coordinator, and
                other required participants. Each person needs a separate email
                address. They can sign in any order.
              </p>
              {editor.draft.signers.map((signer, index) => (
                <fieldset
                  key={index}
                  className="rounded-md border bg-white p-3"
                >
                  <legend className="px-1 text-xs">Signer {index + 1}</legend>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {(["name", "email", "role"] as const).map((field) => (
                      <label key={field} className="text-xs">
                        {field === "name"
                          ? "Full name"
                          : field === "email"
                            ? "Email address"
                            : "Relationship / role"}
                        <input
                          required
                          type={field === "email" ? "email" : "text"}
                          maxLength={
                            field === "email"
                              ? 254
                              : field === "name"
                                ? 120
                                : 100
                          }
                          className={input}
                          value={signer[field]}
                          onChange={(e) =>
                            change(
                              "signers",
                              editor.draft.signers.map((s, i) =>
                                i === index
                                  ? { ...s, [field]: e.target.value }
                                  : s,
                              ),
                            )
                          }
                        />
                      </label>
                    ))}
                  </div>
                  {editor.draft.signers.length > 1 && (
                    <button
                      type="button"
                      className="mt-2 text-xs text-red-700"
                      onClick={() =>
                        change(
                          "signers",
                          editor.draft.signers.filter((_, i) => i !== index),
                        )
                      }
                    >
                      Remove signer {index + 1}
                    </button>
                  )}
                </fieldset>
              ))}
              <button
                type="button"
                disabled={editor.draft.signers.length >= 20}
                className={button}
                onClick={() =>
                  change("signers", [
                    ...editor.draft.signers,
                    { name: "", email: "", role: "" },
                  ])
                }
              >
                Add signer
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className={`${button} !bg-blue-600 text-white`}
              >
                Save draft
              </button>
              <button
                type="button"
                className={button}
                onClick={() => setEditor(null)}
              >
                Cancel
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {review && (
        <div className="space-y-3 border-t pt-4">
          <h4 className="font-semibold">Review before sending</h4>
          <p className="text-sm">
            {review.draft.title} · {review.draft.versionLabel}
          </p>
          <ul className="space-y-1 text-sm">
            {review.draft.signers.map((s) => (
              <li key={s.email}>
                {s.name} ({s.role}) — {s.email}
              </li>
            ))}
          </ul>
          {previewURL ? (
            <>
              <a
                href={previewURL}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-blue-700 underline"
              >
                Open PDF in a new tab
              </a>
              <iframe
                title="ISP PDF preview"
                src={previewURL}
                className="h-[480px] w-full rounded border bg-white"
              />
            </>
          ) : (
            <p className="text-sm">Loading PDF preview…</p>
          )}
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={reviewed}
              disabled={!previewURL || busy}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            I reviewed the plan and confirmed every recipient’s email address.
          </label>
          <p className="text-xs text-gray-600">
            Sending locks this version. Each listed person receives a secure
            link to review and sign.
          </p>
          <div className="flex gap-2">
            <button
              className={`${button} !bg-blue-600 text-white`}
              disabled={busy || !configured || !reviewed}
              onClick={() => void action(review, "send")}
            >
              <Send className="inline h-4 w-4 mr-2" />
              {busy ? "Sending…" : "Send for signatures"}
            </button>
            <button
              className={button}
              disabled={busy}
              onClick={() => setReview(null)}
            >
              Back
            </button>
          </div>
        </div>
      )}
      {!editor && !review && (
        <div className="space-y-3">
          {packets.length === 0 && !error && (
            <p className="text-sm text-gray-500">
              No signature requests yet. Start by preparing an ISP.
            </p>
          )}
          {packets.map((packet) => (
            <article
              key={packet.id}
              className="rounded-md border bg-white p-3 space-y-3"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold">
                    {packet.draft.title}
                  </h4>
                  <p className="text-xs text-gray-500">
                    {packet.draft.versionLabel} · Effective{" "}
                    {packet.draft.effectiveDate}
                  </p>
                </div>
                <span className="text-xs font-semibold text-blue-800">
                  {signatureStateLabels[packet.state]}
                </span>
              </div>
              <ul className="space-y-1 text-xs">
                {packet.draft.signers.map((s) => {
                  const status = packet.signerStatuses.find(
                    (r) => r.email.toLowerCase() === s.email.toLowerCase(),
                  );
                  return (
                    <li
                      key={s.email}
                      className="flex flex-wrap justify-between gap-1"
                    >
                      <span>
                        {s.name} · {s.role} · {s.email}
                      </span>
                      <span>
                        {status?.status === "SIGNED"
                          ? `Signed${status.signedAt ? ` ${new Date(status.signedAt).toLocaleString()}` : ""}`
                          : status?.status === "REJECTED"
                            ? "Declined"
                            : ["draft", "ready", "preparing"].includes(
                                  packet.state,
                                )
                              ? "Not sent"
                              : packet.state === "cancelled"
                                ? "Cancelled"
                                : "Awaiting signature"}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {packet.lastSyncedAt && (
                <p className="text-xs text-gray-500">
                  Last checked {new Date(packet.lastSyncedAt).toLocaleString()}
                </p>
              )}
              {["preparing", "sending"].includes(packet.state) && (
                <p className="text-xs text-amber-800">
                  Delivery needs to be checked. Refresh status before sending
                  again.
                </p>
              )}
              {packet.hasSignedPDF && (
                <p className="text-xs text-green-800">
                  Signed copy saved to ISP files below. Review and activate it
                  when appropriate.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <a
                  className={button}
                  href={`/api/supervisor/isp-signatures/${packet.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View plan
                </a>
                {packet.state === "draft" && (
                  <button
                    disabled={busy}
                    className={button}
                    onClick={() => edit(packet)}
                  >
                    Edit draft
                  </button>
                )}
                {["completed", "rejected", "cancelled"].includes(
                  packet.state,
                ) && (
                  <button
                    disabled={busy}
                    className={button}
                    onClick={() => edit(packet, true)}
                  >
                    Prepare revision
                  </button>
                )}
                {["draft", "ready"].includes(packet.state) && (
                  <button
                    disabled={busy || !configured}
                    className={button}
                    onClick={() => setReview(packet)}
                  >
                    Review & send
                  </button>
                )}
                {packet.state !== "draft" && (
                  <button
                    disabled={busy || !configured}
                    className={button}
                    onClick={() => void action(packet, "sync")}
                  >
                    <RefreshCw className="inline h-3 w-3 mr-1" />
                    Refresh status
                  </button>
                )}
                {packet.state === "pending" && (
                  <>
                    <button
                      disabled={busy || !configured}
                      className={button}
                      onClick={() => void action(packet, "remind")}
                    >
                      Remind unsigned people
                    </button>
                    <button
                      disabled={busy || !configured}
                      className={button}
                      onClick={() => void action(packet, "cancel")}
                    >
                      Cancel request
                    </button>
                  </>
                )}
                {packet.hasSignedPDF && (
                  <a
                    className={button}
                    href={`/api/supervisor/isp-signatures/${packet.id}/pdf?version=signed`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Signed PDF
                  </a>
                )}
                {packet.hasAuditPDF && (
                  <a
                    className={button}
                    href={`/api/supervisor/isp-signatures/${packet.id}/pdf?version=audit`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Signature audit trail
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
