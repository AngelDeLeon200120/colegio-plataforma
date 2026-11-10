import { gradebookService } from './gradebook.service.js';

export const gradebookController = {
  async getSheet(req, res) {
    res.json({ data: await gradebookService.getSheet(req.user, req.valid.params.courseId, req.valid.query.unitId) });
  },

  async saveCells(req, res) {
    res.json({ data: await gradebookService.saveCells(req.user, req.valid.params.courseId, req.valid.body) });
  },

  async improve(req, res) {
    res.json({ data: await gradebookService.improve(req.user, req.valid.params.courseId, req.valid.body) });
  },

  async paymentStatus(req, res) {
    res.json({ data: await gradebookService.paymentStatus(req.user, req.valid.params.courseId, req.valid.query) });
  },

  async history(req, res) {
    res.json({ data: await gradebookService.history(req.user, req.valid.params.courseId, req.valid.query) });
  },

  async createItem(req, res) {
    res.status(201).json({ data: await gradebookService.createItem(req.user, req.valid.params.courseId, req.valid.body) });
  },

  async updateItem(req, res) {
    res.json({ data: await gradebookService.updateItem(req.user, req.valid.params.itemId, req.valid.body) });
  },

  async deleteItem(req, res) {
    await gradebookService.deleteItem(req.user, req.valid.params.itemId, req.valid.query);
    res.status(204).end();
  },

  async downloadTemplate(req, res) {
    const { buffer, fileName, contentType } = await gradebookService.buildTemplate(req.user, req.valid.params.courseId, req.valid.query);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  },

  async validateImport(req, res) {
    res.status(201).json({ data: await gradebookService.validateImport(req.user, req.valid.params.courseId, req.valid.body, req.file) });
  },

  async applyImport(req, res) {
    res.json({ data: await gradebookService.applyImport(req.user, req.valid.params.importId) });
  },

  async discardImport(req, res) {
    await gradebookService.discardImport(req.user, req.valid.params.importId);
    res.status(204).end();
  },
};
