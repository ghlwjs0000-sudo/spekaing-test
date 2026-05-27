const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

async function supabaseReq(method, table, body, params = '') {
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
  try { return JSON.parse(text); } catch { return text; }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET: 제출 목록 조회 (교사용)
  if (req.method === 'GET') {
    const { classId, studentId } = req.query;
    let params = '?select=*&order=submitted_at.desc';
    if (classId) params += `&class_id=eq.${classId}`;
    if (studentId) params += `&student_id=eq.${studentId}`;
    const data = await supabaseReq('GET', 'submissions', null, params);
    return res.status(200).json(data);
  }

  // POST: 제출 저장/업데이트
  if (req.method === 'POST') {
    const {
      studentId, studentName, studentNumber, classId,
      bookTitle, bookAuthor, script,
      aiScore, finalScore, grade,
      pronunciation, content, fluency, completeness,
      sentences, sentenceResults, attemptCount, isPassed,
      pptDataUrl, pptFilename, worksheetDataUrl, worksheetFilename,
     pronunciationFeedback, contentFeedback, fluencyFeedback, overallFeedback, transcript,
      teacherApprovedSentences, isFinalSubmitted, pptUpdatedAt, worksheetUpdatedAt,
      isFinalSpeakingSubmitted, finalSpeakingAudio, finalSpeakingMimeType, finalSpeakingResult, finalSpeakingAt
    } = req.body;

    // 기존 제출 확인
    const existing = await supabaseReq('GET', 'submissions', null, `?student_id=eq.${studentId}&select=id`);
    const existingId = Array.isArray(existing) && existing.length ? existing[0].id : null;
// 기존 teacher_approved_sentences 보존
    const existingFull = existingId ? await supabaseReq('GET', 'submissions', null, `?id=eq.${existingId}&select=teacher_approved_sentences,final_speaking_result,final_speaking_history,final_speaking_audio,final_speaking_mime,final_speaking_at,is_final_speaking_submitted`) : null;
    const existingData = Array.isArray(existingFull) && existingFull[0] ? existingFull[0] : {};
    const payload = {
      student_id: studentId,
      student_name: studentName,
      student_number: studentNumber,
      class_id: classId,
      book_title: bookTitle,
      book_author: bookAuthor,
      script,
      ai_score: aiScore,
      final_score: finalScore,
      grade,
      pronunciation,
      content,
      fluency,
      completeness,
      sentences,
      sentence_results: sentenceResults,
      attempt_count: attemptCount,
      is_passed: isPassed,
     ppt_url: pptDataUrl || null,
      ppt_filename: pptFilename || null,
      worksheet_url: worksheetDataUrl || null,
      worksheet_filename: worksheetFilename || null,
      ppt_updated_at: pptDataUrl ? (pptUpdatedAt || undefined) : undefined,
      worksheet_updated_at: worksheetDataUrl ? (worksheetUpdatedAt || undefined) : undefined,
     pronunciation_feedback: pronunciationFeedback || null,
      content_feedback: contentFeedback || null,
      fluency_feedback: fluencyFeedback || null,
      overall_feedback: overallFeedback || null,
      transcript: transcript || null,
      updated_at: new Date().toISOString(),
      teacher_approved_sentences: teacherApprovedSentences !== undefined ? teacherApprovedSentences : (existingData.teacher_approved_sentences || []),
      is_final_submitted: isFinalSubmitted || false,
      final_submitted_at: isFinalSubmitted ? new Date().toISOString() : undefined,
      practice_audio: req.body.practiceAudio || existingData.practice_audio || undefined,
      practice_audio_mime: req.body.practiceAudioMime || existingData.practice_audio_mime || undefined,
      final_speaking_audio: finalSpeakingAudio || existingData.final_speaking_audio || undefined,
      final_speaking_mime: finalSpeakingMimeType || existingData.final_speaking_mime || undefined,
      final_speaking_result: finalSpeakingResult || existingData.final_speaking_result || undefined,
      final_speaking_at: finalSpeakingAt || existingData.final_speaking_at || undefined,
      ppt_updated_at: pptDataUrl ? new Date().toISOString() : undefined,
      worksheet_updated_at: worksheetDataUrl ? new Date().toISOString() : undefined,
    };

   let result;
    if (existingId) {
      if (isFinalSpeakingSubmitted && finalSpeakingResult) {
        const current = await supabaseReq('GET', 'submissions', null, `?id=eq.${existingId}&select=final_speaking_history,attempt_count`);
        const prev = Array.isArray(current) && current[0] ? current[0] : {};
        const history = prev.final_speaking_history || [];
        history.push({
          result: finalSpeakingResult,
          audio: finalSpeakingAudio,
          mime: finalSpeakingMimeType,
          at: finalSpeakingAt || new Date().toISOString()
        });
        payload.final_speaking_history = history;
        payload.sentence_results = [];
        payload.attempt_count = (prev.attempt_count || 0) + 1;
        payload.is_passed = false;
        payload.teacher_approved_sentences = [];
        payload.transcript = null;
      }
      result = await supabaseReq('PATCH', 'submissions', payload, `?id=eq.${existingId}`);
    } else {
      payload.submitted_at = new Date().toISOString();
      result = await supabaseReq('POST', 'submissions', payload);
    }
    return res.status(200).json({ success: true, id: existingId || (Array.isArray(result) ? result[0]?.id : null) });
  }

  // PATCH: 교사 점수 조정 / 통과 처리
  if (req.method === 'PATCH') {
    const { id, finalScore, teacherNote, teacherOverride, isPassed, teacherApprovedSentences } = req.body;
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
    await supabaseReq('PATCH', 'submissions', patch, `?id=eq.${id}`);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
