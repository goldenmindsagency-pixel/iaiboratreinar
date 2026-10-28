// Detalhe de um equipamento: dados, situação, ocorrências, manutenções e custos.
import { html, montar, on, opcoes } from "../core/dom.js";
import { icone } from "../core/icones.js";
import { pode, nomeUnidade } from "../core/sessao.js";
import { estadoErro, seloSituacao, seloStatusPendencia, seloPrioridade, avisar, avisarErro, pedirTexto } from "../core/ui.js";
import { formatarData, somarDias, hoje } from "../core/tempo.js";
import { moeda } from "../core/formato.js";
import { SITUACOES_EQUIPAMENTO, TIPOS_MANUTENCAO } from "../core/constantes.js";
import { obterEquipamento, listarManutencoes, listarCustos, mudarSituacao, inspecaoVencida } from "../services/manutencao.js";
import { listarPorAlvo } from "../services/pendencias.js";
import { linkVoltar } from "./comum.js";
import { abrirCadastroEquipamento, abrirRegistroManutencao } from "./componentes/manutencao-forms.js";
import { abrirNovaOcorrencia } from "./componentes/form-ocorrencia.js";
import { galeria, ligarGalerias } from "./componentes/fotos.js";

export default async function telaEquipamento(el, ctx) {
  let eq;
  try {
    eq = await obterEquipamento(ctx.params.id);
    if (!eq) throw new Error("Equipamento não encontrado.");
  } catch (e) {
    montar(el, html`${linkVoltar("#/equipamentos")}${estadoErro(e, { tentarNovamente: false })}`);
    return;
  }
  ctx.definirTitulo(eq.codigo);
  const [pendencias, manutencoes, custos] = await Promise.all([
    listarPorAlvo({ unidadeId: eq.unidadeId, equipamentoId: eq.id }).catch(() => []),
    pode("equipamentos", 1) ? listarManutencoes({ unidades: [eq.unidadeId], setorId: "equipamentos", alvoId: eq.id }).catch(() => []) : [],
    pode("equipamentos", 2) ? listarCustos({ unidades: [eq.unidadeId], inicio: somarDias(hoje(), -730), fim: hoje(), setores: ["equipamentos"] }).then((l) => l.filter((c) => c.equipamentoId === eq.id)).catch(() => []) : [],
  ]);
  pendencias.sort((a, b) => (b.dataAbertura || "").localeCompare(a.dataAbertura || ""));
  const recentes = pendencias.filter((p) => p.dataAbertura >= somarDias(hoje(), -90));
  const editar = pode("equipamentos", 3);
  const totalCustos = custos.reduce((s, c) => s + (c.valor || 0), 0);

  montar(
    el,
    html`${linkVoltar("#/equipamentos", "Equipamentos")}
    <div class="cabecalho-pagina">
      <div>
        <div class="linha" style="gap:8px;margin-bottom:8px"><span class="chip numero">${eq.codigo}</span>${eq.ativo === false ? html`<span class="selo selo-tracejado">Baixado</span>` : seloSituacao(eq.situacao)}${recentes.length >= 3 ? html`<span class="selo selo-pendente">Problema recorrente</span>` : ""}</div>
        <h1>${eq.nome}</h1>
        <p>${nomeUnidade(eq.unidadeId)} · ${eq.categoria}${eq.localizacao ? ` · ${eq.localizacao}` : ""}</p>
      </div>
      <div class="cabecalho-acoes">
        ${pode("pendencias", 1) ? html`<button class="btn btn-secundario" data-problema>${icone("alerta")} Informar problema</button>` : ""}
        ${editar ? html`<button class="btn btn-secundario" data-editar>${icone("editar")} Editar</button><button class="btn btn-primario" data-manutencao>${icone("ferramenta")} Registrar inspeção/manutenção</button>` : ""}
      </div>
    </div>
    ${eq.situacao === "interditado" ? html`<div class="aviso aviso-erro" style="margin-bottom:16px">${icone("bloquear")}<div><strong>Interditado.</strong> ${eq.situacaoMotivo || ""} Confirme que o aparelho está sinalizado e fora de uso no local.</div></div>` : ""}
    <div class="grade-2" style="grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);align-items:start">
      <div class="pilha">
        <section class="painel">
          <h3 style="margin-bottom:12px">Dados</h3>
          <dl class="chave-valor">
            <dt>Conservação</dt><dd>${eq.conservacao || "—"}</dd>
            <dt>Marca / modelo</dt><dd>${[eq.marca, eq.modelo].filter(Boolean).join(" · ") || "—"}</dd>
            <dt>Nº de série</dt><dd>${eq.numeroSerie || "—"}</dd>
            <dt>Aquisição</dt><dd>${eq.dataAquisicao ? formatarData(eq.dataAquisicao) : "—"}</dd>
            <dt>Última inspeção</dt><dd>${eq.ultimaInspecao ? formatarData(eq.ultimaInspecao) : "—"}</dd>
            <dt>Próxima inspeção</dt><dd style="${inspecaoVencida(eq) ? "color:var(--pendente);font-weight:700" : ""}">${eq.proximaInspecao ? formatarData(eq.proximaInspecao) : "—"}${eq.periodicidadeDias ? html`<div class="pequeno texto-3">a cada ${eq.periodicidadeDias} dias</div>` : ""}</dd>
            ${eq.observacoes ? html`<dt>Observações</dt><dd>${eq.observacoes}</dd>` : ""}
          </dl>
        </section>
        ${editar && eq.ativo !== false
          ? html`<section class="painel"><h3 style="margin-bottom:10px">Situação</h3>
              <div class="campo"><select id="sit">${opcoes(Object.entries(SITUACOES_EQUIPAMENTO).map(([v, s]) => ({ valor: v, rotulo: s.rotulo })), eq.situacao || "operando")}</select></div>
              <p class="pequeno texto-3" style="margin-top:8px">Em caso de risco, retire o aparelho de uso e sinalize no local antes de qualquer registro.</p></section>`
          : ""}
        ${pode("equipamentos", 2) ? html`<section class="painel"><div class="painel-cabecalho"><h3>Custos (24 meses)</h3><strong class="numero" style="font-size:1.4rem">${moeda(totalCustos)}</strong></div>
            ${custos.length ? html`<div class="lista">${custos.map((c) => html`<div class="lista-item"><div class="expande"><div class="lista-item-titulo">${c.descricao}</div><div class="lista-item-sub">${formatarData(c.data)} · ${c.categoria}${c.fornecedor ? ` · ${c.fornecedor}` : ""}</div></div><strong>${moeda(c.valor)}</strong></div>`)}</div>` : html`<p class="pequeno texto-3">Nenhum custo lançado.</p>`}
          </section>` : ""}
      </div>
      <div class="pilha">
        <section class="painel">
          <div class="painel-cabecalho"><div><h3>Ocorrências</h3><p>${pendencias.filter((p) => p.aberta).length} aberta(s) · ${recentes.length} nos últimos 90 dias</p></div></div>
          ${pendencias.length
            ? html`<div class="lista">${pendencias.map(
                (p) => html`<a class="lista-item clicavel" href="#/ocorrencias/${p.id}" style="color:inherit;text-decoration:none">
                  <div class="expande"><div class="lista-item-titulo">${p.codigo} · ${p.titulo}</div><div class="lista-item-sub">${formatarData(p.dataAbertura)}${p.solucao ? ` · ${p.solucao}` : ""}</div></div>
                  ${seloPrioridade(p.prioridade)} ${seloStatusPendencia(p.status)}</a>`
              )}</div>`
            : html`<p class="pequeno texto-3">Nenhuma ocorrência registrada para este equipamento.</p>`}
        </section>
        <section class="painel">
          <div class="painel-cabecalho"><h3>Histórico de manutenção</h3></div>
          ${manutencoes.length
            ? html`<div class="linha-tempo">${manutencoes.map(
                (m) => html`<div class="evento"><div class="evento-topo">${formatarData(m.data)} · ${TIPOS_MANUTENCAO[m.tipo]} · ${m.autorNome}</div>
                  <div class="evento-corpo">${m.resultado === "problema" ? html`<span class="selo selo-pendente" style="margin-right:6px">Problema encontrado</span>` : ""}${m.descricao}${galeria(m.fotos)}</div></div>`
              )}</div>`
            : html`<p class="pequeno texto-3">Nenhuma inspeção ou manutenção registrada.</p>`}
        </section>
      </div>
    </div>`
  );
  ligarGalerias(el);

  on(el, "click", "[data-editar]", async () => {
    if (await abrirCadastroEquipamento(eq)) ctx.recarregar();
  });
  on(el, "click", "[data-manutencao]", async () => {
    if (await abrirRegistroManutencao(eq, "equipamentos")) ctx.recarregar();
  });
  on(el, "click", "[data-problema]", async () => {
    const c = await abrirNovaOcorrencia({ categoria: "equipamentos", unidadeId: eq.unidadeId, equipamentoId: eq.id });
    if (c) ctx.recarregar();
  });
  el.querySelector("#sit")?.addEventListener("change", async (ev) => {
    const nova = ev.target.value;
    const motivo = nova === "operando" ? "" : await pedirTexto({ titulo: "Motivo da mudança", rotulo: "Por que a situação mudou?", obrigatorio: nova === "interditado", confirmarTexto: "Salvar" });
    if (motivo === null) {
      ev.target.value = eq.situacao || "operando";
      return;
    }
    try {
      await mudarSituacao(eq, nova, motivo || "");
      avisar("Situação atualizada.");
      ctx.recarregar();
    } catch (e) {
      avisarErro(e);
    }
  });
}
