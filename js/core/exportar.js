// Exportação de dados: CSV compatível com Excel (pt-BR) e JSON.

function celula(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) v = v.toLocaleString("pt-BR", { timeZone: "America/Bahia" });
  if (typeof v === "number") return String(v).replace(".", ",");
  let s = typeof v === "object" ? JSON.stringify(v) : String(v);
  // Evita que o Excel interprete o conteúdo como fórmula
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  if (/[";\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** colunas: [{ titulo, valor: (linha) => any }] */
export function gerarCSV(linhas, colunas) {
  const cab = colunas.map((c) => celula(c.titulo)).join(";");
  const corpo = linhas.map((l) => colunas.map((c) => celula(c.valor(l))).join(";"));
  return "﻿" + [cab, ...corpo].join("\r\n");
}

export function baixarArquivo(conteudo, nome, tipo = "text/csv;charset=utf-8") {
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function exportarCSV(nome, linhas, colunas) {
  baixarArquivo(gerarCSV(linhas, colunas), nome.endsWith(".csv") ? nome : `${nome}.csv`);
}
