# Ciclo de Vida de Conta e Vínculo

> Especificação normativa para logout, remoção de identidade, preservação do conteúdo compartilhado e eventual substituição administrativa de um dos dois membros.

## 1. Princípio central

O vínculo entre as duas identidades e o `pair` não funciona como membership genérico de grupo, servidor ou organização.

O produto foi desenhado para **exatamente duas pessoas conhecidas**. Por isso, operações de conta não podem transformar o sistema em um modelo de entrar/sair livremente nem liberar automaticamente vagas para terceiros.

## 2. Logout

**Sair da conta** é uma operação normal de sessão.

Regras:

- encerra a sessão do usuário naquele dispositivo/contexto;
- não remove o usuário do `pair`;
- não altera autoria, histórico, avaliações, comentários, fotos ou demais dados compartilhados;
- não reabre bootstrap ou convites;
- deve impedir que outra pessoa que abra o mesmo navegador/PWA veja os dados privados apenas navegando pela interface;
- armazenamento local deve ser limpo ou isolado por identidade conforme a estratégia definida para o cliente;
- dados locais ainda não sincronizados precisam ser tratados de forma segura antes de qualquer limpeza destrutiva.

Logout é mudança de **sessão**, não mudança de pertencimento ao par.

## 3. Não existe “Sair do par” como ação comum

O produto não oferece uma ação cotidiana equivalente a “sair do grupo”.

Motivos:

- o `pair` é a raiz de autorização e compartilhamento;
- o histórico conjunto deve continuar íntegro;
- o sistema não deve sugerir que vagas podem ser abertas e reutilizadas livremente;
- a modelagem não deve evoluir acidentalmente para membership genérico.

Se houver necessidade real de remover uma identidade, isso é uma **operação administrativa excepcional**, não uma preferência de usuário comum.

## 4. Exclusão de conta e preservação de dados

Excluir uma identidade autenticada não pode causar, por cascata, exclusão dos dados compartilhados do produto.

Devem ser preservados, entre outros:

- receitas;
- categorias;
- histórico de preparos;
- snapshots históricos;
- avaliações e comentários já realizados;
- observações compartilhadas;
- fotos da receita e dos preparos;
- planejamento;
- listas de compras;
- conflitos e registros relevantes de auditoria/explicabilidade.

Quando necessário para preservar contexto histórico, registros podem manter referência estável à identidade anterior ou um snapshot de autoria compatível com privacidade e integridade do domínio.

A implementação não deve depender de `ON DELETE CASCADE` sobre a identidade de autenticação para destruir conteúdo compartilhado.

## 5. Remoção administrativa de um membro

Se uma identidade precisar ser removida por motivo excepcional:

- a operação deve ser deliberada e explicitamente confirmada;
- deve ocorrer em backend confiável, não apenas no frontend;
- deve preservar o conteúdo histórico;
- deve registrar metadados suficientes para explicar a alteração administrativa;
- não deve alterar retroativamente autoria histórica;
- não deve conceder ao membro removido acesso futuro aos dados do `pair`;
- sessões e credenciais relevantes devem ser revogadas conforme capacidades atuais do provedor de autenticação.

Antes de uma operação destrutiva desse nível, o produto deve recomendar e, quando tecnicamente viável, **gerar um backup de segurança** do estado atual.

## 6. O par permanece fechado

Remover uma das duas identidades **não reabre automaticamente o par**.

Isso significa:

- `pair` fechado continua fechado;
- bootstrap continua consumido;
- convites normais continuam indisponíveis;
- a contagem cair temporariamente para um membro ativo não equivale a existir uma vaga reutilizável;
- nenhuma rota normal de cadastro pode interpretar ausência de um membro como permissão para criar um terceiro usuário histórico.

O fechamento é uma propriedade de ciclo de vida, não apenas `active_member_count < 2`.

## 7. Eventual substituição de membro

Se no futuro for necessário substituir uma identidade definitivamente perdida/removida, isso deve ocorrer por um **fluxo administrativo de recuperação/substituição específico**.

Esse fluxo:

- é separado de bootstrap, cadastro e convite normal;
- exige validação forte da operação;
- não altera nem transfere retroativamente autoria histórica da identidade anterior;
- não permite ter mais de dois membros ativos ao final;
- deve revogar o acesso da identidade substituída antes de ativar a nova quando aplicável;
- deve ser auditável;
- deve exigir backup prévio ou oferecer mecanismo equivalente de recuperação.

A existência conceitual desse fluxo não significa que ele precise ficar exposto como botão comum na interface.

## 8. Dados locais e logout

Como o aplicativo é local-first, logout exige cuidado especial.

A implementação deve distinguir:

1. dados já sincronizados, recuperáveis do backend;
2. dados privados cacheados localmente;
3. mutações ainda pendentes de sincronização;
4. mídias cuja única cópia conhecida pelo app ainda é local.

Nenhuma rotina de limpeza de logout pode apagar silenciosamente uma mutação ou foto que ainda não possua cópia segura.

O plano de implementação deve definir uma estratégia transacional ou equivalente para impedir perda nesses casos.

## 9. Testes obrigatórios

No mínimo:

1. logout não remove membership nem conteúdo compartilhado;
2. após logout, outra sessão não consegue consultar dados privados residuais pela UI;
3. limpeza local não apaga mutações pendentes nem mídia sem cópia segura;
4. remover identidade não apaga receitas/histórico/fotos compartilhados;
5. remover um membro não reabre bootstrap;
6. remover um membro não habilita convite normal para terceiro usuário;
7. membro removido perde autorização para o `pair`;
8. autoria histórica continua identificável sem reatribuição falsa;
9. eventual substituição administrativa termina com no máximo dois membros ativos;
10. substituição não altera retroativamente avaliações/comentários/autoria do membro anterior;
11. operação administrativa destrutiva oferece ou exige proteção por backup conforme especificado.

## 10. Relação com outros documentos

- `docs/AUTH_SECURITY.md` — autenticação, bootstrap, convite, recuperação e autorização.
- `docs/BACKUP_RESTORE.md` — geração e restauração de backups.
- `docs/DATA_MODEL.md` — `pairs`, `pair_members` e autoria das entidades.
- `docs/SYNC.md` — proteção de mutações locais e sincronização.
- `docs/MEDIA_STORAGE.md` — integridade de mídia local/remota.
