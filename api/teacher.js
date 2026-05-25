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
      const { classId, classIds } = req.query;
      let params = '?select=*,classes(name)&order=student_number.asc';
      if (classId) {
        params += `&class_id=eq.${classId}`;
      } else if (classIds) {
        const ids = classIds.split(',').filter(Boolean);
        if (ids.length > 0) params += `&class_id=in.(${ids.join(',')})`;
      }
      const data = await sb('GET', 'students', null, params);
      return res.status(200).json(data);
    }

// 제출 목록 (반별)
    if (action === 'submissions') {
      const { classId, search, classIds } = req.query;
      let params = '?select=*&order=submitted_at.desc';
      if (classId) {
        params += `&class_id=eq.${classId}`;
      } else if (classIds) {
        // 담당 반 전체
        const ids = classIds.split(',');
        params += `&class_id=in.(${ids.join(',')})`;
      }
      const data = await sb('GET', 'submissions', null, params);
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

    // 전체 명단 (담당 반 학생 + 제출 현황)
    if (action === 'roster') {
      const { classIds, classId } = req.query;
      let studentParams = '?select=*,classes(name)&order=student_number.asc';
      if (classId) {
        studentParams += `&class_id=eq.${classId}`;
      } else if (classIds) {
        const ids = classIds.split(',');
        studentParams += `&class_id=in.(${ids.join(',')})`;
      }
      const students = await sb('GET', 'students', null, studentParams);

      // 제출 현황
      let subParams = '?select=student_id,is_passed,is_final_submitted,attempt_count,submitted_at,final_submitted_at&order=submitted_at.desc';
      if (classId) {
        subParams += `&class_id=eq.${classId}`;
      } else if (classIds) {
        const ids = classIds.split(',');
        subParams += `&class_id=in.(${ids.join(',')})`;
      }
      const submissions = await sb('GET', 'submissions', null, subParams);
      const subMap = {};
      submissions.forEach(s => { subMap[s.student_id] = s; });

      // 합산
      const roster = students.map(s => ({
        id: s.id,
        name: s.name,
        studentNumber: s.student_number,
        className: s.classes?.name || '',
        classId: s.class_id,
        submission: subMap[s.id] || null
      }));
      return res.status(200).json(roster);
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

   // 학생 정보 수정 (아이디/비밀번호)
    if (action === 'updateStudent' && req.method === 'PATCH') {
      const { studentId, password, classId } = req.body;
      const patch = {};
      if (password) patch.password = password;
      if (classId) patch.class_id = classId;
      await sb('PATCH', 'students', patch, `?id=eq.${studentId}`);
      return res.status(200).json({ success: true });
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
    // 교사 점수 조정 / 통과 처리
    if (action === 'updateSubmission' && req.method === 'PATCH') {
      const { id, finalScore, teacherNote, teacherOverride, isPassed, teacherApprovedSentences, finalSpeakingResult } = req.body;
      const patch = {
        final_score: finalScore,
        teacher_note: teacherNote || null,
        teacher_override: teacherOverride || false,
        is_passed: isPassed,
        updated_at: new Date().toISOString()
      };
      if (teacherApprovedSentences !== undefined) {
        patch.teacher_approved_sentences = teacherApprovedSentences;
      }
      if (finalSpeakingResult !== undefined) {
        patch.final_speaking_result = finalSpeakingResult;
      }
      await sb('PATCH', 'submissions', patch, `?id=eq.${id}`);
      return res.status(200).json({ success: true });
    }

   // 문장별 교사 승인
    if (action === 'approveSentence' && req.method === 'PATCH') {
      const { id, sentenceIndex, approved } = req.body;
      const current = await sb('GET', 'submissions', null, `?id=eq.${id}&select=teacher_approved_sentences,sentences,sentence_results,is_passed,pronunciation,fluency,content,final_speaking_result`);
      if (!current.length) return res.status(404).json({ error: '제출 없음' });
      const sub = current[0];
      let approved_list = sub.teacher_approved_sentences || [];
      if (approved) {
        if (!approved_list.includes(sentenceIndex)) approved_list.push(sentenceIndex);
      } else {
        approved_list = approved_list.filter(i => i !== sentenceIndex);
      }
      const sentences = sub.sentences || [];
      const srs = sub.sentence_results || [];
      const allPassed = sentences.every((_, i) => {
        return srs[i]?.status === 'ok' || approved_list.includes(i);
      });

      // 점수 재계산
      const finalResult = sub.final_speaking_result || {};
      const pronunciation = finalResult.pronunciation || sub.pronunciation || 0;
      const fluency = finalResult.fluency || sub.fluency || 0;
      const baseContent = finalResult.content || sub.content || 0;
      const totalSents = sentences.length;
      const aiOkCount = srs.filter(sr => sr && sr.status === 'ok').length;
      const totalOk = Math.min(totalSents, aiOkCount + approved_list.length);
      const completenessScore = totalSents > 0 ? Math.round((totalOk / totalSents) * 10) : 0;
      const contentBonus = totalSents > 0 ? Math.round((approved_list.length / totalSents) * 10) : 0;
      const newContent = Math.min(30, baseContent + contentBonus);
      const newTotal = pronunciation + newContent + fluency + completenessScore;
      const newGrade = newTotal >= 90 ? 'A+' : newTotal >= 80 ? 'A' : newTotal >= 70 ? 'B+' : newTotal >= 60 ? 'B' : newTotal >= 50 ? 'C+' : newTotal >= 40 ? 'C' : 'D';
      const updatedResult = Object.assign({}, finalResult, {
        content: newContent,
        completeness: completenessScore,
        total: newTotal,
        grade: newGrade
      });

      await sb('PATCH', 'submissions', {
        teacher_approved_sentences: approved_list,
        is_passed: allPassed,
        final_speaking_result: updatedResult,
        updated_at: new Date().toISOString()
      }, `?id=eq.${id}`);
      return res.status(200).json({ success: true, approvedList: approved_list, allPassed, newTotal, newGrade });
    }

    return res.status(400).json({ error: '알 수 없는 action' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
