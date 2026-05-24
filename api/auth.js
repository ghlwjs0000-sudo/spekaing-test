const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

async function query(table, params = {}) {
  let url = `${SUPABASE_URL}/rest/v1/${table}`;
  const qs = Object.entries(params).map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  if (qs) url += '?' + qs;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  return res.json();
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, username, password } = req.body;

  try {
    if (type === 'student') {
      const students = await query('students', { student_number: `eq.${username}`, select: '*,classes(*)' });
      if (!students.length) return res.status(401).json({ error: '학번을 확인해주세요.' });
      const student = students[0];
      if (student.password !== password) return res.status(401).json({ error: '비밀번호가 틀렸습니다.' });
      return res.status(200).json({
        success: true,
        user: {
          id: student.id,
          name: student.name,
          studentNumber: student.student_number,
          classId: student.class_id,
          className: student.classes?.name || '',
          classLevel: student.classes?.level || '',
        }
      });
    }

    if (type === 'teacher') {
      const teachers = await query('teachers', { username: `eq.${username}` });
      if (!teachers.length) return res.status(401).json({ error: '아이디를 확인해주세요.' });
      const teacher = teachers[0];
      if (teacher.password_hash !== password) return res.status(401).json({ error: '비밀번호가 틀렸습니다.' });
const allClasses = await query('classes', { select: '*', order: 'name.asc' });
      const classIds = teacher.class_ids || [];
      const isMaster = teacher.is_master || false;
      // 마스터는 전체 반, 일반 교사는 담당 반만
      const myClasses = isMaster || classIds.length === 0
        ? allClasses
        : allClasses.filter(c => classIds.includes(c.id));
      return res.status(200).json({
        success: true,
        user: {
          id: teacher.id,
          name: teacher.name,
          username: teacher.username,
          classIds: isMaster ? [] : classIds,
          isMaster,
        },
        classes: myClasses
      });
    }

    return res.status(400).json({ error: '잘못된 요청입니다.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
