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
