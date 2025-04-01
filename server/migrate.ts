import pkg from 'pg';
const { Pool } = pkg;

async function runMigration() {
  console.log('Starting database migration...');
  
  try {
    // Connect directly using the Pool
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    
    // Define schema here to create all tables
    console.log('Creating tables if they don\'t exist...');
    
    // Use SQL to create all tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        email TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'student',
        name TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS courses (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        admin_id INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS student_courses (
        id SERIAL PRIMARY KEY,
        student_id INTEGER NOT NULL,
        course_id INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS participation_requests (
        id SERIAL PRIMARY KEY,
        student_id INTEGER NOT NULL,
        course_id INTEGER NOT NULL,
        note TEXT,
        timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
        active BOOLEAN NOT NULL DEFAULT TRUE
      );

      CREATE TABLE IF NOT EXISTS participation_records (
        id SERIAL PRIMARY KEY,
        student_id INTEGER NOT NULL,
        course_id INTEGER NOT NULL,
        points INTEGER NOT NULL,
        feedback TEXT,
        note TEXT,
        timestamp TIMESTAMP NOT NULL DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS session (
        sid varchar NOT NULL COLLATE "default",
        sess json NOT NULL,
        expire timestamp(6) NOT NULL,
        CONSTRAINT session_pkey PRIMARY KEY (sid)
      );
    `);
    
    // Close the pool
    await pool.end();
    
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

export default runMigration;