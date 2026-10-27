# Ativar login com Google

O código já usa o SDK oficial Supabase com fluxo PKCE. A URL do sistema continua `https://gabrielcabteo.github.io/suma-operacoes/` depois do retorno do Google. Durante a autenticação, o usuário passa pelas páginas do Google e Supabase.

## 1. Criar credenciais OAuth no Google

Abra https://console.cloud.google.com/auth/overview e crie/selecione o projeto desejado. Configure nome, e-mail de suporte e público na Google Auth Platform. Use somente os escopos de identificação `openid`, e-mail e perfil; o sistema não precisa de Drive, Gmail ou Calendar.

Em **Clients → Create client → Web application**, configure:

| Campo | Valor |
| --- | --- |
| Authorized JavaScript origins | `https://gabrielcabteo.github.io` |
| Authorized redirect URIs | `https://wpkprybiqhzfobeurqtn.supabase.co/auth/v1/callback` |

Se o aplicativo Google estiver em modo de teste, adicione os usuários permitidos em **Audience → Test users**. Configure o público adequado antes de disponibilizar a todos os colaboradores. Siga eventuais solicitações de consentimento ou verificação mostradas pelo Google.

## 2. Habilitar o provedor no Supabase

Abra https://supabase.com/dashboard/project/wpkprybiqhzfobeurqtn/auth/providers?provider=Google

Habilite Google e cadastre Client ID e Client Secret obtidos no Google. Salve. Mantenha a verificação de nonce habilitada. **O Client Secret fica somente no painel Supabase. Nunca coloque o segredo em arquivos do projeto, variáveis VITE, GitHub ou mensagens de chat.**

## 3. Configurar retorno ao sistema

Abra https://supabase.com/dashboard/project/wpkprybiqhzfobeurqtn/auth/url-configuration e configure tanto **Site URL** quanto uma entrada de **Redirect URLs** com:

```
https://gabrielcabteo.github.io/suma-operacoes/
```

Use a URL exata, incluindo a barra final. O callback no Google é a URL Supabase da etapa 1; a URL permitida no Supabase é a URL GitHub desta etapa.

## 4. Testar

Recarregue o site. A indicação de Google em configuração só desaparece quando `/auth/v1/settings` reporta o provedor habilitado. Clique em **Entrar com Google** e conclua a escolha de conta e o consentimento. Confira que o retorno ocorre no endereço do sistema.

Uma conta Google confirmada cria sua identidade no Supabase Auth e recebe automaticamente o papel de colaborador (`worker`). O administrador já aprovado permanece como único administrador. O colaborador consulta seus próprios registros e fotos; o administrador consulta todos. Não é necessário aprovar usuários individualmente. Contas banidas no painel do Supabase são impedidas de consultar e enviar dados, mesmo com JWT ainda válido. Links de imagem já emitidos expiram em até 60 segundos.

O login convencional com e-mail e senha permanece disponível para contas que possuam senha.

## Validação e limites

O código e a compilação foram verificados. Foram testados com mocks: PKCE, callback no domínio correto, provedor desativado, sessão inválida e bloqueio de usuários sem autorização. O login real só pode ser validado depois de cadastrar as credenciais e configurar as URLs acima.

Fontes oficiais:
- https://supabase.com/docs/guides/auth/social-sign-in/auth-google
- https://supabase.com/docs/guides/auth/redirect-urls
