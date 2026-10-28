// Formatação de números, dinheiro e percentuais (pt-BR).

const fmtMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtNumero = new Intl.NumberFormat("pt-BR");
const fmtDecimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** Valores em dinheiro são guardados em centavos (inteiro) para evitar erros de arredondamento. */
export function moeda(centavos) {
  return fmtMoeda.format((Number(centavos) || 0) / 100);
}

/** Converte "1.234,56" / "1234.56" / "R$ 1.234" em centavos */
export function paraCentavos(texto) {
  if (typeof texto === "number") return Math.round(texto * 100);
  let s = String(texto ?? "").replace(/[R$\s]/g, "").trim();
  if (!s) return 0;
  if (s.includes(",")) {
    // padrão brasileiro: 1.234,56
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    // "1.500" ou "24.000" = milhar (e não 1,5 ou 24)
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

export function centavosParaTexto(centavos) {
  if (centavos === null || centavos === undefined || centavos === "") return "";
  return ((Number(centavos) || 0) / 100).toFixed(2).replace(".", ",");
}

export function numero(n) {
  return fmtNumero.format(Number(n) || 0);
}

export function decimal(n) {
  return fmtDecimal.format(Number(n) || 0);
}

/** Percentual de a/b. Retorna null quando b = 0 (sem dados suficientes). */
export function razao(a, b) {
  if (!b) return null;
  return a / b;
}

export function pct(valor, { casas = 0, vazio = "—" } = {}) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return vazio;
  return `${(valor * 100).toFixed(casas).replace(".", ",")}%`;
}

export function plural(n, singular, pluralTexto) {
  return `${numero(n)} ${n === 1 ? singular : pluralTexto || singular + "s"}`;
}

export function normalizarTexto(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function slug(s) {
  return normalizarTexto(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
