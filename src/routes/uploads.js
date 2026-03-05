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

const ALLOWED_MIME_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const fileFilter = (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('File type not allowed. Accepted: PDF, images, Word, Excel.'), false);
    }
};

const createUploader = (fieldName) => multer({
    storage: storage,
    limits: { fileSize: 10000000 }, // 10MB
    fileFilter: fileFilter,
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