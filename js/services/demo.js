// MODO DEMONSTRAÇÃO: cria dados fictícios no navegador para conhecer o sistema.
// Nunca é usado quando o Firebase está configurado.
import { sessao } from "../core/sessao.js";
import { FUNCOES_PADRAO, TIPOS_REGISTRO, AMBIENTES_PADRAO } from "../core/constantes.js";
import { hoje, somarDias, mesDe, instante, segundaDaSemana, diaSemana, somarMeses } from "../core/tempo.js";
import { emailDoLogin, entradaDiretorio } from "./usuarios.js";
import { gerarModelosIniciais } from "./modelos-iniciais.js";
import { ocorrenciasProgramadas, calcularTotais, situacaoOcorrencia } from "./rotinas.js";

export const SENHA_DEMO = "iai12345";

export const USUARIOS_DEMO = [
  { login: "admin", nome: "Administrador IAÍ", funcao: "administrador", cargo: "Administrador geral", unidades: [] },
  { login: "diretoria", nome: "Diretoria IAÍ", funcao: "diretoria", cargo: "Proprietário", unidades: [] },
  { login: "gestor.cruz", nome: "Carlos Menezes", funcao: "gestor", cargo: "Gestor da unidade Cruz", unidades: ["cruz"] },
  { login: "gestor.gandu", nome: "Patrícia Souza", funcao: "gestor", cargo: "Gestora da unidade Gandu", unidades: ["gandu"] },
  { login: "zeladora.gandu", nome: "Maria das Graças", funcao: "limpeza", cargo: "Zeladora", unidades: ["gandu"] },
  { login: "zeladora.cruz", nome: "Joana Ribeiro", funcao: "limpeza", cargo: "Zeladora", unidades: ["cruz"] },
  { login: "recepcao.cruz", nome: "Ana Paula Santos", funcao: "recepcao", cargo: "Recepcionista", unidades: ["cruz"] },
  { login: "recepcao.gandu", nome: "Bruna Oliveira", funcao: "recepcao", cargo: "Recepcionista", unidades: ["gandu"] },
  { login: "vendas", nome: "Lucas Almeida", funcao: "vendedor", cargo: "Consultor comercial", unidades: ["cruz", "gandu"] },
  { login: "coord.salao", nome: "Juliana Costa", funcao: "coordenador", cargo: "Coordenadora do salão", unidades: ["cruz", "gandu"] },
  { login: "tecnico", nome: "Roberto Lima", funcao: "tecnico", cargo: "Técnico de manutenção (contratado)", unidades: [] },
  { login: "marketing", nome: "Fernanda Rocha", funcao: "marketing", cargo: "Social media", unidades: ["cruz", "gandu"] },
];

// Gerador pseudoaleatório previsível (os dados ficam iguais a cada criação)
function sementeAleatoria(semente) {
  let s = semente;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export async function criarDemonstracao() {
  const banco = sessao.banco;
  const auth = sessao.autenticacao;
  const gravar = (c, d) => banco._gravarDireto(c, d);
  const rnd = sementeAleatoria(20261027);
  const escolher = (lista) => lista[Math.floor(rnd() * lista.length)];
  const d0 = hoje();
  const agora = new Date();

  // ---------- Unidades ----------
  const unidades = [
    { id: "cruz", nome: "Cruz", codigo: "01", tipo: "matriz", cidade: "Cruz das Almas — BA", ordem: 1 },
    { id: "gandu", nome: "Gandu", codigo: "02", tipo: "filial", cidade: "Gandu — BA", ordem: 2 },
  ];
  for (const u of unidades) gravar(`unidades/${u.id}`, { ...u, endereco: "", ativo: true, criadoEm: agora });

  // ---------- Usuários ----------
  const perfis = {};
  for (const u of USUARIOS_DEMO) {
    const f = FUNCOES_PADRAO.find((x) => x.id === u.funcao);
    const email = emailDoLogin(u.login);
    const uid = await auth.criarConta(email, SENHA_DEMO);
    const perfil = {
      login: u.login,
      nome: u.nome,
      cargo: u.cargo,
      funcaoId: f.id,
      admin: Boolean(f.admin),
      aprovador: Boolean(f.aprovador),
      verAuditoria: Boolean(f.verAuditoria),
      todasUnidades: Boolean(f.todasUnidades || f.admin),
      unidades: u.unidades,
      permissoes: { ...f.permissoes },
      uid,
      email,
      versao: 1,
      ativo: true,
      primeiroAcesso: false,
      criadoEm: agora,
    };
    perfis[u.login] = perfil;
    gravar(`usuarios/${u.login}`, perfil);
    gravar(`uids/${uid}`, { login: u.login });
    gravar(`logins/${u.login}`, { email });
    gravar(`diretorio/${u.login}`, entradaDiretorio(perfil));
  }

  gravar("config/publico", { inicializado: true, adminLogin: "admin", nomeEmpresa: "IAÍ Bora Treinar", criadoEm: agora });
  gravar("config/sistema", {
    nomeEmpresa: "IAÍ Bora Treinar",
    prazosDias: { critica: 1, alta: 3, media: 7, baixa: 15 },
    responsaveisPadrao: {
      cruz: { equipamentos: "tecnico", estrutura: "gestor.cruz", limpeza: "gestor.cruz", atendimento: "gestor.cruz", salao: "coord.salao", seguranca: "gestor.cruz" },
      gandu: { equipamentos: "tecnico", estrutura: "gestor.gandu", limpeza: "gestor.gandu", atendimento: "gestor.gandu", salao: "coord.salao", seguranca: "gestor.gandu" },
    },
    avisarDiasAntes: 1,
  });

  // ---------- Rotinas (modelos) ----------
  const inicioHistorico = somarDias(d0, -45);
  const modelos = [];
  for (const u of unidades) {
    for (const m of gerarModelosIniciais(u.id)) {
      const id = banco.novoId();
      m.blocos.forEach((b) => {
        b.desde = inicioHistorico;
        b.desdeEm = null; // histórico de exemplo: vale desde o primeiro dia
      });
      const responsavel =
        m.setorId === "limpeza" ? `zeladora.${u.id}` : m.setorId === "recepcao" ? `recepcao.${u.id}` : m.setorId === "gestao" ? `gestor.${u.id}` : "";
      if (responsavel) m.blocos.forEach((b) => (b.responsaveis = b.somenteEscalado ? [] : [responsavel]));
      if (m.setorId === "limpeza" && u.id === "gandu") m.nome = "Cronograma de limpeza — Gandu";
      const modelo = { ...m, id, versao: 1, desde: inicioHistorico, criadoEm: agora, atualizadoEm: agora, criadoPor: "admin", atualizadoPor: "admin" };
      modelos.push(modelo);
      const { id: _x, ...dados } = modelo;
      gravar(`rotinaModelos/${id}`, dados);
    }
  }

  // ---------- Escalas de sábado ----------
  const escalas = new Map();
  for (let i = -42; i <= 14; i++) {
    const d = somarDias(d0, i);
    if (diaSemana(d) !== 6) continue;
    for (const u of unidades) {
      if (rnd() < 0.6) {
        const logins = [`gestor.${u.id}`];
        escalas.set(`${u.id}__${d}`, logins);
        gravar(`escalas/${u.id}__${d}`, { unidadeId: u.id, data: d, mes: mesDe(d), logins });
      }
    }
  }

  // ---------- Execuções passadas ----------
  const inicioExec = somarDias(d0, -40);
  const ocs = ocorrenciasProgramadas(modelos, inicioExec, d0, escalas);
  const autorPadrao = { comercial: "vendas", salao: "coord.salao" };
  for (const oc of ocs) {
    const sit = situacaoOcorrencia(oc, null, agora);
    if (sit === "futuro" || sit === "agora") continue;
    const confiabilidade = oc.modelo.setorId === "limpeza" && oc.modelo.unidadeId === "cruz" ? 0.78 : oc.modelo.setorId === "gestao" ? 0.83 : 0.92;
    if (rnd() > confiabilidade) continue;
    if (oc.data === d0 && rnd() < 0.3) continue;
    const autor = oc.responsaveis[0] || autorPadrao[oc.modelo.setorId] || `gestor.${oc.modelo.unidadeId}`;
    const p = perfis[autor];
    const respostas = oc.bloco.itens
      .filter((i) => i.ativo !== false)
      .map((item) => {
        const x = rnd();
        const status = x < 0.84 ? "concluida" : x < 0.95 ? (oc.modelo.respostas === "gerencial" ? "nao_realizada" : "pendente") : "nao_aplicavel";
        return {
          itemId: item.id,
          texto: item.texto,
          status,
          justificativa:
            status === "concluida" ? "" : status === "nao_aplicavel" ? "Não se aplicou neste dia (ambiente em uso/evento)." : escolher(["Faltou material de limpeza.", "Ambiente ocupado no horário.", "Não houve tempo hábil, fica para o próximo bloco.", "Aguardando manutenção."]),
          fotos: [],
          contexto: "",
          providencias: [],
        };
      });
    const falta = oc.modelo.extras?.faltaMaterial && rnd() < 0.12;
    const enviado = oc.modelo.frequencia === "diaria" ? instante(oc.data, oc.bloco.fim) : instante(oc.data, "18:00");
    const atraso = rnd() < 0.1;
    const exec = {
      modeloId: oc.modelo.id,
      modeloNome: oc.modelo.nome,
      versaoModelo: 1,
      setorId: oc.modelo.setorId,
      unidadeId: oc.modelo.unidadeId,
      frequencia: oc.modelo.frequencia,
      respostasTipo: oc.modelo.respostas,
      dataRef: oc.periodo,
      dataPrevista: oc.data,
      mes: mesDe(oc.data),
      blocoId: oc.bloco.id,
      blocoNome: oc.bloco.nome,
      inicio: oc.bloco.inicio,
      fim: oc.bloco.fim,
      respostas,
      extras: {
        faltaMaterial: Boolean(falta),
        materiais: falta ? escolher(["Desinfetante", "Papel-toalha", "Saco de lixo 100 L", "Álcool 70%"]) : "",
        dificuldades: "",
        irregularidades: "",
        observacoes: rnd() < 0.15 ? "Tudo certo no período." : "",
      },
      totais: calcularTotais(respostas, respostas.length),
      registrosResumo: null,
      atrasado: atraso,
      status: rnd() < 0.5 ? "revisado" : "enviado",
      autorLogin: autor,
      autorNome: p?.nome || autor,
      enviadoEm: new Date(enviado.getTime() + (atraso ? 5400000 : -900000)),
    };
    // Registros avulsos (atendimentos, contatos e feedbacks)
    const tipoReg = oc.modelo.registros;
    if (tipoReg && tipoReg !== "nenhum") {
      const def = TIPOS_REGISTRO[tipoReg];
      const n = tipoReg === "atendimento" ? 4 + Math.floor(rnd() * 10) : tipoReg === "contato" ? 5 + Math.floor(rnd() * 12) : 1 + Math.floor(rnd() * 3);
      const resumo = { total: 0, porTipo: {}, porCanal: {}, porResultado: {} };
      for (let k = 0; k < n; k++) {
        const dados = { tipo: escolher(def.tipos), canal: escolher(def.canais), resultado: escolher(def.resultados), nome: "", observacao: "" };
        gravar(`registros/${banco.novoId()}`, {
          tipo: tipoReg,
          setorId: oc.modelo.setorId,
          unidadeId: oc.modelo.unidadeId,
          execucaoId: oc.id,
          modeloId: oc.modelo.id,
          blocoId: oc.bloco.id,
          dataRef: oc.data,
          mes: mesDe(oc.data),
          dados,
          cancelado: false,
          autorLogin: autor,
          autorNome: p?.nome || autor,
          criadoEm: instante(oc.data, oc.bloco.inicio || "09:00"),
        });
        resumo.total++;
        resumo.porTipo[dados.tipo] = (resumo.porTipo[dados.tipo] || 0) + 1;
        resumo.porCanal[dados.canal] = (resumo.porCanal[dados.canal] || 0) + 1;
        resumo.porResultado[dados.resultado] = (resumo.porResultado[dados.resultado] || 0) + 1;
      }
      exec.registrosResumo = resumo;
    }
    gravar(`execucoes/${oc.id}`, exec);
  }

  // ---------- Ambientes e equipamentos ----------
  const equipamentosBase = [
    ["Esteira ergométrica", "Cardio", "Área de cardio"],
    ["Esteira ergométrica", "Cardio", "Área de cardio"],
    ["Bicicleta ergométrica", "Cardio", "Área de cardio"],
    ["Elíptico", "Cardio", "Área de cardio"],
    ["Leg press 45°", "Musculação — máquina", "Salão de musculação"],
    ["Cadeira extensora", "Musculação — máquina", "Salão de musculação"],
    ["Mesa flexora", "Musculação — máquina", "Salão de musculação"],
    ["Crossover", "Musculação — máquina", "Salão de musculação"],
    ["Supino reto", "Musculação — peso livre", "Salão de musculação"],
    ["Smith machine", "Musculação — máquina", "Salão de musculação"],
    ["Caixa de som", "Som e vídeo", "Sala de dança"],
  ];
  const equipamentos = [];
  for (const u of unidades) {
    for (const nome of AMBIENTES_PADRAO) {
      const id = banco.novoId();
      gravar(`ambientes/${id}`, {
        nome, unidadeId: u.id, descricao: "", elementos: [], periodicidadeDias: 30,
        proximaInspecao: somarDias(d0, Math.floor(rnd() * 40) - 8), ultimaInspecao: somarDias(d0, -20), ativo: true, criadoEm: agora,
      });
    }
    equipamentosBase.forEach(([nome, categoria, localizacao], i) => {
      const id = banco.novoId();
      const sit = i === 1 && u.id === "cruz" ? "em_manutencao" : i === 6 && u.id === "gandu" ? "interditado" : i === 3 && u.id === "gandu" ? "aguardando_avaliacao" : "operando";
      const eq = {
        codigo: `${u.codigo}-${String(i + 1).padStart(3, "0")}`,
        nome, categoria, unidadeId: u.id, localizacao, ambienteId: "", marca: escolher(["Movement", "Righetto", "Johnson", "Matrix"]), modelo: "", numeroSerie: "",
        dataAquisicao: "", conservacao: escolher(["Bom", "Bom", "Regular", "Novo"]), periodicidadeDias: 60,
        proximaInspecao: somarDias(d0, Math.floor(rnd() * 70) - 12), ultimaInspecao: somarDias(d0, -40), observacoes: "",
        situacao: sit, situacaoEm: somarDias(d0, -3), ativo: true, criadoEm: agora,
      };
      gravar(`equipamentos/${id}`, eq);
      equipamentos.push({ id, ...eq });
    });
  }

  // ---------- Pendências ----------
  const pendenciasBase = [
    ["gandu", "equipamentos", "Mesa flexora com cabo desfiado", "alta", "aguardando", "tecnico", -9, 6],
    ["cruz", "equipamentos", "Esteira 2 desligando sozinha", "critica", "em_andamento", "tecnico", -2, 1],
    ["cruz", "estrutura", "Ar-condicionado do salão pingando", "alta", "aberta", "gestor.cruz", -1, null],
    ["gandu", "estrutura", "Lâmpada queimada na sala de dança", "baixa", "resolvida", "gestor.gandu", -14, 1],
    ["gandu", "limpeza", "Falta de desinfetante no estoque", "media", "resolvida", "gestor.gandu", -6, 2],
    ["cruz", "atendimento", "Aluno reclamou do tempo de espera na recepção", "media", "em_analise", "gestor.cruz", -3, null],
    ["cruz", "estrutura", "Infiltração no teto do banheiro masculino", "alta", "aberta", "", -12, null],
    ["gandu", "salao", "Halteres fora do lugar no horário noturno", "baixa", "em_andamento", "coord.salao", -4, null],
    ["cruz", "seguranca", "Fechadura da porta dos fundos emperrando", "critica", "aberta", "gestor.cruz", 0, null],
    ["gandu", "equipamentos", "Elíptico com barulho no pedal", "media", "aberta", "tecnico", -5, null],
    ["cruz", "estrutura", "Espelho trincado no salão", "media", "resolvida", "gestor.cruz", -25, 4],
    ["gandu", "atendimento", "Sugestão de aumentar horário de sábado", "baixa", "cancelada", "gestor.gandu", -18, 2],
  ];
  const ano = d0.slice(0, 4);
  let codigo = 0;
  const prazos = { critica: 1, alta: 3, media: 7, baixa: 15 };
  for (const [u, cat, titulo, prioridade, status, resp, desloc, diasResolucao] of pendenciasBase) {
    const id = banco.novoId();
    codigo++;
    const abertura = somarDias(d0, desloc);
    const autor = escolher(["coord.salao", `recepcao.${u}`, `gestor.${u}`, `zeladora.${u}`]);
    const setor = { equipamentos: "equipamentos", estrutura: "estrutura", limpeza: "limpeza", atendimento: "recepcao", salao: "salao", seguranca: "gestao" }[cat];
    const concluida = ["resolvida", "cancelada"].includes(status);
    const conclusao = concluida ? somarDias(abertura, diasResolucao) : "";
    const prazo = somarDias(abertura, prazos[prioridade]);
    const eq = cat === "equipamentos" ? equipamentos.find((e) => e.unidadeId === u && titulo.toLowerCase().includes(e.nome.split(" ")[0].toLowerCase())) : null;
    gravar(`pendencias/${id}`, {
      codigo: `OC-${ano}-${String(codigo).padStart(4, "0")}`,
      origem: "ocorrencia",
      origemRef: null,
      categoria: cat,
      setorId: setor,
      unidadeId: u,
      titulo,
      descricao: "Registro de demonstração.",
      local: eq?.localizacao || "",
      ambienteId: "",
      equipamentoId: eq?.id || "",
      equipamentoNome: eq ? `${eq.codigo} · ${eq.nome}` : "",
      prioridade,
      status,
      aberta: !concluida,
      responsavelLogin: resp,
      responsavelNome: perfis[resp]?.nome || "",
      prazo,
      fotos: [],
      custoTotal: status === "resolvida" && cat !== "limpeza" ? 18000 : 0,
      autorLogin: autor,
      autorNome: perfis[autor]?.nome || autor,
      criadoEm: instante(abertura, "10:00"),
      atualizadoEm: instante(conclusao || abertura, "16:00"),
      dataAbertura: abertura,
      mes: mesDe(abertura),
      dataConclusao: conclusao,
      mesConclusao: conclusao ? mesDe(conclusao) : "",
      solucao: status === "resolvida" ? "Serviço realizado e conferido." : "",
      justificativaCancelamento: status === "cancelada" ? "Avaliado pela gestão: sem viabilidade no momento." : "",
      noPrazo: conclusao ? conclusao <= prazo : null,
    });
    gravar(`pendencias/${id}/historico/${banco.novoId()}`, { tipo: "criada", texto: "Ocorrência registrada", statusNovo: "aberta", autorLogin: autor, autorNome: perfis[autor]?.nome, em: instante(abertura, "10:00") });
    if (status !== "aberta") {
      gravar(`pendencias/${id}/historico/${banco.novoId()}`, {
        tipo: "status", statusAnterior: "aberta", statusNovo: status,
        texto: status === "resolvida" ? "Serviço realizado e conferido." : status === "cancelada" ? "Avaliado pela gestão: sem viabilidade no momento." : "Encaminhado.",
        autorLogin: resp || "admin", autorNome: perfis[resp]?.nome || "Administrador IAÍ", em: instante(conclusao || somarDias(abertura, 1), "15:00"),
      });
    }
    if (status === "resolvida" && cat !== "limpeza") {
      gravar(`custos/${banco.novoId()}`, {
        unidadeId: u, setorId: setor, pendenciaId: id, pendenciaCodigo: `OC-${ano}-${String(codigo).padStart(4, "0")}`, descricao: `Reparo: ${titulo}`,
        categoria: "Mão de obra", valor: 18000, fornecedor: "Prestador local", data: conclusao, mes: mesDe(conclusao), cancelado: false, autorLogin: "tecnico", autorNome: "Roberto Lima", criadoEm: agora,
      });
    }
  }
  gravar(`contadores/pendencias-${ano}`, { valor: codigo });

  // ---------- Manutenções / inspeções ----------
  for (const eq of equipamentos.slice(0, 14)) {
    const data = somarDias(d0, -Math.floor(rnd() * 30));
    gravar(`manutencoes/${banco.novoId()}`, {
      setorId: "equipamentos", unidadeId: eq.unidadeId, alvoTipo: "equipamentos", alvoId: eq.id, alvoNome: `${eq.codigo} · ${eq.nome}`,
      tipo: escolher(["inspecao", "preventiva"]), data, mes: mesDe(data), descricao: "Verificação geral, lubrificação e aperto de parafusos.",
      resultado: rnd() < 0.85 ? "ok" : "problema", elementos: [], fotos: [], autorLogin: "tecnico", autorNome: "Roberto Lima", criadoEm: agora,
    });
  }

  // ---------- Comercial: metas e EVO ----------
  const mes = mesDe(d0);
  for (const u of unidades) {
    const metas = [["matriculas", u.id === "cruz" ? 40 : 25], ["renovacoes", u.id === "cruz" ? 60 : 35], ["contatos", 300], ["receita", u.id === "cruz" ? 2400000 : 1500000]];
    for (const [tipo, valor] of metas) {
      gravar(`metas/${u.id}__${mes}__${tipo}__unidade`, { unidadeId: u.id, mes, tipo, escopo: "unidade", vendedorLogin: "", vendedorNome: "", valor, ativo: true, criadoEm: agora });
    }
  }
  const planos = ["Mensal", "Trimestral", "Semestral", "Anual"];
  const valores = { Mensal: 12000, Trimestral: 32400, Semestral: 59400, Anual: 108000 };
  const importacao = banco.novoId();
  for (let i = 0; i < 90; i++) {
    const u = rnd() < 0.6 ? "cruz" : "gandu";
    const data = somarDias(d0, -Math.floor(rnd() * 45));
    const x = rnd();
    const tipo = x < 0.45 ? "matricula" : x < 0.88 ? "renovacao" : "cancelamento";
    const plano = escolher(planos);
    const codigoAluno = String(1000 + Math.floor(rnd() * 9000));
    gravar(`evoDados/${u}__${tipo}__${codigoAluno}__${data}`, {
      unidadeId: u, tipo, data, mes: mesDe(data), alunoCodigo: codigoAluno, alunoNome: escolher(["Aluno", "Aluna"]) + " " + codigoAluno.slice(-2),
      plano, valor: tipo === "cancelamento" ? 0 : valores[plano], vendedor: rnd() < 0.7 ? "Lucas Almeida" : "Recepção",
      motivo: tipo === "cancelamento" ? escolher(["Mudança de cidade", "Financeiro", "Falta de tempo", "Lesão"]) : "",
      importacaoId: importacao, cancelado: false, criadoEm: agora,
    });
  }
  gravar(`importacoesEvo/${importacao}`, { unidadeId: "cruz", arquivo: "Exportação EVO (demonstração)", linhas: 90, importadas: 90, duplicadas: 0, autorLogin: "admin", autorNome: "Administrador IAÍ", em: agora });

  // ---------- Marketing ----------
  const temas = ["Desafio 30 dias", "Dica de treino: agachamento", "Depoimento de aluno", "Horários de feriado", "Aula de dança: novidades", "Bastidores da equipe", "Promoção de renovação", "Antes e depois", "Treino para iniciantes", "Sorteio de camiseta"];
  temas.forEach((t, i) => {
    const data = somarDias(segundaDaSemana(d0), i - 4);
    const etapa = data < d0 ? (rnd() < 0.8 ? "publicado" : "revisao") : escolher(["ideia", "planejamento", "producao", "aprovado"]);
    gravar(`marketingAcoes/${banco.novoId()}`, {
      tipo: i === 6 ? "campanha" : "conteudo", titulo: t, descricao: "", unidadeId: i % 3 === 0 ? "gandu" : "cruz", plataformas: [escolher(["Instagram", "TikTok", "WhatsApp"])],
      campanhaId: "", etapa, dataPrevista: data, dataFim: "", mes: mesDe(data), responsavelLogin: "marketing", responsavelNome: "Fernanda Rocha",
      publicadoEm: etapa === "publicado" ? data : "",
      resultados: etapa === "publicado" ? { alcance: 800 + Math.floor(rnd() * 4000), engajamento: 40 + Math.floor(rnd() * 400), leads: Math.floor(rnd() * 12), investimento: i === 6 ? 15000 : 0 } : { alcance: 0, engajamento: 0, leads: 0, investimento: 0 },
      ativo: true, criadoEm: agora,
    });
  });

  // ---------- Investimentos ----------
  [
    ["cruz", "Troca do ar-condicionado do salão", "aprovado", 650000],
    ["gandu", "Nova mesa flexora", "orcado", 890000],
    ["gandu", "Pintura da fachada", "identificado", 250000],
  ].forEach(([u, titulo, status, valor]) =>
    gravar(`investimentos/${banco.novoId()}`, {
      unidadeId: u, titulo, descricao: "", setorId: "estrutura", prioridade: "media", valorEstimado: valor,
      orcamentos: status !== "identificado" ? [{ fornecedor: "Fornecedor A", valor }, { fornecedor: "Fornecedor B", valor: Math.round(valor * 1.12) }] : [],
      pendenciaId: "", status, valorRealizado: 0, dataRealizacao: "", criadoEm: agora,
    })
  );

  // ---------- Relatório do mês anterior (aprovado) ----------
  const mesAnterior = somarMeses(mes, -1);
  gravar(`relatoriosMensais/gandu__${mesAnterior}`, {
    unidadeId: "gandu", mes: mesAnterior, status: "enviado",
    textos: { resumo: "Mês estável na operação, com boa execução da limpeza e atenção à mesa flexora, que precisou ser interditada.", melhorias: "Reorganização do estoque de materiais de limpeza.", plano: "" },
    plano: [{ problema: "Mesa flexora interditada", medida: "Aprovar compra de peça ou equipamento novo", responsavel: "Patrícia Souza", prazo: somarDias(d0, 10), status: "planejado" }],
    numeros: null, enviadoPorLogin: "gestor.gandu", enviadoPorNome: "Patrícia Souza", enviadoEm: somarDias(d0, -20), criadoEm: agora,
  });
}
