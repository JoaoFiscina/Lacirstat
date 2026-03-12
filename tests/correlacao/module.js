function splitDelimitedLine(line, delimiter) {
  if (!line) return [''];
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
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
  const sample = lines.slice(0, Math.min(5, lines.length));
  let tabScore = 0;
  let semiScore = 0;
  let commaScore = 0;
  sample.forEach(line => {
    tabScore += (line.match(/\t/g) || []).length;
    semiScore += (line.match(/;/g) || []).length;
    const chars = [...line];
    for (let i = 0; i < chars.length; i++) {
      if (chars[i] !== ',') continue;
      if (/\d/.test(chars[i - 1] || '') && /\d/.test(chars[i + 1] || '')) continue;
      commaScore += 1;
    }
  });
  if (tabScore >= semiScore && tabScore >= commaScore && tabScore > 0) return '\t';
  if (semiScore >= commaScore && semiScore > 0) return ';';
  return ',';
}

function hasHeaderLikely(firstRow, xIndex, yIndex, stats) {
  return stats.parseNumber(firstRow[xIndex]) === null || stats.parseNumber(firstRow[yIndex]) === null;
}

function parseDataset(text, stats) {
  const rawLines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!rawLines.length) {
    return {
      headers: ['X', 'Y'],
      rows: [],
      labels: [],
      x: [],
      y: [],
      rawCount: 0,
      ignoredCount: 0,
      hasIdentifier: false
    };
  }

  const delimiter = detectDelimiter(rawLines);
  let parsedRows = rawLines.map(line => splitDelimitedLine(line, delimiter));
  parsedRows = parsedRows.filter(row => row.some(cell => String(cell || '').trim() !== ''));

  const firstRow = parsedRows[0] || [];
  const hasThreeColumns = parsedRows.some(row => (row.length >= 3 && String(row[2] || '').trim() !== ''));

  let labelIndex = null;
  let xIndex = 0;
  let yIndex = 1;

  if (hasThreeColumns) {
    labelIndex = 0;
    xIndex = 1;
    yIndex = 2;
  } else if (stats.parseNumber(firstRow[0]) === null && stats.parseNumber(firstRow[1]) !== null) {
    labelIndex = 0;
    xIndex = 1;
    yIndex = 2;
  }

  if (labelIndex !== null) {
    parsedRows = parsedRows.map(row => {
      const normalized = [...row];
      while (normalized.length < 3) normalized.push('');
      return normalized;
    });
  } else {
    parsedRows = parsedRows.map(row => {
      const normalized = [...row];
      while (normalized.length < 2) normalized.push('');
      return normalized;
    });
  }

  const headerExists = hasHeaderLikely(parsedRows[0], xIndex, yIndex, stats);
  let headers = ['X', 'Y'];
  if (headerExists) {
    const headerRow = parsedRows.shift() || [];
    headers = [headerRow[xIndex] || 'X', headerRow[yIndex] || 'Y'];
  }

  const rows = [];
  const labels = [];
  const x = [];
  const y = [];

  parsedRows.forEach((row, i) => {
    const xVal = stats.parseNumber(row[xIndex]);
    const yVal = stats.parseNumber(row[yIndex]);
    if (xVal === null || yVal === null) return;
    const label = labelIndex !== null ? String(row[labelIndex] || `Obs ${i + 1}`) : `Obs ${i + 1}`;
    x.push(xVal);
    y.push(yVal);
    labels.push(label);
    rows.push([label, String(row[xIndex]), String(row[yIndex])]);
  });

  return {
    headers,
    rows,
    labels,
    x,
    y,
    rawCount: parsedRows.length,
    ignoredCount: Math.max(0, parsedRows.length - x.length),
    hasIdentifier: labelIndex !== null
  };
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
  const { root, config, utils, stats } = ctx;
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

  if (examples[0]) {
    loadExample();
    runAnalysis();
  }
}
