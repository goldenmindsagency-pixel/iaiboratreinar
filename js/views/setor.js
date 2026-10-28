// Página de um setor com rotinas: acompanhamento do dia, indicadores, histórico, registros e modelos.
import { html, raw, montar, $, on, opcoes } from "../core/dom.js";
import { icone } from "../core/icones.js";
import { pode, nomeModulo, nomeUnidade, unidadesFiltro, minhasUnidades, meuLogin, sessao } from "../core/sessao.js";
import { estadoVazio, estadoErro, carregandoPagina, indicador, anel, avisar, avisarErro, confirmar } from "../core/ui.js";
import { hoje, formatarData, formatarDataHora, rotuloPeriodo, somarDias, nomeDiaSemana } from "../core/tempo.js";
import { pct, numero } from "../core/formato.js";
import { atualizarBusca } from "../core/rotas.js";
import { graficoLinha, graficoBarras, ranking } from "../core/graficos.js";
import { exportarCSV } from "../core/exportar.js";
import { TIPOS_REGISTRO, DIAS_SEMANA } from "../core/constantes.js";
import {
  listarModelos, modelosVisiveis, ocorrenciasProgramadas, listarExecucoes, carregarEscalas, situacaoOcorrencia, ROTULOS_SITUACAO,
  podeEnviarAgora, souResponsavel, alterarAtivoModelo, duplicarModelo, minhasTarefas, listarRegistros,
} from "../services/rotinas.js";
import { resumoRotinas, FORMULAS } from "../services/indicadores.js";
import { nomePessoa } from "../services/usuarios.js";
import { cabecalho, abas, resolverPeriodo, filtroPeriodo, ligarFiltros, rotuloUnidades } from "./comum.js";
import { abrirExecucao, seloExecucao } from "./componentes/execucao-detalhe.js";
import { cartaoTarefa } from "./tarefas.js";

const DESCRICOES = {
  limpeza: "Checklists de limpeza e conservação por bloco de horário.",
  recepcao: "Relatórios de turno, abertura, fechamento e atendimentos.",
  salao: "Checklist diário da coordenação e registros de orientação da equipe.",
  comercial: "Relatório diário de prospecção e contatos, metas e dados do EVO.",
};

export default async function telaSetor(el, ctx) {
  const setorId = ctx.params.setor;
  const nome = nomeModulo(setorId);
  ctx.definirTitulo(nome);
  const supervisor = pode(setorId, 2);
  const tipoRegistro = { recepcao: "atendimento", comercial: "contato", salao: "feedback" }[setorId];

  const lista = [];
  if (supervisor) lista.push({ id: "acompanhar", rotulo: "Acompanhar" });
  else lista.push({ id: "minhas", rotulo: "Minhas rotinas" });
  if (setorId === "comercial" && supervisor) lista.push({ id: "painel", rotulo: "Painel comercial" });
  if (supervisor) lista.push({ id: "indicadores", rotulo: "Indicadores" });
  lista.push({ id: "historico", rotulo: supervisor ? "Histórico" : "Meus envios" });
  if (tipoRegistro) lista.push({ id: "registros", rotulo: TIPOS_REGISTRO[tipoRegistro].rotulo.split(" (")[0] });
  if (setorId === "comercial") {
    lista.push({ id: "metas", rotulo: "Metas" });
    if (pode("comercial", 2)) lista.push({ id: "evo", rotulo: "Dados do EVO" });
  }
  if (pode(setorId, 3)) lista.push({ id: "rotinas", rotulo: "Rotinas" });
  const aba = lista.some((a) => a.id === ctx.busca.aba) ? ctx.busca.aba : lista[0].id;

  montar(
    el,
    html`${cabecalho(nome, DESCRICOES[setorId] || "Rotinas e acompanhamento do setor.", pode("pendencias", 1) ? html`<a class="btn btn-secundario" href="#/ocorrencias?nova=1&categoria=${setorId === "recepcao" ? "atendimento" : setorId}">${icone("alerta")} Registrar ocorrência</a>` : "")}
    ${abas(lista, aba, `#/setor/${setorId}`)}
    <div id="conteudo-aba">${carregandoPagina()}</div>`
  );
  const alvo = $("#conteudo-aba", el);
  const unidades = unidadesFiltro().map((u) => u.id);
  try {
    if (aba === "acompanhar") await abaAcompanhar(alvo, ctx, setorId, unidades);
    else if (aba === "minhas") await abaMinhas(alvo, setorId);
    else if (aba === "indicadores") await abaIndicadores(alvo, ctx, setorId, unidades);
    else if (aba === "historico") await abaHistorico(alvo, ctx, setorId, unidades);
    else if (aba === "registros") await abaRegistros(alvo, ctx, setorId, unidades, tipoRegistro);
    else if (aba === "rotinas") await abaRotinas(alvo, ctx, setorId, unidades);
    else if (["painel", "metas", "evo"].includes(aba)) {
      const m = await import("./comercial-abas.js");
      await m[aba](alvo, ctx, unidades);
    }
  } catch (e) {
    console.error(e);
    montar(alvo, estadoErro(e));
    on(alvo, "click", "[data-acao=recarregar]", ctx.recarregar);
  }
}

// ======================= Minhas rotinas (nível próprio) =======================
async function abaMinhas(alvo, setorId) {
  const tarefas = await minhasTarefas({ setores: [setorId] });
  montar(
    alvo,
    tarefas.length
      ? html`<div class="pilha-sm">${tarefas.map((t) => cartaoTarefa(t, `#/setor/${setorId}`))}</div>`
      : estadoVazio({ icone: "okCirculo", titulo: "Nenhuma rotina para você agora", texto: "Os blocos deste setor aparecem aqui no dia e horário programados." })
  );
}

// ======================= Acompanhar (dia) =======================
async function abaAcompanhar(alvo, ctx, setorId, unidades) {
  const data = /^\d{4}-\d{2}-\d{2}$/.test(ctx.busca.data || "") ? ctx.busca.data : hoje();
  const [modelos, execs, escalas] = await Promise.all([
    modelosVisiveis({ unidades, setores: [setorId] }),
    listarExecucoes({ unidades, setores: [setorId], inicio: somarDias(data, -6), fim: somarDias(data, 6) }),
    carregarEscalas(unidades, somarDias(data, -6), somarDias(data, 6)),
  ]);
  const porId = new Map(execs.map((e) => [e.id, e]));
  const agora = new Date();
  const ocs = ocorrenciasProgramadas(modelos, data, data, escalas).map((o) => {
    const ex = porId.get(o.id) || null;
    return { ...o, execucao: ex, situacao: situacaoOcorrencia(o, ex, agora) };
  });
  // Itens semanais da semana (mesmo que de outro dia) e mensais do período aparecem também
  const enviados = ocs.filter((o) => o.execucao).length;
  const atrasados = ocs.filter((o) => o.situacao === "atrasado").length;
  const naoEnviados = ocs.filter((o) => o.situacao === "nao_enviado").length;
  const pendentesItens = ocs.reduce((s, o) => s + (o.execucao?.totais?.pendentes || 0), 0);
  const correcoes = ocs.filter((o) => o.execucao?.status === "correcao").length;

  const porUnidade = unidades
    .map((u) => ({ id: u, ocs: ocs.filter((o) => o.modelo.unidadeId === u).sort((a, b) => (a.bloco.inicio || "").localeCompare(b.bloco.inicio || "")) }))
    .filter((g) => g.ocs.length);

  montar(
    alvo,
    html`<form class="filtros" id="f-dia">
      <div class="campo"><label for="f-data">Dia</label><input type="date" id="f-data" name="data" value="${data}" max="${somarDias(hoje(), 30)}" /></div>
      <div class="linha" style="gap:6px;padding-bottom:2px">
        <button type="button" class="btn btn-secundario btn-sm" data-dia="${somarDias(data, -1)}">${icone("esquerda")} Anterior</button>
        ${data !== hoje() ? html`<button type="button" class="btn btn-secundario btn-sm" data-dia="${hoje()}">Hoje</button>` : ""}
        <button type="button" class="btn btn-secundario btn-sm" data-dia="${somarDias(data, 1)}">Próximo ${icone("direita")}</button>
      </div>
    </form>
    <div class="indicadores" style="margin-bottom:20px">
      ${indicador({ rotulo: "Blocos programados", valor: numero(ocs.length), nota: `${nomeDiaSemana(data)}, ${formatarData(data)}` })}
      ${indicador({ rotulo: "Enviados", valor: numero(enviados), tom: enviados && enviados === ocs.length ? "positivo" : "" })}
      ${indicador({ rotulo: "Atrasados", valor: numero(atrasados), tom: atrasados ? "alerta" : "", nota: "Ainda podem ser enviados" })}
      ${indicador({ rotulo: "Não enviados", valor: numero(naoEnviados), tom: naoEnviados ? "critico" : "", formula: FORMULAS.naoEnviados })}
      ${indicador({ rotulo: "Atividades pendentes", valor: numero(pendentesItens), tom: pendentesItens ? "alerta" : "" })}
      ${correcoes ? indicador({ rotulo: "Em correção", valor: numero(correcoes), tom: "alerta" }) : ""}
    </div>
    ${porUnidade.length
      ? porUnidade.map(
          (g) => html`<section class="painel" style="margin-bottom:16px">
            <div class="painel-cabecalho"><h3>${nomeUnidade(g.id)}</h3><span class="pequeno texto-3">${g.ocs.filter((o) => o.execucao).length} de ${g.ocs.length} enviados</span></div>
            <div class="tabela-envoltorio" style="border:0;background:none"><table class="tabela responsiva">
              <thead><tr><th>Bloco</th><th>Horário</th><th>Responsável</th><th>Situação</th><th class="num">Concluídas</th><th class="num">Pendentes</th><th></th></tr></thead>
              <tbody>${g.ocs.map((o) => {
                const ex = o.execucao;
                const s = ROTULOS_SITUACAO[o.situacao];
                const aplic = ex ? (ex.totais?.itens || 0) - (ex.totais?.naoAplicaveis || 0) : 0;
                return html`<tr class="${ex ? "clicavel" : ""}" ${raw(ex ? `data-exec="${ex.id}"` : "")}>
                  <td class="principal-celula" data-rotulo="Bloco"><strong>${o.bloco.nome}</strong><div class="pequeno texto-3">${o.modelo.nome}</div></td>
                  <td data-rotulo="Horário">${o.modelo.frequencia === "diaria" ? `${o.bloco.inicio}–${o.bloco.fim}` : o.modelo.frequencia === "semanal" ? "Semanal" : "Mensal"}</td>
                  <td data-rotulo="Responsável">${ex ? ex.autorNome : o.responsaveis.length ? o.responsaveis.map((l) => nomePessoa(l)).join(", ") : "Equipe do setor"}</td>
                  <td data-rotulo="Situação">${ex ? seloExecucao(ex) : html`<span class="selo ${s.classe}">${s.rotulo}</span>`}</td>
                  <td class="num" data-rotulo="Concluídas">${ex ? `${ex.totais?.concluidas || 0}/${aplic}` : "—"}</td>
                  <td class="num" data-rotulo="Pendentes">${ex ? html`<span style="${ex.totais?.pendentes ? "color:var(--pendente);font-weight:700" : ""}">${ex.totais?.pendentes || 0}</span>` : "—"}</td>
                  <td class="direita" data-rotulo="">${ex
                    ? html`<button class="btn btn-fantasma btn-sm" data-exec="${ex.id}">${icone("olho")} Ver</button>`
                    : podeEnviarAgora(o) && souResponsavel(o) && pode(setorId, 1)
                      ? html`<a class="btn btn-secundario btn-sm" href="#/rotina/${encodeURIComponent(o.id)}?voltar=${encodeURIComponent(`#/setor/${setorId}?aba=acompanhar`)}">${icone("editar")} Preencher</a>`
                      : ""}</td>
                </tr>`;
              })}</tbody>
            </table></div>
          </section>`
        )
      : estadoVazio({
          icone: "calendario",
          titulo: "Nenhum bloco programado neste dia",
          texto: modelos.length ? "As rotinas deste setor não têm blocos para este dia da semana." : "Ainda não há rotinas cadastradas para este setor.",
          acao: pode(setorId, 3) && !modelos.length ? html`<a class="btn btn-primario" href="#/setor/${setorId}?aba=rotinas">${icone("mais")} Criar rotina</a>` : "",
        })}`
  );
  const execPorId = new Map(execs.map((e) => [e.id, e]));
  on(alvo, "click", "[data-exec]", (ev, alvoEl) => {
    if (ev.target.closest("a")) return;
    ev.stopPropagation();
    const ex = execPorId.get(alvoEl.dataset.exec);
    if (ex) abrirExecucao(ex, { aoAlterar: ctx.recarregar });
  });
  $("#f-data", alvo).addEventListener("change", (ev) => atualizarBusca({ data: ev.target.value }, { recarregar: true }));
  on(alvo, "click", "[data-dia]", (ev, b) => atualizarBusca({ data: b.dataset.dia }, { recarregar: true }));
}

// ======================= Indicadores =======================
export async function painelIndicadoresRotina(alvo, { setores, unidades, periodo, titulo }) {
  const r = await resumoRotinas({ unidades, setores, inicio: periodo.inicio, fim: periodo.fim });
  const t = r.total;
  const serie = r.serieDiaria;
  const rotulos = serie.map((s) => formatarData(s.data, { curta: true }));
  const unidadesCmp = r.listaUnidades.filter((u) => u.programados);
  montar(
    alvo,
    html`<div class="painel painel-destaque" style="margin-bottom:16px">
      <div class="linha" style="gap:28px;align-items:center">
        ${anel(r.taxas.execucao, { rotulo: "execução" })}
        <div class="expande" style="min-width:240px">
          <h2 style="margin-bottom:4px">${titulo || "Execução operacional"}</h2>
          <p class="texto-2 pequeno" style="max-width:62ch">${FORMULAS.execucao}</p>
          <div class="linha" style="gap:8px">
            <span class="chip">Período: ${periodo.rotulo}</span><span class="chip">${rotuloUnidades()}</span>
          </div>
        </div>
      </div>
    </div>
    <div class="indicadores" style="margin-bottom:16px">
      ${indicador({ rotulo: "Taxa de conclusão", valor: pct(r.taxas.conclusao), formula: FORMULAS.conclusao })}
      ${indicador({ rotulo: "Cobertura de blocos", valor: pct(r.taxas.cobertura), formula: FORMULAS.cobertura, nota: `${numero(t.enviados)} enviados` })}
      ${indicador({ rotulo: "Blocos não enviados", valor: numero(t.naoEnviados), tom: t.naoEnviados ? "critico" : "", formula: FORMULAS.naoEnviados })}
      ${indicador({ rotulo: "Atividades pendentes", valor: numero(t.pendentes), tom: t.pendentes ? "alerta" : "" })}
      ${indicador({ rotulo: "Não aplicáveis", valor: numero(t.naoAplicaveis), nota: "Fora do cálculo de percentuais" })}
      ${setores.includes("limpeza") ? indicador({ rotulo: "Falta de material", valor: numero(r.faltaMaterial.blocos), nota: "Blocos com falta registrada", tom: r.faltaMaterial.blocos ? "alerta" : "" }) : ""}
    </div>
    <div class="grade-2" style="margin-bottom:16px">
      <div class="painel">
        <div class="painel-cabecalho"><div><h3>Evolução diária</h3><p>Execução e conclusão por dia</p></div></div>
        ${serie.length > 1
          ? graficoLinha({
              rotulos,
              series: [
                { nome: "Execução", valores: serie.map((s) => (s.itensAplicaveis ? s.execucao : null)) },
                { nome: "Conclusão", valores: serie.map((s) => (s.itensEnviadosAplicaveis ? s.conclusao : null)) },
              ],
              maximo: 1,
              formato: (v) => pct(v),
              titulo: "Evolução diária da execução",
            })
          : html`<p class="texto-3 pequeno">Escolha um período de pelo menos 2 dias para ver a evolução.</p>`}
      </div>
      <div class="painel">
        <div class="painel-cabecalho"><div><h3>${unidadesCmp.length > 1 ? "Comparativo entre unidades" : "Blocos por situação"}</h3><p>${unidadesCmp.length > 1 ? "Execução e cobertura" : "Enviados, atrasados e não enviados"}</p></div></div>
        ${unidadesCmp.length > 1
          ? graficoBarras({
              rotulos: unidadesCmp.map((u) => nomeUnidade(u.id)),
              series: [
                { nome: "Execução", valores: unidadesCmp.map((u) => u.execucao || 0) },
                { nome: "Cobertura", valores: unidadesCmp.map((u) => u.cobertura || 0) },
              ],
              maximo: 1,
              formato: (v) => pct(v),
              titulo: "Comparativo entre unidades",
            })
          : graficoBarras({
              rotulos,
              series: [
                { nome: "Enviados", valores: serie.map((s) => s.enviados), cor: "#3dd68c" },
                { nome: "Atrasados", valores: serie.map((s) => s.atrasados), cor: "#fda905" },
                { nome: "Não enviados", valores: serie.map((s) => s.naoEnviados), cor: "#ff7a6b" },
              ],
              empilhado: true,
              titulo: "Blocos por situação",
            })}
      </div>
    </div>
    <div class="grade-2">
      <div class="painel">
        <div class="painel-cabecalho"><div><h3>Atividades com mais pendências</h3><p>Quantas vezes ficaram pendentes no período</p></div></div>
        ${r.ranking.length ? ranking(r.ranking.map((x) => ({ rotulo: x.texto, valor: x.vezes, detalhe: setores.length > 1 ? nomeModulo(x.setorId) : "", cor: "var(--pendente)" }))) : html`<p class="texto-3 pequeno">Nenhuma atividade pendente no período.</p>`}
      </div>
      <div class="painel">
        <div class="painel-cabecalho"><div><h3>${setores.includes("limpeza") ? "Falta de materiais" : "Por setor"}</h3></div></div>
        ${setores.includes("limpeza")
          ? r.faltaMaterial.itens.length
            ? html`<div class="lista">${r.faltaMaterial.itens.slice(0, 12).map((i) => html`<div class="lista-item"><span class="expande">${i.texto}</span><span class="pequeno texto-3">${nomeUnidade(i.unidadeId)} · ${formatarData(i.data, { curta: true })}</span></div>`)}</div>`
            : html`<p class="texto-3 pequeno">Nenhuma falta de material registrada.</p>`
          : ranking(r.listaSetores.filter((s) => s.programados).map((s) => ({ rotulo: s.nome, valor: Math.round((s.execucao || 0) * 100) })), { formato: (v) => `${v}%`, maximo: 100 })}
      </div>
    </div>`
  );
  return r;
}

async function abaIndicadores(alvo, ctx, setorId, unidades) {
  const periodo = resolverPeriodo(ctx.busca, "30d");
  const caixa = document.createElement("div");
  montar(alvo, filtroPeriodo(periodo));
  alvo.appendChild(caixa);
  montar(caixa, carregandoPagina());
  ligarFiltros(alvo, (d) => atualizarBusca(d, { recarregar: true }));
  await painelIndicadoresRotina(caixa, { setores: [setorId], unidades, periodo, titulo: `Execução — ${nomeModulo(setorId)}` });
}

// ======================= Histórico =======================
async function abaHistorico(alvo, ctx, setorId, unidades) {
  const periodo = resolverPeriodo(ctx.busca, "30d");
  let execs = await listarExecucoes({ unidades, setores: [setorId], inicio: periodo.inicio, fim: periodo.fim });
  if (!pode(setorId, 2)) execs = execs.filter((e) => e.autorLogin === meuLogin());
  const filtroStatus = ctx.busca.status || "";
  if (filtroStatus === "pendencias") execs = execs.filter((e) => e.totais?.pendentes);
  if (filtroStatus === "correcao") execs = execs.filter((e) => e.status === "correcao");
  if (filtroStatus === "falta") execs = execs.filter((e) => e.extras?.faltaMaterial);
  execs.sort((a, b) => (b.dataPrevista + b.inicio).localeCompare(a.dataPrevista + a.inicio));

  montar(
    alvo,
    html`${filtroPeriodo(periodo, {
      extras: html`<div class="campo"><label for="f-status">Mostrar</label><select id="f-status" name="status">${opcoes(
        [
          { valor: "", rotulo: "Todos os envios" },
          { valor: "pendencias", rotulo: "Com atividades pendentes" },
          { valor: "correcao", rotulo: "Em correção" },
          ...(setorId === "limpeza" ? [{ valor: "falta", rotulo: "Com falta de material" }] : []),
        ],
        filtroStatus
      )}</select></div>
      <div class="campo" style="flex:0 0 auto"><label>&nbsp;</label><button type="button" class="btn btn-secundario btn-sm" data-csv style="min-height:40px">${icone("baixar")} Exportar CSV</button></div>`,
    })}
    ${execs.length
      ? html`<div class="tabela-envoltorio"><table class="tabela responsiva">
          <thead><tr><th>Data</th><th>Bloco</th><th>Unidade</th><th>Enviado por</th><th>Situação</th><th class="num">Concluídas</th><th class="num">Pendentes</th><th class="num">N/A</th></tr></thead>
          <tbody>${execs.map((e) => {
            const aplic = (e.totais?.itens || 0) - (e.totais?.naoAplicaveis || 0);
            return html`<tr class="clicavel" data-exec="${e.id}">
              <td class="principal-celula" data-rotulo="Data"><strong>${formatarData(e.dataPrevista)}</strong> <span class="texto-3 pequeno">${nomeDiaSemana(e.dataPrevista, true)}</span></td>
              <td data-rotulo="Bloco">${e.blocoNome}<div class="pequeno texto-3">${e.modeloNome}</div></td>
              <td data-rotulo="Unidade">${nomeUnidade(e.unidadeId)}</td>
              <td data-rotulo="Enviado por">${e.autorNome}<div class="pequeno texto-3">${formatarDataHora(e.enviadoEm)}</div></td>
              <td data-rotulo="Situação">${seloExecucao(e)}${e.extras?.faltaMaterial ? html` <span class="selo selo-pendente sem-ponto">Falta material</span>` : ""}</td>
              <td class="num" data-rotulo="Concluídas">${e.totais?.concluidas || 0}/${aplic}</td>
              <td class="num" data-rotulo="Pendentes">${e.totais?.pendentes || 0}</td>
              <td class="num" data-rotulo="N/A">${e.totais?.naoAplicaveis || 0}</td>
            </tr>`;
          })}</tbody></table></div>
          <p class="pequeno texto-3" style="margin-top:8px">${execs.length} envio(s) · ${periodo.rotulo}</p>`
      : estadoVazio({ icone: "historico", titulo: "Nenhum envio no período", texto: "Altere o período ou o filtro para ver outros registros." })}`
  );
  ligarFiltros(alvo, (d) => atualizarBusca(d, { recarregar: true }));
  const porId = new Map(execs.map((e) => [e.id, e]));
  on(alvo, "click", "[data-exec]", (ev, tr) => abrirExecucao(porId.get(tr.dataset.exec), { aoAlterar: ctx.recarregar }));
  on(alvo, "click", "[data-csv]", () => {
    const linhas = [];
    for (const e of execs)
      for (const r of e.respostas || [])
        linhas.push({ e, r });
    exportarCSV(`${setorId}-historico-${periodo.inicio}-a-${periodo.fim}`, linhas, [
      { titulo: "Data", valor: (l) => formatarData(l.e.dataPrevista) },
      { titulo: "Unidade", valor: (l) => nomeUnidade(l.e.unidadeId) },
      { titulo: "Rotina", valor: (l) => l.e.modeloNome },
      { titulo: "Bloco", valor: (l) => l.e.blocoNome },
      { titulo: "Atividade", valor: (l) => l.r.texto },
      { titulo: "Situação", valor: (l) => ({ concluida: "Concluída", pendente: "Pendente", nao_realizada: "Não realizada", nao_aplicavel: "Não aplicável", nao_verificada: "Não verificada" })[l.r.status] },
      { titulo: "Motivo", valor: (l) => l.r.justificativa },
      { titulo: "Enviado por", valor: (l) => l.e.autorNome },
      { titulo: "Enviado em", valor: (l) => l.e.enviadoEm },
      { titulo: "Falta de material", valor: (l) => (l.e.extras?.faltaMaterial ? l.e.extras.materiais || "Sim" : "") },
      { titulo: "Observações", valor: (l) => l.e.extras?.observacoes },
    ]);
  });
}

// ======================= Registros (atendimentos / contatos / feedbacks) =======================
async function abaRegistros(alvo, ctx, setorId, unidades, tipo) {
  const periodo = resolverPeriodo(ctx.busca, "7d");
  const def = TIPOS_REGISTRO[tipo];
  const regs = (await listarRegistros({ unidades, setorId, inicio: periodo.inicio, fim: periodo.fim })).sort(
    (a, b) => (b.criadoEm?.getTime?.() || 0) - (a.criadoEm?.getTime?.() || 0)
  );
  const porTipo = {};
  const porCanal = {};
  const porResultado = {};
  for (const r of regs) {
    porTipo[r.dados?.tipo] = (porTipo[r.dados?.tipo] || 0) + 1;
    if (r.dados?.canal) porCanal[r.dados.canal] = (porCanal[r.dados.canal] || 0) + 1;
    if (r.dados?.resultado) porResultado[r.dados.resultado] = (porResultado[r.dados.resultado] || 0) + 1;
  }
  const topo = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([rotulo, valor]) => ({ rotulo, valor }));
  montar(
    alvo,
    html`${filtroPeriodo(periodo, {
      extras: html`<div class="campo" style="flex:0 0 auto"><label>&nbsp;</label><button type="button" class="btn btn-secundario btn-sm" data-csv style="min-height:40px">${icone("baixar")} Exportar CSV</button></div>`,
    })}
    <div class="indicadores" style="margin-bottom:16px">
      ${indicador({ rotulo: `Total de ${def.singular}s`, valor: numero(regs.length), nota: periodo.rotulo })}
      ${tipo === "atendimento" ? indicador({ rotulo: "Visitas", valor: numero(porTipo["Visita"] || 0) }) : ""}
      ${tipo === "atendimento" ? indicador({ rotulo: "Solicitações de alunos", valor: numero(porTipo["Solicitação de aluno"] || 0) }) : ""}
      ${tipo === "atendimento" ? indicador({ rotulo: "Reclamações", valor: numero(porTipo["Reclamação"] || 0), tom: porTipo["Reclamação"] ? "alerta" : "" }) : ""}
      ${tipo === "atendimento" ? indicador({ rotulo: "Resolvidos na hora", valor: pct(regs.length ? (porResultado["Resolvido"] || 0) / regs.length : null) }) : ""}
      ${tipo === "contato" ? indicador({ rotulo: "Prospecções ativas", valor: numero(porTipo["Prospecção ativa"] || 0) }) : ""}
      ${tipo === "contato" ? indicador({ rotulo: "Leads recebidos", valor: numero(porTipo["Lead recebido"] || 0) }) : ""}
      ${tipo === "contato" ? indicador({ rotulo: "Visitas agendadas", valor: numero(porResultado["Agendou visita"] || 0) }) : ""}
    </div>
    <div class="grade-3" style="margin-bottom:16px">
      <div class="painel"><div class="painel-cabecalho"><h3>Por tipo</h3></div>${regs.length ? ranking(topo(porTipo)) : html`<p class="texto-3 pequeno">Sem registros.</p>`}</div>
      <div class="painel"><div class="painel-cabecalho"><h3>Por canal</h3></div>${Object.keys(porCanal).length ? ranking(topo(porCanal), {}) : html`<p class="texto-3 pequeno">Sem registros.</p>`}</div>
      <div class="painel"><div class="painel-cabecalho"><h3>Por resultado</h3></div>${Object.keys(porResultado).length ? ranking(topo(porResultado)) : html`<p class="texto-3 pequeno">Sem registros.</p>`}</div>
    </div>
    ${regs.length
      ? html`<div class="tabela-envoltorio"><table class="tabela responsiva">
          <thead><tr><th>Quando</th><th>Tipo</th><th>Canal</th><th>Resultado</th><th>Detalhe</th><th>Unidade</th><th>Por</th></tr></thead>
          <tbody>${regs.slice(0, 400).map(
            (r) => html`<tr>
              <td class="principal-celula" data-rotulo="Quando">${formatarDataHora(r.criadoEm)}</td>
              <td data-rotulo="Tipo">${r.dados?.tipo}</td><td data-rotulo="Canal">${r.dados?.canal || "—"}</td>
              <td data-rotulo="Resultado">${r.dados?.resultado || "—"}</td>
              <td data-rotulo="Detalhe" class="quebra">${[r.dados?.nome, r.dados?.observacao].filter(Boolean).join(" · ") || "—"}</td>
              <td data-rotulo="Unidade">${nomeUnidade(r.unidadeId)}</td><td data-rotulo="Por">${r.autorNome}</td>
            </tr>`
          )}</tbody></table></div>`
      : estadoVazio({ icone: "mensagem", titulo: "Nenhum registro no período", texto: `Os ${def.singular}s são lançados dentro do bloco/turno, na aba de preenchimento.` })}`
  );
  ligarFiltros(alvo, (d) => atualizarBusca(d, { recarregar: true }));
  on(alvo, "click", "[data-csv]", () =>
    exportarCSV(`${setorId}-${def.singular}s-${periodo.inicio}-a-${periodo.fim}`, regs, [
      { titulo: "Data e hora", valor: (r) => r.criadoEm },
      { titulo: "Unidade", valor: (r) => nomeUnidade(r.unidadeId) },
      { titulo: "Tipo", valor: (r) => r.dados?.tipo },
      { titulo: "Canal", valor: (r) => r.dados?.canal },
      { titulo: "Resultado", valor: (r) => r.dados?.resultado },
      { titulo: "Nome", valor: (r) => r.dados?.nome },
      { titulo: "Observação", valor: (r) => r.dados?.observacao },
      { titulo: "Registrado por", valor: (r) => r.autorNome },
    ])
  );
}

// ======================= Modelos de rotina =======================
async function abaRotinas(alvo, ctx, setorId, unidades) {
  const modelos = await Promise.all(unidades.map((u) => listarModelos({ unidadeId: u, setorId, incluirInativos: true })));
  const todos = modelos.flat();
  const outrasUnidades = minhasUnidades();
  const descreverDias = (b, m) =>
    m.frequencia === "diaria"
      ? DIAS_SEMANA.filter((d) => (b.dias || []).includes(d.valor)).map((d) => d.curto).join(", ")
      : m.frequencia === "semanal"
        ? DIAS_SEMANA.find((d) => d.valor === Number(b.dia))?.nome || ""
        : "Dia 25 ao dia 5";
  montar(
    alvo,
    html`<div class="linha-entre" style="margin-bottom:16px">
      <p class="texto-2 pequeno" style="margin:0;max-width:70ch">Edite atividades, horários e responsáveis a qualquer momento. Mudanças valem para os próximos envios; o histórico guarda exatamente o que foi pedido em cada dia.</p>
      <a class="btn btn-primario" href="#/rotinas/editar/novo?setor=${setorId}">${icone("mais")} Nova rotina</a>
    </div>
    ${todos.length
      ? todos.map(
          (m) => html`<section class="painel" style="margin-bottom:12px;${m.ativo === false ? "opacity:.6" : ""}">
            <div class="painel-cabecalho">
              <div><h3>${m.nome}</h3><p>${nomeUnidade(m.unidadeId)} · ${({ diaria: "Diária", semanal: "Semanal", mensal: "Mensal" })[m.frequencia]} · versão ${m.versao || 1}${m.ativo === false ? " · desativada" : ""}</p></div>
              <div class="linha" style="gap:6px">
                <a class="btn btn-secundario btn-sm" href="#/rotinas/editar/${m.id}">${icone("editar")} Editar</a>
                ${outrasUnidades.length > 1 ? html`<button class="btn btn-fantasma btn-sm" data-duplicar="${m.id}">${icone("copiar")} Duplicar</button>` : ""}
                ${pode(setorId, 4) ? html`<button class="btn btn-fantasma btn-sm" data-ativo="${m.id}">${m.ativo === false ? html`${icone("desfazer")} Reativar` : html`${icone("arquivo")} Desativar`}</button>` : ""}
              </div>
            </div>
            <div class="lista">
              ${(m.blocos || []).filter((b) => b.ativo !== false).map(
                (b) => html`<div class="lista-item">
                  <span class="icone-circulo">${icone(m.frequencia === "diaria" ? "relogio" : "calendario")}</span>
                  <div class="expande"><div class="lista-item-titulo">${b.nome}${b.somenteEscalado ? html` <span class="selo selo-marca sem-ponto">Quando escalado</span>` : ""}</div>
                  <div class="lista-item-sub">${m.frequencia === "diaria" ? `${b.inicio}–${b.fim} · ` : ""}${descreverDias(b, m)} · ${(b.itens || []).filter((i) => i.ativo !== false).length} atividade(s)${b.responsaveis?.length ? ` · ${b.responsaveis.length} responsável(is)` : ""}</div></div>
                </div>`
              )}
            </div>
          </section>`
        )
      : estadoVazio({ icone: "rotina", titulo: "Nenhuma rotina cadastrada", texto: "Crie a primeira rotina deste setor com blocos de horário e atividades.", acao: html`<a class="btn btn-primario" href="#/rotinas/editar/novo?setor=${setorId}">${icone("mais")} Nova rotina</a>` })}`
  );
  const porId = new Map(todos.map((m) => [m.id, m]));
  on(alvo, "click", "[data-ativo]", async (ev, b) => {
    const m = porId.get(b.dataset.ativo);
    const ativar = m.ativo === false;
    const ok = await confirmar({
      titulo: ativar ? "Reativar rotina?" : "Desativar rotina?",
      mensagem: ativar ? "Os blocos voltam a ser programados a partir de hoje." : "A rotina deixa de ser programada. Todo o histórico de envios é mantido.",
      confirmarTexto: ativar ? "Reativar" : "Desativar",
      perigo: !ativar,
    });
    if (!ok) return;
    try {
      await alterarAtivoModelo(m.id, ativar);
      avisar(ativar ? "Rotina reativada." : "Rotina desativada.");
      ctx.recarregar();
    } catch (e) {
      avisarErro(e);
    }
  });
  on(alvo, "click", "[data-duplicar]", async (ev, b) => {
    const m = porId.get(b.dataset.duplicar);
    const destinos = outrasUnidades.filter((u) => u.id !== m.unidadeId);
    if (!destinos.length) return;
    const { abrirModal } = await import("../core/ui.js");
    const modal = abrirModal({
      titulo: "Duplicar rotina para outra unidade",
      corpo: html`<div class="campo"><label for="dup-unidade">Unidade de destino</label><select id="dup-unidade">${opcoes(destinos.map((u) => ({ valor: u.id, rotulo: u.nome })))}</select></div>
        <p class="pequeno texto-3" style="margin-top:8px">Os responsáveis não são copiados; defina-os depois na nova rotina.</p>`,
      rodape: html`<button class="btn btn-secundario" data-fechar>Cancelar</button><button class="btn btn-primario" data-ok>Duplicar</button>`,
      aoMontar: (mel, fechar) => on(mel, "click", "[data-ok]", () => fechar($("#dup-unidade", mel).value)),
    });
    const destino = await modal.aoFechar;
    if (!destino) return;
    try {
      const novo = await duplicarModelo(m, destino);
      avisar(`Rotina duplicada para ${nomeUnidade(destino)}.`);
      location.hash = `#/rotinas/editar/${novo}`;
    } catch (e) {
      avisarErro(e);
    }
  });
}
