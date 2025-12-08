# Personal Cloud Assistant

A serverless note and file management application built with React and AWS, featuring secure authentication, cloud storage, and real-time monitoring.

🚀 **Live Demo**: [https://main.d1xrjjt0e3swym.amplifyapp.com/](https://main.d1xrjjt0e3swym.amplifyapp.com/)

## 📋 Project Overview

Personal Cloud Assistant is a full-stack web application that allows users to create and manage notes, upload and store files securely in the cloud, and monitor system health in real-time. Built entirely on AWS serverless infrastructure for scalability, reliability, and cost efficiency.

## 🎯 Core Features

### Notes Management
- Create, read, edit, and delete notes
- Real-time search functionality
- Automatic timestamps (creation/update)
- Beautiful masonry grid layout
- Inline editing with save/cancel

### File Management
- Upload files (any type)
- Download with secure presigned URLs
- Delete files with confirmation
- File metadata (size, upload date)
- Real-time search by filename
- Clean filename display (timestamp hidden)

### User Dashboard
- View recent activity
- Quick access to notes and files
- Responsive design for mobile and desktop

### Monitoring Dashboard
- Real-time CloudWatch metrics
- System health status
- Request tracking and error monitoring
- Auto-refresh every 60 seconds
- Admin-only access

## 🏗️ Architecture

**Frontend**: React 19.2 SPA with React Router 7.10

**Backend**: AWS Serverless Services

## ☁️ AWS Services Used

| Service | Purpose | Details |
|---------|---------|---------|
| **Lambda** | Serverless compute | 3 functions: notes, files, and monitoring handlers |
| **API Gateway** | REST API | HTTP API for all backend endpoints |
| **DynamoDB** | Database | NoSQL storage for notes with user partitioning |
| **S3** | File storage | Secure file uploads with presigned download URLs |
| **Cognito** | Authentication | User sign-up, login, and JWT token management |
| **CloudWatch** | Monitoring | Custom metrics, logs, and health tracking |
| **IAM** | Access control | Least-privilege roles for Lambda functions |
| **Amplify** | Frontend framework | Authentication UI components and SDK |

## 🚀 Getting Started

### Prerequisites
- Node.js v16+
- npm or yarn
- AWS Account with CLI configured
- Git

### Installation

1. **Clone and install**
```bash
git clone <repo-url>
cd personal-cloud-assistant
npm install
```

2. **Configure AWS Resources**

Create the following in your AWS account:
- **DynamoDB Table**: `Notes` (partition key: `noteId`)
- **S3 Bucket**: For file storage (block public access)
- **Cognito User Pool**: Email-based authentication
- **Cognito Identity Pool**: For service access
- **Lambda Functions**: Deploy the three handler files
- **API Gateway**: HTTP API with routes to Lambda
- **IAM Roles**: Lambda execution roles with required permissions

3. **Set Environment Variables**

Create `.env` file:
```
REACT_APP_USER_POOL_ID=your_pool_id
REACT_APP_USER_POOL_CLIENT_ID=your_client_id
REACT_APP_IDENTITY_POOL_ID=your_identity_pool_id
REACT_APP_S3_BUCKET=your_bucket_name
REACT_APP_AWS_REGION=ap-south-1
REACT_APP_API_ENDPOINT=your_api_gateway_url
REACT_APP_ADMIN_EMAIL=admin@example.com
```

4. **Start Development Server**
```bash
npm start
```
Opens at `http://localhost:3000`

## 📁 Project Structure

```
src/
├── components/
│   ├── Dashboard.js          # Home page with activity
│   ├── CreateNote.js         # Note creation form
│   ├── ViewNotes.js          # Notes & files viewer
│   ├── Monitoring.js         # CloudWatch dashboard
│   └── *.css                 # Component styles
├── App.js                    # Routing and main layout
├── api.js                    # API calls with auth
├── aws-exports.js            # AWS config
└── index.js                  # Entry point

lambda-*-handler-fixed.mjs    # Serverless backend functions
```

## 🔧 Lambda Functions

**Note**: Both original and optimized versions are included for reference. Deploy the `-fixed.mjs` versions to AWS.

### Notes Handler
- **Files**: `lambda-notes-handler.mjs` (original) | `lambda-notes-handler-fixed.mjs` (deploy this)
- **Endpoint**: `/notes`
- **Operations**: GET (list), POST (create), DELETE (by ID)
- **Storage**: DynamoDB
- **Metrics**: Tracks operation counts, durations, errors

### Files Handler
- **Files**: `lambda-files-handler.mjs` (original) | `lambda-files-handler-fixed.mjs` (deploy this)
- **Endpoint**: `/files`
- **Operations**: GET (list), POST (upload), DELETE (by ID), GET download URL
- **Storage**: S3 with presigned URLs (1-hour expiration)
- **Features**: Base64 upload support, metadata tracking

### Monitoring Handler
- **File**: `lambda-summarize-handler-fixed.mjs` (reference - feature removed from frontend)
- **Endpoint**: `/monitoring`
- **Purpose**: Aggregate CloudWatch metrics
- **Features**: Health calculation, error tracking, dimension aggregation
- **Access**: Admin-only (configured via `REACT_APP_ADMIN_EMAIL`) - Only the owner can view monitoring dashboard

## 🔐 Security

- **Authentication**: JWT tokens via Cognito
- **Authorization**: IAM roles with least-privilege policies
- **Encryption**: Data encrypted at rest (DynamoDB, S3)
- **Presigned URLs**: Time-limited, signed access to S3 objects
- **CORS**: Configured for secure cross-origin requests
- **Credentials**: Environment variables (never committed)
- **Admin Access**: Monitoring dashboard is restricted to admin users only (configured via `REACT_APP_ADMIN_EMAIL`)

## 🎨 UI/UX Highlights

- Animated gradient background
- Glassmorphism design with backdrop blur
- Pinterest-style masonry grid layout
- Responsive mobile-first design
- Smooth animations and transitions
- Icon-only compact buttons (32x32px)
- Beautiful modals with animations
- Real-time search functionality
- Loading states and feedback

## 📦 Build & Deploy

```bash
# Production build
npm run build

# Deploy options:
# - AWS Amplify Console (auto CI/CD)
# - S3 + CloudFront (static + CDN)
# - Traditional hosting (Netlify, Vercel, etc.)
```

## 📊 CloudWatch Metrics

Custom metrics published by Lambda functions:

**Namespaces**:
- `PersonalCloudAssistant/Notes`
- `PersonalCloudAssistant/Files`
- `PersonalCloudAssistant/Monitoring`

**Tracked**: Operation counts, request duration, error counts

## 🧪 Testing

```bash
npm test              # Run tests
npm test -- --coverage  # With coverage report
```

## 📝 Environment Variables

See `.env.example` for complete configuration template.

**⚠️ Important**: Never commit `.env` file (already in .gitignore)

## 🔮 Future Enhancements

- Note categories/tags
- Advanced search filters
- Markdown support
- Dark mode
- Multi-user collaboration
- Export to PDF
- Scheduled reminders
- Mobile app (React Native)

## 🤝 Contributing

I'm open to collaborations and contributions! If you have ideas for enhancements or would like to work together on improving this project, feel free to:

- Open an issue to discuss new features
- Submit a pull request with improvements
- Reach out for collaboration opportunities

## 📧 Support

For issues or questions, open an issue in the repository.

---
**Built with React & AWS** | Serverless Architecture | Cloud-Native Application
