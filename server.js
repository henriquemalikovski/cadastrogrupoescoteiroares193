// Servidor único: entrega o formulário, os arquivos estáticos e recebe o envio.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import { validarEnvio, gerarJson } from './server/validar.js';
import { enviarCadastro } from './server/email.js';
import { criarLimitador, verificarAntiSpam, TEMPO_MINIMO_MS } from './server/anti-spam.js';
import { ehObjeto, NOME_GRUPO } from './shared/schema.js';

const lerArquivo = (relativo) => readFileSync(new URL(relativo, import.meta.url), 'utf8');

// Lidos uma vez na inicialização (funciona igual no Render e na Vercel).
const paginas = {
  index: lerArquivo('./public/index.html'),
  privacidade: lerArquivo('./public/privacidade.html'),
};
const compartilhados = {
  schema: lerArquivo('./shared/schema.js'),
  listas: lerArquivo('./shared/paxtu-listas.json'),
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https://viacep.com.br https://servicodados.ibge.gov.br",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

function cabecalhosDeSeguranca(req, res, next) {
  res.set({
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  });
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000');
  next();
}

export function criarApp({ limiteEnvios = 5, tempoMinimoMs = TEMPO_MINIMO_MS } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Render e Vercel ficam atrás de um proxy: usa o IP real do visitante.
  app.use(cabecalhosDeSeguranca);

  app.get('/saude', (req, res) => res.type('text/plain').send('ok'));

  app.get('/', (req, res) => res.type('html').send(paginas.index));
  app.get('/privacidade', (req, res) => res.type('html').send(paginas.privacidade));
  app.get('/shared/schema.js', (req, res) => res.type('text/javascript').set('Cache-Control', 'no-cache').send(compartilhados.schema));
  app.get('/shared/paxtu-listas.json', (req, res) => res.type('application/json').set('Cache-Control', 'no-cache').send(compartilhados.listas));

  app.use(express.static(fileURLToPath(new URL('./public', import.meta.url)), {
    index: false,
    setHeaders: (res) => res.set('Cache-Control', 'no-cache'),
  }));

  app.post(
    '/api/enviar',
    criarLimitador({ limite: limiteEnvios }),
    (req, res, next) => (req.is('application/json')
      ? next()
      : res.status(415).json({ ok: false, erro: 'Envie os dados no formato JSON.' })),
    express.json({ limit: '100kb' }),
    async (req, res) => {
      const corpo = req.body;
      if (!ehObjeto(corpo)) return res.status(400).json({ ok: false, erro: 'Dados em formato inválido.' });

      const spam = verificarAntiSpam(corpo, { tempoMinimoMs });
      if (spam === 'honeypot') {
        console.log('envio ignorado (anti-spam)');
        return res.json({ ok: true }); // finge sucesso para não dar pistas ao robô
      }
      if (spam === 'rapido') {
        return res.status(400).json({ ok: false, erro: 'O envio foi rápido demais. Aguarde alguns segundos e tente de novo.' });
      }

      const agora = new Date();
      const erros = validarEnvio(corpo.dados, agora);
      if (erros.length) {
        return res.status(400).json({ ok: false, erro: 'Alguns dados do cadastro estão incompletos ou inválidos.', erros });
      }

      const json = gerarJson(corpo.dados, { agora, grupo: process.env.NOME_GRUPO || NOME_GRUPO });
      try {
        await enviarCadastro(json);
        console.log('envio ok');
        return res.json({ ok: true });
      } catch (erro) {
        console.error(`envio erro${erro?.code ? ` (${erro.code})` : ''}`);
        return res.status(500).json({ ok: false, erro: 'Não foi possível enviar o cadastro agora.' });
      }
    },
  );

  app.all('/api/enviar', (req, res) => res.set('Allow', 'POST').status(405).json({ ok: false, erro: 'Método não permitido.' }));

  app.use((req, res) => res.status(404).type('text/plain').send('Página não encontrada.'));

  // Erros do leitor de JSON (corpo malformado ou acima de 100 kB) e demais falhas.
  app.use((erro, req, res, next) => {
    if (erro.type === 'entity.too.large') return res.status(413).json({ ok: false, erro: 'Os dados enviados são grandes demais.' });
    if (erro.type === 'entity.parse.failed') return res.status(400).json({ ok: false, erro: 'JSON inválido.' });
    console.error('erro interno');
    return res.status(500).json({ ok: false, erro: 'Erro interno.' });
  });

  return app;
}

const app = criarApp();
export default app; // a Vercel usa este export

// Executado diretamente (npm start / npm run dev): sobe o servidor HTTP.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const faltando = ['SMTP_USER', 'SMTP_PASS', 'EMAIL_DESTINO'].filter((v) => !process.env[v]);
  if (faltando.length) console.warn(`Aviso: variáveis não definidas: ${faltando.join(', ')}. O envio de e-mail vai falhar.`);
  const porta = Number(process.env.PORT || 3000);
  app.listen(porta, () => console.log(`Formulário no ar em http://localhost:${porta}`));
}
