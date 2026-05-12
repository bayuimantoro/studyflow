const crypto = require('crypto');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vmullhzdnosjnnwgsang.supabase.co';
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!MIDTRANS_SERVER_KEY || !SUPABASE_SERVICE_KEY) {
    console.error('Missing env vars: MIDTRANS_SERVER_KEY or SUPABASE_SERVICE_KEY');
    return { statusCode: 500, body: 'Server misconfigured' };
  }

  let notification;
  try {
    notification = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  // Verify signature
  const { order_id, status_code, gross_amount, signature_key, transaction_status, fraud_status } = notification;
  const expectedSig = crypto
    .createHash('sha512')
    .update(order_id + status_code + gross_amount + MIDTRANS_SERVER_KEY)
    .digest('hex');

  if (signature_key !== expectedSig) {
    console.error('Invalid signature');
    return { statusCode: 403, body: 'Invalid signature' };
  }

  // Check if payment is successful
  const isSuccess =
    (transaction_status === 'capture' && fraud_status === 'accept') ||
    transaction_status === 'settlement';

  if (!isSuccess) {
    console.log('Transaction not successful:', transaction_status, fraud_status);
    return { statusCode: 200, body: 'OK - not a success status' };
  }

  // Extract user_id from custom_field1
  const user_id = notification.custom_field1;
  if (!user_id) {
    console.error('No user_id in custom_field1');
    return { statusCode: 200, body: 'OK - no user_id' };
  }

  // Update profile to Pro (30 days)
  try {
    const proExpiresAt = new Date();
    proExpiresAt.setDate(proExpiresAt.getDate() + 30);

    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user_id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        is_pro: true,
        pro_expires_at: proExpiresAt.toISOString()
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Supabase update failed:', res.status, errText);
      return { statusCode: 500, body: 'Failed to update profile' };
    }

    console.log('User upgraded to Pro:', user_id, 'expires:', proExpiresAt.toISOString());
    return { statusCode: 200, body: 'OK - user upgraded' };
  } catch (err) {
    console.error('Error updating profile:', err);
    return { statusCode: 500, body: 'Internal error' };
  }
};
