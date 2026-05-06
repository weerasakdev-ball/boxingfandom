// Claude-powered HTML parser — replaces brittle CSS selectors and Puppeteer
const Anthropic = require('@anthropic-ai/sdk');

let _client = null;
function client() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

// Extract fight history from raw HTML using Claude
async function parseFightHistory(html, fighterName, source) {
  const truncated = html.length > 60000 ? html.substring(0, 60000) : html;

  const message = await client().messages.create({
    model:      'claude-opus-4-7',
    max_tokens: 4096,
    thinking:   { type: 'adaptive' },
    messages: [{
      role:    'user',
      content: `You are parsing a ${source} fighter profile page to extract fight history.

Fighter: "${fighterName}"

Extract ALL fight history rows from the HTML below and return a JSON array.
Each element must follow this exact schema:
{
  "result":           "Win" | "Loss" | "Draw" | "",
  "discipline_en":    "Muay Thai" | "Kickboxing" | "MMA",
  "method_en":        "KO/TKO" | "Submission" | "Unanimous Decision" | "Split Decision" | "Majority Decision" | "Decision",
  "round":            number,
  "time":             "M:SS" or "N/A",
  "opponent_th":      "Thai name or empty string",
  "opponent_en":      "English name or empty string",
  "opponent_country": "Country in English",
  "date":             "Mon DD, YYYY (Gregorian)",
  "rating":           5,
  "event_en":         "Event name"
}

Rules:
- Convert Buddhist Era years to Gregorian (subtract 543).
- Thai month abbreviations: ม.ค.→Jan, ก.พ.→Feb, มี.ค.→Mar, เม.ย.→Apr, พ.ค.→May, มิ.ย.→Jun, ก.ค.→Jul, ส.ค.→Aug, ก.ย.→Sep, ต.ค.→Oct, พ.ย.→Nov, ธ.ค.→Dec.
- Upcoming fights have result "".
- Return ONLY the raw JSON array — no markdown fences, no extra text.

HTML:
${truncated}`,
    }],
  });

  const text = message.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error(`Claude returned no JSON array. Preview: ${text.substring(0, 300)}`);
  return JSON.parse(match[0]);
}

// Produce a human-readable pipeline summary using Claude
async function summarisePipelineRun(stats) {
  const message = await client().messages.create({
    model:      'claude-opus-4-7',
    max_tokens: 512,
    thinking:   { type: 'adaptive' },
    messages: [{
      role:    'user',
      content: `You are a summariser for the BoxingFandom daily data pipeline.

Pipeline run stats:
${JSON.stringify(stats, null, 2)}

Write a concise 2-3 sentence summary in English suitable for a Slack notification or log header.
Include: total fighters processed, how many were updated, any notable errors.`,
    }],
  });

  return message.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim();
}

module.exports = { parseFightHistory, summarisePipelineRun };
