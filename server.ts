import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { syncStore } from './server/syncStore';
import { EmailService } from './server/emailService';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Data Sync API for cross-device persistence (PC, Tablet, Mobile)
  app.get('/api/sync', (req, res) => {
    try {
      const syncData = syncStore.getFullSync();
      res.json(syncData);
    } catch (err: any) {
      console.error('[API /api/sync] Error:', err);
      res.status(500).json({ error: 'Lỗi khi tải dữ liệu đồng bộ' });
    }
  });

  app.get('/api/sync/status', (req, res) => {
    try {
      const status = syncStore.getStatus();
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: 'Lỗi kiểm tra trạng thái' });
    }
  });

  app.post('/api/sync', (req, res) => {
    try {
      const { data, clientVersion } = req.body;
      if (!data) {
        return res.status(400).json({ error: 'Thiếu dữ liệu đồng bộ' });
      }
      const result = syncStore.updateAll(data, clientVersion);
      res.json(result);
    } catch (err: any) {
      console.error('[API POST /api/sync] Error:', err);
      res.status(500).json({ error: 'Lỗi khi lưu dữ liệu đồng bộ' });
    }
  });

  // Khôi phục toàn diện dữ liệu từ bản sao lưu: Nạp đầy đủ năm học, tuần, lớp, học sinh, v.v.
  app.post('/api/sync/restore', (req, res) => {
    try {
      const { data } = req.body;
      if (!data) {
        return res.status(400).json({ error: 'Thiếu dữ liệu khôi phục' });
      }
      const result = syncStore.restoreFullDatabase(data);
      res.json(result);
    } catch (err: any) {
      console.error('[API POST /api/sync/restore] Error:', err);
      res.status(500).json({ error: 'Lỗi khi nạp lại dữ liệu sao lưu trên server' });
    }
  });

  app.post('/api/sync/patch', (req, res) => {
    try {
      const { key, value, isTPT, userRole } = req.body;
      if (!key) {
        return res.status(400).json({ error: 'Thiếu trường dữ liệu cần cập nhật' });
      }
      const isTPTUser = Boolean(isTPT === true || userRole === 'tpt');
      const result = syncStore.patchKey(key, value, isTPTUser);
      res.json(result);
    } catch (err: any) {
      console.error('[API POST /api/sync/patch] Error:', err);
      res.status(500).json({ error: 'Lỗi khi patch dữ liệu' });
    }
  });

  // Dedicated atomic endpoint to configure School Year, currentWeek, and Semesters
  app.post('/api/sync/school-year', (req, res) => {
    try {
      const { schoolYear, currentWeek, semesters, schoolYears, isTPT, userRole } = req.body;
      const isTPTUser = Boolean(isTPT === true || userRole === 'tpt');
      const result = syncStore.updateSchoolYearAndWeek(schoolYear, currentWeek, semesters, schoolYears, isTPTUser);
      res.json(result);
    } catch (err: any) {
      console.error('[API POST /api/sync/school-year] Error:', err);
      res.status(500).json({ error: 'Lỗi khi cập nhật năm học và tuần thi đua' });
    }
  });

  // Dedicated atomic endpoint to configure School & Board of Directors (Trường & Ban Giám Hiệu)
  app.post('/api/sync/school-config', (req, res) => {
    try {
      const { schoolConfig, isTPT, userRole } = req.body;
      const isTPTUser = Boolean(isTPT === true || userRole === 'tpt');
      const result = syncStore.updateSchoolConfig(schoolConfig, isTPTUser);
      res.json(result);
    } catch (err: any) {
      console.error('[API POST /api/sync/school-config] Error:', err);
      res.status(500).json({ error: 'Lỗi khi cập nhật cấu hình thông tin trường học' });
    }
  });

  // Smart Merge endpoint: Merges client data with server data, preserving all records
  app.post('/api/sync/merge', (req, res) => {
    try {
      const { data, deletedIds } = req.body;
      const result = syncStore.smartMerge(data || {}, deletedIds);
      res.json(result);
    } catch (err: any) {
      console.error('[API POST /api/sync/merge] Error:', err);
      res.status(500).json({ error: 'Lỗi khi đồng bộ gộp dữ liệu' });
    }
  });

  app.post('/api/sync/incident', (req, res) => {
    try {
      const incident = req.body;
      if (!incident || !incident.classId) {
        return res.status(400).json({ error: 'Dữ liệu sự việc không hợp lệ' });
      }
      const result = syncStore.addOrUpdateIncident(incident);
      res.json(result);
    } catch (err: any) {
      console.error('[API POST /api/sync/incident] Error:', err);
      res.status(500).json({ error: 'Lỗi khi lưu sự việc' });
    }
  });

  app.delete('/api/sync/incident/:id', (req, res) => {
    try {
      const { id } = req.params;
      const result = syncStore.deleteIncident(id);
      res.json(result);
    } catch (err: any) {
      console.error('[API DELETE /api/sync/incident] Error:', err);
      res.status(500).json({ error: 'Lỗi khi xóa sự việc' });
    }
  });

  app.post('/api/sync/good-deed', (req, res) => {
    try {
      const deed = req.body;
      if (!deed || !deed.title) {
        return res.status(400).json({ error: 'Dữ liệu việc tốt không hợp lệ' });
      }
      const result = syncStore.addOrUpdateGoodDeed(deed);
      res.json(result);
    } catch (err: any) {
      console.error('[API POST /api/sync/good-deed] Error:', err);
      res.status(500).json({ error: 'Lỗi khi lưu việc tốt' });
    }
  });

  app.delete('/api/sync/good-deed/:id', (req, res) => {
    try {
      const { id } = req.params;
      const result = syncStore.deleteGoodDeed(id);
      res.json(result);
    } catch (err: any) {
      console.error('[API DELETE /api/sync/good-deed] Error:', err);
      res.status(500).json({ error: 'Lỗi khi xóa việc tốt' });
    }
  });

  app.delete('/api/sync/user/:id', (req, res) => {
    try {
      const { id } = req.params;
      const result = syncStore.deleteUser(id);
      res.json(result);
    } catch (err: any) {
      console.error('[API DELETE /api/sync/user] Error:', err);
      res.status(500).json({ error: 'Lỗi khi xóa tài khoản' });
    }
  });

  app.post('/api/sync/users/delete-batch', (req, res) => {
    try {
      const { userIds } = req.body;
      if (!Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ error: 'Danh sách ID cần xóa không hợp lệ' });
      }
      const result = syncStore.deleteUsers(userIds);
      res.json(result);
    } catch (err: any) {
      console.error('[API POST /api/sync/users/delete-batch] Error:', err);
      res.status(500).json({ error: 'Lỗi khi xóa hàng loạt tài khoản' });
    }
  });

  app.delete('/api/sync/student/:id', (req, res) => {
    try {
      const { id } = req.params;
      const result = syncStore.deleteStudent(id);
      res.json(result);
    } catch (err: any) {
      console.error('[API DELETE /api/sync/student] Error:', err);
      res.status(500).json({ error: 'Lỗi khi xóa học sinh' });
    }
  });

  app.delete('/api/sync/class/:id', (req, res) => {
    try {
      const { id } = req.params;
      const result = syncStore.deleteClass(id);
      res.json(result);
    } catch (err: any) {
      console.error('[API DELETE /api/sync/class] Error:', err);
      res.status(500).json({ error: 'Lỗi khi xóa lớp' });
    }
  });

  app.post('/api/sync/clear-students', (req, res) => {
    try {
      const result = syncStore.clearAllStudents();
      res.json(result);
    } catch (err: any) {
      console.error('[API POST /api/sync/clear-students] Error:', err);
      res.status(500).json({ error: 'Lỗi khi xóa danh sách học sinh' });
    }
  });

  app.post('/api/sync/reset', (req, res) => {
    try {
      const result = syncStore.resetToDefault();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: 'Lỗi khi đặt lại dữ liệu' });
    }
  });

  // Email service status
  app.get('/api/email/status', (req, res) => {
    try {
      const status = EmailService.getStatus();
      res.json(status);
    } catch (err: any) {
      console.error('[API /api/email/status] Error:', err);
      res.status(500).json({ error: 'Lỗi kiểm tra trạng thái dịch vụ gửi email' });
    }
  });

  // Send daily report email to homeroom teachers (GVCN)
  app.post('/api/email/send-report', async (req, res) => {
    try {
      const { targets, date } = req.body;
      if (!Array.isArray(targets) || targets.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Không có lớp hoặc GVCN nào được chỉ định để gửi thư',
        });
      }

      const status = EmailService.getStatus();
      if (!status.configured) {
        return res.status(400).json({
          success: false,
          configured: false,
          error: 'Chưa cấu hình tài khoản gửi thư tự động (SMTP_USER và SMTP_PASS trong biến môi trường hệ thống).',
          results: targets.map((t: any) => ({
            classId: t.classId,
            className: t.className,
            teacherEmail: t.teacherEmail,
            status: 'failed',
            error: 'Chưa cấu hình SMTP_USER và SMTP_PASS trên máy chủ.',
          })),
        });
      }

      const results = [];
      let sentCount = 0;
      let failedCount = 0;

      for (const target of targets) {
        if (!target.teacherEmail || !target.teacherEmail.includes('@')) {
          results.push({
            classId: target.classId,
            className: target.className,
            teacherEmail: target.teacherEmail || '',
            status: 'failed',
            error: 'Địa chỉ email GVCN không hợp lệ hoặc chưa được cập nhật.',
          });
          failedCount++;
          continue;
        }

        const attachments = target.csvContent
          ? [
              {
                filename: target.csvFileName || `Tong_Hop_Ne_Nep_${target.className}_${date || 'BaoCao'}.csv`,
                content: target.csvContent,
                contentType: 'text/csv; charset=utf-8',
              },
            ]
          : undefined;

        const sendResult = await EmailService.sendMail({
          to: target.teacherEmail,
          toName: target.teacherName,
          subject: target.subject,
          text: target.text,
          html: target.html,
          attachments,
        });

        if (sendResult.success) {
          sentCount++;
          results.push({
            classId: target.classId,
            className: target.className,
            teacherEmail: target.teacherEmail,
            status: 'sent',
            messageId: sendResult.messageId,
          });
        } else {
          failedCount++;
          results.push({
            classId: target.classId,
            className: target.className,
            teacherEmail: target.teacherEmail,
            status: 'failed',
            error: sendResult.error,
          });
        }
      }

      return res.json({
        success: sentCount > 0,
        configured: true,
        sentCount,
        failedCount,
        results,
      });
    } catch (err: any) {
      console.error('[API /api/email/send-report] Error:', err);
      return res.status(500).json({
        success: false,
        error: err?.message || 'Có lỗi xảy ra trong quá trình gửi email qua máy chủ.',
      });
    }
  });

  // AI Assistant endpoint using server-side Gemini API
  app.post('/api/assistant', async (req, res) => {
    try {
      const { prompt, context } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return res.status(503).json({
          error: 'GEMINI_API_KEY chưa được cấu hình. Vui lòng thêm khóa API trong Cài đặt.',
        });
      }

      const ai = new GoogleGenAI({ apiKey });
      const systemInstruction = `Bạn là Trợ lý AI chuyên trách Công tác Đội Thiếu niên Tiền phong Hồ Chí Minh cấp THCS.
${context ? `Ngữ cảnh dữ liệu Liên đội:\n${context}` : ''}
Hãy trả lời bằng tiếng Việt chuẩn mực, đúng phong cách Đoàn Đội nhà trường, súc tích, chuyên nghiệp, khích lệ và có tính ứng dụng thực tế cao. Sử dụng định dạng Markdown rõ ràng.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          { role: 'user', parts: [{ text: `${systemInstruction}\n\nYêu cầu của Tổng phụ trách: ${prompt}` }] }
        ],
      });

      return res.json({ text: response.text || '' });
    } catch (err: any) {
      console.error('Lỗi khi gọi Gemini API:', err);
      return res.status(500).json({
        error: err?.message || 'Có lỗi xảy ra khi xử lý yêu cầu với AI',
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
