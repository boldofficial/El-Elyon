import { config } from 'dotenv';
config({ path: '.env.local' });

async function test() {
  const { db } = await import('./db/index.js');
  const { residents } = await import('./db/schema.js');
  const { eq } = await import('drizzle-orm');
  try {
    const res = await db.select().from(residents).where(eq(residents.location, 'PRAISE HOME'));
    console.log("Residents in PRAISE HOME:", JSON.stringify(res, null, 2));
    
    const allRes = await db.select().from(residents).limit(5);
    console.log("Sample Residents (Any Location):", JSON.stringify(allRes, null, 2));
  } catch (e) {
    console.error("DB Error:", e);
  }
}
test();
