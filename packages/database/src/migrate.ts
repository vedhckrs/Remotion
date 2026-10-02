import { neon } from '@neondatabase/serverless';
export async function migrate(text: string) { const url = process.env.DATABASE_URL; if (!url)
    throw new Error('Set DATABASE_URL before migration'); const sql = neon(url); await sql.transaction(text.split(';').map(s => s.trim()).filter(Boolean).map(s => sql.query(s, []))); }
