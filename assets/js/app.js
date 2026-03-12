const navEl = document.getElementById('test-nav');
const moduleRoot = document.getElementById('module-root');
const pageTitle = document.getElementById('page-title');
const pageSubtitle = document.getElementById('page-subtitle');
const heroNote = document.getElementById('hero-note');

const utils = {
  clearElement(el) { el.innerHTML = ''; },
  escapeHtml(str = '') {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  },
  showError(el, message) {
    el.innerHTML = `<div class="error-box"><strong>Erro:</strong> ${this.escapeHtml(message)}</div>`;
  },
  showLoading(el, text = 'Carregando...') {
    el.innerHTML = `<div class="loading-chip">${this.escapeHtml(text)}</div>`;
  },
  fmtNumber(value, digits = 3) {
    return Number(value).toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits });
  },
  fmtP(value) {
    if (!Number.isFinite(value)) return '—';
    if (value < 0.001) return '< 0,001';
    return value.toLocaleString('pt-BR', { maximumFractionDigits: 4, minimumFractionDigits: 4 });
  },
  fmtSigned(value, digits = 3) {
    if (!Number.isFinite(value)) return '—';
    const sign = value > 0 ? '+' : '';
    return sign + Number(value).toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits });
  },
  downloadText(filename, content, type = 'text/plain;charset=utf-8') {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  async readFileText(file) {
    return await file.text();
  },
  renderPreviewTable(headers, rows, limit = 12) {
    const safeHeaders = headers.map((h, i) => this.escapeHtml(h || `Coluna ${i + 1}`));
    const safeRows = rows.slice(0, limit).map(row => `
      <tr>${row.map(cell => `<td>${this.escapeHtml(cell ?? '')}</td>`).join('')}</tr>
    `).join('');
    const note = rows.length > limit ? `<div class="small-note" style="margin-top:10px;">Mostrando ${limit} de ${rows.length} linhas importadas.</div>` : '';
    return `
      <div class="preview-table-wrap">
        <table class="preview-table">
          <thead><tr>${safeHeaders.map(h => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${safeRows || '<tr><td colspan="99">Sem linhas para exibir.</td></tr>'}</tbody>
        </table>
      </div>
      ${note}
    `;
  },
  parseDelimitedText(text, expectedCols = 2) {
    const clean = String(text || '').trim();
    if (!clean) return { headers: null, rows: [] };
    const lines = clean.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (!lines.length) return { headers: null, rows: [] };

    const first = lines[0];
    let delim = '\t';
    if (first.includes('\t')) delim = '\t';
    else if ((first.match(/;/g) || []).length > (first.match(/,/g) || []).length) delim = ';';
    else if (first.includes(',')) delim = ',';
    else delim = /\s{2,}|\s+/;

    let rows = lines.map(line => line.split(delim).map(v => String(v).trim()));
    rows = rows.filter(row => row.some(v => v !== ''));

    let headers = null;
    const firstRow = rows[0] || [];
    const headerLikely = firstRow.slice(0, expectedCols).some(v => Stats.parseNumber(v) === null);
    if (headerLikely) {
      headers = firstRow.slice(0, expectedCols).map((v, i) => v || `Coluna ${i + 1}`);
      rows = rows.slice(1);
    }

    rows = rows.map(row => {
      const normalized = row.slice(0, expectedCols);
      while (normalized.length < expectedCols) normalized.push('');
      return normalized;
    }).filter(row => row.some(v => v !== ''));

    return { headers, rows };
  },
  buildInterpretationCard(title, paragraph, bullets = []) {
    return `
      <div class="result-card">
        <h4>${this.escapeHtml(title)}</h4>
        <p>${this.escapeHtml(paragraph)}</p>
        ${bullets.length ? `<ul>${bullets.map(item => `<li>${this.escapeHtml(item)}</li>`).join('')}</ul>` : ''}
      </div>
    `;
  }
};

const Stats = {
  parseNumber(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    let s = String(raw).trim();
    if (!s) return null;
    s = s.replace(/\s+/g, '');
    if (s.includes(',') && s.includes('.')) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (s.includes(',') && !s.includes('.')) {
      s = s.replace(',', '.');
    }
    const value = Number(s);
    return Number.isFinite(value) ? value : null;
  },
  mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; },
  variance(arr) {
    if (arr.length < 2) return NaN;
    const m = this.mean(arr);
    return arr.reduce((acc, v) => acc + (v - m) ** 2, 0) / (arr.length - 1);
  },
  sd(arr) { return Math.sqrt(this.variance(arr)); },
  sum(arr) { return arr.reduce((a, b) => a + b, 0); },
  min(arr) { return Math.min(...arr); },
  max(arr) { return Math.max(...arr); },
  gammaln(x) {
    const cof = [76.18009172947146,-86.50532032941677,24.01409824083091,-1.231739572450155,0.1208650973866179e-2,-0.5395239384953e-5];
    let ser = 1.000000000190015;
    let y = x;
    let tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    for (let j = 0; j < cof.length; j++) ser += cof[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  },
  betacf(a, b, x) {
    const MAXIT = 200;
    const EPS = 3e-7;
    const FPMIN = 1e-30;
    let qab = a + b;
    let qap = a + 1;
    let qam = a - 1;
    let c = 1;
    let d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      let m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  },
  ibeta(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(this.gammaln(a + b) - this.gammaln(a) - this.gammaln(b) + a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) return bt * this.betacf(a, b, x) / a;
    return 1 - bt * this.betacf(b, a, 1 - x) / b;
  },
  tcdf(t, df) {
    if (!Number.isFinite(t) || !Number.isFinite(df) || df <= 0) return NaN;
    if (t === 0) return 0.5;
    const x = df / (df + t * t);
    const ib = this.ibeta(x, df / 2, 0.5);
    return t > 0 ? 1 - 0.5 * ib : 0.5 * ib;
  },
  tInv(p, df) {
    if (p <= 0 || p >= 1 || !Number.isFinite(df) || df <= 0) return NaN;
    let low = -50, high = 50;
    for (let i = 0; i < 120; i++) {
      const mid = (low + high) / 2;
      const c = this.tcdf(mid, df);
      if (c < p) low = mid; else high = mid;
    }
    return (low + high) / 2;
  },
  fisherCI(r, n) {
    if (!Number.isFinite(r) || n <= 3 || Math.abs(r) >= 1) return [NaN, NaN];
    const z = 0.5 * Math.log((1 + r) / (1 - r));
    const se = 1 / Math.sqrt(n - 3);
    const lowZ = z - 1.96 * se;
    const highZ = z + 1.96 * se;
    const low = (Math.exp(2 * lowZ) - 1) / (Math.exp(2 * lowZ) + 1);
    const high = (Math.exp(2 * highZ) - 1) / (Math.exp(2 * highZ) + 1);
    return [low, high];
  },
  welchT(a, b) {
    const n1 = a.length, n2 = b.length;
    const m1 = this.mean(a), m2 = this.mean(b);
    const s1 = this.sd(a), s2 = this.sd(b);
    const v1 = s1 * s1, v2 = s2 * s2;
    const se = Math.sqrt(v1 / n1 + v2 / n2);
    const t = (m1 - m2) / se;
    const df = ((v1 / n1 + v2 / n2) ** 2) / (((v1 / n1) ** 2) / (n1 - 1) + ((v2 / n2) ** 2) / (n2 - 1));
    const p = 2 * (1 - this.tcdf(Math.abs(t), df));
    const tcrit = this.tInv(0.975, df);
    const diff = m1 - m2;
    const ci = [diff - tcrit * se, diff + tcrit * se];
    const sp = Math.sqrt((((n1 - 1) * v1) + ((n2 - 1) * v2)) / (n1 + n2 - 2));
    const d = diff / sp;
    return { n1, n2, m1, m2, s1, s2, t, df, p, diff, ci, d, se };
  },
  pearson(x, y) {
    const n = x.length;
    const mx = this.mean(x), my = this.mean(y);
    let num = 0, sx = 0, sy = 0;
    for (let i = 0; i < n; i++) {
      const dx = x[i] - mx;
      const dy = y[i] - my;
      num += dx * dy;
      sx += dx * dx;
      sy += dy * dy;
    }
    const r = num / Math.sqrt(sx * sy);
    const t = r * Math.sqrt((n - 2) / (1 - r * r));
    const p = n < 3 ? NaN : 2 * (1 - this.tcdf(Math.abs(t), n - 2));
    const ci = this.fisherCI(r, n);
    const slope = num / sx;
    const intercept = my - slope * mx;
    return { coef: r, p, n, ci, r2: r * r, slope, intercept };
  },
  rank(arr) {
    const items = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array(arr.length);
    let i = 0;
    while (i < items.length) {
      let j = i;
      while (j + 1 < items.length && items[j + 1].v === items[i].v) j++;
      const rank = (i + j + 2) / 2;
      for (let k = i; k <= j; k++) ranks[items[k].i] = rank;
      i = j + 1;
    }
    return ranks;
  },
  spearman(x, y) {
    return this.pearson(this.rank(x), this.rank(y));
  },
  olsTransformed(c, x, y) {
    const n = y.length;
    let Scc = 0, Scx = 0, Sxx = 0, Scy = 0, Sxy = 0;
    for (let i = 0; i < n; i++) {
      Scc += c[i] * c[i];
      Scx += c[i] * x[i];
      Sxx += x[i] * x[i];
      Scy += c[i] * y[i];
      Sxy += x[i] * y[i];
    }
    const det = Scc * Sxx - Scx * Scx;
    const alpha = (Scy * Sxx - Sxy * Scx) / det;
    const beta = (Sxy * Scc - Scy * Scx) / det;
    const resid = [];
    for (let i = 0; i < n; i++) resid.push(y[i] - (alpha * c[i] + beta * x[i]));
    const df = n - 2;
    const sse = resid.reduce((acc, v) => acc + v * v, 0);
    const s2 = sse / df;
    const inv11 = Scc / det;
    const seBeta = Math.sqrt(s2 * inv11);
    return { alpha, beta, resid, df, seBeta };
  },
  estimateRho(resid) {
    let num = 0, den = 0;
    for (let i = 1; i < resid.length; i++) {
      num += resid[i] * resid[i - 1];
      den += resid[i - 1] * resid[i - 1];
    }
    if (den === 0) return 0;
    return Math.max(-0.99, Math.min(0.99, num / den));
  },
  praisWinsten(years, values) {
    const n = years.length;
    const y = values.map(v => Math.log10(v));
    const x = years.slice();
    let c = new Array(n).fill(1);
    let fit = this.olsTransformed(c, x, y);
    let rho = this.estimateRho(fit.resid);
    let prev = null;
    for (let iter = 0; iter < 100; iter++) {
      const cT = [Math.sqrt(1 - rho * rho)];
      const xT = [cT[0] * x[0]];
      const yT = [cT[0] * y[0]];
      for (let i = 1; i < n; i++) {
        cT.push(1 - rho);
        xT.push(x[i] - rho * x[i - 1]);
        yT.push(y[i] - rho * y[i - 1]);
      }
      fit = this.olsTransformed(cT, xT, yT);
      const residOriginal = years.map((yr, i) => y[i] - (fit.alpha + fit.beta * yr));
      const newRho = this.estimateRho(residOriginal);
      if (prev !== null && Math.abs(newRho - prev) < 1e-8) { rho = newRho; break; }
      prev = rho;
      rho = newRho;
    }
    const beta = fit.beta;
    const df = n - 2;
    const t = beta / fit.seBeta;
    const p = 2 * (1 - this.tcdf(Math.abs(t), df));
    const tcrit = this.tInv(0.975, df);
    const ciBeta = [beta - tcrit * fit.seBeta, beta + tcrit * fit.seBeta];
    const apc = (Math.pow(10, beta) - 1) * 100;
    const ciApc = [(Math.pow(10, ciBeta[0]) - 1) * 100, (Math.pow(10, ciBeta[1]) - 1) * 100];
    let classification = 'estacionária';
    if (ciApc[0] > 0) classification = 'crescente';
    else if (ciApc[1] < 0) classification = 'decrescente';
    return { n, rho, alpha: fit.alpha, beta, seBeta: fit.seBeta, p, df, t, ciBeta, apc, ciApc, classification };
  }
};

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Falha ao carregar ${url} (${response.status})`);
  return response.json();
}

function normalizeBasePath(path) {
  return path.endsWith('/') ? path : `${path}/`;
}

function setHeader(title, subtitle, note = '') {
  pageTitle.textContent = title || 'Teste';
  pageSubtitle.textContent = subtitle || '';
  heroNote.textContent = note || 'A plataforma foi estruturada para receber novos testes por módulos independentes.';
}

function setActiveNav(testId) {
  const buttons = navEl.querySelectorAll('.test-link');
  buttons.forEach(btn => btn.classList.toggle('active', btn.dataset.testId === testId));
}

function renderNav(manifest) {
  utils.clearElement(navEl);
  manifest.forEach(item => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'test-link';
    button.dataset.testId = item.id;
    button.innerHTML = `
      <span class="test-link-title">${utils.escapeHtml(item.title)}</span>
      <span class="test-link-subtitle">${utils.escapeHtml(item.subtitle || '')}</span>
    `;
    button.addEventListener('click', () => loadTest(item, manifest));
    navEl.appendChild(button);
  });
}

async function loadTest(testItem, manifest) {
  try {
    setActiveNav(testItem.id);
    moduleRoot.innerHTML = `<div class="info-banner">Carregando <strong>${utils.escapeHtml(testItem.title)}</strong>...</div>`;
    const basePath = normalizeBasePath(testItem.path);
    const configUrl = new URL(`${basePath}config.json`, document.baseURI).href;
    const moduleUrl = new URL(`${basePath}module.js`, document.baseURI).href;
    const config = await fetchJson(configUrl);
    const module = await import(moduleUrl);
    setHeader(config.title || testItem.title, config.subtitle || testItem.subtitle || '', config.note || 'Preencha os dados da sua planilha, rode o teste e interprete a saída com base no contexto do estudo.');
    if (!module || typeof module.renderTestModule !== 'function') {
      throw new Error(`O módulo ${testItem.id} não exporta renderTestModule(ctx).`);
    }
    utils.clearElement(moduleRoot);
    await module.renderTestModule({ root: moduleRoot, config, manifest, currentTest: testItem, utils, stats: Stats });
  } catch (error) {
    console.error(error);
    utils.showError(moduleRoot, error.message || 'Erro desconhecido ao carregar o teste.');
  }
}

async function bootstrap() {
  try {
    utils.showLoading(navEl, 'Carregando testes...');
    const manifest = await fetchJson(new URL('./tests-manifest.json', document.baseURI).href);
    if (!Array.isArray(manifest) || !manifest.length) throw new Error('Nenhum teste encontrado no manifesto.');
    renderNav(manifest);
    await loadTest(manifest[0], manifest);
  } catch (error) {
    console.error(error);
    utils.showError(navEl, error.message || 'Não foi possível carregar os testes.');
    utils.showError(moduleRoot, 'Falha ao inicializar a aplicação.');
  }
}

bootstrap();
