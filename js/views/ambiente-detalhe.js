// Detalhe de um ambiente: dados, inspeções, problemas e custos.
import { html, montar, on } from "../core/dom.js";
import { icone } from "../core/icones.js";
import { pode, nomeUnidade } from "../core/sessao.js";
import { estadoErro, seloStatusPendencia, seloPrioridade } from "../core/ui.js";
import { formatarData, somarDias, hoje } from "../core/tempo.js";
import { moeda } from "../core/formato.js";
import { TIPOS_MANUTENCAO } from "../core/constantes.js";
import { obterAmbiente, listarManutencoes, listarCustos, inspecaoVencida } from "../services/manutencao.js";
import { listarPorAlvo } from "../services/pendencias.js";
import { linkVoltar } from "./comum.js";
import { abrirCadastroAmbiente, abrirRegistroManutencao } from "./componentes/manutencao-forms.js";
import { abrirNovaOcorrencia } from "./componentes/form-ocorrencia.js";
import { galeria, ligarGalerias } from "./componentes/fotos.js";

export default async function telaAmbiente(el, ctx) {
  let amb;
  try {
    amb = await obterAmbiente(ctx.params.id);
    if (!amb) throw new Error("Ambiente não encontrado.");
  } catch (e) {
    montar(el, html`${linkVoltar("#/estrutura")}${estadoErro(e, { tentarNovamente: false })}`);
    return;
  }
  ctx.definirTitulo(amb.nome);
  const [pendencias, inspecoes, custos] = await Promise.all([
    listarPorAlvo({ unidadeId: amb.unidadeId, ambienteId: amb.id }).catch(() => []),
    listarManutencoes({ unidades: [amb.unidadeId], setorId: "estrutura", alvoId: amb.id }).catch(() => []),
    pode("estrutura", 2) ? listarCustos({ unidades: [amb.unidadeId], inicio: somarDias(hoje(), -730), fim: hoje(), setores: ["estrutura"] }).then((l) => l.filter((c) => c.ambienteId === amb.id)).catch(() => []) : [],
  ]);
  pendencias.sort((a, b) => (b.dataAbertura || "").localeCompare(a.dataAbertura || ""));
  const editar = pode("estrutura", 3);

  montar(
    el,
    html`${linkVoltar("#/estrutura", "Estrutura física")}
    <div class="cabecalho-pagina">
      <div><h1>${amb.nome}</h1><p>${nomeUnidade(amb.unidadeId)}${amb.descricao ? ` · ${amb.descricao}` : ""}</p></div>
      <div class="cabecalho-acoes">
        ${pode("pendencias", 1) ? html`<button class="btn btn-secundario" data-problema>${icone("alerta")} Informar problema</button>` : ""}
        ${editar ? html`<button class="btn btn-secundario" data-editar>${icone("editar")} Editar</button><button class="btn btn-primario" data-inspecao>${icone("lista")} Registrar inspeção</button>` : ""}
      </div>
    </div>
    <div class="grade-2" style="grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);align-items:start">
      <div class="pilha">
        <section class="painel"><h3 style="margin-bottom:12px">Inspeção periódica</h3>
          <dl class="chave-valor">
            <dt>Última</dt><dd>${amb.ultimaInspecao ? formatarData(amb.ultimaInspecao) : "—"}</dd>
            <dt>Próxima</dt><dd style="${inspecaoVencida(amb) ? "color:var(--pendente);font-weight:700" : ""}">${amb.proximaInspecao ? formatarData(amb.proximaInspecao) : "—"}</dd>
            <dt>Frequência</dt><dd>${amb.periodicidadeDias ? `a cada ${amb.periodicidadeDias} dias` : "não programada"}</dd>
            <dt>Itens verificados</dt><dd>${(amb.elementos || []).join(", ") || "Todos os elementos"}</dd>
          </dl>
        </section>
        ${pode("estrutura", 2) ? html`<section class="painel"><div class="painel-cabecalho"><h3>Custos (24 meses)</h3><strong class="numero" style="font-size:1.4rem">${moeda(custos.reduce((s, c) => s + (c.valor || 0), 0))}</strong></div>
          ${custos.length ? html`<div class="lista">${custos.map((c) => html`<div class="lista-item"><div class="expande"><div class="lista-item-titulo">${c.descricao}</div><div class="lista-item-sub">${formatarData(c.data)} · ${c.categoria}</div></div><strong>${moeda(c.valor)}</strong></div>`)}</div>` : html`<p class="pequeno texto-3">Nenhum custo lançado.</p>`}
        </section>` : ""}
      </div>
      <div class="pilha">
        <section class="painel"><div class="painel-cabecalho"><h3>Problemas</h3></div>
          ${pendencias.length ? html`<div class="lista">${pendencias.map((p) => html`<a class="lista-item clicavel" href="#/ocorrencias/${p.id}" style="color:inherit;text-decoration:none"><div class="expande"><div class="lista-item-titulo">${p.codigo} · ${p.titulo}</div><div class="lista-item-sub">${formatarData(p.dataAbertura)}</div></div>${seloPrioridade(p.prioridade)} ${seloStatusPendencia(p.status)}</a>`)}</div>` : html`<p class="pequeno texto-3">Nenhum problema registrado.</p>`}
        </section>
        <section class="painel"><div class="painel-cabecalho"><h3>Inspeções e reparos</h3></div>
          ${inspecoes.length ? html`<div class="linha-tempo">${inspecoes.map((m) => html`<div class="evento"><div class="evento-topo">${formatarData(m.data)} · ${TIPOS_MANUTENCAO[m.tipo]} · ${m.autorNome}</div><div class="evento-corpo">${m.resultado === "problema" ? html`<span class="selo selo-pendente" style="margin-right:6px">Problema encontrado</span>` : ""}${m.descricao}${m.elementos?.length ? html`<div class="pequeno texto-3">Verificado: ${m.elementos.join(", ")}</div>` : ""}${galeria(m.fotos)}</div></div>`)}</div>` : html`<p class="pequeno texto-3">Nenhuma inspeção registrada.</p>`}
        </section>
      </div>
    </div>`
  );
  ligarGalerias(el);
  on(el, "click", "[data-editar]", async () => (await abrirCadastroAmbiente(amb)) && ctx.recarregar());
  on(el, "click", "[data-inspecao]", async () => (await abrirRegistroManutencao(amb, "estrutura")) && ctx.recarregar());
  on(el, "click", "[data-problema]", async () => (await abrirNovaOcorrencia({ categoria: "estrutura", unidadeId: amb.unidadeId, ambienteId: amb.id, local: amb.nome })) && ctx.recarregar());
}
