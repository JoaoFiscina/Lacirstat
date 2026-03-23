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
