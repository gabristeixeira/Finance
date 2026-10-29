// =====================================================================
// telas.js — monta o HTML de cada aba. Só leitura: não grava nada.
// =====================================================================
import * as L from './logic.js';
import {
  estado, esc, brl, brlSinal, curto, classeSinal, corCartao, porId,
  caminhoCategoria, categoriasEmArvore,
} from './ui.js';

const ICONES = {
  hoje: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
  cartoes: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h4"/>',
  extrato: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  ajustes: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
};

export function nav() {
  const aba = (id, rot) => `<button class="aba" data-acao="aba" data-aba="${id}" ${estado.aba === id ? 'aria-current="page"' : ''}>
    <svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[id]}</svg>${rot}</button>`;
  return `<nav class="nav" aria-label="Principal"><div class="nav-in">
    ${aba('hoje', 'Hoje')}${aba('cartoes', 'Cartões')}
    <button class="lancar" data-acao="lancar">+ Lançar</button>
    ${aba('extrato', 'Extrato')}${aba('ajustes', 'Ajustes')}
  </div></nav>`;
}

const topo = (titulo, sub = '') => `<header class="topo"><h1>${esc(titulo)}</h1><span class="sub">${esc(sub)}</span></header>`;
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
const diaMes = (s) => L.fmtData(s);
const diaTxt = (s) => `${L.nomeDiaSemana(s)} ${L.fmtData(s)}`;

// ---------------------------------------------------------------------
// Régua do ciclo
// ---------------------------------------------------------------------
function regua(d, a) {
  const c = a.ciclo;
  const W = 340, PX = 14, base = 74;
  const X = (s) => PX + (L.diffDias(s, c.inicio) / c.dias) * (W - 2 * PX);
  const charges = L.listarCharges(d, c.inicio, c.fim);
  const porDia = new Map();
  for (const ch of charges) {
    const g = porDia.get(ch.data) || { total: 0, max: 0, cor: 'var(--ink2)', futuro: ch.data > estado.hoje };
    g.total += ch.valor;
    if (ch.valor > g.max) {
      g.max = ch.valor;
      g.cor = ch.meio === 'cartao' ? corCartao(porId(d.cartoes, ch.cartao_id)) : 'var(--ink2)';
    }
    porDia.set(ch.data, g);
  }
  const maxTotal = Math.max(1, ...[...porDia.values()].map((g) => g.total));

  let s = '';
  for (let i = 0; i <= c.dias; i++) {
    const x = X(L.addDias(c.inicio, i)).toFixed(1);
    s += `<line class="tique${i % 7 === 0 ? ' sem' : ''}" x1="${x}" x2="${x}" y1="${base}" y2="${base + (i % 7 === 0 ? 9 : 5)}"/>`;
  }
  s += `<line class="eixo" x1="${PX}" x2="${W - PX}" y1="${base}" y2="${base}"/>`;
  for (const [data, g] of porDia) {
    const h = 6 + 40 * Math.sqrt(g.total / maxTotal);
    const x = X(data) - 3;
    s += g.futuro
      ? `<rect class="fut" x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="6" height="${h.toFixed(1)}" rx="2" style="stroke:${g.cor}"/>`
      : `<rect x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="6" height="${h.toFixed(1)}" rx="2" fill="${g.cor}"/>`;
  }
  const xh = X(estado.hoje);
  const ancora = xh > W - 50 ? 'end' : xh < 40 ? 'start' : 'middle';
  s += `<line class="hoje" x1="${xh.toFixed(1)}" x2="${xh.toFixed(1)}" y1="14" y2="${base + 10}"/>`;
  s += `<text class="hoje-rot" x="${xh.toFixed(1)}" y="9" text-anchor="${ancora}">hoje</text>`;
  s += `<text class="rot" x="${PX}" y="${base + 26}">${diaMes(c.inicio)}</text>`;
  const bandeira = `${diaMes(c.fim)} · ${curto(a.saldoAposPagamentos)}`;
  const bw = bandeira.length * 6.4 + 14;
  s += `<line class="eixo" x1="${W - PX}" x2="${W - PX}" y1="${base}" y2="${base + 14}"/>`;
  s += `<rect class="bandeira" x="${W - PX - bw}" y="${base + 14}" width="${bw}" height="18" rx="4"/>`;
  s += `<text class="bandeira-t" x="${W - PX - bw / 2}" y="${base + 26.5}" text-anchor="middle">${esc(bandeira)}</text>`;
  const resumo = `Ciclo de ${diaMes(c.inicio)} a ${diaMes(c.fim)}, hoje é dia ${diaMes(estado.hoje)}. Saldo previsto após pagar tudo: ${brlSinal(a.saldoAposPagamentos)}.`;
  return `<div class="regua"><svg viewBox="0 0 ${W} 112" role="img" aria-label="${esc(resumo)}">${s}</svg></div>`;
}

// ---------------------------------------------------------------------
// HOJE
// ---------------------------------------------------------------------
export function telaHoje() {
  const d = estado.dados;
  const a = L.analisarCiclo(d, estado.hoje);
  const c = a.ciclo;
  const semDados = !d.cartoes.length && !d.rendas.length && !d.contas.length;
  let h = topo('Hoje', diaTxt(estado.hoje));

  if (semDados) {
    return h + `<section class="secao"><h2>Vamos começar</h2>
      <p>O app ainda está vazio. Se você tem o arquivo <b>dados-iniciais.json</b>, carregue seus cartões, assinaturas, salário e benefícios de uma vez.
      Você ajusta tudo depois, dentro do app.</p>
      <button class="btn bloco" data-acao="seed">Carregar meus dados</button>
      <p class="mudo pequeno" style="margin-top:10px">Prefere começar do zero? Cadastre tudo em Ajustes.</p></section>`;
  }

  const restTxt = c.restantes === 0 ? 'hoje' : `daqui a ${plural(c.restantes, 'dia', 'dias')}`;
  const cls = classeSinal(a.saldoAposPagamentos);
  const clsInv = classeSinal(a.sobraAposInvestimento);
  const rotEstado = a.status === 'ok' ? 'Dentro do plano'
    : a.status === 'atencao' ? 'Abaixo da reserva ideal' : 'Abaixo da reserva mínima';

  h += `<section class="secao">${regua(d, a)}
    <p class="frase">No pagamento de <b>${diaTxt(c.fim)}</b> (${restTxt}) você quita os cartões e a conta fica com
      <b class="${cls}">${brlSinal(a.saldoAposPagamentos)}</b>${a.meta > 0
    ? `. Investindo ${brl(a.meta)}, sobram <b class="${clsInv}">${brlSinal(a.sobraAposInvestimento)}</b>` : ''}.</p>
    <span class="estado ${a.status}">${rotEstado}</span>
    ${a.margem >= 0 ? `<p class="mudo pequeno">Há ${brl(a.margem)} de folga acima da reserva mínima${c.restantes > 7 ? ` (cerca de ${brl(a.margemPorSemana)} por semana)` : ''}.</p>` : ''}
    <dl class="conta-linha">
      <dt>Saldo estimado na conta hoje</dt><dd>${brlSinal(a.saldoHoje)}</dd>
      <dt>− Pix e contas que ainda faltam</dt><dd>${brlSinal(-a.caixa.restante)}</dd>
      <dt>− Faturas dos cartões (projetadas)</dt><dd>${brlSinal(-a.totalCartoes)}</dd>
      <dt>+ Salário de ${diaMes(c.fim)}</dt><dd>${brlSinal(a.rendaFim.salario)}</dd>
      ${a.convPlanejadaLiquida > 0 ? `<dt>+ Conversão de benefício planejada</dt><dd>${brlSinal(a.convPlanejadaLiquida)}</dd>` : ''}
      <dt><b>Depois de pagar tudo</b></dt><dd><b class="${cls}">${brlSinal(a.saldoAposPagamentos)}</b></dd>
      <dt>− Investimento</dt><dd>${brlSinal(-a.meta)}</dd>
      <dt><b>Sobra na conta</b> <span class="mudo">(reserva mínima ${brl(a.reservaMinima)})</span></dt><dd><b class="${clsInv}">${brlSinal(a.sobraAposInvestimento)}</b></dd>
    </dl>
    <p><button class="acao" style="background:none;border:0;color:var(--acao);font-weight:600;padding:8px 0" data-acao="acertar-saldo">Acertar saldo da conta</button></p>
  </section>`;

  const avisos = [];
  if (!L.contaPrincipal(d, 'corrente')) avisos.push('Cadastre sua conta corrente em Ajustes → Contas para a projeção usar o saldo real.');
  const cfg = d.config || {};
  if (a.visoes.recebidoBeneficio > 0 && !Number(cfg.conversao_planejada)) {
    avisos.push('A projeção ainda não conta nenhuma conversão de benefício em dinheiro. Informe quanto costuma converter por ciclo em Ajustes → Metas e conversão.');
  }
  if (avisos.length) h += `<section class="secao">${avisos.map((t) => `<div class="aviso">${esc(t)}</div>`).join('')}</section>`;

  h += `<section class="secao"><h2>O que merece atenção</h2>${a.alertas.length
    ? `<ul class="alertas">${a.alertas.map((x) => `<li class="${x.nivel}">${esc(x.texto)}</li>`).join('')}</ul>`
    : '<p class="vazio">Nada fora do esperado por enquanto.</p>'}</section>`;

  h += `<section class="secao"><h2>Cartões <button class="acao" data-acao="aba" data-aba="cartoes">Detalhes</button></h2>
    <ul class="lista">${a.cartoes.map(linhaCartao).join('') || '<li class="vazio">Nenhum cartão cadastrado.</li>'}</ul></section>`;

  h += `<section class="secao"><h2>Recebimento do ciclo <button class="acao" data-acao="converter">Converter benefício</button></h2>
    ${blocoVisoes(a)}</section>`;

  if (a.estimados.length) {
    h += `<section class="secao"><h2>Gastos estimados do ciclo</h2>
      <p class="mudo pequeno" style="margin-top:-4px">Lance Pix ou débito na mesma categoria para abater a estimativa.</p>
      ${a.estimados.map(blocoEstimado).join('')}</section>`;
  }
  return h;
}

function linhaCartao(k) {
  const c = k.cartao;
  const cor = corCartao(c);
  const lim = Number(c.limite) || 1;
  const wUsado = Math.max(0, Math.min(100, (k.limiteUsado / lim) * 100));
  const wProj = Math.max(wUsado, Math.min(100, ((lim - k.folgaProjetada) / lim) * 100));
  const corProj = k.alerta === 'estoura' ? 'var(--risco)' : cor;
  const folgaTxt = k.alerta === 'estoura' ? `passa ${brl(-k.folgaProjetada)}`
    : k.alerta === 'cheio' ? 'usa o limite todo' : `sobra ${brl(k.folgaProjetada)}`;
  const folgaCls = k.alerta === 'estoura' ? 'neg' : k.alerta === 'apertado' ? 'aten' : 'mudo';
  return `<li><button class="linha" data-acao="aba" data-aba="cartoes" aria-label="${esc(c.nome)}: detalhes">
    <span class="cor" style="background:${cor}"></span>
    <span><span class="nome">${esc(c.nome)}</span>
      <span class="det" style="display:block">Disponível ${brl(k.limiteDisponivel)} · fatura ${brl(k.faturaProjetada)}</span>
      <span class="barra" aria-hidden="true"><i class="b-proj" style="width:${wProj}%;background:${corProj}"></i><i class="b-usado" style="width:${wUsado}%;background:${cor}"></i></span></span>
    <span class="valor ${folgaCls}" style="font-size:.9rem">${folgaTxt}</span></button></li>`;
}

function blocoVisoes(a) {
  const v = a.visoes;
  let h = `<div class="visoes">
    <div class="visao"><span class="rot">Salário (Pix)</span><span class="v">${brl(v.salario)}</span></div>
    <div class="visao"><span class="rot">Transformado em dinheiro</span><span class="v">${brl(v.transformado)}</span></div>
    <div class="visao"><span class="rot">Ainda em benefício</span><span class="v">${brl(v.beneficio)}</span></div></div>
    <div class="total-linha"><span class="mudo">Total do recebimento</span><b>${brl(v.total)}</b></div>`;
  if (v.convertidoBruto > 0) {
    h += `<p class="mudo pequeno">Converteu ${brl(v.convertidoBruto)} de benefício; a taxa levou ${brl(v.taxaPaga)}.</p>`;
  }
  if (a.saldoBeneficio != null) h += `<p class="mudo pequeno">Saldo de benefício estimado hoje: ${brl(a.saldoBeneficio)}.</p>`;
  return h;
}

function blocoEstimado(e) {
  const pct = e.estimado > 0 ? Math.min(100, (e.realizado / e.estimado) * 100) : 0;
  const passou = e.realizado > e.estimado;
  return `<div class="est"><div class="topo-linha"><span>${esc(e.rec.descricao)}</span>
    <span class="${passou ? 'aten' : ''}">${brl(e.realizado)} <span class="mudo">de ${brl(e.estimado)}</span></span></div>
    <div class="barra"><i style="width:${pct}%;background:${passou ? 'var(--atencao)' : 'var(--ok)'}"></i></div></div>`;
}

// ---------------------------------------------------------------------
// CARTÕES
// ---------------------------------------------------------------------
export function telaCartoes() {
  const d = estado.dados;
  const proj = L.projetarCiclos(d, estado.hoje, 7);
  const atual = proj[0];
  let h = topo('Cartões', `até ${diaMes(atual.ciclo.fim)}`);
  if (!atual.cartoes.length) {
    return h + `<section class="secao"><p class="vazio">Nenhum cartão cadastrado.</p>
      <button class="btn bloco" data-acao="ent-novo" data-ent="cartoes">Adicionar cartão</button></section>`;
  }
  for (const k of atual.cartoes) {
    const c = k.cartao;
    const cor = corCartao(c);
    const grupos = new Map();
    for (const it of k.itens) {
      const nome = caminhoCategoria(d, it.categoria_id);
      grupos.set(nome, (grupos.get(nome) || 0) + it.valor);
    }
    const catLinhas = [...grupos.entries()].sort((x, y) => y[1] - x[1])
      .map(([n, v]) => `<tr><td>${esc(n)}</td><td>${brl(v)}</td></tr>`).join('');
    const faturas = proj.map((p, i) => {
      const kk = p.cartoes.find((x) => x.cartao.id === c.id);
      return `<tr><td>${i === 0 ? '<b>Este ciclo</b> ' : ''}${diaMes(p.ciclo.fim)}</td>
        <td class="fraco">${brl(kk.comprometido)}</td><td>${i === 0 ? '<b>' : ''}${brl(kk.faturaProjetada)}${i === 0 ? '</b>' : ''}</td></tr>`;
    }).join('');
    const cls = k.alerta === 'estoura' ? 'neg' : k.alerta === 'apertado' ? 'aten' : '';
    h += `<section class="secao">
      <h2><span><span class="chip" style="border-color:${cor};cursor:default"><i style="background:${cor}"></i>${esc(c.nome)}</span></span>
        <button class="acao" data-acao="ent-editar" data-ent="cartoes" data-id="${c.id}">Editar</button></h2>
      <dl class="conta-linha">
        <dt>Limite</dt><dd>${brl(c.limite)}</dd>
        <dt>Já usado (inclui parcelas futuras)</dt><dd>${brl(k.limiteUsado)}</dd>
        <dt>Disponível agora</dt><dd><b>${brl(k.limiteDisponivel)}</b></dd>
        <dt>Folga projetada até ${diaMes(atual.ciclo.fim)}</dt><dd><b class="${cls}">${brlSinal(k.folgaProjetada)}</b></dd>
        <dt>Fatura deste ciclo (projetada)</dt><dd>${brl(k.faturaProjetada)}</dd>
        <dt class="mudo">Assinaturas e parcelas</dt><dd class="mudo">${brl(k.comprometido)}</dd>
        <dt class="mudo">Gasto variável (feito de esperado)</dt><dd class="mudo">${brl(k.variavelRealizado)} de ${brl(k.variavelEstimado)}</dd>
      </dl>
      ${k.ritmoProjetado != null && (k.variavelEstimado > 0 || k.variavelRealizado > 0) ? `<p class="mudo pequeno">No ritmo atual, o variável fecharia em ${brl(k.ritmoProjetado)}.</p>` : ''}
      ${c.dia_fechamento ? `<p class="mudo pequeno">Fecha dia ${c.dia_fechamento}${c.dia_vencimento ? ` · vence dia ${c.dia_vencimento}` : ''}.</p>` : ''}
      ${catLinhas ? `<h3 style="margin:14px 0 4px;font-size:.95rem">Por categoria neste ciclo</h3><table class="tabela"><tbody>${catLinhas}</tbody></table>` : ''}
      <h3 style="margin:14px 0 4px;font-size:.95rem">Próximas faturas</h3>
      <table class="tabela"><thead><tr><th>Pagamento</th><th>Compromissos</th><th>Projetada</th></tr></thead><tbody>${faturas}</tbody></table>
    </section>`;
  }
  return h;
}

// ---------------------------------------------------------------------
// EXTRATO
// ---------------------------------------------------------------------
export function cicloComOffset(off) {
  const ov = (estado.dados.config && estado.dados.config.pagamentos_override) || {};
  let c = L.cicloDe(estado.hoje, ov);
  for (let i = 0; i < Math.abs(off); i++) c = off < 0 ? L.cicloAnterior(c, ov) : L.proximoCiclo(c, ov);
  return c;
}

export function telaExtrato() {
  const d = estado.dados;
  const c = cicloComOffset(estado.extratoOffset);
  const rotulo = estado.extratoOffset === 0 ? 'ciclo atual' : estado.extratoOffset < 0 ? 'ciclo anterior' : 'ciclo futuro';
  let itens = L.listarCharges(d, c.inicio, c.fim).map((x) => ({ ...x, tipoItem: 'gasto' }));
  for (const cv of d.conversoes || []) {
    if (cv.data >= c.inicio && cv.data < c.fim) {
      itens.push({ tipoItem: 'conversao', id: cv.id, data: cv.data, valor: Number(cv.valor_beneficio), liquido: Number(cv.valor_liquido), taxa: Number(cv.taxa) });
    }
  }
  const f = estado.extratoFiltro;
  if (f !== 'todos') {
    itens = itens.filter((x) => (f === 'pix' ? x.meio === 'pix' || x.meio === 'debito'
      : f === 'beneficio' ? x.meio === 'beneficio' || x.tipoItem === 'conversao'
        : x.cartao_id === f));
  }
  itens.sort((x, y) => (x.data < y.data ? 1 : x.data > y.data ? -1 : 0));
  const total = itens.filter((x) => x.tipoItem === 'gasto').reduce((s, x) => s + x.valor, 0);

  const chip = (id, rot, cor) => `<button class="chip" aria-pressed="${f === id}" data-acao="filtro" data-filtro="${id}">${cor ? `<i style="background:${cor}"></i>` : ''}${esc(rot)}</button>`;
  let h = topo('Extrato', `${diaMes(c.inicio)} → ${diaMes(c.fim)}`);
  h += `<div class="cab-ciclo"><button data-acao="ciclo" data-dir="-1" aria-label="Ciclo anterior">‹</button>
    <div style="text-align:center"><div class="num">${brl(total)}</div><div class="mudo pequeno">${rotulo}${f !== 'todos' ? ' · filtrado' : ''}</div></div>
    <button data-acao="ciclo" data-dir="1" aria-label="Próximo ciclo">›</button></div>
    <div class="filtros">${chip('todos', 'Todos')}${d.cartoes.filter((x) => x.ativo !== false).map((x) => chip(x.id, x.nome, corCartao(x))).join('')}${chip('pix', 'Pix/débito')}${chip('beneficio', 'Benefício')}</div>`;

  if (!itens.length) return h + '<p class="vazio">Nada lançado neste filtro.</p>';
  let diaAtual = '';
  for (const it of itens) {
    if (it.data !== diaAtual) {
      h += `${diaAtual ? '</ul>' : ''}<div class="dia-cab">${diaTxt(it.data)}${it.data > estado.hoje ? ' · previsto' : ''}</div><ul class="lista">`;
      diaAtual = it.data;
    }
    if (it.tipoItem === 'conversao') {
      h += `<li><button class="linha" data-acao="ent-editar" data-ent="conversoes" data-id="${it.id}">
        <span class="cor" style="background:var(--ok)"></span>
        <span><span class="nome">Conversão de benefício</span><span class="det" style="display:block">taxa ${(it.taxa * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%</span></span>
        <span class="valor">${brl(it.liquido)}<span class="det" style="display:block;font-weight:400">de ${brl(it.valor)}</span></span></button></li>`;
      continue;
    }
    const cart = it.cartao_id ? porId(d.cartoes, it.cartao_id) : null;
    const cor = it.meio === 'cartao' ? corCartao(cart) : it.meio === 'beneficio' ? 'var(--ok)' : 'var(--ink2)';
    const nome = it.descricao || caminhoCategoria(d, it.categoria_id);
    const meioTxt = it.meio === 'cartao' ? (cart ? cart.nome : 'Cartão') : it.meio === 'pix' ? 'Pix' : it.meio === 'debito' ? 'Débito' : 'Benefício';
    const parc = it.total > 1 ? ` · parcela ${it.indice + 1}/${it.total}` : '';
    const acao = it.tipo === 'recorrente'
      ? `data-acao="ent-editar" data-ent="recorrentes" data-id="${it.id}"`
      : `data-acao="editar-lanc" data-id="${it.id}"`;
    h += `<li><button class="linha" ${acao}><span class="cor" style="background:${cor}"></span>
      <span><span class="nome">${esc(nome)}${it.tipo === 'recorrente' ? '<span class="tag">fixo</span>' : ''}</span>
        <span class="det" style="display:block">${esc(meioTxt)} · ${esc(caminhoCategoria(d, it.categoria_id))}${parc}</span></span>
      <span class="valor">${brl(it.valor)}</span></button></li>`;
  }
  return h + '</ul>';
}

// ---------------------------------------------------------------------
// AJUSTES
// ---------------------------------------------------------------------
const item = (acao, a, b) => `<li><button ${acao}><span class="a">${a}</span><span class="b">${b}</span></button></li>`;
const novo = (ent, rot) => `<button class="acao" data-acao="ent-novo" data-ent="${ent}">${rot}</button>`;

export function telaAjustes() {
  const d = estado.dados;
  const cfg = { ...L.CONFIG_PADRAO, ...(d.config || {}) };
  const ov = cfg.pagamentos_override || {};
  const ed = (ent, id) => `data-acao="ent-editar" data-ent="${ent}" data-id="${id}"`;
  let h = topo('Ajustes', estado.sessao && estado.sessao.user ? estado.sessao.user.email : '');

  h += `<section class="secao"><h2>Cartões ${novo('cartoes', 'Adicionar')}</h2><ul class="menu-lista">${
    d.cartoes.map((c) => item(ed('cartoes', c.id),
      `<span class="chip" style="cursor:default"><i style="background:${corCartao(c)}"></i>${esc(c.nome)}</span>${c.ativo === false ? ' <span class="tag">inativo</span>' : ''}`,
      `limite ${brl(c.limite)}${c.dia_fechamento ? `<br>fecha ${c.dia_fechamento} · vence ${c.dia_vencimento || '—'}` : ''}`)).join('')
    || '<li class="vazio">Nenhum cartão.</li>'}</ul></section>`;

  h += `<section class="secao"><h2>Assinaturas e contas fixas ${novo('recorrentes', 'Adicionar')}</h2><ul class="menu-lista">${
    d.recorrentes.map((r) => {
      const cart = r.cartao_id ? porId(d.cartoes, r.cartao_id) : null;
      const quando = r.modo === 'dia_fixo' ? `todo dia ${r.dia}` : 'estimado por ciclo';
      const onde = r.meio === 'cartao' ? (cart ? cart.nome : 'cartão') : r.meio === 'pix' ? 'Pix' : r.meio === 'debito' ? 'débito' : 'benefício';
      return item(ed('recorrentes', r.id), `${esc(r.descricao)}${r.ativo ? '' : ' <span class="tag">pausado</span>'}`, `${brl(r.valor)}<br>${quando} · ${esc(onde)}`);
    }).join('') || '<li class="vazio">Nada cadastrado.</li>'}</ul></section>`;

  h += `<section class="secao"><h2>Categorias ${novo('categorias', 'Adicionar')}</h2><ul class="menu-lista arvore">${
    categoriasEmArvore(d).map((c) => item(ed('categorias', c.id), `<span class="${c.nivel ? 'sub' : ''}">${esc(c.nome)}</span>`, c.nivel ? 'subcategoria' : '')).join('')
    || '<li class="vazio">Nenhuma categoria.</li>'}</ul></section>`;

  const rendas = [...d.rendas].sort((x, y) => (x.vigencia_inicio < y.vigencia_inicio ? 1 : -1));
  h += `<section class="secao"><h2>Salário e benefícios ${novo('rendas', 'Registrar mudança')}</h2><ul class="menu-lista">${
    rendas.map((r, i) => item(ed('rendas', r.id),
      `${i === 0 ? 'Vale hoje · ' : ''}a partir de ${L.fmtData(r.vigencia_inicio, true)}`,
      `salário ${brl(r.salario)}<br>VA ${brl(r.va)} · VR ${brl(r.vr)}`)).join('') || '<li class="vazio">Nenhuma renda cadastrada.</li>'}</ul></section>`;

  h += `<section class="secao"><h2>Contas ${novo('contas', 'Adicionar')}</h2><ul class="menu-lista">${
    d.contas.map((c) => {
      const s = L.saldoConta(d, c, estado.hoje, ov);
      const tipo = c.tipo === 'corrente' ? 'conta corrente' : c.tipo === 'beneficio' ? 'benefício (VA+VR)' : 'reserva';
      return item(ed('contas', c.id), `${esc(c.nome)}${c.principal ? ' <span class="tag">principal</span>' : ''}`, `${brl(s)}<br>${tipo}`);
    }).join('') || '<li class="vazio">Nenhuma conta.</li>'}</ul></section>`;

  h += `<section class="secao"><h2>Metas e conversão</h2><ul class="menu-lista">${item('data-acao="cfg-metas"',
    'Investimento, reserva e taxa',
    `investir ${brl(cfg.meta_investimento)}<br>reserva ${brl(cfg.reserva_minima)}–${brl(cfg.reserva_ideal)} · taxa ${(cfg.taxa_conversao * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`)}
    ${item('data-acao="datas-pag"', 'Datas de pagamento', 'último dia útil, com ajuste manual')}</ul></section>`;

  h += `<section class="secao"><h2>Dados</h2><ul class="menu-lista">
    ${item('data-acao="exportar"', 'Exportar backup (JSON)', 'baixa tudo em um arquivo')}
    ${item('data-acao="recarregar"', 'Atualizar dados agora', 'busca de novo no banco')}
    ${item('data-acao="sair"', 'Sair da conta', '')}</ul></section>`;
  return h;
}

// ---------------------------------------------------------------------
// LOGIN / CONFIGURAÇÃO
// ---------------------------------------------------------------------
export function telaLogin(erro = '', criando = false) {
  return `<main class="login"><h1>Controle financeiro</h1>
    <p class="mudo">${criando ? 'Crie seu acesso. Os dados ficam só na sua conta.' : 'Entre para ver seu ciclo.'}</p>
    ${erro ? `<div class="aviso erro" role="alert">${esc(erro)}</div>` : ''}
    <form id="form-login" autocomplete="on">
      <div class="campo"><label for="email">E-mail</label><input id="email" type="email" autocomplete="username" required></div>
      <div class="campo"><label for="senha">Senha</label><input id="senha" type="password" autocomplete="${criando ? 'new-password' : 'current-password'}" minlength="8" required>
        ${criando ? '<span class="ajuda">Mínimo de 8 caracteres.</span>' : ''}</div>
      <button class="btn bloco" type="submit">${criando ? 'Criar conta' : 'Entrar'}</button>
    </form>
    <p style="text-align:center;margin-top:16px"><button class="acao" id="alternar" style="background:none;border:0;color:var(--acao);font-weight:600">
      ${criando ? 'Já tenho conta' : 'Criar conta'}</button></p></main>`;
}

export function telaSemConfig() {
  return `<main class="login"><h1>Falta conectar o banco</h1>
    <p>Abra o arquivo <code>js/config.js</code> e cole a URL e a chave <code>anon</code> do seu projeto no Supabase.
    O passo a passo está no <code>LEIAME.md</code>.</p></main>`;
}
