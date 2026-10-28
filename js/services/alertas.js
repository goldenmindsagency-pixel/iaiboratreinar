// Alertas dentro da plataforma (sino no topo), calculados a partir dos dados atuais.
import { pode, aprovador, unidadesFiltro, nomeUnidade, nomeModulo, modulosRotina } from "../core/sessao.js";
import { hoje, somarDias, mesDe, somarMeses, inicioMes, fimMes, nomeMes } from "../core/tempo.js";
import { numero, pct } from "../core/formato.js";
import { minhasTarefas, ROTULOS_SITUACAO } from "./rotinas.js";
import * as pend from "./pendencias.js";
import { resumoRotinas } from "./indicadores.js";
import { listarRelatorios } from "./gestao.js";
import { listarEquipamentos, inspecaoVencida } from "./manutencao.js";
import { listarMetas, resumoComercial, realizadoMeta } from "./comercial.js";
import { TIPOS_META } from "../core/constantes.js";

let cache = { em: 0, chave: "", lista: [] };

/** Cada alerta: { tipo: 'critico'|'pendente'|'info', titulo, texto, link } */
export async function carregarAlertas({ forcar = false } = {}) {
  const unidades = unidadesFiltro().map((u) => u.id);
  const chave = unidades.join(",");
  if (!forcar && cache.chave === chave && Date.now() - cache.em < 120000) return cache.lista;
  const d = hoje();
  const alertas = [];
  const tarefas = [];

  // 1) Minhas rotinas
  tarefas.push(
    minhasTarefas()
      .then((lista) => {
        for (const t of lista) {
          if (t.situacao === "atrasado" || t.situacao === "correcao") {
            alertas.push({
              tipo: "pendente",
              titulo: t.situacao === "correcao" ? "Correção solicitada" : "Rotina atrasada",
              texto: `${t.modelo.nome} · ${t.bloco.nome} (${nomeUnidade(t.modelo.unidadeId)})`,
              link: `#/rotina/${encodeURIComponent(t.id)}`,
            });
          }
        }
      })
      .catch(() => {})
  );

  // 2) Pendências atribuídas a mim / críticas da unidade
  tarefas.push(
    pend
      .listar({ unidades, somenteAbertas: true, setores: modulosRotina().map((m) => m.id).concat(["equipamentos", "estrutura"]) })
      .then((lista) => {
        const minhas = lista.filter((p) => pend.souResponsavel(p));
        for (const p of minhas) {
          if (pend.estaAtrasada(p)) alertas.push({ tipo: "critico", titulo: "Pendência atrasada", texto: `${p.codigo} · ${p.titulo}`, link: `#/ocorrencias/${p.id}` });
          else if (pend.venceEmBreve(p, 1)) alertas.push({ tipo: "pendente", titulo: "Prazo vence em até 1 dia", texto: `${p.codigo} · ${p.titulo}`, link: `#/ocorrencias/${p.id}` });
        }
        const supervisao = lista.filter((p) => !pend.souResponsavel(p) && pend.podeGerenciar(p));
        const criticas = supervisao.filter((p) => p.prioridade === "critica");
        criticas.slice(0, 5).forEach((p) =>
          alertas.push({ tipo: "critico", titulo: "Ocorrência crítica aberta", texto: `${p.codigo} · ${p.titulo} (${nomeUnidade(p.unidadeId)})`, link: `#/ocorrencias/${p.id}` })
        );
        const atrasadas = supervisao.filter((p) => pend.estaAtrasada(p) && p.prioridade !== "critica");
        if (atrasadas.length) alertas.push({ tipo: "pendente", titulo: "Pendências atrasadas", texto: `${numero(atrasadas.length)} pendência(s) com prazo vencido nas suas unidades`, link: "#/ocorrencias?filtro=atrasadas" });
        const semResp = supervisao.filter((p) => !p.responsavelLogin);
        if (semResp.length) alertas.push({ tipo: "info", titulo: "Sem responsável", texto: `${numero(semResp.length)} ocorrência(s) aguardando responsável`, link: "#/ocorrencias?filtro=sem-responsavel" });
      })
      .catch(() => {})
  );

  // 3) Rotinas dos setores supervisionados não enviadas (ontem e hoje)
  const supervisionados = modulosRotina().map((m) => m.id).filter((s) => pode(s, 3));
  if (supervisionados.length) {
    tarefas.push(
      resumoRotinas({ unidades, setores: supervisionados, inicio: somarDias(d, -1), fim: d })
        .then((r) => {
          const naoEnviados = r.ocorrencias.filter((o) => o.situacao === "nao_enviado" || o.situacao === "atrasado");
          const porSetor = {};
          naoEnviados.forEach((o) => (porSetor[o.modelo.setorId] = (porSetor[o.modelo.setorId] || 0) + 1));
          for (const [s, n] of Object.entries(porSetor)) {
            alertas.push({
              tipo: "pendente",
              titulo: "Checklists não enviados",
              texto: `${nomeModulo(s)}: ${numero(n)} bloco(s) atrasado(s) ou não enviado(s)`,
              link: `#/setor/${s}?aba=acompanhar`,
            });
          }
          const correcoes = r.execucoes.filter((e) => e.status === "correcao").length;
          if (correcoes) alertas.push({ tipo: "info", titulo: "Correções em aberto", texto: `${numero(correcoes)} rotina(s) aguardando correção do colaborador`, link: "#/" });
        })
        .catch(() => {})
    );
  }

  // 4) Relatório mensal
  if (pode("gestao", 3) || aprovador()) {
    tarefas.push(
      listarRelatorios(unidades)
        .then((lista) => {
          const mesAnterior = somarMeses(mesDe(d), -1);
          const dia = Number(d.slice(8, 10));
          if (pode("gestao", 3) && dia <= 5) {
            for (const u of unidades) {
              const rel = lista.find((r) => r.unidadeId === u && r.mes === mesAnterior);
              if (!rel || ["rascunho", "devolvido"].includes(rel.status)) {
                alertas.push({ tipo: "pendente", titulo: "Relatório mensal pendente", texto: `${nomeUnidade(u)} · ${nomeMes(mesAnterior)} — prazo: dia 5`, link: `#/gestao?aba=relatorio&unidade=${u}&mes=${mesAnterior}` });
              }
            }
          }
          if (aprovador()) {
            lista
              .filter((r) => r.status === "enviado")
              .forEach((r) => alertas.push({ tipo: "info", titulo: "Relatório aguardando aprovação", texto: `${nomeUnidade(r.unidadeId)} · ${nomeMes(r.mes)}`, link: `#/gestao?aba=relatorio&unidade=${r.unidadeId}&mes=${r.mes}` }));
          }
        })
        .catch(() => {})
    );
  }

  // 5) Inspeções vencidas
  if (pode("equipamentos", 3)) {
    tarefas.push(
      listarEquipamentos(unidades)
        .then((lista) => {
          const vencidas = lista.filter(inspecaoVencida);
          if (vencidas.length) alertas.push({ tipo: "pendente", titulo: "Manutenção atrasada", texto: `${numero(vencidas.length)} equipamento(s) com inspeção/preventiva vencida`, link: "#/equipamentos?filtro=vencidas" });
        })
        .catch(() => {})
    );
  }

  // 6) Metas comerciais abaixo do ritmo esperado
  if (pode("comercial", 3)) {
    tarefas.push(
      (async () => {
        const mes = mesDe(d);
        const metas = await listarMetas({ unidades, mes });
        if (!metas.length) return;
        const resumo = await resumoComercial({ unidades, inicio: inicioMes(mes), fim: d });
        const diasMes = Number(fimMes(mes).slice(8, 10));
        const ritmo = Number(d.slice(8, 10)) / diasMes;
        for (const m of metas) {
          const real = realizadoMeta(m, resumo);
          const alcance = m.valor ? real / m.valor : 0;
          if (ritmo > 0.3 && alcance < ritmo - 0.15) {
            alertas.push({
              tipo: "pendente",
              titulo: "Meta abaixo do ritmo",
              texto: `${TIPOS_META[m.tipo]?.rotulo}${m.vendedorNome ? ` · ${m.vendedorNome}` : ""}: ${pct(alcance)} da meta com ${pct(ritmo)} do mês (${nomeUnidade(m.unidadeId)})`,
              link: "#/setor/comercial?aba=painel",
            });
          }
        }
      })().catch(() => {})
    );
  }

  await Promise.all(tarefas);
  const ordem = { critico: 0, pendente: 1, info: 2 };
  alertas.sort((a, b) => ordem[a.tipo] - ordem[b.tipo]);
  cache = { em: Date.now(), chave, lista: alertas };
  return alertas;
}

export function limparCacheAlertas() {
  cache = { em: 0, chave: "", lista: [] };
}

export { ROTULOS_SITUACAO };
