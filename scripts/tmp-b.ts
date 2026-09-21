import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });
const sql = neon(process.env.DATABASE_URL!);
(async () => {
  console.log(await sql`select column_name, data_type from information_schema.columns where table_name='shop_buchung' order by ordinal_position`);
  console.log(await sql`select id, name, email, plaetze, hinweis, access_code, cart_id from shop_buchung where datum='2026-12-11' limit 3`);
})();
