import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

// SQL Server configuration
const config = {
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    server: process.env.SQL_SERVER, // e.g., 'localhost' or 'your-server.database.windows.net'
    database: process.env.SQL_DATABASE,
    port: parseInt(process.env.SQL_PORT) || 1433,
    options: {
        encrypt: process.env.SQL_ENCRYPT === 'true', // Use true for Azure SQL
        trustServerCertificate: process.env.SQL_TRUST_CERT === 'true', // Use true for local dev
        enableArithAbort: true,
        connectionTimeout: 30000,
        requestTimeout: 30000,
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000,
    }
};

let pool = null;

/**
 * Initialize the connection pool
 */
async function initializePool() {
    try {
        if (!pool) {
            pool = await sql.connect(config);
            console.log('✅ Connected to SQL Server successfully');
        }
        return pool;
    } catch (error) {
        console.error('❌ Error connecting to SQL Server:', error);
        throw error;
    }
}

/**
 * Execute a SQL query with parameters
 * @param {string} queryText - The SQL query string
 * @param {object} params - Query parameters object
 * @returns {Promise} Query result
 */
export async function query(queryText, params = {}) {
    try {
        if (!pool) {
            await initializePool();
        }

        const request = pool.request();
        
        // Add parameters to the request
        Object.entries(params).forEach(([key, value]) => {
            request.input(key, value);
        });

        const result = await request.query(queryText);
        return result;
    } catch (error) {
        console.error('❌ SQL Query Error:', error);
        console.error('Query:', queryText);
        console.error('Params:', params);
        throw error;
    }
}

/**
 * Execute a stored procedure
 * @param {string} procedureName - Name of the stored procedure
 * @param {object} params - Parameters for the stored procedure
 * @returns {Promise} Procedure result
 */
export async function executeProcedure(procedureName, params = {}) {
    try {
        if (!pool) {
            await initializePool();
        }

        const request = pool.request();
        
        // Add parameters to the request
        Object.entries(params).forEach(([key, value]) => {
            request.input(key, value);
        });

        const result = await request.execute(procedureName);
        return result;
    } catch (error) {
        console.error('❌ Stored Procedure Error:', error);
        console.error('Procedure:', procedureName);
        console.error('Params:', params);
        throw error;
    }
}

/**
 * Close the connection pool
 */
export async function closePool() {
    try {
        if (pool) {
            await pool.close();
            pool = null;
            console.log('✅ SQL Server connection pool closed');
        }
    } catch (error) {
        console.error('❌ Error closing SQL Server connection:', error);
    }
}

/**
 * Get the current pool instance
 */
export function getPool() {
    return pool;
}

// Initialize the pool when the module is loaded
initializePool().catch(console.error);

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Received SIGINT. Gracefully shutting down SQL connection...');
    await closePool();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Received SIGTERM. Gracefully shutting down SQL connection...');
    await closePool();
    process.exit(0);
});

export default { query, executeProcedure, closePool, getPool };