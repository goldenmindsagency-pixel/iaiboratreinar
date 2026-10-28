// Janelas de cadastro (equipamento/ambiente) e de registro de inspeção/manutenção.
import { html, $, on, opcoes, lerFormulario } from "../../core/dom.js";
import { icone } from "../../core/icones.js";
import { minhasUnidades, pode } from "../../core/sessao.js";
import { abrirModal, avisar, comCarregamento } from "../../core/ui.js";
import { CATEGORIAS_EQUIPAMENTO, ESTADOS_CONSERVACAO, TIPOS_MANUTENCAO, ELEMENTOS_ESTRUTURA, CATEGORIAS_CUSTO } from "../../core/constantes.js";
import { hoje } from "../../core/tempo.js";
import { paraCentavos, moeda } from "../../core/formato.js";
import { mensagemDe } from "../../core/erros.js";
import { salvarEquipamento, salvarAmbiente, registrarManutencao } from "../../services/manutencao.js";
import { campoFotos } from "./fotos.js";

function erroEm(mel, e) {
  const caixa = $("[data-erro-modal]", mel);
  caixa.textContent = mensagemDe(e);
  caixa.classList.remove("oculto");
}

export function abrirCadastroEquipamento(eq = null, { ambientes = [], unidadeId } = {}) {
  const d = eq || { unidadeId: unidadeId || minhasUnidades()[0]?.id, conservacao: "Bom", categoria: CATEGORIAS_EQUIPAMENTO[0], periodicidadeDias: 60, ativo: true };
  const m = abrirModal({
    titulo: eq ? `Editar ${eq.codigo}` : "Novo equipamento",
    largo: true,
    corpo: html`<form class="grade-form" id="form-eq" novalidate>
      <div class="campo"><label class="obrigatorio" for="eq-codigo">Código (identificador único)</label><input id="eq-codigo" name="codigo" value="${d.codigo || ""}" maxlength="20" placeholder="Ex.: 01-012" /></div>
      <div class="campo"><label class="obrigatorio" for="eq-nome">Nome</label><input id="eq-nome" name="nome" value="${d.nome || ""}" maxlength="80" placeholder="Ex.: Leg press 45°" /></div>
      <div class="campo"><label for="eq-cat">Categoria</label><select id="eq-cat" name="categoria">${opcoes(CATEGORIAS_EQUIPAMENTO, d.categoria)}</select></div>
      <div class="campo"><label class="obrigatorio" for="eq-un">Unidade</label><select id="eq-un" name="unidadeId" ${eq ? "disabled" : ""}>${opcoes(minhasUnidades().map((u) => ({ valor: u.id, rotulo: u.nome })), d.unidadeId)}</select></div>
      <div class="campo"><label for="eq-loc">Localização</label><input id="eq-loc" name="localizacao" value="${d.localizacao || ""}" maxlength="80" placeholder="Ex.: Salão, fileira 2" /></div>
      <div class="campo"><label for="eq-cons">Estado de conservação</label><select id="eq-cons" name="conservacao">${opcoes(ESTADOS_CONSERVACAO, d.conservacao)}</select></div>
      <div class="campo"><label for="eq-marca">Marca</label><input id="eq-marca" name="marca" value="${d.marca || ""}" maxlength="50" /></div>
      <div class="campo"><label for="eq-mod">Modelo</label><input id="eq-mod" name="modelo" value="${d.modelo || ""}" maxlength="50" /></div>
      <div class="campo"><label for="eq-serie">Nº de série</label><input id="eq-serie" name="numeroSerie" value="${d.numeroSerie || ""}" maxlength="50" /></div>
      <div class="campo"><label for="eq-aq">Data de aquisição</label><input id="eq-aq" type="date" name="dataAquisicao" value="${d.dataAquisicao || ""}" /></div>
      <div class="campo"><label for="eq-per">Inspeção a cada (dias)</label><input id="eq-per" type="number" min="0" max="730" name="periodicidadeDias" value="${d.periodicidadeDias ?? 60}" /><span class="ajuda">0 = sem inspeção programada</span></div>
      <div class="campo"><label for="eq-prox">Próxima inspeção</label><input id="eq-prox" type="date" name="proximaInspecao" value="${d.proximaInspecao || ""}" /></div>
      <div class="campo largo"><label for="eq-obs">Observações</label><textarea id="eq-obs" name="observacoes" maxlength="1000">${d.observacoes || ""}</textarea></div>
      ${eq && pode("equipamentos", 4) ? html`<label class="interruptor largo"><input type="checkbox" name="ativo" ${eq.ativo !== false ? "checked" : ""} /><span class="trilho"></span><span>Equipamento ativo (desmarque para baixar/descartar — o histórico é mantido)</span></label>` : ""}
      <div class="aviso aviso-erro oculto largo" data-erro-modal></div>
    </form>`,
    rodape: html`<button class="btn btn-secundario" data-fechar>Cancelar</button><button class="btn btn-primario" data-ok>${icone("check")} Salvar</button>`,
    aoMontar: (mel, fechar) =>
      on(mel, "click", "[data-ok]", (ev, b) =>
        comCarregamento(b, async () => {
          const f = lerFormulario($("#form-eq", mel));
          try {
            const id = await salvarEquipamento(eq?.id || null, { ...eq, ...f, unidadeId: eq ? eq.unidadeId : f.unidadeId, ativo: eq && pode("equipamentos", 4) ? f.ativo : eq?.ativo !== false });
            avisar(eq ? "Equipamento atualizado." : "Equipamento cadastrado.");
            fechar(id);
          } catch (e) {
            erroEm(mel, e);
          }
        })
      ),
  });
  return m.aoFechar.then((v) => (typeof v === "string" ? v : null));
}

export function abrirCadastroAmbiente(amb = null, { unidadeId } = {}) {
  const d = amb || { unidadeId: unidadeId || minhasUnidades()[0]?.id, elementos: [], periodicidadeDias: 30, ativo: true };
  const m = abrirModal({
    titulo: amb ? `Editar ${amb.nome}` : "Novo ambiente",
    largo: true,
    corpo: html`<form class="grade-form" id="form-amb" novalidate>
      <div class="campo"><label class="obrigatorio" for="a-nome">Nome</label><input id="a-nome" name="nome" value="${d.nome || ""}" maxlength="80" placeholder="Ex.: Sala de dança" /></div>
      <div class="campo"><label for="a-un">Unidade</label><select id="a-un" name="unidadeId" ${amb ? "disabled" : ""}>${opcoes(minhasUnidades().map((u) => ({ valor: u.id, rotulo: u.nome })), d.unidadeId)}</select></div>
      <div class="campo"><label for="a-per">Inspeção a cada (dias)</label><input id="a-per" type="number" min="0" max="365" name="periodicidadeDias" value="${d.periodicidadeDias ?? 30}" /></div>
      <div class="campo"><label for="a-prox">Próxima inspeção</label><input id="a-prox" type="date" name="proximaInspecao" value="${d.proximaInspecao || ""}" /></div>
      <div class="campo largo"><span class="rotulo">Elementos a verificar na inspeção</span>
        <div class="linha" style="gap:6px">${ELEMENTOS_ESTRUTURA.map((e) => html`<label class="chip" style="cursor:pointer;padding:6px 10px"><input type="checkbox" name="elementos" value="${e}" ${(d.elementos || []).includes(e) ? "checked" : ""} style="accent-color:var(--ambar)" /> ${e}</label>`)}</div></div>
      <div class="campo largo"><label for="a-desc">Descrição</label><textarea id="a-desc" name="descricao" maxlength="1000">${d.descricao || ""}</textarea></div>
      ${amb && pode("estrutura", 4) ? html`<label class="interruptor largo"><input type="checkbox" name="ativo" ${amb.ativo !== false ? "checked" : ""} /><span class="trilho"></span><span>Ambiente ativo</span></label>` : ""}
      <div class="aviso aviso-erro oculto largo" data-erro-modal></div>
    </form>`,
    rodape: html`<button class="btn btn-secundario" data-fechar>Cancelar</button><button class="btn btn-primario" data-ok>${icone("check")} Salvar</button>`,
    aoMontar: (mel, fechar) =>
      on(mel, "click", "[data-ok]", (ev, b) =>
        comCarregamento(b, async () => {
          const f = lerFormulario($("#form-amb", mel));
          try {
            const id = await salvarAmbiente(amb?.id || null, { ...amb, ...f, unidadeId: amb ? amb.unidadeId : f.unidadeId, ativo: amb && pode("estrutura", 4) ? f.ativo : amb?.ativo !== false });
            avisar(amb ? "Ambiente atualizado." : "Ambiente cadastrado.");
            fechar(id);
          } catch (e) {
            erroEm(mel, e);
          }
        })
      ),
  });
  return m.aoFechar.then((v) => (typeof v === "string" ? v : null));
}

/** Inspeção/manutenção. setorId: 'equipamentos' | 'estrutura' */
export function abrirRegistroManutencao(alvo, setorId) {
  let fotos;
  let nf;
  const elementos = setorId === "estrutura" ? alvo.elementos?.length ? alvo.elementos : ELEMENTOS_ESTRUTURA : [];
  const m = abrirModal({
    titulo: `Registrar em ${alvo.codigo ? `${alvo.codigo} · ` : ""}${alvo.nome}`,
    largo: true,
    corpo: html`<form class="pilha" id="form-man" novalidate>
      <div class="grade-form">
        <div class="campo"><label for="m-tipo">Tipo</label><select id="m-tipo" name="tipo">${opcoes(Object.entries(TIPOS_MANUTENCAO).map(([v, r]) => ({ valor: v, rotulo: r })), "inspecao")}</select></div>
        <div class="campo"><label for="m-data">Data</label><input id="m-data" type="date" name="data" value="${hoje()}" max="${hoje()}" /></div>
        <div class="campo"><label for="m-res">Resultado</label><select id="m-res" name="resultado"><option value="ok">Tudo certo / serviço concluído</option><option value="problema">Problema encontrado</option></select></div>
      </div>
      ${elementos.length ? html`<div class="campo"><span class="rotulo">Elementos verificados</span><div class="linha" style="gap:6px">${elementos.map((e) => html`<label class="chip" style="cursor:pointer;padding:6px 10px"><input type="checkbox" name="elementos" value="${e}" checked style="accent-color:var(--ambar)" /> ${e}</label>`)}</div></div>` : ""}
      <div class="campo"><label class="obrigatorio" for="m-desc">O que foi feito ou verificado?</label><textarea id="m-desc" name="descricao" maxlength="2000"></textarea></div>
      <div class="campo"><span class="rotulo">Fotos</span><div id="m-fotos"></div></div>
      <details><summary class="pequeno texto-2" style="cursor:pointer">Lançar custo deste serviço</summary>
        <div class="grade-form" style="margin-top:10px">
          <div class="campo"><label for="m-valor">Valor (R$)</label><input id="m-valor" name="valor" inputmode="decimal" placeholder="0,00" /></div>
          <div class="campo"><label for="m-cat">Categoria</label><select id="m-cat" name="categoriaCusto">${opcoes(CATEGORIAS_CUSTO, "Mão de obra")}</select></div>
          <div class="campo"><label for="m-forn">Fornecedor</label><input id="m-forn" name="fornecedor" maxlength="100" /></div>
          <div class="campo largo"><span class="rotulo">Nota fiscal (foto)</span><div id="m-nf"></div></div>
        </div>
      </details>
      <p class="pequeno texto-3">Se encontrou um problema que precisa de solução, registre também uma ocorrência para ter responsável e prazo.</p>
      <div class="aviso aviso-erro oculto" data-erro-modal></div>
    </form>`,
    rodape: html`<button class="btn btn-secundario" data-fechar>Cancelar</button><button class="btn btn-primario" data-ok>${icone("check")} Registrar</button>`,
    aoMontar: (mel, fechar) => {
      fotos = campoFotos($("#m-fotos", mel), { pasta: `${alvo.unidadeId}/${setorId}` });
      nf = campoFotos($("#m-nf", mel), { pasta: `${alvo.unidadeId}/custos`, maximo: 1, rotulo: "Foto da nota" });
      on(mel, "click", "[data-ok]", (ev, b) =>
        comCarregamento(b, async () => {
          const f = lerFormulario($("#form-man", mel));
          try {
            if (fotos.enviando() || nf.enviando()) throw new Error("Aguarde o envio das fotos.");
            const valor = f.valor ? paraCentavos(f.valor) : 0;
            if (Number.isNaN(valor)) throw new Error("Valor inválido.");
            await registrarManutencao({
              setorId,
              alvo,
              tipo: f.tipo,
              data: f.data,
              descricao: f.descricao,
              resultado: f.resultado,
              elementos: Array.isArray(f.elementos) ? f.elementos : [],
              fotos: fotos.obter(),
              custo: valor > 0 ? { valor, categoria: f.categoriaCusto, fornecedor: f.fornecedor, notaFiscal: nf.obter()[0] || null } : null,
            });
            avisar(`Registro salvo${valor ? ` (custo de ${moeda(valor)})` : ""}.`);
            fechar(true);
          } catch (e) {
            erroEm(mel, e);
          }
        })
      );
    },
  });
  return m.aoFechar;
}
