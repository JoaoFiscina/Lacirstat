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
