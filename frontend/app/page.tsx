"use client";

import { motion } from "framer-motion";
import { Aperture, FileText, Loader2, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  DraggableCanvas,
  type DraggableCanvasHandle,
} from "@/components/canvas/DraggableCanvas";
import { ZoomControls } from "@/components/canvas/ZoomControls";
import { ChatInput, type ChatPhase } from "@/components/chat/ChatInput";
import { SelectedChips } from "@/components/chat/SelectedChips";
import { WelcomeOverlay } from "@/components/chat/WelcomeOverlay";
import { EditorialOverlay } from "@/components/editorial/editorial-overlay";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { VoiceOverlay } from "@/components/voice/voice-overlay";
import {
  type VoiceChartReady,
  VoiceMicPermissionError,
  useVoiceSession,
} from "@/hooks/voice/use-voice-session";
import { generateEditorial, queryStream, resetConversation } from "@/lib/api-client";
import type {
  ChartCardData,
  ChartSpec,
  EditorialResponse,
  SelectedItem,
  WidgetData,
} from "@/lib/api-types";

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 2.0;
const ZOOM_STEP = 1.1;

const STORAGE_WIDGETS = "aperture-widgets-v2";
const STORAGE_CONVERSATION = "aperture-conversation-id";
const STORAGE_INTERACTED = "aperture-interacted-v1";

const EDITORIAL_MIN_CHARTS = 2;

function clamp(z: number) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
}

function buildContextPrefix(items: SelectedItem[]): string {
  if (items.length === 0) return "";
  const lines = items.map(
    (it) =>
      `- [${it.kind}] "${it.widgetTitle}" / ${it.label} :: ${JSON.stringify(it.payload)}`,
  );
  return (
    `The user has selected these items from existing widgets as context for the next question:\n${lines.join(
      "\n",
    )}\n\nNew question: `
  );
}

export default function Page() {
  const [widgets, setWidgets] = useState<WidgetData[]>([]);
  const [conversationId, setConversationId] = useState<string>("");
  const [streaming, setStreaming] = useState(false);
  const [phase, setPhase] = useState<ChatPhase>("idle");
  const [streamedByIndex, setStreamedByIndex] = useState<Map<number, string>>(
    new Map(),
  );
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [followUpHint, setFollowUpHint] = useState<string | undefined>(undefined);
  const [clarification, setClarification] = useState<string | undefined>(undefined);
  const [editorial, setEditorial] = useState<EditorialResponse | null>(null);
  const [editorialLoading, setEditorialLoading] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const canvasRef = useRef<DraggableCanvasHandle | null>(null);
  const voice = useVoiceSession();

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const rawW = window.localStorage.getItem(STORAGE_WIDGETS);
      if (rawW) {
        const parsed = JSON.parse(rawW) as WidgetData[];
        if (Array.isArray(parsed)) setWidgets(parsed);
      }
      let cid = window.localStorage.getItem(STORAGE_CONVERSATION);
      if (!cid) {
        cid = crypto.randomUUID();
        window.localStorage.setItem(STORAGE_CONVERSATION, cid);
      }
      setConversationId(cid);
      if (window.localStorage.getItem(STORAGE_INTERACTED) === "1") {
        setHasInteracted(true);
      }
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_WIDGETS, JSON.stringify(widgets));
    } catch {
      /* quota or serialization issue */
    }
  }, [widgets, hydrated]);

  const markInteracted = useCallback(() => {
    if (hasInteracted) return;
    setHasInteracted(true);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_INTERACTED, "1");
      } catch {
        /* ignore */
      }
    }
  }, [hasInteracted]);

  const handleSubmit = useCallback(
    async (question: string) => {
      if (streaming || !conversationId) return;
      markInteracted();
      setStreaming(true);
      setError(null);
      setClarification(undefined);
      setStreamedByIndex(new Map());
      setPhase("thinking");

      const contextPrefix = buildContextPrefix(selectedItems);
      const fullQuestion = contextPrefix + question;

      const baseIndex = widgets.length;
      setSelectedItems([]);

      try {
        for await (const evt of queryStream(fullQuestion, conversationId)) {
          switch (evt.kind) {
            case "start":
              setPhase("thinking");
              break;
            case "sql_start":
              setPhase("sql");
              setStreamedByIndex((prev) => {
                const next = new Map(prev);
                next.set(baseIndex + evt.widgetIndex, "");
                return next;
              });
              break;
            case "sql":
              setStreamedByIndex((prev) => {
                const next = new Map(prev);
                const existing = next.get(baseIndex + evt.widgetIndex) ?? "";
                next.set(baseIndex + evt.widgetIndex, existing + evt.ch);
                return next;
              });
              break;
            case "sql_end":
              setPhase("executing");
              break;
            case "done": {
              const r = evt.payload;
              setFollowUpHint(r.follow_up_hint ?? undefined);
              setClarification(r.clarification_question ?? undefined);

              if (r.widgets && r.widgets.length > 0) {
                const newWidgets: WidgetData[] = r.widgets.map((w, i) => {
                  const isMulti = w.spec.chartType === "multi-panel";
                  const sql = isMulti
                    ? (w.spec.config.panels ?? [])
                        .map((p) => p.sql)
                        .filter(Boolean)
                        .join("\n\n-- next panel --\n\n")
                    : w.spec.sql;
                  return {
                    id: w.chart_id ?? crypto.randomUUID(),
                    spec: w.spec,
                    data: w.data,
                    columns: w.data[0] ? Object.keys(w.data[0]) : [],
                    sql,
                    explanation: i === 0 ? r.explanation : "",
                    follow_up:
                      i === 0 ? (r.follow_up_hint ?? undefined) : undefined,
                    clarification:
                      i === 0
                        ? (r.clarification_question ?? undefined)
                        : undefined,
                    latency_ms: r.metadata.latency_ms,
                    panelData: w.panel_data ?? undefined,
                  };
                });
                setWidgets((prev) => [...prev, ...newWidgets]);
                setPhase("done");
                break;
              }

              const isMultiPanel = r.spec.chartType === "multi-panel";
              const hasContent = isMultiPanel
                ? Boolean(r.panel_data && r.panel_data.length > 0)
                : Boolean(r.spec.sql);
              if (hasContent) {
                const widget: WidgetData = {
                  id: r.metadata.chart_id ?? crypto.randomUUID(),
                  spec: r.spec,
                  data: r.data,
                  columns: r.data[0] ? Object.keys(r.data[0]) : [],
                  sql: isMultiPanel
                    ? (r.spec.config.panels ?? [])
                        .map((p) => p.sql)
                        .filter(Boolean)
                        .join("\n\n-- next panel --\n\n")
                    : r.spec.sql,
                  explanation: r.explanation,
                  follow_up: r.follow_up_hint ?? undefined,
                  clarification: r.clarification_question ?? undefined,
                  latency_ms: r.metadata.latency_ms,
                  panelData: r.panel_data ?? undefined,
                };
                setWidgets((prev) => [...prev, widget]);
              }
              setPhase("done");
              break;
            }
            case "error":
              setError(evt.error);
              setPhase("error");
              break;
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase("error");
      } finally {
        setStreaming(false);
        setTimeout(() => setPhase("idle"), 900);
      }
    },
    [conversationId, markInteracted, selectedItems, streaming, widgets],
  );

  const handleRemove = useCallback((id: string) => {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
    setSelectedItems((prev) => prev.filter((it) => it.widgetId !== id));
  }, []);

  const handleClear = useCallback(() => {
    setWidgets([]);
    setStreamedByIndex(new Map());
    setError(null);
    setSelectedItems([]);
    setFollowUpHint(undefined);
    setClarification(undefined);
    if (conversationId) {
      void resetConversation(conversationId);
    }
  }, [conversationId]);

  const handleReset = useCallback(() => {
    canvasRef.current?.resetLayout();
  }, []);

  const handleEditorial = useCallback(async () => {
    if (!conversationId || editorialLoading) return;
    if (widgets.length < EDITORIAL_MIN_CHARTS) return;
    setEditorialLoading(true);
    try {
      const resp = await generateEditorial(conversationId);
      setEditorial(resp);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEditorialLoading(false);
    }
  }, [conversationId, editorialLoading, widgets.length]);

  const toggleSelectedItem = useCallback((item: SelectedItem) => {
    setSelectedItems((prev) => {
      const exists = prev.some((p) => p.uid === item.uid);
      return exists ? prev.filter((p) => p.uid !== item.uid) : [...prev, item];
    });
  }, []);

  const setSelectedItemsBatch = useCallback(
    (items: SelectedItem[], mode: "replace" | "add") => {
      setSelectedItems((prev) => {
        if (mode === "replace") return items;
        const map = new Map(prev.map((p) => [p.uid, p]));
        for (const it of items) map.set(it.uid, it);
        return Array.from(map.values());
      });
    },
    [],
  );

  const clearSelection = useCallback(() => setSelectedItems([]), []);
  const removeSelectedItem = useCallback(
    (uid: string) =>
      setSelectedItems((prev) => prev.filter((p) => p.uid !== uid)),
    [],
  );

  const handleVoiceChartReady = useCallback((payload: VoiceChartReady) => {
    const spec = payload.chart_spec as ChartSpec;
    const isMulti = spec.chartType === "multi-panel";
    const sql = isMulti
      ? (spec.config.panels ?? [])
          .map((p) => p.sql)
          .filter(Boolean)
          .join("\n\n-- next panel --\n\n")
      : spec.sql;
    const widget: WidgetData = {
      id: payload.chart_id || crypto.randomUUID(),
      spec,
      data: payload.data,
      columns: payload.data[0] ? Object.keys(payload.data[0]) : [],
      sql,
      explanation: payload.explanation,
      latency_ms: 0,
      panelData: payload.panel_data ?? undefined,
    };
    setWidgets((prev) => [...prev, widget]);
    markInteracted();
  }, [markInteracted]);

  const handleToggleVoice = useCallback(async () => {
    if (!conversationId) return;
    if (voice.phase === "idle") {
      setVoiceError(null);
      // Snapshot the selection at start time so Claude sees the same
      // context block the HTTP path would build. Match HTTP's behavior
      // of clearing the chips after submission.
      const contextPrefix = buildContextPrefix(selectedItems);
      setSelectedItems([]);
      try {
        await voice.start({
          conversationId,
          onChartReady: handleVoiceChartReady,
          contextPrefix,
        });
      } catch (err) {
        if (err instanceof VoiceMicPermissionError) {
          setVoiceError("Microphone permission denied.");
        } else {
          setVoiceError(err instanceof Error ? err.message : String(err));
        }
      }
    } else if (voice.phase === "active") {
      await voice.stop("user_toggle");
    }
  }, [conversationId, handleVoiceChartReady, selectedItems, voice]);

  const zoomIn = useCallback(() => setZoom((z) => clamp(z * ZOOM_STEP)), []);
  const zoomOut = useCallback(() => setZoom((z) => clamp(z / ZOOM_STEP)), []);
  const zoomReset = useCallback(() => setZoom(1), []);

  const hasWidgets = widgets.length > 0;
  const selectedCount = selectedItems.length;
  const showWelcome = hydrated && !hasInteracted && !hasWidgets;
  const canEditorial = widgets.length >= EDITORIAL_MIN_CHARTS;

  const chartCards: ChartCardData[] = widgets.map((w) => ({
    chartId: w.id,
    spec: w.spec,
    data: w.data,
  }));

  return (
    <div className="flex h-screen flex-col">
      <header className="z-50 flex items-center justify-between border-b border-border/60 bg-background/80 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <Aperture className="h-5 w-5 text-foreground" strokeWidth={1.75} />
          <span className="text-sm font-semibold tracking-tight">Aperture</span>
          <Separator orientation="vertical" className="mx-2 h-4" />
          <span className="text-xs text-muted-foreground">
            Ask your data anything
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleEditorial}
            disabled={!canEditorial || editorialLoading}
            title={
              canEditorial
                ? "Generate magazine-style editorial"
                : `Need at least ${EDITORIAL_MIN_CHARTS} charts`
            }
          >
            {editorialLoading ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="mr-1 h-3.5 w-3.5" />
            )}
            Editorial
          </Button>
          {hasWidgets && (
            <>
              <Button variant="ghost" size="sm" onClick={handleReset}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset layout
              </Button>
              <Button variant="ghost" size="sm" onClick={handleClear}>
                <X className="mr-1 h-3.5 w-3.5" /> Clear all
              </Button>
            </>
          )}
          <span className="text-xs text-muted-foreground tabular-nums">
            {widgets.length} widget{widgets.length === 1 ? "" : "s"}
          </span>
          <Separator orientation="vertical" className="mx-1.5 h-4" />
          <ThemeToggle />
        </div>
      </header>

      <main className="dot-grid-bg relative flex-1 overflow-hidden">
        <DraggableCanvas
          ref={canvasRef}
          widgets={widgets}
          onRemove={handleRemove}
          streamedSqlByIndex={streamedByIndex}
          zoom={zoom}
          onZoomChange={setZoom}
          selectedItems={selectedItems}
          onSelectItem={toggleSelectedItem}
          onSelectItems={setSelectedItemsBatch}
        />

        <WelcomeOverlay show={showWelcome} />

        <motion.div
          initial={false}
          animate={{ y: showWelcome ? "-42vh" : "0vh" }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none absolute inset-x-0 bottom-6 z-40 flex justify-center px-4"
        >
          <div className="pointer-events-auto w-full max-w-2xl rounded-2xl border border-border/70 bg-background/85 p-3 shadow-xl backdrop-blur">
            <ChatInput
              onSubmit={handleSubmit}
              disabled={streaming || voice.phase !== "idle"}
              showSuggestions={!showWelcome}
              phase={phase}
              followUpHint={followUpHint}
              clarification={clarification}
              hasSelection={selectedCount > 0}
              voiceActive={voice.phase !== "idle"}
              voiceAmplitude={voice.amplitude}
              voiceDisabled={voice.phase === "connecting" || voice.phase === "closing"}
              onToggleVoice={handleToggleVoice}
            />
            {error && (
              <p className="mt-2 px-1 text-xs text-destructive">{error}</p>
            )}
            {voiceError && (
              <p className="mt-2 px-1 text-xs text-destructive">{voiceError}</p>
            )}
            <div className="mt-2 flex items-center gap-2">
              <SelectedChips
                items={selectedItems}
                onRemove={removeSelectedItem}
                onClear={clearSelection}
              />
              <div className="ml-auto">
                <ZoomControls
                  zoom={zoom}
                  onZoomIn={zoomIn}
                  onZoomOut={zoomOut}
                  onReset={zoomReset}
                />
              </div>
            </div>
          </div>
        </motion.div>

        <VoiceOverlay
          phase={voice.phase}
          transcript={voice.transcript}
          amplitude={voice.amplitude}
          isAgentSpeaking={voice.isAgentSpeaking}
        />

        {(editorial || editorialLoading) && (
          <EditorialOverlay
            editorial={editorial}
            charts={chartCards}
            onClose={() => setEditorial(null)}
            loading={editorialLoading}
          />
        )}
      </main>
    </div>
  );
}
