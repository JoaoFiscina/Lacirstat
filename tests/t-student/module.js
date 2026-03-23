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
    studyQuestion: "As medias dos dois grupos sao diferentes?",
    alpha: "0.05",
    rawText: "",
    notice: null,
    result: null,
    placeholder: buildManualExampleText(config)
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
            <h4>Entrada de dados</h4>
            <p>Mantenha a colagem manual do modulo com duas colunas numericas ou com pares grupo + valor.</p>
          </div>
          <div class="t-toolbar">
            <button type="button" class="button button-secondary" data-action="manual-example">Carregar exemplo</button>
            <button type="button" class="button button-secondary" data-action="manual-clear">Limpar</button>
            <button type="button" class="button" data-action="manual-run">Rodar analise</button>
          </div>
        </div>

        ${manual.notice ? renderNotice(manual.notice) : ""}

        <div class="manual-grid">
          <label class="field">
            <span>Pergunta do estudo</span>
            <input type="text" value="${escapeMarkup(manual.studyQuestion)}" data-manual-field="studyQuestion" />
          </label>
          <label class="field">
            <span>Nivel de significancia</span>
            <select data-manual-field="alpha">
              ${[
                ["0.01", "1%"],
                ["0.05", "5%"],
                ["0.10", "10%"]
              ].map(([value, label]) => `<option value="${value}"${manual.alpha === value ? " selected" : ""}>${label}</option>`).join("")}
            </select>
          </label>
        </div>

        <label class="field">
          <span>Cole seus dados</span>
          <textarea rows="10" data-manual-field="rawText" placeholder="${escapeAttribute(manual.placeholder)}">${escapeMarkup(manual.rawText)}</textarea>
        </label>
        <p class="hint-text">Formatos aceitos: duas colunas numericas (Grupo 1 e Grupo 2) ou coluna de grupo + coluna numerica (ex.: Controle;5,2).</p>
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

  const rows = preview.entries.map((entry, index) => [String(index + 1), entry.groupLabel, formatNumber(entry.value)]);

  return `
    <div class="summary-grid">
      <div class="summary-card">
        <span class="summary-label">${escapeMarkup(preview.groupA.label)}</span>
        <strong>${preview.groupA.values.length} observacoes</strong>
        <p>${preview.groupA.invalid.length ? `${preview.groupA.invalid.length} item(ns) ignorado(s).` : "Nenhum item invalido."}</p>
      </div>
      <div class="summary-card">
        <span class="summary-label">${escapeMarkup(preview.groupB.label)}</span>
        <strong>${preview.groupB.values.length} observacoes</strong>
        <p>${preview.groupB.invalid.length ? `${preview.groupB.invalid.length} item(ns) ignorado(s).` : "Nenhum item invalido."}</p>
      </div>
      <div class="summary-card">
        <span class="summary-label">Formato detectado</span>
        <strong>${escapeMarkup(preview.formatLabel)}</strong>
        <p>${escapeMarkup(preview.detailText)}</p>
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

function renderDatasusStatus(datasus) {
  if (!datasus.imported) {
    return renderEmptyCard("Nenhum arquivo DATASUS carregado", "Importe um arquivo .csv, .txt ou .tsv para habilitar a leitura automatica.");
  }

  const imported = datasus.imported;
  const regionCount = imported.rows.filter((row) => !row.isTotalRow).length;
  const yearLabel = imported.years.length
    ? `${imported.years[0]} a ${imported.years[imported.years.length - 1]}`
    : "Sem anos";

  return `
    <div class="summary-grid">
      <div class="summary-card">
        <span class="summary-label">Arquivo</span>
        <strong>${escapeMarkup(datasus.fileName)}</strong>
        <p>${escapeMarkup(imported.separatorLabel)}</p>
      </div>
      <div class="summary-card">
        <span class="summary-label">Regioes detectadas</span>
        <strong>${regionCount}</strong>
        <p>${imported.totalRow ? "Linha Total reconhecida." : "Sem linha Total."}</p>
      </div>
      <div class="summary-card">
        <span class="summary-label">Anos detectados</span>
        <strong>${escapeMarkup(yearLabel)}</strong>
        <p>${imported.years.length} coluna(s) anuais.</p>
      </div>
      <div class="summary-card">
        <span class="summary-label">Medida detectada</span>
        <strong>${escapeMarkup(imported.detectedMeasure || imported.detectedTitle || "Nao identificada")}</strong>
        <p>${imported.metadataLines.length ? escapeMarkup(imported.metadataLines[0]) : "Sem metadados adicionais."}</p>
      </div>
    </div>
  `;
}

function renderDatasusRawPreview(datasus) {
  if (!datasus.imported) {
    return renderEmptyCard("Previa indisponivel", "A tabela bruta aparece depois que o arquivo DATASUS e reconhecido.");
  }

  const imported = datasus.imported;
  const headers = [imported.labelHeader]
    .concat(imported.years)
    .concat(imported.totalColumn ? [imported.totalColumn] : []);
  const rows = imported.rows.slice(0, 8).map((row) => {
    const values = imported.years.map((year) => formatNullableNumber(row.valuesByYear[year]));
    const totalCell = imported.totalColumn ? [formatNullableNumber(row.totalValue)] : [];
    return [row.rowLabel].concat(values, totalCell);
  });

  return `
    ${imported.metadataLines.length ? `<div class="metadata-card">${imported.metadataLines.map((line) => `<p>${escapeMarkup(line)}</p>`).join("")}</div>` : ""}
    ${renderSimpleTable(headers, rows, imported.rows.length > rows.length ? `Mostrando ${rows.length} das ${imported.rows.length} linhas reconhecidas.` : "")}
  `;
}

function renderDatasusSelection(datasus) {
  if (!datasus.imported) {
    return renderEmptyCard("Selecao indisponivel", "Importe um arquivo para listar as regioes detectadas.");
  }

  const selectableRows = getSelectableRows(datasus);

  return `
    <div class="selection-toolbar">
      <label class="inline-check">
        <input type="checkbox" data-datasus-field="showTotalRow"${datasus.showTotalRow ? " checked" : ""} />
        <span>Mostrar linha Total (opcao avancada)</span>
      </label>
    </div>
    <div class="summary-grid">
      <div class="summary-card">
        <span class="summary-label">Grupo A</span>
        <strong>${datasus.selectedGroupA.size} selecionada(s)</strong>
        <p>${escapeMarkup(getSelectedRowNames(datasus, "A").join(", ") || "Nenhuma regiao selecionada.")}</p>
      </div>
      <div class="summary-card">
        <span class="summary-label">Grupo B</span>
        <strong>${datasus.selectedGroupB.size} selecionada(s)</strong>
        <p>${escapeMarkup(getSelectedRowNames(datasus, "B").join(", ") || "Nenhuma regiao selecionada.")}</p>
      </div>
    </div>
    ${renderSimpleTable(
      ["Regiao", "Grupo A", "Grupo B", "Anos validos", "Total"],
      selectableRows.map((row) => [
        row.rowLabel,
        renderCheckboxCell("A", row, datasus.selectedGroupA.has(row.key)),
        renderCheckboxCell("B", row, datasus.selectedGroupB.has(row.key)),
        String(row.validYears.length),
        formatNullableNumber(row.totalValue)
      ]),
      "",
      true
    )}
  `;
}

function renderCheckboxCell(group, row, checked) {
  return `
    <label class="checkbox-chip">
      <input type="checkbox" data-role="datasus-group" data-group="${group}" data-row-key="${escapeAttribute(row.key)}"${checked ? " checked" : ""} />
      <span>${group}</span>
    </label>
  `;
}

function renderDatasusPeriodControls(datasus, derived) {
  if (!datasus.imported) {
    return renderEmptyCard("Periodo indisponivel", "As opcoes de periodo aparecem apos a importacao do arquivo.");
  }

  const imported = datasus.imported;

  return `
    <div class="control-grid">
      <div class="control-card">
        <span class="summary-label">Periodo</span>
        <div class="option-stack">
          ${renderRadioControl("periodMode", "single", datasus.periodMode, "Ano unico")}
          ${renderRadioControl("periodMode", "range", datasus.periodMode, "Intervalo customizado")}
          ${renderRadioControl("periodMode", "block", datasus.periodMode, "Blocos de 5 anos")}
        </div>
      </div>
      <div class="control-card">
        <span class="summary-label">Detalhe do periodo</span>
        ${renderDatasusPeriodDetail(datasus, imported)}
        <p class="hint-text">Resumo aplicado: ${escapeMarkup(derived.summaryType || "Media por regiao no periodo")}</p>
      </div>
    </div>
    ${derived.blockNotices.map((notice) => renderNotice(notice)).join("")}
  `;
}

function renderDatasusPeriodDetail(datasus, imported) {
  if (datasus.periodMode === "single") {
    return `
      <label class="field field-inline">
        <span>Ano</span>
        <select data-datasus-field="singleYear">
          ${imported.years.map((year) => `<option value="${year}"${String(year) === String(datasus.singleYear) ? " selected" : ""}>${year}</option>`).join("")}
        </select>
      </label>
    `;
  }

  if (datasus.periodMode === "block") {
    return `
      <label class="field field-inline">
        <span>Bloco</span>
        <select data-datasus-field="selectedBlockId">
          ${imported.blocks.map((block) => `<option value="${block.id}"${block.id === datasus.selectedBlockId ? " selected" : ""}>${escapeMarkup(block.label)}</option>`).join("")}
        </select>
      </label>
    `;
  }

  return `
    <div class="manual-grid">
      <label class="field field-inline">
        <span>Ano inicial</span>
        <select data-datasus-field="rangeStart">
          ${imported.years.map((year) => `<option value="${year}"${String(year) === String(datasus.rangeStart) ? " selected" : ""}>${year}</option>`).join("")}
        </select>
      </label>
      <label class="field field-inline">
        <span>Ano final</span>
        <select data-datasus-field="rangeEnd">
          ${imported.years.map((year) => `<option value="${year}"${String(year) === String(datasus.rangeEnd) ? " selected" : ""}>${year}</option>`).join("")}
        </select>
      </label>
    </div>
  `;
}

function renderDatasusDerived(derived) {
  const notices = derived.messages.map((message) => renderNotice(message)).join("");

  if (!derived.hasImportedData) {
    return `${notices}${renderEmptyCard("Base derivada indisponivel", "Importe o arquivo e selecione as regioes para montar os vetores do teste.")}`;
  }

  const summary = derived.entries.length
    ? `
      <div class="summary-grid">
        <div class="summary-card">
          <span class="summary-label">Periodo analisado</span>
          <strong>${escapeMarkup(derived.periodLabel || "Nao definido")}</strong>
          <p>${escapeMarkup(derived.summaryType)}</p>
        </div>
        <div class="summary-card">
          <span class="summary-label">Grupo A</span>
          <strong>${derived.groupAEntries.length} observacao(oes)</strong>
          <p>${escapeMarkup(derived.groupAEntries.map((entry) => entry.rowLabel).join(", ") || "Nenhuma.")}</p>
        </div>
        <div class="summary-card">
          <span class="summary-label">Grupo B</span>
          <strong>${derived.groupBEntries.length} observacao(oes)</strong>
          <p>${escapeMarkup(derived.groupBEntries.map((entry) => entry.rowLabel).join(", ") || "Nenhuma.")}</p>
        </div>
      </div>
    `
    : "";

  const groupLists = derived.entries.length
    ? `
      <div class="derived-grid">
        <div class="summary-card">
          <span class="summary-label">Grupo A</span>
          <ul class="derived-list">
            ${derived.groupAEntries.map((entry) => `<li>${escapeMarkup(entry.rowLabel)} -> ${formatNumber(entry.value)}</li>`).join("")}
          </ul>
        </div>
        <div class="summary-card">
          <span class="summary-label">Grupo B</span>
          <ul class="derived-list">
            ${derived.groupBEntries.map((entry) => `<li>${escapeMarkup(entry.rowLabel)} -> ${formatNumber(entry.value)}</li>`).join("")}
          </ul>
        </div>
      </div>
    `
    : "";

  const table = derived.entries.length
    ? renderSimpleTable(["Regiao", "Grupo", "Valor resumido"], derived.entries.map((entry) => [entry.rowLabel, entry.groupLabel, formatNumber(entry.value)]))
    : renderEmptyCard("Base derivada ainda vazia", derived.blockingMessage || "Selecione grupos e periodo para gerar a tabela final.");

  return `${notices}${summary}${groupLists}${table}`;
}

function renderResultBlock(result) {
  const stats = [
    ["n Grupo A", String(result.nA)],
    ["n Grupo B", String(result.nB)],
    ["Media Grupo A", formatNumber(result.meanA)],
    ["Media Grupo B", formatNumber(result.meanB)],
    ["DP Grupo A", formatNumber(result.sdA)],
    ["DP Grupo B", formatNumber(result.sdB)],
    ["Diferenca", formatNumber(result.meanDifference)],
    ["t", formatNumber(result.t)],
    ["gl", formatNumber(result.df)],
    ["p-valor", formatPValue(result.pValue)],
    [result.confidenceLabel || "IC95%", `${formatNumber(result.ciLow)} a ${formatNumber(result.ciHigh)}`],
    ["Tamanho de efeito", result.effectSize == null ? "NA" : formatNumber(result.effectSize)]
  ];

  return `
    <div class="stat-grid">
      ${stats.map(([label, value]) => `<div class="stat-card"><span class="summary-label">${escapeMarkup(label)}</span><strong>${escapeMarkup(value)}</strong></div>`).join("")}
    </div>
    <div class="notice notice-info">
      <strong>Interpretacao automatica</strong>
      <p>${escapeMarkup(result.interpretation)}</p>
    </div>
    <div class="chart-card">
      <h5>Comparacao visual das medias</h5>
      <div class="chart-bars">
        ${renderChartRow(result.labelA, result.meanA, result.chartMax)}
        ${renderChartRow(result.labelB, result.meanB, result.chartMax)}
      </div>
    </div>
  `;
}

function renderChartRow(label, value, maxValue) {
  const width = maxValue > 0 ? Math.max((Math.abs(value) / maxValue) * 100, 4) : 4;

  return `
    <div class="chart-row">
      <div class="chart-copy">
        <strong>${escapeMarkup(label)}</strong>
        <span>${formatNumber(value)}</span>
      </div>
      <div class="chart-track">
        <div class="chart-fill" style="width:${width.toFixed(2)}%"></div>
      </div>
    </div>
  `;
}

function renderSimpleTable(headers, rows, note = "", allowHtmlCells = false) {
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>${headers.map((header) => `<th>${escapeMarkup(header)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              ${row.map((cell, index) => {
                const openTag = index === 0 ? "<th scope=\"row\">" : "<td>";
                const closeTag = index === 0 ? "</th>" : "</td>";
                const content = allowHtmlCells && /<[^>]+>/.test(String(cell)) ? String(cell) : escapeMarkup(cell);
                return `${openTag}${content}${closeTag}`;
              }).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    ${note ? `<p class="hint-text">${escapeMarkup(note)}</p>` : ""}
  `;
}

function renderNotice(message) {
  return `
    <div class="notice notice-${message.kind}">
      <strong>${escapeMarkup(message.title || "Aviso")}</strong>
      <p>${escapeMarkup(message.text)}</p>
    </div>
  `;
}

function renderEmptyCard(title, text) {
  return `
    <div class="empty-card">
      <h5>${escapeMarkup(title)}</h5>
      <p>${escapeMarkup(text)}</p>
    </div>
  `;
}

function renderRadioControl(field, value, selectedValue, label) {
  return `
    <label class="option-pill">
      <input type="radio" name="${field}" value="${value}" data-datasus-field="${field}"${value === selectedValue ? " checked" : ""} />
      <span>${escapeMarkup(label)}</span>
    </label>
  `;
}

function loadManualExample(manual, config) {
  manual.studyQuestion = "As medias dos dois grupos sao diferentes?";
  manual.alpha = "0.05";
  manual.rawText = buildManualExampleText(config);
  manual.notice = {
    kind: "info",
    title: "Exemplo carregado",
    text: "O modo manual foi preenchido com um exemplo em duas colunas para manter o fluxo original."
  };
  manual.result = null;
}

function buildManualPreview(manual) {
  return parseManualDataset(manual.rawText);
}

function runManualMode(manual) {
  const preview = buildManualPreview(manual);
  const labelA = preview.groupA.label || DEFAULT_MANUAL_LABEL_A;
  const labelB = preview.groupB.label || DEFAULT_MANUAL_LABEL_B;
  const alpha = Number(manual.alpha) || 0.05;

  if (preview.error) {
    manual.notice = {
      kind: "danger",
      title: "Leitura manual invalida",
      text: preview.error
    };
    manual.result = null;
    return;
  }

  if (preview.groupA.values.length < 2 || preview.groupB.values.length < 2) {
    manual.notice = {
      kind: "danger",
      title: "Observacoes insuficientes",
      text: "Informe pelo menos 2 valores validos em cada grupo para executar o t test."
    };
    manual.result = null;
    return;
  }

  manual.notice = preview.groupA.invalid.length || preview.groupB.invalid.length
    ? {
        kind: "warning",
        title: "Itens ignorados",
        text: "Algumas entradas nao numericas foram ignoradas durante a leitura manual."
      }
    : null;

  manual.result = runWelchTTest(preview.groupA.values, preview.groupB.values, {
    labelA,
    labelB,
    alpha,
    interpretation: (stats) => buildManualInterpretation(stats, labelA, labelB, manual.studyQuestion, alpha)
  });
}

function parseManualDataset(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const emptyResult = {
    hasAnyInput: lines.length > 0,
    formatLabel: "Nao reconhecido",
    detailText: "Cole os dados para detectar automaticamente o formato.",
    groupA: { label: DEFAULT_MANUAL_LABEL_A, values: [], invalid: [] },
    groupB: { label: DEFAULT_MANUAL_LABEL_B, values: [], invalid: [] },
    entries: [],
    error: ""
  };

  if (!lines.length) {
    return emptyResult;
  }

  const rows = lines
    .map((line) => splitManualLine(line))
    .filter((parts) => parts.length > 0);

  const groupedPreview = tryParseManualGroupedRows(rows);

  if (groupedPreview) {
    return groupedPreview;
  }

  const columnPreview = tryParseManualTwoColumnRows(rows);

  if (columnPreview) {
    return columnPreview;
  }

  return {
    ...emptyResult,
    error: "Nao foi possivel interpretar a colagem manual. Use duas colunas numericas ou pares no formato Grupo;Valor.",
    detailText: "Formato manual nao reconhecido."
  };
}

function looksLikeSingleLocaleNumber(value) {
  const trimmed = String(value || "").trim();
  return /^[-+]?\d{1,3}(\.\d{3})*(,\d+)?$/.test(trimmed) || /^[-+]?\d+(,\d+)?$/.test(trimmed);
}

function splitManualLine(line) {
  const trimmed = String(line || "").trim();

  if (!trimmed) {
    return [];
  }

  if (trimmed.includes("\t")) {
    return trimmed.split(/\t+/).map((part) => cleanCell(part)).filter(Boolean);
  }

  if (trimmed.includes(";")) {
    return trimmed.split(";").map((part) => cleanCell(part)).filter(Boolean);
  }

  if (/\s{2,}/.test(trimmed)) {
    return trimmed.split(/\s{2,}/).map((part) => cleanCell(part)).filter(Boolean);
  }

  if (trimmed.includes("|")) {
    return trimmed.split("|").map((part) => cleanCell(part)).filter(Boolean);
  }

  return [trimmed];
}

function tryParseManualGroupedRows(rows) {
  const groupedValues = new Map();
  const invalid = [];
  let startIndex = 0;

  if (
    rows[0]?.length >= 2 &&
    normalizeForCompare(rows[0][0]).startsWith("grupo") &&
    normalizeForCompare(rows[0][1]).startsWith("valor")
  ) {
    startIndex = 1;
  }

  for (let index = startIndex; index < rows.length; index += 1) {
    const row = rows[index];

    if (row.length < 2) {
      continue;
    }

    const groupLabel = cleanCell(row[0]);
    const value = parseLocaleNumber(row[row.length - 1]);

    if (!groupLabel || value == null) {
      invalid.push(row.join(" "));
      continue;
    }

    if (!groupedValues.has(groupLabel)) {
      groupedValues.set(groupLabel, []);
    }

    groupedValues.get(groupLabel).push(value);
  }

  if (groupedValues.size !== 2) {
    return null;
  }

  const [labelA, labelB] = Array.from(groupedValues.keys());
  const valuesA = groupedValues.get(labelA) || [];
  const valuesB = groupedValues.get(labelB) || [];

  return {
    hasAnyInput: true,
    formatLabel: "Grupo + valor",
    detailText: "Leitura por pares no formato grupo e valor numerico.",
    groupA: { label: labelA, values: valuesA, invalid: invalid.filter((item) => item.includes(labelA)) },
    groupB: { label: labelB, values: valuesB, invalid: invalid.filter((item) => item.includes(labelB)) },
    entries: valuesA.map((value) => ({ groupLabel: labelA, value })).concat(valuesB.map((value) => ({ groupLabel: labelB, value }))),
    error: ""
  };
}

function tryParseManualTwoColumnRows(rows) {
  const valuesA = [];
  const valuesB = [];
  const invalidA = [];
  const invalidB = [];
  let labelA = DEFAULT_MANUAL_LABEL_A;
  let labelB = DEFAULT_MANUAL_LABEL_B;
  let startIndex = 0;

  if (rows[0]?.length >= 2) {
    const firstA = parseLocaleNumber(rows[0][0]);
    const firstB = parseLocaleNumber(rows[0][1]);

    if (firstA == null && firstB == null) {
      labelA = cleanCell(rows[0][0]) || DEFAULT_MANUAL_LABEL_A;
      labelB = cleanCell(rows[0][1]) || DEFAULT_MANUAL_LABEL_B;
      startIndex = 1;
    }
  }

  for (let index = startIndex; index < rows.length; index += 1) {
    const row = rows[index];

    if (row.length < 2) {
      continue;
    }

    const valueA = parseLocaleNumber(row[0]);
    const valueB = parseLocaleNumber(row[1]);

    if (valueA != null) {
      valuesA.push(valueA);
    } else if (cleanCell(row[0])) {
      invalidA.push(row[0]);
    }

    if (valueB != null) {
      valuesB.push(valueB);
    } else if (cleanCell(row[1])) {
      invalidB.push(row[1]);
    }
  }

  if (!valuesA.length && !valuesB.length) {
    return null;
  }

  return {
    hasAnyInput: true,
    formatLabel: "Duas colunas numericas",
    detailText: "Leitura manual por coluna para Grupo A e Grupo B.",
    groupA: { label: labelA, values: valuesA, invalid: invalidA },
    groupB: { label: labelB, values: valuesB, invalid: invalidB },
    entries: valuesA.map((value) => ({ groupLabel: labelA, value })).concat(valuesB.map((value) => ({ groupLabel: labelB, value }))),
    error: ""
  };
}

async function importDatasusFile(file, datasus) {
  try {
    const text = await file.text();
    loadDatasusFromText(text, file.name, datasus);
  } catch (error) {
    datasus.notice = {
      kind: "danger",
      title: "Falha na leitura",
      text: error.message || "Nao foi possivel abrir o arquivo DATASUS."
    };
  }
}

function loadDatasusFromText(text, fileName, datasus) {
  try {
    const imported = parseDatasusTable(text);
    datasus.imported = imported;
    datasus.fileName = fileName;
    datasus.showTotalRow = false;
    datasus.selectedGroupA = new Set();
    datasus.selectedGroupB = new Set();
    datasus.periodMode = "range";
    datasus.singleYear = imported.years[0] || "";
    datasus.rangeStart = imported.years[0] || "";
    datasus.rangeEnd = imported.years[imported.years.length - 1] || "";
    datasus.selectedBlockId = imported.blocks[0]?.id || "";
    datasus.result = null;
    datasus.notice = {
      kind: "success",
      title: "Arquivo carregado",
      text: `Foram detectadas ${imported.rows.filter((row) => !row.isTotalRow).length} regioes e ${imported.years.length} colunas de ano.`
    };
  } catch (error) {
    datasus.imported = null;
    datasus.fileName = "";
    datasus.selectedGroupA = new Set();
    datasus.selectedGroupB = new Set();
    datasus.result = null;
    datasus.notice = {
      kind: "danger",
      title: "Leitura invalida",
      text: error.message || "Nao foi possivel interpretar o arquivo DATASUS."
    };
  }
}

function updateDatasusField(datasus, field, target) {
  if (field === "showTotalRow") {
    datasus.showTotalRow = target.checked;

    if (!datasus.showTotalRow && datasus.imported?.totalRow) {
      datasus.selectedGroupA.delete(datasus.imported.totalRow.key);
      datasus.selectedGroupB.delete(datasus.imported.totalRow.key);
    }
  }

  if (field === "periodMode") datasus.periodMode = target.value;
  if (field === "singleYear") datasus.singleYear = target.value;
  if (field === "rangeStart") datasus.rangeStart = target.value;
  if (field === "rangeEnd") datasus.rangeEnd = target.value;
  if (field === "selectedBlockId") datasus.selectedBlockId = target.value;
}

function toggleDatasusRegion(datasus, group, rowKey, checked) {
  if (group === "A") {
    if (checked) {
      datasus.selectedGroupA.add(rowKey);
      datasus.selectedGroupB.delete(rowKey);
    } else {
      datasus.selectedGroupA.delete(rowKey);
    }
    return;
  }

  if (checked) {
    datasus.selectedGroupB.add(rowKey);
    datasus.selectedGroupA.delete(rowKey);
  } else {
    datasus.selectedGroupB.delete(rowKey);
  }
}

function getSelectableRows(datasus) {
  if (!datasus.imported) {
    return [];
  }

  return datasus.imported.rows.filter((row) => datasus.showTotalRow || !row.isTotalRow);
}

function getSelectedRowNames(datasus, group) {
  if (!datasus.imported) {
    return [];
  }

  const selected = group === "A" ? datasus.selectedGroupA : datasus.selectedGroupB;
  return datasus.imported.rows.filter((row) => selected.has(row.key)).map((row) => row.rowLabel);
}

function buildDatasusDerived(datasus) {
  const result = {
    hasImportedData: Boolean(datasus.imported),
    summaryType: "Media por regiao no periodo",
    periodLabel: "",
    groupAEntries: [],
    groupBEntries: [],
    entries: [],
    messages: [],
    blockNotices: [],
    canRun: false,
    blockingMessage: ""
  };

  if (!datasus.imported) {
    result.blockingMessage = "Importe um arquivo DATASUS para montar a base derivada.";
    return result;
  }

  const period = resolveDatasusPeriod(datasus);

  if (!period.years.length) {
    result.messages.push({
      kind: "danger",
      title: "Periodo invalido",
      text: period.error || "Nenhum ano valido foi encontrado no intervalo selecionado."
    });
    result.blockingMessage = period.error || "Nenhum ano valido foi encontrado no intervalo selecionado.";
    return result;
  }

  result.periodLabel = period.label;

  if (period.blockNotice) {
    result.blockNotices.push(period.blockNotice);
  }

  const selectedRowsA = datasus.imported.rows.filter((row) => datasus.selectedGroupA.has(row.key));
  const selectedRowsB = datasus.imported.rows.filter((row) => datasus.selectedGroupB.has(row.key));

  if (selectedRowsA.length === 0 || selectedRowsB.length === 0) {
    result.messages.push({
      kind: "warning",
      title: "Selecao incompleta",
      text: "Escolha pelo menos 1 regiao em cada grupo antes de montar os vetores."
    });
    result.blockingMessage = "Escolha pelo menos 1 regiao em cada grupo.";
    return result;
  }

  const summarizedA = summarizeDatasusGroup(selectedRowsA, period.years, "Grupo A");
  const summarizedB = summarizeDatasusGroup(selectedRowsB, period.years, "Grupo B");

  if (summarizedA.dropped.length || summarizedB.dropped.length) {
    result.messages.push({
      kind: "info",
      title: "Regioes sem valor no periodo",
      text: `${summarizedA.dropped.length + summarizedB.dropped.length} regiao(oes) foram ignoradas por nao terem valores numericos validos no periodo selecionado.`
    });
  }

  result.groupAEntries = summarizedA.entries;
  result.groupBEntries = summarizedB.entries;
  result.entries = summarizedA.entries.concat(summarizedB.entries);

  if (result.groupAEntries.length < 2 || result.groupBEntries.length < 2) {
    result.messages.push({
      kind: "danger",
      title: "Observacoes insuficientes",
      text: "Selecione pelo menos 2 regioes validas em cada grupo."
    });
    result.blockingMessage = "Selecione pelo menos 2 regioes validas em cada grupo.";
    return result;
  }

  if (result.entries.some((entry) => !Number.isFinite(entry.value))) {
    result.messages.push({
      kind: "danger",
      title: "Valores invalidos",
      text: "Nao foi possivel montar vetores sem NaN para os grupos selecionados."
    });
    result.blockingMessage = "Os vetores finais contem valores invalidos.";
    return result;
  }

  result.canRun = true;
  return result;
}

function resolveDatasusPeriod(datasus) {
  const years = datasus.imported?.years || [];

  if (datasus.periodMode === "single") {
    return {
      years: datasus.singleYear ? [Number(datasus.singleYear)] : [],
      label: String(datasus.singleYear || ""),
      error: datasus.singleYear ? "" : "Selecione um ano valido."
    };
  }

  if (datasus.periodMode === "block") {
    const block = datasus.imported?.blocks.find((item) => item.id === datasus.selectedBlockId);

    if (!block) {
      return { years: [], label: "", error: "Selecione um bloco valido de 5 anos." };
    }

    return {
      years: block.years,
      label: block.label,
      error: "",
      blockNotice: block.isComplete
        ? null
        : {
            kind: "warning",
            title: "Bloco incompleto",
            text: `O bloco ${block.label} possui ${block.years.length} de 5 anos disponiveis.`
          }
    };
  }

  const start = Number(datasus.rangeStart);
  const end = Number(datasus.rangeEnd);

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    return { years: [], label: "", error: "Nenhum ano valido foi encontrado no intervalo selecionado." };
  }

  return {
    years: years.filter((year) => year >= start && year <= end),
    label: `${start} a ${end}`,
    error: ""
  };
}

function summarizeDatasusGroup(rows, selectedYears, groupLabel) {
  const entries = [];
  const dropped = [];

  rows.forEach((row) => {
    const values = selectedYears
      .map((year) => row.valuesByYear[String(year)])
      .filter((value) => Number.isFinite(value));

    if (!values.length) {
      dropped.push(row.rowLabel);
      return;
    }

    entries.push({
      rowLabel: row.rowLabel,
      groupLabel,
      value: mean(values)
    });
  });

  return { entries, dropped };
}

function runDatasusMode(datasus) {
  const derived = buildDatasusDerived(datasus);

  if (!derived.canRun) {
    datasus.result = null;
    datasus.notice = {
      kind: "danger",
      title: "Execucao bloqueada",
      text: derived.blockingMessage || "O periodo selecionado nao gerou observacoes suficientes."
    };
    return;
  }

  datasus.notice = null;
  datasus.result = runWelchTTest(
    derived.groupAEntries.map((entry) => entry.value),
    derived.groupBEntries.map((entry) => entry.value),
    {
      labelA: "Grupo A",
      labelB: "Grupo B",
      interpretation: (stats) => buildDatasusInterpretation(stats, derived)
    }
  );
}

function buildManualInterpretation(stats, labelA, labelB, studyQuestion, alpha) {
  const significance = stats.pValue < alpha
    ? "observou-se diferenca estatisticamente significativa"
    : "nao se observou diferenca estatisticamente significativa";
  const direction = stats.meanDifference > 0
    ? `${labelA} apresentou media maior`
    : stats.meanDifference < 0
      ? `${labelB} apresentou media maior`
      : "os dois grupos apresentaram medias equivalentes";

  return `${studyQuestion || "Na comparacao entre os grupos"}, ${significance} entre ${labelA} e ${labelB} com nivel de significancia de ${PT_NUMBER.format(alpha * 100)}%. ${direction}.`;
}

function buildDatasusInterpretation(stats, derived) {
  const significance = stats.pValue < 0.05
    ? "observou-se diferenca estatisticamente significativa"
    : "nao se observou diferenca estatisticamente significativa";
  const direction = stats.meanDifference > 0
    ? "A media foi maior no Grupo A."
    : stats.meanDifference < 0
      ? "A media foi maior no Grupo B."
      : "As medias dos grupos ficaram equivalentes.";

  return `Apos resumir os valores de cada regiao no periodo ${derived.periodLabel} e comparar os grupos definidos pelo usuario, ${significance} entre Grupo A e Grupo B. O resumo usado foi media por regiao no periodo. Grupo A: ${derived.groupAEntries.map((entry) => entry.rowLabel).join(", ")}. Grupo B: ${derived.groupBEntries.map((entry) => entry.rowLabel).join(", ")}. ${direction}`;
}

function runWelchTTest(sampleA, sampleB, options) {
  const alpha = Number(options.alpha) || 0.05;
  const nA = sampleA.length;
  const nB = sampleB.length;
  const meanA = mean(sampleA);
  const meanB = mean(sampleB);
  const varianceA = sampleVariance(sampleA);
  const varianceB = sampleVariance(sampleB);
  const sdA = Math.sqrt(varianceA);
  const sdB = Math.sqrt(varianceB);
  const meanDifference = meanA - meanB;
  const seTermA = varianceA / nA;
  const seTermB = varianceB / nB;
  const standardError = Math.sqrt(seTermA + seTermB);

  if (!Number.isFinite(standardError) || standardError === 0) {
    throw new Error("Nao foi possivel calcular o t test porque a variabilidade dos grupos e zero.");
  }

  const t = meanDifference / standardError;
  const numerator = (seTermA + seTermB) ** 2;
  const denominator = (seTermA ** 2) / Math.max(nA - 1, 1) + (seTermB ** 2) / Math.max(nB - 1, 1);
  const df = numerator / denominator;
  const pValue = 2 * (1 - studentTCdf(Math.abs(t), df));
  const critical = inverseStudentT(1 - (alpha / 2), df);
  const effectSize = computeHedgesG(sampleA, sampleB, varianceA, varianceB);

  const stats = {
    nA,
    nB,
    meanA,
    meanB,
    sdA,
    sdB,
    meanDifference,
    t,
    df,
    pValue,
    ciLow: meanDifference - (critical * standardError),
    ciHigh: meanDifference + (critical * standardError),
    effectSize,
    labelA: options.labelA,
    labelB: options.labelB,
    chartMax: Math.max(Math.abs(meanA), Math.abs(meanB), 1),
    alpha,
    confidenceLabel: `IC${Math.round((1 - alpha) * 100)}%`
  };

  return {
    ...stats,
    interpretation: options.interpretation(stats)
  };
}

function computeHedgesG(sampleA, sampleB, varianceA, varianceB) {
  const nA = sampleA.length;
  const nB = sampleB.length;
  const pooledDenominator = nA + nB - 2;

  if (pooledDenominator <= 0) {
    return null;
  }

  const pooledVariance = (((nA - 1) * varianceA) + ((nB - 1) * varianceB)) / pooledDenominator;
  const pooledSd = Math.sqrt(pooledVariance);

  if (!Number.isFinite(pooledSd) || pooledSd === 0) {
    return null;
  }

  const d = (mean(sampleA) - mean(sampleB)) / pooledSd;
  const correction = 1 - (3 / ((4 * (nA + nB)) - 9));
  return d * correction;
}

function parseDatasusTable(text) {
  const rawLines = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\u00A0/g, " ").trim())
    .filter((line) => line.length > 0);

  if (!rawLines.length) {
    throw new Error("Nao foi possivel interpretar o arquivo DATASUS.");
  }

  const candidates = [";", "\t", ","]
    .map((separator, index) => detectHeaderCandidate(rawLines, separator, index))
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.priority - right.priority || left.headerIndex - right.headerIndex);

  const selected = candidates[0];

  if (!selected) {
    throw new Error("Nao foi possivel interpretar o arquivo DATASUS.");
  }

  const metadataLines = rawLines.slice(0, selected.headerIndex);
  const rows = [];
  let totalRow = null;

  for (let index = selected.headerIndex + 1; index < rawLines.length; index += 1) {
    const cells = splitDelimitedLine(rawLines[index], selected.separator);
    const rowLabel = cleanCell(cells[0]);

    if (!rowLabel) {
      continue;
    }

    const valuesByYear = {};
    const validYears = [];

    selected.years.forEach((year) => {
      const value = parseLocaleNumber(cells[year.index]);
      valuesByYear[String(year.value)] = value;
      if (Number.isFinite(value)) {
        validYears.push(year.value);
      }
    });

    const totalValue = selected.totalIndex >= 0 ? parseLocaleNumber(cells[selected.totalIndex]) : null;
    const row = {
      key: `${rowLabel}-${rows.length}`,
      rowLabel,
      valuesByYear,
      validYears,
      totalValue,
      isTotalRow: normalizeForCompare(rowLabel) === "total"
    };

    if (!validYears.length && totalValue == null) {
      continue;
    }

    rows.push(row);

    if (row.isTotalRow) {
      totalRow = row;
    }
  }

  if (!rows.length) {
    throw new Error("Nao foi possivel interpretar o arquivo DATASUS.");
  }

  const years = selected.years.map((year) => year.value).sort((left, right) => left - right);

  return {
    separator: selected.separator,
    separatorLabel: describeSeparator(selected.separator),
    metadataLines,
    detectedTitle: metadataLines[0] || "",
    detectedMeasure: metadataLines[1] || "",
    labelHeader: cleanCell(selected.headerCells[0]) || "Regiao",
    years,
    totalColumn: selected.totalIndex >= 0 ? cleanCell(selected.headerCells[selected.totalIndex]) || "Total" : "",
    rows,
    totalRow,
    blocks: createFiveYearBlocks(years)
  };
}

function detectHeaderCandidate(lines, separator, priority) {
  let best = null;

  lines.forEach((line, headerIndex) => {
    if (separator !== "\t" && !line.includes(separator)) {
      return;
    }

    if (separator === "\t" && !line.includes("\t")) {
      return;
    }

    const cells = splitDelimitedLine(line, separator);
    const normalizedCells = cells.map((cell) => normalizeForCompare(cell));
    const labelMatches =
      normalizedCells[0] === "regiao" ||
      normalizedCells[0] === "regiao/geografia" ||
      normalizedCells[0].startsWith("regiao");
    const years = cells
      .map((cell, index) => ({ value: cleanCell(cell), index }))
      .filter((cell) => /^\d{4}$/.test(cell.value));
    const totalIndex = normalizedCells.findIndex((cell) => cell === "total");

    if (!labelMatches || !years.length) {
      return;
    }

    const score = (years.length * 10) + (totalIndex >= 0 ? 4 : 0) + (cells.length - headerIndex);

    if (!best || score > best.score) {
      best = {
        priority,
        score,
        headerIndex,
        separator,
        headerCells: cells,
        years,
        totalIndex
      };
    }
  });

  return best;
}

function splitDelimitedLine(line, separator) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === separator && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells.map((cell) => cleanCell(cell));
}

function createFiveYearBlocks(years) {
  if (!years.length) {
    return [];
  }

  const sorted = [...years].sort((left, right) => left - right);
  const blocks = [];
  let start = sorted[0];
  const end = sorted[sorted.length - 1];

  while (start <= end) {
    const expectedEnd = start + 4;
    const blockYears = sorted.filter((year) => year >= start && year <= expectedEnd);
    const isComplete = blockYears.length === 5;
    blocks.push({
      id: `${start}-${expectedEnd}`,
      label: isComplete ? `${start}-${expectedEnd}` : `${start}-${expectedEnd} (incompleto)`,
      years: blockYears,
      isComplete
    });
    start += 5;
  }

  return blocks;
}

function buildManualExampleText(config) {
  const groupA = Array.isArray(config?.example?.group1) ? config.example.group1 : [4.8, 5.1, 4.9, 5.0, 4.7];
  const groupB = Array.isArray(config?.example?.group2) ? config.example.group2 : [6.1, 5.8, 6.0, 5.9, 6.2];
  const rowCount = Math.max(groupA.length, groupB.length);
  const lines = ["Grupo A\tGrupo B"];

  for (let index = 0; index < rowCount; index += 1) {
    lines.push(`${groupA[index] == null ? "" : formatExampleNumber(groupA[index])}\t${groupB[index] == null ? "" : formatExampleNumber(groupB[index])}`);
  }

  return lines.join("\n");
}

function buildDatasusExampleText() {
  const years = Array.from({ length: 19 }, (_, index) => 2008 + index);
  const header = ["Regiao"].concat(years, "Total").join(";");
  const dataLines = Object.entries(DEFAULT_DATASUS_SERIES).map(([label, series]) => {
    const total = sum(series);
    return [label]
      .concat(series.map((value) => formatExampleNumber(value)))
      .concat(formatExampleNumber(total))
      .join(";");
  });
  const totalSeries = years.map((_, yearIndex) => sum(Object.values(DEFAULT_DATASUS_SERIES).map((series) => series[yearIndex])));
  const totalLine = ["Total"]
    .concat(totalSeries.map((value) => formatExampleNumber(value)))
    .concat(formatExampleNumber(sum(totalSeries)))
    .join(";");

  return [
    "Procedimentos hospitalares do SUS - por local de internacao - Brasil",
    "Media permanencia por Regiao e Ano processamento",
    "Grupo procedimento: Exemplo didatico",
    "Subgrupo proced.: Exemplo didatico",
    "Periodo: 2008 a 2026",
    header
  ]
    .concat(dataLines, totalLine)
    .join("\n");
}

function formatExampleNumber(value) {
  return Number(value).toFixed(1).replace(".", ",");
}

function describeSeparator(separator) {
  if (separator === "\t") return "Separador tabulado";
  if (separator === ",") return "Separador por virgula";
  return "Separador por ponto e virgula";
}

function parseLocaleNumber(value) {
  const trimmed = cleanCell(value);

  if (!trimmed || /^(-|na|n\/a)$/i.test(trimmed)) {
    return null;
  }

  let normalized = trimmed.replace(/\s+/g, "");

  if (/^[-+]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(normalized)) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (/^[-+]?\d+(,\d+)$/.test(normalized)) {
    normalized = normalized.replace(",", ".");
  } else if (/^[-+]?\d{1,3}(\.\d{3})+$/.test(normalized)) {
    normalized = normalized.replace(/\./g, "");
  }

  normalized = normalized.replace(/[^0-9.+-]/g, "");

  if (!normalized || normalized === "-" || normalized === ".") {
    return null;
  }

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
  if (!Array.isArray(values) || values.length < 2) {
    return 0;
  }

  const average = mean(values);
  return sum(values.map((value) => (value - average) ** 2)) / (values.length - 1);
}

function logGamma(z) {
  const coefficients = [676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.507343278686905, -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7];

  if (z < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  }

  let accumulator = 0.9999999999998099;
  const shifted = z - 1;
  coefficients.forEach((coefficient, index) => {
    accumulator += coefficient / (shifted + index + 1);
  });
  const t = shifted + coefficients.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + ((shifted + 0.5) * Math.log(t)) - t + Math.log(accumulator);
}

function betaContinuedFraction(a, b, x) {
  const epsilon = 3e-7;
  const tiny = 1e-30;
  let c = 1;
  let d = 1 - (((a + b) * x) / (a + 1));

  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= 200; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a - 1 + m2) * (a + m2));
    d = 1 + aa * d;
    c = 1 + aa / c;
    if (Math.abs(d) < tiny) d = tiny;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;

    aa = (-((a + m) * (a + b + m) * x)) / ((a + m2) * (a + 1 + m2));
    d = 1 + aa * d;
    c = 1 + aa / c;
    if (Math.abs(d) < tiny) d = tiny;
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
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + (a * Math.log(x)) + (b * Math.log(1 - x)));
  if (x < (a + 1) / (a + b + 2)) return (bt * betaContinuedFraction(a, b, x)) / a;
  return 1 - ((bt * betaContinuedFraction(b, a, 1 - x)) / b);
}

function studentTCdf(t, df) {
  if (!Number.isFinite(t)) return t > 0 ? 1 : 0;
  const x = df / (df + (t * t));
  const value = regularizedIncompleteBeta(x, df / 2, 0.5);
  return t >= 0 ? 1 - (0.5 * value) : 0.5 * value;
}

function inverseStudentT(probability, df) {
  if (probability <= 0 || probability >= 1) {
    throw new Error("A probabilidade deve estar entre 0 e 1.");
  }

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

function formatNumber(value) {
  return PT_NUMBER.format(value);
}

function formatPValue(value) {
  if (!Number.isFinite(value)) return "NA";
  return value < 0.0001 ? "< 0,0001" : PT_NUMBER.format(value);
}

function cleanCell(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeForCompare(value) {
  return cleanCell(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function escapeMarkup(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeMarkup(value).replace(/\n/g, "&#10;");
}
