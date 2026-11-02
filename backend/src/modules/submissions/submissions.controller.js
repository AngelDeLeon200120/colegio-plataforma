import { submissionsService } from './submissions.service.js';

// Express 5 propaga los rechazos de promesas al errorHandler: no hace falta asyncHandler
export const submissionsController = {
  async listForActivity(req, res) {
    const data = await submissionsService.listForActivity(req.user, req.valid.params.activityId, req.valid.query);
    res.json({ data });
  },

  async getDetail(req, res) {
    const data = await submissionsService.getDetail(req.user, req.valid.params.submissionId);
    res.json({ data });
  },

  async approve(req, res) {
    const data = await submissionsService.approve(req.user, req.valid.params.submissionId, req.valid.body);
    res.json({ data });
  },

  async reject(req, res) {
    const data = await submissionsService.reject(req.user, req.valid.params.submissionId, req.valid.body);
    res.json({ data });
  },
};
