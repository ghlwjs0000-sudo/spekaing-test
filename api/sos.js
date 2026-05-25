import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { studentId, studentName, classId, submissionId } = req.body;
    if (!studentId) return res.status(400).json({ error: '학생 정보가 없습니다.' });

    try {
        const { error } = await supabase
            .from('sos_calls')
            .insert({
                student_id: studentId,
                student_name: studentName,
                class_id: classId,
                submission_id: submissionId,
                is_resolved: false,
                created_at: new Date().toISOString()
            });

        if (error) throw error;
        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('SOS 오류:', err);
        return res.status(500).json({ error: err.message });
    }
}