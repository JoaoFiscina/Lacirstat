
function parseDataset(text, utils, stats) {
  const parsed = utils.parseDelimitedText(text, 3);
  const headers = parsed.headers || [];
  const rows = parsed.rows || [];
  if (!rows.length) return { headers: ['Variável X', 'Variável Y'], rows: [], labels: [], x: [], y: [] };

  const firstRow = rows[0] || [];
  const hasThirdCol = rows.some(r => String(r[2] ?? '').trim() !== '') || Boolean(headers[2]);
  const firstColLooksLikeLabel = stats.parseNumber(firstRow[0]) === null && stats.parseNumber(firstRow[1]) !== null;

  let labelIndex = null;
  let xIndex = 0;
  let yIndex = 1;
  if (hasThirdCol || firstColLooksLikeLabel) {
    labelIndex = 0;
    xIndex = 1;
    yIndex = 2;
  }

  const out = { headers: ['Variável X', 'Variável Y'], rows: [], labels: [], x: [], y: [] };
  out.headers = headers.length ? [headers[xIndex] || 'Variável X', headers[yIndex] || 'Variável Y'] : ['Variável X', 'Variável Y'];

  rows.forEach((row, idx) => {
    const x = stats.parseNumber(row[xIndex]);
    const y = stats.parseNumber(row[yIndex]);
    if (x === null || y === null) return;
    const label = labelIndex !== null ? String(row[labelIndex] || `Linha ${idx + 1}`) : `Linha ${idx + 1}`;
    out.labels.push(label);
    out.x.push(x);
    out.y.push(y);
    out.rows.push([label, String(row[xIndex]), String(row[yIndex])]);
  });
  return out;
}

function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  return sorted[base];
}

function outlierMask(values) {
  const s = [...values].sort((a, b) => a - b);
  const q1 = quantile(s, 0.25);
  const q3 = quantile(s, 0.75);
  const iqr = q3 - q1;
  const low = q1 - 1.5 * iqr;
  const high = q3 + 1.5 * iqr;
  return values.map(v => v < low || v > high);
}

function strengthText(coef) {
  const abs = Math.abs(coef);
  if (abs < 0.10) return 'praticamente ausente';
  if (abs < 0.30) return 'fraca';
  if (abs < 0.50) return 'leve a moderada';
  if (abs < 0.70) return 'moderada';
  if (abs < 0.90) return 'forte';
  return 'muito forte';
}

function directionText(coef) {
  if (coef > 0) return 'positiva';
  if (coef < 0) return 'negativa';
  return 'nula';
}

function buildScatterSvg(dataset, pearsonResult, utils) {
  const width = 860;
  const height = 460;
  const margin = { top: 26, right: 24, bottom: 64, left: 84 };
  const xMin = Math.min(...dataset.x);
  const xMax = Math.max(...dataset.x);
  const yMin = Math.min(...dataset.y);
  const yMax = Math.max(...dataset.y);
  const xPad = xMin === xMax ? 1 : (xMax - xMin) * 0.08;
  const yPad = yMin === yMax ? 1 : (yMax - yMin) * 0.10;
  const minX = xMin - xPad;
  const maxX = xMax + xPad;
  const minY = yMin - yPad;
  const maxY = yMax + yPad;
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const xToPx = x => margin.left + ((x - minX) / (maxX - minX || 1)) * innerW;
  const yToPx = y => height - margin.bottom - ((y - minY) / (maxY - minY || 1)) * innerH;
  const xTicks = Array.from({ length: 5 }, (_, i) => minX + ((maxX - minX) * i) / 4);
  const yTicks = Array.from({ length: 5 }, (_, i) => minY + ((maxY - minY) * i) / 4);
  const xOut = outlierMask(dataset.x);
  const yOut = outlierMask(dataset.y);
  const lineX1 = minX;
  const lineX2 = maxX;
  const lineY1 = pearsonResult.intercept + pearsonResult.slope * lineX1;
  const lineY2 = pearsonResult.intercept + pearsonResult.slope * lineX2;

  const points = dataset.x.map((x, i) => {
    const px = xToPx(x);
    const py = yToPx(dataset.y[i]);
    const flagged = xOut[i] || yOut[i];
    const fill = flagged ? '#f97316' : '#2563eb';
    return `<circle cx="${px.toFixed(2)}" cy="${py.toFixed(2)}" r="6.2" fill="${fill}" fill-opacity="0.92" stroke="#ffffff" stroke-width="2"><title>${utils.escapeHtml(dataset.labels[i])} | ${utils.escapeHtml(dataset.headers[0])}: ${utils.fmtNumber(x, 2)} | ${utils.escapeHtml(dataset.headers[1])}: ${utils.fmtNumber(dataset.y[i], 2)}</title></circle>`;
  }).join('');

  const xGrid = xTicks.map(t => {
    const px = xToPx(t);
    return `<g><line x1="${px.toFixed(2)}" y1="${margin.top}" x2="${px.toFixed(2)}" y2="${height - margin.bottom}" stroke="#dbe5f2" stroke-dasharray="4 6" /><text x="${px.toFixed(2)}" y="${height - margin.bottom + 24}" text-anchor="middle" fill="#5b6b84" font-size="12">${utils.fmtNumber(t, 1)}</text></g>`;
  }).join('');
  const yGrid = yTicks.map(t => {
    const py = yToPx(t);
    return `<g><line x1="${margin.left}" y1="${py.toFixed(2)}" x2="${width - margin.right}" y2="${py.toFixed(2)}" stroke="#dbe5f2" stroke-dasharray="4 6" /><text x="${margin.left - 14}" y="${(py + 4).toFixed(2)}" text-anchor="end" fill="#5b6b84" font-size="12">${utils.fmtNumber(t, 1)}</text></g>`;
  }).join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" class="scatter-svg" role="img" aria-label="Gráfico de dispersão com reta de tendência">
      <rect x="0" y="0" width="${width}" height="${height}" rx="22" fill="#ffffff" />
      ${xGrid}
      ${yGrid}
      <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" stroke="#8da1bc" stroke-width="1.5" />
      <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" stroke="#8da1bc" stroke-width="1.5" />
      <line x1="${xToPx(lineX1).toFixed(2)}" y1="${yToPx(lineY1).toFixed(2)}" x2="${xToPx(lineX2).toFixed(2)}" y2="${yToPx(lineY2).toFixed(2)}" stroke="#0f766e" stroke-width="3.2" stroke-linecap="round" />
      ${points}
      <text x="${width / 2}" y="${height - 16}" text-anchor="middle" fill="#334155" font-size="13" font-weight="700">${utils.escapeHtml(dataset.headers[0])}</text>
      <text x="22" y="${height / 2}" text-anchor="middle" fill="#334155" font-size="13" font-weight="700" transform="rotate(-90, 22, ${height / 2})">${utils.escapeHtml(dataset.headers[1])}</text>
    </svg>
  `;
}

function compareMessage(pearsonResult, spearmanResult, outlierCount) {
  const gap = Math.abs(Math.abs(pearsonResult.coef) - Math.abs(spearmanResult.coef));
  if (outlierCount > 0 && gap > 0.12) return 'Há pontos extremos e diferença relevante entre Pearson e Spearman; revise a influência de outliers antes de relatar apenas o Pearson.';
  if (gap > 0.18) return 'Pearson e Spearman divergem de forma perceptível; isso pode sugerir não linearidade ou concentração de poucos pontos na reta.';
  return 'Pearson e Spearman ficaram próximos; a direção geral da associação parece estável entre a leitura linear e a leitura por postos.';
}

function renderEffectBar(value) {
  const pct = Math.min(100, Math.abs(value) * 100);
  return `<div class="metric-bar"><span style="width:${pct}%;"></span></div>`;
}

export async function renderTestModule(ctx) {
  const { root, config, utils, stats } = ctx;
  const examples = config.examples || [];

  root.innerHTML = `
    <div class="module-grid">
      <section class="module-header">
        <div class="chip chip-info">Correlação com gráfico e comparação de métodos</div>
        <h3>${utils.escapeHtml(config.title)}</h3>
        <p>${utils.escapeHtml(config.description)}</p>
      </section>

      <section class="callout-grid">
        <article class="help-card">
          <h4>Quando usar</h4>
          <ul>${(config.inputGuide || []).map(item => `<li>${utils.escapeHtml(item)}</li>`).join('')}</ul>
        </article>
        <article class="tip-card">
          <h4>Antes de rodar</h4>
          <ul>
            <li>Confirme se as duas variáveis são quantitativas.</li>
            <li>Verifique se as colunas não foram lidas invertidas.</li>
            <li>Use o gráfico como filtro inicial de plausibilidade.</li>
          </ul>
        </article>
        <article class="tip-card">
          <h4>Erros comuns</h4>
          <ul>
            <li>Interpretar correlação como causalidade.</li>
            <li>Relatar apenas p-valor sem direção e magnitude.</li>
            <li>Ignorar um outlier óbvio no gráfico.</li>
          </ul>
        </article>
      </section>

      <section class="surface-card decorated">
        <h4>Dados de entrada</h4>
        <div class="form-grid three">
          <div>
            <label for="c-method">Método principal</label>
            <select id="c-method">
              <option value="pearson">Pearson</option>
              <option value="spearman">Spearman</option>
            </select>
          </div>
          <div>
            <label for="c-example-select">Exemplo rápido</label>
            <select id="c-example-select">
              ${examples.map((ex, idx) => `<option value="${utils.escapeHtml(ex.id)}" ${idx === 0 ? 'selected' : ''}>${utils.escapeHtml(ex.label)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label for="c-context">Pergunta do estudo</label>
            <input id="c-context" type="text" value="Existe associação entre as duas variáveis do estudo?" />
          </div>
        </div>
        <div style="margin-top:14px;">
          <label for="c-paste">Cole 2 ou 3 colunas da planilha</label>
          <textarea id="c-paste" placeholder="UF\tVariável X\tVariável Y\nBA\t52\t3,1\nSP\t58\t4,7"></textarea>
          <div class="small-note">Aceita colagem do Excel, CSV, TSV ou texto com 2 colunas (X/Y) ou 3 colunas (ID/X/Y).</div>
        </div>
        <div class="actions-row" style="margin-top:14px;">
          <button class="btn-secondary" id="c-load-example">Carregar exemplo</button>
          <button class="btn-ghost" id="c-template">Baixar modelo CSV</button>
          <label class="btn-ghost" style="display:inline-flex;align-items:center;gap:8px;">Importar arquivo<input id="c-file" type="file" accept=".csv,.tsv,.txt" style="display:none"></label>
          <button class="btn" id="c-run">Rodar correlação</button>
        </div>
      </section>

      <section class="surface-card">
        <h4>Pré-visualização dos dados</h4>
        <div id="c-preview" class="small-note">Nenhum dado carregado ainda.</div>
      </section>

      <section class="surface-card">
        <h4>Resultados</h4>
        <div id="c-status" class="status-bar">O primeiro exemplo já pode ser carregado e rodado imediatamente.</div>
        <div id="c-metrics" class="metrics-grid" style="margin-top:14px;"></div>
        <div id="c-chart" class="chart-grid" style="margin-top:14px;"></div>
        <div id="c-results" class="result-grid" style="margin-top:14px;"></div>
      </section>
    </div>
  `;

  const pasteEl = root.querySelector('#c-paste');
  const fileEl = root.querySelector('#c-file');
  const previewEl = root.querySelector('#c-preview');
  const statusEl = root.querySelector('#c-status');
  const metricsEl = root.querySelector('#c-metrics');
  const chartEl = root.querySelector('#c-chart');
  const resultsEl = root.querySelector('#c-results');
  const methodEl = root.querySelector('#c-method');
  const exampleSelectEl = root.querySelector('#c-example-select');
  const contextEl = root.querySelector('#c-context');

  function refreshPreview() {
    const dataset = parseDataset(pasteEl.value, utils, stats);
    if (!dataset.rows.length) {
      previewEl.innerHTML = '<div class="small-note">Nenhum dado carregado ainda.</div>';
      return dataset;
    }
    previewEl.innerHTML = utils.renderPreviewTable(['ID', dataset.headers[0], dataset.headers[1]], dataset.rows);
    return dataset;
  }

  function loadExample() {
    const selected = examples.find(ex => ex.id === exampleSelectEl.value) || examples[0];
    if (!selected) return;
    pasteEl.value = selected.text;
    refreshPreview();
    statusEl.className = 'status-bar';
    statusEl.textContent = selected.description || 'Exemplo carregado.';
  }

  function runAnalysis() {
    const dataset = refreshPreview();
    if (dataset.x.length < 4) {
      statusEl.className = 'error-box';
      statusEl.textContent = 'Use pelo menos 4 pares válidos para uma leitura minimamente estável.';
      metricsEl.innerHTML = '';
      chartEl.innerHTML = '';
      resultsEl.innerHTML = '';
      return;
    }

    const pearsonResult = stats.pearson(dataset.x, dataset.y);
    const spearmanResult = stats.spearman(dataset.x, dataset.y);
    const chosen = methodEl.value === 'spearman' ? spearmanResult : pearsonResult;
    const chosenName = methodEl.value === 'spearman' ? 'Spearman' : 'Pearson';
    const outliers = outlierMask(dataset.x).map((flag, i) => flag || outlierMask(dataset.y)[i]).filter(Boolean).length;
    const primaryStrength = strengthText(chosen.coef);
    const primaryDirection = directionText(chosen.coef);
    const significance = chosen.p < 0.05 ? 'houve evidência estatística de associação' : 'não houve evidência estatística suficiente de associação';

    statusEl.className = 'success-box';
    statusEl.textContent = `${chosenName} calculado com ${dataset.x.length} pares válidos. ${significance}.`;

    metricsEl.innerHTML = `
      <div class="metric-card"><div class="metric-label">Coeficiente principal</div><div class="metric-value">${utils.fmtSigned(chosen.coef, 3)}</div><div class="metric-mini">${chosenName} · correlação ${primaryDirection} ${primaryStrength}</div>${renderEffectBar(chosen.coef)}</div>
      <div class="metric-card"><div class="metric-label">p-valor</div><div class="metric-value">${utils.fmtP(chosen.p)}</div><div class="metric-mini">IC95%: ${utils.fmtNumber(chosen.ci[0], 3)} a ${utils.fmtNumber(chosen.ci[1], 3)}</div></div>
      <div class="metric-card"><div class="metric-label">Pearson</div><div class="metric-value">${utils.fmtSigned(pearsonResult.coef, 3)}</div><div class="metric-mini">R² = ${utils.fmtNumber(pearsonResult.r2, 3)}</div>${renderEffectBar(pearsonResult.coef)}</div>
      <div class="metric-card"><div class="metric-label">Spearman</div><div class="metric-value">${utils.fmtSigned(spearmanResult.coef, 3)}</div><div class="metric-mini">comparação robusta por postos</div>${renderEffectBar(spearmanResult.coef)}</div>
      <div class="metric-card"><div class="metric-label">Pares válidos</div><div class="metric-value">${dataset.x.length}</div><div class="metric-mini">${utils.escapeHtml(dataset.headers[0])} × ${utils.escapeHtml(dataset.headers[1])}</div></div>
      <div class="metric-card"><div class="metric-label">Possíveis outliers</div><div class="metric-value">${outliers}</div><div class="metric-mini">identificados pelo critério do IQR</div></div>
    `;

    chartEl.innerHTML = `
      <article class="chart-card">
        <h4>Gráfico de dispersão</h4>
        <div class="chart-wrap">${buildScatterSvg(dataset, pearsonResult, utils)}</div>
        <div class="chart-legend">
          <span class="legend-item"><span class="legend-dot" style="background:#2563eb"></span>Pontos regulares</span>
          <span class="legend-item"><span class="legend-dot" style="background:#f97316"></span>Possíveis outliers</span>
          <span class="legend-item"><span class="legend-line" style="background:#0f766e"></span>Reta de tendência linear</span>
        </div>
      </article>
      <article class="chart-card">
        <h4>Leitura orientada</h4>
        <div class="dual-list">
          <div class="dual-list-item"><strong>Direção</strong><p>A associação principal foi <strong>${utils.escapeHtml(primaryDirection)}</strong>.</p></div>
          <div class="dual-list-item"><strong>Magnitude</strong><p>A intensidade estimada foi <strong>${utils.escapeHtml(primaryStrength)}</strong>.</p></div>
          <div class="dual-list-item"><strong>Comparação entre métodos</strong><p>${utils.escapeHtml(compareMessage(pearsonResult, spearmanResult, outliers))}</p></div>
          <div class="dual-list-item"><strong>Reta</strong><p>No Pearson, a inclinação estimada foi ${utils.fmtSigned(pearsonResult.slope, 3)} unidades de Y para cada unidade de X.</p></div>
        </div>
      </article>
    `;

    resultsEl.innerHTML = `
      ${utils.buildInterpretationCard(
        'Interpretação automática',
        `${chosenName} mostrou correlação ${primaryDirection} ${primaryStrength}; ${significance}.`,
        [
          `Pergunta analisada: ${contextEl.value || 'associação entre duas variáveis'}.`,
          `Coeficiente ${chosenName}: ${utils.fmtSigned(chosen.coef, 3)}; p ${chosen.p < 0.001 ? '< 0,001' : '= ' + utils.fmtP(chosen.p)}.`,
          `Relate junto o gráfico, a direção, a magnitude e a comparação entre Pearson e Spearman.`
        ]
      )}
      <div class="result-card">
        <h4>Dica para relatar</h4>
        <p>Você pode escrever assim: “Observou-se correlação ${utils.escapeHtml(primaryDirection)} entre ${utils.escapeHtml(dataset.headers[0])} e ${utils.escapeHtml(dataset.headers[1])}, de magnitude ${utils.escapeHtml(primaryStrength)} (${chosenName} = ${utils.fmtSigned(chosen.coef, 3)}; IC95% ${utils.fmtNumber(chosen.ci[0], 3)} a ${utils.fmtNumber(chosen.ci[1], 3)}; p ${chosen.p < 0.001 ? '< 0,001' : '= ' + utils.fmtP(chosen.p)}).”</p>
      </div>
    `;
  }

  root.querySelector('#c-load-example').addEventListener('click', loadExample);
  root.querySelector('#c-template').addEventListener('click', () => {
    utils.downloadText('modelo_correlacao.csv', 'ID;Variavel X;Variavel Y\nA;10;12\nB;13;15\nC;17;20\n', 'text/csv;charset=utf-8');
  });
  fileEl.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    pasteEl.value = await utils.readFileText(file);
    refreshPreview();
  });
  pasteEl.addEventListener('input', refreshPreview);
  root.querySelector('#c-run').addEventListener('click', runAnalysis);
  exampleSelectEl.addEventListener('change', loadExample);

  if (examples[0]) {
    loadExample();
    runAnalysis();
  }
}
