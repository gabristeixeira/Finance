// =====================================================================
// ui.js — estado compartilhado e utilidades de tela
// =====================================================================
import * as L from './logic.js';

export const estado = {
  sessao: null,
  dados: null,
  aba: 'hoje',
  hoje: L.hojeLocal(),
  extratoOffset: 0,
  extratoFiltro: 'todos',
  erro: null,
};

// ligações preenchidas pelo app.js (evita import circular)
export const hooks = { recarregar: async () => {}, render: () => {} };

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const brl = L.fmtBRL;
export const brlSinal = (v) => `${v < 0 ? '−' : ''}R$ ${L.fmtNum(Math.abs(v))}`;
export const curto = (v) => `${v < 0 ? '−' : ''}R$ ${Math.round(Math.abs(v)).toLocaleString('pt-BR')}`;
export const classeSinal = (v) => (v < 0 ? 'neg' : 'pos');

/** Aceita "1.234,56", "1234,56" e "1234.56". Devolve NaN se não for número. */
export function parseValor(s) {
  let t = String(s ?? '').trim().replace(/[R$\s]/g, '');
  if (!t) return NaN;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ''); // 1.200 = mil e duzentos
  return Number(t);
}
export const paraCampo = (n) => (n === null || n === undefined || n === '' ? '' : String(n).replace('.', ','));

// ---------- dados ----------
export const PALETA = ['#8A05BE', '#EC7000', '#1F78D1', '#4B5563', '#1A7556', '#BF1F4B', '#946500', '#2B42DF'];
export const corCartao = (c) => (c && c.cor) || PALETA[((c && c.ordem) || 0) % PALETA.length];
export const porId = (lista, id) => (lista || []).find((x) => x.id === id) || null;

export function caminhoCategoria(d, id) {
  const c = porId(d.categorias, id);
  if (!c) return 'Sem categoria';
  const p = c.parent_id ? porId(d.categorias, c.parent_id) : null;
  return p ? `${p.nome} › ${c.nome}` : c.nome;
}

/** Categorias em ordem de árvore: pai, filhos, pai, filhos... */
export function categoriasEmArvore(d) {
  const ativas = (d.categorias || []).filter((c) => c.ativa !== false);
  const pais = ativas.filter((c) => !c.parent_id || !porId(ativas, c.parent_id))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const out = [];
  for (const p of pais) {
    out.push({ ...p, nivel: 0 });
    ativas.filter((c) => c.parent_id === p.id)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .forEach((f) => out.push({ ...f, nivel: 1 }));
  }
  return out;
}

// ---------- folhas (modais) e avisos ----------
export function abrirFolha(html, aoMontar) {
  const fundo = document.createElement('div');
  fundo.className = 'fundo';
  fundo.innerHTML = `<div class="folha" role="dialog" aria-modal="true">${html}</div>`;
  document.getElementById('folhas').appendChild(fundo);
  fundo.addEventListener('mousedown', (e) => { if (e.target === fundo) fechar(); });
  const fechar = () => fundo.remove();
  fundo.querySelectorAll('[data-fechar]').forEach((b) => b.addEventListener('click', fechar));
  if (aoMontar) aoMontar(fundo.querySelector('.folha'), fechar);
  return fechar;
}

let _toastTimer = null;
export function toast(msg) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.appendChild(t);
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.remove(), 2600);
}

export function mensagemErro(e) {
  const m = (e && (e.message || e.error_description)) || String(e);
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Sem conexão. Tente de novo quando a internet voltar.';
  if (/row-level security/i.test(m)) return 'O banco recusou a gravação. Confira se rodou o schema.sql inteiro e se está logado.';
  if (/foreign key/i.test(m)) return 'Este item tem lançamentos ou assinaturas ligados. Para escondê-lo, desmarque "Em uso" em vez de excluir.';
  if (/violates check constraint/i.test(m)) return 'Algum valor não é aceito (confira cartão, dia ou parcelas).';
  return m;
}

/** Roda uma ação assíncrona mostrando erro em aviso e botão desabilitado. */
export async function executar(botao, fn, okMsg) {
  if (botao) botao.disabled = true;
  try {
    const r = await fn();
    if (okMsg) toast(okMsg);
    return r;
  } catch (e) {
    console.error(e);
    toast(mensagemErro(e));
    return undefined;
  } finally {
    if (botao) botao.disabled = false;
  }
}

export const opcoes = (lista, sel) => lista.map(([v, r]) =>
  `<option value="${esc(v)}"${String(v) === String(sel ?? '') ? ' selected' : ''}>${esc(r)}</option>`).join('');
