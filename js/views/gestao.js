// Gestão gerencial: rotina do gestor, painel, relatório mensal, investimentos e escala.
import { html, raw, montar, $, $$, on, opcoes, lerFormulario } from "../core/dom.js";
import { icone } from "../core/icones.js";
import { pode, aprovador, nomeUnidade, unidadesFiltro, minhasUnidades, modulosRotina, nomeModulo } from "../core/sessao.js";
import {
  estadoVazio, estadoErro, carregandoPagina, indicador, anel, abrirModal, avisar, avisarErro, comCarregamento, pedirTexto, seloInvestimento,
} from "../core/ui.js";
import { hoje, mesDe, somarMeses, nomeMes, inicioMes, fimMes, somarDias, segundaDaSemana, diaSemana, formatarData, nomeDiaSemana } from "../core/tempo.js";
import { numero, pct, moeda, razao, centavosParaTexto } from "../core/formato.js";
import { atualizarBusca } from "../core/rotas.js";
import { graficoLinha, graficoBarras, ranking } from "../core/graficos.js";
import { mensagemDe } from "../core/erros.js";
import { STATUS_INVESTIMENTO, PRIORIDADES } from "../core/constantes.js";
import { minhasTarefas, carregarEscalas, salvarEscala } from "../services/rotinas.js";
import { resumoRotinas, resumoPendencias, FORMULAS } from "../services/indicadores.js";
import { listarInvestimentos, salvarInvestimento, decidirInvestimento, obterRelatorio, salvarRelatorio, decidirRelatorio, SECOES_RELATORIO, STATUS_RELATORIO } from "../services/gestao.js";
import { montarDados, congelarNumeros } from "../services/relatorios.js";
import { pessoasPara } from "../services/usuarios.js";
import { cabecalho, abas, resolverPeriodo, filtroPeriodo, ligarFiltros } from "./comum.js";
import { cartaoTarefa } from "./tarefas.js";
import { relatorioMensalHTML } from "./componentes/relatorio-mensal.js";

export default async function telaGestao(el, ctx) {
  const lista = [];
  if (pode("gestao", 1)) lista.push({ id: "rotina", rotulo: "Minha rotina" });
  if (pode("gestao", 2)) lista.push({ id: "painel", rotulo: "Painel do gestor" });
  if (pode("gestao", 2) || aprovador()) lista.push({ id: "relatorio", rotulo: "Relatório mensal" });
  if (pode("gestao", 2) || aprovador()) lista.push({ id: "investimentos", rotulo: "Investimentos" });
  if (pode("gestao", 3)) lista.push({ id: "escala", rotulo: "Escala" });
  const aba = lista.some((a) => a.id === ctx.busca.aba) ? ctx.busca.aba : lista[0]?.id;
  montar(
    el,
    html`${cabecalho("Gestão gerencial", "Planejamento, supervisão e análise de resultados da unidade.", pode("pendencias", 1) ? html`<button class="btn btn-secundario" data-providencia>${icone("bandeira")} Nova providência</button>` : "")}
    ${abas(lista, aba, "#/gestao")}
    <div id="conteudo-aba">${carregandoPagina()}</div>`
  );
  on(el, "click", "[data-providencia]", async () => {
    const { abrirNovaOcorrencia } = await import("./componentes/form-ocorrencia.js");
    const c = await abrirNovaOcorrencia({ origem: "providencia" });
    if (c) location.hash = `#/ocorrencias/${c.id}`;
  });
  const alvo = $("#conteudo-aba", el);
  const unidades = unidadesFiltro().map((u) => u.id);
  try {
    if (aba === "rotina") await abaRotina(alvo);
    else if (aba === "painel") await abaPainel(alvo, ctx, unidades);
    else if (aba === "relatorio") await abaRelatorio(alvo, ctx);
    else if (aba === "investimentos") await abaInvestimentos(alvo, ctx, unidades);
    else if (aba === "escala") await abaEscala(alvo, ctx, unidades);
  } catch (e) {
    console.error(e);
    montar(alvo, estadoErro(e));
    on(alvo, "click", "[data-acao=recarregar]", ctx.recarregar);
  }
}

// ---------------- Minha rotina ----------------
async function abaRotina(alvo) {
  const tarefas = await minhasTarefas({ setores: ["gestao"] });
  const grupos = [
    { titulo: "Diário", itens: tarefas.filter((t) => t.modelo.frequencia === "diaria") },
    { titulo: "Planejamento semanal", itens: tarefas.filter((t) => t.modelo.frequencia === "semanal") },
    { titulo: "Fechamento do mês", itens: tarefas.filter((t) => t.modelo.frequencia === "mensal") },
  ].filter((g) => g.itens.length);
  montar(
    alvo,
    grupos.length
      ? html`<p class="texto-2 pequeno" style="max-width:72ch">Cada item mostra os dados reais do sistema ao lado. Avalie, registre observações e, quando precisar, gere uma providência com responsável e prazo.</p>
        ${grupos.map((g) => html`<section style="margin:18px 0"><h2 style="font-size:var(--t-md);margin-bottom:10px;color:var(--texto-2)">${g.titulo}</h2><div class="pilha-sm">${g.itens.map((t) => cartaoTarefa(t, "#/gestao?aba=rotina"))}</div></section>`)}`
      : estadoVazio({ icone: "gestao", titulo: "Nenhuma rotina gerencial para você agora", texto: "As rotinas do gestor (diária, semanal e mensal) aparecem aqui no dia certo. Confira em Rotinas se você está como responsável." })
  );
}

// ---------------- Painel do gestor ----------------
async function abaPainel(alvo, ctx, unidades) {
  const periodo = resolverPeriodo(ctx.busca, "30d");
  const setoresOp = modulosRotina().map((m) => m.id).filter((s) => s !== "gestao");
  const d = hoje();
  const semana = segundaDaSemana(d);
  const [ger, op, pend, semAtual, semAnterior, mesAtual, mesAnterior] = await Promise.all([
    resumoRotinas({ unidades, setores: ["gestao"], inicio: periodo.inicio, fim: periodo.fim }),
    resumoRotinas({ unidades, setores: setoresOp, inicio: periodo.inicio, fim: periodo.fim }),
    resumoPendencias({ unidades, inicio: periodo.inicio, fim: periodo.fim, setores: setoresOp.concat(["equipamentos", "estrutura"]) }),
    resumoRotinas({ unidades, setores: setoresOp, inicio: semana, fim: d }),
    resumoRotinas({ unidades, setores: setoresOp, inicio: somarDias(semana, -7), fim: somarDias(semana, -1) }),
    resumoRotinas({ unidades, setores: setoresOp, inicio: inicioMes(mesDe(d)), fim: d }),
    resumoRotinas({ unidades, setores: setoresOp, inicio: inicioMes(somarMeses(mesDe(d), -1)), fim: fimMes(somarMeses(mesDe(d), -1)) }),
  ]);
  let metasInfo = null;
  if (pode("comercial", 1)) {
    const { listarMetas, resumoComercial, realizadoMeta } = await import("../services/comercial.js");
    const mes = mesDe(d);
    const metas = await listarMetas({ unidades, mes }).catch(() => []);
    if (metas.length && pode("comercial", 2)) {
      const rc = await resumoComercial({ unidades, inicio: inicioMes(mes), fim: d }).catch(() => null);
      if (rc) {
        const alcances = metas.map((m) => razao(realizadoMeta(m, rc), m.valor) ?? 0);
        metasInfo = { media: alcances.reduce((a, b) => a + b, 0) / alcances.length, atingidas: alcances.filter((a) => a >= 1).length, total: metas.length };
      }
    }
  }
  const serie = op.serieDiaria;
  const delta = (a, b) => (a === null || b === null || a === undefined || b === undefined ? "" : `${a - b >= 0 ? "+" : ""}${Math.round((a - b) * 100)} p.p.`);
  const porUnidadeGer = ger.listaUnidades.filter((u) => u.programados);

  montar(
    alvo,
    html`${filtroPeriodo(periodo)}
    <div class="painel painel-destaque" style="margin-bottom:16px">
      <div class="linha" style="gap:28px;align-items:center">
        ${anel(ger.taxas.execucao, { rotulo: "gerencial" })}
        <div class="expande" style="min-width:240px">
          <h2 style="margin-bottom:4px">Atividades gerenciais concluídas</h2>
          <p class="texto-2 pequeno" style="max-width:62ch">${FORMULAS.gerencial}</p>
          <div class="linha" style="gap:8px"><span class="chip">${numero(ger.total.concluidas)} concluídas</span><span class="chip">${numero(ger.total.pendentes)} não realizadas</span><span class="chip">${numero(ger.total.naoVerificadas + ger.total.naoEnviados)} blocos/itens não verificados</span></div>
        </div>
      </div>
    </div>
    <div class="indicadores" style="margin-bottom:16px">
      ${indicador({ rotulo: "Checklists dos setores recebidos", valor: numero(op.total.enviados), nota: `de ${numero(op.total.programados)} programados` })}
      ${indicador({ rotulo: "Checklists não enviados", valor: numero(op.total.naoEnviados), tom: op.total.naoEnviados ? "critico" : "", formula: FORMULAS.naoEnviados })}
      ${indicador({ rotulo: "Pendências abertas", valor: numero(pend.abertas) })}
      ${indicador({ rotulo: "Pendências resolvidas", valor: numero(pend.resolvidasPeriodo), nota: periodo.rotulo })}
      ${indicador({ rotulo: "Pendências atrasadas", valor: numero(pend.atrasadas), tom: pend.atrasadas ? "alerta" : "" })}
      ${metasInfo ? indicador({ rotulo: "Cumprimento das metas (mês)", valor: pct(metasInfo.media), nota: `${metasInfo.atingidas} de ${metasInfo.total} metas atingidas` }) : ""}
      ${indicador({ rotulo: "Produtividade operacional", valor: pct(op.taxas.execucao), formula: FORMULAS.execucao })}
    </div>
    <div class="grade-2" style="margin-bottom:16px">
      <section class="painel"><div class="painel-cabecalho"><div><h3>Evolução da produtividade operacional</h3><p>Execução diária de todos os setores</p></div></div>
        ${serie.length > 1 ? graficoLinha({ rotulos: serie.map((s) => formatarData(s.data, { curta: true })), series: [{ nome: "Execução", valores: serie.map((s) => (s.itensAplicaveis ? s.execucao : null)) }], maximo: 1, formato: (v) => pct(v), titulo: "Produtividade operacional" }) : html`<p class="pequeno texto-3">Escolha um período maior para ver a evolução.</p>`}
      </section>
      <section class="painel"><div class="painel-cabecalho"><div><h3>Comparativos</h3><p>Execução operacional</p></div></div>
        <div class="tabela-envoltorio" style="border:0;background:none"><table class="tabela">
          <thead><tr><th></th><th class="num">Atual</th><th class="num">Anterior</th><th class="num">Variação</th></tr></thead>
          <tbody>
            <tr><td>Semana</td><td class="num">${pct(semAtual.taxas.execucao)}</td><td class="num">${pct(semAnterior.taxas.execucao)}</td><td class="num">${delta(semAtual.taxas.execucao, semAnterior.taxas.execucao)}</td></tr>
            <tr><td>Mês</td><td class="num">${pct(mesAtual.taxas.execucao)}</td><td class="num">${pct(mesAnterior.taxas.execucao)}</td><td class="num">${delta(mesAtual.taxas.execucao, mesAnterior.taxas.execucao)}</td></tr>
            <tr><td>Blocos não enviados (mês)</td><td class="num">${numero(mesAtual.total.naoEnviados)}</td><td class="num">${numero(mesAnterior.total.naoEnviados)}</td><td class="num"></td></tr>
          </tbody></table></div>
        ${porUnidadeGer.length > 1 ? html`<h4 style="margin:16px 0 8px">Execução gerencial por unidade</h4>${ranking(porUnidadeGer.map((u) => ({ rotulo: nomeUnidade(u.id), valor: Math.round((u.execucao || 0) * 100) })), { formato: (v) => `${v}%`, maximo: 100 })}` : ""}
      </section>
    </div>
    <div class="grade-2">
      <section class="painel"><div class="painel-cabecalho"><div><h3>Ocorrências recorrentes</h3><p>3 ou mais registros no mesmo item</p></div></div>
        ${pend.recorrentes.length ? ranking(pend.recorrentes.map((r) => ({ rotulo: r.rotulo || "Item sem nome", valor: r.quantidade, detalhe: nomeUnidade(r.unidadeId), cor: "var(--pendente)" }))) : html`<p class="pequeno texto-3">Nenhuma recorrência identificada.</p>`}
      </section>
      <section class="painel"><div class="painel-cabecalho"><div><h3>Execução por setor</h3><p>${periodo.rotulo}</p></div></div>
        ${op.listaSetores.filter((s) => s.programados).length ? ranking(op.listaSetores.filter((s) => s.programados).map((s) => ({ rotulo: s.nome, valor: Math.round((s.execucao || 0) * 100), detalhe: `${s.naoEnviados} não enviado(s)` })), { formato: (v) => `${v}%`, maximo: 100 }) : html`<p class="pequeno texto-3">Sem rotinas no período.</p>`}
      </section>
    </div>`
  );
  ligarFiltros(alvo, (dd) => atualizarBusca(dd, { recarregar: true }));
}

// ---------------- Relatório mensal ----------------
async function abaRelatorio(alvo, ctx) {
  const unidadesMinhas = minhasUnidades();
  const unidadeId = unidadesMinhas.some((u) => u.id === ctx.busca.unidade) ? ctx.busca.unidade : unidadesFiltro()[0]?.id || unidadesMinhas[0]?.id;
  const padraoMes = Number(hoje().slice(8)) <= 10 ? somarMeses(mesDe(hoje()), -1) : mesDe(hoje());
  const mes = /^\d{4}-\d{2}$/.test(ctx.busca.mes || "") ? ctx.busca.mes : padraoMes;
  const rel = await obterRelatorio(unidadeId, mes);
  const editavel = pode("gestao", 3) && (!rel || ["rascunho", "devolvido"].includes(rel.status));
  const meses = Array.from({ length: 12 }, (_, i) => somarMeses(mesDe(hoje()), -i));
  const ini = inicioMes(mes);
  const fim = mes === mesDe(hoje()) ? hoje() : fimMes(mes);

  // Números: congelados (enviado/aprovado) ou calculados agora (rascunho)
  let numeros = rel?.numeros || null;
  if (!numeros) {
    try {
      numeros = congelarNumeros(await montarDados({ unidades: [unidadeId], inicio: ini, fim }));
    } catch {
      numeros = null;
    }
  }
  const textos = rel?.textos || {};
  const plano = rel?.plano?.length ? rel.plano : [];
  const st = rel ? STATUS_RELATORIO[rel.status] : { rotulo: "Não iniciado", classe: "selo-tracejado" };

  montar(
    alvo,
    html`<form class="filtros nao-imprimir" id="f-rel">
      <div class="campo"><label for="r-un">Unidade</label><select id="r-un" name="unidade">${opcoes(unidadesMinhas.map((u) => ({ valor: u.id, rotulo: u.nome })), unidadeId)}</select></div>
      <div class="campo"><label for="r-mes">Mês</label><select id="r-mes" name="mes">${opcoes(meses.map((m) => ({ valor: m, rotulo: nomeMes(m) })), mes)}</select></div>
      <div class="linha" style="padding-bottom:2px;gap:8px"><span class="selo ${st.classe}">${st.rotulo}</span>
        <button type="button" class="btn btn-secundario btn-sm" data-imprimir>${icone("imprimir")} Imprimir / PDF</button></div>
    </form>
    ${rel?.status === "devolvido" && rel.aprovacao?.comentario ? html`<div class="aviso aviso-marca nao-imprimir" style="margin-bottom:16px">${icone("alerta")}<div><strong>Devolvido por ${rel.aprovacao.porNome}:</strong> ${rel.aprovacao.comentario}</div></div>` : ""}
    ${editavel
      ? html`<div class="painel nao-imprimir" style="margin-bottom:20px">
          <div class="painel-cabecalho"><div><h3>Análises do gestor</h3><p>Os números de cada seção são preenchidos automaticamente. Escreva a análise, as melhorias, as necessidades (com valores) e o plano de ação.</p></div></div>
          <form class="pilha" id="form-rel" novalidate>
            ${SECOES_RELATORIO.map((s, i) => html`<div class="campo"><label for="t-${s.id}" class="${s.id === "resumo" ? "obrigatorio" : ""}">${i + 1}. ${s.titulo}</label><textarea id="t-${s.id}" name="${s.id}" maxlength="6000" style="min-height:${s.id === "resumo" ? 120 : 76}px">${textos[s.id] || ""}</textarea></div>`)}
            <div><span class="rotulo">Plano de ação para o próximo mês</span>
              <div class="pilha-sm" id="plano" style="margin-top:8px">${(plano.length ? plano : [{}]).map((p, i) => linhaPlano(p, i))}</div>
              <button type="button" class="btn btn-secundario btn-sm" data-add-plano style="margin-top:8px">${icone("mais")} Adicionar ação</button></div>
            <div class="aviso aviso-erro oculto" id="erro-rel"></div>
            <div class="linha-entre"><span class="pequeno texto-3">Ao enviar, os números do mês ficam congelados e o relatório vai para a aprovação da diretoria.</span>
              <div class="linha"><button type="button" class="btn btn-secundario" data-salvar>${icone("check")} Salvar rascunho</button><button type="button" class="btn btn-primario" data-enviar>${icone("aviao")} Enviar para aprovação</button></div></div>
          </form>
        </div>`
      : ""}
    ${rel?.status === "enviado" && aprovador()
      ? html`<div class="painel painel-destaque nao-imprimir" style="margin-bottom:20px"><div class="linha-entre"><div><h3>Aguardando sua aprovação</h3><p class="pequeno texto-2" style="margin:4px 0 0">Enviado por ${rel.enviadoPorNome} em ${formatarData(rel.enviadoEm)}.</p></div>
          <div class="linha"><button class="btn btn-secundario" data-devolver>${icone("desfazer")} Devolver para ajustes</button><button class="btn btn-primario" data-aprovar>${icone("check")} Aprovar</button></div></div></div>`
      : ""}
    <div id="previa">${relatorioMensalHTML({ unidadeNome: nomeUnidade(unidadeId), mes, numeros, textos, plano, status: rel?.status, aprovacao: rel?.aprovacao, enviadoPorNome: rel?.enviadoPorNome, enviadoEm: rel?.enviadoEm })}</div>`
  );

  $("#f-rel", alvo).addEventListener("change", () => {
    const d = lerFormulario($("#f-rel", alvo));
    atualizarBusca({ unidade: d.unidade, mes: d.mes }, { recarregar: true });
  });
  on(alvo, "click", "[data-imprimir]", () => window.print());

  const coletar = () => {
    const form = $("#form-rel", alvo);
    const d = lerFormulario(form);
    const textosNovos = Object.fromEntries(SECOES_RELATORIO.map((s) => [s.id, d[s.id] || ""]));
    const planoNovo = $$("[data-linha-plano]", alvo).map((linha) => ({
      problema: $("[name=problema]", linha).value,
      medida: $("[name=medida]", linha).value,
      responsavel: $("[name=responsavel]", linha).value,
      prazo: $("[name=prazo]", linha).value,
      status: $("[name=statusPlano]", linha).value,
    }));
    return { textos: textosNovos, plano: planoNovo };
  };
  const salvar = (enviar) => async (ev, botao) => {
    const erro = $("#erro-rel", alvo);
    erro.classList.add("oculto");
    await comCarregamento(botao, async () => {
      try {
        const { textos: t, plano: p } = coletar();
        let numerosEnvio = null;
        if (enviar) numerosEnvio = congelarNumeros(await montarDados({ unidades: [unidadeId], inicio: ini, fim }));
        await salvarRelatorio({ unidadeId, mes, textos: t, plano: p, enviar, numeros: numerosEnvio });
        avisar(enviar ? "Relatório enviado para aprovação." : "Rascunho salvo.");
        ctx.recarregar();
      } catch (e) {
        erro.textContent = mensagemDe(e);
        erro.classList.remove("oculto");
      }
    });
  };
  on(alvo, "click", "[data-salvar]", salvar(false));
  on(alvo, "click", "[data-enviar]", salvar(true));
  on(alvo, "click", "[data-add-plano]", () => {
    const caixa = $("#plano", alvo);
    const temp = document.createElement("div");
    montar(temp, linhaPlano({}, caixa.children.length));
    caixa.appendChild(temp.firstElementChild);
  });
  on(alvo, "click", "[data-remover-plano]", (ev, b) => b.closest("[data-linha-plano]").remove());
  on(alvo, "click", "[data-aprovar]", (ev, b) =>
    comCarregamento(b, async () => {
      try {
        await decidirRelatorio(rel, true);
        avisar("Relatório aprovado.");
        ctx.recarregar();
      } catch (e) {
        avisarErro(e);
      }
    })
  );
  on(alvo, "click", "[data-devolver]", async () => {
    const c = await pedirTexto({ titulo: "Devolver relatório", rotulo: "O que precisa ser ajustado?", confirmarTexto: "Devolver" });
    if (!c) return;
    try {
      await decidirRelatorio(rel, false, c);
      avisar("Relatório devolvido ao gestor.");
      ctx.recarregar();
    } catch (e) {
      avisarErro(e);
    }
  });
}

function linhaPlano(p, i) {
  return html`<div class="painel painel-compacto" data-linha-plano style="padding:12px">
    <div class="grade-form">
      <div class="campo"><label>Problema</label><input name="problema" value="${p.problema || ""}" maxlength="200" /></div>
      <div class="campo"><label>Medida necessária</label><input name="medida" value="${p.medida || ""}" maxlength="300" /></div>
      <div class="campo"><label>Responsável</label><input name="responsavel" value="${p.responsavel || ""}" maxlength="80" /></div>
      <div class="campo"><label>Prazo</label><input type="date" name="prazo" value="${p.prazo || ""}" /></div>
      <div class="campo"><label>Status</label><select name="statusPlano">${opcoes([{ valor: "planejado", rotulo: "Planejado" }, { valor: "andamento", rotulo: "Em andamento" }, { valor: "concluido", rotulo: "Concluído" }], p.status || "planejado")}</select></div>
      <div class="campo" style="justify-content:flex-end"><button type="button" class="btn btn-fantasma btn-sm" data-remover-plano aria-label="Remover ação ${i + 1}">${icone("lixo")} Remover</button></div>
    </div>
  </div>`;
}

// ---------------- Investimentos ----------------
async function abaInvestimentos(alvo, ctx, unidades) {
  const lista = await listarInvestimentos(unidades);
  const editar = pode("gestao", 3);
  const total = (st) => lista.filter((i) => st.includes(i.status)).reduce((s, i) => s + (i.status === "realizado" ? i.valorRealizado || 0 : i.valorEstimado || 0), 0);
  montar(
    alvo,
    html`<div class="indicadores" style="margin-bottom:16px">
      ${indicador({ rotulo: "Identificados / orçados", valor: moeda(total(["identificado", "orcado"])), nota: `${lista.filter((i) => ["identificado", "orcado"].includes(i.status)).length} necessidade(s)` })}
      ${indicador({ rotulo: "Aprovados (a realizar)", valor: moeda(total(["aprovado"])) })}
      ${indicador({ rotulo: "Realizados", valor: moeda(total(["realizado"])), tom: "positivo" })}
    </div>
    <div class="linha-entre" style="margin-bottom:12px"><p class="pequeno texto-2" style="margin:0">Reformas, compras e melhorias que precisam de recursos. A aprovação é feita pela diretoria.</p>${editar ? html`<button class="btn btn-primario" data-novo>${icone("mais")} Nova necessidade</button>` : ""}</div>
    ${lista.length
      ? html`<div class="tabela-envoltorio"><table class="tabela responsiva">
          <thead><tr><th>Necessidade</th><th>Unidade</th><th>Prioridade</th><th>Situação</th><th class="num">Estimado</th><th class="num">Orçamentos</th><th class="num">Realizado</th><th></th></tr></thead>
          <tbody>${lista.map(
            (i) => html`<tr>
              <td class="principal-celula" data-rotulo="Necessidade"><strong>${i.titulo}</strong><div class="pequeno texto-3">${nomeModulo(i.setorId)}${i.descricao ? ` · ${i.descricao}` : ""}</div></td>
              <td data-rotulo="Unidade">${nomeUnidade(i.unidadeId)}</td>
              <td data-rotulo="Prioridade">${PRIORIDADES[i.prioridade]?.rotulo}</td>
              <td data-rotulo="Situação">${seloInvestimento(i.status)}</td>
              <td class="num" data-rotulo="Estimado">${moeda(i.valorEstimado)}</td>
              <td class="num" data-rotulo="Orçamentos">${i.orcamentos?.length ? i.orcamentos.map((o) => `${o.fornecedor}: ${moeda(o.valor)}`).join(" · ") : "—"}</td>
              <td class="num" data-rotulo="Realizado">${i.valorRealizado ? html`${moeda(i.valorRealizado)}<div class="pequeno texto-3">${formatarData(i.dataRealizacao)}</div>` : "—"}</td>
              <td class="direita" data-rotulo="">
                ${aprovador() && ["identificado", "orcado"].includes(i.status) ? html`<button class="btn btn-secundario btn-sm" data-decidir="${i.id}">${icone("check")} Decidir</button>` : ""}
                ${editar ? html`<button class="btn btn-fantasma btn-sm" data-editar="${i.id}">${icone("editar")}</button>` : ""}
              </td>
            </tr>`
          )}</tbody></table></div>`
      : estadoVazio({ icone: "dinheiro", titulo: "Nenhuma necessidade registrada", texto: "Registre reformas, compras de equipamentos e melhorias com valores estimados e orçamentos." })}`
  );
  const porId = new Map(lista.map((i) => [i.id, i]));
  const abrir = (inv = null) => {
    const d = inv || { unidadeId: unidades[0], status: "identificado", prioridade: "media", setorId: "estrutura", orcamentos: [] };
    const orc = [...(d.orcamentos || []), {}, {}].slice(0, 3);
    abrirModal({
      titulo: inv ? "Editar investimento" : "Nova necessidade de investimento",
      largo: true,
      corpo: html`<form class="grade-form" id="form-inv" novalidate>
        <div class="campo largo"><label class="obrigatorio">Título</label><input name="titulo" value="${d.titulo || ""}" maxlength="120" placeholder="Ex.: Troca do ar-condicionado do salão" /></div>
        <div class="campo"><label>Unidade</label><select name="unidadeId" ${inv ? "disabled" : ""}>${opcoes(minhasUnidades().map((u) => ({ valor: u.id, rotulo: u.nome })), d.unidadeId)}</select></div>
        <div class="campo"><label>Área</label><select name="setorId">${opcoes([{ valor: "estrutura", rotulo: "Estrutura física" }, { valor: "equipamentos", rotulo: "Equipamentos" }, { valor: "marketing", rotulo: "Marketing" }, { valor: "gestao", rotulo: "Administrativo" }], d.setorId)}</select></div>
        <div class="campo"><label>Prioridade</label><select name="prioridade">${opcoes(Object.entries(PRIORIDADES).map(([v, p]) => ({ valor: v, rotulo: p.rotulo })), d.prioridade)}</select></div>
        <div class="campo"><label>Valor estimado (R$)</label><input name="valorEstimado" inputmode="decimal" value="${d.valorEstimado ? centavosParaTexto(d.valorEstimado) : ""}" /></div>
        <div class="campo largo"><label>Descrição e justificativa</label><textarea name="descricao" maxlength="2000">${d.descricao || ""}</textarea></div>
        ${orc.map((o, i) => html`<div class="campo"><label>Orçamento ${i + 1} — fornecedor</label><input name="forn${i}" value="${o.fornecedor || ""}" maxlength="80" /></div><div class="campo"><label>Orçamento ${i + 1} — valor (R$)</label><input name="val${i}" inputmode="decimal" value="${o.valor ? centavosParaTexto(o.valor) : ""}" /></div>`)}
        <div class="campo"><label>Situação</label><select name="status">${opcoes(
          Object.entries(STATUS_INVESTIMENTO)
            .filter(([v]) => (inv ? (v === "aprovado" ? aprovador() || d.status === "aprovado" : true) : ["identificado", "orcado"].includes(v)))
            .map(([v, s]) => ({ valor: v, rotulo: s.rotulo })),
          d.status
        )}</select></div>
        <div class="campo"><label>Valor realizado (R$)</label><input name="valorRealizado" inputmode="decimal" value="${d.valorRealizado ? centavosParaTexto(d.valorRealizado) : ""}" /></div>
        <div class="campo"><label>Data de realização</label><input type="date" name="dataRealizacao" value="${d.dataRealizacao || ""}" /></div>
        <div class="aviso aviso-erro oculto largo" id="erro-inv"></div>
      </form>`,
      rodape: html`<button class="btn btn-secundario" data-fechar>Cancelar</button><button class="btn btn-primario" data-ok>Salvar</button>`,
      aoMontar: (mel, fechar) =>
        on(mel, "click", "[data-ok]", (ev, b) =>
          comCarregamento(b, async () => {
            const f = lerFormulario($("#form-inv", mel));
            try {
              await salvarInvestimento(inv?.id || null, {
                ...f,
                unidadeId: inv ? inv.unidadeId : f.unidadeId,
                orcamentos: [0, 1, 2].map((i) => ({ fornecedor: f[`forn${i}`], valor: f[`val${i}`] })),
              });
              avisar("Investimento salvo.");
              fechar(true);
              ctx.recarregar();
            } catch (e) {
              const c = $("#erro-inv", mel);
              c.textContent = mensagemDe(e);
              c.classList.remove("oculto");
            }
          })
        ),
    });
  };
  on(alvo, "click", "[data-novo]", () => abrir());
  on(alvo, "click", "[data-editar]", (ev, b) => abrir(porId.get(b.dataset.editar)));
  on(alvo, "click", "[data-decidir]", (ev, b) => {
    const inv = porId.get(b.dataset.decidir);
    abrirModal({
      titulo: inv.titulo,
      corpo: html`<p class="texto-2">Valor estimado: <strong>${moeda(inv.valorEstimado)}</strong>${inv.orcamentos?.length ? html`<br />Orçamentos: ${inv.orcamentos.map((o) => `${o.fornecedor} ${moeda(o.valor)}`).join(" · ")}` : ""}</p>
        <div class="campo"><label for="dec-com">Comentário (opcional)</label><textarea id="dec-com" maxlength="1000"></textarea></div>`,
      rodape: html`<button class="btn btn-perigo" data-descartar>Descartar</button><button class="btn btn-primario" data-aprovar-inv>${icone("check")} Aprovar</button>`,
      aoMontar: (mel, fechar) => {
        const decidir = (ok) => async (e2, botao) =>
          comCarregamento(botao, async () => {
            try {
              await decidirInvestimento(inv, ok, $("#dec-com", mel).value);
              avisar(ok ? "Investimento aprovado." : "Investimento descartado.");
              fechar(true);
              ctx.recarregar();
            } catch (e) {
              avisarErro(e);
            }
          });
        on(mel, "click", "[data-aprovar-inv]", decidir(true));
        on(mel, "click", "[data-descartar]", decidir(false));
      },
    });
  });
}

// ---------------- Escala ----------------
async function abaEscala(alvo, ctx, unidades) {
  const d = hoje();
  const inicio = segundaDaSemana(d);
  const sabados = Array.from({ length: 8 }, (_, i) => somarDias(inicio, 5 + i * 7));
  const domingosEFeriados = [];
  const escalas = await carregarEscalas(unidades, sabados[0], sabados[sabados.length - 1]);
  const gestores = {};
  for (const u of unidades) gestores[u] = await pessoasPara({ unidadeId: u, modulo: "gestao", nivelMinimo: 1 }).catch(() => []);
  montar(
    alvo,
    html`<p class="texto-2 pequeno" style="max-width:72ch">Marque quem está escalado em cada sábado. Os blocos de rotina marcados como "somente quando escalado" (ex.: Sábado — Inspeção geral) aparecem apenas para essas pessoas.</p>
    ${unidades.map(
      (u) => html`<section class="painel" style="margin-bottom:12px">
        <div class="painel-cabecalho"><h3>${nomeUnidade(u)}</h3></div>
        ${gestores[u].length
          ? html`<div class="tabela-envoltorio" style="border:0;background:none"><table class="tabela"><thead><tr><th>Sábado</th>${gestores[u].map((g) => html`<th>${g.nome}</th>`)}</tr></thead>
              <tbody>${sabados.map((s) => {
                const logins = escalas.get(`${u}__${s}`) || [];
                return html`<tr><td><strong>${formatarData(s)}</strong> <span class="texto-3 pequeno">${nomeDiaSemana(s, true)}</span></td>${gestores[u].map(
                  (g) => html`<td><label class="marcar"><input type="checkbox" data-escala="${u}__${s}" value="${g.login}" ${raw(logins.includes(g.login) ? "checked" : "")} /><span class="sr-only">${g.nome} em ${formatarData(s)}</span></label></td>`
                )}</tr>`;
              })}</tbody></table></div>`
          : html`<p class="pequeno texto-3">Nenhuma pessoa com acesso à gestão gerencial nesta unidade.</p>`}
      </section>`
    )}`
  );
  on(alvo, "change", "[data-escala]", async (ev, cb) => {
    const [u, data] = cb.dataset.escala.split("__");
    const logins = $$(`[data-escala="${cb.dataset.escala}"]`, alvo).filter((x) => x.checked).map((x) => x.value);
    try {
      await salvarEscala(u, data, logins);
      avisar(`Escala de ${formatarData(data)} salva.`);
    } catch (e) {
      cb.checked = !cb.checked;
      avisarErro(e);
    }
  });
  return domingosEFeriados;
}

export { diaSemana, graficoBarras };
