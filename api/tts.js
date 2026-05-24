module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });

  try {
    const ttsRes = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: 'nova',
        speed: 0.85
      })
    });
    if (!ttsRes.ok) return res.status(500).json({ error: 'TTS 오류' });
    const audioBuffer = await ttsRes.arrayBuffer();
    const base64 = Buffer.from(audioBuffer).toString('base64');
    return res.status(200).json({ audio: base64 });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
