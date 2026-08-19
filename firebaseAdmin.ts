import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';

dotenv.config();

// Two supported ways to provide credentials:
// 1. FIREBASE_SERVICE_ACCOUNT_BASE64 - the service account JSON, base64-encoded (recommended for EC2/systemd env files)
// 2. GOOGLE_APPLICATION_CREDENTIALS - a filesystem path to the service account JSON (standard ADC lookup)
//
// Get the service account JSON from:
// Firebase Console > Project Settings > Service Accounts > Generate new private key
if (!admin.apps.length) {
  const base64Creds = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

  if (base64Creds) {
    const json = Buffer.from(base64Creds, 'base64').toString('utf-8');
    const serviceAccount = JSON.parse(json);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } else {
    // Falls back to GOOGLE_APPLICATION_CREDENTIALS env var or default ADC lookup.
    admin.initializeApp();
  }
}

export const auth = admin.auth();
export default admin;
