// Relatórios: por período (unidade ou consolidado), mensais aprovados e exportação de dados.
import { html, montar, $, on, opcoes, lerFormulario } from "../core/dom.js";
import { icone } from "../core/icones.js";
import { pode, nomeUnidade, unidadesFiltro, minhasUnidades, nomeModulo, modulosRotina } from "../core/sessao.js";
import { estadoVazio, carregandoPagina, avisar, avisarErro, comCarregamento } from "../core/ui.js";
import { hoje, mesDe, somarMeses, nomeMes, formatarData } from "../core/tempo.js";
import { numero, pct, moeda } from "../core/formato.js";
import { atualizarBusca } from "../core/rotas.js";
import { exportarCSV } from "../core/exportar.js";
import { STATUS_PENDENCIA, PRIORIDADES, CATEGORIAS_PENDENCIA, TIPOS_EVO } from "../core/constantes.js";
import { montarDados, congelarNumeros } from "../services/relatorios.js";
import { listarRelatorios, obterRelatorio, STATUS_RELATORIO } from "../services/gestao.js";
import { listarExecucoes, listarRegistros } from "../services/rotinas.js";
import { listarCustos } from "../services/manutencao.js";
import { listarEvo } from "../services/comercial.js";
import * as pend from "../services/pendencias.js";
import { cabecalho, abas, resolverPeriodo, filtroPeriodo, ligarFiltros, rotuloUnidades } from "./comum.js";
import { relatorioMensalHTML } from "./componentes/relatorio-mensal.js";

export default async function telaRelatorios(el, ctx) {
  const aba = ["periodo", "mensais", "exportar"].includes(ctx.busca.aba) ? ctx.busca.aba : "periodo";
  montar(
    el,
    html`${cabecalho("Relatórios", "Relatórios gerenciais com gráficos e tabelas, prontos para reuniões e para salvar em PDF.")}
    ${abas([{ id: "periodo", rotulo: "Por período" }, { id: "mensais", rotulo: "Relatórios mensais" }, { id: "exportar", rotulo: "Exportar dados" }], aba, "#/relatorios")}
    <div id="conteudo-aba">${carregandoPagina()}</div>`
  );
  const alvo = $("#conteudo-aba", el);
  if (aba === "periodo") await abaPeriodo(alvo, ctx);
  else if (aba === "mensais") await abaMensais(alvo, ctx);
  else await abaExportar(alvo, ctx);
}

function comparativoUnidades(d, unidades) {
  if (unidades.length < 2) return "";
  const linhas = unidades.map((u) => {
    const r = d.rotinas?.listaUnidades?.find((x) => x.id === u);
    const pendU = (d.pendencias?.lista || []).filter((p) => p.unidadeId === u);
    const evo = (d.comercial?.listaEvo || []).filter((e) => e.unidadeId === u);
    return {
      u,
      execucao: r?.execucao ?? null,
      naoEnviados: r?.naoEnviados || 0,
      abertas: pendU.filter((p) => p.aberta).length,
      criticas: pendU.filter((p) => p.aberta && p.prioridade === "critica").length,
      matriculas: evo.filter((e) => e.tipo === "matricula").length,
      renovacoes: evo.filter((e) => e.tipo === "renovacao").length,
      contatos: (d.comercial?.listaContatos || []).filter((c) => c.unidadeId === u).length,
      custos: (d.custos || []).filter((c) => c.unidadeId === u).reduce((s, c) => s + (c.valor || 0), 0),
    };
  });
  return html`<section><h2>Comparativo entre unidades</h2>
    <div class="tabela-envoltorio"><table class="tabela">
      <thead><tr><th>Unidade</th><th class="num">Execução operacional</th><th class="num">Blocos não enviados</th><th class="num">Pendências abertas</th><th class="num">Críticas</th>${d.comercial ? html`<th class="num">Contatos</th><th class="num">Matrículas</th><th class="num">Renovações</th>` : ""}<th class="num">Custos</th></tr></thead>
      <tbody>${linhas.map((l) => html`<tr><td><strong>${nomeUnidade(l.u)}</strong></td><td class="num">${pct(l.execucao)}</td><td class="num">${numero(l.naoEnviados)}</td><td class="num">${numero(l.abertas)}</td><td class="num">${numero(l.criticas)}</td>${d.comercial ? html`<td class="num">${numero(l.contatos)}</td><td class="num">${numero(l.matriculas)}</td><td class="num">${numero(l.renovacoes)}</td>` : ""}<td class="num">${moeda(l.custos)}</td></tr>`)}</tbody>
    </table></div></section>`;
}

async function abaPeriodo(alvo, ctx) {
  const periodo = resolverPeriodo(ctx.busca, "mes");
  const unidades = unidadesFiltro().map((u) => u.id);
  montar(
    alvo,
    html`<div class="linha-entre nao-imprimir">${filtroPeriodo(periodo)}<button class="btn btn-primario" data-imprimir style="margin-bottom:16px">${icone("imprimir")} Imprimir / salvar PDF</button></div>
    <p class="pequeno texto-3 nao-imprimir" style="margin-top:-6px">Unidades: ${rotuloUnidades()} (altere no seletor do topo). ${unidades.length > 1 ? "Com mais de uma unidade, o relatório é consolidado e inclui o comparativo." : ""}</p>
    <div id="relatorio">${carregandoPagina()}</div>`
  );
  ligarFiltros(alvo, (d) => atualizarBusca(d, { recarregar: true }));
  on(alvo, "click", "[data-imprimir]", () => window.print());
  const d = await montarDados({ unidades, inicio: periodo.inicio, fim: periodo.fim });
  const numeros = congelarNumeros(d);
  montar(
    $("#relatorio", alvo),
    relatorioMensalHTML({
      unidadeNome: unidades.length > 1 ? "Consolidado" : nomeUnidade(unidades[0]),
      numeros,
      rotuloPeriodo: periodo.rotulo,
      titulo: unidades.length > 1 ? `Relatório consolidado · ${unidades.map(nomeUnidade).join(" e ")}` : "Relatório gerencial do período",
      extra: comparativoUnidades(d, unidades),
      textos: {},
      plano: [],
    })
  );
}

async function abaMensais(alvo, ctx) {
  const unidades = unidadesFiltro();
  const lista = await listarRelatorios(unidades.map((u) => u.id)).catch(() => []);
  const sel = ctx.busca.rel ? lista.find((r) => r.id === ctx.busca.rel) : null;
  if (sel) {
    montar(
      alvo,
      html`<div class="linha-entre nao-imprimir" style="margin-bottom:16px"><a class="btn btn-fantasma btn-sm" href="#/relatorios?aba=mensais">${icone("esquerda")} Todos os relatórios</a><button class="btn btn-primario" data-imprimir>${icone("imprimir")} Imprimir / salvar PDF</button></div>
      ${relatorioMensalHTML({ unidadeNome: nomeUnidade(sel.unidadeId), mes: sel.mes, numeros: sel.numeros, textos: sel.textos, plano: sel.plano, status: sel.status, aprovacao: sel.aprovacao, enviadoPorNome: sel.enviadoPorNome, enviadoEm: sel.enviadoEm })}`
    );
    on(alvo, "click", "[data-imprimir]", () => window.print());
    return;
  }
  const meses = Array.from({ length: 12 }, (_, i) => somarMeses(mesDe(hoje()), -i - 1));
  const porChave = new Map(lista.map((r) => [`${r.unidadeId}__${r.mes}`, r]));
  montar(
    alvo,
    html`<p class="pequeno texto-2">Relatórios elaborados pelos gestores ao fim de cada mês e aprovados pela diretoria. Depois de enviados, os números ficam congelados.</p>
    <div class="tabela-envoltorio"><table class="tabela responsiva">
      <thead><tr><th>Mês</th>${unidades.map((u) => html`<th>${u.nome}</th>`)}</tr></thead>
      <tbody>${meses.map(
        (m) => html`<tr><td class="principal-celula" data-rotulo="Mês" style="text-transform:capitalize"><strong>${nomeMes(m)}</strong></td>
          ${unidades.map((u) => {
            const r = porChave.get(`${u.id}__${m}`);
            const st = r ? STATUS_RELATORIO[r.status] : null;
            return html`<td data-rotulo="${u.nome}">${r ? html`<a href="#/relatorios?aba=mensais&rel=${encodeURIComponent(r.id)}" class="selo ${st.classe}" style="text-decoration:none">${st.rotulo}</a>` : html`<span class="texto-3 pequeno">Não elaborado</span>`}</td>`;
          })}</tr>`
      )}</tbody></table></div>`
  );
}

async function abaExportar(alvo, ctx) {
  const periodo = resolverPeriodo(ctx.busca, "mes");
  const unidades = unidadesFiltro().map((u) => u.id);
  const setores = modulosRotina().map((m) => m.id);
  const opcoesExport = [
    { id: "rotinas", rotulo: "Rotinas e checklists (uma linha por atividade)", ok: setores.some((s) => pode(s, 2)) },
    { id: "pendencias", rotulo: "Ocorrências e pendências", ok: pode("pendencias", 1) },
    { id: "custos", rotulo: "Custos (manutenção, serviços e reparos)", ok: pode("relatorios", 2) || pode("gestao", 2) },
    { id: "atendimentos", rotulo: "Atendimentos da recepção", ok: pode("recepcao", 2) },
    { id: "contatos", rotulo: "Contatos comerciais", ok: pode("comercial", 2) },
    { id: "evo", rotulo: "Dados importados do EVO", ok: pode("comercial", 2) },
  ].filter((o) => o.ok);
  montar(
    alvo,
    html`${filtroPeriodo(periodo)}
    <p class="pequeno texto-2">Os arquivos CSV abrem direto no Excel (separados por ponto e vírgula, com acentuação correta). Unidades: ${rotuloUnidades()}.</p>
    <div class="grade-2">${opcoesExport.map(
      (o) => html`<div class="painel painel-compacto linha-entre"><span class="forte">${o.rotulo}</span><button class="btn btn-secundario btn-sm" data-exportar="${o.id}">${icone("baixar")} Baixar CSV</button></div>`
    )}</div>
    ${!opcoesExport.length ? estadoVazio({ icone: "cadeado", titulo: "Nada para exportar", texto: "Seu acesso não inclui dados exportáveis." }) : ""}`
  );
  ligarFiltros(alvo, (d) => atualizarBusca(d, { recarregar: true }));
  const nomeArq = (base) => `${base}-${periodo.inicio}-a-${periodo.fim}`;
  on(alvo, "click", "[data-exportar]", (ev, b) =>
    comCarregamento(b, async () => {
      try {
        const tipo = b.dataset.exportar;
        if (tipo === "rotinas") {
          const execs = await listarExecucoes({ unidades, setores: setores.filter((s) => pode(s, 2)), inicio: periodo.inicio, fim: periodo.fim });
          const linhas = execs.flatMap((e) => (e.respostas || []).map((r) => ({ e, r })));
          exportarCSV(nomeArq("rotinas"), linhas, [
            { titulo: "Data", valor: (l) => formatarData(l.e.dataPrevista) },
            { titulo: "Unidade", valor: (l) => nomeUnidade(l.e.unidadeId) },
            { titulo: "Setor", valor: (l) => nomeModulo(l.e.setorId) },
            { titulo: "Rotina", valor: (l) => l.e.modeloNome },
            { titulo: "Bloco", valor: (l) => l.e.blocoNome },
            { titulo: "Atividade", valor: (l) => l.r.texto },
            { titulo: "Situação", valor: (l) => ({ concluida: "Concluída", pendente: "Pendente", nao_realizada: "Não realizada", nao_aplicavel: "Não aplicável", nao_verificada: "Não verificada" })[l.r.status] },
            { titulo: "Motivo", valor: (l) => l.r.justificativa },
            { titulo: "Enviado por", valor: (l) => l.e.autorNome },
            { titulo: "Enviado em", valor: (l) => l.e.enviadoEm },
            { titulo: "Com atraso", valor: (l) => (l.e.atrasado ? "Sim" : "Não") },
            { titulo: "Revisão", valor: (l) => l.e.status },
          ]);
          return avisar(`${linhas.length} linha(s) exportada(s).`);
        }
        if (tipo === "pendencias") {
          const lista = (await pend.listar({ unidades, somenteAbertas: false, inicio: periodo.inicio, fim: periodo.fim, setores: setores.concat(["equipamentos", "estrutura"]) })).filter(
            (p) => p.aberta || (p.dataAbertura >= periodo.inicio && p.dataAbertura <= periodo.fim) || (p.dataConclusao >= periodo.inicio && p.dataConclusao <= periodo.fim)
          );
          exportarCSV(nomeArq("ocorrencias"), lista, [
            { titulo: "Código", valor: (p) => p.codigo },
            { titulo: "Título", valor: (p) => p.titulo },
            { titulo: "Unidade", valor: (p) => nomeUnidade(p.unidadeId) },
            { titulo: "Setor", valor: (p) => nomeModulo(p.setorId) },
            { titulo: "Categoria", valor: (p) => CATEGORIAS_PENDENCIA.find((c) => c.id === p.categoria)?.nome },
            { titulo: "Prioridade", valor: (p) => PRIORIDADES[p.prioridade]?.rotulo },
            { titulo: "Status", valor: (p) => STATUS_PENDENCIA[p.status]?.rotulo },
            { titulo: "Abertura", valor: (p) => formatarData(p.dataAbertura) },
            { titulo: "Prazo", valor: (p) => formatarData(p.prazo) },
            { titulo: "Conclusão", valor: (p) => (p.dataConclusao ? formatarData(p.dataConclusao) : "") },
            { titulo: "Responsável", valor: (p) => p.responsavelNome },
            { titulo: "Registrado por", valor: (p) => p.autorNome },
            { titulo: "Solução", valor: (p) => p.solucao },
            { titulo: "Custo (R$)", valor: (p) => (p.custoTotal || 0) / 100 },
          ]);
          return avisar(`${lista.length} registro(s) exportado(s).`);
        }
        if (tipo === "custos") {
          const lista = await listarCustos({ unidades, inicio: periodo.inicio, fim: periodo.fim, setores: ["equipamentos", "estrutura", ...setores] });
          exportarCSV(nomeArq("custos"), lista, [
            { titulo: "Data", valor: (c) => formatarData(c.data) },
            { titulo: "Unidade", valor: (c) => nomeUnidade(c.unidadeId) },
            { titulo: "Setor", valor: (c) => nomeModulo(c.setorId) },
            { titulo: "Descrição", valor: (c) => c.descricao },
            { titulo: "Categoria", valor: (c) => c.categoria },
            { titulo: "Fornecedor", valor: (c) => c.fornecedor },
            { titulo: "Valor (R$)", valor: (c) => (c.valor || 0) / 100 },
            { titulo: "Ocorrência", valor: (c) => c.pendenciaCodigo || "" },
            { titulo: "Nota fiscal", valor: (c) => c.notaFiscal?.url || "" },
            { titulo: "Lançado por", valor: (c) => c.autorNome },
          ]);
          return avisar(`${lista.length} custo(s) exportado(s).`);
        }
        if (tipo === "atendimentos" || tipo === "contatos") {
          const setorId = tipo === "atendimentos" ? "recepcao" : "comercial";
          const lista = await listarRegistros({ unidades, setorId, inicio: periodo.inicio, fim: periodo.fim });
          exportarCSV(nomeArq(tipo), lista, [
            { titulo: "Data e hora", valor: (r) => r.criadoEm },
            { titulo: "Unidade", valor: (r) => nomeUnidade(r.unidadeId) },
            { titulo: "Tipo", valor: (r) => r.dados?.tipo },
            { titulo: "Canal", valor: (r) => r.dados?.canal },
            { titulo: "Resultado", valor: (r) => r.dados?.resultado },
            { titulo: "Nome", valor: (r) => r.dados?.nome },
            { titulo: "Observação", valor: (r) => r.dados?.observacao },
            { titulo: "Registrado por", valor: (r) => r.autorNome },
          ]);
          return avisar(`${lista.length} registro(s) exportado(s).`);
        }
        if (tipo === "evo") {
          const lista = await listarEvo({ unidades, inicio: periodo.inicio, fim: periodo.fim });
          exportarCSV(nomeArq("evo"), lista, [
            { titulo: "Data", valor: (e) => formatarData(e.data) },
            { titulo: "Unidade", valor: (e) => nomeUnidade(e.unidadeId) },
            { titulo: "Tipo", valor: (e) => TIPOS_EVO[e.tipo] },
            { titulo: "Código do aluno", valor: (e) => e.alunoCodigo },
            { titulo: "Aluno", valor: (e) => e.alunoNome },
            { titulo: "Plano", valor: (e) => e.plano },
            { titulo: "Valor (R$)", valor: (e) => (e.valor || 0) / 100 },
            { titulo: "Vendedor", valor: (e) => e.vendedor },
            { titulo: "Motivo", valor: (e) => e.motivo },
          ]);
          return avisar(`${lista.length} registro(s) exportado(s).`);
        }
      } catch (e) {
        avisarErro(e);
      }
    })
  );
}

export { opcoes, lerFormulario, obterRelatorio };
