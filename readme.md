# ChatGPT Chatbot Backend with Prisma & PostgreSQL

A Node.js backend service that provides a REST API for an educational chatbot powered by OpenAI's ChatGPT models, using Prisma ORM with PostgreSQL.

## Features

- 🤖 OpenAI ChatGPT integration with RAG (Retrieval-Augmented Generation)
- 🗄️ PostgreSQL database with Prisma ORM
- 🔐 Role-based JWT authentication (Students & Admins)
- 🚀 RESTful API endpoints with MVC architecture
- 💬 Multi-session conversation management
- 🎓 Student authentication and course access
- 👨‍💼 Admin dashboard and management tools
- 🛡️ Security with Helmet.js and input validation
- ⚡ Rate limiting
- 📚 Course content management with vector embeddings
- 🏗️ Clean architecture with controllers and middleware

## Prerequisites

- Node.js 18+
- PostgreSQL 14+ with pgvector extension
- OpenAI API key
- Supabase account (or local PostgreSQL setup)

## Installation

1. Clone the repository:

```bash
git clone <your-repo-url>
cd chatbot-backend
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

4. Update the `.env` file:

   - Set your Supabase connection strings:
     - `DATABASE_URL`: Connection pooling URL (port 6543)
     - `DATABASE_URL_DIRECT`: Direct connection URL (port 5432)
   - Add your OpenAI API key in `OPENAI_API_KEY`
   - Set a secure JWT secret in `JWT_SECRET`

5. Setup database:

```bash
# For Supabase (recommended)
npm run setup:supabase

# OR for local PostgreSQL
npx prisma db push
```

7. Seed the database (optional):

```bash
npm run prisma:seed
```

## Running the Application

Development mode:

```bash
npm run dev
```

Production mode:

```bash
npm start
```

View database with Prisma Studio:

```bash
npm run prisma:studio
```

## Database Schema

The application uses role-based authentication with the following main entities:

- **User**: Base authentication table with role field ("student" or "admin")
- **Admin**: Administrative users linked to User table
- **Mahasiswa** (Student): Student information linked to User table
- **courses** (Course): Course/subject information
- **Content**: Course content with vector embeddings for RAG
- **ChatSession**: Chat sessions between students and the system
- **Message**: Individual messages within chat sessions
- **Reference**: References cited in messages

### User Roles

- **Students**: Can authenticate, access courses, and chat with the AI tutor
- **Admins**: Full system management access including analytics and content management

## API Endpoints

### Authentication

#### Register Student

```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "student1",
  "email": "student@university.edu",
  "password": "password123",
  "role": "student",
  "studentData": {
    "studentId": "202401001",
    "name": "John Doe",
    "program": "Computer Science",
    "semester": 1
  }
}
```

#### Register Admin

```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "admin1",
  "email": "admin@university.edu",
  "password": "password123",
  "role": "admin"
}
```

#### Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "student1",
  "password": "password123"
}
```

#### Get Profile

```http
GET /api/auth/profile
Authorization: Bearer <your-jwt-token>
```

#### Logout

```http
POST /api/auth/logout
Authorization: Bearer <your-jwt-token>
```

### Student Endpoints

#### Send Message (Students Only)

```http
POST /api/student/chat
Authorization: Bearer <student-jwt-token>
Content-Type: application/json

{
  "message": "Explain arrays in programming",
  "courseId": "uuid-of-course",
  "sessionId": "optional-session-uuid"
}
```

#### Get Available Courses

```http
GET /api/student/courses
Authorization: Bearer <student-jwt-token>
```

#### Get Student Sessions

```http
GET /api/student/sessions?courseId={optional-course-id}&page=1&limit=20
Authorization: Bearer <student-jwt-token>
```

#### Get Specific Session

```http
GET /api/student/sessions/{sessionId}
Authorization: Bearer <student-jwt-token>
```

#### End Chat Session

```http
POST /api/student/sessions/{sessionId}/end
Authorization: Bearer <student-jwt-token>
```

#### Student Profile

```http
GET /api/student/profile
Authorization: Bearer <student-jwt-token>

PUT /api/student/profile
Authorization: Bearer <student-jwt-token>
Content-Type: application/json

{
  "name": "Updated Name",
  "program": "Updated Program",
  "semester": 2
}
```

### Admin Endpoints

#### Dashboard Stats

```http
GET /api/admin/stats
Authorization: Bearer <admin-jwt-token>
```

#### Course Management

```http
GET /api/admin/courses?page=1&limit=20&search=programming
POST /api/admin/courses
PUT /api/admin/courses/{courseId}
DELETE /api/admin/courses/{courseId}
Authorization: Bearer <admin-jwt-token>
```

#### Content Management

```http
GET /api/admin/courses/{courseId}/content
POST /api/admin/content
PUT /api/admin/content/{contentId}
DELETE /api/admin/content/{contentId}
Authorization: Bearer <admin-jwt-token>
```

#### User & Student Management

```http
GET /api/admin/users
GET /api/admin/students
POST /api/admin/students
PUT /api/admin/students/{studentId}
DELETE /api/admin/students/{studentId}
Authorization: Bearer <admin-jwt-token>
```

#### Analytics

```http
GET /api/admin/analytics/sessions?startDate=2024-01-01&endDate=2024-12-31
Authorization: Bearer <admin-jwt-token>
```

### Health Check

```http
GET /health
```

## Project Structure

```
tutor-virtual-be/
├── src/
│   ├── index.js           # Application entry point
│   ├── controllers/       # Business logic
│   │   ├── authController.js     # Authentication logic
│   │   ├── chatController.js     # Chat functionality
│   │   ├── adminController.js    # Admin operations
│   │   └── studentController.js  # Student operations
│   ├── routes/            # API route definitions
│   │   ├── auth.js        # Authentication routes
│   │   ├── chat.js        # Chat routes (legacy)
│   │   ├── admin.js       # Admin routes
│   │   └── student.js     # Student routes
│   ├── middleware/        # Custom middleware
│   │   ├── auth.js        # JWT & role-based auth
│   │   ├── errorHandler.js # Global error handling
│   │   └── validation.js  # Input validation
│   └── lib/
│       └── prisma.js      # Prisma client instance
├── prisma/
│   ├── schema.prisma      # Database schema
│   └── seed.js           # Database seeding script
├── scripts/
│   └── setup-supabase.js # Supabase setup script
├── .env.example          # Environment variables template
├── CLAUDE.md             # AI assistant instructions
├── package.json          # Dependencies and scripts
└── README.md            # Documentation
```

## Available Scripts

```bash
# Development
npm run dev                 # Start development server with hot reload
npm start                   # Start production server

# Database
npm run prisma:generate     # Generate Prisma client
npm run prisma:migrate      # Apply database migrations
npm run prisma:studio       # Open Prisma Studio GUI
npm run prisma:seed         # Seed database with sample data
npm run setup:supabase      # Setup Supabase database

# Utilities
npx prisma db push          # Push schema to database
npx prisma migrate reset    # Reset database
npx prisma format           # Format schema file
```

## Example Usage

### Test Credentials (from seed data)

- **Admin**: username: `admin1`, password: `admin123`
- **Students**:
  - username: `student1`, password: `student123` (John Doe, CS)
  - username: `student2`, password: `student123` (Jane Smith, IS)

### 1. Register a new student:

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "newstudent",
    "email": "new@university.edu",
    "password": "password123",
    "role": "student",
    "studentData": {
      "studentId": "202401001",
      "name": "New Student",
      "program": "Computer Science",
      "semester": 1
    }
  }'
```

### 2. Login as student:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "student1",
    "password": "student123"
  }'
```

### 3. Get available courses (as student):

```bash
curl -X GET http://localhost:3000/api/student/courses \
  -H "Authorization: Bearer YOUR_STUDENT_JWT_TOKEN"
```

### 4. Send a message to AI tutor:

```bash
curl -X POST http://localhost:3000/api/student/chat \
  -H "Authorization: Bearer YOUR_STUDENT_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What are the basic data types in Python?",
    "courseId": "course-uuid-here"
  }'
```

### 5. Admin: Get dashboard stats:

```bash
curl -X GET http://localhost:3000/api/admin/stats \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN"
```

## Environment Variables

| Variable            | Description                  | Default     |
| ------------------- | ---------------------------- | ----------- |
| DATABASE_URL        | Supabase pooling connection  | -           |
| DATABASE_URL_DIRECT | Supabase direct connection   | -           |
| OPENAI_API_KEY      | OpenAI API key               | -           |
| PORT                | Server port                  | 3000        |
| NODE_ENV            | Environment mode             | development |
| JWT_SECRET          | Secret for JWT signing       | -           |
| JWT_EXPIRES_IN      | Token expiration time        | 7d          |
| OPENAI_MODEL        | ChatGPT model to use         | gpt-4o-mini |
| MAX_TOKENS          | Maximum tokens for responses | 1000        |
| TEMPERATURE         | Model temperature (0-1)      | 0.7         |
| RATE*LIMIT*\*       | Rate limiting configuration  | -           |

## Security Features

- **Role-based Authentication**: JWT tokens with student/admin roles
- **Password Security**: bcrypt hashing with salt rounds
- **Rate Limiting**: Configurable request rate limiting
- **Input Validation**: express-validator with sanitization
- **Security Headers**: Helmet.js middleware
- **CORS Protection**: Configurable CORS policy
- **SQL Injection Protection**: Prisma ORM with parameterized queries
- **Access Control**: Students can only access their own data
- **Error Handling**: Centralized error handling without data leaks

## Production Considerations

1. **Database**:

   - Set up connection pooling
   - Configure proper indexes
   - Set up database backups
   - Use read replicas for scaling

2. **Vector Embeddings**:

   - Implement proper vector storage using pgvector
   - Create embeddings for course content
   - Implement similarity search for RAG

3. **Authentication**:

   - Implement refresh tokens
   - Add OAuth2 integration
   - Implement password reset functionality

4. **Monitoring**:

   - Add logging with Winston
   - Set up APM (Application Performance Monitoring)
   - Implement health checks and alerts

5. **Scaling**:
   - Implement Redis for caching
   - Use message queues for async processing
   - Consider microservices architecture

## Troubleshooting

### Common Issues

1. **Database Connection Error**:

   - Ensure PostgreSQL is running
   - Check DATABASE_URL format
   - Verify database exists

2. **Prisma Migration Errors**:

   - Run `npx prisma migrate reset` to reset
   - Check for pending migrations

3. **OpenAI API Errors**:
   - Verify API key is correct
   - Check API rate limits
   - Ensure sufficient credits

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

ISC
