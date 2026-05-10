// Smol Claims — jury vote endpoint

const TURSO_URL = process.env.TURSO_DB_URL;
const TURSO_TOKEN = process.env.TURSO_DB_TOKEN;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const caseId = (body.case_id || '').trim();
  const vote = body.vote;
  if (!/^SC-\d{2}-[A-Z0-9]{5}$/.test(caseId)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid case ID' }) };
  }
  if (vote !== 'uphold' && vote !== 'overturn') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Vote must be uphold or overturn' }) };
  }

  const col = vote === 'uphold' ? 'uphold_votes' : 'overturn_votes';

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
              sql: `UPDATE smol_claims_cases SET ${col} = ${col} + 1 WHERE case_id = ?`,
              args: [{ type: 'text', value: caseId }]
            }
          },
          {
            type: 'execute',
            stmt: {
              sql: 'SELECT uphold_votes, overturn_votes FROM smol_claims_cases WHERE case_id = ?',
              args: [{ type: 'text', value: caseId }]
            }
          },
          { type: 'close' }
        ]
      })
    });
    if (!tursoRes.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Vote could not be recorded' }) };
    }
    const data = await tursoRes.json();
    const row = data.results[1]?.response?.result?.rows?.[0];
    if (!row) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Case not found' }) };
    }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        uphold_votes: parseInt(row[0].value),
        overturn_votes: parseInt(row[1].value)
      })
    };
  } catch (err) {
    console.error('Vote error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Server error' }) };
  }
};
