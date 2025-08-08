# Deployment Guide - Render.com

This guide explains how to deploy the Tutor Virtual Backend to Render.com.

## Prerequisites

1. A Render.com account
2. GitHub repository connected to Render
3. PostgreSQL database (can be created on Render)

## Deployment Steps

### 1. Database Setup

1. Go to Render Dashboard → Create → PostgreSQL
2. Choose a name: `tutor-virtual-db`
3. Plan: Free (for development) or Starter+ (for production)
4. Region: Choose closest to your users
5. Note down the connection details

### 2. Web Service Setup

#### Option A: Using render.yaml (Recommended)

1. Ensure `render.yaml` is in your repository root
2. Go to Render Dashboard → New → Blueprint
3. Connect your GitHub repository
4. Render will automatically detect and use the `render.yaml` configuration

#### Option B: Manual Setup

1. Go to Render Dashboard → Create → Web Service
2. Connect your GitHub repository
3. Configure the following settings:

**Basic Settings:**
- Name: `tutor-virtual-be`
- Environment: `Node`
- Region: Choose closest to your users
- Branch: `main` (or your preferred branch)

**Build & Deploy:**
- Build Command: `npm install && npm run prisma:generate`
- Start Command: `npm start`

**Environment Variables:**
```
NODE_ENV=production
DATABASE_URL=[Connection string from your PostgreSQL service]
JWT_SECRET=[Generate a secure random string]
JWT_EXPIRES_IN=7d
OPENAI_API_KEY=[Your OpenAI API key]
PORT=10000
```

Optional environment variables:
```
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
OPENAI_MODEL=gpt-4o-mini
MAX_TOKENS=1000
TEMPERATURE=0.7
```

### 3. Database Migration

After deployment, run the database migrations:

1. Go to your web service on Render
2. Open the Shell tab
3. Run: `npm run prisma:migrate:deploy`
4. Optionally seed the database: `npm run prisma:seed`

### 4. Health Check

Your service should be available at: `https://your-service-name.onrender.com`

Test the health endpoint: `https://your-service-name.onrender.com/health`

API documentation: `https://your-service-name.onrender.com/api-docs`

## Important Notes

### Free Tier Limitations

- Services go to sleep after 15 minutes of inactivity
- 750 hours of runtime per month (shared across all free services)
- Cold start time of 10-20 seconds

### Database Connection

- Use the **Internal Database URL** for the `DATABASE_URL` environment variable
- The connection string format: `postgresql://username:password@host:port/database`

### File Uploads

- Render's file system is ephemeral
- Uploaded files will be lost on service restarts
- Consider using external storage (AWS S3, Cloudinary, etc.) for production

### Environment Variables Security

- Never commit real API keys to your repository
- Use Render's environment variable management
- Set sensitive variables (JWT_SECRET, OPENAI_API_KEY) securely

## Troubleshooting

### Common Issues

1. **Build Failures:**
   - Check if all dependencies are in `package.json`
   - Verify Node.js version compatibility
   - Check build logs for specific errors

2. **Database Connection Issues:**
   - Verify DATABASE_URL format
   - Ensure database service is running
   - Check if migrations were applied

3. **Service Won't Start:**
   - Check start command is correct (`npm start`)
   - Verify PORT environment variable
   - Review application logs

### Logs

Access logs through:
- Render Dashboard → Your Service → Logs tab
- Use for debugging deployment and runtime issues

## Production Considerations

1. **Upgrade Plans:**
   - Use paid plans for production workloads
   - Enable persistent storage if needed

2. **Security:**
   - Use strong JWT secrets
   - Enable HTTPS (automatic on Render)
   - Implement proper CORS configuration

3. **Monitoring:**
   - Set up health check endpoints
   - Monitor database performance
   - Track API response times

4. **Backup:**
   - Regular database backups
   - Environment variable documentation
   - Code repository backups

## Support

- Render Documentation: https://render.com/docs
- Node.js Deployment: https://render.com/docs/deploy-node-express-app
- PostgreSQL Setup: https://render.com/docs/databases