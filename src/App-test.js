import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Authenticator } from '@aws-amplify/ui-react';
import './App.css';

// Simple components for testing
const TestDashboard = () => <div><h1>Dashboard Works!</h1></div>;
const TestCreate = () => <div><h1>Create Page Works!</h1></div>;
const TestView = () => <div><h1>View Page Works!</h1></div>;

function App() {
  return (
    <div className="App">
      <h1>Testing App Load...</h1>
      <Authenticator
        loginMechanisms={['email']}
        signUpAttributes={['email']}
      >
        {({ signOut, user }) => (
          <Router>
            <div>
              <header className="app-header">
                <h1>Personal Cloud Assistant</h1>
                <div className="user-info">
                  <span>Welcome, {user?.attributes?.email || 'User'}!</span>
                  <button onClick={signOut} className="sign-out-btn">
                    Sign Out
                  </button>
                </div>
              </header>
              
              <main className="app-main">
                <Routes>
                  <Route path="/" element={<TestDashboard />} />
                  <Route path="/create" element={<TestCreate />} />
                  <Route path="/view" element={<TestView />} />
                </Routes>
              </main>
            </div>
          </Router>
        )}
      </Authenticator>
    </div>
  );
}

export default App;