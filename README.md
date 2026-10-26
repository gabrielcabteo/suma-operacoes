# SUMA Brasil — Operações

Sistema piloto para registrar varrição de vias públicas em Ribeirão Preto. Interface em português, pensada para celular vertical, com identidade visual SUMA Brasil.

## Estado atual

- **Aplicação:** https://varricao-rp-operacoes.sleekvenus20.chatgpt.site
- **Acesso:** privado, requer login com ChatGPT e autorização no Site. A equipe ainda não tem acesso coletivo configurado.
- **GitHub Pages:** publica exclusivamente a página `docs/index.html`, com acesso à aplicação acima. Não hospeda o formulário, as APIs, os dados nem as fotos.
- **Código:** este repositório contém o código-fonte da aplicação, os recursos visuais, a migração do banco e os workflows.
- **Sincronização:** enviar código ao GitHub não atualiza a aplicação hospedada em Sites. A publicação do servidor continua sendo separada.

## Funcionalidades

Registro em etapas Local → Fotos → Conferir; até três fotos por operação; redução das imagens no celular; salvamento em banco D1 e arquivos R2; histórico e filtros diários, semanais, mensais e anuais; exportação CSV; impressão para salvar PDF. Ajuste de rolagem durante o uso do teclado virtual.

O envio requer internet. Os campos e imagens são mantidos apenas na página aberta em caso de erro: não há fila offline persistente. Nome e equipe são lembrados no próprio navegador. Relatórios são gerados por consulta, sem envio agendado. O CSV não contém os arquivos de imagem.

## Ativar o GitHub Pages (uma vez)

1. Abra **Settings → Pages** deste repositório.
2. Em **Build and deployment → Source**, selecione **GitHub Actions**.
3. Em **Actions**, abra **pages build and deployment** e clique em **Run workflow** se a primeira execução tiver falhado antes da ativação.
4. Use o endereço mostrado no job `deploy` após o sucesso. Não considere a página publicada antes da confirmação do workflow.

O workflow publica a pasta `docs` após alterações nela ou por execução manual. Não utiliza tokens pessoais ou serviços pagos. A configuração inicial de Pages não é feita automaticamente pelo workflow, pois o token padrão do Actions não permite habilitá-lo.

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
- `docs/`: página de acesso publicada no GitHub Pages.
- `.github/workflows/`: publicação de Pages e validação do código.

## Antes do uso pela equipe

É necessário configurar acesso dos colaboradores e permissões por função, testar câmera e envio de fotos em celulares reais, definir backup, retenção das imagens e limites de uso. A proteção atual é fornecida pelo acesso privado da hospedagem Sites; as APIs não devem ser expostas em outro servidor sem autenticação própria.

Para hospedar a aplicação de forma independente do Sites, será necessário configurar autenticação e um servidor compatível com D1/R2 ou adaptar as APIs a outro provedor. GitHub Pages sozinho não executa essas APIs. A eventual gratuidade depende das franquias efetivas do provedor e do volume acumulado de imagens.

Não inclua fotos operacionais, nomes de colaboradores reais, exportações de banco, senhas ou tokens no repositório público. A marca SUMA Brasil pertence ao respectivo titular.
