/*
  Warnings:

  - A unique constraint covering the columns `[phone]` on the table `AiFeatures` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "AiFeatures_phone_key" ON "AiFeatures"("phone");
