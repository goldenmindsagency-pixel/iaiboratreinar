// Unidades: cadastro e situação de cada academia da rede.
import { html, montar, $, on, opcoes, lerFormulario } from "../core/dom.js";
import { icone } from "../core/icones.js";
import { sessao, pode } from "../core/sessao.js";
import { abrirModal, avisar, comCarregamento, estadoVazio } from "../core/ui.js";
import { mensagemDe } from "../core/erros.js";
import { salvarUnidade } from "../services/sistema.js";
import { diretorio } from "../services/usuarios.js";
import { cabecalho } from "./comum.js";

export default async function telaUnidades(el, ctx) {
  const pessoas = await diretorio().catch(() => []);
  const unidades = sessao.unidades;
  const editar = pode("unidades", 3);
  montar(
    el,
    html`${cabecalho("Unidades", "Cada unidade tem sua equipe, rotinas, registros, indicadores e pendências.", editar ? html`<button class="btn btn-primario" data-nova>${icone("mais")} Nova unidade</button>` : "")}
    ${unidades.length
      ? html`<div class="grade-3">${unidades.map((u) => {
          const equipe = pessoas.filter((p) => !p.admin && !p.todasUnidades && (p.unidades || []).includes(u.id));
          return html`<section class="painel ${u.ativo === false ? "" : "painel-destaque"}" style="${u.ativo === false ? "opacity:.6" : ""}">
            <div class="linha-entre" style="margin-bottom:10px"><span class="chip numero">Unidade ${u.codigo || "—"}</span><span class="selo ${u.ativo === false ? "selo-tracejado" : u.tipo === "matriz" ? "selo-marca" : "selo-info"}">${u.ativo === false ? "Inativa" : u.tipo === "matriz" ? "Matriz" : "Filial"}</span></div>
            <h2 style="font-size:1.6rem;font-stretch:72%">${u.nome}</h2>
            <p class="texto-2 pequeno">${u.cidade || "Cidade não informada"}${u.endereco ? ` · ${u.endereco}` : ""}</p>
            <p class="pequeno texto-3">${equipe.length} colaborador(es) vinculados${pessoas.some((p) => p.todasUnidades && !p.admin) ? " + equipe de todas as unidades" : ""}</p>
            ${editar ? html`<button class="btn btn-secundario btn-sm" data-editar="${u.id}">${icone("editar")} Editar</button>` : ""}
          </section>`;
        })}</div>`
      : estadoVazio({ icone: "predio", titulo: "Nenhuma unidade cadastrada", texto: "Cadastre as unidades para começar." })}`
  );
  const abrir = (u = null) => {
    const d = u || { tipo: "filial", ativo: true, codigo: String(unidades.length + 1).padStart(2, "0") };
    abrirModal({
      titulo: u ? `Editar ${u.nome}` : "Nova unidade",
      corpo: html`<form class="grade-form" id="form-un" novalidate>
        <div class="campo"><label class="obrigatorio" for="u-nome">Nome</label><input id="u-nome" name="nome" value="${d.nome || ""}" maxlength="60" /></div>
        <div class="campo"><label for="u-cod">Código</label><input id="u-cod" name="codigo" value="${d.codigo || ""}" maxlength="10" /></div>
        <div class="campo"><label for="u-tipo">Tipo</label><select id="u-tipo" name="tipo">${opcoes([{ valor: "matriz", rotulo: "Matriz" }, { valor: "filial", rotulo: "Filial" }], d.tipo)}</select></div>
        <div class="campo"><label for="u-cid">Cidade</label><input id="u-cid" name="cidade" value="${d.cidade || ""}" maxlength="60" /></div>
        <div class="campo largo"><label for="u-end">Endereço</label><input id="u-end" name="endereco" value="${d.endereco || ""}" maxlength="120" /></div>
        <div class="campo"><label for="u-ord">Ordem de exibição</label><input id="u-ord" type="number" name="ordem" value="${d.ordem ?? unidades.length + 1}" min="1" max="99" /></div>
        ${u && pode("unidades", 4) ? html`<label class="interruptor largo"><input type="checkbox" name="ativo" ${d.ativo !== false ? "checked" : ""} /><span class="trilho"></span><span>Unidade ativa</span></label>` : ""}
        ${!u ? html`<p class="largo pequeno texto-3">Depois de criar, cadastre ou duplique as rotinas para esta unidade em cada setor e vincule os colaboradores.</p>` : ""}
        <div class="aviso aviso-erro oculto largo" id="u-erro"></div>
      </form>`,
      rodape: html`<button class="btn btn-secundario" data-fechar>Cancelar</button><button class="btn btn-primario" data-ok>Salvar</button>`,
      aoMontar: (mel, fechar) =>
        on(mel, "click", "[data-ok]", (ev, b) =>
          comCarregamento(b, async () => {
            const f = lerFormulario($("#form-un", mel));
            try {
              await salvarUnidade(u?.id || null, { ...f, ativo: u && pode("unidades", 4) ? f.ativo : u?.ativo !== false });
              avisar("Unidade salva.");
              fechar(true);
              ctx.recarregar();
            } catch (e) {
              const c = $("#u-erro", mel);
              c.textContent = mensagemDe(e);
              c.classList.remove("oculto");
            }
          })
        ),
    });
  };
  on(el, "click", "[data-nova]", () => abrir());
  on(el, "click", "[data-editar]", (ev, b) => abrir(unidades.find((u) => u.id === b.dataset.editar)));
}
