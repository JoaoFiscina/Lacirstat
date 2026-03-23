function splitDelimitedLine(line, delimiter) {
  if (!line) return [''];
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    const prev = line[index - 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
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
  let semicolonScore = 0;
  let tabScore = 0;
  let commaScore = 0;

  sample.forEach(line => {
    semicolonScore += (line.match(/;/g) || []).length;
    tabScore += (line.match(/\t/g) || []).length;

    for (let index = 0; index < line.length; index += 1) {
      if (line[index] !== ',') continue;
      if (/\d/.test(line[index - 1] || '') && /\d/.test(line[index + 1] || '')) continue;
      commaScore += 1;
    }
  });

  if (semicolonScore > 0) return ';';
  if (tabScore > 0) return '\t';
  return commaScore > 0 ? ',' : ';';
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

function cleanCategoryLabel(value) {
  const normalized = normalizeSpaces(value);
  const withoutIndex = normalized.replace(/^\(?\d+\)?(?:[.\-])?\s+(?=[A-ZÀ-ÖØ-Þ])/u, '').trim();
  return withoutIndex || normalized;
}

function labelFromDelimiter(delimiter) {
  if (delimiter === ';') return 'ponto e virgula';
  if (delimiter === '\t') return 'tabulacao';
  return 'virgula';
}

function isYearToken(token) {
  return /^(18|19|20)\d{2}$/.test(token);
}

function isTotalToken(token) {
  return token === 'total';
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
  if (abs < 0.2) return 'muito pequeno';
  if (abs < 0.5) return 'pequeno';
  if (abs < 0.8) return 'moderado';
  if (abs < 1.2) return 'grande';
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
  rows = rows.filter(row => row.some(cell => normalizeSpaces(cell) !== ''));
  rows = rows.map(row => {
    const normalized = [...row];
    while (normalized.length < 2) normalized.push('');
    return normalized;
  });

  const first = rows[0] || [];
  const likelyHeader = stats.parseNumber(first[0]) === null || stats.parseNumber(first[1]) === null;

  let headers = ['Grupo 1', 'Grupo 2'];
  if (likelyHeader) {
    headers = [first[0] || 'Grupo 1', first[1] || 'Grupo 2'];
    rows = rows.slice(1);
  }

  const numericPairs = rows.filter(row => stats.parseNumber(row[0]) !== null || stats.parseNumber(row[1]) !== null).length;
  const categoricalPairs = rows.filter(row => row[0] && stats.parseNumber(row[1]) !== null).length;

  let mode = 'two_numeric';
  if (categoricalPairs >= numericPairs && rows.every(row => row.length >= 2)) {
    const distinct = [...new Set(rows.map(row => normalizeSpaces(row[0])).filter(Boolean))];
    if (distinct.length >= 2 && distinct.length <= 4) mode = 'categorical_numeric';
  }

  const g1 = [];
  const g2 = [];
  const previewRows = [];
  let groupNames = [...headers];

  if (mode === 'categorical_numeric') {
    const bucket = new Map();
    rows.forEach(row => {
      const groupName = normalizeSpaces(row[0]);
      const value = stats.parseNumber(row[1]);
      if (!groupName || value === null) return;
      if (!bucket.has(groupName)) bucket.set(groupName, []);
      bucket.get(groupName).push(value);
      previewRows.push([groupName, String(row[1] || '')]);
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
    const normalizedCells = row.map(normalizeSpaces);
    const tokens = normalizedCells.map(normalizeToken);
    const yearColumns = [];
    let totalIndex = null;

    tokens.forEach((token, index) => {
      if (isYearToken(token)) {
        yearColumns.push({ index, year: token });
      } else if (totalIndex === null && isTotalToken(token)) {
        totalIndex = index;
      }
    });

    if (yearColumns.length < 2) continue;

    const firstYearIndex = yearColumns[0].index;
    let dimensionIndex = tokens.findIndex((token, index) => index < firstYearIndex && token && !isYearToken(token) && !isTotalToken(token));
    if (dimensionIndex === -1) {
      dimensionIndex = tokens.findIndex(token => token && !isYearToken(token) && !isTotalToken(token));
    }
    if (dimensionIndex === -1) continue;

    return {
      rowIndex,
      dimensionIndex,
      dimensionLabel: normalizedCells[dimensionIndex] || 'Categoria',
      yearColumns,
      totalIndex
    };
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
    return { ok: false, error: 'Nenhum conteudo foi encontrado no arquivo informado.' };
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
    return { ok: false, error: 'Nao foi possivel interpretar o arquivo DATASUS enviado.' };
  }

  const { delimiter, rows, header } = detected;
  const dimensionLabel = normalizeSpaces(rows[header.rowIndex][header.dimensionIndex]) || 'Categoria';
  const bodyRows = rows
    .slice(header.rowIndex + 1)
    .filter(row => row.some(cell => normalizeSpaces(cell) !== ''));
  const maxCols = Math.max(rows[header.rowIndex].length, ...bodyRows.map(row => row.length), 0);
  const previewHeaders = Array.from({ length: maxCols }, (_, index) => {
    const cell = normalizeSpaces(rows[header.rowIndex][index]);
    if (cell) return cell;
    return index === header.dimensionIndex ? dimensionLabel : `Coluna ${index + 1}`;
  });

  const parsedRows = [];
  let ignoredRows = 0;

  bodyRows.forEach((rawRow, bodyIndex) => {
    const row = Array.from({ length: maxCols }, (_, index) => normalizeSpaces(rawRow[index]));
    const rawLabel = row[header.dimensionIndex] || row.find(cell => cell) || '';
    const cleanLabel = cleanCategoryLabel(rawLabel);
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
    return { ok: false, error: 'Nao foi possivel interpretar o arquivo DATASUS enviado.' };
  }

  return {
    ok: true,
    delimiter,
    headerRowIndex: header.rowIndex,
    dimensionIndex: header.dimensionIndex,
    dimensionLabel,
    totalIndex: header.totalIndex,
    hasTotalColumn: header.totalIndex !== null,
    yearColumns: header.yearColumns,
    years,
    previewHeaders,
    previewRows: bodyRows.map(rawRow => Array.from({ length: maxCols }, (_, index) => normalizeSpaces(rawRow[index]))),
    parsedRows,
    selectableRows,
    totalRows: parsedRows.filter(row => row.isTotalRow),
    detectedRowCount: parsedRows.length,
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
    const complete = chunk.length === 5 && (chunk[chunk.length - 1] - chunk[0]) === 4;
    blocks.push({
      key: chunk.join('|'),
      years: chunk.map(String),
      label: `${chunk[0]}-${chunk[chunk.length - 1]}`,
      complete,
      incomplete: !complete
    });
  }

  return {
    complete: blocks.filter(block => block.complete),
    incomplete: blocks.filter(block => block.incomplete),
    all: blocks
  };
}

function getSelectedPeriodYears(state) {
  if (!state.parsed) return [];
  const years = state.parsed.years;

  if (state.periodMode === 'all') {
    return [...years];
  }

  if (state.periodMode === 'single') {
    return years.includes(state.singleYear) ? [state.singleYear] : [];
  }

  if (state.periodMode === 'block') {
    const block = state.blocks.all.find(item => item.key === state.blockKey);
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
  if (!selectedYears.length) return 'sem periodo valido';

  if (state.periodMode === 'all') {
    return `${selectedYears[0]}-${selectedYears[selectedYears.length - 1]} (todos os anos)`;
  }

  if (state.periodMode === 'single') {
    return `ano ${selectedYears[0]}`;
  }

  if (state.periodMode === 'block') {
    const block = state.blocks.all.find(item => item.key === state.blockKey);
    if (!block) return `${selectedYears[0]}-${selectedYears[selectedYears.length - 1]}`;
    return block.complete
      ? `${block.label} (bloco automatico de 5 anos)`
      : `${block.label} (bloco incompleto)`;
  }

  return `${selectedYears[0]}-${selectedYears[selectedYears.length - 1]}`;
}

function joinRegionList(labels) {
  if (!labels.length) return 'nenhuma categoria selecionada';
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} e ${labels[labels.length - 1]}`;
}

function deriveDatasusComparison(state, stats) {
  if (!state.parsed) {
    return {
      ok: false,
      primaryError: 'Nao foi possivel interpretar o arquivo DATASUS enviado.',
      validationErrors: ['Nao foi possivel interpretar o arquivo DATASUS enviado.'],
      selectedYears: [],
      derivedRows: [],
      vectors: { A: [], B: [] },
      selectionCounts: { A: 0, B: 0 },
      validCounts: { A: 0, B: 0 },
      omittedRows: [],
      groupRegions: { A: [], B: [] },
      periodLabel: ''
    };
  }

  const selectedYears = getSelectedPeriodYears(state);
  if (!selectedYears.length) {
    return {
      ok: false,
      primaryError: 'Nenhum ano valido foi encontrado no periodo selecionado.',
      validationErrors: ['Nenhum ano valido foi encontrado no periodo selecionado.'],
      selectedYears: [],
      derivedRows: [],
      vectors: { A: [], B: [] },
      selectionCounts: { A: 0, B: 0 },
      validCounts: { A: 0, B: 0 },
      omittedRows: [],
      groupRegions: { A: [], B: [] },
      periodLabel: ''
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

  const derivedRows = [];
  const omittedRows = [];

  selectedRows.forEach(item => {
    const validYears = selectedYears.filter(year => Number.isFinite(item.row.valuesByYear[year]));
    if (!validYears.length) {
      omittedRows.push({
        rowId: item.row.id,
        rowLabel: item.row.cleanLabel,
        groupKey: item.group,
        reason: 'Sem valores numericos no periodo selecionado.'
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
        reason: 'Resumo invalido apos a filtragem.'
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
  const validationErrors = [];

  if (!derivedRows.length && selectedRows.length) {
    validationErrors.push('O periodo selecionado nao gerou valores suficientes.');
  }
  if (vectors.A.some(value => Number.isNaN(value)) || vectors.B.some(value => Number.isNaN(value))) {
    validationErrors.push('Os vetores finais contem valores invalidos.');
  }
  if (validCounts.A < 2) {
    validationErrors.push('Grupo A precisa ter pelo menos 2 observacoes validas.');
  }
  if (validCounts.B < 2) {
    validationErrors.push('Grupo B precisa ter pelo menos 2 observacoes validas.');
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
  const jitter = index => ((index % 10) - 4.5) * 5;
  const ticks = Array.from({ length: 6 }, (_, index) => yMin + ((yMax - yMin) * index) / 5);

  const grid = ticks.map(tick => {
    const py = y(tick);
    return `<g><line x1="${margin.left}" y1="${py.toFixed(2)}" x2="${width - margin.right}" y2="${py.toFixed(2)}" stroke="#dbe5f2" stroke-dasharray="4 6"/><text x="${margin.left - 12}" y="${(py + 4).toFixed(2)}" fill="#5b6b84" text-anchor="end" font-size="12">${utils.fmtNumber(tick, 1)}</text></g>`;
  }).join('');

  function drawGroup(values, centerX, color, label) {
    const sum = summarize(values, stats);
    const points = values.map((value, index) => `<circle cx="${(centerX + jitter(index)).toFixed(2)}" cy="${y(value).toFixed(2)}" r="5.4" fill="${color}" fill-opacity="0.9" stroke="#fff" stroke-width="1.8"><title>${utils.escapeHtml(label)}: ${utils.fmtNumber(value, 2)}</title></circle>`).join('');
    return `
      <line x1="${centerX}" y1="${y(sum.max).toFixed(2)}" x2="${centerX}" y2="${y(sum.min).toFixed(2)}" stroke="${color}" stroke-width="2.6" opacity="0.7"/>
      <rect x="${centerX - 28}" y="${y(sum.q3).toFixed(2)}" width="56" height="${Math.max(10, y(sum.q1) - y(sum.q3)).toFixed(2)}" rx="10" fill="${color}" fill-opacity="0.12" stroke="${color}" stroke-width="2"/>
      <line x1="${centerX - 32}" y1="${y(sum.mean).toFixed(2)}" x2="${centerX + 32}" y2="${y(sum.mean).toFixed(2)}" stroke="${color}" stroke-width="3"/>
      ${points}
    `;
  }

  return `
    <svg class="groupplot-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Distribuicao dos grupos">
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
    <svg class="groupplot-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Medias e intervalo de confianca">
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
      <text x="${width / 2}" y="${margin.top}" text-anchor="middle" fill="#334155" font-size="12" font-weight="700">IC95% da diferenca (${utils.escapeHtml(labels[0])} - ${utils.escapeHtml(labels[1])})</text>
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
      <div class="metric-label">Diferenca entre medias</div>
      <div class="metric-value">${utils.fmtSigned(result.diff, 2)}</div>
      <div class="metric-mini">IC95%: ${utils.fmtNumber(result.ci[0], 2)} a ${utils.fmtNumber(result.ci[1], 2)}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Estatistica t</div>
      <div class="metric-value">${utils.fmtNumber(result.t, 3)}</div>
      <div class="metric-mini">gl = ${utils.fmtNumber(result.df, 2)} · p = ${utils.fmtP(result.p)}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Cohen's d</div>
      <div class="metric-value">${utils.fmtSigned(result.d, 2)}</div>
      <div class="metric-mini">Classificacao: ${utils.escapeHtml(classifyEffect(result.d))}</div>
    </div>
  `;
}

function buildResultChartsHtml(result, labels, g1, g2, stats, utils) {
  return `
    <article class="chart-card">
      <h4>Grafico 1 · Distribuicao e dispersao por grupo</h4>
      <div class="chart-wrap">${buildDistributionSvg(g1, g2, labels[0], labels[1], stats, utils)}</div>
    </article>
    <article class="chart-card">
      <h4>Grafico 2 · Comparacao de medias e IC95%</h4>
      <div class="chart-wrap">${buildMeanCiSvg(result, labels, utils)}</div>
      <div class="small-note" style="margin-top:10px;">A barra central indica o IC95% da diferenca (${utils.escapeHtml(labels[0])} - ${utils.escapeHtml(labels[1])}).</div>
    </article>
  `;
}

function buildManualInterpretation(result, alpha, labels, question, utils) {
  const effectClass = classifyEffect(result.d);
  const higherGroup = result.diff >= 0 ? labels[0] : labels[1];
  const diffAbs = Math.abs(result.diff);
  const significant = result.p < alpha;
  const paragraph = significant
    ? `Observou-se diferenca estatisticamente significativa entre a media de ${labels[0]} e ${labels[1]}. A media foi maior em ${higherGroup}, com diferenca media de ${utils.fmtNumber(diffAbs, 2)} unidades.`
    : `Nao se observou diferenca estatisticamente significativa entre as medias de ${labels[0]} e ${labels[1]}. Ainda assim, ${higherGroup} apresentou media numericamente maior, com diferenca media de ${utils.fmtNumber(diffAbs, 2)} unidades.`;

  return `
    ${utils.buildInterpretationCard('Interpretacao automatica', paragraph, [
      `Pergunta analisada: ${question || 'Comparacao entre duas medias independentes'}.`,
      `Resultado principal: t = ${utils.fmtNumber(result.t, 3)}, gl = ${utils.fmtNumber(result.df, 2)}, p = ${utils.fmtP(result.p)}.`,
      `Tamanho de efeito: ${effectClass}.`
    ])}
    <div class="result-card">
      <h4>Leitura didatica final</h4>
      <ul>
        <li>Grupo com maior media: <strong>${utils.escapeHtml(higherGroup)}</strong>.</li>
        <li>Diferenca observada: <strong>${utils.fmtSigned(result.diff, 2)}</strong> unidades.</li>
        <li>Classificacao do efeito: <strong>${utils.escapeHtml(effectClass)}</strong>.</li>
      </ul>
    </div>
  `;
}

function buildDatasusInterpretation(result, derived, alpha, question, utils) {
  const significant = result.p < alpha;
  const higherGroup = result.diff >= 0 ? 'Grupo A' : 'Grupo B';
  const paragraph = significant
    ? `Apos resumir os valores anuais dentro do periodo selecionado para cada categoria e comparar os grupos definidos pelo usuario, observou-se diferenca estatisticamente significativa entre Grupo A e Grupo B. A media foi maior em ${higherGroup}.`
    : `Apos resumir os valores anuais dentro do periodo selecionado para cada categoria e comparar os grupos definidos pelo usuario, nao se observou diferenca estatisticamente significativa entre Grupo A e Grupo B. Ainda assim, a media foi numericamente maior em ${higherGroup}.`;

  return `
    ${utils.buildInterpretationCard('Interpretacao automatica', paragraph, [
      `Pergunta analisada: ${question || 'Comparacao entre dois grupos de categorias'}.`,
      `Periodo analisado: ${derived.periodLabel}.`,
      `Grupo A: ${joinRegionList(derived.groupRegions.A)}.`,
      `Grupo B: ${joinRegionList(derived.groupRegions.B)}.`,
      'Resumo utilizado: media por categoria dentro do periodo selecionado, mantendo cada categoria como uma observacao separada.',
      `Resultado principal: t = ${utils.fmtNumber(result.t, 3)}, gl = ${utils.fmtNumber(result.df, 2)}, p = ${utils.fmtP(result.p)}.`
    ])}
  `;
}
