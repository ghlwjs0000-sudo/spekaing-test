const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { fileBase64, filename, studentId, fileType } = req.body;
  if (!fileBase64 || !filename || !studentId) {
    return res.status(400).json({ error: '필수 항목 누락' });
  }

  try {
    const base64Data = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
    const buffer = Buffer.from(base64Data, 'base64');

    const ext = filename.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    const path = `uploads/${fileType}_${Date.now()}.${ext}`;

    const uploadRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/submissions/${path}`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': getContentType(filename),
          'x-upsert': 'true'
        },
        body: buffer
      }
    );

    if (!uploadRes.ok) {
      const e = await uploadRes.text();
      console.error('Storage 오류:', e);
      return res.status(500).json({ error: `Storage 업로드 실패: ${e}` });
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/submissions/${path}`;
    return res.status(200).json({ success: true, url: publicUrl, path });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function getContentType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const types = {
    'webm': 'audio/webm',
    'ogg': 'audio/ogg',
    'mp4': 'audio/mp4',
    'mp3': 'audio/mpeg',
    'm4a': 'audio/mp4',
    'pdf': 'application/pdf',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
    'png': 'image/png', 'gif': 'image/gif',
    'webp': 'image/webp',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'hwp': 'application/x-hwp',
  };
  return types[ext] || 'application/octet-stream';
}

handler.config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

module.exports = handler;