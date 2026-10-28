// Marketing: calendário de conteúdo, quadro por etapas, campanhas e resultados.
import { html, montar, $, on, opcoes, lerFormulario } from "../core/dom.js";
import { icone } from "../core/icones.js";
import { pode, nomeUnidade, unidadesFiltro, minhasUnidades, meuLogin } from "../core/sessao.js";
import { estadoVazio, indicador, abrirModal, avisar, comCarregamento } from "../core/ui.js";
import { hoje, mesDe, somarMeses, nomeMes, inicioMes, fimMes, diaSemana, somarDias, formatarData } from "../core/tempo.js";
import { numero, pct, moeda, centavosParaTexto } from "../core/formato.js";
import { atualizarBusca } from "../core/rotas.js";
import { ranking } from "../core/graficos.js";
import { mensagemDe } from "../core/erros.js";
import { ETAPAS_MARKETING, PLATAFORMAS } from "../core/constantes.js";
import { listarAcoes, salvarAcao, moverEtapa, resumoMarketing } from "../services/marketing.js";
import { pessoasPara, nomePessoa } from "../services/usuarios.js";
import { cabecalho, abas } from "./comum.js";

const COR_ETAPA = { ideia: "#75716a", planejamento: "#b49cff", producao: "#5aa9ff", revisao: "#ff7a6b", aprovado: "#fda905", publicado: "#3dd68c" };

export default async function telaMarketing(el, ctx) {
  const unidades = unidadesFiltro().map((u) => u.id);
  const mes = /^\d{4}-\d{2}$/.test(ctx.busca.mes || "") ? ctx.busca.mes : mesDe(hoje());
  const aba = ["calendario", "quadro", "resultados"].includes(ctx.busca.aba) ? ctx.busca.aba : "calendario";
  const acoes = await listarAcoes({ unidades, inicio: inicioMes(mes), fim: fimMes(mes) });
  const r = resumoMarketing(acoes);
  const editar = pode("marketing", 3);

  montar(
    el,
    html`${cabecalho(
      "Marketing",
      "Planejamento de conteúdos e campanhas, produção e resultados.",
      editar ? html`<button class="btn btn-primario" data-nova>${icone("mais")} Novo conteúdo ou campanha</button>` : ""
    )}
    ${abas([{ id: "calendario", rotulo: "Calendário" }, { id: "quadro", rotulo: "Produção" }, { id: "resultados", rotulo: "Resultados" }], aba, `#/marketing?mes=${mes}`)}
    <div class="linha-entre" style="margin-bottom:16px">
      <div class="linha" style="gap:6px">
        <a class="btn btn-secundario btn-sm" href="#/marketing?aba=${aba}&mes=${somarMeses(mes, -1)}">${icone("esquerda")}</a>
        <strong style="min-width:150px;text-align:center;text-transform:capitalize">${nomeMes(mes)}</strong>
        <a class="btn btn-secundario btn-sm" href="#/marketing?aba=${aba}&mes=${somarMeses(mes, 1)}">${icone("direita")}</a>
      </div>
      <div class="linha" style="gap:8px">${ETAPAS_MARKETING.map((e) => html`<span class="pequeno texto-2" style="display:inline-flex;gap:5px;align-items:center"><i style="width:9px;height:9px;border-radius:2px;background:${COR_ETAPA[e.id]};display:inline-block"></i>${e.nome}</span>`)}</div>
    </div>
    <div id="conteudo-aba"></div>`
  );
  const alvo = $("#conteudo-aba", el);

  if (aba === "calendario") {
    const primeiro = inicioMes(mes);
    const ultimo = fimMes(mes);
    const ds = diaSemana(primeiro);
    const inicioGrade = somarDias(primeiro, -(ds === 0 ? 6 : ds - 1));
    const dias = Array.from({ length: 42 }, (_, i) => somarDias(inicioGrade, i)).filter((d, i) => i < 35 || d <= ultimo);
    montar(
      alvo,
      html`<div class="calendario">
        ${["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => html`<div class="calendario-cab">${d}</div>`)}
        ${dias.map((d) => {
          const doDia = acoes.filter((a) => a.dataPrevista === d);
          return html`<div class="calendario-dia ${d.slice(0, 7) !== mes ? "fora" : ""} ${d === hoje() ? "hoje" : ""}">
            <span class="calendario-num">${Number(d.slice(8))}</span>
            ${doDia.map((a) => html`<button type="button" class="calendario-evento" data-acao="${a.id}" style="border-left-color:${COR_ETAPA[a.etapa]}" title="${a.titulo}">${a.tipo === "campanha" ? "★ " : ""}${a.titulo}</button>`)}
          </div>`;
        })}
      </div>
      ${!acoes.length ? html`<p class="pequeno texto-3" style="margin-top:12px">Nenhum conteúdo programado em ${nomeMes(mes)}.</p>` : ""}`
    );
  } else if (aba === "quadro") {
    montar(
      alvo,
      html`<div class="quadro">${ETAPAS_MARKETING.map((e) => {
        const itens = acoes.filter((a) => a.etapa === e.id);
        return html`<div class="quadro-coluna"><h3><span>${e.nome}</span><span class="texto-3">${itens.length}</span></h3>
          ${itens.map(
            (a) => html`<button type="button" class="cartao-quadro" data-acao="${a.id}" style="border-left:3px solid ${COR_ETAPA[a.etapa]}">
              <div class="forte">${a.tipo === "campanha" ? "★ " : ""}${a.titulo}</div>
              <div class="pequeno texto-3">${formatarData(a.dataPrevista, { curta: true })} · ${(a.plataformas || []).join(", ") || "—"}${a.responsavelNome ? ` · ${a.responsavelNome}` : ""}</div>
              ${a.etapa !== "publicado" && a.dataPrevista < hoje() ? html`<span class="selo selo-pendente" style="margin-top:6px">Atrasado</span>` : ""}
            </button>`
          )}</div>`;
      })}</div>`
    );
  } else {
    const porPlataforma = {};
    acoes.forEach((a) => (a.plataformas || []).forEach((p) => (porPlataforma[p] = (porPlataforma[p] || 0) + (a.resultados?.alcance || 0))));
    const publicados = acoes.filter((a) => a.etapa === "publicado").sort((a, b) => (b.resultados?.alcance || 0) - (a.resultados?.alcance || 0));
    montar(
      alvo,
      html`<div class="indicadores" style="margin-bottom:16px">
        ${indicador({ rotulo: "Conteúdos planejados", valor: numero(r.conteudos) })}
        ${indicador({ rotulo: "Produzidos", valor: numero(r.produzidos), nota: "Aprovados ou publicados" })}
        ${indicador({ rotulo: "Publicados", valor: numero(r.publicados) })}
        ${indicador({ rotulo: "Atrasados", valor: numero(r.atrasados), tom: r.atrasados ? "alerta" : "" })}
        ${indicador({ rotulo: "Cumprimento do calendário", valor: pct(r.cumprimento), formula: "Publicados até a data prevista ÷ conteúdos com data prevista já vencida." })}
        ${indicador({ rotulo: "Alcance", valor: numero(r.alcance), nota: "Informado manualmente" })}
        ${indicador({ rotulo: "Engajamento", valor: numero(r.engajamento) })}
        ${indicador({ rotulo: "Leads gerados", valor: numero(r.leads) })}
        ${indicador({ rotulo: "Investimento", valor: moeda(r.investimento) })}
      </div>
      <div class="grade-2">
        <section class="painel"><div class="painel-cabecalho"><h3>Alcance por plataforma</h3></div>${Object.keys(porPlataforma).length ? ranking(Object.entries(porPlataforma).sort((a, b) => b[1] - a[1]).map(([rotulo, valor]) => ({ rotulo, valor })), { formato: numero }) : html`<p class="pequeno texto-3">Sem resultados lançados.</p>`}</section>
        <section class="painel"><div class="painel-cabecalho"><h3>Publicações por alcance</h3></div>
          ${publicados.length ? html`<div class="lista">${publicados.slice(0, 10).map((a) => html`<button type="button" class="lista-item clicavel" data-acao="${a.id}" style="background:none;border:0;color:inherit;text-align:left;width:calc(100% + 20px)"><div class="expande"><div class="lista-item-titulo">${a.titulo}</div><div class="lista-item-sub">${formatarData(a.publicadoEm || a.dataPrevista)} · ${nomeUnidade(a.unidadeId)}</div></div><span class="pequeno">${numero(a.resultados?.alcance || 0)} alcance · ${numero(a.resultados?.leads || 0)} leads</span></button>`)}</div>` : html`<p class="pequeno texto-3">Nenhuma publicação no mês.</p>`}</section>
      </div>`
    );
  }

  const porId = new Map(acoes.map((a) => [a.id, a]));
  on(el, "click", "[data-acao]", (ev, b) => abrirAcao(porId.get(b.dataset.acao), ctx, acoes));
  on(el, "click", "[data-nova]", () => abrirAcao(null, ctx, acoes, mes));
}

async function abrirAcao(a, ctx, todas, mes) {
  const editar = pode("marketing", 3);
  const responsavel = a && a.responsavelLogin === meuLogin();
  const somenteResultados = !editar && responsavel;
  const pessoas = editar ? await pessoasPara({ modulo: "marketing" }).catch(() => []) : [];
  const campanhas = todas.filter((x) => x.tipo === "campanha" && x.id !== a?.id);
  const d = a || { tipo: "conteudo", etapa: "ideia", dataPrevista: mes === mesDe(hoje()) ? hoje() : `${mes}-01`, plataformas: ["Instagram"], unidadeId: unidadesFiltro()[0]?.id, resultados: {} };
  const desabilitado = editar ? "" : "disabled";
  abrirModal({
    titulo: a ? a.titulo : "Novo conteúdo ou campanha",
    largo: true,
    corpo: html`<form class="grade-form" id="form-mkt" novalidate>
      <div class="campo"><label>Tipo</label><select name="tipo" ${desabilitado}>${opcoes([{ valor: "conteudo", rotulo: "Conteúdo" }, { valor: "campanha", rotulo: "Campanha" }], d.tipo)}</select></div>
      <div class="campo"><label>Unidade</label><select name="unidadeId" ${desabilitado}>${opcoes(minhasUnidades().map((u) => ({ valor: u.id, rotulo: u.nome })), d.unidadeId)}</select></div>
      <div class="campo largo"><label class="obrigatorio">Título</label><input name="titulo" value="${d.titulo || ""}" maxlength="120" ${desabilitado} /></div>
      <div class="campo largo"><label>Descrição / roteiro</label><textarea name="descricao" maxlength="2000" ${desabilitado}>${d.descricao || ""}</textarea></div>
      <div class="campo"><label class="obrigatorio">Data prevista</label><input type="date" name="dataPrevista" value="${d.dataPrevista || ""}" ${desabilitado} /></div>
      ${d.tipo === "campanha" || !a ? html`<div class="campo"><label>Término (campanha)</label><input type="date" name="dataFim" value="${d.dataFim || ""}" ${desabilitado} /></div>` : ""}
      <div class="campo"><label>Etapa</label><select name="etapa" ${editar || responsavel ? "" : "disabled"}>${opcoes(ETAPAS_MARKETING.map((e) => ({ valor: e.id, rotulo: e.nome })), d.etapa)}</select></div>
      ${editar ? html`<div class="campo"><label>Responsável</label><select name="responsavelLogin"><option value="">—</option>${opcoes(pessoas.map((p) => ({ valor: p.login, rotulo: p.nome })), d.responsavelLogin)}</select></div>` : ""}
      ${campanhas.length && editar ? html`<div class="campo"><label>Faz parte da campanha</label><select name="campanhaId"><option value="">—</option>${opcoes(campanhas.map((c) => ({ valor: c.id, rotulo: c.titulo })), d.campanhaId)}</select></div>` : ""}
      <div class="campo largo"><span class="rotulo">Plataformas</span><div class="linha" style="gap:6px">${PLATAFORMAS.map((p) => html`<label class="chip" style="cursor:pointer;padding:6px 10px"><input type="checkbox" name="plataformas" value="${p}" ${(d.plataformas || []).includes(p) ? "checked" : ""} ${desabilitado} style="accent-color:var(--ambar)" /> ${p}</label>`)}</div></div>
      <div class="largo"><h4 style="margin:6px 0 10px">Resultados (preenchimento manual)</h4><div class="grade-form">
        <div class="campo"><label>Alcance</label><input name="alcance" inputmode="numeric" value="${d.resultados?.alcance || ""}" /></div>
        <div class="campo"><label>Engajamento</label><input name="engajamento" inputmode="numeric" value="${d.resultados?.engajamento || ""}" /></div>
        <div class="campo"><label>Leads gerados</label><input name="leads" inputmode="numeric" value="${d.resultados?.leads || ""}" /></div>
        <div class="campo"><label>Investimento (R$)</label><input name="investimento" inputmode="decimal" value="${d.resultados?.investimento ? centavosParaTexto(d.resultados.investimento) : ""}" /></div>
      </div></div>
      ${a && pode("marketing", 4) ? html`<label class="marcar largo"><input type="checkbox" name="arquivar" /> Arquivar (some do calendário; o histórico é mantido)</label>` : ""}
      <div class="aviso aviso-erro oculto largo" id="erro-mkt"></div>
    </form>`,
    rodape: editar || responsavel
      ? html`<button class="btn btn-secundario" data-fechar>Cancelar</button>${a && a.etapa !== "publicado" ? html`<button class="btn btn-secundario" data-publicar>${icone("check")} Marcar como publicado</button>` : ""}<button class="btn btn-primario" data-ok>Salvar</button>`
      : html`<button class="btn btn-secundario" data-fechar>Fechar</button>`,
    aoMontar: (mel, fechar) => {
      const salvar = async (botao, extra = {}) =>
        comCarregamento(botao, async () => {
          const f = lerFormulario($("#form-mkt", mel));
          try {
            const dados = somenteResultados ? { ...a, etapa: f.etapa, alcance: f.alcance, engajamento: f.engajamento, leads: f.leads, investimento: f.investimento } : { ...a, ...f, plataformas: Array.isArray(f.plataformas) ? f.plataformas : f.plataformas ? [PLATAFORMAS[0]] : [], responsavelNome: f.responsavelLogin ? nomePessoa(f.responsavelLogin) : "", ativo: !f.arquivar };
            await salvarAcao(a?.id || null, { ...dados, ...extra });
            avisar("Salvo.");
            fechar(true);
            ctx.recarregar();
          } catch (e) {
            const c = $("#erro-mkt", mel);
            c.textContent = mensagemDe(e);
            c.classList.remove("oculto");
          }
        });
      on(mel, "click", "[data-ok]", (ev, b) => salvar(b));
      on(mel, "click", "[data-publicar]", (ev, b) => salvar(b, { etapa: "publicado", publicadoEm: hoje() }));
    },
  });
}

export { moverEtapa };
