
function parseDataset(text, utils, stats) {
  const parsed = utils.parseDelimitedText(text, 2);
  const headers = parsed.headers || ['Grupo 1', 'Grupo 2'];
  const g1 = [];
  const g2 = [];
  for (const row of parsed.rows) {
    const a = stats.parseNumber(row[0]);
    const b = stats.parseNumber(row[1]);
    if (a !== null) g1.push(a);
    if (b !== null) g2.push(b);
  }
  return { headers, rows: parsed.rows, g1, g2 };
}

function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

function summary(arr, stats) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mean = stats.mean(arr);
  const sd = stats.sd(arr);
  const se = sd / Math.sqrt(arr.length);
  const ci = [mean - 1.96 * se, mean + 1.96 * se];
  return { n: arr.length, mean, sd, min: sorted[0], max: sorted[sorted.length - 1], q1: quantile(sorted, 0.25), q3: quantile(sorted, 0.75), ci };
}

function effectText(d) {
  const abs = Math.abs(d);
  if (abs < 0.20) return 'muito pequeno';
  if (abs < 0.50) return 'pequeno';
  if (abs < 0.80) return 'moderado';
  if (abs < 1.20) return 'grande';
  return 'muito grande';
}

function buildGroupSvg(groupA, groupB, labelA, labelB, stats, utils) {
  const width = 860;
  const height = 430;
  const margin = { top: 28, right: 26, bottom: 52, left: 88 };
  const values = [...groupA, ...groupB];
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const pad = minV === maxV ? 1 : (maxV - minV) * 0.10;
  const minY = minV - pad;
  const maxY = maxV + pad;
  const xPos = [280, 580];
  const yToPx = v => height - margin.bottom - ((v - minY) / (maxY - minY || 1)) * (height - margin.top - margin.bottom);
  const jitter = i => ((i % 8) - 3.5) * 6;
  const sumA = summary(groupA, stats);
  const sumB = summary(groupB, stats);
  const yTicks = Array.from({ length: 5 }, (_, i) => minY + ((maxY - minY) * i) / 4);

  const grid = yTicks.map(t => {
    const py = yToPx(t);
    return `<g><line x1="${margin.left}" y1="${py.toFixed(2)}" x2="${width - margin.right}" y2="${py.toFixed(2)}" stroke="#dbe5f2" stroke-dasharray="4 6" /><text x="${margin.left - 14}" y="${(py + 4).toFixed(2)}" text-anchor="end" fill="#5b6b84" font-size="12">${utils.fmtNumber(t, 1)}</text></g>`;
  }).join('');

  function pointLayer(arr, cx, fill, label) {
    return arr.map((v, i) => `<circle cx="${(cx + jitter(i)).toFixed(2)}" cy="${yToPx(v).toFixed(2)}" r="5.8" fill="${fill}" fill-opacity="0.92" stroke="#ffffff" stroke-width="2"><title>${utils.escapeHtml(label)}: ${utils.fmtNumber(v, 2)}</title></circle>`).join('');
  }

  function summaryLayer(sum, cx, color) {
    const boxTop = yToPx(sum.q3);
    const boxBottom = yToPx(sum.q1);
    const meanY = yToPx(sum.mean);
    const ciTop = yToPx(sum.ci[1]);
    const ciBottom = yToPx(sum.ci[0]);
    return `
      <line x1="${cx}" y1="${ciTop.toFixed(2)}" x2="${cx}" y2="${ciBottom.toFixed(2)}" stroke="${color}" stroke-width="3" opacity="0.95" />
      <rect x="${cx - 28}" y="${boxTop.toFixed(2)}" width="56" height="${Math.max(12, boxBottom - boxTop).toFixed(2)}" rx="10" fill="${color}" fill-opacity="0.10" stroke="${color}" stroke-width="2" />
      <line x1="${cx - 34}" y1="${meanY.toFixed(2)}" x2="${cx + 34}" y2="${meanY.toFixed(2)}" stroke="${color}" stroke-width="3.5" />
      <line x1="${cx - 18}" y1="${ciTop.toFixed(2)}" x2="${cx + 18}" y2="${ciTop.toFixed(2)}" stroke="${color}" stroke-width="3" />
      <line x1="${cx - 18}" y1="${ciBottom.toFixed(2)}" x2="${cx + 18}" y2="${ciBottom.toFixed(2)}" stroke="${color}" stroke-width="3" />
    `;
  }

  return `
    <svg viewBox="0 0 ${width} ${height}" class="groupplot-svg" role="img" aria-label="Comparação gráfica entre dois grupos">
      <rect x="0" y="0" width="${width}" height="${height}" rx="22" fill="#ffffff" />
      ${grid}
      <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" stroke="#8da1bc" stroke-width="1.5" />
      ${summaryLayer(sumA, xPos[0], '#2563eb')}
      ${summaryLayer(sumB, xPos[1], '#0f766e')}
      ${pointLayer(groupA, xPos[0], '#2563eb', labelA)}
      ${pointLayer(groupB, xPos[1], '#0f766e', labelB)}
      <text x="${xPos[0]}" y="${height - 18}" text-anchor="middle" fill="#334155" font-size="13" font-weight="700">${utils.escapeHtml(labelA)}</text>
      <text x="${xPos[1]}" y="${height - 18}" text-anchor="middle" fill="#334155" font-size="13" font-weight="700">${utils.escapeHtml(labelB)}</text>
    </svg>
  `;
}

function renderEffectBar(value) {
  const pct = Math.min(100, Math.abs(value) * 50);
  return `<div class="metric-bar"><span style="width:${pct}%;"></span></div>`;
}

export async function renderTestModule(ctx) {
  const { root, config, utils, stats } = ctx;

  root.innerHTML = `
    <div class="module-grid">
      <section class="module-header">
        <div class="chip chip-primary">Comparação de médias com gráfico</div>
        <h3>${utils.escapeHtml(config.title)}</h3>
        <p>${utils.escapeHtml(config.description)}</p>
      </section>

      <section class="callout-grid">
        <article class="help-card">
          <h4>Quando usar</h4>
          <ul>${(config.inputGuide || []).map(item => `<li>${utils.escapeHtml(item)}</li>`).join('')}</ul>
        </article>
        <article class="tip-card">
          <h4>Como ler a saída</h4>
          <ul>
            <li>Olhe média, IC95% e p-valor em conjunto.</li>
            <li>O tamanho de efeito ajuda a saber se a diferença é pequena ou relevante.</li>
            <li>Use o gráfico para ver dispersão e sobreposição dos grupos.</li>
          </ul>
        </article>
        <article class="tip-card">
          <h4>Erros comuns</h4>
          <ul>
            <li>Usar o teste em grupos pareados.</li>
            <li>Ignorar a direção da diferença entre as médias.</li>
            <li>Relatar só “deu significativo” sem mostrar magnitude.</li>
          </ul>
        </article>
      </section>

      <section class="surface-card decorated">
        <h4>Dados de entrada</h4>
        <div class="form-grid two">
          <div>
            <label for="t-context">Pergunta do estudo</label>
            <input id="t-context" type="text" value="As médias dos dois grupos são diferentes?" />
          </div>
          <div>
            <label for="t-unit">Cada linha representa</label>
            <input id="t-unit" type="text" value="1 observação por grupo" />
          </div>
        </div>
        <div style="margin-top:14px;">
          <label for="t-paste">Cole duas colunas da planilha</label>
          <textarea id="t-paste" placeholder="Grupo 1\tGrupo 2\n10\t15\n12\t17\n..."></textarea>
          <div class="small-note">Aceita colagem do Excel, CSV, TSV ou texto com duas colunas. Células vazias podem ficar em branco.</div>
        </div>
        <div class="actions-row" style="margin-top:14px;">
          <button class="btn-secondary" id="t-example">Carregar exemplo</button>
          <button class="btn-ghost" id="t-template">Baixar modelo CSV</button>
          <label class="btn-ghost" style="display:inline-flex;align-items:center;gap:8px;">Importar arquivo<input id="t-file" type="file" accept=".csv,.tsv,.txt" style="display:none"></label>
          <button class="btn" id="t-run">Rodar teste</button>
        </div>
      </section>

      <section class="surface-card">
        <h4>Pré-visualização dos dados</h4>
        <div id="t-preview" class="small-note">Nenhum dado carregado ainda.</div>
      </section>

      <section class="surface-card">
        <h4>Resultados</h4>
        <div id="t-status" class="status-bar">Carregue um exemplo ou cole sua planilha para começar.</div>
        <div id="t-metrics" class="metrics-grid" style="margin-top:14px;"></div>
        <div id="t-chart" class="chart-grid" style="margin-top:14px;"></div>
        <div id="t-results" class="result-grid" style="margin-top:14px;"></div>
      </section>
    </div>
  `;

  const pasteEl = root.querySelector('#t-paste');
  const fileEl = root.querySelector('#t-file');
  const previewEl = root.querySelector('#t-preview');
  const statusEl = root.querySelector('#t-status');
  const metricsEl = root.querySelector('#t-metrics');
  const chartEl = root.querySelector('#t-chart');
  const resultsEl = root.querySelector('#t-results');
  const contextEl = root.querySelector('#t-context');

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
    if (parsed.g1.length < 2 || parsed.g2.length < 2) {
      statusEl.className = 'error-box';
      statusEl.textContent = 'Cada grupo precisa ter pelo menos 2 valores numéricos válidos.';
      metricsEl.innerHTML = '';
      chartEl.innerHTML = '';
      resultsEl.innerHTML = '';
      return;
    }

    const result = stats.welchT(parsed.g1, parsed.g2);
    const group1Label = parsed.headers[0] || 'Grupo 1';
    const group2Label = parsed.headers[1] || 'Grupo 2';
    const direction = result.diff > 0 ? `${group1Label} apresentou média maior` : `${group2Label} apresentou média maior`;
    const significance = result.p < 0.05 ? 'há evidência de diferença estatística entre as médias' : 'não houve evidência estatística suficiente de diferença entre as médias';
    const effect = effectText(result.d);
    const sumA = summary(parsed.g1, stats);
    const sumB = summary(parsed.g2, stats);

    statusEl.className = 'success-box';
    statusEl.textContent = `Teste concluído para: ${contextEl.value || 'comparação entre duas médias independentes'}.`;

    metricsEl.innerHTML = `
      <div class="metric-card"><div class="metric-label">${utils.escapeHtml(group1Label)}</div><div class="metric-value">${utils.fmtNumber(result.m1, 2)}</div><div class="metric-mini">n = ${result.n1} · DP = ${utils.fmtNumber(result.s1, 2)}</div></div>
      <div class="metric-card"><div class="metric-label">${utils.escapeHtml(group2Label)}</div><div class="metric-value">${utils.fmtNumber(result.m2, 2)}</div><div class="metric-mini">n = ${result.n2} · DP = ${utils.fmtNumber(result.s2, 2)}</div></div>
      <div class="metric-card"><div class="metric-label">Diferença das médias</div><div class="metric-value">${utils.fmtSigned(result.diff, 2)}</div><div class="metric-mini">IC95%: ${utils.fmtNumber(result.ci[0], 2)} a ${utils.fmtNumber(result.ci[1], 2)}</div></div>
      <div class="metric-card"><div class="metric-label">t de Welch</div><div class="metric-value">${utils.fmtNumber(result.t, 3)}</div><div class="metric-mini">gl = ${utils.fmtNumber(result.df, 2)} · p = ${utils.fmtP(result.p)}</div></div>
      <div class="metric-card"><div class="metric-label">Cohen d</div><div class="metric-value">${utils.fmtSigned(result.d, 2)}</div><div class="metric-mini">tamanho de efeito ${utils.escapeHtml(effect)}</div>${renderEffectBar(result.d)}</div>
      <div class="metric-card"><div class="metric-label">Amplitude observada</div><div class="metric-value">${utils.fmtNumber(Math.max(sumA.max, sumB.max) - Math.min(sumA.min, sumB.min), 2)}</div><div class="metric-mini">mín = ${utils.fmtNumber(Math.min(sumA.min, sumB.min), 2)} · máx = ${utils.fmtNumber(Math.max(sumA.max, sumB.max), 2)}</div></div>
    `;

    chartEl.innerHTML = `
      <article class="chart-card">
        <h4>Distribuição por grupo</h4>
        <div class="chart-wrap">${buildGroupSvg(parsed.g1, parsed.g2, group1Label, group2Label, stats, utils)}</div>
        <div class="chart-legend">
          <span class="legend-item"><span class="legend-dot" style="background:#2563eb"></span>${utils.escapeHtml(group1Label)}</span>
          <span class="legend-item"><span class="legend-dot" style="background:#0f766e"></span>${utils.escapeHtml(group2Label)}</span>
          <span class="legend-item"><span class="legend-line" style="background:#0f766e"></span>linha central = média</span>
        </div>
      </article>
      <article class="chart-card">
        <h4>Leitura orientada</h4>
        <div class="dual-list">
          <div class="dual-list-item"><strong>Sobreposição</strong><p>Quanto maior a sobreposição visual dos pontos, menor tende a ser a separação real entre os grupos.</p></div>
          <div class="dual-list-item"><strong>Diferença média</strong><p>A diferença estimada foi ${utils.fmtSigned(result.diff, 2)} unidades (${utils.escapeHtml(group1Label)} − ${utils.escapeHtml(group2Label)}).</p></div>
          <div class="dual-list-item"><strong>Tamanho de efeito</strong><p>O Cohen d foi ${utils.fmtSigned(result.d, 2)}, sugerindo efeito ${utils.escapeHtml(effect)}.</p></div>
          <div class="dual-list-item"><strong>Mensagem principal</strong><p>${utils.escapeHtml(direction)}; ${utils.escapeHtml(significance)}.</p></div>
        </div>
      </article>
    `;

    resultsEl.innerHTML = `
      ${utils.buildInterpretationCard(
        'Interpretação automática',
        `${significance}; ${direction}.`,
        [
          `Pergunta analisada: ${contextEl.value || 'comparação entre duas médias'}.`,
          `Média de ${group1Label}: ${utils.fmtNumber(result.m1, 2)}; média de ${group2Label}: ${utils.fmtNumber(result.m2, 2)}.`,
          `Relate junto a diferença média, o IC95% e o tamanho de efeito.`
        ]
      )}
      <div class="result-card">
        <h4>Dica para relatar</h4>
        <p>Você pode escrever assim: “Comparando ${utils.escapeHtml(group1Label)} e ${utils.escapeHtml(group2Label)}, observou-se ${utils.escapeHtml(significance)} (t = ${utils.fmtNumber(result.t, 3)}; gl = ${utils.fmtNumber(result.df, 2)}; p ${result.p < 0.001 ? '< 0,001' : '= ' + utils.fmtP(result.p)}). A diferença média foi de ${utils.fmtNumber(result.diff, 2)} unidades, com IC95% de ${utils.fmtNumber(result.ci[0], 2)} a ${utils.fmtNumber(result.ci[1], 2)}.”</p>
      </div>
    `;
  }

  root.querySelector('#t-example').addEventListener('click', () => {
    pasteEl.value = config.exampleText;
    refreshPreview();
    runAnalysis();
  });
  root.querySelector('#t-template').addEventListener('click', () => {
    utils.downloadText('modelo_t_student.csv', 'Grupo 1;Grupo 2\n10;12\n11;13\n12;14\n', 'text/csv;charset=utf-8');
  });
  fileEl.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    pasteEl.value = await utils.readFileText(file);
    refreshPreview();
  });
  pasteEl.addEventListener('input', refreshPreview);
  root.querySelector('#t-run').addEventListener('click', runAnalysis);

  pasteEl.value = config.exampleText;
  refreshPreview();
  runAnalysis();
}
