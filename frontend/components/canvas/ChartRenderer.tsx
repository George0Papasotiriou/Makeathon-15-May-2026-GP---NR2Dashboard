"use client";

import { AreaChart } from "@/components/charts/AreaChart";
import { BarChart } from "@/components/charts/BarChart";
import { BoxPlot } from "@/components/charts/BoxPlot";
import { ComboChart } from "@/components/charts/ComboChart";
import { DataTable } from "@/components/charts/DataTable";
import { FunnelChart } from "@/components/charts/FunnelChart";
import { GaugeChart } from "@/components/charts/GaugeChart";
import { Heatmap } from "@/components/charts/Heatmap";
import { Histogram } from "@/components/charts/Histogram";
import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { KPICard } from "@/components/charts/KPICard";
import { LineChart } from "@/components/charts/LineChart";
import { PieChart } from "@/components/charts/PieChart";
import { RadarChart } from "@/components/charts/RadarChart";
import { SparklineKPI } from "@/components/charts/SparklineKPI";
import { Treemap } from "@/components/charts/Treemap";
import { WaterfallChart } from "@/components/charts/WaterfallChart";
import type { ChartSpec, SelectedItem, WidgetData } from "@/lib/api-types";

type Props = {
  widget: WidgetData;
  selectedItems?: SelectedItem[];
  onSelectItem?: (item: SelectedItem) => void;
};

export function ChartRenderer({
  widget,
  selectedItems,
  onSelectItem,
}: Props) {
  return (
    <SpecRenderer
      spec={widget.spec}
      data={widget.data}
      columns={widget.columns}
      widgetId={widget.id}
      widgetTitle={widget.spec.title}
      selectedItems={selectedItems}
      onSelectItem={onSelectItem}
      panelData={widget.panelData}
    />
  );
}

type SpecProps = {
  spec: ChartSpec;
  data: Array<Record<string, unknown>>;
  columns?: string[];
  widgetId?: string;
  widgetTitle?: string;
  selectedItems?: SelectedItem[];
  onSelectItem?: (item: SelectedItem) => void;
  panelData?: Array<Array<Record<string, unknown>>>;
};

export function SpecRenderer({
  spec,
  data,
  columns: columnsProp,
  widgetId: widgetIdProp,
  widgetTitle: widgetTitleProp,
  selectedItems,
  onSelectItem,
  panelData,
}: SpecProps) {
  const columns = columnsProp ?? (data[0] ? Object.keys(data[0]) : []);
  const widgetId = widgetIdProp ?? "spec";
  const widgetTitle = widgetTitleProp ?? spec.title;
  const common = { widgetId, widgetTitle, selectedItems, onSelectItem };

  switch (spec.chartType) {
    case "bar":
      return <BarChart spec={spec} data={data} {...common} />;
    case "bar-stacked":
      return <BarChart spec={spec} data={data} stacked {...common} />;
    case "horizontal-bar":
      return <HorizontalBarChart spec={spec} data={data} {...common} />;
    case "histogram":
      return <Histogram spec={spec} data={data} {...common} />;
    case "line":
      return <LineChart spec={spec} data={data} />;
    case "area":
      return <AreaChart spec={spec} data={data} />;
    case "area-stacked":
      return <AreaChart spec={spec} data={data} stacked />;
    case "combo":
      return <ComboChart spec={spec} data={data} />;
    case "pie":
      return <PieChart spec={spec} data={data} {...common} />;
    case "treemap":
      return <Treemap spec={spec} data={data} {...common} />;
    case "kpi":
      return <KPICard spec={spec} data={data} {...common} />;
    case "sparkline-kpi":
      return <SparklineKPI spec={spec} data={data} {...common} />;
    case "gauge":
      return <GaugeChart spec={spec} data={data} />;
    case "box-plot":
      return <BoxPlot spec={spec} data={data} />;
    case "heatmap":
      return <Heatmap spec={spec} data={data} {...common} />;
    case "funnel":
      return <FunnelChart spec={spec} data={data} {...common} />;
    case "radar":
      return <RadarChart spec={spec} data={data} />;
    case "waterfall":
      return <WaterfallChart spec={spec} data={data} />;
    case "table":
      return <DataTable columns={columns} data={data} {...common} />;
    case "multi-panel": {
      const panels = spec.config.panels ?? [];
      if (panels.length === 0) {
        return (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Empty multi-panel.
          </div>
        );
      }
      return (
        <div className="grid h-full grid-cols-1 gap-3 overflow-auto md:grid-cols-2">
          {panels.map((p, i) => {
            const subData = panelData?.[i] ?? data;
            const subColumns = subData[0] ? Object.keys(subData[0]) : [];
            return (
              <div
                key={i}
                className="flex min-h-0 flex-col rounded-md border border-border/40 bg-card/40 p-2"
              >
                <div className="mb-1 truncate text-xs font-medium text-muted-foreground">
                  {p.title}
                </div>
                <div className="min-h-0 flex-1">
                  <SpecRenderer
                    spec={p}
                    data={subData}
                    columns={subColumns}
                    widgetId={`${widgetId}:panel-${i}`}
                    widgetTitle={p.title}
                    selectedItems={selectedItems}
                    onSelectItem={onSelectItem}
                  />
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    default:
      return (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Unsupported chart type: {spec.chartType}
        </div>
      );
  }
}
