import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import './CreateNote.css';
import { apiFetch } from '../api';

function CreateNote() {
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
  };

  const handleSaveNote = async () => {
    if (!noteTitle.trim()) {
      setMessage('Please enter a note title');
      return;
    }

    setIsLoading(true);
    setMessage('Testing API connection...');

    try {
      console.log('Starting API call to create note');

      const response = await apiFetch('/notes', {
        method: 'POST',
        body: JSON.stringify({
          title: noteTitle,
          content: noteContent
        })
      });

      console.log('Response received:', response);
      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);
      console.log('Response statusText:', response.statusText);
      
      // Try to get response text
      const responseText = await response.text();
      console.log('Raw response text:', responseText);
      
      if (!responseText) {
        setMessage('No response from server - API Gateway might not be configured correctly');
        setIsLoading(false);
        return;
      }
      
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (jsonError) {
        console.log('JSON parse error:', jsonError);
        setMessage(`Server returned: ${responseText}`);
        setIsLoading(false);
        return;
      }
      
      console.log('Parsed result:', result);
      
      if (response.ok) {
        setMessage('✅ Note saved successfully! Go to View Notes to see it.');
        setNoteTitle('');
        setNoteContent('');
      } else {
        setMessage(result.error || `API Error (${response.status}): ${responseText}`);
      }
      setIsLoading(false);

    } catch (error) {
      console.error('Network/Fetch error:', error);
      setMessage(`Connection error: ${error.message}. Check if API Gateway is deployed and accessible.`);
      setIsLoading(false);
    }
  };

  const handleUploadFile = async () => {
    if (!selectedFile) {
      setMessage('Please select a file to upload');
      return;
    }

    setIsLoading(true);
    setMessage('');

    try {
      // Convert file to base64
      const fileContent = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]); // Remove data URL prefix
        reader.readAsDataURL(selectedFile);
      });

      const response = await apiFetch('/files', {
        method: 'POST',
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileContent: fileContent,
          isBase64: true,
          contentType: selectedFile.type
        })
      });

      const result = await response.json();
      console.log('File uploaded:', result);
      
      if (response.ok) {
        setMessage(`File "${selectedFile.name}" uploaded successfully!`);
        setSelectedFile(null);
        document.getElementById('fileInput').value = '';
      } else {
        setMessage(result.error || 'Error uploading file');
      }
      setIsLoading(false);

    } catch (error) {
      console.error('Error uploading file:', error);
      setMessage('Error uploading file. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="create-note">
      <div className="page-header">
        <h2>Create Notes & Upload Files</h2>
        <Link to="/" className="back-btn">← Back to Dashboard</Link>
      </div>

      {message && (
        <div className={`message ${message.includes('Error') ? 'error' : 'success'}`}>
          {message}
        </div>
      )}

      <div className="create-sections">
        {/* Note Creation Section */}
        <div className="section">
          <h3>Create Note</h3>
          <div className="form-group">
            <label htmlFor="noteTitle">Note Title:</label>
            <input
              id="noteTitle"
              type="text"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder="Enter note title..."
              disabled={isLoading}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="noteContent">Note Content:</label>
            <textarea
              id="noteContent"
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="Enter your note content..."
              rows={8}
              disabled={isLoading}
            />
          </div>
          
          <button 
            onClick={handleSaveNote} 
            disabled={isLoading || !noteTitle.trim()}
            className="action-btn"
          >
            {isLoading ? 'Saving...' : 'Save Note'}
          </button>
        </div>

        {/* File Upload Section */}
        <div className="section">
          <h3>Upload File</h3>
          <div className="form-group">
            <label htmlFor="fileInput">Choose File:</label>
            <input
              id="fileInput"
              type="file"
              onChange={handleFileChange}
              disabled={isLoading}
              accept=".txt,.pdf,.doc,.docx,.jpg,.jpeg,.png"
            />
            {selectedFile && (
              <p className="file-info">
                Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>
          
          <button 
            onClick={handleUploadFile} 
            disabled={isLoading || !selectedFile}
            className="action-btn"
          >
            {isLoading ? 'Uploading...' : 'Upload File'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreateNote;