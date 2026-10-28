// Lista de ocorrências e pendências com filtros, indicadores e exportação.
import { html, raw, montar, $, on, opcoes } from "../core/dom.js";
import { icone } from "../core/icones.js";
import { pode, nomeUnidade, nomeModulo, unidadesFiltro, modulosRotina, meuLogin } from "../core/sessao.js";
import { estadoVazio, indicador, seloPrioridade, seloStatusPendencia } from "../core/ui.js";
import { formatarData, relativo, hoje } from "../core/tempo.js";
import { numero, pct, decimal, normalizarTexto, moeda } from "../core/formato.js";
import { atualizarBusca } from "../core/rotas.js";
import { exportarCSV } from "../core/exportar.js";
import { CATEGORIAS_PENDENCIA, PRIORIDADES, STATUS_PENDENCIA, ORIGENS_PENDENCIA } from "../core/constantes.js";
import { resumoPendencias, FORMULAS } from "../services/indicadores.js";
import * as pend from "../services/pendencias.js";
import { cabecalho, resolverPeriodo, filtroPeriodo, ligarFiltros } from "./comum.js";
import { abrirNovaOcorrencia } from "./componentes/form-ocorrencia.js";

export default async function telaOcorrencias(el, ctx) {
  const unidades = unidadesFiltro().map((u) => u.id);
  const periodo = resolverPeriodo(ctx.busca, "30d");
  const b = ctx.busca;
  const visao = b.visao || "abertas";
  const setores = modulosRotina().map((m) => m.id).concat(["equipamentos", "estrutura", "marketing"]);

  const r = await resumoPendencias({ unidades, inicio: periodo.inicio, fim: periodo.fim, setores });
  let lista = r.lista;
  if (visao === "abertas") lista = lista.filter((p) => p.aberta);
  else lista = lista.filter((p) => p.aberta || (p.dataAbertura >= periodo.inicio && p.dataAbertura <= periodo.fim) || (p.dataConclusao >= periodo.inicio && p.dataConclusao <= periodo.fim));
  if (b.categoria && !b.nova) lista = lista.filter((p) => p.categoria === b.categoria);
  if (b.prioridade) lista = lista.filter((p) => p.prioridade === b.prioridade);
  if (b.status) lista = lista.filter((p) => p.status === b.status);
  if (b.filtro === "atrasadas") lista = lista.filter(pend.estaAtrasada);
  if (b.filtro === "minhas") lista = lista.filter((p) => p.responsavelLogin === meuLogin());
  if (b.filtro === "registradas") lista = lista.filter((p) => p.autorLogin === meuLogin());
  if (b.filtro === "sem-responsavel") lista = lista.filter((p) => !p.responsavelLogin && p.aberta);
  if (b.q) {
    const q = normalizarTexto(b.q);
    lista = lista.filter((p) => normalizarTexto(`${p.codigo} ${p.titulo} ${p.descricao} ${p.local} ${p.equipamentoNome} ${p.responsavelNome}`).includes(q));
  }
  const ordemP = (p) => PRIORIDADES[p.prioridade]?.ordem ?? 9;
  lista.sort((a, c) => Number(c.aberta) - Number(a.aberta) || ordemP(a) - ordemP(c) || (a.prazo || "").localeCompare(c.prazo || ""));
  const supervisao = pode("pendencias", 2) || setores.some((s) => pode(s, 2));

  montar(
    el,
    html`${cabecalho(
      "Ocorrências e pendências",
      "Tudo que precisa de solução: registrado, com responsável, prazo e histórico.",
      html`<button class="btn btn-primario" data-nova>${icone("mais")} Registrar ocorrência</button>`
    )}
    ${supervisao
      ? html`<div class="indicadores" style="margin-bottom:20px">
          ${indicador({ rotulo: "Abertas", valor: numero(r.abertas) })}
          ${indicador({ rotulo: "Críticas", valor: numero(r.criticas), tom: r.criticas ? "critico" : "" })}
          ${indicador({ rotulo: "Atrasadas", valor: numero(r.atrasadas), tom: r.atrasadas ? "alerta" : "" })}
          ${indicador({ rotulo: "Vencem em 1 dia", valor: numero(r.vencendo) })}
          ${indicador({ rotulo: "Resolvidas no período", valor: numero(r.resolvidasPeriodo), nota: periodo.rotulo })}
          ${indicador({ rotulo: "Cumprimento de prazos", valor: pct(r.cumprimentoPrazo), formula: FORMULAS.prazoPendencias })}
          ${indicador({ rotulo: "Tempo médio de solução", valor: r.tempoMedio === null ? "—" : decimal(r.tempoMedio), sufixo: r.tempoMedio === null ? "" : " dias", formula: FORMULAS.tempoResolucao })}
        </div>`
      : ""}
    ${filtroPeriodo(periodo, {
      extras: html`<div class="campo"><label for="f-visao">Mostrar</label><select id="f-visao" name="visao">${opcoes(
          [{ valor: "abertas", rotulo: "Somente abertas" }, { valor: "todas", rotulo: "Abertas + do período" }],
          visao
        )}</select></div>
        <div class="campo"><label for="f-cat">Categoria</label><select id="f-cat" name="categoria">${html`<option value="">Todas</option>`}${opcoes(CATEGORIAS_PENDENCIA.map((c) => ({ valor: c.id, rotulo: c.nome })), b.categoria)}</select></div>
        <div class="campo"><label for="f-pri">Prioridade</label><select id="f-pri" name="prioridade">${html`<option value="">Todas</option>`}${opcoes(Object.entries(PRIORIDADES).map(([v, p]) => ({ valor: v, rotulo: p.rotulo })), b.prioridade)}</select></div>
        <div class="campo"><label for="f-st">Status</label><select id="f-st" name="status">${html`<option value="">Todos</option>`}${opcoes(Object.entries(STATUS_PENDENCIA).map(([v, s]) => ({ valor: v, rotulo: s.rotulo })), b.status)}</select></div>
        <div class="campo"><label for="f-filtro">Atalho</label><select id="f-filtro" name="filtro">${opcoes(
          [
            { valor: "", rotulo: "—" },
            { valor: "minhas", rotulo: "Sob minha responsabilidade" },
            { valor: "registradas", rotulo: "Registradas por mim" },
            { valor: "atrasadas", rotulo: "Atrasadas" },
            { valor: "sem-responsavel", rotulo: "Sem responsável" },
          ],
          b.filtro || ""
        )}</select></div>
        <div class="campo" style="flex:1 1 220px"><label for="f-q">Buscar</label><input id="f-q" name="q" value="${b.q || ""}" placeholder="Código, título, local…" /></div>
        <div class="campo" style="flex:0 0 auto"><label>&nbsp;</label><button type="button" class="btn btn-secundario btn-sm" data-csv style="min-height:40px">${icone("baixar")} CSV</button></div>`,
    })}
    ${lista.length
      ? html`<div class="tabela-envoltorio"><table class="tabela responsiva">
          <thead><tr><th>Ocorrência</th><th>Unidade</th><th>Setor</th><th>Prioridade</th><th>Status</th><th>Responsável</th><th>Prazo</th></tr></thead>
          <tbody>${lista.map((p) => {
            const atrasada = pend.estaAtrasada(p);
            return html`<tr class="clicavel" data-id="${p.id}">
              <td class="principal-celula" data-rotulo="Ocorrência"><span class="texto-3 pequeno numero">${p.codigo}</span><div class="forte quebra">${p.titulo}</div>
                <div class="pequeno texto-3">${[p.equipamentoNome || p.local, ORIGENS_PENDENCIA[p.origem] !== ORIGENS_PENDENCIA.ocorrencia ? ORIGENS_PENDENCIA[p.origem] : "", `aberta ${relativo(p.criadoEm)}`].filter(Boolean).join(" · ")}</div></td>
              <td data-rotulo="Unidade">${nomeUnidade(p.unidadeId)}</td>
              <td data-rotulo="Setor">${nomeModulo(p.setorId)}</td>
              <td data-rotulo="Prioridade">${seloPrioridade(p.prioridade)}</td>
              <td data-rotulo="Status">${seloStatusPendencia(p.status)}</td>
              <td data-rotulo="Responsável">${p.responsavelNome || html`<span class="texto-3">A definir</span>`}</td>
              <td data-rotulo="Prazo"><span style="${atrasada ? "color:var(--pendente);font-weight:700" : ""}">${p.aberta ? formatarData(p.prazo) : formatarData(p.dataConclusao)}</span>${atrasada ? html`<div class="pequeno" style="color:var(--pendente)">atrasada</div>` : !p.aberta ? html`<div class="pequeno texto-3">concluída</div>` : ""}</td>
            </tr>`;
          })}</tbody></table></div>
          <p class="pequeno texto-3" style="margin-top:8px">${numero(lista.length)} registro(s)</p>`
      : estadoVazio({
          icone: "okCirculo",
          titulo: visao === "abertas" ? "Nenhuma ocorrência aberta" : "Nada encontrado",
          texto: visao === "abertas" ? "Quando alguém registrar um problema, ele aparece aqui até ser resolvido." : "Ajuste os filtros para ver outros registros.",
        })}`
  );

  ligarFiltros(el, (d) => atualizarBusca(d, { recarregar: true }));
  on(el, "click", "[data-id]", (ev, tr) => (location.hash = `#/ocorrencias/${tr.dataset.id}`));
  on(el, "click", "[data-nova]", async () => {
    const criada = await abrirNovaOcorrencia({});
    if (criada) location.hash = `#/ocorrencias/${criada.id}`;
  });
  on(el, "click", "[data-csv]", () =>
    exportarCSV(`ocorrencias-${hoje()}`, lista, [
      { titulo: "Código", valor: (p) => p.codigo },
      { titulo: "Título", valor: (p) => p.titulo },
      { titulo: "Descrição", valor: (p) => p.descricao },
      { titulo: "Unidade", valor: (p) => nomeUnidade(p.unidadeId) },
      { titulo: "Setor", valor: (p) => nomeModulo(p.setorId) },
      { titulo: "Categoria", valor: (p) => CATEGORIAS_PENDENCIA.find((c) => c.id === p.categoria)?.nome || p.categoria },
      { titulo: "Origem", valor: (p) => ORIGENS_PENDENCIA[p.origem] || p.origem },
      { titulo: "Local / equipamento", valor: (p) => p.equipamentoNome || p.local },
      { titulo: "Prioridade", valor: (p) => PRIORIDADES[p.prioridade]?.rotulo },
      { titulo: "Status", valor: (p) => STATUS_PENDENCIA[p.status]?.rotulo },
      { titulo: "Registrado por", valor: (p) => p.autorNome },
      { titulo: "Aberta em", valor: (p) => formatarData(p.dataAbertura) },
      { titulo: "Responsável", valor: (p) => p.responsavelNome },
      { titulo: "Prazo", valor: (p) => formatarData(p.prazo) },
      { titulo: "Concluída em", valor: (p) => (p.dataConclusao ? formatarData(p.dataConclusao) : "") },
      { titulo: "No prazo", valor: (p) => (p.status === "resolvida" ? (p.noPrazo === false ? "Não" : "Sim") : "") },
      { titulo: "Solução", valor: (p) => p.solucao },
      { titulo: "Custo (R$)", valor: (p) => (p.custoTotal || 0) / 100 },
    ])
  );
  // Debounce simples da busca: Enter ou sair do campo dispara o filtro (change)
  if (b.nova) {
    atualizarBusca({ nova: "", categoria: "" });
    const criada = await abrirNovaOcorrencia({ categoria: CATEGORIAS_PENDENCIA.some((c) => c.id === b.categoria) ? b.categoria : "" });
    if (criada) location.hash = `#/ocorrencias/${criada.id}`;
  }
}

export { raw, $, moeda };
