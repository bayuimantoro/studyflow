exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vmullhzdnosjnnwgsang.supabase.co';
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!GROQ_API_KEY) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'API key not configured.' }) };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Supabase service key not configured.' }) };
  }

  // ── Verify JWT from Authorization header ──
  const authHeader = event.headers['authorization'] || event.headers['Authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Missing or invalid Authorization header' }) };
  }

  const token = authHeader.replace('Bearer ', '');

  let userId;
  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_SERVICE_KEY
      }
    });

    if (!userRes.ok) {
      return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid or expired token' }) };
    }

    const userData = await userRes.json();
    userId = userData.id;
    if (!userId) {
      return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Could not resolve user from token' }) };
    }
  } catch (err) {
    console.error('Token verification error:', err);
    return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Token verification failed' }) };
  }

  // ── Fetch profile for PRO status and query quota ──
  const now = new Date();
  const currentMonth = now.getFullYear() + '-' + (now.getMonth() + 1);

  let profile;
  try {
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=is_pro,query_count,query_month`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        }
      }
    );

    if (!profileRes.ok) {
      console.error('Profile fetch failed:', profileRes.status);
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Failed to fetch user profile' }) };
    }

    const profiles = await profileRes.json();
    profile = profiles[0];

    if (!profile) {
      return { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'User profile not found' }) };
    }
  } catch (err) {
    console.error('Profile fetch error:', err);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Internal error fetching profile' }) };
  }

  // ── Quota check (skip for PRO users) ──
  const isPro = profile.is_pro === true;
  let queryCount = profile.query_count || 0;
  const queryMonth = profile.query_month || '';

  // Reset count if the month has changed
  if (queryMonth !== currentMonth) {
    queryCount = 0;
  }

  if (!isPro && queryCount >= 5) {
    return {
      statusCode: 429,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'quota_exceeded', used: queryCount, limit: 5 })
    };
  }

  // ── Parse messages ──
  let messages;
  try {
    const body = JSON.parse(event.body);
    messages = body.messages;
    if (!Array.isArray(messages)) throw new Error('Invalid messages');
  } catch {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  // ── Call Groq AI ──
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
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages]
      })
    });

    if (!res.ok) {
      const errData = await res.text();
      console.error('Groq API error:', res.status, errData);
      return { statusCode: 502, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'AI service returned an error' }) };
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || 'Maaf, terjadi kesalahan.';

    // ── Increment query count in database (only for non-PRO users) ──
    if (!isPro) {
      const newCount = queryCount + 1;
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            query_count: newCount,
            query_month: currentMonth
          })
        });
      } catch (err) {
        console.error('Failed to update query count:', err);
        // Don't block the response — the AI reply was already generated
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply, used: newCount, limit: 5 })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply })
    };
  } catch (err) {
    console.error('Fetch error:', err);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Failed to reach AI service' }) };
  }
};
