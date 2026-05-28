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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

 const { studentNumber, script } = req.body;
  const worksheetData = req.body.worksheetData || null;
  const bookType = req.body.bookType || null;
  const worksheetCsvUrl = req.body.worksheetCsvUrl || null;
  const worksheetCsvFilename = req.body.worksheetCsvFilename || null;
  // 객체가 비어있으면 null로 처리하지 않음
  if (worksheetData && typeof worksheetData === 'object' && Object.keys(worksheetData).length === 0) {
    worksheetData = { empty: true };
  }
  if (!studentNumber || !script) return res.status(400).json({ error: '학번과 스크립트가 필요합니다.' });

  try {
    // 학생 확인
    const students = await sb('GET', 'students', null, `?student_number=eq.${studentNumber}&select=id,name,class_id`);
    if (!students.length) return res.status(404).json({ error: '학번을 찾을 수 없어요. 학번을 다시 확인해주세요.' });
    const student = students[0];

    // 기존 제출 확인
    const existing = await sb('GET', 'submissions', null, `?student_id=eq.${student.id}&select=id`);
    const existingId = existing.length ? existing[0].id : null;


    if (existingId) {
      await sb('PATCH', 'submissions', {
        script: script,
        worksheet_data: worksheetData ? JSON.stringify(worksheetData) : null,
        worksheet_book_type: bookType || null,
        worksheet_submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, `?id=eq.${existingId}`);
    } else {
      await sb('POST', 'submissions', {
        student_id: student.id,
        student_name: student.name,
        student_number: student.student_number,
        class_id: student.class_id,
        script: script,
        worksheet_data: worksheetData || null,
        worksheet_book_type: bookType || null,
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

    return res.status(200).json({ success: true, studentName: student.name });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
};