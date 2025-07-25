import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = express.Router();

const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: './uploads/',
    filename: function(req, file, cb) {
        cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`);
    }
});

const createUploader = (fieldName) => multer({
    storage: storage,
    limits: { fileSize: 10000000 }, // 10MB
}).single(fieldName);

// Endpoint for job document uploads
router.post('/job', (req, res) => {
    const upload = createUploader('document');
    upload(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message || err });
        if (!req.file) return res.status(400).json({ error: 'No file selected!' });
        res.status(200).json({ filePath: `/uploads/${req.file.filename}` });
    });
});

// Endpoint for quote document uploads
router.post('/quote', (req, res) => {
    const upload = createUploader('quote_document');
    upload(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message || err });
        if (!req.file) return res.status(400).json({ error: 'No file selected!' });
        res.status(200).json({ filePath: `/uploads/${req.file.filename}` });
    });
});

export default router;