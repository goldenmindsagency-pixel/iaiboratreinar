// Motor de rotinas: modelos (checklists), agenda de blocos, execuções, registros avulsos e escalas.
import { sessao, pode, nivel, naUnidade, meuLogin, unidadesFiltro, todosModulos, ehAdmin } from "../core/sessao.js";
import { ErroSistema } from "../core/erros.js";
import { CONJUNTOS_RESPOSTA } from "../core/constantes.js";
import {
  hoje, somarDias, diaSemana, periodoDe, limiteEnvio, instante, mesDe, mesesEntre, diasEntre, segundaDaSemana, minutosDe, dataISO,
} from "../core/tempo.js";
import { bd, auditar, carimboCriacao, carimboAtualizacao, exigir, unirConsultas } from "./base.js";

// ======================= Modelos =======================

export function novoIdCurto() {
  return Math.random().toString(36).slice(2, 8);
}

export function modeloVazio({ unidadeId, setorId }) {
  const gerencial = setorId === "gestao";
  return {
    nome: "",
    unidadeId,
    setorId,
    frequencia: "diaria",
    respostas: gerencial ? "gerencial" : "operacional",
    registros: setorId === "recepcao" ? "atendimento" : setorId === "comercial" ? "contato" : setorId === "salao" ? "feedback" : "nenhum",
    extras: {
      faltaMaterial: setorId === "limpeza",
      dificuldades: true,
      irregularidades: setorId === "limpeza",
      observacoes: true,
    },
    blocos: [],
    ativo: true,
  };
}

export function blocoVazio(frequencia, ordem = 0) {
  return {
    id: novoIdCurto(),
    nome: frequencia === "mensal" ? "Fechamento do mês" : "",
    inicio: "08:00",
    fim: "12:00",
    dias: frequencia === "diaria" ? [1, 2, 3, 4, 5, 6] : [],
    dia: frequencia === "semanal" ? ((ordem % 6) + 1) : null,
    responsaveis: [],
    somenteEscalado: false,
    ativo: true,
    desde: hoje(),
    desdeEm: new Date().toISOString(),
    itens: [],
  };
}

export function itemVazio() {
  return { id: novoIdCurto(), texto: "", obrigatoria: true, exigeFoto: false, contexto: "", ativo: true };
}

function validarModelo(m) {
  exigir(m.nome && m.nome.trim().length >= 3, "Dê um nome à rotina.");
  exigir(m.unidadeId && m.setorId, "Selecione a unidade e o setor.");
  exigir(Array.isArray(m.blocos) && m.blocos.length > 0, "Adicione ao menos um bloco.");
  for (const b of m.blocos) {
    exigir(b.nome && b.nome.trim(), "Todo bloco precisa de um nome.");
    if (m.frequencia === "diaria") {
      exigir(b.dias && b.dias.length, `Escolha os dias da semana do bloco "${b.nome}".`);
      exigir(/^\d{2}:\d{2}$/.test(b.inicio) && /^\d{2}:\d{2}$/.test(b.fim), `Informe o horário do bloco "${b.nome}".`);
      exigir(minutosDe(b.fim) > minutosDe(b.inicio), `O fim do bloco "${b.nome}" deve ser depois do início.`);
    }
    if (m.frequencia === "semanal") exigir(b.dia !== null && b.dia !== undefined && b.dia !== "", `Escolha o dia do bloco "${b.nome}".`);
    const ativos = (b.itens || []).filter((i) => i.ativo !== false);
    exigir(ativos.length > 0, `O bloco "${b.nome}" precisa de ao menos uma atividade.`);
    for (const i of b.itens || []) exigir(i.texto && i.texto.trim(), `Há uma atividade sem descrição no bloco "${b.nome}".`);
  }
}

function limparModelo(m) {
  return {
    nome: m.nome.trim(),
    unidadeId: m.unidadeId,
    setorId: m.setorId,
    frequencia: m.frequencia,
    respostas: CONJUNTOS_RESPOSTA[m.respostas] ? m.respostas : "operacional",
    registros: m.registros || "nenhum",
    extras: {
      faltaMaterial: Boolean(m.extras?.faltaMaterial),
      dificuldades: Boolean(m.extras?.dificuldades),
      irregularidades: Boolean(m.extras?.irregularidades),
      observacoes: m.extras?.observacoes !== false,
    },
    blocos: m.blocos.map((b) => ({
      id: b.id || novoIdCurto(),
      nome: b.nome.trim(),
      inicio: b.inicio || "00:00",
      fim: b.fim || "23:59",
      dias: (b.dias || []).map(Number),
      dia: b.dia === null || b.dia === undefined || b.dia === "" ? null : Number(b.dia),
      responsaveis: b.responsaveis || [],
      somenteEscalado: Boolean(b.somenteEscalado),
      ativo: b.ativo !== false,
      desde: b.desde || hoje(),
      desdeEm: b.desdeEm || null,
      ate: b.ativo === false ? b.ate || hoje() : null,
      itens: (b.itens || []).map((i) => ({
        id: i.id || novoIdCurto(),
        texto: i.texto.trim(),
        ajuda: (i.ajuda || "").trim(),
        obrigatoria: i.obrigatoria !== false,
        exigeFoto: Boolean(i.exigeFoto),
        contexto: i.contexto || "",
        ativo: i.ativo !== false,
      })),
    })),
    ativo: m.ativo !== false,
  };
}

export async function listarModelos({ unidadeId, setorId, incluirInativos = false } = {}) {
  const filtros = [];
  if (unidadeId) filtros.push(["unidadeId", "==", unidadeId]);
  if (setorId) filtros.push(["setorId", "==", setorId]);
  const lista = await bd().consultar("rotinaModelos", filtros);
  return lista.filter((m) => incluirInativos || m.ativo !== false).sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
}

/** Modelos de vários setores/unidades que o usuário pode ver (consulta por par unidade+setor) */
export async function modelosVisiveis({ unidades, setores }) {
  const promessas = [];
  for (const u of unidades) for (const s of setores) if (pode(s, 1) && naUnidade(u)) promessas.push(listarModelos({ unidadeId: u, setorId: s }));
  if (!promessas.length) return [];
  return unirConsultas(promessas);
}

export async function obterModelo(id) {
  return bd().obter(`rotinaModelos/${id}`);
}

export async function salvarModelo(id, modelo) {
  validarModelo(modelo);
  const limpo = limparModelo(modelo);
  exigir(pode(limpo.setorId, 3), "Você não tem permissão para editar rotinas deste setor.");
  const lote = bd().lote();
  if (!id) {
    id = bd().novoId("rotinaModelos");
    const dados = { ...limpo, versao: 1, desde: hoje() };
    const auditId = auditar(lote, { colecao: "rotinaModelos", docId: id, acao: "criar", resumo: `Criou a rotina ${limpo.nome}`, depois: dados, unidadeId: limpo.unidadeId });
    lote.definir(`rotinaModelos/${id}`, { ...dados, ...carimboCriacao(), ...carimboAtualizacao(), _auditId: auditId });
  } else {
    const antes = await obterModelo(id);
    if (!antes) throw new ErroSistema("nao-encontrado");
    exigir(antes.unidadeId === limpo.unidadeId && antes.setorId === limpo.setorId, "Não é possível mudar a unidade ou o setor de uma rotina existente. Use \"Duplicar\".");
    if (antes.ativo !== limpo.ativo) exigir(pode(limpo.setorId, 4), "Você não tem permissão para desativar rotinas.");
    const dados = { ...limpo, versao: (antes.versao || 1) + 1 };
    const auditId = auditar(lote, { colecao: "rotinaModelos", docId: id, acao: "editar", resumo: `Alterou a rotina ${limpo.nome} (versão ${dados.versao})`, antes, depois: dados, unidadeId: limpo.unidadeId });
    lote.atualizar(`rotinaModelos/${id}`, { ...dados, ...carimboAtualizacao(), _auditId: auditId });
  }
  await lote.confirmar();
  return id;
}

export async function alterarAtivoModelo(id, ativo) {
  const antes = await obterModelo(id);
  if (!antes) throw new ErroSistema("nao-encontrado");
  exigir(pode(antes.setorId, 4), "Você não tem permissão para ativar ou desativar rotinas.");
  const lote = bd().lote();
  const auditId = auditar(lote, {
    colecao: "rotinaModelos", docId: id, acao: ativo ? "reativar" : "desativar",
    resumo: `${ativo ? "Reativou" : "Desativou"} a rotina ${antes.nome}`, antes: { ativo: antes.ativo }, depois: { ativo }, unidadeId: antes.unidadeId,
  });
  lote.atualizar(`rotinaModelos/${id}`, { ativo, ...carimboAtualizacao(), _auditId: auditId });
  await lote.confirmar();
}

export async function duplicarModelo(modelo, unidadeId) {
  const copia = JSON.parse(JSON.stringify({ ...modelo, unidadeId, nome: `${modelo.nome}` }));
  copia.blocos.forEach((b) => {
    b.id = novoIdCurto();
    b.responsaveis = [];
    b.desde = hoje();
    b.desdeEm = new Date().toISOString();
    b.itens.forEach((i) => (i.id = novoIdCurto()));
  });
  return salvarModelo(null, copia);
}

// ======================= Agenda =======================

export function idExecucao(modeloId, periodo, blocoId) {
  return `${modeloId}__${periodo}__${blocoId}`;
}

function blocoValidoEm(bloco, data, modelo) {
  if (modelo.desde && data < modelo.desde && bloco.desde && data < bloco.desde) return false;
  if (bloco.desde && data < bloco.desde) return false;
  if (bloco.ativo === false && (!bloco.ate || data >= bloco.ate)) return false;
  return true;
}

/**
 * Momento a partir do qual o bloco passa a ser cobrado. Evita que blocos de horários
 * anteriores à criação da rotina (ou à inclusão/reativação do bloco) apareçam como atrasados.
 */
function inicioVigencia(modelo, bloco) {
  if (bloco.desdeEm) {
    const d = new Date(bloco.desdeEm);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // Rotinas criadas antes deste controle: usa o momento da criação, se o bloco nasceu junto com a rotina.
  const criado = modelo.criadoEm instanceof Date && !Number.isNaN(modelo.criadoEm.getTime()) ? modelo.criadoEm : null;
  if (criado && bloco.desde && bloco.desde === dataISO(criado) && (!modelo.desde || modelo.desde === bloco.desde)) return criado;
  return null;
}

/** true se a ocorrência é anterior à vigência do bloco (não deve ser cobrada) */
function antesDaVigencia(modelo, bloco, periodo, data) {
  const vig = inicioVigencia(modelo, bloco);
  if (!vig) return false;
  // Fechamento mensal: vale enquanto a janela de envio ainda estiver aberta.
  if (modelo.frequencia === "mensal") return limiteEnvio("mensal", periodo) <= vig;
  // Diária: conta se o bloco ainda estava aberto quando passou a valer
  // (ex.: rotina criada às 9h vale para o bloco das 8h às 21h do mesmo dia, mas não para o das 5h30 às 9h).
  if (modelo.frequencia === "diaria") return instante(data, bloco.fim || "23:59") <= vig;
  // Semanal: o dia do bloco precisa começar depois que a rotina passou a valer (começa no próximo dia previsto).
  return instante(data) < vig;
}

/** Data em que o bloco é previsto dentro do período */
export function dataPrevista(modelo, bloco, periodo) {
  if (modelo.frequencia === "semanal") {
    const d = Number(bloco.dia);
    return somarDias(periodo, d === 0 ? 6 : d - 1);
  }
  if (modelo.frequencia === "mensal") {
    const [a, m] = periodo.split("-");
    // vencimento: último dia do mês de referência
    const ultimo = new Date(Date.UTC(Number(a), Number(m), 0)).toISOString().slice(0, 10);
    return ultimo;
  }
  return periodo;
}

/**
 * Lista as ocorrências programadas de blocos entre duas datas (inclusive).
 * escalas: Map 'unidade__data' => [logins] (para blocos "somente quando escalado")
 */
export function ocorrenciasProgramadas(modelos, inicio, fim, escalas = new Map()) {
  const saida = [];
  for (const m of modelos) {
    if (m.ativo === false) continue;
    if (m.frequencia === "diaria") {
      for (const data of diasEntre(inicio, fim)) {
        const ds = diaSemana(data);
        for (const b of m.blocos || []) {
          if (!(b.dias || []).includes(ds) || !blocoValidoEm(b, data, m) || antesDaVigencia(m, b, data, data)) continue;
          const resp = responsaveisDoBloco(m, b, data, escalas);
          if (resp === null) continue;
          saida.push(ocorrencia(m, b, data, data, resp));
        }
      }
    } else if (m.frequencia === "semanal") {
      const semanas = new Set(diasEntre(inicio, fim).map(segundaDaSemana));
      for (const seg of semanas) {
        for (const b of m.blocos || []) {
          const data = dataPrevista(m, b, seg);
          if (data < inicio || data > fim || !blocoValidoEm(b, data, m) || antesDaVigencia(m, b, seg, data)) continue;
          const resp = responsaveisDoBloco(m, b, data, escalas);
          if (resp === null) continue;
          saida.push(ocorrencia(m, b, seg, data, resp));
        }
      }
    } else if (m.frequencia === "mensal") {
      for (const mes of mesesEntre(inicio, fim)) {
        const periodo = `${mes}-25`;
        for (const b of m.blocos || []) {
          const data = dataPrevista(m, b, periodo);
          if (data < inicio || data > fim || !blocoValidoEm(b, data, m) || antesDaVigencia(m, b, periodo, data)) continue;
          saida.push(ocorrencia(m, b, periodo, data, b.responsaveis || []));
        }
      }
    }
  }
  return saida;
}

function responsaveisDoBloco(modelo, bloco, data, escalas) {
  if (bloco.somenteEscalado) {
    const lista = escalas.get(`${modelo.unidadeId}__${data}`);
    if (!lista || !lista.length) return null;
    return lista;
  }
  return bloco.responsaveis || [];
}

function ocorrencia(modelo, bloco, periodo, data, responsaveis) {
  return {
    id: idExecucao(modelo.id, periodo, bloco.id),
    modelo,
    bloco,
    periodo,
    data,
    responsaveis,
    itens: (bloco.itens || []).filter((i) => i.ativo !== false).length,
  };
}

/**
 * Situação de uma ocorrência programada em relação ao momento atual:
 * enviado | correcao | futuro | agora | atrasado | nao_enviado
 */
export function situacaoOcorrencia(oc, execucao, agora = new Date()) {
  if (execucao) return execucao.status === "correcao" ? "correcao" : "enviado";
  const freq = oc.modelo.frequencia;
  if (freq === "mensal") {
    const abre = instante(oc.periodo);
    if (agora < abre) return "futuro";
    if (agora < instante(somarDias(oc.data, 1))) return "agora";
  } else {
    const ini = instante(oc.data, freq === "semanal" ? "00:00" : oc.bloco.inicio);
    const fimBloco = freq === "semanal" ? instante(somarDias(oc.data, 1)) : instante(oc.data, oc.bloco.fim);
    if (agora < ini) return "futuro";
    if (agora <= fimBloco) return "agora";
  }
  return agora < limiteEnvio(freq, oc.periodo) ? "atrasado" : "nao_enviado";
}

export const ROTULOS_SITUACAO = {
  enviado: { rotulo: "Enviado", classe: "selo-ok" },
  correcao: { rotulo: "Correção solicitada", classe: "selo-pendente" },
  futuro: { rotulo: "Aguardando horário", classe: "selo-tracejado" },
  agora: { rotulo: "No horário", classe: "selo-marca" },
  atrasado: { rotulo: "Atrasado", classe: "selo-pendente" },
  nao_enviado: { rotulo: "Não enviado", classe: "selo-critico" },
};

export function podeEnviarAgora(oc, agora = new Date()) {
  const s = situacaoOcorrencia(oc, null, agora);
  if (s === "agora" || s === "atrasado") return true;
  // Pode adiantar um bloco do próprio dia (ex.: terminou antes do horário previsto).
  return s === "futuro" && oc.modelo.frequencia !== "mensal" && oc.data === hoje();
}

/** Um bloco pode ser preenchido por mim se não tem responsável definido ou se estou na lista */
export function souResponsavel(oc, login = meuLogin()) {
  return !oc.responsaveis?.length || oc.responsaveis.includes(login);
}

/**
 * Setor operacional "principal" de quem supervisiona um único setor (ex.: coordenação do salão):
 * o único setor de rotina em que a pessoa tem nível de edição.
 */
function setorPrincipal() {
  if (ehAdmin()) return null;
  const setores = todosModulos().filter((m) => m.tipo === "rotina" && m.id !== "gestao").map((m) => m.id);
  const editaveis = setores.filter((s) => nivel(s) >= 3);
  return editaveis.length === 1 ? editaveis[0] : null;
}

/**
 * De quem é o bloco nas "Minhas tarefas":
 *  - "minha": a pessoa está entre os responsáveis; ou o bloco não tem responsável e ela é da
 *    equipe que executa (nível "próprio" no setor), ou é a rotina do gestor e ela é gestora,
 *    ou é o setor que ela coordena;
 *  - "livre": sem responsável definido e a pessoa apenas supervisiona o setor (pode preencher,
 *    mas não é cobrada por isso);
 *  - null: o bloco é de outra pessoa.
 */
export function atribuicao(oc, login = meuLogin()) {
  if (oc.responsaveis?.length) return oc.responsaveis.includes(login) ? "minha" : null;
  const setor = oc.modelo.setorId;
  if (nivel(setor) === 1) return "minha";
  if (setor === "gestao") return pode("gestao", 3) ? "minha" : null;
  if (setorPrincipal() === setor) return "minha";
  return "livre";
}

// ======================= Escalas =======================

export async function carregarEscalas(unidadeIds, inicio, fim) {
  const mapa = new Map();
  const meses = mesesEntre(inicio, fim);
  const promessas = [];
  for (const u of unidadeIds) for (const m of meses) promessas.push(bd().consultar("escalas", [["unidadeId", "==", u], ["mes", "==", m]]));
  const res = await Promise.allSettled(promessas);
  for (const r of res) if (r.status === "fulfilled") r.value.forEach((e) => mapa.set(`${e.unidadeId}__${e.data}`, e.logins || []));
  return mapa;
}

export async function salvarEscala(unidadeId, data, logins) {
  exigir(pode("gestao", 3), "Você não tem permissão para editar a escala.");
  const id = `${unidadeId}__${data}`;
  const antes = await bd().obter(`escalas/${id}`);
  const lote = bd().lote();
  const dados = { unidadeId, data, mes: mesDe(data), logins };
  const auditId = auditar(lote, { colecao: "escalas", docId: id, acao: antes ? "editar" : "criar", resumo: `Escala de ${data}`, antes, depois: dados, unidadeId });
  lote.definir(`escalas/${id}`, { ...dados, ...carimboAtualizacao(), _auditId: auditId });
  await lote.confirmar();
}

// ======================= Execuções =======================

export async function obterExecucao(id) {
  return bd().obter(`execucoes/${id}`);
}

/**
 * Execuções de um período. Se o usuário só tem nível "próprio" no setor, busca apenas as dele.
 */
export async function listarExecucoes({ unidades, setores, inicio, fim }) {
  const meses = mesesEntre(inicio, fim);
  const promessas = [];
  for (const u of unidades) {
    for (const s of setores) {
      if (!naUnidade(u) || !pode(s, 1)) continue;
      for (const m of meses) {
        const filtros = [["unidadeId", "==", u], ["setorId", "==", s], ["mes", "==", m]];
        if (!pode(s, 2)) filtros.push(["autorLogin", "==", meuLogin()]);
        promessas.push(bd().consultar("execucoes", filtros));
      }
    }
  }
  if (!promessas.length) return [];
  const lista = await unirConsultas(promessas);
  return lista.filter((e) => e.dataPrevista >= inicio && e.dataPrevista <= fim);
}

/** Verifica individualmente se blocos já foram enviados (usado por quem tem nível "próprio") */
export async function execucoesPorId(ids) {
  const res = await Promise.allSettled(ids.map((id) => obterExecucao(id)));
  const mapa = new Map();
  res.forEach((r) => r.status === "fulfilled" && r.value && mapa.set(r.value.id, r.value));
  return mapa;
}

export function calcularTotais(respostas, itensAtivos) {
  const t = { itens: itensAtivos, concluidas: 0, pendentes: 0, naoAplicaveis: 0, naoVerificadas: 0 };
  for (const r of respostas) {
    if (r.status === "concluida") t.concluidas++;
    else if (r.status === "pendente" || r.status === "nao_realizada") t.pendentes++;
    else if (r.status === "nao_aplicavel") t.naoAplicaveis++;
    else t.naoVerificadas++;
  }
  return t;
}

/** Valida as respostas antes do envio. Retorna lista de problemas (vazia = ok). */
export function validarRespostas(modelo, bloco, respostas) {
  const problemas = [];
  const conjunto = CONJUNTOS_RESPOSTA[modelo.respostas] || CONJUNTOS_RESPOSTA.operacional;
  for (const item of (bloco.itens || []).filter((i) => i.ativo !== false)) {
    const r = respostas[item.id] || {};
    if (!r.status) {
      if (item.obrigatoria !== false) problemas.push({ itemId: item.id, motivo: "Responda esta atividade." });
      continue;
    }
    if (!conjunto.opcoes.includes(r.status)) problemas.push({ itemId: item.id, motivo: "Resposta inválida." });
    if (r.status !== "concluida" && !(r.justificativa || "").trim()) problemas.push({ itemId: item.id, motivo: "Explique o motivo." });
    if (item.exigeFoto && r.status === "concluida" && !(r.fotos || []).length) problemas.push({ itemId: item.id, motivo: "Anexe a foto exigida." });
  }
  return problemas;
}

function montarRespostas(bloco, respostas) {
  return (bloco.itens || [])
    .filter((i) => i.ativo !== false)
    .map((item) => {
      const r = respostas[item.id] || {};
      return {
        itemId: item.id,
        texto: item.texto,
        status: r.status || "nao_verificada",
        justificativa: (r.justificativa || "").trim(),
        fotos: (r.fotos || []).map((f) => ({ url: f.url, publicId: f.publicId || "" })),
        contexto: r.contexto || "",
        providencias: r.providencias || [],
      };
    });
}

function resumirRegistros(registros) {
  const ativos = registros.filter((r) => !r.cancelado);
  const contar = (campo) => {
    const mapa = {};
    for (const r of ativos) {
      const v = r.dados?.[campo] || "—";
      mapa[v] = (mapa[v] || 0) + 1;
    }
    return mapa;
  };
  return { total: ativos.length, porTipo: contar("tipo"), porCanal: contar("canal"), porResultado: contar("resultado") };
}

/** Envia (cria) a execução de um bloco */
export async function enviarExecucao({ oc, respostas, extras, registros = [] }) {
  const { modelo, bloco } = oc;
  exigir(pode(modelo.setorId, 1) && naUnidade(modelo.unidadeId), "Você não tem permissão para preencher esta rotina.");
  const problemas = validarRespostas(modelo, bloco, respostas);
  if (problemas.length) throw new ErroSistema("validacao", "Há atividades sem resposta ou sem justificativa.");
  if (!podeEnviarAgora(oc)) throw new ErroSistema("fora-do-prazo");

  const existente = await obterExecucao(oc.id).catch(() => null);
  if (existente) throw new ErroSistema("ja-existe", "Este bloco já foi enviado. Atualize a página.");

  const lista = montarRespostas(bloco, respostas);
  const agora = new Date();
  const atrasado = modelo.frequencia === "diaria" ? agora > instante(oc.data, bloco.fim) : agora > instante(somarDias(oc.data, 1));
  const dados = {
    modeloId: modelo.id,
    modeloNome: modelo.nome,
    versaoModelo: modelo.versao || 1,
    setorId: modelo.setorId,
    unidadeId: modelo.unidadeId,
    frequencia: modelo.frequencia,
    respostasTipo: modelo.respostas,
    dataRef: oc.periodo,
    dataPrevista: oc.data,
    mes: mesDe(oc.data),
    blocoId: bloco.id,
    blocoNome: bloco.nome,
    inicio: bloco.inicio || "",
    fim: bloco.fim || "",
    respostas: lista,
    extras: {
      faltaMaterial: Boolean(extras.faltaMaterial),
      materiais: (extras.materiais || "").trim(),
      dificuldades: (extras.dificuldades || "").trim(),
      irregularidades: (extras.irregularidades || "").trim(),
      observacoes: (extras.observacoes || "").trim(),
    },
    totais: calcularTotais(lista, lista.length),
    registrosResumo: modelo.registros && modelo.registros !== "nenhum" ? resumirRegistros(registros) : null,
    atrasado,
    status: "enviado",
    autorLogin: meuLogin(),
    autorNome: sessao.perfil.nome,
    enviadoEm: bd().agora(),
  };
  const lote = bd().lote();
  lote.definir(`execucoes/${oc.id}`, dados);
  return lote.confirmar();
}

/** Reenvio após correção solicitada (mantém a versão anterior em "correcoes") */
export async function reenviarExecucao({ execucao, modelo, bloco, respostas, extras, registros = [] }) {
  exigir(execucao.autorLogin === meuLogin(), "Somente quem enviou pode corrigir.");
  const problemas = validarRespostas(modelo, bloco, respostas);
  if (problemas.length) throw new ErroSistema("validacao", "Há atividades sem resposta ou sem justificativa.");
  const lista = montarRespostas(bloco, respostas);
  const anterior = {
    respostas: execucao.respostas,
    extras: execucao.extras,
    totais: execucao.totais,
    revisao: execucao.revisao || null,
  };
  const lote = bd().lote();
  lote.atualizar(`execucoes/${execucao.id}`, {
    status: "enviado",
    respostas: lista,
    extras: {
      faltaMaterial: Boolean(extras.faltaMaterial),
      materiais: (extras.materiais || "").trim(),
      dificuldades: (extras.dificuldades || "").trim(),
      irregularidades: (extras.irregularidades || "").trim(),
      observacoes: (extras.observacoes || "").trim(),
    },
    totais: calcularTotais(lista, lista.length),
    registrosResumo: execucao.registrosResumo ? resumirRegistros(registros) : null,
    correcoes: [...(execucao.correcoes || []), anterior],
    reenviadoEm: bd().agora(),
  });
  return lote.confirmar();
}

/** Revisão do coordenador/gestor: "revisado" ou "correcao" */
export async function revisarExecucao(execucao, status, comentario = "") {
  exigir(pode(execucao.setorId, 3), "Você não tem permissão para revisar esta rotina.");
  exigir(["revisado", "correcao"].includes(status), "Status inválido.");
  if (status === "correcao") exigir(comentario.trim(), "Explique o que precisa ser corrigido.");
  const lote = bd().lote();
  const revisao = { status, comentario: comentario.trim(), porLogin: meuLogin(), porNome: sessao.perfil.nome, em: new Date().toISOString() };
  const auditId = auditar(lote, {
    colecao: "execucoes",
    docId: execucao.id,
    acao: status === "revisado" ? "revisar" : "solicitar-correcao",
    resumo: `${status === "revisado" ? "Revisou" : "Pediu correção de"} ${execucao.modeloNome} · ${execucao.blocoNome} (${execucao.dataPrevista})`,
    antes: { status: execucao.status },
    depois: { status, revisao },
    unidadeId: execucao.unidadeId,
  });
  lote.atualizar(`execucoes/${execucao.id}`, { status, revisao, _auditId: auditId });
  return lote.confirmar();
}

// ======================= Registros avulsos (atendimentos, contatos, feedbacks) =======================

export async function listarRegistrosDaExecucao(execucaoId, setorId, unidadeId) {
  // Os filtros de unidade e setor são exigidos pelas regras do banco para provar a permissão.
  const filtros = [["execucaoId", "==", execucaoId], ["unidadeId", "==", unidadeId], ["setorId", "==", setorId]];
  if (!pode(setorId, 2)) filtros.push(["autorLogin", "==", meuLogin()]);
  const lista = await bd().consultar("registros", filtros);
  return lista.sort((a, b) => (a.criadoEm?.getTime?.() || 0) - (b.criadoEm?.getTime?.() || 0));
}

export async function listarRegistros({ unidades, setorId, inicio, fim, tipo }) {
  const promessas = [];
  for (const u of unidades) {
    if (!naUnidade(u) || !pode(setorId, 1)) continue;
    for (const m of mesesEntre(inicio, fim)) {
      const filtros = [["unidadeId", "==", u], ["setorId", "==", setorId], ["mes", "==", m]];
      if (!pode(setorId, 2)) filtros.push(["autorLogin", "==", meuLogin()]);
      promessas.push(bd().consultar("registros", filtros));
    }
  }
  if (!promessas.length) return [];
  const lista = await unirConsultas(promessas);
  return lista.filter((r) => !r.cancelado && r.dataRef >= inicio && r.dataRef <= fim && (!tipo || r.tipo === tipo));
}

export async function adicionarRegistro({ oc, tipo, dados }) {
  exigir(dados.tipo, "Escolha o tipo.");
  const id = bd().novoId("registros");
  const data = hoje();
  const registro = {
    tipo,
    setorId: oc.modelo.setorId,
    unidadeId: oc.modelo.unidadeId,
    execucaoId: oc.id,
    modeloId: oc.modelo.id,
    blocoId: oc.bloco.id,
    dataRef: data,
    mes: mesDe(data),
    dados: {
      tipo: dados.tipo,
      canal: dados.canal || "",
      resultado: dados.resultado || "",
      nome: (dados.nome || "").trim().slice(0, 80),
      observacao: (dados.observacao || "").trim().slice(0, 500),
    },
    cancelado: false,
    autorLogin: meuLogin(),
    autorNome: sessao.perfil.nome,
    criadoEm: bd().agora(),
  };
  const lote = bd().lote();
  lote.definir(`registros/${id}`, registro);
  await lote.confirmar();
  return { id, ...registro, criadoEm: new Date() };
}

export async function cancelarRegistro(registro) {
  const lote = bd().lote();
  lote.atualizar(`registros/${registro.id}`, { cancelado: true, atualizadoEm: bd().agora() });
  return lote.confirmar();
}

// ======================= Minhas tarefas =======================

/**
 * Blocos de hoje (e atrasados ainda dentro do prazo) para o usuário atual, nas unidades
 * escolhidas no seletor do topo e em todos os setores de rotina em que ele tem acesso.
 * incluirLivres: inclui também os blocos sem responsável dos setores que a pessoa só supervisiona.
 */
export async function minhasTarefas({ setores, incluirLivres = false } = {}) {
  const data = hoje();
  const unidades = unidadesFiltro().map((u) => u.id);
  const listaSetores = (setores || todosModulos().filter((m) => m.tipo === "rotina").map((m) => m.id)).filter((s) => pode(s, 1));
  if (!unidades.length || !listaSetores.length) return [];
  const modelos = await modelosVisiveis({ unidades, setores: listaSetores });
  if (!modelos.length) return [];

  const inicio = somarDias(data, -8);
  const fimJanela = somarDias(data, 6);
  const escalas = await carregarEscalas(unidades, inicio, fimJanela);
  const mensais = modelos.filter((m) => m.frequencia === "mensal");
  const outras = modelos.filter((m) => m.frequencia !== "mensal");
  let ocs = ocorrenciasProgramadas(outras, inicio, fimJanela, escalas);
  // mensais: período vigente
  const periodoMensal = periodoDe("mensal", data);
  const mesRef = periodoMensal.slice(0, 7);
  ocs = ocs.concat(ocorrenciasProgramadas(mensais, `${mesRef}-01`, somarDias(`${mesRef}-25`, 12), escalas).filter((o) => o.periodo === periodoMensal));

  const agora = new Date();
  ocs = ocs
    .map((o) => ({ ...o, atribuicao: atribuicao(o) }))
    .filter((o) => o.atribuicao === "minha" || (incluirLivres && o.atribuicao === "livre"));
  const relevantes = ocs.filter((o) => {
    if (o.modelo.frequencia === "diaria") return o.data === data || (o.data < data && situacaoOcorrencia(o, null, agora) === "atrasado");
    if (o.modelo.frequencia === "semanal") return (o.periodo === segundaDaSemana(data) && o.data <= data) || (o.data < data && situacaoOcorrencia(o, null, agora) === "atrasado");
    return true;
  });
  const execs = await execucoesPorId(relevantes.map((o) => o.id));
  return relevantes
    .map((o) => {
      const ex = execs.get(o.id) || null;
      return { ...o, execucao: ex, situacao: situacaoOcorrencia(o, ex, agora) };
    })
    .filter((o) => !(o.modelo.frequencia === "mensal" && o.situacao === "futuro"))
    .sort((a, b) => (a.data + (a.bloco.inicio || "")).localeCompare(b.data + (b.bloco.inicio || "")));
}

/** Monta a ocorrência a partir do id da execução (modeloId__periodo__blocoId) */
export async function ocorrenciaPorId(id) {
  const [modeloId, periodo, blocoId] = id.split("__");
  const modelo = await obterModelo(modeloId);
  if (!modelo) throw new ErroSistema("nao-encontrado", "Esta rotina não existe mais.");
  const bloco = (modelo.blocos || []).find((b) => b.id === blocoId);
  const execucao = await obterExecucao(id).catch(() => null);
  if (!bloco && !execucao) throw new ErroSistema("nao-encontrado", "Este bloco foi removido da rotina.");
  const blocoEfetivo = bloco || {
    id: blocoId,
    nome: execucao.blocoNome,
    inicio: execucao.inicio,
    fim: execucao.fim,
    itens: execucao.respostas.map((r) => ({ id: r.itemId, texto: r.texto, ativo: true, obrigatoria: true })),
  };
  const data = dataPrevista(modelo, blocoEfetivo, periodo);
  return {
    id,
    modelo,
    bloco: blocoEfetivo,
    periodo,
    data: execucao?.dataPrevista || data,
    responsaveis: blocoEfetivo.responsaveis || [],
    itens: (blocoEfetivo.itens || []).filter((i) => i.ativo !== false).length,
    execucao,
  };
}
