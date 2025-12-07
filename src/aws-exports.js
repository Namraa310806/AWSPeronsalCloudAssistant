// AWS Configuration for Amplify v6
const awsconfig = {
    Auth: {
        Cognito: {
            userPoolId: process.env.REACT_APP_USER_POOL_ID,
            userPoolClientId: process.env.REACT_APP_USER_POOL_CLIENT_ID,
            identityPoolId: process.env.REACT_APP_IDENTITY_POOL_ID,
            loginWith: {
                email: true
            },
            signUpVerificationMethod: 'code',
            userAttributes: {
                email: {
                    required: true
                }
            },
            allowGuestAccess: true,
            passwordFormat: {
                minLength: 8,
                requireLowercase: true,
                requireUppercase: true,
                requireNumbers: true,
                requireSpecialCharacters: true
            }
        }
    },
    Storage: {
        S3: {
            bucket: process.env.REACT_APP_S3_BUCKET,
            region: process.env.REACT_APP_AWS_REGION
        }
    },
    API: {
        REST: {
            notesAPI: {
                endpoint: process.env.REACT_APP_API_ENDPOINT,
                region: process.env.REACT_APP_AWS_REGION
            }
        }
    }
};

export default awsconfig;