// Smol Claims — email subscription endpoint

const TURSO_URL = process.env.TURSO_DB_URL;
const TURSO_TOKEN = process.env.TURSO_DB_TOKEN;
const IDEA_SLUG = process.env.IDEA_SLUG || 'smol-claims';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const email = (body.email || '').trim().toLowerCase();
  const source = (body.source || 'tool').slice(0, 100);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Please provide a valid email' }) };
  }

  try {
    const tursoRes = await fetch(`${TURSO_URL.replace(/^libsql:\/\//, 'https://')}/v2/pipeline`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TURSO_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          {
            type: 'execute',
            stmt: {
              sql: 'INSERT INTO subscribers (email, idea_slug, source) VALUES (?, ?, ?) ON CONFLICT(email) DO NOTHING',
              args: [
                { type: 'text', value: email },
                { type: 'text', value: IDEA_SLUG },
                { type: 'text', value: source }
              ]
            }
          },
          { type: 'close' }
        ]
      })
    });
    if (!tursoRes.ok) {
      const errBody = await tursoRes.text();
      console.error('Subscribe failed:', errBody);
      return { statusCode: 502, body: JSON.stringify({ error: 'Subscription failed' }) };
    }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: true })
    };
  } catch (err) {
    console.error('Subscribe error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Server error' }) };
  }
};
