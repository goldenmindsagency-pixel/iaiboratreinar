// Catálogos fixos do sistema. Valores de "id" são gravados no banco: não altere ids existentes.

export const NIVEIS = [
  { valor: 0, rotulo: "Sem acesso", curto: "—" },
  { valor: 1, rotulo: "Somente o próprio", curto: "Próprio", ajuda: "Vê e preenche apenas as próprias tarefas e registros" },
  { valor: 2, rotulo: "Visualizar", curto: "Ver", ajuda: "Vê tudo do módulo nas suas unidades" },
  { valor: 3, rotulo: "Editar", curto: "Editar", ajuda: "Cria, edita, revisa e atribui" },
  { valor: 4, rotulo: "Excluir / arquivar", curto: "Excluir", ajuda: "Também arquiva, desativa e cancela (o histórico é mantido)" },
];

/**
 * Módulos que aparecem no menu e na matriz de permissões.
 * tipo "rotina": usa o motor de rotinas (checklists/turnos).
 * niveis: níveis que fazem sentido para o módulo.
 */
export const MODULOS = [
  { id: "limpeza", nome: "Limpeza", icone: "limpeza", tipo: "rotina", grupo: "Operação", niveis: [0, 1, 2, 3, 4] },
  { id: "equipamentos", nome: "Equipamentos", icone: "halter", grupo: "Operação", niveis: [0, 1, 2, 3, 4] },
  { id: "estrutura", nome: "Estrutura física", icone: "ferramenta", grupo: "Operação", niveis: [0, 1, 2, 3, 4] },
  { id: "recepcao", nome: "Recepção", icone: "recepcao", tipo: "rotina", grupo: "Operação", niveis: [0, 1, 2, 3, 4] },
  { id: "salao", nome: "Salão", icone: "salao", tipo: "rotina", grupo: "Operação", niveis: [0, 1, 2, 3, 4] },
  { id: "comercial", nome: "Comercial", icone: "comercial", tipo: "rotina", grupo: "Resultados", niveis: [0, 1, 2, 3, 4] },
  { id: "marketing", nome: "Marketing", icone: "marketing", grupo: "Resultados", niveis: [0, 1, 2, 3, 4] },
  { id: "pendencias", nome: "Ocorrências", icone: "alerta", grupo: "Gestão", niveis: [0, 1, 2, 3, 4] },
  { id: "gestao", nome: "Gestão gerencial", icone: "gestao", tipo: "rotina", grupo: "Gestão", niveis: [0, 1, 2, 3, 4] },
  { id: "relatorios", nome: "Relatórios", icone: "relatorio", grupo: "Gestão", niveis: [0, 2, 3] },
  { id: "unidades", nome: "Unidades", icone: "predio", grupo: "Administração", niveis: [0, 2, 3, 4] },
  { id: "colaboradores", nome: "Colaboradores", icone: "usuarios", grupo: "Administração", niveis: [0, 2] },
];

export const MODULO_POR_ID = Object.fromEntries(MODULOS.map((m) => [m.id, m]));

/** Funções (modelos de permissão) prontas. O administrador pode ajustar cada pessoa depois. */
export const FUNCOES_PADRAO = [
  {
    id: "administrador",
    nome: "Administrador geral",
    descricao: "Acesso total, inclusive colaboradores e configurações",
    admin: true,
    todasUnidades: true,
    aprovador: true,
    verAuditoria: true,
    permissoes: {},
  },
  {
    id: "diretoria",
    nome: "Proprietário / Diretoria",
    descricao: "Painel executivo, relatórios e aprovação dos relatórios mensais",
    todasUnidades: true,
    aprovador: true,
    verAuditoria: true,
    permissoes: {
      limpeza: 2, equipamentos: 2, estrutura: 2, recepcao: 2, salao: 2, comercial: 2, marketing: 2,
      pendencias: 2, gestao: 2, relatorios: 3, unidades: 2, colaboradores: 2,
    },
  },
  {
    id: "gestor",
    nome: "Gestor da unidade",
    descricao: "Supervisiona todos os setores da unidade",
    permissoes: {
      limpeza: 3, equipamentos: 3, estrutura: 3, recepcao: 3, salao: 3, comercial: 3, marketing: 3,
      pendencias: 4, gestao: 3, relatorios: 3, unidades: 2, colaboradores: 2,
    },
  },
  {
    id: "coordenador",
    nome: "Coordenador(a) do salão",
    descricao: "Checklist da coordenação e acompanhamento da equipe",
    permissoes: { salao: 3, pendencias: 3, equipamentos: 2, estrutura: 2, limpeza: 2, recepcao: 2, relatorios: 2 },
  },
  {
    id: "recepcao",
    nome: "Recepcionista",
    descricao: "Relatório de turno e registro de atendimentos",
    permissoes: { recepcao: 1, pendencias: 1 },
  },
  {
    id: "vendedor",
    nome: "Vendedor(a)",
    descricao: "Registro diário de prospecção e contatos",
    permissoes: { comercial: 1, pendencias: 1 },
  },
  {
    id: "limpeza",
    nome: "Zeladoria / limpeza",
    descricao: "Checklists de limpeza por bloco de horário",
    permissoes: { limpeza: 1, pendencias: 1 },
  },
  {
    id: "professor",
    nome: "Professor(a)",
    descricao: "Registra ocorrências e acompanha as próprias",
    permissoes: { pendencias: 1 },
  },
  {
    id: "tecnico",
    nome: "Técnico de manutenção",
    descricao: "Equipamentos, estrutura e ocorrências atribuídas",
    todasUnidades: true,
    permissoes: { equipamentos: 3, estrutura: 3, pendencias: 1 },
  },
  {
    id: "marketing",
    nome: "Marketing",
    descricao: "Calendário de conteúdo e campanhas",
    permissoes: { marketing: 3, pendencias: 1 },
  },
];

export const STATUS_RESPOSTA = {
  concluida: { rotulo: "Concluída", classe: "ok", icone: "check" },
  pendente: { rotulo: "Pendente", classe: "pendente", icone: "xCirculo" },
  nao_realizada: { rotulo: "Não realizada", classe: "pendente", icone: "xCirculo" },
  nao_aplicavel: { rotulo: "Não aplicável", classe: "na", icone: "menosCirculo" },
  nao_verificada: { rotulo: "Não verificada", classe: "na", icone: "info" },
};

/** Conjuntos de respostas por tipo de rotina */
export const CONJUNTOS_RESPOSTA = {
  operacional: { rotulo: "Concluída / Pendente / Não aplicável", opcoes: ["concluida", "pendente", "nao_aplicavel"] },
  gerencial: { rotulo: "Concluída / Não realizada / Não aplicável", opcoes: ["concluida", "nao_realizada", "nao_aplicavel"] },
};

export const FREQUENCIAS = [
  { valor: "diaria", rotulo: "Diária (blocos de horário ou turnos)" },
  { valor: "semanal", rotulo: "Semanal (itens por dia da semana)" },
  { valor: "mensal", rotulo: "Mensal (fechamento do mês)" },
];

export const DIAS_SEMANA = [
  { valor: 1, curto: "Seg", nome: "Segunda-feira" },
  { valor: 2, curto: "Ter", nome: "Terça-feira" },
  { valor: 3, curto: "Qua", nome: "Quarta-feira" },
  { valor: 4, curto: "Qui", nome: "Quinta-feira" },
  { valor: 5, curto: "Sex", nome: "Sexta-feira" },
  { valor: 6, curto: "Sáb", nome: "Sábado" },
  { valor: 0, curto: "Dom", nome: "Domingo" },
];

export const TIPOS_REGISTRO = {
  nenhum: { rotulo: "Sem registros avulsos" },
  atendimento: {
    rotulo: "Atendimentos (recepção)",
    singular: "atendimento",
    tipos: ["Informação", "Visita", "Matrícula", "Renovação", "Solicitação de aluno", "Reclamação", "Sugestão", "Pagamento", "Outro"],
    canais: ["Presencial", "WhatsApp", "Telefone", "Instagram"],
    resultados: ["Resolvido", "Encaminhado", "Pendente", "Convertido em matrícula"],
  },
  contato: {
    rotulo: "Contatos comerciais",
    singular: "contato",
    tipos: [
      "Prospecção ativa", "Lead recebido", "Retorno de lead", "Visita presencial", "Aluno inativo (recuperação)",
      "Aluno faltante", "Renovação", "Pós-venda",
    ],
    canais: ["WhatsApp", "Instagram", "Telefone", "Presencial", "Indicação"],
    resultados: ["Sem resposta", "Interessado", "Agendou visita", "Matriculou", "Renovou", "Retornou aos treinos", "Não tem interesse"],
  },
  feedback: {
    rotulo: "Orientações e feedbacks (salão)",
    singular: "registro",
    tipos: ["Orientação a professor", "Feedback a professor", "Aluno iniciante acompanhado", "Aluno precisa de atenção especial", "Correção técnica", "Elogio de aluno", "Reclamação de aluno"],
    canais: ["Presencial", "WhatsApp", "Reunião"],
    resultados: ["Registrado", "Resolvido", "Encaminhado à gestão"],
  },
};

export const STATUS_PENDENCIA = {
  aberta: { rotulo: "Aberta", classe: "selo-pendente" },
  em_analise: { rotulo: "Em análise", classe: "selo-info" },
  em_andamento: { rotulo: "Em andamento", classe: "selo-info" },
  aguardando: { rotulo: "Aguardando terceiros", classe: "selo-aguardando" },
  resolvida: { rotulo: "Resolvida", classe: "selo-ok" },
  cancelada: { rotulo: "Cancelada", classe: "" },
};

export const TRANSICOES = {
  aberta: ["em_analise", "em_andamento", "cancelada"],
  em_analise: ["em_andamento", "aguardando", "cancelada"],
  em_andamento: ["aguardando", "resolvida", "cancelada"],
  aguardando: ["em_andamento", "resolvida", "cancelada"],
  resolvida: ["em_andamento"],
  cancelada: [],
};

export const PRIORIDADES = {
  baixa: { rotulo: "Baixa", classe: "", ordem: 3 },
  media: { rotulo: "Média", classe: "selo-info", ordem: 2 },
  alta: { rotulo: "Alta", classe: "selo-pendente", ordem: 1 },
  critica: { rotulo: "Crítica", classe: "selo-critico", ordem: 0 },
};

export const ORIGENS_PENDENCIA = {
  ocorrencia: "Ocorrência registrada",
  providencia: "Providência do gestor",
  rotina: "Item de rotina",
  inspecao: "Inspeção",
  preventiva: "Manutenção preventiva",
};

/** Categorias e setor responsável padrão */
export const CATEGORIAS_PENDENCIA = [
  { id: "equipamentos", nome: "Equipamentos", setor: "equipamentos" },
  { id: "estrutura", nome: "Estrutura física", setor: "estrutura" },
  { id: "limpeza", nome: "Limpeza e conservação", setor: "limpeza" },
  { id: "atendimento", nome: "Atendimento e reclamações", setor: "recepcao" },
  { id: "salao", nome: "Salão e professores", setor: "salao" },
  { id: "comercial", nome: "Comercial", setor: "comercial" },
  { id: "marketing", nome: "Marketing", setor: "marketing" },
  { id: "seguranca", nome: "Segurança", setor: "gestao" },
  { id: "administrativo", nome: "Administrativo", setor: "gestao" },
  { id: "outros", nome: "Outros", setor: "gestao" },
];

export const SITUACOES_EQUIPAMENTO = {
  operando: { rotulo: "Operando", classe: "selo-ok" },
  aguardando_avaliacao: { rotulo: "Aguardando avaliação", classe: "selo-aguardando" },
  aguardando_manutencao: { rotulo: "Aguardando manutenção", classe: "selo-pendente" },
  em_manutencao: { rotulo: "Em manutenção", classe: "selo-info" },
  interditado: { rotulo: "Interditado", classe: "selo-critico" },
};

export const ESTADOS_CONSERVACAO = ["Novo", "Bom", "Regular", "Ruim"];

export const CATEGORIAS_EQUIPAMENTO = [
  "Cardio", "Musculação — máquina", "Musculação — peso livre", "Funcional", "Acessórios", "Som e vídeo", "Outros",
];

export const ELEMENTOS_ESTRUTURA = [
  "Iluminação", "Ar-condicionado", "Pintura", "Paredes", "Pisos", "Espelhos", "Portas", "Fechaduras", "Janelas",
  "Banheiros", "Chuveiros", "Instalações hidráulicas", "Instalações elétricas", "Telhado e teto", "Fachada",
];

export const AMBIENTES_PADRAO = [
  "Recepção", "Salão de musculação", "Sala de dança", "Banheiro masculino", "Banheiro feminino", "Copa", "Depósito", "Fachada",
];

export const TIPOS_MANUTENCAO = {
  inspecao: "Inspeção periódica",
  preventiva: "Manutenção preventiva",
  corretiva: "Manutenção corretiva",
};

export const CATEGORIAS_CUSTO = ["Peças", "Mão de obra", "Serviço terceirizado", "Material de limpeza", "Material de escritório", "Reforma", "Outros"];

export const STATUS_INVESTIMENTO = {
  identificado: { rotulo: "Identificado", classe: "" },
  orcado: { rotulo: "Orçado", classe: "selo-info" },
  aprovado: { rotulo: "Aprovado", classe: "selo-marca" },
  realizado: { rotulo: "Realizado", classe: "selo-ok" },
  descartado: { rotulo: "Descartado", classe: "selo-tracejado" },
};

export const ETAPAS_MARKETING = [
  { id: "ideia", nome: "Ideia" },
  { id: "planejamento", nome: "Planejamento" },
  { id: "producao", nome: "Produção" },
  { id: "revisao", nome: "Revisão" },
  { id: "aprovado", nome: "Aprovado" },
  { id: "publicado", nome: "Publicado" },
];

export const PLATAFORMAS = ["Instagram", "Facebook", "TikTok", "WhatsApp", "YouTube", "Google", "Panfleto", "Evento", "Outro"];

export const TIPOS_META = {
  contatos: { rotulo: "Contatos realizados", fonte: "manual" },
  prospeccao: { rotulo: "Prospecções ativas", fonte: "manual" },
  visitas: { rotulo: "Visitas presenciais", fonte: "manual" },
  matriculas: { rotulo: "Novas matrículas", fonte: "evo" },
  renovacoes: { rotulo: "Renovações", fonte: "evo" },
  receita: { rotulo: "Receita de vendas (R$)", fonte: "evo" },
};

export const TIPOS_EVO = {
  matricula: "Matrícula",
  renovacao: "Renovação",
  cancelamento: "Cancelamento",
};

export const CONTEXTOS_GESTOR = {
  "": "Sem dado automático",
  rotinas_hoje: "Rotinas dos setores hoje",
  limpeza_hoje: "Limpeza hoje",
  pendencias_unidade: "Pendências da unidade",
  pendencias_criticas: "Pendências críticas e atrasadas",
  equipamentos_parados: "Equipamentos parados",
  recepcao_hoje: "Recepção hoje",
  salao_hoje: "Salão hoje",
  comercial_hoje: "Comercial hoje",
  marketing_semana: "Marketing da semana",
  reclamacoes: "Reclamações abertas",
  equipe_hoje: "Envio de rotinas pela equipe",
};

export const PRAZOS_PADRAO_DIAS = { critica: 1, alta: 3, media: 7, baixa: 15 };
