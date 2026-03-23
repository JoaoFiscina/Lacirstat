import {
  parseDataset,
  parseDatasusDataset,
  buildDatasusBlocks,
  safeWelch,
  safePaired,
  renderAnalysisError,
  buildResultMetricsHtml,
  buildResultChartsHtml,
  buildManualInterpretation,
  inferDatasusProcedureLabel,
  getDatasusPairOverlap,
  findBestPairedSuggestion,
  derivePairedDatasusComparison,
  deriveIndependentDatasusGuidedComparison,
  buildGuidedDatasusMetricsHtml,
  buildGuidedDatasusStatusText,
  buildGuidedDatasusInterpretation
} from './module.js';

export async function renderTestModule(ctx) {
  const { root, config, utils, stats } = ctx;
  root.classList.add('tstudent-module');
  const defaultManualQuestion = config.defaultQuestion || 'As m\u00e9dias dos grupos s\u00e3o diferentes?';
  const defaultDatasusQuestion = config.defaultDatasusQuestion || 'H\u00e1 diferen\u00e7a m\u00e9dia entre as sele\u00e7\u00f5es comparadas no DATASUS?';

  root.innerHTML = `
    <div class="module-grid">
      <section class="module-header tstudent-header">
        <div class="chip chip-primary">M\u00f3dulo did\u00e1tico \u00b7 compara\u00e7\u00f5es guiadas</div>
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
          <button type="button" class="tstudent-mode-btn active" data-mode-target="datasus" aria-selected="true">Assistente DATASUS</button>
          <button type="button" class="tstudent-mode-btn" data-mode-target="manual" aria-selected="false">Modo manual</button>
        </div>
        <p class="small-note" style="margin:12px 0 0;">O assistente orienta a escolha entre t pareado e t independente. O modo manual original permanece intacto para uso livre.</p>
      </section>

      <div class="tstudent-mode-panel active" data-mode-panel="datasus">
        <section class="surface-card decorated">
          <h4>Importar arquivos DATASUS</h4>
          <p class="small-note tstudent-section-note">Importe um ou mais arquivos do DATASUS. Um arquivo permite comparar grupos independentes; dois arquivos compat\u00edveis permitem comparar procedimentos nas mesmas unidades.</p>
          <div class="form-grid two">
            <div>
              <label for="t-datasus-file">Arquivo(s) DATASUS</label>
              <input id="t-datasus-file" type="file" multiple accept=".csv,.tsv,.txt,text/csv,text/plain" />
              <div class="small-note">Aceita .csv, .tsv e .txt. O parser tenta ;, depois tab e depois v\u00edrgula.</div>
            </div>
            <div class="tstudent-inline-actions">
              <button class="btn-secondary" id="t-datasus-example" type="button">Carregar exemplo guiado</button>
              <button class="btn-ghost" id="t-datasus-clear" type="button">Limpar tudo</button>
            </div>
          </div>
          <div id="t-datasus-status-card" class="status-bar" style="margin-top:16px;">Importe um arquivo DATASUS para iniciar o assistente.</div>
        </section>

        <section class="surface-card">
          <div class="tstudent-step-head">
            <span class="small-chip info">Passo 1</span>
            <h4>Qual tipo de compara\u00e7\u00e3o voc\u00ea quer fazer?</h4>
          </div>
          <div id="t-datasus-analysis-step" class="small-note" style="margin-top:14px;">As op\u00e7\u00f5es do assistente aparecem ap\u00f3s a leitura de pelo menos um arquivo v\u00e1lido.</div>
        </section>

        <section class="surface-card">
          <div class="tstudent-step-head">
            <span class="small-chip info">Passo 2</span>
            <h4>Selecionar dados</h4>
          </div>
          <div id="t-datasus-selection-step" class="small-note" style="margin-top:14px;">Escolha o cen\u00e1rio de an\u00e1lise para liberar as sele\u00e7\u00f5es guiadas.</div>
        </section>

        <section class="surface-card">
          <div class="tstudent-step-head">
            <span class="small-chip info">Passo 3</span>
            <h4>Revisar base derivada</h4>
          </div>
          <p class="small-note tstudent-section-note">A base derivada \u00e9 sempre mostrada antes do teste para deixar claro quais observa\u00e7\u00f5es ser\u00e3o comparadas.</p>
          <div id="t-datasus-preview" class="small-note" style="margin-top:14px;">Nenhuma base importada ainda.</div>
          <div id="t-datasus-derived" class="small-note" style="margin-top:16px;">Selecione o tipo de compara\u00e7\u00e3o para montar a base derivada.</div>
        </section>

        <section class="surface-card tstudent-statistics-section">
          <div class="tstudent-step-head">
            <span class="small-chip info">Passo 4</span>
            <h4>Rodar teste e interpretar</h4>
          </div>
          <div class="form-grid two" style="margin-top:14px;">
            <div>
              <label for="t-datasus-context">Pergunta do estudo</label>
              <input id="t-datasus-context" type="text" value="${utils.escapeHtml(defaultDatasusQuestion)}" />
            </div>
            <div>
              <label for="t-datasus-alpha">N\u00edvel de signific\u00e2ncia</label>
              <select id="t-datasus-alpha">
                <option value="0.01">1%</option>
                <option value="0.05" selected>5%</option>
                <option value="0.10">10%</option>
              </select>
            </div>
          </div>
          <div class="actions-row" style="margin-top:14px;">
            <button class="btn" id="t-datasus-run" type="button" disabled>Rodar an\u00e1lise</button>
          </div>
          <div id="t-datasus-result-status" class="status-bar" style="margin-top:16px;">Aguardando base derivada v\u00e1lida.</div>
          <div id="t-datasus-metrics" class="metrics-grid" style="margin-top:14px;"></div>
        </section>

        <section class="surface-card tstudent-chart-section">
          <h4>Gr\u00e1ficos do t test</h4>
          <p class="small-note tstudent-section-note">Os gr\u00e1ficos ajudam a comparar distribui\u00e7\u00f5es, diferen\u00e7a entre m\u00e9dias e intervalo de confian\u00e7a.</p>
          <div id="t-datasus-chart" class="chart-grid" style="margin-top:14px;"></div>
        </section>

        <section class="surface-card tstudent-interpretation-section">
          <h4>Interpreta\u00e7\u00e3o autom\u00e1tica</h4>
          <p class="small-note tstudent-section-note">Resumo em linguagem clara, sempre com m\u00e9dias, dire\u00e7\u00e3o da diferen\u00e7a, signific\u00e2ncia e per\u00edodo analisado.</p>
          <div id="t-datasus-results" class="result-grid" style="margin-top:14px;"></div>
        </section>
      </div>

      <div class="tstudent-mode-panel" data-mode-panel="manual">
        <section class="surface-card decorated">
          <h4>Entrada manual de dados</h4>
          <p class="small-note tstudent-section-note">Cole duas colunas num\u00e9ricas ou um formato grupo + valor. O comportamento original do modo manual foi preservado.</p>
          <div class="form-grid two">
            <div>
              <label for="t-context">Pergunta do estudo</label>
              <input id="t-context" type="text" value="${utils.escapeHtml(defaultManualQuestion)}" />
            </div>
            <div>
              <label for="t-alpha">N\u00edvel de signific\u00e2ncia</label>
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
            <div class="small-note">Formatos aceitos: duas colunas num\u00e9ricas ou coluna de grupo + coluna num\u00e9rica.</div>
          </div>
          <div class="actions-row" style="margin-top:14px;">
            <button class="btn-secondary" id="t-example">Carregar exemplo</button>
            <button class="btn" id="t-run">Rodar an\u00e1lise</button>
            <button class="btn-ghost" id="t-clear">Limpar</button>
          </div>
        </section>

        <section class="surface-card">
          <h4>Pr\u00e9-visualiza\u00e7\u00e3o</h4>
          <div id="t-preview" class="small-note">Nenhum dado carregado ainda.</div>
          <div id="t-group-summary" class="metrics-grid t-group-summary" style="margin-top:14px;"></div>
        </section>

        <section class="surface-card tstudent-statistics-section">
          <h4>Resultados estat\u00edsticos</h4>
          <p class="small-note tstudent-section-note">Leitura r\u00e1pida do teste t: m\u00e9dias, dispers\u00e3o, evid\u00eancia estat\u00edstica e tamanho de efeito.</p>
          <div id="t-status" class="status-bar">Carregue um exemplo ou cole os dados para iniciar.</div>
          <div id="t-metrics" class="metrics-grid" style="margin-top:14px;"></div>
        </section>

        <section class="surface-card tstudent-chart-section">
          <h4>Visualiza\u00e7\u00e3o gr\u00e1fica</h4>
          <p class="small-note tstudent-section-note">Os gr\u00e1ficos ajudam a inspecionar distribui\u00e7\u00e3o, diferen\u00e7a entre m\u00e9dias e incerteza.</p>
          <div id="t-chart" class="chart-grid" style="margin-top:14px;"></div>
        </section>

        <section class="surface-card tstudent-interpretation-section">
          <h4>Interpreta\u00e7\u00e3o autom\u00e1tica</h4>
          <p class="small-note tstudent-section-note">Resumo em linguagem natural para apoiar a leitura did\u00e1tica do resultado.</p>
          <div id="t-results" class="result-grid" style="margin-top:14px;"></div>
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
    exampleBtn: root.querySelector('#t-datasus-example'),
    clearBtn: root.querySelector('#t-datasus-clear'),
    contextEl: root.querySelector('#t-datasus-context'),
    alphaEl: root.querySelector('#t-datasus-alpha'),
    runBtn: root.querySelector('#t-datasus-run'),
    statusCardEl: root.querySelector('#t-datasus-status-card'),
    analysisEl: root.querySelector('#t-datasus-analysis-step'),
    selectionEl: root.querySelector('#t-datasus-selection-step'),
    previewEl: root.querySelector('#t-datasus-preview'),
    derivedEl: root.querySelector('#t-datasus-derived'),
    resultStatusEl: root.querySelector('#t-datasus-result-status'),
    metricsEl: root.querySelector('#t-datasus-metrics'),
    chartEl: root.querySelector('#t-datasus-chart'),
    resultsEl: root.querySelector('#t-datasus-results')
  };

  let datasusEntryCounter = 0;
  const datasusState = {
    library: [],
    importIssues: [],
    error: '',
    analysisMode: 'independent',
    suggestedMode: '',
    suggestedPair: null,
    activeDatasetId: '',
    pairedLeftId: '',
    pairedRightId: '',
    selectionByDataset: {},
    showTotalByDataset: {},
    periodMode: 'single',
    singleYear: '',
    rangeStart: '',
    rangeEnd: '',
    blockKey: '',
    derived: null,
    result: null
  };

  function setActiveModePanel(target) {
    root.querySelectorAll('.tstudent-mode-btn').forEach(button => {
      const active = button.dataset.modeTarget === target;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    root.querySelectorAll('.tstudent-mode-panel').forEach(panel => {
      panel.classList.toggle('active', panel.dataset.modePanel === target);
    });
  }

  function refreshManualPreview() {
    const parsed = parseDataset(manual.pasteEl.value, stats);

    if (!parsed.previewRows.length) {
      manual.previewEl.innerHTML = '<div class="small-note">Nenhum dado carregado ainda.</div>';
      manual.groupSummaryEl.innerHTML = '';
      return parsed;
    }

    const previewHeaders = parsed.mode === 'categorical_numeric' ? ['Grupo', 'Valor'] : parsed.headers;
    manual.previewEl.innerHTML = `
      <div class="small-note">Formato detectado: <strong>${parsed.mode === 'categorical_numeric' ? 'Grupo + valor' : 'Duas colunas num\u00e9ricas'}</strong> \u00b7 Linhas v\u00e1lidas: ${parsed.validRows} \u00b7 Linhas ignoradas: ${parsed.ignoredRows}</div>
      ${utils.renderPreviewTable(previewHeaders, parsed.previewRows, 8)}
    `;
    manual.groupSummaryEl.innerHTML = `
      <div class="metric-card"><div class="metric-label">Grupo detectado 1</div><div class="metric-value">${utils.escapeHtml(parsed.groupNames[0] || 'Grupo 1')}</div><div class="metric-mini">n = ${parsed.g1.length}</div></div>
      <div class="metric-card"><div class="metric-label">Grupo detectado 2</div><div class="metric-value">${utils.escapeHtml(parsed.groupNames[1] || 'Grupo 2')}</div><div class="metric-mini">n = ${parsed.g2.length}</div></div>
      <div class="metric-card"><div class="metric-label">Dados v\u00e1lidos</div><div class="metric-value">${parsed.validRows}</div><div class="metric-mini">Total importado = ${parsed.rawRows}</div></div>
    `;

    return parsed;
  }

  function runManualAnalysis() {
    const parsed = refreshManualPreview();
    const alpha = Number(manual.alphaEl.value || 0.05);

    if (parsed.g1.length < 2 || parsed.g2.length < 2) {
      renderAnalysisError(manual.statusEl, manual.metricsEl, manual.chartEl, manual.resultsEl, 'Precisamos de pelo menos 2 valores v\u00e1lidos em cada grupo para rodar o teste t.');
      return;
    }

    const result = safeWelch(parsed.g1, parsed.g2, stats);
    if (!Number.isFinite(result.t) || !Number.isFinite(result.p)) {
      renderAnalysisError(manual.statusEl, manual.metricsEl, manual.chartEl, manual.resultsEl, 'N\u00e3o foi poss\u00edvel calcular o teste com esses dados.');
      return;
    }

    const labels = [parsed.groupNames[0] || 'Grupo 1', parsed.groupNames[1] || 'Grupo 2'];
    const significant = result.p < alpha;

    manual.statusEl.className = significant ? 'success-box' : 'status-bar';
    manual.statusEl.textContent = significant
      ? `Diferen\u00e7a estatisticamente significativa detectada (p ${utils.fmtP(result.p)} < ${alpha.toLocaleString('pt-BR')}).`
      : `N\u00e3o houve evid\u00eancia estat\u00edstica suficiente de diferen\u00e7a entre as m\u00e9dias (p ${utils.fmtP(result.p)}).`;
    manual.metricsEl.innerHTML = buildResultMetricsHtml(result, labels, utils);
    manual.chartEl.innerHTML = buildResultChartsHtml(result, labels, parsed.g1, parsed.g2, stats, utils);
    manual.resultsEl.innerHTML = buildManualInterpretation(result, alpha, labels, manual.contextEl.value || defaultManualQuestion, utils);
  }

  function clearManual() {
    manual.pasteEl.value = '';
    manual.contextEl.value = defaultManualQuestion;
    manual.alphaEl.value = '0.05';
    manual.previewEl.innerHTML = '<div class="small-note">Nenhum dado carregado ainda.</div>';
    manual.groupSummaryEl.innerHTML = '';
    manual.statusEl.className = 'status-bar';
    manual.statusEl.textContent = 'Campos limpos. Cole novos dados e rode novamente.';
    manual.metricsEl.innerHTML = '';
    manual.chartEl.innerHTML = '';
    manual.resultsEl.innerHTML = '';
  }

  function resetDatasusImportedState() {
    datasusState.library = [];
    datasusState.importIssues = [];
    datasusState.error = '';
    datasusState.analysisMode = 'independent';
    datasusState.suggestedMode = '';
    datasusState.suggestedPair = null;
    datasusState.activeDatasetId = '';
    datasusState.pairedLeftId = '';
    datasusState.pairedRightId = '';
    datasusState.selectionByDataset = {};
    datasusState.showTotalByDataset = {};
    datasusState.periodMode = 'single';
    datasusState.singleYear = '';
    datasusState.rangeStart = '';
    datasusState.rangeEnd = '';
    datasusState.blockKey = '';
    datasusState.derived = null;
    datasusState.result = null;
  }

  function clearDatasusResultPanels() {
    datasusRefs.metricsEl.innerHTML = '';
    datasusRefs.chartEl.innerHTML = '';
    datasusRefs.resultsEl.innerHTML = '';
  }

  function renderDatasusResultState(message, tone = 'status') {
    datasusRefs.resultStatusEl.className = tone === 'error' ? 'error-box' : tone === 'success' ? 'success-box' : 'status-bar';
    datasusRefs.resultStatusEl.textContent = message;
    if (tone !== 'success') clearDatasusResultPanels();
  }

  function getDatasusEntry(datasetId) {
    return datasusState.library.find(entry => entry.id === datasetId) || null;
  }

  function getDatasusSelectionMap(datasetId) {
    if (!datasetId) return {};
    if (!datasusState.selectionByDataset[datasetId]) {
      datasusState.selectionByDataset[datasetId] = {};
    }
    return datasusState.selectionByDataset[datasetId];
  }

  function getDatasusShowTotal(datasetId) {
    return Boolean(datasusState.showTotalByDataset[datasetId]);
  }

  function getActiveIndependentEntry() {
    return getDatasusEntry(datasusState.activeDatasetId) || datasusState.library[0] || null;
  }

  function getActivePairedEntries() {
    return {
      leftEntry: getDatasusEntry(datasusState.pairedLeftId) || datasusState.library[0] || null,
      rightEntry: getDatasusEntry(datasusState.pairedRightId) || datasusState.library[1] || null
    };
  }

  function getCurrentPreviewEntry() {
    if (datasusState.analysisMode === 'paired') {
      return getActivePairedEntries().leftEntry || getActiveIndependentEntry();
    }
    return getActiveIndependentEntry();
  }

  function getCurrentAvailableYears() {
    if (datasusState.analysisMode === 'paired') {
      const { leftEntry, rightEntry } = getActivePairedEntries();
      return getDatasusPairOverlap(leftEntry, rightEntry).sharedYears.sort((a, b) => Number(a) - Number(b));
    }

    const activeEntry = getActiveIndependentEntry();
    return activeEntry?.parsed?.years ? [...activeEntry.parsed.years] : [];
  }

  function ensurePeriodState() {
    const availableYears = getCurrentAvailableYears();
    if (!availableYears.length) {
      datasusState.singleYear = '';
      datasusState.rangeStart = '';
      datasusState.rangeEnd = '';
      datasusState.blockKey = '';
      return { years: [], blocks: { complete: [], incomplete: [], all: [] } };
    }

    const blocks = buildDatasusBlocks(availableYears);
    if (!['single', 'range', 'block'].includes(datasusState.periodMode)) {
      datasusState.periodMode = 'single';
    }

    const latestYear = availableYears[availableYears.length - 1];
    if (!availableYears.includes(datasusState.singleYear)) {
      datasusState.singleYear = latestYear;
    }
    if (!availableYears.includes(datasusState.rangeStart)) {
      datasusState.rangeStart = availableYears[0];
    }
    if (!availableYears.includes(datasusState.rangeEnd)) {
      datasusState.rangeEnd = latestYear;
    }

    const firstBlock = blocks.complete[0] || blocks.all[0] || null;
    if (!blocks.all.some(block => block.key === datasusState.blockKey)) {
      datasusState.blockKey = firstBlock ? firstBlock.key : '';
    }
    if (datasusState.periodMode === 'block' && !datasusState.blockKey) {
      datasusState.periodMode = 'single';
    }

    return { years: availableYears, blocks };
  }

  function buildEntryBadge(entry) {
    if (datasusState.analysisMode === 'paired') {
      if (entry.id === datasusState.pairedLeftId) return { text: 'Procedimento A', tone: 'info' };
      if (entry.id === datasusState.pairedRightId) return { text: 'Procedimento B', tone: 'primary' };
    }

    if (entry.id === datasusState.activeDatasetId) {
      return { text: 'Arquivo ativo', tone: 'primary' };
    }

    return { text: 'Arquivo importado', tone: 'info' };
  }

  function buildEntryCard(entry) {
    const years = entry.parsed.years;
    const badge = buildEntryBadge(entry);
    return `
      <article class="mini-card tstudent-dataset-card">
        <span class="small-chip ${badge.tone}">${utils.escapeHtml(badge.text)}</span>
        <h4 style="margin-top:12px;">${utils.escapeHtml(entry.procedureLabel)}</h4>
        <p>${utils.escapeHtml(entry.fileName)}</p>
        <div class="small-note">${utils.escapeHtml(entry.parsed.dimensionLabel)} \u00b7 ${utils.escapeHtml(years[0])} a ${utils.escapeHtml(years[years.length - 1])}</div>
      </article>
    `;
  }

  function buildDatasusEntry(source) {
    const normalizedText = typeof utils.normalizeImportedText === 'function'
      ? utils.normalizeImportedText(source.text || '')
      : String(source.text || '');
    const normalizedFileName = typeof utils.normalizeImportedLabel === 'function'
      ? utils.normalizeImportedLabel(source.fileName || '')
      : String(source.fileName || '');
    const parsed = parseDatasusDataset(normalizedText, stats);

    if (!parsed.ok) {
      return {
        ok: false,
        fileName: normalizedFileName || 'arquivo-datasus',
        message: parsed.error || 'N\u00e3o foi poss\u00edvel interpretar o arquivo DATASUS enviado.'
      };
    }

    datasusEntryCounter += 1;
    return {
      ok: true,
      id: `datasus-entry-${datasusEntryCounter}`,
      fileName: normalizedFileName || `arquivo-datasus-${datasusEntryCounter}.txt`,
      sourceText: normalizedText,
      sourceKind: source.sourceKind || 'upload',
      parsed,
      procedureLabel: inferDatasusProcedureLabel(parsed, normalizedFileName || `Arquivo ${datasusEntryCounter}`)
    };
  }

  function getExampleDatasusSources() {
    if (Array.isArray(config.exampleDatasusPairedFiles) && config.exampleDatasusPairedFiles.length) {
      return config.exampleDatasusPairedFiles.map((entry, index) => ({
        fileName: entry.fileName || `exemplo-datasus-${index + 1}.tsv`,
        text: entry.text || '',
        sourceKind: 'example'
      }));
    }

    return [{
      fileName: 'exemplo-datasus.tsv',
      text: config.exampleDatasusText || '',
      sourceKind: 'example'
    }];
  }

  function getDerivedDatasusState() {
    if (!datasusState.library.length) {
      return {
        ok: false,
        mode: datasusState.analysisMode,
        primaryError: 'Importe um arquivo DATASUS para continuar.',
        validationErrors: ['Importe um arquivo DATASUS para continuar.'],
        derivedRows: [],
        vectors: { A: [], B: [] },
        validCounts: { A: 0, B: 0, pairs: 0 },
        selectionCounts: { A: 0, B: 0 },
        omittedRows: [],
        selectedYears: [],
        periodLabel: '',
        groupLabels: ['Grupo A', 'Grupo B'],
        groupRegions: { A: [], B: [] },
        unitLabel: 'Categoria',
        explanation: ''
      };
    }

    if (datasusState.analysisMode === 'paired') {
      const { leftEntry, rightEntry } = getActivePairedEntries();
      return derivePairedDatasusComparison({
        leftEntry,
        rightEntry,
        periodState: datasusState
      }, stats);
    }

    const activeEntry = getActiveIndependentEntry();
    return deriveIndependentDatasusGuidedComparison({
      entry: activeEntry,
      selectionMap: getDatasusSelectionMap(activeEntry?.id),
      periodState: datasusState,
      showTotal: getDatasusShowTotal(activeEntry?.id)
    }, stats);
  }

  function updateDatasusRunAvailability() {
    const enabled = Boolean(datasusState.derived && datasusState.derived.ok);
    datasusRefs.runBtn.disabled = !enabled;
    datasusRefs.runBtn.classList.toggle('is-disabled', !enabled);
    datasusRefs.runBtn.textContent = datasusState.analysisMode === 'paired'
      ? 'Rodar t pareado'
      : 'Rodar t independente';
  }

  function invalidateDatasusRun() {
    datasusState.result = null;
    clearDatasusResultPanels();
    datasusRefs.resultStatusEl.className = 'status-bar';
    datasusRefs.resultStatusEl.textContent = datasusState.library.length
      ? 'A base derivada foi atualizada. Revise os dados e execute o teste quando a valida\u00e7\u00e3o estiver verde.'
      : 'Aguardando importa\u00e7\u00e3o de arquivo.';
    updateDatasusRunAvailability();
  }

  function buildPeriodControlsHtml(availableYears, blocks) {
    if (!availableYears.length) {
      return '<div class="error-box" style="margin-top:14px;">N\u00e3o h\u00e1 per\u00edodo v\u00e1lido dispon\u00edvel para esta sele\u00e7\u00e3o.</div>';
    }

    const blockOptions = blocks.complete.length ? blocks.complete : blocks.all;
    const incompleteNote = blocks.incomplete.length
      ? `<div class="small-note tstudent-advanced-note">Blocos incompletos detectados: ${utils.escapeHtml(blocks.incomplete.map(block => block.label).join(', '))}.</div>`
      : '';

    return `
      <div class="form-grid three" style="margin-top:16px;">
        <div>
          <label for="t-datasus-period-mode">Per\u00edodo analisado</label>
          <select id="t-datasus-period-mode">
            <option value="single"${datasusState.periodMode === 'single' ? ' selected' : ''}>Ano \u00fanico (default)</option>
            <option value="range"${datasusState.periodMode === 'range' ? ' selected' : ''}>Intervalo</option>
            <option value="block"${datasusState.periodMode === 'block' ? ' selected' : ''}>Bloco de 5 anos</option>
          </select>
        </div>
        <div class="tstudent-period-field ${datasusState.periodMode === 'single' ? 'is-visible' : ''}">
          <label for="t-datasus-single-year">Ano</label>
          <select id="t-datasus-single-year">
            ${availableYears.map(year => `<option value="${utils.escapeHtml(year)}"${year === datasusState.singleYear ? ' selected' : ''}>${utils.escapeHtml(year)}</option>`).join('')}
          </select>
        </div>
        <div class="tstudent-period-field ${datasusState.periodMode === 'block' ? 'is-visible' : ''}">
          <label for="t-datasus-block">Bloco autom\u00e1tico</label>
          <select id="t-datasus-block">
            ${blockOptions.length
              ? blockOptions.map(block => `<option value="${utils.escapeHtml(block.key)}"${block.key === datasusState.blockKey ? ' selected' : ''}>${utils.escapeHtml(block.label)}</option>`).join('')
              : '<option value="">Nenhum bloco dispon\u00edvel</option>'}
          </select>
        </div>
      </div>

      <div class="form-grid two tstudent-range-grid ${datasusState.periodMode === 'range' ? 'is-visible' : ''}">
        <div>
          <label for="t-datasus-range-start">Ano inicial</label>
          <select id="t-datasus-range-start">
            ${availableYears.map(year => `<option value="${utils.escapeHtml(year)}"${year === datasusState.rangeStart ? ' selected' : ''}>${utils.escapeHtml(year)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label for="t-datasus-range-end">Ano final</label>
          <select id="t-datasus-range-end">
            ${availableYears.map(year => `<option value="${utils.escapeHtml(year)}"${year === datasusState.rangeEnd ? ' selected' : ''}>${utils.escapeHtml(year)}</option>`).join('')}
          </select>
        </div>
      </div>
      ${incompleteNote}
    `;
  }

  function attachPeriodControlEvents() {
    const periodModeEl = datasusRefs.selectionEl.querySelector('#t-datasus-period-mode');
    const singleYearEl = datasusRefs.selectionEl.querySelector('#t-datasus-single-year');
    const rangeStartEl = datasusRefs.selectionEl.querySelector('#t-datasus-range-start');
    const rangeEndEl = datasusRefs.selectionEl.querySelector('#t-datasus-range-end');
    const blockEl = datasusRefs.selectionEl.querySelector('#t-datasus-block');

    periodModeEl?.addEventListener('change', event => {
      datasusState.periodMode = event.target.value;
      ensurePeriodState();
      renderDatasusSelectionStep();
      renderDatasusDerived();
      invalidateDatasusRun();
    });

    singleYearEl?.addEventListener('change', event => {
      datasusState.singleYear = event.target.value;
      renderDatasusDerived();
      invalidateDatasusRun();
    });

    rangeStartEl?.addEventListener('change', event => {
      datasusState.rangeStart = event.target.value;
      renderDatasusDerived();
      invalidateDatasusRun();
    });

    rangeEndEl?.addEventListener('change', event => {
      datasusState.rangeEnd = event.target.value;
      renderDatasusDerived();
      invalidateDatasusRun();
    });

    blockEl?.addEventListener('change', event => {
      datasusState.blockKey = event.target.value;
      renderDatasusDerived();
      invalidateDatasusRun();
    });
  }

  function renderDatasusImportStatus() {
    if (datasusState.error && !datasusState.library.length) {
      datasusRefs.statusCardEl.className = 'error-box';
      datasusRefs.statusCardEl.textContent = datasusState.error;
      return;
    }

    if (!datasusState.library.length) {
      datasusRefs.statusCardEl.className = 'status-bar';
      datasusRefs.statusCardEl.textContent = 'Importe um arquivo DATASUS para iniciar o assistente.';
      return;
    }

    const pairSuggestion = datasusState.suggestedPair;
    const suggestionLabel = datasusState.suggestedMode === 'paired'
      ? `t pareado sugerido (${pairSuggestion?.commonCount || 0} unidades em comum)`
      : 't independente sugerido';
    const allYears = datasusState.library.flatMap(entry => entry.parsed.years).map(Number).filter(Number.isFinite);
    const minYear = allYears.length ? Math.min(...allYears) : '';
    const maxYear = allYears.length ? Math.max(...allYears) : '';
    const issuesHtml = datasusState.importIssues.length
      ? `<div class="small-note" style="margin-top:14px;">Arquivos ignorados: ${utils.escapeHtml(datasusState.importIssues.map(issue => `${issue.fileName}: ${issue.message}`).join(' | '))}</div>`
      : '';

    datasusRefs.statusCardEl.className = 'info-banner';
    datasusRefs.statusCardEl.innerHTML = `
      <div class="metrics-grid tstudent-status-grid">
        <div class="metric-card">
          <div class="metric-label">Arquivos v\u00e1lidos</div>
          <div class="metric-value">${datasusState.library.length}</div>
          <div class="metric-mini">${datasusState.importIssues.length} arquivo(s) ignorado(s)</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Sugest\u00e3o autom\u00e1tica</div>
          <div class="metric-value tstudent-compact-value">${utils.escapeHtml(suggestionLabel)}</div>
          <div class="metric-mini">Voc\u00ea pode aceitar a sugest\u00e3o ou trocar manualmente.</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Janela temporal detectada</div>
          <div class="metric-value">${minYear && maxYear ? `${minYear}-${maxYear}` : '\u2014'}</div>
          <div class="metric-mini">Os anos finais dependem do(s) arquivo(s) selecionado(s).</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Modo atual</div>
          <div class="metric-value">${datasusState.analysisMode === 'paired' ? 't pareado' : 't independente'}</div>
          <div class="metric-mini">Modo manual continua dispon\u00edvel na aba ao lado.</div>
        </div>
      </div>
      <div class="tstudent-dataset-list" style="margin-top:14px;">
        ${datasusState.library.map(buildEntryCard).join('')}
      </div>
      ${issuesHtml}
    `;
  }

  function renderDatasusAnalysisStep() {
    if (!datasusState.library.length) {
      datasusRefs.analysisEl.innerHTML = '<div class="small-note">As op\u00e7\u00f5es do assistente aparecem ap\u00f3s a leitura de pelo menos um arquivo v\u00e1lido.</div>';
      return;
    }

    const independentEntry = getActiveIndependentEntry();
    const independentSelection = independentEntry ? getDatasusSelectionMap(independentEntry.id) : {};
    const independentGroups = Object.values(independentSelection).filter(Boolean);
    const hasIndependentA = independentGroups.includes('A');
    const hasIndependentB = independentGroups.includes('B');
    const suggestionMessage = datasusState.suggestedMode === 'paired' && datasusState.suggestedPair
      ? `Isso parece um cen\u00e1rio pareado: ${datasusState.suggestedPair.commonCount} unidades aparecem em dois arquivos compat\u00edveis.`
      : hasIndependentA && hasIndependentB
        ? 'Isso parece compara\u00e7\u00e3o entre grupos independentes, porque as categorias selecionadas formam grupos distintos.'
        : 'Sem pares fortes detectados, o assistente sugere come\u00e7ar pela compara\u00e7\u00e3o entre grupos independentes.';

    datasusRefs.analysisEl.innerHTML = `
      <div class="${datasusState.suggestedMode === 'paired' ? 'success-box' : 'status-bar'}">${utils.escapeHtml(suggestionMessage)}</div>
      <div class="tstudent-choice-grid" style="margin-top:14px;">
        <button type="button" class="tstudent-choice-card ${datasusState.analysisMode === 'paired' ? 'is-active' : ''}" data-analysis-mode="paired">
          <strong>1. Comparar dois procedimentos</strong>
          <span>Seleciona dois arquivos/procedimentos, alinha automaticamente as mesmas unidades e roda <strong>t pareado</strong>.</span>
        </button>
        <button type="button" class="tstudent-choice-card ${datasusState.analysisMode === 'independent' ? 'is-active' : ''}" data-analysis-mode="independent">
          <strong>2. Comparar dois grupos diferentes</strong>
          <span>Seleciona categorias do mesmo arquivo, resume por per\u00edodo e roda <strong>t independente (Welch)</strong>.</span>
        </button>
        <button type="button" class="tstudent-choice-card" data-analysis-mode="manual">
          <strong>3. Modo manual</strong>
          <span>Abre o fluxo original do m\u00f3dulo para colar os dados diretamente.</span>
        </button>
      </div>
    `;

    datasusRefs.analysisEl.querySelectorAll('[data-analysis-mode]').forEach(button => {
      button.addEventListener('click', () => {
        const target = button.dataset.analysisMode;
        if (target === 'manual') {
          setActiveModePanel('manual');
          return;
        }

        datasusState.analysisMode = target;
        ensurePeriodState();
        renderDatasusImportStatus();
        renderDatasusAnalysisStep();
        renderDatasusSelectionStep();
        renderDatasusPreview();
        renderDatasusDerived();
        invalidateDatasusRun();
      });
    });
  }

  function renderDatasusSelectionStep() {
    if (!datasusState.library.length) {
      datasusRefs.selectionEl.innerHTML = '<div class="small-note">Escolha o cen\u00e1rio de an\u00e1lise para liberar as sele\u00e7\u00f5es guiadas.</div>';
      return;
    }

    const { years, blocks } = ensurePeriodState();

    if (datasusState.analysisMode === 'paired') {
      const { leftEntry, rightEntry } = getActivePairedEntries();
      const overlap = getDatasusPairOverlap(leftEntry, rightEntry);
      const unitLabel = leftEntry?.parsed?.dimensionLabel || rightEntry?.parsed?.dimensionLabel || 'Unidade';
      const overlapMessage = leftEntry && rightEntry
        ? overlap.commonCount >= 2
          ? `Isso parece um cen\u00e1rio pareado: ${overlap.commonCount} ${unitLabel.toLowerCase()} aparecem nos dois procedimentos selecionados.`
          : 'Selecione dois arquivos com unidades em comum para montar a compara\u00e7\u00e3o pareada.'
        : 'Selecione os dois procedimentos a serem comparados.';

      datasusRefs.selectionEl.innerHTML = `
        <div class="${overlap.commonCount >= 2 ? 'success-box' : 'status-bar'}">${utils.escapeHtml(overlapMessage)}</div>
        <div class="form-grid two" style="margin-top:14px;">
          <div>
            <label for="t-datasus-proc-a">Procedimento A</label>
            <select id="t-datasus-proc-a">
              ${datasusState.library.map(entry => `<option value="${utils.escapeHtml(entry.id)}"${entry.id === datasusState.pairedLeftId ? ' selected' : ''}>${utils.escapeHtml(entry.procedureLabel)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label for="t-datasus-proc-b">Procedimento B</label>
            <select id="t-datasus-proc-b">
              ${datasusState.library.map(entry => `<option value="${utils.escapeHtml(entry.id)}"${entry.id === datasusState.pairedRightId ? ' selected' : ''}>${utils.escapeHtml(entry.procedureLabel)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="small-note" style="margin-top:12px;">O sistema monta automaticamente a tabela <strong>${utils.escapeHtml(unitLabel)}</strong> \u2192 Procedimento A \u00d7 Procedimento B e mant\u00e9m apenas unidades com os dois valores no per\u00edodo escolhido.</div>
        ${buildPeriodControlsHtml(years, blocks)}
        <div class="metrics-grid" style="margin-top:14px;">
          <div class="metric-card">
            <div class="metric-label">Unidades em comum</div>
            <div class="metric-value">${overlap.commonCount}</div>
            <div class="metric-mini">M\u00ednimo recomendado: 2 pares v\u00e1lidos</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Anos compartilhados</div>
            <div class="metric-value">${overlap.sharedYears.length}</div>
            <div class="metric-mini">${overlap.sharedYears.length ? utils.escapeHtml(overlap.sharedYears.join(', ')) : 'nenhum ano simult\u00e2neo detectado'}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Teste sugerido</div>
            <div class="metric-value">t pareado</div>
            <div class="metric-mini">Cada unidade contribui com dois valores.</div>
          </div>
        </div>
      `;

      datasusRefs.selectionEl.querySelector('#t-datasus-proc-a')?.addEventListener('change', event => {
        datasusState.pairedLeftId = event.target.value;
        ensurePeriodState();
        renderDatasusImportStatus();
        renderDatasusSelectionStep();
        renderDatasusPreview();
        renderDatasusDerived();
        invalidateDatasusRun();
      });

      datasusRefs.selectionEl.querySelector('#t-datasus-proc-b')?.addEventListener('change', event => {
        datasusState.pairedRightId = event.target.value;
        ensurePeriodState();
        renderDatasusImportStatus();
        renderDatasusSelectionStep();
        renderDatasusPreview();
        renderDatasusDerived();
        invalidateDatasusRun();
      });

      attachPeriodControlEvents();
      return;
    }

    const activeEntry = getActiveIndependentEntry();
    if (!activeEntry) {
      datasusRefs.selectionEl.innerHTML = '<div class="error-box">N\u00e3o foi poss\u00edvel identificar um arquivo ativo para compara\u00e7\u00e3o entre grupos.</div>';
      return;
    }

    const selectionMap = getDatasusSelectionMap(activeEntry.id);
    const visibleRows = activeEntry.parsed.parsedRows.filter(row => getDatasusShowTotal(activeEntry.id) || !row.isTotalRow);
    const selectedA = visibleRows.filter(row => selectionMap[row.id] === 'A').length;
    const selectedB = visibleRows.filter(row => selectionMap[row.id] === 'B').length;
    const independentMessage = selectedA > 0 && selectedB > 0
      ? 'Isso parece compara\u00e7\u00e3o entre grupos independentes: as categorias marcadas est\u00e3o em grupos distintos.'
      : 'Selecione as categorias que formar\u00e3o Grupo A e Grupo B.';

    datasusRefs.selectionEl.innerHTML = `
      <div class="${selectedA > 0 && selectedB > 0 ? 'success-box' : 'status-bar'}">${utils.escapeHtml(independentMessage)}</div>
      <div class="form-grid two" style="margin-top:14px;">
        <div>
          <label for="t-datasus-active-dataset">Arquivo base</label>
          <select id="t-datasus-active-dataset">
            ${datasusState.library.map(entry => `<option value="${utils.escapeHtml(entry.id)}"${entry.id === activeEntry.id ? ' selected' : ''}>${utils.escapeHtml(entry.procedureLabel)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label>Resumo r\u00e1pido</label>
          <div class="tstudent-config-summary">
            <span class="small-chip info">Grupo A: ${selectedA}</span>
            <span class="small-chip primary">Grupo B: ${selectedB}</span>
            <span class="small-chip ${getDatasusShowTotal(activeEntry.id) ? 'warning' : 'info'}">Linha Total ${getDatasusShowTotal(activeEntry.id) ? 'vis\u00edvel' : 'oculta'}</span>
          </div>
        </div>
      </div>
      ${buildPeriodControlsHtml(years, blocks)}
      <label class="tstudent-toggle">
        <input id="t-datasus-show-total" type="checkbox"${getDatasusShowTotal(activeEntry.id) ? ' checked' : ''} />
        <span>Mostrar linha "Total" como op\u00e7\u00e3o avan\u00e7ada</span>
      </label>
      <div class="small-note" style="margin-top:12px;">Marque quais categorias entrar\u00e3o em cada grupo. Cada categoria selecionada vira uma observa\u00e7\u00e3o ap\u00f3s o resumo do per\u00edodo.</div>
      <div class="tstudent-group-picker">
        <div class="tstudent-group-picker-head">
          <div>${utils.escapeHtml(activeEntry.parsed.dimensionLabel)}</div>
          <div>Grupo A</div>
          <div>Grupo B</div>
        </div>
        ${visibleRows.map(row => {
          const selectedGroup = selectionMap[row.id] || '';
          const rawNote = row.cleanLabel !== row.rowLabel ? `<div class="small-note" title="${utils.escapeHtml(row.rowLabel)}">Original: ${utils.escapeHtml(row.rowLabel)}</div>` : '';
          return `
            <div class="tstudent-group-row ${row.isTotalRow ? 'is-total-row' : ''}">
              <div>
                <strong>${utils.escapeHtml(row.cleanLabel)}</strong>
                ${rawNote}
              </div>
              <label class="tstudent-checkbox-cell">
                <input type="checkbox" data-role="datasus-checkbox" data-row-id="${utils.escapeHtml(row.id)}" data-group="A"${selectedGroup === 'A' ? ' checked' : ''} />
              </label>
              <label class="tstudent-checkbox-cell">
                <input type="checkbox" data-role="datasus-checkbox" data-row-id="${utils.escapeHtml(row.id)}" data-group="B"${selectedGroup === 'B' ? ' checked' : ''} />
              </label>
            </div>
          `;
        }).join('')}
      </div>
    `;

    datasusRefs.selectionEl.querySelector('#t-datasus-active-dataset')?.addEventListener('change', event => {
      datasusState.activeDatasetId = event.target.value;
      ensurePeriodState();
      renderDatasusImportStatus();
      renderDatasusAnalysisStep();
      renderDatasusSelectionStep();
      renderDatasusPreview();
      renderDatasusDerived();
      invalidateDatasusRun();
    });

    datasusRefs.selectionEl.querySelector('#t-datasus-show-total')?.addEventListener('change', event => {
      datasusState.showTotalByDataset[activeEntry.id] = event.target.checked;
      renderDatasusSelectionStep();
      renderDatasusDerived();
      invalidateDatasusRun();
    });

    datasusRefs.selectionEl.querySelectorAll('input[data-role="datasus-checkbox"]').forEach(input => {
      input.addEventListener('change', event => {
        const rowId = event.target.dataset.rowId;
        const group = event.target.dataset.group;
        const checked = event.target.checked;
        const map = getDatasusSelectionMap(activeEntry.id);

        if (checked) {
          map[rowId] = group;
        } else if (map[rowId] === group) {
          map[rowId] = null;
        }

        renderDatasusAnalysisStep();
        renderDatasusSelectionStep();
        renderDatasusDerived();
        invalidateDatasusRun();
      });
    });

    attachPeriodControlEvents();
  }

  function renderDatasusPreview() {
    if (!datasusState.library.length) {
      datasusRefs.previewEl.innerHTML = '<div class="small-note">Nenhuma base importada ainda.</div>';
      return;
    }

    const previewEntry = getCurrentPreviewEntry();
    if (!previewEntry?.parsed) {
      datasusRefs.previewEl.innerHTML = '<div class="error-box">N\u00e3o foi poss\u00edvel montar a pr\u00e9-visualiza\u00e7\u00e3o do arquivo selecionado.</div>';
      return;
    }

    const previewCards = datasusState.analysisMode === 'paired'
      ? (() => {
          const { leftEntry, rightEntry } = getActivePairedEntries();
          return [leftEntry, rightEntry].filter(Boolean).map(buildEntryCard).join('');
        })()
      : buildEntryCard(previewEntry);

    const metadataNote = previewEntry.parsed.metadataLines.length
      ? `<div class="small-note" style="margin-bottom:12px;">Metadados detectados: ${utils.escapeHtml(previewEntry.parsed.metadataLines.join(' | '))}</div>`
      : '';

    datasusRefs.previewEl.innerHTML = `
      <div class="tstudent-dataset-list">
        ${previewCards}
      </div>
      <div class="small-note" style="margin:14px 0 10px;">Base bruta usada como refer\u00eancia visual do assistente.</div>
      ${metadataNote}
      <div class="small-note" style="margin-bottom:10px;">Cabe\u00e7alho identificado automaticamente na linha ${previewEntry.parsed.headerRowIndex + 1}. A dimens\u00e3o principal detectada foi <strong>${utils.escapeHtml(previewEntry.parsed.dimensionLabel)}</strong>.</div>
      ${utils.renderPreviewTable(previewEntry.parsed.previewHeaders, previewEntry.parsed.previewRows, 8)}
    `;
  }

  function renderDatasusDerived() {
    if (!datasusState.library.length) {
      datasusState.derived = null;
      datasusRefs.derivedEl.innerHTML = '<div class="small-note">Selecione o tipo de compara\u00e7\u00e3o para montar a base derivada.</div>';
      updateDatasusRunAvailability();
      return;
    }

    const derived = getDerivedDatasusState();
    datasusState.derived = derived;

    const validationBox = derived.validationErrors.length
      ? `
        <div class="error-box" style="margin-bottom:14px;">
          <strong>Base derivada ainda inv\u00e1lida.</strong>
          <ul class="tstudent-inline-list">${derived.validationErrors.map(message => `<li>${utils.escapeHtml(message)}</li>`).join('')}</ul>
        </div>
      `
      : `<div class="success-box" style="margin-bottom:14px;">${utils.escapeHtml(derived.explanation || 'Base derivada v\u00e1lida.')}</div>`;

    if (derived.mode === 'paired') {
      const tableRows = derived.derivedRows.map(row => [
        row.rowLabel,
        utils.fmtNumber(row.valueA, 3),
        utils.fmtNumber(row.valueB, 3),
        utils.fmtSigned(row.diff, 3),
        row.validYears.join(', ')
      ]);
      const omittedHtml = derived.omittedRows.length
        ? `<div class="small-note" style="margin-top:12px;">Unidades omitidas por falta de pares completos: ${utils.escapeHtml(derived.omittedRows.map(item => item.rowLabel).join(', '))}.</div>`
        : '';

      datasusRefs.derivedEl.innerHTML = `
        ${validationBox}
        <div class="metrics-grid">
          <div class="metric-card">
            <div class="metric-label">Per\u00edodo analisado</div>
            <div class="metric-value tstudent-compact-value">${utils.escapeHtml(derived.periodLabel || 'sem per\u00edodo v\u00e1lido')}</div>
            <div class="metric-mini">Anos usados: ${derived.selectedYears.length ? utils.escapeHtml(derived.selectedYears.join(', ')) : 'nenhum'}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Pares v\u00e1lidos</div>
            <div class="metric-value">${derived.validCounts.pairs}</div>
            <div class="metric-mini">Unidades em comum detectadas: ${derived.selectionCounts.A}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Unidades omitidas</div>
            <div class="metric-value">${derived.omittedRows.length}</div>
            <div class="metric-mini">Mantidas apenas unidades com os dois valores.</div>
          </div>
        </div>
        <div class="tstudent-derived-groups">
          <article class="mini-card">
            <h4>Grupo A</h4>
            <p>${utils.escapeHtml(derived.groupLabels[0] || 'Procedimento A')}</p>
          </article>
          <article class="mini-card">
            <h4>Grupo B</h4>
            <p>${utils.escapeHtml(derived.groupLabels[1] || 'Procedimento B')}</p>
          </article>
        </div>
        <div class="small-note" style="margin:14px 0 10px;">Diferen\u00e7a por unidade: cada linha abaixo corresponde ao par usado no teste.</div>
        ${utils.renderPreviewTable([derived.unitLabel, derived.groupLabels[0], derived.groupLabels[1], 'Diferen\u00e7a', 'Anos usados'], tableRows, 20)}
        ${omittedHtml}
      `;

      updateDatasusRunAvailability();
      return;
    }

    const groupList = groupKey => {
      const rows = derived.derivedRows.filter(row => row.groupKey === groupKey);
      if (!rows.length) return '<div class="small-note">Nenhuma observa\u00e7\u00e3o v\u00e1lida neste grupo.</div>';
      return `
        <ul class="tstudent-derived-list">
          ${rows.map(row => `
            <li>
              <span title="${utils.escapeHtml(row.rowLabel)}">
                <strong>${utils.escapeHtml(row.rowLabel)}</strong>
                <small>Anos usados: ${utils.escapeHtml(row.validYears.join(', '))}</small>
              </span>
              <strong class="tstudent-derived-value">${utils.fmtNumber(row.value, 2)}</strong>
            </li>
          `).join('')}
        </ul>
      `;
    };

    const tableRows = derived.derivedRows.map(row => [
      row.rowLabel,
      row.groupLabel,
      utils.fmtNumber(row.value, 3),
      row.validYears.join(', ')
    ]);
    const omittedHtml = derived.omittedRows.length
      ? `<div class="small-note" style="margin-top:12px;">Categorias sem valores aproveit\u00e1veis no per\u00edodo atual: ${utils.escapeHtml(derived.omittedRows.map(item => item.rowLabel).join(', '))}.</div>`
      : '';

    datasusRefs.derivedEl.innerHTML = `
      ${validationBox}
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-label">Per\u00edodo analisado</div>
          <div class="metric-value tstudent-compact-value">${utils.escapeHtml(derived.periodLabel || 'sem per\u00edodo v\u00e1lido')}</div>
          <div class="metric-mini">Anos usados: ${derived.selectedYears.length ? utils.escapeHtml(derived.selectedYears.join(', ')) : 'nenhum'}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Observa\u00e7\u00f5es v\u00e1lidas no Grupo A</div>
          <div class="metric-value">${derived.validCounts.A}</div>
          <div class="metric-mini">Linhas atribu\u00eddas: ${derived.selectionCounts.A}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Observa\u00e7\u00f5es v\u00e1lidas no Grupo B</div>
          <div class="metric-value">${derived.validCounts.B}</div>
          <div class="metric-mini">Linhas atribu\u00eddas: ${derived.selectionCounts.B}</div>
        </div>
      </div>
      <div class="tstudent-derived-groups">
        <article class="mini-card">
          <h4>Grupo A</h4>
          ${groupList('A')}
        </article>
        <article class="mini-card">
          <h4>Grupo B</h4>
          ${groupList('B')}
        </article>
      </div>
      <div class="small-note" style="margin:14px 0 10px;">Resumo utilizado: m\u00e9dia dos anos selecionados dentro de cada categoria, mantendo cada categoria como uma observa\u00e7\u00e3o separada.</div>
      ${utils.renderPreviewTable([derived.unitLabel, 'Grupo', 'Valor resumido', 'Anos usados'], tableRows, 20)}
      ${omittedHtml}
    `;

    updateDatasusRunAvailability();
  }

  function renderDatasusWorkflow() {
    ensurePeriodState();
    renderDatasusImportStatus();
    renderDatasusAnalysisStep();
    renderDatasusSelectionStep();
    renderDatasusPreview();
    renderDatasusDerived();
  }

  function hydrateDatasusSources(sources, readIssues = []) {
    resetDatasusImportedState();
    datasusRefs.fileEl.value = '';

    const builtEntries = sources.map(buildDatasusEntry);
    datasusState.importIssues = [
      ...readIssues,
      ...builtEntries.filter(entry => !entry.ok).map(entry => ({
        fileName: entry.fileName,
        message: entry.message
      }))
    ];
    datasusState.library = builtEntries.filter(entry => entry.ok);

    if (!datasusState.library.length) {
      datasusState.error = datasusState.importIssues[0]?.message || 'N\u00e3o foi poss\u00edvel interpretar o arquivo DATASUS enviado.';
      renderDatasusWorkflow();
      renderDatasusResultState(datasusState.error, 'error');
      return;
    }

    datasusState.selectionByDataset = Object.fromEntries(
      datasusState.library.map(entry => [
        entry.id,
        Object.fromEntries(entry.parsed.parsedRows.map(row => [row.id, null]))
      ])
    );
    datasusState.showTotalByDataset = Object.fromEntries(datasusState.library.map(entry => [entry.id, false]));
    datasusState.activeDatasetId = datasusState.library[0].id;

    datasusState.suggestedPair = findBestPairedSuggestion(datasusState.library);
    datasusState.suggestedMode = datasusState.suggestedPair ? 'paired' : 'independent';
    datasusState.analysisMode = datasusState.suggestedMode || 'independent';

    if (datasusState.suggestedPair) {
      datasusState.pairedLeftId = datasusState.suggestedPair.leftId;
      datasusState.pairedRightId = datasusState.suggestedPair.rightId;
      datasusState.activeDatasetId = datasusState.suggestedPair.leftId;
    } else {
      datasusState.pairedLeftId = datasusState.library[0]?.id || '';
      datasusState.pairedRightId = datasusState.library[1]?.id || datasusState.library[0]?.id || '';
    }

    ensurePeriodState();
    renderDatasusWorkflow();
    invalidateDatasusRun();
    setActiveModePanel('datasus');
  }

  async function handleDatasusFile(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    renderDatasusResultState(files.length === 1 ? 'Lendo arquivo DATASUS selecionado...' : 'Lendo arquivos DATASUS selecionados...', 'status');
    const loaded = await Promise.all(files.map(async file => {
      try {
        const text = await utils.readFileText(file);
        return {
          ok: true,
          fileName: file.name,
          text,
          sourceKind: 'upload'
        };
      } catch {
        return {
          ok: false,
          fileName: file.name,
          message: 'N\u00e3o foi poss\u00edvel ler o arquivo selecionado.'
        };
      }
    }));

    const validSources = loaded.filter(item => item.ok).map(item => ({
      fileName: item.fileName,
      text: item.text,
      sourceKind: item.sourceKind
    }));
    const readIssues = loaded.filter(item => !item.ok).map(item => ({
      fileName: item.fileName,
      message: item.message
    }));

    hydrateDatasusSources(validSources, readIssues);
  }

  function runDatasusAnalysis() {
    if (!datasusState.library.length) {
      renderDatasusResultState('N\u00e3o foi poss\u00edvel interpretar o arquivo DATASUS enviado.', 'error');
      return;
    }

    const derived = getDerivedDatasusState();
    datasusState.derived = derived;
    renderDatasusDerived();

    if (!derived.ok) {
      renderDatasusResultState(derived.primaryError || 'N\u00e3o h\u00e1 dados suficientes para compara\u00e7\u00e3o.', 'error');
      return;
    }

    const result = datasusState.analysisMode === 'paired'
      ? safePaired(derived.vectors.A, derived.vectors.B, stats)
      : safeWelch(derived.vectors.A, derived.vectors.B, stats);

    if (!Number.isFinite(result.t) || !Number.isFinite(result.p)) {
      renderDatasusResultState('N\u00e3o foi poss\u00edvel calcular o teste com a base derivada atual.', 'error');
      return;
    }

    datasusState.result = result;
    const alpha = Number(datasusRefs.alphaEl.value || 0.05);
    const significant = result.p < alpha;

    datasusRefs.resultStatusEl.className = significant ? 'success-box' : 'status-bar';
    datasusRefs.resultStatusEl.textContent = buildGuidedDatasusStatusText(result, derived, alpha, utils);
    datasusRefs.metricsEl.innerHTML = buildGuidedDatasusMetricsHtml(result, derived, utils);
    datasusRefs.chartEl.innerHTML = buildResultChartsHtml(result, derived.groupLabels, derived.vectors.A, derived.vectors.B, stats, utils);
    datasusRefs.resultsEl.innerHTML = buildGuidedDatasusInterpretation(result, derived, alpha, datasusRefs.contextEl.value || defaultDatasusQuestion, utils);
    updateDatasusRunAvailability();
  }

  function clearDatasusAll() {
    resetDatasusImportedState();
    datasusRefs.fileEl.value = '';
    datasusRefs.contextEl.value = defaultDatasusQuestion;
    datasusRefs.alphaEl.value = '0.05';
    renderDatasusWorkflow();
    renderDatasusResultState('Campos DATASUS limpos. Importe um novo arquivo para continuar.', 'status');
  }

  root.querySelectorAll('.tstudent-mode-btn').forEach(button => {
    button.addEventListener('click', () => {
      setActiveModePanel(button.dataset.modeTarget);
    });
  });

  root.querySelector('#t-example').addEventListener('click', () => {
    manual.pasteEl.value = config.exampleText || '';
    runManualAnalysis();
  });
  root.querySelector('#t-run').addEventListener('click', runManualAnalysis);
  root.querySelector('#t-clear').addEventListener('click', clearManual);
  manual.pasteEl.addEventListener('input', refreshManualPreview);

  datasusRefs.fileEl.addEventListener('change', handleDatasusFile);
  datasusRefs.contextEl.addEventListener('input', invalidateDatasusRun);
  datasusRefs.alphaEl.addEventListener('change', invalidateDatasusRun);
  datasusRefs.exampleBtn.addEventListener('click', () => {
    hydrateDatasusSources(getExampleDatasusSources());
  });
  datasusRefs.runBtn.addEventListener('click', runDatasusAnalysis);
  datasusRefs.clearBtn.addEventListener('click', clearDatasusAll);

  manual.pasteEl.value = config.exampleText || '';
  runManualAnalysis();
  renderDatasusWorkflow();
  renderDatasusResultState('Aguardando base derivada v\u00e1lida.', 'status');
  updateDatasusRunAvailability();
}
