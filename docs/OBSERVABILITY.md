# Erros, Diagnóstico e Observabilidade

> Política normativa de tratamento de erros e diagnóstico do Receitas. O objetivo é permitir recuperação e depuração suficientes para um aplicativo pessoal sem transformar o produto em uma fonte de telemetria comportamental ou exposição desnecessária de dados privados.

## 1. Princípio central

O produto deve ser **diagnosticável sem ser invasivo**.

Por padrão:

- não existe analytics comportamental;
- não existe rastreamento de navegação/uso para fins de produto;
- não existe coleta de conteúdo de receitas, comentários, fotos, e-mails, tokens ou outros dados privados em logs técnicos;
- erros esperados são tratados na própria interface;
- falhas técnicas relevantes preservam contexto suficiente para retry e diagnóstico;
- nenhuma falha pode resultar em perda silenciosa de dados.

## 2. Erros de interface

Erros recuperáveis devem ser apresentados de forma contextual e direta.

Exemplos:

- falha ao sincronizar uma alteração;
- falha temporária de upload;
- importação por URL incompleta;
- falha de download de mídia;
- indisponibilidade temporária de backend;
- conflito de edição aguardando resolução.

Regras:

- manter a ação/local data do usuário preservada quando houver possibilidade de retry;
- informar quando algo está apenas local ou pendente;
- não usar mensagens genéricas que escondam perda ou estado ambíguo;
- não transformar falhas transitórias em modais bloqueantes sem necessidade;
- erros de campo devem aparecer próximos ao campo quando forem validações do usuário.

## 3. Logs técnicos

Logs podem conter somente o necessário para explicar comportamento técnico.

Podem incluir, quando úteis:

- versão/build do aplicativo;
- timestamp;
- plataforma/navegador de forma não identificadora além do necessário;
- código/tipo de erro;
- componente/feature técnica;
- identificadores técnicos opacos de operação/mutação/upload;
- número de tentativas;
- estado de conectividade/sincronização;
- stack trace sanitizada quando disponível.

Não registrar:

- senha;
- token de sessão, refresh token ou token de convite;
- segredo de bootstrap;
- e-mail em claro sem necessidade excepcional e aprovada;
- conteúdo integral de receitas, ingredientes/notas/comentários como payload de log;
- fotos, blobs ou URLs assinadas de acesso privado;
- conteúdo integral de backups;
- headers de autenticação;
- chaves administrativas.

## 4. Histórico local de diagnóstico

O aplicativo pode manter um histórico local curto de falhas técnicas recentes para facilitar diagnóstico.

Esse histórico:

- é local ao dispositivo;
- possui retenção limitada/rotativa;
- evita payloads privados;
- pode ser limpo pelo usuário;
- não é sincronizado entre os dois membros por padrão;
- não é tratado como histórico de produto ou atividade do usuário.

## 5. Exportar diagnóstico

O produto deve possuir uma ação **“Exportar diagnóstico”**.

O arquivo exportado pode conter:

- versão/build do app;
- versão do schema/formato local quando relevante;
- plataforma/navegador/PWA instalada ou não;
- estado resumido de conectividade;
- estado de sincronização;
- contagem de mutações pendentes;
- contagem de uploads/downloads pendentes;
- conflitos abertos por tipo, sem payload de conteúdo;
- erros técnicos recentes sanitizados;
- capacidades relevantes do navegador detectadas, como suporte a notificações/service worker quando necessário.

O diagnóstico não deve conter por padrão:

- conteúdo de receitas;
- notas/comentários;
- fotos;
- e-mails;
- tokens;
- segredos;
- dump completo de banco;
- URLs privadas assinadas.

A exportação deve ser legível o bastante para uma sessão futura de desenvolvimento ou suporte entender o estado técnico sem precisar acessar os dados pessoais do par.

## 6. Sincronização, uploads e retries

Falhas nessas áreas precisam preservar estado de retry.

Cada operação pendente deve conseguir registrar localmente o suficiente para saber:

- o que precisa ser repetido;
- quantas tentativas já ocorreram;
- último erro técnico sanitizado;
- se o erro parece transitório ou requer intervenção;
- se existe risco de duplicação/idempotência.

Falha de sync ou upload não pode fazer o aplicativo concluir silenciosamente que a operação foi perdida ou concluída.

## 7. Edge Functions e backend

Logs de backend devem seguir os mesmos princípios de minimização.

- registrar IDs técnicos e resultado de operações privilegiadas quando útil;
- nunca registrar segredos;
- evitar corpos completos de requests sensíveis;
- sanitizar erros de provedores externos antes de persistir/expor;
- usar correlação por identificador de operação quando necessário para ligar cliente e backend sem expor conteúdo.

Superfícies particularmente sensíveis:

- bootstrap;
- convites;
- recuperação/verificação de e-mail;
- importação por URL;
- backup/restauração;
- exclusão definitiva;
- Storage privado.

## 8. Logging detalhado temporário

Pode existir um modo de logging ampliado para depuração, mas:

- fica desativado por padrão;
- exige ação explícita;
- possui escopo/tempo limitado;
- continua proibido de capturar segredos;
- deve ser fácil de desligar e limpar;
- não deve permanecer habilitado indefinidamente por acidente.

## 9. Privacidade

A ausência de analytics não elimina a existência de logs operacionais mínimos em provedores de infraestrutura, mas o projeto deve minimizar deliberadamente o que ele próprio envia e registra.

Não adicionar SDKs de analytics, sessão gravada, heatmap ou rastreamento de usuário sem nova decisão explícita de produto.

## 10. Testes mínimos

A implementação deve cobrir pelo menos:

1. erro de sync preserva a mutação pendente;
2. erro de upload preserva a mídia local não sincronizada;
3. retry não cria duplicatas quando a operação for idempotente;
4. exportação de diagnóstico não contém tokens/segredos;
5. exportação de diagnóstico não contém conteúdo integral de receitas/comentários/fotos;
6. logs de autenticação não expõem credenciais;
7. erro de backend é sanitizado antes de ser mostrado ao usuário;
8. falha transitória pode ser retomada sem perder dados;
9. limpeza do histórico diagnóstico não apaga dados de produto;
10. logging detalhado, se existir, inicia desabilitado e pode ser encerrado/limpo.

## 11. Relação com outros documentos

- `docs/FRONTEND.md` — apresentação de estados de erro/loading/offline.
- `docs/SYNC.md` — retries, conflitos e preservação de mutações.
- `docs/MEDIA_STORAGE.md` — uploads e integridade de mídia.
- `docs/AUTH_SECURITY.md` — dados sensíveis e superfícies de autenticação.
- `docs/BACKUP_RESTORE.md` — diagnósticos não substituem backups nem exportam dumps privados.
- `docs/TOOLS_AND_PLUGINS.md` — ferramentas de segurança/diagnóstico a usar durante desenvolvimento.
