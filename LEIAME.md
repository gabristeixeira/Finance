# Controle financeiro

App para registrar gastos em poucos toques e enxergar, **durante o mês**, quanto vai sobrar no dia do pagamento, qual cartão está apertando e como estão as faturas futuras.

- Abre no iPhone como um app (ícone na Tela de Início).
- Os dados ficam no **Supabase** (banco na nuvem, grátis). O que você lança hoje continua lá em 03/11, com o app fechado, e aparece também no computador.
- Tudo é editável **dentro do app**: cartões, categorias e subcategorias, assinaturas, salário, benefícios, taxa de conversão, metas e datas de pagamento.

## O que tem na pasta

| Arquivo | Para que serve |
|---|---|
| `supabase/schema.sql` | Cria as tabelas do banco (você cola uma vez no Supabase). |
| `js/config.js` | Você cola aqui a URL e a chave do seu projeto Supabase. |
| `js/logic.js` | **As regras de cálculo** (ciclos, faturas, limites, projeção, benefício). |
| `js/telas.js` | As telas: Hoje, Cartões, Extrato, Ajustes. |
| `js/folhas.js` | Os formulários (lançar gasto, converter benefício, cadastros). |
| `js/db.js` | A conversa com o banco. |
| `tests/logic.test.mjs` | Testes das regras de cálculo (`npm test`). |
| `dados-iniciais.exemplo.json` | Modelo (fictício) do arquivo de carga inicial. |

O arquivo com os **seus** dados (`dados-iniciais.json`) fica fora desta pasta de propósito: o código publicado na internet não carrega salário nem limites.

## Passo a passo

### 1. Banco de dados (Supabase)
1. Crie uma conta em supabase.com e clique em **New project**. Anote a senha do banco e escolha a região mais próxima (South America).
2. Quando o projeto terminar de subir, abra **SQL Editor → New query**, cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**. Pode rodar de novo sem problema.
3. Abra **Project Settings → API** e copie a **Project URL** e a chave pública (aparece como `anon` ou `publishable`).
4. Abra `js/config.js` e cole os dois valores. Essa chave é pública por desenho: quem protege seus dados é o login e as regras do `schema.sql`.

### 2. Publicar o app (grátis)
O app é só uma pasta de arquivos; qualquer hospedagem de site estático serve.

- **GitHub Pages:** crie um repositório **público**, envie os arquivos desta pasta e ative em *Settings → Pages* (branch `main`, pasta raiz). Na conta gratuita o Pages só funciona com repositório público; como o código não tem dados seus, isso não expõe nada.
- **Alternativas:** Cloudflare Pages e Netlify também têm plano gratuito para sites estáticos, com envio da pasta direto pelo navegador. Confira na tela de cada serviço como fazer o envio.

Em qualquer opção, o endereço final começa com `https://`, que é o necessário para instalar no iPhone.

### 3. Criar seu acesso
Abra o endereço do app, toque em **Criar conta** e use e-mail e senha forte. Se o Supabase pedir confirmação, confirme pelo e-mail que ele enviar e entre.

Depois de criar a sua conta, impeça que outras pessoas criem a delas: no painel do Supabase, em **Authentication**, procure a opção **Allow new users to sign up** e desligue. O nome e o lugar exato podem mudar com o tempo.

### 4. Carga inicial (uma vez, pelo computador)
Na tela **Hoje**, toque em **Carregar meus dados**, escolha o arquivo `dados-iniciais.json` e informe quatro números de agora: saldo da conta corrente, saldo de benefício, saldo do cofrinho e quanto você costuma converter de benefício por ciclo. O app cria cartões, assinaturas, gastos fixos, salário, benefícios e o parcelamento de jiu-jitsu.

### 5. Instalar no iPhone
No Safari, abra o endereço do app → botão **Compartilhar** → **Adicionar à Tela de Início**. O app instalado pode pedir o login uma vez.

## Como o app pensa

- **Ciclo:** vai do dia do pagamento (último dia útil, com feriados bancários) até o próximo. Tudo que bate nos cartões dentro do ciclo é quitado no pagamento seguinte. O dia de fechamento do cartão fica só como informação. Se a empresa pagar em outra data, ajuste em **Ajustes → Datas de pagamento**.
- **Lançar gasto:** valor, como pagou (cartão, Pix, débito, benefício), cartão, categoria, parcelas. Compra parcelada gera uma parcela por mês, cada uma no ciclo certo.
- **Parcelamento que já estava em andamento:** em *Mais opções* do lançamento, informe o valor de cada parcela, quantas faltam e em qual pagamento a próxima será quitada.
- **Limite do cartão:** o que já bateu no cartão **mais** todas as parcelas futuras (parcelas bloqueiam limite).
- **Fatura projetada do ciclo:** assinaturas e parcelas já conhecidas **mais** o seu gasto variável: o maior entre o que você já lançou e o "gasto variável estimado" do cartão.
- **Gastos "por estimativa" (ônibus, cabelo, gás):** uma estimativa por ciclo; o que você lança na mesma categoria vai abatendo.
- **Salário e benefícios:** o histórico fica em *Ajustes → Salário e benefícios*. Quando algo mudar, use **Registrar mudança**: a renda nova vale a partir da data escolhida.
- **Converter benefício:** a calculadora mostra, ao vivo, as três visões: **salário**, **transformado em dinheiro** (já sem a taxa) e **ainda em benefício**. A taxa pode ser diferente a cada conversão, inclusive 0%. Gastos pagos com benefício abatem do benefício, não do dinheiro.
- **Saldo da conta:** o app parte do saldo que você informou e soma salário e conversões, subtrai Pix, débito e faturas pagas. Se ele se afastar do banco (gasto não lançado, por exemplo), use **Acertar saldo da conta** na tela Hoje.

## Pontos de atenção

- **Sem internet:** o app abre e mostra os últimos dados, mas só grava com internet.
- **Supabase gratuito:** o projeto é pausado após 1 semana sem uso. Basta reativar pelo painel. Usando o app toda semana, isso não acontece. O plano gratuito tem 500 MB de banco, muito além do necessário.
- **Backup:** *Ajustes → Exportar backup (JSON)* baixa tudo em um arquivo.
- **Estimativas:** as projeções são tão boas quanto os lançamentos e as estimativas por cartão. Ajuste o "gasto variável estimado" de cada cartão em *Ajustes → Cartões*.
- **31/12:** bancos não abrem; o app trata o último dia útil de dezembro como 30/12.

## Para alterar o app depois

- Regra de cálculo nova (um alerta, uma projeção diferente): `js/logic.js`, e rode `npm test` para conferir.
- Tela ou texto: `js/telas.js` e `styles.css`.
- Novo tipo de cadastro: acrescente uma entrada em `ENT`, em `js/folhas.js`, e uma tabela em `supabase/schema.sql`.
- **A cada publicação**, aumente `VERSAO` em `sw.js` (por exemplo `cf-v2`) para os aparelhos pegarem a versão nova.
