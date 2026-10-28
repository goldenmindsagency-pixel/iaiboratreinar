// Estrutura física: ambientes, inspeções periódicas, problemas e reparos.
import { html, montar, on } from "../core/dom.js";
import { icone } from "../core/icones.js";
import { pode, nomeUnidade, unidadesFiltro } from "../core/sessao.js";
import { estadoVazio, indicador, seloPrioridade, seloStatusPendencia } from "../core/ui.js";
import { formatarData, hoje, inicioMes, mesDe } from "../core/tempo.js";
import { numero, moeda, decimal } from "../core/formato.js";
import { listarAmbientes, listarManutencoes, listarCustos, inspecaoVencida } from "../services/manutencao.js";
import { resumoPendencias, FORMULAS } from "../services/indicadores.js";
import { cabecalho } from "./comum.js";
import { abrirCadastroAmbiente } from "./componentes/manutencao-forms.js";
import { abrirNovaOcorrencia } from "./componentes/form-ocorrencia.js";

export default async function telaEstrutura(el, ctx) {
  const unidades = unidadesFiltro().map((u) => u.id);
  const ini = inicioMes(mesDe(hoje()));
  const [ambientes, inspecoes, pend, custos] = await Promise.all([
    listarAmbientes(unidades),
    pode("estrutura", 2) ? listarManutencoes({ unidades, setorId: "estrutura", inicio: ini, fim: hoje() }).catch(() => []) : [],
    resumoPendencias({ unidades, inicio: ini, fim: hoje(), setores: ["estrutura"] }).catch(() => null),
    pode("estrutura", 2) ? listarCustos({ unidades, inicio: ini, fim: hoje(), setores: ["estrutura"] }).catch(() => []) : [],
  ]);
  const ativos = ambientes.filter((a) => a.ativo !== false);
  const pendEstrutura = (pend?.lista || []).filter((p) => p.setorId === "estrutura");
  const abertas = pendEstrutura.filter((p) => p.aberta);
  const resolvidas = pendEstrutura.filter((p) => p.status === "resolvida" && p.dataConclusao >= ini);
  const tempos = resolvidas.filter((p) => p.dataAbertura && p.dataConclusao).map((p) => (Date.parse(p.dataConclusao) - Date.parse(p.dataAbertura)) / 86400000);
  const abertasPorAmb = {};
  abertas.forEach((p) => p.ambienteId && (abertasPorAmb[p.ambienteId] = (abertasPorAmb[p.ambienteId] || 0) + 1));

  montar(
    el,
    html`${cabecalho(
      "Estrutura física",
      "Ambientes, inspeções periódicas e acompanhamento de reparos da estrutura.",
      html`${pode("pendencias", 1) ? html`<button class="btn btn-secundario" data-problema>${icone("alerta")} Informar problema</button>` : ""}
        ${pode("estrutura", 3) ? html`<button class="btn btn-primario" data-novo>${icone("mais")} Novo ambiente</button>` : ""}`
    )}
    <div class="indicadores" style="margin-bottom:20px">
      ${indicador({ rotulo: "Ambientes", valor: numero(ativos.length) })}
      ${indicador({ rotulo: "Inspeções vencidas", valor: numero(ativos.filter(inspecaoVencida).length), tom: ativos.filter(inspecaoVencida).length ? "alerta" : "" })}
      ${indicador({ rotulo: "Problemas abertos", valor: numero(abertas.length), tom: abertas.length ? "alerta" : "" })}
      ${pode("estrutura", 2) ? indicador({ rotulo: "Inspeções no mês", valor: numero(inspecoes.length) }) : ""}
      ${indicador({ rotulo: "Resolvidos no mês", valor: numero(resolvidas.length) })}
      ${indicador({ rotulo: "Tempo médio de reparo", valor: tempos.length ? decimal(tempos.reduce((a, b) => a + b, 0) / tempos.length) : "—", sufixo: tempos.length ? " dias" : "", formula: FORMULAS.tempoResolucao })}
      ${pode("estrutura", 2) ? indicador({ rotulo: "Custos no mês", valor: moeda(custos.reduce((s, c) => s + (c.valor || 0), 0)) }) : ""}
    </div>
    <div class="grade-2" style="grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);align-items:start">
      <section>
        <h2 style="font-size:var(--t-md);margin-bottom:12px;color:var(--texto-2)">Ambientes</h2>
        ${ambientes.length
          ? html`<div class="pilha-sm">${ambientes.map((a) => {
              const vencida = inspecaoVencida(a);
              return html`<a class="tarefa" href="#/estrutura/${a.id}" style="grid-template-columns:44px minmax(0,1fr) auto;${a.ativo === false ? "opacity:.5" : ""}">
                <span class="icone-circulo">${icone("predio")}</span>
                <div style="min-width:0"><div class="tarefa-titulo">${a.nome}</div><div class="tarefa-sub">${nomeUnidade(a.unidadeId)} · próxima inspeção ${a.proximaInspecao ? formatarData(a.proximaInspecao) : "não programada"}</div></div>
                <div class="linha" style="gap:6px">${abertasPorAmb[a.id] ? html`<span class="selo selo-pendente">${abertasPorAmb[a.id]} aberta(s)</span>` : ""}${vencida ? html`<span class="selo selo-pendente">Inspeção vencida</span>` : ""}</div>
              </a>`;
            })}</div>`
          : estadoVazio({ icone: "predio", titulo: "Nenhum ambiente cadastrado", texto: "Cadastre recepção, salão, banheiros e demais áreas para programar inspeções." })}
      </section>
      <section>
        <h2 style="font-size:var(--t-md);margin-bottom:12px;color:var(--texto-2)">Problemas em aberto</h2>
        <div class="painel painel-compacto">
          ${abertas.length
            ? html`<div class="lista">${abertas.map(
                (p) => html`<a class="lista-item clicavel" href="#/ocorrencias/${p.id}" style="color:inherit;text-decoration:none">
                  <div class="expande"><div class="lista-item-titulo">${p.titulo}</div><div class="lista-item-sub">${p.codigo} · ${nomeUnidade(p.unidadeId)} · prazo ${formatarData(p.prazo)}</div></div>
                  ${seloPrioridade(p.prioridade)}</a>`
              )}</div>`
            : html`<p class="pequeno texto-3" style="padding:8px">Nenhum problema de estrutura em aberto.</p>`}
        </div>
        ${pode("gestao", 2) ? html`<p class="pequeno texto-3" style="margin-top:12px">Necessidades de reforma e compras ficam em <a href="#/gestao?aba=investimentos">Gestão gerencial › Investimentos</a>.</p>` : ""}
      </section>
    </div>`
  );
  on(el, "click", "[data-novo]", async () => {
    const id = await abrirCadastroAmbiente(null, { unidadeId: unidades.length === 1 ? unidades[0] : undefined });
    if (id) location.hash = `#/estrutura/${id}`;
  });
  on(el, "click", "[data-problema]", async () => {
    if (await abrirNovaOcorrencia({ categoria: "estrutura" })) ctx.recarregar();
  });
}

export { seloStatusPendencia };
