# Deploy e Operação

> Política técnica para hospedar e operar o Receitas com **custo recorrente obrigatório de US$ 0**, preservando local-first, privacidade, segurança e manutenção simples.

## 1. Princípio de custo

O projeto deve permanecer utilizável sem assinatura paga obrigatória.

Regras:

- nenhuma dependência essencial pode exigir plano pago para o uso normal de duas pessoas;
- não adotar serviços com cobrança automática por excedente como requisito do produto;
- se um serviço gratuito deixar de atender o projeto, preferir migração para outra opção gratuita compatível antes de aceitar custo recorrente;
- não usar hacks de keep-alive ou tráfego artificial apenas para contornar políticas de inatividade de provedores;
- decisões puramente técnicas de infraestrutura podem ser ajustadas durante implementação quando uma alternativa gratuita claramente superior aparecer, desde que as invariantes de produto e segurança sejam preservadas e a documentação seja atualizada.

## 2. Stack de hospedagem escolhida

### Frontend/PWA — Cloudflare Pages Free

Escolha padrão para publicar os assets estáticos do React + Vite.

Motivos:

- custo US$ 0;
- requests de assets estáticos não geram cobrança no plano gratuito;
- CDN global adequada a uma PWA;
- 500 builds por mês no plano gratuito, muito acima da necessidade deste projeto;
- suporte a headers e redirects úteis para CSP, SPA e segurança;
- reduz a necessidade de executar código servidor no provedor do frontend, já que operações privilegiadas permanecem no Supabase.

Limites atuais relevantes da documentação oficial consultada em 2026-08-10:

- 500 builds/mês;
- um build simultâneo;
- até 20.000 arquivos por site no plano Free;
- asset individual de até 25 MiB;
- requests estáticos gratuitos e ilimitados;
- até 100 regras em `_headers` e até 2.000 caracteres por header individual.

Esses limites são confortáveis para o Receitas. O audit de release deve continuar rejeitando assets individuais acima de 25 MiB e o gerador de CSP deve permanecer bem abaixo do limite de header do Pages.

### Backend — Supabase Free

Responsabilidades:

- Postgres remoto;
- Supabase Auth;
- Storage privado;
- Edge Functions;
- RLS e autorização remota.

Limites/políticas atuais relevantes consultados em 2026-08-10:

- 500 MB de banco;
- 1 GB de Storage;
- 50.000 MAU;
- 5 GB de egress + 5 GB cached egress;
- até dois projetos ativos Free por conta/organizações em que o usuário é Owner/Admin;
- projetos Free com baixa atividade podem ser pausados após cerca de uma semana;
- projeto pausado pode ser retomado no Dashboard durante uma janela atualmente documentada de até 1 ano; depois disso, a recuperação passa pelo backup disponibilizado e migração para outro projeto.

Para exatamente duas pessoas, os limites de usuários e banco são amplos. O recurso mais provável de exigir atenção ao longo do tempo é Storage de fotos, por isso a aplicação deve comprimir/normalizar mídia de forma sensata e continuar suportando backup/exportação.

### Sincronização — PowerSync Cloud Free

Responsabilidades:

- sincronização local-first entre banco local e Postgres;
- distribuição seletiva dos dados do par;
- suporte à experiência offline já especificada.

Limites/políticas atuais relevantes consultados em 2026-08-10:

- 2 GB de dados sincronizados por mês;
- 500 MB hospedados no PowerSync Service;
- 50 conexões simultâneas de pico;
- até duas instâncias PowerSync Service;
- uma conexão de banco fonte por instância;
- instância Free sem deploys nem conexões de clientes por mais de 7 dias pode ser desprovisionada.

Para duas pessoas, capacidade e concorrência são muito superiores à carga esperada.

## 3. Hibernação/inatividade dos planos gratuitos

Supabase Free e PowerSync Cloud Free podem pausar/desprovisionar infraestrutura após períodos de baixa ou nenhuma atividade.

Isso é aceito como trade-off do requisito de custo zero.

Regras de produto/arquitetura:

- o app não pode depender de disponibilidade contínua do backend para consultar dados já locais;
- mutações feitas enquanto o backend estiver indisponível ficam pendentes localmente;
- a UI informa indisponibilidade/sync pendente sem tratar dados locais como perdidos;
- fotos ainda não confirmadas remotamente permanecem protegidas no dispositivo;
- rascunho ativo de cozinha permanece device-local e deve sobreviver a reload normal;
- após retomada dos serviços, filas de sync/upload devem continuar normalmente;
- não gerar tráfego artificial só para impedir hibernação;
- instruções operacionais de retomada devem ser exercitáveis e versionadas.

Procedimentos:

- Supabase pausado: `docs/runbooks/supabase-resume.md`;
- PowerSync desprovisionado: `docs/runbooks/powersync-redeploy.md`;
- antes de limpar/reinstalar um cliente: `docs/runbooks/incident-data-preservation.md`.

Se a hibernação se tornar problema frequente, reavaliar alternativas gratuitas atuais antes de considerar plano pago.

## 4. Por que não Vercel como primeira escolha

Vercel Hobby continua sendo uma alternativa possível para uso pessoal, mas Cloudflare Pages é preferido aqui por ser uma hospedagem estática simples, com requests de assets estáticos gratuitos/ilimitados documentados e sem necessidade de recursos de framework/serverless específicos da Vercel.

Vercel só deve entrar como fallback se Cloudflare Pages apresentar incompatibilidade real durante implementação/deploy e a alternativa continuar atendendo custo/privacidade/segurança no momento da decisão.

## 5. Por que não self-host por padrão

PowerSync Open Edition pode ser self-hosted, mas isso deslocaria para o projeto a responsabilidade por:

- uptime;
- atualizações;
- segurança do host;
- TLS/rede;
- backups operacionais;
- monitoramento;
- disponibilidade do processo de sync.

Como não existe atualmente uma opção self-host gratuita claramente superior em confiabilidade e manutenção ao PowerSync Cloud Free para este caso, o serviço gerenciado Free é preferido.

Self-host só entra como alternativa se surgir hospedagem gratuita realmente confiável ou se uma limitação do Cloud Free afetar o uso real.

## 6. Domínio

Domínio próprio é opcional e não faz parte do requisito técnico.

Para manter custo estritamente zero, o app pode usar o subdomínio gratuito fornecido pelo provedor de frontend.

Comprar domínio é uma escolha estética/operacional futura, nunca requisito para segurança ou funcionamento.

## 7. Ambientes

Para um projeto pessoal, evitar infraestrutura de ambientes excessiva.

Direção:

- desenvolvimento local;
- previews de branch/PR quando o provedor permitir gratuitamente;
- um ambiente principal de produção;
- banco/backend de desenvolvimento ou staging separado somente se isso puder ser mantido dentro do Free tier sem comprometer produção.

Não duplicar serviços apenas para imitar um pipeline corporativo.

**Trava de segurança desta execução:** o projeto Supabase `fichario-staging` pertence a outro produto e nunca deve receber migrations/functions/configuração do Receitas.

## 8. Deploy do frontend

Pipeline esperado:

```text
GitHub main
   ↓
build React/Vite
   ↓
typecheck + testes/gates aplicáveis
   ↓
Cloudflare Pages
   ↓
PWA publicada
```

Deploy automático do `main` pode ser habilitado quando os testes mínimos estiverem estáveis.

Previews não devem usar segredos administrativos e devem apontar apenas para backend de teste quando seguro.

O build de Pages deve usar:

- Node fixado por `.node-version`;
- pnpm fixado em `packageManager`;
- `pnpm build:pages`;
- output `dist`;
- somente `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `VITE_POWERSYNC_URL` quando necessárias ao browser;
- nenhum Pages Function para o app estático.

## 9. Variáveis e segredos

No frontend:

- somente configuração pública destinada ao navegador;
- nenhum `service_role`;
- nenhum segredo de bootstrap;
- nenhum token administrativo;
- tratar variáveis `VITE_*` como públicas.

No backend/provedor:

- segredos apenas em secret stores/configuração servidor;
- princípio do menor privilégio;
- rotação possível sem rebuild estrutural do app quando razoável.

O release artifact é auditado para markers/valores privilegiados, `.env`, chaves privadas e source maps antes de deploy.

## 10. Headers e superfície Web

O deploy deve configurar, conforme compatibilidade da PWA:

- HTTPS obrigatório;
- Content Security Policy restritiva e testada;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy` restritiva;
- `Permissions-Policy` mínima;
- proteção contra framing;
- `X-Robots-Tag`/metadata para desencorajar indexação do app pessoal;
- caching explícito para assets versionados;
- nenhuma runtime cache arbitrária de respostas privadas no service worker.

`pnpm build:pages` gera `_headers` a partir das origens públicas exatas e audita o artefato. A política final ainda precisa ser verificada no origin real do Cloudflare Pages para garantir que não quebre Auth, Storage, PowerSync ou instalação PWA.

## 11. Operação e recuperação

Runbooks versionados:

- `docs/runbooks/supabase-resume.md` — retomar backend pausado e validar schema/Auth/Storage/Edge/filas;
- `docs/runbooks/powersync-redeploy.md` — reimplantar regras após desprovisionamento e verificar re-sync/isolamento;
- `docs/runbooks/incident-data-preservation.md` — preservar mutações, mídia e cooking draft antes de qualquer limpeza local.

Ainda deve existir/exercitar antes da release final:

- drill completo de backup merge + replace-all + safety backup;
- rotação/revogação de segredo comprometido;
- rollback de frontend e backend com evidência de staging.

## 12. Monitoramento de limites

Não precisa de dashboard corporativo próprio.

Usar inicialmente os painéis gratuitos dos provedores para acompanhar:

- tamanho do Postgres;
- uso de Storage;
- egress;
- dados sincronizados/hosted e pico de conexões no PowerSync;
- erros de Edge Functions;
- estado de deployment.

A aplicação não deve coletar telemetria comportamental só para reproduzir métricas que os provedores já oferecem.

## 13. Plano de migração sem aprisionamento

A arquitetura deve preservar portabilidade:

- dados canônicos em Postgres/Supabase;
- backup aberto em ZIP + JSON + mídias;
- frontend estático independente do host;
- configuração de endpoints isolada;
- cliente local-first não pode depender de APIs proprietárias além da camada de integração necessária.

Se um provedor gratuito mudar suas condições, o objetivo é trocar a camada correspondente, não reescrever o produto inteiro.

## 14. Fontes técnicas verificadas

Situação reconsultada em **2026-08-10**:

- PowerSync pricing: https://powersync.com/pricing
- PowerSync usage/inactive instances: https://docs.powersync.com/resources/usage-and-billing
- Supabase pricing: https://supabase.com/pricing
- Supabase Free project pausing: https://supabase.com/docs/guides/platform/free-project-pausing
- Cloudflare Pages limits: https://developers.cloudflare.com/pages/platform/limits/
- Cloudflare Pages pricing: https://developers.cloudflare.com/pages/functions/pricing/

Como limites e planos mudam, agentes devem consultar documentação atual — preferencialmente via Context7 quando houver documentação da biblioteca e via fonte oficial Web/provedor para pricing/quotas — antes de alterar a arquitetura por causa de um limite.
