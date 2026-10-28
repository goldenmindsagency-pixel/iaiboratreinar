// Visão geral: painel adaptado às permissões de quem entra.
import { html, montar, $, on } from "../core/dom.js";
import { icone } from "../core/icones.js";
import { sessao, pode, ehAdmin, modulosRotina, nomeUnidade, unidadesFiltro, minhasUnidades, todosModulos } from "../core/sessao.js";
import { indicador, anel, seloPrioridade, carregandoPagina, estadoErro } from "../core/ui.js";
import { hoje, somarDias, inicioMes, mesDe, formatarData, nomeDiaSemana, relativo } from "../core/tempo.js";
import { numero, pct } from "../core/formato.js";
import { graficoLinha, graficoBarras, ranking } from "../core/graficos.js";
import { resumoRotinas, resumoPendencias, FORMULAS } from "../services/indicadores.js";
import { diretorio } from "../services/usuarios.js";
import { minhasTarefas } from "../services/rotinas.js";
import { cabecalho, rotuloUnidades } from "./comum.js";
import { cartaoTarefa } from "./tarefas.js";
import telaTarefas from "./tarefas.js";

export default async function telaInicio(el, ctx) {
  const setoresRotina = modulosRotina().map((m) => m.id);
  const setoresOp = setoresRotina.filter((s) => s !== "gestao");
  const supervisiona = setoresOp.some((s) => pode(s, 2)) || pode("pendencias", 2) || ehAdmin();
  if (!supervisiona) return telaTarefas(el, ctx);

  const d = hoje();
  const unidades = unidadesFiltro().map((u) => u.id);
  const nome = sessao.perfil?.nome?.split(" ")[0] || "";
  montar(
    el,
    html`${cabecalho(`Olá, ${nome}`, `${nomeDiaSemana(d)}, ${formatarData(d)} · ${rotuloUnidades()}`, pode("pendencias", 1) ? html`<a class="btn btn-secundario" href="#/ocorrencias?nova=1">${icone("alerta")} Registrar ocorrência</a>` : "")}
    <div id="painel">${carregandoPagina()}</div>`
  );
  const alvo = $("#painel", el);
  try {
    const ini14 = somarDias(d, -13);
    const iniMes = inicioMes(mesDe(d));
    const [hojeR, r14, pend, pessoas, tarefas, comercial] = await Promise.all([
      resumoRotinas({ unidades, setores: setoresOp, inicio: d, fim: d }),
      resumoRotinas({ unidades, setores: setoresOp, inicio: ini14, fim: d }),
      resumoPendencias({ unidades, inicio: iniMes, fim: d, setores: setoresRotina.concat(["equipamentos", "estrutura"]) }).catch(() => null),
      diretorio().catch(() => []),
      minhasTarefas().catch(() => []),
      pode("comercial", 2)
        ? import("../services/comercial.js").then((m) => m.resumoComercial({ unidades, inicio: iniMes, fim: d })).catch(() => null)
        : null,
    ]);
    if (!ctx.ativo()) return;
    const t = hojeR.total;
    const pendentesHoje = t.atrasados + t.noHorario + t.naoEnviados;
    const ativosUnidade = pessoas.filter((p) => p.admin || p.todasUnidades || (p.unidades || []).some((u) => unidades.includes(u)));
    const serie = r14.serieDiaria;
    const minhasAbertas = tarefas.filter((x) => x.situacao !== "enviado");
    const unidadesCmp = r14.listaUnidades.filter((u) => u.programados);
    const criticas = (pend?.lista || []).filter((p) => p.aberta && (p.prioridade === "critica" || (p.prazo && p.prazo < d))).slice(0, 6);
    const setoresComDados = r14.listaSetores.filter((s) => s.programados);

    montar(
      alvo,
      html`<div class="painel painel-destaque" style="margin-bottom:16px">
        <div class="linha" style="gap:28px;align-items:center">
          ${anel(r14.taxas.execucao, { rotulo: "14 dias" })}
          <div class="expande" style="min-width:240px">
            <h2 style="margin-bottom:4px">Execução operacional</h2>
            <p class="texto-2 pequeno" style="max-width:62ch;margin-bottom:10px">${FORMULAS.execucao}</p>
            <div class="linha" style="gap:8px">
              <span class="chip">${icone("predio")} ${numero(unidades.length)} unidade(s)</span>
              <span class="chip">${icone("rotina")} ${numero(todosModulos().filter((m) => m.tipo === "rotina" || ["equipamentos", "estrutura", "marketing"].includes(m.id)).length)} setores</span>
              <span class="chip">${icone("usuarios")} ${numero(ativosUnidade.length)} colaboradores ativos</span>
            </div>
          </div>
        </div>
      </div>
      <div class="indicadores" style="margin-bottom:16px">
        ${indicador({ rotulo: "Checklists programados hoje", valor: numero(t.programados) })}
        ${indicador({ rotulo: "Checklists enviados hoje", valor: numero(t.enviados), tom: t.programados && t.enviados === t.programados ? "positivo" : "" })}
        ${indicador({ rotulo: "Checklists pendentes hoje", valor: numero(pendentesHoje), tom: t.naoEnviados ? "critico" : t.atrasados ? "alerta" : "", nota: `${t.atrasados} atrasado(s) · ${t.naoEnviados} não enviado(s)` })}
        ${indicador({ rotulo: "Taxa de conclusão (14 dias)", valor: pct(r14.taxas.conclusao), formula: FORMULAS.conclusao })}
        ${pend ? indicador({ rotulo: "Pendências abertas", valor: numero(pend.abertas), nota: `${pend.registradasPeriodo} registradas no mês` }) : ""}
        ${pend ? indicador({ rotulo: "Pendências críticas", valor: numero(pend.criticas), tom: pend.criticas ? "critico" : "" }) : ""}
        ${pend ? indicador({ rotulo: "Solucionadas no mês", valor: numero(pend.resolvidasPeriodo) }) : ""}
        ${pend ? indicador({ rotulo: "Cumprimento de prazos", valor: pct(pend.cumprimentoPrazo), formula: FORMULAS.prazoPendencias }) : ""}
        ${comercial ? indicador({ rotulo: "Matrículas no mês", valor: numero(comercial.matriculas), nota: comercial.temEvo ? `${numero(comercial.renovacoes)} renovações (EVO)` : "Importe os dados do EVO" }) : ""}
      </div>
      ${minhasAbertas.length
        ? html`<section style="margin-bottom:16px"><div class="linha-entre" style="margin-bottom:10px"><h2 style="font-size:var(--t-md);color:var(--texto-2)">Suas rotinas</h2><a class="pequeno" href="#/tarefas">Ver todas</a></div>
            <div class="pilha-sm">${minhasAbertas.slice(0, 3).map((x) => cartaoTarefa(x, "#/"))}</div></section>`
        : ""}
      <div class="grade-2" style="margin-bottom:16px">
        <section class="painel">
          <div class="painel-cabecalho"><div><h3>Evolução da produtividade</h3><p>Execução operacional por dia</p></div></div>
          ${graficoLinha({ rotulos: serie.map((s) => formatarData(s.data, { curta: true })), series: [{ nome: "Execução", valores: serie.map((s) => (s.itensAplicaveis ? s.execucao : null)) }], maximo: 1, formato: (v) => pct(v), titulo: "Execução operacional diária" })}
        </section>
        <section class="painel">
          <div class="painel-cabecalho"><div><h3>${unidadesCmp.length > 1 ? "Comparativo entre unidades" : "Execução por setor"}</h3><p>Últimos 14 dias</p></div></div>
          ${unidadesCmp.length > 1
            ? graficoBarras({ rotulos: unidadesCmp.map((u) => nomeUnidade(u.id)), series: [{ nome: "Execução", valores: unidadesCmp.map((u) => u.execucao || 0) }, { nome: "Cobertura", valores: unidadesCmp.map((u) => u.cobertura || 0) }], maximo: 1, formato: (v) => pct(v), titulo: "Comparativo entre unidades" })
            : setoresComDados.length
              ? ranking(setoresComDados.map((s) => ({ rotulo: s.nome, valor: Math.round((s.execucao || 0) * 100) })), { formato: (v) => `${v}%`, maximo: 100 })
              : html`<p class="pequeno texto-3">Ainda não há rotinas enviadas.</p>`}
        </section>
      </div>
      <div class="grade-2">
        <section class="painel">
          <div class="painel-cabecalho"><div><h3>Precisa de atenção</h3><p>Ocorrências críticas e atrasadas</p></div><a class="pequeno" href="#/ocorrencias">Todas</a></div>
          ${criticas.length
            ? html`<div class="lista">${criticas.map(
                (p) => html`<a class="lista-item clicavel" href="#/ocorrencias/${p.id}" style="color:inherit;text-decoration:none">
                  <div class="expande"><div class="lista-item-titulo">${p.titulo}</div><div class="lista-item-sub">${p.codigo} · ${nomeUnidade(p.unidadeId)} · ${p.prazo < d ? `atrasada desde ${formatarData(p.prazo)}` : `aberta ${relativo(p.criadoEm)}`}</div></div>
                  ${seloPrioridade(p.prioridade)}</a>`
              )}</div>`
            : html`<div class="vazio" style="padding:24px">${icone("okCirculo")}<p style="margin:0">Nada crítico ou atrasado no momento.</p></div>`}
        </section>
        <section class="painel">
          <div class="painel-cabecalho"><div><h3>Blocos atrasados hoje</h3><p>Ainda podem ser enviados</p></div></div>
          ${hojeR.ocorrencias.filter((o) => ["atrasado", "nao_enviado"].includes(o.situacao)).length
            ? html`<div class="lista">${hojeR.ocorrencias
                .filter((o) => ["atrasado", "nao_enviado"].includes(o.situacao))
                .slice(0, 8)
                .map(
                  (o) => html`<a class="lista-item clicavel" href="#/setor/${o.modelo.setorId}?aba=acompanhar" style="color:inherit;text-decoration:none">
                    <div class="expande"><div class="lista-item-titulo">${o.bloco.nome}</div><div class="lista-item-sub">${o.modelo.nome} · ${nomeUnidade(o.modelo.unidadeId)} · até ${o.bloco.fim}</div></div>
                    <span class="selo ${o.situacao === "atrasado" ? "selo-pendente" : "selo-critico"}">${o.situacao === "atrasado" ? "Atrasado" : "Não enviado"}</span></a>`
                )}</div>`
            : html`<div class="vazio" style="padding:24px">${icone("okCirculo")}<p style="margin:0">Nenhum bloco atrasado hoje.</p></div>`}
        </section>
      </div>`
    );
  } catch (e) {
    console.error(e);
    montar(alvo, estadoErro(e));
    on(alvo, "click", "[data-acao=recarregar]", ctx.recarregar);
  }
}

export { minhasUnidades };
