import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './ViewNotes.css';

function ViewNotes() {
  const [notes, setNotes] = useState([]);
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [summary, setSummary] = useState('');
  const [loadingFiles, setLoadingFiles] = useState({});

  useEffect(() => {
    loadNotesAndFiles();
  }, []);

  const loadNotesAndFiles = async () => {
    setIsLoading(true);
    try {
      const headers = {
        'Content-Type': 'application/json'
      };
      
      // Load notes and files in parallel
      const [notesResponse, filesResponse] = await Promise.all([
        fetch('https://uno1pwyend.execute-api.ap-south-1.amazonaws.com/prod/notes', { headers }),
        fetch('https://uno1pwyend.execute-api.ap-south-1.amazonaws.com/prod/files', { headers })
      ]);

      const notes = notesResponse.ok ? await notesResponse.json() : [];
      const files = filesResponse.ok ? await filesResponse.json() : [];
      
      console.log('Notes loaded:', notes);
      console.log('Files loaded:', files);
      
      setNotes(notes || []);
      setFiles(files || []);
      setIsLoading(false);

    } catch (error) {
      console.error('Error loading data:', error);
      setMessage('Error loading notes and files. Please try again.');
      setIsLoading(false);
    }
  };

  const handleSummarizeFile = async (file) => {
    setLoadingFiles(prev => ({ ...prev, [`summarize-${file.id}`]: true }));
    setSelectedItem(file);
    setSummary('');
    setMessage('');

    try {
      console.log('Summarizing file:', file);
      
      const response = await fetch('https://uno1pwyend.execute-api.ap-south-1.amazonaws.com/prod/summarize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'file',
          fileKey: file.key,
          fileName: file.name,
          content: `File: ${file.name} (Size: ${file.size} bytes)`
        })
      });

      console.log('Response status:', response.status);
      const result = await response.json();
      console.log('File summarized result:', result);
      
      if (response.ok && result.summary) {
        // Clean up the summary text
        let cleanSummary = result.summary;
        if (typeof cleanSummary === 'string') {
          cleanSummary = cleanSummary
            .replace(/[^\x20-\x7E\n\r\t]/g, '') // Keep only printable ASCII characters
            .replace(/[^\w\s.,!?;:()\-"'\n]/g, '') // Keep only normal text characters
            .trim();
        }
        
        setSummary(cleanSummary || `Summary: This is a ${file.name} file with ${file.size} bytes of content.`);
        setMessage(`Summary generated for ${file.name}`);
      } else {
        // Fallback summary if API fails
        const fallbackSummary = `File Summary: ${file.name} is a ${file.type || 'document'} file uploaded on ${new Date(file.uploadedAt).toLocaleDateString()}. File size: ${(file.size / 1024).toFixed(1)} KB.`;
        setSummary(fallbackSummary);
        setMessage(`Fallback summary generated for ${file.name} (AI service unavailable)`);
        console.warn('API error:', result.error || 'Unknown error');
      }
      
    } catch (error) {
      console.error('Error summarizing file:', error);
      // Provide fallback summary even on network error
      const fallbackSummary = `File Summary: ${file.name} is a ${file.type || 'document'} file uploaded on ${new Date(file.uploadedAt).toLocaleDateString()}. File size: ${(file.size / 1024).toFixed(1)} KB.`;
      setSummary(fallbackSummary);
      setMessage(`Basic summary provided for ${file.name} (Service temporarily unavailable)`);
    } finally {
      setLoadingFiles(prev => ({ ...prev, [`summarize-${file.id}`]: false }));
    }
  };

  const handleViewFile = async (file) => {
    setLoadingFiles(prev => ({ ...prev, [`view-${file.id}`]: true }));
    setMessage('Loading file preview...');
    
    try {
      const response = await fetch(`https://uno1pwyend.execute-api.ap-south-1.amazonaws.com/prod/files/${file.id}/download`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();
      
      if (response.ok && result.downloadUrl) {
        window.open(result.downloadUrl, '_blank');
        setMessage(`Opened ${file.name} in new tab`);
      } else {
        setMessage(result.error || 'Unable to view file');
      }
    } catch (error) {
      console.error('Error viewing file:', error);
      setMessage('Error opening file. Please try again.');
    } finally {
      setLoadingFiles(prev => ({ ...prev, [`view-${file.id}`]: false }));
    }
  };

  const handleDownloadFile = async (file) => {
    setLoadingFiles(prev => ({ ...prev, [`download-${file.id}`]: true }));
    setMessage('Preparing download...');
    
    try {
      const response = await fetch(`https://uno1pwyend.execute-api.ap-south-1.amazonaws.com/prod/files/${file.id}/download`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();
      
      if (response.ok && result.downloadUrl) {
        const downloadLink = document.createElement('a');
        downloadLink.href = result.downloadUrl;
        downloadLink.download = file.name;
        downloadLink.style.display = 'none';
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        
        setMessage(`Downloaded ${file.name} successfully!`);
      } else {
        setMessage(result.error || 'Download failed');
      }
    } catch (error) {
      console.error('Error downloading file:', error);
      setMessage('Error downloading file. Please try again.');
    } finally {
      setLoadingFiles(prev => ({ ...prev, [`download-${file.id}`]: false }));
    }
  };



  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="view-notes">
      <div className="page-header">
        <h2>View Notes & Files</h2>
        <Link to="/" className="back-btn">← Back to Dashboard</Link>
      </div>

      {message && (
        <div className={`message ${message.includes('Error') ? 'error' : 'info'}`}>
          {message}
        </div>
      )}

      {isLoading ? (
        <div className="loading">Loading your notes and files...</div>
      ) : (
        <div className="content-sections">
          {/* Notes Section */}
          <div className="section">
            <h3>Your Notes ({notes.length})</h3>
            {notes.length === 0 ? (
              <p className="empty-state">No notes found. <Link to="/create">Create your first note</Link></p>
            ) : (
              <div className="notes-grid">
                {notes.map((note) => (
                  <div key={note.id} className="note-card">
                    <h4>{note.title}</h4>
                    <p className="note-preview">
                      {note.content.substring(0, 150)}
                      {note.content.length > 150 ? '...' : ''}
                    </p>
                    <div className="note-meta">
                      <span className="date">{formatDate(note.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Files Section */}
          <div className="section">
            <h3>Your Files ({files.length})</h3>
            {files.length === 0 ? (
              <p className="empty-state">No files uploaded. <Link to="/create">Upload your first file</Link></p>
            ) : (
              <div className="files-list">
                {files.map((file) => (
                  <div key={file.id} className="file-card">
                    <div className="file-info">
                      <h4>{file.name}</h4>
                      <p className="file-meta">
                        Size: {formatFileSize(file.size)} • 
                        Uploaded: {formatDate(file.uploadedAt)}
                      </p>
                    </div>
                    <div className="file-actions">
                      <button 
                        onClick={() => handleSummarizeFile(file)}
                        disabled={loadingFiles[`summarize-${file.id}`]}
                        className="action-btn secondary"
                      >
                        {loadingFiles[`summarize-${file.id}`] ? 'Summarizing...' : 'Summarize'}
                      </button>
                      <button 
                        onClick={() => handleViewFile(file)}
                        disabled={loadingFiles[`view-${file.id}`]}
                        className="action-btn secondary"
                      >
                        {loadingFiles[`view-${file.id}`] ? 'Opening...' : 'View'}
                      </button>
                      <button 
                        onClick={() => handleDownloadFile(file)}
                        disabled={loadingFiles[`download-${file.id}`]}
                        className="action-btn primary"
                      >
                        {loadingFiles[`download-${file.id}`] ? 'Downloading...' : 'Download'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Summary Section */}
          {summary && (
            <div className="section">
              <h3>File Summary</h3>
              <div className="summary-card">
                <h4>{selectedItem?.name}</h4>
                <p>{summary}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ViewNotes;