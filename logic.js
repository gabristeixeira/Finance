// =====================================================================
// logic.js — toda a "inteligência" do app, sem tocar em tela nem banco.
// Funções puras: recebem dados, devolvem números. Por isso dá para testar
// em Node (tests/logic.test.mjs) e mudar regras com segurança.
//
// Conceitos:
//  - Datas são sempre texto 'AAAA-MM-DD' (evita bagunça de fuso horário).
//  - CICLO = do dia do pagamento (último dia útil) até o próximo.
//    Tudo que cai no cartão dentro do ciclo é quitado no pagamento seguinte.
// =====================================================================

// ---------- utilidades de data ----------
export const pad = (n) => String(n).padStart(2, '0');
export const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
export function parse(s) {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return { y, m, d };
}
const toUTC = (s) => { const { y, m, d } = parse(s); return Date.UTC(y, m - 1, d); };
const fromUTC = (ms) => {
  const dt = new Date(ms);
  return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
};
export const addDias = (s, n) => fromUTC(toUTC(s) + n * 86400000);
export const diffDias = (a, b) => Math.round((toUTC(a) - toUTC(b)) / 86400000);
export const diaSemana = (s) => new Date(toUTC(s)).getUTCDay(); // 0 = domingo
export const diasNoMes = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export function addMeses(s, n) {
  const { y, m, d } = parse(s);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return iso(ny, nm, Math.min(d, diasNoMes(ny, nm)));
}
export function hojeLocal(now = new Date()) {
  return iso(now.getFullYear(), now.getMonth() + 1, now.getDate());
}
const mesAnterior = (y, m) => (m === 1 ? [y - 1, 12] : [y, m - 1]);
const mesSeguinte = (y, m) => (m === 12 ? [y + 1, 1] : [y, m + 1]);

// ---------- dinheiro ----------
const cent = (x) => Math.round(Number(x || 0) * 100);
export const r2 = (x) => Math.round(Number(x || 0) * 100) / 100;
export const num = (x) => Number(x || 0);

// ---------- feriados e dias úteis (calendário bancário brasileiro) ----------
export function pascoa(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(y, mes, dia);
}

const _cacheFeriados = new Map();
export function feriadosBancarios(y) {
  if (_cacheFeriados.has(y)) return _cacheFeriados.get(y);
  const p = pascoa(y);
  const set = new Set([
    iso(y, 1, 1), iso(y, 4, 21), iso(y, 5, 1), iso(y, 9, 7), iso(y, 10, 12),
    iso(y, 11, 2), iso(y, 11, 15), iso(y, 11, 20), iso(y, 12, 25),
    iso(y, 12, 31),                 // bancos não abrem em 31/12
    addDias(p, -48), addDias(p, -47), // carnaval (segunda e terça)
    addDias(p, -2),                 // sexta-feira santa
    addDias(p, 60),                 // corpus christi
  ]);
  _cacheFeriados.set(y, set);
  return set;
}
export function isDiaUtil(s) {
  const dow = diaSemana(s);
  if (dow === 0 || dow === 6) return false;
  return !feriadosBancarios(parse(s).y).has(s);
}
export function ultimoDiaUtil(y, m) {
  let d = iso(y, m, diasNoMes(y, m));
  while (!isDiaUtil(d)) d = addDias(d, -1);
  return d;
}
/** Data de pagamento do mês (aceita ajuste manual: {"2026-12": "2026-12-30"}). */
export function dataPagamento(y, m, override = {}) {
  const k = `${y}-${pad(m)}`;
  return (override && override[k]) || ultimoDiaUtil(y, m);
}

// ---------- ciclos ----------
/** Ciclo que contém a data `ref`: [inicio, fim) — fim é o próximo pagamento. */
export function cicloDe(ref, override = {}) {
  const { y, m } = parse(ref);
  const pMes = dataPagamento(y, m, override);
  let inicio;
  if (ref >= pMes) inicio = pMes;
  else inicio = dataPagamento(...mesAnterior(y, m), override);
  const { y: iy, m: im } = parse(inicio);
  const fim = dataPagamento(...mesSeguinte(iy, im), override);
  return {
    inicio, fim,
    dias: diffDias(fim, inicio),
    decorridos: diffDias(ref, inicio),
    restantes: diffDias(fim, ref),
  };
}
export const proximoCiclo = (c, override = {}) => cicloDe(c.fim, override);
export const cicloAnterior = (c, override = {}) => cicloDe(addDias(c.inicio, -1), override);

/** Lista as próximas datas de pagamento a partir de uma data. */
export function proximosPagamentos(ref, n = 12, override = {}) {
  const out = [];
  let { y, m } = parse(ref);
  for (let i = 0; out.length < n && i < n + 3; i++) {
    const d = dataPagamento(y, m, override);
    if (d >= ref) out.push({ mes: `${y}-${pad(m)}`, data: d });
    [y, m] = mesSeguinte(y, m);
  }
  return out;
}

// ---------- parcelas e recorrências ----------
/** Quebra um lançamento em parcelas (centavos que sobram vão na última). */
export function parcelasDe(l) {
  const n = Math.max(1, Math.floor(num(l.parcelas) || 1));
  const total = cent(l.valor);
  const base = Math.floor(total / n);
  const resto = total - base * n;
  return Array.from({ length: n }, (_, i) => ({
    data: addMeses(l.data, i),
    valor: (base + (i === n - 1 ? resto : 0)) / 100,
    indice: i,
    total: n,
  }));
}

/** Datas em que uma recorrência "dia_fixo" cai dentro de [ini, fimExcl). */
export function ocorrenciasRecorrente(r, ini, fimExcl) {
  if (!r.ativo || r.modo !== 'dia_fixo' || !r.dia) return [];
  const out = [];
  let { y, m } = parse(ini);
  const ultimo = parse(fimExcl);
  while (y < ultimo.y || (y === ultimo.y && m <= ultimo.m)) {
    const d = iso(y, m, Math.min(r.dia, diasNoMes(y, m)));
    if (d >= ini && d < fimExcl && (!r.inicio || d >= r.inicio) && (!r.fim || d <= r.fim)) out.push(d);
    [y, m] = mesSeguinte(y, m);
  }
  return out;
}

/**
 * Tudo que "bate" no período [ini, fimExcl): parcelas de lançamentos e
 * ocorrências de recorrentes. tipo:
 *   'variavel'   → 1ª parcela de uma compra nova (gasto do dia a dia)
 *   'parcela'    → parcela de compromisso (parcelas 2+ ou parcelamento antigo)
 *   'recorrente' → assinatura / conta mensal
 */
export function listarCharges(dados, ini, fimExcl) {
  const out = [];
  for (const l of dados.lancamentos || []) {
    for (const p of parcelasDe(l)) {
      if (p.data >= ini && p.data < fimExcl) {
        out.push({
          id: l.id, data: p.data, valor: p.valor, meio: l.meio,
          cartao_id: l.cartao_id || null, categoria_id: l.categoria_id || null,
          descricao: l.descricao || '', indice: p.indice, total: p.total,
          tipo: p.indice === 0 && !l.fixo ? 'variavel' : 'parcela',
        });
      }
    }
  }
  for (const r of dados.recorrentes || []) {
    for (const d of ocorrenciasRecorrente(r, ini, fimExcl)) {
      out.push({
        id: r.id, data: d, valor: num(r.valor), meio: r.meio,
        cartao_id: r.cartao_id || null, categoria_id: r.categoria_id || null,
        descricao: r.descricao, indice: 0, total: 1, tipo: 'recorrente',
      });
    }
  }
  return out.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
}

const soma = (arr, f = (x) => x.valor) => r2(arr.reduce((s, x) => s + cent(f(x)), 0) / 100);
const ehCaixa = (meio) => meio === 'pix' || meio === 'debito';

// ---------- renda e benefícios ----------
export function rendaVigente(rendas, data) {
  const v = (rendas || [])
    .filter((r) => r.vigencia_inicio <= data)
    .sort((a, b) => (a.vigencia_inicio < b.vigencia_inicio ? 1 : -1))[0];
  return v
    ? { salario: num(v.salario), va: num(v.va), vr: num(v.vr) }
    : { salario: 0, va: 0, vr: 0 };
}

/**
 * As três visões do recebimento.
 *  salario      → salário original (Pix)
 *  transformado → benefício convertido em dinheiro, já sem a taxa
 *  beneficio    → benefício que continua em benefício
 * Ex.: benefício 2000, converte 1000 a 4,3% → 957 / 1000 / salário.
 */
export function calcularVisoes({ salario = 0, va = 0, vr = 0, convertido = 0, taxa = 0.043, gastoBeneficio = 0 }) {
  const recebidoBeneficio = r2(num(va) + num(vr));
  const liquido = r2(num(convertido) * (1 - num(taxa)));
  const taxaPaga = r2(num(convertido) - liquido);
  const beneficio = r2(recebidoBeneficio - num(convertido) - num(gastoBeneficio));
  return {
    salario: r2(salario),
    transformado: liquido,
    beneficio,
    taxaPaga,
    recebidoBeneficio,
    convertidoBruto: r2(convertido),
    total: r2(num(salario) + liquido + beneficio),
  };
}

// ---------- saldos (calibração + eventos) ----------
export function datasPagamentoEntre(depoisDe, ateInclusive, override = {}) {
  const out = [];
  let { y, m } = parse(depoisDe);
  [y, m] = mesAnterior(y, m);
  const fim = parse(ateInclusive);
  while (y < fim.y || (y === fim.y && m <= fim.m + 1)) {
    const d = dataPagamento(y, m, override);
    if (d > depoisDe && d <= ateInclusive) out.push(d);
    [y, m] = mesSeguinte(y, m);
  }
  return out;
}

/** Data (dia) em que o saldo da conta foi calibrado, no horário local do aparelho. */
export function diaDoSaldo(conta) {
  const d = conta.saldo_em ? new Date(conta.saldo_em) : new Date();
  return hojeLocal(d);
}

/**
 * Saldo estimado de uma conta em `ate` (inclusive).
 * corrente : saldo + salário e conversões que entraram − pix/débito − faturas pagas
 * beneficio: saldo + VA/VR que entraram − conversões − gastos com benefício
 * reserva  : o próprio saldo
 */
export function saldoConta(dados, conta, ate, override = {}) {
  const base = diaDoSaldo(conta);
  let saldo = cent(conta.saldo);
  if (conta.tipo === 'reserva' || ate <= base) return r2(saldo / 100);

  const ini = addDias(base, 1);
  const fimExcl = addDias(ate, 1);
  const pagamentos = datasPagamentoEntre(base, ate, override);
  const charges = listarCharges(dados, ini, fimExcl);

  if (conta.tipo === 'corrente') {
    for (const p of pagamentos) {
      saldo += cent(rendaVigente(dados.rendas, p).salario);
      const c = cicloAnterior({ inicio: p }, override); // ciclo que termina em p
      const ch = listarCharges(dados, c.inicio, p).filter((x) => x.meio === 'cartao');
      saldo -= cent(soma(ch));
    }
    for (const cv of dados.conversoes || []) {
      if (cv.data >= ini && cv.data < fimExcl) saldo += cent(cv.valor_liquido ?? num(cv.valor_beneficio) * (1 - num(cv.taxa)));
    }
    saldo -= cent(soma(charges.filter((x) => ehCaixa(x.meio))));
  } else if (conta.tipo === 'beneficio') {
    for (const p of pagamentos) {
      const r = rendaVigente(dados.rendas, p);
      saldo += cent(r.va + r.vr);
    }
    for (const cv of dados.conversoes || []) {
      if (cv.data >= ini && cv.data < fimExcl) saldo -= cent(cv.valor_beneficio);
    }
    saldo -= cent(soma(charges.filter((x) => x.meio === 'beneficio')));
  }
  return r2(saldo / 100);
}

export function contaPrincipal(dados, tipo = 'corrente') {
  const cs = (dados.contas || []).filter((c) => c.ativa !== false && c.tipo === tipo);
  return cs.find((c) => c.principal) || cs[0] || null;
}

// ---------- análise de um ciclo ----------
export const CONFIG_PADRAO = {
  taxa_conversao: 0.043,
  conversao_planejada: 0,
  meta_investimento: 1500,
  reserva_minima: 600,
  reserva_ideal: 1000,
  pagamentos_override: {},
};

/**
 * Analisa um ciclo (por padrão, o ciclo de `hoje`).
 * Para ciclos futuros, passe { ciclo, saldoInicial }.
 */
export function analisarCiclo(dados, hoje, { ciclo: cicloIn = null, saldoInicial = null } = {}) {
  const cfg = { ...CONFIG_PADRAO, ...(dados.config || {}) };
  const override = cfg.pagamentos_override || {};
  const ciclo = cicloIn || cicloDe(hoje, override);
  const futuro = hoje < ciclo.inicio;
  const ref = futuro ? addDias(ciclo.inicio, -1) : hoje; // "agora" dentro do ciclo
  const charges = listarCharges(dados, ciclo.inicio, ciclo.fim);
  const ativos = (dados.cartoes || []).filter((c) => c.ativo !== false);

  // itens "estimado por ciclo": abatidos pelo que você lança na mesma categoria
  const estimados = (dados.recorrentes || [])
    .filter((r) => r.ativo && r.modo === 'estimado_ciclo'
      && (!r.inicio || r.inicio < ciclo.fim) && (!r.fim || r.fim >= ciclo.inicio))
    .map((r) => {
      const realizado = soma(charges.filter((x) => x.tipo === 'variavel'
        && r.categoria_id && x.categoria_id === r.categoria_id && x.meio === r.meio));
      return { rec: r, estimado: num(r.valor), realizado, restante: r2(Math.max(0, num(r.valor) - realizado)) };
    });

  // ----- cartões -----
  const fracao = Math.max(ciclo.decorridos, 0) / Math.max(ciclo.dias, 1);
  const cartoes = ativos.map((c) => {
    const nos = charges.filter((x) => x.meio === 'cartao' && x.cartao_id === c.id);
    const compromisso = nos.filter((x) => x.tipo !== 'variavel');
    const comprometido = soma(compromisso);
    const variavelRealizado = soma(nos.filter((x) => x.tipo === 'variavel'));
    const estimadoVar = num(c.gasto_variavel_estimado);
    const variavelProjetado = r2(Math.max(estimadoVar, variavelRealizado));
    const extraEstimados = soma(estimados.filter((e) => e.rec.meio === 'cartao' && e.rec.cartao_id === c.id), (e) => e.restante);
    const faturaProjetada = r2(comprometido + variavelProjetado + extraEstimados);

    // limite: o que já bateu no cartão + todas as parcelas que ainda vão bater
    const jaLancado = soma(nos.filter((x) => x.data <= ref));
    const parcelasFuturas = soma(listarCharges(dados, addDias(ref, 1), '9999-12-31')
      .filter((x) => x.meio === 'cartao' && x.cartao_id === c.id && x.tipo !== 'recorrente'));
    const limiteUsado = r2(jaLancado + parcelasFuturas);
    const limiteDisponivel = r2(num(c.limite) - limiteUsado);
    const recorrentesFuturos = soma(nos.filter((x) => x.tipo === 'recorrente' && x.data > ref));
    const restanteVariavel = r2(Math.max(0, variavelProjetado - variavelRealizado) + extraEstimados);
    const folgaProjetada = r2(limiteDisponivel - restanteVariavel - recorrentesFuturos);

    // 'cheio' = você já conta com usar o limite todo (ex.: cartão só de Uber): não é alarme.
    let alerta = 'ok';
    if (folgaProjetada < 0) alerta = 'estoura';
    else if (folgaProjetada <= num(c.limite) * 0.05) alerta = 'cheio';
    else if (folgaProjetada <= num(c.limite) * 0.1) alerta = 'apertado';

    const ritmoProjetado = ciclo.decorridos >= 3 && fracao > 0
      ? r2(variavelRealizado / fracao) : null;

    return {
      cartao: c, comprometido, variavelRealizado, variavelEstimado: estimadoVar,
      variavelProjetado, faturaProjetada, jaLancado, parcelasFuturas,
      limiteUsado, limiteDisponivel, folgaProjetada, ritmoProjetado, alerta,
      itens: nos,
    };
  });
  const totalCartoes = r2(cartoes.reduce((s, c) => s + c.faturaProjetada, 0));

  // ----- caixa (Pix / débito) -----
  const caixaFuturo = charges.filter((x) => ehCaixa(x.meio) && x.data > ref);
  const caixaEstimadoRestante = soma(estimados.filter((e) => ehCaixa(e.rec.meio)), (e) => e.restante);
  const caixaRestante = r2(soma(caixaFuturo) + caixaEstimadoRestante);

  const contaCorrente = contaPrincipal(dados, 'corrente');
  const saldoHoje = saldoInicial != null
    ? saldoInicial
    : contaCorrente ? saldoConta(dados, contaCorrente, ref, override) : 0;

  const rendaFim = rendaVigente(dados.rendas, ciclo.fim);
  const convPlanejadaLiquida = r2(num(cfg.conversao_planejada) * (1 - num(cfg.taxa_conversao)));
  const saldoAntesPagamento = r2(saldoHoje - caixaRestante);
  const saldoAposPagamentos = r2(saldoAntesPagamento + rendaFim.salario + convPlanejadaLiquida - totalCartoes);
  const sobraAposInvestimento = r2(saldoAposPagamentos - num(cfg.meta_investimento));
  const margem = r2(sobraAposInvestimento - num(cfg.reserva_minima));
  const semanasRestantes = Math.max(ciclo.restantes / 7, 1); // com menos de 1 semana, não divide

  // ----- benefícios (três visões do ciclo) -----
  const renda = rendaVigente(dados.rendas, ciclo.inicio);
  const conv = (dados.conversoes || []).filter((c) => c.data >= ciclo.inicio && c.data < ciclo.fim);
  const convBruto = soma(conv, (c) => c.valor_beneficio);
  const convLiquido = soma(conv, (c) => c.valor_liquido ?? num(c.valor_beneficio) * (1 - num(c.taxa)));
  const gastoBeneficio = soma(charges.filter((x) => x.meio === 'beneficio' && x.data <= ref));
  const visoes = calcularVisoes({
    salario: renda.salario, va: renda.va, vr: renda.vr,
    convertido: convBruto, taxa: convBruto ? (convBruto - convLiquido) / convBruto : cfg.taxa_conversao,
    gastoBeneficio,
  });
  // se há mais de uma taxa no ciclo, o líquido real vale mais que a fórmula
  visoes.transformado = convLiquido;
  visoes.taxaPaga = r2(convBruto - convLiquido);
  visoes.total = r2(visoes.salario + visoes.transformado + visoes.beneficio);

  const contaBen = contaPrincipal(dados, 'beneficio');
  const saldoBeneficio = contaBen ? saldoConta(dados, contaBen, ref, override) : null;
  const contaRes = contaPrincipal(dados, 'reserva');
  const saldoReserva = contaRes ? saldoConta(dados, contaRes, ref, override) : null;

  // ----- alertas -----
  const alertas = [];
  const dtBR = (s) => `${pad(parse(s).d)}/${pad(parse(s).m)}`;
  for (const c of cartoes) {
    if (c.alerta === 'estoura') {
      alertas.push({ nivel: 'risco', texto: `${c.cartao.nome}: no ritmo previsto o limite estoura em R$ ${fmtNum(-c.folgaProjetada)} antes de ${dtBR(ciclo.fim)}. Segure os gastos neste cartão.` });
    } else if (c.alerta === 'apertado') {
      alertas.push({ nivel: 'atencao', texto: `${c.cartao.nome}: vai sobrar só R$ ${fmtNum(c.folgaProjetada)} de limite até ${dtBR(ciclo.fim)}. Vá mais devagar.` });
    }
    if (c.ritmoProjetado != null && c.variavelEstimado > 0 && c.ritmoProjetado > c.variavelEstimado * 1.15) {
      alertas.push({ nivel: 'atencao', texto: `${c.cartao.nome}: no ritmo atual o gasto variável fecha em R$ ${fmtNum(c.ritmoProjetado)}, acima dos R$ ${fmtNum(c.variavelEstimado)} que você espera.` });
    }
  }
  if (margem < 0) {
    const porSemana = r2(-margem / semanasRestantes);
    const ritmo = ciclo.restantes > 7 ? ` (cerca de R$ ${fmtNum(porSemana)} por semana a menos)` : '';
    alertas.push({ nivel: 'risco', texto: `Para investir R$ ${fmtNum(cfg.meta_investimento)} e manter R$ ${fmtNum(cfg.reserva_minima)} na conta, faltam R$ ${fmtNum(-margem)} até ${dtBR(ciclo.fim)}${ritmo}.` });
  }

  return {
    ciclo, cartoes, totalCartoes, estimados,
    caixa: { restante: caixaRestante, futuro: caixaFuturo, estimadoRestante: caixaEstimadoRestante },
    saldoHoje, saldoAntesPagamento, rendaFim, convPlanejadaLiquida,
    saldoAposPagamentos, sobraAposInvestimento, margem,
    margemPorSemana: margem > 0 ? r2(margem / semanasRestantes) : 0,
    semanasRestantes,
    meta: num(cfg.meta_investimento), reservaMinima: num(cfg.reserva_minima), reservaIdeal: num(cfg.reserva_ideal),
    visoes, saldoBeneficio, saldoReserva, alertas,
    status: margem < 0 ? 'risco' : sobraAposInvestimento < num(cfg.reserva_ideal) ? 'atencao' : 'ok',
  };
}

/** Projeta o ciclo atual e os N seguintes (faturas futuras por cartão). */
export function projetarCiclos(dados, hoje, n = 6) {
  const cfg = { ...CONFIG_PADRAO, ...(dados.config || {}) };
  const override = cfg.pagamentos_override || {};
  const out = [];
  let ciclo = cicloDe(hoje, override);
  let atual = analisarCiclo(dados, hoje);
  out.push(atual);
  for (let i = 1; i < n; i++) {
    ciclo = proximoCiclo(ciclo, override);
    atual = analisarCiclo(dados, hoje, { ciclo, saldoInicial: r2(atual.saldoAposPagamentos - num(cfg.meta_investimento)) });
    out.push(atual);
  }
  return out;
}

// ---------- formatação ----------
export function fmtNum(v) {
  return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export const fmtBRL = (v) => `R$ ${fmtNum(v)}`;
export function fmtData(s, comAno = false) {
  const { y, m, d } = parse(s);
  return comAno ? `${pad(d)}/${pad(m)}/${y}` : `${pad(d)}/${pad(m)}`;
}
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const nomeDiaSemana = (s) => SEMANA[diaSemana(s)];
