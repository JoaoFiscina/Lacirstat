function buildExampleText(config) {
  const rows = Array.isArray(config.exampleRows) ? config.exampleRows : [];
  const header = Array.isArray(config.exampleHeaders) ? config.exampleHeaders.join('\t') : 'Tempo\tIndicador';
  if (!rows.length) return header;
  return [header, ...rows.map(row => row.join('\t'))].join('\n');
}

function parseDataset(text, stats) {
  const clean = String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (!clean.length) {
    return {
      timeName: 'Tempo',
      indicatorName: 'Indicador',
      rows: [],
      validRows: [],
      time: [],
      values: []
    };
  }

  const sample = clean[0];
  const delimiters = ['\t', ';', ','];
  let delimiter = '\t';
  let bestScore = -1;
  for (const delim of delimiters) {
    const score = sample.split(delim).length - 1;
    if (score > bestScore) {
      bestScore = score;
      delimiter = delim;
    }
  }
  if (bestScore <= 0) delimiter = /\s+/;

  const splitLine = (line) => {
    const raw = typeof delimiter === 'string' ? line.split(delimiter) : line.split(delimiter);
    const parts = raw.map(v => String(v ?? '').trim()).filter((_, idx) => idx < 2 || raw.length <= 2);
    while (parts.length < 2) parts.push('');
    if (parts.length > 2) {
      return [parts[0], parts.slice(1).join('')];
    }
    return [parts[0], parts[1]];
  };

  const rawRows = clean.map(splitLine).filter(row => row.some(cell => cell !== ''));
  const first = rawRows[0] || ['', ''];
  const hasHeader = stats.parseNumber(first[0]) === null || stats.parseNumber(first[1]) === null;

  const timeName = hasHeader ? (first[0] || 'Tempo') : 'Tempo';
  const indicatorName = hasHeader ? (first[1] || 'Indicador') : 'Indicador';
  const dataRows = hasHeader ? rawRows.slice(1) : rawRows;

  const validRows = [];
  const time = [];
  const values = [];

  dataRows.forEach((row, idx) => {
    const t = stats.parseNumber(row[0]);
    const v = stats.parseNumber(row[1]);
    if (t !== null && v !== null) {
      validRows.push({ index: idx + 1, rawTime: row[0], rawValue: row[1], time: t, value: v });
      time.push(t);
      values.push(v);
    }
  });

  return {
    timeName,
    indicatorName,
    rows: dataRows,
    validRows,
    time,
    values
  };
}

function trendStrength(apc) {
  const abs = Math.abs(apc);
  if (abs < 1) return 'muito discreta';
  if (abs < 3) return 'leve';
  if (abs < 6) return 'moderada';
  return 'marcante';
}

function buildMainTrendSvg(time, observed, fitted, labels, utils) {
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
  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + ((yMax - yMin) * i) / 4);
  const xTicks = Array.from({ length: steps }, (_, i) => xMin + ((xMax - xMin) * i) / (steps - 1 || 1));

  const obsPath = observed.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xToPx(time[i]).toFixed(2)} ${yToPx(v).toFixed(2)}`).join(' ');
  const fitPath = fitted.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xToPx(time[i]).toFixed(2)} ${yToPx(v).toFixed(2)}`).join(' ');

  return `
  <svg viewBox="0 0 ${width} ${height}" class="timeseries-svg" role="img" aria-label="Série temporal com tendência ajustada">
    <rect x="0" y="0" width="${width}" height="${height}" rx="20" fill="#ffffff"/>
    ${xTicks.map(t => `
      <g>
        <line x1="${xToPx(t).toFixed(2)}" y1="${margin.top}" x2="${xToPx(t).toFixed(2)}" y2="${height - margin.bottom}" stroke="#edf2fb"/>
        <text x="${xToPx(t).toFixed(2)}" y="${height - margin.bottom + 24}" text-anchor="middle" fill="#60728d" font-size="12">${utils.fmtNumber(t, 0)}</text>
      </g>`).join('')}
    ${yTicks.map(t => `
      <g>
        <line x1="${margin.left}" y1="${yToPx(t).toFixed(2)}" x2="${width - margin.right}" y2="${yToPx(t).toFixed(2)}" stroke="#dbe5f4" stroke-dasharray="4 6"/>
        <text x="${margin.left - 14}" y="${(yToPx(t) + 4).toFixed(2)}" text-anchor="end" fill="#60728d" font-size="12">${utils.fmtNumber(t, 1)}</text>
      </g>`).join('')}
    <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" stroke="#89a0bc"/>
    <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" stroke="#89a0bc"/>
    <path d="${obsPath}" fill="none" stroke="#2563eb" stroke-width="3" stroke-linecap="round"/>
    <path d="${fitPath}" fill="none" stroke="#0f766e" stroke-width="3" stroke-linecap="round" stroke-dasharray="10 6"/>
    ${observed.map((v, i) => `<circle cx="${xToPx(time[i]).toFixed(2)}" cy="${yToPx(v).toFixed(2)}" r="4.8" fill="#2563eb" stroke="#ffffff" stroke-width="2"><title>${utils.fmtNumber(time[i], 0)}: ${utils.fmtNumber(v, 2)}</title></circle>`).join('')}
    <text x="${width / 2}" y="${height - 20}" text-anchor="middle" fill="#364b65" font-size="13">${labels.x}</text>
    <text x="24" y="${height / 2}" text-anchor="middle" transform="rotate(-90 24 ${height / 2})" fill="#364b65" font-size="13">${labels.y}</text>
  </svg>`;
}

function buildResidualSvg(time, residuals, labels, utils) {
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

  const path = residuals.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xToPx(time[i]).toFixed(2)} ${yToPx(v).toFixed(2)}`).join(' ');
  const zeroY = yToPx(0).toFixed(2);

  return `
    <svg viewBox="0 0 ${width} ${height}" class="timeseries-svg" role="img" aria-label="Resíduos ao longo do tempo">
      <rect x="0" y="0" width="${width}" height="${height}" rx="20" fill="#ffffff"/>
      <line x1="${margin.left}" y1="${zeroY}" x2="${width - margin.right}" y2="${zeroY}" stroke="#94a3b8" stroke-dasharray="6 4"/>
      <path d="${path}" fill="none" stroke="#7c3aed" stroke-width="2.8"/>
      ${residuals.map((v, i) => `<circle cx="${xToPx(time[i]).toFixed(2)}" cy="${yToPx(v).toFixed(2)}" r="4.2" fill="#7c3aed" stroke="#fff" stroke-width="1.6"><title>${utils.fmtNumber(time[i], 0)}: ${utils.fmtNumber(v, 4)}</title></circle>`).join('')}
      <text x="${width / 2}" y="${height - 16}" text-anchor="middle" fill="#364b65" font-size="13">${labels.x}</text>
      <text x="24" y="${height / 2}" text-anchor="middle" transform="rotate(-90 24 ${height / 2})" fill="#364b65" font-size="13">${labels.y}</text>
    </svg>`;
}

function buildInterpretation(result, names) {
  const direction = result.classification;
  const pText = result.p < 0.05 ? 'com evidência estatística' : 'sem evidência estatística robusta';
  const lowN = result.n < 8;
  if (direction === 'crescente') {
    return `Observou-se tendência crescente do indicador ${names.indicator} ao longo do tempo (${names.time}), ${pText}. Em termos práticos, os valores tenderam a aumentar durante a série analisada.${lowN ? ' Como a série é curta, recomenda-se cautela adicional na interpretação.' : ''}`;
  }
  if (direction === 'decrescente') {
    return `Observou-se tendência decrescente do indicador ${names.indicator} ao longo do tempo (${names.time}), ${pText}. Em termos práticos, os valores tenderam a diminuir durante a série analisada.${lowN ? ' Como a série é curta, recomenda-se cautela adicional na interpretação.' : ''}`;
  }
  return `A série do indicador ${names.indicator}, avaliada ao longo de ${names.time}, foi classificada como estacionária, ${pText}. Em termos práticos, não se identificou mudança consistente no período.${lowN ? ' Como há poucos pontos, pequenas variações podem passar despercebidas.' : ''}`;
}

export async function renderTestModule(ctx) {
  const { root, config, utils, stats } = ctx;
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
        <h4>Entrada de dados</h4>
        <p class="small-note">Formato aceito: 2 colunas numéricas (tempo e indicador), com cabeçalho opcional, separador por tab, vírgula ou ponto e vírgula. Linhas vazias são ignoradas.</p>
        <div class="form-grid two">
          <div>
            <label for="pw-context">Contexto da análise</label>
            <input id="pw-context" type="text" value="Tendência temporal do indicador em dados agregados" />
          </div>
          <div>
            <label for="pw-file">Importar arquivo (.csv/.txt)</label>
            <input id="pw-file" type="file" accept=".csv,.txt" />
          </div>
        </div>
        <div style="margin-top:12px">
          <label for="pw-paste">Cole os dados aqui</label>
          <textarea id="pw-paste" spellcheck="false"></textarea>
        </div>
        <div class="actions-row" style="margin-top:14px;">
          <button id="pw-example" type="button" class="btn-secondary">Carregar exemplo</button>
          <button id="pw-run" type="button" class="btn">Rodar análise</button>
          <button id="pw-clear" type="button" class="btn-ghost">Limpar</button>
        </div>
      </section>

      <section class="surface-card">
        <h4>Pré-visualização da série</h4>
        <div id="pw-preview-meta" class="info-strip"></div>
        <div id="pw-preview-table" style="margin-top:12px;"></div>
      </section>

      <section id="pw-status" class="status-bar">Carregue dados para iniciar a análise.</section>
      <section id="pw-metrics" class="metrics-grid"></section>
      <section id="pw-charts" class="chart-grid"></section>
      <section id="pw-results" class="result-grid"></section>
    </div>
  `;

  const els = {
    context: root.querySelector('#pw-context'),
    file: root.querySelector('#pw-file'),
    paste: root.querySelector('#pw-paste'),
    previewMeta: root.querySelector('#pw-preview-meta'),
    previewTable: root.querySelector('#pw-preview-table'),
    status: root.querySelector('#pw-status'),
    metrics: root.querySelector('#pw-metrics'),
    charts: root.querySelector('#pw-charts'),
    results: root.querySelector('#pw-results')
  };

  const clearOutput = (statusMsg = 'Área limpa. Cole os dados ou carregue o exemplo.') => {
    els.status.className = 'status-bar';
    els.status.textContent = statusMsg;
    els.metrics.innerHTML = '';
    els.charts.innerHTML = '';
    els.results.innerHTML = '';
  };

  const refreshPreview = () => {
    const parsed = parseDataset(els.paste.value, stats);
    const rowsForPreview = parsed.validRows.map(r => [String(r.time), String(r.value)]);

    els.previewMeta.innerHTML = `
      <article class="mini-card"><h4>Variável temporal</h4><p>${utils.escapeHtml(parsed.timeName)}</p></article>
      <article class="mini-card"><h4>Indicador</h4><p>${utils.escapeHtml(parsed.indicatorName)}</p></article>
      <article class="mini-card"><h4>Pontos válidos</h4><p>${parsed.time.length}</p></article>
    `;

    if (!rowsForPreview.length) {
      els.previewTable.innerHTML = '<div class="small-note">Sem linhas numéricas válidas no momento.</div>';
      return parsed;
    }

    els.previewTable.innerHTML = utils.renderPreviewTable([parsed.timeName, parsed.indicatorName], rowsForPreview, 8);
    return parsed;
  };

  const runAnalysis = () => {
    const parsed = refreshPreview();

    if (parsed.time.length < 5) {
      clearOutput();
      els.status.className = 'error-box';
      els.status.textContent = 'Número insuficiente de pontos: use pelo menos 5 observações válidas para estimar tendência com estabilidade mínima.';
      return;
    }

    if (parsed.values.some(v => v <= 0)) {
      clearOutput();
      els.status.className = 'error-box';
      els.status.textContent = 'Foram encontrados valores não positivos no indicador. O modelo usa log10 e exige valores maiores que zero.';
      return;
    }

    const model = stats.praisWinsten(parsed.time, parsed.values);
    const fitted = parsed.time.map(t => Math.pow(10, model.alpha + model.beta * t));
    const residuals = parsed.values.map((v, i) => Math.log10(v) - (model.alpha + model.beta * parsed.time[i]));
    const acText = Math.abs(model.rho) < 0.3
      ? 'autocorrelação fraca'
      : Math.abs(model.rho) < 0.6
        ? 'autocorrelação moderada'
        : 'autocorrelação forte';

    els.status.className = 'success-box';
    els.status.textContent = `Análise concluída com ${model.n} pontos válidos. Estimativa de autocorrelação de primeira ordem: ${acText}.`;

    els.metrics.innerHTML = `
      <article class="metric-card"><div class="metric-label">Pontos temporais</div><div class="metric-value">${model.n}</div></article>
      <article class="metric-card"><div class="metric-label">Coeficiente da tendência (β)</div><div class="metric-value">${utils.fmtSigned(model.beta, 4)}</div><div class="metric-mini">Escala log10 do indicador</div></article>
      <article class="metric-card"><div class="metric-label">Erro-padrão (β)</div><div class="metric-value">${Number.isFinite(model.seBeta) ? utils.fmtNumber(model.seBeta, 4) : '—'}</div></article>
      <article class="metric-card"><div class="metric-label">p-valor</div><div class="metric-value">${utils.fmtP(model.p)}</div><div class="metric-mini">t = ${utils.fmtNumber(model.t, 3)} · gl = ${model.df}</div></article>
      <article class="metric-card"><div class="metric-label">Classificação</div><div class="metric-value">${utils.escapeHtml(model.classification)}</div><div class="metric-mini">Mudança ${trendStrength(model.apc)}</div></article>
      <article class="metric-card"><div class="metric-label">Variação percentual (APC)</div><div class="metric-value">${utils.fmtSigned(model.apc, 2)}%</div><div class="metric-mini">IC95% ${utils.fmtNumber(model.ciApc[0], 2)} a ${utils.fmtNumber(model.ciApc[1], 2)}</div></article>
      <article class="metric-card"><div class="metric-label">Autocorrelação (ρ)</div><div class="metric-value">${utils.fmtSigned(model.rho, 3)}</div><div class="metric-mini">${acText}</div></article>
    `;

    els.charts.innerHTML = `
      <article class="chart-card">
        <h4>Série temporal observada e tendência ajustada</h4>
        <div class="chart-wrap">${buildMainTrendSvg(parsed.time, parsed.values, fitted, { x: parsed.timeName, y: parsed.indicatorName }, utils)}</div>
        <div class="chart-legend">
          <span class="legend-item"><span class="legend-line" style="background:#2563eb"></span>Observado</span>
          <span class="legend-item"><span class="legend-line" style="background:#0f766e"></span>Tendência ajustada</span>
        </div>
      </article>
      <article class="chart-card">
        <h4>Resíduos em função do tempo (log10)</h4>
        <div class="chart-wrap">${buildResidualSvg(parsed.time, residuals, { x: parsed.timeName, y: 'Resíduo (log10)' }, utils)}</div>
        <div class="small-note">Resíduos próximos de zero, sem padrão forte, sugerem ajuste mais estável.</div>
      </article>
    `;

    const interp = buildInterpretation(model, { time: parsed.timeName, indicator: parsed.indicatorName });

    els.results.innerHTML = `
      <article class="result-card">
        <h4>Interpretação automática</h4>
        <p>${utils.escapeHtml(interp)}</p>
        <ul>
          <li>Contexto informado: ${utils.escapeHtml(els.context.value || 'Tendência temporal do indicador')}.</li>
          <li>Resultado: APC ${utils.fmtSigned(model.apc, 2)}% (IC95% ${utils.fmtNumber(model.ciApc[0], 2)} a ${utils.fmtNumber(model.ciApc[1], 2)}), p = ${utils.fmtP(model.p)}.</li>
          <li>Interpretação de autocorrelação: ρ = ${utils.fmtSigned(model.rho, 3)} (${acText}).</li>
        </ul>
      </article>
      <article class="result-card">
        <h4>Nota metodológica</h4>
        <p>Esta implementação usa Prais-Winsten com transformação log10 e correção AR(1), apropriada para análise introdutória de tendência em séries agregadas. Em séries muito curtas, mudanças pequenas podem não ser detectadas com precisão.</p>
      </article>
    `;
  };

  root.querySelector('#pw-example').addEventListener('click', () => {
    els.paste.value = exampleText;
    refreshPreview();
    runAnalysis();
  });

  root.querySelector('#pw-run').addEventListener('click', runAnalysis);

  root.querySelector('#pw-clear').addEventListener('click', () => {
    els.paste.value = '';
    els.file.value = '';
    refreshPreview();
    clearOutput();
  });

  els.file.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    els.paste.value = await utils.readFileText(file);
    refreshPreview();
  });

  els.paste.addEventListener('input', refreshPreview);

  els.paste.value = exampleText;
  refreshPreview();
  runAnalysis();
}
