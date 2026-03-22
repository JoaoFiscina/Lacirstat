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
    ["IC95%", `${formatNumber(result.ciLow)} a ${formatNumber(result.ciHigh)}`],
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
  manual.groupALabel = DEFAULT_MANUAL_LABEL_A;
  manual.groupBLabel = DEFAULT_MANUAL_LABEL_B;
  manual.groupAText = Array.isArray(config?.example?.group1) ? config.example.group1.join("\n") : "4,8\n5,1\n4,9";
  manual.groupBText = Array.isArray(config?.example?.group2) ? config.example.group2.join("\n") : "6,1\n5,8\n6,0";
  manual.notice = {
    kind: "info",
    title: "Exemplo carregado",
    text: "Os dois grupos foram preenchidos com os valores de exemplo do modulo."
  };
  manual.result = null;
}

function buildManualPreview(manual) {
  return {
    hasAnyInput: Boolean(String(manual.groupAText).trim() || String(manual.groupBText).trim()),
    groupA: parseManualValues(manual.groupAText),
    groupB: parseManualValues(manual.groupBText)
  };
}

function runManualMode(manual) {
  const preview = buildManualPreview(manual);
  const labelA = manual.groupALabel.trim() || DEFAULT_MANUAL_LABEL_A;
  const labelB = manual.groupBLabel.trim() || DEFAULT_MANUAL_LABEL_B;

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
    interpretation: (stats) => buildManualInterpretation(stats, labelA, labelB)
  });
}

function parseManualValues(text) {
  const values = [];
  const invalid = [];
  const lines = String(text || "").split(/\r?\n/);

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed) {
      return;
    }

    let parts = trimmed.includes("\t")
      ? trimmed.split("\t")
      : trimmed.includes(";")
        ? trimmed.split(";")
        : [trimmed];

    if (parts.length === 1 && trimmed.includes(",") && !looksLikeSingleLocaleNumber(trimmed)) {
      parts = trimmed.split(",");
    }

    parts.forEach((part) => {
      const value = parseLocaleNumber(part);

      if (value == null) {
        if (String(part).trim()) {
          invalid.push(String(part).trim());
        }
        return;
      }

      values.push(value);
    });
  });

  return { values, invalid };
}

function looksLikeSingleLocaleNumber(value) {
  const trimmed = String(value || "").trim();
  return /^[-+]?\d{1,3}(\.\d{3})*(,\d+)?$/.test(trimmed) || /^[-+]?\d+(,\d+)?$/.test(trimmed);
}
