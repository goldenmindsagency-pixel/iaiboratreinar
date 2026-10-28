// Comercial: metas, importação de dados do EVO e indicadores (contatos manuais + EVO).
import { sessao, pode, naUnidade, meuLogin } from "../core/sessao.js";
import { ErroSistema } from "../core/erros.js";
import { TIPOS_META, TIPOS_EVO } from "../core/constantes.js";
import { mesDe, mesesEntre, inicioMes, fimMes } from "../core/tempo.js";
import { paraCentavos, normalizarTexto, razao } from "../core/formato.js";
import { bd, gravarAuditado, exigir, unirConsultas } from "./base.js";
import { listarRegistros } from "./rotinas.js";

// ---------------- Metas ----------------
export async function listarMetas({ unidades, mes }) {
  const lista = await unirConsultas(unidades.filter(naUnidade).map((u) => bd().consultar("metas", [["unidadeId", "==", u], ["mes", "==", mes]])));
  return lista.filter((m) => m.ativo !== false);
}

export async function salvarMeta(id, d) {
  exigir(pode("comercial", 3), "Você não tem permissão para cadastrar metas.");
  exigir(TIPOS_META[d.tipo], "Escolha o tipo da meta.");
  const valor = d.tipo === "receita" ? paraCentavos(d.valor) : Math.round(Number(d.valor));
  exigir(Number.isFinite(valor) && valor > 0, "Informe um valor de meta maior que zero.");
  const limpo = {
    unidadeId: d.unidadeId,
    mes: d.mes,
    tipo: d.tipo,
    escopo: d.vendedorLogin ? "individual" : "unidade",
    vendedorLogin: d.vendedorLogin || "",
    vendedorNome: d.vendedorNome || "",
    valor,
    ativo: d.ativo !== false,
  };
  exigir(limpo.unidadeId && /^\d{4}-\d{2}$/.test(limpo.mes), "Selecione unidade e mês.");
  if (!id) {
    id = `${limpo.unidadeId}__${limpo.mes}__${limpo.tipo}__${limpo.vendedorLogin || "unidade"}`;
    const antes = await bd().obter(`metas/${id}`);
    await gravarAuditado({ colecao: "metas", id, dados: limpo, antes, resumo: `Meta de ${TIPOS_META[limpo.tipo].rotulo} (${limpo.mes})`, unidadeId: limpo.unidadeId });
  } else {
    const antes = await bd().obter(`metas/${id}`);
    await gravarAuditado({ colecao: "metas", id, dados: limpo, antes, resumo: `Alterou meta de ${TIPOS_META[limpo.tipo].rotulo} (${limpo.mes})`, unidadeId: limpo.unidadeId });
  }
  return id;
}

// ---------------- EVO ----------------
/** Lê texto colado do Excel (tabulação) ou CSV (; ou ,) em uma matriz */
export function lerTabela(texto) {
  const linhas = String(texto || "").replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (!linhas.length) return [];
  const amostra = linhas[0];
  const sep = amostra.includes("\t") ? "\t" : (amostra.match(/;/g) || []).length >= (amostra.match(/,/g) || []).length ? ";" : ",";
  return linhas.map((linha) => {
    const celulas = [];
    let atual = "";
    let aspas = false;
    for (let i = 0; i < linha.length; i++) {
      const c = linha[i];
      if (c === '"') {
        if (aspas && linha[i + 1] === '"') {
          atual += '"';
          i++;
        } else aspas = !aspas;
      } else if (c === sep && !aspas) {
        celulas.push(atual.trim());
        atual = "";
      } else atual += c;
    }
    celulas.push(atual.trim());
    return celulas;
  });
}

/** Converte "27/10/2026", "2026-10-27" ou "27/10/26" em 'AAAA-MM-DD' */
export function lerData(texto) {
  const s = String(texto || "").trim().slice(0, 10);
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (m) {
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return "";
}

export function tipoEvoDe(texto, padrao) {
  const t = normalizarTexto(texto);
  if (!t) return padrao;
  if (t.includes("renov")) return "renovacao";
  if (t.includes("cancel") || t.includes("trancad") || t.includes("desist")) return "cancelamento";
  if (t.includes("matric") || t.includes("nova") || t.includes("venda")) return "matricula";
  return padrao;
}

/**
 * Prepara as linhas para importação a partir do mapeamento de colunas.
 * mapa: { data, codigo, nome, plano, valor, tipo, vendedor, motivo } => índice da coluna
 */
export function prepararImportacao({ matriz, mapa, temCabecalho, tipoPadrao, unidadeId }) {
  const linhas = temCabecalho ? matriz.slice(1) : matriz;
  const validas = [];
  const rejeitadas = [];
  linhas.forEach((cel, i) => {
    const get = (k) => (mapa[k] === "" || mapa[k] === undefined ? "" : cel[Number(mapa[k])] ?? "");
    const data = lerData(get("data"));
    const codigo = String(get("codigo")).trim();
    const tipo = mapa.tipo !== "" && mapa.tipo !== undefined ? tipoEvoDe(get("tipo"), tipoPadrao) : tipoPadrao;
    const valor = get("valor") ? paraCentavos(get("valor")) : 0;
    const problemas = [];
    if (!data) problemas.push("data inválida");
    if (!codigo) problemas.push("sem código do aluno");
    if (Number.isNaN(valor)) problemas.push("valor inválido");
    const item = {
      linha: i + (temCabecalho ? 2 : 1),
      unidadeId,
      tipo,
      data,
      mes: data ? mesDe(data) : "",
      alunoCodigo: codigo,
      alunoNome: String(get("nome")).trim().split(/\s+/).slice(0, 2).join(" "), // só o necessário (LGPD)
      plano: String(get("plano")).trim(),
      valor: Number.isNaN(valor) ? 0 : valor,
      vendedor: String(get("vendedor")).trim(),
      motivo: String(get("motivo")).trim(),
    };
    if (problemas.length) rejeitadas.push({ ...item, problemas });
    else validas.push(item);
  });
  return { validas, rejeitadas };
}

export function idEvo(r) {
  return `${r.unidadeId}__${r.tipo}__${String(r.alunoCodigo).replace(/[^a-zA-Z0-9-]/g, "")}__${r.data}`;
}

export async function importarEvo({ unidadeId, validas, nomeArquivo }) {
  exigir(pode("comercial", 3) && naUnidade(unidadeId), "Você não tem permissão para importar dados do EVO.");
  exigir(validas.length, "Não há linhas válidas para importar.");
  // Evita duplicados: consulta o que já existe nos meses envolvidos
  const meses = [...new Set(validas.map((v) => v.mes))];
  const existentes = await unirConsultas(meses.map((m) => bd().consultar("evoDados", [["unidadeId", "==", unidadeId], ["mes", "==", m]])));
  const ja = new Set(existentes.map((e) => e.id));
  const novos = [];
  const vistos = new Set();
  for (const v of validas) {
    const id = idEvo(v);
    if (ja.has(id) || vistos.has(id)) continue;
    vistos.add(id);
    novos.push({ id, ...v });
  }
  const importacaoId = bd().novoId("importacoesEvo");
  // Lotes de até 400 gravações (limite do Firestore: 500 por lote)
  for (let i = 0; i < novos.length; i += 400) {
    const lote = bd().lote();
    for (const n of novos.slice(i, i + 400)) {
      const { id, linha, ...dados } = n;
      lote.definir(`evoDados/${id}`, { ...dados, importacaoId, cancelado: false, criadoEm: bd().agora() });
    }
    if (i === 0) {
      lote.definir(`importacoesEvo/${importacaoId}`, {
        unidadeId,
        arquivo: nomeArquivo || "Colado da planilha",
        linhas: validas.length,
        importadas: novos.length,
        duplicadas: validas.length - novos.length,
        autorLogin: meuLogin(),
        autorNome: sessao.perfil.nome,
        em: bd().agora(),
      });
    }
    await lote.confirmar();
  }
  return { importadas: novos.length, duplicadas: validas.length - novos.length };
}

export async function listarEvo({ unidades, inicio, fim }) {
  const promessas = [];
  for (const u of unidades) if (naUnidade(u)) for (const m of mesesEntre(inicio, fim)) promessas.push(bd().consultar("evoDados", [["unidadeId", "==", u], ["mes", "==", m]]));
  if (!promessas.length || !pode("comercial", 2)) return [];
  const lista = await unirConsultas(promessas);
  return lista.filter((e) => !e.cancelado && e.data >= inicio && e.data <= fim);
}

export async function listarImportacoes(unidades) {
  if (!pode("comercial", 2)) return [];
  const lista = await unirConsultas(unidades.filter(naUnidade).map((u) => bd().consultar("importacoesEvo", [["unidadeId", "==", u]])));
  return lista.sort((a, b) => (b.em?.getTime?.() || 0) - (a.em?.getTime?.() || 0));
}

// ---------------- Indicadores comerciais ----------------
/**
 * Fórmulas:
 *  - contatos: registros manuais do tipo "contato" (rotina comercial)
 *  - leads: contatos com tipo "Lead recebido"
 *  - matrículas, renovações, cancelamentos, receita: dados importados do EVO
 *  - conversão: matrículas (EVO) ÷ leads recebidos no mesmo período
 */
export async function resumoComercial({ unidades, inicio, fim }) {
  const [contatos, evo] = await Promise.all([
    listarRegistros({ unidades, setorId: "comercial", inicio, fim, tipo: "contato" }).catch(() => []),
    listarEvo({ unidades, inicio, fim }).catch(() => []),
  ]);
  const contar = (lista, campo) => lista.reduce((m, r) => ((m[r.dados?.[campo] || "—"] = (m[r.dados?.[campo] || "—"] || 0) + 1), m), {});
  const porTipo = contar(contatos, "tipo");
  const porCanal = contar(contatos, "canal");
  const porResultado = contar(contatos, "resultado");
  const porVendedor = contatos.reduce((m, r) => ((m[r.autorNome || r.autorLogin] = (m[r.autorNome || r.autorLogin] || 0) + 1), m), {});
  const matriculas = evo.filter((e) => e.tipo === "matricula");
  const renovacoes = evo.filter((e) => e.tipo === "renovacao");
  const cancelamentos = evo.filter((e) => e.tipo === "cancelamento");
  const leads = porTipo["Lead recebido"] || 0;
  const motivos = cancelamentos.reduce((m, c) => ((m[c.motivo || "Não informado"] = (m[c.motivo || "Não informado"] || 0) + 1), m), {});
  const planos = [...matriculas, ...renovacoes].reduce((m, c) => ((m[c.plano || "Não informado"] = (m[c.plano || "Não informado"] || 0) + 1), m), {});
  return {
    contatos: contatos.length,
    prospeccao: porTipo["Prospecção ativa"] || 0,
    visitas: porTipo["Visita presencial"] || 0,
    leads,
    recuperacao: porTipo["Aluno inativo (recuperação)"] || 0,
    faltantes: porTipo["Aluno faltante"] || 0,
    porTipo,
    porCanal,
    porResultado,
    porVendedor,
    matriculas: matriculas.length,
    renovacoes: renovacoes.length,
    cancelamentos: cancelamentos.length,
    receita: [...matriculas, ...renovacoes].reduce((s, e) => s + (e.valor || 0), 0),
    conversao: razao(matriculas.length, leads),
    motivosCancelamento: motivos,
    planos,
    temEvo: evo.length > 0,
    listaContatos: contatos,
    listaEvo: evo,
  };
}

/** Realizado de uma meta conforme a fonte de dados */
export function realizadoMeta(meta, resumo) {
  const contatosDoVendedor = (filtro) =>
    resumo.listaContatos.filter((c) => c.unidadeId === meta.unidadeId && (!meta.vendedorLogin || c.autorLogin === meta.vendedorLogin) && filtro(c)).length;
  switch (meta.tipo) {
    case "contatos":
      return contatosDoVendedor(() => true);
    case "prospeccao":
      return contatosDoVendedor((c) => c.dados?.tipo === "Prospecção ativa");
    case "visitas":
      return contatosDoVendedor((c) => c.dados?.tipo === "Visita presencial");
    case "matriculas":
      return resumo.listaEvo.filter((e) => e.tipo === "matricula" && e.unidadeId === meta.unidadeId && (!meta.vendedorLogin || normalizarTexto(e.vendedor) === normalizarTexto(meta.vendedorNome))).length;
    case "renovacoes":
      return resumo.listaEvo.filter((e) => e.tipo === "renovacao" && e.unidadeId === meta.unidadeId && (!meta.vendedorLogin || normalizarTexto(e.vendedor) === normalizarTexto(meta.vendedorNome))).length;
    case "receita":
      return resumo.listaEvo
        .filter((e) => (e.tipo === "matricula" || e.tipo === "renovacao") && e.unidadeId === meta.unidadeId && (!meta.vendedorLogin || normalizarTexto(e.vendedor) === normalizarTexto(meta.vendedorNome)))
        .reduce((s, e) => s + (e.valor || 0), 0);
    default:
      return 0;
  }
}

export function periodoDoMes(mes) {
  return { inicio: inicioMes(mes), fim: fimMes(mes) };
}

export { TIPOS_EVO, ErroSistema };
