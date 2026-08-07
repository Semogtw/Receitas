# Estratégia de Testes

> Política técnica para verificar o Receitas sem depender de serviços pagos. O objetivo é cobrir invariantes de domínio, comportamento local-first, segurança, sincronização e experiência real no navegador.

## 1. Stack escolhida

Ferramentas principais, todas gratuitas/open-source:

- **Vitest 4** para testes unitários e de integração em TypeScript;
- **Testing Library** para componentes React quando o teste for melhor expresso pelo comportamento observável do usuário;
- **Playwright 1.61** para E2E e validação cross-browser;
- capacidades de navegador do @Build Web Apps para QA visual/interativo quando disponíveis;
- testes SQL/RLS e ferramentas do Supabase para invariantes do backend;
- Codex Security para auditorias estáticas quando a implementação atingir superfícies sensíveis.

Versões exatas devem ser verificadas via Context7 antes de instalação/upgrade.

## 2. Pirâmide prática

Não perseguir cobertura por quantidade de testes.

Prioridade:

1. **domínio puro e transformações** — muitos testes rápidos;
2. **persistência/local-first/sync** — integração suficiente para provar invariantes;
3. **componentes e fluxos críticos** — comportamento real;
4. **E2E** — poucos fluxos completos de alto valor;
5. **QA visual/manual automatizado** — superfícies onde layout e PWA importam.

## 3. Vitest

Usar Vitest por integração natural com Vite/TypeScript.

Cobertura padrão:

- provider `v8`;
- relatórios de texto e LCOV/HTML quando úteis;
- thresholds devem ser introduzidos gradualmente e por risco, não como meta arbitrária de 100%;
- código crítico de domínio e segurança deve ter cobertura mais forte que wrappers e UI trivial.

Testar especialmente:

- parsing/normalização de ingredientes;
- redimensionamento de porções;
- conversões de unidade;
- consolidação da lista de compras;
- cálculo de médias/agregados;
- filtros/ordenação;
- regras de conflitos/merge seguro;
- serialização e validação de backup;
- estados e transições do modo cozinha;
- idempotência de finalização de preparo;
- sanitização/validação utilitária.

## 4. Componentes React

Testar comportamento observável, não detalhes internos frágeis.

Preferir consultas por:

- role;
- label;
- texto acessível;
- estado visível.

Evitar testes que dependam excessivamente de:

- classe CSS interna;
- estrutura DOM incidental;
- nome de função privada;
- número exato de renders sem razão de performance comprovada.

Componentes críticos incluem:

- editor de receita;
- lista de ingredientes/etapas ordenáveis;
- seletor de porções;
- conversão de unidade;
- filtros;
- lista de compras;
- estados de sync;
- resolução de conflito;
- modo cozinha/timers;
- fluxos de upload/download.

## 5. Playwright

Usar Playwright para fluxos completos e comportamento do navegador.

Matriz mínima quando aplicável:

- Chromium desktop;
- WebKit desktop;
- viewport/mobile Safari emulado por device profile;
- Chromium mobile quando um problema for específico de Android/Chrome.

Como iOS real não pode ser completamente reproduzido sem hardware/serviços Apple, WebKit + perfil iPhone é um gate automatizado forte, mas limitações específicas de PWA instalada/iOS devem ser verificadas em dispositivo real durante uso quando possível.

## 6. Cenários offline

Playwright suporta emulação de `offline`, e isso deve ser usado para validar:

- abrir dados previamente disponíveis;
- editar receita offline;
- criar item/lista offline;
- planejar refeição offline;
- iniciar/continuar modo cozinha offline;
- finalizar preparo offline;
- manter upload pendente sem perder arquivo;
- mostrar estado de sync correto;
- voltar online e drenar filas;
- evitar duplicação após retry.

Testes offline não devem apenas checar `navigator.onLine`; devem provar que o comportamento de produto continua correto.

## 7. Sincronização e concorrência

Cenários obrigatórios:

- dois clientes alteram campos independentes e auto-merge é seguro;
- dois clientes alteram o mesmo campo e conflito é criado;
- edição concorre com exclusão;
- duas avaliações pessoais do mesmo preparo sincronizam sem conflito entre si;
- reorder concorrente incompatível preserva versões;
- retries não duplicam mutação;
- reconexão após longa indisponibilidade não perde fila local;
- mídia e metadados falham/retry separadamente.

## 8. Segurança

Cobrir pelo menos:

- RLS negando usuário fora do `pair`;
- limite de dois membros;
- bootstrap consumido não reabre;
- convite one-time/expirado;
- recuperação de senha não cria identidade;
- e-mail não verificado não recebe acesso pleno;
- segredos ausentes do bundle;
- Storage privado;
- SSRF/importação por URL;
- validação de ZIP/zip-slip/zip-bomb;
- ações privilegiadas somente no servidor;
- logout/isolamento local sem vazamento de sessão.

Mudanças relevantes em Auth, RLS, importação, backup, Storage ou Edge Functions devem considerar Codex Security além dos testes funcionais.

## 9. Backup e restauração

Testar:

- round-trip export → restore;
- backup vazio/parcial compatível;
- manifesto inválido;
- versão incompatível;
- checksum/arquivo ausente quando aplicável;
- path traversal;
- ZIP bomb/limites;
- modo Mesclar;
- conflitos durante Mesclar;
- Substituir tudo só depois de backup de segurança válido;
- falha antes de commit não deixa restauração parcial;
- identidades/autorização não são importadas como usuários novos.

## 10. Timers

Timers devem ser testados com relógio controlado quando possível.

Cobrir:

- start/pause/resume/cancel;
- múltiplos timers;
- deadline/timestamp em vez de depender só de decremento em memória;
- reload/recuperação;
- timer já expirado ao reabrir;
- ajuste manual;
- ausência de mutação da receita;
- comportamento degradado quando notificação/background não estiver disponível.

## 11. Importação

Usar fixtures HTML/JSON-LD locais nos testes; não depender de sites externos no CI.

Cobrir:

- JSON-LD válido;
- múltiplos blocos JSON-LD;
- HTML fallback;
- extração parcial;
- fonte malformada;
- redirects e URL validation em testes apropriados;
- conteúdo grande demais;
- content type incorreto;
- sanitização;
- revisão obrigatória antes de criar receita canônica.

## 12. PWA e service worker

Validar:

- manifest acessível e coerente;
- assets essenciais disponíveis offline após instalação/cache esperado;
- atualização de service worker não perde mutações locais;
- versão antiga/nova não mistura schema incompatível sem migração;
- cache não inclui conteúdo privado indiscriminadamente;
- update prompt/offline-ready segue a UX escolhida;
- deep links/rotas SPA funcionam no host estático.

## 13. Acessibilidade

Automação ajuda, mas não substitui revisão real.

Checks:

- roles/labels;
- foco visível;
- ordem de teclado;
- dialogs/sheets com gerenciamento de foco;
- target de toque;
- contraste;
- informação não depende só de cor;
- reduced motion;
- zoom/font scaling quando aplicável.

## 14. QA visual

Toda mudança visual não trivial deve ser verificada renderizada.

Quando @Build Web Apps/Browser estiver disponível:

- testar fluxo alvo;
- desktop + mobile;
- tema claro + escuro quando relevante;
- screenshots de evidência;
- console sem erro relevante;
- revisar overflow, clipping, teclado virtual, safe areas, loading/empty/error/offline.

Playwright é fallback/automação complementar, não justificativa para ignorar inspeção visual.

## 15. CI gratuito

Priorizar GitHub Actions somente para gates automáticos úteis e dentro da cota gratuita disponível ao repositório/conta.

Como o projeto é pessoal e o fluxo já permite testes locais/agênticos, CI não deve virar dependência cara ou motivo para bloquear desenvolvimento.

Gates recomendados quando a base estiver implementada:

```text
lint/typecheck
   ↓
Vitest
   ↓
build
   ↓
Playwright smoke crítico
```

Testes E2E mais pesados podem ser executados localmente ou em momentos específicos se custo/cota do CI se tornar relevante.

## 16. Regra de conclusão

Uma feature não está concluída apenas porque compila.

Ela precisa demonstrar, conforme o risco:

- invariantes unitárias;
- persistência correta;
- comportamento offline;
- sync/retry;
- autorização;
- interação real;
- layout responsivo;
- ausência de regressão conhecida.

Se um gate não puder ser executado no ambiente atual, documentar claramente a limitação e continuar com os demais gates possíveis em vez de tratar isso como barreira intransponível.

## 17. Fontes técnicas verificadas

Context7 consultado em 2026-08-07:

- Vitest `/vitest-dev/vitest/v4.1.6`: configuração Vite-native, coverage V8 e thresholds;
- Playwright `/microsoft/playwright/v1.61.0`: projetos Chromium/Firefox/WebKit, profiles de iPhone/Pixel e modo offline.

Como versões mudam, consultar Context7 novamente antes de upgrades ou quando uma API/configuração estiver em dúvida.
