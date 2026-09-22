CREATE TABLE "shelter_settings" (
    "id" TEXT NOT NULL DEFAULT 'shelter',
    "timezone" TEXT NOT NULL,
    "weightUnitSystem" TEXT NOT NULL,
    "defaultPhoneCountry" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shelter_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shelter_settings_singleton" CHECK ("id" = 'shelter'),
    CONSTRAINT "shelter_settings_weight_unit" CHECK ("weightUnitSystem" IN ('metric', 'imperial'))
);
