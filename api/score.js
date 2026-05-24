const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

async function supabasePost(table, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(body)
  });
  return res.json();
}

async function supabasePatch(table, id, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(body)
  });
  return res.json();
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { studentId, submissionId, script, audioBase64, mimeType, singleSentence, sentenceIdx } = req.body;

  if (!script || !audioBase64) return res.status(400).json({ error: '스크립트와 녹음이 필요합니다.' });

  try {
    // 1단계: Whisper STT
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const ext = (mimeType || '').includes('mp4') ? 'mp4' : (mimeType || '').includes('ogg') ? 'ogg' : 'webm';
    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer], { type: mimeType || 'audio/webm' }), `rec.${ext}`);
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: formData
    });
    if (!whisperRes.ok) {
      const e = await whisperRes.json().catch(() => ({}));
      return res.status(500).json({ error: `Whisper 오류: ${e.error?.message || whisperRes.status}` });
    }
    const { text: transcript } = await whisperRes.json();

    // 2단계: 문장 분리
    const sentences = singleSentence
      ? [script]
      : script.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 3);

    // 3단계: GPT-4o 채점
    const prompt = `You are a strict English speaking assessment AI for Korean high school students.

PLANNED SCRIPT (sentences):
${sentences.map((s, i) => `[${i+1}] ${s}`).join('\n')}

ACTUAL SPEECH (Whisper transcript):
"${transcript || '(no speech detected)'}"

TASK: For each sentence, determine status strictly:
- "ok": ONLY if the student clearly said the sentence with correct meaning and most words present
- "partial": said the sentence but with significant errors, missing words, or unclear pronunciation
- "missed": not said at all, or so different that it cannot be matched

CRITICAL RULES:
1. Compare the transcript word by word against each sentence.
2. If the transcript has NO words matching a sentence, it MUST be "missed".
3. If less than 50% of the sentence words are present in the transcript, it MUST be "missed" or "partial".
4. Do NOT mark a sentence as "ok" if it was clearly not spoken.
5. An empty or very short transcript (<5 words) means ALL sentences are "missed".
6. Do not guess or assume the student said something they did not say.

STRICT scoring:
- pronunciation (0-40): Korean students typically 15-28. 35+ only near-native.
- content (0-30): only give high scores if most sentences are "ok"
- fluency (0-20): natural delivery, no long pauses
- completeness (0-10): finished introduction fully
- Empty/short transcript (<5 words): total < 10, all sentences "missed"
- Average: 40-58, Good: 59-72, Excellent: 73-85. Above 85 is exceptional.
- partial and missed both count as needing retry. Student must retry these sentences.

Respond ONLY in JSON (no markdown):
{
  "transcript": "${(transcript||'').replace(/"/g,"'")}",
  "sentenceResults": [${sentences.map((_,i) => `{"index":${i+1},"status":"ok|partial|missed","issue":"Korean note if not ok, else null"}`).join(',')}],
  "pronunciation": INT_0_40,
  "content": INT_0_30,
  "fluency": INT_0_20,
  "completeness": INT_0_10,
  "total": INT_0_100,
  "grade": "A+ or A or B+ or B or C+ or C or D",
  "pronunciationFeedback": "Korean 2-sentence",
  "contentFeedback": "Korean 2-sentence",
  "fluencyFeedback": "Korean 2-sentence",
  "overallFeedback": "Korean 2-sentence encouraging"
}
total = pronunciation+content+fluency+completeness exactly.`;

    const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o', max_tokens: 2000,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!gptRes.ok) {
      const e = await gptRes.json().catch(() => ({}));
      return res.status(500).json({ error: e.error?.message || `GPT 오류` });
    }
    const gptData = await gptRes.json();
    const result = JSON.parse(gptData.choices[0].message.content);
    result.sentences = sentences;

    // 4단계: 시도 기록 저장
    if (submissionId && studentId) {
      const now = new Date().toISOString();
      const logs = (result.sentenceResults || []).map((sr, i) => ({
        submission_id: submissionId,
        student_id: studentId,
        sentence_index: singleSentence ? sentenceIdx : i,
        sentence_text: sentences[i] || sentences[0],
        status: sr.status,
        issue: sr.issue || null,
        attempted_at: now
      }));
      await supabasePost('attempt_logs', logs).catch(() => {});
    }

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
