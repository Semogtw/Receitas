# Runbook — preservar dados locais durante incidentes

Use este procedimento **antes** de qualquer ação que possa apagar o armazenamento local do Receitas: limpar dados do navegador, resetar perfil, desinstalar a PWA, trocar de navegador/dispositivo, recriar PowerSync local ou executar troubleshooting destrutivo.

## Princípio

No Receitas, o dispositivo pode conter o único exemplar temporário de:

- mutações ainda presentes na `mutation_outbox`;
- fotos preparadas mas ainda não confirmadas no Storage;
- rascunho ativo do modo cozinhar em `device_preferences`;
- estado local que ainda não chegou ao outro dispositivo.

Por isso, “limpar cache/dados” nunca é um primeiro passo de recuperação.

## 1. Classificar o incidente

Antes de alterar o dispositivo, determine se o problema é:

- frontend/PWA;
- Supabase pausado/indisponível;
- PowerSync desprovisionado/indisponível;
- Storage/upload;
- Auth;
- dados locais corrompidos;
- conflito semântico normal;
- problema apenas visual.

Se o backend estiver indisponível, recupere o backend primeiro sempre que possível.

## 2. Registrar estado técnico sanitizado

Abra **Configurações → Diagnósticos** e registre/exporte o diagnóstico local.

O diagnóstico deve conter apenas metadados técnicos permitidos, como:

- quantidade de mutações pendentes;
- quantidade de uploads pendentes;
- quantidade de conflitos abertos;
- estado online/service worker;
- eventos técnicos sanitizados.

Ele não substitui backup de conteúdo e não deve conter receita, ingrediente, e-mail, token ou identificadores pessoais.

## 3. Verificar filas antes de qualquer limpeza

Não prossiga com limpeza se houver:

- mutações semânticas pendentes;
- mídia aguardando upload/confirmação;
- conflito aberto que ainda represente uma decisão de usuário;
- rascunho de cozinha ativo que precise ser preservado.

A prioridade passa a ser restaurar conectividade e drenar filas.

## 4. Tentar recuperação não destrutiva

Na ordem:

1. confirme conectividade do dispositivo;
2. feche e reabra a PWA sem limpar storage;
3. confirme sessão Auth;
4. confirme Supabase;
5. confirme PowerSync;
6. aguarde sync/upload;
7. recarregue a página somente depois de o estado local ter sido persistido pelos fluxos normais.

Um reload normal não deve remover `device_preferences`, banco PowerSync local ou blobs persistidos.

## 5. Backup completo quando permitido

Se as filas estiverem vazias e a UI permitir:

1. gere **Backup completo**;
2. valide o ZIP pelo próprio inspector do produto;
3. preserve o checksum mostrado;
4. mantenha o arquivo fora do storage que será limpo.

O backup completo deliberadamente falha quando detecta estado ainda não sincronizado/confirmado. Não altere o código ou banco local para burlar esse guardrail durante um incidente.

## 6. Quando existe dado somente local

Se há mutação/mídia somente local e o backend está indisponível:

- **não limpe o dispositivo**;
- preserve o perfil/browser/PWA exatamente como está;
- restaure Supabase/PowerSync/Storage conforme os runbooks correspondentes;
- aguarde o fluxo normal confirmar o estado remoto;
- só então faça um backup completo.

O produto não possui um formato suportado de “backup completo incluindo mutações ainda não sincronizadas”. Portanto não trate uma cópia improvisada de IndexedDB/OPFS como restore suportado.

## 7. Rascunho de cozinha

O modo cozinhar mantém um único draft ativo local em `device_preferences` (`active_cooking_draft`).

Se houver preparo em andamento:

- sair do modo cozinhar não deve apagar o draft;
- reload/remount deve restaurar o draft;
- finalizar o preparo pelo fluxo normal é o momento em que o draft pode ser limpo após persistência da sessão.

Não limpe site data no meio de um preparo que precise ser preservado.

## 8. Só então considerar limpeza local

Limpeza destrutiva é aceitável apenas quando **todos** os itens abaixo forem verdadeiros:

- Supabase está saudável;
- PowerSync está saudável;
- fila de mutações pendentes está vazia;
- fila de mídia pendente está vazia;
- não há rascunho local que precise sobreviver;
- o outro dispositivo ou backend já contém o estado esperado;
- um backup completo válido foi gerado quando aplicável.

## 9. Depois da limpeza/reinstalação

1. faça login novamente;
2. aguarde o sync inicial completo;
3. confirme receitas, histórico, planner e listas;
4. confirme mídia remota;
5. faça uma pequena mutação de teste e valide sync para o outro cliente;
6. não importe um backup por cima do estado recém-sincronizado sem necessidade.

## Critério de sucesso

O troubleshooting só é considerado seguro se nenhuma informação que existia apenas localmente foi descartada e o cliente volta a um estado sincronizado/reprodutível sem intervenção manual na `mutation_outbox` ou em tabelas internas.
