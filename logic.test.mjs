// Testes da lógica. Rode com:  npm test   (precisa de Node 18+)
// Os números abaixo são fictícios, só para conferir as contas.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logic.js';

const r = (x) => Math.round(x * 100) / 100;

const cartoes = [
  { id: 'a', nome: 'Cartão A', limite: 3000, gasto_variavel_estimado: 800, ativo: true },
  { id: 'b', nome: 'Cartão B', limite: 2000, gasto_variavel_estimado: 0, ativo: true },
  { id: 'c', nome: 'Cartão C', limite: 500, gasto_variavel_estimado: 500, ativo: true },
  { id: 'd', nome: 'Cartão D', limite: 300, gasto_variavel_estimado: 0, ativo: true },
];
const recorrentes = [
  { id: 'ra', descricao: 'Assinatura A', valor: 100, modo: 'dia_fixo', dia: 22, meio: 'cartao', cartao_id: 'a', ativo: true },
  { id: 'rd1', descricao: 'Assinatura D1', valor: 10, modo: 'dia_fixo', dia: 23, meio: 'cartao', cartao_id: 'd', ativo: true },
  { id: 'rd2', descricao: 'Assinatura D2', valor: 20, modo: 'dia_fixo', dia: 22, meio: 'cartao', cartao_id: 'd', ativo: true },
  { id: 'rd3', descricao: 'Assinatura D3', valor: 30, modo: 'dia_fixo', dia: 12, meio: 'cartao', cartao_id: 'd', ativo: true },
  { id: 'rd4', descricao: 'Assinatura D4', valor: 40, modo: 'dia_fixo', dia: 9, meio: 'cartao', cartao_id: 'd', ativo: true },
  { id: 'e1', descricao: 'Estimado 1', valor: 100, modo: 'estimado_ciclo', meio: 'pix', categoria_id: 'cat-x', ativo: true },
  { id: 'e2', descricao: 'Estimado 2', valor: 150, modo: 'estimado_ciclo', meio: 'pix', categoria_id: 'cat-y', ativo: true },
  { id: 'e3', descricao: 'Estimado 3', valor: 50, modo: 'estimado_ciclo', meio: 'pix', categoria_id: 'cat-z', ativo: true },
  { id: 'e4', descricao: 'Estimado 4', valor: 200, modo: 'estimado_ciclo', meio: 'pix', categoria_id: 'cat-w', ativo: true },
];
const lancamentos = [
  // 6 parcelas de 200 no cartão A, a partir de 20/08
  { id: 'p1', data: '2026-08-20', descricao: 'Compra parcelada', valor: 1200, meio: 'cartao', cartao_id: 'a', parcelas: 6, fixo: true },
  // cartão B: faturas já conhecidas, como compromissos
  { id: 'b1', data: '2026-11-15', valor: 300, meio: 'cartao', cartao_id: 'b', parcelas: 1, fixo: true },
  { id: 'b2', data: '2026-12-15', valor: 300, meio: 'cartao', cartao_id: 'b', parcelas: 1, fixo: true },
  { id: 'b3', data: '2027-01-15', valor: 100, meio: 'cartao', cartao_id: 'b', parcelas: 1, fixo: true },
  { id: 'b4', data: '2027-02-15', valor: 350, meio: 'cartao', cartao_id: 'b', parcelas: 7, fixo: true }, // 7 × 50
];
const rendas = [{ vigencia_inicio: '2026-01-01', salario: 2000, va: 1000, vr: 800 }];
const contas = [
  { id: 'cc', nome: 'Conta', tipo: 'corrente', principal: true, saldo: 800, saldo_em: '2026-10-29T12:00:00-03:00', ativa: true },
];
const dados = {
  cartoes, recorrentes, lancamentos, rendas, contas, conversoes: [], categorias: [],
  config: { meta_investimento: 1500, reserva_minima: 600, reserva_ideal: 1000 },
};
const HOJE = '2026-10-29';

test('páscoa e feriados móveis', () => {
  assert.equal(L.pascoa(2026), '2026-04-05');
  assert.equal(L.pascoa(2027), '2027-03-28');
  const f = L.feriadosBancarios(2026);
  assert.ok(f.has('2026-02-16') && f.has('2026-02-17')); // carnaval
  assert.ok(f.has('2026-04-03'));                          // sexta-feira santa
  assert.ok(f.has('2026-06-04'));                          // corpus christi
});

test('último dia útil (data do pagamento)', () => {
  assert.equal(L.ultimoDiaUtil(2026, 10), '2026-10-30'); // 31 é sábado
  assert.equal(L.ultimoDiaUtil(2026, 11), '2026-11-30');
  assert.equal(L.ultimoDiaUtil(2026, 12), '2026-12-30'); // 31/12 sem expediente
  assert.equal(L.ultimoDiaUtil(2027, 1), '2027-01-29');  // 30 sáb, 31 dom
  assert.equal(L.ultimoDiaUtil(2027, 2), '2027-02-26');
  assert.equal(L.ultimoDiaUtil(2028, 3), '2028-03-31');
});

test('ajuste manual da data de pagamento', () => {
  assert.equal(L.dataPagamento(2026, 12, { '2026-12': '2026-12-29' }), '2026-12-29');
  const c = L.cicloDe('2026-12-10', { '2026-12': '2026-12-29' });
  assert.equal(c.fim, '2026-12-29');
});

test('ciclos de pagamento a pagamento', () => {
  const a = L.cicloDe('2026-10-29');
  assert.equal(a.inicio, '2026-09-30');
  assert.equal(a.fim, '2026-10-30');
  assert.equal(a.restantes, 1);
  const b = L.cicloDe('2026-10-30'); // no próprio dia do pagamento começa o ciclo novo
  assert.equal(b.inicio, '2026-10-30');
  assert.equal(b.fim, '2026-11-30');
  const c = L.cicloDe('2027-01-05');
  assert.equal(c.inicio, '2026-12-30');
  assert.equal(c.fim, '2027-01-29');
});

test('próximos pagamentos', () => {
  const p = L.proximosPagamentos('2026-10-29', 4);
  assert.deepEqual(p.map((x) => x.data), ['2026-10-30', '2026-11-30', '2026-12-30', '2027-01-29']);
});

test('visões do benefício: recebe 2000, converte 1000 a 4,3%', () => {
  const v = L.calcularVisoes({ salario: 2000, va: 1000, vr: 1000, convertido: 1000, taxa: 0.043 });
  assert.equal(v.transformado, 957);
  assert.equal(v.beneficio, 1000);
  assert.equal(v.salario, 2000);
  assert.equal(v.taxaPaga, 43);
  assert.equal(v.total, 3957);
});

test('taxa zero e taxa alta', () => {
  assert.equal(L.calcularVisoes({ va: 500, vr: 500, convertido: 1000, taxa: 0 }).transformado, 1000);
  assert.equal(L.calcularVisoes({ va: 500, vr: 500, convertido: 1000, taxa: 0.1 }).transformado, 900);
});

test('gasto pago com benefício abate do benefício, não do dinheiro', () => {
  const v = L.calcularVisoes({ salario: 1000, va: 1276, vr: 970, convertido: 1000, taxa: 0.043, gastoBeneficio: 300 });
  assert.equal(v.beneficio, 2246 - 1000 - 300);
  assert.equal(v.transformado, 957);
});

test('parcelas somam o total, centavos na última', () => {
  const p = L.parcelasDe({ data: '2026-01-31', valor: 100, parcelas: 3 });
  assert.deepEqual(p.map((x) => x.valor), [33.33, 33.33, 33.34]);
  assert.equal(p[1].data, '2026-02-28');
  assert.equal(p[2].data, '2026-03-31');
});

test('parcelamento de 6x: de 20/08 a 20/01', () => {
  const p = L.parcelasDe(lancamentos[0]);
  assert.equal(p.length, 6);
  assert.ok(p.every((x) => x.valor === 200));
  assert.equal(p[5].data, '2027-01-20');
});

test('assinaturas somam por cartão e usam o limite que já bateu', () => {
  const a = L.analisarCiclo(dados, HOJE);
  const d = a.cartoes.find((c) => c.cartao.id === 'd');
  assert.equal(d.comprometido, 100);
  assert.equal(d.faturaProjetada, 100);
  assert.equal(d.limiteDisponivel, 200);
});

test('limite bloqueado pelas parcelas futuras', () => {
  const a = L.analisarCiclo(dados, HOJE);
  const b = a.cartoes.find((c) => c.cartao.id === 'b');
  assert.equal(b.limiteUsado, 300 + 300 + 100 + 350);
  assert.equal(b.limiteDisponivel, 2000 - 1050);
  assert.equal(b.faturaProjetada, 0); // nada bate nele até 30/10
});

test('cartão que você planeja usar até o limite: "cheio", sem alarme', () => {
  const a = L.analisarCiclo(dados, HOJE);
  const c = a.cartoes.find((x) => x.cartao.id === 'c');
  assert.equal(c.faturaProjetada, 500);
  assert.equal(c.alerta, 'cheio');
  assert.ok(!a.alertas.some((al) => al.texto.startsWith('Cartão C')));
});

test('estoura o limite: alerta de risco', () => {
  const d2 = { ...dados, lancamentos: [...lancamentos,
    { id: 'z', data: '2026-10-25', valor: 480, meio: 'cartao', cartao_id: 'c', parcelas: 1, fixo: false }] };
  const a = L.analisarCiclo(d2, HOJE);
  const c = a.cartoes.find((x) => x.cartao.id === 'c');
  assert.equal(c.variavelProjetado, 500);   // 480 feito, 500 esperado
  assert.equal(c.limiteDisponivel, 20);
  assert.equal(c.folgaProjetada, 0);        // ainda vai gastar mais 20 → cheio
  const d3 = { ...dados, lancamentos: [...lancamentos,
    { id: 'z', data: '2026-10-25', valor: 700, meio: 'cartao', cartao_id: 'c', parcelas: 1, fixo: false }] };
  const c3 = L.analisarCiclo(d3, HOJE).cartoes.find((x) => x.cartao.id === 'c');
  assert.equal(c3.limiteDisponivel, -200);
  assert.equal(c3.alerta, 'estoura');
});

test('lançar um gasto muda a projeção do cartão', () => {
  const d2 = { ...dados, lancamentos: [...lancamentos,
    { id: 'x', data: '2026-10-20', valor: 1500, meio: 'cartao', cartao_id: 'a', parcelas: 1, fixo: false }] };
  const a = L.analisarCiclo(d2, HOJE);
  const ca = a.cartoes.find((c) => c.cartao.id === 'a');
  assert.equal(ca.variavelRealizado, 1500);
  assert.equal(ca.variavelProjetado, 1500); // passou da estimativa de 800
});

test('estimado por ciclo: o que você lança na categoria abate a estimativa', () => {
  const d2 = { ...dados, lancamentos: [...lancamentos,
    { id: 'bus', data: '2026-10-10', valor: 80, meio: 'pix', categoria_id: 'cat-w', parcelas: 1, fixo: false }] };
  const a = L.analisarCiclo(d2, HOJE);
  const e = a.estimados.find((x) => x.rec.id === 'e4');
  assert.equal(e.realizado, 80);
  assert.equal(e.restante, 120);
  // soma das estimativas = 500; abatido 80 → ainda faltam 420 de Pix
  assert.equal(a.caixa.restante, 420);
});

test('saldo da conta: salário e faturas entram na data certa', () => {
  const conta = contas[0];
  assert.equal(L.saldoConta(dados, conta, '2026-10-29'), 800);
  // em 30/10: + salário 2000, − o que de fato bateu nos cartões no ciclo
  // (A: 200 parcela + 100 assinatura; D: 100) = 400
  assert.equal(L.saldoConta(dados, conta, '2026-10-30'), 2400);
});

test('pix e conversões mexem no saldo da conta', () => {
  const d2 = { ...dados,
    lancamentos: [...lancamentos, { id: 'px', data: '2026-10-29', valor: 50, meio: 'pix', parcelas: 1 }],
    conversoes: [{ data: '2026-10-29', valor_beneficio: 500, taxa: 0.043, valor_liquido: 478.5 }] };
  // hoje é o mesmo dia da calibragem: não conta (o saldo informado já reflete o dia)
  assert.equal(L.saldoConta(d2, contas[0], '2026-10-29'), 800);
  d2.lancamentos[d2.lancamentos.length - 1].data = '2026-10-30';
  d2.conversoes[0].data = '2026-10-30';
  assert.equal(L.saldoConta(d2, contas[0], '2026-10-30'), r(2400 - 50 + 478.5));
});

test('saldo de benefício: entra VA+VR no pagamento, sai conversão e gasto', () => {
  const ben = { id: 'bn', nome: 'Benefício', tipo: 'beneficio', principal: true, saldo: 100, saldo_em: '2026-10-29T12:00:00-03:00' };
  const d2 = { ...dados, contas: [contas[0], ben],
    conversoes: [{ data: '2026-10-30', valor_beneficio: 500, taxa: 0.043 }],
    lancamentos: [...lancamentos, { id: 'bg', data: '2026-10-30', valor: 60, meio: 'beneficio', parcelas: 1 }] };
  assert.equal(L.saldoConta(d2, ben, '2026-10-30'), 100 + 1800 - 500 - 60);
});

test('projeção do ciclo fecha as contas', () => {
  const a = L.analisarCiclo(dados, HOJE);
  assert.equal(a.saldoAposPagamentos, r(a.saldoHoje - a.caixa.restante + a.rendaFim.salario - a.totalCartoes));
  assert.equal(a.sobraAposInvestimento, r(a.saldoAposPagamentos - 1500));
  assert.equal(a.margem, r(a.sobraAposInvestimento - 600));
});

test('conversão planejada entra na projeção, já sem a taxa', () => {
  const d2 = { ...dados, config: { ...dados.config, conversao_planejada: 1000, taxa_conversao: 0.043 } };
  const a0 = L.analisarCiclo(dados, HOJE);
  const a1 = L.analisarCiclo(d2, HOJE);
  assert.equal(r(a1.saldoAposPagamentos - a0.saldoAposPagamentos), 957);
});

test('faturas futuras incluem parcelas e assinaturas, ciclo a ciclo', () => {
  const ciclos = L.projetarCiclos(dados, HOJE, 6);
  assert.equal(ciclos.length, 6);
  const nov = ciclos[1];
  assert.equal(nov.ciclo.inicio, '2026-10-30');
  const a = nov.cartoes.find((c) => c.cartao.id === 'a');
  assert.equal(a.comprometido, 200 + 100);          // parcela de 20/11 + assinatura de 22/11
  assert.equal(a.faturaProjetada, 200 + 100 + 800); // + variável esperado
  assert.equal(nov.cartoes.find((c) => c.cartao.id === 'b').faturaProjetada, 300);
  // cada ciclo parte do saldo do anterior menos o investimento
  assert.equal(ciclos[1].saldoHoje, r(ciclos[0].saldoAposPagamentos - 1500));
});

test('parcelamento termina: ciclos de 30/10 a 29/01 carregam a compra de 6x', () => {
  const ciclos = L.projetarCiclos(dados, HOJE, 8);
  const com = ciclos.filter((c) => c.cartoes.find((x) => x.cartao.id === 'a').itens.some((i) => i.id === 'p1'));
  assert.deepEqual(com.map((c) => c.ciclo.fim), ['2026-10-30', '2026-11-30', '2026-12-30', '2027-01-29']);
});

test('mudança de salário vale a partir da vigência', () => {
  const rs = [...rendas, { vigencia_inicio: '2026-12-01', salario: 4000, va: 1000, vr: 800 }];
  assert.equal(L.rendaVigente(rs, '2026-11-30').salario, 2000);
  assert.equal(L.rendaVigente(rs, '2026-12-30').salario, 4000);
});

test('sem cartões, sem rendas: não quebra', () => {
  const vazio = { cartoes: [], recorrentes: [], lancamentos: [], rendas: [], contas: [], conversoes: [], categorias: [], config: null };
  const a = L.analisarCiclo(vazio, HOJE);
  assert.equal(a.totalCartoes, 0);
  assert.equal(a.saldoAposPagamentos, 0 - 0);
  assert.equal(L.projetarCiclos(vazio, HOJE, 3).length, 3);
});

test('com mais de uma semana pela frente, o alerta fala em valor por semana', () => {
  const d2 = { ...dados, contas: [{ ...contas[0], saldo: 0 }] };
  const a = L.analisarCiclo(d2, '2026-10-05');
  assert.ok(a.margem < 0);
  assert.ok(a.alertas.some((x) => x.texto.includes('por semana')));
});
