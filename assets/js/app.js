const navRoot = document.getElementById("test-nav");
const moduleRoot = document.getElementById("module-root");
const pageTitle = document.getElementById("page-title");
const pageSubtitle = document.getElementById("page-subtitle");

const utils = {
  escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  },
  clearElement(element) {
    if (!element) {
      return;
    }

    element.textContent = "";
  },
  showLoading(element, message) {
    if (!element) {
      return;
    }

    element.innerHTML = `<div class="loading">${utils.escapeHtml(message)}</div>`;
  },
  showError(element, message) {
    if (!element) {
      return;
    }

    element.innerHTML = `<div class="error-box">${utils.escapeHtml(message)}</div>`;
  }
};

function normalizeBasePath(path) {
  if (!path) {
    return "./";
  }

  return path.endsWith("/") ? path : `${path}/`;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Nao foi possivel carregar ${url}.`);
  }

  return response.json();
}

function setHeader(title, subtitle) {
  if (pageTitle) {
    pageTitle.textContent = title || "Selecione um teste";
  }

  if (pageSubtitle) {
    pageSubtitle.textContent = subtitle || "Escolha uma opcao no menu lateral.";
  }
}

function setActiveNav(testId) {
  if (!navRoot) {
    return;
  }

  navRoot.querySelectorAll(".test-link").forEach((button) => {
    button.classList.toggle("active", button.dataset.testId === testId);
  });
}

function resolveInitialTest(manifest) {
  const requestedId = window.location.hash.replace(/^#/, "").trim();

  if (requestedId) {
    const matched = manifest.find((item) => item.id === requestedId);
    if (matched) {
      return matched;
    }
  }

  return manifest[0] || null;
}

function renderNav(manifest) {
  if (!navRoot) {
    return;
  }

  utils.clearElement(navRoot);

  if (!Array.isArray(manifest) || manifest.length === 0) {
    navRoot.innerHTML = `<div class="error-box">Nenhum teste foi encontrado no manifesto.</div>`;
    return;
  }

  const fragment = document.createDocumentFragment();

  manifest.forEach((testItem) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "test-link";
    button.dataset.testId = testItem.id;
    button.innerHTML = `
      <span class="test-link-title">${utils.escapeHtml(testItem.title || testItem.id)}</span>
      <span class="test-link-subtitle">${utils.escapeHtml(testItem.subtitle || "")}</span>
    `;
    button.addEventListener("click", () => {
      void loadTest(testItem, manifest);
    });
    fragment.appendChild(button);
  });

  navRoot.appendChild(fragment);
}

async function loadTest(testItem, manifest) {
  try {
    setActiveNav(testItem.id);
    setHeader(testItem.title || "Carregando...", testItem.subtitle || "");
    utils.showLoading(moduleRoot, `Carregando ${testItem.title || testItem.id}...`);

    const basePath = normalizeBasePath(testItem.path);
    const configUrl = new URL(`${basePath}config.json`, document.baseURI).href;
    const moduleUrl = new URL(`${basePath}module.js`, document.baseURI).href;

    const config = await fetchJson(configUrl);
    const module = await import(moduleUrl);

    setHeader(
      config.title || testItem.title || "Teste estatistico",
      config.subtitle || testItem.subtitle || ""
    );

    if (!module || typeof module.renderTestModule !== "function") {
      throw new Error(`O modulo ${testItem.id} nao exporta renderTestModule(ctx).`);
    }

    utils.clearElement(moduleRoot);

    await module.renderTestModule({
      root: moduleRoot,
      config,
      manifest,
      currentTest: testItem,
      utils
    });

    if (window.location.hash !== `#${testItem.id}`) {
      window.location.hash = testItem.id;
    }
  } catch (error) {
    console.error(error);
    utils.showError(moduleRoot, error.message || "Erro desconhecido.");
  }
}

async function init() {
  try {
    if (window.location.protocol === "file:") {
      throw new Error("Esta aplicacao precisa ser aberta por HTTP ou HTTPS. Use GitHub Pages ou um servidor local, nao file://.");
    }

    utils.showLoading(navRoot, "Carregando testes...");
    utils.showLoading(moduleRoot, "Preparando o ambiente...");

    const manifestUrl = new URL("./tests-manifest.json", document.baseURI).href;
    const manifest = await fetchJson(manifestUrl);

    if (!Array.isArray(manifest) || manifest.length === 0) {
      throw new Error("O manifesto de testes esta vazio.");
    }

    renderNav(manifest);

    const initialTest = resolveInitialTest(manifest);

    if (!initialTest) {
      throw new Error("Nao foi possivel localizar um teste inicial.");
    }

    await loadTest(initialTest, manifest);
  } catch (error) {
    console.error(error);
    utils.showError(navRoot, error.message || "Nao foi possivel carregar o menu.");
    utils.showError(moduleRoot, error.message || "Nao foi possivel iniciar a aplicacao.");
    setHeader("Erro ao carregar", "Revise o manifesto e os modulos disponiveis.");
  }
}

void init();
