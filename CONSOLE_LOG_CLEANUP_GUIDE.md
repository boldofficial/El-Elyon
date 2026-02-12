# Console.log Cleanup Guide

## Strategy

Replace all `console.log`, `console.error`, `console.warn`, `console.info` statements with the centralized `logger` utility.

## Logger Import

```typescript
import {logger} from '@/lib/logger';
```

## Replacement Rules

### 1. console.log() → logger.info()
```typescript
// Before
console.log('✅ User created:', data.clerkUserId);

// After
logger.info('✅ User created:', data.clerkUserId);
```

### 2. console.error() → logger.error()
```typescript
// Before
console.error('Error fetching memos:', error);

// After
logger.error('Error fetching memos:', error);
```

### 3. console.warn() → logger.warn()
```typescript
// Before
console.warn('⚠️  Recommended environment variables not set');

// After
logger.warn('⚠️  Recommended environment variables not set');
```

### 4. console.info() → logger.info()
```typescript
// Before
console.info('Processing request');

// After
logger.info('Processing request');
```

### 5. console.debug() → logger.debug()
```typescript
// Before
console.debug('Debug info:', data);

// After
logger.debug('Debug info:', data);
```

## Special Cases

### Keep console.* in logger.ts itself
The logger utility uses `console.*` internally - don't replace these!

### Keep console.* in error-handler.ts
Error handler has one legitimate console.error for internal logging.

### Keep console.* in audit-enhanced.ts
Security alert console.error for critical events (intentional for monitoring).

### Production Environment Checks
```typescript
// Before
if (process.env.NODE_ENV === 'production') {
  console.log('Production message');
}

// After - Logger handles this automatically
logger.info('Production message'); // Only logs in production if needed
```

## Files to Update (Priority Order)

### High Priority (User-Facing APIs)
- [ ] src/app/api/memos/**/*.ts
- [ ] src/app/api/vacation-requests/**/*.ts
- [ ] src/app/api/users/**/*.ts
- [ ] src/app/api/residents/**/*.ts
- [ ] src/app/api/shifts/**/*.ts

### Medium Priority (Admin/Supervisor)
- [ ] src/app/api/admin/**/*.ts
- [ ] src/app/api/supervisor/**/*.ts
- [ ] src/app/api/documents/**/*.ts

### Lower Priority (Internal)
- [ ] db/mutations/**/*.ts
- [ ] db/queries/**/*.ts

### Files to Skip
- ✅ lib/logger.ts (implements console.*)
- ✅ lib/error-handler.ts (intentional console.error)
- ✅ lib/audit-enhanced.ts (security alerts)

## Automated Replacement

### Find Command (PowerShell)
```powershell
# Find all console.log statements
Get-ChildItem -Path src/app/api -Recurse -Filter *.ts | Select-String "console\.(log|error|warn|info|debug)" | Select-Object Path, LineNumber, Line
```

### Manual Replacement Steps
1. Open file
2. Add import: `import {logger} from '@/lib/logger';`
3. Replace console.log → logger.info
4. Replace console.error → logger.error
5. Replace console.warn → logger.warn
6. Test the route

## Benefits After Cleanup

✅ Conditional logging (production vs development)
✅ Structured log format with timestamps
✅ Consistent logging across codebase
✅ Easier to filter/search logs
✅ Better production performance (less noise)
✅ Centralized log configuration

## Verification

After cleanup, search for remaining console statements:
```bash
grep -r "console\.(log|error|warn)" src/app/api
```

Expected results:
- 0 matches in src/app/api
- Some matches in lib/logger.ts (expected)
- Some matches in lib/error-handler.ts (expected)
- Some matches in lib/audit-enhanced.ts (expected)
