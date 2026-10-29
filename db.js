// =====================================================================
// db.js — conversa com o Supabase (login e dados).
// Para mudar de banco no futuro, só este arquivo precisa mudar.
// =====================================================================
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const TABELAS = ['cartoes', 'categorias', 'contas', 'rendas', 'conversoes', 'lancamentos', 'recorrentes'];
const CACHE_KEY = 'cf.cache.v1';

export const configurado = () =>
  !!globalThis.__SUPABASE_FAKE__ || (!SUPABASE_URL.startsWith('COLE_') && !SUPABASE_ANON_KEY.startsWith('COLE_'));

let _cli = null;
function cli() {
  if (globalThis.__SUPABASE_FAKE__) return globalThis.__SUPABASE_FAKE__;
  if (!_cli) {
    _cli = globalThis.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }
  return _cli;
}

// ---------- login ----------
export async function sessaoAtual() {
  const { data } = await cli().auth.getSession();
  return data?.session || null;
}
export async function entrar(email, senha) {
  const { data, error } = await cli().auth.signInWithPassword({ email, password: senha });
  if (error) throw error;
  return data.session;
}
export async function criarConta(email, senha) {
  const { data, error } = await cli().auth.signUp({ email, password: senha });
  if (error) throw error;
  return data;
}
export async function sair() {
  await cli().auth.signOut();
  try { localStorage.removeItem(CACHE_KEY); } catch { /* ignora */ }
}

// ---------- leitura ----------
async function lerTudo(tabela) {
  // o Supabase devolve no máximo 1000 linhas por chamada: pagina até acabar
  const out = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await cli().from(tabela).select('*').range(de, de + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

export async function carregarTudo() {
  const resultados = await Promise.all(TABELAS.map((t) => lerTudo(t)));
  const dados = {};
  TABELAS.forEach((t, i) => { dados[t] = resultados[i]; });
  const { data: cfg, error } = await cli().from('config').select('*').maybeSingle();
  if (error) throw error;
  dados.config = cfg || null;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(dados)); } catch { /* sem espaço: tudo bem */ }
  return dados;
}
export function guardarCache(dados) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(dados)); } catch { /* sem espaço: tudo bem */ }
}
export function lerCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; }
}

// ---------- escrita ----------
export async function inserir(tabela, obj) {
  const { data, error } = await cli().from(tabela).insert(obj).select().single();
  if (error) throw error;
  return data;
}
export async function inserirVarios(tabela, lista) {
  if (!lista.length) return [];
  const { data, error } = await cli().from(tabela).insert(lista).select();
  if (error) throw error;
  return data;
}
export async function atualizar(tabela, id, campos) {
  const { data, error } = await cli().from(tabela).update(campos).eq('id', id).select().single();
  if (error) throw error;
  return data;
}
export async function apagar(tabela, id) {
  const { error } = await cli().from(tabela).delete().eq('id', id);
  if (error) throw error;
}
/** config tem uma linha por usuário (chave = user_id). */
export async function salvarConfig(campos) {
  const sessao = await sessaoAtual();
  if (!sessao) throw new Error('Sessão expirada. Entre de novo.');
  const { data, error } = await cli().from('config')
    .upsert({ ...campos, user_id: sessao.user.id, atualizado_em: new Date().toISOString() }, { onConflict: 'user_id' })
    .select().single();
  if (error) throw error;
  return data;
}
