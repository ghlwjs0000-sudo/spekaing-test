const handler = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, id, book, author, script, audioBase64, mimeType } = req.body;

  if (!script || script.trim().length < 10) {
    return res.status(400).json({ error: '스크립트가 너무 짧습니다.' });
  }
  if (!audioBase64) {
    return res.status(400).json({ error: '녹음 파일이 없습니다.' });
  }

  try {
    // 1단계: Whisper STT
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const ext = (mimeType || 'audio/webm').includes('mp4') ? 'mp4'
              : (mimeType || '').includes('ogg') ? 'ogg' : 'webm';

    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: mimeType || 'audio/webm' });
    formData.append('file', blob, `recording.${ext}`);
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

    const whisperData = await whisperRes.json();
    const transcript = whisperData.text || '';

    // 2단계: GPT-4o 문장별 분석 + 채점
    const sentences = script.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 3);

    const prompt = `You are a strict English speaking assessment AI for Korean high school students.

STUDENT INFO: ${name} / Book: "${book}" by ${author || 'unknown'}

PLANNED SCRIPT (split into sentences):
${sentences.map((s, i) => `[${i+1}] ${s}`).join('\n')}

ACTUAL SPEECH (Whisper transcript):
"${transcript || '(no speech detected)'}"

TASK:
1. For each sentence [1] to [${sentences.length}], determine if the student said it correctly.
   - "ok": said clearly and correctly
   - "partial": said but with errors or incomplete
   - "missed": not said at all

2. Score STRICTLY:
- pronunciation (0-40): Korean students typically score 15-28. Only give 35+ for near-native pronunciation.
- content (0-30): coverage of planned script
- fluency (0-20): natural delivery without long pauses
- completeness (0-10): finished the full introduction
- If transcript under 10 words: total must be under 15
- Average: 40-58, Good: 59-72, Excellent: 73-85. Above 85 is exceptional.

Respond ONLY in this exact JSON (no markdown):
{
  "transcript": "${transcript.replace(/"/g, "'")}",
  "sentenceResults": [${sentences.map((_, i) => `{"index":${i+1},"status":"ok|partial|missed","issue":"brief note in Korean if partial/missed, else null"}`).join(',')}],
  "pronunciation": INT_0_40,
  "content": INT_0_30,
  "fluency": INT_0_20,
  "completeness": INT_0_10,
  "total": INT_0_100,
  "grade": "A+ or A or B+ or B or C+ or C or D",
  "pronunciationFeedback": "Korean 2-sentence feedback",
  "contentFeedback": "Korean 2-sentence feedback",
  "fluencyFeedback": "Korean 2-sentence feedback",
  "overallFeedback": "Korean 2-sentence encouraging comment"
}
total must equal pronunciation+content+fluency+completeness exactly.`;

    const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 2000,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!gptRes.ok) {
      const e = await gptRes.json().catch(() => ({}));
      return res.status(500).json({ error: e.error?.message || `GPT 오류: ${gptRes.status}` });
    }

    const gptData = await gptRes.json();
    const result = JSON.parse(gptData.choices[0].message.content);
    result.sentences = sentences;

    return res.status(200).json(result);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

module.exports = handler;
