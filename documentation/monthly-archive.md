# Fechamento mensal

Disponível somente para administradores no topo do sistema. A consulta usa data do serviço e inclui todos os registros existentes naquele instante, inclusive mais de um setor por colaborador. A consulta não congela o mês: lançamentos posteriores exigem nova exportação.

1. Consulte mês e consumo do bucket de evidências.
2. Baixe o ZIP do relatório (HTML offline imprimível, CSV e JSON).
3. Baixe todas as partes das fotos: até 50 por ZIP, uma parte por clique. Uma falha impede a geração dessa parte, permitindo tentar novamente. Os arquivos de conferência trazem tamanho e SHA-256.
4. Extraia os ZIPs na mesma pasta. Abra relatorio.html, confira totais e imagens e guarde duas cópias independentes em locais seguros.

O indicador “preparada” significa que o navegador recebeu o arquivo para download. Não comprova que o download foi salvo, conferido ou copiado. A marca de conferência é local à tela e não autoriza exclusão.

Nenhuma foto é excluída, nenhum provedor é contratado e nenhum backup automático é executado. Usuários, senhas, políticas e configurações não fazem parte da exportação. É um arquivo operacional, não uma restauração completa do Supabase. Downloads consomem a franquia de saída. O medidor inclui todos os objetos do bucket, inclusive órfãos, mas não outros buckets, banco ou tráfego. A referência de 1 GB é apenas do plano gratuito, não uma quota consultada via billing.

Para 200 pessoas com 3–6 fotos diárias, 1 GB é insuficiente. Antes do uso amplo, definir provedor/capacidade e política de retenção. Não remover evidências sem cópia validada e prazo da empresa/contrato definido.

## Validação

Typecheck e build de produção; teste ZIP com leitor Python padrão; datas (fevereiro bissexto), proteção de caminhos e escape de HTML/CSV. RPC de consumo testada com claims de administrador (permitido) e colaborador (negado), em transações com rollback. Nenhum download de evidência real, remoção ou envio externo de arquivo foi feito durante os testes.
