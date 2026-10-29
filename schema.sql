-- =====================================================================
-- Controle Financeiro — schema do banco (Supabase / PostgreSQL)
-- Cole este arquivo inteiro no SQL Editor do Supabase e clique em Run.
-- Pode rodar mais de uma vez: usa "if not exists".
-- Toda tabela tem user_id + RLS: cada usuário só enxerga as próprias linhas.
-- =====================================================================

-- ---------- Cartões ----------
create table if not exists public.cartoes (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome                     text not null,
  limite                   numeric(12,2) not null default 0 check (limite >= 0),
  dia_fechamento           int check (dia_fechamento between 1 and 31),
  dia_vencimento           int check (dia_vencimento between 1 and 31),
  -- quanto você costuma gastar de "variável" por ciclo neste cartão
  -- (sem contar assinaturas e parcelas, que o app já conhece)
  gasto_variavel_estimado  numeric(12,2) not null default 0 check (gasto_variavel_estimado >= 0),
  cor                      text,
  ativo                    boolean not null default true,
  ordem                    int not null default 0,
  created_at               timestamptz not null default now()
);

-- ---------- Categorias (com subcategorias via parent_id) ----------
create table if not exists public.categorias (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome        text not null,
  parent_id   uuid references public.categorias(id) on delete set null,
  cor         text,
  ativa       boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- Contas (corrente, reserva, benefício) ----------
-- tipo: 'corrente' | 'reserva' | 'beneficio'
-- O saldo é um ponto de partida (calibração). O app soma/subtrai os eventos
-- que acontecem depois de saldo_em (salário, faturas pagas, pix etc).
create table if not exists public.contas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome        text not null,
  tipo        text not null check (tipo in ('corrente','reserva','beneficio')),
  principal   boolean not null default false,
  saldo       numeric(12,2) not null default 0,
  saldo_em    timestamptz not null default now(),
  ativa       boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- Rendas (histórico de salário e benefícios) ----------
-- A linha com a maior vigencia_inicio <= data do pagamento é a que vale.
create table if not exists public.rendas (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  vigencia_inicio  date not null,
  salario          numeric(12,2) not null default 0 check (salario >= 0),
  va               numeric(12,2) not null default 0 check (va >= 0),
  vr               numeric(12,2) not null default 0 check (vr >= 0),
  observacao       text,
  created_at       timestamptz not null default now()
);

-- ---------- Conversões de benefício em dinheiro ----------
-- valor_beneficio = quanto de benefício você converteu (bruto)
-- taxa            = 0.043 para 4,3%
-- valor_liquido   = o que cai em dinheiro, já descontada a taxa
create table if not exists public.conversoes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data            date not null default current_date,
  valor_beneficio numeric(12,2) not null check (valor_beneficio > 0),
  taxa            numeric(6,5) not null default 0.043 check (taxa >= 0 and taxa < 1),
  valor_liquido   numeric(12,2) generated always as (round(valor_beneficio * (1 - taxa), 2)) stored,
  observacao      text,
  created_at      timestamptz not null default now()
);

-- ---------- Lançamentos (gastos) ----------
-- valor     = valor TOTAL da compra
-- parcelas  = 1 para à vista. Em N parcelas, a parcela i cai em (data + i meses).
-- fixo      = true para compromissos que já existiam (parcelamento antigo):
--             o app não os trata como gasto variável do ciclo.
-- Para um parcelamento em andamento, lance: data = data da PRÓXIMA parcela,
-- parcelas = quantas faltam, valor = parcela × faltam, fixo = true.
create table if not exists public.lancamentos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data          date not null default current_date,
  descricao     text,
  valor         numeric(12,2) not null check (valor > 0),
  meio          text not null check (meio in ('cartao','pix','beneficio','debito')),
  cartao_id     uuid references public.cartoes(id) on delete restrict,
  categoria_id  uuid references public.categorias(id) on delete set null,
  parcelas      int not null default 1 check (parcelas >= 1 and parcelas <= 60),
  fixo          boolean not null default false,
  created_at    timestamptz not null default now(),
  constraint cartao_obrigatorio check (meio <> 'cartao' or cartao_id is not null)
);
create index if not exists lancamentos_user_data_idx on public.lancamentos (user_id, data);

-- ---------- Recorrentes (assinaturas e contas mensais) ----------
-- modo 'dia_fixo'       : cai todo mês no dia indicado (ex.: assinatura)
-- modo 'estimado_ciclo' : uma estimativa por ciclo, abatida pelos lançamentos
--                         da mesma categoria (ex.: ônibus, cabelo, gás)
create table if not exists public.recorrentes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  descricao     text not null,
  valor         numeric(12,2) not null check (valor >= 0),
  modo          text not null default 'dia_fixo' check (modo in ('dia_fixo','estimado_ciclo')),
  dia           int check (dia between 1 and 31),
  meio          text not null check (meio in ('cartao','pix','beneficio','debito')),
  cartao_id     uuid references public.cartoes(id) on delete restrict,
  categoria_id  uuid references public.categorias(id) on delete set null,
  inicio        date,
  fim           date,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint dia_obrigatorio check (modo <> 'dia_fixo' or dia is not null),
  constraint cartao_obrigatorio_rec check (meio <> 'cartao' or cartao_id is not null)
);

-- ---------- Configurações (uma linha por usuário) ----------
create table if not exists public.config (
  user_id                 uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  taxa_conversao          numeric(6,5) not null default 0.043,
  conversao_planejada     numeric(12,2) not null default 0,   -- benefício que pretende converter por ciclo
  meta_investimento       numeric(12,2) not null default 1500,
  reserva_minima          numeric(12,2) not null default 600,
  reserva_ideal           numeric(12,2) not null default 1000,
  -- datas de pagamento que você ajustou à mão: {"2026-12": "2026-12-30"}
  pagamentos_override     jsonb not null default '{}'::jsonb,
  atualizado_em           timestamptz not null default now()
);

-- =====================================================================
-- Segurança: RLS em todas as tabelas
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['cartoes','categorias','contas','rendas','conversoes',
                           'lancamentos','recorrentes','config']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "dono_total" on public.%I', t);
    execute format(
      'create policy "dono_total" on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
    -- visitantes sem login não acessam nada
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
