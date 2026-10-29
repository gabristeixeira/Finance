// =====================================================================
// app.js — ponto de entrada: login, carregamento, navegação e cliques.
// =====================================================================
import * as L from './logic.js';
import * as DB from './db.js';
import { estado, hooks, $, esc, toast, mensagemErro, porId } from './ui.js';
import * as T from './telas.js';
import * as F from './folhas.js';

// ---------- desenho ----------
function render() {
  const raiz = $('#app');
  const nav = $('#nav');
  const y = window.scrollY;
  try {
    if (!DB.configurado()) { raiz.innerHTML = T.telaSemConfig(); nav.innerHTML = ''; return; }
    if (!estado.sessao) { raiz.innerHTML = T.telaLogin(estado.erro, estado.criando); nav.innerHTML = ''; ligarLogin(); return; }
    if (!estado.dados) { raiz.innerHTML = '<p class="vazio" style="padding:60px 0;text-align:center">Carregando…</p>'; nav.innerHTML = ''; return; }
    const telas = { hoje: T.telaHoje, cartoes: T.telaCartoes, extrato: T.telaExtrato, ajustes: T.telaAjustes };
    raiz.innerHTML = telas[estado.aba]();
    nav.innerHTML = T.nav();
    window.scrollTo(0, y);
  } catch (e) {
    console.error(e);
    raiz.innerHTML = `<div class="aviso erro" style="margin-top:40px" role="alert"><b>Algo deu errado ao montar a tela.</b><br>${esc(e.message)}<br>
      <button class="btn sec" style="margin-top:10px" data-acao="recarregar">Tentar de novo</button></div>`;
  }
}
hooks.render = render;

async function recarregar(silencioso = false) {
  try {
    estado.dados = await DB.carregarTudo();
    estado.hoje = L.hojeLocal();
    render();
    if (!silencioso) toast('Atualizado');
  } catch (e) {
    console.error(e);
    if (/JWT|expired|not authenticated/i.test(e.message || '')) { await DB.sair(); estado.sessao = null; estado.dados = null; render(); return; }
    if (!estado.dados) { estado.dados = DB.lerCache(); render(); }
    toast(mensagemErro(e));
  }
}
hooks.recarregar = () => recarregar(true);

// ---------- login ----------
function ligarLogin() {
  const form = $('#form-login');
  if (!form) return;
  $('#alternar').addEventListener('click', () => { estado.criando = !estado.criando; estado.erro = ''; render(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#email').value.trim();
    const senha = $('#senha').value;
    const botao = form.querySelector('button[type="submit"]');
    botao.disabled = true;
    try {
      if (estado.criando) {
        const r = await DB.criarConta(email, senha);
        if (!r.session) {
          estado.criando = false;
          estado.erro = 'Conta criada. Confirme pelo e-mail que o Supabase enviou e depois entre.';
          render();
          return;
        }
        estado.sessao = r.session;
      } else {
        estado.sessao = await DB.entrar(email, senha);
      }
      estado.erro = '';
      render();
      await recarregar(true);
    } catch (err) {
      estado.erro = /Invalid login/i.test(err.message) ? 'E-mail ou senha incorretos.' : mensagemErro(err);
      render();
    }
  });
}

// ---------- cliques ----------
const ACOES = {
  aba: (el) => { estado.aba = el.dataset.aba; window.scrollTo(0, 0); render(); },
  lancar: () => F.abrirLancar(),
  converter: () => F.abrirConverter(),
  seed: () => F.abrirSeed(),
  'acertar-saldo': () => F.abrirAcertarSaldo(),
  'ent-novo': (el) => F.abrirEntidade(el.dataset.ent),
  'ent-editar': (el) => {
    const ent = el.dataset.ent;
    const reg = porId(estado.dados[ent], el.dataset.id);
    if (reg) F.abrirEntidade(ent, reg);
  },
  'editar-lanc': (el) => {
    const reg = porId(estado.dados.lancamentos, el.dataset.id);
    if (reg) F.abrirLancar(reg);
  },
  filtro: (el) => { estado.extratoFiltro = el.dataset.filtro; render(); },
  ciclo: (el) => { estado.extratoOffset += Number(el.dataset.dir); render(); },
  'cfg-metas': () => F.abrirEntidade('config', estado.dados.config),
  'datas-pag': () => F.abrirDatasPagamento(),
  exportar: () => F.exportarBackup(),
  recarregar: () => recarregar(false),
  sair: async () => {
    if (!confirm('Sair da conta neste aparelho?')) return;
    await DB.sair();
    estado.sessao = null; estado.dados = null; estado.aba = 'hoje';
    render();
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-acao]');
  if (!el || !ACOES[el.dataset.acao]) return;
  if (!estado.dados && el.dataset.acao !== 'recarregar') return;
  ACOES[el.dataset.acao](el);
});

// ao voltar para o app (ex.: abriu no celular depois de lançar no computador), atualiza
let _ultimaAtualizacao = Date.now();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !estado.sessao) return;
  const hojeNovo = L.hojeLocal();
  if (hojeNovo !== estado.hoje) { estado.hoje = hojeNovo; render(); }
  if (Date.now() - _ultimaAtualizacao > 20000) { _ultimaAtualizacao = Date.now(); recarregar(true); }
});

// ---------- partida ----------
async function iniciar() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* sem offline, tudo bem */ });
  }
  if (!DB.configurado()) { render(); return; }
  try { estado.sessao = await DB.sessaoAtual(); } catch (e) { console.error(e); }
  if (estado.sessao) {
    estado.dados = DB.lerCache();   // mostra algo na hora, mesmo sem internet
    render();
    await recarregar(true);
  } else {
    render();
  }
}
iniciar();

// facilita inspecionar no navegador (F12): window.cf.estado, window.cf.L ...
window.cf = { estado, L, DB };
