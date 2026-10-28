// Editor de rotina (modelo de checklist): blocos, horários, dias, responsáveis e atividades.
import { html, raw, montar, $, on, opcoes } from "../core/dom.js";
import { icone } from "../core/icones.js";
import { pode, nomeModulo, nomeUnidade, minhasUnidades, sessao } from "../core/sessao.js";
import { avisar, avisarErro, comCarregamento, confirmar, semPermissao, estadoErro } from "../core/ui.js";
import { FREQUENCIAS, CONJUNTOS_RESPOSTA, TIPOS_REGISTRO, DIAS_SEMANA, CONTEXTOS_GESTOR } from "../core/constantes.js";
import { mensagemDe } from "../core/erros.js";
import { obterModelo, salvarModelo, modeloVazio, blocoVazio, itemVazio } from "../services/rotinas.js";
import { pessoasPara } from "../services/usuarios.js";
import { linkVoltar, unidadePadrao } from "./comum.js";

export default async function telaEditor(el, ctx) {
  const novo = ctx.params.id === "novo";
  let modelo;
  if (novo) {
    const setorId = ctx.busca.setor;
    if (!setorId || !pode(setorId, 3)) return montar(el, semPermissao());
    modelo = modeloVazio({ unidadeId: ctx.busca.unidade || unidadePadrao(), setorId });
    modelo.blocos.push(blocoVazio(modelo.frequencia));
  } else {
    try {
      modelo = await obterModelo(ctx.params.id);
    } catch (e) {
      return montar(el, estadoErro(e));
    }
    if (!modelo) return montar(el, estadoErro(new Error("Rotina não encontrada.")));
    if (!pode(modelo.setorId, 3)) return montar(el, semPermissao());
    modelo = JSON.parse(JSON.stringify(modelo));
  }
  const originais = new Set(novo ? [] : modelo.blocos.flatMap((b) => [b.id, ...(b.itens || []).map((i) => i.id)]));
  const voltar = `#/setor/${modelo.setorId}?aba=rotinas`;
  let pessoas = [];
  let alterado = false;

  async function carregarPessoas() {
    pessoas = modelo.unidadeId ? await pessoasPara({ unidadeId: modelo.unidadeId, modulo: modelo.setorId }).catch(() => []) : [];
  }

  function campoTexto(caminho, valor, attrs = "") {
    return html`<input data-caminho="${caminho}" value="${valor ?? ""}" ${raw(attrs)} />`;
  }

  function desenharItem(b, bi, it, ii) {
    const inativo = it.ativo === false;
    return html`<div class="painel painel-compacto" style="padding:12px;${inativo ? "opacity:.5" : ""}" data-item="${bi}:${ii}">
      <div class="linha" style="align-items:flex-start;gap:8px">
        <span class="numero texto-3" style="padding-top:12px;min-width:20px">${ii + 1}</span>
        <div class="expande pilha-sm">
          <div class="campo">${campoTexto(`blocos.${bi}.itens.${ii}.texto`, it.texto, `maxlength="200" placeholder="Descreva a atividade" aria-label="Atividade ${ii + 1}" ${inativo ? "disabled" : ""}`)}</div>
          <div class="linha" style="gap:16px">
            <label class="marcar pequeno"><input type="checkbox" data-caminho="blocos.${bi}.itens.${ii}.obrigatoria" ${raw(it.obrigatoria !== false ? "checked" : "")} ${raw(inativo ? "disabled" : "")} /> Obrigatória</label>
            <label class="marcar pequeno"><input type="checkbox" data-caminho="blocos.${bi}.itens.${ii}.exigeFoto" ${raw(it.exigeFoto ? "checked" : "")} ${raw(inativo ? "disabled" : "")} /> Exige foto ao concluir</label>
            ${modelo.setorId === "gestao"
              ? html`<label class="pequeno texto-2" style="display:flex;gap:8px;align-items:center">Dado automático
                  <select data-caminho="blocos.${bi}.itens.${ii}.contexto" class="entrada" style="min-height:34px;padding:4px 30px 4px 8px;width:auto" ${raw(inativo ? "disabled" : "")}>${opcoes(Object.entries(CONTEXTOS_GESTOR).map(([v, r]) => ({ valor: v, rotulo: r })), it.contexto || "")}</select></label>`
              : ""}
          </div>
        </div>
        <div class="linha" style="gap:2px;flex-wrap:nowrap">
          ${inativo
            ? html`<button type="button" class="btn btn-fantasma btn-sm" data-reativar-item="${bi}:${ii}">${icone("desfazer")} Reativar</button>`
            : html`<button type="button" class="btn btn-fantasma btn-icone btn-sm" data-mover-item="${bi}:${ii}:-1" aria-label="Subir" ${raw(ii === 0 ? "disabled" : "")}>${icone("cima")}</button>
                <button type="button" class="btn btn-fantasma btn-icone btn-sm" data-mover-item="${bi}:${ii}:1" aria-label="Descer" ${raw(ii === b.itens.length - 1 ? "disabled" : "")}>${icone("baixo")}</button>
                <button type="button" class="btn btn-fantasma btn-icone btn-sm" data-remover-item="${bi}:${ii}" aria-label="Remover atividade">${icone("lixo")}</button>`}
        </div>
      </div>
    </div>`;
  }

  function desenharBloco(b, bi) {
    const inativo = b.ativo === false;
    const resp = new Set(b.responsaveis || []);
    return html`<section class="painel" style="${inativo ? "opacity:.55" : ""}" data-bloco="${bi}">
      <div class="painel-cabecalho">
        <h3>${modelo.frequencia === "mensal" ? "Bloco do fechamento" : `Bloco ${bi + 1}`}${inativo ? " (desativado)" : ""}</h3>
        <div class="linha" style="gap:2px">
          ${inativo
            ? html`<button type="button" class="btn btn-fantasma btn-sm" data-reativar-bloco="${bi}">${icone("desfazer")} Reativar bloco</button>`
            : html`<button type="button" class="btn btn-fantasma btn-icone btn-sm" data-mover-bloco="${bi}:-1" aria-label="Subir bloco" ${raw(bi === 0 ? "disabled" : "")}>${icone("cima")}</button>
                <button type="button" class="btn btn-fantasma btn-icone btn-sm" data-mover-bloco="${bi}:1" aria-label="Descer bloco" ${raw(bi === modelo.blocos.length - 1 ? "disabled" : "")}>${icone("baixo")}</button>
                ${modelo.blocos.length > 1 ? html`<button type="button" class="btn btn-fantasma btn-sm" data-remover-bloco="${bi}">${icone("lixo")} Remover bloco</button>` : ""}`}
        </div>
      </div>
      ${inativo
        ? ""
        : html`<div class="grade-form" style="margin-bottom:14px">
            <div class="campo largo"><label class="obrigatorio">Nome do bloco</label>${campoTexto(`blocos.${bi}.nome`, b.nome, 'maxlength="80" placeholder="Ex.: Manhã, Turno da tarde, Segunda — Planejamento"')}</div>
            ${modelo.frequencia === "diaria"
              ? html`<div class="campo"><label class="obrigatorio">Início</label>${campoTexto(`blocos.${bi}.inicio`, b.inicio, 'type="time"')}</div>
                  <div class="campo"><label class="obrigatorio">Fim</label>${campoTexto(`blocos.${bi}.fim`, b.fim, 'type="time"')}</div>
                  <div class="campo largo"><span class="rotulo">Dias da semana</span><div class="linha" style="gap:6px">
                    ${DIAS_SEMANA.map((d) => html`<label class="chip" style="cursor:pointer;padding:6px 10px"><input type="checkbox" data-dia="${bi}" value="${d.valor}" ${raw((b.dias || []).includes(d.valor) ? "checked" : "")} style="accent-color:var(--ambar)" /> ${d.curto}</label>`)}
                  </div></div>`
              : modelo.frequencia === "semanal"
                ? html`<div class="campo"><label class="obrigatorio">Dia da semana</label><select data-caminho="blocos.${bi}.dia">${opcoes(DIAS_SEMANA.map((d) => ({ valor: d.valor, rotulo: d.nome })), b.dia)}</select></div>`
                : html`<div class="campo largo"><span class="ajuda">O fechamento mensal abre no dia 25 e pode ser enviado até o dia 5 do mês seguinte.</span></div>`}
            ${modelo.frequencia !== "mensal"
              ? html`<div class="campo largo"><label class="interruptor"><input type="checkbox" data-caminho="blocos.${bi}.somenteEscalado" ${raw(b.somenteEscalado ? "checked" : "")} /><span class="trilho"></span><span>Somente quando houver alguém escalado (ex.: sábado)</span></label></div>`
              : ""}
            ${!b.somenteEscalado
              ? html`<div class="campo largo"><span class="rotulo">Responsáveis</span>
                  ${pessoas.length
                    ? html`<div class="linha" style="gap:6px">${pessoas.map((p) => html`<label class="chip" style="cursor:pointer;padding:6px 10px"><input type="checkbox" data-resp="${bi}" value="${p.login}" ${raw(resp.has(p.login) ? "checked" : "")} style="accent-color:var(--ambar)" /> ${p.nome}</label>`)}</div>`
                    : html`<span class="ajuda">Nenhum colaborador com acesso a ${nomeModulo(modelo.setorId)} nesta unidade ainda.</span>`}
                  <span class="ajuda">Sem ninguém marcado, qualquer pessoa do setor na unidade pode preencher.</span></div>`
              : html`<div class="campo largo"><span class="ajuda">Os responsáveis vêm da escala (Gestão gerencial › Escala).</span></div>`}
          </div>
          <div class="pilha-sm">
            <span class="rotulo">Atividades</span>
            ${(b.itens || []).map((it, ii) => desenharItem(b, bi, it, ii))}
            <div><button type="button" class="btn btn-secundario btn-sm" data-add-item="${bi}">${icone("mais")} Adicionar atividade</button></div>
          </div>`}
    </section>`;
  }

  function desenhar() {
    const unidades = minhasUnidades();
    montar(
      el,
      html`${linkVoltar(voltar, "Voltar para as rotinas")}
      <div style="max-width:920px">
        <div class="cabecalho-pagina">
          <div><h1>${novo ? "Nova rotina" : "Editar rotina"}</h1><p>${nomeModulo(modelo.setorId)}${novo ? "" : ` · ${nomeUnidade(modelo.unidadeId)} · versão ${modelo.versao || 1}`}</p></div>
        </div>
        <form class="pilha" id="editor" novalidate>
          <section class="painel">
            <div class="grade-form">
              <div class="campo largo"><label class="obrigatorio">Nome da rotina</label>${campoTexto("nome", modelo.nome, 'maxlength="100" placeholder="Ex.: Cronograma de limpeza — Gandu"')}</div>
              ${novo
                ? html`<div class="campo"><label class="obrigatorio">Unidade</label><select data-caminho="unidadeId">${html`<option value="">Selecione</option>`}${opcoes(unidades.map((u) => ({ valor: u.id, rotulo: u.nome })), modelo.unidadeId)}</select></div>
                    <div class="campo"><label>Frequência</label><select data-caminho="frequencia">${opcoes(FREQUENCIAS, modelo.frequencia)}</select></div>`
                : html`<div class="campo"><label>Frequência</label><input value="${FREQUENCIAS.find((f) => f.valor === modelo.frequencia)?.rotulo}" disabled /></div>`}
              <div class="campo"><label>Opções de resposta</label><select data-caminho="respostas">${opcoes(Object.entries(CONJUNTOS_RESPOSTA).map(([v, c]) => ({ valor: v, rotulo: c.rotulo })), modelo.respostas)}</select></div>
              <div class="campo"><label>Registros durante o período</label><select data-caminho="registros">${opcoes(Object.entries(TIPOS_REGISTRO).map(([v, t]) => ({ valor: v, rotulo: t.rotulo })), modelo.registros)}</select></div>
              <div class="campo largo"><span class="rotulo">Campos adicionais no envio</span><div class="linha" style="gap:18px">
                <label class="marcar"><input type="checkbox" data-caminho="extras.faltaMaterial" ${raw(modelo.extras?.faltaMaterial ? "checked" : "")} /> Falta de materiais</label>
                <label class="marcar"><input type="checkbox" data-caminho="extras.dificuldades" ${raw(modelo.extras?.dificuldades ? "checked" : "")} /> Dificuldades</label>
                <label class="marcar"><input type="checkbox" data-caminho="extras.irregularidades" ${raw(modelo.extras?.irregularidades ? "checked" : "")} /> Irregularidades</label>
                <label class="marcar"><input type="checkbox" data-caminho="extras.observacoes" ${raw(modelo.extras?.observacoes !== false ? "checked" : "")} /> Observações</label>
              </div></div>
            </div>
          </section>
          ${modelo.blocos.map((b, bi) => desenharBloco(b, bi))}
          ${modelo.frequencia !== "mensal" ? html`<div><button type="button" class="btn btn-secundario" data-add-bloco>${icone("mais")} Adicionar bloco</button></div>` : ""}
          <div class="aviso aviso-erro oculto" id="erro-editor" role="alert"></div>
          <div class="linha-entre painel painel-compacto" style="position:sticky;bottom:12px;z-index:5;box-shadow:var(--sombra)">
            <span class="pequeno texto-2">${novo ? "A rotina começa a valer a partir de hoje." : "As mudanças valem para os próximos envios."}</span>
            <div class="linha"><a class="btn btn-secundario" href="${voltar}">Cancelar</a><button type="button" class="btn btn-primario" data-salvar>${icone("check")} Salvar rotina</button></div>
          </div>
        </form>
      </div>`
    );
  }

  function definir(caminho, valor) {
    const partes = caminho.split(".");
    let alvo = modelo;
    for (let i = 0; i < partes.length - 1; i++) alvo = alvo[partes[i]] ?? (alvo[partes[i]] = {});
    alvo[partes[partes.length - 1]] = valor;
    alterado = true;
  }

  // ---------- eventos ----------
  on(el, "input", "[data-caminho]", (ev, t) => {
    if (t.type === "checkbox") return;
    definir(t.dataset.caminho, t.value);
  });
  on(el, "change", "[data-caminho]", async (ev, t) => {
    const valor = t.type === "checkbox" ? t.checked : t.value;
    definir(t.dataset.caminho, t.dataset.caminho.endsWith(".dia") ? Number(valor) : valor);
    if (t.dataset.caminho === "frequencia") {
      modelo.blocos = [blocoVazio(modelo.frequencia)];
      if (modelo.setorId === "gestao") modelo.respostas = "gerencial";
      desenhar();
    } else if (t.dataset.caminho === "unidadeId") {
      modelo.blocos.forEach((b) => (b.responsaveis = []));
      await carregarPessoas();
      desenhar();
    } else if (t.dataset.caminho.endsWith("somenteEscalado")) desenhar();
  });
  on(el, "change", "[data-dia]", (ev, t) => {
    const b = modelo.blocos[Number(t.dataset.dia)];
    const v = Number(t.value);
    b.dias = t.checked ? [...new Set([...(b.dias || []), v])] : (b.dias || []).filter((x) => x !== v);
    alterado = true;
  });
  on(el, "change", "[data-resp]", (ev, t) => {
    const b = modelo.blocos[Number(t.dataset.resp)];
    b.responsaveis = t.checked ? [...new Set([...(b.responsaveis || []), t.value])] : (b.responsaveis || []).filter((x) => x !== t.value);
    alterado = true;
  });
  on(el, "click", "[data-add-item]", (ev, b) => {
    const bloco = modelo.blocos[Number(b.dataset.addItem)];
    bloco.itens.push(itemVazio());
    alterado = true;
    desenhar();
    const inputs = el.querySelectorAll(`[data-bloco="${b.dataset.addItem}"] [data-item] input[data-caminho$=".texto"]`);
    inputs[inputs.length - 1]?.focus();
  });
  on(el, "click", "[data-remover-item]", (ev, b) => {
    const [bi, ii] = b.dataset.removerItem.split(":").map(Number);
    const it = modelo.blocos[bi].itens[ii];
    if (originais.has(it.id)) it.ativo = false;
    else modelo.blocos[bi].itens.splice(ii, 1);
    alterado = true;
    desenhar();
  });
  on(el, "click", "[data-reativar-item]", (ev, b) => {
    const [bi, ii] = b.dataset.reativarItem.split(":").map(Number);
    modelo.blocos[bi].itens[ii].ativo = true;
    desenhar();
  });
  on(el, "click", "[data-mover-item]", (ev, b) => {
    const [bi, ii, dir] = b.dataset.moverItem.split(":").map(Number);
    const lista = modelo.blocos[bi].itens;
    const j = ii + dir;
    if (j < 0 || j >= lista.length) return;
    [lista[ii], lista[j]] = [lista[j], lista[ii]];
    alterado = true;
    desenhar();
  });
  on(el, "click", "[data-add-bloco]", () => {
    modelo.blocos.push(blocoVazio(modelo.frequencia, modelo.blocos.length));
    alterado = true;
    desenhar();
  });
  on(el, "click", "[data-remover-bloco]", async (ev, b) => {
    const bi = Number(b.dataset.removerBloco);
    const bloco = modelo.blocos[bi];
    if (originais.has(bloco.id)) {
      const ok = await confirmar({ titulo: "Desativar bloco?", mensagem: "O bloco deixa de ser programado a partir de hoje. Os envios já feitos continuam no histórico.", confirmarTexto: "Desativar", perigo: true });
      if (!ok) return;
      bloco.ativo = false;
    } else modelo.blocos.splice(bi, 1);
    alterado = true;
    desenhar();
  });
  on(el, "click", "[data-reativar-bloco]", (ev, b) => {
    const bloco = modelo.blocos[Number(b.dataset.reativarBloco)];
    bloco.ativo = true;
    bloco.ate = null;
    desenhar();
  });
  on(el, "click", "[data-mover-bloco]", (ev, b) => {
    const [bi, dir] = b.dataset.moverBloco.split(":").map(Number);
    const j = bi + dir;
    if (j < 0 || j >= modelo.blocos.length) return;
    [modelo.blocos[bi], modelo.blocos[j]] = [modelo.blocos[j], modelo.blocos[bi]];
    desenhar();
  });
  on(el, "click", "[data-salvar]", async (ev, botao) => {
    const erro = $("#erro-editor", el);
    erro.classList.add("oculto");
    await comCarregamento(botao, async () => {
      try {
        // atividades vazias recém-adicionadas são descartadas
        modelo.blocos.forEach((b) => (b.itens = b.itens.filter((i) => originais.has(i.id) || (i.texto || "").trim())));
        await salvarModelo(novo ? null : modelo.id, modelo);
        alterado = false;
        avisar(novo ? "Rotina criada." : "Rotina atualizada.");
        location.hash = voltar;
      } catch (e) {
        erro.textContent = mensagemDe(e);
        erro.classList.remove("oculto");
        erro.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  });

  const aviso = (ev) => {
    if (alterado) {
      ev.preventDefault();
      ev.returnValue = "";
    }
  };
  window.addEventListener("beforeunload", aviso);

  await carregarPessoas();
  desenhar();
  return () => window.removeEventListener("beforeunload", aviso);
}

export { sessao, avisarErro };
