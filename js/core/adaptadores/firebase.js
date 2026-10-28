// Adaptador de produção: Firebase Authentication + Cloud Firestore (SDK modular oficial).
import { CONFIG } from "../../config.js";
import { ErroSistema, normalizarErro } from "../erros.js";

const BASE = `https://www.gstatic.com/firebasejs/${CONFIG.versaoFirebase}`;
const AGORA = Symbol("agora");

export async function criarAdaptadorFirebase(aoRecusarEscrita) {
  const [appM, fs, au] = await Promise.all([
    import(`${BASE}/firebase-app.js`),
    import(`${BASE}/firebase-firestore.js`),
    import(`${BASE}/firebase-auth.js`),
  ]);

  const app = appM.initializeApp(CONFIG.firebase);

  let db;
  try {
    db = fs.initializeFirestore(app, {
      ignoreUndefinedProperties: true,
      localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
    });
  } catch (e) {
    // Navegadores sem IndexedDB (ex.: janela anônima de alguns celulares): funciona sem cache offline.
    db = fs.initializeFirestore(app, { ignoreUndefinedProperties: true });
  }

  const auth = au.initializeAuth(app, {
    persistence: [au.indexedDBLocalPersistence, au.browserLocalPersistence],
  });

  // ---------- conversões ----------
  function deBanco(valor) {
    if (valor === null || valor === undefined) return valor;
    if (valor instanceof fs.Timestamp) return valor.toDate();
    if (Array.isArray(valor)) return valor.map(deBanco);
    if (typeof valor === "object" && valor.constructor === Object) {
      const saida = {};
      for (const [k, v] of Object.entries(valor)) saida[k] = deBanco(v);
      return saida;
    }
    return valor;
  }

  function paraBanco(valor) {
    if (valor === AGORA) return fs.serverTimestamp();
    if (valor === undefined) return undefined;
    if (valor === null || valor instanceof Date) return valor;
    if (Array.isArray(valor)) return valor.map(paraBanco);
    if (typeof valor === "object" && valor.constructor === Object) {
      const saida = {};
      for (const [k, v] of Object.entries(valor)) {
        const c = paraBanco(v);
        if (c !== undefined) saida[k] = c;
      }
      return saida;
    }
    return valor;
  }

  const ref = (caminho) => fs.doc(db, caminho);

  function montarConsulta(colecao, filtros = [], opcoes = {}) {
    const partes = filtros.map(([campo, op, valor]) => fs.where(campo, op, valor));
    if (opcoes.limite) partes.push(fs.limit(opcoes.limite));
    return fs.query(fs.collection(db, colecao), ...partes);
  }

  const snapParaObjeto = (snap) => ({ id: snap.id, ...deBanco(snap.data()) });

  async function proteger(promessa) {
    try {
      return await promessa;
    } catch (e) {
      throw normalizarErro(e);
    }
  }

  const banco = {
    modo: "firebase",
    agora: () => AGORA,

    async obter(caminho) {
      return proteger(
        fs.getDoc(ref(caminho)).then((s) => (s.exists() ? snapParaObjeto(s) : null))
      );
    },

    async consultar(colecao, filtros = [], opcoes = {}) {
      return proteger(fs.getDocs(montarConsulta(colecao, filtros, opcoes)).then((r) => r.docs.map(snapParaObjeto)));
    },

    async contar(colecao, filtros = []) {
      try {
        const r = await fs.getCountFromServer(montarConsulta(colecao, filtros));
        return r.data().count;
      } catch (e) {
        const erro = normalizarErro(e);
        if (erro.codigo === "sem-conexao") return (await banco.consultar(colecao, filtros)).length;
        throw erro;
      }
    },

    async somar(colecao, filtros, campos) {
      const especificacao = {};
      campos.forEach((c, i) => (especificacao[`c${i}`] = fs.sum(c)));
      try {
        const r = await fs.getAggregateFromServer(montarConsulta(colecao, filtros), especificacao);
        const dados = r.data();
        return Object.fromEntries(campos.map((c, i) => [c, Number(dados[`c${i}`]) || 0]));
      } catch (e) {
        const erro = normalizarErro(e);
        if (erro.codigo !== "sem-conexao") throw erro;
        const docs = await banco.consultar(colecao, filtros);
        return Object.fromEntries(
          campos.map((c) => [c, docs.reduce((s, d) => s + (Number(c.split(".").reduce((o, k) => o?.[k], d)) || 0), 0)])
        );
      }
    },

    novoId(colecao) {
      return fs.doc(fs.collection(db, colecao)).id;
    },

    lote() {
      const b = fs.writeBatch(db);
      let vazio = true;
      return {
        definir(caminho, dados) {
          b.set(ref(caminho), paraBanco(dados));
          vazio = false;
        },
        atualizar(caminho, dados) {
          b.update(ref(caminho), paraBanco(dados));
          vazio = false;
        },
        excluir(caminho) {
          b.delete(ref(caminho));
          vazio = false;
        },
        async confirmar() {
          if (vazio) return { pendente: false };
          const envio = b.commit();
          // Sem internet, o Firestore guarda a gravação no aparelho e envia depois.
          const espera = navigator.onLine ? 25000 : 1500;
          const resultado = await Promise.race([
            envio.then(() => ({ pendente: false })),
            new Promise((r) => setTimeout(() => r({ pendente: true }), espera)),
          ]).catch((e) => {
            throw normalizarErro(e);
          });
          if (resultado.pendente) {
            envio.catch((e) => aoRecusarEscrita?.(normalizarErro(e)));
          }
          return resultado;
        },
      };
    },

    async transacao(funcao) {
      return proteger(
        fs.runTransaction(db, async (t) =>
          funcao({
            obter: async (caminho) => {
              const s = await t.get(ref(caminho));
              return s.exists() ? snapParaObjeto(s) : null;
            },
            definir: (caminho, dados) => t.set(ref(caminho), paraBanco(dados)),
            atualizar: (caminho, dados) => t.update(ref(caminho), paraBanco(dados)),
          })
        )
      );
    },
  };

  // ---------- autenticação ----------
  let usuario = null;
  const ouvintes = new Set();
  let pronto;
  const inicial = new Promise((r) => (pronto = r));
  au.onAuthStateChanged(auth, (u) => {
    usuario = u ? { uid: u.uid, email: u.email } : null;
    pronto();
    ouvintes.forEach((cb) => cb(usuario));
  });

  const autenticacao = {
    async iniciar() {
      await inicial;
      return usuario;
    },
    atual: () => usuario,
    aoMudar(cb) {
      ouvintes.add(cb);
      return () => ouvintes.delete(cb);
    },
    async entrar(email, senha) {
      return proteger(au.signInWithEmailAndPassword(auth, email, senha).then((c) => ({ uid: c.user.uid, email: c.user.email })));
    },
    async sair() {
      return proteger(au.signOut(auth));
    },
    async trocarSenha(senhaAtual, novaSenha) {
      const u = auth.currentUser;
      if (!u) throw new ErroSistema("login-recente");
      await proteger(au.reauthenticateWithCredential(u, au.EmailAuthProvider.credential(u.email, senhaAtual)));
      await proteger(au.updatePassword(u, novaSenha));
    },
    /** Cria um acesso sem desconectar quem está logado (usa uma instância secundária e temporária). */
    async criarConta(email, senha) {
      const sec = appM.initializeApp(CONFIG.firebase, `secundario-${Date.now()}`);
      try {
        const secAuth = au.initializeAuth(sec, { persistence: au.inMemoryPersistence });
        const cred = await au.createUserWithEmailAndPassword(secAuth, email, senha);
        const uid = cred.user.uid;
        await au.signOut(secAuth);
        return uid;
      } catch (e) {
        throw normalizarErro(e);
      } finally {
        appM.deleteApp(sec).catch(() => {});
      }
    },
  };

  return { banco, autenticacao };
}
