// Componentes de interface reutilizáveis: avisos, janelas, estados de carregamento e selos.
import { html, raw, esc, $, on, montar } from "./dom.js";
import { icone } from "./icones.js";
import { mensagemDe } from "./erros.js";
import { STATUS_PENDENCIA, PRIORIDADES, SITUACOES_EQUIPAMENTO, STATUS_INVESTIMENTO } from "./constantes.js";

// ---------------- Toasts ----------------
export function avisar(mensagem, tipo = "ok", duracao = 4200) {
  const area = document.getElementById("toasts");
  if (!area) return;
  const el = document.createElement("div");
  el.className = `toast toast-${tipo}`;
  const nomeIcone = tipo === "erro" ? "alerta" : tipo === "info" ? "info" : "okCirculo";
  montar(el, html`${icone(nomeIcone)}<div>${mensagem}</div>`);
  area.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity 200ms";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 220);
  }, duracao);
}

export function avisarErro(e) {
  avisar(mensagemDe(e), "erro", 6500);
}

// ---------------- Botão com estado de carregamento ----------------
export async function comCarregamento(botao, acao) {
  if (!botao) return acao();
  if (botao.classList.contains("carregando")) return undefined;
  botao.classList.add("carregando");
  botao.setAttribute("aria-busy", "true");
  try {
    return await acao();
  } finally {
    botao.classList.remove("carregando");
    botao.removeAttribute("aria-busy");
  }
}

// ---------------- Janela modal ----------------
/**
 * abrirModal({ titulo, corpo, rodape, largo, aoMontar(el, fechar) })
 * Retorna { el, fechar, aoFechar: Promise }.
 */
export function abrirModal({ titulo, corpo, rodape, largo = false, aoMontar, fecharFora = true }) {
  const fundo = document.createElement("div");
  fundo.className = "sobreposicao";
  const anterior = document.activeElement;
  let resolver;
  const aoFechar = new Promise((r) => (resolver = r));
  montar(
    fundo,
    html`<div class="modal ${largo ? "largo" : ""}" role="dialog" aria-modal="true" aria-labelledby="modal-titulo">
      <div class="modal-cabecalho">
        <h2 id="modal-titulo">${titulo}</h2>
        <button class="btn btn-fantasma btn-icone btn-sm" data-fechar aria-label="Fechar">${icone("fechar")}</button>
      </div>
      <div class="modal-corpo">${corpo}</div>
      ${rodape ? html`<div class="modal-rodape">${rodape}</div>` : ""}
    </div>`
  );
  document.body.appendChild(fundo);
  document.body.style.overflow = "hidden";

  let fechado = false;
  function fechar(valor) {
    if (fechado) return;
    fechado = true;
    document.removeEventListener("keydown", tecla);
    fundo.remove();
    if (!document.querySelector(".sobreposicao")) document.body.style.overflow = "";
    anterior?.focus?.();
    resolver(valor);
  }
  function tecla(ev) {
    // Com janelas sobrepostas, o Esc fecha só a que está por cima.
    if (ev.key !== "Escape") return;
    const abertas = document.querySelectorAll(".sobreposicao");
    if (abertas[abertas.length - 1] === fundo) fechar(undefined);
  }
  document.addEventListener("keydown", tecla);
  on(fundo, "click", "[data-fechar]", () => fechar(undefined));
  if (fecharFora) {
    fundo.addEventListener("mousedown", (ev) => {
      if (ev.target === fundo) fechar(undefined);
    });
  }
  const modal = $(".modal", fundo);
  aoMontar?.(modal, fechar);
  const focavel = modal.querySelector("input:not([type=hidden]), select, textarea, .modal-rodape .btn-primario");
  setTimeout(() => (focavel || modal).focus?.(), 30);
  return { el: modal, fechar, aoFechar };
}

/** Confirmação simples. Retorna true/false. */
export function confirmar({ titulo, mensagem, confirmarTexto = "Confirmar", perigo = false }) {
  const m = abrirModal({
    titulo,
    corpo: html`<p class="texto-2">${mensagem}</p>`,
    rodape: html`<button class="btn btn-secundario" data-fechar>Voltar</button>
      <button class="btn ${perigo ? "btn-perigo" : "btn-primario"}" data-confirmar>${confirmarTexto}</button>`,
    aoMontar: (el, fechar) => on(el, "click", "[data-confirmar]", () => fechar(true)),
  });
  return m.aoFechar.then((v) => v === true);
}

/** Pede um texto (ex.: justificativa). Retorna string ou null. */
export function pedirTexto({ titulo, mensagem, rotulo, obrigatorio = true, confirmarTexto = "Confirmar", perigo = false, valor = "" }) {
  const m = abrirModal({
    titulo,
    corpo: html`${mensagem ? html`<p class="texto-2">${mensagem}</p>` : ""}
      <div class="campo">
        <label for="pedir-texto" class="${obrigatorio ? "obrigatorio" : ""}">${rotulo}</label>
        <textarea id="pedir-texto" maxlength="1000">${valor}</textarea>
        <span class="erro-campo oculto">Preencha este campo.</span>
      </div>`,
    rodape: html`<button class="btn btn-secundario" data-fechar>Voltar</button>
      <button class="btn ${perigo ? "btn-perigo" : "btn-primario"}" data-confirmar>${confirmarTexto}</button>`,
    aoMontar: (el, fechar) =>
      on(el, "click", "[data-confirmar]", () => {
        const t = $("#pedir-texto", el).value.trim();
        if (obrigatorio && !t) {
          $(".erro-campo", el).classList.remove("oculto");
          $(".campo", el).classList.add("com-erro");
          return;
        }
        fechar(t);
      }),
  });
  return m.aoFechar.then((v) => (typeof v === "string" ? v : null));
}

export function ampliarFoto(url) {
  abrirModal({
    titulo: "Foto",
    largo: true,
    corpo: html`<img class="foto-grande" src="${url}" alt="Foto ampliada" />`,
  });
}

// ---------------- Estados de página ----------------
export function carregandoPagina() {
  return html`<div class="carregando-pagina" aria-busy="true" aria-label="Carregando">
    <div class="esqueleto"></div>
    <div class="esqueleto"></div>
    <div class="esqueleto"></div>
  </div>`;
}

export function estadoVazio({ icone: nomeIcone = "info", titulo, texto, acao }) {
  return html`<div class="vazio">
    ${icone(nomeIcone)}
    <h3>${titulo}</h3>
    ${texto ? html`<p>${texto}</p>` : ""} ${acao || ""}
  </div>`;
}

export function estadoErro(e, { tentarNovamente = true } = {}) {
  return html`<div class="vazio">
    ${icone("alerta")}
    <h3>Não foi possível carregar</h3>
    <p>${mensagemDe(e)}</p>
    ${tentarNovamente ? html`<button class="btn btn-secundario" data-acao="recarregar">${icone("atualizar")} Tentar novamente</button>` : ""}
  </div>`;
}

export function semPermissao() {
  return estadoVazio({
    icone: "cadeado",
    titulo: "Acesso restrito",
    texto: "Seu usuário não tem permissão para esta área. Se precisar, peça ao administrador.",
  });
}

// ---------------- Selos ----------------
export function seloStatusPendencia(status) {
  const s = STATUS_PENDENCIA[status] || { rotulo: status, classe: "" };
  return html`<span class="selo ${s.classe}">${s.rotulo}</span>`;
}

export function seloPrioridade(p) {
  const s = PRIORIDADES[p] || { rotulo: p, classe: "" };
  return html`<span class="selo ${s.classe}">${s.rotulo}</span>`;
}

export function seloSituacao(sit) {
  const s = SITUACOES_EQUIPAMENTO[sit] || SITUACOES_EQUIPAMENTO.operando;
  return html`<span class="selo ${s.classe}">${s.rotulo}</span>`;
}

export function seloInvestimento(st) {
  const s = STATUS_INVESTIMENTO[st] || { rotulo: st, classe: "" };
  return html`<span class="selo ${s.classe}">${s.rotulo}</span>`;
}

// ---------------- Indicadores ----------------
/** Anel de progresso no estilo do arco do logo */
export function anel(valor, { rotulo = "", tamanho = "", texto } = {}) {
  const v = valor === null || valor === undefined || Number.isNaN(valor) ? null : Math.max(0, Math.min(1, valor));
  const r = 52;
  const c = 2 * Math.PI * r;
  const off = v === null ? c : c * (1 - v);
  const exibido = texto ?? (v === null ? "—" : `${Math.round(v * 100)}%`);
  return html`<div class="anel ${tamanho}" role="img" aria-label="${rotulo} ${exibido}">
    <svg viewBox="0 0 120 120">
      <circle class="anel-fundo" cx="60" cy="60" r="${r}" fill="none" stroke-width="10" />
      <circle class="anel-valor" cx="60" cy="60" r="${r}" fill="none" stroke-width="10"
        stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" />
    </svg>
    <div class="anel-texto"><strong>${exibido}</strong>${rotulo ? html`<span>${rotulo}</span>` : ""}</div>
  </div>`;
}

/** Bloco de indicador: { rotulo, valor, sufixo, nota, formula, tom: 'alerta'|'critico'|'positivo' } */
export function indicador({ rotulo, valor, sufixo, nota, formula, tom = "" }) {
  return html`<div class="indicador ${tom}">
    <div class="indicador-rotulo">
      ${rotulo}
      ${formula ? html`<span class="ajuda-formula" title="${formula}" aria-label="Como é calculado: ${formula}">${icone("info")}</span>` : ""}
    </div>
    <div class="indicador-valor">${valor}${sufixo ? html`<small>${sufixo}</small>` : ""}</div>
    ${nota ? html`<div class="indicador-nota">${nota}</div>` : ""}
  </div>`;
}

export function barra(valor, classe = "") {
  const v = valor === null || valor === undefined ? 0 : Math.max(0, Math.min(1, valor));
  return html`<div class="barra-progresso ${classe}"><span style="width:${(v * 100).toFixed(1)}%"></span></div>`;
}

export function avatar(nome) {
  const partes = String(nome || "?").trim().split(/\s+/);
  const ini = ((partes[0]?.[0] || "") + (partes.length > 1 ? partes[partes.length - 1][0] : partes[0]?.[1] || "")).toUpperCase();
  return html`<span class="avatar" aria-hidden="true">${ini || "?"}</span>`;
}

export { esc, raw };
