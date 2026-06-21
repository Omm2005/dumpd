import {
  boolean,
  doublePrecision,
  index,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const worlds = pgTable(
  "worlds",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    color: text("color").notNull().default("amber"),
    positionX: doublePrecision("position_x").notNull().default(0),
    positionY: doublePrecision("position_y").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("worlds_user_id_idx").on(table.userId),
    index("worlds_created_at_idx").on(table.createdAt),
  ],
);
