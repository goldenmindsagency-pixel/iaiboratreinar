// Rotinas iniciais sugeridas, baseadas no planejamento enviado pela administração.
// Tudo pode ser editado depois em cada módulo > aba "Rotinas".
import { salvarModelo, novoIdCurto } from "./rotinas.js";
import { hoje } from "../core/tempo.js";

const it = (texto, extra = {}) => ({ id: novoIdCurto(), texto, obrigatoria: true, exigeFoto: false, contexto: "", ativo: true, ...extra });

function bloco(nome, { inicio = "00:00", fim = "23:59", dias = [], dia = null, itens = [], somenteEscalado = false } = {}) {
  return { id: novoIdCurto(), nome, inicio, fim, dias, dia, responsaveis: [], somenteEscalado, ativo: true, desde: hoje(), itens };
}

export function gerarModelosIniciais(unidadeId) {
  return [
    // ---------------- Gestão gerencial ----------------
    {
      nome: "Checklist diário do gestor",
      unidadeId,
      setorId: "gestao",
      frequencia: "diaria",
      respostas: "gerencial",
      registros: "nenhum",
      extras: { faltaMaterial: false, dificuldades: false, irregularidades: false, observacoes: true },
      blocos: [
        bloco("Acompanhamento do dia", {
          inicio: "08:00",
          fim: "21:00",
          dias: [1, 2, 3, 4, 5, 6],
          itens: [
            it("Relatórios e checklists dos setores", { contexto: "rotinas_hoje" }),
            it("Execução das atividades de limpeza", { contexto: "limpeza_hoje" }),
            it("Ocorrências e pendências de manutenção", { contexto: "pendencias_unidade" }),
            it("Funcionamento dos equipamentos e da estrutura física", { contexto: "equipamentos_parados" }),
            it("Qualidade do atendimento na recepção", { contexto: "recepcao_hoje" }),
            it("Acompanhamento dos professores no salão", { contexto: "salao_hoje" }),
            it("Resultados comerciais do dia", { contexto: "comercial_hoje" }),
            it("Matrículas, renovações e prospecção", { contexto: "comercial_hoje" }),
            it("Cumprimento das atividades de marketing", { contexto: "marketing_semana" }),
            it("Presença e organização das equipes", { contexto: "equipe_hoje" }),
            it("Reclamações e solicitações dos alunos", { contexto: "reclamacoes" }),
            it("Problemas que necessitam de intervenção", { contexto: "pendencias_criticas" }),
          ],
        }),
      ],
      ativo: true,
    },
    {
      nome: "Planejamento semanal do gestor",
      unidadeId,
      setorId: "gestao",
      frequencia: "semanal",
      respostas: "gerencial",
      registros: "nenhum",
      extras: { faltaMaterial: false, dificuldades: false, irregularidades: false, observacoes: true },
      blocos: [
        bloco("Segunda — Planejamento e organização", {
          dia: 1,
          itens: [
            it("Avaliar os resultados da semana anterior", { contexto: "rotinas_hoje" }),
            it("Definir prioridades da semana"),
            it("Distribuir responsabilidades"),
            it("Conferir pendências", { contexto: "pendencias_unidade" }),
            it("Estabelecer metas semanais"),
          ],
        }),
        bloco("Terça — Comercial e recepção", {
          dia: 2,
          itens: [
            it("Avaliar resultados de vendas", { contexto: "comercial_hoje" }),
            it("Conferir prospecção e atendimentos", { contexto: "recepcao_hoje" }),
            it("Analisar matrículas e renovações"),
            it("Verificar registros no CRM/EVO"),
            it("Identificar oportunidades de melhoria"),
          ],
        }),
        bloco("Quarta — Salão e equipe técnica", {
          dia: 3,
          itens: [
            it("Acompanhar a qualidade do atendimento no salão", { contexto: "salao_hoje" }),
            it("Avaliar a supervisão realizada pela coordenação"),
            it("Verificar a atenção dos professores aos alunos"),
            it("Identificar reclamações e dificuldades", { contexto: "reclamacoes" }),
            it("Registrar orientações e feedbacks"),
          ],
        }),
        bloco("Quinta — Limpeza e manutenção", {
          dia: 4,
          itens: [
            it("Conferir a execução dos checklists de limpeza", { contexto: "limpeza_hoje" }),
            it("Avaliar a conservação dos ambientes"),
            it("Verificar equipamentos com problemas", { contexto: "equipamentos_parados" }),
            it("Inspecionar iluminação, climatização, pintura, pisos, espelhos e demais instalações"),
            it("Acompanhar solicitações de manutenção", { contexto: "pendencias_unidade" }),
          ],
        }),
        bloco("Sexta — Marketing e indicadores", {
          dia: 5,
          itens: [
            it("Avaliar conteúdos e campanhas", { contexto: "marketing_semana" }),
            it("Conferir resultados de marketing"),
            it("Comparar metas e resultados comerciais", { contexto: "comercial_hoje" }),
            it("Analisar indicadores operacionais", { contexto: "rotinas_hoje" }),
            it("Preparar o resumo semanal"),
          ],
        }),
        bloco("Sábado — Inspeção geral (quando escalado)", {
          dia: 6,
          somenteEscalado: true,
          itens: [
            it("Acompanhar o funcionamento da unidade"),
            it("Verificar a organização dos setores"),
            it("Conferir pendências", { contexto: "pendencias_unidade" }),
            it("Registrar ocorrências"),
            it("Avaliar necessidades para a semana seguinte"),
          ],
        }),
      ],
      ativo: true,
    },
    {
      nome: "Fechamento mensal do gestor",
      unidadeId,
      setorId: "gestao",
      frequencia: "mensal",
      respostas: "gerencial",
      registros: "nenhum",
      extras: { faltaMaterial: false, dificuldades: false, irregularidades: false, observacoes: true },
      blocos: [
        bloco("Fechamento do mês", {
          itens: [
            it("Analisar a produtividade de todos os setores", { contexto: "rotinas_hoje" }),
            it("Avaliar os resultados comerciais", { contexto: "comercial_hoje" }),
            it("Conferir o desempenho do marketing", { contexto: "marketing_semana" }),
            it("Analisar ocorrências e manutenções", { contexto: "pendencias_unidade" }),
            it("Identificar problemas recorrentes"),
            it("Verificar o cumprimento das metas"),
            it("Avaliar as melhorias implementadas"),
            it("Definir prioridades para o mês seguinte"),
            it("Preparar o relatório gerencial para a direção"),
          ],
        }),
      ],
      ativo: true,
    },
    // ---------------- Salão ----------------
    {
      nome: "Checklist da coordenação do salão",
      unidadeId,
      setorId: "salao",
      frequencia: "diaria",
      respostas: "operacional",
      registros: "feedback",
      extras: { faltaMaterial: false, dificuldades: true, irregularidades: true, observacoes: true },
      blocos: [
        bloco("Coordenação do dia", {
          inicio: "06:00",
          fim: "22:00",
          dias: [1, 2, 3, 4, 5, 6],
          itens: [
            it("Houve cobertura adequada de professores em todos os horários"),
            it("Os professores mantiveram atenção ativa aos alunos"),
            it("Alunos iniciantes foram acompanhados"),
            it("Alunos experientes receberam atenção e orientação"),
            it("Salão organizado (anilhas, halteres e acessórios no lugar)"),
            it("Equipamentos do salão em boas condições"),
            it("Comunicação entre recepção e salão funcionou bem"),
            it("Sem ocorrências relevantes no dia"),
            it("Sem falhas operacionais identificadas"),
          ],
        }),
      ],
      ativo: true,
    },
    // ---------------- Recepção ----------------
    {
      nome: "Relatório de turno da recepção",
      unidadeId,
      setorId: "recepcao",
      frequencia: "diaria",
      respostas: "operacional",
      registros: "atendimento",
      extras: { faltaMaterial: false, dificuldades: true, irregularidades: false, observacoes: true },
      blocos: [
        bloco("Turno da manhã (abertura)", {
          inicio: "05:30",
          fim: "12:00",
          dias: [1, 2, 3, 4, 5, 6],
          itens: [
            it("Abertura: recepção limpa e organizada"),
            it("Abertura: computador e sistema (EVO) funcionando"),
            it("Abertura: controle de acesso funcionando"),
            it("Abertura: som, iluminação e climatização ligados"),
            it("Solicitações de alunos registradas e encaminhadas"),
            it("Pendências repassadas ao próximo turno"),
          ],
        }),
        bloco("Turno da tarde", {
          inicio: "12:00",
          fim: "17:30",
          dias: [1, 2, 3, 4, 5],
          itens: [
            it("Ambiente da recepção organizado"),
            it("Equipamentos da recepção conferidos"),
            it("Solicitações de alunos registradas e encaminhadas"),
            it("Pendências repassadas ao próximo turno"),
          ],
        }),
        bloco("Turno da noite (fechamento)", {
          inicio: "17:30",
          fim: "22:30",
          dias: [1, 2, 3, 4, 5],
          itens: [
            it("Solicitações de alunos registradas e encaminhadas"),
            it("Fechamento: caixa conferido"),
            it("Fechamento: equipamentos, som e luzes desligados"),
            it("Fechamento: portas e janelas trancadas"),
            it("Fechamento: alarme ativado"),
          ],
        }),
      ],
      ativo: true,
    },
    // ---------------- Comercial ----------------
    {
      nome: "Relatório diário do comercial",
      unidadeId,
      setorId: "comercial",
      frequencia: "diaria",
      respostas: "operacional",
      registros: "contato",
      extras: { faltaMaterial: false, dificuldades: true, irregularidades: false, observacoes: true },
      blocos: [
        bloco("Dia comercial", {
          inicio: "08:00",
          fim: "21:00",
          dias: [1, 2, 3, 4, 5, 6],
          itens: [
            it("Leads do dia respondidos (WhatsApp e Instagram)"),
            it("Prospecção ativa realizada"),
            it("Contato com alunos faltantes"),
            it("Contato com alunos inativos (recuperação)"),
            it("Follow-up de visitas e interessados"),
            it("Registros atualizados no EVO"),
          ],
        }),
      ],
      ativo: true,
    },
    // ---------------- Limpeza ----------------
    {
      nome: "Rotina de limpeza (ajustar ao cronograma)",
      unidadeId,
      setorId: "limpeza",
      frequencia: "diaria",
      respostas: "operacional",
      registros: "nenhum",
      extras: { faltaMaterial: true, dificuldades: true, irregularidades: true, observacoes: true },
      blocos: [
        bloco("Manhã", {
          inicio: "08:00",
          fim: "11:00",
          dias: [1, 2, 3, 4, 5, 6],
          itens: [
            it("Varrer e passar pano no salão de musculação"),
            it("Limpar espelhos"),
            it("Higienizar banheiros e vestiários"),
            it("Repor papel higiênico, papel-toalha e sabonete"),
            it("Recolher o lixo de todos os ambientes"),
            it("Limpar a recepção"),
          ],
        }),
        bloco("Tarde", {
          inicio: "15:00",
          fim: "17:00",
          dias: [1, 2, 3, 4, 5],
          itens: [
            it("Revisar a limpeza dos banheiros"),
            it("Higienizar bancos, colchonetes e acessórios"),
            it("Recolher o lixo"),
            it("Limpar bebedouro"),
          ],
        }),
        bloco("Noite", {
          inicio: "19:00",
          fim: "21:00",
          dias: [1, 2, 3, 4, 5],
          itens: [
            it("Higienizar banheiros e vestiários"),
            it("Recolher o lixo de todos os ambientes"),
            it("Varrer o salão"),
            it("Repor materiais para o dia seguinte"),
          ],
        }),
      ],
      ativo: true,
    },
  ];
}

export async function criarModelosIniciais(unidadeIds, aoProgresso) {
  let n = 0;
  for (const u of unidadeIds) {
    for (const m of gerarModelosIniciais(u)) {
      await salvarModelo(null, m);
      n++;
      aoProgresso?.(n);
    }
  }
  return n;
}
