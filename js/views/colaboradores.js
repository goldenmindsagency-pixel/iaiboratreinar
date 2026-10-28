// Colaboradores: cadastro, função, unidades, permissões por módulo, senha e desativação.
import { html, raw, montar, $, $$, on, opcoes, lerFormulario } from "../core/dom.js";
import { icone } from "../core/icones.js";
import { sessao, ehAdmin, todosModulos, nomeUnidade, minhasUnidades } from "../core/sessao.js";
import { abrirModal, avisar, avisarErro, comCarregamento, confirmar, estadoVazio, avatar } from "../core/ui.js";
import { NIVEIS, FUNCOES_PADRAO } from "../core/constantes.js";
import { normalizarTexto } from "../core/formato.js";
import { formatarDataHora } from "../core/tempo.js";
import { mensagemDe } from "../core/erros.js";
import { atualizarBusca } from "../core/rotas.js";
import { listar, criar, atualizar, alterarAtivo, redefinirSenha, normalizarLogin } from "../services/usuarios.js";
import { cabecalho } from "./comum.js";

export function funcoesDisponiveis() {
  return [...FUNCOES_PADRAO, ...((sessao.config?.funcoes || []).map((f) => ({ ...f, personalizada: true })))];
}

export function gerarSenha() {
  const letras = "abcdefghjkmnpqrstuvwxyz";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const n = 1000 + (bytes[0] * 256 + bytes[1]) % 9000;
  return `Iai-${n}-${letras[bytes[2] % letras.length]}${letras[bytes[3] % letras.length]}${letras[bytes[4] % letras.length]}`;
}

function resumoAcessos(p) {
  if (p.admin) return "Acesso total";
  const mods = todosModulos().filter((m) => (p.permissoes?.[m.id] || 0) > 0);
  if (!mods.length) return "Sem módulos";
  return mods.map((m) => `${m.nome} (${NIVEIS[p.permissoes[m.id]]?.curto})`).join(", ");
}

export function mostrarCredenciais({ nome, login, senha, titulo = "Acesso criado" }) {
  abrirModal({
    titulo,
    corpo: html`<div class="pilha">
      <p class="texto-2">Entregue estes dados a <strong>${nome}</strong>. No primeiro acesso, o sistema pede para trocar a senha.</p>
      <div class="painel painel-compacto"><dl class="chave-valor" style="font-size:var(--t-md)">
        <dt>Endereço</dt><dd class="quebra">${location.origin}${location.pathname}</dd>
        <dt>Usuário</dt><dd><strong>${login}</strong></dd>
        <dt>Senha temporária</dt><dd><strong class="numero" style="font-size:1.2rem;letter-spacing:.02em">${senha}</strong></dd>
      </dl></div>
      <div class="aviso aviso-marca">${icone("cadeado")}<div>Esta senha não fica salva em lugar nenhum e não será mostrada de novo. Se perder, é só redefinir.</div></div>
    </div>`,
    rodape: html`<button class="btn btn-secundario" data-copiar>${icone("copiar")} Copiar</button><button class="btn btn-primario" data-fechar>Pronto</button>`,
    aoMontar: (el) =>
      on(el, "click", "[data-copiar]", async () => {
        const texto = `Acesso ao IAÍ Gestão\nEndereço: ${location.origin}${location.pathname}\nUsuário: ${login}\nSenha temporária: ${senha}`;
        try {
          await navigator.clipboard.writeText(texto);
          avisar("Copiado. Envie para o colaborador por mensagem.");
        } catch {
          avisar("Não foi possível copiar automaticamente. Anote os dados.", "info");
        }
      }),
  });
}

function matrizPermissoes(permissoes = {}, desabilitado = false) {
  const grupos = {};
  todosModulos().forEach((m) => (grupos[m.grupo] = grupos[m.grupo] || []).push(m));
  return html`<table class="matriz-permissoes">
    <thead><tr><th>Módulo</th><th>Acesso</th></tr></thead>
    <tbody>${Object.entries(grupos).map(
      ([g, mods]) => html`<tr><th colspan="2" style="padding-top:16px;color:var(--ambar)">${g}</th></tr>
        ${mods.map(
          (m) => html`<tr><td>${m.nome}</td><td style="width:60%"><select class="entrada" data-permissao="${m.id}" ${raw(desabilitado ? "disabled" : "")}>${opcoes(
            NIVEIS.filter((n) => m.niveis.includes(n.valor)).map((n) => ({ valor: n.valor, rotulo: n.rotulo })),
            permissoes[m.id] || 0
          )}</select></td></tr>`
        )}`
    )}</tbody>
  </table>`;
}

export function abrirFormularioColaborador(pessoa, aoSalvar) {
  const novo = !pessoa;
  const unidades = sessao.unidades.filter((u) => u.ativo !== false);
  const funcoes = funcoesDisponiveis();
  const d = pessoa || { funcaoId: "", unidades: unidades.length === 1 ? [unidades[0].id] : [], permissoes: {}, ativo: true };
  const senhaInicial = gerarSenha();
  const modal = abrirModal({
    titulo: novo ? "Novo colaborador" : `Editar ${pessoa.nome}`,
    largo: true,
    corpo: html`<form class="pilha" id="form-colab" novalidate>
      <div class="grade-form">
        <div class="campo"><label class="obrigatorio" for="c-nome">Nome completo</label><input id="c-nome" name="nome" value="${d.nome || ""}" maxlength="80" autocomplete="off" /></div>
        <div class="campo"><label class="obrigatorio" for="c-login">Usuário de acesso</label><input id="c-login" name="login" value="${d.login || ""}" maxlength="30" autocapitalize="none" spellcheck="false" ${raw(novo ? "" : "disabled")} placeholder="ex.: maria.gandu" />
          ${novo ? html`<span class="ajuda">Sugestão: primeiro nome + unidade. Não pode ser alterado depois.</span>` : ""}</div>
        <div class="campo"><label for="c-cargo">Cargo / função exibida</label><input id="c-cargo" name="cargo" value="${d.cargo || ""}" maxlength="60" placeholder="Ex.: Zeladora, Recepcionista" /></div>
        <div class="campo"><label for="c-tel">Telefone (opcional)</label><input id="c-tel" name="telefone" value="${d.telefone || ""}" maxlength="20" inputmode="tel" /></div>
      </div>
      <div class="campo">
        <label for="c-funcao">Modelo de permissões</label>
        <select id="c-funcao" name="funcaoId"><option value="">Personalizado</option>${opcoes(funcoes.map((f) => ({ valor: f.id, rotulo: `${f.nome}${f.personalizada ? " (personalizada)" : ""}` })), d.funcaoId)}</select>
        <span class="ajuda" id="c-funcao-desc">${funcoes.find((f) => f.id === d.funcaoId)?.descricao || "Escolha um modelo para preencher as permissões abaixo; depois ajuste o que quiser."}</span>
      </div>
      <div class="painel painel-compacto pilha-sm">
        <span class="rotulo">Unidades</span>
        <label class="interruptor"><input type="checkbox" name="todasUnidades" ${raw(d.todasUnidades || d.admin ? "checked" : "")} /><span class="trilho"></span><span>Todas as unidades (inclusive as que forem criadas depois)</span></label>
        <div class="linha" style="gap:6px" id="c-unidades">${unidades.map(
          (u) => html`<label class="chip" style="cursor:pointer;padding:6px 12px"><input type="checkbox" name="unidades" value="${u.id}" ${raw((d.unidades || []).includes(u.id) ? "checked" : "")} style="accent-color:var(--ambar)" /> ${u.nome}</label>`
        )}${unidades.length === 1 ? html`<input type="checkbox" name="unidades" value="__" class="oculto" />` : ""}</div>
      </div>
      <div class="painel painel-compacto pilha-sm">
        <span class="rotulo">Acessos especiais</span>
        <label class="interruptor"><input type="checkbox" name="admin" ${raw(d.admin ? "checked" : "")} /><span class="trilho"></span><span><strong>Administrador geral</strong> — acesso total, cadastra colaboradores e altera configurações</span></label>
        <label class="interruptor"><input type="checkbox" name="aprovador" ${raw(d.aprovador ? "checked" : "")} /><span class="trilho"></span><span>Aprova relatórios mensais e investimentos (diretoria)</span></label>
        <label class="interruptor"><input type="checkbox" name="verAuditoria" ${raw(d.verAuditoria ? "checked" : "")} /><span class="trilho"></span><span>Consulta o histórico de alterações</span></label>
      </div>
      <div id="c-matriz">
        <div class="linha-entre"><span class="rotulo">Permissões por módulo</span><span class="pequeno texto-3">Excluir = arquivar/cancelar; o histórico é sempre mantido.</span></div>
        <div class="tabela-envoltorio" style="padding:4px 12px;margin-top:8px">${matrizPermissoes(d.permissoes, d.admin)}</div>
      </div>
      ${novo
        ? html`<div class="campo"><label for="c-senha">Senha temporária</label><div class="linha" style="gap:6px;flex-wrap:nowrap"><input id="c-senha" name="senha" value="${senhaInicial}" maxlength="40" class="numero" /><button type="button" class="btn btn-secundario btn-sm" data-gerar>${icone("atualizar")} Gerar outra</button></div><span class="ajuda">Mínimo de 8 caracteres. O colaborador cria a própria senha no primeiro acesso.</span></div>`
        : ""}
      <div class="aviso aviso-erro oculto" id="c-erro" role="alert"></div>
    </form>`,
    rodape: html`<button class="btn btn-secundario" data-fechar>Cancelar</button><button class="btn btn-primario" data-ok>${icone("check")} ${novo ? "Cadastrar e criar acesso" : "Salvar alterações"}</button>`,
    aoMontar: (el, fechar) => {
      const form = $("#form-colab", el);
      const atualizarAdmin = () => {
        const admin = form.admin.checked;
        $$("[data-permissao]", el).forEach((s) => (s.disabled = admin));
        if (admin) {
          form.todasUnidades.checked = true;
          form.aprovador.checked = true;
          form.verAuditoria.checked = true;
        }
        atualizarUnidades();
      };
      const atualizarUnidades = () => $("#c-unidades", el).classList.toggle("oculto", form.todasUnidades.checked);
      on(el, "change", "[name=admin]", atualizarAdmin);
      on(el, "change", "[name=todasUnidades]", atualizarUnidades);
      on(el, "input", "[name=nome]", () => {
        if (!novo || form.login.dataset.editado) return;
        const partes = normalizarTexto(form.nome.value).split(/\s+/).filter(Boolean);
        const u = unidades.length > 1 ? "" : "";
        form.login.value = normalizarLogin(partes.length > 1 ? `${partes[0]}.${partes[partes.length - 1]}${u}` : partes[0] || "");
      });
      on(el, "input", "[name=login]", () => (form.login.dataset.editado = "1"));
      on(el, "click", "[data-gerar]", () => (form.senha.value = gerarSenha()));
      on(el, "change", "#c-funcao", (ev) => {
        const f = funcoes.find((x) => x.id === ev.target.value);
        $("#c-funcao-desc", el).textContent = f?.descricao || "Permissões personalizadas.";
        if (!f) return;
        form.admin.checked = Boolean(f.admin);
        form.aprovador.checked = Boolean(f.aprovador);
        form.verAuditoria.checked = Boolean(f.verAuditoria);
        form.todasUnidades.checked = Boolean(f.todasUnidades || f.admin);
        $$("[data-permissao]", el).forEach((s) => (s.value = String(f.permissoes?.[s.dataset.permissao] || 0)));
        if (!form.cargo.value) form.cargo.value = f.nome;
        atualizarAdmin();
      });
      on(el, "change", "[data-permissao]", () => ($("#c-funcao", el).value = ""));
      atualizarAdmin();

      on(el, "click", "[data-ok]", (ev, botao) =>
        comCarregamento(botao, async () => {
          const f = lerFormulario(form);
          const permissoes = {};
          $$("[data-permissao]", el).forEach((s) => (permissoes[s.dataset.permissao] = Number(s.value)));
          const dados = {
            nome: f.nome,
            login: novo ? normalizarLogin(f.login) : pessoa.login,
            cargo: f.cargo,
            telefone: f.telefone,
            funcaoId: f.funcaoId,
            admin: f.admin,
            aprovador: f.aprovador,
            verAuditoria: f.verAuditoria,
            todasUnidades: f.todasUnidades,
            unidades: (Array.isArray(f.unidades) ? f.unidades : []).filter((u) => u !== "__"),
            permissoes,
          };
          try {
            if (novo) {
              await criar(dados, f.senha);
              fechar(true);
              mostrarCredenciais({ nome: dados.nome, login: dados.login, senha: f.senha });
            } else {
              await atualizar(pessoa.login, dados);
              avisar("Colaborador atualizado. As mudanças valem no próximo carregamento da página dele.");
              fechar(true);
            }
            aoSalvar?.();
          } catch (e) {
            const c = $("#c-erro", el);
            c.textContent = mensagemDe(e);
            c.classList.remove("oculto");
            c.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        })
      );
    },
  });
  return modal.aoFechar;
}

export default async function telaColaboradores(el, ctx) {
  const lista = await listar();
  const b = ctx.busca;
  let filtrada = lista;
  if (b.situacao !== "inativos") filtrada = filtrada.filter((p) => p.ativo !== false);
  else filtrada = filtrada.filter((p) => p.ativo === false);
  if (b.unidade) filtrada = filtrada.filter((p) => p.admin || p.todasUnidades || (p.unidades || []).includes(b.unidade));
  if (b.q) {
    const q = normalizarTexto(b.q);
    filtrada = filtrada.filter((p) => normalizarTexto(`${p.nome} ${p.login} ${p.cargo}`).includes(q));
  }
  const admin = ehAdmin();
  montar(
    el,
    html`${cabecalho("Colaboradores", "Acessos individuais da equipe, com unidade, função e permissões de cada pessoa.", admin ? html`<button class="btn btn-primario" data-novo>${icone("mais")} Novo colaborador</button>` : "")}
    <form class="filtros" data-filtros>
      <div class="campo"><label for="f-sit">Situação</label><select id="f-sit" name="situacao">${opcoes([{ valor: "", rotulo: "Ativos" }, { valor: "inativos", rotulo: "Desativados" }], b.situacao || "")}</select></div>
      <div class="campo"><label for="f-un">Unidade</label><select id="f-un" name="unidade"><option value="">Todas</option>${opcoes(minhasUnidades().map((u) => ({ valor: u.id, rotulo: u.nome })), b.unidade)}</select></div>
      <div class="campo" style="flex:1 1 240px"><label for="f-q">Buscar</label><input id="f-q" name="q" value="${b.q || ""}" placeholder="Nome, usuário ou cargo" /></div>
    </form>
    ${filtrada.length
      ? html`<div class="tabela-envoltorio"><table class="tabela responsiva">
          <thead><tr><th>Colaborador</th><th>Usuário</th><th>Unidades</th><th>Acessos</th><th>Situação</th>${admin ? html`<th></th>` : ""}</tr></thead>
          <tbody>${filtrada.map(
            (p) => html`<tr>
              <td class="principal-celula" data-rotulo="Colaborador"><div class="linha" style="gap:10px;flex-wrap:nowrap">${avatar(p.nome)}<div><strong>${p.nome}</strong><div class="pequeno texto-3">${p.cargo || "—"}</div></div></div></td>
              <td data-rotulo="Usuário"><span class="numero">${p.login}</span>${p.primeiroAcesso ? html`<div class="pequeno texto-3">aguardando 1º acesso</div>` : ""}</td>
              <td data-rotulo="Unidades">${p.admin || p.todasUnidades ? "Todas" : (p.unidades || []).map(nomeUnidade).join(", ") || "—"}</td>
              <td data-rotulo="Acessos" class="pequeno texto-2" style="max-width:340px">${resumoAcessos(p)}${p.aprovador && !p.admin ? html` · <span class="selo selo-marca sem-ponto">Aprova relatórios</span>` : ""}</td>
              <td data-rotulo="Situação">${p.ativo === false ? html`<span class="selo selo-tracejado">Desativado</span>` : p.admin ? html`<span class="selo selo-marca">Administrador</span>` : html`<span class="selo selo-ok">Ativo</span>`}</td>
              ${admin
                ? html`<td class="direita" data-rotulo=""><div class="linha" style="gap:2px;justify-content:flex-end;flex-wrap:nowrap">
                    <button class="btn btn-fantasma btn-sm" data-editar="${p.login}" title="Editar">${icone("editar")}</button>
                    <button class="btn btn-fantasma btn-sm" data-senha="${p.login}" title="Redefinir senha">${icone("chave")}</button>
                    ${p.login !== sessao.perfil.login ? html`<button class="btn btn-fantasma btn-sm" data-ativo="${p.login}" title="${p.ativo === false ? "Reativar" : "Desativar"}">${icone(p.ativo === false ? "desfazer" : "bloquear")}</button>` : ""}
                  </div></td>`
                : ""}
            </tr>`
          )}</tbody></table></div>
          <p class="pequeno texto-3" style="margin-top:8px">${filtrada.length} colaborador(es)</p>`
      : estadoVazio({ icone: "usuarios", titulo: "Ninguém encontrado", texto: lista.length ? "Ajuste os filtros acima." : "Cadastre a equipe para que cada pessoa tenha o próprio acesso.", acao: admin && !lista.length ? html`<button class="btn btn-primario" data-novo>${icone("mais")} Novo colaborador</button>` : "" })}`
  );
  const form = el.querySelector("[data-filtros]");
  form.addEventListener("change", () => atualizarBusca(Object.fromEntries(new FormData(form).entries()), { recarregar: true }));
  form.addEventListener("submit", (ev) => ev.preventDefault());
  const porLogin = new Map(lista.map((p) => [p.login, p]));
  on(el, "click", "[data-novo]", () => abrirFormularioColaborador(null, ctx.recarregar));
  on(el, "click", "[data-editar]", (ev, bt) => abrirFormularioColaborador(porLogin.get(bt.dataset.editar), ctx.recarregar));
  on(el, "click", "[data-senha]", async (ev, bt) => {
    const p = porLogin.get(bt.dataset.senha);
    const ok = await confirmar({
      titulo: `Redefinir a senha de ${p.nome}?`,
      mensagem: "Uma nova senha temporária será criada e a atual deixa de funcionar. O usuário e todo o histórico continuam iguais.",
      confirmarTexto: "Redefinir senha",
    });
    if (!ok) return;
    const senha = gerarSenha();
    try {
      await redefinirSenha(p.login, senha);
      mostrarCredenciais({ nome: p.nome, login: p.login, senha, titulo: "Senha redefinida" });
      ctx.recarregar();
    } catch (e) {
      avisarErro(e);
    }
  });
  on(el, "click", "[data-ativo]", async (ev, bt) => {
    const p = porLogin.get(bt.dataset.ativo);
    const reativar = p.ativo === false;
    const ok = await confirmar({
      titulo: reativar ? `Reativar ${p.nome}?` : `Desativar ${p.nome}?`,
      mensagem: reativar ? "O acesso volta a funcionar com a senha atual." : "O acesso é bloqueado imediatamente. Tudo o que a pessoa registrou continua no histórico.",
      confirmarTexto: reativar ? "Reativar" : "Desativar",
      perigo: !reativar,
    });
    if (!ok) return;
    try {
      await alterarAtivo(p.login, reativar);
      avisar(reativar ? "Acesso reativado." : "Acesso desativado.");
      ctx.recarregar();
    } catch (e) {
      avisarErro(e);
    }
  });
}

export { formatarDataHora };
