# Plano de Sprints — Refatoração de UX

Registro do planejamento definido em sessão de conversa (não codar nada a partir daqui até
o próximo sprint ser explicitamente iniciado). Método de trabalho: um sprint por vez —
desenvolve, o usuário testa manualmente (ver regra de "nunca testar ao vivo" no
`CLAUDE.md`), valida, só então avança pro próximo. Se algo não ficar de acordo, continua
iterando no mesmo sprint antes de seguir.

Cada sprint abaixo tem: o que fazer, onde mexer (arquivos/componentes já existentes
relevantes) e o que validar antes de considerar concluído.

---

## ✅ Sprint 1 — Componentizar a tabela de transações (base: Fatura do Cartão)

A visualização agrupada por dia que já existe em `credit-card-invoice.html` (barra
separadora com a data completa por extenso, ex: "Quinta, 18 de jun", ícone da categoria no
lugar da coluna Data, sempre expandida/sem colapsar) funciona bem e vira a base de dois
componentes reutilizáveis.

### ✅ 1.1 Extrair o componente de fatura de cartão

Pegar a tabela que já existe em `credit-card-invoice.ts`/`.html` (incluindo
`invoiceDayGroups`, `formatDayHeader`, o `<ng-template #itemRow>`, o botão de ordenar por
data) e extrair pra um componente próprio em `shared/ui-components/` (ex:
`card-invoice-table`). `CreditCardInvoice` passa a só orquestrar dados (fetch, fatura
atual, pagar/reverter) e usar esse componente pra exibição.

### ✅ 1.2 Criar o componente geral de transações (duplicar e adaptar)

A partir do componente acima, criar um segundo (ex: `transaction-table`) pra usar em
"Transações do Mês" (`transaction-list.ts`/`.html`), com colunas a mais:

- Mesmo agrupamento por dia (barra separadora, sempre expandido, **sem** opção de
  colapsar/expandir).
- Ícone da categoria **antes** da descrição (mesmo estilo do cartão), mas — diferente do
  cartão — mantém o **nome** da categoria como coluna própria ao lado (só o ícone sai da
  coluna Categoria, o texto continua).
- Colunas: ícone + Descrição | Categoria (nome) | Conta | Status | Valor | ações.
- Continua mostrando `(fixa)` / `(N/M)` do jeito que já mostra hoje.

### ✅ 1.3 Botões Pagar/Receber viram ícone

Trocar os botões de texto ("PAGAR"/"RECEBER") por ícone só — check verde pra Receber, algo
vermelho (ex: um ícone de pagamento) pra Pagar. Objetivo: tamanho fixo e padronizado
(ícone é sempre do mesmo tamanho, texto variava). Mantém os comportamentos diferentes de
cada um (abre o modal de confirmação já existente).

### Validar antes de avançar

- Fatura do Cartão continua idêntica visualmente (só migrou de lugar).
- Transações do Mês passa a agrupar por dia, sem coluna Data solta, ícone antes da
  descrição, categoria com nome visível, botões de ação em ícone.

---

## ✅ Sprint 2 — Linha do Tempo Diária mais compacta

Hoje a tabela lista todo dia do mês, mesmo sem nenhuma transação — ocupa espaço à toa.
Novo comportamento:

### ✅ 2.1 Dias passados

Continuam escondidos por padrão (já existe), mas precisa ganhar uma forma de **esconder de
novo** depois de expandido (hoje só expande, não tem toggle pra fechar de volta).

### ✅ 2.2 Dia de hoje

Sempre visível.

### ✅ 2.3 Dias futuros

Ficam todos escondidos por padrão, **exceto o último dia do mês** (pra dar a noção de "o
mês termina com este saldo"). Ganha uma opção de expandir pra ver os dias futuros
intermediários.

### ✅ 2.4 Ao expandir os dias futuros: colapsar faixas sem movimento

Dias consecutivos sem nenhuma receita/despesa viram **uma linha só**, tipo "21 a 30" com
Receitas R$ 0,00 / Despesas R$ 0,00. Se depois for lançada uma transação num dia dentro
dessa faixa (ex: dia 25), a faixa se **quebra em três**: "21 a 24" (zero/zero) — "25/08"
(a transação de verdade, expandida) — "26 a 30" (zero/zero). Ou seja, a faixa recalcula
dinamicamente em torno de qualquer dia com movimento real.

### Validar antes de avançar

- No mês corrente: dias passados colapsados (com opção de reabrir E refechar), hoje
  sempre visível, dias futuros escondidos com só o último dia do mês aparecendo, opção de
  expandir os do meio.
- Ao expandir, faixas sem movimento aparecem compactadas; um dia com transação real
  sempre quebra a faixa em volta dele.

---

## ✅ Sprint 3 — Dashboard: Resumo do Mês mais completo

Nos cards de Receitas/Despesas do "Resumo do Mês", detalhar mais o total:

- **Receitas**: total do mês + quanto disso ainda está **pendente** (não recebido ainda).
- **Despesas**: total do mês + quanto já foi **pago** + quanto ainda está **pendente**.

(Descartada a ideia inicial de adicionar mais dois cards na seção "Saldo Atual" —
o usuário reconsiderou durante a conversa: essa melhoria é só no Resumo do Mês mesmo.)

### Validar antes de avançar

Os dois cards (Receitas/Despesas) mostram o detalhamento pago/pendente sem quebrar o
layout ou a expansão por categoria que já existe.

---

## ✅ Sprint 4 — Transações do Mês: abas Despesa/Receita

Mesma UX de abas que `category-list` já tem (Despesa / Receita). Aplicar em
`transaction-list` — usando o componente novo do Sprint 1 — permitindo ver tudo misturado
(estado padrão) ou filtrar só por um tipo.

### Validar antes de avançar

Trocar de aba filtra a tabela corretamente, mantendo o agrupamento por dia dentro do
filtro.

---

## Sprint 5 — Sidebar + Dark Mode (sprint grande, quebrar se precisar)

### 5.1 Sidebar substitui a navbar de topo

Tira a nav horizontal atual (`app.html`) e troca por uma **sidebar** lateral,
expansível/colapsável, contendo: os links de navegação (Transações, Categorias, Contas,
Cartões — Dashboard também) e o botão "+" de novo lançamento (o dropdown que hoje mora no
header).

### 5.2 Seletor de mês fica fixo, compartilhado entre todas as páginas

Um "select" grande, só do mês, num topbar fino que continua existindo (fora da sidebar),
compartilhado por todas as telas — é basicamente o `MonthSelectionService` que já existe
hoje, só precisa de um novo lugar fixo pra morar na tela (a lógica de estado não muda).

### 5.3 Dark mode + cor de destaque

Ícone de pincel no rodapé da sidebar, alinhado ao fundo — abre um modal de estilização
com:

- Toggle Claro/Escuro.
- Seletor de "cor de destaque" — ainda sem uso definido no app (o usuário vai indicar,
  telinha por telinha, onde aplicar essa cor conforme for surgindo a necessidade).

**Pendências técnicas a decidir na hora de implementar:**

- Onde persistir a preferência de tema/cor — não existe conceito de usuário/login no
  backend hoje, então o candidato natural é `localStorage` (mesmo padrão já usado pra
  preferência de dívidas excluídas no Dashboard), não uma tabela nova no banco.
- Dark mode provavelmente exige revisar as classes Tailwind espalhadas pelo app (hoje
  hardcoded pra tema claro: `bg-white`, `text-gray-800` etc.) — avaliar se compensa
  `dark:` variants do Tailwind ou uma abordagem de CSS variables.

### Validar antes de avançar

- Navegação inteira funciona pela sidebar, sem a navbar antiga.
- Seletor de mês no topo funciona em todas as páginas exatamente como funciona hoje.
- Dark mode alterna visualmente sem quebrar contraste/legibilidade nas telas principais.

---

## Sprint 6 — Deploy pra produção (Railway + Vercel) — a última, depois de tudo validado

Esse sprint é diferente dos outros: não é sobre criar telas novas, é sobre colocar o que já
existe pra funcionar na internet de verdade, fora do seu computador. Vou explicar tudo do
jeito mais simples possível, com os termos técnicos explicados na hora que aparecem.

### Visão geral — o que vai morar em cada lugar

Hoje, quando você roda `docker compose up`, três "caixinhas" (containers) sobem juntas no
seu computador: o site (frontend), a API (o "cérebro" que conversa com o banco) e o banco
de dados. Elas conseguem se achar porque estão todas na mesma rede interna do Docker.

Quando for pra produção, cada uma dessas três caixinhas vai morar num lugar diferente, na
internet, e vai precisar do **endereço público** das outras pra conseguir conversar:

| Peça                      | Onde mora   | O que é                                                   |
| ------------------------- | ----------- | --------------------------------------------------------- |
| Frontend (Angular)        | **Vercel**  | O site que você abre no navegador                         |
| API (.NET)                | **Railway** | O "cérebro" que recebe pedidos do site e fala com o banco |
| Banco de dados (Postgres) | **Railway** | Onde os dados de verdade ficam guardados                  |

Por que Vercel pro site e Railway pra API+banco, em vez de tudo num lugar só? Vercel é
feito sob medida (e de graça, na prática) pra sites como o seu (só arquivos estáticos,
sem nada rodando o tempo todo); Railway é feito pra coisas que precisam ficar "ligadas"
continuamente (a API e o banco). É a combinação mais comum pra esse tipo de projeto.

### O que já investiguei no código (bom saber antes de começar)

- A API já tem um "Dockerfile" de produção pronto (diferente do de desenvolvimento que
  você usa hoje) — ótimo, não precisa criar do zero.
- Hoje a API só aceita pedidos vindos de `localhost` (do seu computador). Isso é uma trava
  de segurança chamada **CORS** — pensa nela como "uma lista de convidados": só quem tá na
  lista pode pedir informação pra API. Vamos precisar **adicionar o endereço do Vercel**
  nessa lista antes do site funcionar de verdade em produção.
- O site, hoje, quando compilado pra "produção", pede os dados em `/api` (um endereço
  relativo, sem dizer o domínio) — isso só funciona porque, localmente, tem um "porteiro"
  (nginx) redirecionando `/api` pra API. Na Vercel esse porteiro não existe, então o site
  vai precisar saber o **endereço completo** da API no Railway (ex:
  `https://true-balance-api.up.railway.app/api`).
- As tabelas do banco são criadas por "migrações" (`dotnet ef database update`) — comandos
  que criam as tabelas certinhas, na ordem certa. Hoje isso é manual (você/eu rodamos na
  mão). Um banco novo no Railway nasce **vazio** — vai precisar rodar essas migrações nele
  também, e trazer os dados que você já tem.

### Passo a passo

**1. Banco de dados primeiro (Railway)**

- Criar um banco Postgres no Railway (alguns cliques no site deles: "New Project" →
  "Provision PostgreSQL"). Ele te dá um "endereço de conexão" pronto (parecido com o
  que já existe no `docker-compose.yml`, só que apontando pro servidor deles, não pro
  seu computador).
- Esse banco nasce vazio. Tem duas partes pra preencher ele:
  1.  Rodar as migrações nele, pra criar as tabelas.
  2.  **Copiar os dados que você já tem** do banco local pro banco novo — existe uma
      ferramenta padrão do Postgres pra isso (`pg_dump`/`pg_restore`, resumindo: "tira
      uma foto de tudo que tem no banco de hoje" e "cola essa foto no banco novo"). Vou
      te guiar nisso quando chegar a hora — é o passo mais delicado, porque envolve seus
      dados reais, então vamos com calma e conferindo cada etapa.

**2. API (Railway)**

- Conectar o repositório do GitHub no Railway, apontando pra pasta certa
  (`src/TrueBalance.Api`), usando o Dockerfile de produção que já existe.
- Configurar lá (pelo painel do Railway, sem mexer em código) essas informações
  sensíveis, chamadas de **variáveis de ambiente** — pensa nelas como "post-its" que só
  aquele servidor consegue ler, nunca ficam expostos no código:
  - O endereço de conexão do banco (do passo 1).
  - Sua chave da API do Gemini (a mesma que já existe no `.env` hoje).
- Fazer a mudança de código pra liberar o CORS pro endereço do Vercel (ver acima).
- No final desse passo, o Railway te dá um endereço público pra API (algo tipo
  `https://true-balance-api-production.up.railway.app`).

**3. Frontend (Vercel)**

- Conectar o mesmo repositório do GitHub na Vercel, apontando a "pasta raiz" pra
  `true-balance-ui`. A Vercel já sabe reconhecer projetos Angular sozinha.
- Ajustar o endereço da API que o site usa (trocar o `/api` relativo pelo endereço
  completo do Railway, do passo 2).
- No final, a Vercel te dá um endereço público pro site (algo tipo
  `https://true-balance.vercel.app`, ou um domínio seu, se você tiver um).

**4. Ligando as pontas**

- Depois que os três passos acima estiverem prontos, ainda falta: colocar o endereço
  da Vercel na lista de convidados (CORS) da API, e colocar o endereço da API no site —
  ou seja, os passos 2 e 3 dependem um do outro, então normalmente se faz um ajuste
  final depois que os dois já têm endereço público.

### Sobre acessar o banco depois (sua pergunta)

Boa pergunta, e faz todo sentido você ter reparado nisso: hoje, quando eu consulto o banco
(pra investigar um bug, por exemplo), eu tô rodando comandos **direto no container Docker
que roda no SEU computador** — é só possível porque ele tá bem ali, do lado, no seu
terminal. Você realmente não precisou (nem precisa hoje) de nenhum programa tipo DBeaver
porque eu consigo entrar nesse container diretamente.

Depois do deploy, o banco não vai mais estar no seu computador — vai estar num servidor do
Railway. Esse acesso direto que eu uso hoje deixa de existir do jeito que é agora. Suas
opções, quando isso acontecer:

1. **Painel do próprio Railway**: eles têm uma aba de "Data" no site deles onde dá pra ver
   as tabelas e rodar consultas simples, sem instalar nada — bom pra espiadas rápidas.
2. **Um programa de banco de dados** (ex: TablePlus, DBeaver, Postico — tem opções
   gratuitas) instalado no seu computador, conectando com o endereço que o Railway te dá —
   melhor se você quiser explorar/mexer com mais calma e conforto.
3. **Continuar me pedindo pra consultar** — só que aí eu precisaria receber o endereço de
   conexão do banco de PRODUÇÃO (com dados financeiros reais de verdade, não mais um banco
   de teste local). Isso é uma decisão maior de confiança do que me deixar mexer num banco
   local — recomendo reservar isso só pra quando for realmente necessário, e preferir as
   opções 1 ou 2 pro dia a dia.

### Sobre custo

Railway e Vercel têm planos gratuitos, mas um banco + API que ficam "ligados" o tempo
todo, depois de um tempo de uso, normalmente passam a custar um valor pequeno por mês no
Railway (a Vercel, pro tamanho do seu site, costuma continuar de graça). Os valores exatos
mudam com frequência — vale olhar direto no site de cada um antes de decidir, não vou
travar isso aqui num número que pode estar desatualizado quando você for ler.

### Bônus opcional: deploy automático

Tanto Railway quanto Vercel conseguem, uma vez conectados no GitHub, **atualizar sozinhos**
toda vez que você (ou eu) subir uma mudança pro branch principal — sem precisar de nenhuma
configuração extra de "esteira" (CI/CD). Pra um projeto desse tamanho, isso já basta; não
precisa de nada mais sofisticado por enquanto.

### Validar antes de considerar concluído

- Site abre no endereço público da Vercel, carrega normalmente.
- Todas as telas conseguem buscar/salvar dados de verdade através da API no Railway (sem
  erro de CORS no console do navegador).
- Os dados que já existiam no banco local aparecem certinhos no banco de produção (contas,
  categorias, transações, cartões — tudo).
- Lançar uma nova despesa/receita de teste em produção funciona ponta a ponta.
