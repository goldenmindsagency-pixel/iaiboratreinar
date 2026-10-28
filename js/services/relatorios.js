// Consolidação de dados para relatórios (por período, por unidade ou consolidado).
import { pode, modulosRotina, nomeModulo } from "../core/sessao.js";
import { resumoRotinas, resumoPendencias, taxas } from "./indicadores.js";
import { resumoComercial, listarMetas, realizadoMeta } from "./comercial.js";
import { listarAcoes, resumoMarketing } from "./marketing.js";
import { listarEquipamentos, listarAmbientes, listarManutencoes, listarCustos, inspecaoVencida } from "./manutencao.js";
import { listarInvestimentos } from "./gestao.js";
import { listarRegistros } from "./rotinas.js";
import { mesesEntre } from "../core/tempo.js";
import { TIPOS_META } from "../core/constantes.js";

const seguro = (p, padrao = null) => p.catch(() => padrao);

/** Junta todos os dados de um período. Cada parte só é buscada se o usuário tiver permissão. */
export async function montarDados({ unidades, inicio, fim }) {
  const setoresRotina = modulosRotina().map((m) => m.id);
  const setoresOperacionais = setoresRotina.filter((s) => s !== "gestao");
  const tarefas = {
    rotinas: seguro(resumoRotinas({ unidades, setores: setoresOperacionais, inicio, fim })),
    gerencial: pode("gestao", 2) ? seguro(resumoRotinas({ unidades, setores: ["gestao"], inicio, fim })) : null,
    pendencias: seguro(resumoPendencias({ unidades, inicio, fim, setores: setoresRotina.concat(["equipamentos", "estrutura"]) })),
    comercial: pode("comercial", 2) ? seguro(resumoComercial({ unidades, inicio, fim })) : null,
    metas: pode("comercial", 1) ? seguro(Promise.all(mesesEntre(inicio, fim).map((m) => listarMetas({ unidades, mes: m }))).then((l) => l.flat()), []) : [],
    marketing: pode("marketing", 2) ? seguro(listarAcoes({ unidades, inicio, fim }), []) : [],
    equipamentos: pode("equipamentos", 1) ? seguro(listarEquipamentos(unidades), []) : [],
    ambientes: pode("estrutura", 1) ? seguro(listarAmbientes(unidades), []) : [],
    manutEquip: pode("equipamentos", 2) ? seguro(listarManutencoes({ unidades, setorId: "equipamentos", inicio, fim }), []) : [],
    manutEstr: pode("estrutura", 2) ? seguro(listarManutencoes({ unidades, setorId: "estrutura", inicio, fim }), []) : [],
    custos: seguro(listarCustos({ unidades, inicio, fim, setores: ["equipamentos", "estrutura", "limpeza", "gestao", ...setoresOperacionais] }), []),
    investimentos: pode("gestao", 2) || pode("relatorios", 2) ? seguro(listarInvestimentos(unidades), []) : [],
    atendimentos: pode("recepcao", 2) ? seguro(listarRegistros({ unidades, setorId: "recepcao", inicio, fim }), []) : [],
    feedbacks: pode("salao", 2) ? seguro(listarRegistros({ unidades, setorId: "salao", inicio, fim }), []) : [],
  };
  const r = {};
  await Promise.all(Object.entries(tarefas).map(async ([k, p]) => (r[k] = await p)));
  r.resumoMarketing = resumoMarketing(r.marketing || []);
  r.inicio = inicio;
  r.fim = fim;
  r.unidades = unidades;
  return r;
}

/** Números compactos que ficam "congelados" no relatório mensal enviado */
export function congelarNumeros(d) {
  const setor = (id) => {
    const s = d.rotinas?.listaSetores?.find((x) => x.id === id);
    return s
      ? { programados: s.programados, enviados: s.enviados, naoEnviados: s.naoEnviados, concluidas: s.concluidas, pendentes: s.pendentes, naoAplicaveis: s.naoAplicaveis, execucao: s.execucao, conclusao: s.conclusao, cobertura: s.cobertura }
      : null;
  };
  const custosPorSetor = {};
  for (const c of d.custos || []) custosPorSetor[c.setorId] = (custosPorSetor[c.setorId] || 0) + (c.valor || 0);
  const eq = (d.equipamentos || []).filter((e) => e.ativo !== false);
  const invAbertos = (d.investimentos || []).filter((i) => ["identificado", "orcado", "aprovado"].includes(i.status));
  const invRealizados = (d.investimentos || []).filter((i) => i.status === "realizado" && i.dataRealizacao >= d.inicio && i.dataRealizacao <= d.fim);
  const contar = (lista, campo) => lista.reduce((m, r) => ((m[r.dados?.[campo] || "—"] = (m[r.dados?.[campo] || "—"] || 0) + 1), m), {});
  return {
    periodo: { inicio: d.inicio, fim: d.fim },
    geradoEm: new Date().toISOString(),
    operacional: d.rotinas ? { ...d.rotinas.total, ...d.rotinas.taxas } : null,
    setores: Object.fromEntries((d.rotinas?.listaSetores || []).map((s) => [s.id, setor(s.id)])),
    gerencial: d.gerencial ? { ...d.gerencial.total, ...d.gerencial.taxas } : null,
    rankingPendentes: (d.rotinas?.ranking || []).slice(0, 5).map((r) => ({ texto: r.texto, setor: nomeModulo(r.setorId), vezes: r.vezes })),
    faltaMaterial: { blocos: d.rotinas?.faltaMaterial?.blocos || 0, itens: (d.rotinas?.faltaMaterial?.itens || []).slice(0, 10).map((i) => i.texto) },
    pendencias: d.pendencias
      ? {
          abertas: d.pendencias.abertas,
          criticas: d.pendencias.criticas,
          atrasadas: d.pendencias.atrasadas,
          registradas: d.pendencias.registradasPeriodo,
          resolvidas: d.pendencias.resolvidasPeriodo,
          cumprimentoPrazo: d.pendencias.cumprimentoPrazo,
          tempoMedio: d.pendencias.tempoMedio,
          porCategoria: d.pendencias.porCategoria,
          recorrentes: d.pendencias.recorrentes.slice(0, 5),
          principais: d.pendencias.lista
            .filter((p) => p.dataAbertura >= d.inicio && p.dataAbertura <= d.fim)
            .sort((a, b) => ({ critica: 0, alta: 1, media: 2, baixa: 3 }[a.prioridade] - { critica: 0, alta: 1, media: 2, baixa: 3 }[b.prioridade]))
            .slice(0, 8)
            .map((p) => ({ codigo: p.codigo, titulo: p.titulo, prioridade: p.prioridade, status: p.status, solucao: p.solucao || "", custo: p.custoTotal || 0 })),
        }
      : null,
    comercial: d.comercial
      ? {
          contatos: d.comercial.contatos,
          prospeccao: d.comercial.prospeccao,
          visitas: d.comercial.visitas,
          leads: d.comercial.leads,
          matriculas: d.comercial.matriculas,
          renovacoes: d.comercial.renovacoes,
          cancelamentos: d.comercial.cancelamentos,
          receita: d.comercial.receita,
          conversao: d.comercial.conversao,
          temEvo: d.comercial.temEvo,
          porCanal: d.comercial.porCanal,
          motivosCancelamento: d.comercial.motivosCancelamento,
          metas: (d.metas || []).map((m) => ({ tipo: TIPOS_META[m.tipo]?.rotulo || m.tipo, vendedor: m.vendedorNome || "", meta: m.valor, realizado: realizadoMeta(m, d.comercial), receita: m.tipo === "receita" })),
        }
      : null,
    marketing: d.resumoMarketing,
    atendimento: {
      atendimentos: (d.atendimentos || []).length,
      porTipo: contar(d.atendimentos || [], "tipo"),
      reclamacoes: (d.atendimentos || []).filter((a) => a.dados?.tipo === "Reclamação").length,
      registrosSalao: (d.feedbacks || []).length,
      salaoPorTipo: contar(d.feedbacks || [], "tipo"),
    },
    equipamentos: {
      total: eq.length,
      operando: eq.filter((e) => !e.situacao || e.situacao === "operando").length,
      emManutencao: eq.filter((e) => ["em_manutencao", "aguardando_manutencao", "aguardando_avaliacao"].includes(e.situacao)).length,
      interditados: eq.filter((e) => e.situacao === "interditado").map((e) => `${e.codigo} · ${e.nome}`),
      inspecoesVencidas: eq.filter(inspecaoVencida).length,
      manutencoes: (d.manutEquip || []).length,
      custo: custosPorSetor.equipamentos || 0,
    },
    estrutura: {
      ambientes: (d.ambientes || []).filter((a) => a.ativo !== false).length,
      inspecoes: (d.manutEstr || []).length,
      problemasEncontrados: (d.manutEstr || []).filter((m) => m.resultado === "problema").length,
      inspecoesVencidas: (d.ambientes || []).filter(inspecaoVencida).length,
      custo: custosPorSetor.estrutura || 0,
    },
    custos: { total: (d.custos || []).reduce((s, c) => s + (c.valor || 0), 0), porSetor: custosPorSetor },
    investimentos: {
      emAberto: invAbertos.map((i) => ({ titulo: i.titulo, status: i.status, estimado: i.valorEstimado || 0 })),
      totalEstimado: invAbertos.reduce((s, i) => s + (i.valorEstimado || 0), 0),
      realizados: invRealizados.map((i) => ({ titulo: i.titulo, valor: i.valorRealizado || 0, data: i.dataRealizacao })),
      totalRealizado: invRealizados.reduce((s, i) => s + (i.valorRealizado || 0), 0),
    },
  };
}

export { taxas };
