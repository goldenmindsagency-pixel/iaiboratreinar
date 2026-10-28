// Meu perfil: dados do usuário, acessos e troca de senha.
import { html, montar, $, on, lerFormulario } from "../core/dom.js";
import { icone } from "../core/icones.js";
import { sessao, todosModulos, nomeUnidade } from "../core/sessao.js";
import { avisar, comCarregamento, avatar } from "../core/ui.js";
import { NIVEIS } from "../core/constantes.js";
import { mensagemDe } from "../core/erros.js";
import { trocarMinhaSenha } from "../services/usuarios.js";
import { cabecalho } from "./comum.js";

export default async function telaPerfil(el) {
  const p = sessao.perfil;
  const modulos = todosModulos().filter((m) => p.admin || (p.permissoes?.[m.id] || 0) > 0);
  montar(
    el,
    html`${cabecalho("Meu perfil")}
    <div class="grade-2" style="align-items:start;max-width:1000px">
      <section class="painel">
        <div class="linha" style="margin-bottom:16px">${avatar(p.nome)}<div><h2>${p.nome}</h2><p class="texto-2 pequeno" style="margin:0">${p.cargo || "—"}</p></div></div>
        <dl class="chave-valor">
          <dt>Usuário</dt><dd class="numero">${p.login}</dd>
          <dt>Unidades</dt><dd>${p.admin || p.todasUnidades ? "Todas" : (p.unidades || []).map(nomeUnidade).join(", ")}</dd>
          <dt>Acessos</dt><dd>${p.admin ? "Administrador geral (acesso total)" : modulos.map((m) => html`<div>${m.nome}: <span class="texto-2">${NIVEIS[p.permissoes[m.id]]?.rotulo}</span></div>`)}</dd>
          ${p.aprovador ? html`<dt>Aprovação</dt><dd>Aprova relatórios mensais e investimentos</dd>` : ""}
        </dl>
        <p class="pequeno texto-3" style="margin-top:14px">Para mudar acessos ou unidades, fale com o administrador.</p>
      </section>
      <section class="painel">
        <h3 style="margin-bottom:12px">Trocar senha</h3>
        <form class="pilha" id="form-senha" novalidate>
          <div class="campo"><label for="s-atual">Senha atual</label><input id="s-atual" name="atual" type="password" autocomplete="current-password" /></div>
          <div class="campo"><label for="s-nova">Nova senha</label><input id="s-nova" name="nova" type="password" autocomplete="new-password" minlength="8" /><span class="ajuda">Mínimo de 8 caracteres.</span></div>
          <div class="campo"><label for="s-conf">Confirme a nova senha</label><input id="s-conf" name="confirmar" type="password" autocomplete="new-password" /></div>
          <div class="aviso aviso-erro oculto" id="s-erro"></div>
          <div><button class="btn btn-primario" type="submit">${icone("cadeado")} Salvar nova senha</button></div>
        </form>
      </section>
    </div>`
  );
  const form = $("#form-senha", el);
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const d = lerFormulario(form);
    const erro = $("#s-erro", el);
    erro.classList.add("oculto");
    if (d.nova !== d.confirmar) {
      erro.textContent = "As senhas não conferem.";
      return erro.classList.remove("oculto");
    }
    await comCarregamento($("button[type=submit]", form), async () => {
      try {
        await trocarMinhaSenha(d.atual, d.nova);
        form.reset();
        avisar("Senha alterada.");
      } catch (e) {
        erro.textContent = mensagemDe(e);
        erro.classList.remove("oculto");
      }
    });
  });
}

export { on };
