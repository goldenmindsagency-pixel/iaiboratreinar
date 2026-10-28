// Gráficos em SVG puro (linha e barras), com dicas ao passar o mouse/tocar.
import { html, raw, esc } from "./dom.js";

export const CORES_SERIES = ["#fda905", "#5aa9ff", "#3dd68c", "#b49cff", "#ff7a6b", "#d9d4ca"];

const L = 640;
const A = 230;
const M = { top: 16, right: 16, bottom: 30, left: 44 };

function escalaY(max) {
  if (max <= 0) return { max: 1, passos: [0, 0.5, 1] };
  const bruto = max / 4;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const n = bruto / pot;
  const passo = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pot;
  const topo = Math.ceil(max / passo) * passo;
  const passos = [];
  for (let v = 0; v <= topo + passo / 2; v += passo) passos.push(Number(v.toFixed(6)));
  return { max: topo, passos };
}

function rotulosX(rotulos, larguraUtil) {
  const maximo = Math.max(2, Math.floor(larguraUtil / 58));
  const salto = Math.ceil(rotulos.length / maximo);
  return rotulos.map((r, i) => (i % salto === 0 || i === rotulos.length - 1 ? r : ""));
}

/**
 * grafico de linha
 * { rotulos: [], series: [{ nome, valores: [number|null] }], formato: (v)=>string, maximo }
 */
export function graficoLinha({ rotulos, series, formato = (v) => String(v), maximo, titulo = "Gráfico" }) {
  const todos = series.flatMap((s) => s.valores.filter((v) => v !== null && v !== undefined));
  const { max, passos } = escalaY(maximo ?? Math.max(0, ...todos));
  const lu = L - M.left - M.right;
  const au = A - M.top - M.bottom;
  const x = (i) => M.left + (rotulos.length <= 1 ? lu / 2 : (i * lu) / (rotulos.length - 1));
  const y = (v) => M.top + au - (v / max) * au;
  const rx = rotulosX(rotulos, lu);

  const grade = passos
    .map((p) => `<line class="grade" x1="${M.left}" x2="${L - M.right}" y1="${y(p)}" y2="${y(p)}"/><text x="${M.left - 8}" y="${y(p) + 4}" text-anchor="end">${esc(formato(p))}</text>`)
    .join("");
  const eixoX = rx.map((r, i) => (r ? `<text x="${x(i)}" y="${A - 8}" text-anchor="middle">${esc(r)}</text>` : "")).join("");

  const linhas = series
    .map((s, si) => {
      const cor = s.cor || CORES_SERIES[si % CORES_SERIES.length];
      let d = "";
      let caneta = false;
      s.valores.forEach((v, i) => {
        if (v === null || v === undefined) {
          caneta = false;
          return;
        }
        d += `${caneta ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
        caneta = true;
      });
      const area =
        si === 0 && series.length === 1 && s.valores.every((v) => v !== null && v !== undefined) && s.valores.length > 1
          ? `<path d="${d}L${x(s.valores.length - 1)},${y(0)}L${x(0)},${y(0)}Z" fill="${cor}" opacity="0.08"/>`
          : "";
      const pontos = s.valores
        .map((v, i) =>
          v === null || v === undefined
            ? ""
            : `<circle cx="${x(i)}" cy="${y(v)}" r="${rotulos.length > 20 ? 2.5 : 3.5}" fill="#131315" stroke="${cor}" stroke-width="2" data-dica="${esc(`${rotulos[i]} · ${s.nome}: ${formato(v)}`)}"/>`
        )
        .join("");
      return `${area}<path d="${d}" fill="none" stroke="${cor}" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round"/>${pontos}`;
    })
    .join("");

  const legenda =
    series.length > 1
      ? html`<div class="legenda">${series.map((s, i) => html`<span><i style="background:${s.cor || CORES_SERIES[i % CORES_SERIES.length]}"></i>${s.nome}</span>`)}</div>`
      : "";
  return html`<svg class="grafico" viewBox="0 0 ${L} ${A}" role="img" aria-label="${titulo}">${raw(grade + eixoX + linhas)}</svg>${legenda}`;
}

/**
 * grafico de barras verticais (agrupadas ou empilhadas)
 * { rotulos: [], series: [{ nome, valores, cor }], empilhado, formato }
 */
export function graficoBarras({ rotulos, series, empilhado = false, formato = (v) => String(v), maximo, titulo = "Gráfico" }) {
  const totais = rotulos.map((_, i) =>
    empilhado ? series.reduce((s, se) => s + (se.valores[i] || 0), 0) : Math.max(0, ...series.map((se) => se.valores[i] || 0))
  );
  const { max, passos } = escalaY(maximo ?? Math.max(0, ...totais));
  const lu = L - M.left - M.right;
  const au = A - M.top - M.bottom;
  const banda = lu / Math.max(1, rotulos.length);
  const larguraGrupo = Math.min(banda * 0.7, 56);
  const y = (v) => M.top + au - (v / max) * au;
  const rx = rotulosX(rotulos, lu);

  const grade = passos
    .map((p) => `<line class="grade" x1="${M.left}" x2="${L - M.right}" y1="${y(p)}" y2="${y(p)}"/><text x="${M.left - 8}" y="${y(p) + 4}" text-anchor="end">${esc(formato(p))}</text>`)
    .join("");
  let barras = "";
  rotulos.forEach((rot, i) => {
    const cx = M.left + banda * i + banda / 2;
    if (empilhado) {
      let base = 0;
      series.forEach((s, si) => {
        const v = s.valores[i] || 0;
        if (!v) return;
        const cor = s.cor || CORES_SERIES[si % CORES_SERIES.length];
        const y1 = y(base + v);
        const h = y(base) - y1;
        barras += `<rect x="${cx - larguraGrupo / 2}" y="${y1}" width="${larguraGrupo}" height="${Math.max(0, h - 1)}" rx="2" fill="${cor}" data-dica="${esc(`${rot} · ${s.nome}: ${formato(v)}`)}"/>`;
        base += v;
      });
    } else {
      const lb = larguraGrupo / series.length;
      series.forEach((s, si) => {
        const v = s.valores[i] || 0;
        const cor = s.cor || CORES_SERIES[si % CORES_SERIES.length];
        const x0 = cx - larguraGrupo / 2 + lb * si;
        barras += `<rect x="${x0 + 1}" y="${y(v)}" width="${Math.max(1, lb - 2)}" height="${Math.max(0, y(0) - y(v))}" rx="3" fill="${cor}" data-dica="${esc(`${rot} · ${s.nome}: ${formato(v)}`)}"/>`;
      });
    }
  });
  const eixoX = rx.map((r, i) => (r ? `<text x="${M.left + banda * i + banda / 2}" y="${A - 8}" text-anchor="middle">${esc(r)}</text>` : "")).join("");
  const legenda =
    series.length > 1
      ? html`<div class="legenda">${series.map((s, i) => html`<span><i style="background:${s.cor || CORES_SERIES[i % CORES_SERIES.length]}"></i>${s.nome}</span>`)}</div>`
      : "";
  return html`<svg class="grafico" viewBox="0 0 ${L} ${A}" role="img" aria-label="${titulo}">${raw(grade + barras + eixoX)}</svg>${legenda}`;
}

/** Lista em barras horizontais (ranking): [{ rotulo, valor, detalhe }] */
export function ranking(itens, { formato = (v) => String(v), maximo } = {}) {
  const max = maximo ?? Math.max(1, ...itens.map((i) => i.valor || 0));
  return html`<div class="ranking">
    ${itens.map(
      (i) => html`<div class="ranking-item">
        <span class="quebra">${i.rotulo}${i.detalhe ? html` <span class="texto-3">· ${i.detalhe}</span>` : ""}</span>
        <strong class="numero">${formato(i.valor)}</strong>
        <div class="barra-progresso"><span style="width:${((100 * (i.valor || 0)) / max).toFixed(1)}%;background:${i.cor || "var(--ambar)"}"></span></div>
      </div>`
    )}
  </div>`;
}

/** Ativa as dicas dos gráficos (uma vez por página) */
export function ativarDicas() {
  if (window.__dicasAtivas) return;
  window.__dicasAtivas = true;
  let dica = null;
  const mostrar = (ev) => {
    const alvo = ev.target.closest?.("[data-dica]");
    if (!alvo) {
      dica?.remove();
      dica = null;
      return;
    }
    if (!dica) {
      dica = document.createElement("div");
      dica.className = "dica-grafico";
      document.body.appendChild(dica);
    }
    dica.textContent = alvo.getAttribute("data-dica");
    const px = ev.clientX ?? ev.touches?.[0]?.clientX ?? 0;
    const py = ev.clientY ?? ev.touches?.[0]?.clientY ?? 0;
    const largura = dica.offsetWidth;
    dica.style.left = `${Math.min(window.innerWidth - largura - 8, Math.max(8, px - largura / 2))}px`;
    dica.style.top = `${Math.max(8, py - 44)}px`;
  };
  document.addEventListener("mousemove", mostrar);
  document.addEventListener("touchstart", mostrar, { passive: true });
  document.addEventListener("scroll", () => {
    dica?.remove();
    dica = null;
  }, { passive: true });
}
