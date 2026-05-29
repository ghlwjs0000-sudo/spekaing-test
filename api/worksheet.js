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
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET: 학생 활동지 데이터 조회
  if (req.method === 'GET') {
    const { studentNumber } = req.query;
    if (!studentNumber) return res.status(400).json({ error: '학번이 필요합니다.' });
    try {
      const students = await sb('GET', 'students', null, `?student_number=eq.${studentNumber}&select=id`);
      if (!students.length) return res.status(404).json({ error: '학생을 찾을 수 없어요.' });
      const studentId = students[0].id;
      const submissions = await sb('GET', 'submissions', null, `?student_id=eq.${studentId}&select=worksheet_data,worksheet_book_type,worksheet_submitted_at,worksheet_csv_url,script`);
      if (!submissions.length) return res.status(200).json({ found: false });
      return res.status(200).json({ found: true, data: submissions[0] });
    } catch(err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { studentNumber, script } = req.body;
  const worksheetData = req.body.worksheetData || null;
  const bookType = req.body.bookType || null;
  const worksheetCsvUrl = req.body.worksheetCsvUrl || null;
  const worksheetCsvFilename = req.body.worksheetCsvFilename || null;
  if (!studentNumber || !script) return res.status(400).json({ error: '학번과 스크립트가 필요합니다.' });

  try {
    const students = await sb('GET', 'students', null, `?student_number=eq.${studentNumber}&select=id,name,class_id,student_number`);
    if (!students.length) return res.status(404).json({ error: '학번을 찾을 수 없어요.' });
    const student = students[0];
    const existing = await sb('GET', 'submissions', null, `?student_id=eq.${student.id}&select=id`);
    const existingId = existing.length ? existing[0].id : null;

    if (existingId) {
      await sb('PATCH', 'submissions', {
        script,
        worksheet_data: worksheetData,
        worksheet_book_type: bookType,
        worksheet_csv_url: worksheetCsvUrl,
        worksheet_csv_filename: worksheetCsvFilename,
        worksheet_submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, `?id=eq.${existingId}`);
    } else {
      await sb('POST', 'submissions', {
        student_id: student.id,
        student_name: student.name,
        student_number: student.student_number,
        class_id: student.class_id,
        script,
        worksheet_data: worksheetData,
        worksheet_book_type: bookType,
        worksheet_csv_url: worksheetCsvUrl,
        worksheet_csv_filename: worksheetCsvFilename,
        worksheet_submitted_at: new Date().toISOString(),
        submitted_at: new Date().toISOString(),
        attempt_count: 0,
        is_passed: false,
        is_final_submitted: false,
        sentences: [],
        sentence_results: [],
        teacher_approved_sentences: []
      });
    }
    // 저장 이력 기록
    await sb('POST', 'worksheet_history', {
      student_id: student.id,
      student_name: student.name,
      student_number: student.student_number,
      class_id: student.class_id,
      submission_id: existingId || null,
      worksheet_data: worksheetData || null,
      book_type: bookType || null,
      script: script || null,
      saved_at: new Date().toISOString()
    }).catch(() => {});
    return res.status(200).json({ success: true, studentName: student.name });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
};