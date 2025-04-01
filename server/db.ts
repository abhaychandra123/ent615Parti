import { drizzle } from 'drizzle-orm/neon-serverless';
import { neon, neonConfig } from '@neondatabase/serverless';
import * as schema from '@shared/schema';

// Configure Neon to use HTTP only and not WebSockets
neonConfig.fetchConnectionCache = true;
neonConfig.useSecureWebSocket = false;

// Create a database connection
const sql = neon(process.env.DATABASE_URL!);

// Create a wrapper for drizzle that handles typecast issues
export const db = drizzle(sql, { schema });