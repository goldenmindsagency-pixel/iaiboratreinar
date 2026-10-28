// Comercial: painel de resultados, metas e importação de dados do EVO.
import { html, montar, $, on, opcoes, lerFormulario } from "../core/dom.js";
import { icone } from "../core/icones.js";
import { pode, nomeUnidade, minhasUnidades } from "../core/sessao.js";
import { estadoVazio, indicador, barra, avisar, avisarErro, abrirModal, comCarregamento, confirmar } from "../core/ui.js";
import { hoje, mesDe, somarMeses, nomeMes, inicioMes, fimMes, diasEntre, formatarData, formatarDataHora } from "../core/tempo.js";
import { numero, pct, moeda, razao, centavosParaTexto } from "../core/formato.js";
import { atualizarBusca } from "../core/rotas.js";
import { graficoBarras, ranking } from "../core/graficos.js";
import { mensagemDe } from "../core/erros.js";
import { TIPOS_META, TIPOS_EVO } from "../core/constantes.js";
import {
  resumoComercial, listarMetas, salvarMeta, realizadoMeta, lerTabela, prepararImportacao, importarEvo, listarImportacoes,
} from "../services/comercial.js";
import { FORMULAS } from "../services/indicadores.js";
import { pessoasPara, nomePessoa } from "../services/usuarios.js";

function seletorMes(mes) {
  const atual = mesDe(hoje());
  const lista = Array.from({ length: 13 }, (_, i) => somarMeses(atual, -i));
  return html`<div class="campo"><label for="f-mes">Mês</label><select id="f-mes" name="mes">${opcoes(lista.map((m) => ({ valor: m, rotulo: nomeMes(m) })), mes)}</select></div>`;
}

function ligarMes(alvo) {
  $("#f-mes", alvo)?.addEventListener("change", (ev) => atualizarBusca({ mes: ev.target.value }, { recarregar: true }));
}

const mesValido = (m) => (/^\d{4}-\d{2}$/.test(m || "") ? m : mesDe(hoje()));
const topo = (obj, n = 8) => Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).slice(0, n).map(([rotulo, valor]) => ({ rotulo, valor }));

function variacao(atual, anterior) {
  if (!anterior) return "";
  const v = (atual - anterior) / anterior;
  return `${v >= 0 ? "+" : ""}${Math.round(v * 100)}% vs. mês anterior`;
}

// ======================= Painel =======================
export async function painel(alvo, ctx, unidades) {
  const mes = mesValido(ctx.busca.mes);
  const ini = inicioMes(mes);
  const fim = mes === mesDe(hoje()) ? hoje() : fimMes(mes);
  const mesAnt = somarMeses(mes, -1);
  const [r, ant, metas] = await Promise.all([
    resumoComercial({ unidades, inicio: ini, fim }),
    resumoComercial({ unidades, inicio: inicioMes(mesAnt), fim: fimMes(mesAnt) }).catch(() => null),
    listarMetas({ unidades, mes }).catch(() => []),
  ]);
  const dias = diasEntre(ini, fim);
  const porDia = dias.map((d) => r.listaContatos.filter((c) => c.dataRef === d).length);
  const porUnidade = unidades.map((u) => ({
    u,
    contatos: r.listaContatos.filter((c) => c.unidadeId === u).length,
    matriculas: r.listaEvo.filter((e) => e.unidadeId === u && e.tipo === "matricula").length,
    renovacoes: r.listaEvo.filter((e) => e.unidadeId === u && e.tipo === "renovacao").length,
  }));
  const diasMes = Number(fimMes(mes).slice(8, 10));
  const ritmo = mes === mesDe(hoje()) ? Number(hoje().slice(8, 10)) / diasMes : 1;

  montar(
    alvo,
    html`<form class="filtros">${seletorMes(mes)}</form>
    ${!r.temEvo ? html`<div class="aviso aviso-marca" style="margin-bottom:16px">${icone("info")}<div>Matrículas, renovações, cancelamentos e receita vêm do EVO. Nenhum dado do EVO foi importado para este período — use a aba <a href="#/setor/comercial?aba=evo">Dados do EVO</a>.</div></div>` : ""}
    <div class="indicadores" style="margin-bottom:16px">
      ${indicador({ rotulo: "Contatos realizados", valor: numero(r.contatos), nota: ant ? variacao(r.contatos, ant.contatos) : "Registros manuais" })}
      ${indicador({ rotulo: "Prospecções ativas", valor: numero(r.prospeccao) })}
      ${indicador({ rotulo: "Leads recebidos", valor: numero(r.leads) })}
      ${indicador({ rotulo: "Visitas presenciais", valor: numero(r.visitas) })}
      ${indicador({ rotulo: "Novas matrículas", valor: numero(r.matriculas), nota: ant?.temEvo ? variacao(r.matriculas, ant.matriculas) : "Fonte: EVO" })}
      ${indicador({ rotulo: "Renovações", valor: numero(r.renovacoes), nota: "Fonte: EVO" })}
      ${indicador({ rotulo: "Cancelamentos", valor: numero(r.cancelamentos), tom: r.cancelamentos ? "alerta" : "", nota: "Fonte: EVO" })}
      ${indicador({ rotulo: "Receita de vendas", valor: moeda(r.receita), nota: "Matrículas + renovações (EVO)" })}
      ${indicador({ rotulo: "Taxa de conversão", valor: pct(r.conversao), formula: FORMULAS.conversao })}
    </div>
    ${metas.length
      ? html`<section class="painel" style="margin-bottom:16px">
          <div class="painel-cabecalho"><div><h3>Metas de ${nomeMes(mes)}</h3><p>${mes === mesDe(hoje()) ? `Ritmo esperado hoje: ${pct(ritmo)} da meta` : "Mês encerrado"}</p></div></div>
          <div class="pilha-sm">${metas.map((m) => {
            const real = realizadoMeta(m, r);
            const alc = razao(real, m.valor) ?? 0;
            const abaixo = alc < ritmo - 0.1;
            const fmt = (v) => (m.tipo === "receita" ? moeda(v) : numero(v));
            return html`<div class="ranking-item">
              <span>${TIPOS_META[m.tipo]?.rotulo}${m.vendedorNome ? html` · <strong>${m.vendedorNome}</strong>` : ""} <span class="texto-3">· ${nomeUnidade(m.unidadeId)} · fonte ${TIPOS_META[m.tipo]?.fonte === "evo" ? "EVO" : "registros"}</span></span>
              <strong class="numero" style="${abaixo ? "color:var(--pendente)" : alc >= 1 ? "color:var(--ok)" : ""}">${fmt(real)} / ${fmt(m.valor)} · ${pct(alc)}</strong>
              ${barra(alc, alc >= 1 ? "ok" : "")}
            </div>`;
          })}</div>
        </section>`
      : ""}
    <div class="grade-2" style="margin-bottom:16px">
      <section class="painel"><div class="painel-cabecalho"><div><h3>Contatos por dia</h3><p>Registros do relatório diário comercial</p></div></div>
        ${graficoBarras({ rotulos: dias.map((d) => formatarData(d, { curta: true })), series: [{ nome: "Contatos", valores: porDia }], titulo: "Contatos por dia" })}</section>
      <section class="painel"><div class="painel-cabecalho"><div><h3>Comparativo entre unidades</h3></div></div>
        ${unidades.length > 1
          ? graficoBarras({
              rotulos: porUnidade.map((x) => nomeUnidade(x.u)),
              series: [
                { nome: "Contatos", valores: porUnidade.map((x) => x.contatos) },
                { nome: "Matrículas", valores: porUnidade.map((x) => x.matriculas) },
                { nome: "Renovações", valores: porUnidade.map((x) => x.renovacoes) },
              ],
              titulo: "Comparativo entre unidades",
            })
          : html`<p class="pequeno texto-3">Selecione "Todas as unidades" no topo para comparar.</p>`}</section>
    </div>
    <div class="grade-3">
      <section class="painel"><div class="painel-cabecalho"><h3>Canais</h3></div>${Object.keys(r.porCanal).length ? ranking(topo(r.porCanal)) : html`<p class="pequeno texto-3">Sem registros.</p>`}</section>
      <section class="painel"><div class="painel-cabecalho"><h3>Resultados dos contatos</h3></div>${Object.keys(r.porResultado).length ? ranking(topo(r.porResultado)) : html`<p class="pequeno texto-3">Sem registros.</p>`}</section>
      <section class="painel"><div class="painel-cabecalho"><h3>Por pessoa</h3></div>${Object.keys(r.porVendedor).length ? ranking(topo(r.porVendedor)) : html`<p class="pequeno texto-3">Sem registros.</p>`}</section>
      <section class="painel"><div class="painel-cabecalho"><h3>Planos vendidos (EVO)</h3></div>${Object.keys(r.planos).length ? ranking(topo(r.planos)) : html`<p class="pequeno texto-3">Sem dados do EVO.</p>`}</section>
      <section class="painel"><div class="painel-cabecalho"><h3>Motivos de cancelamento</h3></div>${Object.keys(r.motivosCancelamento).length ? ranking(topo(r.motivosCancelamento), {}) : html`<p class="pequeno texto-3">Nenhum cancelamento.</p>`}</section>
      <section class="painel"><div class="painel-cabecalho"><h3>Tipos de contato</h3></div>${Object.keys(r.porTipo).length ? ranking(topo(r.porTipo)) : html`<p class="pequeno texto-3">Sem registros.</p>`}</section>
    </div>`
  );
  ligarMes(alvo);
}

// ======================= Metas =======================
export async function metas(alvo, ctx, unidades) {
  const mes = mesValido(ctx.busca.mes);
  const fim = mes === mesDe(hoje()) ? hoje() : fimMes(mes);
  const [lista, r] = await Promise.all([listarMetas({ unidades, mes }), resumoComercial({ unidades, inicio: inicioMes(mes), fim }).catch(() => null)]);
  const editar = pode("comercial", 3);
  montar(
    alvo,
    html`<div class="linha-entre"><form class="filtros">${seletorMes(mes)}</form>${editar ? html`<button class="btn btn-primario" data-nova>${icone("mais")} Nova meta</button>` : ""}</div>
    ${lista.length
      ? html`<div class="tabela-envoltorio"><table class="tabela responsiva">
          <thead><tr><th>Meta</th><th>Unidade</th><th>Escopo</th><th class="num">Meta</th><th class="num">Realizado</th><th>Alcance</th><th></th></tr></thead>
          <tbody>${lista.map((m) => {
            const real = r ? realizadoMeta(m, r) : 0;
            const alc = razao(real, m.valor) ?? 0;
            const fmt = (v) => (m.tipo === "receita" ? moeda(v) : numero(v));
            return html`<tr>
              <td class="principal-celula" data-rotulo="Meta"><strong>${TIPOS_META[m.tipo]?.rotulo}</strong><div class="pequeno texto-3">Fonte: ${TIPOS_META[m.tipo]?.fonte === "evo" ? "EVO" : "registros diários"}</div></td>
              <td data-rotulo="Unidade">${nomeUnidade(m.unidadeId)}</td>
              <td data-rotulo="Escopo">${m.vendedorNome || "Unidade"}</td>
              <td class="num" data-rotulo="Meta">${fmt(m.valor)}</td>
              <td class="num" data-rotulo="Realizado">${fmt(real)}</td>
              <td data-rotulo="Alcance" style="min-width:140px">${pct(alc)} ${barra(alc, alc >= 1 ? "ok" : "")}</td>
              <td class="direita" data-rotulo="">${editar ? html`<button class="btn btn-fantasma btn-sm" data-editar="${m.id}">${icone("editar")}</button>` : ""}</td>
            </tr>`;
          })}</tbody></table></div>`
      : estadoVazio({ icone: "alvo", titulo: `Nenhuma meta para ${nomeMes(mes)}`, texto: "Cadastre metas por unidade ou por vendedor para acompanhar o atingimento.", acao: editar ? html`<button class="btn btn-primario" data-nova>${icone("mais")} Nova meta</button>` : "" })}`
  );
  ligarMes(alvo);
  const porId = new Map(lista.map((m) => [m.id, m]));
  const abrir = async (m = null) => {
    const unidade0 = m?.unidadeId || unidades[0] || minhasUnidades()[0]?.id;
    const vendedores = await pessoasPara({ modulo: "comercial", nivelMinimo: 1 }).catch(() => []);
    abrirModal({
      titulo: m ? "Editar meta" : "Nova meta",
      corpo: html`<form class="grade-form" id="form-meta" novalidate>
        <div class="campo"><label for="m-tipo">Tipo</label><select id="m-tipo" name="tipo" ${m ? "disabled" : ""}>${opcoes(Object.entries(TIPOS_META).map(([v, t]) => ({ valor: v, rotulo: t.rotulo })), m?.tipo)}</select></div>
        <div class="campo"><label for="m-un">Unidade</label><select id="m-un" name="unidadeId" ${m ? "disabled" : ""}>${opcoes(minhasUnidades().map((u) => ({ valor: u.id, rotulo: u.nome })), unidade0)}</select></div>
        <div class="campo"><label for="m-mes">Mês</label><input id="m-mes" type="month" name="mes" value="${m?.mes || mes}" ${m ? "disabled" : ""} /></div>
        <div class="campo"><label for="m-vend">Escopo</label><select id="m-vend" name="vendedorLogin" ${m ? "disabled" : ""}><option value="">Meta da unidade</option>${opcoes(vendedores.map((v) => ({ valor: v.login, rotulo: v.nome })), m?.vendedorLogin)}</select></div>
        <div class="campo largo"><label for="m-valor" class="obrigatorio">Valor da meta</label><input id="m-valor" name="valor" inputmode="decimal" value="${m ? (m.tipo === "receita" ? centavosParaTexto(m.valor) : m.valor) : ""}" /><span class="ajuda">Para receita, informe em reais (ex.: 24.000,00).</span></div>
        ${m && pode("comercial", 4) ? html`<label class="marcar largo"><input type="checkbox" name="desativar" /> Desativar esta meta</label>` : ""}
        <div class="aviso aviso-erro oculto largo" id="erro-meta"></div>
      </form>`,
      rodape: html`<button class="btn btn-secundario" data-fechar>Cancelar</button><button class="btn btn-primario" data-ok>Salvar</button>`,
      aoMontar: (mel, fechar) =>
        on(mel, "click", "[data-ok]", (ev, b) =>
          comCarregamento(b, async () => {
            const d = lerFormulario($("#form-meta", mel));
            try {
              const base = m ? { tipo: m.tipo, unidadeId: m.unidadeId, mes: m.mes, vendedorLogin: m.vendedorLogin, vendedorNome: m.vendedorNome } : { ...d, vendedorNome: d.vendedorLogin ? nomePessoa(d.vendedorLogin) : "" };
              await salvarMeta(m?.id || null, { ...base, valor: d.valor, ativo: !d.desativar });
              avisar("Meta salva.");
              fechar(true);
              ctx.recarregar();
            } catch (e) {
              const c = $("#erro-meta", mel);
              c.textContent = mensagemDe(e);
              c.classList.remove("oculto");
            }
          })
        ),
    });
  };
  on(alvo, "click", "[data-nova]", () => abrir());
  on(alvo, "click", "[data-editar]", (ev, b) => abrir(porId.get(b.dataset.editar)));
}

// ======================= EVO =======================
const CAMPOS_EVO = [
  { id: "data", rotulo: "Data", obrigatorio: true, palavras: ["data", "dt", "venda", "inicio"] },
  { id: "codigo", rotulo: "Código do aluno", obrigatorio: true, palavras: ["codigo", "cód", "id", "matricula", "cliente"] },
  { id: "nome", rotulo: "Nome do aluno", palavras: ["nome", "aluno", "cliente"] },
  { id: "tipo", rotulo: "Tipo (matrícula/renovação/cancelamento)", palavras: ["tipo", "operacao", "situacao", "status"] },
  { id: "plano", rotulo: "Plano", palavras: ["plano", "contrato", "produto"] },
  { id: "valor", rotulo: "Valor (R$)", palavras: ["valor", "total", "preco", "r$"] },
  { id: "vendedor", rotulo: "Vendedor/consultor", palavras: ["vendedor", "consultor", "responsavel", "colaborador"] },
  { id: "motivo", rotulo: "Motivo (cancelamento)", palavras: ["motivo"] },
];

function adivinharColuna(cabecalho, campo) {
  const norm = cabecalho.map((c) => String(c).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""));
  for (const p of campo.palavras) {
    const i = norm.findIndex((c) => c.includes(p));
    if (i >= 0) return String(i);
  }
  return "";
}

export async function evo(alvo, ctx, unidades) {
  const importacoes = await listarImportacoes(unidades).catch(() => []);
  const podeImportar = pode("comercial", 3);
  montar(
    alvo,
    html`${podeImportar
      ? html`<section class="painel" style="margin-bottom:16px" id="importador">
          <div class="painel-cabecalho"><div><h3>Importar dados do EVO</h3><p>Exporte o relatório no EVO (matrículas, renovações ou cancelamentos), abra no Excel, selecione as células e cole aqui — ou envie o arquivo CSV.</p></div></div>
          <form class="pilha" id="form-evo" novalidate>
            <div class="grade-form">
              <div class="campo"><label for="evo-un">Unidade</label><select id="evo-un" name="unidadeId">${opcoes(minhasUnidades().filter((u) => unidades.includes(u.id)).map((u) => ({ valor: u.id, rotulo: u.nome })))}</select></div>
              <div class="campo"><label for="evo-tipo">Tipo dos registros</label><select id="evo-tipo" name="tipoPadrao">${opcoes(Object.entries(TIPOS_EVO).map(([v, r]) => ({ valor: v, rotulo: r })), "matricula")}</select><span class="ajuda">Usado quando a planilha não tem coluna de tipo.</span></div>
              <div class="campo"><label for="evo-arq">Arquivo CSV (opcional)</label><input id="evo-arq" type="file" accept=".csv,.txt,text/csv" /></div>
            </div>
            <div class="campo"><label for="evo-texto">Dados colados</label><textarea id="evo-texto" name="texto" style="min-height:140px;font-family:ui-monospace,monospace;font-size:12px" placeholder="Cole aqui as linhas copiadas do Excel (com a linha de títulos)"></textarea></div>
            <label class="marcar"><input type="checkbox" name="temCabecalho" checked /> A primeira linha tem os títulos das colunas</label>
            <div><button type="button" class="btn btn-secundario" data-ler>${icone("busca")} Ler planilha</button></div>
            <div id="evo-mapa"></div>
          </form>
        </section>`
      : ""}
    <section class="painel">
      <div class="painel-cabecalho"><h3>Importações realizadas</h3></div>
      ${importacoes.length
        ? html`<div class="tabela-envoltorio" style="border:0"><table class="tabela responsiva"><thead><tr><th>Quando</th><th>Unidade</th><th>Origem</th><th class="num">Linhas</th><th class="num">Importadas</th><th class="num">Já existiam</th><th>Por</th></tr></thead>
            <tbody>${importacoes.map((i) => html`<tr><td class="principal-celula" data-rotulo="Quando">${formatarDataHora(i.em)}</td><td data-rotulo="Unidade">${nomeUnidade(i.unidadeId)}</td><td data-rotulo="Origem">${i.arquivo}</td><td class="num" data-rotulo="Linhas">${i.linhas}</td><td class="num" data-rotulo="Importadas">${i.importadas}</td><td class="num" data-rotulo="Já existiam">${i.duplicadas}</td><td data-rotulo="Por">${i.autorNome}</td></tr>`)}</tbody></table></div>`
        : html`<p class="pequeno texto-3">Nenhuma importação ainda.</p>`}
    </section>`
  );
  if (!podeImportar) return;

  let matriz = [];
  let nomeArquivo = "";
  $("#evo-arq", alvo).addEventListener("change", async (ev) => {
    const arq = ev.target.files?.[0];
    if (!arq) return;
    nomeArquivo = arq.name;
    const buffer = await arq.arrayBuffer();
    let texto = new TextDecoder("utf-8").decode(buffer);
    if (texto.includes("�")) texto = new TextDecoder("windows-1252").decode(buffer); // planilhas antigas do Excel
    $("#evo-texto", alvo).value = texto.replace(/^﻿/, "");
  });

  on(alvo, "click", "[data-ler]", () => {
    const form = $("#form-evo", alvo);
    const d = lerFormulario(form);
    matriz = lerTabela(d.texto);
    if (matriz.length < (d.temCabecalho ? 2 : 1)) {
      avisar("Cole os dados da planilha (com pelo menos uma linha de dados).", "erro");
      return;
    }
    const cab = d.temCabecalho ? matriz[0] : matriz[0].map((_, i) => `Coluna ${i + 1}`);
    const colunas = cab.map((c, i) => ({ valor: String(i), rotulo: `${String.fromCharCode(65 + (i % 26))} — ${c || `Coluna ${i + 1}`}` }));
    montar(
      $("#evo-mapa", alvo),
      html`<div class="painel painel-compacto pilha">
        <h4>Qual coluna corresponde a cada informação?</h4>
        <div class="grade-form">${CAMPOS_EVO.map(
          (c) => html`<div class="campo"><label class="${c.obrigatorio ? "obrigatorio" : ""}">${c.rotulo}</label><select data-mapa="${c.id}"><option value="">— não importar —</option>${opcoes(colunas, d.temCabecalho ? adivinharColuna(cab, c) : "")}</select></div>`
        )}</div>
        <div class="tabela-envoltorio"><table class="tabela"><thead><tr>${cab.map((c) => html`<th>${c}</th>`)}</tr></thead><tbody>${matriz.slice(d.temCabecalho ? 1 : 0, (d.temCabecalho ? 1 : 0) + 5).map((l) => html`<tr>${l.map((x) => html`<td>${x}</td>`)}</tr>`)}</tbody></table></div>
        <p class="pequeno texto-3">Pré-visualização das 5 primeiras linhas de ${numero(matriz.length - (d.temCabecalho ? 1 : 0))}. Por privacidade, guardamos só o primeiro nome e o sobrenome do aluno.</p>
        <div id="evo-validacao"></div>
        <div><button type="button" class="btn btn-primario" data-importar>${icone("enviar")} Validar e importar</button></div>
      </div>`
    );
  });

  on(alvo, "click", "[data-importar]", async (ev, botao) => {
    const form = $("#form-evo", alvo);
    const d = lerFormulario(form);
    const mapa = {};
    alvo.querySelectorAll("[data-mapa]").forEach((s) => (mapa[s.dataset.mapa] = s.value));
    if (mapa.data === "" || mapa.codigo === "") {
      avisar("Indique as colunas de data e de código do aluno.", "erro");
      return;
    }
    const { validas, rejeitadas } = prepararImportacao({ matriz, mapa, temCabecalho: d.temCabecalho, tipoPadrao: d.tipoPadrao, unidadeId: d.unidadeId });
    montar(
      $("#evo-validacao", alvo),
      html`<div class="aviso ${rejeitadas.length ? "aviso-marca" : "aviso-ok"}">${icone(rejeitadas.length ? "alerta" : "okCirculo")}<div>
        <strong>${numero(validas.length)} linha(s) válida(s)</strong>${rejeitadas.length ? html` e ${numero(rejeitadas.length)} com problema (não serão importadas):
          <ul style="margin:6px 0 0;padding-left:18px">${rejeitadas.slice(0, 6).map((r) => html`<li>Linha ${r.linha}: ${r.problemas.join(", ")}</li>`)}</ul>` : ""}
        <div class="pequeno" style="margin-top:6px">Matrículas: ${validas.filter((v) => v.tipo === "matricula").length} · Renovações: ${validas.filter((v) => v.tipo === "renovacao").length} · Cancelamentos: ${validas.filter((v) => v.tipo === "cancelamento").length}</div>
      </div></div>`
    );
    if (!validas.length) return;
    const ok = await confirmar({
      titulo: "Importar dados do EVO?",
      mensagem: `${validas.length} registro(s) para ${nomeUnidade(d.unidadeId)}. Registros que já foram importados antes são ignorados automaticamente.`,
      confirmarTexto: "Importar",
    });
    if (!ok) return;
    await comCarregamento(botao, async () => {
      try {
        const r = await importarEvo({ unidadeId: d.unidadeId, validas, nomeArquivo });
        avisar(`Importação concluída: ${r.importadas} novo(s), ${r.duplicadas} já existiam.`);
        ctx.recarregar();
      } catch (e) {
        avisarErro(e);
      }
    });
  });
}
