# IAÍ Gestão

Sistema de gestão operacional e administrativa da **IAÍ Bora Treinar** (unidades Cruz e Gandu): rotinas e checklists por setor, ocorrências e pendências, manutenção de equipamentos e estrutura, recepção, comercial (com dados do EVO), marketing, gestão gerencial e relatórios mensais com aprovação da diretoria.

- **Publicar:** siga [docs/GUIA-DE-PUBLICACAO.md](docs/GUIA-DE-PUBLICACAO.md).
- **Usar:** [docs/MANUAL-DE-USO.md](docs/MANUAL-DE-USO.md).
- **Configuração:** o único arquivo a preencher é `js/config.js`. Vazio = modo demonstração.
- **Segurança:** `firebase/firestore.rules` (colar no Firebase Console › Firestore › Regras).

## Tecnologia
- HTML, CSS e JavaScript (módulos nativos), sem etapa de build e sem dependências externas além do SDK oficial do Firebase (carregado do Google) e das fontes do Google Fonts.
- Firebase Authentication (usuário + senha) e Cloud Firestore no plano gratuito, sem Cloud Functions.
- Cloudinary para fotos (compressão no aparelho antes do envio).
- Gráficos em SVG próprios; impressão/PDF pelo navegador.

## Estrutura
```
index.html             casca do aplicativo
css/                   tokens de design, layout, componentes e impressão
js/config.js           CONFIGURAÇÃO (Firebase e Cloudinary)
js/core/               banco (Firebase ou demonstração), datas, interface, rotas, gráficos
js/services/           regras de negócio (rotinas, ocorrências, manutenção, comercial, relatórios…)
js/views/              telas
firebase/firestore.rules  regras de segurança do banco
docs/                  guia de publicação e manual
```

## Decisões importantes
- **Permissões por módulo e nível** (próprio, visualizar, editar, excluir), definidas por pessoa no cadastro e conferidas pelas regras do banco — não só escondidas na tela.
- **Nada operacional é apagado:** "excluir" arquiva ou cancela, com justificativa e histórico.
- **Auditoria obrigatória:** alterações em cadastros só são aceitas pelo banco junto com o registro de quem alterou, quando e o quê.
- **Sem índices compostos:** todas as consultas usam apenas filtros de igualdade, então não é preciso criar índices no Firestore.
- **Redefinição de senha sem e-mail:** o administrador gera uma nova senha temporária; o usuário e o histórico continuam os mesmos.
