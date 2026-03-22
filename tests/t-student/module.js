const PT_NUMBER = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 });
const AGGREGATION_LABELS = { mean: "Media simples", sum: "Soma", single: "Linha unica sem agregar" };
const TEST_TYPE_LABELS = { "paired-year": "t pareado por ano", "paired-block": "t pareado por bloco de 5 anos", independent: "t independente" };
const PERIOD_MODE_LABELS = { all: "Todos os anos", range: "Intervalo customizado", block: "Bloco de 5 anos" };

export async function renderTestModule(ctx) {
  const { root, config, utils } = ctx;
  const state = createInitialState();

  root.innerHTML = `
    <div class="t-module">
      <section class="t-panel t-panel-hero">
        <div class="t-panel-hero-copy">
          <span class="t-eyebrow">Modulo DATASUS</span>
          <h3>${utils.escapeHtml(config.title || "t de Student")}</h3>
          <p>${utils.escapeHtml(config.description || "Importe um CSV DATASUS, monte a base derivada e rode o t test no navegador.")}</p>
        </div>
        <div class="t-guide-list">${renderGuideBadges(config.inputGuide || [])}</div>
      </section>
      <div id="datasus-feedback-slot"></div>
      <section class="t-panel">
        <div class="t-section-head">
          <div>
            <span class="t-step">1. Importacao</span>
            <h4>Arquivo tabulado DATASUS</h4>
            <p>O parser ignora metadados do topo, detecta o cabecalho real e converte numeros com virgula decimal.</p>
          </div>
          <div class="t-toolbar">
            <button type="button" class="button" data-action="open-file">Importar CSV DATASUS</button>
            <button type="button" class="button button-secondary" data-action="clear-all">Limpar</button>
            <input id="datasus-file-input" type="file" accept=".csv,.txt,text/csv" hidden />
          </div>
        </div>
        <div id="datasus-file-summary"></div>
        <div id="datasus-methodology-slot"></div>
        <div id="datasus-raw-preview"></div>
      </section>
      <section class="t-panel">
        <div class="t-section-head">
          <div>
            <span class="t-step">2. Selecao</span>
            <h4>Montagem dos grupos</h4>
            <p>Selecione as linhas que entram em cada grupo. Cada linha pode pertencer a apenas um grupo por vez.</p>
          </div>
        </div>
        <div id="datasus-group-summary"></div>
        <div id="datasus-row-selector"></div>
      </section>
      <section class="t-panel">
        <div class="t-section-head">
          <div>
            <span class="t-step">3. Configuracao</span>
            <h4>Tipo de teste e periodo</h4>
            <p>Defina como resumir os valores antes do teste e qual estrutura estatistica deve ser aplicada.</p>
          </div>
        </div>
        <div id="datasus-controls"></div>
      </section>
      <section class="t-panel">
        <div class="t-section-head">
          <div>
            <span class="t-step">4. Base derivada</span>
            <h4>Tabela final que vai entrar no teste</h4>
            <p>Revise a base derivada antes de executar o calculo. No modo independente, cada regiao permanece observacao separada.</p>
          </div>
        </div>
        <div id="datasus-derived-preview"></div>
      </section>
      <section class="t-panel">
        <div class="t-section-head">
          <div>
            <span class="t-step">5. Resultado</span>
            <h4>Rodar t test</h4>
            <p>O calculo so roda quando a base derivada atende aos criterios minimos de observacao.</p>
          </div>
          <button type="button" class="button" id="datasus-run-test">Rodar t test</button>
        </div>
        <div id="datasus-result"></div>
      </section>
    </div>
  `;

  const refs = {
    feedback: root.querySelector("#datasus-feedback-slot"),
    fileInput: root.querySelector("#datasus-file-input"),
    fileSummary: root.querySelector("#datasus-file-summary"),
    methodology: root.querySelector("#datasus-methodology-slot"),
    rawPreview: root.querySelector("#datasus-raw-preview"),
    groupSummary: root.querySelector("#datasus-group-summary"),
    rowSelector: root.querySelector("#datasus-row-selector"),
    controls: root.querySelector("#datasus-controls"),
    derivedPreview: root.querySelector("#datasus-derived-preview"),
    result: root.querySelector("#datasus-result"),
    runButton: root.querySelector("#datasus-run-test")
  };

  refs.fileInput.addEventListener("change", async (event) => {
    const [file] = Array.from(event.target.files || []);
    if (!file) return;
    await importDatasusFile(file, state);
    renderAll(refs, state);
  });

  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    if (button.dataset.action === "open-file") {
      refs.fileInput.click();
      return;
    }
    if (button.dataset.action === "clear-all") {
      resetState(state, refs.fileInput);
      renderAll(refs, state);
      return;
    }
    if (button.dataset.action === "assign-row") {
      assignRow(state, button.dataset.rowKey, button.dataset.group);
      state.result = null;
      state.feedback = null;
      renderAll(refs, state);
    }
  });

  root.addEventListener("change", (event) => {
    const target = event.target;
    if (target.matches('input[name="t-test-type"]')) state.testType = target.value;
    if (target.matches('input[name="aggregation-mode"]')) state.aggregationMode = target.value;
    if (target.matches('input[name="period-mode"]')) state.periodMode = target.value;
    if (target.id === "datasus-range-start") state.rangeStart = Number(target.value);
    if (target.id === "datasus-range-end") state.rangeEnd = Number(target.value);
    if (target.id === "datasus-block-select") state.selectedBlockId = target.value;
    ensureBlockSelection(state);
    state.result = null;
    state.feedback = null;
    renderAll(refs, state);
  });

  refs.runButton.addEventListener("click", () => {
    try {
      const derived = buildDerivedDataset(state);
      if (!derived.canRun) {
        state.result = null;
        state.feedback = { kind: "danger", text: derived.blockingMessage || "A base derivada ainda nao atende aos criterios para rodar o teste." };
      } else {
        state.feedback = null;
        state.result = runTTest(derived);
      }
    } catch (error) {
      state.result = null;
      state.feedback = { kind: "danger", text: error.message || "Nao foi possivel calcular o teste." };
    }
    renderAll(refs, state);
  });

  renderAll(refs, state);
}

function createInitialState() {
  return {
    parsed: null,
    fileName: "",
    selectedA: new Set(),
    selectedB: new Set(),
    testType: "independent",
    aggregationMode: "mean",
    periodMode: "all",
    rangeStart: null,
    rangeEnd: null,
    selectedBlockId: "",
    feedback: null,
    result: null
  };
}

function renderGuideBadges(items) {
  return items.map((item) => `<span class="t-guide-pill">${escapeMarkup(item)}</span>`).join("");
}

async function importDatasusFile(file, state) {
  try {
    const parsed = parseDatasusTable(await file.text());
    const years = parsed.years.map((item) => item.year);
    state.parsed = parsed;
    state.fileName = file.name;
    state.selectedA = new Set();
    state.selectedB = new Set();
    state.testType = parsed.isTemporalAggregated ? "paired-year" : "independent";
    state.aggregationMode = "mean";
    state.periodMode = "all";
    state.rangeStart = years[0] || null;
    state.rangeEnd = years[years.length - 1] || null;
    state.selectedBlockId = "";
    ensureBlockSelection(state);
    state.result = null;
    state.feedback = { kind: "success", text: `Arquivo ${file.name} importado com ${parsed.rows.length} linhas e ${parsed.years.length} anos reconhecidos.` };
  } catch (error) {
    resetState(state);
    state.feedback = { kind: "danger", text: error.message || "Nao foi possivel interpretar o arquivo DATASUS." };
  }
}

function resetState(state, fileInput) {
  Object.assign(state, createInitialState());
  if (fileInput) fileInput.value = "";
}

function renderAll(refs, state) {
  const derived = buildDerivedDataset(state);
  renderFeedback(refs.feedback, state.feedback);
  renderFileSummary(refs.fileSummary, state);
  renderMethodology(refs.methodology, state);
  renderRawPreview(refs.rawPreview, state);
  renderGroupSummary(refs.groupSummary, state);
  renderRowSelector(refs.rowSelector, state);
  renderControls(refs.controls, state);
  renderDerivedPreview(refs.derivedPreview, derived);
  renderResult(refs.result, state, derived);
  refs.runButton.disabled = !derived.canRun;
}

function renderFeedback(container, feedback) {
  container.innerHTML = !feedback ? "" : `<div class="notice notice-${feedback.kind}"><strong>${feedback.kind === "danger" ? "Atencao" : "Atualizacao"}</strong><p>${escapeMarkup(feedback.text)}</p></div>`;
}

function renderFileSummary(container, state) {
  if (!state.parsed) {
    container.innerHTML = `<div class="empty-card"><h5>Nenhum arquivo importado</h5><p>Use o botao acima para carregar um CSV DATASUS com separador <code>;</code>.</p></div>`;
    return;
  }
  const parsed = state.parsed;
  container.innerHTML = `
    <div class="summary-grid">
      <div class="summary-card"><span class="summary-label">Arquivo</span><strong>${escapeMarkup(state.fileName)}</strong></div>
      <div class="summary-card"><span class="summary-label">Rotulo principal</span><strong>${escapeMarkup(parsed.labelHeader)}</strong></div>
      <div class="summary-card"><span class="summary-label">Anos detectados</span><strong>${parsed.years[0].year} a ${parsed.years[parsed.years.length - 1].year}</strong></div>
      <div class="summary-card"><span class="summary-label">Coluna Total</span><strong>${parsed.totalColumn ? "Detectada" : "Nao detectada"}</strong></div>
    </div>
  `;
}

function renderMethodology(container, state) {
  if (!state.parsed) {
    container.innerHTML = "";
    return;
  }
  const notices = [];
  if (state.parsed.isTemporalAggregated) notices.push({ title: "Serie temporal detectada", text: "Como o arquivo possui varios anos comparaveis, o sistema sugere por padrao um t pareado.", kind: "info" });
  if (state.testType === "paired-block") notices.push({ title: "Resumo por bloco", text: "No modo por bloco, cada linha e resumida pela media dos anos de cada bloco antes da comparacao entre os grupos.", kind: "info" });
  if (state.periodMode === "block" && state.testType === "independent") notices.push({ title: "Regioes preservadas", text: "No t independente por bloco, cada regiao continua sendo uma observacao separada no grupo.", kind: "info" });
  container.innerHTML = notices.map((notice) => `<div class="notice notice-${notice.kind}"><strong>${escapeMarkup(notice.title)}</strong><p>${escapeMarkup(notice.text)}</p></div>`).join("");
}

function renderRawPreview(container, state) {
  if (!state.parsed) {
    container.innerHTML = "";
    return;
  }
  const parsed = state.parsed;
  const headers = [parsed.labelHeader].concat(parsed.years.map((item) => String(item.year))).concat(parsed.totalColumn ? ["Total"] : []);
  const rows = parsed.rows.slice(0, 12);
  container.innerHTML = `
    <div class="t-subsection">
      <div class="t-subsection-head"><h5>Pre-visualizacao da tabela importada</h5><span>${parsed.rows.length} linhas reconhecidas</span></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>${headers.map((header) => `<th>${escapeMarkup(header)}</th>`).join("")}</tr></thead>
          <tbody>${rows.map((row) => renderRawPreviewRow(row, parsed)).join("")}</tbody>
        </table>
      </div>
      ${parsed.rows.length > rows.length ? `<p class="hint-text">A pre-visualizacao mostra apenas as primeiras ${rows.length} linhas.</p>` : ""}
    </div>
  `;
}

function renderRawPreviewRow(row, parsed) {
  return `
    <tr${row.isTotalRow ? ' class="row-is-total"' : ""}>
      <th scope="row">${escapeMarkup(row.label)}</th>
      ${parsed.years.map((column) => `<td>${formatNullableNumber(row.values[column.key])}</td>`).join("")}
      ${parsed.totalColumn ? `<td>${formatNullableNumber(row.values[parsed.totalColumn.key])}</td>` : ""}
    </tr>
  `;
}

function renderGroupSummary(container, state) {
  if (!state.parsed) {
    container.innerHTML = "";
    return;
  }
  const groupA = getSelectedRows(state, "A");
  const groupB = getSelectedRows(state, "B");
  container.innerHTML = `
    <div class="summary-grid">
      <div class="summary-card summary-card-accent"><span class="summary-label">Grupo A</span><strong>${groupA.length} linha(s)</strong><p>${groupA.length ? escapeMarkup(groupA.map((row) => row.label).join(" + ")) : "Nenhuma linha selecionada."}</p></div>
      <div class="summary-card summary-card-accent"><span class="summary-label">Grupo B</span><strong>${groupB.length} linha(s)</strong><p>${groupB.length ? escapeMarkup(groupB.map((row) => row.label).join(" + ")) : "Nenhuma linha selecionada."}</p></div>
    </div>
  `;
}

function renderRowSelector(container, state) {
  if (!state.parsed) {
    container.innerHTML = `<div class="empty-card"><h5>Selecao indisponivel</h5><p>Importe um arquivo antes de montar os grupos.</p></div>`;
    return;
  }
  const rows = state.parsed.rows.filter((row) => !row.isTotalRow);
  container.innerHTML = `<div class="selector-grid">${rows.map((row) => renderRowCard(row, state)).join("")}</div>`;
}

function renderRowCard(row, state) {
  const isA = state.selectedA.has(row.key);
  const isB = state.selectedB.has(row.key);
  return `
    <article class="selector-card${isA ? " selector-card-a" : ""}${isB ? " selector-card-b" : ""}">
      <div class="selector-card-copy">
        <h5>${escapeMarkup(row.label)}</h5>
        <p>${row.validYearCount} ano(s) com valor. Total: ${row.totalValue != null ? formatNullableNumber(row.totalValue) : "Sem Total"}</p>
      </div>
      <div class="selector-actions">
        <button type="button" class="selector-btn${isA ? " is-active" : ""}" data-action="assign-row" data-group="A" data-row-key="${escapeAttribute(row.key)}">Grupo A</button>
        <button type="button" class="selector-btn${isB ? " is-active" : ""}" data-action="assign-row" data-group="B" data-row-key="${escapeAttribute(row.key)}">Grupo B</button>
        <button type="button" class="selector-btn selector-btn-ghost" data-action="assign-row" data-group="none" data-row-key="${escapeAttribute(row.key)}">Remover</button>
      </div>
    </article>
  `;
}

function renderControls(container, state) {
  if (!state.parsed) {
    container.innerHTML = `<div class="empty-card"><h5>Configuracoes indisponiveis</h5><p>As opcoes aparecem depois que um arquivo DATASUS e reconhecido.</p></div>`;
    return;
  }
  const years = state.parsed.years.map((item) => item.year);
  const blocks = getBlockOptions(state);
  const help = state.testType === "independent" ? "No modo independente, cada regiao selecionada permanece como observacao separada no grupo." : "Nos modos pareados, as observacoes finais sao anos ou blocos comparaveis entre Grupo A e Grupo B.";
  container.innerHTML = `
    <div class="control-grid">
      <div class="control-card">
        <span class="summary-label">Tipo de t test</span>
        <div class="option-stack">
          ${renderRadioOption("t-test-type", "paired-year", state.testType, TEST_TYPE_LABELS["paired-year"])}
          ${renderRadioOption("t-test-type", "paired-block", state.testType, TEST_TYPE_LABELS["paired-block"])}
          ${renderRadioOption("t-test-type", "independent", state.testType, TEST_TYPE_LABELS.independent)}
        </div>
      </div>
      <div class="control-card">
        <span class="summary-label">Resumo numerico</span>
        <div class="option-stack">
          ${renderRadioOption("aggregation-mode", "mean", state.aggregationMode, AGGREGATION_LABELS.mean)}
          ${renderRadioOption("aggregation-mode", "sum", state.aggregationMode, AGGREGATION_LABELS.sum)}
          ${renderRadioOption("aggregation-mode", "single", state.aggregationMode, AGGREGATION_LABELS.single)}
        </div>
        <p class="hint-text">${escapeMarkup(help)}</p>
      </div>
      <div class="control-card">
        <span class="summary-label">Periodo de analise</span>
        <div class="option-stack">
          ${renderRadioOption("period-mode", "all", state.periodMode, PERIOD_MODE_LABELS.all)}
          ${renderRadioOption("period-mode", "range", state.periodMode, PERIOD_MODE_LABELS.range)}
          ${renderRadioOption("period-mode", "block", state.periodMode, PERIOD_MODE_LABELS.block)}
        </div>
        ${state.periodMode === "range" ? `<div class="inline-fields"><label>Inicio<select id="datasus-range-start">${years.map((year) => `<option value="${year}"${year === state.rangeStart ? " selected" : ""}>${year}</option>`).join("")}</select></label><label>Fim<select id="datasus-range-end">${years.map((year) => `<option value="${year}"${year === state.rangeEnd ? " selected" : ""}>${year}</option>`).join("")}</select></label></div>` : ""}
        ${state.periodMode === "block" ? `<div class="inline-fields inline-fields-single"><label>Bloco disponivel<select id="datasus-block-select">${blocks.map((block) => `<option value="${block.id}"${block.id === state.selectedBlockId ? " selected" : ""}>${escapeMarkup(block.label)}</option>`).join("")}</select></label></div>` : ""}
      </div>
    </div>
  `;
}

function renderRadioOption(name, value, selectedValue, label) {
  return `<label class="option-pill"><input type="radio" name="${name}" value="${value}"${value === selectedValue ? " checked" : ""} /><span>${escapeMarkup(label)}</span></label>`;
}

function renderDerivedPreview(container, derived) {
  const notices = (derived.messages || []).map((message) => `<div class="notice notice-${message.kind}"><strong>${escapeMarkup(message.title || "Base derivada")}</strong><p>${escapeMarkup(message.text)}</p></div>`).join("");
  const summary = derived.summary ? `<div class="summary-grid">${derived.summary.map((item) => `<div class="summary-card"><span class="summary-label">${escapeMarkup(item.label)}</span><strong>${escapeMarkup(item.value)}</strong></div>`).join("")}</div>` : "";
  const table = derived.table ? `<div class="table-wrap"><table class="data-table"><thead><tr>${derived.table.headers.map((header) => `<th>${escapeMarkup(header)}</th>`).join("")}</tr></thead><tbody>${derived.table.rows.map((row) => `<tr>${row.map((cell, index) => `${index === 0 ? "<th scope=\"row\">" : "<td>"}${escapeMarkup(cell)}${index === 0 ? "</th>" : "</td>"}`).join("")}</tr>`).join("")}</tbody></table></div>` : `<div class="empty-card"><h5>Base derivada ainda incompleta</h5><p>${escapeMarkup(derived.blockingMessage || "Selecione as linhas e os parametros do teste para gerar a tabela final.")}</p></div>`;
  container.innerHTML = `${notices}${summary}${table}`;
}

function renderResult(container, state, derived) {
  if (!state.result) {
    container.innerHTML = `<div class="empty-card"><h5>Resultado aguardando execucao</h5><p>${escapeMarkup(derived.canRun ? "A base derivada esta pronta. Clique em Rodar t test." : "Complete a base derivada para habilitar o teste.")}</p></div>`;
    return;
  }
  const result = state.result;
  container.innerHTML = `
    <div class="stat-grid">
      ${renderStatCard("n", result.nLabel)}
      ${renderStatCard("Media Grupo A", formatNullableNumber(result.meanA))}
      ${renderStatCard("Media Grupo B", formatNullableNumber(result.meanB))}
      ${renderStatCard("Diferenca media", formatNullableNumber(result.meanDifference))}
      ${renderStatCard("t", formatNullableNumber(result.t))}
      ${renderStatCard("Graus de liberdade", formatNullableNumber(result.df))}
      ${renderStatCard("p-valor", formatPValue(result.pValue))}
      ${renderStatCard("IC95%", `${formatNullableNumber(result.ciLow)} a ${formatNullableNumber(result.ciHigh)}`)}
    </div>
    <div class="notice notice-info"><strong>Interpretacao automatica</strong><p>${escapeMarkup(result.interpretation)}</p></div>
    <div class="chart-card">
      <h5>Comparacao visual das medias</h5>
      <div class="chart-bars">${renderChartBar(result.labelA, result.meanA, result.chartMax)}${renderChartBar(result.labelB, result.meanB, result.chartMax)}</div>
    </div>
  `;
}

function renderStatCard(label, value) {
  return `<div class="stat-card"><span class="summary-label">${escapeMarkup(label)}</span><strong>${escapeMarkup(value)}</strong></div>`;
}

function renderChartBar(label, value, maxValue) {
  const width = maxValue > 0 ? Math.max((Math.abs(value) / maxValue) * 100, 4) : 4;
  return `<div class="chart-row"><div class="chart-copy"><strong>${escapeMarkup(label)}</strong><span>${formatNullableNumber(value)}</span></div><div class="chart-track"><div class="chart-fill" style="width:${width.toFixed(2)}%"></div></div></div>`;
}

function assignRow(state, rowKey, group) {
  if (group === "A") {
    if (state.selectedA.has(rowKey)) state.selectedA.delete(rowKey); else { state.selectedA.add(rowKey); state.selectedB.delete(rowKey); }
    return;
  }
  if (group === "B") {
    if (state.selectedB.has(rowKey)) state.selectedB.delete(rowKey); else { state.selectedB.add(rowKey); state.selectedA.delete(rowKey); }
    return;
  }
  state.selectedA.delete(rowKey);
  state.selectedB.delete(rowKey);
}

function buildDerivedDataset(state) {
  if (!state.parsed) return { canRun: false, messages: [], blockingMessage: "Importe um arquivo DATASUS para montar a base derivada." };
  const selectedA = getSelectedRows(state, "A");
  const selectedB = getSelectedRows(state, "B");
  if (selectedA.length === 0 || selectedB.length === 0) return { canRun: false, messages: [{ kind: "warning", title: "Selecao pendente", text: "Escolha pelo menos uma linha para o Grupo A e uma linha para o Grupo B." }], blockingMessage: "Os dois grupos precisam ter pelo menos uma linha selecionada." };
  if (state.periodMode === "range" && state.rangeStart > state.rangeEnd) return { canRun: false, messages: [{ kind: "danger", title: "Intervalo invalido", text: "O ano inicial nao pode ser maior que o ano final." }], blockingMessage: "Ajuste o intervalo customizado antes de rodar o teste." };
  if (state.testType === "paired-year") return buildPairedYearDataset(state, selectedA, selectedB);
  if (state.testType === "paired-block") return buildPairedBlockDataset(state, selectedA, selectedB);
  return buildIndependentDataset(state, selectedA, selectedB);
}

function buildPairedYearDataset(state, selectedA, selectedB) {
  if (state.periodMode === "block") return { canRun: false, messages: [{ kind: "warning", title: "Modo incompatível", text: "O t pareado por ano precisa de anos individuais. Use intervalo customizado ou troque para t pareado por bloco de 5 anos." }], blockingMessage: "Troque o tipo de teste ou o periodo para gerar a base derivada." };
  if (state.aggregationMode === "single" && (selectedA.length !== 1 || selectedB.length !== 1)) return { canRun: false, messages: [{ kind: "warning", title: "Linha unica requerida", text: "A opcao Linha unica sem agregar exige exatamente uma linha em cada grupo." }], blockingMessage: "Ajuste a selecao de linhas ou troque o metodo de resumo." };
  const years = getSelectedYears(state);
  if (!years.length) return { canRun: false, messages: [{ kind: "danger", title: "Sem anos validos", text: "Nao foi possivel localizar anos dentro do periodo escolhido." }], blockingMessage: "Selecione pelo menos um ano valido." };
  const messages = [];
  const tableRows = [];
  const sampleA = [];
  const sampleB = [];
  let dropped = 0;
  years.forEach((year) => {
    const valueA = buildGroupPointForPaired(selectedA, [year], state.aggregationMode);
    const valueB = buildGroupPointForPaired(selectedB, [year], state.aggregationMode);
    if (valueA == null || valueB == null) { dropped += 1; return; }
    tableRows.push([String(year), formatNullableNumber(valueA), formatNullableNumber(valueB)]);
    sampleA.push(valueA);
    sampleB.push(valueB);
  });
  if (dropped > 0) messages.push({ kind: "info", title: "Anos descartados", text: `${dropped} ano(s) foram descartados por falta de valor valido em pelo menos um dos grupos.` });
  if (sampleA.length < 2 || sampleB.length < 2) messages.push({ kind: "danger", title: "Observacoes insuficientes", text: "O t pareado precisa de pelo menos 2 pares validos para ser executado." });
  return { canRun: sampleA.length >= 2 && sampleB.length >= 2, mode: "paired-year", labelA: formatGroupLabel(selectedA), labelB: formatGroupLabel(selectedB), sampleA, sampleB, messages, blockingMessage: sampleA.length >= 2 && sampleB.length >= 2 ? "" : "Ainda nao existem pares suficientes para o t pareado por ano.", table: tableRows.length ? { headers: ["Ano", "Grupo A", "Grupo B"], rows: tableRows } : null, summary: [{ label: "Tipo de teste", value: TEST_TYPE_LABELS["paired-year"] }, { label: "Resumo escolhido", value: AGGREGATION_LABELS[state.aggregationMode] }, { label: "Pares validos", value: String(sampleA.length) }] };
}

function buildPairedBlockDataset(state, selectedA, selectedB) {
  if (state.aggregationMode === "single" && (selectedA.length !== 1 || selectedB.length !== 1)) return { canRun: false, messages: [{ kind: "warning", title: "Linha unica requerida", text: "A opcao Linha unica sem agregar exige exatamente uma linha em cada grupo." }], blockingMessage: "Ajuste a selecao de linhas ou troque o metodo de resumo." };
  const years = state.periodMode === "block" ? getYearsFromSelectedBlock(state) : getSelectedYears(state);
  const blocks = createFiveYearBlocks(years);
  if (!blocks.length) return { canRun: false, messages: [{ kind: "danger", title: "Sem blocos validos", text: "Nao foi possivel formar blocos de 5 anos a partir do periodo escolhido." }], blockingMessage: "Escolha um periodo que permita formar pelo menos um bloco." };
  const messages = [];
  const tableRows = [];
  const sampleA = [];
  const sampleB = [];
  let dropped = 0;
  blocks.forEach((block) => {
    const valueA = buildGroupPointForPaired(selectedA, block.years, state.aggregationMode);
    const valueB = buildGroupPointForPaired(selectedB, block.years, state.aggregationMode);
    if (valueA == null || valueB == null) { dropped += 1; return; }
    tableRows.push([block.label, formatNullableNumber(valueA), formatNullableNumber(valueB)]);
    sampleA.push(valueA);
    sampleB.push(valueB);
  });
  if (dropped > 0) messages.push({ kind: "info", title: "Blocos descartados", text: `${dropped} bloco(s) foram descartados por falta de valor valido em pelo menos um dos grupos.` });
  if (sampleA.length < 2 || sampleB.length < 2) messages.push({ kind: "danger", title: "Observacoes insuficientes", text: "O t pareado por bloco precisa de pelo menos 2 pares validos." });
  return { canRun: sampleA.length >= 2 && sampleB.length >= 2, mode: "paired-block", labelA: formatGroupLabel(selectedA), labelB: formatGroupLabel(selectedB), sampleA, sampleB, messages, blockingMessage: sampleA.length >= 2 && sampleB.length >= 2 ? "" : "Ainda nao existem blocos suficientes para o t pareado por bloco.", table: tableRows.length ? { headers: ["Bloco", "Grupo A", "Grupo B"], rows: tableRows } : null, summary: [{ label: "Tipo de teste", value: TEST_TYPE_LABELS["paired-block"] }, { label: "Resumo escolhido", value: AGGREGATION_LABELS[state.aggregationMode] }, { label: "Blocos validos", value: String(sampleA.length) }] };
}

function buildIndependentDataset(state, selectedA, selectedB) {
  const years = resolveYearsForIndependent(state);
  if (!years.length) return { canRun: false, messages: [{ kind: "danger", title: "Sem periodo valido", text: "Nao foi possivel localizar anos suficientes dentro do periodo escolhido." }], blockingMessage: "Ajuste o periodo antes de rodar o t independente." };
  if (state.aggregationMode === "single" && years.length !== 1) return { canRun: false, messages: [{ kind: "warning", title: "Linha unica sem agregar", text: "No t independente, essa opcao exige que o periodo resulte em exatamente um valor por regiao. Escolha um unico ano ou um unico bloco." }], blockingMessage: "Selecione um periodo unitario ou troque o metodo de resumo." };
  const messages = [];
  const derivedA = buildIndependentGroupValues(selectedA, years, state.aggregationMode, "A");
  const derivedB = buildIndependentGroupValues(selectedB, years, state.aggregationMode, "B");
  if (derivedA.dropped || derivedB.dropped) messages.push({ kind: "info", title: "Linhas descartadas", text: `${derivedA.dropped + derivedB.dropped} linha(s) foram descartadas por nao terem valor valido no periodo escolhido.` });
  if (derivedA.values.length < 2 || derivedB.values.length < 2) messages.push({ kind: "danger", title: "Observacoes insuficientes", text: "Cada grupo precisa ter no minimo 2 observacoes validas no modo CSV DATASUS." });
  return { canRun: derivedA.values.length >= 2 && derivedB.values.length >= 2, mode: "independent", labelA: formatGroupLabel(selectedA), labelB: formatGroupLabel(selectedB), sampleA: derivedA.values, sampleB: derivedB.values, messages, blockingMessage: derivedA.values.length >= 2 && derivedB.values.length >= 2 ? "" : "Cada grupo precisa manter pelo menos 2 regioes validas apos o resumo do periodo.", table: derivedA.rows.concat(derivedB.rows).length ? { headers: ["Observacao", "Grupo", "Valor usado no teste"], rows: derivedA.rows.concat(derivedB.rows) } : null, summary: [{ label: "Tipo de teste", value: TEST_TYPE_LABELS.independent }, { label: "Periodo", value: describeIndependentPeriod(state, years) }, { label: "n Grupo A", value: String(derivedA.values.length) }, { label: "n Grupo B", value: String(derivedB.values.length) }] };
}

function buildGroupPointForPaired(rows, years, aggregationMode) {
  if (aggregationMode === "single") {
    if (rows.length !== 1) return null;
    return summarizeRowWithinYears(rows[0], years, years.length === 1 ? "single" : "mean");
  }
  const rowSummaries = rows.map((row) => summarizeRowWithinYears(row, years, years.length === 1 ? "single" : "mean")).filter((value) => value != null);
  if (!rowSummaries.length) return null;
  return aggregationMode === "sum" ? sum(rowSummaries) : mean(rowSummaries);
}

function buildIndependentGroupValues(rows, years, aggregationMode, groupLabel) {
  const result = { rows: [], values: [], dropped: 0 };
  rows.forEach((row) => {
    const value = summarizeRowWithinYears(row, years, aggregationMode);
    if (value == null) {
      result.dropped += 1;
      return;
    }
    result.rows.push([row.label, `Grupo ${groupLabel}`, formatNullableNumber(value)]);
    result.values.push(value);
  });
  return result;
}

function summarizeRowWithinYears(row, years, aggregationMode) {
  const values = years.map((year) => row.values[String(year)]).filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  if (aggregationMode === "single") return values.length === 1 ? values[0] : null;
  if (aggregationMode === "sum") return sum(values);
  return mean(values);
}

function getSelectedYears(state) {
  const years = state.parsed.years.map((item) => item.year);
  return state.periodMode === "range" ? years.filter((year) => year >= state.rangeStart && year <= state.rangeEnd) : years;
}

function resolveYearsForIndependent(state) {
  return state.periodMode === "block" ? getYearsFromSelectedBlock(state) : getSelectedYears(state);
}

function getYearsFromSelectedBlock(state) {
  const block = getBlockOptions(state).find((item) => item.id === state.selectedBlockId);
  return block ? block.years : [];
}

function getBlockOptions(state) {
  if (!state.parsed) return [];
  return createFiveYearBlocks(state.parsed.years.map((item) => item.year));
}

function createFiveYearBlocks(years) {
  if (!Array.isArray(years) || !years.length) return [];
  const sorted = [...years].sort((a, b) => a - b);
  const blocks = [];
  let start = sorted[0];
  const end = sorted[sorted.length - 1];
  while (start <= end) {
    const blockYears = sorted.filter((year) => year >= start && year <= start + 4);
    if (blockYears.length) blocks.push({ id: `${start}-${start + 4}`, label: `${start}-${start + 4}`, years: blockYears });
    start += 5;
  }
  return blocks;
}

function ensureBlockSelection(state) {
  const blocks = getBlockOptions(state);
  if (!blocks.length) {
    state.selectedBlockId = "";
    return;
  }
  if (!blocks.some((block) => block.id === state.selectedBlockId)) state.selectedBlockId = blocks[0].id;
}

function getSelectedRows(state, group) {
  if (!state.parsed) return [];
  const keys = group === "A" ? state.selectedA : state.selectedB;
  return state.parsed.rows.filter((row) => keys.has(row.key));
}

function describeIndependentPeriod(state, years) {
  if (state.periodMode === "block" && state.selectedBlockId) return state.selectedBlockId;
  if (state.periodMode === "range") return `${state.rangeStart} a ${state.rangeEnd}`;
  return years.length ? `${years[0]} a ${years[years.length - 1]}` : "Sem anos";
}

function formatGroupLabel(rows) {
  return rows.map((row) => row.label).join(" + ");
}

function runTTest(derived) {
  return derived.mode === "independent" ? runIndependentTTest(derived) : runPairedTTest(derived);
}

function runPairedTTest(derived) {
  const diffs = derived.sampleA.map((value, index) => value - derived.sampleB[index]);
  const n = diffs.length;
  const meanA = mean(derived.sampleA);
  const meanB = mean(derived.sampleB);
  const meanDifference = mean(diffs);
  const varianceDiff = sampleVariance(diffs);
  const standardError = Math.sqrt(varianceDiff / n);
  if (!Number.isFinite(standardError) || standardError === 0) throw new Error("Nao foi possivel calcular o t pareado porque a variabilidade das diferencas e zero.");
  const t = meanDifference / standardError;
  const df = n - 1;
  const pValue = 2 * (1 - studentTCdf(Math.abs(t), df));
  const critical = inverseStudentT(0.975, df);
  return {
    nLabel: `${n} pares`,
    meanA,
    meanB,
    meanDifference,
    t,
    df,
    pValue,
    ciLow: meanDifference - critical * standardError,
    ciHigh: meanDifference + critical * standardError,
    interpretation: buildInterpretation({ mode: derived.mode, labelA: derived.labelA, labelB: derived.labelB, meanA, meanB, meanDifference, pValue, n }),
    labelA: derived.labelA,
    labelB: derived.labelB,
    chartMax: Math.max(Math.abs(meanA), Math.abs(meanB), 1)
  };
}

function runIndependentTTest(derived) {
  const n1 = derived.sampleA.length;
  const n2 = derived.sampleB.length;
  const meanA = mean(derived.sampleA);
  const meanB = mean(derived.sampleB);
  const varianceA = sampleVariance(derived.sampleA);
  const varianceB = sampleVariance(derived.sampleB);
  const termA = varianceA / n1;
  const termB = varianceB / n2;
  const standardError = Math.sqrt(termA + termB);
  if (!Number.isFinite(standardError) || standardError === 0) throw new Error("Nao foi possivel calcular o t independente porque a variabilidade dos grupos e zero.");
  const meanDifference = meanA - meanB;
  const t = meanDifference / standardError;
  const numerator = (termA + termB) ** 2;
  const denominator = (termA ** 2) / Math.max(n1 - 1, 1) + (termB ** 2) / Math.max(n2 - 1, 1);
  const df = numerator / denominator;
  const critical = inverseStudentT(0.975, df);
  const pValue = 2 * (1 - studentTCdf(Math.abs(t), df));
  return {
    nLabel: `A: ${n1} | B: ${n2}`,
    meanA,
    meanB,
    meanDifference,
    t,
    df,
    pValue,
    ciLow: meanDifference - critical * standardError,
    ciHigh: meanDifference + critical * standardError,
    interpretation: buildInterpretation({ mode: "independent", labelA: derived.labelA, labelB: derived.labelB, meanA, meanB, meanDifference, pValue }),
    labelA: derived.labelA,
    labelB: derived.labelB,
    chartMax: Math.max(Math.abs(meanA), Math.abs(meanB), 1)
  };
}

function buildInterpretation(context) {
  const significance = context.pValue < 0.05 ? "ha evidencia estatisticamente significativa de diferenca" : "nao houve evidencia estatisticamente significativa de diferenca";
  const direction = context.meanDifference > 0 ? `${context.labelA} apresentou media maior que ${context.labelB}` : context.meanDifference < 0 ? `${context.labelB} apresentou media maior que ${context.labelA}` : `${context.labelA} e ${context.labelB} apresentaram medias equivalentes`;
  return context.mode === "independent"
    ? `No t independente entre ${context.labelA} e ${context.labelB}, ${significance} (p = ${formatPValue(context.pValue)}). ${direction}. O grupo A teve media ${formatNullableNumber(context.meanA)} e o grupo B teve media ${formatNullableNumber(context.meanB)}.`
    : `No t pareado entre ${context.labelA} e ${context.labelB}, considerando ${context.n} pares comparaveis, ${significance} (p = ${formatPValue(context.pValue)}). ${direction}.`;
}

function parseDatasusTable(text) {
  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error("O arquivo esta vazio.");
  const headerIndex = detectHeaderIndex(lines);
  if (headerIndex < 0) throw new Error("Nao foi possivel detectar o cabecalho DATASUS. Verifique se o arquivo usa ';' como separador.");
  const headerCells = splitSemicolonLine(lines[headerIndex]);
  const years = [];
  let totalColumn = null;
  headerCells.forEach((cell, index) => {
    const cleaned = normalizeCell(cell);
    if (isYearLabel(cleaned)) years.push({ key: cleaned, year: Number(cleaned), index });
    else if (isTotalLabel(cleaned)) totalColumn = { key: cleaned || "Total", index };
  });
  if (!years.length) throw new Error("Nenhuma coluna de ano foi reconhecida no arquivo.");
  const labelHeader = normalizeCell(headerCells[0]) || "Grupo / Regiao";
  const rows = [];
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const rawCells = splitSemicolonLine(lines[index]);
    const label = normalizeCell(rawCells[0]);
    if (!label) continue;
    const values = {};
    let validYearCount = 0;
    years.forEach((column) => {
      const value = parseDatasusNumber(rawCells[column.index]);
      values[column.key] = value;
      if (value != null) validYearCount += 1;
    });
    if (totalColumn) values[totalColumn.key] = parseDatasusNumber(rawCells[totalColumn.index]);
    if (!validYearCount && (!totalColumn || values[totalColumn.key] == null)) continue;
    rows.push({ key: `${label}-${rows.length}`, label, values, totalValue: totalColumn ? values[totalColumn.key] : null, validYearCount, isTotalRow: isTotalLabel(label) });
  }
  if (!rows.length) throw new Error("Nenhuma linha de dados valida foi reconhecida apos o cabecalho.");
  return { labelHeader, years: years.sort((a, b) => a.year - b.year), totalColumn, rows, isTemporalAggregated: years.length >= 2 };
}

function detectHeaderIndex(lines) {
  let bestIndex = -1;
  let bestScore = -1;
  lines.forEach((line, index) => {
    if (!line.includes(";")) return;
    const cells = splitSemicolonLine(line).map(normalizeCell);
    const yearCount = cells.filter(isYearLabel).length;
    const totalCount = cells.filter(isTotalLabel).length;
    const nonEmptyCount = cells.filter(Boolean).length;
    const labelScore = cells[0] && !isYearLabel(cells[0]) ? 1 : 0;
    const score = yearCount * 5 + totalCount * 2 + nonEmptyCount + labelScore;
    if ((yearCount >= 2 || (yearCount >= 1 && totalCount >= 1)) && score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  });
  return bestIndex;
}

function splitSemicolonLine(line) {
  return String(line || "").split(";").map((cell) => cell.replace(/^"(.*)"$/, "$1").trim());
}

function normalizeCell(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isYearLabel(value) {
  return /^\d{4}$/.test(String(value || "").trim());
}

function isTotalLabel(value) {
  return /^total$/i.test(String(value || "").trim());
}

function parseDatasusNumber(value) {
  const raw = normalizeCell(value);
  if (!raw || raw === "-" || /^na$/i.test(raw)) return null;
  let normalized = raw.replace(/\s+/g, "");
  if (normalized.includes(",")) normalized = normalized.replace(/\./g, "").replace(/,/g, ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(normalized)) normalized = normalized.replace(/\./g, "");
  normalized = normalized.replace(/[^0-9.-]/g, "");
  if (!normalized || normalized === "-" || normalized === ".") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function mean(values) {
  return sum(values) / values.length;
}

function sum(values) {
  return values.reduce((accumulator, value) => accumulator + value, 0);
}

function sampleVariance(values) {
  if (!Array.isArray(values) || values.length < 2) return 0;
  const average = mean(values);
  return sum(values.map((value) => (value - average) ** 2)) / (values.length - 1);
}

function logGamma(z) {
  const coefficients = [676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.507343278686905, -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  let x = 0.9999999999998099;
  const shifted = z - 1;
  coefficients.forEach((coefficient, index) => { x += coefficient / (shifted + index + 1); });
  const t = shifted + coefficients.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(x);
}

function betaContinuedFraction(a, b, x) {
  const maxIterations = 200;
  const epsilon = 3e-7;
  const tiny = 1e-30;
  let qab = a + b;
  let qap = a + 1;
  let qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIterations; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < epsilon) break;
  }
  return h;
}

function regularizedIncompleteBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (bt * betaContinuedFraction(a, b, x)) / a;
  return 1 - (bt * betaContinuedFraction(b, a, 1 - x)) / b;
}

function studentTCdf(t, df) {
  if (!Number.isFinite(t)) return t > 0 ? 1 : 0;
  const x = df / (df + t * t);
  const ib = regularizedIncompleteBeta(x, df / 2, 0.5);
  return t >= 0 ? 1 - 0.5 * ib : 0.5 * ib;
}

function inverseStudentT(probability, df) {
  if (probability <= 0 || probability >= 1) throw new Error("A probabilidade deve estar entre 0 e 1.");
  let low = -20;
  let high = 20;
  while (studentTCdf(high, df) < probability) high *= 2;
  while (studentTCdf(low, df) > probability) low *= 2;
  for (let iteration = 0; iteration < 120; iteration += 1) {
    const mid = (low + high) / 2;
    const cdf = studentTCdf(mid, df);
    if (cdf < probability) low = mid; else high = mid;
  }
  return (low + high) / 2;
}

function formatNullableNumber(value) {
  return Number.isFinite(value) ? PT_NUMBER.format(value) : "NA";
}

function formatPValue(value) {
  if (!Number.isFinite(value)) return "NA";
  return value < 0.0001 ? "< 0,0001" : PT_NUMBER.format(value);
}

function escapeMarkup(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeMarkup(value).replace(/"/g, "&quot;");
}
