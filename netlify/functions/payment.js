exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vmullhzdnosjnnwgsang.supabase.co';
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!MIDTRANS_SERVER_KEY) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Midtrans key not configured' }) };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Supabase service key not configured' }) };
  }

  // Extract JWT from Authorization header
  const authHeader = event.headers['authorization'] || event.headers['Authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Missing or invalid Authorization header' }) };
  }

  const token = authHeader.replace('Bearer ', '');

  // Verify the JWT token via Supabase Auth API
  let user_id, email;
  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_SERVICE_KEY
      }
    });

    if (!userRes.ok) {
      console.error('Supabase auth verification failed:', userRes.status);
      return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid or expired token' }) };
    }

    const userData = await userRes.json();
    user_id = userData.id;
    email = userData.email;

    if (!user_id || !email) {
      return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Could not resolve user from token' }) };
    }
  } catch (err) {
    console.error('Token verification error:', err);
    return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Token verification failed' }) };
  }

  const order_id = 'SF-PRO-' + user_id.substring(0, 8) + '-' + Date.now();

  const payload = {
    transaction_details: {
      order_id: order_id,
      gross_amount: 20000
    },
    item_details: [{
      id: 'studyflow-pro',
      price: 20000,
      quantity: 1,
      name: 'StudyFlow Pro - 1 Bulan'
    }],
    customer_details: {
      email: email
    },
    custom_field1: user_id
  };

  try {
    const authString = Buffer.from(MIDTRANS_SERVER_KEY + ':').toString('base64');

    const res = await fetch('https://app.sandbox.midtrans.com/snap/v1/transactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + authString,
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Midtrans error:', res.status, errText);
      return { statusCode: 502, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Payment gateway error' }) };
    }

    const data = await res.json();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snap_token: data.token, redirect_url: data.redirect_url })
    };
  } catch (err) {
    console.error('Payment function error:', err);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
