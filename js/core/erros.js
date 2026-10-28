// Erros padronizados do sistema, com mensagens em português claro.

export class ErroSistema extends Error {
  constructor(codigo, mensagem, original) {
    super(mensagem || MENSAGENS[codigo] || MENSAGENS.desconhecido);
    this.codigo = codigo;
    this.original = original;
  }
}

export const MENSAGENS = {
  permissao: "Você não tem permissão para esta ação. Se precisar, peça acesso ao administrador.",
  "nao-encontrado": "O registro não foi encontrado. Ele pode ter sido alterado por outra pessoa.",
  "ja-existe": "Este registro já foi enviado por outra pessoa ou em outro aparelho.",
  "sem-conexao": "Sem conexão com o servidor. Verifique a internet e tente de novo.",
  credenciais: "Usuário ou senha incorretos.",
  "email-em-uso": "Já existe um acesso com este usuário.",
  "senha-fraca": "A senha precisa ter pelo menos 8 caracteres.",
  "muitas-tentativas": "Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.",
  "login-recente": "Por segurança, saia e entre novamente antes de trocar a senha.",
  validacao: "Revise os campos destacados.",
  "fora-do-prazo": "O prazo para envio deste período já terminou.",
  configuracao: "O sistema ainda não foi configurado corretamente.",
  desconhecido: "Algo deu errado. Tente novamente; se continuar, avise o administrador.",
};

const MAPA_CODIGOS = {
  "permission-denied": "permissao",
  "not-found": "nao-encontrado",
  "already-exists": "ja-existe",
  unavailable: "sem-conexao",
  "deadline-exceeded": "sem-conexao",
  "auth/network-request-failed": "sem-conexao",
  "auth/invalid-credential": "credenciais",
  "auth/wrong-password": "credenciais",
  "auth/user-not-found": "credenciais",
  "auth/invalid-email": "credenciais",
  "auth/invalid-login-credentials": "credenciais",
  "auth/user-disabled": "credenciais",
  "auth/too-many-requests": "muitas-tentativas",
  "auth/email-already-in-use": "email-em-uso",
  "auth/weak-password": "senha-fraca",
  "auth/requires-recent-login": "login-recente",
  "auth/invalid-api-key": "configuracao",
  "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "configuracao",
  "auth/configuration-not-found": "configuracao",
  "auth/operation-not-allowed": "configuracao",
};

export function normalizarErro(e) {
  if (e instanceof ErroSistema) return e;
  // Mensagens de validação escritas pelo próprio sistema (new Error("...")) são mostradas como estão.
  // Erros internos do navegador (TypeError etc.) e do Firebase continuam com a mensagem padrão.
  if (e && e.constructor === Error && !e.code && typeof e.message === "string" && e.message) return new ErroSistema("validacao", e.message, e);
  const codigo = MAPA_CODIGOS[e?.code] || (e?.message?.includes("offline") ? "sem-conexao" : "desconhecido");
  const erro = new ErroSistema(codigo, undefined, e);
  if (codigo === "desconhecido" && e) console.error("[IAÍ Gestão]", e);
  return erro;
}

export function mensagemDe(e) {
  return normalizarErro(e).message;
}
