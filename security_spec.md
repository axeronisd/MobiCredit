# Security Specification: Firestore Rules & Data Invariants

This document details the security model, invariants, and edge cases to prevent unauthorized access, privilege escalation, and update-gaps in the installment tracking platform.

## 1. Data Invariants

1. **Isolation by Tenant (tenantId)**: Each client contract belongs to a specific tenant (the manager/shop who created it). Managers can only view and mutate client contracts where `tenantId` matches their own User ID.
2. **Platform Admins concept (role = 'admin')**: Platform admins can view and coordinate all entities in the system across all tenants. They can add user accounts (tenants) and see the full picture.
3. **Immutability of Key Columns**: Important contract metrics such as `id`, `tenantId`, `phonePrice`, and `markupPercent` cannot be modified after a contract is registered.
4. **Id Integrity and Formatting**: All user accounts and client IDs must match alphanumeric patterns with no script injections.
5. **No Anonymous Mutations**: Every read and write transaction requires valid authentication credentials.

---

## 2. The "Dirty Dozen" Payloads

Here are 12 malicious payloads designed to threaten system security, all of which are rejected under our fortress rules.

### Attack 1: User Self-Promotion (Privilege Escalation)
* **Description**: A regular manager attempts to upgrade their account role to `admin`.
* **Payload**:
```json
{
  "role": "admin"
}
```
* **Status**: `PERMISSION_DENIED`

### Attack 2: Cross-Tenant Data Leak (Direct Get)
* **Description**: Tenant `manager_A` attempts to read client contracts belonging to `manager_B`.
* **Payload**: `GET /clients/client-of-manager-B` (with token of `manager_A`)
* **Status**: `PERMISSION_DENIED`

### Attack 3: Cross-Tenant Data Leak (List Scrape)
* **Description**: Tenant `manager_A` queries `/clients` collection without setting a tenantId filter, attempting a list scrape.
* **Payload**: `LIST /clients` (no `where` clause)
* **Status**: `PERMISSION_DENIED`

### Attack 4: Orphaned Contract Injection
* **Description**: Creating a client installment with a non-existent or fake `tenantId`.
* **Payload**:
```json
{
  "id": "cl-bad",
  "tenantId": "nonexistent-tenant-id",
  "firstName": "Hacker",
  "lastName": "User",
  "inn": "12345678901234",
  "phoneModel": "iPhone 15",
  "imei": "123456789012345",
  "phonePrice": 50000,
  "markupPercent": 10,
  "totalRemaining": 55000,
  "payments": []
}
```
* **Status**: `PERMISSION_DENIED` (Checks that tenant account exists)

### Attack 5: Ghost Field Injection (Shadow Update)
* **Description**: Injecting unauthorized schema fields like `isPaidInternally` or `overdueWaiver` into a contract.
* **Payload**:
```json
{
  "totalRemaining": 50000,
  "isPaidInternally": true,
  "ghostField": "maliciousValue"
}
```
* **Status**: `PERMISSION_DENIED` (Strict schema and keys matching)

### Attack 6: Temporal Spoofing (createdAt Forge)
* **Description**: Spoofing contract creation timestamp by backdating it manually.
* **Payload**:
```json
{
  "createdAt": "2020-01-01T00:00:00Z"
}
```
* **Status**: `PERMISSION_DENIED`

### Attack 7: Value Poisoning (DDoS via sizing)
* **Description**: Injecting a 2MB base64 or garbage string into a text-only index (e.g., `phoneModel` or `firstName`).
* **Payload**:
```json
{
  "firstName": "A".repeat(50000)
}
```
* **Status**: `PERMISSION_DENIED` (Max length string checks)

### Attack 8: ID Poisoning Attack
* **Description**: Registering a client with an ID containing malicious symbols or path traversal variables.
* **Payload**: `CREATE /clients/../../hacker_doc`
* **Status**: `PERMISSION_DENIED`

### Attack 9: Installment Markup Theft
* **Description**: An authenticated manager modifies their own registered installment markup percent downstream to alter payments calculation.
* **Payload**:
```json
{
  "markupPercent": 0,
  "totalRemaining": 500
}
```
* **Status**: `PERMISSION_DENIED` (Immutable core variables)

### Attack 10: Anonymous Writing
* **Description**: Attempting to write into `/users` or `/clients` without any Firebase credentials.
* **Payload**: `CREATE /users/hacker` (No headers)
* **Status**: `PERMISSION_DENIED`

### Attack 11: Self-Registered Administrator Profile
* **Description**: Attempting to create an administrator profile directly via `/users` from the browser.
* **Payload**:
```json
{
  "id": "hacker",
  "login": "hacker",
  "passwordHash": "hacker123",
  "role": "admin"
}
```
* **Status**: `PERMISSION_DENIED` (Only existing admins or bootstrap procedures allow creating admin roles)

### Attack 12: Terminal State Overwrite
* **Description**: Arbitrarily removing payment steps from the array to bypass installments auditing.
* **Payload**:
```json
{
  "payments": []
}
```
* **Status**: `PERMISSION_DENIED`

---

## 3. Test Runner Design

While the environment uses automated front-end flow simulation, this design ensures that every query complies with rule requirements. The direct collection refs must be paired with appropriate filter rules:

```ts
// Example: Validated query ensuring permissions pass
const q = query(
  collection(db, 'clients'),
  where('tenantId', '==', currentUser.id)
);
```
