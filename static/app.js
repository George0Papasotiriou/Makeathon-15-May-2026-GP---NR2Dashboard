/**
 * NR2Dashboard — Dynamic Bento Box Frontend
 * Handles command bar, API calls, ECharts rendering, and grid management.
 */

// ═══════════════════════════════════════════════════════════════
// Chart color palette — neon-pastels on dark
// ═══════════════════════════════════════════════════════════════
const CHART_COLORS = [
  '#818cf8', '#34d399', '#fb7185', '#fbbf24',
  '#22d3ee', '#f472b6', '#a78bfa', '#60a5fa',
  '#e879f9', '#4ade80', '#f97316', '#38bdf8',
];

const GRADIENT_PAIRS = [
  ['#818cf8', '#6366f1'],
  ['#34d399', '#10b981'],
  ['#fb7185', '#f43f5e'],
  ['#fbbf24', '#f59e0b'],
  ['#22d3ee', '#06b6d4'],
  ['#f472b6', '#ec4899'],
];

// ═══════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════
const state = {
  widgets: [],
  conversationHistory: [],
  isLoading: false,
  chartInstances: {},
};

// ═══════════════════════════════════════════════════════════════
// DOM refs
// ═══════════════════════════════════════════════════════════════
const queryInput = document.getElementById('query-input');
const submitBtn = document.getElementById('submit-btn');
const bentoGrid = document.getElementById('bento-grid');
const heroSection = document.getElementById('hero');
const loadingOverlay = document.getElementById('loading');
const widgetCountEl = document.getElementById('widget-count');
const suggestionsEl = document.getElementById('suggestions');

// ═══════════════════════════════════════════════════════════════
// Event Listeners
// ═══════════════════════════════════════════════════════════════
queryInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submitQuery();
  }
});

submitBtn.addEventListener('click', submitQuery);

// Suggestion pills
document.querySelectorAll('.suggestion-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    queryInput.value = pill.dataset.query;
    submitQuery();
  });
});

// Keyboard shortcut: Ctrl+K or Cmd+K to focus
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    queryInput.focus();
    queryInput.select();
  }
});

// Resize handler for charts
window.addEventListener('resize', () => {
  Object.values(state.chartInstances).forEach(chart => {
    if (chart && !chart.isDisposed()) chart.resize();
  });
});

// ═══════════════════════════════════════════════════════════════
// Core: Submit Query
// ═══════════════════════════════════════════════════════════════
async function submitQuery() {
  const question = queryInput.value.trim();
  if (!question || state.isLoading) return;

  state.isLoading = true;
  showLoading(true);
  submitBtn.disabled = true;

  try {
    const response = await fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        conversation_history: state.conversationHistory.slice(-5),
      }),
    });

    const data = await response.json();

    if (data.error) {
      showError(data.error);
      return;
    }

    if (data.widgets && data.widgets.length > 0) {
      // Add to conversation history
      state.conversationHistory.push(
        { role: 'user', content: question },
        { role: 'assistant', content: data.widgets.map(w => w.explanation).join('. ') }
      );

      // Compact the hero after first query
      heroSection.classList.add('compact');
      suggestionsEl.style.display = 'none';

      // Render widgets with staggered animation
      data.widgets.forEach((widget, idx) => {
        setTimeout(() => addWidget(widget), idx * 150);
      });

      // Clear input
      queryInput.value = '';
    }

  } catch (err) {
    console.error('Query failed:', err);
    showError('Failed to connect to the server. Is it running?');
  } finally {
    state.isLoading = false;
    showLoading(false);
    submitBtn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════════
// Widget Management
// ═══════════════════════════════════════════════════════════════
function addWidget(widgetData) {
  const tile = document.createElement('div');
  tile.className = 'widget-tile';
  tile.dataset.size = widgetData.chart.size || '2x1';
  tile.dataset.id = widgetData.id;
  tile.style.animationDelay = `${state.widgets.length * 0.05}s`;

  const chartId = `chart-${widgetData.id}`;

  tile.innerHTML = `
    <div class="widget-header">
      <div class="widget-title-group">
        <div class="widget-title">${escapeHtml(widgetData.chart.title)}</div>
        ${widgetData.chart.subtitle ? `<div class="widget-subtitle">${escapeHtml(widgetData.chart.subtitle)}</div>` : ''}
      </div>
      <div class="widget-actions">
        ${widgetData.latency_ms ? `<span class="widget-latency">${widgetData.latency_ms}ms</span>` : ''}
        <button class="widget-action-btn" onclick="removeWidget('${widgetData.id}')" title="Remove">✕</button>
      </div>
    </div>
    <div class="widget-body">
      ${widgetData.chart.type === 'kpi'
        ? renderKPI(widgetData)
        : widgetData.chart.type === 'table'
          ? renderTable(widgetData)
          : `<div class="chart-container" id="${chartId}"></div>`
      }
    </div>
    <div class="widget-footer">
      <div class="widget-explanation">${escapeHtml(widgetData.explanation)}</div>
      ${widgetData.sql ? `<button class="widget-sql-toggle" onclick="toggleSQL('${widgetData.id}')">SQL</button>` : ''}
    </div>
    ${widgetData.sql ? `
      <div class="sql-display" id="sql-${widgetData.id}">
        <div class="sql-code">${escapeHtml(widgetData.sql)}</div>
      </div>
    ` : ''}
    ${widgetData.follow_up ? `
      <div class="follow-up-hint">
        <button class="follow-up-btn" onclick="askFollowUp('${escapeHtml(widgetData.follow_up).replace(/'/g, "\\'")}')">
          💡 ${escapeHtml(widgetData.follow_up)}
        </button>
      </div>
    ` : ''}
  `;

  bentoGrid.prepend(tile);
  state.widgets.push(widgetData);
  updateWidgetCount();

  // Render chart after DOM insert
  if (widgetData.chart.type !== 'kpi' && widgetData.chart.type !== 'table' && widgetData.data.length > 0) {
    requestAnimationFrame(() => {
      renderChart(chartId, widgetData);
    });
  }
}

function removeWidget(id) {
  const tile = document.querySelector(`.widget-tile[data-id="${id}"]`);
  if (tile) {
    tile.style.transition = 'all 0.3s ease';
    tile.style.opacity = '0';
    tile.style.transform = 'scale(0.9)';
    setTimeout(() => {
      tile.remove();
      // Dispose ECharts instance
      if (state.chartInstances[`chart-${id}`]) {
        state.chartInstances[`chart-${id}`].dispose();
        delete state.chartInstances[`chart-${id}`];
      }
      state.widgets = state.widgets.filter(w => w.id !== id);
      updateWidgetCount();
      if (state.widgets.length === 0) {
        heroSection.classList.remove('compact');
      }
    }, 300);
  }
}

function toggleSQL(id) {
  const sqlEl = document.getElementById(`sql-${id}`);
  if (sqlEl) sqlEl.classList.toggle('visible');
}

function askFollowUp(question) {
  queryInput.value = question;
  queryInput.focus();
  submitQuery();
}

function updateWidgetCount() {
  const count = state.widgets.length;
  widgetCountEl.textContent = `${count} widget${count !== 1 ? 's' : ''}`;
  const clearBtn = document.getElementById('clear-btn');
  if (clearBtn) clearBtn.style.display = count > 0 ? 'inline-block' : 'none';
}

function clearAll() {
  // Dispose all chart instances
  Object.values(state.chartInstances).forEach(chart => {
    if (chart && !chart.isDisposed()) chart.dispose();
  });
  state.chartInstances = {};
  state.widgets = [];
  state.conversationHistory = [];
  bentoGrid.innerHTML = '';
  heroSection.classList.remove('compact');
  suggestionsEl.style.display = '';
  updateWidgetCount();
  queryInput.focus();
}

// ═══════════════════════════════════════════════════════════════
// Chart Rendering (ECharts)
// ═══════════════════════════════════════════════════════════════
function renderChart(containerId, widgetData) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Auto-detect single-value results → render as KPI instead of chart
  if (widgetData.data.length === 1 && widgetData.columns.length <= 2) {
    const row = widgetData.data[0];
    const val = Object.values(row)[0];
    container.innerHTML = renderKPI(widgetData);
    container.closest('.widget-tile').dataset.size = '1x1';
    return;
  }

  // Set explicit height
  const tile = container.closest('.widget-tile');
  const size = tile?.dataset.size || '2x1';
  const heights = { '1x1': 130, '2x1': 240, '1x2': 130, '2x2': 300 };
  container.style.height = (heights[size] || 240) + 'px';

  const chart = echarts.init(container, null, { renderer: 'canvas' });
  state.chartInstances[containerId] = chart;

  const { type } = widgetData.chart;
  const data = widgetData.data;
  let option;

  switch (type) {
    case 'bar':
      option = buildBarChart(widgetData);
      break;
    case 'line':
      option = buildLineChart(widgetData);
      break;
    case 'area':
      option = buildAreaChart(widgetData);
      break;
    case 'pie':
      option = buildPieChart(widgetData);
      break;
    default:
      option = buildBarChart(widgetData);
  }

  chart.setOption(option, true);
}

function getAxisFields(widgetData) {
  const { chart, data, columns } = widgetData;
  // Use LLM-specified fields, or auto-detect from columns
  let xField = chart.x_field || chart.label_field || columns[0];
  let yField = chart.y_field || chart.value_field || columns[1];
  let seriesField = chart.series_field || null;

  // Validate fields exist in data
  if (data.length > 0) {
    const keys = Object.keys(data[0]);
    if (!keys.includes(xField)) xField = keys[0];
    if (!keys.includes(yField)) yField = keys.length > 1 ? keys[1] : keys[0];
    if (seriesField && !keys.includes(seriesField)) seriesField = null;
  }

  return { xField, yField, seriesField };
}

// --- Dark theme defaults for all charts ---
function baseChartOptions() {
  return {
    backgroundColor: 'transparent',
    textStyle: { fontFamily: 'Inter, sans-serif', color: '#9898b0' },
    animation: true,
    animationDuration: 800,
    animationEasing: 'cubicOut',
    grid: {
      left: 12, right: 12, top: 24, bottom: 8,
      containLabel: true,
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(14, 14, 24, 0.95)',
      borderColor: 'rgba(255, 255, 255, 0.08)',
      borderWidth: 1,
      textStyle: { color: '#eeeef2', fontSize: 12, fontFamily: 'Inter, sans-serif' },
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(129, 140, 248, 0.06)' } },
    },
  };
}

function styledAxis() {
  return {
    axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.06)' } },
    axisTick: { show: false },
    axisLabel: { color: '#9898b0', fontSize: 11, fontFamily: 'Inter, sans-serif' },
    splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.04)', type: 'dashed' } },
  };
}

// --- BAR CHART ---
function buildBarChart(widgetData) {
  const { xField, yField, seriesField } = getAxisFields(widgetData);
  const data = widgetData.data;

  if (seriesField) {
    return buildGroupedBarChart(widgetData, xField, yField, seriesField);
  }

  const categories = data.map(d => formatLabel(d[xField]));
  const values = data.map(d => Number(d[yField]) || 0);

  // Determine if horizontal bar is better (many categories)
  const horizontal = categories.length > 8;

  return {
    ...baseChartOptions(),
    xAxis: {
      type: horizontal ? 'value' : 'category',
      data: horizontal ? undefined : categories,
      ...styledAxis(),
      axisLabel: { ...styledAxis().axisLabel, rotate: horizontal ? 0 : (categories.length > 6 ? 35 : 0) },
    },
    yAxis: {
      type: horizontal ? 'category' : 'value',
      data: horizontal ? categories : undefined,
      ...styledAxis(),
    },
    series: [{
      type: 'bar',
      data: values.map((v, i) => ({
        value: v,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: CHART_COLORS[i % CHART_COLORS.length] },
            { offset: 1, color: CHART_COLORS[i % CHART_COLORS.length] + '88' },
          ]),
          borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0],
        },
      })),
      barMaxWidth: 40,
      emphasis: {
        itemStyle: { shadowBlur: 10, shadowColor: 'rgba(129, 140, 248, 0.3)' },
      },
    }],
  };
}

function buildGroupedBarChart(widgetData, xField, yField, seriesField) {
  const data = widgetData.data;
  const categories = [...new Set(data.map(d => formatLabel(d[xField])))];
  const seriesValues = [...new Set(data.map(d => d[seriesField]))];

  const series = seriesValues.map((sv, si) => ({
    name: formatLabel(sv),
    type: 'bar',
    data: categories.map(cat => {
      const row = data.find(d => formatLabel(d[xField]) === cat && d[seriesField] === sv);
      return row ? Number(row[yField]) || 0 : 0;
    }),
    itemStyle: {
      color: CHART_COLORS[si % CHART_COLORS.length],
      borderRadius: [4, 4, 0, 0],
    },
    barMaxWidth: 30,
  }));

  return {
    ...baseChartOptions(),
    legend: {
      show: true, top: 0, right: 0,
      textStyle: { color: '#9898b0', fontSize: 11 },
    },
    xAxis: { type: 'category', data: categories, ...styledAxis() },
    yAxis: { type: 'value', ...styledAxis() },
    series,
  };
}

// --- LINE CHART ---
function buildLineChart(widgetData) {
  const { xField, yField, seriesField } = getAxisFields(widgetData);
  const data = widgetData.data;

  if (seriesField) {
    return buildMultiLineChart(widgetData, xField, yField, seriesField);
  }

  const categories = data.map(d => formatLabel(d[xField]));
  const values = data.map(d => Number(d[yField]) || 0);

  return {
    ...baseChartOptions(),
    xAxis: {
      type: 'category', data: categories, ...styledAxis(),
      axisLabel: { ...styledAxis().axisLabel, rotate: categories.length > 15 ? 45 : 0 },
    },
    yAxis: { type: 'value', ...styledAxis() },
    series: [{
      type: 'line',
      data: values,
      smooth: true,
      symbol: 'circle',
      symbolSize: categories.length > 30 ? 0 : 6,
      lineStyle: { width: 2.5, color: CHART_COLORS[0] },
      itemStyle: { color: CHART_COLORS[0] },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: CHART_COLORS[0] + '30' },
          { offset: 1, color: CHART_COLORS[0] + '05' },
        ]),
      },
    }],
  };
}

function buildMultiLineChart(widgetData, xField, yField, seriesField) {
  const data = widgetData.data;
  const categories = [...new Set(data.map(d => formatLabel(d[xField])))];
  const seriesValues = [...new Set(data.map(d => d[seriesField]))];

  const series = seriesValues.map((sv, si) => ({
    name: formatLabel(sv),
    type: 'line',
    smooth: true,
    symbol: 'circle',
    symbolSize: categories.length > 30 ? 0 : 5,
    data: categories.map(cat => {
      const row = data.find(d => formatLabel(d[xField]) === cat && d[seriesField] === sv);
      return row ? Number(row[yField]) || 0 : 0;
    }),
    lineStyle: { width: 2, color: CHART_COLORS[si % CHART_COLORS.length] },
    itemStyle: { color: CHART_COLORS[si % CHART_COLORS.length] },
  }));

  return {
    ...baseChartOptions(),
    legend: { show: true, top: 0, right: 0, textStyle: { color: '#9898b0', fontSize: 11 } },
    xAxis: { type: 'category', data: categories, ...styledAxis() },
    yAxis: { type: 'value', ...styledAxis() },
    series,
  };
}

// --- AREA CHART ---
function buildAreaChart(widgetData) {
  const option = buildLineChart(widgetData);
  if (option.series) {
    option.series.forEach((s, i) => {
      s.areaStyle = {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: CHART_COLORS[i % CHART_COLORS.length] + '40' },
          { offset: 1, color: CHART_COLORS[i % CHART_COLORS.length] + '05' },
        ]),
      };
    });
  }
  return option;
}

// --- PIE CHART ---
function buildPieChart(widgetData) {
  const { data, columns, chart } = widgetData;
  const labelField = chart.label_field || chart.x_field || columns[0];
  const valueField = chart.value_field || chart.y_field || columns[1] || columns[0];

  const pieData = data.map((d, i) => ({
    name: formatLabel(d[labelField]),
    value: Number(d[valueField]) || 0,
    itemStyle: {
      color: CHART_COLORS[i % CHART_COLORS.length],
      borderColor: '#0e0e18',
      borderWidth: 2,
    },
  }));

  return {
    ...baseChartOptions(),
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(14, 14, 24, 0.95)',
      borderColor: 'rgba(255, 255, 255, 0.08)',
      textStyle: { color: '#eeeef2', fontSize: 12 },
      formatter: '{b}: {c} ({d}%)',
    },
    series: [{
      type: 'pie',
      radius: ['42%', '72%'],
      center: ['50%', '55%'],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 6 },
      label: {
        show: true,
        color: '#9898b0',
        fontSize: 11,
        formatter: '{b}\n{d}%',
      },
      labelLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
      emphasis: {
        label: { show: true, fontSize: 13, fontWeight: '600' },
        itemStyle: { shadowBlur: 20, shadowColor: 'rgba(0, 0, 0, 0.4)' },
      },
      data: pieData,
    }],
  };
}

// ═══════════════════════════════════════════════════════════════
// KPI & Table Renderers (HTML-based)
// ═══════════════════════════════════════════════════════════════
function renderKPI(widgetData) {
  const data = widgetData.data;
  if (!data || data.length === 0) {
    return `<div class="kpi-display"><div class="kpi-value">—</div></div>`;
  }

  const row = data[0];
  const columns = widgetData.columns;
  const allValues = Object.values(row);

  // Try to find the value: explicit field → y_field → first numeric value → first value
  let valueKey = widgetData.chart.value_field || widgetData.chart.y_field;
  let value;

  if (valueKey && row[valueKey] !== undefined) {
    value = row[valueKey];
  } else {
    // Fallback: find first numeric value in the row
    const numericEntry = Object.entries(row).find(([k, v]) => typeof v === 'number');
    if (numericEntry) {
      valueKey = numericEntry[0];
      value = numericEntry[1];
    } else {
      // Last resort: try to parse first value as number
      valueKey = columns[0];
      value = allValues[0];
      const parsed = Number(value);
      if (!isNaN(parsed)) value = parsed;
    }
  }

  let unit = '';

  // Detect unit from column name
  const keyLower = (valueKey || '').toLowerCase();
  if (keyLower.includes('rate') || keyLower.includes('percent') || keyLower.includes('ποσοστ')) unit = '%';
  else if (keyLower.includes('csat') || keyLower.includes('score')) unit = '/ 5';
  else if (keyLower.includes('cost') || keyLower.includes('amount') || keyLower.includes('κόστος')) unit = '€';
  else if (keyLower.includes('duration') || keyLower.includes('time') || keyLower.includes('aht') || keyLower.includes('seconds') || keyLower.includes('secs')) unit = 's';

  // Format the value
  if (value === null || value === undefined) value = '—';
  else if (typeof value === 'number') {
    if (value >= 1000000) value = (value / 1000000).toFixed(1) + 'M';
    else if (value >= 10000) value = (value / 1000).toFixed(1) + 'K';
    else if (value % 1 !== 0) value = value.toFixed(value < 10 ? 2 : 1);
  }

  // Find a secondary metric if available
  let secondary = '';
  if (columns.length > 1) {
    const secKey = columns.find(c => c !== valueKey);
    if (secKey && row[secKey] !== undefined) {
      secondary = `<div class="kpi-unit">${formatLabel(secKey)}: ${row[secKey]}</div>`;
    }
  }

  // Show unit as suffix
  const unitHtml = unit ? `<span style="font-size:0.9rem;color:#9898b0;margin-left:4px;">${unit}</span>` : '';

  return `
    <div class="kpi-display">
      <div class="kpi-value">${value}${unitHtml}</div>
      ${secondary || (widgetData.chart.subtitle ? `<div class="kpi-unit">${escapeHtml(widgetData.chart.subtitle)}</div>` : `<div class="kpi-unit">${formatLabel(valueKey)}</div>`)}
    </div>
  `;
}

function renderTable(widgetData) {
  const { data, columns } = widgetData;
  if (!data || data.length === 0) return '<div class="kpi-display"><div class="kpi-unit">No data</div></div>';

  let html = '<div style="width:100%;overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:0.75rem;">';
  html += '<thead><tr>';
  columns.forEach(col => {
    html += `<th style="text-align:left;padding:8px 10px;color:#9898b0;font-weight:600;border-bottom:1px solid rgba(255,255,255,0.06);white-space:nowrap;">${formatLabel(col)}</th>`;
  });
  html += '</tr></thead><tbody>';

  data.slice(0, 20).forEach((row, ri) => {
    html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.03);">`;
    columns.forEach(col => {
      const val = row[col] !== null && row[col] !== undefined ? row[col] : '—';
      html += `<td style="padding:7px 10px;color:#eeeef2;white-space:nowrap;">${escapeHtml(String(val))}</td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table></div>';
  if (data.length > 20) html += `<div style="padding:4px 10px;font-size:0.68rem;color:#5a5a72;">Showing 20 of ${data.length} rows</div>`;
  return html;
}

// ═══════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════
function formatLabel(val) {
  if (val === null || val === undefined) return '—';
  const s = String(val);
  // Format dates: trim time part
  if (s.match(/^\d{4}-\d{2}-\d{2}T/)) return s.split('T')[0];
  if (s.match(/^\d{4}-\d{2}-\d{2}$/)) return s;
  // Capitalize underscored names
  if (s.includes('_')) return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return s;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showLoading(visible) {
  loadingOverlay.classList.toggle('visible', visible);
}

function showError(message) {
  // Remove existing toasts
  document.querySelectorAll('.error-toast').forEach(t => t.remove());

  const toast = document.createElement('div');
  toast.className = 'error-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

// ═══════════════════════════════════════════════════════════════
// Demo Loader (works without API key)
// ═══════════════════════════════════════════════════════════════
async function loadDemo() {
  if (state.isLoading) return;
  state.isLoading = true;
  showLoading(true);

  try {
    const response = await fetch('/api/demo');
    const data = await response.json();

    if (data.error) {
      showError(data.error);
      return;
    }

    if (data.widgets && data.widgets.length > 0) {
      heroSection.classList.add('compact');
      data.widgets.forEach((widget, idx) => {
        setTimeout(() => {
          addWidget(widget);
          updateWidgetCount();
        }, idx * 200);
      });
    }
  } catch (err) {
    console.error('Demo load failed:', err);
    showError('Failed to load demo data.');
  } finally {
    state.isLoading = false;
    showLoading(false);
  }
}

// ═══════════════════════════════════════════════════════════════
// Init
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  queryInput.focus();
  console.log('🚀 LARPGODS NR2Dashboard initialized — ask your data anything.');
  console.log('💡 Tip: Call loadDemo() in console to see charts without API key.');
});
