// Janela com o checklist enviado: respostas, fotos, registros e revisão.
import { html, $, on, montar } from "../../core/dom.js";
import { icone } from "../../core/icones.js";
import { pode, nomeUnidade, nomeModulo, meuLogin } from "../../core/sessao.js";
import { abrirModal, avisar, avisarErro, comCarregamento, pedirTexto } from "../../core/ui.js";
import { STATUS_RESPOSTA } from "../../core/constantes.js";
import { formatarDataHora, rotuloPeriodo } from "../../core/tempo.js";
import { pct } from "../../core/formato.js";
import { revisarExecucao, listarRegistrosDaExecucao } from "../../services/rotinas.js";
import { galeria, ligarGalerias } from "./fotos.js";

export function seloResposta(status) {
  const s = STATUS_RESPOSTA[status] || STATUS_RESPOSTA.nao_verificada;
  const classe = s.classe === "ok" ? "selo-ok" : s.classe === "pendente" ? "selo-pendente" : status === "nao_verificada" ? "selo-tracejado" : "";
  return html`<span class="selo ${classe}">${s.rotulo}</span>`;
}

export function seloExecucao(ex) {
  if (ex.status === "revisado") return html`<span class="selo selo-ok">Revisado</span>`;
  if (ex.status === "correcao") return html`<span class="selo selo-pendente">Correção solicitada</span>`;
  return html`<span class="selo selo-info">Enviado${ex.atrasado ? " com atraso" : ""}</span>`;
}

function blocoRespostas(respostas) {
  return html`<div class="lista">
    ${respostas.map(
      (r) => html`<div class="lista-item" style="align-items:flex-start;flex-direction:column;gap:6px">
        <div class="linha-entre" style="width:100%"><span class="forte quebra expande">${r.texto}</span>${seloResposta(r.status)}</div>
        ${r.justificativa ? html`<div class="pequeno texto-2">${r.status === "concluida" ? "Observação" : "Motivo"}: ${r.justificativa}</div>` : ""}
        ${r.contexto ? html`<div class="contexto-auto" style="width:100%">${icone("grafico")} ${r.contexto}</div>` : ""}
        ${r.providencias?.length ? html`<div class="pequeno">Providências: ${r.providencias.map((p, i) => html`${i ? ", " : ""}<a href="#/ocorrencias/${p.id}">${p.codigo}</a>`)}</div>` : ""}
        ${galeria(r.fotos)}
      </div>`
    )}
  </div>`;
}

/** Abre o detalhe. aoAlterar() é chamado após revisão. */
export function abrirExecucao(ex, { aoAlterar } = {}) {
  const t = ex.totais || {};
  const aplicaveis = (t.itens || 0) - (t.naoAplicaveis || 0);
  const podeRevisar = pode(ex.setorId, 3) && ex.autorLogin !== meuLogin() && ex.status !== "correcao";
  const extras = ex.extras || {};
  const modal = abrirModal({
    titulo: `${ex.modeloNome} · ${ex.blocoNome}`,
    largo: true,
    corpo: html`<div class="pilha">
      <div class="linha-entre">
        <div class="pequeno texto-2">${nomeModulo(ex.setorId)} · ${nomeUnidade(ex.unidadeId)} · ${rotuloPeriodo(ex.frequencia, ex.frequencia === "diaria" ? ex.dataPrevista : ex.dataRef)}${ex.frequencia === "diaria" && ex.inicio ? ` · ${ex.inicio}–${ex.fim}` : ""}</div>
        ${seloExecucao(ex)}
      </div>
      <div class="indicadores">
        <div class="indicador"><div class="indicador-rotulo">Concluídas</div><div class="indicador-valor">${t.concluidas || 0}<small>/${aplicaveis}</small></div><div class="indicador-nota">${pct(aplicaveis ? (t.concluidas || 0) / aplicaveis : null)} das aplicáveis</div></div>
        <div class="indicador ${t.pendentes ? "alerta" : ""}"><div class="indicador-rotulo">Pendentes</div><div class="indicador-valor">${t.pendentes || 0}</div></div>
        <div class="indicador"><div class="indicador-rotulo">Não aplicáveis</div><div class="indicador-valor">${t.naoAplicaveis || 0}</div></div>
        ${t.naoVerificadas ? html`<div class="indicador"><div class="indicador-rotulo">Não verificadas</div><div class="indicador-valor">${t.naoVerificadas}</div></div>` : ""}
      </div>
      <div class="pequeno texto-2">Enviado por <strong>${ex.autorNome}</strong> em ${formatarDataHora(ex.enviadoEm)}${ex.reenviadoEm ? ` · corrigido em ${formatarDataHora(ex.reenviadoEm)}` : ""}</div>
      ${ex.revisao
        ? html`<div class="aviso ${ex.revisao.status === "correcao" ? "aviso-marca" : "aviso-ok"}">${icone(ex.revisao.status === "correcao" ? "alerta" : "okCirculo")}<div>
            <strong>${ex.revisao.status === "correcao" ? "Correção solicitada" : "Revisado"}</strong> por ${ex.revisao.porNome}${ex.revisao.em ? ` em ${formatarDataHora(ex.revisao.em)}` : ""}${ex.revisao.comentario ? html`<br />${ex.revisao.comentario}` : ""}</div></div>`
        : ""}
      <div><h3 style="margin-bottom:6px">Atividades</h3>${blocoRespostas(ex.respostas || [])}</div>
      ${extras.faltaMaterial || extras.dificuldades || extras.irregularidades || extras.observacoes
        ? html`<div class="painel painel-compacto"><dl class="chave-valor">
            ${extras.faltaMaterial ? html`<dt>Falta de material</dt><dd class="forte" style="color:var(--pendente)">${extras.materiais || "Sim"}</dd>` : ""}
            ${extras.dificuldades ? html`<dt>Dificuldades</dt><dd>${extras.dificuldades}</dd>` : ""}
            ${extras.irregularidades ? html`<dt>Irregularidades</dt><dd>${extras.irregularidades}</dd>` : ""}
            ${extras.observacoes ? html`<dt>Observações</dt><dd>${extras.observacoes}</dd>` : ""}
          </dl></div>`
        : ""}
      ${ex.registrosResumo ? html`<div><h3 style="margin-bottom:6px">Registros do período (${ex.registrosResumo.total})</h3><div id="lista-registros" class="pequeno texto-3">Carregando…</div></div>` : ""}
      ${ex.correcoes?.length ? html`<details><summary class="pequeno texto-2" style="cursor:pointer">Versões anteriores (${ex.correcoes.length})</summary>
          ${ex.correcoes.map((c, i) => html`<div class="painel painel-compacto" style="margin-top:8px"><div class="pequeno texto-3">Versão ${i + 1}${c.revisao?.comentario ? ` · pedido: ${c.revisao.comentario}` : ""}</div>${blocoRespostas(c.respostas || [])}</div>`)}
        </details>` : ""}
    </div>`,
    rodape: podeRevisar
      ? html`<button class="btn btn-secundario" data-correcao>${icone("desfazer")} Solicitar correção</button>
          ${ex.status !== "revisado" ? html`<button class="btn btn-primario" data-revisado>${icone("check")} Marcar como revisado</button>` : ""}`
      : html`<button class="btn btn-secundario" data-fechar>Fechar</button>`,
    aoMontar: (el, fechar) => {
      ligarGalerias(el);
      if (ex.registrosResumo) {
        listarRegistrosDaExecucao(ex.id, ex.setorId, ex.unidadeId)
          .then((regs) => {
            const caixa = $("#lista-registros", el);
            if (!caixa) return;
            const ativos = regs.filter((r) => !r.cancelado);
            montar(
              caixa,
              ativos.length
                ? html`<div class="tabela-envoltorio"><table class="tabela"><thead><tr><th>Tipo</th><th>Canal</th><th>Resultado</th><th>Observação</th></tr></thead><tbody>
                    ${ativos.map((r) => html`<tr><td>${r.dados?.tipo}</td><td>${r.dados?.canal || "—"}</td><td>${r.dados?.resultado || "—"}</td><td class="quebra">${[r.dados?.nome, r.dados?.observacao].filter(Boolean).join(" · ") || "—"}</td></tr>`)}
                  </tbody></table></div>`
                : "Nenhum registro."
            );
          })
          .catch(() => {
            const caixa = $("#lista-registros", el);
            if (caixa) caixa.textContent = "Não foi possível carregar os registros.";
          });
      }
      on(el, "click", "[data-revisado]", (ev, b) =>
        comCarregamento(b, async () => {
          try {
            await revisarExecucao(ex, "revisado");
            avisar("Rotina marcada como revisada.");
            fechar(true);
            aoAlterar?.();
          } catch (e) {
            avisarErro(e);
          }
        })
      );
      on(el, "click", "[data-correcao]", async () => {
        const comentario = await pedirTexto({
          titulo: "Solicitar correção",
          mensagem: `${ex.autorNome} verá o pedido e poderá corrigir e reenviar. A versão atual fica guardada no histórico.`,
          rotulo: "O que precisa ser corrigido?",
          confirmarTexto: "Enviar pedido",
        });
        if (!comentario) return;
        try {
          await revisarExecucao(ex, "correcao", comentario);
          avisar("Pedido de correção enviado.");
          fechar(true);
          aoAlterar?.();
        } catch (e) {
          avisarErro(e);
        }
      });
    },
  });
  return modal.aoFechar;
}
