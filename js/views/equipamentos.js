// Equipamentos: lista com situação, inspeções, indicadores de manutenção e custos.
import { html, montar, on, opcoes } from "../core/dom.js";
import { icone } from "../core/icones.js";
import { pode, nomeUnidade, unidadesFiltro } from "../core/sessao.js";
import { estadoVazio, indicador, seloSituacao } from "../core/ui.js";
import { formatarData, hoje, inicioMes, mesDe } from "../core/tempo.js";
import { numero, moeda, normalizarTexto } from "../core/formato.js";
import { atualizarBusca } from "../core/rotas.js";
import { exportarCSV } from "../core/exportar.js";
import { SITUACOES_EQUIPAMENTO, CATEGORIAS_EQUIPAMENTO } from "../core/constantes.js";
import { listarEquipamentos, inspecaoVencida, listarCustos } from "../services/manutencao.js";
import { resumoPendencias } from "../services/indicadores.js";
import { cabecalho } from "./comum.js";
import { abrirCadastroEquipamento } from "./componentes/manutencao-forms.js";
import { abrirNovaOcorrencia } from "./componentes/form-ocorrencia.js";

export default async function telaEquipamentos(el, ctx) {
  const unidades = unidadesFiltro().map((u) => u.id);
  const b = ctx.busca;
  const [todos, pendencias, custos] = await Promise.all([
    listarEquipamentos(unidades),
    pode("equipamentos", 2) ? resumoPendencias({ unidades, inicio: inicioMes(mesDe(hoje())), fim: hoje(), setores: ["equipamentos"] }).catch(() => null) : null,
    pode("equipamentos", 2) ? listarCustos({ unidades, inicio: inicioMes(mesDe(hoje())), fim: hoje(), setores: ["equipamentos"] }).catch(() => []) : [],
  ]);
  const ativos = todos.filter((e) => e.ativo !== false);
  let lista = b.inativos ? todos : ativos;
  if (b.situacao) lista = lista.filter((e) => (e.situacao || "operando") === b.situacao);
  if (b.categoria) lista = lista.filter((e) => e.categoria === b.categoria);
  if (b.filtro === "vencidas") lista = lista.filter(inspecaoVencida);
  if (b.q) {
    const q = normalizarTexto(b.q);
    lista = lista.filter((e) => normalizarTexto(`${e.codigo} ${e.nome} ${e.localizacao} ${e.marca}`).includes(q));
  }
  const pendAbertasPorEq = {};
  (pendencias?.lista || []).filter((p) => p.aberta && p.equipamentoId).forEach((p) => (pendAbertasPorEq[p.equipamentoId] = (pendAbertasPorEq[p.equipamentoId] || 0) + 1));
  // Recorrente: 3 ou mais ocorrências (abertas ou do mês) para o mesmo equipamento
  const contagemEq = new Map();
  for (const p of pendencias?.lista || []) if (p.equipamentoId) contagemEq.set(p.equipamentoId, (contagemEq.get(p.equipamentoId) || 0) + 1);
  const recorrentes = new Set([...contagemEq.entries()].filter(([, n]) => n >= 3).map(([id]) => id));
  const contar = (s) => ativos.filter((e) => (e.situacao || "operando") === s).length;
  const custoMes = custos.reduce((s, c) => s + (c.valor || 0), 0);

  montar(
    el,
    html`${cabecalho(
      "Equipamentos",
      "Cadastro dos aparelhos, situação atual, inspeções e histórico de manutenção.",
      html`${pode("pendencias", 1) ? html`<button class="btn btn-secundario" data-problema>${icone("alerta")} Informar problema</button>` : ""}
        ${pode("equipamentos", 3) ? html`<button class="btn btn-primario" data-novo>${icone("mais")} Novo equipamento</button>` : ""}`
    )}
    <div class="indicadores" style="margin-bottom:20px">
      ${indicador({ rotulo: "Equipamentos ativos", valor: numero(ativos.length) })}
      ${indicador({ rotulo: "Operando", valor: numero(contar("operando")), tom: "positivo" })}
      ${indicador({ rotulo: "Em manutenção / aguardando", valor: numero(contar("em_manutencao") + contar("aguardando_manutencao") + contar("aguardando_avaliacao")), tom: contar("em_manutencao") + contar("aguardando_manutencao") + contar("aguardando_avaliacao") ? "alerta" : "" })}
      ${indicador({ rotulo: "Interditados", valor: numero(contar("interditado")), tom: contar("interditado") ? "critico" : "" })}
      ${indicador({ rotulo: "Inspeções vencidas", valor: numero(ativos.filter(inspecaoVencida).length), tom: ativos.filter(inspecaoVencida).length ? "alerta" : "" })}
      ${pode("equipamentos", 2) ? indicador({ rotulo: "Custos no mês", valor: moeda(custoMes) }) : ""}
    </div>
    <form class="filtros" data-filtros>
      <div class="campo"><label for="f-sit">Situação</label><select id="f-sit" name="situacao"><option value="">Todas</option>${opcoes(Object.entries(SITUACOES_EQUIPAMENTO).map(([v, s]) => ({ valor: v, rotulo: s.rotulo })), b.situacao)}</select></div>
      <div class="campo"><label for="f-cat">Categoria</label><select id="f-cat" name="categoria"><option value="">Todas</option>${opcoes(CATEGORIAS_EQUIPAMENTO, b.categoria)}</select></div>
      <div class="campo"><label for="f-filtro">Inspeção</label><select id="f-filtro" name="filtro">${opcoes([{ valor: "", rotulo: "Todas" }, { valor: "vencidas", rotulo: "Vencidas" }], b.filtro || "")}</select></div>
      <div class="campo" style="flex:1 1 220px"><label for="f-q">Buscar</label><input id="f-q" name="q" value="${b.q || ""}" placeholder="Código, nome, local…" /></div>
      <label class="marcar" style="padding-bottom:8px"><input type="checkbox" name="inativos" ${b.inativos ? "checked" : ""} /> Mostrar baixados</label>
      <div class="campo" style="flex:0 0 auto"><label>&nbsp;</label><button type="button" class="btn btn-secundario btn-sm" data-csv style="min-height:40px">${icone("baixar")} CSV</button></div>
    </form>
    ${lista.length
      ? html`<div class="tabela-envoltorio"><table class="tabela responsiva">
          <thead><tr><th>Equipamento</th><th>Unidade</th><th>Localização</th><th>Situação</th><th>Conservação</th><th>Próxima inspeção</th><th class="num">Ocorrências abertas</th></tr></thead>
          <tbody>${lista.map((e) => {
            const vencida = inspecaoVencida(e);
            return html`<tr class="clicavel" data-id="${e.id}" style="${e.ativo === false ? "opacity:.55" : ""}">
              <td class="principal-celula" data-rotulo="Equipamento"><span class="texto-3 pequeno numero">${e.codigo}</span><div class="forte">${e.nome}${recorrentes.has(e.id) ? html` <span class="selo selo-pendente sem-ponto">Recorrente</span>` : ""}</div><div class="pequeno texto-3">${e.categoria}${e.marca ? ` · ${e.marca}` : ""}</div></td>
              <td data-rotulo="Unidade">${nomeUnidade(e.unidadeId)}</td>
              <td data-rotulo="Localização">${e.localizacao || "—"}</td>
              <td data-rotulo="Situação">${e.ativo === false ? html`<span class="selo selo-tracejado">Baixado</span>` : seloSituacao(e.situacao)}</td>
              <td data-rotulo="Conservação">${e.conservacao || "—"}</td>
              <td data-rotulo="Próxima inspeção"><span style="${vencida ? "color:var(--pendente);font-weight:700" : ""}">${e.proximaInspecao ? formatarData(e.proximaInspecao) : "—"}</span>${vencida ? html`<div class="pequeno" style="color:var(--pendente)">vencida</div>` : ""}</td>
              <td class="num" data-rotulo="Ocorrências abertas">${pendAbertasPorEq[e.id] || 0}</td>
            </tr>`;
          })}</tbody></table></div>`
      : estadoVazio({
          icone: "halter",
          titulo: todos.length ? "Nenhum equipamento com esses filtros" : "Nenhum equipamento cadastrado",
          texto: todos.length ? "Ajuste os filtros acima." : "Cadastre os aparelhos para acompanhar situação, inspeções e manutenções.",
          acao: !todos.length && pode("equipamentos", 3) ? html`<button class="btn btn-primario" data-novo>${icone("mais")} Cadastrar equipamento</button>` : "",
        })}`
  );

  const form = el.querySelector("[data-filtros]");
  form.addEventListener("change", () => {
    const d = Object.fromEntries(new FormData(form).entries());
    atualizarBusca({ situacao: d.situacao, categoria: d.categoria, filtro: d.filtro, q: d.q, inativos: d.inativos ? "1" : "" }, { recarregar: true });
  });
  form.addEventListener("submit", (ev) => ev.preventDefault());
  on(el, "click", "[data-id]", (ev, tr) => (location.hash = `#/equipamentos/${tr.dataset.id}`));
  on(el, "click", "[data-novo]", async () => {
    const id = await abrirCadastroEquipamento(null, { unidadeId: unidades.length === 1 ? unidades[0] : undefined });
    if (id) location.hash = `#/equipamentos/${id}`;
  });
  on(el, "click", "[data-problema]", async () => {
    const c = await abrirNovaOcorrencia({ categoria: "equipamentos" });
    if (c) ctx.recarregar();
  });
  on(el, "click", "[data-csv]", () =>
    exportarCSV(`equipamentos-${hoje()}`, lista, [
      { titulo: "Código", valor: (e) => e.codigo },
      { titulo: "Nome", valor: (e) => e.nome },
      { titulo: "Categoria", valor: (e) => e.categoria },
      { titulo: "Unidade", valor: (e) => nomeUnidade(e.unidadeId) },
      { titulo: "Localização", valor: (e) => e.localizacao },
      { titulo: "Situação", valor: (e) => (e.ativo === false ? "Baixado" : SITUACOES_EQUIPAMENTO[e.situacao || "operando"]?.rotulo) },
      { titulo: "Conservação", valor: (e) => e.conservacao },
      { titulo: "Marca", valor: (e) => e.marca },
      { titulo: "Modelo", valor: (e) => e.modelo },
      { titulo: "Nº de série", valor: (e) => e.numeroSerie },
      { titulo: "Última inspeção", valor: (e) => (e.ultimaInspecao ? formatarData(e.ultimaInspecao) : "") },
      { titulo: "Próxima inspeção", valor: (e) => (e.proximaInspecao ? formatarData(e.proximaInspecao) : "") },
    ])
  );
}
