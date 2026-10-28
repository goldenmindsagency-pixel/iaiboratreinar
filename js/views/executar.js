// Preenchimento de um bloco de rotina (checklist, turno, rotina do gestor).
import { html, raw, montar, $, $$, on, opcoes, lerFormulario } from "../core/dom.js";
import { icone } from "../core/icones.js";
import { sessao, nomeUnidade, nomeModulo, meuLogin, pode } from "../core/sessao.js";
import { avisar, avisarErro, comCarregamento, confirmar, estadoVazio, estadoErro } from "../core/ui.js";
import { CONJUNTOS_RESPOSTA, STATUS_RESPOSTA, TIPOS_REGISTRO } from "../core/constantes.js";
import { rotuloPeriodo, formatarDataHora, limiteEnvio, formatarHora } from "../core/tempo.js";
import { mensagemDe } from "../core/erros.js";
import {
  ocorrenciaPorId, situacaoOcorrencia, podeEnviarAgora, enviarExecucao, reenviarExecucao, validarRespostas,
  adicionarRegistro, cancelarRegistro, listarRegistrosDaExecucao, ROTULOS_SITUACAO,
} from "../services/rotinas.js";
import { carregarContextos, contextoComoTexto } from "../services/contexto.js";
import { campoFotos } from "./componentes/fotos.js";
import { abrirExecucao } from "./componentes/execucao-detalhe.js";
import { abrirNovaOcorrencia } from "./componentes/form-ocorrencia.js";
import { linkVoltar } from "./comum.js";

const chaveRascunho = (id) => `iai-rascunho:${meuLogin()}:${id}`;

export default async function telaExecutar(el, ctx) {
  const id = ctx.params.id;
  let oc;
  try {
    oc = await ocorrenciaPorId(id);
  } catch (e) {
    montar(el, html`${linkVoltar("#/tarefas")}${estadoErro(e, { tentarNovamente: false })}`);
    return;
  }
  const { modelo, bloco, execucao } = oc;
  const voltar = ctx.busca.voltar || "#/tarefas";
  ctx.definirTitulo(nomeModulo(modelo.setorId));

  // Já enviado (e não está em correção pelo próprio autor): mostra o resumo
  const emCorrecao = execucao && execucao.status === "correcao" && execucao.autorLogin === meuLogin();
  if (execucao && !emCorrecao) {
    montar(
      el,
      html`${linkVoltar(voltar)}
      <div class="painel pilha" style="max-width:760px">
        <div class="linha">${icone("okCirculo")}<h2>Este bloco já foi enviado</h2></div>
        <p class="texto-2">${execucao.modeloNome} · ${execucao.blocoNome} — enviado por ${execucao.autorNome} em ${formatarDataHora(execucao.enviadoEm)}.</p>
        <div><button class="btn btn-primario" data-ver>${icone("olho")} Ver o que foi enviado</button></div>
      </div>`
    );
    on(el, "click", "[data-ver]", () => abrirExecucao(execucao, { aoAlterar: ctx.recarregar }));
    return;
  }

  const agora = new Date();
  const situacao = situacaoOcorrencia(oc, emCorrecao ? null : execucao, agora);
  if (!emCorrecao && !podeEnviarAgora(oc, agora)) {
    const msg =
      situacao === "nao_enviado"
        ? `O prazo para envio terminou em ${formatarDataHora(new Date(limiteEnvio(modelo.frequencia, oc.periodo).getTime() - 60000))}.`
        : `Este bloco abre ${modelo.frequencia === "mensal" ? "no dia 25" : `em ${rotuloPeriodo("diaria", oc.data)}${modelo.frequencia === "diaria" ? `, às ${bloco.inicio}` : ""}`}.`;
    montar(el, html`${linkVoltar(voltar)}${estadoVazio({ icone: situacao === "nao_enviado" ? "cadeado" : "relogio", titulo: situacao === "nao_enviado" ? "Prazo encerrado" : "Ainda não está no horário", texto: msg })}`);
    return;
  }

  const conjunto = CONJUNTOS_RESPOSTA[modelo.respostas] || CONJUNTOS_RESPOSTA.operacional;
  const itens = (bloco.itens || []).filter((i) => i.ativo !== false);
  const tipoRegistro = modelo.registros && modelo.registros !== "nenhum" ? TIPOS_REGISTRO[modelo.registros] : null;

  // ---------- estado (rascunho) ----------
  let estado = { respostas: {}, extras: {} };
  if (emCorrecao) {
    for (const r of execucao.respostas || []) estado.respostas[r.itemId] = { status: r.status === "nao_verificada" ? "" : r.status, justificativa: r.justificativa, fotos: r.fotos || [], providencias: r.providencias || [], contexto: r.contexto };
    estado.extras = { ...(execucao.extras || {}) };
  }
  try {
    const salvo = JSON.parse(localStorage.getItem(chaveRascunho(id)) || "null");
    if (salvo && !emCorrecao) estado = { respostas: salvo.respostas || {}, extras: salvo.extras || {} };
  } catch {
    /* rascunho inválido é ignorado */
  }
  const salvarRascunho = () => {
    try {
      localStorage.setItem(chaveRascunho(id), JSON.stringify({ ...estado, salvoEm: Date.now() }));
    } catch {
      /* armazenamento cheio: segue sem rascunho */
    }
  };
  const resp = (itemId) => (estado.respostas[itemId] = estado.respostas[itemId] || { status: "", justificativa: "", fotos: [], providencias: [] });

  let registros = [];
  let contextos = new Map();
  const camposFoto = new Map();

  // ---------- desenho ----------
  const sit = ROTULOS_SITUACAO[emCorrecao ? "correcao" : situacao];
  montar(
    el,
    html`${linkVoltar(voltar)}
    <div style="max-width:860px">
      <div class="cabecalho-pagina" style="margin-bottom:16px">
        <div>
          <div class="linha" style="gap:8px;margin-bottom:6px"><span class="chip">${nomeModulo(modelo.setorId)}</span><span class="chip">${icone("predio")} ${nomeUnidade(modelo.unidadeId)}</span><span class="selo ${sit.classe}">${sit.rotulo}</span></div>
          <h1>${bloco.nome}</h1>
          <p>${modelo.nome} · ${rotuloPeriodo(modelo.frequencia, modelo.frequencia === "diaria" ? oc.data : oc.periodo)}${modelo.frequencia === "diaria" ? ` · ${bloco.inicio} às ${bloco.fim}` : ""}</p>
        </div>
      </div>
      ${emCorrecao
        ? html`<div class="aviso aviso-marca" style="margin-bottom:16px">${icone("alerta")}<div><strong>Correção solicitada por ${execucao.revisao?.porNome}:</strong> ${execucao.revisao?.comentario}</div></div>`
        : ""}
      <div class="linha-entre" style="margin-bottom:12px">
        <span class="pequeno texto-2" id="progresso"></span>
        ${modelo.respostas === "operacional" ? html`<button class="btn btn-fantasma btn-sm" data-todas>${icone("check")} Marcar todas como concluídas</button>` : ""}
      </div>
      <div class="pilha" id="itens"></div>
      ${tipoRegistro ? html`<div class="painel" style="margin-top:20px" id="painel-registros"></div>` : ""}
      <form class="painel pilha" style="margin-top:20px" id="extras" novalidate>
        <h3>Informações do período</h3>
        ${modelo.extras?.faltaMaterial
          ? html`<label class="interruptor"><input type="checkbox" name="faltaMaterial" ${raw(estado.extras.faltaMaterial ? "checked" : "")} /><span class="trilho"></span><span>Faltou material</span></label>
            <div class="campo ${estado.extras.faltaMaterial ? "" : "oculto"}" id="campo-materiais"><label for="materiais">Quais materiais faltaram?</label><input id="materiais" name="materiais" value="${estado.extras.materiais || ""}" maxlength="300" placeholder="Ex.: desinfetante, papel-toalha" /></div>`
          : ""}
        ${modelo.extras?.dificuldades ? html`<div class="campo"><label for="dificuldades">Dificuldades encontradas</label><textarea id="dificuldades" name="dificuldades" maxlength="1500">${estado.extras.dificuldades || ""}</textarea></div>` : ""}
        ${modelo.extras?.irregularidades ? html`<div class="campo"><label for="irregularidades">Irregularidades observadas</label><textarea id="irregularidades" name="irregularidades" maxlength="1500">${estado.extras.irregularidades || ""}</textarea></div>` : ""}
        ${modelo.extras?.observacoes !== false ? html`<div class="campo"><label for="observacoes">Observações</label><textarea id="observacoes" name="observacoes" maxlength="1500">${estado.extras.observacoes || ""}</textarea></div>` : ""}
        <div class="linha-entre">
          <span class="pequeno texto-3" id="salvo-local">${icone("check")} O rascunho fica salvo neste aparelho enquanto você preenche.</span>
          <div class="linha">
            ${pode("pendencias", 1) ? html`<button type="button" class="btn btn-secundario" data-ocorrencia>${icone("alerta")} Registrar ocorrência</button>` : ""}
            <button type="button" class="btn btn-primario" data-enviar>${icone("aviao")} ${emCorrecao ? "Reenviar corrigido" : "Enviar bloco"}</button>
          </div>
        </div>
      </form>
    </div>`
  );

  function desenharItem(item) {
    const r = resp(item.id);
    const classeResp = r.status === "concluida" ? "respondido-ok" : r.status === "pendente" || r.status === "nao_realizada" ? "respondido-pendente" : r.status === "nao_aplicavel" ? "respondido-na" : "";
    const ctxItens = item.contexto ? contextos.get(item.contexto) : null;
    return html`<div class="item-check ${classeResp}" data-item="${item.id}">
      <div class="item-check-topo">
        <div class="item-check-texto">${item.texto}${item.ajuda ? html`<small>${item.ajuda}</small>` : ""}${item.exigeFoto ? html`<small>${icone("camera")} Foto obrigatória ao concluir</small>` : ""}${item.obrigatoria === false ? html`<small>Opcional</small>` : ""}</div>
        <div class="escolha" role="radiogroup" aria-label="Situação de ${item.texto}">
          ${conjunto.opcoes.map((op) => {
            const s = STATUS_RESPOSTA[op];
            const sel = r.status === op ? `sel-${s.classe}` : "";
            return html`<button type="button" role="radio" aria-checked="${r.status === op}" class="${sel}" data-status="${op}">${icone(s.icone)}<span>${s.rotulo}</span></button>`;
          })}
        </div>
      </div>
      ${item.contexto
        ? html`<div class="contexto-auto">${ctxItens === undefined || ctxItens === null
            ? html`<span class="texto-3">Carregando dados do sistema…</span>`
            : ctxItens.map((c) => html`<span>${c.rotulo}: <strong style="${c.tom === "critico" ? "color:var(--critico)" : c.tom === "pendente" ? "color:var(--pendente)" : ""}">${c.valor}</strong></span>`)}</div>`
        : ""}
      ${(() => {
        // Na rotina gerencial, toda atividade aceita observação; nas demais, só quando não foi concluída.
        const gerencial = modelo.respostas === "gerencial";
        const obrigatorio = r.status && r.status !== "concluida";
        const visivel = obrigatorio || (gerencial && r.status);
        return html`<div class="campo ${visivel ? "" : "oculto"}" data-justificativa>
          <label class="${obrigatorio ? "obrigatorio" : ""}">${obrigatorio ? "Motivo e providência" : "Observações (opcional)"}</label>
          <textarea data-campo-justificativa maxlength="800" placeholder="${r.status === "nao_aplicavel" ? "Por que não se aplica hoje?" : obrigatorio ? "O que impediu e qual a providência?" : "O que você observou, o que está bem e o que precisa melhorar"}">${r.justificativa || ""}</textarea>
        </div>`;
      })()}
      <div data-area-fotos class="${item.exigeFoto || (r.fotos || []).length ? "" : "oculto"}"></div>
      <div class="linha" style="gap:6px">
        ${!item.exigeFoto && !(r.fotos || []).length ? html`<button type="button" class="btn btn-fantasma btn-sm" data-mostrar-fotos>${icone("camera")} Foto</button>` : ""}
        ${modelo.setorId === "gestao" && pode("pendencias", 1) ? html`<button type="button" class="btn btn-fantasma btn-sm" data-providencia>${icone("bandeira")} Gerar providência</button>` : ""}
        ${(r.providencias || []).map((p) => html`<a class="chip" href="#/ocorrencias/${p.id}">${icone("bandeira")} ${p.codigo}</a>`)}
      </div>
      <span class="erro-campo oculto" data-erro></span>
    </div>`;
  }

  function desenharItens() {
    montar($("#itens", el), itens.map(desenharItem));
    for (const item of itens) {
      const area = $(`[data-item="${item.id}"] [data-area-fotos]`, el);
      if (!area.classList.contains("oculto")) ligarFotos(item, area);
    }
    atualizarProgresso();
  }

  function redesenharItem(item) {
    const atual = $(`[data-item="${item.id}"]`, el);
    const temp = document.createElement("div");
    montar(temp, desenharItem(item));
    const novo = temp.firstElementChild;
    atual.replaceWith(novo);
    const area = $("[data-area-fotos]", novo);
    if (!area.classList.contains("oculto")) ligarFotos(item, area);
    atualizarProgresso();
  }

  function ligarFotos(item, area) {
    const r = resp(item.id);
    camposFoto.set(
      item.id,
      campoFotos(area, {
        fotos: r.fotos || [],
        pasta: `${modelo.unidadeId}/${modelo.setorId}`,
        maximo: 4,
        aoMudar: (lista) => {
          r.fotos = lista;
          salvarRascunho();
        },
      })
    );
  }

  function atualizarProgresso() {
    const respondidas = itens.filter((i) => resp(i.id).status).length;
    $("#progresso", el).textContent = `${respondidas} de ${itens.length} atividades respondidas`;
  }

  // ---------- registros avulsos ----------
  function desenharRegistros() {
    const painel = $("#painel-registros", el);
    if (!painel) return;
    const ativos = registros.filter((r) => !r.cancelado);
    montar(
      painel,
      html`<div class="painel-cabecalho"><div><h3>${tipoRegistro.rotulo}</h3><p>Lance cada ${tipoRegistro.singular} na hora. Tudo é consolidado quando você enviar o bloco.</p></div><span class="selo selo-marca sem-ponto">${ativos.length} registrado(s)</span></div>
      <form class="pilha-sm" id="form-registro" novalidate>
        <div class="grade-form">
          <div class="campo"><label for="reg-tipo" class="obrigatorio">Tipo</label><select id="reg-tipo" name="tipo" required>${html`<option value="">Selecione</option>`}${opcoes(tipoRegistro.tipos)}</select></div>
          <div class="campo"><label for="reg-canal">Canal</label><select id="reg-canal" name="canal">${html`<option value="">—</option>`}${opcoes(tipoRegistro.canais)}</select></div>
          <div class="campo"><label for="reg-resultado">Resultado</label><select id="reg-resultado" name="resultado">${html`<option value="">—</option>`}${opcoes(tipoRegistro.resultados)}</select></div>
          ${modelo.registros === "contato" ? html`<div class="campo"><label for="reg-nome">Nome do contato (opcional)</label><input id="reg-nome" name="nome" maxlength="80" /></div>` : ""}
          <div class="campo largo"><label for="reg-obs">Observação</label><input id="reg-obs" name="observacao" maxlength="300" /></div>
        </div>
        <div><button type="submit" class="btn btn-secundario">${icone("mais")} Adicionar ${tipoRegistro.singular}</button></div>
      </form>
      ${ativos.length
        ? html`<div class="lista" style="margin-top:12px">${ativos
            .slice()
            .reverse()
            .map(
              (r) => html`<div class="lista-item">
                <span class="icone-circulo">${icone(modelo.registros === "contato" ? "telefone" : "mensagem")}</span>
                <div class="expande"><div class="lista-item-titulo">${r.dados.tipo}${r.dados.resultado ? html` · <span class="texto-2">${r.dados.resultado}</span>` : ""}</div>
                  <div class="lista-item-sub">${[r.dados.canal, r.dados.nome, r.dados.observacao].filter(Boolean).join(" · ")} · ${formatarHora(r.criadoEm)}</div></div>
                <button type="button" class="btn btn-fantasma btn-icone btn-sm" data-cancelar-registro="${r.id}" aria-label="Remover">${icone("lixo")}</button>
              </div>`
            )}</div>`
        : ""}`
    );
  }

  async function carregarRegistros() {
    if (!tipoRegistro) return;
    try {
      registros = await listarRegistrosDaExecucao(id, modelo.setorId, modelo.unidadeId);
    } catch {
      registros = [];
    }
    desenharRegistros();
  }

  // ---------- eventos ----------
  on(el, "click", "[data-status]", (ev, b) => {
    const item = itens.find((i) => i.id === b.closest("[data-item]").dataset.item);
    const r = resp(item.id);
    r.status = b.dataset.status;
    if (item.contexto && contextos.get(item.contexto)) r.contexto = contextoComoTexto(contextos.get(item.contexto));
    salvarRascunho();
    redesenharItem(item);
    if (r.status !== "concluida") $(`[data-item="${item.id}"] [data-campo-justificativa]`, el)?.focus();
  });
  on(el, "input", "[data-campo-justificativa]", (ev, t) => {
    resp(t.closest("[data-item]").dataset.item).justificativa = t.value;
    salvarRascunho();
  });
  on(el, "click", "[data-mostrar-fotos]", (ev, b) => {
    const card = b.closest("[data-item]");
    const item = itens.find((i) => i.id === card.dataset.item);
    const area = $("[data-area-fotos]", card);
    area.classList.remove("oculto");
    b.remove();
    ligarFotos(item, area);
    $("label.btn", area)?.click();
  });
  on(el, "click", "[data-todas]", async () => {
    const ok = await confirmar({
      titulo: "Marcar todas como concluídas?",
      mensagem: "Use apenas se todas as atividades foram realmente feitas. Depois você pode ajustar as exceções.",
      confirmarTexto: "Marcar todas",
    });
    if (!ok) return;
    for (const item of itens) if (!resp(item.id).status) resp(item.id).status = "concluida";
    salvarRascunho();
    desenharItens();
  });
  on(el, "click", "[data-providencia]", async (ev, b) => {
    const item = itens.find((i) => i.id === b.closest("[data-item]").dataset.item);
    const criada = await abrirNovaOcorrencia({
      origem: "providencia",
      origemRef: { execucaoId: id, itemId: item.id },
      unidadeId: modelo.unidadeId,
      titulo: "",
      descricao: `Origem: ${modelo.nome} · ${item.texto}`,
    });
    if (criada) {
      const r = resp(item.id);
      r.providencias = [...(r.providencias || []), { id: criada.id, codigo: criada.codigo }];
      salvarRascunho();
      redesenharItem(item);
    }
  });
  on(el, "click", "[data-ocorrencia]", () => abrirNovaOcorrencia({ unidadeId: modelo.unidadeId, categoria: modelo.setorId === "limpeza" ? "limpeza" : "" }));

  const formExtras = $("#extras", el);
  formExtras.addEventListener("input", () => {
    estado.extras = { ...estado.extras, ...lerFormulario(formExtras) };
    $("#campo-materiais", el)?.classList.toggle("oculto", !estado.extras.faltaMaterial);
    salvarRascunho();
  });
  formExtras.addEventListener("change", () => {
    estado.extras = { ...estado.extras, ...lerFormulario(formExtras) };
    $("#campo-materiais", el)?.classList.toggle("oculto", !estado.extras.faltaMaterial);
    salvarRascunho();
  });

  on(el, "submit", "#form-registro", async (ev, form) => {
    ev.preventDefault();
    const d = lerFormulario(form);
    if (!d.tipo) {
      avisar("Escolha o tipo do registro.", "erro");
      return;
    }
    const botao = $("button[type=submit]", form);
    await comCarregamento(botao, async () => {
      try {
        const novo = await adicionarRegistro({ oc, tipo: modelo.registros, dados: d });
        registros.push(novo);
        desenharRegistros();
        avisar(`${tipoRegistro.singular[0].toUpperCase()}${tipoRegistro.singular.slice(1)} registrado.`);
        $("#reg-tipo", el)?.focus();
      } catch (e) {
        avisarErro(e);
      }
    });
  });
  on(el, "click", "[data-cancelar-registro]", async (ev, b) => {
    const r = registros.find((x) => x.id === b.dataset.cancelarRegistro);
    if (!r || !(await confirmar({ titulo: "Remover registro?", mensagem: `${r.dados.tipo} — ${formatarHora(r.criadoEm)}`, confirmarTexto: "Remover", perigo: true }))) return;
    try {
      await cancelarRegistro(r);
      r.cancelado = true;
      desenharRegistros();
    } catch (e) {
      avisarErro(e);
    }
  });

  on(el, "click", "[data-enviar]", async (ev, botao) => {
    estado.extras = { ...estado.extras, ...lerFormulario(formExtras) };
    $$("[data-erro]", el).forEach((e) => e.classList.add("oculto"));
    if ([...camposFoto.values()].some((c) => c.enviando())) {
      avisar("Aguarde o envio das fotos terminar.", "info");
      return;
    }
    const problemas = validarRespostas(modelo, bloco, estado.respostas);
    if (problemas.length) {
      for (const p of problemas) {
        const erro = $(`[data-item="${p.itemId}"] [data-erro]`, el);
        if (erro) {
          erro.textContent = p.motivo;
          erro.classList.remove("oculto");
        }
      }
      $(`[data-item="${problemas[0].itemId}"]`, el)?.scrollIntoView({ behavior: "smooth", block: "center" });
      avisar(`Faltam ${problemas.length} resposta(s) ou justificativa(s).`, "erro");
      return;
    }
    const ativos = registros.filter((r) => !r.cancelado);
    const cont = { concluida: 0, pendente: 0, nao_aplicavel: 0, outros: 0 };
    for (const i of itens) {
      const s = resp(i.id).status;
      if (s === "concluida") cont.concluida++;
      else if (s === "pendente" || s === "nao_realizada") cont.pendente++;
      else if (s === "nao_aplicavel") cont.nao_aplicavel++;
      else cont.outros++;
    }
    const ok = await confirmar({
      titulo: emCorrecao ? "Reenviar bloco corrigido?" : "Enviar bloco?",
      mensagem: `${cont.concluida} concluída(s), ${cont.pendente} ${modelo.respostas === "gerencial" ? "não realizada(s)" : "pendente(s)"}, ${cont.nao_aplicavel} não aplicável(is)${cont.outros ? `, ${cont.outros} sem resposta` : ""}${tipoRegistro ? ` e ${ativos.length} ${tipoRegistro.singular}(s)` : ""}. Depois de enviado, só é possível alterar se a supervisão pedir correção.`,
      confirmarTexto: emCorrecao ? "Reenviar" : "Enviar",
    });
    if (!ok) return;
    await comCarregamento(botao, async () => {
      try {
        const r = emCorrecao
          ? await reenviarExecucao({ execucao, modelo, bloco, respostas: estado.respostas, extras: estado.extras, registros: ativos })
          : await enviarExecucao({ oc, respostas: estado.respostas, extras: estado.extras, registros: ativos });
        localStorage.removeItem(chaveRascunho(id));
        avisar(r?.pendente ? "Sem internet: o envio ficou guardado no aparelho e será concluído quando a conexão voltar." : "Bloco enviado. Obrigado!", r?.pendente ? "info" : "ok", 6000);
        location.hash = voltar;
      } catch (e) {
        avisar(mensagemDe(e), "erro", 7000);
      }
    });
  });

  // ---------- carregamento inicial ----------
  desenharItens();
  carregarRegistros();
  const chaves = [...new Set(itens.map((i) => i.contexto).filter(Boolean))];
  if (chaves.length) {
    carregarContextos(modelo.unidadeId, chaves)
      .then((m) => {
        if (!ctx.ativo()) return;
        contextos = m;
        for (const item of itens) {
          if (!item.contexto) continue;
          const r = resp(item.id);
          if (r.status) r.contexto = contextoComoTexto(m.get(item.contexto));
          const card = $(`[data-item="${item.id}"]`, el);
          if (card) redesenharItem(item);
        }
      })
      .catch(() => {
        contextos = new Map(chaves.map((c) => [c, [{ rotulo: "Dados", valor: "indisponíveis no momento" }]]));
        if (ctx.ativo()) desenharItens();
      });
  }
}
