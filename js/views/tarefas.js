// Minhas tarefas: blocos do dia, atrasados, semana e fechamento do mês.
import { html, montar } from "../core/dom.js";
import { icone } from "../core/icones.js";
import { sessao, nomeUnidade, nomeModulo, pode, unidadesFiltro } from "../core/sessao.js";
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
      <div class="tarefa-sub">${nomeModulo(t.modelo.setorId)} · ${t.modelo.nome}${unidadesFiltro().length > 1 ? ` · ${nomeUnidade(t.modelo.unidadeId)}` : ""} · ${t.itens} atividade(s)${t.data !== hoje() && freq === "diaria" ? ` · ${formatarData(t.data)}` : ""}</div>
    </div>
    <span class="selo ${s.classe}">${s.rotulo}</span>
  </a>`;
}

export default async function telaTarefas(el) {
  let tarefas;
  let livres = [];
  let minhasPendencias = [];
  try {
    const [t, p] = await Promise.all([
      minhasTarefas({ incluirLivres: true }),
      pode("pendencias", 1)
        ? pend.listar({ unidades: unidadesFiltro().map((u) => u.id), somenteAbertas: true }).catch(() => [])
        : Promise.resolve([]),
    ]);
    tarefas = t.filter((x) => x.atribuicao === "minha");
    livres = t.filter((x) => x.atribuicao === "livre");
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

  const paraEnviar = tarefas.filter((t) => ["agora", "atrasado", "correcao"].includes(t.situacao)).length;
  const atrasados = tarefas.filter((t) => ["atrasado", "correcao"].includes(t.situacao)).length;
  const aindaVaoAbrir = tarefas.filter((t) => t.situacao === "futuro").length;
  const primeiroNome = sessao.perfil?.nome?.split(" ")[0] || "";
  const dataTexto = `${nomeDiaSemana(d)}, ${formatarData(d)}`;
  const unidadesTexto = unidadesFiltro().length > 1 ? "" : ` · ${unidadesFiltro()[0]?.nome || ""}`;
  const resumo = paraEnviar
    ? `Você tem ${paraEnviar} bloco(s) para enviar${atrasados ? ` (${atrasados} atrasado(s))` : ""}${aindaVaoAbrir ? ` e ${aindaVaoAbrir} ainda vão abrir hoje` : ""}. ${dataTexto}${unidadesTexto}.`
    : aindaVaoAbrir
      ? `Nada para enviar agora; ${aindaVaoAbrir} bloco(s) ainda vão abrir hoje. ${dataTexto}${unidadesTexto}.`
      : `Tudo enviado por enquanto. ${dataTexto}${unidadesTexto}.`;
  const livresAbertos = livres.filter((t) => t.situacao !== "enviado");

  montar(
    el,
    html`${cabecalho(
      `Olá, ${primeiroNome}`,
      resumo,
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
    ${livresAbertos.length
      ? html`<details class="painel painel-compacto" style="margin-bottom:28px">
          <summary style="cursor:pointer;font-weight:600">Blocos da equipe sem responsável definido (${livresAbertos.length})</summary>
          <p class="pequeno texto-3" style="margin:10px 0 12px">Você supervisiona estes setores e pode preencher se precisar, mas eles não contam como tarefas suas. Para direcionar cada bloco a alguém, defina os responsáveis em <strong>Setor › Rotinas › Editar</strong>.</p>
          <div class="pilha-sm">${livresAbertos.map((t) => cartaoTarefa(t))}</div>
        </details>`
      : ""}
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
