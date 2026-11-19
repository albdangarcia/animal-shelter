-- Where a photo sits in a frame wider than it (photo editing phase 4): the
-- vertical object-position, 0 the top and 1 the bottom. Null is centred, so
-- every existing photo looks as it did.
ALTER TABLE "animal_images" ADD COLUMN "focus_y" DOUBLE PRECISION;
ALTER TABLE "animal_images" ADD CONSTRAINT "animal_images_focus_y_range"
  CHECK ("focus_y" IS NULL OR ("focus_y" >= 0 AND "focus_y" <= 1));
