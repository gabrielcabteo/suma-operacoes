# SUMA Brasil — Operações

Sistema piloto para registrar varrição de vias públicas em Ribeirão Preto. Interface em português, pensada para celular vertical, com identidade visual SUMA Brasil.

## Estado atual

- **Endereço principal:** https://gabrielcabteo.github.io/suma-operacoes/
- **GitHub Pages:** agora publica a interface COMPLETA do sistema, sem página de acesso ou redirecionamento. O domínio permanece durante o uso.
- **Armazenamento:** preparado para Supabase com autenticação, permissões e bucket privado. Se as variáveis do projeto estiverem ausentes, o sistema exibe aviso e não permite salvar. Nenhum dado é salvo como se o servidor estivesse conectado.
- **Hospedagem anterior:** https://varricao-rp-operacoes.sleekvenus20.chatgpt.site continua separada, com seus bindings D1/R2 e acesso privado. Dados e fotos existentes não são migrados automaticamente.
- **Código:** o repositório mantém também as APIs da hospedagem anterior. O build de Pages usa somente a interface e o adaptador de Supabase; essas APIs não são executadas no Pages.

## Conectar armazenamento e autenticação

1. Crie um projeto no plano gratuito do Supabase e aplique `supabase/001_operations.sql` **uma única vez em um projeto novo**.
2. Crie os usuários em Authentication → Users. Autorize cada um na tabela `public.members`, usando `admin` para gestão e `worker` para campo. Não há cadastro público ou concessão automática de acesso. Trabalhadores consultam seus próprios registros; administradores consultam todos.
3. No GitHub, em Settings → Secrets and variables → Actions → **Variables**, defina `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` (chave pública publishable/anon). **Nunca use service_role, chave secreta ou token administrativo no frontend.** A segurança depende das políticas RLS e do bucket privado definidos na migração.
4. Execute novamente o workflow **pages build and deployment**. O build incorpora as duas configurações públicas. Sem elas, a interface abre com o envio desativado.
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
