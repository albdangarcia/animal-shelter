-- CreateIndex
CREATE UNIQUE INDEX "medical_entries_one_spay_neuter_given" ON "medical_entries"("animal_id") WHERE (kind = 'SURGERY' AND procedure IN ('SPAY', 'NEUTER') AND status = 'COMPLETED' AND voided_at IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "medical_entries_one_spay_neuter_scheduled" ON "medical_entries"("animal_id") WHERE (kind = 'SURGERY' AND procedure IN ('SPAY', 'NEUTER') AND status = 'SCHEDULED' AND voided_at IS NULL);

