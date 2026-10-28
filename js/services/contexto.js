// "Contexto automático" exibido ao lado dos itens do checklist do gestor: dados reais do dia.
import { pode, nomeModulo, modulosRotina } from "../core/sessao.js";
import { hoje, segundaDaSemana, somarDias, mesDe, inicioMes } from "../core/tempo.js";
import { pct, numero } from "../core/formato.js";
import { resumoRotinas, resumoPendencias } from "./indicadores.js";
import { listarRegistros } from "./rotinas.js";
import { listarEquipamentos, listarAmbientes, inspecaoVencida } from "./manutencao.js";
import { listarAcoes } from "./marketing.js";
import { listarEvo } from "./comercial.js";
import { SITUACOES_EQUIPAMENTO } from "../core/constantes.js";

/**
 * Retorna Map(chave => [{ rotulo, valor, tom }]) para os contextos pedidos.
 * Cada fonte só é consultada se algum item precisar dela e o usuário tiver permissão.
 */
export async function carregarContextos(unidadeId, chaves) {
  const pedidos = new Set(chaves.filter(Boolean));
  const saida = new Map();
  if (!pedidos.size) return saida;
  const d = hoje();
  const unidades = [unidadeId];
  const tarefas = {};

  const precisa = (...lista) => lista.some((c) => pedidos.has(c));
  const setoresRotina = modulosRotina().map((m) => m.id).filter((s) => s !== "gestao");

  if (precisa("rotinas_hoje", "limpeza_hoje", "recepcao_hoje", "salao_hoje", "equipe_hoje")) {
    tarefas.rotinas = resumoRotinas({ unidades, setores: setoresRotina, inicio: d, fim: d }).catch(() => null);
  }
  if (precisa("pendencias_unidade", "pendencias_criticas", "reclamacoes", "salao_hoje")) {
    tarefas.pendencias = resumoPendencias({ unidades, inicio: d, fim: d, setores: setoresRotina.concat(["equipamentos", "estrutura"]) }).catch(() => null);
  }
  if (precisa("equipamentos_parados") && (pode("equipamentos", 1) || pode("estrutura", 1))) {
    tarefas.equipamentos = listarEquipamentos(unidades).catch(() => []);
    tarefas.ambientes = listarAmbientes(unidades).catch(() => []);
  }
  if (precisa("recepcao_hoje", "reclamacoes") && pode("recepcao", 2)) {
    tarefas.atendimentos = listarRegistros({ unidades, setorId: "recepcao", inicio: d, fim: d }).catch(() => []);
  }
  if (precisa("salao_hoje") && pode("salao", 2)) {
    tarefas.feedbacks = listarRegistros({ unidades, setorId: "salao", inicio: d, fim: d }).catch(() => []);
  }
  if (precisa("comercial_hoje") && pode("comercial", 2)) {
    tarefas.contatos = listarRegistros({ unidades, setorId: "comercial", inicio: d, fim: d }).catch(() => []);
    tarefas.evo = listarEvo({ unidades, inicio: inicioMes(mesDe(d)), fim: d }).catch(() => []);
  }
  if (precisa("marketing_semana") && pode("marketing", 2)) {
    const seg = segundaDaSemana(d);
    tarefas.marketing = listarAcoes({ unidades, inicio: seg, fim: somarDias(seg, 6) }).catch(() => []);
  }

  const r = {};
  await Promise.all(Object.entries(tarefas).map(async ([k, p]) => (r[k] = await p)));

  const setorResumo = (setorId) => r.rotinas?.listaSetores?.find((s) => s.id === setorId);
  const linhaSetor = (setorId) => {
    const s = setorResumo(setorId);
    if (!s || !s.programados) return [{ rotulo: nomeModulo(setorId), valor: "sem rotinas programadas até agora" }];
    return [
      { rotulo: "Enviados", valor: `${s.enviados} de ${s.programados}` },
      s.atrasados ? { rotulo: "Atrasados", valor: numero(s.atrasados), tom: "pendente" } : null,
      s.pendentes ? { rotulo: "Atividades pendentes", valor: numero(s.pendentes), tom: "pendente" } : null,
      { rotulo: "Conclusão", valor: pct(s.conclusao) },
    ].filter(Boolean);
  };

  for (const chave of pedidos) {
    let itens = [];
    switch (chave) {
      case "rotinas_hoje": {
        if (!r.rotinas) itens = [{ rotulo: "Rotinas", valor: "sem permissão ou sem dados" }];
        else {
          const t = r.rotinas.total;
          itens = [
            { rotulo: "Rotinas enviadas", valor: `${t.enviados} de ${t.programados}` },
            { rotulo: "Atrasadas", valor: numero(t.atrasados), tom: t.atrasados ? "pendente" : "" },
            { rotulo: "Conclusão", valor: pct(r.rotinas.taxas.conclusao) },
          ];
        }
        break;
      }
      case "limpeza_hoje":
        itens = linhaSetor("limpeza");
        if (r.rotinas?.faltaMaterial?.blocos) itens.push({ rotulo: "Falta de material", valor: r.rotinas.faltaMaterial.itens.map((i) => i.texto).join("; ") || "sim", tom: "pendente" });
        break;
      case "recepcao_hoje":
        itens = linhaSetor("recepcao");
        if (r.atendimentos) itens.push({ rotulo: "Atendimentos", valor: numero(r.atendimentos.length) });
        break;
      case "salao_hoje":
        itens = linhaSetor("salao");
        if (r.feedbacks) itens.push({ rotulo: "Registros da coordenação", valor: numero(r.feedbacks.length) });
        if (r.pendencias) {
          const n = r.pendencias.lista.filter((p) => p.aberta && p.setorId === "salao").length;
          if (n) itens.push({ rotulo: "Pendências do salão", valor: numero(n), tom: "pendente" });
        }
        break;
      case "pendencias_unidade":
        if (!r.pendencias) itens = [{ rotulo: "Pendências", valor: "sem permissão" }];
        else
          itens = [
            { rotulo: "Abertas", valor: numero(r.pendencias.abertas) },
            { rotulo: "Críticas", valor: numero(r.pendencias.criticas), tom: r.pendencias.criticas ? "critico" : "" },
            { rotulo: "Atrasadas", valor: numero(r.pendencias.atrasadas), tom: r.pendencias.atrasadas ? "pendente" : "" },
            { rotulo: "Vencem em 1 dia", valor: numero(r.pendencias.vencendo) },
          ];
        break;
      case "pendencias_criticas": {
        const lista = (r.pendencias?.lista || [])
          .filter((p) => p.aberta && (p.prioridade === "critica" || (p.prazo && p.prazo < d)))
          .slice(0, 4);
        itens = lista.length
          ? lista.map((p) => ({ rotulo: p.codigo, valor: p.titulo, tom: p.prioridade === "critica" ? "critico" : "pendente" }))
          : [{ rotulo: "Críticas e atrasadas", valor: "nenhuma" }];
        break;
      }
      case "equipamentos_parados": {
        const eq = (r.equipamentos || []).filter((e) => e.ativo !== false);
        const parados = eq.filter((e) => e.situacao && e.situacao !== "operando");
        const porSit = {};
        parados.forEach((e) => (porSit[e.situacao] = (porSit[e.situacao] || 0) + 1));
        itens = Object.entries(porSit).map(([s, n]) => ({ rotulo: SITUACOES_EQUIPAMENTO[s]?.rotulo || s, valor: numero(n), tom: s === "interditado" ? "critico" : "pendente" }));
        if (!itens.length) itens.push({ rotulo: "Equipamentos", valor: `todos operando (${eq.length})` });
        const vencidas = [...eq, ...(r.ambientes || [])].filter(inspecaoVencida).length;
        if (vencidas) itens.push({ rotulo: "Inspeções vencidas", valor: numero(vencidas), tom: "pendente" });
        break;
      }
      case "comercial_hoje": {
        if (!r.contatos) {
          itens = [{ rotulo: "Comercial", valor: "sem permissão" }];
          break;
        }
        const porTipo = (t) => r.contatos.filter((c) => c.dados?.tipo === t).length;
        itens = [
          { rotulo: "Contatos hoje", valor: numero(r.contatos.length) },
          { rotulo: "Prospecções", valor: numero(porTipo("Prospecção ativa")) },
          { rotulo: "Leads recebidos", valor: numero(porTipo("Lead recebido")) },
        ];
        if (r.evo?.length) {
          itens.push({ rotulo: "Matrículas no mês (EVO)", valor: numero(r.evo.filter((e) => e.tipo === "matricula").length) });
          itens.push({ rotulo: "Renovações no mês (EVO)", valor: numero(r.evo.filter((e) => e.tipo === "renovacao").length) });
        }
        break;
      }
      case "marketing_semana": {
        if (!r.marketing) {
          itens = [{ rotulo: "Marketing", valor: "sem permissão" }];
          break;
        }
        const conteudos = r.marketing.filter((a) => a.tipo === "conteudo");
        const atrasados = conteudos.filter((a) => a.etapa !== "publicado" && a.dataPrevista < d);
        itens = [
          { rotulo: "Previstos na semana", valor: numero(conteudos.length) },
          { rotulo: "Publicados", valor: numero(conteudos.filter((a) => a.etapa === "publicado").length) },
          { rotulo: "Atrasados", valor: numero(atrasados.length), tom: atrasados.length ? "pendente" : "" },
        ];
        break;
      }
      case "reclamacoes": {
        const abertas = (r.pendencias?.lista || []).filter((p) => p.aberta && p.categoria === "atendimento").length;
        const hojeRec = (r.atendimentos || []).filter((a) => a.dados?.tipo === "Reclamação" || a.dados?.tipo === "Solicitação de aluno").length;
        itens = [
          { rotulo: "Reclamações/solicitações abertas", valor: numero(abertas), tom: abertas ? "pendente" : "" },
          { rotulo: "Registradas hoje na recepção", valor: numero(hojeRec) },
        ];
        break;
      }
      case "equipe_hoje": {
        const enviados = (r.rotinas?.execucoes || []).filter((e) => e.dataPrevista === d);
        const pessoas = {};
        enviados.forEach((e) => (pessoas[e.autorNome] = (pessoas[e.autorNome] || 0) + 1));
        const pendentes = (r.rotinas?.ocorrencias || []).filter((o) => o.situacao === "atrasado" || o.situacao === "nao_enviado");
        itens = Object.entries(pessoas).map(([nome, n]) => ({ rotulo: nome, valor: `${n} enviado(s)` }));
        if (pendentes.length) itens.push({ rotulo: "Blocos atrasados", valor: pendentes.map((o) => `${nomeModulo(o.modelo.setorId)}: ${o.bloco.nome}`).join("; "), tom: "pendente" });
        if (!itens.length) itens.push({ rotulo: "Equipe", valor: "nenhuma rotina enviada ainda hoje" });
        break;
      }
      default:
        itens = [];
    }
    saida.set(chave, itens);
  }
  return saida;
}

/** Texto curto para guardar junto da resposta (fica no histórico) */
export function contextoComoTexto(itens = []) {
  return itens.map((i) => `${i.rotulo}: ${i.valor}`).join(" · ").slice(0, 500);
}
