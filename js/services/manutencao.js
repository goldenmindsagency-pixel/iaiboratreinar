// Equipamentos, ambientes (estrutura física), inspeções/manutenções e custos.
import { sessao, pode, naUnidade, meuLogin } from "../core/sessao.js";
import { ErroSistema } from "../core/erros.js";
import { hoje, somarDias, mesDe, mesesEntre } from "../core/tempo.js";
import { bd, auditar, carimboCriacao, carimboAtualizacao, gravarAuditado, exigir, unirConsultas } from "./base.js";

// ---------------- Equipamentos ----------------
export async function listarEquipamentos(unidades) {
  const lista = await unirConsultas(unidades.filter(naUnidade).map((u) => bd().consultar("equipamentos", [["unidadeId", "==", u]])));
  return lista.sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
}

export async function obterEquipamento(id) {
  return bd().obter(`equipamentos/${id}`);
}

export async function salvarEquipamento(id, d) {
  exigir(pode("equipamentos", 3), "Você não tem permissão para cadastrar equipamentos.");
  const limpo = {
    codigo: (d.codigo || "").trim().toUpperCase(),
    nome: (d.nome || "").trim(),
    categoria: d.categoria || "Outros",
    unidadeId: d.unidadeId,
    localizacao: (d.localizacao || "").trim(),
    ambienteId: d.ambienteId || "",
    marca: (d.marca || "").trim(),
    modelo: (d.modelo || "").trim(),
    numeroSerie: (d.numeroSerie || "").trim(),
    dataAquisicao: d.dataAquisicao || "",
    conservacao: d.conservacao || "Bom",
    periodicidadeDias: Math.max(0, Number(d.periodicidadeDias) || 0),
    proximaInspecao: d.proximaInspecao || "",
    observacoes: (d.observacoes || "").trim(),
    ativo: d.ativo !== false,
  };
  exigir(limpo.nome.length >= 2, "Informe o nome do equipamento.");
  exigir(limpo.codigo.length >= 1, "Informe o código (identificador único) do equipamento.");
  exigir(limpo.unidadeId && naUnidade(limpo.unidadeId), "Selecione a unidade.");
  if (!limpo.proximaInspecao && limpo.periodicidadeDias) limpo.proximaInspecao = somarDias(hoje(), limpo.periodicidadeDias);

  if (!id) {
    const dup = await bd().consultar("equipamentos", [["unidadeId", "==", limpo.unidadeId], ["codigo", "==", limpo.codigo]]);
    exigir(!dup.length, `Já existe um equipamento com o código ${limpo.codigo} nesta unidade.`);
    id = bd().novoId("equipamentos");
    await gravarAuditado({ colecao: "equipamentos", id, dados: { ...limpo, situacao: "operando", ultimaInspecao: "" }, resumo: `Cadastrou ${limpo.nome} (${limpo.codigo})`, unidadeId: limpo.unidadeId });
  } else {
    const antes = await obterEquipamento(id);
    if (!antes) throw new ErroSistema("nao-encontrado");
    exigir(antes.unidadeId === limpo.unidadeId, "Para transferir de unidade, desative este cadastro e crie outro na unidade de destino.");
    if (antes.ativo !== limpo.ativo) exigir(pode("equipamentos", 4), "Você não tem permissão para desativar equipamentos.");
    await gravarAuditado({ colecao: "equipamentos", id, dados: limpo, antes, resumo: `Alterou ${limpo.nome} (${limpo.codigo})`, unidadeId: limpo.unidadeId });
  }
  return id;
}

export async function mudarSituacao(equipamento, situacao, motivo = "") {
  exigir(pode("equipamentos", 3), "Você não tem permissão para alterar a situação do equipamento.");
  await gravarAuditado({
    colecao: "equipamentos",
    id: equipamento.id,
    dados: { situacao, situacaoMotivo: motivo, situacaoEm: hoje() },
    antes: equipamento,
    acao: "situacao",
    resumo: `Situação de ${equipamento.nome}: ${situacao}${motivo ? ` — ${motivo}` : ""}`,
    unidadeId: equipamento.unidadeId,
  });
}

// ---------------- Ambientes ----------------
export async function listarAmbientes(unidades) {
  const lista = await unirConsultas(unidades.filter(naUnidade).map((u) => bd().consultar("ambientes", [["unidadeId", "==", u]])));
  return lista.sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
}

export async function obterAmbiente(id) {
  return bd().obter(`ambientes/${id}`);
}

export async function salvarAmbiente(id, d) {
  exigir(pode("estrutura", 3), "Você não tem permissão para cadastrar ambientes.");
  const limpo = {
    nome: (d.nome || "").trim(),
    unidadeId: d.unidadeId,
    descricao: (d.descricao || "").trim(),
    elementos: d.elementos || [],
    periodicidadeDias: Math.max(0, Number(d.periodicidadeDias) || 0),
    proximaInspecao: d.proximaInspecao || "",
    ativo: d.ativo !== false,
  };
  exigir(limpo.nome.length >= 2, "Informe o nome do ambiente.");
  exigir(limpo.unidadeId && naUnidade(limpo.unidadeId), "Selecione a unidade.");
  if (!limpo.proximaInspecao && limpo.periodicidadeDias) limpo.proximaInspecao = somarDias(hoje(), limpo.periodicidadeDias);
  if (!id) {
    id = bd().novoId("ambientes");
    await gravarAuditado({ colecao: "ambientes", id, dados: limpo, resumo: `Cadastrou o ambiente ${limpo.nome}`, unidadeId: limpo.unidadeId });
  } else {
    const antes = await obterAmbiente(id);
    if (!antes) throw new ErroSistema("nao-encontrado");
    if (antes.ativo !== limpo.ativo) exigir(pode("estrutura", 4), "Você não tem permissão para desativar ambientes.");
    await gravarAuditado({ colecao: "ambientes", id, dados: limpo, antes, resumo: `Alterou o ambiente ${limpo.nome}`, unidadeId: limpo.unidadeId });
  }
  return id;
}

// ---------------- Inspeções e manutenções ----------------
/**
 * Registra inspeção/manutenção. setorId: 'equipamentos' | 'estrutura'.
 * Atualiza a última e a próxima inspeção do alvo.
 */
export async function registrarManutencao({ setorId, alvo, tipo, data, descricao, resultado, elementos = [], fotos = [], custo }) {
  exigir(pode(setorId, 3), "Você não tem permissão para registrar manutenções.");
  exigir(descricao && descricao.trim(), "Descreva o que foi feito ou verificado.");
  const colecaoAlvo = setorId === "equipamentos" ? "equipamentos" : "ambientes";
  const id = bd().novoId("manutencoes");
  const dataReg = data || hoje();
  const lote = bd().lote();
  lote.definir(`manutencoes/${id}`, {
    setorId,
    unidadeId: alvo.unidadeId,
    alvoTipo: colecaoAlvo,
    alvoId: alvo.id,
    alvoNome: alvo.nome,
    tipo,
    data: dataReg,
    mes: mesDe(dataReg),
    descricao: descricao.trim(),
    resultado: resultado || "ok",
    elementos,
    fotos,
    autorLogin: meuLogin(),
    autorNome: sessao.perfil.nome,
    criadoEm: bd().agora(),
  });
  const atualizacao = { ultimaInspecao: dataReg };
  if (alvo.periodicidadeDias) atualizacao.proximaInspecao = somarDias(dataReg, alvo.periodicidadeDias);
  if (setorId === "equipamentos" && resultado === "ok" && ["em_manutencao", "aguardando_manutencao", "aguardando_avaliacao"].includes(alvo.situacao) && tipo !== "inspecao") {
    atualizacao.situacao = "operando";
    atualizacao.situacaoEm = dataReg;
  }
  const auditId = auditar(lote, {
    colecao: colecaoAlvo,
    docId: alvo.id,
    acao: "manutencao",
    resumo: `${tipo === "inspecao" ? "Inspeção" : "Manutenção"} em ${alvo.nome}`,
    antes: alvo,
    depois: atualizacao,
    unidadeId: alvo.unidadeId,
  });
  lote.atualizar(`${colecaoAlvo}/${alvo.id}`, { ...atualizacao, ...carimboAtualizacao(), _auditId: auditId });
  if (custo && custo.valor > 0) {
    const cid = bd().novoId("custos");
    lote.definir(`custos/${cid}`, {
      unidadeId: alvo.unidadeId,
      setorId,
      manutencaoId: id,
      equipamentoId: colecaoAlvo === "equipamentos" ? alvo.id : "",
      ambienteId: colecaoAlvo === "ambientes" ? alvo.id : "",
      descricao: custo.descricao || descricao.trim(),
      categoria: custo.categoria || "Mão de obra",
      valor: custo.valor,
      fornecedor: custo.fornecedor || "",
      notaFiscal: custo.notaFiscal || null,
      data: dataReg,
      mes: mesDe(dataReg),
      cancelado: false,
      autorLogin: meuLogin(),
      autorNome: sessao.perfil.nome,
      criadoEm: bd().agora(),
    });
  }
  await lote.confirmar();
  return id;
}

export async function listarManutencoes({ unidades, setorId, inicio, fim, alvoId }) {
  const promessas = [];
  for (const u of unidades) {
    if (!naUnidade(u) || !pode(setorId, 1)) continue;
    if (alvoId) {
      const f = [["unidadeId", "==", u], ["setorId", "==", setorId], ["alvoId", "==", alvoId]];
      if (!pode(setorId, 2)) f.push(["autorLogin", "==", meuLogin()]);
      promessas.push(bd().consultar("manutencoes", f));
    } else {
      for (const m of mesesEntre(inicio, fim)) {
        const f = [["unidadeId", "==", u], ["setorId", "==", setorId], ["mes", "==", m]];
        if (!pode(setorId, 2)) f.push(["autorLogin", "==", meuLogin()]);
        promessas.push(bd().consultar("manutencoes", f));
      }
    }
  }
  if (!promessas.length) return [];
  const lista = await unirConsultas(promessas);
  return lista
    .filter((x) => alvoId || (x.data >= inicio && x.data <= fim))
    .sort((a, b) => (b.data || "").localeCompare(a.data || ""));
}

// ---------------- Custos ----------------
/** Custos visíveis: setores que o usuário supervisiona (nível 2+) ou relatórios/gestão. */
export async function listarCustos({ unidades, inicio, fim, setores }) {
  const promessas = [];
  const visaoGeral = pode("relatorios", 2) || pode("gestao", 2);
  for (const u of unidades) {
    if (!naUnidade(u)) continue;
    for (const m of mesesEntre(inicio, fim)) {
      if (visaoGeral) promessas.push(bd().consultar("custos", [["unidadeId", "==", u], ["mes", "==", m]]));
      else for (const s of setores) if (pode(s, 2)) promessas.push(bd().consultar("custos", [["unidadeId", "==", u], ["setorId", "==", s], ["mes", "==", m]]));
    }
  }
  if (!promessas.length) return [];
  const lista = await unirConsultas(promessas);
  return lista.filter((c) => !c.cancelado && c.data >= inicio && c.data <= fim && (!setores?.length || visaoGeral || setores.includes(c.setorId)));
}

export async function lancarCustoAvulso(d) {
  exigir(pode(d.setorId, 3) || pode("gestao", 3), "Você não tem permissão para lançar custos.");
  exigir(d.descricao && d.descricao.trim(), "Descreva o custo.");
  exigir(Number.isFinite(d.valor) && d.valor > 0, "Informe um valor maior que zero.");
  const id = bd().novoId("custos");
  const lote = bd().lote();
  const dataCusto = d.data || hoje();
  lote.definir(`custos/${id}`, {
    unidadeId: d.unidadeId,
    setorId: d.setorId,
    descricao: d.descricao.trim(),
    categoria: d.categoria || "Outros",
    valor: d.valor,
    fornecedor: (d.fornecedor || "").trim(),
    notaFiscal: d.notaFiscal || null,
    equipamentoId: d.equipamentoId || "",
    ambienteId: d.ambienteId || "",
    data: dataCusto,
    mes: mesDe(dataCusto),
    cancelado: false,
    autorLogin: meuLogin(),
    autorNome: sessao.perfil.nome,
    criadoEm: bd().agora(),
  });
  await lote.confirmar();
  return id;
}

export async function cancelarCusto(custo, justificativa) {
  exigir(pode(custo.setorId, 4) || pode("gestao", 4), "Você não tem permissão para cancelar custos.");
  exigir(justificativa && justificativa.trim(), "Informe o motivo.");
  await gravarAuditado({
    colecao: "custos",
    id: custo.id,
    dados: { cancelado: true, justificativaCancelamento: justificativa.trim() },
    antes: custo,
    acao: "cancelar",
    resumo: `Cancelou o custo ${custo.descricao}`,
    unidadeId: custo.unidadeId,
  });
}

export function inspecaoVencida(alvo) {
  return alvo.ativo !== false && alvo.proximaInspecao && alvo.proximaInspecao < hoje();
}

export { carimboCriacao };
