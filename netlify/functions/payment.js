exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;
  if (!MIDTRANS_SERVER_KEY) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Midtrans key not configured' }) };
  }

  let user_id, email;
  try {
    const body = JSON.parse(event.body);
    user_id = body.user_id;
    email = body.email;
    if (!user_id || !email) throw new Error('Missing fields');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request. Required: user_id, email' }) };
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
