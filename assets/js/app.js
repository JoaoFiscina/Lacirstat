async function loadTest(testItem, manifest) {
  try {
    setActiveNav(testItem.id);
    utils.showLoading(moduleRoot, `Carregando ${testItem.title}...`);

    const basePath = normalizeBasePath(testItem.path);

    const configUrl = new URL(`${basePath}config.json`, document.baseURI).href;
    const moduleUrl = new URL(`${basePath}module.js`, document.baseURI).href;

    const config = await fetchJson(configUrl);
    const module = await import(moduleUrl);

    setHeader(
      config.title || testItem.title,
      config.subtitle || testItem.subtitle || ""
    );

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
