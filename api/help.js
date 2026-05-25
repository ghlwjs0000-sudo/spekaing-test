const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

async function sb(method, table, body, params = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return []; }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // 교사 호출 요청 (학생)
  if (req.method === 'POST') {
    const { submissionId, studentId, studentName, classId, sentenceIndex, sentenceText } = req.body;
    if (!submissionId || !studentId || sentenceIndex === undefined) {
      return res.status(400).json({ error: '필수 항목 누락' });
    }
    // 이미 pending 요청이 있는지 확인
    const existing = await sb('GET', 'help_requests', null,
      `?submission_id=eq.${submissionId}&sentence_index=eq.${sentenceIndex}&status=eq.pending&select=id`);
    if (existing.length) {
      return res.status(200).json({ success: true, message: '이미 요청됨' });
    }
    await sb('POST', 'help_requests', {
      submission_id: submissionId, student_id: studentId,
      student_name: studentName, class_id: classId,
      sentence_index: sentenceIndex, sentence_text: sentenceText,
      status: 'pending'
    });
    return res.status(200).json({ success: true });
  }

  // 교사 호출 목록 조회 (교사)
  if (req.method === 'GET') {
    const { classIds, status } = req.query;
    let params = '?select=*&order=created_at.desc';
    if (status) params += `&status=eq.${status}`;
    else params += `&status=eq.pending`;
    if (classIds) {
      const ids = classIds.split(',').filter(Boolean);
      if (ids.length) params += `&class_id=in.(${ids.join(',')})`;
    }
    const data = await sb('GET', 'help_requests', null, params);
    return res.status(200).json(data);
  }

  // 교사 호출 처리 (승인/거절)
  if (req.method === 'PATCH') {
    const { id, action, submissionId, sentenceIndex } = req.body;
    await sb('PATCH', 'help_requests', {
      status: action === 'approve' ? 'approved' : 'rejected',
      resolved_at: new Date().toISOString()
    }, `?id=eq.${id}`);

    // 승인이면 해당 문장도 교사 승인 처리
    if (action === 'approve' && submissionId !== undefined && sentenceIndex !== undefined) {
      const current = await sb('GET', 'submissions', null,
        `?id=eq.${submissionId}&select=teacher_approved_sentences,sentences,sentence_results,is_passed`);
      if (current.length) {
        const sub = current[0];
        let approved_list = sub.teacher_approved_sentences || [];
        if (!approved_list.includes(sentenceIndex)) approved_list.push(sentenceIndex);
        const sentences = sub.sentences || [];
        const srs = sub.sentence_results || [];
        const allPassed = sentences.every((_, i) => {
          return srs[i]?.status === 'ok' || approved_list.includes(i);
        });
        await sb('PATCH', 'submissions', {
          teacher_approved_sentences: approved_list,
          is_passed: allPassed,
          updated_at: new Date().toISOString()
        }, `?id=eq.${submissionId}`);
      }
    }
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
