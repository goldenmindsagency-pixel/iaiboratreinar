// Desenho do relatório mensal (tela e impressão/PDF) a partir dos números congelados e dos textos do gestor.
import { html } from "../../core/dom.js";
import { nomeModulo, sessao } from "../../core/sessao.js";
import { nomeMes, formatarData } from "../../core/tempo.js";
import { numero, pct, moeda, decimal } from "../../core/formato.js";
import { indicador, anel } from "../../core/ui.js";
import { ranking } from "../../core/graficos.js";
import { PRIORIDADES, STATUS_PENDENCIA, STATUS_INVESTIMENTO, CATEGORIAS_PENDENCIA } from "../../core/constantes.js";
import { SECOES_RELATORIO, STATUS_RELATORIO } from "../../services/gestao.js";

const texto = (t) => (t ? html`<div class="quebra" style="white-space:pre-wrap;margin-top:12px">${t}</div>` : "");
const vazio = (msg = "Sem dados para o período.") => html`<p class="pequeno texto-3">${msg}</p>`;
const topo = (obj, n = 6) => Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).slice(0, n).map(([rotulo, valor]) => ({ rotulo, valor }));

function tabelaSetores(setores) {
  const lista = Object.entries(setores || {}).filter(([, s]) => s && s.programados);
  if (!lista.length) return vazio();
  return html`<div class="tabela-envoltorio"><table class="tabela">
    <thead><tr><th>Setor</th><th class="num">Blocos programados</th><th class="num">Enviados</th><th class="num">Não enviados</th><th class="num">Concluídas</th><th class="num">Pendentes</th><th class="num">Execução</th></tr></thead>
    <tbody>${lista.map(([id, s]) => html`<tr><td>${nomeModulo(id)}</td><td class="num">${numero(s.programados)}</td><td class="num">${numero(s.enviados)}</td><td class="num">${numero(s.naoEnviados)}</td><td class="num">${numero(s.concluidas)}</td><td class="num">${numero(s.pendentes)}</td><td class="num"><strong>${pct(s.execucao)}</strong></td></tr>`)}</tbody>
  </table></div>`;
}

/** secoes: só os textos (sem números) quando `numeros` for nulo */
export function relatorioMensalHTML({ unidadeNome, mes, numeros: n, textos = {}, plano = [], status, aprovacao, enviadoPorNome, enviadoEm, impressao = true, rotuloPeriodo, titulo = "Relatório gerencial mensal", extra = "" }) {
  const st = STATUS_RELATORIO[status] || null;
  const sec = Object.fromEntries(SECOES_RELATORIO.map((s) => [s.id, s.titulo]));
  const op = n?.operacional;
  return html`<article class="relatorio-folha">
    <header class="relatorio-cabecalho">
      <div>
        <div class="pequeno texto-3">${titulo}</div>
        <h1 style="font-size:2rem;font-stretch:72%">${unidadeNome} · <span style="${rotuloPeriodo ? "" : "text-transform:capitalize"}">${rotuloPeriodo || nomeMes(mes)}</span></h1>
        <div class="pequeno texto-2">${sessao.config?.nomeEmpresa || "IAÍ Bora Treinar"}${enviadoPorNome ? ` · elaborado por ${enviadoPorNome}${enviadoEm ? ` em ${formatarData(enviadoEm)}` : ""}` : ""}${st ? ` · ${st.rotulo}` : ""}${aprovacao?.aprovado ? ` por ${aprovacao.porNome} em ${formatarData(aprovacao.em)}` : ""}</div>
      </div>
      <img src="assets/img/logo-marca.png" alt="IAÍ" />
    </header>
    ${!n ? html`<div class="aviso aviso-marca" style="margin-top:16px">Os números são calculados e congelados quando o relatório é enviado para aprovação.</div>` : ""}
    ${extra}

    <section>
      <h2>1. ${sec.resumo}</h2>
      ${op
        ? html`<div class="linha" style="gap:24px;align-items:center">
            ${anel(op.execucao, { rotulo: "execução" })}
            <div class="indicadores expande">
              ${indicador({ rotulo: "Taxa de conclusão", valor: pct(op.conclusao) })}
              ${indicador({ rotulo: "Cobertura de rotinas", valor: pct(op.cobertura) })}
              ${n.pendencias ? indicador({ rotulo: "Pendências abertas", valor: numero(n.pendencias.abertas), tom: n.pendencias.criticas ? "critico" : "" }) : ""}
              ${n.comercial ? indicador({ rotulo: "Matrículas + renovações", valor: numero((n.comercial.matriculas || 0) + (n.comercial.renovacoes || 0)) }) : ""}
              ${indicador({ rotulo: "Custos do mês", valor: moeda(n.custos?.total || 0) })}
            </div>
          </div>`
        : ""}
      ${texto(textos.resumo)}
    </section>

    <section>
      <h2>2. ${sec.produtividade}</h2>
      ${op
        ? html`<div class="indicadores" style="margin-bottom:12px">
            ${indicador({ rotulo: "Blocos programados", valor: numero(op.programados) })}
            ${indicador({ rotulo: "Blocos enviados", valor: numero(op.enviados) })}
            ${indicador({ rotulo: "Não enviados", valor: numero(op.naoEnviados), tom: op.naoEnviados ? "alerta" : "" })}
            ${indicador({ rotulo: "Atividades concluídas", valor: numero(op.concluidas) })}
            ${indicador({ rotulo: "Atividades pendentes", valor: numero(op.pendentes) })}
            ${indicador({ rotulo: "Percentual de execução", valor: pct(op.execucao) })}
          </div>
          ${tabelaSetores(n.setores)}
          ${n.gerencial ? html`<p class="pequeno texto-2" style="margin-top:10px">Rotina gerencial: ${pct(n.gerencial.execucao)} de execução (${numero(n.gerencial.concluidas)} atividades concluídas, ${numero(n.gerencial.naoVerificadas || 0)} não verificadas).</p>` : ""}`
        : vazio()}
      ${texto(textos.produtividade)}
    </section>

    <section>
      <h2>3. ${sec.comercial}</h2>
      ${n?.comercial
        ? html`<div class="indicadores" style="margin-bottom:12px">
            ${indicador({ rotulo: "Contatos", valor: numero(n.comercial.contatos) })}
            ${indicador({ rotulo: "Leads", valor: numero(n.comercial.leads) })}
            ${indicador({ rotulo: "Matrículas (EVO)", valor: numero(n.comercial.matriculas) })}
            ${indicador({ rotulo: "Renovações (EVO)", valor: numero(n.comercial.renovacoes) })}
            ${indicador({ rotulo: "Cancelamentos (EVO)", valor: numero(n.comercial.cancelamentos) })}
            ${indicador({ rotulo: "Receita (EVO)", valor: moeda(n.comercial.receita) })}
            ${indicador({ rotulo: "Conversão", valor: pct(n.comercial.conversao) })}
          </div>
          ${n.comercial.metas?.length
            ? html`<div class="tabela-envoltorio"><table class="tabela"><thead><tr><th>Meta</th><th>Escopo</th><th class="num">Meta</th><th class="num">Realizado</th><th class="num">Alcance</th></tr></thead><tbody>
                ${n.comercial.metas.map((m) => html`<tr><td>${m.tipo}</td><td>${m.vendedor || "Unidade"}</td><td class="num">${m.receita ? moeda(m.meta) : numero(m.meta)}</td><td class="num">${m.receita ? moeda(m.realizado) : numero(m.realizado)}</td><td class="num"><strong>${pct(m.meta ? m.realizado / m.meta : null)}</strong></td></tr>`)}
              </tbody></table></div>`
            : ""}
          ${!n.comercial.temEvo ? html`<p class="pequeno texto-3">Dados do EVO não importados para o período.</p>` : ""}`
        : vazio("Sem acesso ou sem dados comerciais.")}
      ${texto(textos.comercial)}
    </section>

    <section>
      <h2>4. ${sec.marketing}</h2>
      ${n?.marketing
        ? html`<div class="indicadores">
            ${indicador({ rotulo: "Conteúdos planejados", valor: numero(n.marketing.conteudos) })}
            ${indicador({ rotulo: "Publicados", valor: numero(n.marketing.publicados) })}
            ${indicador({ rotulo: "Cumprimento do calendário", valor: pct(n.marketing.cumprimento) })}
            ${indicador({ rotulo: "Campanhas", valor: numero(n.marketing.campanhas) })}
            ${indicador({ rotulo: "Alcance", valor: numero(n.marketing.alcance) })}
            ${indicador({ rotulo: "Leads gerados", valor: numero(n.marketing.leads) })}
            ${indicador({ rotulo: "Investimento", valor: moeda(n.marketing.investimento) })}
          </div>`
        : vazio()}
      ${texto(textos.marketing)}
    </section>

    <section>
      <h2>5. ${sec.atendimento}</h2>
      ${n?.atendimento
        ? html`<div class="indicadores" style="margin-bottom:12px">
            ${indicador({ rotulo: "Atendimentos na recepção", valor: numero(n.atendimento.atendimentos) })}
            ${indicador({ rotulo: "Reclamações", valor: numero(n.atendimento.reclamacoes), tom: n.atendimento.reclamacoes ? "alerta" : "" })}
            ${indicador({ rotulo: "Registros da coordenação", valor: numero(n.atendimento.registrosSalao) })}
            ${n.setores?.recepcao ? indicador({ rotulo: "Rotinas da recepção", valor: pct(n.setores.recepcao.execucao) }) : ""}
            ${n.setores?.salao ? indicador({ rotulo: "Checklist da coordenação", valor: pct(n.setores.salao.execucao) }) : ""}
          </div>
          <div class="grade-2">
            <div>${Object.keys(n.atendimento.porTipo || {}).length ? ranking(topo(n.atendimento.porTipo)) : ""}</div>
            <div>${Object.keys(n.atendimento.salaoPorTipo || {}).length ? ranking(topo(n.atendimento.salaoPorTipo)) : ""}</div>
          </div>`
        : vazio()}
      ${texto(textos.atendimento)}
    </section>

    <section>
      <h2>6. ${sec.limpeza}</h2>
      ${n?.setores?.limpeza
        ? html`<div class="indicadores" style="margin-bottom:12px">
            ${indicador({ rotulo: "Cumprimento dos checklists", valor: pct(n.setores.limpeza.execucao) })}
            ${indicador({ rotulo: "Blocos não enviados", valor: numero(n.setores.limpeza.naoEnviados) })}
            ${indicador({ rotulo: "Atividades pendentes", valor: numero(n.setores.limpeza.pendentes) })}
            ${indicador({ rotulo: "Registros de falta de material", valor: numero(n.faltaMaterial?.blocos || 0) })}
          </div>
          ${n.faltaMaterial?.itens?.length ? html`<p class="pequeno texto-2">Materiais em falta: ${n.faltaMaterial.itens.join("; ")}</p>` : ""}
          ${n.rankingPendentes?.filter((r) => r.setor === nomeModulo("limpeza")).length ? html`<p class="pequeno texto-2">Atividades mais pendentes: ${n.rankingPendentes.filter((r) => r.setor === nomeModulo("limpeza")).map((r) => `${r.texto} (${r.vezes}x)`).join("; ")}</p>` : ""}`
        : vazio()}
      ${texto(textos.limpeza)}
    </section>

    <section>
      <h2>7. ${sec.equipamentos}</h2>
      ${n?.equipamentos
        ? html`<div class="indicadores" style="margin-bottom:12px">
            ${indicador({ rotulo: "Equipamentos", valor: numero(n.equipamentos.total) })}
            ${indicador({ rotulo: "Operando", valor: numero(n.equipamentos.operando) })}
            ${indicador({ rotulo: "Em manutenção", valor: numero(n.equipamentos.emManutencao) })}
            ${indicador({ rotulo: "Interditados", valor: numero(n.equipamentos.interditados?.length || 0), tom: n.equipamentos.interditados?.length ? "critico" : "" })}
            ${indicador({ rotulo: "Inspeções/manutenções", valor: numero(n.equipamentos.manutencoes) })}
            ${indicador({ rotulo: "Custo", valor: moeda(n.equipamentos.custo) })}
          </div>
          ${n.equipamentos.interditados?.length ? html`<p class="pequeno texto-2">Interditados: ${n.equipamentos.interditados.join("; ")}</p>` : ""}`
        : vazio()}
      ${texto(textos.equipamentos)}
    </section>

    <section>
      <h2>8. ${sec.estrutura}</h2>
      ${n?.estrutura
        ? html`<div class="indicadores">
            ${indicador({ rotulo: "Ambientes", valor: numero(n.estrutura.ambientes) })}
            ${indicador({ rotulo: "Inspeções", valor: numero(n.estrutura.inspecoes) })}
            ${indicador({ rotulo: "Problemas encontrados", valor: numero(n.estrutura.problemasEncontrados) })}
            ${indicador({ rotulo: "Inspeções vencidas", valor: numero(n.estrutura.inspecoesVencidas) })}
            ${indicador({ rotulo: "Custo", valor: moeda(n.estrutura.custo) })}
          </div>`
        : vazio()}
      ${texto(textos.estrutura)}
    </section>

    <section>
      <h2>9. ${sec.ocorrencias}</h2>
      ${n?.pendencias
        ? html`<div class="indicadores" style="margin-bottom:12px">
            ${indicador({ rotulo: "Registradas no mês", valor: numero(n.pendencias.registradas) })}
            ${indicador({ rotulo: "Resolvidas no mês", valor: numero(n.pendencias.resolvidas) })}
            ${indicador({ rotulo: "Cumprimento de prazos", valor: pct(n.pendencias.cumprimentoPrazo) })}
            ${indicador({ rotulo: "Tempo médio de solução", valor: n.pendencias.tempoMedio === null || n.pendencias.tempoMedio === undefined ? "—" : `${decimal(n.pendencias.tempoMedio)} dias` })}
          </div>
          ${n.pendencias.principais?.length
            ? html`<div class="tabela-envoltorio"><table class="tabela"><thead><tr><th>Ocorrência</th><th>Prioridade</th><th>Status</th><th>Solução</th><th class="num">Custo</th></tr></thead><tbody>
                ${n.pendencias.principais.map((p) => html`<tr><td><span class="texto-3 pequeno">${p.codigo}</span> ${p.titulo}</td><td>${PRIORIDADES[p.prioridade]?.rotulo}</td><td>${STATUS_PENDENCIA[p.status]?.rotulo}</td><td class="quebra">${p.solucao || "—"}</td><td class="num">${p.custo ? moeda(p.custo) : "—"}</td></tr>`)}
              </tbody></table></div>`
            : ""}
          ${n.pendencias.recorrentes?.length ? html`<p class="pequeno texto-2" style="margin-top:10px">Problemas recorrentes: ${n.pendencias.recorrentes.map((r) => `${r.rotulo} (${r.quantidade}x)`).join("; ")}</p>` : ""}
          ${Object.keys(n.pendencias.porCategoria || {}).length ? html`<p class="pequeno texto-3">Por categoria: ${Object.entries(n.pendencias.porCategoria).map(([c, q]) => `${CATEGORIAS_PENDENCIA.find((x) => x.id === c)?.nome || c}: ${q}`).join(" · ")}</p>` : ""}`
        : vazio()}
      ${texto(textos.ocorrencias)}
    </section>

    <section>
      <h2>10. ${sec.investimentos}</h2>
      ${n?.investimentos
        ? html`<div class="indicadores" style="margin-bottom:12px">
            ${indicador({ rotulo: "Pendências abertas", valor: numero(n.pendencias?.abertas || 0) })}
            ${indicador({ rotulo: "Críticas", valor: numero(n.pendencias?.criticas || 0), tom: n.pendencias?.criticas ? "critico" : "" })}
            ${indicador({ rotulo: "Investimentos em aberto (estimado)", valor: moeda(n.investimentos.totalEstimado) })}
            ${indicador({ rotulo: "Realizado no mês", valor: moeda(n.investimentos.totalRealizado) })}
            ${indicador({ rotulo: "Custos operacionais no mês", valor: moeda(n.custos?.total || 0) })}
          </div>
          ${n.investimentos.emAberto?.length
            ? html`<div class="tabela-envoltorio"><table class="tabela"><thead><tr><th>Necessidade</th><th>Situação</th><th class="num">Valor estimado</th></tr></thead><tbody>
                ${n.investimentos.emAberto.map((i) => html`<tr><td>${i.titulo}</td><td>${STATUS_INVESTIMENTO[i.status]?.rotulo}</td><td class="num">${moeda(i.estimado)}</td></tr>`)}
              </tbody></table></div>`
            : ""}
          ${Object.keys(n.custos?.porSetor || {}).length ? html`<p class="pequeno texto-2" style="margin-top:10px">Custos por setor: ${Object.entries(n.custos.porSetor).map(([s, v]) => `${nomeModulo(s)}: ${moeda(v)}`).join(" · ")}</p>` : ""}`
        : vazio()}
      ${texto(textos.investimentos)}
    </section>

    <section>
      <h2>11. ${sec.melhorias}</h2>
      ${n?.investimentos?.realizados?.length ? html`<p class="pequeno texto-2">Investimentos realizados: ${n.investimentos.realizados.map((i) => `${i.titulo} (${moeda(i.valor)})`).join("; ")}</p>` : ""}
      ${texto(textos.melhorias) || (!n?.investimentos?.realizados?.length ? vazio("Nenhuma melhoria registrada.") : "")}
    </section>

    <section>
      <h2>12. ${sec.plano}</h2>
      ${plano?.length
        ? html`<div class="tabela-envoltorio"><table class="tabela"><thead><tr><th>Problema</th><th>Medida necessária</th><th>Responsável</th><th>Prazo</th><th>Status</th></tr></thead><tbody>
            ${plano.map((p) => html`<tr><td class="quebra">${p.problema}</td><td class="quebra">${p.medida}</td><td>${p.responsavel || "—"}</td><td>${p.prazo ? formatarData(p.prazo) : "—"}</td><td>${({ planejado: "Planejado", andamento: "Em andamento", concluido: "Concluído" })[p.status] || p.status}</td></tr>`)}
          </tbody></table></div>`
        : vazio("Nenhuma ação planejada.")}
      ${texto(textos.plano)}
    </section>
    ${aprovacao?.comentario ? html`<section><h2>Parecer da diretoria</h2><p>${aprovacao.comentario}</p></section>` : ""}
    ${impressao ? html`<p class="so-impressao pequeno" style="margin-top:20px;color:#666">Gerado pelo IAÍ Gestão em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Bahia" })}. Indicadores calculados a partir dos registros do sistema; dados comerciais de matrícula/renovação/receita importados do EVO.</p>` : ""}
  </article>`;
}
