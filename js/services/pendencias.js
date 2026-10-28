// Ocorrências e pendências: lista única com código, responsável, prazo, histórico e custos.
import { sessao, pode, naUnidade, meuLogin } from "../core/sessao.js";
import { ErroSistema } from "../core/erros.js";
import { TRANSICOES, CATEGORIAS_PENDENCIA, PRIORIDADES } from "../core/constantes.js";
import { hoje, somarDias, mesDe, mesesEntre } from "../core/tempo.js";
import { bd, exigir, unirConsultas, carimboAtualizacao } from "./base.js";
import { nomePessoa } from "./usuarios.js";

export function setorDaCategoria(categoria) {
  return CATEGORIAS_PENDENCIA.find((c) => c.id === categoria)?.setor || "gestao";
}

export function prazoPadrao(prioridade) {
  const dias = sessao.config?.prazosDias?.[prioridade] ?? { critica: 1, alta: 3, media: 7, baixa: 15 }[prioridade] ?? 7;
  return somarDias(hoje(), dias);
}

export function responsavelPadrao(unidadeId, categoria) {
  return sessao.config?.responsaveisPadrao?.[unidadeId]?.[categoria] || "";
}

export function estaAtrasada(p) {
  return p.aberta && p.prazo && p.prazo < hoje();
}

export function venceEmBreve(p, dias = 1) {
  return p.aberta && p.prazo && p.prazo >= hoje() && p.prazo <= somarDias(hoje(), dias);
}

/** Quem pode gerenciar (editar, atribuir, mudar qualquer status) */
export function podeGerenciar(p) {
  return naUnidade(p.unidadeId) && (pode("pendencias", 3) || pode(p.setorId, 3));
}

export function podeCancelar(p) {
  return naUnidade(p.unidadeId) && (pode("pendencias", 4) || pode(p.setorId, 4));
}

export function souResponsavel(p) {
  return p.responsavelLogin && p.responsavelLogin === meuLogin();
}

/** Status para os quais o usuário atual pode mover a pendência */
export function proximosStatus(p) {
  const possiveis = TRANSICOES[p.status] || [];
  if (podeGerenciar(p)) return possiveis.filter((s) => s !== "cancelada" || podeCancelar(p));
  if (souResponsavel(p) && p.status !== "resolvida") return possiveis.filter((s) => ["em_andamento", "aguardando", "resolvida"].includes(s));
  return [];
}

function evento(lote, pendenciaId, dados) {
  const ev = bd().novoId(`pendencias/${pendenciaId}/historico`);
  lote.definir(`pendencias/${pendenciaId}/historico/${ev}`, {
    ...dados,
    autorLogin: meuLogin(),
    autorNome: sessao.perfil.nome,
    em: bd().agora(),
  });
  return ev;
}

/** Registra uma nova ocorrência/pendência (gera o código OC-AAAA-0000) */
export async function criar(dados) {
  exigir(pode("pendencias", 1), "Você não tem permissão para registrar ocorrências.");
  exigir(dados.unidadeId && naUnidade(dados.unidadeId), "Selecione a unidade.");
  exigir(dados.titulo && dados.titulo.trim().length >= 4, "Descreva o problema em poucas palavras (título).");
  exigir(PRIORIDADES[dados.prioridade], "Escolha a prioridade.");
  const categoria = dados.categoria || "outros";
  const setorId = dados.setorId || setorDaCategoria(categoria);
  const ano = hoje().slice(0, 4);
  const id = bd().novoId("pendencias");
  const responsavel = dados.responsavelLogin ?? responsavelPadrao(dados.unidadeId, categoria);
  const prazo = dados.prazo || prazoPadrao(dados.prioridade);

  return bd().transacao(async (t) => {
    const contador = await t.obter(`contadores/pendencias-${ano}`);
    const valor = (contador?.valor || 0) + 1;
    if (contador) t.atualizar(`contadores/pendencias-${ano}`, { valor });
    else t.definir(`contadores/pendencias-${ano}`, { valor });
    const codigo = `OC-${ano}-${String(valor).padStart(4, "0")}`;
    const ev = bd().novoId(`pendencias/${id}/historico`);
    t.definir(`pendencias/${id}/historico/${ev}`, {
      tipo: "criada",
      texto: dados.origem === "providencia" ? "Providência criada" : "Ocorrência registrada",
      statusNovo: "aberta",
      autorLogin: meuLogin(),
      autorNome: sessao.perfil.nome,
      em: bd().agora(),
    });
    const registro = {
      codigo,
      origem: dados.origem || "ocorrencia",
      origemRef: dados.origemRef || null,
      categoria,
      setorId,
      unidadeId: dados.unidadeId,
      titulo: dados.titulo.trim(),
      descricao: (dados.descricao || "").trim(),
      local: (dados.local || "").trim(),
      ambienteId: dados.ambienteId || "",
      equipamentoId: dados.equipamentoId || "",
      equipamentoNome: dados.equipamentoNome || "",
      prioridade: dados.prioridade,
      status: "aberta",
      aberta: true,
      responsavelLogin: responsavel || "",
      responsavelNome: dados.responsavelNome || (responsavel ? nomePessoa(responsavel) : ""),
      prazo,
      fotos: dados.fotos || [],
      custoTotal: 0,
      autorLogin: meuLogin(),
      autorNome: sessao.perfil.nome,
      criadoEm: bd().agora(),
      atualizadoEm: bd().agora(),
      dataAbertura: hoje(),
      mes: mesDe(hoje()),
      mesConclusao: "",
      _evento: ev,
    };
    t.definir(`pendencias/${id}`, registro);
    return { id, ...registro };
  });
}

export async function obter(id) {
  return bd().obter(`pendencias/${id}`);
}

export async function historico(id) {
  const lista = await bd().consultar(`pendencias/${id}/historico`);
  return lista.sort((a, b) => (a.em?.getTime?.() || 0) - (b.em?.getTime?.() || 0));
}

/**
 * Lista pendências respeitando as permissões:
 *  - abertas: todas as abertas das unidades (ou dos setores que o usuário supervisiona)
 *  - período: abertas ou concluídas dentro dos meses informados
 * Sempre inclui as criadas pelo usuário e as atribuídas a ele.
 */
export async function listar({ unidades, somenteAbertas = true, inicio, fim, setores = [] }) {
  const consultas = [];
  const meses = inicio && fim ? mesesEntre(inicio, fim) : [];
  for (const u of unidades) {
    if (!naUnidade(u)) continue;
    const filtrosBase = [];
    if (pode("pendencias", 2)) filtrosBase.push([["unidadeId", "==", u]]);
    else for (const s of setores) if (pode(s, 2)) filtrosBase.push([["unidadeId", "==", u], ["setorId", "==", s]]);
    for (const f of filtrosBase) {
      if (somenteAbertas) consultas.push(bd().consultar("pendencias", [...f, ["aberta", "==", true]]));
      else {
        consultas.push(bd().consultar("pendencias", [...f, ["aberta", "==", true]]));
        for (const m of meses) {
          consultas.push(bd().consultar("pendencias", [...f, ["mes", "==", m]]));
          consultas.push(bd().consultar("pendencias", [...f, ["mesConclusao", "==", m]]));
        }
      }
    }
  }
  consultas.push(bd().consultar("pendencias", [["autorLogin", "==", meuLogin()]]));
  consultas.push(bd().consultar("pendencias", [["responsavelLogin", "==", meuLogin()]]));
  const lista = await unirConsultas(consultas);
  const ids = new Set(unidades);
  return lista.filter((p) => ids.has(p.unidadeId) && (!somenteAbertas || p.aberta));
}

export async function listarPorAlvo({ unidadeId, equipamentoId, ambienteId }) {
  const filtros = [["unidadeId", "==", unidadeId]];
  if (equipamentoId) filtros.push(["equipamentoId", "==", equipamentoId]);
  if (ambienteId) filtros.push(["ambienteId", "==", ambienteId]);
  // Quem não vê todas as ocorrências precisa filtrar pelo setor que supervisiona (exigência das regras).
  if (!pode("pendencias", 2)) {
    const setor = equipamentoId ? "equipamentos" : "estrutura";
    if (!pode(setor, 2)) return [];
    filtros.push(["setorId", "==", setor]);
  }
  try {
    return await bd().consultar("pendencias", filtros);
  } catch (e) {
    if (e.codigo === "permissao") return [];
    throw e;
  }
}

/** Pendências semelhantes nos últimos 90 dias (para avisar recorrência ao registrar) */
export async function semelhantes({ unidadeId, equipamentoId, ambienteId }) {
  if (!equipamentoId && !ambienteId) return [];
  const lista = await listarPorAlvo({ unidadeId, equipamentoId, ambienteId });
  const limite = somarDias(hoje(), -90);
  return lista.filter((p) => (p.dataAbertura || "") >= limite);
}

/** Aplica alteração com evento no histórico (exigido pelas regras do banco) */
async function alterar(p, campos, eventoDados) {
  const lote = bd().lote();
  const ev = evento(lote, p.id, eventoDados);
  lote.atualizar(`pendencias/${p.id}`, { ...campos, atualizadoEm: bd().agora(), _evento: ev });
  return lote.confirmar();
}

export async function mudarStatus(p, novo, { comentario = "", solucao = "", justificativa = "" } = {}) {
  exigir(proximosStatus(p).includes(novo), "Esta mudança de status não é permitida.");
  const campos = { status: novo, aberta: !["resolvida", "cancelada"].includes(novo) };
  if (novo === "resolvida") {
    exigir(solucao.trim(), "Descreva a solução aplicada.");
    campos.solucao = solucao.trim();
    campos.concluidoEm = bd().agora();
    campos.dataConclusao = hoje();
    campos.mesConclusao = mesDe(hoje());
    campos.noPrazo = !p.prazo || hoje() <= p.prazo;
  }
  if (novo === "cancelada") {
    exigir(justificativa.trim(), "Informe a justificativa do cancelamento.");
    campos.justificativaCancelamento = justificativa.trim();
    campos.dataConclusao = hoje();
    campos.mesConclusao = mesDe(hoje());
  }
  if (p.status === "resolvida" && novo === "em_andamento") {
    campos.dataConclusao = "";
    campos.mesConclusao = "";
    campos.reaberturas = (p.reaberturas || 0) + 1;
  }
  return alterar(p, campos, {
    tipo: "status",
    statusAnterior: p.status,
    statusNovo: novo,
    texto: [comentario, solucao, justificativa].filter(Boolean).join(" — "),
  });
}

/** Edição de dados (somente quem gerencia): responsável, prazo, prioridade, descrição */
export async function editar(p, mudancas) {
  exigir(podeGerenciar(p), "Você não tem permissão para editar esta pendência.");
  const campos = {};
  const descricoes = [];
  if (mudancas.responsavelLogin !== undefined && mudancas.responsavelLogin !== p.responsavelLogin) {
    campos.responsavelLogin = mudancas.responsavelLogin;
    campos.responsavelNome = mudancas.responsavelNome || "";
    descricoes.push(`Responsável: ${mudancas.responsavelNome || "sem responsável"}`);
  }
  if (mudancas.prazo && mudancas.prazo !== p.prazo) {
    campos.prazo = mudancas.prazo;
    descricoes.push(`Prazo alterado para ${mudancas.prazo.split("-").reverse().join("/")}`);
  }
  if (mudancas.prioridade && mudancas.prioridade !== p.prioridade) {
    campos.prioridade = mudancas.prioridade;
    descricoes.push(`Prioridade: ${PRIORIDADES[mudancas.prioridade].rotulo}`);
  }
  for (const k of ["titulo", "descricao", "local"]) {
    if (mudancas[k] !== undefined && mudancas[k].trim() !== (p[k] || "")) {
      campos[k] = mudancas[k].trim();
      descricoes.push(`${k === "titulo" ? "Título" : k === "descricao" ? "Descrição" : "Local"} atualizado`);
    }
  }
  if (!descricoes.length) return null;
  return alterar(p, campos, { tipo: "edicao", texto: descricoes.join("; ") });
}

export async function comentar(p, texto, fotos = []) {
  exigir(texto.trim() || fotos.length, "Escreva um comentário ou anexe uma foto.");
  return alterar(p, {}, { tipo: "comentario", texto: texto.trim(), fotos });
}

export async function anexarFotos(p, fotos) {
  exigir(podeGerenciar(p) || souResponsavel(p) || p.autorLogin === meuLogin(), "Sem permissão.");
  return alterar(p, {}, { tipo: "comentario", texto: "Fotos anexadas", fotos });
}

// ---------------- Custos ----------------
export async function adicionarCusto(p, { descricao, categoria, valor, fornecedor, data, notaFiscal }) {
  exigir(podeGerenciar(p) || pode(p.setorId, 3), "Você não tem permissão para lançar custos.");
  exigir(descricao && descricao.trim(), "Descreva o custo.");
  exigir(Number.isFinite(valor) && valor > 0, "Informe um valor maior que zero.");
  const id = bd().novoId("custos");
  const lote = bd().lote();
  const dataCusto = data || hoje();
  lote.definir(`custos/${id}`, {
    unidadeId: p.unidadeId,
    setorId: p.setorId,
    pendenciaId: p.id,
    pendenciaCodigo: p.codigo,
    equipamentoId: p.equipamentoId || "",
    ambienteId: p.ambienteId || "",
    descricao: descricao.trim(),
    categoria: categoria || "Outros",
    valor,
    fornecedor: (fornecedor || "").trim(),
    notaFiscal: notaFiscal || null,
    data: dataCusto,
    mes: mesDe(dataCusto),
    cancelado: false,
    autorLogin: meuLogin(),
    autorNome: sessao.perfil.nome,
    criadoEm: bd().agora(),
  });
  const ev = evento(lote, p.id, { tipo: "custo", texto: `Custo lançado: ${descricao.trim()}`, valor });
  lote.atualizar(`pendencias/${p.id}`, { custoTotal: (p.custoTotal || 0) + valor, atualizadoEm: bd().agora(), _evento: ev });
  return lote.confirmar();
}

export function resumoPendencias(lista) {
  const abertas = lista.filter((p) => p.aberta);
  return {
    abertas: abertas.length,
    criticas: abertas.filter((p) => p.prioridade === "critica").length,
    atrasadas: abertas.filter(estaAtrasada).length,
    vencendo: abertas.filter((p) => venceEmBreve(p)).length,
  };
}

export { carimboAtualizacao };
