const sqlite3 = require('sqlite3');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;

const userDataPath = path.join(process.env.APPDATA, 'wordpress-autopilot-bulk-article-writer-pro');
const keyPath = path.join(userDataPath, '.security.key');
const keyHex = fs.readFileSync(keyPath, 'utf8').trim();
const encryptionKey = Buffer.from(keyHex, 'hex');

function decrypt(cipherText) {
  try {
    const parts = cipherText.split(':');
    if (parts.length !== 3) return cipherText;
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    return cipherText;
  }
}

const dbPath = path.join(userDataPath, 'database', 'stackorbit_writer.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  db.get("SELECT * FROM api_keys WHERE provider = 'openai' LIMIT 1", [], async (err, row) => {
    const apiKey = decrypt(row.api_key);
    db.close();

    const url = 'https://api.openai.com/v1/images/generations';
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };

    console.log('\n--- Test 3: gpt-image-2 without response_format ---');
    try {
      const res = await axios.post(url, {
        model: 'gpt-image-2',
        prompt: 'A photorealistic beautiful sunset over a lake, high resolution',
        n: 1,
        size: '1792x1024'
      }, { headers, timeout: 25000 });
      console.log('Test 3 Success! Keys in response data:', Object.keys(res.data));
      console.log('Result data:', JSON.stringify(res.data));
    } catch (err) {
      console.error('Test 3 Failed:');
      if (err.response) {
        console.error(`- Status: ${err.response.status}`);
        console.error(`- Data:`, JSON.stringify(err.response.data));
      } else {
        console.error(`- Message: ${err.message}`);
      }
    }
  });
});
