# El-Elyon Production Deployment Checklist

**Date:** February 4, 2026  
**Version:** 1.0.0

---

## Pre-Deployment

### Environment Variables

- [ ] `DATABASE_URL` - Neon PostgreSQL connection string (required)
- [ ] `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk public key (required)
- [ ] `CLERK_SECRET_KEY` - Clerk secret key (required)
- [ ] `NEXT_PUBLIC_CLERK_SIGN_IN_URL` - /sign-in (required)
- [ ] `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` - / (required)
- [ ] `AWS_ACCESS_KEY_ID` - S3 access key (required)
- [ ] `AWS_SECRET_ACCESS_KEY` - S3 secret key (required)
- [ ] `AWS_REGION` - S3 region (required)
- [ ] `AWS_S3_BUCKET_NAME` - S3 bucket name (required)
- [ ] `SENTRY_DSN` - Sentry error tracking (recommended)
- [ ] `KV_REST_API_URL` - Upstash Redis URL (recommended for rate limiting)
- [ ] `KV_REST_API_TOKEN` - Upstash Redis token (recommended for rate limiting)
- [ ] `NEXT_PUBLIC_APP_URL` - Production URL (recommended)

### Database

- [ ] Run all migrations: `npm run db:push`
- [ ] Verify indexes on critical tables:
  - residents (location, createdBy)
  - employees (clerkUserId, role, locations)
  - shifts (clerkUserId, location, clockInTime)
  - auditLogs (clerkUserId, timestamp, event)
  - memos (sender, createdAt, recipientType)
  - vacationRequests (employee, status, startDate)
- [ ] Create first admin user: Run app, access `/admin`, use bootstrap
- [ ] Test database connectivity with health check

### Third-Party Services

- [ ] **Clerk**: Verify production instance configured
- [ ] **AWS S3**: Verify bucket exists, CORS configured, IAM permissions set
- [ ] **Sentry**: Create project, get DSN, verify source maps upload
- [ ] **Upstash Redis**: Create database, get KV credentials
- [ ] **Neon PostgreSQL**: Verify connection pooling, enable auto-scaling

### Code Review

- [ ] All `console.log` statements replaced with `logger.*` (except intentional)
- [ ] All API routes have error handling
- [ ] All database queries use parameterized queries (no SQL injection)
- [ ] All user inputs validated with Zod schemas
- [ ] File uploads validated (MIME type, size, extension)
- [ ] Sensitive data not logged in production

---

## Deployment

### Build & Deploy

- [ ] Run production build locally: `npm run build`
- [ ] Fix any build errors or warnings
- [ ] Deploy to Vercel: `vercel --prod` or use Git integration
- [ ] Verify deployment completed successfully
- [ ] Check Vercel logs for errors

### Post-Deployment Verification

- [ ] **Health Check**: GET `/api/health` returns 200
  - Database status: "up"
  - Environment: "valid"
  - Redis status: "up" (if configured)

- [ ] **Authentication**: Sign in with Clerk works
  - Redirects to sign-in page when unauthenticated
  - Session persists after login
  - Logout works correctly

- [ ] **API Routes**: Test critical endpoints
  - GET `/api/memos` - returns memos
  - POST `/api/memos` - creates memo (admin)
  - GET `/api/vacation-requests` - returns requests
  - POST `/api/shifts/clock-in` - starts shift
  - POST `/api/shifts/clock-out` - ends shift

- [ ] **File Uploads**: Test file security
  - Valid files upload successfully
  - Invalid MIME types rejected
  - Oversized files rejected
  - Files accessible via presigned URLs

- [ ] **Rate Limiting**: Verify rate limits enforced
  - API: 20 requests per 10 seconds
  - Auth: 5 requests per 60 seconds
  - Upload: 5 requests per 60 seconds
  - Returns 429 when exceeded

- [ ] **Error Tracking**: Verify Sentry integration
  - Trigger test error: `/api/sentry-example-api`
  - Verify error appears in Sentry dashboard
  - Check source maps resolve correctly
  - Verify sensitive data filtered

---

## Monitoring Setup

### Load Balancer

- [ ] Configure health check endpoint: `/api/health`
- [ ] Set health check interval: 30 seconds
- [ ] Set unhealthy threshold: 3 consecutive failures
- [ ] Set healthy threshold: 2 consecutive successes
- [ ] Verify traffic routing to healthy instances

### Sentry

- [ ] Create project in Sentry
- [ ] Configure alerts for high-severity errors
- [ ] Set up email/Slack notifications
- [ ] Configure performance monitoring (if enabled)
- [ ] Set up release tracking with Git SHA
- [ ] Configure error filtering (ignore browser extensions, network errors)

### Application Monitoring

- [ ] Monitor error rates in Sentry dashboard
- [ ] Set up Vercel Analytics (optional)
- [ ] Configure logging aggregation (Datadog, CloudWatch, etc.)
- [ ] Monitor API response times
- [ ] Track rate limit rejections

### Database Monitoring

- [ ] Enable Neon monitoring dashboard
- [ ] Set up connection pool alerts
- [ ] Monitor slow queries (> 1 second)
- [ ] Set up backup schedule (Neon auto-backups)
- [ ] Configure query logging (production: errors only)

### Audit Logs

- [ ] Verify audit logs capturing events:
  - User authentication (login, logout)
  - Permission changes (role assignments)
  - Data access (resident views, document access)
  - Security events (failed logins, rate limit hits)
- [ ] Set up audit log retention policy
- [ ] Configure audit log exports (compliance)

---

## Security Hardening

### HTTPS & Headers

- [ ] Verify HTTPS enabled (Vercel automatic)
- [ ] Check security headers in responses:
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - `Strict-Transport-Security: max-age=31536000`
  - `Content-Security-Policy: frame-ancestors 'none'`

### Authentication & Authorization

- [ ] Verify Clerk session validation working
- [ ] Test role-based access control (Admin, Supervisor, Staff)
- [ ] Verify location-based access restrictions
- [ ] Test unauthorized access returns 401
- [ ] Test forbidden access returns 403

### Input Validation

- [ ] All API endpoints validate with Zod schemas
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (React auto-escapes)
- [ ] CSRF protection (Clerk handles)
- [ ] File upload validation (MIME, size, extension)

### Secrets Management

- [ ] All secrets in environment variables (not hardcoded)
- [ ] No secrets in Git repository
- [ ] Vercel environment variables encrypted
- [ ] Database credentials rotated (if needed)
- [ ] API keys restricted to production domain

---

## Performance Optimization

### Database

- [ ] Indexes on frequently queried columns
- [ ] Connection pooling enabled (Neon default)
- [ ] Query optimization (avoid N+1 queries)
- [ ] Database caching (if applicable)

### Caching

- [ ] Static assets cached (Vercel CDN)
- [ ] API responses cached (if appropriate)
- [ ] Redis caching for rate limiting

### Code

- [ ] Production build optimized (minified, tree-shaken)
- [ ] Unnecessary console.log removed
- [ ] Large dependencies code-split
- [ ] Images optimized (Next.js Image component)

---

## Compliance & Documentation

### Documentation

- [ ] API documentation complete (API_DOCUMENTATION.md)
- [ ] Environment variables documented (.env.example)
- [ ] Deployment process documented (README.md)
- [ ] Incident response plan created
- [ ] Rollback procedure documented

### Compliance

- [ ] Audit logs enabled for HIPAA/compliance
- [ ] Data retention policy documented
- [ ] Privacy policy updated
- [ ] Terms of service updated
- [ ] GDPR compliance reviewed (if applicable)

---

## Testing

### Functional Testing

- [ ] All critical user flows tested:
  - Employee login and role assignment
  - Clock in/out shifts
  - Create and view memos
  - Submit and approve vacation requests
  - View and update resident information
  - Upload documents
  - Fire drill logging
  - Guardian checklist completion

### Load Testing

- [ ] Test API rate limiting (20 req/10s)
- [ ] Test file upload size limits
- [ ] Test concurrent user sessions
- [ ] Verify database connection pool handles load

### Security Testing

- [ ] Test authentication bypass attempts
- [ ] Test SQL injection prevention
- [ ] Test XSS prevention
- [ ] Test CSRF protection
- [ ] Test file upload security (malicious files)

---

## Rollback Plan

### Pre-Rollback

- [ ] Identify issue severity (critical, high, medium, low)
- [ ] Document issue in incident log
- [ ] Notify stakeholders

### Rollback Procedure

1. [ ] Access Vercel dashboard
2. [ ] Navigate to Deployments
3. [ ] Find last known good deployment
4. [ ] Click "Promote to Production"
5. [ ] Verify rollback successful
6. [ ] Test critical functionality

### Post-Rollback

- [ ] Document root cause
- [ ] Create fix in development
- [ ] Test fix thoroughly
- [ ] Schedule redeployment

---

## Post-Deployment

### Day 1

- [ ] Monitor error rates (Sentry)
- [ ] Check API response times
- [ ] Verify health check status
- [ ] Review audit logs for anomalies
- [ ] Monitor rate limit hits

### Week 1

- [ ] Analyze error patterns
- [ ] Review slow queries
- [ ] Check file upload statistics
- [ ] Verify backup completeness
- [ ] Gather user feedback

### Month 1

- [ ] Security audit review
- [ ] Performance optimization review
- [ ] Database index optimization
- [ ] Cost optimization (AWS, Vercel)
- [ ] User training completed

---

## Emergency Contacts

- **DevOps Lead**: [Name] - [Email] - [Phone]
- **Database Admin**: [Name] - [Email] - [Phone]
- **Security Lead**: [Name] - [Email] - [Phone]
- **Vercel Support**: support@vercel.com
- **Clerk Support**: support@clerk.dev
- **AWS Support**: [Account specific]

---

## Sign-Off

- [ ] **Development Lead**: _________________ Date: _______
- [ ] **Security Review**: _________________ Date: _______
- [ ] **Operations Lead**: _________________ Date: _______
- [ ] **Product Owner**: _________________ Date: _______

---

**Deployment Approved**: ☐ Yes ☐ No

**Notes:**

_______________________________________________________

_______________________________________________________

_______________________________________________________
