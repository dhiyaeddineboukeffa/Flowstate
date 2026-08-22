import { createClient } from "@libsql/client";

async function main() {
  const client = createClient({
    url: "file:./dev.db"
  });

  await client.execute("DELETE FROM ChecklistItem;");
  console.log("Deleted all checklist items from SQLite database.");
  
  client.close();
}

main().catch(console.error);
