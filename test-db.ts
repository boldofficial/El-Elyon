import { db } from './db/index';
import { employees } from './db/schema';
async function test() {
  try {
    const result = await db.select().from(employees).limit(1);
    console.log("Success! DB is accessible and tables exist.");
  } catch (e) {
    console.error("DB Error:", e);
  }
}
test();
