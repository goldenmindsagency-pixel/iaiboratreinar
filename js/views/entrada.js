// Telas fora do painel: login, configuração inicial, primeiro acesso e acesso bloqueado.
import { html, montar, $, on, lerFormulario } from "../core/dom.js";
import { icone } from "../core/icones.js";
import { sessao } from "../core/sessao.js";
import { avisar, avisarErro, comCarregamento } from "../core/ui.js";
import { mensagemDe } from "../core/erros.js";
import { entrar, trocarMinhaSenha, normalizarLogin } from "../services/usuarios.js";

/**
 * Cada tela de entrada usa um elemento novo dentro da raiz: os eventos da tela anterior
 * são descartados junto com ele e não interferem nas telas seguintes (nem no painel).
 */
function novaTela(raiz) {
  const tela = document.createElement("div");
  raiz.replaceChildren(tela);
  return tela;
}

function moldura(conteudo, { arte = true } = {}) {
  return html`<div class="tela-entrada">
    ${arte
      ? html`<div class="tela-entrada-arte">
          <img src="assets/img/logo.png" alt="IAÍ Bora Treinar" />
          <div>
            <h2>Tudo que acontece na operação, organizado.</h2>
            <p>Rotinas, ocorrências e resultados das unidades em um só lugar, do celular da equipe ao relatório da diretoria.</p>
          </div>
          <div class="arco" aria-hidden="true"></div>
        </div>`
      : ""}
    <div class="tela-entrada-form">
      <div class="cartao-entrada">
        <img class="logo-movel" src="assets/img/logo.png" alt="IAÍ Bora Treinar" />
        ${conteudo}
      </div>
    </div>
  </div>`;
}

function campoSenha(nome, rotulo, { autocomplete = "current-password", ajuda } = {}) {
  return html`<div class="campo">
    <label for="${nome}">${rotulo}</label>
    <div style="position:relative">
      <input id="${nome}" name="${nome}" type="password" autocomplete="${autocomplete}" required minlength="${nome === "senha" ? 1 : 8}" style="padding-right:48px" />
      <button type="button" class="btn btn-fantasma btn-icone btn-sm" data-mostrar="${nome}" aria-label="Mostrar senha" style="position:absolute;right:4px;top:4px">${icone("olho")}</button>
    </div>
    ${ajuda ? html`<span class="ajuda">${ajuda}</span>` : ""}
  </div>`;
}

function ativarMostrarSenha(el) {
  on(el, "click", "[data-mostrar]", (ev, b) => {
    const input = el.querySelector(`#${b.dataset.mostrar}`);
    input.type = input.type === "password" ? "text" : "password";
    b.setAttribute("aria-label", input.type === "password" ? "Mostrar senha" : "Ocultar senha");
  });
}

// ======================= Login =======================
export async function telaLogin(raizPagina, { publico } = {}) {
  const raiz = novaTela(raizPagina);
  let demo = "";
  if (sessao.modoDemo) {
    const { USUARIOS_DEMO, SENHA_DEMO } = await import("../services/demo.js");
    demo = html`<div class="aviso aviso-marca" style="margin-top:24px">
      ${icone("info")}
      <div>
        <strong>Modo demonstração.</strong> Os dados ficam só neste navegador. Toque em um perfil para entrar (senha ${SENHA_DEMO}):
        <div class="linha" style="margin-top:10px;gap:6px">
          ${USUARIOS_DEMO.map((u) => html`<button type="button" class="chip" data-demo="${u.login}" style="cursor:pointer">${u.cargo.split(" (")[0]}</button>`)}
        </div>
      </div>
    </div>`;
  }
  montar(
    raiz,
    moldura(html`
      <h1>Entrar</h1>
      <p>${publico?.nomeEmpresa || "IAÍ Bora Treinar"} · acesso individual da equipe</p>
      <form class="pilha" id="form-login" novalidate>
        <div class="campo">
          <label for="usuario">Usuário</label>
          <input id="usuario" name="usuario" autocomplete="username" autocapitalize="none" spellcheck="false" required placeholder="ex.: maria.gandu" />
        </div>
        ${campoSenha("senha", "Senha")}
        <div class="aviso aviso-erro oculto" id="erro-login" role="alert"></div>
        <button class="btn btn-primario btn-bloco" type="submit">Entrar</button>
        <p class="pequeno texto-3 centro" style="margin:0">Esqueceu a senha? Peça ao administrador para redefinir.</p>
      </form>
      ${demo}
    `)
  );
  ativarMostrarSenha(raiz);
  const form = $("#form-login", raiz);
  const erro = $("#erro-login", raiz);
  setTimeout(() => $("#usuario", raiz)?.focus(), 50);

  async function enviar(usuario, senha) {
    erro.classList.add("oculto");
    const botao = $("button[type=submit]", form);
    await comCarregamento(botao, async () => {
      try {
        await entrar(usuario, senha);
      } catch (e) {
        erro.textContent = mensagemDe(e);
        erro.classList.remove("oculto");
      }
    });
  }

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const d = lerFormulario(form);
    enviar(d.usuario, d.senha);
  });
  on(raiz, "click", "[data-demo]", async (ev, b) => {
    const { SENHA_DEMO } = await import("../services/demo.js");
    $("#usuario", raiz).value = b.dataset.demo;
    $("#senha", raiz).value = SENHA_DEMO;
    enviar(b.dataset.demo, SENHA_DEMO);
  });
}

// ======================= Configuração inicial =======================
export function telaConfiguracaoInicial(raizPagina, { aoConcluir }) {
  const raiz = novaTela(raizPagina);
  const estado = {
    passo: 1,
    nomeEmpresa: "IAÍ Bora Treinar",
    nome: "",
    login: "",
    senha: "",
    unidades: [
      { nome: "Cruz", codigo: "01", tipo: "matriz", cidade: "" },
      { nome: "Gandu", codigo: "02", tipo: "filial", cidade: "" },
    ],
    modelos: true,
  };

  function render() {
    const passos = html`<div class="passos-setup" aria-hidden="true">${[1, 2, 3].map((n) => html`<span class="${n <= estado.passo ? "feito" : ""}"></span>`)}</div>`;
    let corpo;
    if (estado.passo === 1) {
      corpo = html`
        <h1>Configuração inicial</h1>
        <p>Crie o primeiro acesso de administrador. Depois você cadastra a equipe pelo próprio sistema.</p>
        ${passos}
        <form class="pilha" id="passo" novalidate>
          <div class="campo"><label for="nomeEmpresa">Nome da empresa</label><input id="nomeEmpresa" name="nomeEmpresa" value="${estado.nomeEmpresa}" required /></div>
          <div class="campo"><label for="nome" class="obrigatorio">Seu nome completo</label><input id="nome" name="nome" value="${estado.nome}" autocomplete="name" required /></div>
          <div class="campo"><label for="login" class="obrigatorio">Seu usuário de acesso</label><input id="login" name="login" value="${estado.login}" autocapitalize="none" spellcheck="false" placeholder="ex.: admin ou seu.nome" required />
            <span class="ajuda">Letras minúsculas, números e ponto. É com ele que você vai entrar.</span></div>
          ${campoSenha("senha", "Senha (mínimo 8 caracteres)", { autocomplete: "new-password" })}
          ${campoSenha("confirmar", "Confirme a senha", { autocomplete: "new-password" })}
          <div class="aviso aviso-erro oculto" id="erro" role="alert"></div>
          <button class="btn btn-primario btn-bloco" type="submit">Continuar</button>
        </form>`;
    } else if (estado.passo === 2) {
      corpo = html`
        <h1>Unidades</h1>
        <p>Confira as unidades. Novas unidades podem ser adicionadas a qualquer momento.</p>
        ${passos}
        <form class="pilha" id="passo" novalidate>
          ${estado.unidades.map(
            (u, i) => html`<div class="painel painel-compacto pilha-sm">
              <div class="linha-entre"><strong>Unidade ${u.codigo || i + 1}</strong>
                ${estado.unidades.length > 1 ? html`<button type="button" class="btn btn-fantasma btn-sm" data-remover="${i}">${icone("lixo")} Remover</button>` : ""}</div>
              <div class="grade-2">
                <div class="campo"><label>Nome</label><input name="nome-${i}" value="${u.nome}" required /></div>
                <div class="campo"><label>Código</label><input name="codigo-${i}" value="${u.codigo}" /></div>
                <div class="campo"><label>Tipo</label><select name="tipo-${i}"><option value="matriz" ${u.tipo === "matriz" ? "selected" : ""}>Matriz</option><option value="filial" ${u.tipo === "filial" ? "selected" : ""}>Filial</option></select></div>
                <div class="campo"><label>Cidade</label><input name="cidade-${i}" value="${u.cidade}" /></div>
              </div>
            </div>`
          )}
          <button type="button" class="btn btn-secundario" data-adicionar>${icone("mais")} Adicionar unidade</button>
          <div class="aviso aviso-erro oculto" id="erro" role="alert"></div>
          <div class="linha"><button type="button" class="btn btn-secundario" data-voltar>Voltar</button><button class="btn btn-primario expande" type="submit">Continuar</button></div>
        </form>`;
    } else {
      corpo = html`
        <h1>Rotinas iniciais</h1>
        <p>Podemos criar, em cada unidade, as rotinas sugeridas a partir do planejamento da IAÍ. Tudo pode ser ajustado depois.</p>
        ${passos}
        <form class="pilha" id="passo" novalidate>
          <label class="painel painel-compacto marcar" style="align-items:flex-start">
            <input type="checkbox" name="modelos" ${estado.modelos ? "checked" : ""} />
            <span><strong>Criar rotinas sugeridas (recomendado)</strong><br />
            <span class="pequeno texto-2">Checklist diário, planejamento semanal e fechamento mensal do gestor; coordenação do salão; turnos da recepção; relatório diário do comercial; e uma rotina de limpeza para ajustar ao cronograma.</span></span>
          </label>
          <div class="aviso aviso-erro oculto" id="erro" role="alert"></div>
          <div class="pequeno texto-2 oculto" id="progresso"></div>
          <div class="linha"><button type="button" class="btn btn-secundario" data-voltar>Voltar</button><button class="btn btn-primario expande" type="submit">Concluir configuração</button></div>
        </form>`;
    }
    montar(raiz, moldura(corpo));
    ativarMostrarSenha(raiz);
    const form = $("#passo", raiz);
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      avancar(form);
    });
    setTimeout(() => form.querySelector("input:not([type=checkbox])")?.focus(), 30);
  }

  function lerUnidades(form) {
    const d = lerFormulario(form);
    estado.unidades = estado.unidades.map((u, i) => ({ nome: d[`nome-${i}`], codigo: d[`codigo-${i}`], tipo: d[`tipo-${i}`], cidade: d[`cidade-${i}`] }));
  }

  function mostrarErro(texto) {
    const e = $("#erro", raiz);
    e.textContent = texto;
    e.classList.remove("oculto");
  }

  async function avancar(form) {
    const d = lerFormulario(form);
    if (estado.passo === 1) {
      const login = normalizarLogin(d.login);
      if (!d.nome || d.nome.length < 3) return mostrarErro("Informe o seu nome completo.");
      if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(login)) return mostrarErro("O usuário deve ter de 3 a 30 caracteres: letras minúsculas, números, ponto ou hífen.");
      if ((d.senha || "").length < 8) return mostrarErro("A senha precisa ter pelo menos 8 caracteres.");
      if (d.senha !== d.confirmar) return mostrarErro("As senhas não conferem.");
      Object.assign(estado, { nomeEmpresa: d.nomeEmpresa, nome: d.nome, login, senha: d.senha, passo: 2 });
      return render();
    }
    if (estado.passo === 2) {
      lerUnidades(form);
      if (estado.unidades.some((u) => !u.nome || u.nome.length < 2)) return mostrarErro("Informe o nome de todas as unidades.");
      estado.passo = 3;
      return render();
    }
    estado.modelos = Boolean(d.modelos);
    const botao = $("button[type=submit]", form);
    const progresso = $("#progresso", raiz);
    progresso.classList.remove("oculto");
    sessao.emConfiguracao = true;
    await comCarregamento(botao, async () => {
      try {
        const { inicializarSistema, criarEstruturaInicial, carregarUnidades, carregarConfig, salvarConfig, CONFIG_PADRAO } = await import("../services/sistema.js");
        // Cada etapa é marcada como feita para que um "tentar de novo" continue de onde parou.
        if (!estado.feito_admin) {
          progresso.textContent = "Criando o acesso de administrador…";
          await inicializarSistema({ nomeEmpresa: estado.nomeEmpresa, nome: estado.nome, login: estado.login, senha: estado.senha });
          estado.feito_admin = true;
        }
        if (!estado.feito_unidades) {
          progresso.textContent = "Cadastrando unidades e ambientes…";
          await criarEstruturaInicial(estado.unidades);
          estado.feito_unidades = true;
        }
        await salvarConfig({ ...CONFIG_PADRAO, nomeEmpresa: estado.nomeEmpresa });
        await carregarConfig();
        const unidades = await carregarUnidades();
        if (estado.modelos && !estado.feito_modelos) {
          const { criarModelosIniciais } = await import("../services/modelos-iniciais.js");
          await criarModelosIniciais(unidades.map((u) => u.id), (n) => (progresso.textContent = `Criando rotinas sugeridas… (${n})`));
          estado.feito_modelos = true;
        }
        avisar("Configuração concluída. Bem-vindo ao IAÍ Gestão!");
        sessao.emConfiguracao = false;
        aoConcluir();
      } catch (e) {
        progresso.classList.add("oculto");
        mostrarErro(mensagemDe(e));
      } finally {
        sessao.emConfiguracao = false;
      }
    });
  }

  on(raiz, "click", "[data-voltar]", () => {
    if (estado.passo === 2) lerUnidades($("#passo", raiz));
    estado.passo--;
    render();
  });
  on(raiz, "click", "[data-adicionar]", () => {
    lerUnidades($("#passo", raiz));
    estado.unidades.push({ nome: "", codigo: String(estado.unidades.length + 1).padStart(2, "0"), tipo: "filial", cidade: "" });
    render();
  });
  on(raiz, "click", "[data-remover]", (ev, b) => {
    lerUnidades($("#passo", raiz));
    estado.unidades.splice(Number(b.dataset.remover), 1);
    render();
  });
  render();
}

// ======================= Primeiro acesso =======================
export function telaPrimeiroAcesso(raizPagina, { aoConcluir }) {
  const raiz = novaTela(raizPagina);
  montar(
    raiz,
    moldura(html`
      <h1>Crie sua senha</h1>
      <p>Olá, ${sessao.perfil?.nome?.split(" ")[0] || ""}! No primeiro acesso, troque a senha temporária por uma só sua.</p>
      <form class="pilha" id="form-senha" novalidate>
        ${campoSenha("atual", "Senha temporária")}
        ${campoSenha("nova", "Nova senha", { autocomplete: "new-password", ajuda: "Mínimo de 8 caracteres. Evite datas de nascimento." })}
        ${campoSenha("confirmar", "Confirme a nova senha", { autocomplete: "new-password" })}
        <div class="aviso aviso-erro oculto" id="erro" role="alert"></div>
        <button class="btn btn-primario btn-bloco" type="submit">Salvar e entrar</button>
        <button class="btn btn-fantasma btn-bloco" type="button" data-sair>Sair</button>
      </form>`)
  );
  ativarMostrarSenha(raiz);
  const form = $("#form-senha", raiz);
  const erro = $("#erro", raiz);
  on(raiz, "click", "[data-sair]", () => sessao.autenticacao.sair());
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const d = lerFormulario(form);
    erro.classList.add("oculto");
    if (d.nova !== d.confirmar) {
      erro.textContent = "As senhas não conferem.";
      return erro.classList.remove("oculto");
    }
    await comCarregamento($("button[type=submit]", form), async () => {
      try {
        await trocarMinhaSenha(d.atual, d.nova);
        avisar("Senha criada com sucesso.");
        aoConcluir();
      } catch (e) {
        erro.textContent = mensagemDe(e);
        erro.classList.remove("oculto");
      }
    });
  });
}

// ======================= Acesso bloqueado =======================
export function telaBloqueada(raizPagina, mensagem) {
  const raiz = novaTela(raizPagina);
  montar(
    raiz,
    moldura(html`
      <h1>Acesso indisponível</h1>
      <div class="aviso aviso-erro" style="margin:16px 0">${icone("cadeado")}<div>${mensagem}</div></div>
      <button class="btn btn-secundario btn-bloco" data-sair>Sair</button>`)
  );
  on(raiz, "click", "[data-sair]", () => sessao.autenticacao.sair().catch(avisarErro));
}
