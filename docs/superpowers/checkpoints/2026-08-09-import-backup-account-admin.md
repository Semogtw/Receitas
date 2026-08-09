# Checkpoint — import, backup, restore, diagnostics e recuperação de identidade

**Data:** 2026-08-09  
**Branch:** `feat/import-backup-diagnostics`  
**Plano:** `2026-08-07-06-import-backup-diagnostics.md`

## Estado estrutural

As Tasks 1–8 estão estruturalmente implementadas em código. A Task 9 (aceitação E2E) continua em andamento. Nenhum gate ambiental não executado é tratado como sucesso.

### Importação

- parser determinístico de Schema.org Recipe/JSON-LD e texto colado;
- conteúdo parcial preservado para revisão, sem inventar dados;
- URL importada somente via Edge Function autenticada;
- fetch SSRF-resistant: protocolos/credenciais/IPs privados-reservados/DNS/redirects/timeout/tamanho/content-type;
- HTML remoto tratado como dado inerte, nunca renderizado/executado;
- rate-limit persistente servidor;
- revisão manual obrigatória antes do save canônico.

### Backup completo v1

- formato aberto ZIP `receitas-backup` v1;
- manifest com SHA-256 e bytes de cada entrada;
- dados estruturados + mídia original privada;
- fila local precisa estar drenada antes de exportar;
- OPFS-first e fallback Blob limitado;
- metadata legada de foto sem SHA/tamanho é corrigida por mutação semântica e o backup aborta com `backup_requires_sync`; a tentativa seguinte só gera arquivo após sincronização;
- senhas, sessões, tokens e credenciais de provider não entram no formato.

### Restore — preflight e staging

- validação completa local e revalidação independente no servidor;
- limites de arquivo/entrada/compressão/tipos e paths seguros;
- checksums e tamanhos obrigatórios;
- referências de domínio validadas antes do commit;
- foto só é restaurável se metadata e descriptor de mídia coincidirem em MIME/SHA/bytes;
- staging privado em batches limitados; staging nunca é estado canônico.

### Restore — merge

- mídia promovida uma por request e revalidada no staging/destino;
- path final content-addressed (`stable-id + SHA`);
- commit estruturado em uma transação Postgres;
- stable ID ausente -> insert;
- conteúdo equivalente -> no-op;
- mesmo stable ID divergente -> conflito preservado, sem overwrite silencioso;
- colisão cross-pair/natural-key impossível aborta a transação;
- UI exige preflight/staging antes de confirmação separada de mesclagem.

### Restore — replace_all

- backup recebido passa pelo mesmo preflight/staging;
- antes de liberar operação destrutiva, cliente gera um **novo backup completo do estado atual**;
- o mesmo safety ZIP é disponibilizado ao usuário e staged/validado pelo servidor;
- servidor prova linha a linha que safety backup ainda corresponde ao estado canônico atual;
- essa prova é repetida imediatamente antes do commit destrutivo;
- mídia recebida precisa estar integralmente promovida;
- estado ativo atual é soft-deleted para liberar invariantes naturais e o backup é reaplicado em ordem de FK dentro da mesma transação;
- conflitos abertos anteriores ficam resolvidos como superseded pelo replace;
- qualquer erro de constraint/colisão reverte toda a transação;
- UI expõe três passos explícitos: validar recebido -> gerar/validar safety -> substituir.

### Cleanup de restore

- cleanup de staging é oportunístico e bounded;
- falha de cleanup nunca muda um commit canônico bem-sucedido para “falha”;
- DB staging só é removido depois do cleanup de objetos, mantendo metadata para retry em falha parcial;
- mídia promovida só é apagada quando Postgres confirma que não é referenciada por metadata de foto ativa/soft-deleted **nem por conflito aberto**;
- safety jobs vivos não são limpos enquanto ainda protegem um replace.

### Diagnósticos

- store local-only bounded;
- allowlist estrita de contexto técnico;
- tokens/senhas/e-mail/texto da receita/URLs arbitrárias/body/payload/imagem são rejeitados;
- export inclui apenas metadata técnica, build/plataforma, fila de sync e eventos sanitizados;
- modo verbose continua local e sanitizado;
- import, backup, restore e account-admin gravam apenas códigos/métricas coarse best-effort.

### Administração excepcional de identidade

- operação enterrada em Configurações, fora do fluxo normal de convite;
- par precisa continuar `closed`;
- alvo destrutivo é derivado no servidor; browser não escolhe UUID a remover;
- safety backup completo recente e server-proven é obrigatório;
- cliente reautentica com `signInWithPassword`; senha nunca é enviada ao Edge account-admin;
- Edge exige JWT já validado + AMR `password` recente (máximo 5 min); refresh de token não torna AMR antigo recente;
- somente a outra identidade ativa pode ser removida;
- dados/autoria compartilhados não são cascade-deleted;
- substituição usa membership pendente privada reconhecida pelo trigger de capacidade sem reabrir convite normal/signup;
- remoção sem substituição continua recuperável apenas por evidência de ação administrativa privada anterior;
- cancelamento de substituição também preserva recuperabilidade administrativa, sem expor o UUID histórico removido ao browser;
- `/auth/finish-replacement` é resolvido antes do AuthGate, define nova senha e ativa somente a membership administrativa pendente;
- limpeza da conta Auth é best-effort após revogar acesso no DB e fica retriable se provider falhar.

Migrations incrementais desta fatia: `0016`–`0029` (rate-limit, restore staging/finalização, merge/replace/media/cleanup e account-admin recovery).

## Testes escritos

Foram adicionados testes Vitest/Deno/SQL de contrato para:

- parsers e normalização de import;
- safe-fetch/HTML/import orchestration;
- formato/inspector/preflight de backup;
- staging e finalização de restore;
- promoção/commit merge e replace;
- safety ordering no replace;
- mídia foto↔descriptor e cleanup conflict-aware;
- diagnóstico sanitizer/store/export/UI;
- AMR recente do account-admin;
- account-admin service/UI/handler;
- finalização da identidade substituta;
- contrato SQL de permissões/capacidade/recoverability do recovery fechado.

## Gates ainda pendentes — não declarados verdes

- `pnpm lint`;
- `pnpm typecheck`;
- `pnpm test:run`;
- `pnpm build`;
- Playwright desktop/mobile;
- Deno tests das Edge Functions;
- aplicação das migrations `0016`–`0029` em Supabase/Postgres real;
- testes SQL/pgTAP do lifecycle real de restore/account-admin;
- prova real de `auth.admin.deleteUser` após o desacoplamento histórico aplicado;
- Storage real para signed upload/promoção/cleanup;
- Advisors/security checks do projeto Supabase hospedado.

O runner conhecido não consegue acessar `registry.npmjs.org`, não possui Supabase local/cloud configurado e usa Node 22.16.0 enquanto o projeto mira Node >=24. O repositório público de toolchains não é usado para checkout/teste deste repo privado porque logs de falha poderiam revelar paths/trechos privados. Se um gate remoto for criado, deverá permanecer no repo de toolchains com isolamento que não exponha conteúdo privado.

## Próximo trabalho

1. escrever a aceitação E2E da Task 9 com fixtures controladas;
2. revisar estaticamente regressões de TypeScript/SQL e corrigir o que for resolvível por código;
3. atualizar o status geral do plano;
4. após o checkpoint do plano 06, continuar na branch dependente do plano 07 (`hardening-deploy-release`), sem mexer em `main`.
