# Personal Cloud Assistant

A full-stack serverless application built with React and AWS services that provides note management, file storage, and AI-powered document summarization capabilities with real-time monitoring.

## 🎯 Overview

Personal Cloud Assistant is a cloud-native web application that demonstrates modern serverless architecture patterns. It allows users to create and manage notes, upload and store files, and leverage AI to automatically summarize documents. The application includes a real-time monitoring dashboard that tracks system metrics and health status.

## 🏗️ Architecture

This application follows a serverless architecture pattern with:
- **Frontend**: React SPA (Single Page Application) with client-side routing
- **Authentication**: AWS Amplify with Cognito for user authentication and identity management
- **Backend**: AWS Lambda functions for business logic
- **API**: AWS API Gateway for RESTful endpoints
- **Database**: AWS DynamoDB for NoSQL data storage
- **Storage**: AWS S3 for file storage with presigned URLs
- **AI/ML**: AWS Bedrock for text summarization
- **Monitoring**: AWS CloudWatch for metrics and logging
- **OCR**: AWS Textract for image/PDF text extraction

## 🛠️ Tech Stack

### Frontend
- **React 19.2** - Modern UI library with hooks
- **React Router DOM 7.10** - Client-side routing
- **AWS Amplify UI React 6.13** - Pre-built authentication components
- **AWS SDK for CloudWatch** - Client-side metrics visualization

### Backend (AWS Services)
- **AWS Lambda (Node.js 24.x)** - Serverless compute
- **AWS API Gateway** - RESTful API management
- **AWS DynamoDB** - NoSQL database for notes
- **AWS S3** - Object storage for files
- **AWS Bedrock** - AI model integration (Titan Text Express v1)
- **AWS Textract** - OCR for PDF/image text extraction
- **AWS CloudWatch** - Metrics and logging
- **AWS Cognito** - User authentication and authorization
- **AWS IAM** - Identity and access management

### Development Tools
- **Node.js 16+** - Runtime environment
- **npm** - Package manager
- **Create React App** - React development setup
- **AWS CLI** - AWS service management

## ✨ Features

### 1. User Authentication
- Email-based signup and login
- Secure authentication via AWS Cognito
- Password strength requirements
- Session management

### 2. Notes Management
- **Create Notes**: Add notes with title and content
- **View Notes**: Browse all saved notes
- **Delete Notes**: Remove unwanted notes
- **Timestamps**: Automatic creation and update tracking

### 3. File Management
- **Upload Files**: Support for any file type
- **View Files**: List all uploaded files with metadata
- **Download Files**: Secure presigned URLs for file downloads
- **Delete Files**: Remove files from storage
- **File Metadata**: Track file size, type, and upload date

### 4. AI-Powered Summarization
- **Auto-Summarize**: Click to summarize file content
- **Multi-Format Support**: 
  - PDF documents (text extraction)
  - Text files (direct processing)
  - Images (OCR via Textract)
- **Bedrock Integration**: Uses Amazon Titan Text Express v1
- **Fallback Mechanism**: Graceful degradation if AI service unavailable
- **Quality Scoring**: Content quality assessment before processing

### 5. Real-Time Monitoring Dashboard
- **System Health**: Overall health status (healthy/warning/degraded/error)
- **Metrics Tracking**:
  - Notes created count
  - Files uploaded count
  - Request duration averages
  - Error counts
- **Auto-Refresh**: Updates every 60 seconds
- **Visual Indicators**: Color-coded health status
- **CloudWatch Integration**: Real-time metrics from AWS

### 6. Responsive UI/UX
- **Gradient Background**: Animated gradient with smooth transitions
- **Glassmorphism Design**: Modern frosted glass effects
- **Mobile-Friendly**: Responsive design for all screen sizes
- **Loading States**: Visual feedback during operations
- **Error Handling**: User-friendly error messages
- **Floating Action Button**: Quick access to monitoring

## 📁 Project Structure

```
personal-cloud-assistant/
├── public/                          # Static assets
│   ├── index.html
│   ├── manifest.json
│   └── robots.txt
├── src/
│   ├── components/
│   │   ├── Dashboard.js            # Main dashboard with recent activity
│   │   ├── Dashboard.css
│   │   ├── CreateNote.js           # Note creation form
│   │   ├── CreateNote.css
│   │   ├── ViewNotes.js            # Notes and files viewer
│   │   ├── ViewNotes.css
│   │   ├── Monitoring.js           # CloudWatch metrics dashboard
│   │   └── Monitoring.css
│   ├── App.js                      # Main app with routing
│   ├── App.css                     # Global styles
│   ├── aws-exports.js              # AWS configuration
│   ├── index.js                    # React entry point
│   └── index.css
├── lambda-notes-handler-fixed.mjs   # DynamoDB notes CRUD operations
├── lambda-files-handler-fixed.mjs   # S3 file operations
├── lambda-summarize-handler-fixed.mjs # AI summarization with Bedrock
├── package.json
└── README.md
```

## 🔧 AWS Services Configuration

### Environment Variables Setup

Before running the application, you need to configure your AWS credentials and settings:

1. **Copy the example environment file**:
   ```bash
   cp .env.example .env
   ```

2. **Update `.env` with your AWS configuration**:
   ```env
   # AWS Cognito Configuration
   REACT_APP_USER_POOL_ID=your_user_pool_id
   REACT_APP_USER_POOL_CLIENT_ID=your_client_id
   REACT_APP_IDENTITY_POOL_ID=your_identity_pool_id

   # AWS S3 Configuration
   REACT_APP_S3_BUCKET=your_s3_bucket_name
   REACT_APP_AWS_REGION=ap-south-1

   # API Gateway Configuration
   REACT_APP_API_ENDPOINT=your_api_gateway_endpoint

   # Admin Configuration (for monitoring access)
   REACT_APP_ADMIN_EMAIL=your_admin_email@example.com
   ```

3. **Important Security Notes**:
   - ⚠️ **Never commit `.env` to version control** - It contains sensitive credentials
   - ✅ The `.env` file is already in `.gitignore`
   - ✅ Always use `.env.example` as a template for new developers
   - ✅ Keep your AWS credentials secure and rotate them regularly

### Lambda Functions

#### 1. Notes Handler
- **Purpose**: CRUD operations for notes in DynamoDB
- **Runtime**: Node.js 24.x
- **Operations**:
  - `GET /notes` - List all notes for user
  - `POST /notes` - Create new note
  - `DELETE /notes/{id}` - Delete note by ID
- **CloudWatch Metrics**: NotesCreated, NotesListed, NotesDeleted, RequestDuration, Errors
- **IAM Permissions**: DynamoDB read/write, CloudWatch PutMetricData

#### 2. Files Handler
- **Purpose**: File operations with S3 storage
- **Runtime**: Node.js 24.x
- **Operations**:
  - `GET /files` - List all files for user
  - `POST /files` - Upload file (Base64 encoded)
  - `DELETE /files/{id}` - Delete file
  - `GET /files/{id}/download` - Generate presigned download URL
- **CloudWatch Metrics**: FilesUploaded, FilesListed, FilesDeleted, RequestDuration, Errors
- **IAM Permissions**: S3 read/write, CloudWatch PutMetricData

#### 3. Summarize Handler
- **Purpose**: AI-powered document summarization
- **Runtime**: Node.js 24.x
- **Memory**: 256 MB
- **Timeout**: 15 seconds
- **Operations**:
  - `POST /summarize` - Generate summary for file or note content
- **Features**:
  - PDF text extraction
  - OCR via Textract for images
  - Content truncation (6000 char limit)
  - Text quality scoring
  - Fallback to basic summary
- **AI Model**: Amazon Titan Text Express v1 (us-east-1)
- **CloudWatch Metrics**: SummarizeRequests, SummarizeSuccess, SummarizeFallback, RequestDuration, Errors
- **IAM Permissions**: S3 read, Bedrock InvokeModel, Textract DetectDocumentText, CloudWatch PutMetricData

### DynamoDB Table: Notes
- **Partition Key**: `noteId` (String)
- **Attributes**:
  - `noteId`: Unique identifier (UUID)
  - `userId`: User identifier
  - `title`: Note title
  - `content`: Note content
  - `createdAt`: ISO timestamp
  - `updatedAt`: ISO timestamp

### S3 Bucket: Files
- **Structure**: `users/{userId}/{fileName}`
- **Features**:
  - Presigned URLs for secure downloads (1-hour expiration)
  - Base64 upload support
  - Metadata tracking

### API Gateway
- **Type**: HTTP API
- **CORS**: Enabled for all origins
- **Endpoints**:
  - `/notes` - GET, POST, DELETE, OPTIONS
  - `/files` - GET, POST, DELETE, OPTIONS
  - `/files/{id}/download` - GET
  - `/summarize` - POST, OPTIONS

### Cognito
- **User Pool**: Email-based authentication
- **Identity Pool**: Federated identities for AWS service access
- **Password Requirements**:
  - Minimum 8 characters
  - Requires lowercase, uppercase, numbers, special characters
- **Permissions**: CloudWatch GetMetricStatistics for monitoring dashboard

### CloudWatch
- **Namespaces**:
  - `PersonalCloudAssistant/Notes`
  - `PersonalCloudAssistant/Files`
  - `PersonalCloudAssistant/Summarize`
- **Metrics**:
  - Count metrics (operations performed)
  - Duration metrics (milliseconds)
  - Error counts
- **Dimensions**: Environment, OperationType

## 🚀 Getting Started

### Prerequisites
- Node.js v16 or higher
- npm or yarn
- AWS Account with appropriate permissions
- AWS CLI configured

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd personal-cloud-assistant
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure AWS Services**

You'll need to set up the following AWS resources:

- **DynamoDB Table**: Create a table named `Notes` with partition key `noteId`
- **S3 Bucket**: Create a bucket for file storage
- **Cognito**: Set up User Pool and Identity Pool
- **Lambda Functions**: Deploy the three Lambda handlers
- **API Gateway**: Create HTTP API with routes
- **IAM Roles**: Configure permissions for Lambda execution

4. **Update Configuration**

Edit `src/aws-exports.js` with your AWS resource details:
```javascript
const awsconfig = {
    Auth: {
        Cognito: {
            userPoolId: 'YOUR_USER_POOL_ID',
            userPoolClientId: 'YOUR_CLIENT_ID',
            identityPoolId: 'YOUR_IDENTITY_POOL_ID',
            // ... other config
        }
    },
    Storage: {
        S3: {
            bucket: 'YOUR_BUCKET_NAME',
            region: 'YOUR_REGION'
        }
    },
    API: {
        REST: {
            notesAPI: {
                endpoint: 'YOUR_API_GATEWAY_URL',
                region: 'YOUR_REGION'
            }
        }
    }
};
```

5. **Start the development server**
```bash
npm start
```

The application will open at `http://localhost:3000`

### Lambda Deployment

Package and deploy each Lambda function:

```bash
# Notes Handler
zip lambda-notes.zip lambda-notes-handler-fixed.mjs
aws lambda update-function-code \
  --function-name notes-handler \
  --zip-file fileb://lambda-notes.zip \
  --region YOUR_REGION

# Files Handler
zip lambda-files.zip lambda-files-handler-fixed.mjs
aws lambda update-function-code \
  --function-name files-handler \
  --zip-file fileb://lambda-files.zip \
  --region YOUR_REGION

# Summarize Handler
zip lambda-summarize.zip lambda-summarize-handler-fixed.mjs
aws lambda update-function-code \
  --function-name summarize-handler \
  --zip-file fileb://lambda-summarize.zip \
  --region YOUR_REGION
```

## 📊 Monitoring & Observability

The application includes comprehensive monitoring:

1. **CloudWatch Metrics**
   - Custom metrics sent from all Lambda functions
   - Track operation counts, durations, and errors
   - Dimensional data for filtering (Environment, OperationType)

2. **Monitoring Dashboard**
   - Real-time visualization of system metrics
   - Health status calculation based on error rates
   - Auto-refreshing every 60 seconds
   - Accessible via floating action button (📊)

3. **CloudWatch Logs**
   - Structured logging in all Lambda functions
   - Request IDs for tracing
   - Detailed error logging with stack traces

## 🔐 Security Features

- **Authentication**: JWT-based authentication via Cognito
- **Authorization**: IAM policies for resource access
- **CORS**: Configured for secure cross-origin requests
- **Presigned URLs**: Time-limited access to S3 objects
- **Encryption**: Data encrypted at rest (DynamoDB, S3)
- **Least Privilege**: IAM roles with minimal required permissions

## 🎨 UI/UX Features

- **Animated Gradients**: Smooth color transitions
- **Glassmorphism**: Frosted glass effects with backdrop blur
- **Responsive Design**: Mobile-first approach
- **Loading States**: Skeleton screens and spinners
- **Toast Notifications**: Success/error feedback
- **Hover Effects**: Interactive button animations
- **Accessibility**: ARIA labels and semantic HTML

## 📦 Build & Deploy

### Production Build
```bash
npm run build
```

This creates an optimized production build in the `build/` directory.

### Deployment Options
- **AWS Amplify Console**: Automatic CI/CD with Git integration
- **S3 + CloudFront**: Static hosting with CDN
- **Netlify/Vercel**: Alternative hosting platforms

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm test -- --coverage
```

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- AWS for providing robust serverless infrastructure
- React team for the excellent frontend framework
- Amplify team for simplifying AWS integration
- Open source community for various libraries and tools

## 📧 Support

For issues, questions, or suggestions:
- Open an issue in the repository
- Check existing documentation
- Review AWS service documentation

## 🔮 Future Enhancements

- [ ] Multi-user collaboration on notes
- [ ] Real-time sync with WebSockets
- [ ] Advanced search and filtering
- [ ] Note categories and tags
- [ ] File preview in browser
- [ ] Markdown support for notes
- [ ] Dark mode theme
- [ ] Export notes to PDF
- [ ] Mobile app (React Native)
- [ ] Voice-to-text notes
- [ ] Scheduled note reminders
- [ ] Integration with other AI models

---

**Built with ❤️ using React and AWS**
