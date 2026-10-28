// Colaboradores: acesso (login), perfil, permissões e diretório interno.
import { CONFIG } from "../config.js";
import { sessao, ehAdmin } from "../core/sessao.js";
import { ErroSistema } from "../core/erros.js";
import { normalizarTexto } from "../core/formato.js";
import { bd, auditar, carimboCriacao, carimboAtualizacao, exigir } from "./base.js";

export function normalizarLogin(texto) {
  return normalizarTexto(texto).replace(/\s+/g, ".").replace(/[^a-z0-9._-]/g, "");
}

export function loginValido(login) {
  return /^[a-z0-9][a-z0-9._-]{2,29}$/.test(login);
}

export function emailDoLogin(login, versao = 1) {
  return versao > 1 ? `${login}.v${versao}@${CONFIG.dominioLogin}` : `${login}@${CONFIG.dominioLogin}`;
}

/** Entrar com nome de usuário e senha */
export async function entrar(loginDigitado, senha) {
  const texto = String(loginDigitado || "").trim();
  if (!texto || !senha) throw new ErroSistema("credenciais", "Informe usuário e senha.");
  let email;
  if (texto.includes("@")) {
    email = texto.toLowerCase();
  } else {
    const login = normalizarLogin(texto);
    const registro = await bd().obter(`logins/${login}`);
    if (!registro?.email) throw new ErroSistema("credenciais");
    email = registro.email;
  }
  return sessao.autenticacao.entrar(email, senha);
}

export async function carregarPerfil(uid) {
  const mapa = await bd().obter(`uids/${uid}`);
  if (!mapa?.login) return null;
  return bd().obter(`usuarios/${mapa.login}`);
}

export async function listar() {
  const lista = await bd().consultar("usuarios");
  return lista.sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
}

let cacheDiretorio = null;
/** Lista básica de colaboradores (nome, função, unidades) visível para todos os usuários ativos */
export async function diretorio({ recarregar = false } = {}) {
  if (cacheDiretorio && !recarregar) return cacheDiretorio;
  const lista = await bd().consultar("diretorio", [["ativo", "==", true]]);
  cacheDiretorio = lista.sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
  return cacheDiretorio;
}

export function limparCacheDiretorio() {
  cacheDiretorio = null;
}

/** Pessoas que podem atuar em um módulo/unidade (para escolher responsáveis) */
export async function pessoasPara({ unidadeId, modulo, nivelMinimo = 1 } = {}) {
  const lista = await diretorio();
  return lista.filter((p) => {
    const naUnidade = p.admin || p.todasUnidades || !unidadeId || (p.unidades || []).includes(unidadeId);
    const noModulo = !modulo || p.admin || (p.niveis?.[modulo] || 0) >= nivelMinimo;
    return naUnidade && noModulo;
  });
}

export function nomePessoa(login) {
  if (!login) return "";
  return cacheDiretorio?.find((p) => p.login === login)?.nome || login;
}

function entradaDiretorio(perfil) {
  const niveis = {};
  for (const [m, n] of Object.entries(perfil.permissoes || {})) if (Number(n) > 0) niveis[m] = Number(n);
  return {
    login: perfil.login,
    nome: perfil.nome,
    cargo: perfil.cargo || "",
    unidades: perfil.unidades || [],
    todasUnidades: Boolean(perfil.todasUnidades),
    admin: Boolean(perfil.admin),
    niveis,
    ativo: perfil.ativo !== false,
  };
}

function validarPerfil(d) {
  exigir(d.nome && d.nome.length >= 3, "Informe o nome completo.");
  exigir(loginValido(d.login), "O usuário deve ter de 3 a 30 caracteres: letras, números, ponto, hífen ou sublinhado.");
  exigir(d.admin || d.todasUnidades || (d.unidades || []).length > 0, "Selecione ao menos uma unidade.");
}

function limparPerfil(d) {
  const permissoes = {};
  for (const [m, n] of Object.entries(d.permissoes || {})) {
    const v = Number(n) || 0;
    if (v > 0) permissoes[m] = Math.min(4, Math.max(0, v));
  }
  return {
    login: d.login,
    nome: d.nome.trim(),
    cargo: (d.cargo || "").trim(),
    funcaoId: d.funcaoId || "",
    telefone: (d.telefone || "").trim(),
    admin: Boolean(d.admin),
    aprovador: Boolean(d.aprovador || d.admin),
    verAuditoria: Boolean(d.verAuditoria || d.admin),
    todasUnidades: Boolean(d.todasUnidades || d.admin),
    unidades: d.unidades || [],
    permissoes,
  };
}

/** Cria o acesso (Firebase Authentication) e o perfil do colaborador. Somente administrador. */
export async function criar(dados, senhaInicial) {
  exigir(ehAdmin(), "Somente o administrador cadastra colaboradores.");
  const perfil = limparPerfil({ ...dados, login: normalizarLogin(dados.login) });
  validarPerfil(perfil);
  exigir(String(senhaInicial || "").length >= 8, "A senha inicial precisa ter pelo menos 8 caracteres.");

  const existente = await bd().obter(`logins/${perfil.login}`);
  if (existente) throw new ErroSistema("email-em-uso", `O usuário "${perfil.login}" já existe. Escolha outro.`);

  // Se uma tentativa anterior criou o acesso mas falhou ao gravar o perfil, usa a próxima versão do e-mail interno.
  let versao = 1;
  let uid = null;
  while (!uid && versao <= 5) {
    try {
      uid = await sessao.autenticacao.criarConta(emailDoLogin(perfil.login, versao), senhaInicial);
    } catch (e) {
      if (e.codigo === "email-em-uso") versao++;
      else throw e;
    }
  }
  if (!uid) throw new ErroSistema("email-em-uso", "Não foi possível criar o acesso. Tente outro nome de usuário.");

  const email = emailDoLogin(perfil.login, versao);
  const completo = { ...perfil, uid, email, versao, ativo: true, primeiroAcesso: true };
  const lote = bd().lote();
  const auditId = auditar(lote, {
    colecao: "usuarios",
    docId: perfil.login,
    acao: "criar",
    resumo: `Cadastrou ${perfil.nome} (${perfil.login})`,
    depois: completo,
  });
  lote.definir(`usuarios/${perfil.login}`, { ...completo, ...carimboCriacao(), ...carimboAtualizacao(), _auditId: auditId });
  lote.definir(`uids/${uid}`, { login: perfil.login });
  lote.definir(`logins/${perfil.login}`, { email });
  lote.definir(`diretorio/${perfil.login}`, entradaDiretorio(completo));
  await lote.confirmar();
  limparCacheDiretorio();
  return completo;
}

export async function atualizar(login, dados) {
  exigir(ehAdmin(), "Somente o administrador altera colaboradores.");
  const antes = await bd().obter(`usuarios/${login}`);
  if (!antes) throw new ErroSistema("nao-encontrado");
  const perfil = limparPerfil({ ...antes, ...dados, login });
  validarPerfil(perfil);
  if (login === sessao.perfil?.login && antes.admin && !perfil.admin) {
    throw new ErroSistema("validacao", "Você não pode remover o seu próprio acesso de administrador.");
  }
  const lote = bd().lote();
  const auditId = auditar(lote, {
    colecao: "usuarios",
    docId: login,
    acao: "editar",
    resumo: `Alterou ${perfil.nome} (${login})`,
    antes,
    depois: perfil,
  });
  lote.atualizar(`usuarios/${login}`, { ...perfil, ...carimboAtualizacao(), _auditId: auditId });
  lote.definir(`diretorio/${login}`, entradaDiretorio({ ...antes, ...perfil }));
  await lote.confirmar();
  limparCacheDiretorio();
}

export async function alterarAtivo(login, ativo) {
  exigir(ehAdmin(), "Somente o administrador altera colaboradores.");
  if (login === sessao.perfil?.login) throw new ErroSistema("validacao", "Você não pode desativar o seu próprio acesso.");
  const antes = await bd().obter(`usuarios/${login}`);
  if (!antes) throw new ErroSistema("nao-encontrado");
  const lote = bd().lote();
  const auditId = auditar(lote, {
    colecao: "usuarios",
    docId: login,
    acao: ativo ? "reativar" : "desativar",
    resumo: `${ativo ? "Reativou" : "Desativou"} ${antes.nome} (${login})`,
    antes: { ativo: antes.ativo },
    depois: { ativo },
  });
  lote.atualizar(`usuarios/${login}`, { ativo, ...carimboAtualizacao(), _auditId: auditId });
  lote.definir(`diretorio/${login}`, entradaDiretorio({ ...antes, ativo }));
  await lote.confirmar();
  limparCacheDiretorio();
}

/**
 * Redefine a senha criando um novo acesso para o mesmo usuário (o anterior deixa de funcionar).
 * O nome de usuário e todo o histórico continuam iguais.
 */
export async function redefinirSenha(login, novaSenha) {
  exigir(ehAdmin(), "Somente o administrador redefine senhas.");
  exigir(String(novaSenha || "").length >= 8, "A nova senha precisa ter pelo menos 8 caracteres.");
  const antes = await bd().obter(`usuarios/${login}`);
  if (!antes) throw new ErroSistema("nao-encontrado");
  let versao = (antes.versao || 1) + 1;
  let uid = null;
  while (!uid && versao <= (antes.versao || 1) + 6) {
    try {
      uid = await sessao.autenticacao.criarConta(emailDoLogin(login, versao), novaSenha);
    } catch (e) {
      if (e.codigo === "email-em-uso") versao++;
      else throw e;
    }
  }
  if (!uid) throw new ErroSistema("desconhecido");
  const email = emailDoLogin(login, versao);
  const lote = bd().lote();
  const auditId = auditar(lote, {
    colecao: "usuarios",
    docId: login,
    acao: "redefinir-senha",
    resumo: `Redefiniu a senha de ${antes.nome} (${login})`,
    antes: { versao: antes.versao },
    depois: { versao },
  });
  if (antes.uid) lote.excluir(`uids/${antes.uid}`);
  lote.definir(`uids/${uid}`, { login });
  lote.atualizar(`usuarios/${login}`, {
    uid,
    email,
    versao,
    primeiroAcesso: true,
    ...carimboAtualizacao(),
    _auditId: auditId,
  });
  lote.definir(`logins/${login}`, { email });
  await lote.confirmar();
}

/** Troca de senha feita pelo próprio usuário (inclusive no primeiro acesso) */
export async function trocarMinhaSenha(senhaAtual, novaSenha) {
  exigir(String(novaSenha || "").length >= 8, "A nova senha precisa ter pelo menos 8 caracteres.");
  exigir(novaSenha !== senhaAtual, "A nova senha precisa ser diferente da atual.");
  await sessao.autenticacao.trocarSenha(senhaAtual, novaSenha);
  const login = sessao.perfil.login;
  const lote = bd().lote();
  lote.atualizar(`usuarios/${login}`, { primeiroAcesso: false, senhaAlteradaEm: bd().agora() });
  await lote.confirmar();
  sessao.perfil.primeiroAcesso = false;
}

export { entradaDiretorio };
