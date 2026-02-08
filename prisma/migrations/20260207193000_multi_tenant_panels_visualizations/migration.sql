-- CreateIndex
CREATE UNIQUE INDEX "Project_id_orgId_key" ON "Project"("id", "orgId");

-- CreateTable
CREATE TABLE "Panel" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "tableConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Panel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visualization" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "panelId" TEXT NOT NULL,
    "createdById" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT,
    "config" JSONB NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visualization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Panel_id_orgId_key" ON "Panel"("id", "orgId");

-- CreateIndex
CREATE INDEX "Panel_orgId_projectId_position_idx" ON "Panel"("orgId", "projectId", "position");

-- CreateIndex
CREATE INDEX "Visualization_orgId_projectId_panelId_position_idx" ON "Visualization"("orgId", "projectId", "panelId", "position");

-- AddForeignKey
ALTER TABLE "Panel" ADD CONSTRAINT "Panel_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Panel" ADD CONSTRAINT "Panel_projectId_orgId_fkey" FOREIGN KEY ("projectId", "orgId") REFERENCES "Project"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Panel" ADD CONSTRAINT "Panel_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visualization" ADD CONSTRAINT "Visualization_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visualization" ADD CONSTRAINT "Visualization_projectId_orgId_fkey" FOREIGN KEY ("projectId", "orgId") REFERENCES "Project"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visualization" ADD CONSTRAINT "Visualization_panelId_orgId_fkey" FOREIGN KEY ("panelId", "orgId") REFERENCES "Panel"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visualization" ADD CONSTRAINT "Visualization_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
