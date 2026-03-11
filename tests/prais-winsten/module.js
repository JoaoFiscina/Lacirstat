
function parseDataset(text, utils, stats) {
  const parsed = utils.parseDelimitedText(text, 2);
  const headers = parsed.headers || ['Tempo', 'Indicador'];
  const time = [];
  const values = [];
  const rows = [];
  for (const row of parsed.rows) {
    const t = stats.parseNumber(row[0]);
    const v = stats.parseNumber(row[1]);
    if (t !== null && v !== null) {
      time.push(t);
      values.push(v);
      rows.push([String(row[0]), String(row[1])]);
    }
  }
  return { headers, rows, time, values };
}

function buildTrendSvg(time, values, result, utils) {
  const width = 900;
  const height = 440;
  const margin = { top: 26, right: 28, bottom: 64, left: 82 };
  const fitted = time.map(t => Math.pow(10, result.alpha + result.beta * t));
  const xMin = Math.min(...time);
  const xMax = Math.max(...time);
  const yMin = Math.min(...values, ...fitted);
  const yMax = Math.max(...values, ...fitted);
  const yPad = yMin === yMax ? 1 : (yMax - yMin) * 0.10;
  const minY = Math.max(0, yMin - yPad);
  const maxY = yMax + yPad;
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const xToPx = x => margin.left + ((x - xMin) / (xMax - xMin || 1)) * innerW;
  const yToPx = y => height - margin.bottom - ((y - minY) / (maxY - minY || 1)) * innerH;
  const xTicks = time;
  const yTicks = Array.from({ length: 5 }, (_, i) => minY + ((maxY - minY) * i) / 4);

  const observedPath = values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xToPx(time[i]).toFixed(2)} ${yToPx(v).toFixed(2)}`).join(' ');
  const fittedPath = fitted.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xToPx(time[i]).toFixed(2)} ${yToPx(v).toFixed(2)}`).join(' ');
  const points = values.map((v, i) => `<circle cx="${xToPx(time[i]).toFixed(2)}" cy="${yToPx(v).toFixed(2)}" r="5.6" fill="#2563eb" stroke="#ffffff" stroke-width="2"><title>${utils.fmtNumber(time[i], 0)}: ${utils.fmtNumber(v, 2)}</title></circle>`).join('');

  const xGrid = xTicks.map(t => {
    const px = xToPx(t);
    return `<g><line x1="${px.toFixed(2)}" y1="${margin.top}" x2="${px.toFixed(2)}" y2="${height - margin.bottom}" stroke="#edf3fa" /><text x="${px.toFixed(2)}" y="${height - margin.bottom + 24}" text-anchor="middle" fill="#5b6b84" font-size="12">${utils.fmtNumber(t, 0)}</text></g>`;
  }).join('');
  const yGrid = yTicks.map(t => {
    const py = yToPx(t);
    return `<g><line x1="${margin.left}" y1="${py.toFixed(2)}" x2="${width - margin.right}" y2="${py.toFixed(2)}" stroke="#dbe5f2" stroke-dasharray="4 6" /><text x="${margin.left - 14}" y="${(py + 4).toFixed(2)}" text-anchor="end" fill="#5b6b84" font-size="12">${utils.fmtNumber(t, 1)}</text></g>`;
  }).join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" class="timeseries-svg" role="img" aria-label="Série temporal com tendência ajustada">
      <rect x="0" y="0" width="${width}" height="${height}" rx="22" fill="#ffffff" />
      ${xGrid}
      ${yGrid}
      <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" stroke="#8da1bc" stroke-width="1.5" />
      <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" stroke="#8da1bc" stroke-width="1.5" />
      <path d="${observedPath}" fill="none" stroke="#2563eb" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="${fittedPath}" fill="none" stroke="#0f766e" stroke-width="3.2" stroke-dasharray="10 7" stroke-linecap="round" stroke-linejoin="round" />
      ${points}
    </svg>
  `;
}

function trendSummary(apc) {
  const abs = Math.abs(apc);
  if (abs < 1) return 'muito discreta';
  if (abs < 3) return 'leve';
  if (abs < 6) return 'moderada';
  return 'marcante';
}

function renderEffectBar(value) {
  const pct = Math.min(100, Math.abs(value) * 8);
  return `<div class="metric-bar"><span style="width:${pct}%;"></span></div>`;
}

export async function renderTestModule(ctx) {
  const { root, config, utils, stats } = ctx;

  root.innerHTML = `
    <div class="module-grid">
      <section class="module-header">
        <div class="chip chip-primary">Tendência temporal com gráfico</div>
        <h3>${utils.escapeHtml(config.title)}</h3>
        <p>${utils.escapeHtml(config.description)}</p>
      </section>

      <section class="callout-grid">
        <article class="help-card">
          <h4>Quando usar</h4>
          <ul>${(config.inputGuide || []).map(item => `<li>${utils.escapeHtml(item)}</li>`).join('')}</ul>
        </article>
        <article class="tip-card">
          <h4>O que observar</h4>
          <ul>
            <li>Direção visual da série antes de olhar o p-valor.</li>
            <li>Magnitude da APC e intervalo de confiança.</li>
            <li>Se anos consecutivos parecem depender uns dos outros.</li>
          </ul>
        </article>
        <article class="tip-card">
          <h4>Erros comuns</h4>
          <ul>
            <li>Usar contagem bruta quando a pergunta pede taxa.</li>
            <li>Interpretar série muito curta como tendência sólida.</li>
            <li>Ignorar a autocorrelação da série.</li>
          </ul>
        </article>
      </section>

      <section class="surface-card decorated">
        <h4>Dados de entrada</h4>
        <div class="form-grid three">
          <div>
            <label for="p-context">Pergunta do estudo</label>
            <input id="p-context" type="text" value="O indicador apresentou tendência temporal?" />
          </div>
          <div>
            <label for="p-time-label">Nome da coluna do tempo</label>
            <input id="p-time-label" type="text" value="Ano" />
          </div>
          <div>
            <label for="p-value-label">Nome do indicador</label>
            <input id="p-value-label" type="text" value="Taxa" />
          </div>
        </div>
        <div style="margin-top:14px;">
          <label for="p-paste">Cole duas colunas da planilha</label>
          <textarea id="p-paste" placeholder="Ano\tTaxa\n2015\t6,7\n2016\t7,0\n..."></textarea>
          <div class="small-note">Aceita colagem do Excel, CSV, TSV ou texto com duas colunas. O indicador deve ser positivo porque o modelo usa transformação logarítmica.</div>
        </div>
        <div class="actions-row" style="margin-top:14px;">
          <button class="btn-secondary" id="p-example">Carregar exemplo</button>
          <button class="btn-ghost" id="p-template">Baixar modelo CSV</button>
          <label class="btn-ghost" style="display:inline-flex;align-items:center;gap:8px;">Importar arquivo<input id="p-file" type="file" accept=".csv,.tsv,.txt" style="display:none"></label>
          <button class="btn" id="p-run">Rodar Prais-Winsten</button>
        </div>
      </section>

      <section class="surface-card">
        <h4>Pré-visualização dos dados</h4>
        <div id="p-preview" class="small-note">Nenhum dado carregado ainda.</div>
      </section>

      <section class="surface-card">
        <h4>Resultados</h4>
        <div id="p-status" class="status-bar">O exemplo abaixo já pode ser rodado imediatamente.</div>
        <div id="p-metrics" class="metrics-grid" style="margin-top:14px;"></div>
        <div id="p-chart" class="chart-grid" style="margin-top:14px;"></div>
        <div id="p-results" class="result-grid" style="margin-top:14px;"></div>
      </section>
    </div>
  `;

  const pasteEl = root.querySelector('#p-paste');
  const fileEl = root.querySelector('#p-file');
  const previewEl = root.querySelector('#p-preview');
  const statusEl = root.querySelector('#p-status');
  const metricsEl = root.querySelector('#p-metrics');
  const chartEl = root.querySelector('#p-chart');
  const resultsEl = root.querySelector('#p-results');
  const contextEl = root.querySelector('#p-context');
  const timeLabelEl = root.querySelector('#p-time-label');
  const valueLabelEl = root.querySelector('#p-value-label');

  function refreshPreview() {
    const parsed = parseDataset(pasteEl.value, utils, stats);
    if (!parsed.rows.length) {
      previewEl.innerHTML = '<div class="small-note">Nenhum dado carregado ainda.</div>';
      return parsed;
    }
    previewEl.innerHTML = utils.renderPreviewTable(parsed.headers, parsed.rows);
    return parsed;
  }

  function runAnalysis() {
    const parsed = refreshPreview();
    if (parsed.time.length < 5) {
      statusEl.className = 'error-box';
      statusEl.textContent = 'Use pelo menos 5 pontos temporais para uma interpretação minimamente estável.';
      metricsEl.innerHTML = '';
      chartEl.innerHTML = '';
      resultsEl.innerHTML = '';
      return;
    }
    if (parsed.values.some(v => v <= 0)) {
      statusEl.className = 'error-box';
      statusEl.textContent = 'Todos os valores do indicador devem ser positivos para o logaritmo do modelo.';
      metricsEl.innerHTML = '';
      chartEl.innerHTML = '';
      resultsEl.innerHTML = '';
      return;
    }

    const result = stats.praisWinsten(parsed.time, parsed.values);
    const significance = result.p < 0.05 ? 'há evidência estatística de tendência' : 'não houve evidência estatística suficiente de tendência';
    const magnitude = trendSummary(result.apc);

    statusEl.className = 'success-box';
    statusEl.textContent = `Modelo ajustado com ${result.n} pontos temporais válidos.`;

    metricsEl.innerHTML = `
      <div class="metric-card"><div class="metric-label">Classificação</div><div class="metric-value">${utils.escapeHtml(result.classification)}</div><div class="metric-mini">mudança ${utils.escapeHtml(magnitude)}</div></div>
      <div class="metric-card"><div class="metric-label">APC (%)</div><div class="metric-value">${utils.fmtSigned(result.apc, 2)}</div><div class="metric-mini">IC95%: ${utils.fmtNumber(result.ciApc[0], 2)} a ${utils.fmtNumber(result.ciApc[1], 2)}</div>${renderEffectBar(result.apc)}</div>
      <div class="metric-card"><div class="metric-label">β</div><div class="metric-value">${utils.fmtSigned(result.beta, 4)}</div><div class="metric-mini">coeficiente da tendência log10</div></div>
      <div class="metric-card"><div class="metric-label">p-valor</div><div class="metric-value">${utils.fmtP(result.p)}</div><div class="metric-mini">t = ${utils.fmtNumber(result.t, 3)} · gl = ${utils.fmtNumber(result.df, 0)}</div></div>
      <div class="metric-card"><div class="metric-label">Autocorrelação (ρ)</div><div class="metric-value">${utils.fmtSigned(result.rho, 3)}</div><div class="metric-mini">estimativa de primeira ordem</div></div>
      <div class="metric-card"><div class="metric-label">Pontos válidos</div><div class="metric-value">${result.n}</div><div class="metric-mini">${utils.escapeHtml(timeLabelEl.value || 'Tempo')} × ${utils.escapeHtml(valueLabelEl.value || 'Indicador')}</div></div>
    `;

    chartEl.innerHTML = `
      <article class="chart-card">
        <h4>Série observada e tendência ajustada</h4>
        <div class="chart-wrap">${buildTrendSvg(parsed.time, parsed.values, result, utils)}</div>
        <div class="chart-legend">
          <span class="legend-item"><span class="legend-line" style="background:#2563eb"></span>série observada</span>
          <span class="legend-item"><span class="legend-line" style="background:#0f766e"></span>tendência ajustada</span>
        </div>
      </article>
      <article class="chart-card">
        <h4>Leitura orientada</h4>
        <div class="dual-list">
          <div class="dual-list-item"><strong>Classificação</strong><p>A série foi classificada como <strong>${utils.escapeHtml(result.classification)}</strong>.</p></div>
          <div class="dual-list-item"><strong>Magnitude</strong><p>A APC foi ${utils.fmtSigned(result.apc, 2)}%, sugerindo mudança ${utils.escapeHtml(magnitude)}.</p></div>
          <div class="dual-list-item"><strong>Autocorrelação</strong><p>ρ = ${utils.fmtSigned(result.rho, 3)}. Valores mais distantes de zero sugerem maior dependência serial.</p></div>
          <div class="dual-list-item"><strong>Ponto-chave</strong><p>${utils.escapeHtml(significance)}; o gráfico ajuda a checar se a tendência faz sentido visualmente.</p></div>
        </div>
      </article>
    `;

    resultsEl.innerHTML = `
      ${utils.buildInterpretationCard(
        'Interpretação automática',
        `O modelo indicou tendência ${result.classification}; ${significance}.`,
        [
          `Pergunta analisada: ${contextEl.value || 'tendência temporal do indicador'}.`,
          `APC = ${utils.fmtSigned(result.apc, 2)}% no período; p ${result.p < 0.001 ? '< 0,001' : '= ' + utils.fmtP(result.p)}.`,
          `Relate a APC, o IC95% e a direção da tendência junto do gráfico da série.`
        ]
      )}
      <div class="result-card">
        <h4>Dica para relatar</h4>
        <p>Você pode escrever assim: “A análise de Prais-Winsten da série temporal de ${utils.escapeHtml(valueLabelEl.value || 'indicador')} mostrou tendência ${utils.escapeHtml(result.classification)}, com APC de ${utils.fmtSigned(result.apc, 2)}% (IC95% ${utils.fmtNumber(result.ciApc[0], 2)} a ${utils.fmtNumber(result.ciApc[1], 2)}; p ${result.p < 0.001 ? '< 0,001' : '= ' + utils.fmtP(result.p)}).”</p>
      </div>
    `;
  }

  root.querySelector('#p-example').addEventListener('click', () => {
    pasteEl.value = config.exampleText;
    refreshPreview();
    runAnalysis();
  });
  root.querySelector('#p-template').addEventListener('click', () => {
    utils.downloadText('modelo_prais_winsten.csv', 'Ano;Taxa\n2015;6,7\n2016;7,0\n2017;7,4\n2018;7,9\n2019;8,3\n', 'text/csv;charset=utf-8');
  });
  fileEl.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    pasteEl.value = await utils.readFileText(file);
    refreshPreview();
  });
  pasteEl.addEventListener('input', refreshPreview);
  root.querySelector('#p-run').addEventListener('click', runAnalysis);

  pasteEl.value = config.exampleText;
  refreshPreview();
  runAnalysis();
}
