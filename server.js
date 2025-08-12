// server.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure required directories exist
const ensureDirectories = async () => {
  const dirs = ['src/services', 'uploads', 'temp'];
  for (const dir of dirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      // Directory might already exist, ignore error
    }
  }
};

// Create basic PDF processor if it doesn't exist
const createPdfProcessor = async () => {
  const processorPath = 'src/services/pdfProcessor.js';
  try {
    await fs.access(processorPath);
    console.log('✅ PDF processor already exists');
  } catch {
    console.log('📝 Creating basic PDF processor...');
    const basicProcessor = `// src/services/pdfProcessor.js
export class PdfProcessor {
  constructor() {
    console.log('🔧 PDF Processor initialized');
  }

  async extractTextFromPdf(pdfBuffer) {
    // Basic PDF processing - can be enhanced later
    console.log('📄 Processing PDF...');
    
    return {
      text: 'Sample text extracted from PDF',
      pages: 1,
      success: true,
      metadata: {
        extractedAt: new Date().toISOString(),
        size: pdfBuffer.length
      }
    };
  }

  extractSteelInformation(text) {
    // Basic steel information extraction
    console.log('🔍 Extracting steel information...');
    
    return {
      structuralMembers: [
        {
          type: 'Wide Flange Beam',
          designation: 'W12X35',
          category: 'structural_beam'
        }
      ],
      quantities: [],
      dimensions: [],
      summary: {
        totalMembers: 1,
        estimatedWeight: 100
      }
    };
  }

  async processForEstimation(pdfBuffer, options = {}) {
    console.log('🚀 Processing PDF for estimation...');
    
    try {
      const extractedData = await this.extractTextFromPdf(pdfBuffer);
      const steelData = this.extractSteelInformation(extractedData.text);
      
      const estimation = {
        materials: [
          {
            description: 'W12X35 Wide Flange Beam',
            quantity: 1,
            unitCost: 250,
            totalCost: 250
          }
        ],
        totals: {
          materials: 250,
          labor: 125,
          equipment: 31,
          total: 406
        }
      };

      return {
        ...extractedData,
        steelData,
        estimation,
        processedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Processing error:', error);
      throw error;
    }
  }
}

export default PdfProcessor;
`;
    
    await fs.writeFile(processorPath, basicProcessor);
    console.log('✅ Basic PDF processor created');
  }
};

// Middleware setup
app.use(helmet({
  contentSecurityPolicy: false, // Disable for development
}));
app.use(compression());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// Initialize the application
const initializeApp = async () => {
  try {
    await ensureDirectories();
    await createPdfProcessor();
    console.log('🚀 SteelConnect Backend initialized successfully');
  } catch (error) {
    console.error('❌ Initialization failed:', error);
  }
};

// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'SteelConnect Backend API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: 'GET /health',
      estimate: 'POST /api/estimate',
      upload: 'POST /api/upload-pdf'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'SteelConnect Backend is healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.version
  });
});

// PDF upload and processing endpoint
app.post('/api/upload-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No PDF file uploaded',
        message: 'Please upload a PDF file'
      });
    }

    console.log(`📄 Received PDF: ${req.file.originalname} (${req.file.size} bytes)`);

    // Dynamically import the PDF processor
    const { PdfProcessor } = await import('./src/services/pdfProcessor.js');
    const processor = new PdfProcessor();

    // Process the PDF
    const results = await processor.processForEstimation(req.file.buffer, {
      includeAnalysis: true,
      filename: req.file.originalname
    });

    res.json({
      success: true,
      message: 'PDF processed successfully',
      filename: req.file.originalname,
      size: req.file.size,
      results: results
    });

  } catch (error) {
    console.error('❌ PDF processing error:', error);
    res.status(500).json({
      error: 'PDF processing failed',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Basic estimation endpoint (without file upload)
app.post('/api/estimate', async (req, res) => {
  try {
    const { text, projectInfo } = req.body;

    if (!text) {
      return res.status(400).json({
        error: 'Missing required data',
        message: 'Please provide text or project information'
      });
    }

    // Dynamically import the PDF processor
    const { PdfProcessor } = await import('./src/services/pdfProcessor.js');
    const processor = new PdfProcessor();

    // Extract steel information from text
    const steelData = processor.extractSteelInformation(text);

    // Generate basic estimation
    const estimation = {
      materials: steelData.structuralMembers.map(member => ({
        description: member.designation,
        type: member.type,
        quantity: 1,
        unitCost: 250, // Basic estimate
        totalCost: 250
      })),
      totals: {
        materials: steelData.structuralMembers.length * 250,
        labor: steelData.structuralMembers.length * 125,
        equipment: steelData.structuralMembers.length * 31,
        total: steelData.structuralMembers.length * 406
      }
    };

    res.json({
      success: true,
      message: 'Estimation completed',
      steelData,
      estimation,
      projectInfo,
      processedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Estimation error:', error);
    res.status(500).json({
      error: 'Estimation failed',
      message: error.message
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large',
        message: 'PDF file must be smaller than 50MB'
      });
    }
  }
  
  console.error('❌ Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.originalUrl} not found`,
    availableRoutes: ['GET /', 'GET /health', 'POST /api/upload-pdf', 'POST /api/estimate']
  });
});

// Start server
const startServer = async () => {
  await initializeApp();
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌟 SteelConnect Backend running on port ${PORT}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    console.log(`📋 API docs: http://localhost:${PORT}/`);
  });
};

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start the application
startServer().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
