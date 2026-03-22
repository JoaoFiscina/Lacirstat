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

// __MODULE_PART_2__
