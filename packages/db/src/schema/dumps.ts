import { relations } from "drizzle-orm";
import {
  doublePrecision,
  index,
  json,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { worlds } from "./worlds";

export type DumpContent = Record<string, unknown>;

export const dumps = pgTable(
  "dumps",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    worldId: text("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("note"),
    title: text("title").notNull(),
    content: json("content").$type<DumpContent>().notNull(),
    plainText: text("plain_text").notNull().default(""),
    positionX: doublePrecision("position_x").notNull().default(0),
    positionY: doublePrecision("position_y").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("dumps_user_id_idx").on(table.userId),
    index("dumps_world_id_idx").on(table.worldId),
    index("dumps_created_at_idx").on(table.createdAt),
  ],
);

export const dumpsRelations = relations(dumps, ({ one }) => ({
  user: one(user, {
    fields: [dumps.userId],
    references: [user.id],
  }),
  world: one(worlds, {
    fields: [dumps.worldId],
    references: [worlds.id],
  }),
}));
