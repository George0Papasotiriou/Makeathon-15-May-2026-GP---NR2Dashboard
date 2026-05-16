"use client";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "framer-motion";
import { GripVertical } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import {
  WidgetTile,
  WIDGET_PX,
  DEFAULT_WIDGET_SIZE,
  inferIntent,
  type WidgetSize,
} from "@/components/canvas/WidgetTile";
import type { SelectedItem, WidgetData } from "@/lib/api-types";
import { cn } from "@/lib/utils";

const GAP = 16;
const PADDING = 32;
const SNAP_THRESHOLD = 12;

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 2.0;
// Logarithmic factor per wheel-unit. Trackpad pinch sets ctrlKey and uses
// smaller deltas, so it gets a larger coefficient.
const WHEEL_ZOOM_K = 0.0015;
const PINCH_ZOOM_K = 0.01;

const MIN_W = 220;
const MIN_H = 160;
const MAX_W = 1200;
const MAX_H = 800;

const LAYOUT_STORAGE_KEY = "aperture-layout-v1";

export type DraggableCanvasHandle = {
  resetLayout: () => void;
};

export type SelectionMode = "replace" | "add";

type Props = {
  widgets: WidgetData[];
  onRemove?: (id: string) => void;
  streamedSqlByIndex?: Map<number, string>;
  globalIndexOffset?: number;
  zoom: number;
  onZoomChange?: (z: number) => void;
  selectedItems?: SelectedItem[];
  onSelectItem?: (item: SelectedItem) => void;
  onSelectItems?: (items: SelectedItem[], mode: SelectionMode) => void;
};

type ScreenRect = { left: number; top: number; right: number; bottom: number };

function normRect(m: { x0: number; y0: number; x1: number; y1: number }): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} {
  return {
    left: Math.min(m.x0, m.x1),
    top: Math.min(m.y0, m.y1),
    right: Math.max(m.x0, m.x1),
    bottom: Math.max(m.y0, m.y1),
  };
}

function rectsIntersect(a: ScreenRect, b: ScreenRect): boolean {
  return (
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  );
}

function rectContains(outer: ScreenRect, inner: ScreenRect): boolean {
  return (
    outer.left <= inner.left &&
    outer.top <= inner.top &&
    outer.right >= inner.right &&
    outer.bottom >= inner.bottom
  );
}

function toScreenRect(r: DOMRect): ScreenRect {
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

function parseLeafItem(el: Element): SelectedItem | null {
  const uid = el.getAttribute("data-uid");
  const kind = el.getAttribute("data-kind") as SelectedItem["kind"] | null;
  const label = el.getAttribute("data-label") ?? "";
  const widgetId = el.getAttribute("data-widget-id") ?? "";
  const widgetTitle = el.getAttribute("data-widget-title") ?? "";
  const rawPayload = el.getAttribute("data-payload");
  if (!uid || !kind) return null;
  let payload: Record<string, unknown> = {};
  if (rawPayload) {
    try {
      payload = JSON.parse(rawPayload) as Record<string, unknown>;
    } catch {
      /* keep empty */
    }
  }
  return { uid, kind, label, widgetId, widgetTitle, payload };
}

function buildWidgetItem(wEl: Element): SelectedItem | null {
  const widgetId = wEl.getAttribute("data-widget-id");
  const widgetTitle = wEl.getAttribute("data-widget-title") ?? "";
  if (!widgetId) return null;
  return {
    uid: `${widgetId}:widget`,
    widgetId,
    widgetTitle,
    kind: "widget",
    label: widgetTitle || "card",
    payload: {},
  };
}

type Position = { x: number; y: number };
type Size = { w: number; h: number };
type Rect = Position & Size;

function defaultSize(size: WidgetSize): Size {
  return { w: WIDGET_PX[size].width, h: WIDGET_PX[size].height };
}

// Estimate header width: intent badge + title + action buttons + paddings/gaps.
// Lets initial card width grow when title text is long.
function estimateHeaderWidth(widget: WidgetData): number {
  const title = widget.spec.title ?? "";
  const intentLabel = inferIntent(widget).label;
  // text-sm font-medium ~ 7px per char average
  const titleW = title.length * 7;
  // badge: icon(10) + gap(6) + label chars * 6 + horizontal padding(12)
  const badgeW = 10 + 6 + intentLabel.length * 6 + 12;
  // right action area: two 24px buttons + gaps
  const actionsW = 56;
  // card p-3 (12 each side) + header gap-2 + inner gap-1.5
  const chromeW = 24 + 8 + 6;
  return Math.ceil(titleW + badgeW + actionsW + chromeW);
}

function naturalSize(widget: WidgetData): Size {
  const base = defaultSize(DEFAULT_WIDGET_SIZE);
  const headerW = estimateHeaderWidth(widget);
  if (widget.spec.chartType === "table") {
    const cols = widget.columns.length || 1;
    const rows = widget.data.length || 1;
    const tableW = cols * 130 + 32;
    return {
      w: Math.max(base.w, Math.min(Math.max(tableW, headerW), MAX_W)),
      h: Math.max(base.h, Math.min(rows * 32 + 80, 520)),
    };
  }
  if (widget.spec.chartType === "multi-panel") {
    const n = widget.spec.config.panels?.length ?? 0;
    const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3;
    const rows = Math.ceil(Math.max(n, 1) / cols);
    const panelW = 280;
    const panelH = 220;
    const headerChrome = 64;
    return {
      w: Math.max(base.w, Math.min(cols * panelW + 32, MAX_W)),
      h: Math.max(base.h, Math.min(rows * panelH + headerChrome, MAX_H)),
    };
  }
  return {
    w: Math.max(base.w, Math.min(headerW, MAX_W)),
    h: base.h,
  };
}

function clampSize(s: Size): Size {
  return {
    w: Math.max(MIN_W, Math.min(MAX_W, s.w)),
    h: Math.max(MIN_H, Math.min(MAX_H, s.h)),
  };
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Resolve overlap by pushing the dragged rect out of every overlapping
 * neighbour along the axis with smallest penetration. Iterates a few times
 * to settle cascading collisions.
 */
function resolveOverlap(
  proposed: Position,
  w: number,
  h: number,
  others: Rect[],
): Position {
  let { x, y } = proposed;
  for (let iter = 0; iter < 6; iter++) {
    let mutated = false;
    for (const o of others) {
      const a: Rect = { x, y, w, h };
      if (!rectsOverlap(a, o)) continue;
      const penLeft = a.x + a.w - o.x;       // push dragged left
      const penRight = o.x + o.w - a.x;      // push dragged right
      const penTop = a.y + a.h - o.y;        // push dragged up
      const penBottom = o.y + o.h - a.y;     // push dragged down
      const minX = Math.min(penLeft, penRight);
      const minY = Math.min(penTop, penBottom);
      if (minX < minY) {
        x += penLeft < penRight ? -penLeft : penRight;
      } else {
        y += penTop < penBottom ? -penTop : penBottom;
      }
      mutated = true;
    }
    if (!mutated) break;
  }
  return { x, y };
}

function autoLayout(
  widgets: WidgetData[],
  sizes: Map<string, Size>,
  containerWidth: number,
  existing: Map<string, Position>,
): Map<string, Position> {
  const next = new Map(existing);
  const rowWidth = Math.max(containerWidth - PADDING * 2, 400);

  // Existing rects we must avoid overlapping with.
  const existingRects: Rect[] = [];
  for (const [id, pos] of next.entries()) {
    const sz = sizes.get(id);
    if (!sz) continue;
    existingRects.push({ x: pos.x, y: pos.y, w: sz.w, h: sz.h });
  }

  let cursorX = PADDING;
  let cursorY = PADDING;
  let rowHeight = 0;

  for (const w of widgets) {
    if (next.has(w.id)) continue;
    const s = sizes.get(w.id) ?? naturalSize(w);

    if (cursorX + s.w > rowWidth + PADDING) {
      cursorX = PADDING;
      cursorY += rowHeight + GAP;
      rowHeight = 0;
    }

    // Slide DOWN past any existing widget we would overlap. New cards
    // settle into the first empty slot near the top, not at the very
    // bottom of the canvas.
    let safety = 0;
    while (safety++ < 200) {
      let pushed = false;
      const probe: Rect = { x: cursorX, y: cursorY, w: s.w, h: s.h };
      for (const o of existingRects) {
        if (rectsOverlap(probe, o)) {
          cursorY = o.y + o.h + GAP;
          pushed = true;
          break;
        }
      }
      if (!pushed) break;
    }

    next.set(w.id, { x: cursorX, y: cursorY });
    existingRects.push({ x: cursorX, y: cursorY, w: s.w, h: s.h });
    cursorX += s.w + GAP;
    rowHeight = Math.max(rowHeight, s.h);
  }
  return next;
}

function applySnap(
  proposedX: number,
  proposedY: number,
  w: number,
  h: number,
  others: Rect[],
): { x: number; y: number; didSnap: boolean } {
  let bestDx: number | null = null;
  let bestDy: number | null = null;
  for (const o of others) {
    const xc = [o.x, o.x + o.w - w, o.x - w, o.x + o.w];
    for (const t of xc) {
      const d = t - proposedX;
      if (Math.abs(d) < SNAP_THRESHOLD && (bestDx === null || Math.abs(d) < Math.abs(bestDx))) {
        bestDx = d;
      }
    }
    const yc = [o.y, o.y + o.h - h, o.y - h, o.y + o.h];
    for (const t of yc) {
      const d = t - proposedY;
      if (Math.abs(d) < SNAP_THRESHOLD && (bestDy === null || Math.abs(d) < Math.abs(bestDy))) {
        bestDy = d;
      }
    }
  }
  return {
    x: proposedX + (bestDx ?? 0),
    y: proposedY + (bestDy ?? 0),
    didSnap: bestDx !== null || bestDy !== null,
  };
}

type ResizeHandleProps = {
  zoom: number;
  onResize: (dx: number, dy: number) => void;
};

function ResizeHandle({ zoom, onResize }: ResizeHandleProps) {
  const last = useRef<{ x: number; y: number } | null>(null);
  const pending = useRef<{ dx: number; dy: number } | null>(null);
  const rafId = useRef<number | null>(null);
  return (
    <div
      data-no-drag
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        last.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        if (!last.current) return;
        const dx = (e.clientX - last.current.x) / zoom;
        const dy = (e.clientY - last.current.y) / zoom;
        last.current = { x: e.clientX, y: e.clientY };
        if (pending.current) {
          pending.current.dx += dx;
          pending.current.dy += dy;
        } else {
          pending.current = { dx, dy };
        }
        if (rafId.current == null) {
          rafId.current = requestAnimationFrame(() => {
            rafId.current = null;
            const p = pending.current;
            pending.current = null;
            if (p) onResize(p.dx, p.dy);
          });
        }
      }}
      onPointerUp={(e) => {
        last.current = null;
        if (rafId.current != null) {
          cancelAnimationFrame(rafId.current);
          rafId.current = null;
        }
        const p = pending.current;
        pending.current = null;
        if (p) onResize(p.dx, p.dy);
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* not captured */
        }
      }}
      onPointerCancel={() => {
        last.current = null;
        pending.current = null;
        if (rafId.current != null) {
          cancelAnimationFrame(rafId.current);
          rafId.current = null;
        }
      }}
      className="absolute bottom-0 right-0 z-30 h-4 w-4 cursor-nwse-resize p-0.5 opacity-0 transition group-hover:opacity-100"
      title="Drag to resize"
    >
      <GripVertical
        className="h-full w-full rotate-45 text-muted-foreground/70"
        strokeWidth={1.5}
      />
    </div>
  );
}

type WidgetProps = {
  widget: WidgetData;
  position: Position;
  size: Size;
  zoom: number;
  others: Rect[];
  streamedSql: string | undefined;
  selectedItems: SelectedItem[];
  onMoveEnd: (id: string, x: number, y: number) => void;
  onResize: (id: string, dx: number, dy: number) => void;
  onRemove?: (id: string) => void;
  onSelectItem?: (item: SelectedItem) => void;
};

function DraggableWidget({
  widget,
  position,
  size,
  zoom,
  others,
  streamedSql,
  selectedItems,
  onMoveEnd,
  onResize,
  onRemove,
  onSelectItem,
}: WidgetProps) {
  const x = useMotionValue(position.x);
  const y = useMotionValue(position.y);
  const [isDragging, setIsDragging] = useState(false);
  const [isSnapping, setIsSnapping] = useState(false);
  const startRef = useRef<{ px: number; py: number; mvX: number; mvY: number } | null>(null);
  const lastSyncRef = useRef<Position>(position);

  useEffect(() => {
    if (
      lastSyncRef.current.x === position.x &&
      lastSyncRef.current.y === position.y
    ) {
      return;
    }
    lastSyncRef.current = position;
    x.set(position.x);
    y.set(position.y);
  }, [position, x, y]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    startRef.current = {
      px: e.clientX,
      py: e.clientY,
      mvX: x.get(),
      mvY: y.get(),
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !startRef.current) return;
    const dx = (e.clientX - startRef.current.px) / zoom;
    const dy = (e.clientY - startRef.current.py) / zoom;
    const proposedX = startRef.current.mvX + dx;
    const proposedY = startRef.current.mvY + dy;
    const snapped = applySnap(proposedX, proposedY, size.w, size.h, others);
    x.set(snapped.x);
    y.set(snapped.y);
    setIsSnapping(snapped.didSnap);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    setIsSnapping(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
    onMoveEnd(widget.id, x.get(), y.get());
    startRef.current = null;
  };

  return (
    <motion.div
      data-widget
      data-widget-id={widget.id}
      data-widget-title={widget.spec.title}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ type: "spring", stiffness: 520, damping: 16, mass: 0.7 }}
      style={{
        x,
        y,
        position: "absolute",
        width: size.w,
        height: size.h,
        zIndex: isDragging ? 30 : 1,
      }}
      className={cn(
        "group/widget touch-none select-none cursor-grab",
        isDragging && "cursor-grabbing",
      )}
    >
      <WidgetTile
        widget={widget}
        onRemove={onRemove}
        streamedSql={streamedSql}
        isSnapping={isSnapping}
        selectedItems={selectedItems}
        onSelectItem={onSelectItem}
      />
      <ResizeHandle
        zoom={zoom}
        onResize={(dx, dy) => onResize(widget.id, dx, dy)}
      />
    </motion.div>
  );
}

export const DraggableCanvas = forwardRef<DraggableCanvasHandle, Props>(
  function DraggableCanvas(
    {
      widgets,
      onRemove,
      streamedSqlByIndex,
      globalIndexOffset = 0,
      zoom,
      onZoomChange,
      selectedItems,
      onSelectItem,
      onSelectItems,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [positions, setPositions] = useState<Map<string, Position>>(new Map());
    const [sizes, setSizes] = useState<Map<string, Size>>(new Map());
    const [containerWidth, setContainerWidth] = useState(1200);
    const hydratedRef = useRef(false);

    // Pan + scale are written directly to a DOM element via style.transform
    // to skip framer-motion's frame scheduler. One vsync floor, no extra hop.
    //
    // Crispness: during interaction we use `translate3d` + `will-change` so the
    // element is on its own compositor layer (smooth GPU composite, but text
    // is rasterized at scale 1 and GPU-scaled → blurry at non-1 zoom). After
    // 1s idle we drop both, demote the layer, and the browser repaints at the
    // current scale — text becomes crisp again.
    const transformElRef = useRef<HTMLDivElement | null>(null);
    const panRef = useRef({ x: 0, y: 0 });
    const scaleRef = useRef(zoom);
    const idleTimerRef = useRef<number | null>(null);
    const tweenRef = useRef<AnimationPlaybackControls | null>(null);

    const writeTransform = useCallback((gpu: boolean) => {
      const el = transformElRef.current;
      if (!el) return;
      const { x, y } = panRef.current;
      const s = scaleRef.current;
      if (gpu) {
        el.style.willChange = "transform";
        el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`;
      } else {
        el.style.willChange = "auto";
        el.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
      }
    }, []);

    const scheduleCrispen = useCallback(() => {
      if (typeof window === "undefined") return;
      if (idleTimerRef.current != null) {
        window.clearTimeout(idleTimerRef.current);
      }
      idleTimerRef.current = window.setTimeout(() => {
        idleTimerRef.current = null;
        if (tweenRef.current != null) return;
        writeTransform(false);
      }, 1000);
    }, [writeTransform]);

    const applyTransform = useCallback(() => {
      writeTransform(true);
      scheduleCrispen();
    }, [writeTransform, scheduleCrispen]);

    const cancelTween = useCallback(() => {
      if (tweenRef.current != null) {
        tweenRef.current.stop();
        tweenRef.current = null;
      }
    }, []);

    const animateZoomTo = useCallback(
      (target: number) => {
        cancelTween();
        const start = scaleRef.current;
        if (Math.abs(target - start) < 1e-4) return;
        tweenRef.current = animate(start, target, {
          type: "spring",
          stiffness: 320,
          damping: 32,
          mass: 0.6,
          restDelta: 0.0005,
          onUpdate: (v) => {
            scaleRef.current = v;
            writeTransform(true);
          },
          onComplete: () => {
            tweenRef.current = null;
            scheduleCrispen();
          },
        });
      },
      [cancelTween, scheduleCrispen, writeTransform],
    );
    const marqueeRef = useRef<{
      x0: number;
      y0: number;
      x1: number;
      y1: number;
    } | null>(null);
    const marqueeOverlayRef = useRef<HTMLDivElement | null>(null);
    const [spaceHeld, setSpaceHeld] = useState(false);
    const [interactionMode, setInteractionMode] = useState<
      "marquee" | "pan" | null
    >(null);
    const interactionRef = useRef<null | {
      mode: "marquee" | "pan";
      startClient: { x: number; y: number };
      startPan: { x: number; y: number };
      additive: boolean;
      moved: boolean;
      pointerId: number;
    }>(null);

    const updateMarqueeOverlay = useCallback(() => {
      const overlay = marqueeOverlayRef.current;
      const m = marqueeRef.current;
      if (!overlay) return;
      if (!m || !interactionRef.current?.moved) {
        overlay.style.display = "none";
        return;
      }
      const left = Math.min(m.x0, m.x1);
      const top = Math.min(m.y0, m.y1);
      const width = Math.abs(m.x1 - m.x0);
      const height = Math.abs(m.y1 - m.y0);
      overlay.style.display = "block";
      overlay.style.left = `${left}px`;
      overlay.style.top = `${top}px`;
      overlay.style.width = `${width}px`;
      overlay.style.height = `${height}px`;
    }, []);

    // Hydrate positions + sizes from localStorage once on mount.
    useEffect(() => {
      if (typeof window === "undefined") return;
      try {
        const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as {
            positions?: [string, Position][];
            sizes?: [string, Size][];
          };
          if (parsed.positions) setPositions(new Map(parsed.positions));
          if (parsed.sizes) setSizes(new Map(parsed.sizes));
        }
      } catch {
        /* ignore parse errors */
      }
      hydratedRef.current = true;
    }, []);

    // Persist positions + sizes whenever they change.
    useEffect(() => {
      if (typeof window === "undefined") return;
      if (!hydratedRef.current) return;
      try {
        window.localStorage.setItem(
          LAYOUT_STORAGE_KEY,
          JSON.stringify({
            positions: Array.from(positions.entries()),
            sizes: Array.from(sizes.entries()),
          }),
        );
      } catch {
        /* quota or serialization issue — non-fatal */
      }
    }, [positions, sizes]);

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const update = () => setContainerWidth(el.clientWidth);
      update();
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    useEffect(() => {
      return () => {
        if (idleTimerRef.current != null && typeof window !== "undefined") {
          window.clearTimeout(idleTimerRef.current);
        }
        tweenRef.current?.stop();
      };
    }, []);

    // Button zoom path: React-owned `zoom` changed but scaleRef is stale →
    // tween from current scale to new target so buttons feel smooth.
    // Wheel updates scaleRef synchronously before firing onZoomChange, so
    // when this effect runs from a wheel-driven prop change, the diff is ~0
    // and the tween is skipped.
    useEffect(() => {
      if (Math.abs(scaleRef.current - zoom) < 1e-4) return;
      animateZoomTo(zoom);
    }, [zoom, animateZoomTo]);

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const onWheel = (e: WheelEvent) => {
        const target = e.target as HTMLElement | null;
        const scrollable = target?.closest<HTMLElement>("[data-scrollable]");
        if (scrollable) {
          const canScrollY =
            scrollable.scrollHeight > scrollable.clientHeight &&
            ((e.deltaY < 0 && scrollable.scrollTop > 0) ||
              (e.deltaY > 0 &&
                scrollable.scrollTop + scrollable.clientHeight <
                  scrollable.scrollHeight));
          const canScrollX =
            scrollable.scrollWidth > scrollable.clientWidth &&
            ((e.deltaX < 0 && scrollable.scrollLeft > 0) ||
              (e.deltaX > 0 &&
                scrollable.scrollLeft + scrollable.clientWidth <
                  scrollable.scrollWidth));
          if (canScrollY || canScrollX) return;
        }
        e.preventDefault();
        // Snap out of any button-driven tween — wheel takes over.
        cancelTween();
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const oldZoom = scaleRef.current;
        const k = e.ctrlKey ? PINCH_ZOOM_K : WHEEL_ZOOM_K;
        const factor = Math.exp(-e.deltaY * k);
        const newZoom = Math.max(
          ZOOM_MIN,
          Math.min(ZOOM_MAX, oldZoom * factor),
        );
        if (newZoom === oldZoom) return;
        const r = newZoom / oldZoom;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        // Cursor-anchored pan adjustment: pan_new = (m - c)(1 - r) + r * pan_old
        panRef.current = {
          x: dx * (1 - r) + r * panRef.current.x,
          y: dy * (1 - r) + r * panRef.current.y,
        };
        scaleRef.current = newZoom;
        applyTransform();
        onZoomChange?.(newZoom);
      };

      el.addEventListener("wheel", onWheel, { passive: false });
      return () => el.removeEventListener("wheel", onWheel);
    }, [applyTransform, cancelTween, onZoomChange]);

    useEffect(() => {
      setSizes((prev) => {
        const next = new Map(prev);
        let mutated = false;
        for (const w of widgets) {
          if (!next.has(w.id)) {
            next.set(w.id, naturalSize(w));
            mutated = true;
          }
        }
        for (const id of Array.from(next.keys())) {
          if (!widgets.some((w) => w.id === id)) {
            next.delete(id);
            mutated = true;
          }
        }
        return mutated ? next : prev;
      });
    }, [widgets]);

    useEffect(() => {
      setPositions((prev) => {
        const existingIds = new Set(widgets.map((w) => w.id));
        const filtered = new Map(
          Array.from(prev.entries()).filter(([id]) => existingIds.has(id)),
        );
        const needsPlacement = widgets.some((w) => !filtered.has(w.id));
        const removed = filtered.size !== prev.size;
        if (!needsPlacement && !removed) return prev;
        return autoLayout(widgets, sizes, containerWidth, filtered);
      });
      // Intentionally exclude `sizes` — placement only needs them for NEW
      // widgets, and a resize-driven sizes change must NOT relayout the
      // whole canvas.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [widgets, containerWidth]);

    const resetLayout = useCallback(() => {
      setPositions(autoLayout(widgets, sizes, containerWidth, new Map()));
    }, [widgets, sizes, containerWidth]);

    useImperativeHandle(ref, () => ({ resetLayout }), [resetLayout]);

    const handleMoveEnd = useCallback((id: string, nx: number, ny: number) => {
      setPositions((prev) => {
        const next = new Map(prev);
        next.set(id, { x: nx, y: ny });
        return next;
      });
    }, []);

    const handleResize = useCallback(
      (id: string, dx: number, dy: number) => {
        setSizes((prev) => {
          const next = new Map(prev);
          const cur =
            next.get(id) ??
            naturalSize(widgets.find((w) => w.id === id) ?? widgets[0]);
          next.set(id, clampSize({ w: cur.w + dx, h: cur.h + dy }));
          return next;
        });
      },
      [widgets],
    );

    useEffect(() => {
      if (typeof window === "undefined") return;
      const onKeyDown = (e: KeyboardEvent) => {
        const tag = (e.target as HTMLElement | null)?.tagName;
        const isEditable =
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          (e.target as HTMLElement | null)?.isContentEditable;
        if (e.key === " " && !isEditable) {
          e.preventDefault();
          setSpaceHeld(true);
        } else if (e.key === "Escape" && interactionRef.current?.mode === "marquee") {
          interactionRef.current = null;
          marqueeRef.current = null;
          updateMarqueeOverlay();
          setInteractionMode(null);
        }
      };
      const onKeyUp = (e: KeyboardEvent) => {
        if (e.key === " ") setSpaceHeld(false);
      };
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
      return () => {
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
      };
    }, [updateMarqueeOverlay]);

    useEffect(() => {
      if (interactionMode === null) return;
      const prev = document.body.style.userSelect;
      document.body.style.userSelect = "none";
      return () => {
        document.body.style.userSelect = prev;
      };
    }, [interactionMode]);

    const handleCanvasPointerDown = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        const onWidget = !!target.closest("[data-widget]");
        const isPan = e.button === 1 || (e.button === 0 && spaceHeld);
        // Middle-click pan must work everywhere — including on top of cards.
        // Left-click on a card is handled by the widget's own drag.
        if (onWidget && !isPan) return;
        if (!isPan && e.button !== 0) return;
        // Suppress browser default for middle-click (Chrome autoscroll cursor).
        if (e.button === 1) e.preventDefault();
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* not capturable */
        }
        interactionRef.current = {
          mode: isPan ? "pan" : "marquee",
          startClient: { x: e.clientX, y: e.clientY },
          startPan: { x: panRef.current.x, y: panRef.current.y },
          additive: e.shiftKey,
          moved: false,
          pointerId: e.pointerId,
        };
        setInteractionMode(isPan ? "pan" : "marquee");
        if (!isPan) {
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          marqueeRef.current = { x0: x, y0: y, x1: x, y1: y };
        } else {
          marqueeRef.current = null;
        }
        updateMarqueeOverlay();
      },
      [spaceHeld, updateMarqueeOverlay],
    );

    const handleCanvasPointerMove = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        const it = interactionRef.current;
        if (!it) return;
        const dx = e.clientX - it.startClient.x;
        const dy = e.clientY - it.startClient.y;
        const justMoved = !it.moved && dx * dx + dy * dy > 16;
        if (justMoved) {
          it.moved = true;
          updateMarqueeOverlay();
        }
        if (it.mode === "pan") {
          panRef.current = {
            x: it.startPan.x + dx,
            y: it.startPan.y + dy,
          };
          applyTransform();
          return;
        }
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
        const m = marqueeRef.current;
        if (m) {
          m.x1 = x;
          m.y1 = y;
          updateMarqueeOverlay();
        }
      },
      [applyTransform, updateMarqueeOverlay],
    );

    const finalizeMarquee = useCallback(
      (m: { x0: number; y0: number; x1: number; y1: number }, additive: boolean) => {
        const el = containerRef.current;
        if (!el || !onSelectItems) return;
        const cRect = el.getBoundingClientRect();
        const local = normRect(m);
        const screen: ScreenRect = {
          left: local.left + cRect.left,
          top: local.top + cRect.top,
          right: local.right + cRect.left,
          bottom: local.bottom + cRect.top,
        };
        const items: SelectedItem[] = [];
        const seen = new Set<string>();
        const widgetEls = el.querySelectorAll("[data-widget]");
        for (const wEl of Array.from(widgetEls)) {
          const wb = toScreenRect(wEl.getBoundingClientRect());
          if (!rectsIntersect(screen, wb)) continue;
          const marqueeInsideWidget = rectContains(wb, screen);
          if (marqueeInsideWidget) {
            const leaves = wEl.querySelectorAll("[data-selectable]");
            let added = 0;
            for (const leaf of Array.from(leaves)) {
              const lb = toScreenRect(leaf.getBoundingClientRect());
              if (!rectsIntersect(screen, lb)) continue;
              const item = parseLeafItem(leaf);
              if (item && !seen.has(item.uid)) {
                items.push(item);
                seen.add(item.uid);
                added++;
              }
            }
            if (added === 0) {
              const item = buildWidgetItem(wEl);
              if (item && !seen.has(item.uid)) {
                items.push(item);
                seen.add(item.uid);
              }
            }
          } else {
            const item = buildWidgetItem(wEl);
            if (item && !seen.has(item.uid)) {
              items.push(item);
              seen.add(item.uid);
            }
          }
        }
        onSelectItems(items, additive ? "add" : "replace");
      },
      [onSelectItems],
    );

    const handleCanvasPointerUp = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        const it = interactionRef.current;
        if (!it) return;
        try {
          containerRef.current?.releasePointerCapture(e.pointerId);
        } catch {
          /* not captured */
        }
        const m = marqueeRef.current;
        if (it.mode === "marquee" && m && it.moved) {
          finalizeMarquee(m, it.additive);
        }
        interactionRef.current = null;
        marqueeRef.current = null;
        updateMarqueeOverlay();
        setInteractionMode(null);
      },
      [finalizeMarquee, updateMarqueeOverlay],
    );

    const handleCanvasDoubleClick = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        if (target.closest("[data-widget]")) return;
        onSelectItems?.([], "replace");
      },
      [onSelectItems],
    );

    const rectsById = new Map<string, Rect>();
    for (const w of widgets) {
      const p = positions.get(w.id);
      const s = sizes.get(w.id) ?? naturalSize(w);
      if (!p) continue;
      rectsById.set(w.id, { x: p.x, y: p.y, w: s.w, h: s.h });
    }

    const isPanning = interactionMode === "pan";
    return (
      <div
        ref={containerRef}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onPointerCancel={handleCanvasPointerUp}
        onDoubleClick={handleCanvasDoubleClick}
        onContextMenu={(e) => {
          if (isPanning) e.preventDefault();
        }}
        className={cn(
          "absolute inset-0 overflow-hidden select-none",
          spaceHeld && "cursor-grab",
          isPanning && "cursor-grabbing",
          !isPanning && !spaceHeld && interactionMode === "marquee" &&
            "cursor-crosshair",
        )}
      >
        <div
          ref={transformElRef}
          className="absolute inset-0"
          style={{
            transformOrigin: "50% 50%",
            transform: `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${scaleRef.current})`,
          }}
        >
          <AnimatePresence>
            {widgets.map((w, i) => {
              const pos = positions.get(w.id);
              const size = sizes.get(w.id) ?? naturalSize(w);
              if (!pos) return null;
              const others: Rect[] = [];
              for (const [id, r] of rectsById) {
                if (id !== w.id) others.push(r);
              }
              return (
                <DraggableWidget
                  key={w.id}
                  widget={w}
                  position={pos}
                  size={size}
                  zoom={zoom}
                  others={others}
                  streamedSql={streamedSqlByIndex?.get(globalIndexOffset + i)}
                  selectedItems={selectedItems ?? []}
                  onMoveEnd={handleMoveEnd}
                  onResize={handleResize}
                  onRemove={onRemove}
                  onSelectItem={onSelectItem}
                />
              );
            })}
          </AnimatePresence>
        </div>
        <div
          ref={marqueeOverlayRef}
          className="pointer-events-none absolute z-40 rounded-md border border-sky-400/70 bg-sky-400/15 shadow-sm"
          style={{ display: "none", left: 0, top: 0, width: 0, height: 0 }}
        />
      </div>
    );
  },
);
