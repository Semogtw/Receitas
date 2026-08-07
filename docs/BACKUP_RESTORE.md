# Backup, Exportação e Restauração

> Especificação normativa da portabilidade e da restauração dos dados. O objetivo é permitir recuperação completa sem transformar importação em uma operação destrutiva imprevisível.

## 1. Princípios

- O usuário deve conseguir exportar os dados do produto em formato aberto e portátil.
- Um backup deve conter dados estruturados e mídias suficientes para reconstruir o estado funcional do par.
- A restauração nunca deve aplicar alterações parcialmente depois de uma validação incompleta.
- Existem dois modos de restauração: **mesclar** e **substituir tudo**.
- IDs estáveis do domínio são preservados quando possível e usados para reconhecer entidades já existentes.
- Divergências sem solução determinística seguem a mesma política de conflitos definida em `docs/SYNC.md`.

## 2. Formato do backup

Formato esperado: arquivo `.zip` com manifesto versionado, dados estruturados em JSON e mídias.

Estrutura conceitual:

```text
backup.zip
├── manifest.json
├── data/
│   ├── recipes.json
│   ├── recipe-ingredients.json
│   ├── recipe-steps.json
│   ├── categories.json
│   ├── cooking-sessions.json
│   ├── cooking-session-ratings.json
│   ├── meal-plan.json
│   ├── shopping-lists.json
│   ├── shopping-items.json
│   ├── conversion-profiles.json
│   └── ...
└── media/
    ├── recipes/
    └── cooking-sessions/
```

O manifesto deve indicar ao menos:

- versão do formato;
- data de geração;
- identificador do par de origem quando apropriado;
- versão do aplicativo/esquema relevante para migração;
- lista ou hashes dos arquivos esperados quando usados para verificação de integridade;
- metadados necessários para interpretar o conteúdo sem depender da estrutura interna atual do banco.

## 3. Conteúdo mínimo

O backup completo deve incluir, quando existirem:

- receitas;
- ingredientes;
- etapas;
- categorias e associações;
- favoritos e estados organizacionais persistidos;
- fotos e galerias da receita;
- histórico de preparos;
- avaliações e comentários individuais;
- observações compartilhadas dos preparos;
- fotos de cada preparo;
- planejador;
- períodos de refeição personalizados;
- listas e itens de compras relevantes;
- perfis personalizados de conversão de ingredientes;
- preferências compartilhadas pertinentes;
- metadados indispensáveis à preservação de IDs, relações e contexto histórico.

Dados puramente transitórios do dispositivo, como fila de retry, cache ou estado visual temporário, não precisam fazer parte do formato portátil.

## 4. Validação antes da restauração

Nenhuma alteração é aplicada antes de o pacote passar por uma fase completa de validação.

Validar, no mínimo:

- ZIP legível e dentro dos limites de tamanho aceitos;
- `manifest.json` presente e válido;
- versão do formato conhecida ou migrável;
- JSON com esquema válido;
- IDs e referências internas coerentes;
- ausência de duplicações impossíveis ou violações de invariantes;
- arquivos de mídia esperados presentes quando declarados;
- tipos de arquivo permitidos;
- limites de tamanho por arquivo e total;
- proteção contra zip-slip/path traversal;
- ausência de caminhos absolutos ou entradas fora da raiz do pacote;
- ausência de conteúdo executável tratado como dado confiável;
- compatibilidade com a regra de exatamente dois membros.

Se a validação falhar, **nenhuma restauração parcial deve ser aplicada**.

## 5. Modo “Mesclar backup”

Objetivo: incorporar conteúdo do backup ao estado atual sem destruir o que já existe.

Fluxo conceitual:

```text
validar pacote
    ↓
comparar IDs estáveis
    ↓
importar entidades ausentes
    ↓
mesclar alterações comprovadamente seguras
    ↓
criar conflitos para divergências ambíguas
    ↓
importar/reconciliar mídias
```

Regras:

- entidade com ID desconhecido pode ser adicionada, desde que relações e autorização sejam válidas;
- entidade com mesmo ID e mesmo conteúdo não gera duplicata;
- entidade com mesmo ID e mudanças não concorrentes pode ser mesclada quando a segurança da operação puder ser demonstrada;
- entidade com mesmo ID e divergência incompatível gera conflito explícito, seguindo `docs/SYNC.md`;
- exclusão no backup concorrendo com edição atual também é tratada como conflito;
- médias, estados derivados e outros valores calculáveis não devem ser tratados como fonte de verdade se puderem ser reconstruídos;
- avaliações individuais de usuários distintos continuam entidades independentes;
- a restauração não deve inventar novos usuários para resolver referências de identidade.

O resultado pode conter conflitos pendentes sem considerar a restauração um fracasso, desde que nenhum dado tenha sido silenciosamente perdido.

## 6. Modo “Substituir tudo”

Objetivo: restaurar o par para o conteúdo do backup escolhido, substituindo o estado de domínio atual.

Por ser uma ação destrutiva, possui proteção obrigatória.

### 6.1 Backup de segurança automático

Antes da primeira alteração destrutiva:

1. gerar um **backup completo do estado atual**;
2. verificar que esse backup foi produzido com sucesso;
3. somente então iniciar a substituição.

Se o backup de segurança falhar, a operação de substituir tudo deve ser cancelada.

Esse arquivo serve como ponto de retorno manual caso o usuário perceba depois que escolheu o pacote errado ou prefira recuperar o estado anterior.

### 6.2 Aplicação

Depois da validação do pacote e da criação do backup de segurança:

- o conteúdo atual substituível é removido logicamente ou preparado para troca de forma transacional/recuperável;
- os dados do backup são restaurados preservando relações e IDs válidos;
- mídias são restauradas/reassociadas;
- índices/estados derivados são recalculados;
- filas locais e cache são reconciliados com o novo estado;
- a sincronização não deve publicar um estado intermediário parcialmente restaurado como se fosse final.

O plano técnico deve escolher uma estratégia que maximize atomicidade ou possibilidade de rollback. A implementação não deve simplesmente apagar tudo e depois começar a inserir dados sem proteção contra falhas no meio do processo.

## 7. Escopo de identidade e par

Backups são de dados do produto, não um mecanismo para contornar autenticação.

Regras:

- restaurar um backup não cria uma terceira conta;
- não reabre bootstrap;
- não reabre convites depois do fechamento do par;
- referências aos dois membros precisam ser mapeadas de forma segura para as identidades autorizadas do par de destino;
- credenciais, hashes de senha, tokens de sessão, segredos e chaves administrativas nunca fazem parte do backup portátil;
- se um backup proveniente de outra instalação precisar ser aceito, o processo deve exigir um mapeamento explícito das identidades sem criar usuários arbitrariamente.

## 8. Mídias

Durante exportação:

- incluir somente arquivos pertencentes ao par;
- preservar vínculo entre mídia e entidade;
- preferir nomes internos baseados em IDs estáveis, não em nomes fornecidos pelo usuário;
- evitar depender de URLs remotas temporárias.

Durante restauração:

- validar MIME/extensão/conteúdo conforme estratégia escolhida;
- nunca extrair arquivo para caminho controlado pelo conteúdo do ZIP;
- deduplicação por hash pode ser usada quando segura;
- falha em mídia declarada como obrigatória invalida o pacote antes da aplicação;
- falha de upload remoto depois da aplicação local deve entrar na fila normal de mídia, sem destruir o registro restaurado.

## 9. Segurança

A superfície de restauração deve considerar o ZIP como entrada não confiável.

Proteções obrigatórias incluem:

- limites de tamanho total, descompactado e por entrada;
- limite de número de arquivos;
- defesa contra ZIP bomb;
- defesa contra zip-slip/path traversal;
- validação estrita de JSON/schema;
- rejeição de caminhos e tipos inesperados;
- não executar HTML, JavaScript, binários ou macros presentes no pacote;
- não confiar em `pair_id`, `user_id` ou outros campos de autorização vindos do arquivo sem revalidar/mapeá-los no backend;
- operações privilegiadas permanecem no servidor quando necessário.

## 10. UX

Antes de restaurar, a interface deve mostrar:

- data do backup;
- versão/formato;
- contagem resumida de receitas, preparos e mídias quando disponível;
- tamanho do pacote;
- modo escolhido: **Mesclar** ou **Substituir tudo**.

Para “Substituir tudo”:

- explicar claramente que o estado atual será substituído;
- informar que um backup de segurança será criado automaticamente;
- usar confirmação proporcional ao risco, sem depender de um modal genérico de “Tem certeza?”.

Para “Mesclar”:

- explicar que itens novos serão adicionados;
- informar que divergências reais podem aparecer depois na tela de conflitos.

## 11. Falhas e atomicidade

- falha na validação: nenhuma alteração;
- falha ao criar backup de segurança: não iniciar substituição;
- falha durante aplicação: não publicar estado parcial como concluído;
- operações devem ser retomáveis ou revertíveis conforme estratégia técnica;
- logs de erro não devem conter conteúdo sensível do backup além do necessário para diagnóstico.

## 12. Testes obrigatórios

No mínimo:

1. exportar e restaurar um backup íntegro preserva relações e histórico;
2. pacote com manifesto inválido falha sem alterar dados;
3. JSON inválido falha sem alteração parcial;
4. zip-slip é rejeitado;
5. ZIP bomb/tamanho excessivo é rejeitado;
6. “Mesclar” adiciona entidade ausente sem duplicar entidade idêntica;
7. “Mesclar” cria conflito para divergência incompatível de mesmo ID;
8. “Mesclar” não cria terceiro usuário;
9. “Substituir tudo” cria backup de segurança antes de qualquer destruição;
10. falha no backup de segurança cancela a substituição;
11. falha no meio da substituição não deixa o app em estado considerado concluído/parcial silenciosamente;
12. mídias restauradas mantêm associação correta;
13. credenciais e segredos não entram no backup;
14. restauração não reabre bootstrap ou cadastro;
15. estados derivados são recalculados corretamente após restauração.

## 13. Relação com outros documentos

- Requisitos funcionais: `docs/PRODUCT.md`.
- Arquitetura geral: `docs/ARCHITECTURE.md`.
- Modelo de dados: `docs/DATA_MODEL.md`.
- Política de sincronização e conflitos: `docs/SYNC.md`.
- Autenticação e limite de dois membros: `docs/AUTH_SECURITY.md`.
