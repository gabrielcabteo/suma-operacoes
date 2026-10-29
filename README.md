# SUMA Brasil — Operações

Sistema piloto para registrar varrição de vias públicas em Ribeirão Preto. Interface em português, pensada para celular vertical, com identidade visual SUMA Brasil.

## Estado atual

- **Endereço principal:** https://gabrielcabteo.github.io/suma-operacoes/
- **GitHub Pages:** agora publica a interface COMPLETA do sistema, sem página de acesso ou redirecionamento. O domínio permanece durante o uso.
- **Armazenamento:** Supabase conectado com autenticação, permissões por usuário e bucket privado `evidencias`. Contas com e-mail confirmado entram automaticamente como colaboradores. A conta administrativa existente é preservada.
- **Hospedagem anterior:** https://varricao-rp-operacoes.sleekvenus20.chatgpt.site continua separada, com seus bindings D1/R2 e acesso privado. Dados e fotos existentes não são migrados automaticamente.
- **Código:** o repositório mantém também as APIs da hospedagem anterior. O build de Pages usa somente a interface e o adaptador de Supabase; essas APIs não são executadas no Pages.

## Conectar armazenamento e autenticação

1. O projeto `suma-operacoes` já foi criado em São Paulo e o esquema foi aplicado. **Não reaplique** o SQL de instalação nesse projeto. O arquivo `supabase/001_operations.sql` serve como referência para projetos novos.
2. Usuários confirmados são inscritos automaticamente em `public.members` como `worker`, inclusive os usuários confirmados que já existiam. O administrador já aprovado permanece como único `admin`. Trabalhadores consultam seus próprios registros; o administrador consulta todos. Não há promoção de novos administradores pelo cliente.
3. `pages/supabase-config.json` contém somente URL e chave **publishable pública**, próprias para frontend. Não contém senha, token de usuário, service_role ou chave administrativa. A segurança é imposta por RLS e bucket privado. As variáveis opcionais `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` do GitHub Actions podem substituir essa configuração.
4. Alterações em `pages/supabase-config.json` disparam o workflow **pages build and deployment**. Sem configuração válida, o frontend não permite salvar.
5. Valide login, foto, envio e relatórios com usuários autorizados. A política de retenção, backup e monitoramento das franquias precisa ser definida antes de ampliar o uso.

A sessão usa sessionStorage por aba e pode ser renovada. Não são gravadas senhas no navegador. As fotos recebem links assinados de 60 segundos; atualize a consulta caso expirem. Contas bloqueadas não podem fazer novas consultas, gerar novos links ou enviar dados. Links já emitidos permanecem válidos até expirar; conteúdo já baixado não pode ser recolhido.

O bucket aceita apenas JPEG até 1,2 MB por foto. Se uma tentativa de envio falhar, podem permanecer fotos de um registro ainda não concluído; uma nova tentativa reutiliza os mesmos caminhos. A limpeza de órfãos deve ser administrada pelo responsável. Não existe promessa de armazenamento ilimitado ou de custo zero em qualquer volume.

## Demandas, lavagem com pipas e CSV mensal

A página principal agora oferece **Demandas**, **Lavagem · Pipas**, **Relatórios e CSV** e acesso à varrição existente. Cada atendimento tem situação (programada, em andamento, concluída, pendente ou cancelada), prioridade, data do serviço, local, responsável, equipe, efetivo, horários, descrição, observações e até três fotos opcionais. Lavagens acrescentam caminhão, motorista, ajudantes, tipo de local, litros e reabastecimentos informados. Campos numéricos vazios significam não informado; zero é preservado.

Em **Relatórios e CSV**, escolha o mês e use **CSV completo do mês**. A exportação consulta novamente todos os registros autorizados de `operational_entries` e `operations`, incluindo todas as situações, sem aplicar a busca da lista. O arquivo tem 34 colunas, UTF-8 com BOM, separador ponto e vírgula e proteção contra fórmulas em textos. O mês é definido pela data do serviço, não pelo cadastro ou pela conclusão. Fotos são representadas por caminhos privados e não são incorporadas ao CSV. **Arquivar varrição** continua exclusivo para os relatórios e fotos do módulo de varrição anterior.

A conta administrativa existente consulta e edita todos os novos atendimentos. Colaboradores consultam e editam apenas os próprios. Autor, identidade e evidências ficam preservados; edições usam `updated_at` para rejeitar alterações concorrentes. Cancelar mantém o registro no fechamento. Consultas usam paginação por ID, sem limite global de 1.000 linhas. O CSV é gerado sob demanda, sem entrega automática agendada.

O esquema aditivo está em `supabase/operational_entries.sql`, aplicado pelo MCP com o nome `add_operational_entries_demands_washing`. Não reaplique o arquivo no projeto existente. Verificações do formato e validação: `node pages/field-model.test.mjs`.

## Funcionalidades

Registro em etapas Local → Fotos → Conferir; até três fotos por operação; redução das imagens no celular; salvamento em banco D1 e arquivos R2; histórico e filtros diários, semanais, mensais e anuais; exportação CSV; impressão para salvar PDF. Ajuste de rolagem durante o uso do teclado virtual.

O envio requer internet. Os campos e imagens são mantidos apenas na página aberta em caso de erro: não há fila offline persistente. Nome e equipe são lembrados no próprio navegador. Relatórios são gerados por consulta, sem envio agendado. O CSV não contém os arquivos de imagem.

## Ativar o GitHub Pages (uma vez)

1. Abra **Settings → Pages** deste repositório.
2. Em **Build and deployment → Source**, selecione **GitHub Actions**.
3. Em **Actions**, abra **pages build and deployment** e clique em **Run workflow** se a primeira execução tiver falhado antes da ativação.
4. Use o endereço mostrado no job `deploy` após o sucesso. Não considere a página publicada antes da confirmação do workflow.

O workflow compila a aplicação estática com Vite e publica `dist-pages` após alterações no código ou por execução manual. Não utiliza tokens pessoais ou serviços pagos. A configuração inicial de Pages não é feita automaticamente pelo workflow, pois o token padrão do Actions não permite habilitá-lo.

## Desenvolvimento da aplicação

Requisitos: Node.js 24 e pnpm 11.25.0.

```sh
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
pnpm build
```

Para desenvolvimento local: `pnpm dev`. A primeira geração do build prepara a configuração local do Wrangler. Aplique as migrações apenas no banco local antes de testar o salvamento:

```sh
pnpm exec wrangler d1 execute DB --local --persist-to .wrangler/state --config dist/server/wrangler.json --file drizzle/0000_condemned_junta.sql
```

O desenvolvimento precisa dos bindings `DB` (D1) e `BUCKET` (R2). A configuração `.openai/hosting.json` identifica o Site existente; ela não contém chaves secretas e não provisiona uma conta Cloudflare própria.

## Estrutura

- `app/page.tsx`: formulário, consultas e relatórios.
- `app/globals.css`: identidade visual e experiência móvel.
- `app/api/operations/route.ts`: leitura e criação dos registros.
- `app/api/photos/[id]/route.ts`: acesso às imagens.
- `db/` e `drizzle/`: esquema e migrações.
- `public/suma-brasil.png`: marca usada na interface.
- `pages/`: entrada da aplicação estática, login e adaptador Supabase.
- `supabase/001_operations.sql`: esquema, políticas e bucket privado.
- `.github/workflows/`: publicação de Pages e validação do código.

## Antes do uso pela equipe

É necessário configurar acesso dos colaboradores e permissões por função, testar câmera e envio de fotos em celulares reais, definir backup, retenção das imagens e limites de uso. Na versão Pages, a proteção dos dados é feita pelo Supabase Auth e pelas políticas RLS. As APIs antigas de Sites não devem ser expostas em outro servidor sem autenticação própria.

A versão Pages pode funcionar de forma independente do Sites após configurar Supabase Auth, banco e armazenamento. GitHub Pages sozinho não executa as APIs antigas de D1/R2. A eventual gratuidade depende das franquias efetivas do provedor e do volume acumulado de imagens.

Não inclua fotos operacionais, nomes de colaboradores reais, exportações de banco, senhas ou tokens no repositório público. A marca SUMA Brasil pertence ao respectivo titular.

## Primeiro administrador

Nenhuma identidade recebe acesso administrativo automaticamente. O titular deve criar seu usuário em Authentication → Users do Supabase, definindo a própria senha, e confirmar expressamente o e-mail e o papel desejado. A autorização na tabela members deve usar o UUID retornado pelo Auth; nunca use a chave service_role no navegador.

## Login Google

O botão **Entrar com Google** está implementado com `@supabase/supabase-js` em versão exata e fluxo PKCE, incluindo restauração da sessão, validação do usuário no servidor e verificação de vínculo em `members`. Contas confirmadas recebem acesso automático como colaborador; o administrador existente é preservado. O login por senha continua disponível.

É necessário configurar o provedor e as URLs no Google Cloud e no Supabase. Siga [Ativar login com Google](documentation/google-login.md). Enquanto o provedor estiver desativado, o botão fica indisponível e a tela informa o motivo. Não são incluídos Client ID ou Client Secret do Google no código.

## Bloquear um usuário

No Supabase, abra Authentication → Users, selecione o usuário e use Ban user. As funções internas de autorização consultam `auth.users.banned_until` em cada nova requisição, inclusive quando um JWT antigo ainda não expirou. Desbanir restabelece o acesso de colaborador quando a conta é confirmada. Não é necessário apagar o usuário nem seus relatórios.

## Criar e configurar conta

A tela de entrada inclui **Criar conta** e **Esqueci minha senha**. Depois do login, **Minha conta** permite editar o nome e alterar a senha exclusiva do SUMA Operações. O e-mail é somente leitura e não há campo para elevar permissões. Novos usuários confirmados continuam entrando como colaboradores.

Consulte [Cadastro e configuração da conta](documentation/account.md) para os fluxos de confirmação, recuperação e limites do envio de e-mails. Os testes são simulados; não foram enviados e-mails ou alteradas credenciais reais durante a implementação.
