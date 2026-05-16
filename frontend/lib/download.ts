import { domToPng } from "modern-screenshot";
import { createLogger } from "@/lib/logger";

const log = createLogger("download");

/**
 * Slugify text for filenames: NFD normalize, strip diacritics +
 * non-alphanumerics, lowercase, collapse whitespace to single hyphens,
 * cap at 60 chars. Falls back to "chart" if everything strips out
 * (e.g., an entirely Greek title).
 */
export function slugify(input: string): string {
  const normalized = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return normalized || "chart";
}

/** ISO timestamp safe for filenames (colons + dots → hyphens). */
export function isoTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

/**
 * Capture a DOM element to PNG and trigger a browser download.
 *
 * Uses modern-screenshot which renders via SVG <foreignObject> + the
 * browser's native layout engine. Transforms, perspective, oklch(),
 * color-mix(), and backdrop-filter all work without special handling —
 * no DOM walking, no ancestor style resets.
 *
 * Resolves the element's computed background color so the captured PNG
 * matches the active theme (light or dark).
 */
export async function downloadElementAsPNG(
  element: HTMLElement,
  baseFilename: string,
): Promise<void> {
  const slug = slugify(baseFilename);
  const filename = `aperture-${slug}-${isoTimestamp()}.png`;

  const computedBg = window.getComputedStyle(element).backgroundColor;
  const backgroundColor =
    computedBg && computedBg !== "rgba(0, 0, 0, 0)" ? computedBg : "#ffffff";

  log.info("Starting PNG capture", { filename, backgroundColor });

  try {
    const dataUrl = await domToPng(element, {
      backgroundColor,
      scale: 2,
      filter: (node) => {
        if (!(node instanceof HTMLElement)) return true;
        if (node.dataset.html2canvasIgnore !== undefined) return false;
        if (node.dataset.screenshotIgnore !== undefined) return false;
        return true;
      },
    });

    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    log.info("PNG download triggered", { filename, scale: 2 });
  } catch (error) {
    log.error("PNG capture failed", { filename, error: String(error) });
    throw error;
  }
}
