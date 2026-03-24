import { createDatasusWizard } from '../../assets/js/datasus-wizard.js';
import {
  deriveCorrelationPairs,
  getMetricOptions,
  getPrimaryMetricKey,
  getTimeOptions
} from '../../assets/js/datasus-normalizer.js';
import {
  buildRecognizedColumnsChips,
  describeIgnoredRowReason,
  normalizeTabularSpaces,
  parseTabularNumber,
  readTabularFileState,
  readTabularPasteState
} from '../../assets/js/tabular-data-input.js';

const CORRELATION_EMPTY_TEMPLATE_URL = new URL('./templates/modelo-correlacao-vazio.csv', import.meta.url).href;
const CORRELATION_FILLED_TEMPLATE_URL = new URL('./templates/modelo-correlacao-exemplo.csv', import.meta.url).href;
const CORRELATION_FORMAT_LABEL = 'id;variavel_x;variavel_y;observacao_opcional';
const CORRELATION_HEADER_ALIASES = {
  id: ['id', 'unidade', 'uf', 'nome', 'rotulo', 'rotulo', 'identificador'],
  variavel_x: ['variavel_x', 'variavel x', 'x', 'grupo_x'],
  variavel_y: ['variavel_y', 'variavel y', 'y', 'grupo_y'],
  observacao_opcional: ['observacao', 'observacao opcional', 'obs', 'comentario', 'comentario opcional']
};
const CORRELATION_RECOGNIZED_ORDER = [
  { key: 'id', label: 'id' },
  { key: 'variavel_x', label: 'variavel_x' },
  { key: 'variavel_y', label: 'variavel_y' },
  { key: 'observacao_opcional', label: 'observacao_opcional' }
];
const CORRELATION_EXAMPLE_ROWS = [
  ['Rondonia', '12,3', '45,2', ''],
  ['Acre', '14,1', '43,8', ''],
  ['Amazonas', '10,9', '48,0', ''],
  ['Roraima', '13,7', '44,1', '']
];
const CORRELATION_EXAMPLE_TEXT = [
  CORRELATION_FORMAT_LABEL,
  ...CORRELATION_EXAMPLE_ROWS.map(row => row.join(';'))
].join('\n');
const CORRELATION_BOUND_EVENTS = Symbol('correlation-bound-events');

function clonePlain(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

function outlierMask(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const low = q1 - 1.5 * iqr;
  const high = q3 + 1.5 * iqr;
  return values.map(v => v < low || v > high);
}

function classifyStrength(coef) {
  const abs = Math.abs(coef);
  if (abs < 0.1) return 'muito fraca';
  if (abs < 0.3) return 'fraca';
  if (abs < 0.5) return 'moderada';
  if (abs < 0.7) return 'forte';
  return 'muito forte';
}

function classifyDirection(coef) {
  if (Math.abs(coef) < 0.1) return 'ausente ou muito pequena';
  if (coef > 0) return 'positiva';
  return 'negativa';
}

function buildScatterSvg(dataset, pearson, outlierFlags, utils) {
  const width = 880;
  const height = 460;
  const margin = { top: 24, right: 24, bottom: 68, left: 82 };
  const minX = Math.min(...dataset.x);
  const maxX = Math.max(...dataset.x);
  const minY = Math.min(...dataset.y);
  const maxY = Math.max(...dataset.y);
  const xPad = (maxX - minX || 1) * 0.08;
  const yPad = (maxY - minY || 1) * 0.1;
  const px = v => margin.left + ((v - (minX - xPad)) / ((maxX - minX) + xPad * 2 || 1)) * (width - margin.left - margin.right);
  const py = v => height - margin.bottom - ((v - (minY - yPad)) / ((maxY - minY) + yPad * 2 || 1)) * (height - margin.top - margin.bottom);

  const x1 = minX - xPad;
  const x2 = maxX + xPad;
  const y1 = pearson.intercept + pearson.slope * x1;
  const y2 = pearson.intercept + pearson.slope * x2;

  const points = dataset.x.map((xv, i) => {
    const yv = dataset.y[i];
    const isOutlier = outlierFlags[i];
    const fill = isOutlier ? '#f97316' : '#2563eb';
    const label = dataset.hasIdentifier ? `<text x="${(px(xv) + 8).toFixed(2)}" y="${(py(yv) - 8).toFixed(2)}" font-size="10" fill="#5b6b84">${utils.escapeHtml(dataset.labels[i]).slice(0, 18)}</text>` : '';
    return `<g><circle cx="${px(xv).toFixed(2)}" cy="${py(yv).toFixed(2)}" r="5.6" fill="${fill}" stroke="#fff" stroke-width="1.8"><title>${utils.escapeHtml(dataset.labels[i])} — ${utils.escapeHtml(dataset.headers[0])}: ${utils.fmtNumber(xv, 2)} | ${utils.escapeHtml(dataset.headers[1])}: ${utils.fmtNumber(yv, 2)}</title></circle>${label}</g>`;
  }).join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" class="scatter-svg" role="img" aria-label="Dispersão com tendência linear">
      <rect x="0" y="0" width="${width}" height="${height}" rx="20" fill="#fff"/>
      <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" stroke="#9cb0ca"/>
      <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" stroke="#9cb0ca"/>
      <line x1="${px(x1).toFixed(2)}" y1="${py(y1).toFixed(2)}" x2="${px(x2).toFixed(2)}" y2="${py(y2).toFixed(2)}" stroke="#0f766e" stroke-width="2.8"/>
      ${points}
      <text x="${width / 2}" y="${height - 16}" text-anchor="middle" fill="#2c3f57" font-size="13" font-weight="700">${utils.escapeHtml(dataset.headers[0])}</text>
      <text x="22" y="${height / 2}" text-anchor="middle" fill="#2c3f57" font-size="13" font-weight="700" transform="rotate(-90, 22, ${height / 2})">${utils.escapeHtml(dataset.headers[1])}</text>
    </svg>
  `;
}

function buildResidualSvg(dataset, pearson, outlierFlags, utils) {
  const fitted = dataset.x.map(x => pearson.intercept + pearson.slope * x);
  const residuals = dataset.y.map((y, i) => y - fitted[i]);
  const width = 880;
  const height = 360;
  const margin = { top: 22, right: 24, bottom: 64, left: 82 };
  const minX = Math.min(...fitted);
  const maxX = Math.max(...fitted);
  const minR = Math.min(...residuals, 0);
  const maxR = Math.max(...residuals, 0);
  const xPad = (maxX - minX || 1) * 0.08;
  const yPad = (maxR - minR || 1) * 0.12;
  const px = v => margin.left + ((v - (minX - xPad)) / ((maxX - minX) + xPad * 2 || 1)) * (width - margin.left - margin.right);
  const py = v => height - margin.bottom - ((v - (minR - yPad)) / ((maxR - minR) + yPad * 2 || 1)) * (height - margin.top - margin.bottom);

  const dots = residuals.map((res, i) => {
    const fill = outlierFlags[i] ? '#f97316' : '#475569';
    return `<circle cx="${px(fitted[i]).toFixed(2)}" cy="${py(res).toFixed(2)}" r="4.8" fill="${fill}"><title>${utils.escapeHtml(dataset.labels[i])} — Ajustado: ${utils.fmtNumber(fitted[i], 2)} | Resíduo: ${utils.fmtSigned(res, 2)}</title></circle>`;
  }).join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" class="scatter-svg" role="img" aria-label="Gráfico de resíduos">
      <rect x="0" y="0" width="${width}" height="${height}" rx="20" fill="#fff"/>
      <line x1="${margin.left}" y1="${py(0).toFixed(2)}" x2="${width - margin.right}" y2="${py(0).toFixed(2)}" stroke="#0f766e" stroke-dasharray="6 6"/>
      <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" stroke="#9cb0ca"/>
      <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" stroke="#9cb0ca"/>
      ${dots}
      <text x="${width / 2}" y="${height - 16}" text-anchor="middle" fill="#2c3f57" font-size="13" font-weight="700">Valores ajustados de ${utils.escapeHtml(dataset.headers[1])}</text>
      <text x="22" y="${height / 2}" text-anchor="middle" fill="#2c3f57" font-size="13" font-weight="700" transform="rotate(-90, 22, ${height / 2})">Resíduos</text>
    </svg>
  `;
}

function compareMessage(pearson, spearman) {
  const gap = Math.abs(Math.abs(pearson.coef) - Math.abs(spearman.coef));
  if (gap > 0.2) return 'Pearson e Spearman divergiram de forma relevante, sugerindo cautela por possível não linearidade ou influência de valores extremos.';
  if (gap > 0.12) return 'Pearson e Spearman diferiram moderadamente; vale inspecionar o gráfico de resíduos e possíveis outliers.';
  return 'Pearson e Spearman foram consistentes, indicando uma tendência estável na associação.';
}

function buildInterpretation(dataset, pearson, spearman, outlierLabels, utils) {
  const direction = classifyDirection(pearson.coef);
  const strength = classifyStrength(pearson.coef);
  const sig = pearson.p < 0.05;
  const xName = dataset.headers[0];
  const yName = dataset.headers[1];
  let text = `Observou-se ${sig ? 'correlação estatisticamente significativa' : 'ausência de evidência estatística robusta de correlação'} entre ${xName} e ${yName} pelo método de Pearson (r = ${utils.fmtSigned(pearson.coef, 3)}; p ${pearson.p < 0.001 ? '< 0,001' : '= ' + utils.fmtP(pearson.p)}). `;
  text += `A direção foi ${direction} e a força da relação foi classificada como ${strength}. `;

  if (direction === 'positiva') text += `Em termos práticos, quando ${xName} aumenta, ${yName} tende a aumentar.`;
  else if (direction === 'negativa') text += `Em termos práticos, quando ${xName} aumenta, ${yName} tende a diminuir.`;
  else text += `Em termos práticos, não se observou tendência linear relevante entre as variáveis.`;

  const gap = Math.abs(Math.abs(pearson.coef) - Math.abs(spearman.coef));
  if (gap > 0.15) {
    text += ` Como Pearson (${utils.fmtSigned(pearson.coef, 3)}) e Spearman (${utils.fmtSigned(spearman.coef, 3)}) diferiram de maneira perceptível, recomenda-se interpretar com cautela.`;
  }
  if (outlierLabels.length) {
    text += ` Foram detectados possíveis pontos extremos (${outlierLabels.slice(0, 4).join(', ')}${outlierLabels.length > 4 ? ', ...' : ''}), lembrando que Pearson tende a ser mais sensível a outliers do que Spearman.`;
  }

  return text;
}

function metricCard(label, value, note) {
  return `<div class="metric-card"><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-mini">${note}</div></div>`;
}

export async function renderTestModule(ctx) {
  const { root, config, utils, stats, shared } = ctx;
  const examples = config.examples || [];

  root.innerHTML = `
    <div class="module-grid correlacao-module">
      <section class="module-header">
        <div class="chip chip-info">Módulo didático avançado</div>
        <h3>${utils.escapeHtml(config.title || 'Correlação')}</h3>
        <p>${utils.escapeHtml(config.subtitle || '')}</p>
        <p>${utils.escapeHtml(config.description || '')}</p>
      </section>

      <section class="callout-grid correlacao-cards">
        ${(config.didacticCards || []).map(card => `
          <article class="help-card didactic-card">
            <h4>${utils.escapeHtml(card.title || '')}</h4>
            <p>${utils.escapeHtml(card.text || '')}</p>
          </article>
        `).join('')}
      </section>

      <section class="surface-card decorated">
        <h4>Camada Universal DATASUS</h4>
        <p class="small-note">Importe, revise e confirme a base DATASUS antes de montar os pares X e Y para Pearson/Spearman.</p>
        <div id="c-datasus-wizard" style="margin-top:14px;"></div>
      </section>

      <section class="surface-card">
        <h4>Base derivada do DATASUS</h4>
        <div id="c-datasus-controls" class="small-note">Confirme uma base DATASUS para liberar a montagem assistida da correlacao.</div>
        <div id="c-datasus-preview" style="margin-top:14px;"></div>
      </section>

      <section class="surface-card decorated">
        <h4>Entrada de dados</h4>
        <div class="small-note">${utils.escapeHtml(config.note || '')}</div>
        <label for="c-input" style="margin-top:10px;">Cole os dados (tab, vírgula ou ponto e vírgula)</label>
        <textarea id="c-input" placeholder="ID\tVariável X\tVariável Y\nA\t10\t12\nB\t13\t15"></textarea>
        <div class="actions-row" style="margin-top:14px;">
          <button class="btn-secondary" id="c-load-example">Carregar exemplo</button>
          <button class="btn" id="c-run-analysis">Rodar análise</button>
          <button class="btn-ghost" id="c-clear">Limpar</button>
          <select id="c-example-select" aria-label="Escolha um exemplo">
            ${examples.map((ex, i) => `<option value="${utils.escapeHtml(ex.id)}" ${i === 0 ? 'selected' : ''}>${utils.escapeHtml(ex.label)}</option>`).join('')}
          </select>
        </div>
      </section>

      <section class="surface-card">
        <h4>Pré-visualização dos dados</h4>
        <div id="c-preview" class="small-note">Nenhum dado carregado.</div>
      </section>

      <section class="surface-card">
        <h4>Resultados estatísticos</h4>
        <div id="c-error"></div>
        <div id="c-status" class="status-bar">Carregue um exemplo ou cole seus dados para começar.</div>
        <div id="c-metrics" class="metrics-grid" style="margin-top:14px;"></div>
      </section>

      <section class="surface-card">
        <h4>Interpretação automática</h4>
        <div id="c-interpretation" class="result-card"><p class="muted">A interpretação aparecerá aqui após rodar a análise.</p></div>
        <div id="c-outlier-alert"></div>
      </section>

      <section class="surface-card">
        <h4>Gráficos</h4>
        <div id="c-charts" class="chart-grid"></div>
      </section>
    </div>
  `;

  const state = { dataset: null };
  const inputEl = root.querySelector('#c-input');
  const selectEl = root.querySelector('#c-example-select');
  const previewEl = root.querySelector('#c-preview');
  const errorEl = root.querySelector('#c-error');
  const statusEl = root.querySelector('#c-status');
  const metricsEl = root.querySelector('#c-metrics');
  const interpEl = root.querySelector('#c-interpretation');
  const outlierEl = root.querySelector('#c-outlier-alert');
  const chartsEl = root.querySelector('#c-charts');
  const datasusWizardEl = root.querySelector('#c-datasus-wizard');
  const datasusControlsEl = root.querySelector('#c-datasus-controls');
  const datasusPreviewEl = root.querySelector('#c-datasus-preview');

  const datasusState = {
    session: null,
    sharedSession: clonePlain(shared?.datasus?.lastSession || null),
    xSourceId: '',
    ySourceId: '',
    metricBySource: {},
    timeKey: '',
    labelMode: 'category-time',
    derived: null
  };

  function currentDatasusSession() {
    if (datasusState.session?.confirmedSources?.length) return datasusState.session;
    if (datasusState.sharedSession?.confirmedSources?.length) return datasusState.sharedSession;
    return null;
  }

  function confirmedSources() {
    return currentDatasusSession()?.confirmedSources || [];
  }

  function getSource(sourceId) {
    return confirmedSources().find(source => source.id === sourceId) || null;
  }

  function labelForPair(pair) {
    if (datasusState.labelMode === 'category') return pair.category || pair.label;
    if (datasusState.labelMode === 'time') return pair.time || pair.label;
    return pair.label;
  }

  function sharedTimeOptions(leftSource, rightSource) {
    const leftOptions = getTimeOptions(leftSource);
    const rightKeys = new Set(getTimeOptions(rightSource).map(option => option.key));
    return leftOptions.filter(option => rightKeys.has(option.key));
  }

  function availableTimeOptions() {
    const xSource = getSource(datasusState.xSourceId);
    const ySource = getSource(datasusState.ySourceId);
    if (!xSource || !ySource) return [];
    if (xSource.id === ySource.id) return getTimeOptions(xSource);
    return sharedTimeOptions(xSource, ySource);
  }

  function ensureDatasusDefaults() {
    const sources = confirmedSources();
    if (!sources.length) {
      datasusState.derived = null;
      datasusState.xSourceId = '';
      datasusState.ySourceId = '';
      datasusState.timeKey = '';
      return;
    }

    if (!sources.some(source => source.id === datasusState.xSourceId)) {
      datasusState.xSourceId = sources[0].id;
    }
    if (!sources.some(source => source.id === datasusState.ySourceId)) {
      datasusState.ySourceId = sources[1]?.id || sources[0].id;
    }

    sources.forEach(source => {
      if (!datasusState.metricBySource[source.id]) {
        datasusState.metricBySource[source.id] = getPrimaryMetricKey(source);
      }
    });

    const timeOptions = availableTimeOptions();
    if (timeOptions.length && !timeOptions.some(option => option.key === datasusState.timeKey)) {
      datasusState.timeKey = '';
    }
  }

  function deriveDatasusPairs() {
    ensureDatasusDefaults();
    const xSource = getSource(datasusState.xSourceId);
    const ySource = getSource(datasusState.ySourceId);

    if (!xSource || !ySource) {
      return {
        ok: false,
        primaryError: 'Confirme pelo menos uma base DATASUS para montar a correlacao.',
        errors: ['Confirme pelo menos uma base DATASUS para montar a correlacao.'],
        pairs: []
      };
    }

    return deriveCorrelationPairs({
      xSource,
      ySource,
      xMetricKey: datasusState.metricBySource[xSource.id],
      yMetricKey: datasusState.metricBySource[ySource.id],
      timeKeys: datasusState.timeKey ? [datasusState.timeKey] : [],
      stats
    });
  }

  function renderPreview() {
    const dataset = parseDataset(inputEl.value, stats);
    state.dataset = dataset;
    if (!dataset.rows.length) {
      previewEl.innerHTML = '<div class="small-note">Nenhuma observação válida detectada.</div>';
      return dataset;
    }
    const headerText = `<div class="small-note" style="margin-bottom:10px;"><strong>Colunas detectadas:</strong> ${utils.escapeHtml(dataset.headers[0])} e ${utils.escapeHtml(dataset.headers[1])} · <strong>Observações válidas:</strong> ${dataset.x.length}${dataset.ignoredCount ? ` · <strong>Linhas ignoradas:</strong> ${dataset.ignoredCount}` : ''}</div>`;
    previewEl.innerHTML = headerText + utils.renderPreviewTable(['ID', dataset.headers[0], dataset.headers[1]], dataset.rows, 10);
    return dataset;
  }

  function resetVisuals() {
    errorEl.innerHTML = '';
    statusEl.className = 'status-bar';
    statusEl.textContent = 'Carregue um exemplo ou cole seus dados para começar.';
    metricsEl.innerHTML = '';
    interpEl.innerHTML = '<p class="muted">A interpretação aparecerá aqui após rodar a análise.</p>';
    chartsEl.innerHTML = '';
    outlierEl.innerHTML = '';
  }

  function clearAll() {
    inputEl.value = '';
    previewEl.innerHTML = '<div class="small-note">Nenhum dado carregado.</div>';
    state.dataset = null;
    resetVisuals();
  }

  function pushDatasusToCorrelation() {
    const derived = deriveDatasusPairs();
    datasusState.derived = derived;
    renderDatasusPreview();

    if (!derived.ok) {
      datasusControlsEl.innerHTML = `<div class="error-box">${utils.escapeHtml(derived.primaryError || 'Nao ha pares validos suficientes.')}</div>`;
      return;
    }

    const headerX = derived.xLabel || 'X';
    const headerY = derived.yLabel || 'Y';
    const lines = [
      `ID\t${headerX}\t${headerY}`,
      ...derived.pairs.map((pair, index) => `${labelForPair(pair) || `Obs ${index + 1}`}\t${pair.x}\t${pair.y}`)
    ];

    inputEl.value = lines.join('\n');
    renderPreview();
    runAnalysis();
    statusEl.className = 'success-box';
    statusEl.textContent = `Base derivada do DATASUS enviada para correlacao com ${derived.pairs.length} pares validos.`;
  }

  function renderDatasusPreview() {
    const derived = deriveDatasusPairs();
    datasusState.derived = derived;

    if (!derived.ok) {
      datasusPreviewEl.innerHTML = `
        <div class="error-box">
          <strong>Base derivada ainda invalida.</strong>
          <ul class="datasus-inline-list">
            ${(derived.errors || [derived.primaryError || 'Nao ha pares validos suficientes.']).map(item => `<li>${utils.escapeHtml(item)}</li>`).join('')}
          </ul>
        </div>
      `;
      return;
    }

    const rows = derived.pairs.map((pair, index) => [
      labelForPair(pair) || `Obs ${index + 1}`,
      utils.fmtNumber(pair.x, 3),
      utils.fmtNumber(pair.y, 3)
    ]);

    datasusPreviewEl.innerHTML = `
      <div class="success-box">A base derivada esta pronta para alimentar o modulo de correlacao.</div>
      <div class="small-note" style="margin:14px 0 10px;">Cada linha abaixo corresponde a um par valido X/Y para Pearson e Spearman.</div>
      ${utils.renderPreviewTable(['ID', derived.xLabel || 'X', derived.yLabel || 'Y'], rows, 20)}
    `;
  }

  function renderDatasusControls() {
    const sources = confirmedSources();
    if (!sources.length) {
      const hasShared = Boolean(shared?.datasus?.lastSession?.confirmedSources?.length);
      datasusControlsEl.innerHTML = `
        <div class="status-bar">Confirme uma base DATASUS no wizard para liberar a derivacao da correlacao.</div>
        ${hasShared ? '<div class="actions-row" style="margin-top:14px;"><button type="button" class="btn-secondary" id="c-datasus-use-shared">Usar ultima sessao DATASUS confirmada</button></div>' : ''}
      `;
      datasusPreviewEl.innerHTML = '';
      datasusControlsEl.querySelector('#c-datasus-use-shared')?.addEventListener('click', () => {
        datasusState.sharedSession = clonePlain(shared.datasus.lastSession);
        renderDatasusControls();
        renderDatasusPreview();
      });
      return;
    }

    ensureDatasusDefaults();
    const xSource = getSource(datasusState.xSourceId);
    const ySource = getSource(datasusState.ySourceId);
    const xMetrics = getMetricOptions(xSource);
    const yMetrics = getMetricOptions(ySource);
    const timeOptions = availableTimeOptions();

    datasusControlsEl.innerHTML = `
      <div class="form-grid two">
        <div>
          <label for="c-datasus-x-source">Fonte X</label>
          <select id="c-datasus-x-source">
            ${sources.map(source => `<option value="${utils.escapeHtml(source.id)}"${source.id === datasusState.xSourceId ? ' selected' : ''}>${utils.escapeHtml(source.fileName)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label for="c-datasus-y-source">Fonte Y</label>
          <select id="c-datasus-y-source">
            ${sources.map(source => `<option value="${utils.escapeHtml(source.id)}"${source.id === datasusState.ySourceId ? ' selected' : ''}>${utils.escapeHtml(source.fileName)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-grid two" style="margin-top:14px;">
        <div>
          <label for="c-datasus-x-metric">Variavel X</label>
          <select id="c-datasus-x-metric">
            ${xMetrics.map(option => `<option value="${utils.escapeHtml(option.key)}"${option.key === datasusState.metricBySource[xSource.id] ? ' selected' : ''}>${utils.escapeHtml(option.label)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label for="c-datasus-y-metric">Variavel Y</label>
          <select id="c-datasus-y-metric">
            ${yMetrics.map(option => `<option value="${utils.escapeHtml(option.key)}"${option.key === datasusState.metricBySource[ySource.id] ? ' selected' : ''}>${utils.escapeHtml(option.label)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-grid two" style="margin-top:14px;">
        <div>
          <label for="c-datasus-time">Periodo</label>
          <select id="c-datasus-time">
            <option value="">Todos os periodos disponiveis</option>
            ${timeOptions.map(option => `<option value="${utils.escapeHtml(option.key)}"${option.key === datasusState.timeKey ? ' selected' : ''}>${utils.escapeHtml(option.label)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label for="c-datasus-label-mode">Rotulo dos pares</label>
          <select id="c-datasus-label-mode">
            <option value="category"${datasusState.labelMode === 'category' ? ' selected' : ''}>Categoria</option>
            <option value="time"${datasusState.labelMode === 'time' ? ' selected' : ''}>Tempo</option>
            <option value="category-time"${datasusState.labelMode === 'category-time' ? ' selected' : ''}>Categoria + tempo</option>
          </select>
        </div>
      </div>
      <div class="actions-row" style="margin-top:14px;">
        <button type="button" class="btn" id="c-datasus-send">Enviar base derivada para o modulo</button>
      </div>
    `;

    datasusControlsEl.querySelector('#c-datasus-x-source')?.addEventListener('change', event => {
      datasusState.xSourceId = event.target.value;
      ensureDatasusDefaults();
      renderDatasusControls();
      renderDatasusPreview();
    });

    datasusControlsEl.querySelector('#c-datasus-y-source')?.addEventListener('change', event => {
      datasusState.ySourceId = event.target.value;
      ensureDatasusDefaults();
      renderDatasusControls();
      renderDatasusPreview();
    });

    datasusControlsEl.querySelector('#c-datasus-x-metric')?.addEventListener('change', event => {
      datasusState.metricBySource[xSource.id] = event.target.value;
      renderDatasusPreview();
    });

    datasusControlsEl.querySelector('#c-datasus-y-metric')?.addEventListener('change', event => {
      datasusState.metricBySource[ySource.id] = event.target.value;
      renderDatasusPreview();
    });

    datasusControlsEl.querySelector('#c-datasus-time')?.addEventListener('change', event => {
      datasusState.timeKey = event.target.value;
      renderDatasusPreview();
    });

    datasusControlsEl.querySelector('#c-datasus-label-mode')?.addEventListener('change', event => {
      datasusState.labelMode = event.target.value;
      renderDatasusPreview();
    });

    datasusControlsEl.querySelector('#c-datasus-send')?.addEventListener('click', pushDatasusToCorrelation);
  }

  function mountDatasusWizard() {
    createDatasusWizard({
      root: datasusWizardEl,
      utils,
      stats,
      shared,
      onSessionChange(session) {
        datasusState.session = clonePlain(session);
        datasusState.sharedSession = clonePlain(shared?.datasus?.lastSession || null);
        renderDatasusControls();
        renderDatasusPreview();
      }
    });
  }

  function loadExample() {
    const chosen = examples.find(ex => ex.id === selectEl.value) || examples[0];
    if (!chosen) return;
    inputEl.value = chosen.text || '';
    renderPreview();
    errorEl.innerHTML = '';
    statusEl.className = 'status-bar';
    statusEl.textContent = chosen.description || 'Exemplo carregado.';
  }

  function runAnalysis() {
    const dataset = renderPreview();
    resetVisuals();

    if (dataset.x.length < 4) {
      errorEl.innerHTML = '<div class="error-box">Forneça ao menos 4 pares válidos para uma análise mais estável.</div>';
      return;
    }

    const pearson = stats.pearson(dataset.x, dataset.y);
    const spearman = stats.spearman(dataset.x, dataset.y);

    if (!Number.isFinite(pearson.coef) || !Number.isFinite(spearman.coef)) {
      errorEl.innerHTML = '<div class="error-box">Não foi possível calcular a correlação. Revise se as colunas possuem variação suficiente.</div>';
      return;
    }

    const xOut = outlierMask(dataset.x);
    const yOut = outlierMask(dataset.y);
    const outlierFlags = xOut.map((flag, i) => flag || yOut[i]);
    const outlierLabels = dataset.labels.filter((_, i) => outlierFlags[i]);

    statusEl.className = 'success-box';
    statusEl.textContent = `Análise concluída com ${dataset.x.length} observações válidas.`;

    metricsEl.innerHTML = [
      metricCard('n', String(dataset.x.length), 'Total de pares válidos usados nos cálculos.'),
      metricCard('r de Pearson', utils.fmtSigned(pearson.coef, 3), `p = ${utils.fmtP(pearson.p)} · IC95% ${utils.fmtNumber(pearson.ci[0], 3)} a ${utils.fmtNumber(pearson.ci[1], 3)}`),
      metricCard('R²', utils.fmtNumber(pearson.r2, 3), 'Proporção da variação linear de Y explicada por X.'),
      metricCard('rho de Spearman', utils.fmtSigned(spearman.coef, 3), `p = ${utils.fmtP(spearman.p)} · Método por postos.`),
      metricCard('Direção', classifyDirection(pearson.coef), 'Classificação baseada no sinal e magnitude de r.'),
      metricCard('Força', classifyStrength(pearson.coef), 'Escala: muito fraca, fraca, moderada, forte, muito forte.')
    ].join('');

    const interpretation = buildInterpretation(dataset, pearson, spearman, outlierLabels, utils);
    interpEl.innerHTML = `<p>${utils.escapeHtml(interpretation)}</p><ul><li>${utils.escapeHtml(compareMessage(pearson, spearman))}</li><li>Inclinação linear estimada (Pearson): ${utils.fmtSigned(pearson.slope, 3)} em ${utils.escapeHtml(dataset.headers[1])} para cada 1 unidade em ${utils.escapeHtml(dataset.headers[0])}.</li></ul>`;

    if (outlierLabels.length) {
      outlierEl.innerHTML = `<div class="status-bar outlier-note"><strong>Atenção a possíveis outliers:</strong> ${utils.escapeHtml(outlierLabels.slice(0, 6).join(', '))}${outlierLabels.length > 6 ? '...' : ''}. Pearson tende a ser mais sensível a pontos extremos que Spearman.</div>`;
    }

    chartsEl.innerHTML = `
      <article class="chart-card">
        <h4>Gráfico 1 — Dispersão com reta de tendência</h4>
        <div class="chart-wrap">${buildScatterSvg(dataset, pearson, outlierFlags, utils)}</div>
      </article>
      <article class="chart-card">
        <h4>Gráfico 2 — Resíduos do ajuste linear</h4>
        <div class="chart-wrap">${buildResidualSvg(dataset, pearson, outlierFlags, utils)}</div>
      </article>
    `;
  }

  root.querySelector('#c-load-example').addEventListener('click', loadExample);
  root.querySelector('#c-run-analysis').addEventListener('click', runAnalysis);
  root.querySelector('#c-clear').addEventListener('click', clearAll);
  inputEl.addEventListener('input', renderPreview);
  selectEl.addEventListener('change', loadExample);

  mountDatasusWizard();
  renderDatasusControls();
  renderDatasusPreview();

  if (examples[0]) {
    loadExample();
    runAnalysis();
  }
}
