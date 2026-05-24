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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;

  try {
    // 반 목록
    if (action === 'classes') {
      const data = await sb('GET', 'classes', null, '?select=*&order=name.asc');
      return res.status(200).json(data);
    }

    // 학생 목록
    if (action === 'students') {
      const { classId } = req.query;
      let params = '?select=*,classes(name,level)&order=student_number.asc';
      if (classId) params += `&class_id=eq.${classId}`;
      const data = await sb('GET', 'students', null, params);
      return res.status(200).json(data);
    }

    // 제출 목록 (반별)
    if (action === 'submissions') {
      const { classId, search } = req.query;
      let params = '?select=*&order=submitted_at.desc';
      if (classId) params += `&class_id=eq.${classId}`;
      const data = await sb('GET', 'submissions', null, params);
      // 검색 필터
      if (search) {
        const q = search.toLowerCase();
        return res.status(200).json(data.filter(s =>
          s.student_name?.toLowerCase().includes(q) ||
          s.student_number?.toLowerCase().includes(q) ||
          s.book_title?.toLowerCase().includes(q)
        ));
      }
      return res.status(200).json(data);
    }

    // 시도 기록 (학생별)
    if (action === 'attempts') {
      const { submissionId } = req.query;
      const params = `?submission_id=eq.${submissionId}&select=*&order=attempted_at.asc`;
      const data = await sb('GET', 'attempt_logs', null, params);
      return res.status(200).json(data);
    }

    // 학생 추가
    if (action === 'addStudent' && req.method === 'POST') {
      const { name, studentNumber, password, classId } = req.body;
      const existing = await sb('GET', 'students', null, `?student_number=eq.${studentNumber}&select=id`);
      if (existing.length) return res.status(400).json({ error: '이미 존재하는 학번입니다.' });
      const data = await sb('POST', 'students', { name, student_number: studentNumber, password, class_id: classId });
      return res.status(200).json({ success: true, student: data[0] });
    }

    // 학생 일괄 추가
    if (action === 'bulkAddStudents' && req.method === 'POST') {
      const { students } = req.body;
      const data = await sb('POST', 'students', students);
      return res.status(200).json({ success: true, count: data.length });
    }

    // 학생 삭제
    if (action === 'deleteStudent' && req.method === 'DELETE') {
      const { studentId } = req.query;
      await sb('DELETE', 'students', null, `?id=eq.${studentId}`);
      return res.status(200).json({ success: true });
    }

    // 반 추가
    if (action === 'addClass' && req.method === 'POST') {
      const { name, level, teacherName } = req.body;
      const data = await sb('POST', 'classes', { name, level, teacher_name: teacherName });
      return res.status(200).json({ success: true, class: data[0] });
    }

    // 교사 점수 조정 / 통과 처리
    if (action === 'updateSubmission' && req.method === 'PATCH') {
      const { id, finalScore, teacherNote, teacherOverride, isPassed } = req.body;
      await sb('PATCH', 'submissions', {
        final_score: finalScore,
        teacher_note: teacherNote || null,
        teacher_override: teacherOverride || false,
        is_passed: isPassed,
        updated_at: new Date().toISOString()
      }, `?id=eq.${id}`);
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: '알 수 없는 action' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
