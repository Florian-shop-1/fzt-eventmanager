import { config } from "dotenv";
config({ path: [".env.local", ".env"] });
async function main() {
  const { db } = await import("@/lib/db/client");
  console.log("leere show:", await db()`
    select id, ditix_event_id, show, datum, uhrzeit, bestaetigt, gesamt_cent, eingegangen_am
      from shop_buchung where show = '' or show is null or datum is null order by eingegangen_am desc limit 10`);
  console.log("posten dazu:", await db()`
    select b.id, p.name, p.gruppe, p.anzahl from shop_buchung b join shop_buchung_posten p on p.buchung_id=b.id
     where b.show = '' or b.show is null or b.datum is null limit 20`);
}
main();
