// Smol Claims — AI Judge endpoint
// Takes a grievance + judge_style; returns a structured verdict and saves to Turso.

const TURSO_URL = process.env.TURSO_DB_URL;
const TURSO_TOKEN = process.env.TURSO_DB_TOKEN;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

const STYLE_PROMPTS = {
  'standard': 'Issue a measured, formal ruling in the voice of a fair-minded magistrate. Mock-legalese is allowed for color but be substantive.',
  'judge-judy': 'Channel Judge Judy: blunt, scolding, no-nonsense, slightly sarcastic. Short sentences. Cut through the BS.',
  'supreme-court': 'Write in the voice of a Supreme Court opinion: stately, citing imaginary precedent like "Kramer v. Kramer (1979)" and "Roommate v. Hummus (2024)". Use phrases like "We hold...", "It is so ordered...".',
  'medieval': 'Issue the ruling as a medieval tribunal would: thee, thou, "Hear ye!", proclamations, references to dukes and serfs. Funny but readable.',
  'midwestern-mom': 'Voice of a passive-aggressive midwestern mom: "Well, that\'s not great, sweetie", "I just think we could be better", with subtle digs and a casserole reference.'
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const grievance = (body.grievance || '').trim();
  const judgeStyle = body.judge_style || 'standard';

  if (grievance.length < 30) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Grievance too short. Provide at least 30 characters of evidence.' }) };
  }
  if (grievance.length > 1500) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Grievance too long. Edit it down to 1200 characters.' }) };
  }

  const stylePrompt = STYLE_PROMPTS[judgeStyle] || STYLE_PROMPTS['standard'];

  const systemPrompt = `You are a humor-product AI Judge for "Smol Claims Court" — a playful platform that issues mock rulings on petty grievances (roommate disputes, group-chat drama, partner annoyances, friend faux pas).

YOUR TASK: Read the plaintiff's statement and produce a JSON verdict.

VOICE INSTRUCTION FOR THIS RULING:
${stylePrompt}

CRITICAL RULES:
- This is humor, not real legal advice. The output must be witty, fair, and quote-worthy.
- REDACT all real names, addresses, employer names. Replace with descriptors like "the roommate" or "the partner".
- Issue a CLEAR verdict: either FOR PLAINTIFF (they were wronged) or AGAINST PLAINTIFF (they are being unreasonable).
- DO NOT moralize, lecture about communication, or be preachy. Be entertaining.
- Stay PG-13. No slurs, no harassment, no sexual content, no real-world violence.
- If the grievance describes actual abuse, illegal activity, or self-harm: respond with verdict "REFERRED TO HIGHER COURT" and a remedy directing them to professional help (no humor).

OUTPUT EXACTLY THIS JSON (no markdown, no extra prose, no code fences):
{
  "title": "string — a short, punchy case title in the form 'Plaintiff v. Subject' or 'In Re: ...'. 4-9 words. Make it funny.",
  "verdict_for_plaintiff": true | false,
  "verdict_headline": "string — a single dramatic sentence summarizing the ruling. 8-15 words. Quote-worthy.",
  "applicable_law": "string — 1-2 sentences citing made-up but plausible 'principles' or 'doctrines' that apply here. Style allowed: 'Under the doctrine of [X]...' or 'Per the universal etiquette of [Y]...'",
  "verdict_text": "string — 3-5 sentences of reasoning. The meat of the ruling. Witty, specific, references the facts.",
  "dissent": "string — 1-2 sentences offering the counter-argument. Acknowledge the other side fairly.",
  "recommended_remedy": "string — 1-2 sentences of actionable advice. What should the plaintiff actually DO."
}`;

  const userPrompt = `PLAINTIFF'S STATEMENT:
"${grievance}"

Now issue the ruling. Return only the JSON object.`;

  let verdict;
  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { temperature: 0.85, maxOutputTokens: 800, responseMimeType: 'application/json' }
        })
      }
    );
    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      console.error('Gemini error:', geminiRes.status, errBody);
      return { statusCode: 502, body: JSON.stringify({ error: 'The judge is in chambers. Try again in a moment.' }) };
    }
    const geminiData = await geminiRes.json();
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    verdict = JSON.parse(text);
  } catch (err) {
    console.error('Gemini parse error:', err);
    return { statusCode: 502, body: JSON.stringify({ error: 'The court could not deliver a coherent ruling. Try rephrasing your case.' }) };
  }

  // Validate verdict shape
  const required = ['title', 'verdict_headline', 'applicable_law', 'verdict_text', 'dissent', 'recommended_remedy'];
  for (const field of required) {
    if (typeof verdict[field] !== 'string' || !verdict[field].trim()) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Incomplete ruling. Try again.' }) };
    }
  }

  // Generate case ID
  const caseId = generateCaseId();

  // Save to Turso
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
              sql: 'INSERT INTO smol_claims_cases (case_id, title, plaintiff_statement, verdict_for_plaintiff, verdict_text, applicable_law, dissent, recommended_remedy, judge_style) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
              args: [
                { type: 'text', value: caseId },
                { type: 'text', value: verdict.title },
                { type: 'text', value: grievance },
                { type: 'integer', value: verdict.verdict_for_plaintiff ? '1' : '0' },
                { type: 'text', value: verdict.verdict_headline + '||' + verdict.verdict_text },
                { type: 'text', value: verdict.applicable_law },
                { type: 'text', value: verdict.dissent },
                { type: 'text', value: verdict.recommended_remedy },
                { type: 'text', value: judgeStyle }
              ]
            }
          },
          { type: 'close' }
        ]
      })
    });
    if (!tursoRes.ok) {
      console.error('Turso save failed:', await tursoRes.text());
    }
  } catch (err) {
    console.error('Turso save exception:', err);
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({
      case_id: caseId,
      title: verdict.title,
      verdict_for_plaintiff: !!verdict.verdict_for_plaintiff,
      verdict_headline: verdict.verdict_headline,
      verdict_text: verdict.verdict_text,
      applicable_law: verdict.applicable_law,
      dissent: verdict.dissent,
      recommended_remedy: verdict.recommended_remedy,
      judge_style: judgeStyle,
      uphold_votes: 0,
      overturn_votes: 0
    })
  };
};

function generateCaseId() {
  const year = new Date().getFullYear().toString().slice(-2);
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `SC-${year}-${rand}`;
}
