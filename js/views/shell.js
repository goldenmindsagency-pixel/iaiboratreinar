// Estrutura do painel: menu lateral, topo, alertas e troca de telas.
import { html, raw, montar, $, on, opcoes } from "../core/dom.js";
import { icone } from "../core/icones.js";
import {
  sessao, pode, ehAdmin, todosModulos, minhasUnidades, definirUnidadeSelecionada, verAuditoria, modulosRotina,
} from "../core/sessao.js";
import { registrar, resolver, lerHash, iniciarRotas, navegar, atualizarBusca } from "../core/rotas.js";
import { carregandoPagina, estadoErro, semPermissao, avisarErro, avatar } from "../core/ui.js";
import { carregarAlertas, limparCacheAlertas } from "../services/alertas.js";

const temRotina = () => modulosRotina().some((m) => pode(m.id, 1));

// ---------------- Rotas ----------------
function registrarRotas() {
  registrar("/", { titulo: "Visão geral", carregar: () => import("./inicio.js"), permitido: () => true });
  registrar("/tarefas", { titulo: "Minhas tarefas", carregar: () => import("./tarefas.js"), permitido: temRotina });
  registrar("/rotina/:id", { titulo: "Preencher rotina", carregar: () => import("./executar.js"), permitido: temRotina });
  registrar("/setor/:setor", { titulo: "Setor", carregar: () => import("./setor.js"), permitido: (p) => pode(p.setor, 1) });
  registrar("/rotinas/editar/:id", { titulo: "Editar rotina", carregar: () => import("./editor-rotina.js"), permitido: () => modulosRotina().some((m) => pode(m.id, 3)) });
  registrar("/ocorrencias", { titulo: "Ocorrências", carregar: () => import("./ocorrencias.js"), permitido: () => pode("pendencias", 1) });
  registrar("/ocorrencias/:id", { titulo: "Ocorrência", carregar: () => import("./ocorrencia-detalhe.js"), permitido: () => true });
  registrar("/equipamentos", { titulo: "Equipamentos", carregar: () => import("./equipamentos.js"), permitido: () => pode("equipamentos", 1) });
  registrar("/equipamentos/:id", { titulo: "Equipamento", carregar: () => import("./equipamento-detalhe.js"), permitido: () => pode("equipamentos", 1) });
  registrar("/estrutura", { titulo: "Estrutura física", carregar: () => import("./estrutura.js"), permitido: () => pode("estrutura", 1) });
  registrar("/estrutura/:id", { titulo: "Ambiente", carregar: () => import("./ambiente-detalhe.js"), permitido: () => pode("estrutura", 1) });
  registrar("/marketing", { titulo: "Marketing", carregar: () => import("./marketing.js"), permitido: () => pode("marketing", 1) });
  registrar("/gestao", { titulo: "Gestão gerencial", carregar: () => import("./gestao.js"), permitido: () => pode("gestao", 1) || sessao.perfil?.aprovador });
  registrar("/relatorios", { titulo: "Relatórios", carregar: () => import("./relatorios.js"), permitido: () => pode("relatorios", 2) });
  registrar("/colaboradores", { titulo: "Colaboradores", carregar: () => import("./colaboradores.js"), permitido: () => pode("colaboradores", 2) });
  registrar("/unidades", { titulo: "Unidades", carregar: () => import("./unidades.js"), permitido: () => pode("unidades", 2) });
  registrar("/configuracoes", { titulo: "Configurações", carregar: () => import("./configuracoes.js"), permitido: () => ehAdmin() || verAuditoria() });
  registrar("/perfil", { titulo: "Meu perfil", carregar: () => import("./perfil.js"), permitido: () => true });
}

// ---------------- Menu ----------------
function itensMenu() {
  const grupos = [];
  const add = (grupo, item) => {
    let g = grupos.find((x) => x.nome === grupo);
    if (!g) grupos.push((g = { nome: grupo, itens: [] }));
    g.itens.push(item);
  };
  add("Painel", { href: "#/", rotulo: "Visão geral", icone: "painel", base: "/" });
  if (temRotina()) add("Painel", { href: "#/tarefas", rotulo: "Minhas tarefas", icone: "rotina", base: "/tarefas", id: "tarefas" });

  for (const m of todosModulos()) {
    if (["colaboradores", "unidades", "relatorios"].includes(m.id)) continue;
    if (m.id === "gestao") {
      if (pode("gestao", 1) || sessao.perfil?.aprovador) add("Gestão", { href: "#/gestao", rotulo: m.nome, icone: m.icone, base: "/gestao" });
      continue;
    }
    if (!pode(m.id, 1)) continue;
    const href = m.tipo === "rotina" ? `#/setor/${m.id}` : m.id === "pendencias" ? "#/ocorrencias" : `#/${m.id}`;
    add(m.grupo, { href, rotulo: m.nome, icone: m.icone, base: href.slice(1) });
  }
  if (pode("relatorios", 2)) add("Gestão", { href: "#/relatorios", rotulo: "Relatórios", icone: "relatorio", base: "/relatorios" });
  if (pode("unidades", 2)) add("Administração", { href: "#/unidades", rotulo: "Unidades", icone: "predio", base: "/unidades" });
  if (pode("colaboradores", 2)) add("Administração", { href: "#/colaboradores", rotulo: "Colaboradores", icone: "usuarios", base: "/colaboradores" });
  if (ehAdmin() || verAuditoria()) add("Administração", { href: "#/configuracoes", rotulo: ehAdmin() ? "Configurações" : "Histórico de alterações", icone: "config", base: "/configuracoes" });
  const ordem = ["Painel", "Operação", "Resultados", "Gestão", "Outros setores", "Administração"];
  return grupos.sort((a, b) => ordem.indexOf(a.nome) - ordem.indexOf(b.nome));
}

function menuHTML() {
  const p = sessao.perfil;
  return html`
    <div class="menu-marca">
      <img src="assets/img/logo-marca.png" alt="" />
      <div class="menu-marca-nome">IAÍ Gestão<small>${sessao.config?.nomeEmpresa || "IAÍ Bora Treinar"}</small></div>
    </div>
    <nav class="menu-nav" aria-label="Menu principal">
      ${itensMenu().map(
        (g) => html`<div class="menu-grupo">
          <div class="menu-grupo-titulo">${g.nome}</div>
          ${g.itens.map((i) => html`<a class="menu-item" href="${i.href}" data-base="${i.base}">${icone(i.icone)}<span>${i.rotulo}</span>${i.id ? html`<span class="menu-contador oculto" data-contador="${i.id}"></span>` : ""}</a>`)}
        </div>`
      )}
    </nav>
    <div class="menu-rodape">
      <a class="menu-item" href="#/perfil" data-base="/perfil">${avatar(p?.nome)}<span class="expande"><span class="forte" style="display:block;color:var(--texto);line-height:1.2">${p?.nome}</span><span class="minusculo texto-3">${p?.cargo || ""}</span></span></a>
      <button class="menu-item btn-bloco" data-sair style="border:0;background:none;width:100%;cursor:pointer">${icone("sair")}<span>Sair</span></button>
    </div>`;
}

function seletorUnidadeTopo() {
  const lista = minhasUnidades();
  if (lista.length <= 1) return lista[0] ? html`<span class="chip">${icone("predio")} ${lista[0].nome}</span>` : "";
  return html`<label class="sr-only" for="unidade-global">Unidade</label>
    <select id="unidade-global" class="entrada" autocomplete="off" style="min-height:38px;padding:6px 32px 6px 12px;width:auto;background-color:var(--superficie-2)">
      <option value="todas">Todas as unidades</option>
      ${opcoes(lista.map((u) => ({ valor: u.id, rotulo: u.nome })), sessao.unidadeSelecionada)}
    </select>`;
}

function navInferiorHTML() {
  const itens = [{ href: "#/", rotulo: "Início", icone: "painel", base: "/" }];
  if (temRotina()) itens.push({ href: "#/tarefas", rotulo: "Tarefas", icone: "rotina", base: "/tarefas" });
  if (pode("pendencias", 1)) itens.push({ href: "#/ocorrencias?nova=1", rotulo: "Registrar", icone: "mais", base: "/ocorrencias" });
  return html`${itens.map((i) => html`<a href="${i.href}" data-base="${i.base}">${icone(i.icone)}${i.rotulo}</a>`)}
    <button type="button" data-abrir-alertas>${icone("sino")}Alertas</button>
    <button type="button" data-abrir-menu>${icone("menu")}Menu</button>`;
}

// ---------------- Aplicação ----------------
let conteudo;
let limpezaTelaAtual = null;
let renderizacao = 0;
let iniciadoUmaVez = false;

export function iniciarAplicacao(raizPagina) {
  const raiz = document.createElement("div");
  raizPagina.replaceChildren(raiz);
  // Rotas, ouvintes globais e o temporizador dos alertas são criados uma única vez por carregamento da página.
  const primeiraVez = !iniciadoUmaVez;
  iniciadoUmaVez = true;
  if (primeiraVez) registrarRotas();
  // Unidade selecionada que não pertence mais ao usuário volta para "todas"
  if (sessao.unidadeSelecionada !== "todas" && !minhasUnidades().some((u) => u.id === sessao.unidadeSelecionada)) definirUnidadeSelecionada("todas");

  montar(
    raiz,
    html`<div class="app" id="app">
      <aside class="menu" id="menu">${menuHTML()}</aside>
      <div class="cortina" data-fechar-menu></div>
      <div class="principal">
        ${sessao.modoDemo
          ? html`<div class="faixa-demo">${icone("info")}<span><strong>Modo demonstração</strong><span class="faixa-demo-detalhe"> — dados fictícios guardados só neste navegador. Para usar com dados reais, preencha <strong>js/config.js</strong>.</span></span></div>`
          : ""}
        <header class="topo">
          <button class="btn btn-fantasma btn-icone botao-menu-movel" data-abrir-menu aria-label="Abrir menu">${icone("menu")}</button>
          <span class="topo-titulo" id="topo-titulo"></span>
          <div class="topo-acoes">
            ${seletorUnidadeTopo()}
            <div class="suspenso" id="area-alertas">
              <button class="btn btn-fantasma btn-icone" data-abrir-alertas aria-label="Alertas" aria-haspopup="true" style="position:relative">${icone("sino")}<span class="ponto-notificacao oculto" id="contador-alertas"></span></button>
              <div class="suspenso-painel oculto" id="painel-alertas" role="dialog" aria-label="Alertas"></div>
            </div>
          </div>
        </header>
        <main class="conteudo" id="conteudo" tabindex="-1"></main>
      </div>
      <nav class="nav-inferior" aria-label="Atalhos">${navInferiorHTML()}</nav>
    </div>`
  );
  conteudo = $("#conteudo", raiz);
  const app = $("#app", raiz);

  on(app, "click", "[data-abrir-menu]", () => app.classList.add("menu-aberto"));
  on(app, "click", "[data-fechar-menu]", () => app.classList.remove("menu-aberto"));
  on(app, "click", ".menu-item", () => app.classList.remove("menu-aberto"));
  // Ao sair, a página é recarregada: nada da sessão anterior (dados em memória, filtros, caches) fica para o próximo usuário.
  on(app, "click", "[data-sair]", () =>
    sessao.autenticacao
      .sair()
      .then(() => location.replace(location.pathname))
      .catch(avisarErro)
  );
  on(app, "click", "[data-abrir-alertas]", (ev) => {
    ev.stopPropagation();
    alternarAlertas();
  });
  if (primeiraVez) {
    document.addEventListener("click", (ev) => {
      const painel = $("#painel-alertas");
      if (painel && !painel.classList.contains("oculto") && !ev.target.closest("#area-alertas")) painel.classList.add("oculto");
    });
  }
  $("#unidade-global", raiz)?.addEventListener("change", (ev) => {
    definirUnidadeSelecionada(ev.target.value);
    // Uma unidade fixada no endereço (ex.: link de um alerta) daria lugar à escolhida no topo.
    if (lerHash().busca.unidade) atualizarBusca({ unidade: "" });
    limparCacheAlertas();
    renderizarRota();
    atualizarAlertas();
  });

  if (primeiraVez) {
    iniciarRotas(renderizarRota);
    setInterval(() => atualizarAlertas(true), 5 * 60 * 1000);
  }
  limparCacheAlertas();
  renderizarRota();
}

async function atualizarAlertas(forcar = false) {
  try {
    const lista = await carregarAlertas({ forcar });
    const c = $("#contador-alertas");
    if (!c) return;
    const relevantes = lista.filter((a) => a.tipo !== "info").length;
    c.textContent = relevantes > 9 ? "9+" : String(relevantes);
    c.classList.toggle("oculto", relevantes === 0);
    const pendentes = lista.tarefasPendentes ?? lista.filter((a) => a.link?.startsWith("#/rotina/")).length;
    const ct = document.querySelector('[data-contador="tarefas"]');
    if (ct) {
      ct.textContent = pendentes > 99 ? "99+" : String(pendentes);
      ct.classList.toggle("oculto", !pendentes);
    }
    const painel = $("#painel-alertas");
    if (painel && !painel.classList.contains("oculto")) desenharAlertas(painel, lista);
  } catch {
    /* alertas são complementares; falhas não interrompem o uso */
  }
}

function desenharAlertas(painel, lista) {
  const cor = { critico: "var(--critico)", pendente: "var(--pendente)", info: "var(--ambar)" };
  montar(
    painel,
    lista.length
      ? html`<div class="lista lista-alertas">
          ${lista.map(
            (a) => html`<a class="lista-item clicavel" href="${a.link || "#/"}" style="text-decoration:none;color:inherit;margin:0">
              <span style="color:${cor[a.tipo]}">${icone(a.tipo === "info" ? "info" : "alerta")}</span>
              <span class="expande"><span class="lista-item-titulo" style="display:block">${a.titulo}</span><span class="lista-item-sub">${a.texto}</span></span>
            </a>`
          )}
        </div>`
      : html`<div class="vazio" style="padding:28px 12px">${icone("okCirculo")}<h3>Tudo em dia</h3><p>Nenhum alerta para você agora.</p></div>`
  );
}

async function alternarAlertas() {
  const painel = $("#painel-alertas");
  if (!painel) return;
  if (!painel.classList.contains("oculto")) return painel.classList.add("oculto");
  painel.classList.remove("oculto");
  montar(painel, html`<div class="carregando-pagina" style="padding:8px"><div class="esqueleto" style="width:100%"></div><div class="esqueleto" style="height:60px"></div></div>`);
  try {
    desenharAlertas(painel, await carregarAlertas());
  } catch (e) {
    montar(painel, estadoErro(e, { tentarNovamente: false }));
  }
}

function marcarMenu(caminho) {
  document.querySelectorAll("[data-base]").forEach((a) => {
    const base = a.dataset.base.split("?")[0];
    const ativo = base === "/" ? caminho === "/" : caminho === base || caminho.startsWith(`${base}/`);
    a.classList.toggle("ativo", ativo);
    if (ativo) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

export async function renderizarRota() {
  const numero = ++renderizacao;
  // Mantém o sino e o contador de "Minhas tarefas" em dia a cada troca de tela (usa cache de 2 minutos).
  atualizarAlertas();
  const { caminho, busca } = lerHash();
  const r = resolver(caminho);
  if (typeof limpezaTelaAtual === "function") {
    try {
      limpezaTelaAtual();
    } catch {
      /* ignore */
    }
  }
  limpezaTelaAtual = null;
  marcarMenu(caminho);
  const titulo = $("#topo-titulo");
  if (!r) {
    montar(conteudo, html`<div class="vazio">${icone("busca")}<h3>Página não encontrada</h3><p>O endereço acessado não existe.</p><a class="btn btn-primario" href="#/">Ir para a visão geral</a></div>`);
    return;
  }
  if (titulo) titulo.textContent = r.rota.titulo;
  if (!r.rota.permitido(r.params)) {
    montar(conteudo, semPermissao());
    return;
  }
  // Cada tela recebe um elemento novo: os eventos da tela anterior são descartados junto com ele.
  const tela = document.createElement("div");
  conteudo.replaceChildren(tela);
  montar(tela, carregandoPagina());
  window.scrollTo({ top: 0 });
  try {
    const modulo = await r.rota.carregar();
    if (numero !== renderizacao) return;
    const ctx = {
      params: r.params,
      busca,
      recarregar: () => renderizarRota(),
      definirTitulo: (t) => titulo && (titulo.textContent = t),
      ativo: () => numero === renderizacao,
    };
    limpezaTelaAtual = await modulo.default(tela, ctx);
  } catch (e) {
    if (numero !== renderizacao) return;
    console.error(e);
    montar(tela, estadoErro(e));
    on(tela, "click", "[data-acao=recarregar]", () => renderizarRota());
  }
}

export function irPara(destino) {
  navegar(destino);
}

export { raw };
