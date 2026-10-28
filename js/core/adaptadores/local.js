// Adaptador do MODO DEMONSTRAÇÃO: imita o Firestore e o login usando o armazenamento do navegador.
// Serve para conhecer e testar o sistema antes de configurar o Firebase. Não use com dados reais.
import { ErroSistema } from "../erros.js";

const CHAVE = "iai-gestao-demo-v1";
const CHAVE_SESSAO = "iai-gestao-demo-sessao";
const AGORA = Symbol("agora");

function carregar() {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return { docs: {}, contas: {} };
    return JSON.parse(bruto, (k, v) => (v && typeof v === "object" && v.__d ? new Date(v.__d) : v));
  } catch {
    return { docs: {}, contas: {} };
  }
}

let estado = carregar();
let salvarAgendado = false;

function salvar() {
  if (salvarAgendado) return;
  salvarAgendado = true;
  queueMicrotask(() => {
    salvarAgendado = false;
    try {
      localStorage.setItem(
        CHAVE,
        JSON.stringify(estado, function (k, v) {
          const original = this[k];
          return original instanceof Date ? { __d: original.toISOString() } : v;
        })
      );
    } catch (e) {
      console.warn("Modo demonstração: armazenamento cheio.", e);
    }
  });
}

const atraso = () => new Promise((r) => setTimeout(r, 40 + Math.random() * 60));

function clonar(v) {
  if (v instanceof Date) return new Date(v.getTime());
  if (Array.isArray(v)) return v.map(clonar);
  if (v && typeof v === "object") {
    const s = {};
    for (const [k, x] of Object.entries(v)) s[k] = clonar(x);
    return s;
  }
  return v;
}

function resolverValores(v, instante) {
  if (v === AGORA) return new Date(instante);
  if (v === undefined) return undefined;
  if (v instanceof Date) return new Date(v.getTime());
  if (Array.isArray(v)) return v.map((x) => resolverValores(x, instante));
  if (v && typeof v === "object") {
    const s = {};
    for (const [k, x] of Object.entries(v)) {
      const r = resolverValores(x, instante);
      if (r !== undefined) s[k] = r;
    }
    return s;
  }
  return v;
}

function pai(caminho) {
  const p = caminho.split("/");
  p.pop();
  return p.join("/");
}

function lerCampo(obj, campo) {
  return campo.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function comparar(a, b) {
  if (a instanceof Date) a = a.getTime();
  if (b instanceof Date) b = b.getTime();
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function atende(doc, [campo, op, valor]) {
  const v = lerCampo(doc, campo);
  switch (op) {
    case "==":
      return v !== undefined && comparar(v, valor) === 0;
    case "!=":
      return v !== undefined && comparar(v, valor) !== 0;
    case "<":
      return v !== undefined && comparar(v, valor) < 0;
    case "<=":
      return v !== undefined && comparar(v, valor) <= 0;
    case ">":
      return v !== undefined && comparar(v, valor) > 0;
    case ">=":
      return v !== undefined && comparar(v, valor) >= 0;
    case "in":
      return valor.some((x) => comparar(v, x) === 0);
    case "array-contains":
      return Array.isArray(v) && v.some((x) => comparar(x, valor) === 0);
    case "array-contains-any":
      return Array.isArray(v) && v.some((x) => valor.some((y) => comparar(x, y) === 0));
    default:
      throw new Error(`Operador não suportado: ${op}`);
  }
}

function aplicarAtualizacao(atual, dados) {
  const novo = clonar(atual);
  for (const [chave, valor] of Object.entries(dados)) {
    const partes = chave.split(".");
    let alvo = novo;
    for (let i = 0; i < partes.length - 1; i++) {
      if (typeof alvo[partes[i]] !== "object" || alvo[partes[i]] === null) alvo[partes[i]] = {};
      alvo = alvo[partes[i]];
    }
    if (valor === undefined) delete alvo[partes[partes.length - 1]];
    else alvo[partes[partes.length - 1]] = valor;
  }
  return novo;
}

export function criarAdaptadorLocal() {
  const banco = {
    modo: "demo",
    agora: () => AGORA,

    async obter(caminho) {
      await atraso();
      const d = estado.docs[caminho];
      return d ? { id: caminho.split("/").pop(), ...clonar(d) } : null;
    },

    async consultar(colecao, filtros = [], opcoes = {}) {
      await atraso();
      const saida = [];
      for (const [caminho, dados] of Object.entries(estado.docs)) {
        if (pai(caminho) !== colecao) continue;
        if (filtros.every((f) => atende(dados, f))) saida.push({ id: caminho.split("/").pop(), ...clonar(dados) });
      }
      saida.sort((a, b) => (a.id < b.id ? -1 : 1));
      return opcoes.limite ? saida.slice(0, opcoes.limite) : saida;
    },

    async contar(colecao, filtros = []) {
      return (await banco.consultar(colecao, filtros)).length;
    },

    async somar(colecao, filtros, campos) {
      const docs = await banco.consultar(colecao, filtros);
      return Object.fromEntries(campos.map((c) => [c, docs.reduce((s, d) => s + (Number(lerCampo(d, c)) || 0), 0)]));
    },

    novoId() {
      const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      let id = "";
      const bytes = crypto.getRandomValues(new Uint8Array(20));
      for (const b of bytes) id += letras[b % letras.length];
      return id;
    },

    lote() {
      const operacoes = [];
      return {
        definir: (caminho, dados) => operacoes.push({ tipo: "definir", caminho, dados }),
        atualizar: (caminho, dados) => operacoes.push({ tipo: "atualizar", caminho, dados }),
        excluir: (caminho) => operacoes.push({ tipo: "excluir", caminho }),
        async confirmar() {
          await atraso();
          const instante = Date.now();
          for (const op of operacoes) {
            if (op.tipo === "atualizar" && !estado.docs[op.caminho]) throw new ErroSistema("nao-encontrado");
          }
          for (const op of operacoes) {
            if (op.tipo === "definir") estado.docs[op.caminho] = resolverValores(op.dados, instante);
            else if (op.tipo === "atualizar")
              estado.docs[op.caminho] = aplicarAtualizacao(estado.docs[op.caminho], resolverValores(op.dados, instante));
            else delete estado.docs[op.caminho];
          }
          salvar();
          return { pendente: false };
        },
      };
    },

    async transacao(funcao) {
      await atraso();
      const l = banco.lote();
      const resultado = await funcao({
        obter: async (caminho) => {
          const d = estado.docs[caminho];
          return d ? { id: caminho.split("/").pop(), ...clonar(d) } : null;
        },
        definir: l.definir,
        atualizar: l.atualizar,
      });
      await l.confirmar();
      return resultado;
    },

    /** Somente no modo demonstração */
    _apagarTudo() {
      estado = { docs: {}, contas: {} };
      localStorage.removeItem(CHAVE);
      localStorage.removeItem(CHAVE_SESSAO);
    },
    _gravarDireto(caminho, dados) {
      estado.docs[caminho] = resolverValores(dados, Date.now());
      salvar();
    },
  };

  // ---------- autenticação simulada ----------
  async function hash(texto) {
    const dados = new TextEncoder().encode(`iai-demo:${texto}`);
    const h = await crypto.subtle.digest("SHA-256", dados);
    return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
  }

  let usuario = null;
  try {
    const uid = localStorage.getItem(CHAVE_SESSAO);
    if (uid) {
      const conta = Object.entries(estado.contas || {}).find(([, c]) => c.uid === uid);
      if (conta) usuario = { uid, email: conta[0] };
    }
  } catch {
    usuario = null;
  }
  const ouvintes = new Set();
  const avisar = () => ouvintes.forEach((cb) => cb(usuario));

  const autenticacao = {
    async iniciar() {
      return usuario;
    },
    atual: () => usuario,
    aoMudar(cb) {
      ouvintes.add(cb);
      return () => ouvintes.delete(cb);
    },
    async entrar(email, senha) {
      await atraso();
      const conta = estado.contas?.[email];
      if (!conta || conta.senha !== (await hash(senha))) throw new ErroSistema("credenciais");
      usuario = { uid: conta.uid, email };
      localStorage.setItem(CHAVE_SESSAO, conta.uid);
      avisar();
      return usuario;
    },
    async sair() {
      usuario = null;
      localStorage.removeItem(CHAVE_SESSAO);
      avisar();
    },
    async trocarSenha(senhaAtual, novaSenha) {
      await atraso();
      const conta = estado.contas?.[usuario?.email];
      if (!conta || conta.senha !== (await hash(senhaAtual))) throw new ErroSistema("credenciais", "A senha atual está incorreta.");
      if (String(novaSenha).length < 8) throw new ErroSistema("senha-fraca");
      conta.senha = await hash(novaSenha);
      salvar();
    },
    async criarConta(email, senha) {
      await atraso();
      estado.contas = estado.contas || {};
      if (estado.contas[email]) throw new ErroSistema("email-em-uso");
      if (String(senha).length < 6) throw new ErroSistema("senha-fraca");
      const uid = banco.novoId();
      estado.contas[email] = { uid, senha: await hash(senha) };
      salvar();
      return uid;
    },
  };

  return { banco, autenticacao };
}
