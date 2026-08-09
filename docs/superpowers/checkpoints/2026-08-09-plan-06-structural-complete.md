# Checkpoint — plano 06 estruturalmente concluído

**Data:** 2026-08-09  
**Branch:** `feat/import-backup-diagnostics`

O plano `2026-08-07-06-import-backup-diagnostics.md` está estruturalmente implementado até a Task 9.

## Entregue em código

- import determinístico por JSON-LD/texto + URL SSRF-safe + revisão obrigatória;
- backup completo aberto/checksummed com mídia privada e snapshot sincronizado;
- restore com preflight completo, staging privado e revalidação servidor;
- merge transacional com conflitos preservados;
- `replace_all` com safety backup server-proven e round-trip restaurável;
- promoção de mídia content-addressed e cleanup conflict-aware;
- diagnósticos locais bounded/sanitizados;
- administração excepcional de identidade em par fechado, com safety backup, reautenticação recente e substituição privada;
- callback público isolado para concluir a membership substituta;
- E2E codificados para import, backup/merge/replace safety, corrupção de última mídia e privacidade de diagnósticos;
- README E2E define ambiente staging descartável e opt-in destrutivo.

## Correções encontradas durante hardening do plano

- restauração via `update deleted_at=null` removida porque violava contrato semântico;
- provenance consolidada de compras preserva todas as origens;
- foto sem SHA/tamanho impede backup completo até backfill sincronizado;
- preflight foto↔mídia passou a exigir SHA/bytes exatos;
- cleanup passou a preservar mídia referenciada por conflitos abertos;
- remoção administrativa sem substituição ganhou rota privada futura de recovery;
- cancelamento de substituição não deixa mais a vaga em dead-end;
- browser não escolhe UUID destrutivo no account-admin;
- identidade substituta consegue ativar membership antes do AuthGate normal.

## Gates escritos, mas não executados

- Vitest;
- Deno tests;
- SQL contract/lifecycle tests;
- Playwright staging acceptance;
- lint/typecheck/build;
- migrations/Storage/Auth reais no Supabase;
- Advisors/security checks.

Nenhum desses itens é declarado verde. O runner conhecido segue sem registry npm/Supabase real e abaixo do Node alvo. Checkout/gate remoto deste repo privado não será enviado ao toolchain público sem isolamento de logs privados.

## Continuação

A próxima branch deve nascer deste head e executar `2026-08-07-07-hardening-deploy-release.md`, preservando `main` intacta e mantendo commits/pushes frequentes.
