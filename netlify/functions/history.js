// Smol Claims — fetch past cases (docket) or a single case by ID

const TURSO_URL = process.env.TURSO_DB_URL;
const TURSO_TOKEN = process.env.TURSO_DB_TOKEN;

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const caseId = (params.case || '').trim();
  const limit = Math.min(parseInt(params.limit) || 12, 50);

  let sql, args;
  if (caseId) {
    sql = 'SELECT case_id, title, verdict_for_plaintiff, verdict_text, applicable_law, dissent, recommended_remedy, judge_style, uphold_votes, overturn_votes, created_at FROM smol_claims_cases WHERE case_id = ?';
    args = [{ type: 'text', value: caseId }];
  } else {
    sql = 'SELECT case_id, title, verdict_for_plaintiff, judge_style, uphold_votes, overturn_votes, created_at FROM smol_claims_cases ORDER BY created_at DESC LIMIT ?';
    args = [{ type: 'integer', value: String(limit) }];
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
          { type: 'execute', stmt: { sql, args } },
          { type: 'close' }
        ]
      })
    });
    if (!tursoRes.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Could not load history' }) };
    }
    const data = await tursoRes.json();
    const rows = data.results[0]?.response?.result?.rows || [];
    const cols = data.results[0]?.response?.result?.cols || [];

    if (caseId) {
      if (!rows.length) return { statusCode: 404, body: JSON.stringify({ error: 'Case not found' }) };
      const c = rowToObj(rows[0], cols);
      const [headline, ...rest] = (c.verdict_text || '').split('||');
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          case: {
            case_id: c.case_id,
            title: c.title,
            verdict_for_plaintiff: parseInt(c.verdict_for_plaintiff) === 1,
            verdict_headline: headline || '',
            verdict_text: rest.join('||') || '',
            applicable_law: c.applicable_law,
            dissent: c.dissent,
            recommended_remedy: c.recommended_remedy,
            judge_style: c.judge_style,
            uphold_votes: parseInt(c.uphold_votes) || 0,
            overturn_votes: parseInt(c.overturn_votes) || 0,
            created_at: c.created_at
          }
        })
      };
    }

    const cases = rows.map(r => {
      const c = rowToObj(r, cols);
      return {
        case_id: c.case_id,
        title: c.title,
        verdict_for_plaintiff: parseInt(c.verdict_for_plaintiff) === 1,
        judge_style: c.judge_style,
        uphold_votes: parseInt(c.uphold_votes) || 0,
        overturn_votes: parseInt(c.overturn_votes) || 0,
        created_at: c.created_at
      };
    });
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ cases })
    };
  } catch (err) {
    console.error('History error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Server error' }) };
  }
};

function rowToObj(row, cols) {
  const obj = {};
  cols.forEach((col, i) => {
    obj[col.name] = row[i]?.value ?? null;
  });
  return obj;
}
