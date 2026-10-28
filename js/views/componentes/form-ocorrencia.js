// Janela para registrar uma ocorrência ou delegar uma providência.
import { html, raw, $, on, opcoes, lerFormulario, montar } from "../../core/dom.js";
import { icone } from "../../core/icones.js";
import { minhasUnidades, pode, nomeUnidade, sessao } from "../../core/sessao.js";
import { abrirModal, avisar, avisarErro, comCarregamento } from "../../core/ui.js";
import { CATEGORIAS_PENDENCIA, PRIORIDADES, SITUACOES_EQUIPAMENTO } from "../../core/constantes.js";
import { formatarData } from "../../core/tempo.js";
import * as pend from "../../services/pendencias.js";
import { listarEquipamentos, listarAmbientes, mudarSituacao } from "../../services/manutencao.js";
import { pessoasPara, nomePessoa } from "../../services/usuarios.js";
import { campoFotos } from "./fotos.js";

/**
 * abrirNovaOcorrencia({ unidadeId, categoria, titulo, descricao, origem, origemRef, equipamentoId, ambienteId, prioridade })
 * Resolve com a pendência criada ou null.
 */
export function abrirNovaOcorrencia(pre = {}) {
  const unidades = minhasUnidades();
  const providencia = pre.origem === "providencia";
  const estado = {
    unidadeId: pre.unidadeId || (unidades.length === 1 ? unidades[0].id : sessao.unidadeSelecionada !== "todas" ? sessao.unidadeSelecionada : ""),
    categoria: pre.categoria || (providencia ? "administrativo" : ""),
    prioridade: pre.prioridade || "media",
    equipamentos: [],
    ambientes: [],
  };
  let fotos;

  const modal = abrirModal({
    titulo: providencia ? "Gerar providência" : "Registrar ocorrência",
    largo: true,
    corpo: html`<form class="pilha" id="form-oc" novalidate>
      ${providencia ? html`<div class="aviso aviso-info">${icone("info")}<div>A providência entra na lista de pendências da unidade, com responsável e prazo, e fica ligada ao item do seu checklist.</div></div>` : ""}
      <div class="grade-form">
        <div class="campo">
          <label for="oc-unidade" class="obrigatorio">Unidade</label>
          <select id="oc-unidade" name="unidadeId" required>${html`<option value="">Selecione</option>`}${opcoes(unidades.map((u) => ({ valor: u.id, rotulo: u.nome })), estado.unidadeId)}</select>
        </div>
        <div class="campo">
          <label for="oc-categoria" class="obrigatorio">Categoria</label>
          <select id="oc-categoria" name="categoria" required>${html`<option value="">Selecione</option>`}${opcoes(CATEGORIAS_PENDENCIA.map((c) => ({ valor: c.id, rotulo: c.nome })), estado.categoria)}</select>
        </div>
        <div class="campo largo">
          <label for="oc-titulo" class="obrigatorio">${providencia ? "O que precisa ser feito?" : "O que aconteceu?"}</label>
          <input id="oc-titulo" name="titulo" maxlength="120" required value="${pre.titulo || ""}" placeholder="${providencia ? "Ex.: Repor estoque de desinfetante" : "Ex.: Ar-condicionado do salão pingando"}" />
        </div>
        <div class="campo largo oculto" id="oc-alvo"></div>
        <div class="campo largo">
          <label for="oc-local">Local</label>
          <input id="oc-local" name="local" maxlength="100" value="${pre.local || ""}" placeholder="Ex.: Salão de musculação, perto da janela" />
        </div>
        <div class="campo largo">
          <label for="oc-descricao">Detalhes</label>
          <textarea id="oc-descricao" name="descricao" maxlength="2000" placeholder="Descreva o que foi observado, desde quando e se há risco.">${pre.descricao || ""}</textarea>
        </div>
      </div>
      <div class="campo">
        <span class="rotulo">Prioridade</span>
        <div class="segmentos" role="radiogroup" aria-label="Prioridade" id="oc-prioridade">
          ${Object.entries(PRIORIDADES)
            .sort((a, b) => b[1].ordem - a[1].ordem)
            .map(([id, p]) => html`<button type="button" role="radio" data-prioridade="${id}" class="${estado.prioridade === id ? "ativo" : ""}" aria-checked="${estado.prioridade === id}">${p.rotulo}</button>`)}
        </div>
        <span class="ajuda" id="oc-prazo-ajuda"></span>
      </div>
      <div class="aviso aviso-erro oculto" id="oc-critica">${icone("alerta")}<div>Se houver risco para alguém, isole o local ou retire o equipamento de uso <strong>agora</strong>, sinalize e avise a gestão. O registro aqui não substitui esse procedimento.</div></div>
      <div class="oculto" id="oc-gerencia">
        <div class="grade-form">
          <div class="campo"><label for="oc-resp">Responsável pela solução</label><select id="oc-resp" name="responsavelLogin"></select></div>
          <div class="campo"><label for="oc-prazo">Prazo</label><input id="oc-prazo" type="date" name="prazo" /></div>
        </div>
      </div>
      <div class="campo"><span class="rotulo">Fotos</span><div id="oc-fotos"></div></div>
      <div class="aviso oculto" id="oc-recorrencia"></div>
      <div class="aviso aviso-erro oculto" id="oc-erro" role="alert"></div>
    </form>`,
    rodape: html`<button class="btn btn-secundario" data-fechar>Cancelar</button><button class="btn btn-primario" data-salvar>${icone("check")} ${providencia ? "Criar providência" : "Registrar"}</button>`,
    aoMontar: (el, fechar) => montarForm(el, fechar),
  });

  function montarForm(el, fechar) {
    const form = $("#form-oc", el);
    fotos = campoFotos($("#oc-fotos", el), { pasta: `${estado.unidadeId || "geral"}/ocorrencias` });

    function atualizarPrazo() {
      const prazo = pend.prazoPadrao(estado.prioridade);
      $("#oc-prazo-ajuda", el).textContent = `Prazo sugerido: ${formatarData(prazo)}`;
      const input = $("#oc-prazo", el);
      if (input && !input.dataset.editado) input.value = prazo;
      $("#oc-critica", el).classList.toggle("oculto", estado.prioridade !== "critica");
    }

    async function atualizarGerencia() {
      const setor = pend.setorDaCategoria(estado.categoria);
      const gerencia = estado.unidadeId && estado.categoria && (pode("pendencias", 3) || pode(setor, 3));
      $("#oc-gerencia", el).classList.toggle("oculto", !gerencia);
      if (!gerencia) return;
      const pessoas = await pessoasPara({ unidadeId: estado.unidadeId }).catch(() => []);
      const padrao = pend.responsavelPadrao(estado.unidadeId, estado.categoria);
      montar($("#oc-resp", el), html`<option value="">Sem responsável (a gestão define)</option>${opcoes(pessoas.map((p) => ({ valor: p.login, rotulo: `${p.nome}${p.cargo ? ` — ${p.cargo}` : ""}` })), pre.responsavelLogin ?? padrao)}`);
    }

    async function atualizarAlvo() {
      const alvo = $("#oc-alvo", el);
      const precisaEquip = estado.categoria === "equipamentos";
      const precisaAmb = estado.categoria === "estrutura" || estado.categoria === "limpeza";
      if (!estado.unidadeId || (!precisaEquip && !precisaAmb)) {
        alvo.classList.add("oculto");
        return;
      }
      alvo.classList.remove("oculto");
      if (precisaEquip) {
        estado.equipamentos = await listarEquipamentos([estado.unidadeId]).catch(() => []);
        montar(
          alvo,
          html`<label for="oc-equip">Equipamento</label>
            <select id="oc-equip" name="equipamentoId"><option value="">Não sei / outro</option>${opcoes(
              estado.equipamentos.filter((e) => e.ativo !== false).map((e) => ({ valor: e.id, rotulo: `${e.codigo} · ${e.nome}${e.localizacao ? ` (${e.localizacao})` : ""}` })),
              pre.equipamentoId
            )}</select>
            ${pode("equipamentos", 3) ? html`<label class="marcar" style="margin-top:6px"><input type="checkbox" name="interditar" /> Marcar o equipamento como interditado agora</label>` : ""}`
        );
      } else {
        estado.ambientes = await listarAmbientes([estado.unidadeId]).catch(() => []);
        montar(
          alvo,
          html`<label for="oc-amb">Ambiente</label>
            <select id="oc-amb" name="ambienteId"><option value="">Não sei / outro</option>${opcoes(estado.ambientes.filter((a) => a.ativo !== false).map((a) => ({ valor: a.id, rotulo: a.nome })), pre.ambienteId)}</select>`
        );
      }
      verificarRecorrencia();
    }

    async function verificarRecorrencia() {
      const caixa = $("#oc-recorrencia", el);
      const equipamentoId = $("#oc-equip", el)?.value;
      const ambienteId = $("#oc-amb", el)?.value;
      if (!equipamentoId && !ambienteId) return caixa.classList.add("oculto");
      const lista = await pend.semelhantes({ unidadeId: estado.unidadeId, equipamentoId, ambienteId }).catch(() => []);
      const abertas = lista.filter((p) => p.aberta);
      if (!lista.length) return caixa.classList.add("oculto");
      caixa.className = `aviso ${abertas.length ? "aviso-marca" : "aviso-info"}`;
      montar(
        caixa,
        html`${icone("historico")}<div><strong>${lista.length} registro(s) para este item nos últimos 90 dias${lista.length >= 3 ? " — problema recorrente" : ""}.</strong>
          ${abertas.length ? html`<br />Já existe ocorrência aberta: ${abertas.map((p, i) => html`${i ? ", " : ""}<a href="#/ocorrencias/${p.id}" data-fechar>${p.codigo}</a>`)}. Se for o mesmo problema, comente nela em vez de registrar outra.` : ""}</div>`
      );
    }

    on(el, "change", "#oc-unidade", (ev) => {
      estado.unidadeId = ev.target.value;
      atualizarAlvo();
      atualizarGerencia();
    });
    on(el, "change", "#oc-categoria", (ev) => {
      estado.categoria = ev.target.value;
      atualizarAlvo();
      atualizarGerencia();
    });
    on(el, "change", "#oc-equip, #oc-amb", verificarRecorrencia);
    on(el, "input", "#oc-prazo", (ev) => (ev.target.dataset.editado = "1"));
    on(el, "click", "[data-prioridade]", (ev, b) => {
      estado.prioridade = b.dataset.prioridade;
      el.querySelectorAll("[data-prioridade]").forEach((x) => {
        x.classList.toggle("ativo", x === b);
        x.setAttribute("aria-checked", String(x === b));
      });
      atualizarPrazo();
    });

    on(el, "click", "[data-salvar]", async (ev, botao) => {
      const erro = $("#oc-erro", el);
      erro.classList.add("oculto");
      const d = lerFormulario(form);
      const falhar = (t) => {
        erro.textContent = t;
        erro.classList.remove("oculto");
      };
      if (!d.unidadeId) return falhar("Selecione a unidade.");
      if (!d.categoria) return falhar("Selecione a categoria.");
      if (!d.titulo || d.titulo.length < 4) return falhar("Descreva em poucas palavras o que aconteceu.");
      if (fotos.enviando()) return falhar("Aguarde o envio das fotos terminar.");
      const equipamento = estado.equipamentos.find((e) => e.id === d.equipamentoId);
      await comCarregamento(botao, async () => {
        try {
          const criada = await pend.criar({
            unidadeId: d.unidadeId,
            categoria: d.categoria,
            titulo: d.titulo,
            descricao: d.descricao,
            local: d.local || equipamento?.localizacao || estado.ambientes.find((a) => a.id === d.ambienteId)?.nome || "",
            equipamentoId: d.equipamentoId || "",
            equipamentoNome: equipamento ? `${equipamento.codigo} · ${equipamento.nome}` : "",
            ambienteId: d.ambienteId || "",
            prioridade: estado.prioridade,
            fotos: fotos.obter(),
            origem: pre.origem || "ocorrencia",
            origemRef: pre.origemRef || null,
            responsavelLogin: $("#oc-gerencia", el).classList.contains("oculto") ? undefined : d.responsavelLogin || "",
            responsavelNome: d.responsavelLogin ? nomePessoa(d.responsavelLogin) : "",
            prazo: $("#oc-gerencia", el).classList.contains("oculto") ? undefined : d.prazo || undefined,
          });
          if (d.interditar && equipamento) {
            await mudarSituacao(equipamento, "interditado", `${criada.codigo}: ${d.titulo}`).catch(avisarErro);
          } else if (equipamento && equipamento.situacao === "operando" && pode("equipamentos", 3)) {
            await mudarSituacao(equipamento, "aguardando_avaliacao", `${criada.codigo}: ${d.titulo}`).catch(() => {});
          }
          avisar(`${providencia ? "Providência criada" : "Ocorrência registrada"}: ${criada.codigo} (${nomeUnidade(d.unidadeId)}).`);
          fechar(criada);
        } catch (e) {
          falhar(e.message);
        }
      });
    });

    atualizarPrazo();
    atualizarAlvo();
    atualizarGerencia();
  }

  return modal.aoFechar.then((v) => (v && v.codigo ? v : null));
}

export { SITUACOES_EQUIPAMENTO, raw };
