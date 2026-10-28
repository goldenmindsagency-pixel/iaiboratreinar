// Utilidades de DOM e de templates com escape automático (proteção contra XSS).

const MAPA_ESCAPE = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" };

export function esc(valor) {
  if (valor === null || valor === undefined || valor === false) return "";
  return String(valor).replace(/[&<>"'`]/g, (c) => MAPA_ESCAPE[c]);
}

class Bruto {
  constructor(texto) {
    this.texto = texto;
  }
  toString() {
    return this.texto;
  }
}

/** Marca um trecho de HTML como confiável (gerado pelo próprio sistema). */
export function raw(texto) {
  return new Bruto(texto ?? "");
}

function interpolar(valor) {
  if (valor instanceof Bruto) return valor.texto;
  if (Array.isArray(valor)) return valor.map(interpolar).join("");
  return esc(valor);
}

/** Template literal com escape: html`<p>${texto}</p>` */
export function html(partes, ...valores) {
  let saida = "";
  partes.forEach((parte, i) => {
    saida += parte;
    if (i < valores.length) saida += interpolar(valores[i]);
  });
  return new Bruto(saida);
}

export function $(seletor, raiz = document) {
  return raiz.querySelector(seletor);
}

export function $$(seletor, raiz = document) {
  return Array.from(raiz.querySelectorAll(seletor));
}

/** Delegação de eventos: on(el, 'click', '[data-acao=salvar]', (ev, alvo) => ...) */
export function on(raiz, evento, seletor, manipulador) {
  const ouvinte = (ev) => {
    const alvo = ev.target.closest(seletor);
    if (alvo && raiz.contains(alvo)) manipulador(ev, alvo);
  };
  raiz.addEventListener(evento, ouvinte);
  return () => raiz.removeEventListener(evento, ouvinte);
}

export function montar(el, conteudo) {
  el.innerHTML = interpolar(conteudo);
  return el;
}

/** Lê um formulário como objeto (checkbox => boolean, múltiplos nomes => array). */
export function lerFormulario(form) {
  const dados = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === "checkbox") {
      if (form.querySelectorAll(`[name="${CSS.escape(el.name)}"]`).length > 1) {
        dados[el.name] = dados[el.name] || [];
        if (el.checked) dados[el.name].push(el.value);
      } else {
        dados[el.name] = el.checked;
      }
    } else if (el.type === "radio") {
      if (el.checked) dados[el.name] = el.value;
    } else if (el.tagName === "SELECT" && el.multiple) {
      dados[el.name] = Array.from(el.selectedOptions).map((o) => o.value);
    } else {
      dados[el.name] = typeof el.value === "string" ? el.value.trim() : el.value;
    }
  }
  return dados;
}

export function opcoes(lista, selecionado, { vazio } = {}) {
  const itens = [];
  if (vazio !== undefined) itens.push(html`<option value="">${vazio}</option>`);
  for (const item of lista) {
    const valor = typeof item === "object" ? item.valor ?? item.id : item;
    const rotulo = typeof item === "object" ? item.rotulo ?? item.nome : item;
    const sel = Array.isArray(selecionado) ? selecionado.includes(valor) : String(selecionado ?? "") === String(valor);
    itens.push(html`<option value="${valor}" ${raw(sel ? "selected" : "")}>${rotulo}</option>`);
  }
  return itens;
}

export function iniciais(nome = "") {
  const partes = String(nome).trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  const a = partes[0][0] || "";
  const b = partes.length > 1 ? partes[partes.length - 1][0] : partes[0][1] || "";
  return (a + b).toUpperCase();
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
