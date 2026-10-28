// Configurações gerais, setores, funções, conexão, cópia de segurança e histórico de alterações.
import { html, raw, montar, $, $$, on, opcoes, lerFormulario } from "../core/dom.js";
import { icone } from "../core/icones.js";
import { CONFIG } from "../config.js";
import { sessao, ehAdmin, verAuditoria, todosModulos, nomeUnidade, minhasUnidades } from "../core/sessao.js";
import { abrirModal, avisar, avisarErro, comCarregamento, confirmar, estadoVazio, estadoErro, carregandoPagina } from "../core/ui.js";
import { CATEGORIAS_PENDENCIA, PRIORIDADES, NIVEIS } from "../core/constantes.js";
import { hoje, mesDe, somarMeses, nomeMes, formatarDataHora } from "../core/tempo.js";
import { normalizarTexto, slug } from "../core/formato.js";
import { mensagemDe } from "../core/erros.js";
import { atualizarBusca } from "../core/rotas.js";
import { salvarConfig, salvarSetor, carregarSetores } from "../services/sistema.js";
import { pessoasPara } from "../services/usuarios.js";
import { fotosConfiguradas, enviarFoto } from "../services/fotos.js";
import { bd } from "../services/base.js";
import { cabecalho, abas } from "./comum.js";

export default async function telaConfiguracoes(el, ctx) {
  const lista = [];
  if (ehAdmin()) lista.push({ id: "geral", rotulo: "Geral" }, { id: "setores", rotulo: "Setores" }, { id: "funcoes", rotulo: "Funções" }, { id: "conexao", rotulo: "Conexão e fotos" }, { id: "backup", rotulo: "Cópia de segurança" });
  if (verAuditoria()) lista.push({ id: "auditoria", rotulo: "Histórico de alterações" });
  const aba = lista.some((a) => a.id === ctx.busca.aba) ? ctx.busca.aba : lista[0].id;
  montar(el, html`${cabecalho(ehAdmin() ? "Configurações" : "Histórico de alterações", ehAdmin() ? "Regras gerais do sistema. Só o administrador altera estas opções." : "")}${abas(lista, aba, "#/configuracoes")}<div id="conteudo-aba">${carregandoPagina()}</div>`);
  const alvo = $("#conteudo-aba", el);
  const telas = { geral: abaGeral, setores: abaSetores, funcoes: abaFuncoes, conexao: abaConexao, backup: abaBackup, auditoria: abaAuditoria };
  try {
    await telas[aba](alvo, ctx);
  } catch (e) {
    console.error(e);
    montar(alvo, estadoErro(e));
    on(alvo, "click", "[data-acao=recarregar]", ctx.recarregar);
  }
}

// ---------------- Geral ----------------
async function abaGeral(alvo, ctx) {
  const c = sessao.config;
  const unidades = minhasUnidades();
  const pessoasPorUnidade = {};
  for (const u of unidades) pessoasPorUnidade[u.id] = await pessoasPara({ unidadeId: u.id }).catch(() => []);
  montar(
    alvo,
    html`<form class="pilha" id="form-geral" novalidate style="max-width:980px">
      <section class="painel"><h3 style="margin-bottom:12px">Empresa</h3>
        <div class="campo" style="max-width:420px"><label for="g-nome">Nome exibido no sistema e nos relatórios</label><input id="g-nome" name="nomeEmpresa" value="${c.nomeEmpresa}" maxlength="60" /></div>
      </section>
      <section class="painel"><h3 style="margin-bottom:4px">Prazos padrão das ocorrências</h3><p class="pequeno texto-3">Dias para resolver, contados a partir do registro. O gestor pode ajustar o prazo de cada ocorrência.</p>
        <div class="grade-4" style="margin-top:12px">${Object.entries(PRIORIDADES).sort((a, b) => a[1].ordem - b[1].ordem).map(([id, p]) => html`<div class="campo"><label for="pz-${id}">${p.rotulo}</label><input id="pz-${id}" type="number" min="0" max="120" name="prazo-${id}" value="${c.prazosDias[id]}" /></div>`)}</div>
        <p class="pequeno texto-3" style="margin-top:10px">Alertas de prazo são exibidos ${c.avisarDiasAntes || 1} dia antes do vencimento.</p>
      </section>
      <section class="painel"><h3 style="margin-bottom:4px">Responsável padrão por categoria</h3><p class="pequeno texto-3">Quem recebe automaticamente cada ocorrência registrada. Sem responsável, a ocorrência fica para a gestão definir.</p>
        ${unidades.map(
          (u) => html`<h4 style="margin:16px 0 8px">${u.nome}</h4><div class="grade-form">${CATEGORIAS_PENDENCIA.map(
            (cat) => html`<div class="campo"><label>${cat.nome}</label><select data-resp="${u.id}|${cat.id}"><option value="">A gestão define</option>${opcoes(
              pessoasPorUnidade[u.id].map((p) => ({ valor: p.login, rotulo: p.nome })),
              c.responsaveisPadrao?.[u.id]?.[cat.id] || ""
            )}</select></div>`
          )}</div>`
        )}
      </section>
      <div class="aviso aviso-erro oculto" id="g-erro"></div>
      <div><button type="button" class="btn btn-primario" data-salvar>${icone("check")} Salvar configurações</button></div>
    </form>`
  );
  on(alvo, "click", "[data-salvar]", (ev, b) =>
    comCarregamento(b, async () => {
      const f = lerFormulario($("#form-geral", alvo));
      const prazosDias = {};
      for (const id of Object.keys(PRIORIDADES)) prazosDias[id] = Math.max(0, Math.min(120, Number(f[`prazo-${id}`]) || 0));
      const responsaveisPadrao = {};
      $$("[data-resp]", alvo).forEach((s) => {
        const [u, cat] = s.dataset.resp.split("|");
        responsaveisPadrao[u] = responsaveisPadrao[u] || {};
        if (s.value) responsaveisPadrao[u][cat] = s.value;
      });
      try {
        await salvarConfig({ ...sessao.config, nomeEmpresa: f.nomeEmpresa || "IAÍ Bora Treinar", prazosDias, responsaveisPadrao, funcoes: sessao.config.funcoes || [] });
        avisar("Configurações salvas.");
      } catch (e) {
        const c2 = $("#g-erro", alvo);
        c2.textContent = mensagemDe(e);
        c2.classList.remove("oculto");
      }
    })
  );
}

// ---------------- Setores ----------------
async function abaSetores(alvo, ctx) {
  await carregarSetores();
  const fixos = todosModulos().filter((m) => !m.personalizado);
  const extras = sessao.setores;
  montar(
    alvo,
    html`<div style="max-width:880px" class="pilha">
      <p class="texto-2 pequeno">Os setores fixos têm telas próprias. Crie setores adicionais (ex.: Administrativo, Professores) para montar rotinas e checklists com o mesmo motor da limpeza e da recepção. Eles aparecem no menu e na matriz de permissões.</p>
      <section class="painel"><div class="painel-cabecalho"><h3>Setores criados</h3><button class="btn btn-primario btn-sm" data-novo>${icone("mais")} Novo setor</button></div>
        ${extras.length
          ? html`<div class="lista">${extras.map((s) => html`<div class="lista-item"><span class="icone-circulo">${icone("rotina")}</span><div class="expande"><div class="lista-item-titulo">${s.nome}</div><div class="lista-item-sub">${s.descricao || "—"}${s.ativo === false ? " · inativo" : ""}</div></div><button class="btn btn-fantasma btn-sm" data-editar="${s.id}">${icone("editar")} Editar</button></div>`)}</div>`
          : html`<p class="pequeno texto-3">Nenhum setor adicional.</p>`}
      </section>
      <section class="painel"><h3 style="margin-bottom:10px">Setores fixos</h3><div class="linha" style="gap:6px">${fixos.map((m) => html`<span class="chip">${icone(m.icone)} ${m.nome}</span>`)}</div></section>
    </div>`
  );
  const abrir = (s = null) =>
    abrirModal({
      titulo: s ? `Editar ${s.nome}` : "Novo setor",
      corpo: html`<form class="pilha" id="form-setor" novalidate>
        <div class="campo"><label class="obrigatorio" for="s-nome">Nome</label><input id="s-nome" name="nome" value="${s?.nome || ""}" maxlength="40" /></div>
        <div class="campo"><label for="s-desc">Descrição</label><input id="s-desc" name="descricao" value="${s?.descricao || ""}" maxlength="140" /></div>
        ${s ? html`<label class="interruptor"><input type="checkbox" name="ativo" ${s.ativo !== false ? "checked" : ""} /><span class="trilho"></span><span>Setor ativo</span></label>` : ""}
        <div class="aviso aviso-erro oculto" id="s-erro"></div>
      </form>`,
      rodape: html`<button class="btn btn-secundario" data-fechar>Cancelar</button><button class="btn btn-primario" data-ok>Salvar</button>`,
      aoMontar: (mel, fechar) =>
        on(mel, "click", "[data-ok]", (ev, b) =>
          comCarregamento(b, async () => {
            const f = lerFormulario($("#form-setor", mel));
            try {
              await salvarSetor(s?.id || null, { ...f, ativo: s ? f.ativo : true });
              avisar("Setor salvo. Recarregue a página para vê-lo no menu.");
              fechar(true);
              ctx.recarregar();
            } catch (e) {
              const c = $("#s-erro", mel);
              c.textContent = mensagemDe(e);
              c.classList.remove("oculto");
            }
          })
        ),
    });
  on(alvo, "click", "[data-novo]", () => abrir());
  on(alvo, "click", "[data-editar]", (ev, b) => abrir(extras.find((s) => s.id === b.dataset.editar)));
}

// ---------------- Funções (modelos de permissão) ----------------
async function abaFuncoes(alvo, ctx) {
  const { funcoesDisponiveis } = await import("./colaboradores.js");
  const funcoes = funcoesDisponiveis();
  montar(
    alvo,
    html`<div class="pilha" style="max-width:980px">
      <p class="texto-2 pequeno">Funções são modelos de permissão usados ao cadastrar colaboradores. As funções padrão não podem ser alteradas; crie funções próprias para casos específicos. Alterar uma função não muda quem já foi cadastrado.</p>
      <div><button class="btn btn-primario" data-nova>${icone("mais")} Nova função</button></div>
      <div class="tabela-envoltorio"><table class="tabela responsiva"><thead><tr><th>Função</th><th>Acessos</th><th></th></tr></thead>
        <tbody>${funcoes.map(
          (f) => html`<tr><td class="principal-celula" data-rotulo="Função"><strong>${f.nome}</strong>${f.personalizada ? html` <span class="selo selo-marca sem-ponto">Personalizada</span>` : ""}<div class="pequeno texto-3">${f.descricao || ""}</div></td>
            <td data-rotulo="Acessos" class="pequeno texto-2">${f.admin ? "Acesso total" : todosModulos().filter((m) => (f.permissoes?.[m.id] || 0) > 0).map((m) => `${m.nome} (${NIVEIS[f.permissoes[m.id]].curto})`).join(", ") || "—"}</td>
            <td class="direita" data-rotulo="">${f.personalizada ? html`<button class="btn btn-fantasma btn-sm" data-editar="${f.id}">${icone("editar")}</button><button class="btn btn-fantasma btn-sm" data-remover="${f.id}">${icone("lixo")}</button>` : ""}</td></tr>`
        )}</tbody></table></div>
    </div>`
  );
  const salvarLista = async (novaLista) => {
    await salvarConfig({ ...sessao.config, funcoes: novaLista });
    ctx.recarregar();
  };
  const abrir = (f = null) => {
    const d = f || { nome: "", descricao: "", permissoes: {}, todasUnidades: false, aprovador: false };
    abrirModal({
      titulo: f ? `Editar ${f.nome}` : "Nova função",
      largo: true,
      corpo: html`<form class="pilha" id="form-funcao" novalidate>
        <div class="grade-form"><div class="campo"><label class="obrigatorio">Nome</label><input name="nome" value="${d.nome}" maxlength="50" /></div><div class="campo"><label>Descrição</label><input name="descricao" value="${d.descricao}" maxlength="120" /></div></div>
        <label class="interruptor"><input type="checkbox" name="todasUnidades" ${d.todasUnidades ? "checked" : ""} /><span class="trilho"></span><span>Todas as unidades</span></label>
        <label class="interruptor"><input type="checkbox" name="aprovador" ${d.aprovador ? "checked" : ""} /><span class="trilho"></span><span>Aprova relatórios e investimentos</span></label>
        <div class="tabela-envoltorio" style="padding:4px 12px"><table class="matriz-permissoes"><tbody>${todosModulos().map(
          (m) => html`<tr><td>${m.nome}</td><td style="width:55%"><select class="entrada" data-permissao="${m.id}">${opcoes(NIVEIS.filter((n) => m.niveis.includes(n.valor)).map((n) => ({ valor: n.valor, rotulo: n.rotulo })), d.permissoes?.[m.id] || 0)}</select></td></tr>`
        )}</tbody></table></div>
        <div class="aviso aviso-erro oculto" id="f-erro"></div>
      </form>`,
      rodape: html`<button class="btn btn-secundario" data-fechar>Cancelar</button><button class="btn btn-primario" data-ok>Salvar</button>`,
      aoMontar: (mel, fechar) =>
        on(mel, "click", "[data-ok]", (ev, b) =>
          comCarregamento(b, async () => {
            const v = lerFormulario($("#form-funcao", mel));
            const permissoes = {};
            $$("[data-permissao]", mel).forEach((s) => Number(s.value) > 0 && (permissoes[s.dataset.permissao] = Number(s.value)));
            try {
              if (!v.nome || v.nome.length < 3) throw new Error("Informe o nome da função.");
              const atual = (sessao.config.funcoes || []).filter((x) => x.id !== f?.id);
              const id = f?.id || `p-${slug(v.nome) || Date.now()}`;
              await salvarLista([...atual, { id, nome: v.nome, descricao: v.descricao, todasUnidades: v.todasUnidades, aprovador: v.aprovador, permissoes }]);
              avisar("Função salva.");
              fechar(true);
            } catch (e) {
              const c = $("#f-erro", mel);
              c.textContent = mensagemDe(e);
              c.classList.remove("oculto");
            }
          })
        ),
    });
  };
  on(alvo, "click", "[data-nova]", () => abrir());
  on(alvo, "click", "[data-editar]", (ev, b) => abrir((sessao.config.funcoes || []).find((f) => f.id === b.dataset.editar)));
  on(alvo, "click", "[data-remover]", async (ev, b) => {
    if (!(await confirmar({ titulo: "Remover função?", mensagem: "Quem já foi cadastrado com ela mantém as permissões atuais.", confirmarTexto: "Remover", perigo: true }))) return;
    try {
      await salvarLista((sessao.config.funcoes || []).filter((f) => f.id !== b.dataset.remover));
    } catch (e) {
      avisarErro(e);
    }
  });
}

// ---------------- Conexão e fotos ----------------
async function abaConexao(alvo) {
  const fb = CONFIG.firebase;
  montar(
    alvo,
    html`<div class="pilha" style="max-width:820px">
      <section class="painel"><h3 style="margin-bottom:12px">Banco de dados</h3>
        <dl class="chave-valor">
          <dt>Modo</dt><dd>${sessao.modoDemo ? html`<span class="selo selo-marca">Demonstração (dados só neste navegador)</span>` : html`<span class="selo selo-ok">Firebase conectado</span>`}</dd>
          <dt>Projeto Firebase</dt><dd>${fb.projectId || "—"}</dd>
          <dt>Versão da biblioteca</dt><dd>${CONFIG.versaoFirebase}</dd>
          <dt>Domínio interno dos logins</dt><dd>${CONFIG.dominioLogin}</dd>
        </dl>
      </section>
      <section class="painel"><h3 style="margin-bottom:12px">Fotos (Cloudinary)</h3>
        <dl class="chave-valor">
          <dt>Situação</dt><dd>${fotosConfiguradas() ? html`<span class="selo selo-ok">${sessao.modoDemo ? "Modo demonstração (fotos reduzidas no navegador)" : "Configurado"}</span>` : html`<span class="selo selo-pendente">Não configurado</span>`}</dd>
          <dt>Cloud name</dt><dd>${CONFIG.cloudinary.cloudName || "—"}</dd>
          <dt>Upload preset</dt><dd>${CONFIG.cloudinary.uploadPreset || "—"}</dd>
        </dl>
        <div class="linha" style="margin-top:14px"><label class="btn btn-secundario btn-sm" for="teste-foto">${icone("camera")} Testar envio de foto</label><input type="file" id="teste-foto" accept="image/*" class="sr-only" /><span class="pequeno texto-3" id="teste-resultado"></span></div>
      </section>
      <section class="painel"><h3 style="margin-bottom:8px">Instalar no celular</h3><p class="pequeno texto-2">No Android (Chrome): menu ⋮ › "Adicionar à tela inicial". No iPhone (Safari): botão Compartilhar › "Adicionar à Tela de Início". O sistema abre como um aplicativo, com o ícone da IAÍ.</p></section>
    </div>`
  );
  $("#teste-foto", alvo).addEventListener("change", async (ev) => {
    const arq = ev.target.files?.[0];
    if (!arq) return;
    const r = $("#teste-resultado", alvo);
    r.textContent = "Enviando…";
    try {
      const f = await enviarFoto(arq, "teste");
      r.textContent = `Funcionou (${f.largura}×${f.altura}).`;
    } catch (e) {
      r.textContent = mensagemDe(e);
    }
  });
}

// ---------------- Backup ----------------
async function abaBackup(alvo) {
  montar(
    alvo,
    html`<div class="pilha" style="max-width:760px">
      <section class="painel"><h3 style="margin-bottom:8px">Baixar cópia de segurança</h3>
        <p class="pequeno texto-2">Gera um arquivo com todos os registros do sistema (rotinas, ocorrências, cadastros, relatórios e histórico). Recomendado: uma vez por semana, guardando o arquivo no Google Drive ou em um pendrive. As fotos ficam no Cloudinary e não entram no arquivo.</p>
        <div class="linha" style="margin-top:12px"><button class="btn btn-primario" data-backup>${icone("baixar")} Baixar cópia completa</button><span class="pequeno texto-3" id="b-progresso"></span></div>
      </section>
      ${sessao.modoDemo
        ? html`<section class="painel"><h3 style="margin-bottom:8px">Demonstração</h3><p class="pequeno texto-2">Apaga os dados fictícios deste navegador e recria a demonstração do zero.</p>
            <button class="btn btn-perigo" data-resetar>${icone("atualizar")} Recriar demonstração</button></section>`
        : ""}
    </div>`
  );
  on(alvo, "click", "[data-backup]", (ev, b) =>
    comCarregamento(b, async () => {
      const { exportarTudo } = await import("../services/backup.js");
      const p = $("#b-progresso", alvo);
      try {
        const r = await exportarTudo((c, i, t) => (p.textContent = `Lendo ${c} (${i}/${t})…`));
        p.textContent = `Pronto: ${r.colecoes} coleções, ${Math.round(r.tamanho / 1024)} KB.`;
      } catch (e) {
        p.textContent = "";
        avisarErro(e);
      }
    })
  );
  on(alvo, "click", "[data-resetar]", async () => {
    if (!(await confirmar({ titulo: "Recriar demonstração?", mensagem: "Todos os dados de demonstração deste navegador serão apagados.", confirmarTexto: "Recriar", perigo: true }))) return;
    bd()._apagarTudo();
    location.hash = "#/";
    location.reload();
  });
}

// ---------------- Auditoria ----------------
async function abaAuditoria(alvo, ctx) {
  const mes = /^\d{4}-\d{2}$/.test(ctx.busca.mes || "") ? ctx.busca.mes : mesDe(hoje());
  const meses = Array.from({ length: 12 }, (_, i) => somarMeses(mesDe(hoje()), -i));
  let lista = await bd().consultar("auditoria", [["mes", "==", mes]]);
  lista.sort((a, b) => (b.em?.getTime?.() || 0) - (a.em?.getTime?.() || 0));
  const q = ctx.busca.q ? normalizarTexto(ctx.busca.q) : "";
  if (q) lista = lista.filter((a) => normalizarTexto(`${a.resumo} ${a.autorNome} ${a.colecao} ${a.acao}`).includes(q));
  montar(
    alvo,
    html`<form class="filtros" data-filtros>
      <div class="campo"><label for="a-mes">Mês</label><select id="a-mes" name="mes">${opcoes(meses.map((m) => ({ valor: m, rotulo: nomeMes(m) })), mes)}</select></div>
      <div class="campo" style="flex:1 1 260px"><label for="a-q">Buscar</label><input id="a-q" name="q" value="${ctx.busca.q || ""}" placeholder="Pessoa, ação ou registro" /></div>
    </form>
    ${lista.length
      ? html`<div class="tabela-envoltorio"><table class="tabela responsiva">
          <thead><tr><th>Quando</th><th>Quem</th><th>O que</th><th>Detalhes</th></tr></thead>
          <tbody>${lista.slice(0, 500).map(
            (a) => html`<tr><td class="principal-celula" data-rotulo="Quando">${formatarDataHora(a.em)}</td><td data-rotulo="Quem">${a.autorNome}</td><td data-rotulo="O que">${a.resumo}${a.unidadeId ? html`<div class="pequeno texto-3">${nomeUnidade(a.unidadeId)}</div>` : ""}</td>
              <td data-rotulo="Detalhes">${a.alteracoes?.length ? html`<details><summary class="pequeno" style="cursor:pointer">${a.alteracoes.length} campo(s)</summary><div class="pequeno texto-2" style="max-width:520px">${a.alteracoes.map((x) => html`<div class="quebra" style="margin-top:4px"><strong>${x.campo}</strong>: ${x.antes ?? "—"} → ${x.depois ?? "—"}</div>`)}</div></details>` : html`<span class="texto-3 pequeno">—</span>`}</td></tr>`
          )}</tbody></table></div>`
      : estadoVazio({ icone: "historico", titulo: "Nenhuma alteração registrada neste mês", texto: "Cadastros, edições, aprovações e desativações ficam registrados aqui com autor e data." })}`
  );
  const form = alvo.querySelector("[data-filtros]");
  form.addEventListener("change", () => atualizarBusca(Object.fromEntries(new FormData(form).entries()), { recarregar: true }));
  form.addEventListener("submit", (ev) => ev.preventDefault());
}

export { raw };
