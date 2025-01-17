import { pgTable, text, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  uuid: uuid("uuid").defaultRandom(),
  email: text("email").unique(),
  displayName: text("display_name"),
});
