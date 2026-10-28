// Ponto de entrada do IAÍ Gestão.
import { sessao, configurado } from "./core/sessao.js";
import { avisar } from "./core/ui.js";
import { html, montar } from "./core/dom.js";
import { icone } from "./core/icones.js";
import { mensagemDe } from "./core/erros.js";
import { carregarPerfil, diretorio } from "./services/usuarios.js";
import { obterPublico, carregarConfig, carregarUnidades, carregarSetores } from "./services/sistema.js";
import { ativarDicas } from "./core/graficos.js";

const raiz = document.getElementById("raiz");
let iniciandoSessao = null;

function telaErroFatal(e) {
  montar(
    raiz,
    html`<div class="tela-entrada"><div class="tela-entrada-form"><div class="cartao-entrada">
      <img class="logo-movel" src="assets/img/logo.png" alt="IAÍ Bora Treinar" style="display:block" />
      <h1>Não foi possível iniciar</h1>
      <p>${mensagemDe(e)}</p>
      <div class="aviso aviso-erro">${icone("alerta")}<div>Se o problema continuar, confira a configuração em <strong>js/config.js</strong> e as regras do Firestore (guia de publicação).</div></div>
      <p style="margin-top:20px"><button class="btn btn-primario" data-recarregar>Tentar novamente</button></p>
    </div></div></div>`
  );
  raiz.querySelector("[data-recarregar]")?.addEventListener("click", () => location.reload());
}

async function conectar() {
  if (configurado()) {
    const { criarAdaptadorFirebase } = await import("./core/adaptadores/firebase.js");
    const r = await criarAdaptadorFirebase((erro) => {
      avisar(`Uma alteração salva sem internet foi recusada pelo servidor: ${erro.message}`, "erro", 10000);
    });
    sessao.banco = r.banco;
    sessao.autenticacao = r.autenticacao;
    sessao.modoDemo = false;
  } else {
    const { criarAdaptadorLocal } = await import("./core/adaptadores/local.js");
    const r = criarAdaptadorLocal();
    sessao.banco = r.banco;
    sessao.autenticacao = r.autenticacao;
    sessao.modoDemo = true;
  }
}

async function carregarCadastros() {
  await Promise.all([carregarUnidades(), carregarSetores(), carregarConfig(), diretorio({ recarregar: true }).catch(() => [])]);
}

/** Decide qual tela mostrar conforme o estado do login */
async function aoMudarUsuario(usuario) {
  const atual = (iniciandoSessao = Symbol("sessao"));
  try {
    if (!usuario) {
      sessao.perfil = null;
      const publico = await obterPublico();
      if (atual !== iniciandoSessao) return;
      if (!publico?.inicializado) {
        if (sessao.modoDemo) {
          const { criarDemonstracao } = await import("./services/demo.js");
          montar(raiz, html`<div class="tela-entrada"><div class="tela-entrada-form"><div class="cartao-entrada">
            <h1>Preparando a demonstração…</h1><p>Criando unidades, colaboradores e registros de exemplo neste navegador.</p>
            <div class="carregando-pagina"><div class="esqueleto"></div><div class="esqueleto"></div></div></div></div></div>`);
          await criarDemonstracao();
          return aoMudarUsuario(null);
        }
        const { telaConfiguracaoInicial } = await import("./views/entrada.js");
        return telaConfiguracaoInicial(raiz, { aoConcluir: () => aoMudarUsuario(sessao.autenticacao.atual()) });
      }
      const { telaLogin } = await import("./views/entrada.js");
      return telaLogin(raiz, { publico });
    }

    const perfil = await carregarPerfil(usuario.uid);
    if (atual !== iniciandoSessao) return;
    const { telaBloqueada, telaPrimeiroAcesso } = await import("./views/entrada.js");
    if (!perfil) return telaBloqueada(raiz, "Este acesso não está vinculado a nenhum colaborador. Peça ao administrador para verificar o seu cadastro.");
    if (perfil.ativo === false) return telaBloqueada(raiz, "Seu acesso está desativado. Fale com o administrador.");
    sessao.perfil = perfil;
    if (perfil.primeiroAcesso) return telaPrimeiroAcesso(raiz, { aoConcluir: () => aoMudarUsuario(usuario) });

    await carregarCadastros();
    if (atual !== iniciandoSessao) return;
    const { iniciarAplicacao } = await import("./views/shell.js");
    iniciarAplicacao(raiz);
  } catch (e) {
    console.error(e);
    telaErroFatal(e);
  }
}

async function iniciar() {
  try {
    ativarDicas();
    await conectar();
    const usuario = await sessao.autenticacao.iniciar();
    await aoMudarUsuario(usuario);
    let ultimoUid = usuario?.uid || null;
    sessao.autenticacao.aoMudar((u) => {
      const uid = u?.uid || null;
      if (uid === ultimoUid) return;
      ultimoUid = uid;
      // Durante a configuração inicial o login acontece no meio do processo; a própria tela conclui o fluxo.
      if (sessao.emConfiguracao) return;
      aoMudarUsuario(u);
    });
  } catch (e) {
    console.error(e);
    telaErroFatal(e);
  }
}

window.addEventListener("online", () => avisar("Conexão restabelecida.", "ok"));
window.addEventListener("offline", () => avisar("Você está sem internet. O que for preenchido será enviado quando a conexão voltar.", "info", 7000));

iniciar();
