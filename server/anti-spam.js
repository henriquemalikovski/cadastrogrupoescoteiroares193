// Proteções simples contra envios automáticos: honeypot, tempo mínimo e limite por IP.
import rateLimit from 'express-rate-limit';

export const TEMPO_MINIMO_MS = 5000;

export function criarLimitador({ limite = 5, janelaMs = 15 * 60 * 1000 } = {}) {
  return rateLimit({
    windowMs: janelaMs,
    limit: limite,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        ok: false,
        erro: 'Muitos envios a partir desta conexão. Aguarde 15 minutos e tente de novo, ou baixe o arquivo e envie para a secretaria do grupo.',
      });
    },
  });
}

// O formulário envia { dados, website, abertoEm, enviadoEmCliente }.
// - website: campo oculto (honeypot). Pessoas não o veem; robôs costumam preencher.
// - abertoEm / enviadoEmCliente: Date.now() do navegador ao abrir a página e ao enviar.
//   Os dois vêm do mesmo relógio, então a diferença não sofre com relógio errado no aparelho.
// Retorna 'ok', 'honeypot' ou 'rapido'.
export function verificarAntiSpam(corpo, { tempoMinimoMs = TEMPO_MINIMO_MS } = {}) {
  if (typeof corpo.website === 'string' && corpo.website.trim() !== '') return 'honeypot';
  const { abertoEm, enviadoEmCliente } = corpo;
  if (!Number.isFinite(abertoEm) || !Number.isFinite(enviadoEmCliente)) return 'rapido';
  if (enviadoEmCliente - abertoEm < tempoMinimoMs) return 'rapido';
  return 'ok';
}
