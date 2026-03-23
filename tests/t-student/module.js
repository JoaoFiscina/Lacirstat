function splitDelimitedLine(line, delimiter) {
  if (!line) return [''];
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    const prev = line[i - 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      if (delimiter === ',' && /\d/.test(prev || '') && /\d/.test(next || '')) {
        current += char;
      } else {
        cells.push(current.trim());
        current = '';
      }
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function detectDelimiter(lines) {
  const sample = lines.slice(0, Math.min(lines.length, 7));
  let tabScore = 0;
  let semiScore = 0;
  let commaScore = 0;

  sample.forEach(line => {
    tabScore += (line.match(/\t/g) || []).length;
    semiScore += (line.match(/;/g) || []).length;
    for (let i = 0; i < line.length; i += 1) {
      if (line[i] !== ',') continue;
      if (/\d/.test(line[i - 1] || '') && /\d/.test(line[i + 1] || '')) continue;
      commaScore += 1;
    }
  });

  if (tabScore >= semiScore && tabScore >= commaScore && tabScore > 0) return '\t';
  if (semiScore >= commaScore && semiScore > 0) return ';';
  return ',';
}

function normalizeSpaces(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeToken(value) {
  return normalizeSpaces(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function cleanRegionLabel(value) {
  const normalized = normalizeSpaces(value);
  const withoutIndex = normalized.replace(/^\d+\s+/, '').trim();
  return withoutIndex || normalized;
}

function labelFromDelimiter(delimiter) {
  if (delimiter === ';') return 'ponto e vírgula';
  if (delimiter === '\t') return 'tabulação';
  return 'vírgula';
}

function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined
    ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
    : sorted[base];
}

function summarize(arr, stats) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mean = stats.mean(arr);
  const sd = stats.sd(arr);
  const se = sd / Math.sqrt(arr.length);
  const ci95 = [mean - 1.96 * se, mean + 1.96 * se];

  return {
    n: arr.length,
    mean,
    sd,
    se,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    q1: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    q3: quantile(sorted, 0.75),
    ci95
  };
}

function classifyEffect(d) {
  const abs = Math.abs(d);
  if (abs < 0.20) return 'muito pequeno';
  if (abs < 0.50) return 'pequeno';
  if (abs < 0.80) return 'moderado';
  if (abs < 1.20) return 'grande';
  return 'muito grande';
}

function parseDataset(text, stats) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return {
      headers: ['Grupo 1', 'Grupo 2'],
      previewRows: [],
      g1: [],
      g2: [],
      groupNames: ['Grupo 1', 'Grupo 2'],
      mode: 'empty',
      rawRows: 0,
      validRows: 0,
      ignoredRows: 0
    };
  }

  const delimiter = detectDelimiter(lines);
  let rows = lines.map(line => splitDelimitedLine(line, delimiter));
  rows = rows.filter(row => row.some(cell => String(cell || '').trim() !== ''));
  rows = rows.map(row => {
    const normalized = [...row];
    while (normalized.length < 2) normalized.push('');
    return normalized;
  });

  const first = rows[0] || [];
  const firstNumA = stats.parseNumber(first[0]);
  const firstNumB = stats.parseNumber(first[1]);
  const likelyHeader = firstNumA === null || firstNumB === null;

  let headers = ['Grupo 1', 'Grupo 2'];
  if (likelyHeader) {
    headers = [first[0] || 'Grupo 1', first[1] || 'Grupo 2'];
    rows = rows.slice(1);
  }

  const numericPairs = rows.filter(row => stats.parseNumber(row[0]) !== null || stats.parseNumber(row[1]) !== null).length;
  const categoricalNumericPairs = rows.filter(row => row[0] && stats.parseNumber(row[1]) !== null).length;

  let mode = 'two_numeric';
  if (categoricalNumericPairs >= numericPairs && rows.every(row => row.length >= 2)) {
    const distinct = [...new Set(rows.map(row => String(row[0] || '').trim()).filter(Boolean))];
    if (distinct.length >= 2 && distinct.length <= 4) mode = 'categorical_numeric';
  }

  const g1 = [];
  const g2 = [];
  const previewRows = [];
  let groupNames = [...headers];

  if (mode === 'categorical_numeric') {
    const bucket = new Map();

    rows.forEach(row => {
      const rawGroup = String(row[0] || '').trim();
      const value = stats.parseNumber(row[1]);
      if (!rawGroup || value === null) return;
      if (!bucket.has(rawGroup)) bucket.set(rawGroup, []);
      bucket.get(rawGroup).push(value);
      previewRows.push([rawGroup, String(row[1] || '')]);
    });

    const groups = [...bucket.entries()].sort((a, b) => b[1].length - a[1].length);
    if (groups.length >= 2) {
      groupNames = [groups[0][0], groups[1][0]];
      g1.push(...groups[0][1]);
      g2.push(...groups[1][1]);
    }
  } else {
    rows.forEach(row => {
      const a = stats.parseNumber(row[0]);
      const b = stats.parseNumber(row[1]);
      if (a !== null) g1.push(a);
      if (b !== null) g2.push(b);
      previewRows.push([String(row[0] || ''), String(row[1] || '')]);
    });
  }

  const rawRows = rows.length;
  const validRows = mode === 'categorical_numeric'
    ? previewRows.filter(row => row[0] && stats.parseNumber(row[1]) !== null).length
    : previewRows.filter(row => stats.parseNumber(row[0]) !== null || stats.parseNumber(row[1]) !== null).length;

  return {
    headers,
    previewRows,
    g1,
    g2,
    groupNames,
    mode,
    rawRows,
    validRows,
    ignoredRows: Math.max(0, rawRows - validRows)
  };
}

function findDatasusHeader(rows) {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const regionIndex = row.findIndex(cell => normalizeToken(cell).includes('regiao'));
    if (regionIndex === -1) continue;

    const yearColumns = [];
    let totalIndex = null;

    row.forEach((cell, index) => {
      const token = normalizeToken(cell);
      if (/^(19|20)\d{2}$/.test(token)) {
        yearColumns.push({ index, year: token });
      } else if (totalIndex === null && token === 'total') {
        totalIndex = index;
      }
    });

    if (yearColumns.length >= 2) {
      return { rowIndex, regionIndex, yearColumns, totalIndex };
    }
  }

  return null;
}

function inferMeasureLabel(metadataLines) {
  const clean = metadataLines.map(normalizeSpaces).filter(Boolean);
  const descriptive = clean.find((line, index) => index > 0 && !line.includes(':'));
  return descriptive || clean.find(line => !line.includes(':')) || clean[0] || '';
}

function parseDatasusDataset(text, stats) {
  const rawLines = String(text || '')
    .split(/\r?\n/)
    .map(line => line.replace(/\uFEFF/g, '').trimEnd());
  const lines = rawLines.filter(line => line.trim() !== '');

  if (!lines.length) {
    return { ok: false, error: 'Nenhum conteúdo foi encontrado no arquivo informado.' };
  }

  const delimiters = [';', '\t', ','];
  let detected = null;

  for (const delimiter of delimiters) {
    const rows = lines.map(line => splitDelimitedLine(line, delimiter));
    const header = findDatasusHeader(rows);
    if (header) {
      detected = { delimiter, rows, header };
      break;
    }
  }

  if (!detected) {
    return { ok: false, error: 'Não foi possível interpretar o arquivo DATASUS.' };
  }

  const { delimiter, rows, header } = detected;
  const bodyRows = rows
    .slice(header.rowIndex + 1)
    .filter(row => row.some(cell => normalizeSpaces(cell) !== ''));
  const maxCols = Math.max(rows[header.rowIndex].length, ...bodyRows.map(row => row.length), 0);
  const previewHeaders = Array.from({ length: maxCols }, (_, index) => {
    const cell = normalizeSpaces(rows[header.rowIndex][index]);
    if (cell) return cell;
    return index === header.regionIndex ? 'Região' : `Coluna ${index + 1}`;
  });

  const parsedRows = [];
  let ignoredRows = 0;

  bodyRows.forEach((rawRow, bodyIndex) => {
    const row = Array.from({ length: maxCols }, (_, index) => normalizeSpaces(rawRow[index]));
    const rawLabel = row[header.regionIndex] || row.find(cell => cell) || '';
    const cleanLabel = cleanRegionLabel(rawLabel);
    const isTotalRow = normalizeToken(cleanLabel) === 'total';
    const valuesByYear = {};
    let validCount = 0;

    header.yearColumns.forEach(column => {
      const value = stats.parseNumber(rawRow[column.index]);
      if (value !== null) {
        valuesByYear[column.year] = value;
        validCount += 1;
      }
    });

    const totalValue = header.totalIndex !== null ? stats.parseNumber(rawRow[header.totalIndex]) : null;

    if (!rawLabel && validCount === 0 && totalValue === null) {
      ignoredRows += 1;
      return;
    }

    if (validCount === 0 && !isTotalRow) {
      ignoredRows += 1;
      return;
    }

    parsedRows.push({
      id: `datasus-row-${parsedRows.length + 1}`,
      rowLabel: rawLabel || `Linha ${header.rowIndex + bodyIndex + 2}`,
      cleanLabel: cleanLabel || rawLabel || `Linha ${header.rowIndex + bodyIndex + 2}`,
      isTotalRow,
      valuesByYear,
      totalValue,
      valueCount: validCount,
      rawCells: row
    });
  });

  const years = header.yearColumns
    .map(column => column.year)
    .sort((a, b) => Number(a) - Number(b));
  const selectableRows = parsedRows.filter(row => !row.isTotalRow);
  const metadataLines = lines.slice(0, header.rowIndex).map(normalizeSpaces).filter(Boolean);
  const measureLabel = inferMeasureLabel(metadataLines);

  if (!years.length || !selectableRows.length) {
    return { ok: false, error: 'Não foi possível interpretar o arquivo DATASUS.' };
  }

  return {
    ok: true,
    delimiter,
    headerRowIndex: header.rowIndex,
    regionIndex: header.regionIndex,
    totalIndex: header.totalIndex,
    yearColumns: header.yearColumns,
    years,
    previewHeaders,
    previewRows: bodyRows.map(rawRow => Array.from({ length: maxCols }, (_, index) => normalizeSpaces(rawRow[index]))),
    parsedRows,
    selectableRows,
    totalRows: parsedRows.filter(row => row.isTotalRow),
    rawRowCount: bodyRows.length,
    ignoredRows,
    metadataLines,
    titleLine: metadataLines[0] || '',
    measureLabel
  };
}

function buildDatasusBlocks(years) {
  const numericYears = years
    .map(year => Number(year))
    .filter(year => Number.isFinite(year))
    .sort((a, b) => a - b);
  const blocks = [];

  for (let index = 0; index < numericYears.length; index += 5) {
    const chunk = numericYears.slice(index, index + 5);
    if (!chunk.length) continue;
    const incomplete = chunk.length < 5 || (chunk[chunk.length - 1] - chunk[0]) !== (chunk.length - 1);
    blocks.push({
      key: chunk.join('|'),
      years: chunk.map(String),
      label: `${chunk[0]}–${chunk[chunk.length - 1]}`,
      incomplete
    });
  }

  return blocks;
}

function getSelectedPeriodYears(state) {
  if (!state.parsed) return [];
  const years = state.parsed.years;

  if (state.periodMode === 'single') {
    return years.includes(state.singleYear) ? [state.singleYear] : [];
  }

  if (state.periodMode === 'block') {
    const block = state.blocks.find(item => item.key === state.blockKey);
    return block ? block.years : [];
  }

  const start = Number(state.rangeStart);
  const end = Number(state.rangeEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  const min = Math.min(start, end);
  const max = Math.max(start, end);
  return years.filter(year => {
    const numericYear = Number(year);
    return numericYear >= min && numericYear <= max;
  });
}

function getPeriodLabel(state, selectedYears) {
  if (!selectedYears.length) return 'sem período válido';

  if (state.periodMode === 'single') {
    return `ano ${selectedYears[0]}`;
  }

  if (state.periodMode === 'block') {
    const block = state.blocks.find(item => item.key === state.blockKey);
    if (!block) return `${selectedYears[0]}–${selectedYears[selectedYears.length - 1]}`;
    return block.incomplete
      ? `${block.label} (bloco automático incompleto)`
      : `${block.label} (bloco automático de 5 anos)`;
  }

  return `${selectedYears[0]}–${selectedYears[selectedYears.length - 1]}`;
}

function joinRegionList(labels) {
  if (!labels.length) return 'nenhuma região selecionada';
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} e ${labels[labels.length - 1]}`;
}

function deriveDatasusComparison(state, stats) {
  if (!state.parsed) {
    return {
      ok: false,
      primaryError: 'Não foi possível interpretar o arquivo DATASUS.',
      validationErrors: ['Não foi possível interpretar o arquivo DATASUS.'],
      selectedYears: [],
      derivedRows: [],
      vectors: { A: [], B: [] },
      selectionCounts: { A: 0, B: 0 },
      validCounts: { A: 0, B: 0 },
      omittedRows: []
    };
  }

  const selectedYears = getSelectedPeriodYears(state);
  if (!selectedYears.length) {
    return {
      ok: false,
      primaryError: 'Nenhum ano válido foi encontrado no intervalo selecionado.',
      validationErrors: ['Nenhum ano válido foi encontrado no intervalo selecionado.'],
      selectedYears: [],
      derivedRows: [],
      vectors: { A: [], B: [] },
      selectionCounts: { A: 0, B: 0 },
      validCounts: { A: 0, B: 0 },
      omittedRows: []
    };
  }

  const visibleRows = state.parsed.parsedRows.filter(row => state.showTotal || !row.isTotalRow);
  const selectedRows = visibleRows
    .map(row => ({ row, group: state.selectionMap[row.id] || null }))
    .filter(item => item.group === 'A' || item.group === 'B');

  const selectionCounts = {
    A: selectedRows.filter(item => item.group === 'A').length,
    B: selectedRows.filter(item => item.group === 'B').length
  };

  const validationErrors = [];
  if (selectionCounts.A < 1 || selectionCounts.B < 1) {
    validationErrors.push('Selecione pelo menos 1 região em cada grupo.');
  }

  const derivedRows = [];
  const omittedRows = [];

  selectedRows.forEach(item => {
    const validYears = selectedYears.filter(year => Number.isFinite(item.row.valuesByYear[year]));
    if (!validYears.length) {
      omittedRows.push({
        rowId: item.row.id,
        rowLabel: item.row.cleanLabel,
        groupKey: item.group,
        reason: 'Sem valores numéricos no período selecionado.'
      });
      return;
    }

    const values = validYears.map(year => item.row.valuesByYear[year]);
    const summaryValue = stats.mean(values);

    if (!Number.isFinite(summaryValue)) {
      omittedRows.push({
        rowId: item.row.id,
        rowLabel: item.row.cleanLabel,
        groupKey: item.group,
        reason: 'Resumo inválido após a filtragem.'
      });
      return;
    }

    derivedRows.push({
      rowId: item.row.id,
      rowLabel: item.row.cleanLabel,
      rawLabel: item.row.rowLabel,
      groupKey: item.group,
      groupLabel: item.group === 'A' ? 'Grupo A' : 'Grupo B',
      value: summaryValue,
      validYears
    });
  });

  const vectors = {
    A: derivedRows.filter(row => row.groupKey === 'A').map(row => row.value),
    B: derivedRows.filter(row => row.groupKey === 'B').map(row => row.value)
  };

  const validCounts = { A: vectors.A.length, B: vectors.B.length };

  if (vectors.A.some(value => Number.isNaN(value)) || vectors.B.some(value => Number.isNaN(value))) {
    validationErrors.push('Os vetores finais contêm valores inválidos.');
  }

  if (!vectors.A.length || !vectors.B.length) {
    validationErrors.push('O período selecionado não gerou observações suficientes.');
  } else if (vectors.A.length < 2 || vectors.B.length < 2) {
    validationErrors.push('Selecione pelo menos 2 regiões válidas em cada grupo.');
  }

  return {
    ok: validationErrors.length === 0,
    primaryError: validationErrors[0] || '',
    validationErrors,
    selectedYears,
    periodLabel: getPeriodLabel(state, selectedYears),
    derivedRows,
    vectors,
    selectionCounts,
    validCounts,
    omittedRows,
    groupRegions: {
      A: derivedRows.filter(row => row.groupKey === 'A').map(row => row.rowLabel),
      B: derivedRows.filter(row => row.groupKey === 'B').map(row => row.rowLabel)
    }
  };
}

function safeWelch(g1, g2, stats) {
  const n1 = g1.length;
  const n2 = g2.length;
  const m1 = stats.mean(g1);
  const m2 = stats.mean(g2);
  const s1 = stats.sd(g1);
  const s2 = stats.sd(g2);
  const v1 = s1 ** 2;
  const v2 = s2 ** 2;
  const diff = m1 - m2;
  const se = Math.sqrt(v1 / n1 + v2 / n2);
  const t = se === 0 ? 0 : diff / se;
  const dfDen = (((v1 / n1) ** 2) / (n1 - 1)) + (((v2 / n2) ** 2) / (n2 - 1));
  const df = dfDen === 0 ? n1 + n2 - 2 : ((v1 / n1 + v2 / n2) ** 2) / dfDen;
  const p = Number.isFinite(df) && df > 0 ? 2 * (1 - stats.tcdf(Math.abs(t), df)) : NaN;
  const tcrit = Number.isFinite(df) && df > 0 ? stats.tInv(0.975, df) : NaN;
  const ci = Number.isFinite(tcrit) ? [diff - tcrit * se, diff + tcrit * se] : [NaN, NaN];
  const spDen = n1 + n2 - 2;
  const sp = spDen > 0 ? Math.sqrt((((n1 - 1) * v1) + ((n2 - 1) * v2)) / spDen) : NaN;
  const d = !Number.isFinite(sp) || sp === 0 ? 0 : diff / sp;
  return { n1, n2, m1, m2, s1, s2, diff, se, t, df, p, ci, d };
}

function buildDistributionSvg(g1, g2, label1, label2, stats, utils) {
  const width = 860;
  const height = 420;
  const margin = { top: 24, right: 24, bottom: 56, left: 86 };
  const all = [...g1, ...g2];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const pad = (max - min || 1) * 0.1;
  const yMin = min - pad;
  const yMax = max + pad;

  const y = value => height - margin.bottom - ((value - yMin) / (yMax - yMin || 1)) * (height - margin.top - margin.bottom);
  const xCenters = [290, 590];
  const jitter = i => ((i % 10) - 4.5) * 5;
  const ticks = Array.from({ length: 6 }, (_, i) => yMin + ((yMax - yMin) * i) / 5);

  const grid = ticks.map(tick => {
    const py = y(tick);
    return `<g><line x1="${margin.left}" y1="${py.toFixed(2)}" x2="${width - margin.right}" y2="${py.toFixed(2)}" stroke="#dbe5f2" stroke-dasharray="4 6"/><text x="${margin.left - 12}" y="${(py + 4).toFixed(2)}" fill="#5b6b84" text-anchor="end" font-size="12">${utils.fmtNumber(tick, 1)}</text></g>`;
  }).join('');

  function drawGroup(values, cx, color, label) {
    const sum = summarize(values, stats);
    const points = values.map((value, i) => `<circle cx="${(cx + jitter(i)).toFixed(2)}" cy="${y(value).toFixed(2)}" r="5.4" fill="${color}" fill-opacity="0.9" stroke="#fff" stroke-width="1.8"><title>${utils.escapeHtml(label)}: ${utils.fmtNumber(value, 2)}</title></circle>`).join('');
    return `
      <line x1="${cx}" y1="${y(sum.max).toFixed(2)}" x2="${cx}" y2="${y(sum.min).toFixed(2)}" stroke="${color}" stroke-width="2.6" opacity="0.7"/>
      <rect x="${cx - 28}" y="${y(sum.q3).toFixed(2)}" width="56" height="${Math.max(10, y(sum.q1) - y(sum.q3)).toFixed(2)}" rx="10" fill="${color}" fill-opacity="0.12" stroke="${color}" stroke-width="2"/>
      <line x1="${cx - 32}" y1="${y(sum.mean).toFixed(2)}" x2="${cx + 32}" y2="${y(sum.mean).toFixed(2)}" stroke="${color}" stroke-width="3"/>
      ${points}
    `;
  }

  return `
    <svg class="groupplot-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Distribuição dos dois grupos">
      <rect x="0" y="0" width="${width}" height="${height}" rx="20" fill="#fff"/>
      ${grid}
      <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" stroke="#8da1bc"/>
      ${drawGroup(g1, xCenters[0], '#2563eb', label1)}
      ${drawGroup(g2, xCenters[1], '#0f766e', label2)}
      <text x="${xCenters[0]}" y="${height - 18}" text-anchor="middle" fill="#334155" font-size="13" font-weight="700">${utils.escapeHtml(label1)}</text>
      <text x="${xCenters[1]}" y="${height - 18}" text-anchor="middle" fill="#334155" font-size="13" font-weight="700">${utils.escapeHtml(label2)}</text>
    </svg>
  `;
}

function buildMeanCiSvg(result, labels, utils) {
  const width = 860;
  const height = 300;
  const margin = { top: 28, right: 24, bottom: 56, left: 86 };
  const vals = [result.m1, result.m2, result.ci[0], result.ci[1]];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = (max - min || 1) * 0.25;
  const yMin = min - pad;
  const yMax = max + pad;
  const y = value => height - margin.bottom - ((value - yMin) / (yMax - yMin || 1)) * (height - margin.top - margin.bottom);
  const x1 = 290;
  const x2 = 590;

  return `
    <svg class="groupplot-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Médias e intervalo de confiança da diferença">
      <rect x="0" y="0" width="${width}" height="${height}" rx="20" fill="#fff"/>
      <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" stroke="#8da1bc"/>
      <line x1="${x1}" y1="${y(result.m1).toFixed(2)}" x2="${x2}" y2="${y(result.m2).toFixed(2)}" stroke="#94a3b8" stroke-dasharray="6 5"/>
      <rect x="${x1 - 40}" y="${y(result.m1).toFixed(2)}" width="80" height="${height - margin.bottom - y(result.m1)}" fill="#2563eb" fill-opacity="0.14"/>
      <rect x="${x2 - 40}" y="${y(result.m2).toFixed(2)}" width="80" height="${height - margin.bottom - y(result.m2)}" fill="#0f766e" fill-opacity="0.14"/>
      <circle cx="${x1}" cy="${y(result.m1).toFixed(2)}" r="8" fill="#2563eb"/>
      <circle cx="${x2}" cy="${y(result.m2).toFixed(2)}" r="8" fill="#0f766e"/>
      <line x1="${width / 2}" y1="${y(result.ci[0]).toFixed(2)}" x2="${width / 2}" y2="${y(result.ci[1]).toFixed(2)}" stroke="#1e293b" stroke-width="3"/>
      <line x1="${width / 2 - 16}" y1="${y(result.ci[0]).toFixed(2)}" x2="${width / 2 + 16}" y2="${y(result.ci[0]).toFixed(2)}" stroke="#1e293b" stroke-width="3"/>
      <line x1="${width / 2 - 16}" y1="${y(result.ci[1]).toFixed(2)}" x2="${width / 2 + 16}" y2="${y(result.ci[1]).toFixed(2)}" stroke="#1e293b" stroke-width="3"/>
      <text x="${x1}" y="${height - 20}" text-anchor="middle" fill="#334155" font-size="13" font-weight="700">${utils.escapeHtml(labels[0])}</text>
      <text x="${x2}" y="${height - 20}" text-anchor="middle" fill="#334155" font-size="13" font-weight="700">${utils.escapeHtml(labels[1])}</text>
      <text x="${width / 2}" y="${margin.top}" text-anchor="middle" fill="#334155" font-size="12" font-weight="700">IC95% da diferença (${utils.escapeHtml(labels[0])} − ${utils.escapeHtml(labels[1])})</text>
    </svg>
  `;
}

function renderAnalysisError(statusEl, metricsEl, chartEl, resultsEl, message) {
  statusEl.className = 'error-box';
  statusEl.textContent = message;
  metricsEl.innerHTML = '';
  chartEl.innerHTML = '';
  resultsEl.innerHTML = '';
}

function buildResultMetricsHtml(result, labels, utils) {
  return `
    <div class="metric-card">
      <div class="metric-label">${utils.escapeHtml(labels[0])}</div>
      <div class="metric-value">${utils.fmtNumber(result.m1, 2)}</div>
      <div class="metric-mini">n = ${result.n1} · DP = ${utils.fmtNumber(result.s1, 2)}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">${utils.escapeHtml(labels[1])}</div>
      <div class="metric-value">${utils.fmtNumber(result.m2, 2)}</div>
      <div class="metric-mini">n = ${result.n2} · DP = ${utils.fmtNumber(result.s2, 2)}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Diferença entre médias</div>
      <div class="metric-value">${utils.fmtSigned(result.diff, 2)}</div>
      <div class="metric-mini">IC95%: ${utils.fmtNumber(result.ci[0], 2)} a ${utils.fmtNumber(result.ci[1], 2)}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Estatística t</div>
      <div class="metric-value">${utils.fmtNumber(result.t, 3)}</div>
      <div class="metric-mini">gl = ${utils.fmtNumber(result.df, 2)} · p = ${utils.fmtP(result.p)}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Cohen&apos;s d</div>
      <div class="metric-value">${utils.fmtSigned(result.d, 2)}</div>
      <div class="metric-mini">Classificação: ${utils.escapeHtml(classifyEffect(result.d))}</div>
    </div>
  `;
}

function buildResultChartsHtml(result, labels, g1, g2, stats, utils) {
  return `
    <article class="chart-card">
      <h4>Gráfico 1 · Distribuição e dispersão por grupo</h4>
      <div class="chart-wrap">${buildDistributionSvg(g1, g2, labels[0], labels[1], stats, utils)}</div>
    </article>
    <article class="chart-card">
      <h4>Gráfico 2 · Comparação de médias e IC95%</h4>
      <div class="chart-wrap">${buildMeanCiSvg(result, labels, utils)}</div>
      <div class="small-note" style="margin-top:10px;">A barra central indica o IC95% da diferença (${utils.escapeHtml(labels[0])} − ${utils.escapeHtml(labels[1])}).</div>
    </article>
  `;
}

function buildManualInterpretation(result, alpha, labels, question, utils) {
  const effectClass = classifyEffect(result.d);
  const higherGroup = result.diff >= 0 ? labels[0] : labels[1];
  const diffAbs = Math.abs(result.diff);
  const impactText = Math.abs(result.d) < 0.2 ? 'baixo' : Math.abs(result.d) < 0.8 ? 'intermediário' : 'alto';
  const significant = result.p < alpha;

  const paragraph = significant
    ? `Observou-se diferença estatisticamente significativa entre a média de ${labels[0]} e ${labels[1]}. A média foi maior em ${higherGroup}, com diferença média de ${utils.fmtNumber(diffAbs, 2)} unidades. O tamanho de efeito foi classificado como ${effectClass}, sugerindo impacto ${impactText}.`
    : `Não se observou diferença estatisticamente significativa entre as médias de ${labels[0]} e ${labels[1]}. Ainda assim, ${higherGroup} apresentou média numericamente maior, com diferença média de ${utils.fmtNumber(diffAbs, 2)} unidades. O tamanho de efeito foi ${effectClass}, sugerindo impacto ${impactText}.`;

  return `
    ${utils.buildInterpretationCard('Interpretação automática', paragraph, [
      `Pergunta analisada: ${question || 'Comparação entre duas médias independentes'}.`,
      `Resultado principal: t = ${utils.fmtNumber(result.t, 3)}, gl = ${utils.fmtNumber(result.df, 2)}, p = ${utils.fmtP(result.p)}.`,
      'Recomendação: reporte p-valor, IC95% e tamanho de efeito em conjunto para uma interpretação completa.'
    ])}
    <div class="result-card">
      <h4>Leitura didática final</h4>
      <ul>
        <li>Grupo com maior média: <strong>${utils.escapeHtml(higherGroup)}</strong>.</li>
        <li>Diferença observada: <strong>${utils.fmtSigned(result.diff, 2)}</strong> unidades.</li>
        <li>Classificação do efeito (Cohen&apos;s d): <strong>${utils.escapeHtml(effectClass)}</strong>.</li>
      </ul>
    </div>
  `;
}

function buildDatasusInterpretation(result, derived, alpha, question, utils) {
  const significant = result.p < alpha;
  const effectClass = classifyEffect(result.d);
  const higherGroup = result.diff >= 0 ? 'Grupo A' : 'Grupo B';
  const paragraph = significant
    ? `Após resumir os valores de cada região no período selecionado e comparar os grupos definidos pelo usuário, observou-se diferença estatisticamente significativa entre Grupo A e Grupo B. A média foi maior em ${higherGroup}, sugerindo que, no conjunto de regiões selecionadas, os valores resumidos foram mais elevados nesse grupo.`
    : `Após resumir os valores de cada região no período selecionado e comparar os grupos definidos pelo usuário, não se observou diferença estatisticamente significativa entre Grupo A e Grupo B. Ainda assim, a média foi numericamente maior em ${higherGroup}, o que pode orientar leituras exploratórias do contraste.`;

  return `
    ${utils.buildInterpretationCard('Interpretação automática', paragraph, [
      `Pergunta analisada: ${question || 'Comparação entre dois grupos de regiões'}.`,
      `Período analisado: ${derived.periodLabel}.`,
      `Grupo A: ${joinRegionList(derived.groupRegions.A)}.`,
      `Grupo B: ${joinRegionList(derived.groupRegions.B)}.`,
      'Resumo utilizado: média por região dentro do período selecionado, mantendo cada região como uma observação separada.',
      `Resultado principal: t = ${utils.fmtNumber(result.t, 3)}, gl = ${utils.fmtNumber(result.df, 2)}, p = ${utils.fmtP(result.p)}.`,
      `Tamanho de efeito: ${utils.escapeHtml(effectClass)}.`
    ])}
  `;
}

export async function renderTestModule(ctx) {
  const { root, config, utils, stats } = ctx;
  root.classList.add('tstudent-module');

  root.innerHTML = `
    <div class="module-grid">
      <section class="module-header tstudent-header">
        <div class="chip chip-primary">Módulo didático · comparação de médias</div>
        <h3>${utils.escapeHtml(config.title)}</h3>
        <p>${utils.escapeHtml(config.description)}</p>
      </section>

      <section class="callout-grid tstudent-cards">
        ${(config.didacticCards || []).map(card => `
          <article class="tip-card didactic-card">
            <h4>${utils.escapeHtml(card.title)}</h4>
            <p>${utils.escapeHtml(card.text)}</p>
          </article>
        `).join('')}
      </section>

      <section class="surface-card decorated">
        <div class="tstudent-mode-switch" role="tablist" aria-label="Modo de entrada do teste t">
          <button type="button" class="tstudent-mode-btn active" data-mode-target="manual" aria-selected="true">Modo manual</button>
          <button type="button" class="tstudent-mode-btn" data-mode-target="datasus" aria-selected="false">Importar CSV DATASUS</button>
        </div>
        <p class="small-note" style="margin:12px 0 0;">Os dois fluxos coexistem no mesmo módulo. O modo manual segue disponível sem alterações no comportamento estatístico.</p>
      </section>

      <div id="t-manual-panel" class="tstudent-mode-panel active" data-mode-panel="manual">
        <section class="surface-card decorated">
          <h4>Entrada manual de dados</h4>
          <div class="form-grid two">
            <div>
              <label for="t-context">Pergunta do estudo</label>
              <input id="t-context" type="text" value="${utils.escapeHtml(config.defaultQuestion || 'As médias dos grupos são diferentes?')}" />
            </div>
            <div>
              <label for="t-alpha">Nível de significância</label>
              <select id="t-alpha">
                <option value="0.01">1%</option>
                <option value="0.05" selected>5%</option>
                <option value="0.10">10%</option>
              </select>
            </div>
          </div>
          <div style="margin-top:14px;">
            <label for="t-paste">Cole seus dados</label>
            <textarea id="t-paste" placeholder="Grupo A\tGrupo B&#10;4,8\t6,1&#10;5,1\t5,8&#10;..."></textarea>
            <div class="small-note">Formatos aceitos: duas colunas numéricas (Grupo 1 e Grupo 2) ou coluna de grupo + coluna numérica (ex.: Controle;5,2).</div>
          </div>
          <div class="actions-row" style="margin-top:14px;">
            <button class="btn-secondary" id="t-example">Carregar exemplo</button>
            <button class="btn" id="t-run">Rodar análise</button>
            <button class="btn-ghost" id="t-clear">Limpar</button>
          </div>
        </section>

        <section class="surface-card">
          <h4>Pré-visualização</h4>
          <div id="t-preview" class="small-note">Nenhum dado carregado ainda.</div>
          <div id="t-group-summary" class="metrics-grid t-group-summary" style="margin-top:14px;"></div>
        </section>

        <section class="surface-card">
          <h4>Resultados e interpretação</h4>
          <div id="t-status" class="status-bar">Carregue um exemplo ou cole os dados para iniciar.</div>
          <div id="t-metrics" class="metrics-grid" style="margin-top:14px;"></div>
          <div id="t-chart" class="chart-grid" style="margin-top:14px;"></div>
          <div id="t-results" class="result-grid" style="margin-top:14px;"></div>
        </section>
      </div>

      <div id="t-datasus-panel" class="tstudent-mode-panel" data-mode-panel="datasus">
        <section class="surface-card decorated">
          <h4>Importar CSV DATASUS</h4>
          <div class="form-grid two">
            <div>
              <label for="t-datasus-context">Pergunta do estudo</label>
              <input id="t-datasus-context" type="text" value="${utils.escapeHtml(config.defaultDatasusQuestion || 'Os grupos de regiões definidos pelo usuário apresentam médias diferentes?')}" />
            </div>
            <div>
              <label for="t-datasus-alpha">Nível de significância</label>
              <select id="t-datasus-alpha">
                <option value="0.01">1%</option>
                <option value="0.05" selected>5%</option>
                <option value="0.10">10%</option>
              </select>
            </div>
          </div>
          <div class="form-grid two" style="margin-top:14px;">
            <div>
              <label for="t-datasus-file">Arquivo DATASUS</label>
              <input id="t-datasus-file" type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" />
              <div class="small-note">Formatos aceitos: .csv, .tsv e .txt exportados do DATASUS. O parser tenta, nesta ordem, ;, tab e vírgula.</div>
            </div>
            <div class="tstudent-inline-actions">
              <button class="btn-secondary" id="t-datasus-example" type="button">Carregar exemplo DATASUS</button>
              <button class="btn" id="t-datasus-run" type="button">Rodar t test</button>
              <button class="btn-ghost" id="t-datasus-clear" type="button">Limpar tudo</button>
            </div>
          </div>
          <div id="t-datasus-status-card" style="margin-top:16px;" class="status-bar">Faça upload de um arquivo DATASUS para habilitar a seleção de grupos e período.</div>
        </section>

        <section class="surface-card">
          <h4>Pré-visualização da base bruta importada</h4>
          <div id="t-datasus-preview" class="small-note">Nenhuma base importada ainda.</div>
        </section>

        <section class="surface-card">
          <h4>Painel de configuração da comparação</h4>
          <div id="t-datasus-controls" class="small-note">A configuração ficará disponível após a leitura bem-sucedida do arquivo.</div>
        </section>

        <section class="surface-card">
          <h4>Base derivada usada no t test</h4>
          <div id="t-datasus-derived" class="small-note">Selecione regiões e período para montar a base derivada.</div>
        </section>

        <section class="surface-card">
          <h4>Resultados do t test</h4>
          <div id="t-datasus-result-status" class="status-bar">Aguardando importação de arquivo.</div>
          <div id="t-datasus-metrics" class="metrics-grid" style="margin-top:14px;"></div>
          <div id="t-datasus-chart" class="chart-grid" style="margin-top:14px;"></div>
          <div id="t-datasus-results" class="result-grid" style="margin-top:14px;"></div>
        </section>
      </div>
    </div>
  `;

  const manual = {
    pasteEl: root.querySelector('#t-paste'),
    previewEl: root.querySelector('#t-preview'),
    statusEl: root.querySelector('#t-status'),
    groupSummaryEl: root.querySelector('#t-group-summary'),
    metricsEl: root.querySelector('#t-metrics'),
    chartEl: root.querySelector('#t-chart'),
    resultsEl: root.querySelector('#t-results'),
    contextEl: root.querySelector('#t-context'),
    alphaEl: root.querySelector('#t-alpha')
  };

  const datasusRefs = {
    fileEl: root.querySelector('#t-datasus-file'),
    contextEl: root.querySelector('#t-datasus-context'),
    alphaEl: root.querySelector('#t-datasus-alpha'),
    statusCardEl: root.querySelector('#t-datasus-status-card'),
    previewEl: root.querySelector('#t-datasus-preview'),
    controlsEl: root.querySelector('#t-datasus-controls'),
    derivedEl: root.querySelector('#t-datasus-derived'),
    resultStatusEl: root.querySelector('#t-datasus-result-status'),
    metricsEl: root.querySelector('#t-datasus-metrics'),
    chartEl: root.querySelector('#t-datasus-chart'),
    resultsEl: root.querySelector('#t-datasus-results')
  };

  const datasusState = {
    fileName: '',
    sourceText: '',
    parsed: null,
    blocks: [],
    selectionMap: {},
    showTotal: false,
    periodMode: 'range',
    singleYear: '',
    rangeStart: '',
    rangeEnd: '',
    blockKey: '',
    derived: null,
    result: null,
    error: ''
  };

  function refreshManualPreview() {
    const parsed = parseDataset(manual.pasteEl.value, stats);

    if (!parsed.previewRows.length) {
      manual.previewEl.innerHTML = '<div class="small-note">Nenhum dado carregado ainda.</div>';
      manual.groupSummaryEl.innerHTML = '';
      return parsed;
    }

    const previewHeaders = parsed.mode === 'categorical_numeric'
      ? ['Grupo', 'Valor']
      : parsed.headers;

    manual.previewEl.innerHTML = `
      <div class="small-note">Formato detectado: <strong>${parsed.mode === 'categorical_numeric' ? 'Grupo + valor' : 'Duas colunas numéricas'}</strong> · Linhas válidas: ${parsed.validRows} · Linhas ignoradas: ${parsed.ignoredRows}</div>
      ${utils.renderPreviewTable(previewHeaders, parsed.previewRows, 8)}
    `;

    manual.groupSummaryEl.innerHTML = `
      <div class="metric-card"><div class="metric-label">Grupo detectado 1</div><div class="metric-value">${utils.escapeHtml(parsed.groupNames[0] || 'Grupo 1')}</div><div class="metric-mini">n = ${parsed.g1.length}</div></div>
      <div class="metric-card"><div class="metric-label">Grupo detectado 2</div><div class="metric-value">${utils.escapeHtml(parsed.groupNames[1] || 'Grupo 2')}</div><div class="metric-mini">n = ${parsed.g2.length}</div></div>
      <div class="metric-card"><div class="metric-label">Dados válidos</div><div class="metric-value">${parsed.validRows}</div><div class="metric-mini">Total importado = ${parsed.rawRows}</div></div>
    `;

    return parsed;
  }

  function runManualAnalysis() {
    const parsed = refreshManualPreview();
    const alpha = Number(manual.alphaEl.value || 0.05);

    if (parsed.g1.length < 2 || parsed.g2.length < 2) {
      renderAnalysisError(manual.statusEl, manual.metricsEl, manual.chartEl, manual.resultsEl, 'Precisamos de pelo menos 2 valores válidos em cada grupo para rodar o teste t.');
      return;
    }

    const result = safeWelch(parsed.g1, parsed.g2, stats);
    if (!Number.isFinite(result.t) || !Number.isFinite(result.p)) {
      renderAnalysisError(manual.statusEl, manual.metricsEl, manual.chartEl, manual.resultsEl, 'Não foi possível calcular o teste com esses dados (verifique variabilidade e valores).');
      return;
    }

    const labels = [parsed.groupNames[0] || 'Grupo 1', parsed.groupNames[1] || 'Grupo 2'];
    const significant = result.p < alpha;

    manual.statusEl.className = significant ? 'success-box' : 'status-bar';
    manual.statusEl.textContent = significant
      ? `Diferença estatisticamente significativa detectada (p ${utils.fmtP(result.p)} < ${alpha.toLocaleString('pt-BR')}).`
      : `Não houve evidência estatística suficiente de diferença entre as médias (p ${utils.fmtP(result.p)}).`;
    manual.metricsEl.innerHTML = buildResultMetricsHtml(result, labels, utils);
    manual.chartEl.innerHTML = buildResultChartsHtml(result, labels, parsed.g1, parsed.g2, stats, utils);
    manual.resultsEl.innerHTML = buildManualInterpretation(result, alpha, labels, manual.contextEl.value || config.defaultQuestion || '', utils);
  }

  function clearManual() {
    manual.pasteEl.value = '';
    manual.contextEl.value = config.defaultQuestion || 'As médias dos grupos são diferentes?';
    manual.alphaEl.value = '0.05';
    manual.previewEl.innerHTML = '<div class="small-note">Nenhum dado carregado ainda.</div>';
    manual.groupSummaryEl.innerHTML = '';
    manual.statusEl.className = 'status-bar';
    manual.statusEl.textContent = 'Campos limpos. Cole novos dados e rode novamente.';
    manual.metricsEl.innerHTML = '';
    manual.chartEl.innerHTML = '';
    manual.resultsEl.innerHTML = '';
  }

  function invalidateDatasusRun() {
    datasusState.result = null;
    datasusRefs.metricsEl.innerHTML = '';
    datasusRefs.chartEl.innerHTML = '';
    datasusRefs.resultsEl.innerHTML = '';
    datasusRefs.resultStatusEl.className = 'status-bar';
    datasusRefs.resultStatusEl.textContent = datasusState.parsed
      ? 'Revise a base derivada abaixo e clique em "Rodar t test" para atualizar o resultado.'
      : 'Aguardando importação de arquivo.';
  }

  function resetDatasusState() {
    datasusState.fileName = '';
    datasusState.sourceText = '';
    datasusState.parsed = null;
    datasusState.blocks = [];
    datasusState.selectionMap = {};
    datasusState.showTotal = false;
    datasusState.periodMode = 'range';
    datasusState.singleYear = '';
    datasusState.rangeStart = '';
    datasusState.rangeEnd = '';
    datasusState.blockKey = '';
    datasusState.derived = null;
    datasusState.result = null;
    datasusState.error = '';
    datasusRefs.fileEl.value = '';
    datasusRefs.contextEl.value = config.defaultDatasusQuestion || 'Os grupos de regiões definidos pelo usuário apresentam médias diferentes?';
    datasusRefs.alphaEl.value = '0.05';
  }

  function renderDatasusImportStatus() {
    if (datasusState.error) {
      datasusRefs.statusCardEl.className = 'error-box';
      datasusRefs.statusCardEl.textContent = datasusState.error;
      return;
    }

    if (!datasusState.parsed) {
      datasusRefs.statusCardEl.className = 'status-bar';
      datasusRefs.statusCardEl.textContent = 'Faça upload de um arquivo DATASUS para habilitar a seleção de grupos e período.';
      return;
    }

    const firstYear = datasusState.parsed.years[0];
    const lastYear = datasusState.parsed.years[datasusState.parsed.years.length - 1];
    const measure = datasusState.parsed.measureLabel || datasusState.parsed.titleLine || 'Medida não identificada';

    datasusRefs.statusCardEl.className = 'info-banner';
    datasusRefs.statusCardEl.innerHTML = `
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-label">Arquivo carregado</div>
          <div class="metric-value tstudent-compact-value">${utils.escapeHtml(datasusState.fileName || 'arquivo importado')}</div>
          <div class="metric-mini">Separador detectado: ${utils.escapeHtml(labelFromDelimiter(datasusState.parsed.delimiter))}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Regiões detectadas</div>
          <div class="metric-value">${datasusState.parsed.selectableRows.length}</div>
          <div class="metric-mini">Linhas Total detectadas: ${datasusState.parsed.totalRows.length}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Anos detectados</div>
          <div class="metric-value">${firstYear}–${lastYear}</div>
          <div class="metric-mini">${datasusState.parsed.years.length} colunas anuais · ${datasusState.parsed.rawRowCount} linhas na tabela</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Medida detectada</div>
          <div class="metric-value tstudent-compact-value">${utils.escapeHtml(measure)}</div>
          <div class="metric-mini">Linhas ignoradas com segurança: ${datasusState.parsed.ignoredRows}</div>
        </div>
      </div>
    `;
  }

  function renderDatasusPreview() {
    if (datasusState.error) {
      datasusRefs.previewEl.innerHTML = `<div class="error-box">${utils.escapeHtml(datasusState.error)}</div>`;
      return;
    }

    if (!datasusState.parsed) {
      datasusRefs.previewEl.innerHTML = '<div class="small-note">Nenhuma base importada ainda.</div>';
      return;
    }

    const metadataHtml = datasusState.parsed.metadataLines.length
      ? `<div class="small-note" style="margin-bottom:12px;">Metadados detectados: ${utils.escapeHtml(datasusState.parsed.metadataLines.join(' | '))}</div>`
      : '';

    datasusRefs.previewEl.innerHTML = `
      ${metadataHtml}
      <div class="small-note" style="margin-bottom:10px;">Cabeçalho DATASUS identificado automaticamente na linha ${datasusState.parsed.headerRowIndex + 1}. A linha "Total" é reconhecida, mas fica excluída por padrão da seleção.</div>
      ${utils.renderPreviewTable(datasusState.parsed.previewHeaders, datasusState.parsed.previewRows, 10)}
    `;
  }
