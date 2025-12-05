import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Authenticator } from '@aws-amplify/ui-react';
import './App.css';
import Dashboard from './components/Dashboard';
import CreateNote from './components/CreateNote';
import ViewNotes from './components/ViewNotes';

function App() {
  return (
    <Authenticator
      loginMechanisms={['email']}
      signUpAttributes={['email']}
    >
      {({ signOut, user }) => (
        <Router>
          <div className="App">
            <header className="app-header">
              <h1>Personal Cloud Assistant</h1>
              <div className="user-info">
                <span>Welcome, {user?.attributes?.email}!</span>
                <button onClick={signOut} className="sign-out-btn">
                  Sign Out
                </button>
              </div>
            </header>
            
            <main className="app-main">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/create" element={<CreateNote />} />
                <Route path="/view" element={<ViewNotes />} />
              </Routes>
            </main>
          </div>
        </Router>
      )}
    </Authenticator>
  );
}

export default App;
