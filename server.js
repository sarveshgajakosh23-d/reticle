// Reticle backend: AI translation + role-based clinical explanation.
// Run: npm install && GEMINI_API_KEY=... node server.js   (Node 18+)
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((q,r,n)=>{r.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'SAMEORIGIN'});n();});
app.get('/healthz',(q,r)=>r.json({ok:true,ai:!!(process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY)}));
const KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const PUB = path.join(__dirname, 'public');

const LANGS = { hi:'Hindi', mr:'Marathi', gu:'Gujarati', ta:'Tamil', bn:'Bengali', te:'Telugu', kn:'Kannada', pa:'Punjabi', ml:'Malayalam' };
const ROLES = {
  spec:  'an ophthalmologist or retina specialist: full technical detail, ICDR/ETDRS grading, OCT correlation',
  mbbs:  'an MBBS general physician: clinical terms but little retina jargon; include systemic work-up (HbA1c, BP, lipids, renal) and referral timing',
  ayush: 'a BHMS or BAMS (AYUSH) practitioner: plain clinical language, no imaging jargon; stress prompt referral to an ophthalmologist, continuing prescribed diabetes/BP medicines, and that supportive care must never replace or delay specialist review',
  opt:   'an optometrist: eye-care terms; image gradability, visual acuity/refraction checks, referral with image; no treatment decisions',
  chw:   'a nurse, ASHA or community health worker: very simple words, a short script to say to the patient, red-flag symptoms, how to arrange referral and follow-up'
};

app.use(express.json({ limit: '50kb' }));

// tiny per-IP rate limit + cache (no patient data is stored or logged)
const hits = new Map(), cache = new Map();
app.use('/api', (req, res, next) => {
  const now = Date.now(), h = (hits.get(req.ip) || []).filter(t => now - t < 60000);
  if (h.length >= 20) return res.status(429).json({ error: 'Too many requests, wait a minute.' });
  h.push(now); hits.set(req.ip, h); next();
});

async function claude(system, user) {
  if (!KEY) { const e = new Error('Server has no GEMINI_API_KEY set.'); e.code = 503; throw e; }
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 4000, responseMimeType: 'application/json' }
    })
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    console.error('Gemini error', r.status, t.slice(0, 300));
    const e = new Error('AI service error ' + r.status + (r.status === 404 ? ' (model not found: set GEMINI_MODEL)' : r.status === 400 || r.status === 403 ? ' (check your API key)' : r.status === 429 ? ' (quota reached, wait and retry)' : ''));
    e.code = 502; throw e;
  }
  const d = await r.json();
  const parts = (d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || [];
  const text = parts.map(p => p.text || '').join('');
  if (!text) { const e = new Error('AI returned an empty answer, try again.'); e.code = 502; throw e; }
  return text;
}
const parseJSON = s => JSON.parse(s.replace(/```json|```/g, '').trim());
const fail = (res, e) => res.status(e.code || 500).json({ error: e.message || 'Server error' });

// POST /api/translate {texts:[string], lang:'hi'} -> {texts:[string]}
app.post('/api/translate', async (req, res) => {
  try {
    const { texts, lang } = req.body;
    if (!LANGS[lang] || !Array.isArray(texts) || texts.length > 40 || texts.some(t => typeof t !== 'string' || t.length > 800))
      return res.status(400).json({ error: 'Bad request' });
    const k = lang + JSON.stringify(texts);
    if (cache.has(k)) return res.json({ texts: cache.get(k) });
    const out = parseJSON(await claude(
      `You translate patient-facing eye-screening text into ${LANGS[lang]} for people with low literacy in India. Use simple, spoken, everyday words (not formal or Sanskritised vocabulary). Keep the medical meaning exact, keep numbers, never add or remove advice. Use "?" for questions. Reply with ONLY a JSON array of strings, same length and order as the input.`,
      JSON.stringify(texts)));
    if (!Array.isArray(out) || out.length !== texts.length) throw Object.assign(new Error('Translation failed, try again.'), { code: 502 });
    cache.set(k, out); res.json({ texts: out });
  } catch (e) { fail(res, e); }
});

// POST /api/explain {role, findings:[{feature,location,confidence}], condition, confidence, quality} -> {summary, look, act}
app.post('/api/explain', async (req, res) => {
  try {
    const { role, findings, condition, confidence, quality } = req.body;
    if (!ROLES[role] || !Array.isArray(findings) || findings.length > 10) return res.status(400).json({ error: 'Bad request' });
    const data = { condition: String(condition).slice(0, 80), confidence: +confidence, quality: String(quality).slice(0, 30),
      findings: findings.map(f => ({ feature: String(f.feature).slice(0, 80), location: String(f.location).slice(0, 80), confidence: +f.confidence })) };
    const k = 'x' + role + JSON.stringify(data);
    if (cache.has(k)) return res.json(cache.get(k));
    const out = parseJSON(await claude(
      `You write decision-support explanations of an AI retinal screening result for ${ROLES[role]}. The result is screening support, NOT a diagnosis, and can be wrong; say so. Be concise and accurate; do not invent findings beyond the data; do not give drug doses; defer to local guidelines. Reply with ONLY JSON: {"summary":"2-3 sentences","look":"what this reader should check","act":"suggested next steps including referral urgency and red-flag symptoms"}.`,
      JSON.stringify(data)));
    const safe = { summary: String(out.summary), look: String(out.look), act: String(out.act) };
    cache.set(k, safe); res.json(safe);
  } catch (e) { fail(res, e); }
});

// Serve your existing page and auto-inject the client add-on (no edits to your HTML needed)
app.get(['/', '/index.html'], (req, res) => {
  const f = path.join(PUB, 'index.html');
  if (!fs.existsSync(f)) return res.status(404).send('Put your Reticle index.html in /public');
  res.type('html').send(fs.readFileSync(f, 'utf8').replace('</body>', '<script src="/reticle-addon.js"></script></body>'));
});
app.use(express.static(PUB, { index: false }));
if(!fs.existsSync(path.join(PUB,'index.html'))) console.warn('WARNING: public/index.html is missing - copy your Reticle page there.');
if(!KEY) console.warn('WARNING: GEMINI_API_KEY not set - translation and doctor explanations will be disabled.');
setInterval(()=>{const n=Date.now();for(const [k,v] of hits)if(!v.some(t=>n-t<60000))hits.delete(k);if(cache.size>500)cache.clear();},300000).unref();
app.listen(process.env.PORT || 3000, () => console.log('Reticle running on port ' + (process.env.PORT || 3000)));