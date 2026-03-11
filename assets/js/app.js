const navEl = document.getElementById("test-nav");
const moduleRoot = document.getElementById("module-root");
const pageTitle = document.getElementById("page-title");
const pageSubtitle = document.getElementById("page-subtitle");

const utils = {
  clearElement(el) {
    el.innerHTML = "";
  },

  showLoading(el, text = "Carregando...") {
    el.innerHTML = `<div class="loading">${text}</div>`;
  },

  showError(el, message) {
    el.innerHTML = `<div class="error-box"><strong>Erro:</strong> ${message}</div>`;
  },

  escapeHtml(str = "") {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
};

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Falha ao carregar ${url} (${response.status})`);
  }
  return response.json();
}

function normalizeBasePath(path) {
  return path.endsWith("/") ? path : `${path}/`;
}

function setHeader(title, subtitle) {
  pageTitle.textContent = title || "Teste";
  pageSubtitle.textContent = subtitle || "";
}

function renderNav(manifest) {
  utils.clearElement(navEl);

  manifest.forEach((item, index) => {
    const button = document.createElement("button");
    button.className = "test-link";
    button.type = "button";
    button.dataset.testId = item.id;
    button.innerHTML = `
      <span class="test-link-title">${utils.escapeHtml(item.title)}</span>
      <span class="test-link-subtitle">${utils.escapeHtml(item.subtitle || "")}</span>
    `;

    button.addEventListener("click", () => {
      loadTest(item, manifest);
    });

    navEl.appendChild(button);

    if (index === 0) {
      button.classList.add("active");
    }
  });
}

function setActiveNav(testId) {
  const buttons = navEl.querySelectorAll(".test-link");
  buttons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.testId === testId);
  });
}

async function loadTest(testItem, manifest) {
  try {
    setActiveNav(testItem.id);
    utils.showLoading(moduleRoot, `Carregando ${testItem.title}...`);

    const basePath = normalizeBasePath(testItem.path);
    const config = await fetchJson(`${basePath}config.json`);
    const module = await import(`${basePath}module.js`);

    setHeader(config.title || testItem.title, config.subtitle || testItem.subtitle || "");

    if (!module || typeof module.renderTestModule !== "function") {
      throw new Error(`O módulo ${testItem.id} não exporta renderTestModule(ctx).`);
    }

    utils.clearElement(moduleRoot);

    await module.renderTestModule({
      root: moduleRoot,
      config,
      manifest,
      currentTest: testItem,
      utils
    });
  } catch (error) {
    console.error(error);
    utils.showError(moduleRoot, error.message || "Erro desconhecido.");
  }
}

async function bootstrap() {
  try {
    utils.showLoading(navEl, "Carregando lista de testes...");
    const manifest = await fetchJson("./tests-manifest.json");

    if (!Array.isArray(manifest) || manifest.length === 0) {
      throw new Error("Nenhum teste encontrado no manifesto.");
    }

    renderNav(manifest);
    await loadTest(manifest[0], manifest);
  } catch (error) {
    console.error(error);
    utils.showError(navEl, error.message || "Não foi possível carregar os testes.");
    utils.showError(moduleRoot, "Falha ao inicializar a aplicação.");
  }
}

bootstrap();
