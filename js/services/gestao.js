// Gestão gerencial: investimentos e relatório mensal com aprovação da diretoria.
import { sessao, pode, naUnidade, aprovador, meuLogin } from "../core/sessao.js";
import { ErroSistema } from "../core/erros.js";
import { STATUS_INVESTIMENTO } from "../core/constantes.js";
import { paraCentavos } from "../core/formato.js";
import { hoje } from "../core/tempo.js";
import { bd, auditar, carimboCriacao, carimboAtualizacao, gravarAuditado, exigir, unirConsultas } from "./base.js";

// ---------------- Investimentos ----------------
export async function listarInvestimentos(unidades) {
  const lista = await unirConsultas(unidades.filter(naUnidade).map((u) => bd().consultar("investimentos", [["unidadeId", "==", u]])));
  return lista.sort((a, b) => (b.criadoEm?.getTime?.() || 0) - (a.criadoEm?.getTime?.() || 0));
}

export async function salvarInvestimento(id, d) {
  exigir(pode("gestao", 3), "Você não tem permissão para cadastrar investimentos.");
  const limpo = {
    unidadeId: d.unidadeId,
    titulo: (d.titulo || "").trim(),
    descricao: (d.descricao || "").trim(),
    setorId: d.setorId || "estrutura",
    prioridade: d.prioridade || "media",
    valorEstimado: paraCentavos(d.valorEstimado) || 0,
    orcamentos: (d.orcamentos || []).filter((o) => o.fornecedor || o.valor).map((o) => ({ fornecedor: (o.fornecedor || "").trim(), valor: paraCentavos(o.valor) || 0 })),
    pendenciaId: d.pendenciaId || "",
    status: d.status && STATUS_INVESTIMENTO[d.status] ? d.status : "identificado",
    valorRealizado: d.valorRealizado ? paraCentavos(d.valorRealizado) || 0 : 0,
    dataRealizacao: d.dataRealizacao || "",
  };
  exigir(limpo.titulo.length >= 3, "Informe o título do investimento.");
  exigir(limpo.unidadeId && naUnidade(limpo.unidadeId), "Selecione a unidade.");
  if (limpo.status === "realizado") exigir(limpo.valorRealizado > 0 && limpo.dataRealizacao, "Informe o valor e a data de realização.");
  if (!id) {
    exigir(["identificado", "orcado"].includes(limpo.status), "Novos investimentos começam como identificados ou orçados.");
    id = bd().novoId("investimentos");
    await gravarAuditado({ colecao: "investimentos", id, dados: limpo, resumo: `Investimento: ${limpo.titulo}`, unidadeId: limpo.unidadeId });
  } else {
    const antes = await bd().obter(`investimentos/${id}`);
    if (!antes) throw new ErroSistema("nao-encontrado");
    if (limpo.status !== antes.status && (limpo.status === "aprovado" || antes.status === "aprovado" && limpo.status !== "realizado")) {
      exigir(aprovador(), "Somente a diretoria aprova investimentos.");
    }
    await gravarAuditado({ colecao: "investimentos", id, dados: limpo, antes, resumo: `Alterou investimento: ${limpo.titulo}`, unidadeId: limpo.unidadeId });
  }
  return id;
}

export async function decidirInvestimento(inv, aprovar, comentario = "") {
  exigir(aprovador(), "Somente a diretoria aprova investimentos.");
  const status = aprovar ? "aprovado" : "descartado";
  await gravarAuditado({
    colecao: "investimentos",
    id: inv.id,
    dados: { status, aprovacao: { porLogin: meuLogin(), porNome: sessao.perfil.nome, em: hoje(), comentario } },
    antes: inv,
    acao: aprovar ? "aprovar" : "descartar",
    resumo: `${aprovar ? "Aprovou" : "Descartou"} investimento: ${inv.titulo}`,
    unidadeId: inv.unidadeId,
  });
}

// ---------------- Relatório mensal ----------------
export const SECOES_RELATORIO = [
  { id: "resumo", titulo: "Resumo executivo da unidade" },
  { id: "produtividade", titulo: "Produtividade operacional" },
  { id: "comercial", titulo: "Resultados comerciais" },
  { id: "marketing", titulo: "Desempenho do marketing" },
  { id: "atendimento", titulo: "Qualidade do atendimento (recepção e salão)" },
  { id: "limpeza", titulo: "Limpeza e conservação" },
  { id: "equipamentos", titulo: "Manutenção dos equipamentos" },
  { id: "estrutura", titulo: "Manutenção da estrutura física" },
  { id: "ocorrencias", titulo: "Principais ocorrências e soluções" },
  { id: "investimentos", titulo: "Pendências e necessidades de investimento" },
  { id: "melhorias", titulo: "Melhorias implementadas" },
  { id: "plano", titulo: "Plano de ação para o próximo mês" },
];

export function idRelatorio(unidadeId, mes) {
  return `${unidadeId}__${mes}`;
}

export async function obterRelatorio(unidadeId, mes) {
  return bd().obter(`relatoriosMensais/${idRelatorio(unidadeId, mes)}`);
}

export async function listarRelatorios(unidades) {
  const lista = await unirConsultas(unidades.filter(naUnidade).map((u) => bd().consultar("relatoriosMensais", [["unidadeId", "==", u]])));
  return lista.sort((a, b) => (b.mes || "").localeCompare(a.mes || ""));
}

function limparTextos(textos = {}) {
  const saida = {};
  for (const s of SECOES_RELATORIO) saida[s.id] = String(textos[s.id] || "").trim().slice(0, 6000);
  return saida;
}

function limparPlano(plano = []) {
  return plano
    .filter((p) => (p.problema || "").trim() || (p.medida || "").trim())
    .map((p) => ({
      problema: (p.problema || "").trim(),
      medida: (p.medida || "").trim(),
      responsavel: (p.responsavel || "").trim(),
      prazo: p.prazo || "",
      status: p.status || "planejado",
    }));
}

/** Salva rascunho ou envia para aprovação. Ao enviar, os números são congelados. */
export async function salvarRelatorio({ unidadeId, mes, textos, plano, enviar = false, numeros }) {
  exigir(pode("gestao", 3) && naUnidade(unidadeId), "Você não tem permissão para editar o relatório desta unidade.");
  const id = idRelatorio(unidadeId, mes);
  const antes = await bd().obter(`relatoriosMensais/${id}`);
  if (antes) exigir(["rascunho", "devolvido"].includes(antes.status), "Este relatório já foi enviado e não pode mais ser editado.");
  if (enviar) {
    exigir(String(textos?.resumo || "").trim().length >= 20, "Escreva o resumo executivo antes de enviar.");
    exigir(numeros, "Os indicadores do mês ainda não foram calculados.");
  }
  const dados = {
    unidadeId,
    mes,
    textos: limparTextos(textos),
    plano: limparPlano(plano),
    status: enviar ? "enviado" : "rascunho",
    numeros: enviar ? numeros : antes?.numeros || null,
    enviadoPorLogin: enviar ? meuLogin() : antes?.enviadoPorLogin || "",
    enviadoPorNome: enviar ? sessao.perfil.nome : antes?.enviadoPorNome || "",
    enviadoEm: enviar ? hoje() : antes?.enviadoEm || "",
  };
  await gravarAuditado({
    colecao: "relatoriosMensais",
    id,
    dados,
    antes,
    acao: enviar ? "enviar" : antes ? "editar" : "criar",
    resumo: `${enviar ? "Enviou" : "Salvou"} o relatório mensal ${mes}`,
    unidadeId,
  });
  return id;
}

export async function decidirRelatorio(relatorio, aprovar, comentario = "") {
  exigir(aprovador(), "Somente a diretoria aprova relatórios.");
  exigir(relatorio.status === "enviado", "Este relatório não está aguardando aprovação.");
  if (!aprovar) exigir(comentario.trim(), "Explique o que precisa ser ajustado.");
  await gravarAuditado({
    colecao: "relatoriosMensais",
    id: relatorio.id,
    dados: {
      status: aprovar ? "aprovado" : "devolvido",
      aprovacao: { porLogin: meuLogin(), porNome: sessao.perfil.nome, em: hoje(), comentario: comentario.trim(), aprovado: aprovar },
    },
    antes: relatorio,
    acao: aprovar ? "aprovar" : "devolver",
    resumo: `${aprovar ? "Aprovou" : "Devolveu"} o relatório mensal ${relatorio.mes}`,
    unidadeId: relatorio.unidadeId,
  });
}

export const STATUS_RELATORIO = {
  rascunho: { rotulo: "Rascunho", classe: "selo-tracejado" },
  enviado: { rotulo: "Aguardando aprovação", classe: "selo-marca" },
  devolvido: { rotulo: "Devolvido para ajustes", classe: "selo-pendente" },
  aprovado: { rotulo: "Aprovado", classe: "selo-ok" },
};

export { auditar, carimboCriacao, carimboAtualizacao };
