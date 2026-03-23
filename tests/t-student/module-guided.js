import { createDatasusWizard } from '../../assets/js/datasus-wizard.js';
import {
  deriveIndependentTTest,
  derivePairedTTest,
  findBestNormalizedPair,
  getCategoryOptions,
  getMetricOptions,
  getPrimaryMetricKey,
  getTimeOptions
} from '../../assets/js/datasus-normalizer.js';
import {
  parseDataset,
  safeWelch,
  safePaired,
  renderAnalysisError,
  buildResultMetricsHtml,
  buildResultChartsHtml,
  buildManualInterpretation
} from './module.js';

function clonePlain(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function buildTimeBlocks(options) {
  const blocks = [];
  for (let index = 0; index < options.length; index += 5) {
    const chunk = options.slice(index, index + 5);
    if (!chunk.length) continue;
    blocks.push({
      key: chunk.map(item => item.key).join('|'),
      keys: chunk.map(item => item.key),
      label: `${chunk[0].label} a ${chunk[chunk.length - 1].label}`
    });
  }
  return blocks;
}

function sharedTimeOptions(leftSource, rightSource) {
  const leftOptions = getTimeOptions(leftSource);
  const rightKeys = new Set(getTimeOptions(rightSource).map(option => option.key));
  return leftOptions.filter(option => rightKeys.has(option.key));
}

function toneClass(kind) {
  if (kind === 'success') return 'success-box';
  if (kind === 'error') return 'error-box';
  return 'status-bar';
}

function procedureLabel(source) {
  return source?.fileName || 'Fonte DATASUS';
}

function buildGuidedStatusText(result, derived, alpha, utils) {
  const significant = result.p < alpha;
  if (derived.mode === 'paired') {
    return significant
      ? `Comparacao pareada concluida com ${derived.validCounts.pairs} pares validos. A diferenca media foi ${utils.fmtSigned(result.diff, 2)} e houve significancia estatistica (p ${utils.fmtP(result.p)}).`
      : `Comparacao pareada concluida com ${derived.validCounts.pairs} pares validos. A diferenca media foi ${utils.fmtSigned(result.diff, 2)}, sem evidencia estatistica robusta (p ${utils.fmtP(result.p)}).`;
  }

  return significant
    ? `Comparacao entre grupos independentes concluida. Grupo A media ${utils.fmtNumber(result.m1, 2)} versus Grupo B media ${utils.fmtNumber(result.m2, 2)}, com significancia estatistica (p ${utils.fmtP(result.p)}).`
    : `Comparacao entre grupos independentes concluida. Grupo A media ${utils.fmtNumber(result.m1, 2)} versus Grupo B media ${utils.fmtNumber(result.m2, 2)}, sem evidencia estatistica robusta (p ${utils.fmtP(result.p)}).`;
}

function buildGuidedExtraMetrics(derived, utils) {
  if (derived.mode === 'paired') {
    const meanDiff = derived.derivedRows.length
      ? derived.derivedRows.reduce((sum, row) => sum + row.diff, 0) / derived.derivedRows.length
      : NaN;

    return `
      <div class="metric-card">
        <div class="metric-label">Periodo analisado</div>
        <div class="metric-value tstudent-compact-value">${utils.escapeHtml(derived.periodLabel || 'Sem periodo valido')}</div>
        <div class="metric-mini">Comparacao entre os dois procedimentos nas mesmas unidades.</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Pares validos</div>
        <div class="metric-value">${derived.validCounts.pairs}</div>
        <div class="metric-mini">Somente unidades com os dois valores foram mantidas.</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Media das diferencas</div>
        <div class="metric-value">${utils.fmtSigned(meanDiff, 2)}</div>
        <div class="metric-mini">Procedimento A - Procedimento B.</div>
      </div>
    `;
  }

  return `
    <div class="metric-card">
      <div class="metric-label">Periodo analisado</div>
      <div class="metric-value tstudent-compact-value">${utils.escapeHtml(derived.periodLabel || 'Sem periodo valido')}</div>
      <div class="metric-mini">Cada categoria selecionada permaneceu como observacao separada.</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Observacoes validas no Grupo A</div>
      <div class="metric-value">${derived.validCounts.A}</div>
      <div class="metric-mini">Categorias atribuidas: ${derived.selectionCounts.A}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Observacoes validas no Grupo B</div>
      <div class="metric-value">${derived.validCounts.B}</div>
      <div class="metric-mini">Categorias atribuidas: ${derived.selectionCounts.B}</div>
    </div>
  `;
}

function buildGuidedInterpretation(result, derived, alpha, question, utils) {
  const significant = result.p < alpha;

  if (derived.mode === 'paired') {
    const higherLabel = result.diff >= 0 ? derived.groupLabels[0] : derived.groupLabels[1];
    const paragraph = `Comparacao pareada entre os procedimentos ${derived.groupLabels[0]} e ${derived.groupLabels[1]} nas mesmas unidades, no periodo ${derived.periodLabel}. A media do primeiro procedimento foi ${utils.fmtNumber(result.m1, 2)} e a do segundo foi ${utils.fmtNumber(result.m2, 2)}. A direcao da diferenca favoreceu ${higherLabel}${significant ? ', com significancia estatistica.' : ', sem significancia estatistica.'}`;

    return `
      ${utils.buildInterpretationCard('Interpretacao automatica', paragraph, [
        `Pergunta analisada: ${question || 'Comparacao pareada entre procedimentos.'}`,
        `Resultado principal: t = ${utils.fmtNumber(result.t, 3)}, gl = ${utils.fmtNumber(result.df, 2)}, p = ${utils.fmtP(result.p)}.`,
        `Media das diferencas por unidade: ${utils.fmtSigned(result.diff, 2)}.`,
        'Leitura metodologica: comparacao pareada, pois cada unidade contribuiu com dois valores.'
      ])}
    `;
  }

  const higherLabel = result.diff >= 0 ? 'Grupo A' : 'Grupo B';
  const paragraph = `Comparacao entre grupos independentes definidos pelo usuario, no periodo ${derived.periodLabel}. A media do Grupo A foi ${utils.fmtNumber(result.m1, 2)} e a do Grupo B foi ${utils.fmtNumber(result.m2, 2)}. A direcao da diferenca favoreceu ${higherLabel}${significant ? ', com significancia estatistica.' : ', sem significancia estatistica.'}`;

  return `
    ${utils.buildInterpretationCard('Interpretacao automatica', paragraph, [
      `Pergunta analisada: ${question || 'Comparacao entre grupos independentes.'}`,
      `Resultado principal: t = ${utils.fmtNumber(result.t, 3)}, gl = ${utils.fmtNumber(result.df, 2)}, p = ${utils.fmtP(result.p)}.`,
      `Grupo A: ${derived.groupAItems.join(', ') || 'nenhuma categoria valida'}.`,
      `Grupo B: ${derived.groupBItems.join(', ') || 'nenhuma categoria valida'}.`,
      'Leitura metodologica: comparacao independente, pois os grupos foram definidos por categorias distintas.'
    ])}
  `;
}

function exampleSourcesFromConfig(config) {
  if (Array.isArray(config.exampleDatasusPairedFiles) && config.exampleDatasusPairedFiles.length) {
    return config.exampleDatasusPairedFiles.map(item => ({
      fileName: item.fileName,
      text: item.text,
      sourceKind: 'example'
    }));
  }

  if (config.exampleDatasusText) {
    return [{
      fileName: 'exemplo-datasus.tsv',
      text: config.exampleDatasusText,
      sourceKind: 'example'
    }];
  }

  return [];
}

export async function renderTestModule(ctx) {
  const { root, config, utils, stats, shared } = ctx;
  root.classList.add('tstudent-module');

  const defaultManualQuestion = config.defaultQuestion || 'As medias dos grupos sao diferentes?';
  const defaultDatasusQuestion = config.defaultDatasusQuestion || 'Ha diferenca media entre as selecoes comparadas no DATASUS?';

  root.innerHTML = `
    <div class="module-grid">
      <section class="module-header tstudent-header">
        <div class="chip chip-primary">Modulo didatico · comparacoes guiadas</div>
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
        <p class="small-note" style="margin:12px 0 0;">O assistente agora usa a camada universal DATASUS. O modo manual do teste continua preservado.</p>
      </section>

      <div class="tstudent-mode-panel active" data-mode-panel="datasus">
        <section class="surface-card decorated">
          <div id="t-datasus-wizard"></div>
        </section>

        <section class="surface-card">
          <div class="tstudent-step-head">
            <span class="small-chip info">Passo 1</span>
            <h4>Qual tipo de comparacao voce quer fazer?</h4>
          </div>
          <div id="t-datasus-analysis-step" class="small-note" style="margin-top:14px;">Confirme pelo menos uma base DATASUS para liberar esta etapa.</div>
        </section>

        <section class="surface-card">
          <div class="tstudent-step-head">
            <span class="small-chip info">Passo 2</span>
            <h4>Selecionar dados</h4>
          </div>
          <div id="t-datasus-selection-step" class="small-note" style="margin-top:14px;">Escolha o fluxo desejado para selecionar fontes, categorias e periodo.</div>
        </section>

        <section class="surface-card">
          <div class="tstudent-step-head">
            <span class="small-chip info">Passo 3</span>
            <h4>Revisar base derivada</h4>
          </div>
          <div id="t-datasus-derived" class="small-note" style="margin-top:14px;">A base derivada sera mostrada aqui antes do teste.</div>
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
              <label for="t-datasus-alpha">Nivel de significancia</label>
              <select id="t-datasus-alpha">
                <option value="0.01">1%</option>
                <option value="0.05" selected>5%</option>
                <option value="0.10">10%</option>
              </select>
            </div>
          </div>
          <div class="actions-row" style="margin-top:14px;">
            <button class="btn" id="t-datasus-run" type="button" disabled>Rodar analise</button>
          </div>
          <div id="t-datasus-status" class="status-bar" style="margin-top:16px;">Aguardando base derivada valida.</div>
          <div id="t-datasus-metrics" class="metrics-grid" style="margin-top:14px;"></div>
        </section>

        <section class="surface-card tstudent-chart-section">
          <h4>Graficos do teste</h4>
          <div id="t-datasus-chart" class="chart-grid" style="margin-top:14px;"></div>
        </section>

        <section class="surface-card tstudent-interpretation-section">
          <h4>Interpretacao automatica</h4>
          <div id="t-datasus-results" class="result-grid" style="margin-top:14px;"></div>
        </section>
      </div>

      <div class="tstudent-mode-panel" data-mode-panel="manual">
        <section class="surface-card decorated">
          <h4>Entrada manual de dados</h4>
          <p class="small-note tstudent-section-note">Cole duas colunas numericas ou um formato grupo + valor. O comportamento original do modo manual foi preservado.</p>
          <div class="form-grid two">
            <div>
              <label for="t-context">Pergunta do estudo</label>
              <input id="t-context" type="text" value="${utils.escapeHtml(defaultManualQuestion)}" />
            </div>
            <div>
              <label for="t-alpha">Nivel de significancia</label>
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
            <div class="small-note">Formatos aceitos: duas colunas numericas ou coluna de grupo + coluna numerica.</div>
          </div>
          <div class="actions-row" style="margin-top:14px;">
            <button class="btn-secondary" id="t-example">Carregar exemplo</button>
            <button class="btn" id="t-run">Rodar analise</button>
            <button class="btn-ghost" id="t-clear">Limpar</button>
          </div>
        </section>

        <section class="surface-card">
          <h4>Pre-visualizacao</h4>
          <div id="t-preview" class="small-note">Nenhum dado carregado ainda.</div>
          <div id="t-group-summary" class="metrics-grid t-group-summary" style="margin-top:14px;"></div>
        </section>

        <section class="surface-card tstudent-statistics-section">
          <h4>Resultados estatisticos</h4>
          <div id="t-status" class="status-bar">Carregue um exemplo ou cole os dados para iniciar.</div>
          <div id="t-metrics" class="metrics-grid" style="margin-top:14px;"></div>
        </section>

        <section class="surface-card tstudent-chart-section">
          <h4>Visualizacao grafica</h4>
          <div id="t-chart" class="chart-grid" style="margin-top:14px;"></div>
        </section>

        <section class="surface-card tstudent-interpretation-section">
          <h4>Interpretacao automatica</h4>
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
    wizardEl: root.querySelector('#t-datasus-wizard'),
    analysisEl: root.querySelector('#t-datasus-analysis-step'),
    selectionEl: root.querySelector('#t-datasus-selection-step'),
    derivedEl: root.querySelector('#t-datasus-derived'),
    contextEl: root.querySelector('#t-datasus-context'),
    alphaEl: root.querySelector('#t-datasus-alpha'),
    runBtn: root.querySelector('#t-datasus-run'),
    statusEl: root.querySelector('#t-datasus-status'),
    metricsEl: root.querySelector('#t-datasus-metrics'),
    chartEl: root.querySelector('#t-datasus-chart'),
    resultsEl: root.querySelector('#t-datasus-results')
  };

  const datasusState = {
    session: null,
    sharedSession: clonePlain(shared?.datasus?.lastSession || null),
    analysisMode: 'independent',
    sourceId: '',
    leftSourceId: '',
    rightSourceId: '',
    metricBySource: {},
    assignmentsBySource: {},
    includeTotalBySource: {},
    periodMode: 'single',
    singleTimeKey: '',
    rangeStart: '',
    rangeEnd: '',
    blockKey: '',
    derived: null
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
      <div class="small-note">Formato detectado: <strong>${parsed.mode === 'categorical_numeric' ? 'Grupo + valor' : 'Duas colunas numericas'}</strong> · Linhas validas: ${parsed.validRows} · Linhas ignoradas: ${parsed.ignoredRows}</div>
      ${utils.renderPreviewTable(previewHeaders, parsed.previewRows, 8)}
    `;
    manual.groupSummaryEl.innerHTML = `
      <div class="metric-card"><div class="metric-label">Grupo detectado 1</div><div class="metric-value">${utils.escapeHtml(parsed.groupNames[0] || 'Grupo 1')}</div><div class="metric-mini">n = ${parsed.g1.length}</div></div>
      <div class="metric-card"><div class="metric-label">Grupo detectado 2</div><div class="metric-value">${utils.escapeHtml(parsed.groupNames[1] || 'Grupo 2')}</div><div class="metric-mini">n = ${parsed.g2.length}</div></div>
      <div class="metric-card"><div class="metric-label">Dados validos</div><div class="metric-value">${parsed.validRows}</div><div class="metric-mini">Total importado = ${parsed.rawRows}</div></div>
    `;

    return parsed;
  }

  function runManualAnalysis() {
    const parsed = refreshManualPreview();
    const alpha = Number(manual.alphaEl.value || 0.05);

    if (parsed.g1.length < 2 || parsed.g2.length < 2) {
      renderAnalysisError(manual.statusEl, manual.metricsEl, manual.chartEl, manual.resultsEl, 'Precisamos de pelo menos 2 valores validos em cada grupo para rodar o teste t.');
      return;
    }

    const result = safeWelch(parsed.g1, parsed.g2, stats);
    if (!Number.isFinite(result.t) || !Number.isFinite(result.p)) {
      renderAnalysisError(manual.statusEl, manual.metricsEl, manual.chartEl, manual.resultsEl, 'Nao foi possivel calcular o teste com esses dados.');
      return;
    }

    const labels = [parsed.groupNames[0] || 'Grupo 1', parsed.groupNames[1] || 'Grupo 2'];
    const significant = result.p < alpha;

    manual.statusEl.className = significant ? 'success-box' : 'status-bar';
    manual.statusEl.textContent = significant
      ? `Diferenca estatisticamente significativa detectada (p ${utils.fmtP(result.p)}).`
      : `Nao houve evidencia estatistica suficiente de diferenca entre as medias (p ${utils.fmtP(result.p)}).`;
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

  function currentDatasusSession() {
    if (datasusState.session?.confirmedSources?.length) return datasusState.session;
    if (datasusState.sharedSession?.confirmedSources?.length) return datasusState.sharedSession;
    return null;
  }

  function confirmedSources() {
    return currentDatasusSession()?.confirmedSources || [];
  }

  function getSource(sourceId) {
    return confirmedSources().find(source => source.id === sourceId) || null;
  }

  function ensureAssignments(source) {
    if (!source) return {};
    if (!datasusState.assignmentsBySource[source.id]) {
      datasusState.assignmentsBySource[source.id] = {};
    }
    return datasusState.assignmentsBySource[source.id];
  }

  function availableTimeOptions() {
    if (datasusState.analysisMode === 'paired') {
      const leftSource = getSource(datasusState.leftSourceId);
      const rightSource = getSource(datasusState.rightSourceId);
      if (!leftSource || !rightSource) return [];
      return sharedTimeOptions(leftSource, rightSource);
    }

    const source = getSource(datasusState.sourceId);
    return source ? getTimeOptions(source) : [];
  }

  function ensureDatasusDefaults() {
    const sources = confirmedSources();
    if (!sources.length) {
      datasusState.derived = null;
      datasusState.sourceId = '';
      datasusState.leftSourceId = '';
      datasusState.rightSourceId = '';
      return;
    }

    sources.forEach(source => {
      if (!datasusState.metricBySource[source.id]) {
        datasusState.metricBySource[source.id] = getPrimaryMetricKey(source);
      }
      if (typeof datasusState.includeTotalBySource[source.id] !== 'boolean') {
        datasusState.includeTotalBySource[source.id] = false;
      }
      ensureAssignments(source);
    });

    if (!sources.some(source => source.id === datasusState.sourceId)) {
      datasusState.sourceId = sources[0].id;
    }

    const suggestedPair = findBestNormalizedPair(sources);
    if (!sources.some(source => source.id === datasusState.leftSourceId)) {
      datasusState.leftSourceId = suggestedPair?.leftId || sources[0].id;
    }
    if (!sources.some(source => source.id === datasusState.rightSourceId)) {
      datasusState.rightSourceId = suggestedPair?.rightId || sources[1]?.id || sources[0].id;
    }

    const timeOptions = availableTimeOptions();
    if (!timeOptions.length) {
      datasusState.singleTimeKey = '';
      datasusState.rangeStart = '';
      datasusState.rangeEnd = '';
      datasusState.blockKey = '';
      return;
    }

    const latest = timeOptions[timeOptions.length - 1].key;
    if (!timeOptions.some(option => option.key === datasusState.singleTimeKey)) {
      datasusState.singleTimeKey = latest;
    }
    if (!timeOptions.some(option => option.key === datasusState.rangeStart)) {
      datasusState.rangeStart = timeOptions[0].key;
    }
    if (!timeOptions.some(option => option.key === datasusState.rangeEnd)) {
      datasusState.rangeEnd = latest;
    }

    const blocks = buildTimeBlocks(timeOptions);
    if (!blocks.some(block => block.key === datasusState.blockKey)) {
      datasusState.blockKey = blocks[0]?.key || '';
    }
    if (!['single', 'range', 'block'].includes(datasusState.periodMode)) {
      datasusState.periodMode = 'single';
    }
    if (!datasusState.blockKey && datasusState.periodMode === 'block') {
      datasusState.periodMode = 'single';
    }
  }
