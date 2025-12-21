# Design Document: Backup Management UI

## Overview

This feature adds a backup management section to the existing Email Filter admin panel. The UI is implemented as an extension to the existing HTML template in `packages/vps-admin/src/routes/frontend.ts`. It communicates with the VPS API backup endpoints through a proxy route in vps-admin.

The implementation follows the existing patterns in the admin panel:
- Single-page HTML with embedded CSS and JavaScript
- Session-based authentication (already implemented)
- API calls to VPS API through proxy routes

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Admin Panel Browser                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Backup Management Section                   │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │   │
│  │  │  Create  │ │   List   │ │ Download │ │  Delete  │   │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │   │
│  │  ┌──────────────────────────────────────────────────┐   │   │
│  │  │              Restore (File Upload)               │   │   │
│  │  └──────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │ HTTP
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    VPS Admin (:3001)                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Backup Proxy Routes                         │   │
│  │  /api/backup/* → VPS API /api/admin/backup/*            │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │ HTTP
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    VPS API (:3000)                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Backup API Endpoints                        │   │
│  │  POST /api/admin/backup/create                          │   │
│  │  GET  /api/admin/backup/list                            │   │
│  │  GET  /api/admin/backup/download/:filename              │   │
│  │  POST /api/admin/backup/restore                         │   │
│  │  DELETE /api/admin/backup/:filename                     │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### Proxy Routes (vps-admin)

```typescript
// packages/vps-admin/src/routes/backup-proxy.ts

export async function backupProxyRoutes(app: FastifyInstance): Promise<void> {
  const VPS_API_URL = process.env.VPS_API_URL || 'http://localhost:3000';
  const API_TOKEN = process.env.API_TOKEN;

  // Proxy backup list
  app.get('/api/backup/list', async (request, reply) => {
    // Forward to VPS API with auth
  });

  // Proxy backup create
  app.post('/api/backup/create', async (request, reply) => {
    // Forward to VPS API with auth
  });

  // Proxy backup download
  app.get('/api/backup/download/:filename', async (request, reply) => {
    // Stream file from VPS API
  });

  // Proxy backup restore (multipart)
  app.post('/api/backup/restore', async (request, reply) => {
    // Forward multipart upload to VPS API
  });

  // Proxy backup delete
  app.delete('/api/backup/:filename', async (request, reply) => {
    // Forward to VPS API with auth
  });
}
```

### Frontend UI Components

The backup section is added to the existing HTML template:

```html
<!-- Backup Management Section -->
<div class="card">
  <h2>📦 数据库备份</h2>
  <div id="backup-alert-container"></div>
  
  <!-- Stats -->
  <div class="backup-stats">
    <span>备份数量: <strong id="backup-count">0</strong></span>
    <span>总大小: <strong id="backup-size">0 B</strong></span>
  </div>
  
  <!-- Actions -->
  <div class="backup-actions">
    <button class="btn btn-primary" onclick="createBackup()">+ 创建备份</button>
    <button class="btn btn-success" onclick="showRestoreModal()">↑ 恢复备份</button>
  </div>
  
  <!-- Backup List -->
  <table>
    <thead>
      <tr>
        <th>文件名</th>
        <th>大小</th>
        <th>创建时间</th>
        <th>操作</th>
      </tr>
    </thead>
    <tbody id="backups-table"></tbody>
  </table>
</div>
```

### JavaScript Functions

```javascript
// Load backups
async function loadBackups() {
  const res = await fetch('/api/backup/list', { credentials: 'include' });
  const data = await res.json();
  renderBackups(data.backups, data.totalCount, data.totalSize);
}

// Create backup
async function createBackup() {
  const res = await fetch('/api/backup/create', { 
    method: 'POST', 
    credentials: 'include' 
  });
  // Handle response
}

// Download backup
function downloadBackup(filename) {
  window.location.href = '/api/backup/download/' + encodeURIComponent(filename);
}

// Delete backup
async function deleteBackup(filename) {
  if (!confirm('确定要删除备份 ' + filename + ' 吗？')) return;
  const res = await fetch('/api/backup/' + encodeURIComponent(filename), {
    method: 'DELETE',
    credentials: 'include'
  });
  // Handle response
}

// Restore backup
async function restoreBackup(file) {
  if (!confirm('恢复备份将替换当前数据库，确定继续吗？')) return;
  const formData = new FormData();
  formData.append('backup', file);
  const res = await fetch('/api/backup/restore', {
    method: 'POST',
    body: formData,
    credentials: 'include'
  });
  // Handle response
}

// Format file size
function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
```

## Data Models

### Backup List Response

```typescript
interface BackupListResponse {
  success: boolean;
  backups: Array<{
    filename: string;
    size: number;
    createdAt: string;
    isPreRestore: boolean;
  }>;
  totalCount: number;
  totalSize: number;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Backup List Rendering Completeness

*For any* list of backup metadata, the rendered HTML table SHALL contain all backup filenames, sizes, and creation dates from the input data.

**Validates: Requirements 1.2**

### Property 2: Backup Count Accuracy

*For any* list of backups, the displayed count SHALL equal the length of the backup list.

**Validates: Requirements 6.1**

### Property 3: Size Formatting Correctness

*For any* non-negative integer representing bytes, the formatSize function SHALL return a human-readable string with appropriate unit (B, KB, MB, GB).

**Validates: Requirements 6.2**

## Error Handling

| Error Condition | UI Behavior |
|----------------|-------------|
| API unreachable | Show "无法连接到服务器" error message |
| Backup creation fails | Show error message with reason |
| Download fails | Browser handles download error |
| Restore fails | Show error message with reason |
| Delete fails | Show error message with reason |
| Session expired | Redirect to login page |

## Testing Strategy

### Dual Testing Approach

This feature uses both unit tests and property-based tests:

- **Unit tests**: Verify specific UI rendering examples and API proxy behavior
- **Property-based tests**: Verify formatSize function and rendering completeness

### Property-Based Testing

**Library**: fast-check

**Configuration**: Each property test runs minimum 100 iterations.

**Properties to Test**:

1. **formatSize correctness**: For any non-negative integer, formatSize returns valid formatted string
2. **Backup count accuracy**: Rendered count matches input array length
3. **Rendering completeness**: All backup data appears in rendered output

### Unit Tests

1. **Proxy routes**
   - Forward requests to VPS API correctly
   - Handle authentication
   - Handle errors

2. **UI rendering**
   - Empty backup list shows message
   - Backup list renders all items
   - Stats display correctly

### Test File Location

- `packages/vps-admin/src/routes/backup-proxy.test.ts` - Proxy route tests
- `packages/vps-admin/src/utils/format.test.ts` - Format utility tests
