# Guia de publicação — IAÍ Gestão

Tempo estimado: 40 minutos. Não precisa instalar nada no computador nem usar terminal.
Custo: R$ 0 (planos gratuitos do GitHub, Firebase Spark e Cloudinary Free; nenhum pede cartão).

O sistema funciona em **modo demonstração** enquanto o arquivo `js/config.js` estiver vazio.
Você pode publicar no GitHub primeiro, conhecer o sistema com dados fictícios e só depois ligar o banco real.

---

## Parte 1 — Publicar o site (GitHub Pages)

1. Crie uma conta em <https://github.com> (se ainda não tiver).
2. Clique em **New repository**.
   - Nome: `iai-gestao`
   - Visibilidade: **Public** (o GitHub Pages gratuito exige repositório público; não há senhas nem dados no código).
   - Clique em **Create repository**.
3. Na página do repositório, clique em **uploading an existing file**.
4. Descompacte o arquivo `iai-gestao.zip` no computador e **arraste todo o conteúdo da pasta** (os arquivos e pastas `index.html`, `css`, `js`, `assets`, `firebase`, `docs` etc.) para a página. Aguarde o envio terminar e clique em **Commit changes**.
   - O arquivo `.nojekyll` precisa ir junto. Se o seu computador esconder arquivos que começam com ponto, crie-o pelo GitHub: **Add file › Create new file**, nome `.nojekyll`, conteúdo vazio, **Commit**.
5. Vá em **Settings › Pages**.
   - Em **Source**, escolha **Deploy from a branch**.
   - Branch: **main**, pasta **/ (root)**. Clique em **Save**.
6. Aguarde 1 a 2 minutos e abra `https://SEU-USUARIO.github.io/iai-gestao/`.
   - Deve aparecer a tela de login com a faixa **Modo demonstração**. Toque em um perfil para conhecer o sistema.

---

## Parte 2 — Banco de dados e login (Firebase)

1. Acesse <https://console.firebase.google.com> com uma conta Google da empresa e clique em **Criar um projeto**.
   - Nome: `iai-gestao`. Pode desativar o Google Analytics. Crie.
2. **Login por usuário e senha**
   - Menu **Criação › Authentication › Vamos começar**.
   - Aba **Método de login › E-mail/senha › Ativar** (só a primeira opção). **Salvar**.
   - Aba **Configurações › Domínios autorizados › Adicionar domínio**: `SEU-USUARIO.github.io`.
3. **Banco de dados**
   - Menu **Criação › Firestore Database › Criar banco de dados**.
   - Edição **Standard**. Local: **southamerica-east1 (São Paulo)** — não pode ser trocado depois.
   - Escolha **Iniciar no modo de produção**. Criar.
4. **Regras de segurança** (passo obrigatório)
   - Ainda no Firestore, abra a aba **Regras**.
   - Apague todo o conteúdo e cole o conteúdo inteiro do arquivo `firebase/firestore.rules`.
   - Clique em **Publicar**.
5. **Registrar o app da Web**
   - Clique na engrenagem ao lado de *Visão geral do projeto* › **Configurações do projeto**.
   - Em **Seus apps**, clique no ícone **`</>`** (Web). Apelido: `IAÍ Gestão`. **Não** marque Firebase Hosting. Registrar.
   - Aparece um bloco `const firebaseConfig = { apiKey: ..., authDomain: ..., projectId: ... }`. Copie esses valores.

> Esses valores não são senhas: eles identificam o projeto e ficam visíveis em qualquer site que usa Firebase.
> Quem protege os dados são as regras do passo 4.

---

## Parte 3 — Fotos (Cloudinary)

1. Crie uma conta gratuita em <https://cloudinary.com> (plano Free).
2. No **Dashboard**, anote o **Cloud name**.
3. Vá em **Settings (engrenagem) › Upload › Upload presets › Add upload preset**:
   - **Upload preset name**: `iai_gestao`
   - **Signing mode**: **Unsigned**
   - **Folder** (ou *Asset folder*): `iai-gestao`
   - **Use filename**: desligado · **Unique filename**: ligado · **Overwrite**: desligado
   - **Allowed formats**: `jpg,jpeg,png,webp`
   - Em **Upload control / Incoming transformation** (se disponível): limite de tamanho `w_1600,h_1600,c_limit` e **Max file size** 5 MB.
   - Salve.

> O sistema já reduz cada foto no celular (cerca de 300 KB) antes de enviar, o que mantém o uso dentro do plano gratuito por bastante tempo.

---

## Parte 4 — Ligar o sistema ao banco

No GitHub, abra o arquivo `js/config.js` e clique no **lápis** (editar). Preencha:

```js
firebase: {
  apiKey: "cole aqui",
  authDomain: "cole aqui",
  projectId: "cole aqui",
  storageBucket: "cole aqui",
  messagingSenderId: "cole aqui",
  appId: "cole aqui",
},
cloudinary: {
  cloudName: "seu cloud name",
  uploadPreset: "iai_gestao",
},
```

Clique em **Commit changes**. Em 1 a 2 minutos o site deixa o modo demonstração.

> Se preferir, envie esses valores para quem está te ajudando com o sistema e ele preenche o arquivo.

---

## Parte 5 — Primeiro acesso (faça logo após o passo 4)

1. Abra o site. Aparece a **Configuração inicial**.
2. Crie o seu acesso de administrador (nome, usuário e senha).
3. Confira as unidades (Cruz e Gandu já vêm preenchidas).
4. Deixe marcado **Criar rotinas sugeridas**.
5. Pronto. Agora vá em **Colaboradores › Novo colaborador** e cadastre a equipe. Para cada pessoa, o sistema mostra o usuário e a senha temporária para você entregar.

> Importante: faça a configuração inicial assim que publicar. Ela só pode ser feita uma vez, por quem chegar primeiro.

---

## Depois de publicado

- **Ajuste as rotinas** em cada setor › aba **Rotinas** (principalmente o cronograma de limpeza de Gandu, os horários dos turnos da recepção e quem é responsável por cada bloco).
- **Responsáveis padrão das ocorrências**: **Configurações › Geral**.
- **Escala de sábado do gestor**: **Gestão gerencial › Escala**.
- **Cópia de segurança**: **Configurações › Cópia de segurança**, uma vez por semana.
- **Instalar no celular**: abra o site no navegador do celular e use "Adicionar à tela inicial".

## Se algo der errado

| Sintoma | O que fazer |
| --- | --- |
| "Você não tem permissão para esta ação" em tudo | As regras do Firestore não foram publicadas. Repita a Parte 2, passo 4. |
| Login diz "Usuário ou senha incorretos" para todos | Confira se o método **E-mail/senha** está ativado (Parte 2, passo 2). |
| Erro de domínio não autorizado ao entrar | Adicione `SEU-USUARIO.github.io` em **Domínios autorizados** (Parte 2, passo 2). |
| Fotos não enviam | Confira o *cloud name* e o nome do *upload preset* (precisa ser **Unsigned**). Teste em **Configurações › Conexão e fotos**. |
| Mudanças no `config.js` não aparecem | Aguarde 2 minutos e recarregue a página segurando Shift. |
| Colaborador esqueceu a senha | **Colaboradores** › ícone de chave › **Redefinir senha**. |
