"use client";

import "./editorial.css";

import { forwardRef } from "react";
import { SpecRenderer } from "@/components/canvas/ChartRenderer";
import type {
  ChartCardData,
  ChartSpec,
  EditorialResponse,
} from "@/lib/api-types";
import { EditorialPage } from "./editorial-page";

interface EditorialDocumentProps {
  editorial: EditorialResponse;
  charts: ChartCardData[];
}

const EDITORIAL_BAR_MAX = 8;
const EDITORIAL_LINE_TARGET = 12;

/**
 * Slim a chart down for the narrow editorial column (~249px usable).
 *
 * - Categorical charts (bar, bar-stacked, pie, donut) with >8 rows →
 *   top 8 by the primary series' value.
 * - Time-series charts (line, area, area-stacked) with >12 rows →
 *   evenly-spaced downsample to ~12 points so the trend stays legible.
 * - Multi-panel → pass through (each sub-panel renders its own data).
 */
function transformSpecForEditorial(
  spec: ChartSpec,
  data: Array<Record<string, unknown>>,
): { spec: ChartSpec; data: Array<Record<string, unknown>> } {
  if (spec.chartType === "multi-panel") return { spec, data };

  const isTimeSeries =
    spec.chartType === "line" ||
    spec.chartType === "area" ||
    spec.chartType === "area-stacked";

  if (isTimeSeries) {
    if (data.length <= EDITORIAL_LINE_TARGET) return { spec, data };
    const step = Math.ceil(data.length / EDITORIAL_LINE_TARGET);
    const sampled = data.filter((_, i) => i % step === 0);
    // Always keep the last point so the trend's tail is preserved.
    const last = data[data.length - 1];
    if (last && sampled[sampled.length - 1] !== last) sampled.push(last);
    return { spec, data: sampled };
  }

  if (data.length <= EDITORIAL_BAR_MAX) return { spec, data };
  const sortKey = spec.config.series[0]?.dataKey;
  if (!sortKey) return { spec, data: data.slice(0, EDITORIAL_BAR_MAX) };
  const sorted = [...data].sort((a, b) => {
    const av = Number(a[sortKey] ?? 0);
    const bv = Number(b[sortKey] ?? 0);
    return bv - av;
  });
  return { spec, data: sorted.slice(0, EDITORIAL_BAR_MAX) };
}

export const EditorialDocument = forwardRef<HTMLDivElement, EditorialDocumentProps>(
  function EditorialDocument({ editorial, charts }, ref) {
    const chartById = new Map(charts.map((c) => [c.chartId, c]));

    // Page numbers: cover=1, contents=2, sections=3..N+2, colophon=N+3.
    const sectionPage = (sectionNumber: number) => sectionNumber + 2;

    return (
      <div ref={ref} className="editorial-root">
        {/* Page 1: Cover */}
        <EditorialPage variant="dark">
          <div className="flex h-full flex-col justify-between p-[80px]">
            <div className="editorial-cover-kicker">{editorial.kicker}</div>
            <div className="space-y-10">
              <h1 className="editorial-cover-title">{editorial.title}</h1>
              <p className="editorial-cover-dek">{editorial.dek}</p>
            </div>
            <div className="editorial-cover-kicker">
              APERTURE · ANALYTICS BRIEFING
            </div>
          </div>
        </EditorialPage>

        {/* Page 2: Contents */}
        <EditorialPage variant="light">
          <div className="flex h-full flex-col p-[80px]">
            <div className="editorial-cover-kicker mb-4">CONTENTS</div>
            <p className="editorial-contents-dek mb-10">{editorial.dek}</p>
            <hr className="editorial-section-hairline mb-12" />
            <ol className="editorial-contents-list list-none space-y-6">
              {editorial.sections.map((s) => (
                <li
                  key={s.number}
                  className="flex items-baseline justify-between gap-6"
                >
                  <div className="flex items-baseline">
                    <span className="editorial-contents-list-num">
                      {String(s.number).padStart(2, "0")}
                    </span>
                    <span>{s.headline}</span>
                  </div>
                  <span className="editorial-contents-page-num">
                    {String(sectionPage(s.number)).padStart(3, "0")}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </EditorialPage>

        {/* Pages 3..N+2: Section spreads */}
        {editorial.sections.map((section) => {
          const chart = chartById.get(section.chart_id);
          const { spec, data } = chart
            ? transformSpecForEditorial(chart.spec, chart.data)
            : { spec: null, data: [] };
          return (
            <EditorialPage key={section.number} variant="light">
              <div className="editorial-section">
                <div className="editorial-section-number">
                  {String(section.number).padStart(2, "0")}
                </div>

                <div className="editorial-section-left">
                  <div className="editorial-section-kicker">
                    {section.section_kicker}
                  </div>
                  <hr className="editorial-section-hairline" />
                  <h2 className="editorial-section-headline">
                    {section.headline}
                  </h2>
                  <p className="editorial-section-lede">{section.lede}</p>
                  <p className="editorial-section-body">{section.body}</p>

                  <div className="editorial-callout">
                    <div className="editorial-callout-label">INSIGHT</div>
                    <p className="editorial-callout-body">{section.insight}</p>
                  </div>
                </div>

                <div className="editorial-section-right">
                  <div className="editorial-kpi">
                    <div className="editorial-kpi-label">{section.kpi_label}</div>
                    <div className="editorial-kpi-value">{section.kpi_value}</div>
                  </div>
                  <div className="editorial-chart">
                    {chart && spec ? (
                      <SpecRenderer spec={spec} data={data} />
                    ) : (
                      <div className="text-sm opacity-50">Chart unavailable</div>
                    )}
                  </div>
                </div>
              </div>
            </EditorialPage>
          );
        })}

        {/* Page N+3: Methodology / colophon */}
        <EditorialPage variant="light">
          <div className="flex h-full flex-col justify-between p-[80px]">
            <div>
              <div className="editorial-cover-kicker mb-6">METHODOLOGY</div>
              <h2 className="editorial-colophon-title">Methodology</h2>
            </div>
            <div className="space-y-8">
              <hr className="editorial-section-hairline" />
              <p className="editorial-methodology">{editorial.methodology_note}</p>
            </div>
            <div className="space-y-3">
              <hr className="editorial-section-hairline" />
              <div className="editorial-colophon-imprint">
                APERTURE · ANALYTICS CANVAS
              </div>
              <div className="editorial-colophon-stamp">
                {editorial.colophon_stamp}
              </div>
            </div>
          </div>
        </EditorialPage>
      </div>
    );
  },
);
