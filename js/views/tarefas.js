// Minhas tarefas: blocos do dia, atrasados, semana e fechamento do mês.
import { html, montar } from "../core/dom.js";
import { icone } from "../core/icones.js";
import { sessao, nomeUnidade, nomeModulo, pode, minhasUnidades } from "../core/sessao.js";
import { estadoVazio, estadoErro, seloStatusPendencia, seloPrioridade } from "../core/ui.js";
import { hoje, formatarData, nomeDiaSemana } from "../core/tempo.js";
import { minhasTarefas, ROTULOS_SITUACAO } from "../services/rotinas.js";
import * as pend from "../services/pendencias.js";
import { cabecalho } from "./comum.js";

export function cartaoTarefa(t, voltar = "#/tarefas") {
  const s = ROTULOS_SITUACAO[t.situacao];
  const freq = t.modelo.frequencia;
  const hora =
    freq === "diaria"
      ? html`${t.bloco.inicio}<small>${t.bloco.fim}</small>`
      : freq === "semanal"
        ? html`${nomeDiaSemana(t.data, true)}<small>${formatarData(t.data, { curta: true })}</small>`
        : html`Mês<small>${formatarData(t.data, { curta: true })}</small>`;
  const feito = t.situacao === "enviado";
  return html`<a class="tarefa ${t.situacao === "agora" ? "agora" : ""}" href="#/rotina/${encodeURIComponent(t.id)}?voltar=${encodeURIComponent(voltar)}" style="${feito ? "opacity:.72" : ""}">
    <div class="tarefa-hora">${hora}</div>
    <div style="min-width:0">
      <div class="tarefa-titulo quebra">${t.bloco.nome}</div>
      <div class="tarefa-sub">${nomeModulo(t.modelo.setorId)} · ${t.modelo.nome}${minhasUnidades().length > 1 ? ` · ${nomeUnidade(t.modelo.unidadeId)}` : ""} · ${t.itens} atividade(s)${t.data !== hoje() && freq === "diaria" ? ` · ${formatarData(t.data)}` : ""}</div>
    </div>
    <span class="selo ${s.classe}">${s.rotulo}</span>
  </a>`;
}

export default async function telaTarefas(el) {
  let tarefas;
  let minhasPendencias = [];
  try {
    const [t, p] = await Promise.all([
      minhasTarefas(),
      pode("pendencias", 1)
        ? pend.listar({ unidades: minhasUnidades().map((u) => u.id), somenteAbertas: true }).catch(() => [])
        : Promise.resolve([]),
    ]);
    tarefas = t;
    minhasPendencias = p.filter((x) => pend.souResponsavel(x));
  } catch (e) {
    montar(el, estadoErro(e));
    return;
  }

  const d = hoje();
  const grupos = [
    { titulo: "Atrasados — ainda dá para enviar", itens: tarefas.filter((t) => t.situacao === "atrasado" || t.situacao === "correcao") },
    { titulo: "Hoje", itens: tarefas.filter((t) => t.modelo.frequencia === "diaria" && t.data === d && !["atrasado", "correcao"].includes(t.situacao)) },
    { titulo: "Planejamento da semana", itens: tarefas.filter((t) => t.modelo.frequencia === "semanal" && !["atrasado", "correcao"].includes(t.situacao)) },
    { titulo: "Fechamento do mês", itens: tarefas.filter((t) => t.modelo.frequencia === "mensal" && !["atrasado", "correcao"].includes(t.situacao)) },
  ].filter((g) => g.itens.length);

  const pendentesHoje = tarefas.filter((t) => t.situacao !== "enviado").length;
  const primeiroNome = sessao.perfil?.nome?.split(" ")[0] || "";

  montar(
    el,
    html`${cabecalho(
      `Olá, ${primeiroNome}`,
      pendentesHoje ? `Você tem ${pendentesHoje} bloco(s) para enviar. ${nomeDiaSemana(d)}, ${formatarData(d)}.` : `Tudo enviado por enquanto. ${nomeDiaSemana(d)}, ${formatarData(d)}.`,
      pode("pendencias", 1) ? html`<a class="btn btn-secundario" href="#/ocorrencias?nova=1">${icone("alerta")} Registrar ocorrência</a>` : ""
    )}
    ${grupos.length
      ? grupos.map(
          (g) => html`<section style="margin-bottom:28px">
            <h2 style="font-size:var(--t-md);margin-bottom:12px;color:var(--texto-2)">${g.titulo}</h2>
            <div class="pilha-sm">${g.itens.map((t) => cartaoTarefa(t))}</div>
          </section>`
        )
      : estadoVazio({
          icone: "okCirculo",
          titulo: "Nenhuma rotina para você agora",
          texto: "Quando houver blocos programados para você, eles aparecem aqui no horário certo.",
        })}
    ${minhasPendencias.length
      ? html`<section style="margin-top:12px">
          <h2 style="font-size:var(--t-md);margin-bottom:12px;color:var(--texto-2)">Pendências sob sua responsabilidade</h2>
          <div class="painel painel-compacto lista">
            ${minhasPendencias.map(
              (p) => html`<a class="lista-item clicavel" href="#/ocorrencias/${p.id}" style="color:inherit;text-decoration:none">
                <div class="expande"><div class="lista-item-titulo">${p.codigo} · ${p.titulo}</div>
                <div class="lista-item-sub">${nomeUnidade(p.unidadeId)} · prazo ${formatarData(p.prazo)}${pend.estaAtrasada(p) ? " · atrasada" : ""}</div></div>
                ${seloPrioridade(p.prioridade)} ${seloStatusPendencia(p.status)}
              </a>`
            )}
          </div>
        </section>`
      : ""}`
  );
}
