import { createDatasusWizard } from '../../assets/js/datasus-wizard.js';
import {
  derivePraisSeries,
  getCategoryOptions,
  getMetricOptions,
  getPrimaryMetricKey
} from '../../assets/js/datasus-normalizer.js';
import {
  buildRecognizedColumnsChips,
  describeIgnoredRowReason,
  normalizeTabularSpaces,
  parseTabularNumber,
  readTabularFileState,
  readTabularPasteState
} from '../../assets/js/tabular-data-input.js';

const PRAIS_FORMAT_LABEL = 'id;tempo;variavel_y;observacao_opcional';
const PRAIS_HEADER_ALIASES = {
  id: ['id', 'unidade', 'uf', 'serie', 'série', 'nome', 'local'],
  tempo: ['tempo', 'ano', 'year', 'periodo', 'período', 'x', 'variavel_x', 'variável_x'],
  variavel_y: ['variavel_y', 'variável_y', 'variavel y', 'variável y', 'y', 'taxa', 'valor', 'desfecho'],
  observacao_opcional: ['observacao', 'observação', 'obs', 'comentario', 'comentário']
};
const PRAIS_RECOGNIZED_ORDER = [
  { key: 'id', label: 'id' },
  { key: 'tempo', label: 'tempo' },
  { key: 'variavel_y', label: 'variavel_y' },
  { key: 'observacao_opcional', label: 'observacao_opcional' }
];
const PRAIS_POSITION_FALLBACK = {
  keysByIndex: ['id', 'tempo', 'variavel_y', 'observacao_opcional'],
  minColumns: 3,
  requiredKeys: ['tempo', 'variavel_y'],
  introText: 'Nao reconhecemos os nomes padrao das colunas, entao usamos a estrutura por posicao da planilha.',
  assumptionText: 'Assumimos: 1a coluna = identificacao, 2a = tempo, 3a = variavel y.',
  headerText: 'Os nomes do cabecalho foram aproveitados automaticamente na interface.',
  compatibilityValidators: {
    tempo: (raw, runtimeStats) => parseTemporalValue(raw, runtimeStats).numeric !== null
  }
};
const PRAIS_TABULAR_OPTIONS = {
  aliases: PRAIS_HEADER_ALIASES,
  requiredKeys: ['tempo', 'variavel_y'],
  numericKeys: ['tempo', 'variavel_y'],
  expectedFormatLabel: PRAIS_FORMAT_LABEL,
  positionFallback: PRAIS_POSITION_FALLBACK
};
const MIN_TEMPORAL_POINTS = 5;

function clonePlain(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function buildExampleRows(config) {
  const rows = Array.isArray(config?.exampleRows) ? config.exampleRows : [];
  if (!rows.length) {
    return [
      ['Brasil', '2015', '123,4', ''],
      ['Brasil', '2016', '130,2', ''],
      ['Brasil', '2017', '128,9', '']
    ];
  }

  return rows.map(row => {
    const tempo = row?.[0] ?? '';
    const valor = row?.[1] ?? '';
    const obs = row?.[2] ?? '';
    return ['Brasil', String(tempo), String(valor), String(obs)];
  });
}

function buildExampleText(config) {
  const rows = buildExampleRows(config);
  return [
    PRAIS_FORMAT_LABEL,
    ...rows.map(row => row.join(';'))
  ].join('\n');
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

function parseTemporalValue(raw, stats) {
  const cleaned = normalizeTabularSpaces(raw);
  if (!cleaned) {
    return {
      raw: '',
      label: '',
      numeric: null,
      sortKey: '',
      timeType: 'missing'
    };
  }

  const direct = parseTabularNumber(cleaned, stats);
  if (direct !== null) {
    return {
      raw: cleaned,
      label: cleaned,
      numeric: direct,
      sortKey: `num:${direct}`,
      timeType: Number.isInteger(direct) ? 'integer' : 'numeric'
    };
  }

  const compact = cleaned.replace(/\s+/g, '');
  if (/^(18|19|20)\d{2}$/.test(compact)) {
    return {
      raw: cleaned,
      label: compact,
      numeric: Number(compact),
      sortKey: `year:${compact}`,
      timeType: 'year'
    };
  }

  let match = compact.match(/^((18|19|20)\d{2})[-/](0?[1-9]|1[0-2])$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[3]);
    return {
      raw: cleaned,
      label: `${year}-${String(month).padStart(2, '0')}`,
      numeric: year + ((month - 1) / 12),
      sortKey: `${year}-${String(month).padStart(2, '0')}`,
      timeType: 'year-month'
    };
  }

  match = compact.match(/^(0?[1-9]|1[0-2])[-/]((18|19|20)\d{2})$/);
  if (match) {
    const month = Number(match[1]);
    const year = Number(match[2]);
    return {
      raw: cleaned,
      label: `${year}-${String(month).padStart(2, '0')}`,
      numeric: year + ((month - 1) / 12),
      sortKey: `${year}-${String(month).padStart(2, '0')}`,
      timeType: 'month-year'
    };
  }

  return {
    raw: cleaned,
    label: cleaned,
    numeric: null,
    sortKey: '',
    timeType: 'invalid'
  };
}

function formatConvertedTime(value, utils) {
  if (value === null || value === undefined) return '-';
  const whole = Math.abs(value - Math.round(value)) < 1e-9;
  return utils.fmtNumber(value, whole ? 0 : 3);
}

function formatConvertedY(value, utils) {
  if (value === null || value === undefined) return '-';
  const digits = Math.abs(value) >= 100 ? 1 : 3;
  return utils.fmtNumber(value, digits);
}

function trendStrength(apc) {
  const abs = Math.abs(apc);
  if (abs < 1) return 'muito discreta';
  if (abs < 3) return 'leve';
  if (abs < 6) return 'moderada';
  return 'marcante';
}

function buildEmptyPraisDataset(sourceKind = 'paste', sourceLabel = 'Dados colados') {
  return {
    sourceKind,
    sourceLabel,
    hasContent: false,
    rows: [],
    validRows: [],
    orderedRows: [],
    ignoredRows: [],
    time: [],
    values: [],
    previewHeaders: {
      id: 'id',
      tempo: 'tempo',
      y: 'variavel_y',
      observation: 'observacao_opcional'
    },
    timeHeaderLabel: 'tempo',
    yHeaderLabel: 'variavel_y',
    recognizedColumns: {},
    uniqueIds: [],
    errors: [],
    warnings: [],
    infos: [],
    reordered: false,
    duplicateTimes: [],
    fileMeta: null,
    periodLabel: '',
    timeTypeSummary: '',
    validCount: 0
  };
}

function buildPraisDatasetFromTabularState(fileState, stats, sourceMeta = {}) {
  const {
    sourceKind = fileState?.sourceType || 'paste',
    sourceLabel = sourceKind === 'file' ? 'Arquivo importado' : 'Dados colados'
  } = sourceMeta;

  if (!fileState || fileState.status !== 'loaded') {
    const dataset = buildEmptyPraisDataset(sourceKind, sourceLabel);
    if (fileState?.message) dataset.errors.push(fileState.message);
    if (Array.isArray(fileState?.details)) dataset.infos.push(...fileState.details);
    dataset.hasContent = Boolean(fileState?.message);
    return dataset;
  }

  const recognizedColumns = fileState.recognizedColumns || {};
  const bodyRows = Array.isArray(fileState.bodyRows) ? fileState.bodyRows : [];
  const mappedRows = bodyRows.map((row, index) => ({
    index: index + 1,
    idRaw: recognizedColumns.id ? row[recognizedColumns.id.index] || '' : '',
    timeRaw: recognizedColumns.tempo ? row[recognizedColumns.tempo.index] || '' : '',
    yRaw: recognizedColumns.variavel_y ? row[recognizedColumns.variavel_y.index] || '' : '',
    observationRaw: recognizedColumns.observacao_opcional ? row[recognizedColumns.observacao_opcional.index] || '' : ''
  }));

  const hasContent = mappedRows.some(row => (
    normalizeTabularSpaces(row.idRaw)
    || normalizeTabularSpaces(row.timeRaw)
    || normalizeTabularSpaces(row.yRaw)
    || normalizeTabularSpaces(row.observationRaw)
  ));

  const dataset = {
    ...buildEmptyPraisDataset(sourceKind, sourceLabel),
    hasContent,
    recognizedColumns,
    previewHeaders: {
      id: recognizedColumns.id?.header || 'id',
      tempo: recognizedColumns.tempo?.header || 'tempo',
      y: recognizedColumns.variavel_y?.header || 'variavel_y',
      observation: recognizedColumns.observacao_opcional?.header || 'observacao_opcional'
    },
    timeHeaderLabel: recognizedColumns.tempo?.header || 'tempo',
    yHeaderLabel: recognizedColumns.variavel_y?.header || 'variavel_y',
    fileMeta: {
      fileName: fileState.fileName,
      tableName: fileState.tableName,
      formatLabel: fileState.formatLabel,
      delimiter: fileState.delimiter,
      headerRowIndex: fileState.headerRowIndex
    }
  };

  if (!hasContent) {
    dataset.infos.push('Nenhuma linha preenchida foi identificada após o cabeçalho.');
    return dataset;
  }

  if (!recognizedColumns.tempo) {
    dataset.errors.push('Não encontramos uma coluna compatível com tempo/ano.');
  }
  if (!recognizedColumns.variavel_y) {
    dataset.errors.push('Não encontramos uma coluna compatível com variável y/desfecho.');
  }

  const timeTypeCount = new Map();

  mappedRows.forEach(row => {
    const idRaw = normalizeTabularSpaces(row.idRaw);
    const timeRaw = normalizeTabularSpaces(row.timeRaw);
    const yRaw = normalizeTabularSpaces(row.yRaw);
    const observationRaw = normalizeTabularSpaces(row.observationRaw);
    const timeInfo = parseTemporalValue(timeRaw, stats);
    const yValue = parseTabularNumber(yRaw, stats);
    const rowLabel = idRaw || `Linha ${row.index}`;
    const notes = [];
    let statusLabel = 'Ignorada';
    let statusTone = 'ignored';

    if (!timeRaw) {
      notes.push('a coluna temporal está vazia.');
    } else if (timeInfo.numeric === null) {
      notes.push('tempo não contém valor numérico ou ordenável válido.');
    }

    if (!yRaw) {
      notes.push('variavel_y está vazia.');
    } else if (yValue === null) {
      notes.push('a variável y não contém valor numérico válido.');
    } else if (yValue <= 0) {
      notes.push('a variável y precisa ser maior que zero para o modelo log10.');
    }

    if (timeInfo.numeric !== null && yValue !== null && yValue > 0) {
      statusLabel = 'Válida';
      statusTone = 'valid';
      dataset.validRows.push({
        index: row.index,
        idLabel: rowLabel,
        idRaw,
        timeRaw,
        timeLabel: timeInfo.label || timeRaw,
        timeValue: timeInfo.numeric,
        timeSortKey: timeInfo.sortKey,
        yRaw,
        yValue,
        observationRaw,
        timeType: timeInfo.timeType
      });
      dataset.time.push(timeInfo.numeric);
      dataset.values.push(yValue);
      timeTypeCount.set(timeInfo.timeType, (timeTypeCount.get(timeInfo.timeType) || 0) + 1);
    }

    dataset.rows.push({
      index: row.index,
      idLabel: rowLabel,
      timeRaw,
      yRaw,
      timeValue: timeInfo.numeric,
      yValue,
      observationRaw,
      statusLabel,
      statusTone,
      notes
    });
  });

  dataset.ignoredRows = dataset.rows.filter(row => row.statusTone === 'ignored');
  dataset.validCount = dataset.validRows.length;
  dataset.orderedRows = [...dataset.validRows]
    .sort((left, right) => {
      if (left.timeValue !== right.timeValue) return left.timeValue - right.timeValue;
      return left.index - right.index;
    });
  dataset.reordered = dataset.validRows.some((row, index) => row.index !== dataset.orderedRows[index]?.index);
  dataset.time = dataset.orderedRows.map(row => row.timeValue);
  dataset.values = dataset.orderedRows.map(row => row.yValue);

  const duplicateMap = new Map();
  dataset.orderedRows.forEach(row => {
    const list = duplicateMap.get(row.timeSortKey) || [];
    list.push(row.timeLabel);
    duplicateMap.set(row.timeSortKey, list);
  });
  dataset.duplicateTimes = [...duplicateMap.values()]
    .filter(list => list.length > 1)
    .map(list => list[0]);

  if (dataset.duplicateTimes.length) {
    dataset.errors.push(`Há tempos repetidos na série (${dataset.duplicateTimes.slice(0, 4).join(', ')}${dataset.duplicateTimes.length > 4 ? ', ...' : ''}). Mantenha um único valor por tempo.`);
  }

  if (recognizedColumns.id) {
    dataset.uniqueIds = [...new Set(dataset.validRows.map(row => row.idRaw).filter(Boolean))];
    if (dataset.uniqueIds.length > 1) {
      dataset.errors.push(`Foram encontrados ${dataset.uniqueIds.length} IDs distintos. O Prais-Winsten deve analisar uma única série por vez.`);
    }
  }

  if (dataset.validRows.length) {
    const first = dataset.orderedRows[0];
    const last = dataset.orderedRows[dataset.orderedRows.length - 1];
    dataset.periodLabel = first.timeLabel === last.timeLabel
      ? first.timeLabel
      : `${first.timeLabel} a ${last.timeLabel}`;
  }

  if (fileState.delimiter === ';') {
    dataset.infos.push(`${sourceKind === 'file' ? 'Arquivo' : 'Conteúdo colado'} lido no padrão ponto e vírgula (;).`);
  } else if (fileState.delimiter === '\t') {
    dataset.infos.push('Conteúdo tabulado do Excel interpretado automaticamente.');
  } else if (fileState.delimiter === ',') {
    dataset.infos.push('Arquivo CSV/TXT com vírgulas estruturais interpretado automaticamente.');
  }

  if (fileState.decimalCommaDetected) {
    dataset.infos.push('Números com vírgula decimal foram convertidos automaticamente.');
  }
  if (fileState.usedPositionalFallback) {
    dataset.infos.push(...fileState.recognitionDetails);
  }

  if (recognizedColumns.tempo) {
    dataset.infos.push(`A coluna de tempo foi reconhecida como: ${recognizedColumns.tempo.header}.`);
  }
  if (recognizedColumns.variavel_y) {
    dataset.infos.push(`A coluna de y foi reconhecida como: ${recognizedColumns.variavel_y.header}.`);
  }
  if (recognizedColumns.id) {
    dataset.infos.push(`A coluna de ID foi reconhecida como: ${recognizedColumns.id.header}. O ID entra apenas como rótulo.`);
  } else {
    dataset.infos.push('Nenhuma coluna de ID foi reconhecida; a prévia usa a ordem das linhas como referência.');
  }

  if (dataset.reordered) {
    dataset.infos.push('A série foi ordenada crescentemente por tempo para a análise.');
  }

  if (fileState.duplicates?.length) {
    dataset.warnings.push(`Cabeçalhos duplicados foram ignorados: ${fileState.duplicates.join(', ')}.`);
  }

  dataset.ignoredRows
    .slice(0, 3)
    .forEach(row => dataset.warnings.push(describeIgnoredRowReason(row.index, row.notes)));
  const remainingIgnored = dataset.ignoredRows.length - 3;
  if (remainingIgnored > 0) {
    dataset.warnings.push(`Outras ${remainingIgnored} linhas também foram ignoradas por problemas em tempo ou variável y.`);
  }

  if (dataset.validRows.length > 0 && dataset.validRows.length < MIN_TEMPORAL_POINTS) {
    dataset.warnings.push(`A série tem ${dataset.validRows.length} pontos válidos. Recomenda-se pelo menos ${MIN_TEMPORAL_POINTS} para maior estabilidade.`);
  }

  const dominantTimeType = [...timeTypeCount.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || '';
  if (dominantTimeType === 'year') dataset.timeTypeSummary = 'anos';
  else if (dominantTimeType === 'year-month' || dominantTimeType === 'month-year') dataset.timeTypeSummary = 'competências mensais';
  else if (dominantTimeType) dataset.timeTypeSummary = 'valores numéricos ordenáveis';
  if (dataset.timeTypeSummary) {
    dataset.infos.push(`A variável temporal foi interpretada como ${dataset.timeTypeSummary}.`);
  }

  return dataset;
}

function buildPraisPreviewTable(dataset, utils, limit = 14) {
  const rows = dataset.rows.slice(0, limit);
  const idHeader = dataset.previewHeaders?.id || 'id';
  const timeHeader = dataset.previewHeaders?.tempo || 'tempo';
  const yHeader = dataset.previewHeaders?.y || 'variavel_y';

  return `
    <div class="preview-table-wrap">
      <table class="preview-table prais-preview-table">
        <thead>
          <tr>
            <th>${utils.escapeHtml(idHeader)}</th>
            <th>${utils.escapeHtml(timeHeader)} bruto</th>
            <th>${utils.escapeHtml(yHeader)} bruto</th>
            <th>${utils.escapeHtml(timeHeader)} convertido</th>
            <th>${utils.escapeHtml(yHeader)} convertido</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map(row => `
            <tr class="${row.statusTone === 'ignored' ? 'prais-preview-row-ignored' : 'prais-preview-row-valid'}">
              <td>${utils.escapeHtml(row.idLabel)}</td>
              <td>${utils.escapeHtml(row.timeRaw || '-')}</td>
              <td>${utils.escapeHtml(row.yRaw || '-')}</td>
              <td>${formatConvertedTime(row.timeValue, utils)}</td>
              <td>${formatConvertedY(row.yValue, utils)}</td>
              <td>
                <div class="prais-preview-status">
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

function buildDerivedSeriesTable(dataset, utils, limit = 14) {
  if (!dataset.orderedRows.length) {
    return '<div class="small-note">A série final aparecerá aqui após a leitura dos dados.</div>';
  }

  const rows = dataset.orderedRows.slice(0, limit).map(row => [
    row.idLabel,
    row.timeLabel,
    formatConvertedY(row.yValue, utils)
  ]);

  return `
    <div class="small-note" style="margin-bottom:10px;">
      Série pronta para análise em ordem temporal${dataset.reordered ? ' (reordenada automaticamente)' : ''}.
    </div>
    ${utils.renderPreviewTable(['ID', dataset.timeHeaderLabel, dataset.yHeaderLabel], rows, limit)}
  `;
}

function buildFormatPreview(config, utils) {
  const exampleRows = buildExampleRows(config).slice(0, 4);
  return `
    <div class="prais-format-box">
      <div class="small-note">Formato recomendado: <strong>${utils.escapeHtml(PRAIS_FORMAT_LABEL)}</strong></div>
      <div class="preview-table-wrap" style="margin-top:12px;">
        <table class="preview-table">
          <thead>
            <tr>
              <th>id</th>
              <th>tempo</th>
              <th>variavel_y</th>
              <th>observacao_opcional</th>
            </tr>
          </thead>
          <tbody>
            ${exampleRows.map(row => `<tr>${row.map(value => `<td>${utils.escapeHtml(value || '-')}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="small-note" style="margin-top:12px;">
        Tempo é a variável independente. Variável y é o desfecho. ID entra apenas como rótulo da série.
      </div>
    </div>
  `;
}

function buildMainTrendSvg(time, observed, fitted, pointLabels, axisLabels, utils) {
  const width = 920;
  const height = 430;
  const margin = { top: 26, right: 26, bottom: 72, left: 82 };
  const xMin = Math.min(...time);
  const xMax = Math.max(...time);
  const yMinRaw = Math.min(...observed, ...fitted);
  const yMaxRaw = Math.max(...observed, ...fitted);
  const yPad = yMinRaw === yMaxRaw ? 1 : (yMaxRaw - yMinRaw) * 0.12;
  const yMin = Math.max(0, yMinRaw - yPad);
  const yMax = yMaxRaw + yPad;
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const xToPx = x => margin.left + ((x - xMin) / (xMax - xMin || 1)) * innerW;
  const yToPx = y => height - margin.bottom - ((y - yMin) / (yMax - yMin || 1)) * innerH;
  const steps = Math.min(6, Math.max(4, time.length));
  const yTicks = Array.from({ length: 5 }, (_, index) => yMin + ((yMax - yMin) * index) / 4);
  const xTicks = Array.from({ length: steps }, (_, index) => xMin + ((xMax - xMin) * index) / (steps - 1 || 1));
  const obsPath = observed.map((value, index) => `${index === 0 ? 'M' : 'L'} ${xToPx(time[index]).toFixed(2)} ${yToPx(value).toFixed(2)}`).join(' ');
  const fitPath = fitted.map((value, index) => `${index === 0 ? 'M' : 'L'} ${xToPx(time[index]).toFixed(2)} ${yToPx(value).toFixed(2)}`).join(' ');

  return `
    <svg viewBox="0 0 ${width} ${height}" class="timeseries-svg" role="img" aria-label="Série temporal com tendência ajustada">
      <rect x="0" y="0" width="${width}" height="${height}" rx="20" fill="#ffffff"/>
      ${xTicks.map(tick => `
        <g>
          <line x1="${xToPx(tick).toFixed(2)}" y1="${margin.top}" x2="${xToPx(tick).toFixed(2)}" y2="${height - margin.bottom}" stroke="#edf2fb"/>
          <text x="${xToPx(tick).toFixed(2)}" y="${height - margin.bottom + 24}" text-anchor="middle" fill="#60728d" font-size="12">${formatConvertedTime(tick, utils)}</text>
        </g>`).join('')}
      ${yTicks.map(tick => `
        <g>
          <line x1="${margin.left}" y1="${yToPx(tick).toFixed(2)}" x2="${width - margin.right}" y2="${yToPx(tick).toFixed(2)}" stroke="#dbe5f4" stroke-dasharray="4 6"/>
          <text x="${margin.left - 14}" y="${(yToPx(tick) + 4).toFixed(2)}" text-anchor="end" fill="#60728d" font-size="12">${utils.fmtNumber(tick, 1)}</text>
        </g>`).join('')}
      <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" stroke="#89a0bc"/>
      <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" stroke="#89a0bc"/>
      <path d="${obsPath}" fill="none" stroke="#2563eb" stroke-width="3" stroke-linecap="round"/>
      <path d="${fitPath}" fill="none" stroke="#0f766e" stroke-width="3" stroke-linecap="round" stroke-dasharray="10 6"/>
      ${observed.map((value, index) => `<circle cx="${xToPx(time[index]).toFixed(2)}" cy="${yToPx(value).toFixed(2)}" r="4.8" fill="#2563eb" stroke="#ffffff" stroke-width="2"><title>${utils.escapeHtml(pointLabels[index])}: ${utils.fmtNumber(value, 2)}</title></circle>`).join('')}
      <text x="${width / 2}" y="${height - 20}" text-anchor="middle" fill="#364b65" font-size="13">${utils.escapeHtml(axisLabels.x)}</text>
      <text x="24" y="${height / 2}" text-anchor="middle" transform="rotate(-90 24 ${height / 2})" fill="#364b65" font-size="13">${utils.escapeHtml(axisLabels.y)}</text>
    </svg>
  `;
}

function buildResidualSvg(time, residuals, pointLabels, axisLabels, utils) {
  const width = 920;
  const height = 320;
  const margin = { top: 24, right: 26, bottom: 62, left: 82 };
  const xMin = Math.min(...time);
  const xMax = Math.max(...time);
  const rMin = Math.min(...residuals, 0);
  const rMax = Math.max(...residuals, 0);
  const pad = rMin === rMax ? 0.2 : (rMax - rMin) * 0.18;
  const yMin = rMin - pad;
  const yMax = rMax + pad;
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const xToPx = x => margin.left + ((x - xMin) / (xMax - xMin || 1)) * innerW;
  const yToPx = y => height - margin.bottom - ((y - yMin) / (yMax - yMin || 1)) * innerH;
  const path = residuals.map((value, index) => `${index === 0 ? 'M' : 'L'} ${xToPx(time[index]).toFixed(2)} ${yToPx(value).toFixed(2)}`).join(' ');
  const zeroY = yToPx(0).toFixed(2);

  return `
    <svg viewBox="0 0 ${width} ${height}" class="timeseries-svg" role="img" aria-label="Resíduos ao longo do tempo">
      <rect x="0" y="0" width="${width}" height="${height}" rx="20" fill="#ffffff"/>
      <line x1="${margin.left}" y1="${zeroY}" x2="${width - margin.right}" y2="${zeroY}" stroke="#94a3b8" stroke-dasharray="6 4"/>
      <path d="${path}" fill="none" stroke="#7c3aed" stroke-width="2.8"/>
      ${residuals.map((value, index) => `<circle cx="${xToPx(time[index]).toFixed(2)}" cy="${yToPx(value).toFixed(2)}" r="4.2" fill="#7c3aed" stroke="#fff" stroke-width="1.6"><title>${utils.escapeHtml(pointLabels[index])}: ${utils.fmtSigned(value, 4)}</title></circle>`).join('')}
      <text x="${width / 2}" y="${height - 16}" text-anchor="middle" fill="#364b65" font-size="13">${utils.escapeHtml(axisLabels.x)}</text>
      <text x="24" y="${height / 2}" text-anchor="middle" transform="rotate(-90 24 ${height / 2})" fill="#364b65" font-size="13">${utils.escapeHtml(axisLabels.y)}</text>
    </svg>
  `;
}

function buildInterpretation(model, dataset, context) {
  const pText = model.p < 0.05 ? 'com evidência estatística' : 'sem evidência estatística robusta';
  const directionText = model.classification === 'crescente'
    ? 'os valores tenderam a aumentar ao longo do período'
    : model.classification === 'decrescente'
      ? 'os valores tenderam a diminuir ao longo do período'
      : 'não houve mudança consistente ao longo do período';
  const idText = dataset.uniqueIds.length === 1 ? ` para ${dataset.uniqueIds[0]}` : '';
  return `Analisou-se a tendência temporal de ${dataset.yHeaderLabel}${idText} em ${dataset.periodLabel || 'todo o período disponível'}, com ${dataset.validRows.length} pontos válidos. A série foi classificada como ${model.classification}, ${pText}; em termos práticos, ${directionText}. Contexto informado: ${context || 'tendência temporal do indicador'}.`;
}

function buildResidualSummaryRows(orderedRows, fitted, residuals) {
  return orderedRows.map((row, index) => ({
    idLabel: row.idLabel,
    timeLabel: row.timeLabel,
    observed: row.yValue,
    fitted: fitted[index],
    residual: residuals[index]
  }));
}

function buildResidualSummaryTable(rows, utils, limit = 6) {
  const ranked = [...rows]
    .sort((left, right) => Math.abs(right.residual) - Math.abs(left.residual))
    .slice(0, limit);

  return `
    <div class="preview-table-wrap">
      <table class="preview-table prais-preview-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Tempo</th>
            <th>Y observado</th>
            <th>Y ajustado</th>
            <th>Resíduo (log10)</th>
          </tr>
        </thead>
        <tbody>
          ${ranked.map(row => `
            <tr>
              <td>${utils.escapeHtml(row.idLabel)}</td>
              <td>${utils.escapeHtml(row.timeLabel)}</td>
              <td>${formatConvertedY(row.observed, utils)}</td>
              <td>${formatConvertedY(row.fitted, utils)}</td>
              <td>${utils.fmtSigned(row.residual, 4)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function metricCard(label, value, note = '') {
  return `
    <article class="metric-card">
      <div class="metric-label">${label}</div>
      <div class="metric-value">${value}</div>
      <div class="metric-mini">${note}</div>
    </article>
  `;
}

export async function renderTestModule(ctx) {
  const { root, config, utils, stats, shared } = ctx;
  const exampleText = buildExampleText(config);

  root.classList.add('prais-module');
  root.innerHTML = `
    <div class="module-grid">
      <section class="module-header">
        <div class="chip chip-primary">Módulo didático • Prais-Winsten</div>
        <h3>${utils.escapeHtml(config.title)}</h3>
        <p>${utils.escapeHtml(config.description)}</p>
      </section>

      <section class="callout-grid prais-cards">
        ${(config.didacticCards || []).map(card => `
          <article class="tip-card didactic-card">
            <h4>${utils.escapeHtml(card.title)}</h4>
            <p>${utils.escapeHtml(card.text)}</p>
          </article>
        `).join('')}
      </section>

      <section class="surface-card decorated">
        <h4>Camada Universal DATASUS</h4>
        <p class="small-note">Importe, revise e confirme a base DATASUS. Depois escolha a categoria e a medida para montar a série temporal final.</p>
        <div id="pw-datasus-wizard" style="margin-top:14px;"></div>
      </section>

      <section class="surface-card">
        <h4>Série derivada do DATASUS</h4>
        <div id="pw-datasus-controls" class="small-note">Confirme uma base DATASUS para liberar a montagem assistida da série.</div>
        <div id="pw-datasus-preview" style="margin-top:14px;"></div>
      </section>

      <section class="surface-card decorated">
        <h4>Importar arquivo e colar dados</h4>
        <p class="small-note">O módulo agora lê entrada por colunas no padrão de planilha. Use preferencialmente <strong>${utils.escapeHtml(PRAIS_FORMAT_LABEL)}</strong>, mas também aceitamos cabeçalhos equivalentes por alias.</p>
        ${buildFormatPreview(config, utils)}
        <div class="prais-intake-grid" style="margin-top:16px;">
          <article class="mini-card prais-step-card">
            <div class="small-chip info">1. Importar arquivo</div>
            <p>CSV com ponto e vírgula, TXT, TSV e colagem do Excel são aceitos. O delimitador é detectado automaticamente, com prioridade para <code>;</code>.</p>
            <input id="pw-file" type="file" accept=".csv,.txt,.tsv,.xlsx" hidden />
            <div class="actions-row" style="margin-top:12px;">
              <button id="pw-import" type="button" class="btn-secondary">Importar arquivo</button>
              <button id="pw-example" type="button" class="btn-secondary">Usar exemplo</button>
              <button id="pw-clear" type="button" class="btn-ghost">Limpar</button>
            </div>
            <div id="pw-file-status" class="prais-file-status" style="margin-top:14px;">Nenhum arquivo selecionado.</div>
          </article>

          <article class="mini-card prais-step-card">
            <div class="small-chip info">2. Colar dados</div>
            <label for="pw-paste" style="margin-top:10px;">Tabela por colunas</label>
            <textarea id="pw-paste" spellcheck="false" placeholder="id;tempo;variavel_y;observacao_opcional&#10;Brasil;2015;123,4;&#10;Brasil;2016;130,2;"></textarea>
          </article>
        </div>
        <div class="prais-review-grid" style="margin-top:16px;">
          <div>
            <label for="pw-context">Contexto da análise</label>
            <input id="pw-context" type="text" value="Tendência temporal do indicador em dados agregados" />
          </div>
          <article class="mini-card prais-run-card">
            <div class="small-chip primary">Rodar análise</div>
            <p>Tempo é a variável independente. Variável y é o desfecho. ID entra apenas como rótulo.</p>
            <div class="actions-row" style="margin-top:12px;">
              <button id="pw-read" type="button" class="btn-secondary">Ler dados</button>
              <button id="pw-run" type="button" class="btn">Rodar análise</button>
            </div>
          </article>
        </div>
      </section>

      <section class="surface-card">
        <h4>3. Prévia / revisão</h4>
        <div id="pw-preview-meta" class="prais-preview-cards"></div>
        <div id="pw-preview-messages" style="margin-top:14px;"></div>
        <div id="pw-preview-table" style="margin-top:14px;"></div>
        <div id="pw-preview-series" style="margin-top:14px;"></div>
      </section>

      <section class="surface-card">
        <h4>4. Resultado da análise</h4>
        <div id="pw-error"></div>
        <div id="pw-status" class="status-bar">Carregue, leia e revise uma série temporal para iniciar a análise.</div>
        <div id="pw-metrics" class="metrics-grid" style="margin-top:14px;"></div>
        <div id="pw-charts" class="chart-grid" style="margin-top:14px;"></div>
        <div id="pw-results" class="result-grid" style="margin-top:14px;"></div>
      </section>
    </div>
  `;

  const els = {
    context: root.querySelector('#pw-context'),
    importButton: root.querySelector('#pw-import'),
    exampleButton: root.querySelector('#pw-example'),
    clearButton: root.querySelector('#pw-clear'),
    readButton: root.querySelector('#pw-read'),
    runButton: root.querySelector('#pw-run'),
    file: root.querySelector('#pw-file'),
    fileStatus: root.querySelector('#pw-file-status'),
    paste: root.querySelector('#pw-paste'),
    previewMeta: root.querySelector('#pw-preview-meta'),
    previewMessages: root.querySelector('#pw-preview-messages'),
    previewTable: root.querySelector('#pw-preview-table'),
    previewSeries: root.querySelector('#pw-preview-series'),
    error: root.querySelector('#pw-error'),
    status: root.querySelector('#pw-status'),
    metrics: root.querySelector('#pw-metrics'),
    charts: root.querySelector('#pw-charts'),
    results: root.querySelector('#pw-results')
  };
  const datasusWizardEl = root.querySelector('#pw-datasus-wizard');
  const datasusControlsEl = root.querySelector('#pw-datasus-controls');
  const datasusPreviewEl = root.querySelector('#pw-datasus-preview');

  const state = {
    dataset: buildEmptyPraisDataset(),
    fileState: null,
    lastFileName: '',
    activeSource: 'none',
    session: null,
    sharedSession: clonePlain(shared?.datasus?.lastSession || null),
    sourceId: '',
    metricBySource: {},
    categoryKey: '',
    derived: null
  };

  function currentDatasusSession() {
    if (state.session?.confirmedSources?.length) return state.session;
    if (state.sharedSession?.confirmedSources?.length) return state.sharedSession;
    return null;
  }

  function confirmedSources() {
    return currentDatasusSession()?.confirmedSources || [];
  }

  function getSource(sourceId) {
    return confirmedSources().find(source => source.id === sourceId) || null;
  }

  function ensureDatasusDefaults() {
    const sources = confirmedSources();
    if (!sources.length) {
      state.derived = null;
      state.sourceId = '';
      state.categoryKey = '';
      return;
    }

    if (!sources.some(source => source.id === state.sourceId)) {
      state.sourceId = sources[0].id;
    }

    sources.forEach(source => {
      if (!state.metricBySource[source.id]) {
        state.metricBySource[source.id] = getPrimaryMetricKey(source);
      }
    });

    const source = getSource(state.sourceId);
    const categories = getCategoryOptions(source, true);
    if (!categories.some(option => option.key === state.categoryKey)) {
      state.categoryKey = categories[0]?.key || '';
    }
  }

  function deriveDatasusSeries() {
    ensureDatasusDefaults();
    const source = getSource(state.sourceId);

    if (!source) {
      return {
        ok: false,
        primaryError: 'Confirme pelo menos uma base DATASUS para montar a série temporal.',
        errors: ['Confirme pelo menos uma base DATASUS para montar a série temporal.'],
        rows: []
      };
    }

    return derivePraisSeries({
      source,
      metricKey: state.metricBySource[source.id],
      categoryKey: state.categoryKey,
      stats
    });
  }

  function clearOutput(statusMessage = 'Área limpa. Leia uma série temporal para iniciar a análise.') {
    els.error.innerHTML = '';
    els.status.className = 'status-bar';
    els.status.textContent = statusMessage;
    els.metrics.innerHTML = '';
    els.charts.innerHTML = '';
    els.results.innerHTML = '';
  }

  function renderFileStatus() {
    if (state.activeSource === 'file' && state.fileState) {
      if (state.fileState.status === 'error') {
        els.fileStatus.innerHTML = `<div class="error-box">${utils.escapeHtml(state.fileState.message || 'Não foi possível interpretar o arquivo.')}</div>`;
        return;
      }

      const pieces = [
        `Arquivo: ${state.fileState.fileName}`,
        state.fileState.tableName ? `Bloco: ${state.fileState.tableName}` : '',
        state.fileState.formatLabel ? `Formato: ${state.fileState.formatLabel}` : '',
        Number.isInteger(state.fileState.headerRowIndex) ? `Cabeçalho na linha ${state.fileState.headerRowIndex + 1}` : ''
      ].filter(Boolean);

      els.fileStatus.innerHTML = `
        <div class="success-box">${utils.escapeHtml(pieces.join(' · '))}</div>
      `;
      return;
    }

    if (state.activeSource === 'paste') {
      els.fileStatus.innerHTML = '<div class="status-bar">Prévia baseada no conteúdo colado na área de texto.</div>';
      return;
    }

    els.fileStatus.textContent = 'Nenhum arquivo selecionado.';
  }

  function renderPreview(dataset = state.dataset) {
    state.dataset = dataset;
    renderFileStatus();

    if (!dataset.hasContent) {
      els.previewMeta.innerHTML = `
        <article class="mini-card"><h4>Fonte</h4><p>Nenhum conteúdo lido</p></article>
        <article class="mini-card"><h4>Tempo</h4><p>Aguardando leitura</p></article>
        <article class="mini-card"><h4>Variável y</h4><p>Aguardando leitura</p></article>
        <article class="mini-card"><h4>Pontos válidos</h4><p>0</p></article>
      `;
      els.previewMessages.innerHTML = buildFeedbackBox(
        dataset.errors.length ? dataset.errors : ['Cole dados, importe um arquivo ou use o exemplo para montar a prévia.'],
        dataset.errors.length ? 'error-box' : 'status-bar',
        utils
      );
      els.previewTable.innerHTML = '<div class="small-note">Nenhuma linha interpretada ainda.</div>';
      els.previewSeries.innerHTML = '<div class="small-note">A série final aparecerá aqui após a leitura dos dados.</div>';
      return dataset;
    }

    const recognizedChips = buildRecognizedColumnsChips(dataset.recognizedColumns, PRAIS_RECOGNIZED_ORDER);
    const orderingText = dataset.reordered ? 'Reordenada por tempo' : 'Ordem temporal já estava correta';
    const sourceText = dataset.sourceKind === 'file' ? (dataset.fileMeta?.fileName || 'Arquivo importado') : 'Dados colados';

    els.previewMeta.innerHTML = `
      <article class="mini-card"><h4>Fonte</h4><p>${utils.escapeHtml(sourceText)}</p></article>
      <article class="mini-card"><h4>Tempo reconhecido</h4><p>${utils.escapeHtml(dataset.timeHeaderLabel)}</p></article>
      <article class="mini-card"><h4>Variável y reconhecida</h4><p>${utils.escapeHtml(dataset.yHeaderLabel)}</p></article>
      <article class="mini-card"><h4>Pontos válidos</h4><p>${dataset.validCount}</p></article>
      <article class="mini-card"><h4>Período</h4><p>${utils.escapeHtml(dataset.periodLabel || 'Ainda não definido')}</p></article>
      <article class="mini-card"><h4>Ordenação</h4><p>${utils.escapeHtml(orderingText)}</p></article>
    `;

    els.previewMessages.innerHTML = [
      recognizedChips ? `<div class="prais-chip-row">${recognizedChips}</div>` : '',
      buildFeedbackBox(dataset.errors, 'error-box', utils, 'Validação'),
      buildFeedbackBox(dataset.warnings, 'status-bar', utils, 'Atenção'),
      buildFeedbackBox(dataset.infos, 'success-box', utils, 'Leitura')
    ].join('');

    els.previewTable.innerHTML = buildPraisPreviewTable(dataset, utils, 14);
    els.previewSeries.innerHTML = buildDerivedSeriesTable(dataset, utils, 14);
    return dataset;
  }

  function buildDatasetFromPaste() {
    const fileState = readTabularPasteState(els.paste.value, stats, PRAIS_TABULAR_OPTIONS);
    state.fileState = fileState;
    state.activeSource = 'paste';
    state.lastFileName = '';
    return buildPraisDatasetFromTabularState(fileState, stats, {
      sourceKind: 'paste',
      sourceLabel: 'Dados colados'
    });
  }

  async function buildDatasetFromFile(file) {
    const fileState = await readTabularFileState(file, utils, stats, PRAIS_TABULAR_OPTIONS);
    state.fileState = fileState;
    state.activeSource = 'file';
    state.lastFileName = file?.name || '';
    return buildPraisDatasetFromTabularState(fileState, stats, {
      sourceKind: 'file',
      sourceLabel: 'Arquivo importado'
    });
  }

  async function readCurrentInput() {
    const pastedContent = String(els.paste.value || '').trim();
    if (pastedContent) {
      return renderPreview(buildDatasetFromPaste());
    }

    const file = els.file.files?.[0];
    if (file) {
      return renderPreview(await buildDatasetFromFile(file));
    }

    state.activeSource = 'none';
    return renderPreview(buildEmptyPraisDataset());
  }

  async function pushDatasusToPrais() {
    const derived = deriveDatasusSeries();
    state.derived = derived;
    renderDatasusPreview();

    if (!derived.ok) {
      datasusControlsEl.innerHTML = `<div class="error-box">${utils.escapeHtml(derived.primaryError || 'Não há série temporal suficiente.')}</div>`;
      return;
    }

    const source = getSource(state.sourceId);
    const categoryLabel = derived.categoryLabel || source?.fileName || 'Série DATASUS';
    const lines = [
      PRAIS_FORMAT_LABEL,
      ...derived.rows.map(row => `${categoryLabel};${row.timeLabel};${row.value};`)
    ];

    els.paste.value = lines.join('\n');
    els.file.value = '';
    await readCurrentInput();
    await runAnalysis();
    els.status.className = 'success-box';
    els.status.textContent = `Série derivada do DATASUS enviada ao módulo com ${derived.rows.length} pontos válidos.`;
  }

  function renderDatasusPreview() {
    const derived = deriveDatasusSeries();
    state.derived = derived;

    if (!derived.ok) {
      datasusPreviewEl.innerHTML = `
        <div class="error-box">
          <strong>Série derivada ainda inválida.</strong>
          <ul class="datasus-inline-list">
            ${(derived.errors || [derived.primaryError || 'Não há série temporal suficiente.']).map(item => `<li>${utils.escapeHtml(item)}</li>`).join('')}
          </ul>
        </div>
      `;
      return;
    }

    const rows = derived.rows.map(row => [row.timeLabel, utils.fmtNumber(row.value, 3)]);
    datasusPreviewEl.innerHTML = `
      <div class="success-box">A série final está pronta para alimentar o módulo Prais-Winsten.</div>
      <div class="small-note" style="margin:14px 0 10px;">Cada linha abaixo representa o valor final usado no eixo temporal.</div>
      ${utils.renderPreviewTable(['Tempo', derived.metricLabel || 'Indicador'], rows, 20)}
    `;
  }

  function renderDatasusControls() {
    const sources = confirmedSources();
    if (!sources.length) {
      const hasShared = Boolean(shared?.datasus?.lastSession?.confirmedSources?.length);
      datasusControlsEl.innerHTML = `
        <div class="status-bar">Confirme uma base DATASUS no wizard para liberar a montagem assistida da série.</div>
        ${hasShared ? '<div class="actions-row" style="margin-top:14px;"><button type="button" class="btn-secondary" id="pw-datasus-use-shared">Usar última sessão DATASUS confirmada</button></div>' : ''}
      `;
      datasusPreviewEl.innerHTML = '';
      datasusControlsEl.querySelector('#pw-datasus-use-shared')?.addEventListener('click', () => {
        state.sharedSession = clonePlain(shared.datasus.lastSession);
        renderDatasusControls();
        renderDatasusPreview();
      });
      return;
    }

    ensureDatasusDefaults();
    const source = getSource(state.sourceId);
    const metricOptions = getMetricOptions(source);
    const categories = getCategoryOptions(source, true);

    datasusControlsEl.innerHTML = `
      <div class="form-grid three">
        <div>
          <label for="pw-datasus-source">Base normalizada</label>
          <select id="pw-datasus-source">
            ${sources.map(item => `<option value="${utils.escapeHtml(item.id)}"${item.id === source.id ? ' selected' : ''}>${utils.escapeHtml(item.fileName)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label for="pw-datasus-metric">Medida</label>
          <select id="pw-datasus-metric">
            ${metricOptions.map(option => `<option value="${utils.escapeHtml(option.key)}"${option.key === state.metricBySource[source.id] ? ' selected' : ''}>${utils.escapeHtml(option.label)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label for="pw-datasus-category">Categoria</label>
          <select id="pw-datasus-category">
            ${categories.map(option => `<option value="${utils.escapeHtml(option.key)}"${option.key === state.categoryKey ? ' selected' : ''}>${utils.escapeHtml(option.label)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="actions-row" style="margin-top:14px;">
        <button type="button" class="btn" id="pw-datasus-send">Enviar série derivada para o módulo</button>
      </div>
    `;

    datasusControlsEl.querySelector('#pw-datasus-source')?.addEventListener('change', event => {
      state.sourceId = event.target.value;
      ensureDatasusDefaults();
      renderDatasusControls();
      renderDatasusPreview();
    });

    datasusControlsEl.querySelector('#pw-datasus-metric')?.addEventListener('change', event => {
      state.metricBySource[source.id] = event.target.value;
      renderDatasusPreview();
    });

    datasusControlsEl.querySelector('#pw-datasus-category')?.addEventListener('change', event => {
      state.categoryKey = event.target.value;
      renderDatasusPreview();
    });

    datasusControlsEl.querySelector('#pw-datasus-send')?.addEventListener('click', pushDatasusToPrais);
  }

  function mountDatasusWizard() {
    createDatasusWizard({
      root: datasusWizardEl,
      utils,
      stats,
      shared,
      onSessionChange(session) {
        state.session = clonePlain(session);
        state.sharedSession = clonePlain(shared?.datasus?.lastSession || null);
        renderDatasusControls();
        renderDatasusPreview();
      }
    });
  }

  async function runAnalysis() {
    const dataset = await readCurrentInput();
    clearOutput();

    if (!dataset.hasContent) {
      els.error.innerHTML = '<div class="error-box">Nenhum dado foi encontrado. Importe um arquivo, cole a tabela ou use o exemplo antes de rodar a análise.</div>';
      return;
    }

    if (dataset.errors.length) {
      els.error.innerHTML = buildFeedbackBox(dataset.errors, 'error-box', utils, 'Corrija antes de rodar');
      els.status.className = 'error-box';
      els.status.textContent = 'A série ainda não está válida para o Prais-Winsten.';
      return;
    }

    if (dataset.validRows.length < MIN_TEMPORAL_POINTS) {
      els.error.innerHTML = `<div class="error-box">Forneça pelo menos ${MIN_TEMPORAL_POINTS} pontos temporais válidos para estimar a tendência com estabilidade mínima.</div>`;
      els.status.className = 'error-box';
      els.status.textContent = 'Número insuficiente de pontos temporais válidos.';
      return;
    }

    const model = stats.praisWinsten(dataset.time, dataset.values);
    const fitted = dataset.time.map(timeValue => Math.pow(10, model.alpha + (model.beta * timeValue)));
    const residuals = dataset.values.map((value, index) => Math.log10(value) - (model.alpha + (model.beta * dataset.time[index])));
    const pointLabels = dataset.orderedRows.map(row => row.timeLabel);
    const residualRows = buildResidualSummaryRows(dataset.orderedRows, fitted, residuals);
    const largestResidual = [...residualRows].sort((left, right) => Math.abs(right.residual) - Math.abs(left.residual))[0] || null;
    const meanAbsResidual = residuals.reduce((sum, value) => sum + Math.abs(value), 0) / residuals.length;
    const acText = Math.abs(model.rho) < 0.3
      ? 'autocorrelação fraca'
      : Math.abs(model.rho) < 0.6
        ? 'autocorrelação moderada'
        : 'autocorrelação forte';

    els.status.className = 'success-box';
    els.status.textContent = `Análise concluída com ${model.n} pontos válidos. ${dataset.reordered ? 'A série foi ordenada crescentemente por tempo antes do ajuste.' : 'A ordem temporal original já estava adequada.'}`;

    els.metrics.innerHTML = [
      metricCard('Pontos temporais', String(model.n), `Período analisado: ${dataset.periodLabel || 'não informado'}`),
      metricCard('Coeficiente da tendência (β)', utils.fmtSigned(model.beta, 4), 'Estimado na escala log10 do indicador.'),
      metricCard('Erro-padrão (β)', Number.isFinite(model.seBeta) ? utils.fmtNumber(model.seBeta, 4) : '—', 'Usado no teste t e no intervalo de confiança.'),
      metricCard('p-valor', utils.fmtP(model.p), `t = ${utils.fmtNumber(model.t, 3)} · gl = ${model.df}`),
      metricCard('Classificação', utils.escapeHtml(model.classification), `Mudança ${trendStrength(model.apc)}.`),
      metricCard('Variação percentual (APC)', `${utils.fmtSigned(model.apc, 2)}%`, `IC95% ${utils.fmtNumber(model.ciApc[0], 2)} a ${utils.fmtNumber(model.ciApc[1], 2)}`),
      metricCard('Autocorrelação (ρ)', utils.fmtSigned(model.rho, 3), acText)
    ].join('');

    els.charts.innerHTML = `
      <article class="chart-card">
        <h4>Série observada e linha ajustada</h4>
        <div class="chart-wrap">${buildMainTrendSvg(dataset.time, dataset.values, fitted, pointLabels, { x: dataset.timeHeaderLabel, y: dataset.yHeaderLabel }, utils)}</div>
        <div class="chart-legend">
          <span class="legend-item"><span class="legend-line" style="background:#2563eb"></span>Observado</span>
          <span class="legend-item"><span class="legend-line" style="background:#0f766e"></span>Tendência ajustada</span>
        </div>
      </article>
      <article class="chart-card">
        <h4>Gráfico 2 - resíduos ao longo do tempo</h4>
        <div class="chart-wrap">${buildResidualSvg(dataset.time, residuals, pointLabels, { x: dataset.timeHeaderLabel, y: 'Resíduo (log10)' }, utils)}</div>
        <div class="small-note">Mantivemos o segundo gráfico como resíduos ao longo do tempo porque ele ajuda mais do que um gráfico decorativo: mostra se sobrou padrão temporal após o ajuste.</div>
      </article>
    `;

    els.results.innerHTML = `
      <article class="result-card">
        <h4>Interpretação automática</h4>
        <p>${utils.escapeHtml(buildInterpretation(model, dataset, els.context.value || ''))}</p>
        <ul>
          <li>Tempo entendido como variável independente: ${utils.escapeHtml(dataset.timeHeaderLabel)}.</li>
          <li>Desfecho analisado: ${utils.escapeHtml(dataset.yHeaderLabel)}.</li>
          <li>Resultado principal: APC ${utils.fmtSigned(model.apc, 2)}% (IC95% ${utils.fmtNumber(model.ciApc[0], 2)} a ${utils.fmtNumber(model.ciApc[1], 2)}), p = ${utils.fmtP(model.p)}.</li>
          <li>Autocorrelação estimada: ρ = ${utils.fmtSigned(model.rho, 3)} (${acText}).</li>
        </ul>
      </article>
      <article class="result-card">
        <h4>Painel do ajuste</h4>
        <p>O gráfico 2 foi mantido como resíduos ao longo do tempo porque ele é mais útil para revisar a adequação do modelo do que um segundo gráfico apenas ilustrativo.</p>
        <ul>
          <li>Resíduo absoluto médio: ${utils.fmtNumber(meanAbsResidual, 4)} na escala log10.</li>
          <li>${largestResidual ? `Maior resíduo em ${largestResidual.timeLabel}: ${utils.fmtSigned(largestResidual.residual, 4)}.` : 'Sem resumo residual adicional.'}</li>
          <li>${dataset.reordered ? 'A série precisou ser ordenada crescentemente por tempo antes do ajuste.' : 'A série já estava ordenada crescentemente por tempo.'}</li>
        </ul>
        ${buildResidualSummaryTable(residualRows, utils, 6)}
      </article>
    `;
  }

  async function loadExample() {
    els.paste.value = exampleText;
    els.file.value = '';
    state.activeSource = 'paste';
    await readCurrentInput();
    clearOutput('Exemplo carregado. Revise a prévia e clique em Rodar análise.');
  }

  function clearAll() {
    els.paste.value = '';
    els.file.value = '';
    state.dataset = buildEmptyPraisDataset();
    state.fileState = null;
    state.lastFileName = '';
    state.activeSource = 'none';
    renderPreview(state.dataset);
    clearOutput();
  }

  els.importButton?.addEventListener('click', () => {
    els.file?.click();
  });

  els.exampleButton?.addEventListener('click', loadExample);
  els.clearButton?.addEventListener('click', clearAll);
  els.readButton?.addEventListener('click', async () => {
    await readCurrentInput();
    clearOutput('Prévia atualizada. Revise a série e clique em Rodar análise.');
  });
  els.runButton?.addEventListener('click', runAnalysis);

  els.file?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    els.paste.value = '';
    renderPreview(await buildDatasetFromFile(file));
    clearOutput('Arquivo carregado e lido. Revise a prévia e clique em Rodar análise.');
  });

  els.paste?.addEventListener('input', () => {
    if (els.paste.value.trim()) {
      state.activeSource = 'paste';
      els.fileStatus.innerHTML = '<div class="status-bar">Conteúdo alterado. Clique em Ler dados para atualizar a prévia.</div>';
    } else if (!els.file.files?.length) {
      els.fileStatus.textContent = 'Nenhum arquivo selecionado.';
    }
  });

  mountDatasusWizard();
  renderDatasusControls();
  renderDatasusPreview();
  await loadExample();
}
