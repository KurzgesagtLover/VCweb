const fs = require("node:fs");

function edit(file, before, after) {
  const source = fs.readFileSync(file, "utf8");
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${file}: expected one match, found ${count}`);
  fs.writeFileSync(file, source.replace(before, after), "utf8");
}

edit(
  "src/db/schema/world.ts",
  `  imageData: binaryData("image_data").notNull(),
  contentType: text("content_type").notNull().default("image/png"),`,
  `  imageData: binaryData("image_data").notNull(),
  borderlessImageData: binaryData("borderless_image_data"),
  contentType: text("content_type").notNull().default("image/png"),`,
);

edit(
  "src/db/schema/world.ts",
  `export const mapRasterColorAssignments = pgTable(`,
  `export const mapRasterBorderLayers = pgTable("map_raster_border_layers", {
  mapId: uuid("map_id")
    .primaryKey()
    .references(() => campaignMaps.id, { onDelete: "restrict" }),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "restrict" }),
  strokes: jsonb("strokes")
    .$type<
      Array<{
        type: "INACTIVE" | "ACTIVE" | "LEGAL" | "GUERRILLA" | "NONE";
        width: number;
        points: Array<{ x: number; y: number }>;
      }>
    >()
    .notNull()
    .default([]),
  colors: jsonb("colors")
    .$type<Record<"INACTIVE" | "ACTIVE" | "LEGAL" | "GUERRILLA", string>>()
    .notNull(),
  renderedData: binaryData("rendered_data").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedBy: text("updated_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mapRasterColorAssignments = pgTable(`,
);
