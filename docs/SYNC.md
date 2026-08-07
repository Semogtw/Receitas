# Sincronização, Offline e Conflitos

> Documento vivo. Define o comportamento obrigatório de sincronização do aplicativo e a política aprovada para alterações concorrentes.

## 1. Objetivo

O aplicativo é **local-first**. A experiência normal deve continuar funcionando mesmo sem conexão, e a sincronização existe para reconciliar o estado dos dois dispositivos com o estado remoto sem sacrificar dados.

A regra central é:

> **Auto-merge somente quando a combinação puder ser demonstrada como segura. Havendo ambiguidade semântica, preservar todas as versões e criar um conflito explícito.**

Nenhum mecanismo de sincronização pode usar last-write-wins silencioso como política final para alterações concorrentes relevantes.

## 2. Princípios obrigatórios

- Toda escrita comum é persistida localmente primeiro.
- A interface reflete a alteração local imediatamente.
- A ausência de rede não impede consultar nem editar dados já disponíveis localmente.
- Operações sincronizáveis usam identificadores estáveis gerados no cliente quando necessário.
- Cada mutação deve carregar informação suficiente sobre a versão/base sobre a qual foi criada.
- Falhas transitórias de rede geram retry; não geram perda de dados.
- Operações devem ser idempotentes sempre que razoável.
- Fotos e arquivos grandes usam fila própria de upload e não bloqueiam a sincronização dos metadados estruturados.
- Estados derivados não devem ser persistidos como fonte de verdade quando puderem ser calculados de maneira confiável.

## 3. Estado local e remoto

A UI lê do banco local. O estado remoto é uma cópia canônica compartilhada e uma referência para reconciliação, não uma dependência para renderização normal.

Fluxo conceitual:

```text
interação do usuário
        ↓
escrita local imediata
        ↓
registro da mutação/base conhecida
        ↓
fila de sincronização
        ↓
PowerSync / backend
        ↓
validação de versão
        ↓
aceite, auto-merge seguro ou conflito
        ↓
novo estado remoto
        ↓
replicação para os dois dispositivos
```

## 4. Versionamento conceitual

Entidades sincronizáveis precisam possuir metadados suficientes para determinar se uma alteração foi feita sobre a versão ainda atual da entidade.

A implementação concreta pode usar revisão monotônica, versão lógica, base revision, hash de versão ou mecanismo equivalente, desde que preserve estas propriedades:

1. a mutação sabe qual era sua **base conhecida**;
2. o servidor consegue determinar se a entidade avançou desde essa base;
3. versões concorrentes podem ser preservadas;
4. uma resolução produz uma nova versão explícita;
5. retries da mesma operação não criam alterações duplicadas.

O plano de implementação deve congelar os nomes e tipos exatos desses campos antes do código.

## 5. Caso sem concorrência

Se o estado remoto ainda corresponde à base conhecida pela mutação:

1. validar autorização e invariantes do domínio;
2. aplicar a alteração;
3. produzir nova revisão;
4. marcar a operação como sincronizada;
5. replicar a nova versão para os dispositivos.

Esse é o caminho comum e não deve exigir qualquer intervenção do usuário.

## 6. Auto-merge seguro

Auto-merge é permitido somente quando as alterações são independentes e não existe ambiguidade sobre o resultado.

Exemplos conceituais de situações que **podem** ser mescladas automaticamente:

- um dispositivo altera o título da receita e o outro altera uma descrição separada;
- um membro cria sua própria `cooking_session_rating` enquanto o outro cria a própria avaliação do mesmo preparo;
- itens independentes são adicionados a coleções usando IDs distintos;
- uma foto nova é adicionada enquanto outro campo não relacionado é editado;
- alterações em entidades-filhas diferentes que não disputam ordenação ou o mesmo valor lógico.

Antes de fazer auto-merge, a implementação deve provar que:

- os conjuntos de campos/entidades alterados não se sobrepõem semanticamente;
- nenhum invariante é quebrado pela união;
- ordenação não fica ambígua;
- exclusão não concorre com edição do mesmo conteúdo;
- a união não exige escolher qual intenção do usuário deve prevalecer.

Se qualquer uma dessas condições não for verificável, não fazer auto-merge.

## 7. Situações que viram conflito

Criar conflito explícito quando duas mudanças concorrentes exigirem escolha humana ou interpretação de intenção.

Exemplos:

- ambos alteraram o mesmo campo da receita para valores diferentes;
- ambos editaram o mesmo ingrediente de maneiras incompatíveis;
- ambos editaram a mesma etapa de preparo de maneiras incompatíveis;
- um usuário excluiu uma entidade enquanto o outro a editou sobre uma base anterior;
- duas operações concorrentes tornam a ordem de ingredientes/passos ambígua;
- uma alteração estrutural remove ou substitui conteúdo que outra alteração ainda referencia;
- duas alterações produzem estado que viola invariantes quando combinadas.

A existência de conflito não deve destruir nem ocultar definitivamente nenhuma das versões concorrentes.

## 8. Estrutura de um conflito

Um conflito deve preservar, no mínimo:

- tipo da entidade;
- `entity_id`;
- `pair_id`;
- base comum conhecida;
- versão/alteração A;
- versão/alteração B;
- timestamps relevantes;
- estado do conflito;
- estratégia de resolução escolhida;
- resultado resolvido;
- usuário responsável pela resolução quando aplicável.

Quando útil, registrar também metadados de dispositivo/operação para diagnóstico, sem transformar isso em requisito de UX.

## 9. Estado estável durante conflito

Um conflito aberto não deve tornar a receita inutilizável.

Enquanto a resolução estiver pendente:

- manter uma versão estável acessível para consulta;
- sinalizar que existe conflito pendente;
- permitir adiar a resolução;
- não bloquear outras áreas do app que não dependam daquela escolha;
- preservar todas as versões do conflito.

A UI deve comunicar segurança: **nenhuma versão foi perdida**.

## 10. Resolução

A interface deve permitir, conforme o tipo de conflito:

- escolher a versão A inteira;
- escolher a versão B inteira;
- mesclar campo a campo;
- produzir manualmente um terceiro resultado quando necessário.

A resolução:

1. lê explicitamente as versões conflitantes;
2. gera um novo estado canônico;
3. produz nova revisão;
4. marca o conflito como resolvido;
5. preserva o histórico das versões anteriores;
6. sincroniza o resultado para os dois dispositivos.

Conflitos resolvidos não precisam permanecer destacados no uso cotidiano, mas não devem ser descartados imediatamente se forem necessários para auditoria/recuperação.

## 11. Exclusão concorrente

Soft delete participa da mesma política de versionamento.

Casos:

- exclusão sem concorrência: sincroniza normalmente;
- restauração sem concorrência: sincroniza normalmente;
- exclusão concorrendo com edição baseada em versão anterior: **conflito**;
- exclusão definitiva só pode ocorrer por fluxo explícito e não deve eliminar versões necessárias para resolver conflito ainda aberto.

A ausência de uma linha remota nunca deve ser interpretada automaticamente como autorização para apagar uma cópia local recuperável.

## 12. Coleções ordenadas

Ingredientes, etapas e outras listas ordenáveis exigem cuidado extra.

A implementação deve evitar depender exclusivamente de índices posicionais frágeis como identidade dos itens.

Regras:

- cada item possui ID estável próprio;
- reordenação deve ser representável sem trocar a identidade do conteúdo;
- adições independentes podem ser mescladas quando a posição final for determinística;
- se duas reordenações concorrentes produzirem intenção incompatível, criar conflito em vez de adivinhar uma ordem.

A técnica concreta de ordenação será definida no plano de implementação.

## 13. Entidades naturalmente independentes

Alguns dados devem ser modelados de forma a reduzir conflitos artificiais.

Exemplo importante:

- cada membro possui sua própria `cooking_session_rating` para um preparo.

Assim, Arthur editar a própria nota e o segundo membro editar a própria nota são operações independentes e não devem gerar conflito entre si.

O mesmo princípio vale para outros dados cujo domínio permita separar identidades reais em vez de concentrar tudo em um único registro compartilhado.

## 14. Fotos e uploads

Sincronização de mídia é separada da sincronização de metadados.

Ao adicionar uma foto:

1. criar identidade e referência local imediatamente;
2. salvar o vínculo local com receita/preparo;
3. enfileirar upload;
4. continuar permitindo uso offline;
5. quando online, enviar ao bucket privado;
6. reconciliar referência remota e estado de upload.

Falha de upload não deve desfazer a criação do preparo ou receita.

Operações concorrentes sobre metadados de uma foto devem seguir a mesma política de versionamento. O arquivo binário em si não deve ser sobrescrito silenciosamente por outro arquivo diferente usando a mesma identidade lógica.

## 15. IDs

Entidades que precisam ser criadas offline devem receber IDs estáveis antes de chegar ao servidor.

Requisitos:

- baixa probabilidade de colisão;
- independência de conexão com o backend;
- mesma identidade preservada após retry e sincronização;
- adequação a inserts concorrentes dos dois dispositivos.

A escolha concreta de UUID/ULID ou equivalente será congelada no plano técnico.

## 16. Fila e retry

Operações locais pendentes precisam sobreviver a recarregamentos recuperáveis do PWA.

Cada item de fila deve ter, conceitualmente:

- identidade da operação;
- entidade alvo;
- tipo de operação;
- base conhecida;
- payload necessário;
- estado de tentativa;
- contador ou metadados de retry quando útil;
- último erro relevante;
- timestamps.

Erros devem ser classificados pelo menos em:

- transitórios/retry automático;
- autenticação/autorização;
- validação/invariante;
- conflito;
- erro permanente que exige intervenção.

## 17. Estado mostrado ao usuário

A sincronização não deve virar ruído visual permanente.

Estados relevantes:

- sincronizado;
- offline com alterações locais pendentes;
- sincronizando;
- falha temporária;
- upload de mídia pendente;
- conflito aguardando resolução.

Quando tudo estiver normal, o indicador pode ser discreto ou ausente.

## 18. Requisitos de teste

A implementação precisa testar, no mínimo:

- edição offline e sincronização posterior;
- retries idempotentes;
- duas edições concorrentes no mesmo campo;
- edições concorrentes em campos independentes com auto-merge;
- exclusão concorrendo com edição;
- duas avaliações pessoais independentes no mesmo preparo;
- adições concorrentes de ingredientes distintos;
- reordenações concorrentes incompatíveis;
- upload de mídia falhando enquanto metadados sincronizam;
- recuperação após recarregamento com operações pendentes;
- resolução de conflito e propagação para ambos os dispositivos;
- garantia de que versões conflitantes não sejam perdidas.

## 19. Restrições

Não usar como política final:

- last-write-wins silencioso;
- timestamps de relógio do dispositivo como única fonte de ordenação/confiança;
- posição de lista como identidade de item;
- exclusão física automática para representar sincronização;
- bloqueio geral do app durante um conflito;
- merge automático quando o resultado exigir interpretar intenção humana.
