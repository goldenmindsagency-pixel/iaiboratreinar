// Datas no fuso da academia (America/Bahia, UTC-3, sem horário de verão).
// Datas "de calendário" são strings 'AAAA-MM-DD'; instantes são objetos Date.

export const FUSO = "America/Bahia";
const OFFSET = "-03:00";

const fmtData = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" });
const fmtHora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit", hour12: false });

/** 'AAAA-MM-DD' do instante informado (padrão: agora) no fuso da academia */
export function dataISO(instante = new Date()) {
  return fmtData.format(instante);
}

export function hoje() {
  return dataISO(new Date());
}

export function horaAgora() {
  return fmtHora.format(new Date());
}

/** Minutos desde 00:00 no fuso da academia */
export function minutosAgora(instante = new Date()) {
  const [h, m] = fmtHora.format(instante).split(":").map(Number);
  return (h % 24) * 60 + m;
}

export function minutosDe(hhmm) {
  if (!hhmm) return 0;
  const [h, m] = String(hhmm).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Instante (Date) de uma data + hora no fuso da academia */
export function instante(data, hhmm = "00:00") {
  return new Date(`${data}T${hhmm.length === 5 ? hhmm : "00:00"}:00${OFFSET}`);
}

function partes(data) {
  const [a, m, d] = data.split("-").map(Number);
  return { a, m, d };
}

/** Soma dias a 'AAAA-MM-DD' (aritmética de calendário em UTC, sem efeito de fuso) */
export function somarDias(data, n) {
  const { a, m, d } = partes(data);
  const dt = new Date(Date.UTC(a, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** 0=domingo ... 6=sábado */
export function diaSemana(data) {
  const { a, m, d } = partes(data);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

export function segundaDaSemana(data) {
  const ds = diaSemana(data);
  return somarDias(data, ds === 0 ? -6 : 1 - ds);
}

export function mesDe(data) {
  return data.slice(0, 7);
}

export function inicioMes(mes) {
  return `${mes}-01`;
}

export function fimMes(mes) {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}

export function somarMeses(mes, n) {
  const [a, m] = mes.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1 + n, 1));
  return dt.toISOString().slice(0, 7);
}

export function diasEntre(inicio, fim) {
  const lista = [];
  let d = inicio;
  let guarda = 0;
  while (d <= fim && guarda < 1000) {
    lista.push(d);
    d = somarDias(d, 1);
    guarda++;
  }
  return lista;
}

export function mesesEntre(inicio, fim) {
  const lista = [];
  let m = mesDe(inicio);
  const ultimo = mesDe(fim);
  let guarda = 0;
  while (m <= ultimo && guarda < 60) {
    lista.push(m);
    m = somarMeses(m, 1);
    guarda++;
  }
  return lista;
}

/** Período de referência de uma rotina conforme a frequência */
export function periodoDe(frequencia, data) {
  if (frequencia === "semanal") return segundaDaSemana(data);
  if (frequencia === "mensal") {
    // Mensal: janela do dia 25 ao dia 5 do mês seguinte. Até o dia 5 ainda vale o mês anterior.
    const { d } = partes(data);
    const mes = d <= 5 ? somarMeses(mesDe(data), -1) : mesDe(data);
    return `${mes}-25`;
  }
  return data;
}

/** Limite final (exclusivo) para envio, igual ao das regras do banco */
export function limiteEnvio(frequencia, periodo) {
  const dias = frequencia === "semanal" ? 8 : frequencia === "mensal" ? 12 : 2;
  return instante(somarDias(periodo, dias));
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function nomeMes(mes, { curto = false, comAno = true } = {}) {
  const [a, m] = mes.split("-").map(Number);
  const nome = (curto ? MESES_CURTOS : MESES)[m - 1];
  return comAno ? `${nome}${curto ? "/" : " de "}${a}` : nome;
}

export function formatarData(data, { comAno = true, curta = false } = {}) {
  if (!data) return "—";
  const str = data instanceof Date ? dataISO(data) : String(data).slice(0, 10);
  const { a, m, d } = partes(str);
  if (curta) return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}${comAno ? `/${a}` : ""}`;
}

export function formatarDataHora(dt) {
  if (!dt) return "—";
  const d = dt instanceof Date ? dt : new Date(dt);
  if (Number.isNaN(d.getTime())) return "—";
  return `${formatarData(dataISO(d))} às ${fmtHora.format(d)}`;
}

export function formatarHora(dt) {
  if (!dt) return "—";
  const d = dt instanceof Date ? dt : new Date(dt);
  return fmtHora.format(d);
}

export function relativo(dt) {
  if (!dt) return "";
  const d = dt instanceof Date ? dt : new Date(dt);
  const seg = Math.round((Date.now() - d.getTime()) / 1000);
  if (seg < 60) return "agora há pouco";
  if (seg < 3600) return `há ${Math.round(seg / 60)} min`;
  if (seg < 86400) return `há ${Math.round(seg / 3600)} h`;
  const dias = Math.round(seg / 86400);
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  return formatarData(dataISO(d));
}

export function nomeDiaSemana(data, curto = false) {
  const nomes = curto
    ? ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"]
    : ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  return nomes[diaSemana(data)];
}

/** Diferença em dias de calendário entre duas datas 'AAAA-MM-DD' (b - a) */
export function diferencaDias(a, b) {
  const pa = partes(a);
  const pb = partes(b);
  return Math.round((Date.UTC(pb.a, pb.m - 1, pb.d) - Date.UTC(pa.a, pa.m - 1, pa.d)) / 86400000);
}

export function rotuloPeriodo(frequencia, periodo) {
  if (frequencia === "semanal") return `Semana de ${formatarData(periodo, { curta: true })} a ${formatarData(somarDias(periodo, 6), { curta: true })}`;
  if (frequencia === "mensal") return `Fechamento de ${nomeMes(periodo.slice(0, 7))}`;
  return `${nomeDiaSemana(periodo)}, ${formatarData(periodo)}`;
}
