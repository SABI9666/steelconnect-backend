// setup.js - Run this to create the necessary directory structure
import fs from 'fs/promises';
import path from 'path';

async function createDirectoryStructure() {
    const directories = [
        'src/routes',
        'src/services',
        'src/models',
        'src/middleware',
        'src/utils',
        'test/data',
        'reports',
        'uploads'
    ];

    console.log('🏗️ Creating directory structure...');

    for (const dir of directories) {
        try {
            await fs.mkdir(dir, { recursive: true });
            console.log(`✅ Created: ${dir}`);
        } catch (error) {
            console.log(`📁 ${dir} already exists`);
        }
    }

    // Create a placeholder file to prevent the PDF test error
    const placeholderContent = `# Test Data Directory

This directory contains test files for the SteelConnect backend.

Files in this directory:
- Sample PDF drawings for testing
- Mock data structures
- Test configurations
`;

    try {
        await fs.writeFile('test/data/README.md', placeholderContent);
        console.log('✅ Created test data README');
    } catch (error) {
        console.log('📝 Test data README already exists');
    }

    console.log('🎉 Directory structure setup complete!');
}

createDirectoryStructure().catch(console.error)