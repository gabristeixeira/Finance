// =====================================================================
// folhas.js — formulários (folhas que sobem da parte de baixo da tela)
//  • Lançar gasto  • Converter benefício  • Cadastros (cartões, categorias,
//    contas, renda, recorrentes)  • Metas  • Datas de pagamento  • Carga inicial
// Para criar um novo tipo de cadastro, basta acrescentar uma entrada em ENT.
// =====================================================================
import * as L from './logic.js';
import * as DB from './db.js';
import {
  estado, hooks, $, $$, esc, brl, parseValor, paraCampo, porId, caminhoCategoria,
  categoriasEmArvore, abrirFolha, toast, executar, opcoes, PALETA, corCartao,
} from './ui.js';

const MEIOS = [['cartao', 'Cartão'], ['pix', 'Pix'], ['debito', 'Débito'], ['beneficio', 'Benefício']];
const cfgAtual = () => ({ ...L.CONFIG_PADRAO, ...(estado.dados.config || {}) });
const overrideAtual = () => cfgAtual().pagamentos_override || {};

// ---------- atualização local (rápida) depois de gravar ----------
function aplicarLocal(tabela, op, linha) {
  const d = estado.dados;
  if (tabela === 'config') d.config = linha;
  else if (op === 'ins') d[tabela].push(linha);
  else if (op === 'upd') d[tabela] = d[tabela].map((x) => (x.id === linha.id ? linha : x));
  else if (op === 'del') d[tabela] = d[tabela].filter((x) => x.id !== linha.id);
  DB.guardarCache(d);
  hooks.render();
}

// =====================================================================
// LANÇAR GASTO
// =====================================================================
const ls = {
  get: (k, pad) => { try { return localStorage.getItem(k) || pad; } catch { return pad; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ok */ } },
};

function categoriasMaisUsadas(d, n = 6) {
  const cont = new Map();
  for (const l of d.lancamentos) if (l.categoria_id) cont.set(l.categoria_id, (cont.get(l.categoria_id) || 0) + 1);
  const ativas = new Set(d.categorias.filter((c) => c.ativa !== false).map((c) => c.id));
  return [...cont.entries()].filter(([id]) => ativas.has(id)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([id]) => id);
}

function dataMeioDoCiclo(pagamento) {
  // data segura (meio do ciclo que termina nesse pagamento) para que
  // as parcelas seguintes caiam, mês a mês, nos ciclos certos
  const c = L.cicloAnterior({ inicio: pagamento }, overrideAtual());
  return L.addDias(c.inicio, 14);
}

export function abrirLancar(lanc = null) {
  const d = estado.dados;
  const cartoesAtivos = d.cartoes.filter((c) => c.ativo !== false);
  const pagamentos = L.proximosPagamentos(estado.hoje, 12, overrideAtual());
  const editando = !!lanc;
  const s = editando
    ? {
      valor: paraCampo(lanc.valor), meio: lanc.meio, cartao_id: lanc.cartao_id || '', categoria_id: lanc.categoria_id || '',
      parcelas: lanc.parcelas, data: lanc.data, descricao: lanc.descricao || '', andamento: false, fixo: !!lanc.fixo,
      primeiraEm: pagamentos[0].data, novaCat: false,
    }
    : {
      valor: '', meio: ls.get('cf.meio', 'cartao'), cartao_id: ls.get('cf.cartao', ''), categoria_id: '', parcelas: 1,
      data: estado.hoje, descricao: '', andamento: false, fixo: false, primeiraEm: pagamentos[0].data, novaCat: false,
    };
  if (s.meio === 'cartao' && !porId(cartoesAtivos, s.cartao_id)) s.cartao_id = cartoesAtivos[0] ? cartoesAtivos[0].id : '';
  const top = categoriasMaisUsadas(d);

  abrirFolha('<div id="lanc"></div>', (folha, fechar) => {
    const raiz = $('#lanc', folha);

    const sincronizar = () => {
      const v = (id) => { const el = $(`#${id}`, raiz); return el ? el.value : undefined; };
      if (v('l-valor') !== undefined) s.valor = v('l-valor');
      if (v('l-data') !== undefined) s.data = v('l-data');
      if (v('l-desc') !== undefined) s.descricao = v('l-desc');
      if (v('l-parc') !== undefined) s.parcelas = Math.max(1, Math.min(60, parseInt(v('l-parc'), 10) || 1));
      if (v('l-prim') !== undefined) s.primeiraEm = v('l-prim');
      const f = $('#l-fixo', raiz); if (f) s.fixo = f.checked;
    };

    const pintar = (foco) => {
      const andamento = s.andamento && !editando;
      const catSel = s.categoria_id;
      const todasCats = categoriasEmArvore(d);
      raiz.innerHTML = `
        <button class="fechar" data-fechar aria-label="Fechar">×</button>
        <h2>${editando ? 'Editar lançamento' : 'Lançar gasto'}</h2>
        <form id="l-form" novalidate>
          <div class="campo"><label for="l-valor">${andamento ? 'Valor de cada parcela' : 'Valor'}</label>
            <input id="l-valor" class="valor-grande" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${esc(s.valor)}"></div>

          <div class="campo"><span class="rotulo">Como pagou</span><div class="chips">
            ${MEIOS.map(([id, r]) => `<button type="button" class="chip" aria-pressed="${s.meio === id}" data-meio="${id}">${r}</button>`).join('')}</div></div>

          ${s.meio === 'cartao' ? `<div class="campo"><span class="rotulo">Cartão</span><div class="chips">
            ${cartoesAtivos.map((c) => `<button type="button" class="chip" aria-pressed="${s.cartao_id === c.id}" data-cartao="${c.id}"><i style="background:${corCartao(c)}"></i>${esc(c.nome)}</button>`).join('')
    || '<span class="mudo">Cadastre um cartão em Ajustes.</span>'}</div></div>` : ''}

          <div class="campo"><span class="rotulo">Categoria</span><div class="chips">
            ${top.map((id) => `<button type="button" class="chip" aria-pressed="${catSel === id}" data-cat="${id}">${esc(caminhoCategoria(d, id))}</button>`).join('')}
            <button type="button" class="chip" data-nova-cat>+ Nova</button></div>
            <select id="l-cat" aria-label="Todas as categorias">
              <option value="">Sem categoria</option>
              ${todasCats.map((c) => `<option value="${c.id}"${catSel === c.id ? ' selected' : ''}>${c.nivel ? '— ' : ''}${esc(c.nome)}</option>`).join('')}
            </select></div>

          ${s.novaCat ? `<div class="campo"><label for="nc-nome">Nova categoria</label>
            <div class="linha-campos"><input id="nc-nome" placeholder="Nome (ex.: Uber)">
            <select id="nc-pai"><option value="">Principal</option>${todasCats.filter((c) => !c.nivel).map((c) => `<option value="${c.id}">dentro de ${esc(c.nome)}</option>`).join('')}</select></div>
            <button type="button" class="btn sec" id="nc-salvar">Criar categoria</button></div>` : ''}

          ${s.meio === 'cartao' ? `<div class="linha-campos">
            <div class="campo"><label for="l-parc">${andamento ? 'Parcelas que faltam' : 'Parcelas'}</label>
              <input id="l-parc" type="number" inputmode="numeric" min="1" max="60" value="${s.parcelas}"></div>
            ${andamento ? `<div class="campo"><label for="l-prim">1ª parcela quitada em</label>
              <select id="l-prim">${opcoes(pagamentos.map((p) => [p.data, L.fmtData(p.data)]), s.primeiraEm)}</select></div>`
    : `<div class="campo"><label for="l-data">Data</label><input id="l-data" type="date" value="${esc(s.data)}"></div>`}
          </div>` : `<div class="campo"><label for="l-data">Data</label><input id="l-data" type="date" value="${esc(s.data)}"></div>`}

          ${s.meio === 'cartao' && s.parcelas > 1 && !andamento && parseValor(s.valor) > 0
    ? `<p class="mudo pequeno">${s.parcelas}× de ${brl(parseValor(s.valor) / s.parcelas)}. A primeira cai no ciclo da data escolhida.</p>` : ''}
          ${andamento && parseValor(s.valor) > 0 ? `<p class="mudo pequeno">Faltam ${brl(parseValor(s.valor) * s.parcelas)} no total.</p>` : ''}

          <div class="campo"><label for="l-desc">Descrição (opcional)</label><input id="l-desc" value="${esc(s.descricao)}" autocomplete="off"></div>

          <details ${s.andamento || s.fixo ? 'open' : ''}><summary class="mudo" style="padding:6px 0">Mais opções</summary>
            ${!editando && s.meio === 'cartao' ? `<label class="interruptor"><input type="checkbox" id="l-andamento" ${s.andamento ? 'checked' : ''}>
              Parcelamento que já estava em andamento</label>` : ''}
            <label class="interruptor"><input type="checkbox" id="l-fixo" ${s.fixo || andamento ? 'checked' : ''} ${andamento ? 'disabled' : ''}>
              Já era um compromisso (não conta como gasto variável)</label>
          </details>

          <div class="acoes"><button class="btn" type="submit" id="l-salvar">${editando ? 'Salvar alterações' : 'Lançar'}</button>
            ${editando ? '<button type="button" class="btn perigo" id="l-del">Excluir</button>' : ''}</div>
        </form>`;
      $$('[data-fechar]', raiz).forEach((b) => b.addEventListener('click', fechar));
      ligar();
      if (foco) { const el = $(`#${foco}`, raiz); if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch { /* tipo sem seleção */ } } }
    };

    const ligar = () => {
      $$('[data-meio]', raiz).forEach((b) => b.addEventListener('click', () => { sincronizar(); s.meio = b.dataset.meio; if (s.meio !== 'cartao') s.andamento = false; pintar(); }));
      $$('[data-cartao]', raiz).forEach((b) => b.addEventListener('click', () => { sincronizar(); s.cartao_id = b.dataset.cartao; pintar(); }));
      $$('[data-cat]', raiz).forEach((b) => b.addEventListener('click', () => { sincronizar(); s.categoria_id = b.dataset.cat; pintar(); }));
      $('#l-cat', raiz).addEventListener('change', (e) => { sincronizar(); s.categoria_id = e.target.value; pintar(); });
      $('[data-nova-cat]', raiz).addEventListener('click', () => { sincronizar(); s.novaCat = !s.novaCat; pintar(s.novaCat ? 'nc-nome' : ''); });
      const ncs = $('#nc-salvar', raiz);
      if (ncs) {
        ncs.addEventListener('click', () => executar(ncs, async () => {
          const nome = $('#nc-nome', raiz).value.trim();
          if (!nome) { toast('Dê um nome à categoria.'); return; }
          const pai = $('#nc-pai', raiz).value || null;
          sincronizar();
          const row = await DB.inserir('categorias', { nome, parent_id: pai });
          aplicarLocal('categorias', 'ins', row);
          s.categoria_id = row.id; s.novaCat = false;
          pintar();
        }));
      }
      const and = $('#l-andamento', raiz);
      if (and) and.addEventListener('change', () => { sincronizar(); s.andamento = and.checked; if (s.andamento) s.fixo = true; pintar(); });
      const parc = $('#l-parc', raiz);
      if (parc) parc.addEventListener('change', () => { sincronizar(); pintar(); });
      $('#l-valor', raiz).addEventListener('change', () => { sincronizar(); pintar(); });
      $('#l-form', raiz).addEventListener('submit', (e) => { e.preventDefault(); salvar(); });
      const del = $('#l-del', raiz);
      if (del) del.addEventListener('click', () => {
        if (!confirm('Excluir este lançamento?')) return;
        executar(del, async () => { await DB.apagar('lancamentos', lanc.id); aplicarLocal('lancamentos', 'del', lanc); fechar(); }, 'Excluído');
      });
    };

    const salvar = () => {
      sincronizar();
      const valor = parseValor(s.valor);
      if (!(valor > 0)) { toast('Informe o valor.'); $('#l-valor', raiz).focus(); return; }
      if (s.meio === 'cartao' && !s.cartao_id) { toast('Escolha o cartão.'); return; }
      const andamento = s.andamento && !editando;
      const parcelas = s.meio === 'cartao' ? s.parcelas : 1;
      const obj = {
        data: s.data || estado.hoje,
        descricao: s.descricao.trim() || null,
        valor: L.r2(andamento ? valor * parcelas : valor),
        meio: s.meio,
        cartao_id: s.meio === 'cartao' ? s.cartao_id : null,
        categoria_id: s.categoria_id || null,
        parcelas,
        fixo: andamento ? true : s.fixo,
      };
      if (andamento) obj.data = dataMeioDoCiclo(s.primeiraEm);
      const btn = $('#l-salvar', raiz);
      executar(btn, async () => {
        if (editando) {
          const row = await DB.atualizar('lancamentos', lanc.id, obj);
          aplicarLocal('lancamentos', 'upd', row);
        } else {
          const row = await DB.inserir('lancamentos', obj);
          aplicarLocal('lancamentos', 'ins', row);
          ls.set('cf.meio', s.meio);
          if (s.meio === 'cartao') ls.set('cf.cartao', s.cartao_id);
        }
        fechar();
      }, editando ? 'Alterado' : 'Lançado');
    };

    pintar('l-valor');
  });
}

// =====================================================================
// CONVERTER BENEFÍCIO (calculadora acoplada)
// =====================================================================
export function abrirConverter(conversao = null) {
  const d = estado.dados;
  const cfg = cfgAtual();
  const a = L.analisarCiclo(d, estado.hoje);
  const base = a.visoes;
  const editando = !!conversao;
  abrirFolha(`<button class="fechar" data-fechar aria-label="Fechar">×</button>
    <h2>${editando ? 'Editar conversão' : 'Converter benefício em dinheiro'}</h2>
    <p class="mudo pequeno">A taxa vale só para esta conversão. Pode ser 0%.</p>
    <form id="c-form" novalidate>
      <div class="campo"><label for="c-valor">Quanto de benefício converter</label>
        <input id="c-valor" class="valor-grande" inputmode="decimal" placeholder="0,00" autocomplete="off" value="${editando ? paraCampo(conversao.valor_beneficio) : ''}"></div>
      <div class="linha-campos">
        <div class="campo"><label for="c-taxa">Taxa (%)</label><input id="c-taxa" inputmode="decimal" value="${paraCampo(editando ? +(conversao.taxa * 100).toFixed(4) : +(cfg.taxa_conversao * 100).toFixed(4))}"></div>
        <div class="campo"><label for="c-data">Data</label><input id="c-data" type="date" value="${editando ? conversao.data : estado.hoje}"></div>
      </div>
      <div id="c-prev" aria-live="polite"></div>
      <div class="acoes"><button class="btn" type="submit" id="c-salvar">${editando ? 'Salvar' : 'Registrar conversão'}</button>
        ${editando ? '<button type="button" class="btn perigo" id="c-del">Excluir</button>' : ''}</div>
    </form>`, (folha, fechar) => {
    const val = $('#c-valor', folha), taxa = $('#c-taxa', folha), prev = $('#c-prev', folha);
    const atualizar = () => {
      const v = parseValor(val.value) || 0;
      const t = (parseValor(taxa.value) || 0) / 100;
      const liq = L.r2(v * (1 - t));
      // o ciclo já contém a conversão que está sendo editada: tira antes de somar
      const antes = editando ? { liq: Number(conversao.valor_liquido), bruto: Number(conversao.valor_beneficio) } : { liq: 0, bruto: 0 };
      const transf = L.r2(base.transformado - antes.liq + liq);
      const benef = L.r2(base.beneficio + antes.bruto - v);
      const total = L.r2(base.salario + transf + benef);
      prev.innerHTML = `<div class="visoes">
        <div class="visao"><span class="rot">Salário</span><span class="v">${brl(base.salario)}</span></div>
        <div class="visao"><span class="rot">Transformado</span><span class="v">${brl(transf)}</span></div>
        <div class="visao"><span class="rot">Em benefício</span><span class="v ${benef < 0 ? 'neg' : ''}">${brl(benef)}</span></div></div>
        <div class="total-linha"><span class="mudo">Total</span><b>${brl(total)}</b></div>
        ${v > 0 ? `<p class="mudo pequeno">Você recebe ${brl(liq)} em dinheiro; a taxa leva ${brl(v - liq)}.</p>` : ''}
        ${benef < 0 ? '<p class="aviso">Isso é mais do que você tem de benefício neste ciclo.</p>' : ''}`;
    };
    val.addEventListener('input', atualizar); taxa.addEventListener('input', atualizar);
    atualizar(); val.focus();
    $('#c-form', folha).addEventListener('submit', (e) => {
      e.preventDefault();
      const v = parseValor(val.value); const t = parseValor(taxa.value);
      if (!(v > 0)) { toast('Informe quanto converter.'); return; }
      if (Number.isNaN(t) || t < 0 || t >= 100) { toast('Taxa inválida.'); return; }
      const obj = { data: $('#c-data', folha).value || estado.hoje, valor_beneficio: L.r2(v), taxa: +(t / 100).toFixed(5) };
      executar($('#c-salvar', folha), async () => {
        if (editando) aplicarLocal('conversoes', 'upd', await DB.atualizar('conversoes', conversao.id, obj));
        else aplicarLocal('conversoes', 'ins', await DB.inserir('conversoes', obj));
        fechar();
      }, 'Conversão registrada');
    });
    const del = $('#c-del', folha);
    if (del) del.addEventListener('click', () => {
      if (!confirm('Excluir esta conversão?')) return;
      executar(del, async () => { await DB.apagar('conversoes', conversao.id); aplicarLocal('conversoes', 'del', conversao); fechar(); }, 'Excluída');
    });
  });
}

// =====================================================================
// CADASTROS GENÉRICOS
// =====================================================================
const optCartoes = (d) => [['', 'Escolha…'], ...d.cartoes.filter((c) => c.ativo !== false).map((c) => [c.id, c.nome])];
const optCategorias = (d, semId) => [['', 'Sem categoria'], ...categoriasEmArvore(d).filter((c) => c.id !== semId).map((c) => [c.id, `${c.nivel ? '— ' : ''}${c.nome}`])];

const ENT = {
  cartoes: {
    tabela: 'cartoes', titulo: 'cartão',
    padrao: () => ({ ativo: true, cor: PALETA[estado.dados.cartoes.length % PALETA.length], limite: 0, gasto_variavel_estimado: 0 }),
    campos: () => [
      { k: 'nome', rot: 'Nome', tipo: 'texto', obrig: true },
      { k: 'limite', rot: 'Limite (R$)', tipo: 'valor' },
      { k: 'dia_fechamento', rot: 'Dia de fechamento', tipo: 'inteiro', min: 1, max: 31, linha: 1 },
      { k: 'dia_vencimento', rot: 'Dia de vencimento', tipo: 'inteiro', min: 1, max: 31, linha: 1 },
      { k: 'gasto_variavel_estimado', rot: 'Gasto variável que costuma ter por ciclo (R$)', tipo: 'valor', ajuda: 'Sem contar assinaturas e parcelas: o app já conhece esses.' },
      { k: 'cor', rot: 'Cor', tipo: 'cor' },
      { k: 'ativo', rot: 'Em uso', tipo: 'bool' },
    ],
    aoSalvar: (o, reg) => { if (!reg) o.ordem = estado.dados.cartoes.length; },
  },
  categorias: {
    tabela: 'categorias', titulo: 'categoria', padrao: () => ({ ativa: true }),
    campos: (d, v, reg) => [
      { k: 'nome', rot: 'Nome', tipo: 'texto', obrig: true },
      { k: 'parent_id', rot: 'Dentro de', tipo: 'select', opcoes: [['', 'Nenhuma (categoria principal)'], ...d.categorias.filter((c) => !c.parent_id && (!reg || c.id !== reg.id)).map((c) => [c.id, c.nome])], nulo: true,
        ajuda: 'Use para criar subcategorias, como Uber dentro de Transporte.' },
      { k: 'ativa', rot: 'Em uso', tipo: 'bool' },
    ],
  },
  contas: {
    tabela: 'contas', titulo: 'conta', padrao: () => ({ ativa: true, tipo: 'corrente', saldo: 0, principal: false }),
    campos: () => [
      { k: 'nome', rot: 'Nome (ex.: Bradesco)', tipo: 'texto', obrig: true },
      { k: 'tipo', rot: 'Tipo', tipo: 'select', opcoes: [['corrente', 'Conta corrente'], ['beneficio', 'Benefício (VA+VR)'], ['reserva', 'Reserva / cofrinho']] },
      { k: 'saldo', rot: 'Saldo agora (R$)', tipo: 'valor', ajuda: 'Ao salvar, o app passa a contar entradas e saídas a partir de agora.' },
      { k: 'principal', rot: 'É a conta principal deste tipo', tipo: 'bool' },
      { k: 'ativa', rot: 'Em uso', tipo: 'bool' },
    ],
    aoSalvar: (o, reg) => { if (!reg || Number(reg.saldo) !== o.saldo) o.saldo_em = new Date().toISOString(); },
    depois: async (row) => {
      if (!row.principal) return;
      for (const o of estado.dados.contas.filter((c) => c.id !== row.id && c.tipo === row.tipo && c.principal)) {
        aplicarLocal('contas', 'upd', await DB.atualizar('contas', o.id, { principal: false }));
      }
    },
  },
  rendas: {
    tabela: 'rendas', titulo: 'renda', rotuloNovo: 'Nova renda a partir de uma data',
    padrao: () => {
      const u = [...estado.dados.rendas].sort((a, b) => (a.vigencia_inicio < b.vigencia_inicio ? 1 : -1))[0];
      return { vigencia_inicio: estado.hoje, salario: u ? u.salario : 0, va: u ? u.va : 0, vr: u ? u.vr : 0 };
    },
    campos: () => [
      { k: 'vigencia_inicio', rot: 'Vale a partir de', tipo: 'data', obrig: true, ajuda: 'O app usa esta renda em todos os pagamentos desta data em diante.' },
      { k: 'salario', rot: 'Salário (Pix)', tipo: 'valor' },
      { k: 'va', rot: 'Vale-alimentação (VA)', tipo: 'valor', linha: 1 },
      { k: 'vr', rot: 'Vale-refeição (VR)', tipo: 'valor', linha: 1 },
      { k: 'observacao', rot: 'Observação', tipo: 'texto' },
    ],
  },
  conversoes: {
    tabela: 'conversoes', titulo: 'conversão', abrir: (reg) => abrirConverter(reg),
  },
  recorrentes: {
    tabela: 'recorrentes', titulo: 'recorrente',
    padrao: () => ({ ativo: true, modo: 'dia_fixo', meio: 'cartao', valor: 0 }),
    campos: (d, v) => [
      { k: 'descricao', rot: 'Nome', tipo: 'texto', obrig: true },
      { k: 'valor', rot: 'Valor (R$)', tipo: 'valor' },
      { k: 'modo', rot: 'Como acontece', tipo: 'select', dep: true, opcoes: [['dia_fixo', 'Todo mês em um dia fixo'], ['estimado_ciclo', 'Estimativa por ciclo (varia)']],
        ajuda: v.modo === 'estimado_ciclo' ? 'O que você lançar na categoria abaixo vai abatendo a estimativa.' : '' },
      { k: 'dia', rot: 'Dia do mês', tipo: 'inteiro', min: 1, max: 31, se: (x) => x.modo === 'dia_fixo', nulo: true, obrig: true },
      { k: 'meio', rot: 'Como paga', tipo: 'select', dep: true, opcoes: MEIOS },
      { k: 'cartao_id', rot: 'Cartão', tipo: 'select', opcoes: optCartoes(d), se: (x) => x.meio === 'cartao', nulo: true, obrig: true },
      { k: 'categoria_id', rot: 'Categoria', tipo: 'select', opcoes: optCategorias(d), nulo: true, obrigSe: (x) => x.modo === 'estimado_ciclo' },
      { k: 'inicio', rot: 'Começa em (opcional)', tipo: 'data', nulo: true, linha: 1 },
      { k: 'fim', rot: 'Termina em (opcional)', tipo: 'data', nulo: true, linha: 1 },
      { k: 'ativo', rot: 'Ativo', tipo: 'bool' },
    ],
  },
  config: {
    tabela: 'config', titulo: 'metas', semExcluir: true, tituloForm: 'Metas e conversão',
    padrao: () => ({ ...cfgAtual() }),
    campos: () => [
      { k: 'meta_investimento', rot: 'Investir por mês (R$)', tipo: 'valor' },
      { k: 'reserva_minima', rot: 'Mínimo na conta corrente (R$)', tipo: 'valor', linha: 1 },
      { k: 'reserva_ideal', rot: 'Ideal na conta corrente (R$)', tipo: 'valor', linha: 1 },
      { k: 'taxa_conversao', rot: 'Taxa padrão de conversão (%)', tipo: 'percent', ajuda: 'Usada como sugestão ao converter. Em cada conversão você pode mudar.' },
      { k: 'conversao_planejada', rot: 'Benefício que costuma converter por ciclo (R$)', tipo: 'valor', ajuda: 'A projeção usa este valor, já descontada a taxa, como entrada de dinheiro.' },
    ],
    salvar: async (o) => DB.salvarConfig(o),
  },
};

function campoHtml(c, v) {
  const val = v[c.k];
  const id = `f-${c.k}`;
  const ajuda = c.ajuda ? `<span class="ajuda">${esc(c.ajuda)}</span>` : '';
  let ctl;
  switch (c.tipo) {
    case 'valor': ctl = `<input id="${id}" name="${c.k}" inputmode="decimal" value="${esc(paraCampo(val))}" autocomplete="off">`; break;
    case 'percent': ctl = `<input id="${id}" name="${c.k}" inputmode="decimal" value="${esc(paraCampo(val === undefined || val === null ? '' : +(val * 100).toFixed(4)))}" autocomplete="off">`; break;
    case 'inteiro': ctl = `<input id="${id}" name="${c.k}" type="number" inputmode="numeric" min="${c.min ?? ''}" max="${c.max ?? ''}" value="${esc(val ?? '')}">`; break;
    case 'data': ctl = `<input id="${id}" name="${c.k}" type="date" value="${esc(val ?? '')}">`; break;
    case 'cor': ctl = `<input id="${id}" name="${c.k}" type="color" value="${esc(val || '#2B42DF')}" style="padding:4px;height:46px">`; break;
    case 'select': ctl = `<select id="${id}" name="${c.k}">${opcoes(c.opcoes, val)}</select>`; break;
    case 'bool': return `<label class="interruptor"><input id="${id}" name="${c.k}" type="checkbox" ${val ? 'checked' : ''}${c.dep ? ' data-dep' : ''}>${esc(c.rot)}</label>`;
    default: ctl = `<input id="${id}" name="${c.k}" value="${esc(val ?? '')}" autocomplete="off">`;
  }
  return `<div class="campo"><label for="${id}">${esc(c.rot)}</label>${ctl}${ajuda}</div>`;
}

function lerCampo(c, folha) {
  const el = $(`#f-${c.k}`, folha);
  if (!el) return undefined;
  switch (c.tipo) {
    case 'valor': { const n = parseValor(el.value); return Number.isNaN(n) ? NaN : n; }
    case 'percent': { const n = parseValor(el.value); return Number.isNaN(n) ? NaN : +(n / 100).toFixed(5); }
    case 'inteiro': return el.value === '' ? null : parseInt(el.value, 10);
    case 'bool': return el.checked;
    case 'select': return c.nulo && el.value === '' ? null : el.value;
    case 'data': return el.value || null;
    default: return el.value.trim();
  }
}

export function abrirEntidade(nome, registro = null) {
  const E = ENT[nome];
  if (E.abrir) return E.abrir(registro);
  const d = estado.dados;
  const novoReg = !registro;
  const v = { ...(E.padrao ? E.padrao() : {}), ...(registro || {}) };
  const titulo = E.tituloForm || `${novoReg ? 'Novo' : 'Editar'} ${E.titulo}`;
  return abrirFolha(`<button class="fechar" data-fechar aria-label="Fechar">×</button>
    <h2>${esc(titulo)}</h2>
    <form id="e-form" novalidate><div id="e-campos"></div>
      <div class="acoes"><button class="btn" type="submit" id="e-salvar">Salvar</button>
      ${!novoReg && !E.semExcluir ? '<button type="button" class="btn perigo" id="e-del">Excluir</button>' : ''}</div></form>`,
  (folha, fechar) => {
    const cont = $('#e-campos', folha);
    const defs = () => E.campos(d, v, registro);
    const visiveis = () => defs().filter((c) => !c.se || c.se(v));
    const coletar = () => { for (const c of visiveis()) { const x = lerCampo(c, folha); if (x !== undefined) v[c.k] = x; } };
    const pintar = () => {
      let html = ''; let linhaAberta = false;
      for (const c of visiveis()) {
        if (c.linha && !linhaAberta) { html += '<div class="linha-campos">'; linhaAberta = true; }
        if (!c.linha && linhaAberta) { html += '</div>'; linhaAberta = false; }
        html += campoHtml(c, v);
      }
      if (linhaAberta) html += '</div>';
      cont.innerHTML = html;
      $$('select[name], input[data-dep]', cont).forEach((el) => {
        const c = defs().find((x) => x.k === el.name);
        if (c && c.dep) el.addEventListener('change', () => { coletar(); pintar(); });
      });
    };
    pintar();
    const primeiro = $('input,select', cont); if (primeiro && novoReg) primeiro.focus();

    $('#e-form', folha).addEventListener('submit', (e) => {
      e.preventDefault();
      coletar();
      const obj = {};
      for (const c of defs()) {
        const ativo = !c.se || c.se(v);
        if (!ativo) { if (c.nulo) obj[c.k] = null; continue; }
        let x = v[c.k];
        const obrig = c.obrig || (c.obrigSe && c.obrigSe(v));
        if (obrig && (x === null || x === undefined || x === '' || Number.isNaN(x))) { toast(`Preencha: ${c.rot}.`); return; }
        if ((c.tipo === 'valor' || c.tipo === 'percent') && (x === undefined || Number.isNaN(x))) x = c.tipo === 'valor' ? 0 : null;
        if (c.tipo === 'valor' && typeof x === 'number') x = L.r2(x);
        obj[c.k] = x;
      }
      if (E.aoSalvar) E.aoSalvar(obj, registro, d);
      executar($('#e-salvar', folha), async () => {
        if (E.salvar) {
          aplicarLocal(E.tabela, 'upd', await E.salvar(obj));
        } else if (novoReg) {
          const row = await DB.inserir(E.tabela, obj);
          aplicarLocal(E.tabela, 'ins', row);
          if (E.depois) await E.depois(row);
        } else {
          const row = await DB.atualizar(E.tabela, registro.id, obj);
          aplicarLocal(E.tabela, 'upd', row);
          if (E.depois) await E.depois(row);
        }
        fechar();
      }, 'Salvo');
    });

    const del = $('#e-del', folha);
    if (del) del.addEventListener('click', () => {
      const aviso = nome === 'cartoes'
        ? 'Excluir este cartão? Se ele tiver lançamentos ou assinaturas, o banco não deixa. Nesse caso, desmarque "Em uso" para escondê-lo.'
        : 'Excluir este item?';
      if (!confirm(aviso)) return;
      executar(del, async () => { await DB.apagar(E.tabela, registro.id); aplicarLocal(E.tabela, 'del', registro); fechar(); }, 'Excluído');
    });
  });
}

// =====================================================================
// ACERTAR SALDO · DATAS DE PAGAMENTO · EXPORTAR
// =====================================================================
export function abrirAcertarSaldo() {
  const d = estado.dados;
  const conta = L.contaPrincipal(d, 'corrente');
  if (!conta) { abrirEntidade('contas'); return; }
  const atual = L.saldoConta(d, conta, estado.hoje, overrideAtual());
  abrirFolha(`<button class="fechar" data-fechar aria-label="Fechar">×</button>
    <h2>Acertar saldo</h2>
    <p class="mudo">O app estima ${brl(atual)} em ${esc(conta.nome)}. Digite o saldo que aparece no banco agora.</p>
    <form id="s-form" novalidate><div class="campo"><label for="s-valor">Saldo real</label>
      <input id="s-valor" class="valor-grande" inputmode="decimal" autocomplete="off" value="${paraCampo(atual)}"></div>
      <div class="acoes"><button class="btn" type="submit" id="s-salvar">Acertar</button></div></form>`,
  (folha, fechar) => {
    const inp = $('#s-valor', folha); inp.focus(); inp.select();
    $('#s-form', folha).addEventListener('submit', (e) => {
      e.preventDefault();
      const n = parseValor(inp.value);
      if (Number.isNaN(n)) { toast('Informe o saldo.'); return; }
      executar($('#s-salvar', folha), async () => {
        aplicarLocal('contas', 'upd', await DB.atualizar('contas', conta.id, { saldo: L.r2(n), saldo_em: new Date().toISOString() }));
        fechar();
      }, 'Saldo acertado');
    });
  });
}

export function abrirDatasPagamento() {
  const ov = overrideAtual();
  const lista = L.proximosPagamentos(estado.hoje, 12, ov);
  abrirFolha(`<button class="fechar" data-fechar aria-label="Fechar">×</button>
    <h2>Datas de pagamento</h2>
    <p class="mudo pequeno">Por padrão é o último dia útil do mês, considerando feriados bancários. Ajuste se a empresa pagar em outro dia.</p>
    <form id="p-form" novalidate>${lista.map((p) => {
    const padrao = L.ultimoDiaUtil(Number(p.mes.slice(0, 4)), Number(p.mes.slice(5, 7)));
    return `<div class="campo"><label for="p-${p.mes}">${p.mes.slice(5, 7)}/${p.mes.slice(0, 4)}${p.data !== padrao ? ' · ajustada' : ''}</label>
        <input id="p-${p.mes}" type="date" data-mes="${p.mes}" data-padrao="${padrao}" value="${p.data}"></div>`;
  }).join('')}
      <div class="acoes"><button class="btn" type="submit" id="p-salvar">Salvar datas</button></div></form>`,
  (folha, fechar) => {
    $('#p-form', folha).addEventListener('submit', (e) => {
      e.preventDefault();
      const novo = { ...ov };
      $$('input[data-mes]', folha).forEach((el) => {
        if (!el.value || el.value === el.dataset.padrao) delete novo[el.dataset.mes];
        else novo[el.dataset.mes] = el.value;
      });
      executar($('#p-salvar', folha), async () => {
        aplicarLocal('config', 'upd', await DB.salvarConfig({ pagamentos_override: novo }));
        fechar();
      }, 'Datas salvas');
    });
  });
}

export function exportarBackup() {
  const blob = new Blob([JSON.stringify({ exportado_em: new Date().toISOString(), ...estado.dados }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `controle-financeiro-${estado.hoje}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Backup baixado');
}

// =====================================================================
// CARGA INICIAL — lê um arquivo JSON seu (modelo: dados-iniciais.exemplo.json).
// Assim nenhum dado pessoal fica dentro do código publicado na internet.
// =====================================================================
const lerArquivo = (arquivo) => new Promise((ok, erro) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result));
  r.onerror = () => erro(new Error('Não consegui ler o arquivo.'));
  r.readAsText(arquivo);
});

function validarSeed(x) {
  if (!x || typeof x !== 'object') throw new Error('O arquivo não parece ser o de dados iniciais.');
  for (const k of ['cartoes', 'rendas', 'contas']) {
    if (!Array.isArray(x[k])) throw new Error(`Faltou a lista "${k}" no arquivo.`);
  }
  return x;
}

export function abrirSeed() {
  abrirFolha(`<button class="fechar" data-fechar aria-label="Fechar">×</button>
    <h2>Carregar meus dados</h2>
    <p class="mudo pequeno">Escolha o arquivo <b>dados-iniciais.json</b>. Ele cria cartões, assinaturas, gastos fixos, salário e benefícios. Depois você ajusta tudo dentro do app. Quatro números de agora ajudam a calibrar:</p>
    <form id="seed-form" novalidate>
      <div class="campo"><label for="sd-arq">Arquivo</label><input id="sd-arq" type="file" accept=".json,application/json"></div>
      <div class="campo"><label for="sd-brad">Saldo da conta corrente</label><input id="sd-brad" inputmode="decimal" placeholder="0,00" autocomplete="off"></div>
      <div class="campo"><label for="sd-ben">Saldo atual de benefício (VA + VR)</label><input id="sd-ben" inputmode="decimal" placeholder="0,00" autocomplete="off"></div>
      <div class="campo"><label for="sd-cof">Saldo da reserva / cofrinho</label><input id="sd-cof" inputmode="decimal" placeholder="0,00" autocomplete="off"></div>
      <div class="campo"><label for="sd-conv">Benefício que costuma converter por ciclo</label><input id="sd-conv" inputmode="decimal" placeholder="0,00" autocomplete="off">
        <span class="ajuda">Entra na projeção como dinheiro, já descontada a taxa.</span></div>
      <div class="acoes"><button class="btn" type="submit" id="sd-salvar">Carregar</button></div>
    </form>`,
  (folha, fechar) => {
    $('#seed-form', folha).addEventListener('submit', (e) => {
      e.preventDefault();
      const arq = $('#sd-arq', folha).files[0];
      if (!arq) { toast('Escolha o arquivo dados-iniciais.json.'); return; }
      const n = (id) => { const x = parseValor($(`#${id}`, folha).value); return Number.isNaN(x) ? 0 : x; };
      executar($('#sd-salvar', folha), async () => {
        let seed;
        try { seed = validarSeed(JSON.parse(await lerArquivo(arq))); } catch (err) {
          throw new Error(err instanceof SyntaxError ? 'O arquivo não é um JSON válido.' : err.message);
        }
        await carregarMeusDados(seed, { brad: n('sd-brad'), ben: n('sd-ben'), cof: n('sd-cof'), conv: n('sd-conv') });
        await hooks.recarregar();
        fechar();
      }, 'Dados carregados');
    });
  });
}

async function carregarMeusDados(SEED, { brad, ben, cof, conv }) {
  const resp = { brad, ben, cof };
  const principais = SEED.categoriasPrincipais || [];
  const subs = SEED.subcategorias || [];
  const idC = {};
  if (principais.length) {
    (await DB.inserirVarios('categorias', principais.map((nome) => ({ nome })))).forEach((c) => { idC[c.nome] = c.id; });
  }
  if (subs.length) {
    (await DB.inserirVarios('categorias', subs.map(([nome, pai]) => ({ nome, parent_id: idC[pai] || null })))).forEach((c) => { idC[c.nome] = c.id; });
  }
  const cart = await DB.inserirVarios('cartoes', (SEED.cartoes || []).map((c, i) => ({ ...c, ordem: i })));
  const idK = Object.fromEntries(cart.map((c) => [c.nome, c.id]));
  const ligar = ({ cartao, categoria, ...resto }) => ({
    ...resto, cartao_id: cartao ? idK[cartao] || null : null, categoria_id: categoria ? idC[categoria] || null : null,
  });
  await DB.inserirVarios('recorrentes', (SEED.recorrentes || []).map(ligar));
  await DB.inserirVarios('rendas', SEED.rendas || []);
  await DB.inserirVarios('contas', (SEED.contas || []).map(({ pergunta, ...c }) => ({ ...c, saldo: L.r2(resp[pergunta] || 0) })));
  await DB.salvarConfig({ ...(SEED.config || {}), conversao_planejada: L.r2(conv) });
  await DB.inserirVarios('lancamentos', (SEED.lancamentos || []).map(ligar));
}
