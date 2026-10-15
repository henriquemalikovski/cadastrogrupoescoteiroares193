// Montagem e envio do e-mail para a secretaria (Nodemailer + SMTP).
// O corpo traz só um resumo; os dados completos (inclusive a ficha médica) vão apenas no anexo JSON.
import nodemailer from 'nodemailer';
import { formatarData, formatarTelefone, nomeArquivo } from '../shared/schema.js';

let transporte = null;

function obterTransporte() {
  if (!transporte) {
    const porta = Number(process.env.SMTP_PORT || 465);
    transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: porta,
      secure: porta === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporte;
}

// Permite trocar o transporte nos testes (ex.: { sendMail: async () => ({}) }).
export function definirTransporte(novo) {
  transporte = novo;
}

export function temAlertaDeSaude(json) {
  const f = json.fichaMedica ?? {};
  return Boolean(
    f.alergias?.length || f.usaMedicamento === true || f.medicamentos?.length || f.problemaCronico === true
    || f.condicoes?.length || f.comportamentos?.length || f.transtorno === true || f.restricaoAlimentar === true,
  );
}

const escaparHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function montarEmail(json, { destino, remetente }) {
  const ig = json.informacoesGerais;
  const ramo = ig.ramoPretendido ?? 'ramo não informado';
  const principal = json.responsaveis[0];
  const idade = ig.idadeNoEnvio === null ? '—' : `${ig.idadeNoEnvio} anos`;
  const linhas = [
    ['Nome', ig.nome],
    ['Data de nascimento', formatarData(ig.dataNascimento)],
    ['Idade', idade],
    ['Ramo pretendido', ramo],
    principal
      ? ['Responsável principal', `${principal.nome} (${principal.parentesco})`]
      : ['Responsável principal', 'Não informado (associado maior de idade)'],
    ['Telefone', formatarTelefone(principal ? principal.celular : ig.celular)],
  ];
  const alerta = temAlertaDeSaude(json)
    ? 'ATENÇÃO: a ficha médica tem informações de saúde que precisam ser lidas. Consulte o anexo antes das atividades.'
    : null;
  const rodape = 'Os dados completos, incluindo a ficha médica, estão no arquivo JSON anexo. Trate este e-mail como confidencial (LGPD).';

  const texto = [
    `Novo pré-cadastro recebido pelo formulário do ${json.grupo}.`,
    '',
    ...linhas.map(([k, v]) => `${k}: ${v}`),
    '',
    ...(alerta ? [`*** ${alerta} ***`, ''] : []),
    rodape,
  ].join('\n');

  const html = `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;font-size:15px;color:#1b1b1b">
<p>Novo pré-cadastro recebido pelo formulário do ${escaparHtml(json.grupo)}.</p>
<table cellpadding="4" style="border-collapse:collapse">
${linhas.map(([k, v]) => `<tr><th align="left" style="padding-right:12px">${escaparHtml(k)}</th><td>${escaparHtml(v)}</td></tr>`).join('\n')}
</table>
${alerta ? `<p style="background:#fff3c4;border-left:6px solid #d4a300;padding:12px;font-weight:bold">${escaparHtml(alerta)}</p>` : ''}
<p style="color:#555">${escaparHtml(rodape)}</p>
</body></html>`;

  return {
    from: remetente,
    to: destino,
    subject: `Novo associado: ${ig.nome} — ${ramo}`,
    text: texto,
    html,
    attachments: [{
      filename: nomeArquivo(json),
      content: Buffer.from(JSON.stringify(json, null, 2), 'utf8'),
      contentType: 'application/json; charset=utf-8',
    }],
  };
}

export async function enviarCadastro(json) {
  const mensagem = montarEmail(json, {
    destino: process.env.EMAIL_DESTINO,
    remetente: process.env.EMAIL_REMETENTE || process.env.SMTP_USER,
  });
  await obterTransporte().sendMail(mensagem);
}
