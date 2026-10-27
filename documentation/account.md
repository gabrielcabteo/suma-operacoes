# Cadastro e configuração da conta

## Criar conta

Na tela de entrada, escolha **Criar conta**. É possível continuar pelo Google ou preencher nome, e-mail, senha própria do sistema e confirmação de senha. O formulário exige pelo menos oito caracteres e senhas iguais. O cadastro por e-mail segue a política de confirmação do Supabase; depois da confirmação, o usuário recebe acesso de colaborador automaticamente. Administradores não são escolhidos pelo formulário.

O login Google permanece disponível e não depende de criar senha do SUMA Operações.

## Minha conta

Depois do login, **Minha conta** permite editar o nome do perfil e definir/alterar a senha do sistema. O e-mail é exibido somente para consulta. Não se pode editar papel, permissões ou tipo de conta nessa tela.

A senha definida aqui não é a senha do Google. Se o Supabase solicitar reautenticação, o usuário pode pedir um código por e-mail e informá-lo diretamente na tela. As regras de confirmação, bloqueio e reautenticação do servidor continuam sendo respeitadas.

## Recuperar senha

Na entrada, **Esqueci minha senha** solicita um link por e-mail. Abra-o no mesmo navegador/dispositivo. O sistema usa o evento PASSWORD_RECOVERY do SDK para abrir a definição da nova senha após validar a sessão.

Para permitir que links de confirmação/recuperação sejam abertos em outra aba, os verificadores PKCE são compartilhados por no máximo uma hora no mesmo navegador e removidos quando consumidos. Tokens de sessão continuam isolados por aba. O código não armazena senhas.

## Envio de e-mail

As mensagens são enviadas pelo serviço de Auth do Supabase. Restrições de destinatários, SMTP e limites de envio do provedor continuam aplicáveis. Se o serviço não puder enviar a confirmação, a interface informa a falha e oferece o uso do Google. O código não altera as configurações de envio nem contrata serviços de e-mail.

## Validação

Compilação e TypeScript verificados. Testes com mocks cobrem signup, URL de confirmação, recuperação, edição restrita ao nome, senha mínima, reautenticação e isolamento/expiração do armazenamento PKCE. Nenhum teste enviou e-mail nem alterou senhas reais. Os links de e-mail precisam ser validados com um cadastro real pelo titular.
