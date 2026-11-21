-- Age gate hardening: remember an under-18 submission so the date of birth
-- cannot be re-entered to get past the gate. Additive and nullable.
ALTER TABLE "users" ADD COLUMN "ageGateBlockedAt" TIMESTAMP(3);
