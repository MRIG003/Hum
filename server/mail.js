// Sending email through Resend's web API. With no key set (local runs, tests) nothing is sent and
// the message is only noted in the log, so every feature that emails still works without a key.
// The key is read from the environment and never logged.

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const createMailer = ({
  apiKey = process.env.ENGAGE_RESEND_API_KEY,
  from = process.env.ENGAGE_MAIL_FROM,
  fetchImpl = globalThis.fetch,
  log = console,
} = {}) => {
  const enabled = Boolean(apiKey && from);
  return {
    enabled,
    async send({ to, subject, text, html }) {
      if (!enabled) {
        log.log(`Email not sent (no ENGAGE_RESEND_API_KEY or ENGAGE_MAIL_FROM set): "${subject}"`);
        return { sent: false };
      }
      try {
        const res = await fetchImpl('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: [to], subject, text, html }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
          log.error(`Email failed: Resend answered ${res.status}`);
          return { sent: false };
        }
        return { sent: true };
      } catch (error) {
        log.error(`Email failed: ${error.name}`);
        return { sent: false };
      }
    },
  };
};

const shell = (title, bodyHtml) => `<!doctype html><html><body style="margin:0;background:#f6f5f0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1c1c1a">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
<div style="font-weight:700;font-size:18px;margin-bottom:18px"><span style="display:inline-block;width:14px;height:14px;border-radius:4px;background:#2563c9;margin-right:8px;vertical-align:-1px"></span>Engage</div>
<div style="background:#fff;border:1px solid #d6d6d0;border-radius:12px;padding:22px">
<h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(title)}</h1>${bodyHtml}</div>
<p style="font-size:12px;color:#6b6a63;margin-top:14px">You got this email because of an action on Engage. If that was not you, you can ignore it.</p>
</div></body></html>`;

const button = (href, label) =>
  `<p style="margin:18px 0"><a href="${escapeHtml(href)}" style="background:#2563c9;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600;display:inline-block">${escapeHtml(label)}</a></p><p style="font-size:12px;color:#6b6a63;word-break:break-all">Or paste this link into your browser:<br>${escapeHtml(href)}</p>`;

export const resetEmail = (link) => ({
  subject: 'Reset your Engage password',
  text: `Reset your Engage password with this link. It works once and expires in 30 minutes:\n\n${link}\n\nIf you did not ask for this, ignore this email. Your password stays as it is.`,
  html: shell('Reset your password', `<p>Use the button to choose a new password. The link works once and expires in 30 minutes.</p>${button(link, 'Choose a new password')}<p style="font-size:13px">If you did not ask for this, ignore this email. Your password stays as it is.</p>`),
});

export const verifyEmail = (link) => ({
  subject: 'Confirm your email for Engage',
  text: `Confirm your email address for Engage with this link. It expires in 24 hours:\n\n${link}`,
  html: shell('Confirm your email', `<p>Confirm this address so Engage can email you meeting summaries and password resets.</p>${button(link, 'Confirm my email')}`),
});

const minutes = (ms) => `${Math.max(0, Math.round(ms / 60_000))} min`;

export const summaryEmail = ({ title, summary: s, link }) => {
  const lines = [
    `Duration: ${minutes(s.durationMs)}`,
    `Took part in Engage: ${s.participated} of ${s.joined} (${s.participationRate}%)`,
    `Average room engagement: ${s.averageEngagement ?? 'n/a'}${s.averageEngagement === null ? '' : '%'}`,
    `Open questions left: ${s.unanswered}`,
  ];
  const quiet = (s.people ?? []).filter((p) => !p.actions).map((p) => p.name);
  const top = (s.people ?? []).filter((p) => p.actions).sort((a, b) => b.actions - a.actions).slice(0, 3).map((p) => p.name);
  const insights = s.coach?.insights ?? [];
  const textParts = [
    `${title}: Engage summary`, '', ...lines, '',
    quiet.length ? `No activity in Engage: ${quiet.join(', ')}` : 'Everyone who joined took part.',
    top.length ? `Most active: ${top.join(', ')}` : '',
    '', 'Coach summary (only you get this)',
    ...insights.map((i) => `- ${i.title} ${i.detail}`),
    `Try this next time: ${s.coach?.next ?? ''}`,
    ...(s.topQuestions?.length ? ['', 'Top questions', ...s.topQuestions.map((q) => `- ${q.text} (${q.votes} votes${q.answered ? ', answered' : ''})`)] : []),
    '', `Full summary and CSV: ${link}`,
  ].filter((line, i, all) => line !== '' || all[i - 1] !== '');
  const li = (items) => `<ul style="padding-left:18px;margin:6px 0">${items.map((x) => `<li style="margin:3px 0">${x}</li>`).join('')}</ul>`;
  const html = shell(`${title}: summary`, `
    ${li(lines.map(escapeHtml))}
    <p><b>${quiet.length ? 'No activity in Engage' : 'Participation'}:</b> ${quiet.length ? escapeHtml(quiet.join(', ')) : 'everyone who joined took part.'}</p>
    ${top.length ? `<p><b>Most active:</b> ${escapeHtml(top.join(', '))}</p>` : ''}
    <h2 style="font-size:16px;margin:18px 0 6px">Coach summary <span style="font-weight:400;font-size:12px;color:#6b6a63">only you get this</span></h2>
    ${insights.length ? li(insights.map((i) => `<b>${escapeHtml(i.title)}</b> ${escapeHtml(i.detail)}`)) : '<p>Nothing needs attention. Engagement held up well.</p>'}
    <p><b>Try this next time:</b> ${escapeHtml(s.coach?.next ?? '')}</p>
    ${s.topQuestions?.length ? `<h2 style="font-size:16px;margin:18px 0 6px">Top questions</h2>${li(s.topQuestions.map((q) => `${escapeHtml(q.text)} <span style="color:#6b6a63">(${q.votes} votes${q.answered ? ', answered' : ''})</span>`))}` : ''}
    ${button(link, 'Open the full summary')}`);
  return { subject: `Engage summary: ${title}`.replace(/[\r\n]+/g, ' ').slice(0, 120), text: textParts.join('\n'), html };
};
