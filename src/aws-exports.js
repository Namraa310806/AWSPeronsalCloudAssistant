// AWS Configuration for Amplify v6
const awsconfig = {
    Auth: {
        Cognito: {
            userPoolId: 'ap-south-1_soJGXw1ss',
            userPoolClientId: '3iqndj5102bmi5eloidfph3r2p',
            identityPoolId: 'ap-south-1:0dcbdaa0-593a-45fa-bff9-cf251edf80f6',
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
            bucket: 'pca-files-namraa',
            region: 'ap-south-1'
        }
    },
    API: {
        REST: {
            notesAPI: {
                endpoint: 'https://uno1pwyend.execute-api.ap-south-1.amazonaws.com/prod',
                region: 'ap-south-1'
            }
        }
    }
};

export default awsconfig;