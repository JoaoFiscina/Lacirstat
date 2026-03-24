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
  ['UF1', '12,3', '45,2', ''],
  ['UF2', '14,1', '43,8', ''],
  ['UF3', '10,9', '48,0', ''],
  ['UF4', '15,2', '42,7', '']
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
  return sorted[base + 1] !== undefined ? sorted[base] + (rest * (sorted[base + 1] - sorted[base])) : sorted[base];
}

function outlierMask(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const low = q1 - (1.5 * iqr);
  const high = q3 + (1.5 * iqr);
  return values.map(value => value < low || value > high);
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
  const px = value => margin.left + ((value - (minX - xPad)) / (((maxX - minX) + (xPad * 2)) || 1)) * (width - margin.left - margin.right);
  const py = value => height - margin.bottom - ((value - (minY - yPad)) / (((maxY - minY) + (yPad * 2)) || 1)) * (height - margin.top - margin.bottom);

  const x1 = minX - xPad;
  const x2 = maxX + xPad;
  const y1 = pearson.intercept + (pearson.slope * x1);
  const y2 = pearson.intercept + (pearson.slope * x2);
  const equationSign = pearson.slope >= 0 ? '+' : '-';
  const equationText = `${dataset.headers[1]} = ${utils.fmtNumber(pearson.intercept, 2)} ${equationSign} ${utils.fmtNumber(Math.abs(pearson.slope), 2)} x ${dataset.headers[0]}`;
  const shouldLabelPoints = dataset.labels.length <= 16;

  const points = dataset.x.map((xValue, index) => {
    const yValue = dataset.y[index];
    const isOutlier = outlierFlags[index];
    const fill = isOutlier ? '#f97316' : '#2563eb';
    const label = shouldLabelPoints
      ? `<text x="${(px(xValue) + 8).toFixed(2)}" y="${(py(yValue) - 8).toFixed(2)}" font-size="10" fill="#5b6b84">${utils.escapeHtml(dataset.labels[index]).slice(0, 18)}</text>`
      : '';
    return `<g><circle cx="${px(xValue).toFixed(2)}" cy="${py(yValue).toFixed(2)}" r="5.6" fill="${fill}" stroke="#fff" stroke-width="1.8"><title>${utils.escapeHtml(dataset.labels[index])} | ${utils.escapeHtml(dataset.headers[0])}: ${utils.fmtNumber(xValue, 2)} | ${utils.escapeHtml(dataset.headers[1])}: ${utils.fmtNumber(yValue, 2)}</title></circle>${label}</g>`;
  }).join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" class="scatter-svg" role="img" aria-label="Dispersao com reta de tendencia">
      <rect x="0" y="0" width="${width}" height="${height}" rx="20" fill="#fff"/>
      <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" stroke="#9cb0ca"/>
      <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" stroke="#9cb0ca"/>
      <line x1="${px(x1).toFixed(2)}" y1="${py(y1).toFixed(2)}" x2="${px(x2).toFixed(2)}" y2="${py(y2).toFixed(2)}" stroke="#0f766e" stroke-width="2.8"/>
      <rect x="${width - 286}" y="26" width="242" height="64" rx="16" fill="rgba(15,118,110,0.08)" stroke="rgba(15,118,110,0.18)"/>
      <text x="${width - 270}" y="50" fill="#17433e" font-size="12" font-weight="700">Reta linear (Pearson)</text>
      <text x="${width - 270}" y="68" fill="#33556f" font-size="11">${utils.escapeHtml(equationText)}</text>
      <text x="${width - 270}" y="84" fill="#33556f" font-size="11">R² = ${utils.fmtNumber(pearson.r2, 3)}</text>
      ${points}
      <text x="${width / 2}" y="${height - 16}" text-anchor="middle" fill="#2c3f57" font-size="13" font-weight="700">${utils.escapeHtml(dataset.headers[0])}</text>
      <text x="22" y="${height / 2}" text-anchor="middle" fill="#2c3f57" font-size="13" font-weight="700" transform="rotate(-90, 22, ${height / 2})">${utils.escapeHtml(dataset.headers[1])}</text>
    </svg>
  `;
}

function compareMessage(pearson, spearman) {
  const gap = Math.abs(Math.abs(pearson.coef) - Math.abs(spearman.coef));
  if (gap > 0.2) return 'Pearson e Spearman divergiram de forma relevante, sugerindo cautela por possivel nao linearidade ou influencia de valores extremos.';
  if (gap > 0.12) return 'Pearson e Spearman diferiram moderadamente; vale revisar a tabela de pontos influentes e os possiveis outliers.';
  return 'Pearson e Spearman foram consistentes, indicando uma tendencia estavel na associacao.';
}

function correlationMetricCard(label, value, note, extraClass = '') {
  return `<div class="metric-card ${extraClass}"><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-mini">${note}</div></div>`;
}

function methodLabel(method) {
  return method === 'spearman' ? 'Spearman' : 'Pearson';
}

function buildMethodInterpretation(dataset, pearson, spearman, outlierLabels, activeMethod, utils) {
  const primary = activeMethod === 'spearman' ? spearman : pearson;
  const secondary = activeMethod === 'spearman' ? pearson : spearman;
  const direction = classifyDirection(primary.coef);
  const strength = classifyStrength(primary.coef);
  const sig = primary.p < 0.05;
  const xName = dataset.headers[0];
  const yName = dataset.headers[1];
  const primarySymbol = activeMethod === 'spearman' ? 'rho' : 'r';
  let text = `Observou-se ${sig ? 'correlacao estatisticamente significativa' : 'ausencia de evidencia estatistica robusta de correlacao'} entre ${xName} e ${yName} pelo metodo de ${methodLabel(activeMethod)} (${primarySymbol} = ${utils.fmtSigned(primary.coef, 3)}; p ${primary.p < 0.001 ? '< 0,001' : '= ' + utils.fmtP(primary.p)}). `;
  text += `A direcao foi ${direction} e a forca da relacao foi classificada como ${strength}. `;
  if (direction === 'positiva') text += `Em termos praticos, quando ${xName} aumenta, ${yName} tende a aumentar.`;
  else if (direction === 'negativa') text += `Em termos praticos, quando ${xName} aumenta, ${yName} tende a diminuir.`;
  else text += 'Em termos praticos, nao se observou tendencia relevante entre as variaveis.';
  const gap = Math.abs(Math.abs(pearson.coef) - Math.abs(spearman.coef));
  if (gap > 0.15) text += ` Como Pearson (${utils.fmtSigned(pearson.coef, 3)}) e Spearman (${utils.fmtSigned(spearman.coef, 3)}) diferiram de maneira perceptivel, recomenda-se interpretar com cautela.`;
  else text += ` O metodo alternativo (${methodLabel(activeMethod === 'spearman' ? 'pearson' : 'spearman')}) permaneceu consistente, com coeficiente ${utils.fmtSigned(secondary.coef, 3)}.`;
  if (outlierLabels.length) text += ` Foram detectados possiveis pontos extremos (${outlierLabels.slice(0, 4).join(', ')}${outlierLabels.length > 4 ? ', ...' : ''}), lembrando que Pearson tende a ser mais sensivel a outliers do que Spearman.`;
  return text;
}

function buildEmptyCorrelationDataset(sourceKind = 'paste', sourceLabel = 'Dados colados') {
  return {
    sourceKind,
    sourceLabel,
    hasContent: false,
    rows: [],
    validRows: [],
    ignoredRows: [],
    x: [],
    y: [],
    labels: [],
    headers: ['variavel_x', 'variavel_y'],
    recognizedColumns: {},
    errors: [],
    warnings: [],
    infos: [],
    fileMeta: null
  };
}

function buildCorrelationDatasetFromTabularState(fileState, stats, sourceMeta = {}) {
  const {
    sourceKind = fileState?.sourceType || 'paste',
    sourceLabel = sourceKind === 'file' ? 'Arquivo importado' : 'Dados colados'
  } = sourceMeta;

  if (!fileState || fileState.status !== 'loaded') {
    const dataset = buildEmptyCorrelationDataset(sourceKind, sourceLabel);
    if (fileState?.message) dataset.errors.push(fileState.message);
    if (Array.isArray(fileState?.details)) dataset.infos.push(...fileState.details);
    dataset.hasContent = Boolean(fileState?.message);
    return dataset;
  }

  const recognizedColumns = fileState.recognizedColumns || {};
  const mappedRows = fileState.bodyRows.map((row, index) => ({
    index: index + 1,
    idRaw: recognizedColumns.id ? row[recognizedColumns.id.index] || '' : '',
    xRaw: row[recognizedColumns.variavel_x.index] || '',
    yRaw: row[recognizedColumns.variavel_y.index] || '',
    observationRaw: recognizedColumns.observacao_opcional ? row[recognizedColumns.observacao_opcional.index] || '' : ''
  }));

  const hasContent = mappedRows.some(row => (
    normalizeTabularSpaces(row.idRaw)
    || normalizeTabularSpaces(row.xRaw)
    || normalizeTabularSpaces(row.yRaw)
    || normalizeTabularSpaces(row.observationRaw)
  ));

  if (!hasContent) {
    return {
      ...buildEmptyCorrelationDataset(sourceKind, sourceLabel),
      recognizedColumns,
      fileMeta: {
        fileName: fileState.fileName,
        tableName: fileState.tableName,
        delimiter: fileState.delimiter
      }
    };
  }

  const datasetRows = [];
  const validRows = [];
  const x = [];
  const y = [];
  const labels = [];
  let ignoredByTextOrEmpty = false;

  mappedRows.forEach(row => {
    const idRaw = normalizeTabularSpaces(row.idRaw);
    const xRaw = normalizeTabularSpaces(row.xRaw);
    const yRaw = normalizeTabularSpaces(row.yRaw);
    const xValue = parseTabularNumber(xRaw, stats);
    const yValue = parseTabularNumber(yRaw, stats);
    const rowLabel = idRaw || `Linha ${row.index}`;
    const notes = [];
    let statusLabel = 'Ignorada';
    let statusTone = 'ignored';

    if (xValue !== null && yValue !== null) {
      statusLabel = 'Valida';
      statusTone = 'valid';
      x.push(xValue);
      y.push(yValue);
      labels.push(rowLabel);
      validRows.push({ index: row.index, label: rowLabel, xValue, yValue });
    } else {
      if (xRaw && xValue === null) notes.push('variavel_x nao contem valor numerico valido.');
      if (yRaw && yValue === null) notes.push('variavel_y nao contem valor numerico valido.');
      if (!xRaw && !yRaw) notes.push('Linha vazia nas colunas numericas.');
      if (!notes.length) notes.push('Linha sem dois valores numericos utilizaveis.');
      ignoredByTextOrEmpty = true;
    }

    datasetRows.push({
      index: row.index,
      idLabel: rowLabel,
      xRaw,
      yRaw,
      xValue,
      yValue,
      statusLabel,
      statusTone,
      notes
    });
  });

  const warnings = [];
  if (ignoredByTextOrEmpty && datasetRows.some(row => row.statusTone === 'ignored')) {
    warnings.push('Foram encontrados textos ou celulas vazias em linhas ignoradas.');
  }
  datasetRows
    .filter(row => row.statusTone === 'ignored' && row.notes.length)
    .slice(0, 3)
    .forEach(row => warnings.push(describeIgnoredRowReason(row.index, row.notes)));
  const remainingIgnored = datasetRows.filter(row => row.statusTone === 'ignored').length - 3;
  if (remainingIgnored > 0) {
    warnings.push(`Outras ${remainingIgnored} linhas tambem foram ignoradas por falta de valores numericos validos em X e Y.`);
  }

  const infos = [];
  if (fileState.delimiter === ';') infos.push(`${sourceKind === 'file' ? 'Arquivo' : 'Conteudo colado'} lido no padrao ponto e virgula (;).`);
  else if (fileState.delimiter === '\t') infos.push('Conteudo tabulado do Excel interpretado automaticamente.');
  if (fileState.decimalCommaDetected) infos.push('Numeros com virgula decimal foram convertidos automaticamente.');
  infos.push('ID e apenas rotulo; variavel_x e variavel_y entram no calculo.');
  if (!recognizedColumns.id) infos.push('Coluna de ID nao reconhecida; a previa usa a ordem das linhas como referencia.');
  if (fileState.duplicates.length) warnings.push(`Cabecalhos duplicados foram ignorados: ${fileState.duplicates.join(', ')}.`);

  return {
    sourceKind,
    sourceLabel,
    hasContent: true,
    rows: datasetRows,
    validRows,
    ignoredRows: datasetRows.filter(row => row.statusTone === 'ignored'),
    x,
    y,
    labels,
    headers: [
      recognizedColumns.variavel_x?.header || 'variavel_x',
      recognizedColumns.variavel_y?.header || 'variavel_y'
    ],
    recognizedColumns,
    errors: [],
    warnings,
    infos,
    fileMeta: {
      fileName: fileState.fileName,
      tableName: fileState.tableName,
      formatLabel: fileState.formatLabel,
      delimiter: fileState.delimiter,
      headerRowIndex: fileState.headerRowIndex
    }
  };
}

function buildFeedbackBox(messages, toneClass, utils, title = '') {
  if (!messages?.length) return '';
  if (messages.length === 1) {
    return `<div class="${toneClass}">${title ? `<strong>${utils.escapeHtml(title)}</strong> ` : ''}${utils.escapeHtml(messages[0])}</div>`;
  }

  return `
    <div class="${toneClass}">
      ${title ? `<strong>${utils.escapeHtml(title)}</strong>` : ''}
      <ul class="datasus-inline-list">
        ${messages.map(message => `<li>${utils.escapeHtml(message)}</li>`).join('')}
      </ul>
    </div>
  `;
}

function buildCorrelationPreviewTable(dataset, utils, limit = 14) {
  const rows = dataset.rows.slice(0, limit);
  const formatConverted = value => (
    value === null || value === undefined
      ? '-'
      : utils.fmtNumber(value, Math.abs(value) >= 100 ? 1 : 3)
  );

  return `
    <div class="preview-table-wrap">
      <table class="preview-table correlation-preview-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>X bruto</th>
            <th>Y bruto</th>
            <th>X convertido</th>
            <th>Y convertido</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map(row => `
            <tr class="${row.statusTone === 'ignored' ? 'correlation-preview-row-ignored' : 'correlation-preview-row-valid'}">
              <td>${utils.escapeHtml(row.idLabel)}</td>
              <td>${utils.escapeHtml(row.xRaw || '-')}</td>
              <td>${utils.escapeHtml(row.yRaw || '-')}</td>
              <td>${formatConverted(row.xValue)}</td>
              <td>${formatConverted(row.yValue)}</td>
              <td>
                <div class="correlation-preview-status">
                  <strong>${utils.escapeHtml(row.statusLabel)}</strong>
                  ${row.notes.length ? `<small>${utils.escapeHtml(row.notes.join(' '))}</small>` : ''}
                </div>
              </td>
            </tr>
          `).join('') : '<tr><td colspan="6">Nenhum dado interpretado ainda.</td></tr>'}
        </tbody>
      </table>
    </div>
    ${dataset.rows.length > limit ? `<div class="small-note" style="margin-top:10px;">Mostrando ${limit} de ${dataset.rows.length} linhas interpretadas.</div>` : ''}
  `;
}

function buildCorrelationFormatPreview(utils) {
  const rows = CORRELATION_EXAMPLE_ROWS.map(row => row.map(value => utils.escapeHtml(value || '')));
  return `
    <div class="tabular-format-box">
      <div class="small-note">Formato recomendado: <strong>${utils.escapeHtml(CORRELATION_FORMAT_LABEL)}</strong></div>
      <div class="preview-table-wrap" style="margin-top:12px;">
        <table class="preview-table">
          <thead>
            <tr>
              <th>id</th>
              <th>variavel_x</th>
              <th>variavel_y</th>
              <th>observacao_opcional</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `<tr>${row.map(value => `<td>${value || '-'}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="small-note" style="margin-top:12px;">Cada linha e uma observacao. ID e apenas rotulo; variavel_x e variavel_y entram no calculo.</div>
    </div>
  `;
}

function buildInfluenceTable(dataset, pearson, outlierFlags, utils, limit = 6) {
  const ranked = dataset.labels.map((label, index) => {
    const fitted = pearson.intercept + (pearson.slope * dataset.x[index]);
    const residual = dataset.y[index] - fitted;
    return {
      label,
      x: dataset.x[index],
      y: dataset.y[index],
      fitted,
      residual,
      outlier: outlierFlags[index]
    };
  })
    .sort((left, right) => Math.abs(right.residual) - Math.abs(left.residual))
    .slice(0, limit);

  return `
    <div class="preview-table-wrap">
      <table class="preview-table correlation-preview-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>X</th>
            <th>Y</th>
            <th>Y ajustado</th>
            <th>Residuo</th>
            <th>Leitura</th>
          </tr>
        </thead>
        <tbody>
          ${ranked.map(row => `
            <tr class="${row.outlier ? 'correlation-preview-row-ignored' : 'correlation-preview-row-valid'}">
              <td>${utils.escapeHtml(row.label)}</td>
              <td>${utils.fmtNumber(row.x, 2)}</td>
              <td>${utils.fmtNumber(row.y, 2)}</td>
              <td>${utils.fmtNumber(row.fitted, 2)}</td>
              <td>${utils.fmtSigned(row.residual, 2)}</td>
              <td>${row.outlier ? 'Possivel outlier ou ponto influente' : 'Dentro do padrao geral da reta'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

export async function renderTestModule(ctx) {
  const { root, config, utils, stats, shared } = ctx;
  root.classList.add('correlacao-module-shell');

  try {
    const warnedUiKeys = new Set();

    function warnMissingUi(label, selector, detail = 'O modulo seguira carregando com os elementos disponiveis.') {
      const key = `${label}:${selector}`;
      if (warnedUiKeys.has(key)) return;
      warnedUiKeys.add(key);
      console.warn(`[correlacao] Elemento nao encontrado para ${label} (${selector}). ${detail}`);
    }

    function createMissingElementRef(label, selector) {
      const noop = () => {};
      return {
        __correlationMissingRef: true,
        label,
        selector,
        value: '',
        innerHTML: '',
        textContent: '',
        className: '',
        disabled: true,
        files: [],
        dataset: {},
        classList: {
          add: noop,
          remove: noop,
          toggle: noop,
          contains: () => false
        },
        addEventListener: noop,
        removeEventListener: noop,
        querySelector: () => null,
        querySelectorAll: () => [],
        setAttribute: noop,
        getAttribute: () => null,
        focus: noop
      };
    }

    function isMissingElementRef(element) {
      return Boolean(element?.__correlationMissingRef);
    }

    function findInContainer(container, selector, options = {}) {
      const { label = selector, optional = false } = options;
      const element = container?.querySelector?.(selector) || null;
      if (element) return element;
      warnMissingUi(
        label,
        selector,
        optional
          ? 'Controle opcional ausente nesta renderizacao.'
          : 'Revise se o seletor ainda corresponde ao HTML atual do modulo.'
      );
      return createMissingElementRef(label, selector);
    }

    function safeBindElement(element, eventName, handler, options = {}) {
      const { label = 'elemento', bindingKey = `${eventName}:${label}`, listenerOptions } = options;
      if (!element || isMissingElementRef(element)) return null;
      if (!element[CORRELATION_BOUND_EVENTS]) {
        element[CORRELATION_BOUND_EVENTS] = new Set();
      }
      if (element[CORRELATION_BOUND_EVENTS].has(bindingKey)) {
        return element;
      }
      element[CORRELATION_BOUND_EVENTS].add(bindingKey);
      element.addEventListener(eventName, handler, listenerOptions);
      return element;
    }

    function safeBind(container, selector, eventName, handler, options = {}) {
      const { label = selector, optional = false, bindingKey, listenerOptions } = options;
      const element = container?.querySelector?.(selector) || null;
      if (!element) {
        warnMissingUi(
          label,
          selector,
          optional
            ? `O listener opcional de ${eventName} nao sera registrado.`
            : `O listener de ${eventName} nao foi registrado; revise o HTML atual do modulo.`
        );
        return null;
      }
      return safeBindElement(element, eventName, handler, { label, bindingKey, listenerOptions });
    }

    function safeBindAll(container, selector, eventName, handler, options = {}) {
      const { label = selector, optional = false, bindingKey = `${eventName}:${selector}`, listenerOptions } = options;
      const elements = Array.from(container?.querySelectorAll?.(selector) || []);
      if (!elements.length) {
        warnMissingUi(
          label,
          selector,
          optional
            ? 'Nenhum controle opcional encontrado para este grupo.'
            : 'Nenhum elemento encontrado para o grupo de listeners.'
        );
        return [];
      }
      return elements.map((element, index) => safeBindElement(element, eventName, handler, {
        label: `${label} #${index + 1}`,
        bindingKey,
        listenerOptions
      })).filter(Boolean);
    }

    function toneClass(kind) {
      if (kind === 'success') return 'success-box';
      if (kind === 'error') return 'error-box';
      return 'status-bar';
    }

    root.innerHTML = `
      <div class="module-grid correlacao-module">
        <section class="module-header">
          <div class="chip chip-info">Modulo didatico · correlacao</div>
          <h3>${utils.escapeHtml(config.title || 'Correlacao de Pearson / Spearman')}</h3>
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
          <p class="small-note">Importe, revise e confirme a base DATASUS antes de montar os pares X e Y para Pearson ou Spearman.</p>
          <div id="c-datasus-wizard" style="margin-top:14px;"></div>
        </section>

        <section class="surface-card">
          <h4>Base derivada do DATASUS</h4>
          <div id="c-datasus-controls" class="small-note">Confirme uma base DATASUS para liberar a montagem assistida da correlacao.</div>
          <div id="c-datasus-preview" style="margin-top:14px;"></div>
        </section>

        <section class="surface-card decorated">
          <div class="tabular-workflow-head">
            <div>
              <span class="small-chip info">Entrada por colunas</span>
              <h4 style="margin-top:10px;">Importar ou colar dados</h4>
            </div>
          </div>
          <p class="small-note">Formato principal: <strong>${utils.escapeHtml(CORRELATION_FORMAT_LABEL)}</strong>. Aceita CSV com ponto e virgula, colagem tabulada do Excel e numeros com virgula decimal.</p>
          <div class="tabular-intake-grid">
            <article class="tabular-workflow-block">
              <div class="tabular-workflow-head">
                <h5>Importar arquivo</h5>
              </div>
              <p class="small-note">Aceita CSV, XLSX e TXT. Preferencia: CSV com ponto e virgula e decimal com virgula.</p>
              <div class="tabular-file-picker">
                <label for="c-file" class="btn-secondary">Importar arquivo</label>
                <input id="c-file" class="tabular-hidden-file" type="file" accept=".csv,.txt,.xlsx" />
                <span id="c-file-name" class="small-note">Nenhum arquivo selecionado.</span>
              </div>
              <div class="tabular-link-row">
                <a class="btn-ghost" href="${CORRELATION_EMPTY_TEMPLATE_URL}" download="modelo-correlacao-vazio.csv">Baixar modelo</a>
                <a class="btn-ghost" href="${CORRELATION_FILLED_TEMPLATE_URL}" download="modelo-correlacao-exemplo.csv">Baixar exemplo</a>
              </div>
            </article>

            <article class="tabular-workflow-block">
              <div class="tabular-workflow-head">
                <h5>Colar dados</h5>
              </div>
              <textarea id="c-paste" class="tabular-paste-textarea" spellcheck="false" placeholder="${utils.escapeHtml(CORRELATION_EXAMPLE_TEXT)}"></textarea>
              <div class="actions-row tabular-actions-row">
                <button type="button" class="btn-secondary" id="c-use-example">Usar exemplo</button>
                <button type="button" class="btn" id="c-read-data">Ler dados</button>
                <button type="button" class="btn-ghost" id="c-clear">Limpar</button>
              </div>
            </article>

            <article class="tabular-workflow-block tabular-workflow-block-wide">
              <div class="tabular-workflow-head">
                <h5>Como organizar a planilha</h5>
              </div>
              ${buildCorrelationFormatPreview(utils)}
            </article>
          </div>
          <div id="c-intake-status" class="status-bar" style="margin-top:16px;">Escolha um arquivo ou cole a tabela para ler os dados.</div>
        </section>

        <section class="surface-card">
          <h4>Previa dos dados</h4>
          <div id="c-preview-meta" class="tabular-preview-stack">
            <div class="small-note">Nenhum dado lido ainda.</div>
          </div>
          <div id="c-preview-table" style="margin-top:14px;"></div>
        </section>

        <section class="surface-card">
          <div class="tabular-workflow-head">
            <div>
              <h4>Rodar analise</h4>
              <p class="small-note" style="margin:8px 0 0;">ID e apenas rotulo. Variavel X e variavel Y entram no calculo. Alternar o metodo nao apaga os dados lidos.</p>
            </div>
            <div class="correlation-method-switch" role="tablist" aria-label="Metodo de correlacao em destaque">
              <button type="button" class="correlation-method-btn is-active" data-correlation-method="pearson" aria-selected="true">Pearson</button>
              <button type="button" class="correlation-method-btn" data-correlation-method="spearman" aria-selected="false">Spearman</button>
            </div>
          </div>
          <div class="actions-row" style="margin-top:16px;">
            <button type="button" class="btn" id="c-run-analysis">Rodar analise</button>
          </div>
          <div id="c-error" style="margin-top:14px;"></div>
          <div id="c-status" class="status-bar" style="margin-top:14px;">Leia ou importe uma base para continuar.</div>
          <div id="c-metrics" class="metrics-grid" style="margin-top:14px;"></div>
        </section>

        <section class="surface-card">
          <h4>Interpretacao automatica</h4>
          <div id="c-interpretation" class="result-card"><p class="muted">A interpretacao aparecera aqui apos rodar a analise.</p></div>
          <div id="c-outlier-alert" style="margin-top:14px;"></div>
        </section>

        <section class="surface-card">
          <h4>Visualizacao e pontos influentes</h4>
          <div id="c-charts" class="chart-grid"></div>
        </section>
      </div>
    `;

    const els = {
      file: findInContainer(root, '#c-file', { label: 'arquivo de entrada' }),
      fileName: findInContainer(root, '#c-file-name', { label: 'nome do arquivo' }),
      paste: findInContainer(root, '#c-paste', { label: 'area de colagem' }),
      intakeStatus: findInContainer(root, '#c-intake-status', { label: 'status da leitura' }),
      previewMeta: findInContainer(root, '#c-preview-meta', { label: 'resumo da previa' }),
      previewTable: findInContainer(root, '#c-preview-table', { label: 'tabela de previa' }),
      error: findInContainer(root, '#c-error', { label: 'area de erro' }),
      status: findInContainer(root, '#c-status', { label: 'status da analise' }),
      metrics: findInContainer(root, '#c-metrics', { label: 'metricas' }),
      interpretation: findInContainer(root, '#c-interpretation', { label: 'interpretacao' }),
      outlier: findInContainer(root, '#c-outlier-alert', { label: 'alerta de outliers', optional: true }),
      charts: findInContainer(root, '#c-charts', { label: 'graficos' }),
      datasusWizard: findInContainer(root, '#c-datasus-wizard', { label: 'wizard DATASUS', optional: true }),
      datasusControls: findInContainer(root, '#c-datasus-controls', { label: 'controles DATASUS', optional: true }),
      datasusPreview: findInContainer(root, '#c-datasus-preview', { label: 'previa DATASUS', optional: true })
    };

    const state = {
      dataset: buildEmptyCorrelationDataset(),
      activeMethod: 'pearson',
      lastResult: null
    };

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

    function setIntakeStatus(kind, message) {
      els.intakeStatus.className = toneClass(kind);
      els.intakeStatus.textContent = message;
    }

    function resetResultVisuals(statusMessage = 'Leia ou importe uma base para continuar.') {
      els.error.innerHTML = '';
      els.status.className = 'status-bar';
      els.status.textContent = statusMessage;
      els.metrics.innerHTML = '';
      els.interpretation.innerHTML = '<p class="muted">A interpretacao aparecera aqui apos rodar a analise.</p>';
      els.outlier.innerHTML = '';
      els.charts.innerHTML = '';
    }

    function renderPreview() {
      const dataset = state.dataset;
      const recognized = buildRecognizedColumnsChips(dataset.recognizedColumns, CORRELATION_RECOGNIZED_ORDER);

      if (!dataset.hasContent && !dataset.errors.length) {
        els.previewMeta.innerHTML = '<div class="small-note">Nenhum dado lido ainda.</div>';
        els.previewTable.innerHTML = '';
        return;
      }

      els.previewMeta.innerHTML = `
        <div class="tabular-preview-grid">
          <article class="mini-card">
            <h4>Colunas reconhecidas</h4>
            <div class="tabular-chip-row">${recognized || '<span class="small-note">Nenhuma coluna reconhecida.</span>'}</div>
          </article>
          <article class="mini-card">
            <h4>Linhas validas</h4>
            <p>${dataset.x.length}</p>
          </article>
          <article class="mini-card">
            <h4>Linhas ignoradas</h4>
            <p>${dataset.ignoredRows.length}</p>
          </article>
        </div>
        ${buildFeedbackBox(dataset.infos, 'status-bar', utils, 'Leitura')}
        ${buildFeedbackBox(dataset.warnings, 'status-bar outlier-note', utils, 'Linhas ignoradas')}
        ${buildFeedbackBox(dataset.errors, 'error-box', utils, 'Problemas encontrados')}
      `;
      els.previewTable.innerHTML = buildCorrelationPreviewTable(dataset, utils);
    }

    function applyDataset(dataset, statusMessage, statusKind = 'status') {
      state.dataset = dataset;
      state.lastResult = null;
      renderPreview();
      resetResultVisuals();
      setIntakeStatus(statusKind, statusMessage);
    }

    async function readSelectedFile(file) {
      if (!file) return;
      els.fileName.textContent = file.name || 'Arquivo selecionado';
      setIntakeStatus('status', 'Lendo arquivo...');
      const fileState = await readTabularFileState(file, utils, stats, {
        aliases: CORRELATION_HEADER_ALIASES,
        requiredKeys: ['variavel_x', 'variavel_y'],
        numericKeys: ['variavel_x', 'variavel_y'],
        expectedFormatLabel: CORRELATION_FORMAT_LABEL
      });
      const dataset = buildCorrelationDatasetFromTabularState(fileState, stats, {
        sourceKind: 'file',
        sourceLabel: 'Arquivo importado'
      });

      applyDataset(
        dataset,
        fileState.status === 'loaded'
          ? `Arquivo "${file.name}" lido com sucesso. Revise a previa antes de rodar a analise.`
          : (fileState.message || 'Nao foi possivel ler o arquivo enviado.'),
        fileState.status === 'loaded' ? 'success' : 'error'
      );
    }

    function readPastedData(statusMessage = 'Dados colados lidos. Revise a previa antes de rodar a analise.', statusKind = 'success') {
      if (!normalizeTabularSpaces(els.paste.value)) {
        state.dataset = buildEmptyCorrelationDataset();
        renderPreview();
        resetResultVisuals();
        setIntakeStatus('status', 'Cole uma tabela com cabecalho para ler os dados.');
        return state.dataset;
      }

      const fileState = readTabularPasteState(els.paste.value, stats, {
        aliases: CORRELATION_HEADER_ALIASES,
        requiredKeys: ['variavel_x', 'variavel_y'],
        numericKeys: ['variavel_x', 'variavel_y'],
        expectedFormatLabel: CORRELATION_FORMAT_LABEL
      });
      const dataset = buildCorrelationDatasetFromTabularState(fileState, stats, {
        sourceKind: 'paste',
        sourceLabel: 'Dados colados'
      });

      applyDataset(
        dataset,
        fileState.status === 'loaded'
          ? statusMessage
          : (fileState.message || 'Nao foi possivel interpretar os dados colados.'),
        fileState.status === 'loaded' ? statusKind : 'error'
      );
      return dataset;
    }

    function loadExample() {
      els.paste.value = CORRELATION_EXAMPLE_TEXT;
      els.file.value = '';
      els.fileName.textContent = 'Nenhum arquivo selecionado.';
      readPastedData('Exemplo carregado e interpretado no formato padrao.', 'success');
    }

    function clearAll() {
      els.file.value = '';
      els.fileName.textContent = 'Nenhum arquivo selecionado.';
      els.paste.value = '';
      state.dataset = buildEmptyCorrelationDataset();
      state.lastResult = null;
      renderPreview();
      resetResultVisuals();
      setIntakeStatus('status', 'Area limpa. Escolha um arquivo ou cole uma tabela para continuar.');
    }

    function renderAnalysisResult(result) {
      const { dataset, pearson, spearman, outlierFlags, outlierLabels } = result;
      const active = state.activeMethod === 'spearman' ? spearman : pearson;

      els.error.innerHTML = '';
      els.status.className = 'success-box';
      els.status.textContent = `Analise concluida com ${dataset.x.length} linhas validas. Metodo em destaque: ${methodLabel(state.activeMethod)}.`;

      els.metrics.innerHTML = [
        correlationMetricCard('n', String(dataset.x.length), 'Total de pares validos usados nos calculos.'),
        correlationMetricCard('r de Pearson', utils.fmtSigned(pearson.coef, 3), `p = ${utils.fmtP(pearson.p)} · IC95% ${utils.fmtNumber(pearson.ci[0], 3)} a ${utils.fmtNumber(pearson.ci[1], 3)}`, state.activeMethod === 'pearson' ? 'is-active' : ''),
        correlationMetricCard('R² (Pearson)', utils.fmtNumber(pearson.r2, 3), 'Proporcao da variacao linear de Y explicada por X.'),
        correlationMetricCard('rho de Spearman', utils.fmtSigned(spearman.coef, 3), `p = ${utils.fmtP(spearman.p)} · Metodo por postos.`, state.activeMethod === 'spearman' ? 'is-active' : ''),
        correlationMetricCard('Metodo em destaque', methodLabel(state.activeMethod), state.activeMethod === 'pearson' ? 'Leitura de relacao linear.' : 'Leitura de associacao monotona por postos.'),
        correlationMetricCard('Direcao e forca', `${classifyDirection(active.coef)} · ${classifyStrength(active.coef)}`, 'Resumo baseado no metodo selecionado.')
      ].join('');

      const interpretation = buildMethodInterpretation(dataset, pearson, spearman, outlierLabels, state.activeMethod, utils);
      els.interpretation.innerHTML = `
        <p>${utils.escapeHtml(interpretation)}</p>
        <ul>
          <li>${utils.escapeHtml(compareMessage(pearson, spearman))}</li>
          <li>Inclinacao linear estimada (Pearson): ${utils.fmtSigned(pearson.slope, 3)} em ${utils.escapeHtml(dataset.headers[1])} para cada 1 unidade em ${utils.escapeHtml(dataset.headers[0])}.</li>
        </ul>
      `;

      els.outlier.innerHTML = outlierLabels.length
        ? `<div class="status-bar outlier-note"><strong>Atencao a possiveis outliers:</strong> ${utils.escapeHtml(outlierLabels.slice(0, 6).join(', '))}${outlierLabels.length > 6 ? '...' : ''}. Pearson tende a ser mais sensivel a pontos extremos que Spearman.</div>`
        : '<div class="status-bar">Nenhum ponto se destacou fortemente como outlier pelo criterio de IQR nesta leitura inicial.</div>';

      els.charts.innerHTML = `
        <article class="chart-card">
          <h4>Dispersao com reta de tendencia</h4>
          <div class="chart-wrap">${buildScatterSvg(dataset, pearson, outlierFlags, utils)}</div>
          <div class="small-note">A reta e mostrada para apoiar a interpretacao linear do Pearson, mesmo quando Spearman estiver em destaque.</div>
        </article>
        <article class="chart-card">
          <h4>Pontos com maior distanciamento da reta</h4>
          ${buildInfluenceTable(dataset, pearson, outlierFlags, utils)}
          <div class="small-note" style="margin-top:12px;">Esta tabela substitui o grafico 2 antigo e ajuda a revisar pontos influentes de forma mais direta.</div>
        </article>
      `;
    }

    function runAnalysis() {
      if (!state.dataset.hasContent && normalizeTabularSpaces(els.paste.value)) {
        readPastedData();
      }

      const dataset = state.dataset;
      resetResultVisuals();

      if (!dataset.hasContent || dataset.errors.length) {
        els.error.innerHTML = '<div class="error-box">Leia um arquivo compativel ou cole a tabela no formato padrao antes de rodar a analise.</div>';
        return;
      }

      if (dataset.x.length < 4) {
        els.error.innerHTML = '<div class="error-box">Forneca ao menos 4 pares validos para uma analise mais estavel.</div>';
        return;
      }

      const pearson = stats.pearson(dataset.x, dataset.y);
      const spearman = stats.spearman(dataset.x, dataset.y);

      if (!Number.isFinite(pearson.coef) || !Number.isFinite(spearman.coef)) {
        els.error.innerHTML = '<div class="error-box">Nao foi possivel calcular a correlacao. Revise se as colunas possuem variacao suficiente.</div>';
        return;
      }

      const xOut = outlierMask(dataset.x);
      const yOut = outlierMask(dataset.y);
      const outlierFlags = xOut.map((flag, index) => flag || yOut[index]);
      const outlierLabels = dataset.labels.filter((_, index) => outlierFlags[index]);

      const result = {
        dataset,
        pearson,
        spearman,
        outlierFlags,
        outlierLabels
      };
      state.lastResult = result;
      renderAnalysisResult(result);
    }

    function setActiveMethod(method) {
      state.activeMethod = method === 'spearman' ? 'spearman' : 'pearson';
      Array.from(root.querySelectorAll('[data-correlation-method]')).forEach(button => {
        const isActive = button.getAttribute('data-correlation-method') === state.activeMethod;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      if (state.lastResult) {
        renderAnalysisResult(state.lastResult);
      }
    }

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

    function renderDatasusPreview() {
      if (isMissingElementRef(els.datasusPreview)) return;

      const derived = deriveDatasusPairs();
      datasusState.derived = derived;

      if (!derived.ok) {
        els.datasusPreview.innerHTML = `
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

      els.datasusPreview.innerHTML = `
        <div class="success-box">A base derivada esta pronta para alimentar o modulo de correlacao.</div>
        <div class="small-note" style="margin:14px 0 10px;">Cada linha abaixo corresponde a um par valido X/Y para Pearson e Spearman.</div>
        ${utils.renderPreviewTable(['ID', derived.xLabel || 'X', derived.yLabel || 'Y'], rows, 20)}
      `;
    }

    function pushDatasusToCorrelation() {
      const derived = deriveDatasusPairs();
      datasusState.derived = derived;
      renderDatasusPreview();

      if (!derived.ok) {
        if (!isMissingElementRef(els.datasusControls)) {
          els.datasusControls.innerHTML = `<div class="error-box">${utils.escapeHtml(derived.primaryError || 'Nao ha pares validos suficientes.')}</div>`;
        }
        return;
      }

      els.paste.value = [
        'id;variavel_x;variavel_y',
        ...derived.pairs.map((pair, index) => `${labelForPair(pair) || `Obs ${index + 1}`};${pair.x};${pair.y}`)
      ].join('\n');
      els.file.value = '';
      els.fileName.textContent = 'Nenhum arquivo selecionado.';
      readPastedData('Base derivada do DATASUS enviada para a analise.', 'success');
      runAnalysis();
    }

    function renderDatasusControls() {
      if (isMissingElementRef(els.datasusControls)) return;

      const sources = confirmedSources();
      if (!sources.length) {
        const hasShared = Boolean(shared?.datasus?.lastSession?.confirmedSources?.length);
        els.datasusControls.innerHTML = `
          <div class="status-bar">Confirme uma base DATASUS no wizard para liberar a derivacao da correlacao.</div>
          ${hasShared ? '<div class="actions-row" style="margin-top:14px;"><button type="button" class="btn-secondary" id="c-datasus-use-shared">Usar ultima sessao DATASUS confirmada</button></div>' : ''}
        `;
        if (!isMissingElementRef(els.datasusPreview)) {
          els.datasusPreview.innerHTML = '';
        }
        safeBind(els.datasusControls, '#c-datasus-use-shared', 'click', () => {
          datasusState.sharedSession = clonePlain(shared?.datasus?.lastSession || null);
          renderDatasusControls();
          renderDatasusPreview();
        }, { optional: true, label: 'usar sessao DATASUS compartilhada' });
        return;
      }

      ensureDatasusDefaults();
      const xSource = getSource(datasusState.xSourceId);
      const ySource = getSource(datasusState.ySourceId);
      const xMetrics = getMetricOptions(xSource);
      const yMetrics = getMetricOptions(ySource);
      const timeOptions = availableTimeOptions();

      els.datasusControls.innerHTML = `
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
          <button type="button" class="btn" id="c-datasus-send">Enviar base derivada</button>
        </div>
      `;

      safeBind(els.datasusControls, '#c-datasus-x-source', 'change', event => {
        datasusState.xSourceId = event.target.value;
        ensureDatasusDefaults();
        renderDatasusControls();
        renderDatasusPreview();
      }, { label: 'fonte X DATASUS' });

      safeBind(els.datasusControls, '#c-datasus-y-source', 'change', event => {
        datasusState.ySourceId = event.target.value;
        ensureDatasusDefaults();
        renderDatasusControls();
        renderDatasusPreview();
      }, { label: 'fonte Y DATASUS' });

      safeBind(els.datasusControls, '#c-datasus-x-metric', 'change', event => {
        datasusState.metricBySource[xSource.id] = event.target.value;
        renderDatasusPreview();
      }, { label: 'metrica X DATASUS' });

      safeBind(els.datasusControls, '#c-datasus-y-metric', 'change', event => {
        datasusState.metricBySource[ySource.id] = event.target.value;
        renderDatasusPreview();
      }, { label: 'metrica Y DATASUS' });

      safeBind(els.datasusControls, '#c-datasus-time', 'change', event => {
        datasusState.timeKey = event.target.value;
        renderDatasusPreview();
      }, { label: 'periodo DATASUS' });

      safeBind(els.datasusControls, '#c-datasus-label-mode', 'change', event => {
        datasusState.labelMode = event.target.value;
        renderDatasusPreview();
      }, { label: 'modo de rotulo DATASUS' });

      safeBind(els.datasusControls, '#c-datasus-send', 'click', pushDatasusToCorrelation, { label: 'enviar base DATASUS ao modulo' });
    }

    function mountDatasusWizard() {
      if (isMissingElementRef(els.datasusWizard)) return;
      createDatasusWizard({
        root: els.datasusWizard,
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

    safeBind(root, '#c-file', 'change', async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      await readSelectedFile(file);
    }, { label: 'importar arquivo' });
    safeBind(root, '#c-use-example', 'click', loadExample, { label: 'usar exemplo' });
    safeBind(root, '#c-read-data', 'click', () => readPastedData(), { label: 'ler dados colados' });
    safeBind(root, '#c-clear', 'click', clearAll, { label: 'limpar dados' });
    safeBind(root, '#c-run-analysis', 'click', runAnalysis, { label: 'rodar analise' });
    safeBindAll(root, '[data-correlation-method]', 'click', event => {
      setActiveMethod(event.currentTarget.getAttribute('data-correlation-method'));
    }, { label: 'alternancia Pearson/Spearman' });

    renderPreview();
    resetResultVisuals();
    setIntakeStatus('status', 'Escolha um arquivo ou cole a tabela para ler os dados.');
    mountDatasusWizard();
    renderDatasusControls();
    renderDatasusPreview();
    setActiveMethod('pearson');
  } catch (error) {
    console.error('[correlacao] Falha ao renderizar o modulo.', error);
    root.innerHTML = `
      <div class="module-grid correlacao-module">
        <section class="surface-card">
          <h4>Modulo indisponivel no momento</h4>
          <p class="small-note">Nao foi possivel montar a interface de correlacao agora. Atualize a pagina e tente novamente.</p>
        </section>
      </div>
    `;
  }
}
