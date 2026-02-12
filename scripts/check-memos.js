import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config();

const sql = neon(process.env.DATABASE_URL);
const rows = await sql`select column_name, data_type from information_schema.columns where table_name='memos' order by ordinal_position`;
console.log(rows);
