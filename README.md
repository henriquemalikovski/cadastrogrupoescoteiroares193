# Pré-cadastro de novos associados — Grupo Escoteiro Arés 193/RS

Site simples em que a família de um novo associado preenche os dados que depois serão lançados no **Paxtu**. Ao enviar, o site gera um arquivo **JSON** com todas as respostas e o manda **como anexo por e-mail** para a secretaria do grupo.

- O formulário espelha três abas do cadastro do Paxtu: **Informações gerais**, **Responsáveis** e **Ficha médica**, e termina numa tela de **Revisão e envio**.
- O site **não** se conecta ao Paxtu e **não guarda** nada: não há banco de dados. O único destino dos dados é o e-mail da secretaria.
- Um único projeto Node.js (Express): o mesmo servidor entrega as páginas e recebe o envio.

## Estrutura

```
server.js                 Express: páginas, estáticos e POST /api/enviar
shared/schema.js          campos, opções, mapeamento para o Paxtu e validação (usado no navegador e no servidor)
shared/paxtu-listas.json  listas de opções copiadas do Paxtu
server/validar.js         validação no servidor (usa shared/schema.js)
server/email.js           montagem e envio do e-mail (Nodemailer)
server/anti-spam.js       honeypot, tempo mínimo e limite de envios por IP
public/                   index.html, style.css, app.js e privacidade.html
test/validar.test.js      testes (node:test)
```

Rotas: `GET /` (formulário), `GET /privacidade`, `GET /shared/schema.js`, `GET /shared/paxtu-listas.json`, `POST /api/enviar` e `GET /saude` (responde `ok`).

## Rodar no computador

Precisa do **Node.js 20 ou mais novo**.

```bash
npm install
```

Copie `.env.example` para `.env` e preencha as variáveis (veja abaixo como gerar a senha do Gmail):

```bash
cp .env.example .env
```

```bash
npm run dev
```

Abra **http://localhost:3000**. O `npm run dev` reinicia o servidor sozinho quando um arquivo muda; em produção use `npm start`.

### Variáveis de ambiente

| Variável | Para que serve |
|---|---|
| `PORT` | Porta do servidor (padrão 3000). Render e similares definem sozinhos. |
| `SMTP_HOST` / `SMTP_PORT` | Servidor de e-mail. Padrão: `smtp.gmail.com` e `465`. |
| `SMTP_USER` / `SMTP_PASS` | Conta que **envia** os e-mails e a senha de app dela. |
| `EMAIL_DESTINO` | Quem **recebe** os cadastros (a secretaria). |
| `EMAIL_REMETENTE` | Nome e endereço que aparecem como remetente. No Gmail, use o mesmo endereço de `SMTP_USER`. |
| `NOME_GRUPO` | Nome do grupo gravado no JSON e no e-mail. |

Nenhum endereço de e-mail ou senha fica no código do navegador: tudo isso vive só no servidor.

> **Recomendação:** use como destino uma conta de e-mail **do grupo** (não pessoal), com **verificação em duas etapas** ativada. Os e-mails contêm dados de saúde de crianças e adolescentes.

## Senha de app do Gmail

O Gmail não aceita a senha normal da conta em programas; é preciso uma **senha de app**, e ela só existe com a verificação em duas etapas ligada.

1. Entre na conta Google que vai **enviar** os e-mails.
2. Acesse **Conta do Google → Segurança** e ative a **Verificação em duas etapas**.
3. Acesse **https://myaccount.google.com/apppasswords**, dê um nome (ex.: “Pré-cadastro”) e clique em **Criar**.
4. Copie a senha de 16 letras que aparece.
5. No `.env` (ou nas variáveis do serviço de hospedagem):
   - `SMTP_USER` = o endereço Gmail completo;
   - `SMTP_PASS` = a senha de app (os espaços podem ser omitidos).

Outro provedor de e-mail funciona trocando `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` e `SMTP_PASS`. Com porta 465 a conexão é segura desde o início; com 587 ela usa STARTTLS.

## Publicar

O site precisa de HTTPS (Render e Vercel já fornecem).

### Render (recomendado)

1. Envie o projeto para um repositório no GitHub (o `.env` **não** vai junto; ele está no `.gitignore`).
2. No Render, clique em **New → Web Service** e escolha o repositório.
3. Configure:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/saude`
4. Em **Environment**, cadastre `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_DESTINO`, `EMAIL_REMETENTE` e `NOME_GRUPO` (não precisa de `PORT`).
5. Clique em **Create Web Service**. A cada novo commit, o Render publica de novo.

No plano gratuito o serviço “dorme” sem uso e a primeira visita pode demorar alguns segundos.

### Vercel (alternativa)

A Vercel reconhece o Express automaticamente: o `server.js` exporta o app (`export default app`) e a pasta `public/` é servida direto pela CDN.

1. Envie o projeto para o GitHub.
2. Na Vercel, **Add New → Project**, importe o repositório e mantenha o *Framework Preset* sugerido (Express/Other), sem comando de build.
3. Em **Settings → Environment Variables**, cadastre as mesmas variáveis do Render.
4. Clique em **Deploy**.

O arquivo `vercel.json` aplica os cabeçalhos de segurança também aos arquivos servidos pela CDN. Na Vercel, o limite de 5 envios por IP vale por instância do servidor (cada instância conta separadamente), o que basta para o volume de um grupo escoteiro.

## Testes

```bash
npm test
```

Os testes automáticos (`test/validar.test.js`) cobrem: o JSON gerado idêntico ao modelo, textos de lista iguais aos do Paxtu, regra de responsável para menores, máximo de 2 responsáveis (inclusive enviando 3 direto para a API), descrições obrigatórias de alergias/condições/comportamentos, convênio “Outros”, adulto sem responsáveis com contato “Outros”, CPF/e-mail/celular/CEP inválidos, honeypot, tempo mínimo, limite por IP, falha no SMTP (500 sem detalhes internos), cabeçalhos de segurança e ausência de e-mails no front-end. O envio de e-mail é simulado; nada sai de verdade.

Antes de publicar, faça também o teste manual da lista das instruções: um envio real chegando no e-mail, o rascunho voltando após fechar a aba, ViaCEP/IBGE no celular etc. Para simular falha do e-mail, use uma `SMTP_PASS` errada: deve aparecer o botão **Baixar JSON**.

## Alterar campos e listas

**Campos:** tudo está em `shared/schema.js`, na constante `ETAPAS`. O formulário, a revisão, a validação (no navegador e no servidor) e o JSON são gerados a partir dela, então basta editar esse arquivo. Cada campo tem:

- `chave`: nome no JSON (ex.: `nome` ou `endereco.cep`);
- `rotulo`: texto exibido;
- `tipo`: `texto`, `textoLongo`, `data`, `cpf`, `email`, `telefone`, `cep`, `numero`, `lista`, `busca` (lista com busca), `cidade`, `simNao`, `opcao`, `caixas`, `caixasDescricao`, `marcar`, `tabela` ou `computado`;
- `obrigatorio`, `visivelSe` (quando aparece), `lista` (nome da lista em `paxtu-listas.json`) e `paxtu` (nome do campo na tela do Paxtu, para uma futura importação automática).

Exemplo, para pedir o nome da escola do associado (campo opcional):

```js
{ chave: 'escola', rotulo: 'Escola onde estuda', tipo: 'texto', paxtu: null },
```

Campo oculto vai no JSON como `null` (ou `[]`), e chaves que começam com `_` são só da interface e não vão para o JSON. Os testes comparam o JSON com o modelo das instruções: se você acrescentar campos de propósito, atualize também o `MODELO` em `test/validar.test.js`.

**Opções das listas:** quando o Paxtu mudar alguma lista (convênios, profissões etc.), copie as opções novas para `shared/paxtu-listas.json`, **com o texto exatamente igual ao Paxtu**, para que a secretaria encontre a mesma opção na hora de lançar. Não é preciso mexer em código.

**Nome do grupo:** além de `NOME_GRUPO` no ambiente, o nome aparece no topo de `public/index.html` e `public/privacidade.html` e no texto de consentimento (constante `NOME_GRUPO` em `shared/schema.js`).

## Privacidade (LGPD)

- Nada é gravado no servidor; os logs registram só “envio ok” ou “envio erro”, sem dados pessoais.
- O corpo do e-mail traz só um resumo e um aviso genérico se houver informação de saúde; a ficha médica completa vai **apenas no anexo**.
- O rascunho fica só no navegador de quem preenche e é apagado após o envio.
- A página `/privacidade` explica finalidade, acesso e como pedir exclusão. Revise o texto de contato do grupo antes de publicar.
- Não há analytics nem scripts de terceiros; o navegador só consulta o ViaCEP (CEP) e o IBGE (lista de cidades).
