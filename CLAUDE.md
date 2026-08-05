# Instruções do projeto

## Testes — nunca rodar testes ao vivo/interativos

Depois de fazer uma mudança de código, **não** faça nenhum teste ao vivo por conta própria:

- Não suba o app pra testar manualmente (`ng serve`, `docker compose up --build`, restart de containers só pra testar, etc.).
- Não use navegador automatizado (Playwright/Chromium ou similar) pra clicar em telas, preencher formulários ou tirar screenshot "pra confirmar que funciona".
- Não chame APIs externas reais (ex: Gemini) — mesmo que pareça inofensivo, cotas grátis são curtas e se esgotam rápido.
- Não crie, edite ou apague dados reais via API "só pra testar o fluxo", mesmo revertendo depois.

O que **continua permitido e esperado** depois de cada mudança:

- Rodar `tsc --noEmit` e `ng build` (frontend) — isso só verifica sintaxe/tipos, não executa nada.
- Rodar `dotnet build` (backend) pela mesma razão.

Faça a correção, garanta que compila, explique o que mudou e pare por aí. **Quem testa manualmente, ao vivo, é o usuário** — não tente antecipar isso rodando o app ou a API você mesmo.

**Motivo**: uma sessão anterior esgotou a cota diária grátis da API do Gemini (44 requisições, maioria de testes automatizados repetidos em loop) e chegou a criar/editar/apagar transações reais do usuário durante testes — mesmo revertendo depois, é um risco desnecessário.
