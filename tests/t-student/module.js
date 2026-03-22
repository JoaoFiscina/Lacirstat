const PT_NUMBER = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4
});

const DEFAULT_MANUAL_LABEL_A = "Grupo A";
const DEFAULT_MANUAL_LABEL_B = "Grupo B";

const DEFAULT_DATASUS_SERIES = {
  "1 Regiao Norte": [7.1, 7.2, 7.4, 7.6, 7.8, 7.7, 7.6, 7.5, 7.4, 7.3, 7.2, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8],
  "2 Regiao Nordeste": [4.0, 4.1, 4.0, 4.2, 4.1, 4.2, 4.1, 4.0, 4.1, 4.2, 4.3, 4.2, 4.1, 4.2, 4.2, 4.3, 4.3, 4.4, 4.4],
  "3 Regiao Sudeste": [5.0, 5.1, 5.1, 5.0, 5.2, 5.1, 5.0, 5.1, 5.2, 5.2, 5.3, 5.2, 5.1, 5.2, 5.3, 5.3, 5.4, 5.4, 5.5],
  "4 Regiao Sul": [4.7, 4.8, 4.8, 4.7, 4.7, 4.8, 4.8, 4.9, 4.8, 4.8, 4.9, 4.9, 4.8, 4.9, 4.9, 5.0, 5.0, 5.0, 5.1],
  "5 Regiao Centro-Oeste": [4.6, 4.7, 4.7, 4.6, 4.7, 4.7, 4.8, 4.8, 4.7, 4.8, 4.8, 4.9, 4.8, 4.9, 4.9, 5.0, 5.0, 5.1, 5.1]
};

export async function renderTestModule(ctx) {
  const { root, config, utils } = ctx;
  const state = createInitialState(config);

  root.innerHTML = `
    <div class="t-module">
      <section class="t-panel t-panel-hero">
        <div class="t-panel-hero-copy">
          <span class="t-eyebrow">t de Student</span>
          <h3>${utils.escapeHtml(config.title || "t de Student")}</h3>
          <p>${utils.escapeHtml(
            config.description ||
              "Compare dois grupos por entrada manual ou por importacao de arquivo DATASUS tabulado."
          )}</p>
        </div>
        <div class="t-guide-list">
          ${(config.inputGuide || []).map((item) => `<span class="t-guide-pill">${utils.escapeHtml(item)}</span>`).join("")}
        </div>
      </section>

      <div class="mode-tabs" role="tablist" aria-label="Modo de entrada">
        <button type="button" class="mode-tab" data-action="switch-mode" data-mode="manual">Modo manual</button>
        <button type="button" class="mode-tab" data-action="switch-mode" data-mode="datasus">Importar CSV DATASUS</button>
      </div>

      <input id="datasus-file-input" type="file" accept=".csv,.txt,.tsv,text/csv,text/tab-separated-values" hidden />

      <section id="manual-panel" class="mode-panel"></section>
      <section id="datasus-panel" class="mode-panel"></section>
    </div>
  `;

  const refs = {
    fileInput: root.querySelector("#datasus-file-input"),
    manualPanel: root.querySelector("#manual-panel"),
    datasusPanel: root.querySelector("#datasus-panel"),
    tabs: Array.from(root.querySelectorAll(".mode-tab"))
  };

  root.addEventListener("input", (event) => {
    const target = event.target;

    if (target.dataset.manualField) {
      state.manual[target.dataset.manualField] = target.value;
    }
  });

  root.addEventListener("change", async (event) => {
    const target = event.target;

    if (target === refs.fileInput) {
      const [file] = Array.from(target.files || []);

      if (!file) {
        return;
      }

      await importDatasusFile(file, state.datasus);
      refs.fileInput.value = "";
      renderAll(refs, state, config);
      return;
    }

    if (target.dataset.datasusField) {
      updateDatasusField(state.datasus, target.dataset.datasusField, target);
      state.datasus.result = null;
      renderAll(refs, state, config);
      return;
    }

    if (target.dataset.role === "datasus-group") {
      toggleDatasusRegion(state.datasus, target.dataset.group, target.dataset.rowKey, target.checked);
      state.datasus.result = null;
      renderAll(refs, state, config);
    }
  });

  root.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");

    if (!button) {
      return;
    }

    if (button.dataset.action === "switch-mode") {
      state.activeMode = button.dataset.mode;
      renderAll(refs, state, config);
      return;
    }

    if (button.dataset.action === "manual-clear") {
      state.manual = createManualState(config);
      renderAll(refs, state, config);
      return;
    }

    if (button.dataset.action === "manual-example") {
      loadManualExample(state.manual, config);
      renderAll(refs, state, config);
      return;
    }

    if (button.dataset.action === "manual-run") {
      runManualMode(state.manual);
      renderAll(refs, state, config);
      return;
    }

    if (button.dataset.action === "datasus-upload") {
      refs.fileInput.click();
      return;
    }

    if (button.dataset.action === "datasus-example") {
      loadDatasusFromText(buildDatasusExampleText(), "exemplo-datasus.csv", state.datasus);
      renderAll(refs, state, config);
      return;
    }

    if (button.dataset.action === "datasus-clear") {
      state.datasus = createDatasusState();
      refs.fileInput.value = "";
      renderAll(refs, state, config);
      return;
    }

    if (button.dataset.action === "datasus-run") {
      runDatasusMode(state.datasus);
      renderAll(refs, state, config);
    }
  });

  renderAll(refs, state, config);
}

function createInitialState(config) {
  return {
    activeMode: "manual",
    manual: createManualState(config),
    datasus: createDatasusState()
  };
}

function createManualState(config) {
  return {
    groupALabel: DEFAULT_MANUAL_LABEL_A,
    groupBLabel: DEFAULT_MANUAL_LABEL_B,
    groupAText: "",
    groupBText: "",
    notice: null,
    result: null,
    placeholders: {
      groupA: Array.isArray(config?.example?.group1) ? config.example.group1.join("\n") : "4,8\n5,1\n4,9",
      groupB: Array.isArray(config?.example?.group2) ? config.example.group2.join("\n") : "6,1\n5,8\n6,0"
    }
  };
}

function createDatasusState() {
  return {
    imported: null,
    fileName: "",
    notice: null,
    showTotalRow: false,
    selectedGroupA: new Set(),
    selectedGroupB: new Set(),
    periodMode: "range",
    singleYear: "",
    rangeStart: "",
    rangeEnd: "",
    selectedBlockId: "",
    result: null
  };
}

function renderAll(refs, state, config) {
  const manualPreview = buildManualPreview(state.manual);
  const datasusDerived = buildDatasusDerived(state.datasus);

  refs.tabs.forEach((tab) => {
    const isActive = tab.dataset.mode === state.activeMode;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  refs.manualPanel.classList.toggle("is-hidden", state.activeMode !== "manual");
  refs.datasusPanel.classList.toggle("is-hidden", state.activeMode !== "datasus");

  refs.manualPanel.innerHTML = renderManualMode(state.manual, manualPreview);
  refs.datasusPanel.innerHTML = renderDatasusMode(state.datasus, datasusDerived);
}

function renderManualMode(manual, preview) {
  return `
    <div class="mode-stack">
      <section class="t-panel">
        <div class="t-section-head">
          <div>
            <span class="t-step">Modo Manual</span>
            <h4>Colagem direta dos grupos</h4>
            <p>Digite ou cole um valor por linha. Tambem funciona com colunas coladas do Excel.</p>
          </div>
          <div class="t-toolbar">
            <button type="button" class="button button-secondary" data-action="manual-example">Usar exemplo</button>
            <button type="button" class="button button-secondary" data-action="manual-clear">Limpar</button>
            <button type="button" class="button" data-action="manual-run">Rodar t test</button>
          </div>
        </div>

        ${manual.notice ? renderNotice(manual.notice) : ""}

        <div class="manual-grid">
          <label class="field">
            <span>Nome do Grupo A</span>
            <input type="text" value="${escapeMarkup(manual.groupALabel)}" data-manual-field="groupALabel" />
          </label>
          <label class="field">
            <span>Nome do Grupo B</span>
            <input type="text" value="${escapeMarkup(manual.groupBLabel)}" data-manual-field="groupBLabel" />
          </label>
        </div>

        <div class="manual-grid">
          <label class="field">
            <span>Valores do Grupo A</span>
            <textarea rows="10" data-manual-field="groupAText" placeholder="${escapeAttribute(manual.placeholders.groupA)}">${escapeMarkup(manual.groupAText)}</textarea>
          </label>
          <label class="field">
            <span>Valores do Grupo B</span>
            <textarea rows="10" data-manual-field="groupBText" placeholder="${escapeAttribute(manual.placeholders.groupB)}">${escapeMarkup(manual.groupBText)}</textarea>
          </label>
        </div>
      </section>

      <section class="t-panel">
        <div class="t-section-head">
          <div>
            <span class="t-step">Previa</span>
            <h4>Vetores manuais detectados</h4>
            <p>Revise a contagem de observacoes antes de executar o teste.</p>
          </div>
        </div>
        ${renderManualPreview(preview, manual)}
      </section>

      <section class="t-panel">
        <div class="t-section-head">
          <div>
            <span class="t-step">Resultado</span>
            <h4>Saida estatistica</h4>
            <p>O modulo usa comparacao entre duas medias com ajuste de Welch.</p>
          </div>
        </div>
        ${manual.result ? renderResultBlock(manual.result) : renderEmptyCard("Resultado aguardando execucao", "Preencha os dois grupos e clique em Rodar t test.")}
      </section>
    </div>
  `;
}

function renderManualPreview(preview, manual) {
  if (!preview.hasAnyInput) {
    return renderEmptyCard("Sem dados manuais", "Cole os valores dos grupos ou use o exemplo para preencher o modulo.");
  }

  const rows = preview.groupA.values
    .map((value, index) => [String(index + 1), manual.groupALabel || DEFAULT_MANUAL_LABEL_A, formatNumber(value)])
    .concat(
      preview.groupB.values.map((value, index) => [
        String(index + 1),
        manual.groupBLabel || DEFAULT_MANUAL_LABEL_B,
        formatNumber(value)
      ])
    );

  return `
    <div class="summary-grid">
      <div class="summary-card">
        <span class="summary-label">Grupo A</span>
        <strong>${preview.groupA.values.length} observacoes</strong>
        <p>${preview.groupA.invalid.length ? `${preview.groupA.invalid.length} item(ns) ignorado(s).` : "Nenhum item invalido."}</p>
      </div>
      <div class="summary-card">
        <span class="summary-label">Grupo B</span>
        <strong>${preview.groupB.values.length} observacoes</strong>
        <p>${preview.groupB.invalid.length ? `${preview.groupB.invalid.length} item(ns) ignorado(s).` : "Nenhum item invalido."}</p>
      </div>
    </div>
    ${rows.length ? renderSimpleTable(["#", "Grupo", "Valor"], rows) : renderEmptyCard("Nenhum valor valido", "Os campos ainda nao geraram observacoes numericas validas.")}
  `;
}

function renderDatasusMode(datasus, derived) {
  return `
    <div class="mode-stack">
      <section class="t-panel">
        <div class="t-section-head">
          <div>
            <span class="t-step">Importacao DATASUS</span>
            <h4>CSV ou TSV tabulado</h4>
            <p>O parser tenta <code>;</code>, depois tab e depois virgula. Metadados iniciais sao ignorados ate o cabecalho real.</p>
          </div>
          <div class="t-toolbar">
            <button type="button" class="button" data-action="datasus-upload">Importar CSV DATASUS</button>
            <button type="button" class="button button-secondary" data-action="datasus-example">Carregar exemplo DATASUS</button>
            <button type="button" class="button button-secondary" data-action="datasus-clear">Limpar tudo</button>
          </div>
        </div>
        ${datasus.notice ? renderNotice(datasus.notice) : ""}
        ${renderDatasusStatus(datasus)}
      </section>

      <section class="t-panel">
        <div class="t-section-head">
          <div>
            <span class="t-step">Base bruta</span>
            <h4>Pre-visualizacao do arquivo importado</h4>
            <p>Confirme as regioes, os anos detectados e a leitura do formato original.</p>
          </div>
        </div>
        ${renderDatasusRawPreview(datasus)}
      </section>

      <section class="t-panel">
        <div class="t-section-head">
          <div>
            <span class="t-step">Grupos</span>
            <h4>Selecao das regioes</h4>
            <p>Cada regiao pode pertencer a apenas um grupo por vez. A linha Total fica oculta por padrao.</p>
          </div>
        </div>
        ${renderDatasusSelection(datasus)}
      </section>

      <section class="t-panel">
        <div class="t-section-head">
          <div>
            <span class="t-step">Periodo</span>
            <h4>Configuracao da analise</h4>
            <p>O periodo apenas resume os anos dentro de cada regiao. As regioes continuam como observacoes separadas.</p>
          </div>
          <button type="button" class="button" data-action="datasus-run">Rodar t test</button>
        </div>
        ${renderDatasusPeriodControls(datasus, derived)}
      </section>

      <section class="t-panel">
        <div class="t-section-head">
          <div>
            <span class="t-step">Base derivada</span>
            <h4>Tabela usada no t test</h4>
            <p>Audite visualmente os valores resumidos por regiao antes da execucao.</p>
          </div>
        </div>
        ${renderDatasusDerived(derived)}
      </section>

      <section class="t-panel">
        <div class="t-section-head">
          <div>
            <span class="t-step">Resultado</span>
            <h4>Saida estatistica</h4>
            <p>O teste e executado apenas quando os vetores finais possuem pelo menos 2 observacoes validas em cada grupo.</p>
          </div>
        </div>
        ${datasus.result ? renderResultBlock(datasus.result) : renderEmptyCard("Resultado aguardando execucao", "Monte os grupos, escolha o periodo e clique em Rodar t test.")}
      </section>
    </div>
  `;
}
