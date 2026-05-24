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
    // 1단계: Whisper로 음성 → 텍스트 변환
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

    // 2단계: GPT-4o로 채점
    const prompt = `You are an English speaking assessment AI for Korean high school students.

The student was asked to introduce a book they read in English.

STUDENT INFO:
- Name: ${name} / ID: ${id}
- Book: "${book}" by ${author || 'unknown'}

STUDENT'S PLANNED SCRIPT:
"""
${script}
"""

STUDENT'S ACTUAL SPEECH (transcribed by Whisper):
"""
${transcript || '(no speech detected)'}
"""

Compare the actual speech to the planned script and assess the student's performance.

Scoring criteria:
- pronunciation (0-40): accuracy of pronunciation based on transcription quality and likely errors
- content (0-30): how well the actual speech covers the planned script content
- fluency (0-20): smoothness, pace, and natural delivery
- completeness (0-10): whether the student finished the full introduction

If transcript is empty or very short (under 10 words), give very low scores (total under 20).

Respond ONLY in this exact JSON format with NO markdown fences:
{"transcript":"${transcript}","pronunciation":INT_0_40,"content":INT_0_30,"fluency":INT_0_20,"completeness":INT_0_10,"total":INT_0_100,"grade":"A+ or A or B+ or B or C+ or C or D","pronunciationFeedback":"Korean 2-sentence feedback","contentFeedback":"Korean 2-sentence feedback","fluencyFeedback":"Korean 2-sentence feedback","overallFeedback":"Korean 2-sentence encouraging comment"}

total must equal pronunciation+content+fluency+completeness exactly.`;

    const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 1000,
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
    result.simulatedTranscript = transcript;

    return res.status(200).json(result);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

module.exports = handler;
