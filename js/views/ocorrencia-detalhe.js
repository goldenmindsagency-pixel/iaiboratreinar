// Detalhe de uma ocorrência: dados, linha do tempo, status, comentários e custos.
import { html, montar, $, on, opcoes, lerFormulario } from "../core/dom.js";
import { icone } from "../core/icones.js";
import { pode, nomeUnidade, nomeModulo } from "../core/sessao.js";
import { abrirModal, avisar, avisarErro, comCarregamento, estadoErro, seloPrioridade, seloStatusPendencia } from "../core/ui.js";
import { CATEGORIAS_PENDENCIA, PRIORIDADES, STATUS_PENDENCIA, ORIGENS_PENDENCIA, CATEGORIAS_CUSTO, SITUACOES_EQUIPAMENTO } from "../core/constantes.js";
import { formatarData, formatarDataHora, hoje } from "../core/tempo.js";
import { moeda, paraCentavos, centavosParaTexto } from "../core/formato.js";
import { mensagemDe } from "../core/erros.js";
import * as pend from "../services/pendencias.js";
import { obterEquipamento, mudarSituacao } from "../services/manutencao.js";
import { pessoasPara, nomePessoa } from "../services/usuarios.js";
import { obterExecucao } from "../services/rotinas.js";
import { linkVoltar } from "./comum.js";
import { galeria, ligarGalerias, campoFotos } from "./componentes/fotos.js";
import { abrirExecucao } from "./componentes/execucao-detalhe.js";

const ROTULO_ACAO = {
  em_analise: { texto: "Iniciar análise", icone: "busca" },
  em_andamento: { texto: "Iniciar solução", icone: "ferramenta" },
  aguardando: { texto: "Aguardando terceiros", icone: "relogio" },
  resolvida: { texto: "Marcar como resolvida", icone: "okCirculo" },
  cancelada: { texto: "Cancelar", icone: "xCirculo" },
};

export default async function telaOcorrencia(el, ctx) {
  let p;
  let eventos = [];
  let equipamento = null;
  try {
    p = await pend.obter(ctx.params.id);
    if (!p) throw new Error("Ocorrência não encontrada ou sem permissão de acesso.");
    [eventos, equipamento] = await Promise.all([
      pend.historico(p.id).catch(() => []),
      p.equipamentoId ? obterEquipamento(p.equipamentoId).catch(() => null) : null,
    ]);
  } catch (e) {
    montar(el, html`${linkVoltar("#/ocorrencias")}${estadoErro(e, { tentarNovamente: false })}`);
    return;
  }
  ctx.definirTitulo(p.codigo);
  const proximos = pend.proximosStatus(p);
  if (p.status === "resolvida") ROTULO_ACAO.em_andamento = { texto: "Reabrir", icone: "desfazer" };
  else ROTULO_ACAO.em_andamento = { texto: "Iniciar solução", icone: "ferramenta" };
  const gerenciar = pend.podeGerenciar(p);
  const podeCusto = gerenciar || pode(p.setorId, 3);
  const atrasada = pend.estaAtrasada(p);
  const categoria = CATEGORIAS_PENDENCIA.find((c) => c.id === p.categoria)?.nome || p.categoria;

  montar(
    el,
    html`${linkVoltar("#/ocorrencias", "Ocorrências")}
    <div class="cabecalho-pagina">
      <div>
        <div class="linha" style="gap:8px;margin-bottom:8px"><span class="chip numero">${p.codigo}</span>${seloPrioridade(p.prioridade)}${seloStatusPendencia(p.status)}${atrasada ? html`<span class="selo selo-pendente">Atrasada</span>` : ""}</div>
        <h1 class="quebra">${p.titulo}</h1>
        <p>${nomeUnidade(p.unidadeId)} · ${categoria} · ${ORIGENS_PENDENCIA[p.origem] || "Ocorrência"}</p>
      </div>
      <div class="cabecalho-acoes">
        ${proximos.map((s) => html`<button class="btn ${s === "resolvida" ? "btn-primario" : s === "cancelada" ? "btn-perigo" : "btn-secundario"}" data-status="${s}">${icone(ROTULO_ACAO[s].icone)} ${ROTULO_ACAO[s].texto}</button>`)}
      </div>
    </div>
    <div class="grade-2" style="grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);align-items:start">
      <div class="pilha">
        <section class="painel">
          <h3 style="margin-bottom:10px">Descrição</h3>
          <p class="quebra" style="white-space:pre-wrap">${p.descricao || "Sem detalhes adicionais."}</p>
          ${galeria(p.fotos)}
          ${p.solucao ? html`<div class="aviso aviso-ok" style="margin-top:14px">${icone("okCirculo")}<div><strong>Solução:</strong> ${p.solucao}</div></div>` : ""}
          ${p.justificativaCancelamento ? html`<div class="aviso" style="margin-top:14px">${icone("xCirculo")}<div><strong>Cancelada:</strong> ${p.justificativaCancelamento}</div></div>` : ""}
        </section>
        <section class="painel">
          <div class="painel-cabecalho"><h3>Linha do tempo</h3><button class="btn btn-secundario btn-sm" data-comentar>${icone("mensagem")} Comentar</button></div>
          <div class="linha-tempo">
            ${eventos.map(
              (e) => html`<div class="evento">
                <div class="evento-topo">${formatarDataHora(e.em)} · <strong style="color:var(--texto-2)">${e.autorNome}</strong></div>
                <div class="evento-corpo">
                  ${e.tipo === "status" ? html`Status: ${STATUS_PENDENCIA[e.statusAnterior]?.rotulo || e.statusAnterior} → <strong>${STATUS_PENDENCIA[e.statusNovo]?.rotulo || e.statusNovo}</strong>${e.texto ? html`<div class="texto-2 quebra">${e.texto}</div>` : ""}` : ""}
                  ${e.tipo === "criada" ? html`<strong>${e.texto}</strong>` : ""}
                  ${e.tipo === "edicao" ? html`<span class="texto-2">${e.texto}</span>` : ""}
                  ${e.tipo === "comentario" ? html`<div class="quebra" style="white-space:pre-wrap">${e.texto}</div>` : ""}
                  ${e.tipo === "custo" ? html`${e.texto} · <strong>${moeda(e.valor)}</strong>` : ""}
                  ${galeria(e.fotos)}
                </div>
              </div>`
            )}
          </div>
        </section>
      </div>
      <div class="pilha">
        <section class="painel">
          <div class="painel-cabecalho"><h3>Detalhes</h3>${gerenciar && p.aberta ? html`<button class="btn btn-fantasma btn-sm" data-editar>${icone("editar")} Editar</button>` : ""}</div>
          <dl class="chave-valor">
            <dt>Responsável</dt><dd>${p.responsavelNome || html`<span style="color:var(--pendente)">A definir</span>`}</dd>
            <dt>Prazo</dt><dd style="${atrasada ? "color:var(--pendente);font-weight:700" : ""}">${formatarData(p.prazo)}</dd>
            <dt>Setor</dt><dd>${nomeModulo(p.setorId)}</dd>
            <dt>Local</dt><dd>${p.local || "—"}</dd>
            ${p.equipamentoId ? html`<dt>Equipamento</dt><dd><a href="#/equipamentos/${p.equipamentoId}">${p.equipamentoNome || "Ver equipamento"}</a>${equipamento ? html`<div style="margin-top:4px"><span class="selo ${SITUACOES_EQUIPAMENTO[equipamento.situacao || "operando"]?.classe}">${SITUACOES_EQUIPAMENTO[equipamento.situacao || "operando"]?.rotulo}</span></div>` : ""}</dd>` : ""}
            ${p.ambienteId ? html`<dt>Ambiente</dt><dd><a href="#/estrutura/${p.ambienteId}">Ver ambiente</a></dd>` : ""}
            <dt>Registrada por</dt><dd>${p.autorNome}<div class="pequeno texto-3">${formatarDataHora(p.criadoEm)}</div></dd>
            ${p.dataConclusao ? html`<dt>Concluída em</dt><dd>${formatarData(p.dataConclusao)}${p.status === "resolvida" ? html`<div class="pequeno ${p.noPrazo === false ? "" : "texto-3"}" style="${p.noPrazo === false ? "color:var(--pendente)" : ""}">${p.noPrazo === false ? "fora do prazo" : "dentro do prazo"}</div>` : ""}</dd>` : ""}
            ${p.reaberturas ? html`<dt>Reaberturas</dt><dd>${p.reaberturas}</dd>` : ""}
            ${p.origemRef?.execucaoId ? html`<dt>Origem</dt><dd><button class="btn btn-fantasma btn-sm" data-origem style="padding:0;min-height:auto">${icone("rotina")} Ver checklist</button></dd>` : ""}
          </dl>
        </section>
        <section class="painel">
          <div class="painel-cabecalho"><div><h3>Custos</h3><p>Total lançado</p></div><strong class="numero" style="font-size:1.5rem">${moeda(p.custoTotal || 0)}</strong></div>
          ${podeCusto ? html`<button class="btn btn-secundario btn-sm btn-bloco" data-custo>${icone("dinheiro")} Lançar custo</button>` : html`<p class="pequeno texto-3">Custos são lançados pela gestão ou pelo setor responsável.</p>`}
        </section>
        ${equipamento && pode("equipamentos", 3)
          ? html`<section class="painel">
              <h3 style="margin-bottom:10px">Situação do equipamento</h3>
              <div class="campo"><select id="sit-equip">${opcoes(Object.entries(SITUACOES_EQUIPAMENTO).map(([v, s]) => ({ valor: v, rotulo: s.rotulo })), equipamento.situacao || "operando")}</select></div>
              <p class="pequeno texto-3" style="margin-top:8px">Interditar no sistema não substitui retirar o aparelho de uso e sinalizar no local.</p>
            </section>`
          : ""}
      </div>
    </div>`
  );
  ligarGalerias(el);

  // ---------- Mudança de status ----------
  on(el, "click", "[data-status]", (ev, b) => {
    const novo = b.dataset.status;
    let fotos;
    const modal = abrirModal({
      titulo: ROTULO_ACAO[novo].texto,
      corpo: html`<form class="pilha" novalidate id="form-status">
        ${novo === "resolvida"
          ? html`<div class="campo"><label class="obrigatorio" for="solucao">O que foi feito para resolver?</label><textarea id="solucao" name="solucao" maxlength="2000" required></textarea></div>
              <div class="campo"><span class="rotulo">Fotos da solução (opcional)</span><div id="fotos-status"></div></div>`
          : novo === "cancelada"
            ? html`<div class="campo"><label class="obrigatorio" for="justificativa">Por que está sendo cancelada?</label><textarea id="justificativa" name="justificativa" maxlength="1000" required></textarea><span class="ajuda">O registro não é apagado: fica no histórico com esta justificativa.</span></div>`
            : html`<div class="campo"><label for="comentario">Comentário (opcional)</label><textarea id="comentario" name="comentario" maxlength="1000" placeholder="${novo === "aguardando" ? "Ex.: aguardando peça do fornecedor, previsão dia 10" : "Ex.: técnico acionado"}"></textarea></div>`}
        ${novo === "resolvida" && equipamento && equipamento.situacao !== "operando" && pode("equipamentos", 3) ? html`<label class="marcar"><input type="checkbox" name="liberar" checked /> Voltar o equipamento para "Operando"</label>` : ""}
        <div class="aviso aviso-erro oculto" id="erro-status"></div>
      </form>`,
      rodape: html`<button class="btn btn-secundario" data-fechar>Voltar</button><button class="btn ${novo === "cancelada" ? "btn-perigo" : "btn-primario"}" data-ok>Confirmar</button>`,
      aoMontar: (mel, fechar) => {
        if (novo === "resolvida") fotos = campoFotos($("#fotos-status", mel), { pasta: `${p.unidadeId}/ocorrencias` });
        on(mel, "click", "[data-ok]", (e2, botao) =>
          comCarregamento(botao, async () => {
            const d = lerFormulario($("#form-status", mel));
            try {
              if (fotos?.enviando()) throw new Error("Aguarde o envio das fotos.");
              await pend.mudarStatus(p, novo, { comentario: d.comentario || "", solucao: d.solucao || "", justificativa: d.justificativa || "" });
              if (fotos?.obter().length) await pend.anexarFotos({ ...p, status: novo }, fotos.obter()).catch(() => {});
              if (d.liberar && equipamento) await mudarSituacao(equipamento, "operando", `${p.codigo} resolvida`).catch(avisarErro);
              avisar(`${p.codigo}: ${STATUS_PENDENCIA[novo].rotulo.toLowerCase()}.`);
              fechar(true);
              ctx.recarregar();
            } catch (e) {
              const caixa = $("#erro-status", mel);
              caixa.textContent = mensagemDe(e);
              caixa.classList.remove("oculto");
            }
          })
        );
      },
    });
    return modal;
  });

  // ---------- Comentário ----------
  on(el, "click", "[data-comentar]", () => {
    let fotos;
    abrirModal({
      titulo: "Comentar",
      corpo: html`<div class="pilha"><div class="campo"><label for="txt-coment">Comentário</label><textarea id="txt-coment" maxlength="2000"></textarea></div><div class="campo"><span class="rotulo">Fotos</span><div id="fotos-coment"></div></div><div class="aviso aviso-erro oculto" id="erro-coment"></div></div>`,
      rodape: html`<button class="btn btn-secundario" data-fechar>Cancelar</button><button class="btn btn-primario" data-ok>${icone("aviao")} Publicar</button>`,
      aoMontar: (mel, fechar) => {
        fotos = campoFotos($("#fotos-coment", mel), { pasta: `${p.unidadeId}/ocorrencias` });
        on(mel, "click", "[data-ok]", (e2, botao) =>
          comCarregamento(botao, async () => {
            try {
              if (fotos.enviando()) throw new Error("Aguarde o envio das fotos.");
              await pend.comentar(p, $("#txt-coment", mel).value, fotos.obter());
              fechar(true);
              ctx.recarregar();
            } catch (e) {
              const caixa = $("#erro-coment", mel);
              caixa.textContent = mensagemDe(e);
              caixa.classList.remove("oculto");
            }
          })
        );
      },
    });
  });

  // ---------- Edição ----------
  on(el, "click", "[data-editar]", async () => {
    const pessoas = await pessoasPara({ unidadeId: p.unidadeId }).catch(() => []);
    abrirModal({
      titulo: `Editar ${p.codigo}`,
      corpo: html`<form class="grade-form" id="form-edicao" novalidate>
        <div class="campo largo"><label for="e-titulo">Título</label><input id="e-titulo" name="titulo" value="${p.titulo}" maxlength="120" /></div>
        <div class="campo largo"><label for="e-desc">Descrição</label><textarea id="e-desc" name="descricao" maxlength="2000">${p.descricao}</textarea></div>
        <div class="campo largo"><label for="e-local">Local</label><input id="e-local" name="local" value="${p.local}" maxlength="100" /></div>
        <div class="campo"><label for="e-resp">Responsável</label><select id="e-resp" name="responsavelLogin"><option value="">A definir</option>${opcoes(pessoas.map((x) => ({ valor: x.login, rotulo: `${x.nome}${x.cargo ? ` — ${x.cargo}` : ""}` })), p.responsavelLogin)}</select></div>
        <div class="campo"><label for="e-prazo">Prazo</label><input id="e-prazo" type="date" name="prazo" value="${p.prazo}" /></div>
        <div class="campo"><label for="e-pri">Prioridade</label><select id="e-pri" name="prioridade">${opcoes(Object.entries(PRIORIDADES).map(([v, x]) => ({ valor: v, rotulo: x.rotulo })), p.prioridade)}</select></div>
        <div class="aviso aviso-erro oculto largo" id="erro-ed"></div>
      </form>`,
      rodape: html`<button class="btn btn-secundario" data-fechar>Cancelar</button><button class="btn btn-primario" data-ok>Salvar</button>`,
      aoMontar: (mel, fechar) =>
        on(mel, "click", "[data-ok]", (e2, botao) =>
          comCarregamento(botao, async () => {
            const d = lerFormulario($("#form-edicao", mel));
            try {
              await pend.editar(p, { ...d, responsavelNome: d.responsavelLogin ? nomePessoa(d.responsavelLogin) : "" });
              avisar("Alterações salvas.");
              fechar(true);
              ctx.recarregar();
            } catch (e) {
              const caixa = $("#erro-ed", mel);
              caixa.textContent = mensagemDe(e);
              caixa.classList.remove("oculto");
            }
          })
        ),
    });
  });

  // ---------- Custo ----------
  on(el, "click", "[data-custo]", () => {
    let nf;
    abrirModal({
      titulo: "Lançar custo",
      corpo: html`<form class="grade-form" id="form-custo" novalidate>
        <div class="campo largo"><label class="obrigatorio" for="c-desc">Descrição</label><input id="c-desc" name="descricao" maxlength="150" placeholder="Ex.: Troca do cabo de aço" /></div>
        <div class="campo"><label for="c-cat">Categoria</label><select id="c-cat" name="categoria">${opcoes(CATEGORIAS_CUSTO)}</select></div>
        <div class="campo"><label class="obrigatorio" for="c-valor">Valor (R$)</label><input id="c-valor" name="valor" inputmode="decimal" placeholder="0,00" /></div>
        <div class="campo"><label for="c-forn">Fornecedor</label><input id="c-forn" name="fornecedor" maxlength="100" /></div>
        <div class="campo"><label for="c-data">Data</label><input id="c-data" type="date" name="data" value="${hoje()}" /></div>
        <div class="campo largo"><span class="rotulo">Nota fiscal ou comprovante (foto)</span><div id="c-nf"></div></div>
        <div class="aviso aviso-erro oculto largo" id="erro-custo"></div>
      </form>`,
      rodape: html`<button class="btn btn-secundario" data-fechar>Cancelar</button><button class="btn btn-primario" data-ok>${icone("dinheiro")} Lançar</button>`,
      aoMontar: (mel, fechar) => {
        nf = campoFotos($("#c-nf", mel), { pasta: `${p.unidadeId}/custos`, maximo: 1, rotulo: "Foto da nota" });
        on(mel, "click", "[data-ok]", (e2, botao) =>
          comCarregamento(botao, async () => {
            const d = lerFormulario($("#form-custo", mel));
            try {
              if (nf.enviando()) throw new Error("Aguarde o envio da foto.");
              await pend.adicionarCusto(p, { ...d, valor: paraCentavos(d.valor), notaFiscal: nf.obter()[0] || null });
              avisar(`Custo de ${moeda(paraCentavos(d.valor))} lançado.`);
              fechar(true);
              ctx.recarregar();
            } catch (e) {
              const caixa = $("#erro-custo", mel);
              caixa.textContent = mensagemDe(e);
              caixa.classList.remove("oculto");
            }
          })
        );
      },
    });
  });

  on(el, "click", "[data-origem]", async () => {
    try {
      const ex = await obterExecucao(p.origemRef.execucaoId);
      if (ex) abrirExecucao(ex);
      else avisar("O checklist de origem ainda não foi enviado.", "info");
    } catch (e) {
      avisarErro(e);
    }
  });

  $("#sit-equip", el)?.addEventListener("change", async (ev) => {
    try {
      await mudarSituacao(equipamento, ev.target.value, `Alterado a partir de ${p.codigo}`);
      avisar("Situação do equipamento atualizada.");
      ctx.recarregar();
    } catch (e) {
      avisarErro(e);
    }
  });
}

export { centavosParaTexto };
