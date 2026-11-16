# Security Specification — ESP Lolin Smart Lamp Dashboard (Direct No-Login Sync)

## 1. Data Invariants
1. Top-level collection listing on `/devices` is disabled (`allow list: if false`); clients and ESP8266 hardware connect directly by known `deviceId` (`^[a-zA-Z0-9_-]+$`, max 64 chars).
2. Every `LampDevice` and `UsageLog` document strictly validates required and allowed fields (`hasAll` + `hasOnly`), field types, string length limits, and enum values.
3. `id` and `createdAt` on `/devices/{deviceId}` are immutable after creation; `createdAt` and `updatedAt` must equal `request.time`.
4. Every `UsageLog` under `/devices/{deviceId}/usageLogs/{logId}` must reference an existing parent `/devices/{deviceId}` and match `{deviceId}`.
5. `UsageLog` entries are append-only (`allow update: if false`).
