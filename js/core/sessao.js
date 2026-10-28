// Estado global da sessão: conexão com o banco, perfil do usuário e cadastros básicos em memória.
import { CONFIG } from "../config.js";
import { MODULOS, MODULO_POR_ID } from "./constantes.js";

function lerPreferencia(chave) {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

export const sessao = {
  banco: null,
  autenticacao: null,
  modoDemo: false,
  perfil: null, // usuarios/{login}
  unidades: [], // todas as unidades (ativas e inativas)
  setores: [], // setores personalizados
  config: null, // config/sistema
  unidadeSelecionada: lerPreferencia("iai-unidade") || "todas",
};

export function configurado() {
  return Boolean(CONFIG.firebase?.apiKey && CONFIG.firebase?.projectId);
}

// ---------------- Permissões (espelham as regras do Firestore) ----------------

export function ehAdmin() {
  return Boolean(sessao.perfil?.ativo && sessao.perfil?.admin);
}

export function nivel(modulo) {
  const p = sessao.perfil;
  if (!p?.ativo) return 0;
  if (p.admin) return 4;
  return Number(p.permissoes?.[modulo] || 0);
}

export function pode(modulo, n) {
  return nivel(modulo) >= n;
}

export function aprovador() {
  return ehAdmin() || Boolean(sessao.perfil?.ativo && sessao.perfil?.aprovador);
}

export function verAuditoria() {
  return ehAdmin() || Boolean(sessao.perfil?.ativo && sessao.perfil?.verAuditoria);
}

export function todasUnidades() {
  const p = sessao.perfil;
  return Boolean(p?.admin || p?.todasUnidades);
}

/** Unidades ativas às quais o usuário tem acesso */
export function minhasUnidades({ incluirInativas = false } = {}) {
  const lista = sessao.unidades.filter((u) => incluirInativas || u.ativo !== false);
  if (todasUnidades()) return lista;
  const minhas = sessao.perfil?.unidades || [];
  return lista.filter((u) => minhas.includes(u.id));
}

export function naUnidade(unidadeId) {
  if (todasUnidades()) return true;
  return (sessao.perfil?.unidades || []).includes(unidadeId);
}

/** Unidades consideradas no filtro global (seletor no topo) */
export function unidadesFiltro() {
  const minhas = minhasUnidades();
  if (sessao.unidadeSelecionada && sessao.unidadeSelecionada !== "todas") {
    const u = minhas.find((x) => x.id === sessao.unidadeSelecionada);
    if (u) return [u];
  }
  return minhas;
}

export function definirUnidadeSelecionada(id) {
  sessao.unidadeSelecionada = id;
  try {
    localStorage.setItem("iai-unidade", id);
  } catch {
    /* navegador sem armazenamento local: vale só nesta sessão */
  }
}

export function nomeUnidade(id) {
  return sessao.unidades.find((u) => u.id === id)?.nome || id || "—";
}

/** Módulos fixos + setores personalizados (tipo rotina) */
export function todosModulos() {
  const extras = (sessao.setores || [])
    .filter((s) => s.ativo !== false)
    .map((s) => ({ id: s.id, nome: s.nome, icone: "rotina", tipo: "rotina", grupo: "Outros setores", niveis: [0, 1, 2, 3, 4], personalizado: true }));
  return [...MODULOS, ...extras];
}

export function nomeModulo(id) {
  if (id === "gestao") return "Gestão gerencial";
  return MODULO_POR_ID[id]?.nome || sessao.setores.find((s) => s.id === id)?.nome || id;
}

export function modulosRotina() {
  return todosModulos().filter((m) => m.tipo === "rotina");
}

export function meuLogin() {
  return sessao.perfil?.login;
}

export function meuNome() {
  return sessao.perfil?.nome || "";
}
