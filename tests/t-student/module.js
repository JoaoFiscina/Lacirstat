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

function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
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
  const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
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
  const y = v => height - margin.bottom - ((v - yMin) / (yMax - yMin || 1)) * (height - margin.top - margin.bottom);
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

function renderError(statusEl, metricsEl, chartEl, resultsEl, message) {
  statusEl.className = 'error-box';
  statusEl.textContent = message;
  metricsEl.innerHTML = '';
  chartEl.innerHTML = '';
  resultsEl.innerHTML = '';
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
        <h4>Entrada de dados</h4>
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
          <textarea id="t-paste" placeholder="Grupo A\tGrupo B\n4,8\t6,1\n5,1\t5,8\n..."></textarea>
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
      </section>

      <section class="surface-card">
        <h4>Resultados e interpretação</h4>
        <div id="t-status" class="status-bar">Carregue um exemplo ou cole os dados para iniciar.</div>
        <div id="t-group-summary" class="metrics-grid t-group-summary" style="margin-top:14px;"></div>
        <div id="t-metrics" class="metrics-grid" style="margin-top:14px;"></div>
        <div id="t-chart" class="chart-grid" style="margin-top:14px;"></div>
        <div id="t-results" class="result-grid" style="margin-top:14px;"></div>
      </section>
    </div>
  `;

  const pasteEl = root.querySelector('#t-paste');
  const previewEl = root.querySelector('#t-preview');
  const statusEl = root.querySelector('#t-status');
  const groupSummaryEl = root.querySelector('#t-group-summary');
  const metricsEl = root.querySelector('#t-metrics');
  const chartEl = root.querySelector('#t-chart');
  const resultsEl = root.querySelector('#t-results');
  const contextEl = root.querySelector('#t-context');
  const alphaEl = root.querySelector('#t-alpha');

  function refreshPreview() {
    const parsed = parseDataset(pasteEl.value, stats);
    if (!parsed.previewRows.length) {
      previewEl.innerHTML = '<div class="small-note">Nenhum dado carregado ainda.</div>';
      groupSummaryEl.innerHTML = '';
      return parsed;
    }

    const previewHeaders = parsed.mode === 'categorical_numeric'
      ? ['Grupo', 'Valor']
      : parsed.headers;

    previewEl.innerHTML = `
      <div class="small-note">Formato detectado: <strong>${parsed.mode === 'categorical_numeric' ? 'Grupo + valor' : 'Duas colunas numéricas'}</strong> · Linhas válidas: ${parsed.validRows} · Linhas ignoradas: ${parsed.ignoredRows}</div>
      ${utils.renderPreviewTable(previewHeaders, parsed.previewRows, 8)}
    `;

    groupSummaryEl.innerHTML = `
      <div class="metric-card"><div class="metric-label">Grupo detectado 1</div><div class="metric-value">${utils.escapeHtml(parsed.groupNames[0] || 'Grupo 1')}</div><div class="metric-mini">n = ${parsed.g1.length}</div></div>
      <div class="metric-card"><div class="metric-label">Grupo detectado 2</div><div class="metric-value">${utils.escapeHtml(parsed.groupNames[1] || 'Grupo 2')}</div><div class="metric-mini">n = ${parsed.g2.length}</div></div>
      <div class="metric-card"><div class="metric-label">Dados válidos</div><div class="metric-value">${parsed.validRows}</div><div class="metric-mini">Total importado = ${parsed.rawRows}</div></div>
    `;

    return parsed;
  }

  function runAnalysis() {
    const parsed = refreshPreview();
    const alpha = Number(alphaEl.value || 0.05);

    if (parsed.g1.length < 2 || parsed.g2.length < 2) {
      renderError(statusEl, metricsEl, chartEl, resultsEl, 'Precisamos de pelo menos 2 valores válidos em cada grupo para rodar o teste t.');
      return;
    }

    const result = safeWelch(parsed.g1, parsed.g2, stats);
    if (!Number.isFinite(result.t) || !Number.isFinite(result.p)) {
      renderError(statusEl, metricsEl, chartEl, resultsEl, 'Não foi possível calcular o teste com esses dados (verifique variabilidade e valores).');
      return;
    }

    const group1 = parsed.groupNames[0] || 'Grupo 1';
    const group2 = parsed.groupNames[1] || 'Grupo 2';
    const effectClass = classifyEffect(result.d);
    const signif = result.p < alpha;
    const higherGroup = result.diff >= 0 ? group1 : group2;
    const diffAbs = Math.abs(result.diff);
    const impactText = Math.abs(result.d) < 0.2 ? 'baixo' : Math.abs(result.d) < 0.8 ? 'intermediário' : 'alto';

    statusEl.className = signif ? 'success-box' : 'status-bar';
    statusEl.textContent = signif
      ? `Diferença estatisticamente significativa detectada (p ${utils.fmtP(result.p)} < ${alpha.toLocaleString('pt-BR')}).`
      : `Não houve evidência estatística suficiente de diferença entre as médias (p ${utils.fmtP(result.p)}).`;

    metricsEl.innerHTML = `
      <div class="metric-card"><div class="metric-label">${utils.escapeHtml(group1)}</div><div class="metric-value">${utils.fmtNumber(result.m1, 2)}</div><div class="metric-mini">n = ${result.n1} · DP = ${utils.fmtNumber(result.s1, 2)}</div></div>
      <div class="metric-card"><div class="metric-label">${utils.escapeHtml(group2)}</div><div class="metric-value">${utils.fmtNumber(result.m2, 2)}</div><div class="metric-mini">n = ${result.n2} · DP = ${utils.fmtNumber(result.s2, 2)}</div></div>
      <div class="metric-card"><div class="metric-label">Diferença entre médias</div><div class="metric-value">${utils.fmtSigned(result.diff, 2)}</div><div class="metric-mini">IC95%: ${utils.fmtNumber(result.ci[0], 2)} a ${utils.fmtNumber(result.ci[1], 2)}</div></div>
      <div class="metric-card"><div class="metric-label">Estatística t</div><div class="metric-value">${utils.fmtNumber(result.t, 3)}</div><div class="metric-mini">gl = ${utils.fmtNumber(result.df, 2)} · p = ${utils.fmtP(result.p)}</div></div>
      <div class="metric-card"><div class="metric-label">Cohen's d</div><div class="metric-value">${utils.fmtSigned(result.d, 2)}</div><div class="metric-mini">Classificação: ${utils.escapeHtml(effectClass)}</div></div>
    `;

    chartEl.innerHTML = `
      <article class="chart-card">
        <h4>Gráfico 1 · Distribuição e dispersão por grupo</h4>
        <div class="chart-wrap">${buildDistributionSvg(parsed.g1, parsed.g2, group1, group2, stats, utils)}</div>
      </article>
      <article class="chart-card">
        <h4>Gráfico 2 · Comparação de médias e IC95%</h4>
        <div class="chart-wrap">${buildMeanCiSvg(result, [group1, group2], utils)}</div>
        <div class="small-note" style="margin-top:10px;">A barra central indica o IC95% da diferença (${utils.escapeHtml(group1)} − ${utils.escapeHtml(group2)}).</div>
      </article>
    `;

    const interpretation = signif
      ? `Observou-se diferença estatisticamente significativa entre a média de ${group1} e ${group2}. A média foi maior em ${higherGroup}, com diferença média de ${utils.fmtNumber(diffAbs, 2)} unidades. O tamanho de efeito foi classificado como ${effectClass}, sugerindo impacto ${impactText}.`
      : `Não se observou diferença estatisticamente significativa entre as médias de ${group1} e ${group2}. Ainda assim, ${higherGroup} apresentou média numericamente maior, com diferença média de ${utils.fmtNumber(diffAbs, 2)} unidades. O tamanho de efeito foi ${effectClass}, sugerindo impacto ${impactText}.`;

    resultsEl.innerHTML = `
      ${utils.buildInterpretationCard('Interpretação automática', interpretation, [
        `Pergunta analisada: ${contextEl.value || config.defaultQuestion || 'Comparação entre duas médias independentes'}.`,
        `Resultado principal: t = ${utils.fmtNumber(result.t, 3)}, gl = ${utils.fmtNumber(result.df, 2)}, p = ${utils.fmtP(result.p)}.`,
        `Recomendação: reporte p-valor, IC95% e tamanho de efeito em conjunto para uma interpretação completa.`
      ])}
      <div class="result-card">
        <h4>Leitura didática final</h4>
        <ul>
          <li>Grupo com maior média: <strong>${utils.escapeHtml(higherGroup)}</strong>.</li>
          <li>Diferença observada: <strong>${utils.fmtSigned(result.diff, 2)}</strong> unidades.</li>
          <li>Classificação do efeito (Cohen's d): <strong>${utils.escapeHtml(effectClass)}</strong>.</li>
        </ul>
      </div>
    `;
  }

  function clearAll() {
    pasteEl.value = '';
    contextEl.value = config.defaultQuestion || 'As médias dos grupos são diferentes?';
    alphaEl.value = '0.05';
    previewEl.innerHTML = '<div class="small-note">Nenhum dado carregado ainda.</div>';
    groupSummaryEl.innerHTML = '';
    statusEl.className = 'status-bar';
    statusEl.textContent = 'Campos limpos. Cole novos dados e rode novamente.';
    metricsEl.innerHTML = '';
    chartEl.innerHTML = '';
    resultsEl.innerHTML = '';
  }

  root.querySelector('#t-example').addEventListener('click', () => {
    pasteEl.value = config.exampleText || '';
    runAnalysis();
  });
  root.querySelector('#t-run').addEventListener('click', runAnalysis);
  root.querySelector('#t-clear').addEventListener('click', clearAll);
  pasteEl.addEventListener('input', refreshPreview);

  pasteEl.value = config.exampleText || '';
  runAnalysis();
}
