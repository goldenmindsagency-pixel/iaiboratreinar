// Configuração inicial, configurações gerais, unidades e setores personalizados.
import { sessao, ehAdmin } from "../core/sessao.js";
import { ErroSistema } from "../core/erros.js";
import { slug } from "../core/formato.js";
import { PRAZOS_PADRAO_DIAS, AMBIENTES_PADRAO } from "../core/constantes.js";
import { bd, auditar, carimboCriacao, carimboAtualizacao, gravarAuditado, exigir } from "./base.js";
import { normalizarLogin, loginValido, emailDoLogin, entradaDiretorio } from "./usuarios.js";

export const CONFIG_PADRAO = {
  nomeEmpresa: "IAÍ Bora Treinar",
  prazosDias: { ...PRAZOS_PADRAO_DIAS },
  responsaveisPadrao: {}, // { [unidadeId]: { [categoria]: login } }
  avisarDiasAntes: 1,
};

/** Documento público mínimo: indica se o sistema já foi inicializado */
export async function obterPublico() {
  try {
    return await bd().obter("config/publico");
  } catch (e) {
    if (e.codigo === "permissao") return null;
    throw e;
  }
}

/**
 * Configuração inicial (uma única vez): cria o primeiro administrador.
 * As regras do banco só permitem esta operação enquanto config/publico não existir.
 */
export async function inicializarSistema({ nomeEmpresa, nome, login: loginDigitado, senha }) {
  const login = normalizarLogin(loginDigitado);
  exigir(nome && nome.trim().length >= 3, "Informe o seu nome completo.");
  exigir(loginValido(login), "O usuário deve ter de 3 a 30 caracteres: letras, números, ponto, hífen ou sublinhado.");
  exigir(String(senha || "").length >= 8, "A senha precisa ter pelo menos 8 caracteres.");

  const email = emailDoLogin(login, 1);
  let uid;
  try {
    uid = await sessao.autenticacao.criarConta(email, senha);
  } catch (e) {
    if (e.codigo !== "email-em-uso") throw e;
  }
  const usuario = await sessao.autenticacao.entrar(email, senha);
  uid = usuario.uid;

  const perfil = {
    login,
    nome: nome.trim(),
    cargo: "Administrador geral",
    funcaoId: "administrador",
    admin: true,
    aprovador: true,
    verAuditoria: true,
    todasUnidades: true,
    unidades: [],
    permissoes: {},
    uid,
    email,
    versao: 1,
    ativo: true,
    primeiroAcesso: false,
  };

  // Durante a inicialização o perfil ainda não existe; a auditoria usa este autor.
  sessao.perfil = { login, nome: perfil.nome };
  const lote = bd().lote();
  const auditId = auditar(lote, {
    colecao: "usuarios",
    docId: login,
    acao: "inicializar",
    resumo: `Configuração inicial do sistema por ${perfil.nome}`,
    depois: perfil,
  });
  lote.definir("config/publico", {
    inicializado: true,
    adminLogin: login,
    nomeEmpresa: nomeEmpresa || CONFIG_PADRAO.nomeEmpresa,
    criadoEm: bd().agora(),
  });
  lote.definir(`usuarios/${login}`, { ...perfil, ...carimboCriacao(), ...carimboAtualizacao(), _auditId: auditId });
  lote.definir(`uids/${uid}`, { login });
  lote.definir(`logins/${login}`, { email });
  lote.definir(`diretorio/${login}`, entradaDiretorio(perfil));
  await lote.confirmar();
  sessao.perfil = perfil;
  return perfil;
}

// ---------------- Configurações gerais ----------------
export async function carregarConfig() {
  let c = null;
  try {
    c = await bd().obter("config/sistema");
  } catch {
    c = null;
  }
  sessao.config = { ...CONFIG_PADRAO, ...(c || {}), prazosDias: { ...PRAZOS_PADRAO_DIAS, ...(c?.prazosDias || {}) } };
  return sessao.config;
}

export async function salvarConfig(dados) {
  exigir(ehAdmin(), "Somente o administrador altera as configurações.");
  const antes = await bd().obter("config/sistema");
  const limpo = { ...dados };
  for (const k of ["id", "_auditId", "atualizadoEm", "atualizadoPor", "atualizadoPorNome", "criadoEm", "criadoPor", "criadoPorNome"]) delete limpo[k];
  await gravarAuditado({ colecao: "config", id: "sistema", dados: limpo, antes, resumo: "Alterou as configurações gerais" });
  return carregarConfig();
}

// ---------------- Unidades ----------------
export async function carregarUnidades() {
  const lista = await bd().consultar("unidades");
  sessao.unidades = lista.sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99) || (a.nome || "").localeCompare(b.nome || ""));
  return sessao.unidades;
}

export async function salvarUnidade(id, dados) {
  const limpo = {
    nome: (dados.nome || "").trim(),
    codigo: (dados.codigo || "").trim(),
    tipo: dados.tipo || "filial",
    cidade: (dados.cidade || "").trim(),
    endereco: (dados.endereco || "").trim(),
    ordem: Number(dados.ordem) || 99,
    ativo: dados.ativo !== false,
  };
  exigir(limpo.nome.length >= 2, "Informe o nome da unidade.");
  if (!id) {
    id = slug(limpo.nome) || bd().novoId("unidades");
    const existe = await bd().obter(`unidades/${id}`);
    if (existe) throw new ErroSistema("validacao", "Já existe uma unidade com este nome.");
    await gravarAuditado({ colecao: "unidades", id, dados: limpo, resumo: `Cadastrou a unidade ${limpo.nome}`, unidadeId: id });
  } else {
    const antes = await bd().obter(`unidades/${id}`);
    await gravarAuditado({ colecao: "unidades", id, dados: limpo, antes, resumo: `Alterou a unidade ${limpo.nome}`, unidadeId: id });
  }
  await carregarUnidades();
  return id;
}

// ---------------- Setores personalizados ----------------
export async function carregarSetores() {
  try {
    sessao.setores = await bd().consultar("setores");
  } catch {
    sessao.setores = [];
  }
  return sessao.setores;
}

const RESERVADOS = new Set([
  "limpeza", "equipamentos", "estrutura", "recepcao", "salao", "comercial", "marketing", "pendencias", "gestao",
  "relatorios", "unidades", "colaboradores", "configuracoes", "outros",
]);

export async function salvarSetor(id, dados) {
  exigir(ehAdmin(), "Somente o administrador cria setores.");
  const limpo = { nome: (dados.nome || "").trim(), descricao: (dados.descricao || "").trim(), ativo: dados.ativo !== false, tipo: "rotina" };
  exigir(limpo.nome.length >= 2, "Informe o nome do setor.");
  if (!id) {
    id = slug(limpo.nome).replace(/-/g, "_");
    exigir(id && !RESERVADOS.has(id), "Escolha outro nome para o setor.");
    const existe = await bd().obter(`setores/${id}`);
    exigir(!existe, "Já existe um setor com este nome.");
    await gravarAuditado({ colecao: "setores", id, dados: limpo, resumo: `Criou o setor ${limpo.nome}` });
  } else {
    const antes = await bd().obter(`setores/${id}`);
    await gravarAuditado({ colecao: "setores", id, dados: limpo, antes, resumo: `Alterou o setor ${limpo.nome}` });
  }
  await carregarSetores();
  return id;
}

/** Cria unidades e ambientes padrão logo após a configuração inicial */
export async function criarEstruturaInicial(unidades) {
  for (const [i, u] of unidades.entries()) {
    const id = await salvarUnidade(null, { ...u, ordem: i + 1 });
    const lote = bd().lote();
    for (const nome of AMBIENTES_PADRAO) {
      const amb = bd().novoId("ambientes");
      const dados = { nome, unidadeId: id, descricao: "", ativo: true, ...carimboCriacao(), ...carimboAtualizacao() };
      const auditId = auditar(lote, { colecao: "ambientes", docId: amb, acao: "criar", resumo: `Ambiente ${nome}`, depois: dados, unidadeId: id });
      lote.definir(`ambientes/${amb}`, { ...dados, _auditId: auditId });
    }
    await lote.confirmar();
  }
}
