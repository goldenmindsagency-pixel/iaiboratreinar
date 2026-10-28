// Funções comuns aos serviços: acesso ao banco, carimbos de autoria e auditoria.
import { sessao } from "../core/sessao.js";
import { hoje, mesDe } from "../core/tempo.js";
import { ErroSistema } from "../core/erros.js";

export const bd = () => sessao.banco;

export function eu() {
  const p = sessao.perfil;
  return { login: p?.login, nome: p?.nome };
}

export function carimboCriacao() {
  const { login, nome } = eu();
  return { criadoEm: bd().agora(), criadoPor: login, criadoPorNome: nome };
}

export function carimboAtualizacao() {
  const { login, nome } = eu();
  return { atualizadoEm: bd().agora(), atualizadoPor: login, atualizadoPorNome: nome };
}

const IGNORAR = new Set(["_auditId", "atualizadoEm", "atualizadoPor", "atualizadoPorNome", "criadoEm"]);

function resumirValor(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === "symbol") return "(data e hora do servidor)";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    const s = JSON.stringify(v);
    return s.length > 400 ? `${s.slice(0, 400)}…` : s;
  }
  const s = String(v);
  return s.length > 400 ? `${s.slice(0, 400)}…` : s;
}

/** Diferenças entre duas versões de um documento (somente campos alterados) */
export function diferencas(antes = {}, depois = {}) {
  // Só os campos enviados na alteração (atualizações parciais não "apagam" os demais).
  const chaves = new Set(Object.keys(depois || {}));
  const lista = [];
  for (const k of chaves) {
    if (IGNORAR.has(k) || k === "id") continue;
    const a = resumirValor(antes?.[k]);
    const d = resumirValor(depois?.[k]);
    if (a !== d) lista.push({ campo: k, antes: a, depois: d });
  }
  return lista.slice(0, 40);
}

/**
 * Registra a auditoria no mesmo lote da alteração. Retorna o id que deve ser
 * gravado no campo `_auditId` do documento alterado (exigido pelas regras do banco).
 */
export function auditar(lote, { colecao, docId, acao, resumo, antes, depois, unidadeId }) {
  const id = bd().novoId("auditoria");
  const { login, nome } = eu();
  lote.definir(`auditoria/${id}`, {
    colecao,
    docId,
    acao,
    resumo: resumo || "",
    alteracoes: diferencas(antes, depois),
    unidadeId: unidadeId || null,
    autorLogin: login,
    autorNome: nome,
    em: bd().agora(),
    mes: mesDe(hoje()),
  });
  return id;
}

/** Grava um documento auditado (criação ou atualização) em um único lote */
export async function gravarAuditado({ colecao, id, dados, antes, acao, resumo, unidadeId, extras }) {
  const lote = bd().lote();
  const auditId = auditar(lote, {
    colecao,
    docId: id,
    acao: acao || (antes ? "editar" : "criar"),
    resumo,
    antes,
    depois: dados,
    unidadeId,
  });
  const caminho = `${colecao}/${id}`;
  if (antes) lote.atualizar(caminho, { ...dados, ...carimboAtualizacao(), _auditId: auditId });
  else lote.definir(caminho, { ...dados, ...carimboCriacao(), ...carimboAtualizacao(), _auditId: auditId });
  extras?.(lote);
  return lote.confirmar();
}

export function exigir(condicao, mensagem) {
  if (!condicao) throw new ErroSistema("validacao", mensagem);
}

/** Executa consultas em paralelo e junta os resultados sem repetir documentos */
export async function unirConsultas(promessas) {
  const resultados = await Promise.allSettled(promessas);
  const mapa = new Map();
  let algumOk = false;
  let primeiroErro = null;
  for (const r of resultados) {
    if (r.status === "fulfilled") {
      algumOk = true;
      r.value.forEach((d) => mapa.set(d.id, d));
    } else if (!primeiroErro) primeiroErro = r.reason;
  }
  if (!algumOk && primeiroErro) throw primeiroErro;
  return Array.from(mapa.values());
}
