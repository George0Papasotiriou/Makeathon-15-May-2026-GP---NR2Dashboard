import { jsPDF } from "jspdf";
import { domToPng } from "modern-screenshot";
import { createLogger } from "@/lib/logger";

const log = createLogger("pdf-export");

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

/**
 * Convert an .editorial-root element into a multi-page A4 PDF.
 *
 * Each child `[data-editorial-page]` becomes one PDF page. We rasterize
 * each page to PNG at 2× DPI via modern-screenshot, then composite into
 * jsPDF at A4 dimensions (210mm × 297mm).
 *
 * modern-screenshot handles oklch + color-mix + transformed parents
 * natively (the editorial overlay scales the document for preview;
 * capture still reads the layout-size DOM correctly).
 */
export async function generateEditorialPDF(
  documentEl: HTMLDivElement,
  filename: string,
): Promise<void> {
  const pages = documentEl.querySelectorAll<HTMLDivElement>(
    "[data-editorial-page]",
  );
  if (pages.length === 0) {
    throw new Error("No editorial pages found");
  }

  log.info("PDF generation starting", { pageCount: pages.length });

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  for (let i = 0; i < pages.length; i++) {
    const pageEl = pages[i];
    if (!pageEl) continue;

    const background = pageEl.classList.contains("editorial-page--dark")
      ? "#0a0a0a"
      : "#fafaf7";

    const dataUrl = await domToPng(pageEl, {
      scale: 2,
      width: 794,
      height: 1123,
      backgroundColor: background,
      style: {
        zoom: "1",
        transform: "none",
        transformOrigin: "top left",
      },
    });

    if (i > 0) pdf.addPage();
    pdf.addImage(dataUrl, "PNG", 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM);

    log.info("PDF page rendered", { pageIndex: i, total: pages.length });
  }

  pdf.save(filename);
  log.info("PDF generation complete", { filename, pageCount: pages.length });
}
