// Indicadores calculados a partir dos registros reais. Fórmulas documentadas junto de cada cálculo.
import { pode, naUnidade, nomeModulo } from "../core/sessao.js";
import { razao, normalizarTexto } from "../core/formato.js";
import { diasEntre, hoje } from "../core/tempo.js";
import { modelosVisiveis, ocorrenciasProgramadas, listarExecucoes, carregarEscalas, situacaoOcorrencia } from "./rotinas.js";
import * as pendencias from "./pendencias.js";

export const FORMULAS = {
  execucao: "Atividades concluídas ÷ (atividades programadas − não aplicáveis). Blocos não enviados no prazo contam como não executados.",
  conclusao: "Atividades concluídas ÷ (atividades dos blocos enviados − não aplicáveis).",
  cobertura: "Blocos enviados ÷ blocos programados cujo prazo já terminou.",
  naoEnviados: "Blocos programados cujo prazo de envio terminou sem registro.",
  prazoPendencias: "Pendências resolvidas até o prazo ÷ pendências resolvidas no período.",
  tempoResolucao: "Média de dias entre a abertura e a resolução das pendências resolvidas no período.",
  conversao: "Matrículas (EVO) ÷ leads recebidos registrados no período.",
  gerencial: "Atividades gerenciais concluídas ÷ (programadas − não aplicáveis). Não verificadas aparecem separadas.",
};

function vazioTotais() {
  return {
    programados: 0, // blocos com prazo iniciado (exclui futuros)
    enviados: 0,
    naoEnviados: 0,
    atrasados: 0, // ainda podem ser enviados
    noHorario: 0,
    correcoes: 0,
    itensAplicaveis: 0, // base da execução operacional (inclui itens de blocos não enviados)
    itensEnviadosAplicaveis: 0,
    concluidas: 0,
    pendentes: 0,
    naoAplicaveis: 0,
    naoVerificadas: 0,
  };
}

function somarOcorrencia(t, oc, ex, sit) {
  if (sit === "futuro") return;
  t.programados++;
  if (ex) {
    const tt = ex.totais || {};
    const aplicaveis = (tt.itens || 0) - (tt.naoAplicaveis || 0);
    t.enviados++;
    if (ex.status === "correcao") t.correcoes++;
    t.itensAplicaveis += aplicaveis;
    t.itensEnviadosAplicaveis += aplicaveis;
    t.concluidas += tt.concluidas || 0;
    t.pendentes += tt.pendentes || 0;
    t.naoAplicaveis += tt.naoAplicaveis || 0;
    t.naoVerificadas += tt.naoVerificadas || 0;
  } else if (sit === "nao_enviado") {
    t.naoEnviados++;
    t.itensAplicaveis += oc.itens;
  } else if (sit === "atrasado") t.atrasados++;
  else if (sit === "agora") t.noHorario++;
}

export function taxas(t) {
  return {
    execucao: razao(t.concluidas, t.itensAplicaveis),
    conclusao: razao(t.concluidas, t.itensEnviadosAplicaveis),
    cobertura: razao(t.enviados, t.enviados + t.naoEnviados),
  };
}

/**
 * Resumo das rotinas (checklists) por período.
 * Considera apenas setores em que o usuário tem nível de visualização (2+).
 */
export async function resumoRotinas({ unidades, setores, inicio, fim }) {
  const setoresVisiveis = setores.filter((s) => pode(s, 2));
  const unidadesVisiveis = unidades.filter(naUnidade);
  const resultado = {
    total: vazioTotais(),
    porDia: new Map(),
    porSetor: new Map(),
    porUnidade: new Map(),
    porModelo: new Map(),
    ranking: [],
    faltaMaterial: { blocos: 0, itens: [] },
    ocorrencias: [],
    execucoes: [],
  };
  if (!setoresVisiveis.length || !unidadesVisiveis.length) return finalizar(resultado);

  const [modelos, execucoes, escalas] = await Promise.all([
    modelosVisiveis({ unidades: unidadesVisiveis, setores: setoresVisiveis }),
    listarExecucoes({ unidades: unidadesVisiveis, setores: setoresVisiveis, inicio, fim }),
    carregarEscalas(unidadesVisiveis, inicio, fim),
  ]);
  const programadas = ocorrenciasProgramadas(modelos, inicio, fim, escalas);
  const porId = new Map(execucoes.map((e) => [e.id, e]));
  const agora = new Date();

  for (const d of diasEntre(inicio, fim)) resultado.porDia.set(d, vazioTotais());

  const usados = new Set();
  for (const oc of programadas) {
    const ex = porId.get(oc.id) || null;
    if (ex) usados.add(ex.id);
    const sit = situacaoOcorrencia(oc, ex, agora);
    resultado.ocorrencias.push({ ...oc, execucao: ex, situacao: sit });
    for (const alvo of [
      resultado.total,
      resultado.porDia.get(oc.data),
      obter(resultado.porSetor, oc.modelo.setorId),
      obter(resultado.porUnidade, oc.modelo.unidadeId),
      obter(resultado.porModelo, oc.modelo.id),
    ]) {
      if (alvo) somarOcorrencia(alvo, oc, ex, sit);
    }
  }
  // Execuções sem programação correspondente (bloco removido depois): contam como enviadas.
  for (const ex of execucoes) {
    if (usados.has(ex.id)) continue;
    const ocFalsa = { itens: ex.totais?.itens || 0 };
    for (const alvo of [resultado.total, resultado.porDia.get(ex.dataPrevista), obter(resultado.porSetor, ex.setorId), obter(resultado.porUnidade, ex.unidadeId)]) {
      if (alvo) somarOcorrencia(alvo, ocFalsa, ex, "enviado");
    }
  }

  // Ranking de atividades com mais pendências e falta de materiais
  const contagem = new Map();
  for (const ex of execucoes) {
    for (const r of ex.respostas || []) {
      if (r.status !== "pendente" && r.status !== "nao_realizada") continue;
      const chave = `${ex.setorId}|${normalizarTexto(r.texto)}`;
      const atual = contagem.get(chave) || { texto: r.texto, setorId: ex.setorId, vezes: 0, motivos: [] };
      atual.vezes++;
      if (r.justificativa && atual.motivos.length < 5) atual.motivos.push(r.justificativa);
      contagem.set(chave, atual);
    }
    if (ex.extras?.faltaMaterial) {
      resultado.faltaMaterial.blocos++;
      if (ex.extras.materiais) resultado.faltaMaterial.itens.push({ texto: ex.extras.materiais, data: ex.dataPrevista, unidadeId: ex.unidadeId });
    }
  }
  resultado.ranking = Array.from(contagem.values()).sort((a, b) => b.vezes - a.vezes).slice(0, 10);
  resultado.execucoes = execucoes;
  resultado.setores = setoresVisiveis;
  return finalizar(resultado);
}

function obter(mapa, chave) {
  if (!mapa.has(chave)) mapa.set(chave, vazioTotais());
  return mapa.get(chave);
}

function finalizar(r) {
  r.taxas = taxas(r.total);
  r.serieDiaria = Array.from(r.porDia.entries()).map(([data, t]) => ({ data, ...t, ...taxas(t) }));
  r.listaSetores = Array.from(r.porSetor.entries()).map(([id, t]) => ({ id, nome: nomeModulo(id), ...t, ...taxas(t) }));
  r.listaUnidades = Array.from(r.porUnidade.entries()).map(([id, t]) => ({ id, ...t, ...taxas(t) }));
  return r;
}

/**
 * Resumo das pendências: abertas agora + resolvidas no período.
 */
export async function resumoPendencias({ unidades, inicio, fim, setores = [] }) {
  const lista = await pendencias.listar({ unidades, somenteAbertas: false, inicio, fim, setores });
  const abertas = lista.filter((p) => p.aberta);
  const resolvidasPeriodo = lista.filter((p) => p.status === "resolvida" && p.dataConclusao >= inicio && p.dataConclusao <= fim);
  const abertasPeriodo = lista.filter((p) => p.dataAbertura >= inicio && p.dataAbertura <= fim);
  const noPrazo = resolvidasPeriodo.filter((p) => p.noPrazo !== false);
  const tempos = resolvidasPeriodo
    .filter((p) => p.dataAbertura && p.dataConclusao)
    .map((p) => (Date.parse(p.dataConclusao) - Date.parse(p.dataAbertura)) / 86400000);
  const porSetor = {};
  for (const p of abertas) porSetor[p.setorId] = (porSetor[p.setorId] || 0) + 1;
  const porCategoria = {};
  for (const p of abertasPeriodo) porCategoria[p.categoria] = (porCategoria[p.categoria] || 0) + 1;
  // Recorrência: mesmo equipamento/ambiente/local com 3+ registros nos últimos 90 dias
  const recorrentes = new Map();
  for (const p of lista) {
    const chave = p.equipamentoId ? `eq:${p.equipamentoId}` : p.ambienteId ? `amb:${p.ambienteId}` : p.local ? `loc:${p.unidadeId}:${normalizarTexto(p.local)}` : null;
    if (!chave) continue;
    const r = recorrentes.get(chave) || { rotulo: p.equipamentoNome || p.local || "", unidadeId: p.unidadeId, quantidade: 0 };
    r.quantidade++;
    recorrentes.set(chave, r);
  }
  return {
    lista,
    abertas: abertas.length,
    criticas: abertas.filter((p) => p.prioridade === "critica").length,
    atrasadas: abertas.filter(pendencias.estaAtrasada).length,
    vencendo: abertas.filter((p) => pendencias.venceEmBreve(p, 1)).length,
    registradasPeriodo: abertasPeriodo.length,
    resolvidasPeriodo: resolvidasPeriodo.length,
    cumprimentoPrazo: razao(noPrazo.length, resolvidasPeriodo.length),
    tempoMedio: tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : null,
    porSetor,
    porCategoria,
    recorrentes: Array.from(recorrentes.values()).filter((r) => r.quantidade >= 3).sort((a, b) => b.quantidade - a.quantidade),
    custoPeriodo: resolvidasPeriodo.reduce((s, p) => s + (p.custoTotal || 0), 0),
  };
}

/** Indicadores das rotinas gerenciais (setor gestão) */
export async function resumoGerencial({ unidades, inicio, fim }) {
  if (!pode("gestao", 2)) return null;
  const r = await resumoRotinas({ unidades, setores: ["gestao"], inicio, fim });
  return r;
}

export function hojeISO() {
  return hoje();
}
