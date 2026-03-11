export async function renderTestModule(ctx) {
  const { root, config, utils } = ctx;

  root.innerHTML = `
    <div>
      <h3>${utils.escapeHtml(config.title)}</h3>
      <p>${utils.escapeHtml(config.description || "")}</p>
      <div class="loading">Módulo carregado com sucesso.</div>
    </div>
  `;
}
