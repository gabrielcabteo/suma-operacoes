# SUMA Brasil — Operações

Sistema piloto para registrar varrição de vias públicas em Ribeirão Preto. Interface em português, pensada para celular vertical, com identidade visual SUMA Brasil.

## Estado atual

- **Endereço principal:** https://gabrielcabteo.github.io/suma-operacoes/
- **GitHub Pages:** agora publica a interface COMPLETA do sistema, sem página de acesso ou redirecionamento. O domínio permanece durante o uso.
- **Armazenamento:** Supabase conectado com autenticação, permissões por usuário e bucket privado `evidencias`. É necessário criar e autorizar os usuários para entrar.
- **Hospedagem anterior:** https://varricao-rp-operacoes.sleekvenus20.chatgpt.site continua separada, com seus bindings D1/R2 e acesso privado. Dados e fotos existentes não são migrados automaticamente.
- **Código:** o repositório mantém também as APIs da hospedagem anterior. O build de Pages usa somente a interface e o adaptador de Supabase; essas APIs não são executadas no Pages.

## Conectar armazenamento e autenticação

1. O projeto `suma-operacoes` já foi criado em São Paulo e o esquema foi aplicado. **Não reaplique** o SQL de instalação nesse projeto. O arquivo `supabase/001_operations.sql` serve como referência para projetos novos.
2. Crie os usuários em Authentication → Users. Autorize cada um na tabela `public.members`, usando `admin` para gestão e `worker` para campo. Não há cadastro público ou concessão automática de acesso. Trabalhadores consultam seus próprios registros; administradores consultam todos.
3. `pages/supabase-config.json` contém somente URL e chave **publishable pública**, próprias para frontend. Não contém senha, token de usuário, service_role ou chave administrativa. A segurança é imposta por RLS e bucket privado. As variáveis opcionais `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` do GitHub Actions podem substituir essa configuração.
4. Alterações em `pages/supabase-config.json` disparam o workflow **pages build and deployment**. Sem configuração válida, o frontend não permite salvar.
5. Valide login, foto, envio e relatórios com usuários autorizados. A política de retenção, backup e monitoramento das franquias precisa ser definida antes de ampliar o uso.

A sessão usa sessionStorage por aba e pode ser renovada. Não são gravadas senhas no navegador. As fotos recebem links assinados temporários. Atualize a consulta caso uma foto expire. Usuários não autorizados não podem cadastrar dados ou listar evidências.

O bucket aceita apenas JPEG até 1,2 MB por foto. Se uma tentativa de envio falhar, podem permanecer fotos de um registro ainda não concluído; uma nova tentativa reutiliza os mesmos caminhos. A limpeza de órfãos deve ser administrada pelo responsável. Não existe promessa de armazenamento ilimitado ou de custo zero em qualquer volume.

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

O botão **Entrar com Google** está implementado com `@supabase/supabase-js` em versão exata e fluxo PKCE, incluindo restauração da sessão, validação do usuário no servidor e verificação de vínculo em `members`. A autenticação não concede acesso operacional automaticamente. O login por senha continua disponível.

É necessário configurar o provedor e as URLs no Google Cloud e no Supabase. Siga [Ativar login com Google](documentation/google-login.md). Enquanto o provedor estiver desativado, o botão fica indisponível e a tela informa o motivo. Não são incluídos Client ID ou Client Secret do Google no código.
