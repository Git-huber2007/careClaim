import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import { config } from './config.js';

const key = config.geminiApiKey;
if (!key) {
  console.error('❌ No GEMINI_API_KEY found in backend/.env');
  process.exit(1);
}

const masked = key.slice(0, 8) + '...' + key.slice(-4);
console.log(`\n🔑 Checking key: ${masked}\n`);

const ai = new GoogleGenAI({ apiKey: key });

async function checkModel(model) {
  process.stdout.write(`Testing [${model}]... `);
  try {
    const res = await ai.models.generateContent({
      model,
      contents: 'Respond with the word "READY" only.'
    });
    console.log(`✅ WORKS! Response: "${res.text?.trim()}"`);
    return true;
  } catch (err) {
    const msg = err.message || JSON.stringify(err);
    if (/no longer available|not found/i.test(msg)) {
      console.log(`❌ BLOCKED BY GOOGLE: Model retired/not available to this key.`);
    } else if (/quota|exhausted|429/i.test(msg)) {
      console.log(`⚠️ QUOTA LIMIT: Rate limit exceeded.`);
    } else {
      console.log(`❌ FAILED: ${msg.slice(0, 120)}`);
    }
    return false;
  }
}

async function run() {
  console.log('--- Specific Model Tests ---');
  await checkModel('gemini-2.5-flash');
  await checkModel('gemini-3.5-flash');
  await checkModel('gemini-3.5-flash-lite');

  console.log('\n--- Querying Google for All Available Models ---');
  try {
    const list = await ai.models.list();
    const names = [];
    for await (const m of list) {
      if (m.supportedActions?.includes('generateContent')) {
        names.push(m.name.replace('models/', ''));
      }
    }
    console.log(`Google returned ${names.length} supported models for your project.`);
    console.log('Active Flash models on your account:\n' + names.filter(n => n.includes('flash')).map(n => `  • ${n}`).join('\n'));
  } catch (e) {
    console.error('Failed to list models:', e.message);
  }
}

run();
