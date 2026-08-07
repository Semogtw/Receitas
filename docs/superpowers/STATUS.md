# Status do desenvolvimento

**Atualizado em:** 2026-08-07  
**Fase atual:** planejamento de implementação concluído; implementação ainda não iniciada.

## Gates concluídos

- A especificação final de design em `docs/superpowers/specs/2026-08-07-receitas-design.md` foi **explicitamente aprovada pelo usuário em 2026-08-07**.
- A fase `superpowers:writing-plans` foi concluída.
- O roadmap mestre e os sete planos executáveis estão em `docs/superpowers/plans/`.
- Os planos passaram por auto-revisão de cobertura, placeholders/instruções vagas e consistência de contratos entre subsistemas.

> A linha de status existente no cabeçalho da especificação final foi escrita antes da aprovação. Este arquivo registra o gate posterior e prevalece como status atual do processo: **design aprovado**.

## Próximo passo obrigatório

A implementação deve começar por:

`docs/superpowers/plans/2026-08-07-01-foundation-pwa.md`

Ordem completa:

1. `2026-08-07-01-foundation-pwa.md`
2. `2026-08-07-02-backend-auth-data.md`
3. `2026-08-07-03-local-first-sync.md`
4. `2026-08-07-04-recipes-cooking-media.md`
5. `2026-08-07-05-planning-shopping-search.md`
6. `2026-08-07-06-import-backup-diagnostics.md`
7. `2026-08-07-07-hardening-deploy-release.md`

O arquivo `2026-08-07-receitas-roadmap.md` descreve dependências, contratos transversais e critérios de conclusão.

## Método de execução

Ao iniciar código:

- usar `superpowers:subagent-driven-development` como caminho recomendado quando o ambiente permitir;
- usar `superpowers:executing-plans` como alternativa de execução inline;
- criar worktree isolada com `superpowers:using-git-worktrees` quando suportado;
- seguir TDD e os gates definidos em cada plano;
- manter commits/pushes frequentes;
- documentar bloqueios ambientais e continuar tarefas resolvíveis por código;
- usar `docs/TOOLS_AND_PLUGINS.md` para roteamento de @Build Web Apps, @Context7, @Supericons, Codex Security e demais plugins.

## Restrições que permanecem em vigor

- custo recorrente obrigatório: **US$ 0**;
- exatamente duas pessoas;
- local-first;
- sem perda silenciosa em conflitos;
- sem ImageGen no fluxo visual sem nova autorização explícita;
- decisões puramente técnicas podem ser fechadas pelo agente quando preservarem produto, segurança/privacidade e custo zero;
- decisões que alterem comportamento/UX aprovado ou impliquem custo obrigatório voltam ao usuário.
