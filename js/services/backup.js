// Cópia de segurança: exporta todas as coleções em um arquivo JSON (somente administrador).
import { ehAdmin } from "../core/sessao.js";
import { ErroSistema } from "../core/erros.js";
import { bd } from "./base.js";
import { baixarArquivo } from "../core/exportar.js";
import { hoje } from "../core/tempo.js";

export const COLECOES = [
  "config", "unidades", "setores", "usuarios", "diretorio", "escalas", "rotinaModelos", "execucoes", "registros",
  "pendencias", "contadores", "equipamentos", "ambientes", "manutencoes", "custos", "investimentos", "metas",
  "evoDados", "importacoesEvo", "marketingAcoes", "relatoriosMensais", "auditoria",
];

export async function exportarTudo(aoProgresso) {
  if (!ehAdmin()) throw new ErroSistema("permissao");
  const saida = { sistema: "IAÍ Gestão", geradoEm: new Date().toISOString(), colecoes: {} };
  let i = 0;
  for (const c of COLECOES) {
    aoProgresso?.(c, ++i, COLECOES.length);
    const docs = await bd().consultar(c);
    saida.colecoes[c] = docs;
    if (c === "pendencias") {
      saida.colecoes["pendencias/historico"] = {};
      for (const p of docs) saida.colecoes["pendencias/historico"][p.id] = await bd().consultar(`pendencias/${p.id}/historico`);
    }
  }
  const json = JSON.stringify(saida, null, 1);
  baixarArquivo(json, `iai-gestao-backup-${hoje()}.json`, "application/json");
  return { colecoes: COLECOES.length, tamanho: json.length };
}
