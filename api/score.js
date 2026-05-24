const handler = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, id, book, author, script } = req.body;

  if (!script || script.trim().length < 10) {
    return res.status(400).json({ error: '스크립트가 너무 짧습니다.' });
  }

  const prompt = `You are an English speaking assessment AI for Korean high school students.

The student was asked to introduce a book they read, in English.

STUDENT INFO:
- Name: ${name} / ID: ${id}
- Book: "${book}" by ${author || 'unknown'}

STUDENT'S PLANNED SCRIPT:
"""
${script}
"""

Since audio processing is simulated in this environment, generate a realistic assessment as if you evaluated the student's spoken delivery. Create a plausible spoken transcript with natural variations (minor hesitations, small omissions, pronunciation approximations) then assess it.

Respond ONLY in this exact JSON format with NO markdown fences, NO extra text:
{"simulatedTranscript":"realistic spoken version with natural variations from the script","pronunciation":INT_0_40,"content":INT_0_30,"fluency":INT_0_20,"completeness":INT_0_10,"total":INT_0_100,"grade":"A+ or A or B+ or B or C+ or C or D","pronunciationFeedback":"Korean 2-sentence feedback on pronunciation","contentFeedback":"Korean 2-sentence feedback on content coverage","fluencyFeedback":"Korean 2-sentence feedback on fluency","overallFeedback":"Korean 2-sentence encouraging overall comment"}

total must equal pronunciation+content+fluency+completeness exactly.
Scoring guide: strong script/delivery → 78-90, average → 60-77, weak → 38-59.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
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

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(500).json({ error: err.error?.message || `OpenAI 오류: ${response.status}` });
    }

    const data = await response.json();
    const text = data.choices[0].message.content;
    const result = JSON.parse(text);

    return res.status(200).json(result);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

module.exports = handler;
