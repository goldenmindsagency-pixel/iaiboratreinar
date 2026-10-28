// Peças de página reutilizadas pelas telas do painel.
import { html, raw, opcoes } from "../core/dom.js";
import { icone } from "../core/icones.js";
import { minhasUnidades, unidadesFiltro, sessao } from "../core/sessao.js";
import { hoje, somarDias, inicioMes, mesDe, fimMes, somarMeses, formatarData, nomeMes } from "../core/tempo.js";

export function cabecalho(titulo, subtitulo, acoes) {
  return html`<div class="cabecalho-pagina">
    <div><h1>${titulo}</h1>${subtitulo ? html`<p>${subtitulo}</p>` : ""}</div>
    ${acoes ? html`<div class="cabecalho-acoes">${acoes}</div>` : ""}
  </div>`;
}

/** abas: [{ id, rotulo, contador }] */
export function abas(lista, ativa, base) {
  return html`<nav class="abas" aria-label="Seções">
    ${lista.map(
      (a) => html`<a class="aba ${a.id === ativa ? "ativa" : ""}" href="${base}${base.includes("?") ? "&" : "?"}aba=${a.id}" ${raw(a.id === ativa ? 'aria-current="page"' : "")}>
        ${a.rotulo}${a.contador ? html` <span class="selo selo-pendente sem-ponto" style="height:20px;padding:0 7px">${a.contador}</span>` : ""}
      </a>`
    )}
  </nav>`;
}

export const PERIODOS = [
  { id: "hoje", rotulo: "Hoje" },
  { id: "7d", rotulo: "Últimos 7 dias" },
  { id: "30d", rotulo: "Últimos 30 dias" },
  { id: "mes", rotulo: "Este mês" },
  { id: "mes-anterior", rotulo: "Mês anterior" },
  { id: "personalizado", rotulo: "Personalizado" },
];

export function resolverPeriodo(busca, padrao = "7d") {
  const id = busca.periodo || padrao;
  const d = hoje();
  switch (id) {
    case "hoje":
      return { id, inicio: d, fim: d, rotulo: "Hoje" };
    case "30d":
      return { id, inicio: somarDias(d, -29), fim: d, rotulo: "Últimos 30 dias" };
    case "mes":
      return { id, inicio: inicioMes(mesDe(d)), fim: d, rotulo: nomeMes(mesDe(d)) };
    case "mes-anterior": {
      const m = somarMeses(mesDe(d), -1);
      return { id, inicio: inicioMes(m), fim: fimMes(m), rotulo: nomeMes(m) };
    }
    case "personalizado": {
      const ini = /^\d{4}-\d{2}-\d{2}$/.test(busca.de || "") ? busca.de : somarDias(d, -6);
      let fim = /^\d{4}-\d{2}-\d{2}$/.test(busca.ate || "") ? busca.ate : d;
      if (fim < ini) fim = ini;
      return { id, inicio: ini, fim, rotulo: `${formatarData(ini)} a ${formatarData(fim)}` };
    }
    default:
      return { id: "7d", inicio: somarDias(d, -6), fim: d, rotulo: "Últimos 7 dias" };
  }
}

/** Barra de filtros de período (+ extras). Os valores ficam no endereço da página. */
export function filtroPeriodo(periodo, { extras = "" } = {}) {
  return html`<form class="filtros" data-filtros>
    <div class="campo">
      <label for="f-periodo">Período</label>
      <select id="f-periodo" name="periodo">${opcoes(PERIODOS.map((p) => ({ valor: p.id, rotulo: p.rotulo })), periodo.id)}</select>
    </div>
    <div class="campo ${periodo.id === "personalizado" ? "" : "oculto"}" data-personalizado>
      <label for="f-de">De</label><input id="f-de" type="date" name="de" value="${periodo.inicio}" />
    </div>
    <div class="campo ${periodo.id === "personalizado" ? "" : "oculto"}" data-personalizado>
      <label for="f-ate">Até</label><input id="f-ate" type="date" name="ate" value="${periodo.fim}" />
    </div>
    ${extras}
  </form>`;
}

/** Liga os filtros ao endereço da página (cada mudança recarrega a tela) */
export function ligarFiltros(el, aoMudar) {
  const form = el.querySelector("[data-filtros]");
  if (!form) return;
  form.addEventListener("change", (ev) => {
    const dados = Object.fromEntries(new FormData(form).entries());
    if (ev.target.name === "periodo") {
      form.querySelectorAll("[data-personalizado]").forEach((c) => c.classList.toggle("oculto", dados.periodo !== "personalizado"));
      if (dados.periodo === "personalizado") return;
      delete dados.de;
      delete dados.ate;
    }
    aoMudar(dados);
  });
  form.addEventListener("submit", (ev) => ev.preventDefault());
}

/** Seletor de unidade local (dentro da página) */
export function seletorUnidade(nome, selecionada, { todas = false, rotulo = "Unidade", obrigatorio = false } = {}) {
  const lista = minhasUnidades();
  if (lista.length <= 1 && !todas) {
    const u = lista[0];
    return html`<input type="hidden" name="${nome}" value="${u?.id || ""}" />`;
  }
  return html`<div class="campo">
    <label for="f-${nome}" class="${obrigatorio ? "obrigatorio" : ""}">${rotulo}</label>
    <select id="f-${nome}" name="${nome}" ${raw(obrigatorio ? "required" : "")}>
      ${todas ? html`<option value="">Todas as unidades</option>` : html`<option value="">Selecione</option>`}
      ${opcoes(lista.map((u) => ({ valor: u.id, rotulo: u.nome })), selecionada)}
    </select>
  </div>`;
}

export function unidadePadrao() {
  const filtro = unidadesFiltro();
  return filtro.length === 1 ? filtro[0].id : minhasUnidades()[0]?.id || "";
}

export function linkVoltar(href, texto = "Voltar") {
  return html`<a class="btn btn-fantasma btn-sm nao-imprimir" href="${href}" style="margin-bottom:12px">${icone("esquerda")} ${texto}</a>`;
}

export function rotuloUnidades() {
  const f = unidadesFiltro();
  if (f.length === minhasUnidades().length && f.length > 1) return "todas as unidades";
  return f.map((u) => u.nome).join(", ");
}

export { sessao };
