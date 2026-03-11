export async function renderTestModule(ctx) {
  const { root, config, utils } = ctx;

  root.innerHTML = `
    <div>
      <h3>${utils.escapeHtml(config.title)}</h3>
      <p>${utils.escapeHtml(config.description || "")}</p>

      <h4>Como inserir os dados</h4>
      <ul>
        ${(config.inputGuide || [])
          .map((item) => `<li>${utils.escapeHtml(item)}</li>`)
          .join("")}
      </ul>

      <div class="loading">Módulo inicial carregado com sucesso.</div>
    </div>
  `;
}
