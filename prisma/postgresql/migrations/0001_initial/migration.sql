-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Villa" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pricePerNight" INTEGER NOT NULL,
    "maxGuests" INTEGER NOT NULL,
    "bedrooms" INTEGER NOT NULL,
    "sizeSqm" INTEGER NOT NULL,
    "totalUnits" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Villa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "bookingCode" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "villaId" TEXT NOT NULL,
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3) NOT NULL,
    "guests" INTEGER NOT NULL,
    "guestName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "specialRequests" TEXT,
    "nights" INTEGER NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "status" TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
    "paymentProvider" TEXT,
    "paymentRef" TEXT,
    "source" TEXT NOT NULL DEFAULT 'DIRECT_WEB',
    "assignedUnitId" TEXT,
    "internalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingNight" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "roomUnitId" TEXT NOT NULL,
    "stayDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingNight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomUnit" (
    "id" TEXT NOT NULL,
    "villaId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "floor" TEXT,
    "operationalStatus" TEXT NOT NULL DEFAULT 'SELLABLE',
    "housekeepingStatus" TEXT NOT NULL DEFAULT 'INSPECTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HousekeepingTask" (
    "id" TEXT NOT NULL,
    "roomUnitId" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "taskType" TEXT NOT NULL DEFAULT 'TURNOVER',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "assignee" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HousekeepingTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatePlan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "refundable" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RatePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyRate" (
    "id" TEXT NOT NULL,
    "villaId" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "price" INTEGER NOT NULL,
    "minStay" INTEGER NOT NULL DEFAULT 1,
    "closedToArrival" BOOLEAN NOT NULL DEFAULT false,
    "closedToDeparture" BOOLEAN NOT NULL DEFAULT false,
    "stopSell" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Folio" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Folio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FolioEntry" (
    "id" TEXT NOT NULL,
    "folioId" TEXT NOT NULL,
    "entryType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "debit" INTEGER NOT NULL DEFAULT 0,
    "credit" INTEGER NOT NULL DEFAULT 0,
    "externalRef" TEXT,
    "serviceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FolioEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "folioId" TEXT,
    "provider" TEXT NOT NULL,
    "providerRef" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PAYMENT',
    "status" TEXT NOT NULL DEFAULT 'SUCCEEDED',
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "method" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceTicket" (
    "id" TEXT NOT NULL,
    "ticketCode" TEXT NOT NULL,
    "roomUnitId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "blocksInventory" BOOLEAN NOT NULL DEFAULT false,
    "reportedBy" TEXT,
    "assignedTo" TEXT,
    "dueAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessDay" (
    "id" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "summaryJson" TEXT,

    CONSTRAINT "BusinessDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NightAuditRun" (
    "id" TEXT NOT NULL,
    "businessDayId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "checklistJson" TEXT NOT NULL,
    "summaryJson" TEXT NOT NULL,
    "runBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "NightAuditRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'QLOAPPS',
    "fileName" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'DRY_RUN',
    "status" TEXT NOT NULL DEFAULT 'STAGED',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "committedRows" INTEGER NOT NULL DEFAULT 0,
    "summaryJson" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRecord" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "externalId" TEXT,
    "entityType" TEXT NOT NULL DEFAULT 'BOOKING',
    "status" TEXT NOT NULL DEFAULT 'VALID',
    "payloadJson" TEXT NOT NULL,
    "errorsJson" TEXT,
    "localId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalIdMapping" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "checksum" TEXT,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalIdMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "lastError" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupRun" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "storageType" TEXT NOT NULL DEFAULT 'LOCAL_FILE',
    "location" TEXT,
    "sizeBytes" INTEGER,
    "checksum" TEXT,
    "error" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "BackupRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Villa_slug_key" ON "Villa"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_bookingCode_key" ON "Booking"("bookingCode");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_idempotencyKey_key" ON "Booking"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Booking_status_checkIn_checkOut_idx" ON "Booking"("status", "checkIn", "checkOut");

-- CreateIndex
CREATE INDEX "Booking_villaId_checkIn_checkOut_idx" ON "Booking"("villaId", "checkIn", "checkOut");

-- CreateIndex
CREATE INDEX "Booking_assignedUnitId_checkIn_checkOut_idx" ON "Booking"("assignedUnitId", "checkIn", "checkOut");

-- CreateIndex
CREATE INDEX "Booking_email_createdAt_idx" ON "Booking"("email", "createdAt");

-- CreateIndex
CREATE INDEX "BookingNight_stayDate_roomUnitId_idx" ON "BookingNight"("stayDate", "roomUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingNight_roomUnitId_stayDate_key" ON "BookingNight"("roomUnitId", "stayDate");

-- CreateIndex
CREATE UNIQUE INDEX "BookingNight_bookingId_stayDate_key" ON "BookingNight"("bookingId", "stayDate");

-- CreateIndex
CREATE INDEX "RoomUnit_villaId_operationalStatus_housekeepingStatus_idx" ON "RoomUnit"("villaId", "operationalStatus", "housekeepingStatus");

-- CreateIndex
CREATE UNIQUE INDEX "RoomUnit_villaId_code_key" ON "RoomUnit"("villaId", "code");

-- CreateIndex
CREATE INDEX "HousekeepingTask_businessDate_status_idx" ON "HousekeepingTask"("businessDate", "status");

-- CreateIndex
CREATE INDEX "HousekeepingTask_roomUnitId_businessDate_idx" ON "HousekeepingTask"("roomUnitId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "StaffUser_email_key" ON "StaffUser"("email");

-- CreateIndex
CREATE INDEX "StaffUser_active_role_idx" ON "StaffUser"("active", "role");

-- CreateIndex
CREATE UNIQUE INDEX "StaffSession_tokenHash_key" ON "StaffSession"("tokenHash");

-- CreateIndex
CREATE INDEX "StaffSession_userId_expiresAt_idx" ON "StaffSession"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "StaffSession_expiresAt_revokedAt_idx" ON "StaffSession"("expiresAt", "revokedAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RatePlan_code_key" ON "RatePlan"("code");

-- CreateIndex
CREATE INDEX "DailyRate_businessDate_stopSell_idx" ON "DailyRate"("businessDate", "stopSell");

-- CreateIndex
CREATE UNIQUE INDEX "DailyRate_villaId_ratePlanId_businessDate_key" ON "DailyRate"("villaId", "ratePlanId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "Folio_bookingId_key" ON "Folio"("bookingId");

-- CreateIndex
CREATE INDEX "Folio_status_updatedAt_idx" ON "Folio"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FolioEntry_externalRef_key" ON "FolioEntry"("externalRef");

-- CreateIndex
CREATE INDEX "FolioEntry_folioId_serviceDate_idx" ON "FolioEntry"("folioId", "serviceDate");

-- CreateIndex
CREATE INDEX "FolioEntry_entryType_createdAt_idx" ON "FolioEntry"("entryType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_providerRef_key" ON "PaymentTransaction"("providerRef");

-- CreateIndex
CREATE INDEX "PaymentTransaction_bookingId_occurredAt_idx" ON "PaymentTransaction"("bookingId", "occurredAt");

-- CreateIndex
CREATE INDEX "PaymentTransaction_provider_status_occurredAt_idx" ON "PaymentTransaction"("provider", "status", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceTicket_ticketCode_key" ON "MaintenanceTicket"("ticketCode");

-- CreateIndex
CREATE INDEX "MaintenanceTicket_status_priority_createdAt_idx" ON "MaintenanceTicket"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "MaintenanceTicket_roomUnitId_status_idx" ON "MaintenanceTicket"("roomUnitId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessDay_businessDate_key" ON "BusinessDay"("businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "NightAuditRun_businessDayId_key" ON "NightAuditRun"("businessDayId");

-- CreateIndex
CREATE INDEX "ImportBatch_source_createdAt_idx" ON "ImportBatch"("source", "createdAt");

-- CreateIndex
CREATE INDEX "ImportBatch_status_createdAt_idx" ON "ImportBatch"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ImportRecord_externalId_entityType_idx" ON "ImportRecord"("externalId", "entityType");

-- CreateIndex
CREATE UNIQUE INDEX "ImportRecord_batchId_rowNumber_key" ON "ImportRecord"("batchId", "rowNumber");

-- CreateIndex
CREATE INDEX "ExternalIdMapping_localId_entityType_idx" ON "ExternalIdMapping"("localId", "entityType");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdMapping_source_entityType_externalId_key" ON "ExternalIdMapping"("source", "entityType", "externalId");

-- CreateIndex
CREATE INDEX "WebhookEvent_status_createdAt_idx" ON "WebhookEvent"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_eventId_key" ON "WebhookEvent"("provider", "eventId");

-- CreateIndex
CREATE INDEX "BackupRun_createdAt_idx" ON "BackupRun"("createdAt");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_villaId_fkey" FOREIGN KEY ("villaId") REFERENCES "Villa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_assignedUnitId_fkey" FOREIGN KEY ("assignedUnitId") REFERENCES "RoomUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingNight" ADD CONSTRAINT "BookingNight_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingNight" ADD CONSTRAINT "BookingNight_roomUnitId_fkey" FOREIGN KEY ("roomUnitId") REFERENCES "RoomUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomUnit" ADD CONSTRAINT "RoomUnit_villaId_fkey" FOREIGN KEY ("villaId") REFERENCES "Villa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HousekeepingTask" ADD CONSTRAINT "HousekeepingTask_roomUnitId_fkey" FOREIGN KEY ("roomUnitId") REFERENCES "RoomUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffSession" ADD CONSTRAINT "StaffSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "StaffUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyRate" ADD CONSTRAINT "DailyRate_villaId_fkey" FOREIGN KEY ("villaId") REFERENCES "Villa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyRate" ADD CONSTRAINT "DailyRate_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folio" ADD CONSTRAINT "Folio_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolioEntry" ADD CONSTRAINT "FolioEntry_folioId_fkey" FOREIGN KEY ("folioId") REFERENCES "Folio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_folioId_fkey" FOREIGN KEY ("folioId") REFERENCES "Folio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_roomUnitId_fkey" FOREIGN KEY ("roomUnitId") REFERENCES "RoomUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NightAuditRun" ADD CONSTRAINT "NightAuditRun_businessDayId_fkey" FOREIGN KEY ("businessDayId") REFERENCES "BusinessDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRecord" ADD CONSTRAINT "ImportRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
