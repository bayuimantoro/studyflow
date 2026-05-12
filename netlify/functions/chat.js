exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'API key not configured. Set GROQ_API_KEY in Netlify environment variables.' })
    };
  }

  let messages;
  try {
    const body = JSON.parse(event.body);
    messages = body.messages;
    if (!Array.isArray(messages)) throw new Error('Invalid messages');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const SYSTEM_PROMPT = 'You are StudyFlow AI, a study productivity assistant for Indonesian students. Help users with study schedules, time management, and student budgeting. Reply in Bahasa Indonesia, max 3-4 sentences, friendly and practical. No markdown formatting, no tables, no bullet points, no emojis.';

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        max_tokens: 500,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages
        ]
      })
    });

    if (!res.ok) {
      const errData = await res.text();
      console.error('Groq API error:', res.status, errData);
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'AI service returned an error' })
      };
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || 'Maaf, terjadi kesalahan.';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply })
    };
  } catch (err) {
    console.error('Fetch error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to reach AI service' })
    };
  }
};
