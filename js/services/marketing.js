// Marketing: conteúdos e campanhas com etapas, calendário e resultados.
import { pode, naUnidade, meuLogin } from "../core/sessao.js";
import { ErroSistema } from "../core/erros.js";
import { ETAPAS_MARKETING } from "../core/constantes.js";
import { mesDe, mesesEntre, hoje } from "../core/tempo.js";
import { paraCentavos } from "../core/formato.js";
import { bd, gravarAuditado, exigir, unirConsultas } from "./base.js";

export async function listarAcoes({ unidades, inicio, fim }) {
  const promessas = [];
  for (const u of unidades) {
    if (!naUnidade(u) || !pode("marketing", 1)) continue;
    for (const m of mesesEntre(inicio, fim)) {
      const f = [["unidadeId", "==", u], ["mes", "==", m]];
      if (!pode("marketing", 2)) f.push(["responsavelLogin", "==", meuLogin()]);
      promessas.push(bd().consultar("marketingAcoes", f));
    }
  }
  if (!promessas.length) return [];
  const lista = await unirConsultas(promessas);
  return lista
    .filter((a) => a.ativo !== false && a.dataPrevista >= inicio && a.dataPrevista <= fim)
    .sort((a, b) => (a.dataPrevista || "").localeCompare(b.dataPrevista || ""));
}

export async function obterAcao(id) {
  return bd().obter(`marketingAcoes/${id}`);
}

function numeroOuZero(v) {
  const n = Number(String(v ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

export async function salvarAcao(id, d) {
  const limpo = {
    tipo: d.tipo === "campanha" ? "campanha" : "conteudo",
    titulo: (d.titulo || "").trim(),
    descricao: (d.descricao || "").trim(),
    unidadeId: d.unidadeId,
    plataformas: d.plataformas || [],
    campanhaId: d.campanhaId || "",
    etapa: ETAPAS_MARKETING.some((e) => e.id === d.etapa) ? d.etapa : "ideia",
    dataPrevista: d.dataPrevista,
    dataFim: d.dataFim || "",
    mes: d.dataPrevista ? mesDe(d.dataPrevista) : "",
    responsavelLogin: d.responsavelLogin || "",
    responsavelNome: d.responsavelNome || "",
    publicadoEm: d.etapa === "publicado" ? d.publicadoEm || hoje() : "",
    resultados: {
      alcance: numeroOuZero(d.alcance ?? d.resultados?.alcance),
      engajamento: numeroOuZero(d.engajamento ?? d.resultados?.engajamento),
      leads: numeroOuZero(d.leads ?? d.resultados?.leads),
      investimento: d.investimento !== undefined ? paraCentavos(d.investimento) || 0 : d.resultados?.investimento || 0,
    },
    ativo: d.ativo !== false,
  };
  exigir(limpo.titulo.length >= 3, "Informe o título.");
  exigir(limpo.unidadeId && naUnidade(limpo.unidadeId), "Selecione a unidade.");
  exigir(/^\d{4}-\d{2}-\d{2}$/.test(limpo.dataPrevista || ""), "Informe a data prevista.");
  if (!id) {
    exigir(pode("marketing", 3), "Você não tem permissão para criar ações de marketing.");
    id = bd().novoId("marketingAcoes");
    await gravarAuditado({ colecao: "marketingAcoes", id, dados: limpo, resumo: `Criou "${limpo.titulo}"`, unidadeId: limpo.unidadeId });
  } else {
    const antes = await obterAcao(id);
    if (!antes) throw new ErroSistema("nao-encontrado");
    if (pode("marketing", 3)) {
      if (antes.ativo !== limpo.ativo) exigir(pode("marketing", 4), "Você não tem permissão para arquivar ações.");
      await gravarAuditado({ colecao: "marketingAcoes", id, dados: limpo, antes, resumo: `Alterou "${limpo.titulo}"`, unidadeId: limpo.unidadeId });
    } else {
      // Responsável (nível próprio): só avança etapa e lança resultados
      exigir(antes.responsavelLogin === meuLogin(), "Você só pode atualizar ações sob sua responsabilidade.");
      await gravarAuditado({
        colecao: "marketingAcoes",
        id,
        dados: { etapa: limpo.etapa, resultados: limpo.resultados, publicadoEm: limpo.publicadoEm },
        antes,
        resumo: `Atualizou "${antes.titulo}"`,
        unidadeId: antes.unidadeId,
      });
    }
  }
  return id;
}

export async function moverEtapa(acao, etapa) {
  return salvarAcao(acao.id, { ...acao, etapa, publicadoEm: etapa === "publicado" ? acao.publicadoEm || hoje() : "" });
}

/**
 * Indicadores: produzidos = etapa aprovado ou publicado; publicados = etapa publicado;
 * cumprimento do calendário = publicados até a data prevista ÷ conteúdos com data prevista já vencida.
 */
export function resumoMarketing(acoes) {
  const conteudos = acoes.filter((a) => a.tipo === "conteudo");
  const campanhas = acoes.filter((a) => a.tipo === "campanha");
  const publicados = conteudos.filter((a) => a.etapa === "publicado");
  const produzidos = conteudos.filter((a) => ["aprovado", "publicado"].includes(a.etapa));
  const vencidos = conteudos.filter((a) => a.dataPrevista < hoje() || a.etapa === "publicado");
  const noPrazo = vencidos.filter((a) => a.etapa === "publicado" && (!a.publicadoEm || a.publicadoEm <= a.dataPrevista));
  const soma = (campo) => acoes.reduce((s, a) => s + (a.resultados?.[campo] || 0), 0);
  return {
    conteudos: conteudos.length,
    campanhas: campanhas.length,
    produzidos: produzidos.length,
    publicados: publicados.length,
    atrasados: conteudos.filter((a) => a.etapa !== "publicado" && a.dataPrevista < hoje()).length,
    cumprimento: vencidos.length ? noPrazo.length / vencidos.length : null,
    alcance: soma("alcance"),
    engajamento: soma("engajamento"),
    leads: soma("leads"),
    investimento: soma("investimento"),
    porEtapa: Object.fromEntries(ETAPAS_MARKETING.map((e) => [e.id, conteudos.filter((a) => a.etapa === e.id).length])),
  };
}
